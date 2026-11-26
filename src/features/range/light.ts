// Noita's light and dark, ported from data/shaders/post_final.frag. Pure logic, no DOM: the renderer adds the
// lights, builds the map with this frame's glow, and multiplies the picture by it.
//
// What the shader does with the light texture (tex_lights, where the engine draws every LightComponent):
//   lights  = tex_lights.rgb × 0.8                                         (line 299)
//   lights  = lights^1.5 + glow                                            (377, 380; glow after its −0.008, 278)
//   lights  = min(1, max(lights, sky_light_color × sky_ambient))           (382–389)
//   lights  = lights^(1/2.2)                                               (393)
//   fog     = min(1, max(2 × 1.4 × (0.6, 0.5, 0.45) × max(0, 1 − fog_of_war − √sky), sky))   (404, 407)
//   lights  = lights × fog + max(0.35 − sky, 0) × fog                      (409, 410)
//   foreground.rgb ×= lights                                               (450)
// The background texture (tex_bg) is never lit, but it is only the sky: underground the world layer covers it
// everywhere (the biome's background_image is drawn in the world, so unexplored caves are black, backdrop and all).
//
// So in an explored cave (no sky, no fog of war) the warm tint saturates away (2 × 1.4 × 0.45 > 1) and every
// pixel gets at least 0.35, with each light and the glow on top, up to 1.35 right at a bright light. Under open
// sky (sky_ambient 1) lights is 1 everywhere: the picture is left as it is and LightComponents show nothing.
//
// Not modelled: fog of war (the range counts as explored: fog_of_war 0, no "holes"), the dither, the glow's
// HIQ smoothing, night (sky_light_color is taken to be white), and the nightvision / drug terms.

/** post_final.frag line 299: `lights = light_tex_sample.rgb * 0.8`. */
export const LIGHT_TEX_SCALE = 0.8;
/** Line 410: the light every explored pixel gets away from the sky. */
export const AMBIENT_FLOOR = 0.35;
/** Line 404: fog of war's warm tint, ×1.4 there and ×2 at line 407. */
export const FOG_TINT = [0.6, 0.5, 0.45] as const;
/** post_final.frag line 278: `glow = max(0, glow - 0.008)`. */
export const LIGHT_GLOW_FLOOR = 0.008;
/**
 * The map's bytes hold lights ÷ 2 (127.5 per 1.0), so the 1.35 next to a bright light still fits in a byte: the
 * picture is multiplied by the map and then added to itself.
 */
export const LIGHT_ENCODE = 127.5;

const GAMMA_STEPS = 1024;
/**
 * x^(1/2.2) over 0–1 (the shader's gamma, line 393), tabled over √x, where it is nearly straight (s^0.91), so
 * the interpolation stays exact to a fraction of a byte even next to black.
 */
const GAMMA = Float32Array.from({ length: GAMMA_STEPS + 2 }, (_, i) => Math.pow(Math.min(1, i / GAMMA_STEPS), 2 / 2.2));

function gamma(x: number) {
  const f = Math.sqrt(x) * GAMMA_STEPS;
  const i = f | 0;
  return GAMMA[i]! + (GAMMA[i + 1]! - GAMMA[i]!) * (f - i);
}

/** Line 407 for an explored pixel: what fog of war leaves of the lights, per channel. */
export function fogOfWar(sky: number): [number, number, number] {
  const open = Math.max(0, 1 - Math.sqrt(sky));
  return FOG_TINT.map((t) => Math.min(1, Math.max(2 * 1.4 * t * open, sky))) as [number, number, number];
}

/**
 * One channel of the shader's lights, exactly (no lookup tables): `tex` the light texture (0–1, already clamped
 * as an 8-bit texture is), `glow` the glow buffer's value, `sky` the sky ambient (0 underground, 1 under open
 * sky), `fog` that channel of fogOfWar(sky).
 */
export function shade(tex: number, glow: number, sky: number, fog = fogOfWar(sky)[0]) {
  const t = Math.min(1, Math.max(0, tex)) * LIGHT_TEX_SCALE;
  let l = t * Math.sqrt(t) + Math.max(0, glow - LIGHT_GLOW_FLOOR);
  l = Math.min(1, Math.max(l, sky));
  return Math.pow(l, 1 / 2.2) * fog + Math.max(AMBIENT_FLOOR - sky, 0) * fog;
}

/** The light texture (tex_lights) at the glow's resolution, and the map of `lights` built from it. */
export class LightMap {
  /** Linear light per texel, RGB 0–1 each (more is clamped when the map is built). */
  readonly tex: Float32Array;

  constructor(
    readonly w: number,
    readonly h: number,
    /** World pixels per texel. */
    readonly down: number,
  ) {
    this.tex = new Float32Array(w * h * 3);
  }

  clear() {
    this.tex.fill(0);
  }

  /**
   * A LightComponent (or flash) of radius `r` world px at (x, y), colour 0xrrggbb, dimmed by `fade` (0–1).
   * Lights add up in the texture. Its shape is inferred: full colour at the centre falling off linearly to
   * nothing at the radius, which after the shader's ^1.5 is (1 − d/r)^1.5.
   */
  add(x: number, y: number, r: number, rgb: number, fade = 1) {
    if (r < 1 || fade <= 0) return;
    const k = Math.min(1, fade) / 255;
    const cr = (rgb >> 16) * k;
    const cg = ((rgb >> 8) & 255) * k;
    const cb = (rgb & 255) * k;
    const d = this.down;
    // texel centres are at (t + 0.5) × down
    const tx0 = Math.max(0, Math.ceil((x - r) / d - 0.5));
    const tx1 = Math.min(this.w - 1, Math.floor((x + r) / d - 0.5));
    const ty0 = Math.max(0, Math.ceil((y - r) / d - 0.5));
    const ty1 = Math.min(this.h - 1, Math.floor((y + r) / d - 0.5));
    const inv = 1 / r;
    const tex = this.tex;
    for (let ty = ty0; ty <= ty1; ty++) {
      const dy = (ty + 0.5) * d - y;
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = (tx + 0.5) * d - x;
        const f = 1 - Math.sqrt(dx * dx + dy * dy) * inv;
        if (f <= 0) continue;
        const o = (ty * this.w + tx) * 3;
        tex[o] += cr * f;
        tex[o + 1] += cg * f;
        tex[o + 2] += cb * f;
      }
    }
  }

  /**
   * The shader's lights per texel, into `out` (RGBA bytes, w×h) as lights × LIGHT_ENCODE, opaque. `glow` is the
   * glow buffer's accumulator (RGB per texel, same size) or null; `sky` the map's sky ambient.
   */
  build(glow: Float32Array | null, sky: number, out: Uint8ClampedArray) {
    const tex = this.tex;
    const fog = fogOfWar(sky);
    const floor = Math.max(AMBIENT_FLOOR - sky, 0);
    const n = this.w * this.h;
    for (let c = 0; c < 3; c++) {
      const fc = fog[c]!;
      const add = floor * fc;
      for (let i = 0; i < n; i++) {
        const s = i * 3 + c;
        const t = (tex[s]! < 1 ? tex[s]! : 1) * LIGHT_TEX_SCALE;
        let l = t * Math.sqrt(t);
        if (glow) {
          const g = glow[s]! - LIGHT_GLOW_FLOOR;
          if (g > 0) l += g;
        }
        if (l < sky) l = sky;
        if (l > 1) l = 1;
        out[i * 4 + c] = (gamma(l) * fc + add) * LIGHT_ENCODE;
      }
    }
    for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
  }
}
