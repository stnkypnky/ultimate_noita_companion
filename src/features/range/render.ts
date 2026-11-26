import type { Icon, RangeProp, SpriteLayer } from '@/data/types';
import { gameUrl } from '@/data/store';
import { boltStretch, layerFrame } from './particles';
import { animFrame } from './player';
import { K_FIRE, K_POWDER, K_STATIC } from './cells';
import { H, W, type RangeWorld } from './world';
import { LIGHTNING, type Cell, type Crackle } from './lightning';
import { CELL_GAIN, GLOW_DOWN, GlowBuffer, PARTICLE_GAIN } from './glow';

/**
 * Drawing scale over world pixels. 1, like the game's own 427×242 frame: CSS scales the canvas up with crisp
 * pixels. (Drawing at 2× cost four times the fill and made the range crawl on slow tablets.)
 */
export const SCALE = 1;
/** Lights (LightComponents, flashes) drawn per frame; each is one small scaled sprite at glow resolution. */
const MAX_LIGHTS = 64;
/** The glow buffer's size: the world at a quarter resolution (107×61). */
const GW = Math.ceil(W / GLOW_DOWN);
const GH = Math.ceil(H / GLOW_DOWN);
/** One world pixel's share of its glow texel (the glow source is the average over each 4×4 block). */
const PER_TEXEL = 1 / (GLOW_DOWN * GLOW_DOWN);
/**
 * Lights until the light-and-dark model (Phase 7): post_final.frag lights the scene with (light × 0.8)^1.5, so a
 * LightComponent's deliberately dark colour (Concentrated Light's rgb(30,90,30)) becomes a faint wide tint. Here
 * that is added over the picture with the glow, scaled by this (tuned by eye: a wide soft halo that doesn't wash
 * out the scene).
 */
const LIGHT_GAIN = 0.7;

const HUD_ICONS = ['health', 'flying', 'mana', 'reload', 'delay'] as const;
type HudIcon = (typeof HUD_ICONS)[number];

