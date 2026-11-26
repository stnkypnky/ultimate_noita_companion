// Noita's lingering glow, ported from data/shaders/post_glow1.frag and post_glow2.frag to typed arrays.
// Pure logic, no DOM: the renderer fills the source each frame, steps it, and screen-blends the result.
//
// The game keeps a glow texture from frame to frame. Each frame:
//   post_glow1: decayed1 = 0.1 × Σ prev(x + i·1.5 texels, y)           i = −5..5 (11 taps across)
//   post_glow2: new      = cellSource × 4.0 + particleSource × 2.5
//               decayed  = (1 / 12.2) × Σ decayed1(x, y + i·1.5) × edgeWeight   (11 taps down)
//               out      = new × 0.125 + mix(decayed, new, 0.05)
// So each frame keeps 1.1 × 11/12.2 × 0.95 ≈ 0.942 of the last one (a glow lingers ~16 frames) and adds
// 0.175 × the new glow; a steady source settles at about 3× itself. post_final.frag then subtracts 0.008
// (against banding) and screen-blends it over the picture: c + g − c·g, which never blows out to white.

/** The glow runs at a quarter of the world's resolution: 427×242 → 107×61 texels (~6.5k). */
export const GLOW_DOWN = 4;
/** post_glow2: glowing cells (tex_glow_source) are weighted ×4, emissive particles and sprites ×2.5. */
export const CELL_GAIN = 4.0;
export const PARTICLE_GAIN = 2.5;
/**
 * Tap spacing in our texels. The shader spaces its taps 1.5 glow texels apart; tex_glow_unfiltered shares the
 * glow's coordinates and carries per-cell flags (liquid, very bright), so we take a game glow texel to be one
 * world pixel. Our texels are GLOW_DOWN pixels wide, so the taps land 1.5 / 4 = 0.375 texels apart, sampled
 * with linear interpolation as the GPU's bilinear filter does. That keeps the game's spread (variance
 * ~22.5 px² a frame, a halo around ~19 px wide once settled) instead of a 4× wider fog.
 */
export const TAP_SPACING = 1.5 / GLOW_DOWN;
/** post_final.frag: `glow = max(0, glow - 0.008)`. */
export const GLOW_FLOOR = 0.008;
const TAPS = 5; // BLUR_RADIUS: x = −5..5
const EDGE_SIZE = 0.05; // EDGE_AFTER_IMAGE_REDUCTION_SIZE
const EDGE_AMOUNT = 2.0; // EDGE_AFTER_IMAGE_REDUCTION_AMOUNT

/**
 * The 11 taps at i × spacing (i = −5..5), each split between its two nearest texels by linear interpolation:
 * integer offsets and their weights (summing to 11, as 11 plain taps would).
 */
export function tapKernel(spacing: number): { offsets: Int32Array; weights: Float32Array } {
  const w = new Map<number, number>();
  for (let i = -TAPS; i <= TAPS; i++) {
    const o = i * spacing;
    const f = Math.floor(o + 1e-9);
    const t = o - f;
    w.set(f, (w.get(f) ?? 0) + (1 - t));
    if (t > 1e-9) w.set(f + 1, (w.get(f + 1) ?? 0) + t);
  }
  const keys = [...w.keys()].filter((k) => w.get(k)! > 1e-9).sort((a, b) => a - b);
  return { offsets: Int32Array.from(keys), weights: Float32Array.from(keys.map((k) => w.get(k)!)) };
}

/** The glow buffer: a source refilled every frame and the accumulator it feeds, RGB floats, never clamped. */
export class GlowBuffer {
  /** This frame's new glow, already weighted (×CELL_GAIN or ×PARTICLE_GAIN). Cleared by `clear()`. */
  readonly src: Float32Array;
  /** Set by whoever writes `src`; lets an empty, faded-out buffer skip its passes. */
  fed = false;
  /** Nothing left to show: the accumulator has faded to zero and nothing new came in. */
  idle = true;
  private accA: Float32Array;
  private tmp: Float32Array;
  private colIdx: Int32Array;
  private rowIdx: Int32Array;
  private kw: Float32Array;
  private edge: Float32Array;