export type RangeImages = {
  projectiles: HTMLImageElement;
  dummy: HTMLImageElement;
  /** The Holy Mountain statues (temple_statue_02 / 01). */
  statue: HTMLImageElement | null;
  statueStaff: HTMLImageElement | null;
  player: HTMLImageElement;
  playerSheet: HTMLImageElement;
  arm: HTMLImageElement;
  wands: HTMLImageElement;
  cursor: HTMLImageElement;
  status: HTMLImageElement;
  hud: Record<HudIcon, HTMLImageElement>;
  rock: ImageData;
  bedrock: ImageData;
  props: Record<string, RangeProp>;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

/**
 * Every canvas of the scene draws on the CPU (willReadFrequently). The frame is small, and on a slow tablet GPU
 * the per-frame pixel uploads and layer composites cost far more than drawing it all in memory: on a Fire HD 10
 * a busy wand ran at 22 fps on the GPU and 57 on the CPU. Same pictures, no slower on a laptop.
 */
export function context2d(c: HTMLCanvasElement, opaque = false) {
  return c.getContext('2d', { alpha: !opaque, willReadFrequently: true })!;
}

function pixels(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

/**
 * A world-sized layer written pixel by pixel and painted in one go. Thousands of particles as single fillRects
 * (each with its own colour, alpha and blend mode) are what made the range crawl on slow tablets.
 */
class PixelLayer {
  readonly canvas = document.createElement('canvas');
  readonly img = new ImageData(W, H);
  private ctx: CanvasRenderingContext2D;
  /** Something was written since the last clear. */
  dirty = false;
  private shown = false;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = context2d(this.canvas);
  }

  clear() {
    if (this.dirty) this.img.data.fill(0);
    this.dirty = false;
  }

  /** Upload the pixels (skipped while the layer stays empty). */
  flush() {
    if (!this.dirty && !this.shown) return;
    this.ctx.putImageData(this.img, 0, 0);
    this.shown = this.dirty;
  }
}

/** #rrggbb(aa) → 0xrrggbb, cached. */
const rgbCache = new Map<string, number>();
function rgbOf(color: string) {
  let v = rgbCache.get(color);
  if (v === undefined) {
    v = parseInt(color.slice(1, 7), 16) || 0xffffff;
    rgbCache.set(color, v);
  }
  return v;
}

let assets: Promise<RangeImages> | null = null;
export function loadRangeImages(props: Record<string, RangeProp>): Promise<RangeImages> {
  assets ??= Promise.all([
    Promise.all(
      ['projectiles', 'range_dummy', 'range_player', 'range_player_sheet', 'range_arm', 'range_wands', 'range_cursor', 'range_status'].map((n) => loadImage(gameUrl(`sprites/${n}.png`))),
    ),
    Promise.all(HUD_ICONS.map((n) => loadImage(gameUrl(`sprites/hud_${n}.png`)))),
    loadImage(gameUrl('materials/rock_static.png')),
    loadImage(gameUrl('materials/rock_hard_border.png')),
    // The statues are newer than the rest: a data build without them falls back to the dummy.
    Promise.all(['statue', 'statue_staff'].map((n) => (props[n] ? loadImage(gameUrl(`sprites/range_${n}.png`)).catch(() => null) : Promise.resolve(null)))),
  ]).then(([[projectiles, dummy, player, playerSheet, arm, wands, cursor, status], hud, rock, bedrock, [statue, statueStaff]]) => ({
    projectiles: projectiles!,
    dummy: dummy!,
    statue: statue ?? null,
    statueStaff: statueStaff ?? null,
    player: player!,
    playerSheet: playerSheet!,
    arm: arm!,
    wands: wands!,
    cursor: cursor!,
    status: status!,
    hud: Object.fromEntries(HUD_ICONS.map((n, i) => [n, hud[i]!])) as Record<HudIcon, HTMLImageElement>,
    rock: pixels(rock),
    bedrock: pixels(bedrock),
    props,
  }));
  return assets;
}

export class RangeRenderer {
  private terrain = document.createElement('canvas');
  private terrainCtx: CanvasRenderingContext2D;
  private terrainImg = new ImageData(W, H);
  private textures = new Map<string, ImageData | 'loading'>();
  private backdrop: CanvasPattern | null = null;
  private backdrops = new Map<string, CanvasPattern | 'loading'>();
  /**
   * Noita's glow (src/features/range/glow.ts). Its source each frame: glowing cells (kept per chunk in
   * `cellGlow`), glowing particles (written straight in), and what's drawn into `glowCv`: emissive sprites,
   * beams, lightning. The result, plus the lights, is screen-blended over the scene from `glowOut`.
   */
  private glowBuf = new GlowBuffer(GW, GH);
  private cellGlow = new Float32Array(GW * GH * 3);
  /** Chunks of the cell world that hold glowing cells (none: the terrain adds nothing). */
  private chunkGlows: Uint8Array | null = null;
  private glowingChunks = 0;
  private glowCv = document.createElement('canvas');
  private glowCtx: CanvasRenderingContext2D;
  /** Something was drawn into glowCv this frame. */
  private glowDrawn = false;
  private glowOut = document.createElement('canvas');
  private glowOutCtx: CanvasRenderingContext2D;
  private glowImg = new ImageData(GW, GH);
  /** Sim frame the glow was last stepped at: it advances once per simulated frame, whatever the display rate. */
  private glowFrame = -1;
  /** A pixel takes the glow of the first glowing particle drawn on it in a frame (stamped with `drawId`). */
  private stamp = new Uint32Array(W * H);
  private drawId = 0;
  /** Particles: normally blended, and (performance mode only) additive glowing ones. */
  private partOver = new PixelLayer();
  private partAdd = new PixelLayer();
  private stillCamera = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Light mode for slow devices: no glow and no light halos (the scene and the game stay the same). */
  lite = false;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private img: RangeImages,
  ) {
    this.terrain.width = W;
    this.terrain.height = H;
    this.glowCv.width = this.glowOut.width = GW;
    this.glowCv.height = this.glowOut.height = GH;
    this.glowCtx = context2d(this.glowCv);
    this.glowCtx.imageSmoothingEnabled = true;
    this.glowOutCtx = context2d(this.glowOut, true);
    this.glowOutCtx.imageSmoothingEnabled = true;
    this.terrainCtx = context2d(this.terrain);
    ctx.imageSmoothingEnabled = false;
    const bg = document.createElement('canvas');
    bg.width = img.rock.width;
    bg.height = img.rock.height;
    context2d(bg).putImageData(img.rock, 0, 0);
    this.backdrop = ctx.createPattern(bg, 'repeat');
  }

  /**
   * Repaint the chunks of the cell world that changed. Materials with a texture use it (world-aligned, as
   * in the game), others their colour with a little per-cell grain; solids exposed to air get a lit top edge;
   * fire flickers and burning cells glow; glowing materials (gfx_glow) also feed the glow source, ×4 as
   * post_glow2.frag weights cells, at their gfx_glow / 255 (burning cells as fire, 1).
   */
  private paintTerrain(w: RangeWorld) {
    const c = w.cells;
    const mats = c.mats;
    for (const m of mats) if (m.texture && !this.textures.has(m.texture)) this.loadTexture(m.texture, c);
    const img = this.terrainImg;
    const tctx = this.terrainCtx;
    const cg = this.cellGlow;
    if (!this.chunkGlows || this.chunkGlows.length !== c.cx * c.cy) {
      this.chunkGlows = new Uint8Array(c.cx * c.cy);
      this.glowingChunks = 0;
    }
    const chunkGlows = this.chunkGlows;
    const cellK = (CELL_GAIN * PER_TEXEL) / 255;
    for (let cy = 0; cy < c.cy; cy++) {
      for (let cx = 0; cx < c.cx; cx++) {
        const k = cy * c.cx + cx;
        if (!c.dirty[k]) continue;
        c.dirty[k] = 0;
        const x0 = cx * 32;
        const y0 = cy * 32;
        const x1 = Math.min(W, x0 + 32);
        const y1 = Math.min(H, y0 + 32);
        // The chunk's glow texels (32 px chunks are whole 4 px texels) are summed afresh.
        const tx0 = x0 / GLOW_DOWN;
        const tx1 = Math.ceil(x1 / GLOW_DOWN);
        const ty1 = Math.ceil(y1 / GLOW_DOWN);
        for (let ty = y0 / GLOW_DOWN; ty < ty1; ty++) cg.fill(0, (ty * GW + tx0) * 3, (ty * GW + tx1) * 3);
        let glowing = false;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = y * W + x;
            const di = i * 4;
            const m = c.mat[i]!;
            if (!m) {
              img.data[di + 3] = 0;
              continue;
            }
            const info = mats[m]!;
            const tex = info.texture ? this.textures.get(info.texture) : undefined;
            let r: number;
            let g: number;
            let b: number;
            let a = info.a;
            if (tex && tex !== 'loading') {
              const si = ((y % tex.height) * tex.width + (x % tex.width)) * 4;
              r = tex.data[si]!;
              g = tex.data[si + 1]!;
              b = tex.data[si + 2]!;
              a = Math.max(a, tex.data[si + 3]!);
            } else {
              const grain = (((x * 73856093) ^ (y * 19349663)) & 15) - 8;
              r = info.r + grain;
              g = info.g + grain;
              b = info.b + grain;
            }
            if (info.kind === K_FIRE) {
              const f = 0.7 + Math.random() * 0.6;
              r *= f;
              g *= f;
              b *= f;
              a = 255;
            }
            if (c.burning[i]) {
              r = r * 0.4 + 255 * 0.6;
              g = g * 0.4 + 120 * 0.6;
              b *= 0.4;
            }
            const solid = info.kind === K_STATIC || info.kind === K_POWDER;
            const edge = solid && y > 0 && !c.mat[i - W] ? 1.35 : 1;
            img.data[di] = Math.min(255, Math.max(0, r * edge));
            img.data[di + 1] = Math.min(255, Math.max(0, g * edge));
            img.data[di + 2] = Math.min(255, Math.max(0, b * edge));
            img.data[di + 3] = solid ? 255 : a;
            const burning = c.burning[i];
            if (info.glow || burning) {
              glowing = true;
              const s = (burning ? Math.max(1, info.glowStrength) : info.glowStrength) * cellK;
              const t = ((y >> 2) * GW + (x >> 2)) * 3;
              const gc = burning ? undefined : info.glowColor;
              if (gc !== undefined) {
                cg[t] += (gc >> 16) * s;
                cg[t + 1] += ((gc >> 8) & 255) * s;
                cg[t + 2] += (gc & 255) * s;
              } else {
                cg[t] += img.data[di]! * s;
                cg[t + 1] += img.data[di + 1]! * s;
                cg[t + 2] += img.data[di + 2]! * s;
              }
            }
          }
        }
        if (glowing !== !!chunkGlows[k]) {
          chunkGlows[k] = glowing ? 1 : 0;
          this.glowingChunks += glowing ? 1 : -1;
        }
        tctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
      }
    }
  }

  /**
   * Particles into the pixel layers, blended over at their colour and alpha (as 'source-over' did per particle).
   * Glowing ones are drawn the same way, as in the game, and get their brightness from the glow: each also puts
   * colour × alpha × gfx_glow/255 × 2.5 into the glow source (the first one on a pixel each frame, as the
   * particles overlap rather than add up in the game's glow texture). In performance mode there is no glow, so
   * glowing particles add their light instead ('lighter'). Streaks are plotted along their last frame of motion.
   */
  private drawParticles(w: RangeWorld, glowOn: boolean) {
    const over = this.partOver;
    const add = this.partAdd;
    over.clear();
    add.clear();
    const od = over.img.data;
    const ad = add.img.data;
    const src = this.glowBuf.src;
    const stamp = this.stamp;
    const id = (this.drawId = (this.drawId + 1) >>> 0 || 1);
    const partK = (PARTICLE_GAIN * PER_TEXEL) / 255;
    for (const q of w.particles) {
      const a = Math.min(1, q.alpha * (q.fade ? 1 - q.life / q.max : 1));
      if (a <= 0.02) continue;
      const c = rgbOf(q.color);
      const r = c >> 16;
      const g = (c >> 8) & 255;
      const b = c & 255;
      let x0 = q.x;
      let y0 = q.y;
      let n = 0;
      if (q.long) {
        x0 = q.x - q.vx / 60;
        y0 = q.y - q.vy / 60;
        n = Math.min(12, Math.ceil(Math.max(Math.abs(q.x - x0), Math.abs(q.y - y0))));
      }
      for (let k = 0; k <= n; k++) {
        const t = n ? k / n : 1;
        const xi = Math.round(x0 + (q.x - x0) * t);
        const yi = Math.round(y0 + (q.y - y0) * t);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
        const i = (yi * W + xi) * 4;
        if (q.glow && glowOn && stamp[i >> 2] !== id) {
          stamp[i >> 2] = id;
          const s = a * (q.glowStrength ?? 1) * partK;
          const t = ((yi >> 2) * GW + (xi >> 2)) * 3;
          src[t] += r * s;
          src[t + 1] += g * s;
          src[t + 2] += b * s;
          this.glowBuf.fed = true;
        }
        if (q.glow && !glowOn) {
          ad[i] = Math.min(255, ad[i]! + r * a);
          ad[i + 1] = Math.min(255, ad[i + 1]! + g * a);
          ad[i + 2] = Math.min(255, ad[i + 2]! + b * a);
          ad[i + 3] = 255;
          add.dirty = true;
        } else {
          const da = od[i + 3]! / 255;
          const oa = a + da * (1 - a);
          const keep = (da * (1 - a)) / oa;
          od[i] = r * (a / oa) + od[i]! * keep;
          od[i + 1] = g * (a / oa) + od[i + 1]! * keep;
          od[i + 2] = b * (a / oa) + od[i + 2]! * keep;
          od[i + 3] = oa * 255;
          over.dirty = true;
        }
      }
    }
    over.flush();
    add.flush();
  }

  /** A biome's background, tiled from the world's top left as in the game; null until it has loaded. */
  private biomeBackdrop(name: string | null): CanvasPattern | null {
    if (!name) return null;
    const have = this.backdrops.get(name);
    if (have !== undefined) return have === 'loading' ? null : have;
    this.backdrops.set(name, 'loading');
    loadImage(gameUrl(`backgrounds/${name}.png`))
      .then((i) => this.backdrops.set(name, this.ctx.createPattern(i, 'repeat') ?? 'loading'))
      .catch(() => this.backdrops.delete(name));
    return null;
  }

  /** Material textures load on first sight; until then the material's colour stands in. */
  private loadTexture(path: string, cells: RangeWorld['cells']) {
    this.textures.set(path, 'loading');
    const i = new Image();
    i.onload = () => {
      this.textures.set(path, pixels(i));
      cells.dirty.fill(1);
    };
    i.src = gameUrl(`materials/${path.split('/').pop()}`);
  }

  draw(w: RangeWorld) {
    const ctx = this.ctx;
    this.paintTerrain(w);
    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // camera shake from explosions (none with reduced motion)
    if (w.shake > 0 && !this.stillCamera) ctx.translate(Math.round((Math.random() * 2 - 1) * w.shake), Math.round((Math.random() * 2 - 1) * w.shake));

    // cave backdrop: the biome's background image, or (the plain test cave) dimmed rock
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(0, 0, W, H);
    const biomeBg = this.biomeBackdrop(w.biome.background);
    const backdrop = biomeBg ?? this.backdrop;
    if (backdrop) {
      ctx.globalAlpha = biomeBg ? 0.85 : 0.2;
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.terrain, 0, 0);

    // the target (a statue or the dummy; nothing when a wall stands there), then the player with arm and wand
    const { props } = this.img;
    if (w.hasTarget) {
      const look =
        w.target === 'statue' && this.img.statue && props.statue
          ? ([this.img.statue, props.statue] as const)
          : w.target === 'statue_staff' && this.img.statueStaff && props.statue_staff
            ? ([this.img.statueStaff, props.statue_staff] as const)
            : props.dummy
              ? ([this.img.dummy, props.dummy] as const)
              : null;
      if (look) this.actorSprite(look[0], look[1], w.dummy.x, w.dummy.y, 1, w.dummy.flash);
    }
    this.drawPlayer(w);

    // Glowing things are drawn into the scene and into the glow source, which lingers and spreads (not in lite mode).
    const bloom = !this.lite;
    const g = this.glowCtx;
    const gb = this.glowBuf;
    if (bloom) {
      gb.clear();
      // fire, lava, burning cells and other glowing materials
      if (this.glowingChunks > 0) {
        gb.src.set(this.cellGlow);
        gb.fed = true;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      if (this.glowDrawn) g.clearRect(0, 0, GW, GH);
      this.glowDrawn = false;
      // drawn in world coordinates, a quarter the size (smoothing averages each texel)
      g.setTransform(1 / GLOW_DOWN, 0, 0, 1 / GLOW_DOWN, 0, 0);
    }
    const both = (draw: (c: CanvasRenderingContext2D) => void) => {
      draw(ctx);
      if (bloom) {
        draw(g);
        this.glowDrawn = true;
      }
    };

    // particles: fades follow fade_based_on_lifetime; glowing materials (sparks, plasma) also feed the glow
    this.drawParticles(w, bloom);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.partOver.canvas, 0, 0);
    if (!bloom) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.partAdd.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;

    // laser beams: glow, then a bright core
    for (const b of w.beams) {
      both((c) => line(c, b.x0, b.y0, b.x1, b.y1, b.color, b.radius * 2 + 1, 0.45));
      line(ctx, b.x0, b.y0, b.x1, b.y1, '#ffffff', Math.max(0.6, b.radius * 0.5), 0.9);
    }
    // fading lines: drill beams, chain-bolt hops
    for (const s of w.segments) {
      const a = 1 - s.age / s.life;
      both((c) => line(c, s.x0, s.y0, s.x1, s.y1, s.color, s.width + 1.5, 0.35 * a));
      line(ctx, s.x0, s.y0, s.x1, s.y1, s.color, s.width, a);
    }
    // Electrified pools and metal shimmer: a flickering scatter of electric-blue pixels through the body.
    for (const s of w.shocks) {
      const n = s.cells.length;
      if (!n) continue;
      const cw = w.cells.w;
      const k = Math.min(n, 900);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * (1 - s.age / 60);
      ctx.fillStyle = LIGHTNING.glow;
      const path = new Path2D();
      for (let i = 0; i < k; i++) {
        const c = s.cells[(Math.random() * n) | 0]!;
        path.rect(c % cw, (c / cw) | 0, 1, 1);
      }
      ctx.fill(path);
      if (bloom) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.35;
        g.fillStyle = LIGHTNING.glow;
        g.fill(path);
        g.globalAlpha = 1;
        this.glowDrawn = true;
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // lightning: hard pixels like lightning_ray.png, a white core in a deep blue fringe, plus a blue bloom
    for (const b of w.bolts) {
      // Full strength, then gone over its last few frames (the game's ray doesn't fade slowly).
      const k = b.age / b.life;
      const a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      drawBolt(ctx, b.shape, a);
      if (bloom) {
        g.globalCompositeOperation = 'lighter';
        cells(g, [b.shape.core, b.shape.thick, b.shape.forks], 0, LIGHTNING.glow, 0.8 * a);
        this.glowDrawn = true;
      }
    }

    // projectiles: every sprite layer, animated from the projectile's birth
    for (const p of w.projectiles) {
      // Held projectiles (Megalaser beams before launch) have every component switched off: nothing to see.
      if (p.held) continue;
      const layers = p.sprites;
      if (p.beamLike) {
        // Very fast, few-frame projectiles (luminous drill) read as a short laser from where they started.
        const c = p.trails[0] ?? p.visual?.trail?.color ?? p.light?.color ?? '#ffffff';
        both((cx) => line(cx, p.spawnX, p.spawnY, p.x, p.y, c, 2.5, 0.5));
        line(ctx, p.spawnX, p.spawnY, p.x, p.y, '#ffffff', 0.8, 0.9);
      } else if (p.wand) {
        // A haunted wand: one of the game's wand sprites, pointing at what it shoots, with a pale glow.
        const ws = p.wand;
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.rotate(p.rot);
        if (Math.cos(p.rot) < 0) ctx.scale(1, -1);
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(p.age / 6);
        ctx.drawImage(this.img.wands, ws.icon.x, ws.icon.y, ws.icon.w, ws.icon.h, -ws.grip[0], -ws.grip[1], ws.icon.w, ws.icon.h);
        ctx.restore();
        if (bloom) {
          glow(g, p.x, p.y, 10, '#9fd8ff', 0.45);
          this.glowDrawn = true;
        }
      } else if (p.body && layers?.length) {
        // A worm: the head, then each body part 16 px further back along the path it took (part_distance).
        const at = (dist: number) => {
          let left = dist;
          let prev = { x: p.x, y: p.y };
          for (const q of p.body!) {
            const d = Math.hypot(q.x - prev.x, q.y - prev.y);
            if (d >= left && d > 0) return { x: prev.x + ((q.x - prev.x) * left) / d, y: prev.y + ((q.y - prev.y) * left) / d, rot: Math.atan2(prev.y - q.y, prev.x - q.x) };
            left -= d;
            prev = q;
          }
          return { x: prev.x, y: prev.y, rot: p.rot };
        };
        for (let k = layers.length - 1; k >= 0; k--) {
          const s = k === 0 ? { x: p.x, y: p.y, rot: p.rot } : at(k * 16);
          this.layer(layers[k]!, p.age, s.x, s.y, s.rot, 1, 1);
        }
      } else if (layers?.length) {
        const rot = p.physicsBody ? p.spin : p.rotate || p.parent ? p.rot : 0;
        // velocity_sets_scale: as long as the distance it moved this frame, like the game's spark bolts
        const f0 = layers[0]!.frames[0]!;
        const stretch = p.streak ? boltStretch(Math.hypot(p.x - p.px, p.y - p.py), p.visual?.physics?.streakCoeff ?? 1, f0.w, layers[0]!.scale) : 1;
        for (const l of layers) this.layer(l, p.age, p.x, p.y, rot, 1, stretch);
      } else if (p.streak && (p.x !== p.px || p.y !== p.py)) {
        both((c) => line(c, p.px, p.py, p.x, p.y, p.visual?.trail?.color ?? p.light?.color ?? '#ffffff', 1.2, 0.9));
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.light?.color ?? p.visual?.trail?.color ?? '#ffffff';
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // effects: muzzle flashes, explosion sprites, blast leftovers
    for (const fx of w.effects) for (const l of fx.vis.sprites ?? []) if (l.enabled !== false) this.layer(l, fx.age, fx.x, fx.y, fx.rot, fx.flip, 1);
    // Sprite particles (glitter clouds, sparkles) on whole game pixels. Only emissive ones glow: the glitter
    // cloud is additive but not emissive, so it tints the scene without blooming.
    for (const fx of w.spriteParticles) for (const l of fx.vis.sprites ?? []) this.layer(l, fx.age, Math.round(fx.x), Math.round(fx.y), fx.rot, 1, 1, l.emissive);

    if (bloom) this.composeGlow(w);
    else {
      // Performance mode: explosions and casts flash a small soft light, nothing lingers.
      for (const f of w.flashes) {
        const t = f.age / f.life;
        glow(ctx, f.x, f.y, Math.min(40, f.r) * (0.7 + t * 0.6), f.color, 0.6 * (1 - t));
      }
    }

    // status effects: the game's indicator icons over each actor, frozen ones iced over
    const effects = w.kit?.effects;
    for (const a of w.actors) {
      if (!a.status.size || !effects) continue;
      if (a.status.has('FROZEN')) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#7fd4ff';
        ctx.fillRect(Math.round(a.x - a.w / 2), Math.round(a.y - a.h), a.w, a.h);
        ctx.globalAlpha = 1;
      }
      const icons = [...a.status.keys()].map((e) => Object.values(effects).find((f) => f.effect === e && f.icon)?.icon).filter((i): i is Icon => !!i);
      ctx.globalCompositeOperation = 'source-over';
      icons.forEach((ic, i) => ctx.drawImage(this.img.status, ic.x, ic.y, ic.w, ic.h, Math.round(a.x - (icons.length * 9) / 2 + i * 9), Math.round(a.y - a.h - 12), ic.w, ic.h));
    }

    // damage numbers
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '8px "Noita Pixel", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2;
    for (const f of w.floaters) {
      ctx.globalAlpha = Math.min(1, 2 - f.age / 30);
      ctx.strokeStyle = '#000';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.heal ? '#7be35a' : f.self ? '#ff5a5a' : f.crit ? '#ffd23f' : '#ffffff';
      ctx.fillText(f.heal ? `+${f.text}` : f.self ? `-${f.text}` : f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    // HUD and text stay put while the scene shakes.
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    if (w.body.dead > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = '16px "Noita Pixel", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText('You died', W / 2, H / 2 - 20);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillText('You died', W / 2, H / 2 - 20);
    }
    this.hud(w);
    // the game's mouse cursor where you aim
    if (w.aim && w.showCursor) {
      const c = this.img.cursor;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(c, Math.round(w.aim.x - c.width / 2), Math.round(w.aim.y - c.height / 2));
    }
    ctx.restore();
  }

  /**
   * The glow for this frame: what was drawn into glowCv joins the source (×2.5, as post_glow2 weights emissive
   * sprites and particles), the buffer steps once per simulated frame, and the result plus the lights is
   * stretched back over the scene with smoothing and screen-blended (post_final.frag: c + g − c·g).
   */
  private composeGlow(w: RangeWorld) {
    const gb = this.glowBuf;
    if (this.glowDrawn) {
      // One read of the small canvas a frame. Its colours come back unpremultiplied: × alpha is the light added.
      const d = this.glowCtx.getImageData(0, 0, GW, GH).data;
      const src = gb.src;
      const k = PARTICLE_GAIN / (255 * 255);
      for (let i = 0, n = GW * GH; i < n; i++) {
        const a = d[i * 4 + 3]!;
        if (!a) continue;
        const s = a * k;
        src[i * 3] += d[i * 4]! * s;
        src[i * 3 + 1] += d[i * 4 + 1]! * s;
        src[i * 3 + 2] += d[i * 4 + 2]! * s;
      }
      gb.fed = true;
    }
    // Once per sim frame (a 120 Hz screen doesn't fade it twice as fast; a slow one catches up, at most 3).
    const steps = this.glowFrame < 0 || w.frame < this.glowFrame ? 1 : Math.min(3, w.frame - this.glowFrame);
    this.glowFrame = w.frame;
    for (let i = 0; i < steps; i++) gb.step();

    let lit = w.flashes.length > 0;
    for (let i = 0; !lit && i < w.projectiles.length; i++) lit = !!w.projectiles[i]!.light && !w.projectiles[i]!.held;
    if (gb.idle && !lit) return;
    const oc = this.glowOutCtx;
    gb.toRGBA(this.glowImg.data);
    oc.putImageData(this.glowImg, 0, 0);
    if (lit) {
      // Lights: each LightComponent at its real radius, flashes fading out over their life. Overlapping lights
      // take the brighter ('lighten'), not the sum: the game's light map is clamped and lights the rock rather
      // than the air, so ten bolts cast together mustn't stack into a white ball.
      oc.setTransform(1 / GLOW_DOWN, 0, 0, 1 / GLOW_DOWN, 0, 0);
      oc.globalCompositeOperation = 'lighten';
      let n = 0;
      for (const p of w.projectiles) {
        if (!p.light || p.held || n >= MAX_LIGHTS) continue;
        n++;
        light(oc, p.x + (p.light.offsetX ?? 0), p.y + (p.light.offsetY ?? 0), p.light.radius, p.light.color, 1);
      }
      for (const f of w.flashes) {
        if (n >= MAX_LIGHTS) break;
        n++;
        light(oc, f.x, f.y, f.r, f.color, 1 - f.age / f.life);
      }
      oc.globalAlpha = 1;
      oc.globalCompositeOperation = 'source-over';
      oc.setTransform(1, 0, 0, 1, 0, 0);
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.glowOut, 0, 0, GW * GLOW_DOWN, GH * GLOW_DOWN);
    ctx.restore();
  }

  /**
   * One sprite layer of an entity `age` frames old: rotated, mirrored vertically when `flip` < 0 (aimed left),
   * stretched along x for streaks. Additive layers add light in place; only emissive ones feed the glow (the
   * game's emissive render target), as in sprites.xml: additive alone brightens without blooming.
   */
  /** `bloom` overrides whether it feeds the glow (by default: emissive sprites do). */
  private layer(l: SpriteLayer, age: number, x: number, y: number, rot: number, flip: number, stretch: number, bloom?: boolean) {
    const f = layerFrame(l, age);
    if (!f?.w) return;
    const draw = (c: CanvasRenderingContext2D) => {
      c.save();
      c.translate(x, y);
      if (rot) c.rotate(rot);
      c.scale((l.sx ?? 1) * stretch, (l.sy ?? 1) * (flip < 0 ? -1 : 1));
      c.globalAlpha = l.alpha;
      c.globalCompositeOperation = l.additive ? 'lighter' : 'source-over';
      c.drawImage(this.img.projectiles, f.x, f.y, f.w, f.h, -l.ox, -l.oy, f.w * l.scale, f.h * l.scale);
      c.restore();
    };
    draw(this.ctx);
    if (!this.lite && (bloom ?? l.emissive)) {
      draw(this.glowCtx);
      this.glowDrawn = true;
    }
  }

  /** Mina: the animation frame for what she's doing, mirrored to face the aim, with arm and wand rotated to it. */
  private drawPlayer(w: RangeWorld) {
    const kit = w.kit;
    const b = w.body;
    if (b.dead > 0) return;
    // Spawn invincibility blinks, like the game.
    if (b.invincible > 0 && Math.floor(b.invincible / 4) % 2) return;
    const ctx = this.ctx;
    const pose = w.pose;
    const f = w.facing;
    if (!kit) {
      const pl = this.img.props.player;
      if (pl) this.actorSprite(this.img.player, pl, w.player.x, w.player.y, f, w.player.flash);
      return;
    }
    const { anim, index } = animFrame(kit, b);
    const [px, py] = kit.player.pivot;
    const sx = anim.x + (index % anim.perRow) * anim.w;
    const sy = anim.y + Math.floor(index / anim.perRow) * anim.h;
    const sprite = (img: HTMLImageElement) => {
      ctx.save();
      ctx.translate(Math.round(pose.entity.x), Math.round(pose.entity.y));
      if (f < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, anim.w, anim.h, -px, -py, anim.w, anim.h);
      ctx.restore();
    };
    ctx.globalCompositeOperation = 'source-over';
    sprite(this.img.playerSheet);
    if (w.player.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = w.player.flash / 8;
      sprite(this.img.playerSheet);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Wand first (held at its grip), then the arm over it.
    const turned = (x: number, y: number, draw: () => void) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(pose.angle);
      if (pose.flip < 0) ctx.scale(1, -1);
      draw();
      ctx.restore();
    };
    const ws = w.wandSprite;
    if (ws) turned(pose.hand.x, pose.hand.y, () => ctx.drawImage(this.img.wands, ws.icon.x, ws.icon.y, ws.icon.w, ws.icon.h, -ws.grip[0], -ws.grip[1], ws.icon.w, ws.icon.h));
    turned(pose.armRoot.x, pose.armRoot.y, () => ctx.drawImage(this.img.arm, -kit.arm.ox, -kit.arm.oy));
  }

  /** Top-right bars like the game's HUD: health, levitation, mana, then recharge and cast delay while they run. */
  private hud(w: RangeWorld) {
    const ctx = this.ctx;
    const x = W - 8 - HUD_BAR_W;
    let y = 7;
    const row = (icon: HudIcon, fill: number, color: string, flash = false) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.img.hud[icon], x - 11, y - 3);
      hudBar(ctx, x, y, fill, color, flash);
      y += 10;
    };
    row('health', w.body.hp / w.maxHp, HUD.health, w.player.flash > 0);
    ctx.font = '8px "Noita Pixel", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffffcc';
    ctx.fillText(String(Math.ceil(w.body.hp)), x - 13, y - 8);
    if (w.body.flyEnergy < w.flightMax) row('flying', w.body.flyEnergy / w.flightMax, HUD.flying);
    const wand = w.wand;
    if (!wand?.equipped) return;
    const starved = w.frame - wand.noManaFrame < 24 && (w.frame - wand.noManaFrame) % 8 < 4;
    row('mana', wand.manaMax > 0 ? wand.mana / wand.manaMax : 0, HUD.mana, starved);
    if (w.frame < wand.reloadEnd) row('reload', 1 - wand.reloadProgress(w.frame), HUD.reload);
    // Long cast delays (bombs, payloads) get their own bar; short ones would only flicker.
    if (w.frame < wand.delayEnd && wand.delayEnd - wand.delayStart > 6) row('delay', 1 - wand.delayProgress(w.frame), HUD.delay);
  }

  /** Feet-anchored sprite, optionally mirrored, with a hit flash. */
  private actorSprite(img: HTMLImageElement, prop: RangeProp, x: number, y: number, facing: number, flash: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - prop.h));
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -Math.round(prop.ox), 0);
    if (flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flash / 8;
      ctx.drawImage(img, -Math.round(prop.ox), 0);
    }
    ctx.restore();
  }
}

/** HUD colours from data/ui_gfx/hud/colors_*.png. */
const HUD = { health: '#87bf1c', flying: '#ffaa40', mana: '#42a8e2', reload: '#fc8a43', delay: '#ffdd88', flash: '#fc4355', bg: '#72483e7d' };
const HUD_BAR_W = 40;

function hudBar(ctx: CanvasRenderingContext2D, x: number, y: number, fill: number, color: string, flash: boolean) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(x - 1, y - 1, HUD_BAR_W + 2, 4);
  ctx.fillStyle = flash ? HUD.flash : HUD.bg;
  ctx.fillRect(x, y, HUD_BAR_W, 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(HUD_BAR_W * Math.max(0, Math.min(1, fill))), 2);
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Fill whole pixels, each grown by `pad` on every side, as one path: overlaps are painted once, so a
 * see-through colour stays even instead of building up where the squares meet.
 */
function cells(ctx: CanvasRenderingContext2D, lists: Cell[][], pad: number, color: string, alpha: number) {
  if (alpha <= 0) return;
  const s = 1 + pad * 2;
  ctx.beginPath();
  for (const list of lists) for (const [x, y] of list) ctx.rect(x - pad, y - pad, s, s);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A bolt as the game draws it: the deep blue fringe one pixel around, then the white core. */
function drawBolt(ctx: CanvasRenderingContext2D, b: Crackle, alpha: number) {
  ctx.globalCompositeOperation = 'source-over';
  cells(ctx, [b.core, b.thick, b.forks], 1, LIGHTNING.fringe, LIGHTNING.fringeAlpha * alpha);
  ctx.globalCompositeOperation = 'lighter';
  cells(ctx, [b.core, b.thick, b.forks], 0, LIGHTNING.core, alpha);
  ctx.globalCompositeOperation = 'source-over';
}

/** One soft round light per colour, drawn once and stretched to any radius (gradients per light are slow). */
const glowSprites = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string) {
  let c = glowSprites.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = context2d(c);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowSprites.set(color, c);
  }
  return c;
}