  constructor(
    readonly w: number,
    readonly h: number,
    spacing = TAP_SPACING,
  ) {
    const n = w * h * 3;
    this.src = new Float32Array(n);
    this.accA = new Float32Array(n);
    this.tmp = new Float32Array(n);
    const { offsets, weights } = tapKernel(spacing);
    const k = offsets.length;
    this.kw = weights;
    // Clamped tap positions per column and row (the GPU's clamp-to-edge), worked out once.
    this.colIdx = new Int32Array(w * k);
    for (let x = 0; x < w; x++) for (let j = 0; j < k; j++) this.colIdx[x * k + j] = Math.min(w - 1, Math.max(0, x + offsets[j]!));
    this.rowIdx = new Int32Array(h * k);
    for (let y = 0; y < h; y++) for (let j = 0; j < k; j++) this.rowIdx[y * k + j] = Math.min(h - 1, Math.max(0, y + offsets[j]!));
    // post_glow2's edge weight: accumulated glow is darkened a little within 5% of the edges (to cut after-images
    // while the camera moves). As in the shader, a texel in a top/bottom band takes the y rule over the x one.
    this.edge = new Float32Array(w * h);
    const inv = 1 - EDGE_SIZE;
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        let wt = 1;
        if (u > inv) wt = 1 - (u - inv) * EDGE_AMOUNT;
        else if (u < EDGE_SIZE) wt = 1 - (EDGE_SIZE - u) * EDGE_AMOUNT;
        if (v > inv) wt = 1 - (v - inv) * EDGE_AMOUNT;
        else if (v < EDGE_SIZE) wt = 1 - (EDGE_SIZE - v) * EDGE_AMOUNT;
        this.edge[y * w + x] = wt;
      }
    }
  }

  /** The accumulated glow after the last `step()`. */
  get acc(): Float32Array {
    return this.accA;
  }

  /** Empty the source for the next frame. */
  clear() {
    if (this.fed) this.src.fill(0);
    this.fed = false;
  }

  /** One frame of post_glow1 + post_glow2. */
  step() {
    if (this.idle && !this.fed) return;
    const { w, h, kw, colIdx, rowIdx, edge, src } = this;
    const acc = this.accA;
    const tmp = this.tmp;
    const k = kw.length;
    // post_glow1: across, ×0.1
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        const ci = x * k;
        for (let j = 0; j < k; j++) {
          const s = (row + colIdx[ci + j]!) * 3;
          const wt = kw[j]!;
          r += acc[s]! * wt;
          g += acc[s + 1]! * wt;
          b += acc[s + 2]! * wt;
        }
        const o = (row + x) * 3;
        tmp[o] = r * 0.1;
        tmp[o + 1] = g * 0.1;
        tmp[o + 2] = b * 0.1;
      }
    }
    // post_glow2: down, ×weight / 12.2, plus the new glow (written back into the accumulator)
    let peak = 0;
    for (let y = 0; y < h; y++) {
      const ri = y * k;
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let j = 0; j < k; j++) {
          const s = (rowIdx[ri + j]! * w + x) * 3;
          const wt = kw[j]!;
          r += tmp[s]! * wt;
          g += tmp[s + 1]! * wt;
          b += tmp[s + 2]! * wt;
        }
        const i = y * w + x;
        const d = (edge[i]! / 12.2) * 0.95; // mix(decayed, new, 0.05) keeps 0.95 of decayed...
        const o = i * 3;
        // ...and adds 0.05 of new, on top of new × 0.125
        const nr = (acc[o] = r * d + src[o]! * 0.175);
        const ng = (acc[o + 1] = g * d + src[o + 1]! * 0.175);
        const nb = (acc[o + 2] = b * d + src[o + 2]! * 0.175);
        if (nr > peak) peak = nr;
        if (ng > peak) peak = ng;
        if (nb > peak) peak = nb;
      }
    }
    // Faded below what post_final would show (it subtracts 0.008): stop until something glows again.
    if (peak < GLOW_FLOOR * 0.5 && !this.fed) {
      acc.fill(0);
      this.idle = true;
    } else this.idle = false;
  }

  /**
   * The glow as RGBA bytes for an ImageData of w×h, after post_final's −0.008 (Uint8ClampedArray clamps to
   * 0–255, the only clamping anywhere). Opaque, so a screen blend leaves the picture alone where it's black.
   */
  toRGBA(out: Uint8ClampedArray) {
    const acc = this.accA;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const s = i * 3;
      const o = i * 4;
      out[o] = (acc[s]! - GLOW_FLOOR) * 255;
      out[o + 1] = (acc[s + 1]! - GLOW_FLOOR) * 255;
      out[o + 2] = (acc[s + 2]! - GLOW_FLOOR) * 255;
      out[o + 3] = 255;
    }
  }
}