/**
 * A light's shape, per colour: post_final.frag lights the scene with (light × 0.8)^1.5, so a light texture
 * falling off linearly from the centre gives c' × (1 − d/r)^1.5 with c' = (0.8·c)^1.5, here × LIGHT_GAIN.
 */
const lightSprites = new Map<string, HTMLCanvasElement>();
const LIGHT_SPRITE = 64;
function lightSprite(color: string) {
  let c = lightSprites.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = LIGHT_SPRITE;
    const g = context2d(c);
    const im = g.createImageData(LIGHT_SPRITE, LIGHT_SPRITE);
    const v = rgbOf(color);
    const ch = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.pow((0.8 * x) / 255, 1.5) * LIGHT_GAIN * 255);
    const h = LIGHT_SPRITE / 2;
    for (let y = 0; y < LIGHT_SPRITE; y++) {
      for (let x = 0; x < LIGHT_SPRITE; x++) {
        const d = Math.hypot(x + 0.5 - h, y + 0.5 - h) / h;
        const f = d < 1 ? Math.pow(1 - d, 1.5) : 0;
        const o = (y * LIGHT_SPRITE + x) * 4;
        im.data[o] = ch[0]! * f;
        im.data[o + 1] = ch[1]! * f;
        im.data[o + 2] = ch[2]! * f;
        im.data[o + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    lightSprites.set(color, c);
  }
  return c;
}

/** Add a light of radius `r` at (x, y); `fade` (0–1) dims the light before the 1.5 power, as the shader does. */
function light(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, fade: number) {
  if (r < 1 || fade <= 0) return;
  ctx.globalAlpha = Math.min(1, Math.pow(fade, 1.5));
  ctx.drawImage(lightSprite(color), x - r, y - r, r * 2, r * 2);
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  if (r < 1 || alpha <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.imageSmoothingEnabled = smooth;
  ctx.globalAlpha = 1;
}
