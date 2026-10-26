import type { Icon, RangeProp, SpriteLayer } from '@/data/types';
import { gameUrl } from '@/data/store';
import { layerFrame } from './particles';
import { animFrame } from './player';
import { K_FIRE, K_POWDER, K_STATIC } from './cells';
import { H, W, type RangeWorld } from './world';

/**
 * Drawing scale over world pixels. 1, like the game's own 427×242 frame: CSS scales the canvas up with crisp
 * pixels. (Drawing at 2× cost four times the fill and made the range crawl on slow tablets.)
 */
export const SCALE = 1;
const MAX_LIGHTS = 160;
/** The bloom layer is shrunk this much and stretched back (a cheap, soft blur). */
const BLOOM_SHRINK = 4;

const HUD_ICONS = ['health', 'flying', 'mana', 'reload', 'delay'] as const;
type HudIcon = (typeof HUD_ICONS)[number];

export type RangeImages = {
  projectiles: HTMLImageElement;
  dummy: HTMLImageElement;
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

function pixels(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
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
    this.ctx = this.canvas.getContext('2d')!;
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
  ]).then(([[projectiles, dummy, player, playerSheet, arm, wands, cursor, status], hud, rock, bedrock]) => ({
    projectiles: projectiles!,
    dummy: dummy!,
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
  private terrainGlow = document.createElement('canvas');
  private terrainImg = new ImageData(W, H);
  private terrainGlowImg = new ImageData(W, H);
  private textures = new Map<string, ImageData | 'loading'>();
  private backdrop: CanvasPattern | null = null;
  /** Bloom layer: glowing particles, emissive sprites and lights, blurred over the scene. */
  private glow = document.createElement('canvas');
  private glowCtx: CanvasRenderingContext2D;
  /** Particles: normally blended, and additive (glowing materials). */
  private partOver = new PixelLayer();
  private partAdd = new PixelLayer();
  /** The bloom, shrunk: stretched back with smoothing it blurs for a fraction of a blur filter's cost. */
  private bloomSmall = document.createElement('canvas');
  private bloomCtx: CanvasRenderingContext2D;
  private stillCamera = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Light mode for slow devices: no bloom and no light halos (the scene and the game stay the same). */
  lite = false;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private img: RangeImages,
  ) {
    this.terrain.width = this.terrainGlow.width = W;
    this.terrain.height = this.terrainGlow.height = H;
    this.glow.width = W;
    this.glow.height = H;
    this.glowCtx = this.glow.getContext('2d')!;
    this.glowCtx.imageSmoothingEnabled = false;
    this.bloomSmall.width = Math.ceil(W / BLOOM_SHRINK);
    this.bloomSmall.height = Math.ceil(H / BLOOM_SHRINK);
    this.bloomCtx = this.bloomSmall.getContext('2d')!;
    this.bloomCtx.imageSmoothingEnabled = true;
    ctx.imageSmoothingEnabled = false;
    const bg = document.createElement('canvas');
    bg.width = img.rock.width;
    bg.height = img.rock.height;
    bg.getContext('2d')!.putImageData(img.rock, 0, 0);
    this.backdrop = ctx.createPattern(bg, 'repeat');
  }

  /**
   * Repaint the chunks of the cell world that changed. Materials with a texture use it (world-aligned, as
   * in the game), others their colour with a little per-cell grain; solids exposed to air get a lit top edge;
   * fire flickers and burning cells glow; glowing materials also go to the bloom layer.
   */
  private paintTerrain(w: RangeWorld) {
    const c = w.cells;
    const mats = c.mats;
    for (const m of mats) if (m.texture && !this.textures.has(m.texture)) this.loadTexture(m.texture, c);
    const img = this.terrainImg;
    const glow = this.terrainGlowImg;
    const tctx = this.terrain.getContext('2d')!;
    const gctx = this.terrainGlow.getContext('2d')!;
    for (let cy = 0; cy < c.cy; cy++) {
      for (let cx = 0; cx < c.cx; cx++) {
        const k = cy * c.cx + cx;
        if (!c.dirty[k]) continue;
        c.dirty[k] = 0;
        const x0 = cx * 32;
        const y0 = cy * 32;
        const x1 = Math.min(W, x0 + 32);
        const y1 = Math.min(H, y0 + 32);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = y * W + x;
            const di = i * 4;
            const m = c.mat[i]!;
            if (!m) {
              img.data[di + 3] = 0;
              glow.data[di + 3] = 0;
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
            const glows = info.glow || c.burning[i];
            glow.data[di] = img.data[di]!;
            glow.data[di + 1] = img.data[di + 1]!;
            glow.data[di + 2] = img.data[di + 2]!;
            glow.data[di + 3] = glows ? 255 : 0;
          }
        }
        tctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
        gctx.putImageData(glow, 0, 0, x0, y0, x1 - x0, y1 - y0);
      }
    }
  }

  /**
   * Particles into the two pixel layers: glowing ones add their light, the rest blend over (as 'lighter' and
   * 'source-over' did per particle). Streaks are plotted along their last frame of motion.
   */
  private drawParticles(w: RangeWorld) {
    const over = this.partOver;
    const add = this.partAdd;
    over.clear();
    add.clear();
    const od = over.img.data;
    const ad = add.img.data;
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
        if (q.glow) {
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

    // cave backdrop
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(0, 0, W, H);
    if (this.backdrop) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = this.backdrop;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.terrain, 0, 0);

    // dummy, then the player with arm and wand
    const { props } = this.img;
    const dm = props.dummy;
    if (dm) this.actorSprite(this.img.dummy, dm, w.dummy.x, w.dummy.y, 1, w.dummy.flash);
    this.drawPlayer(w);

    // Glowing things are drawn twice: into the scene and into a bloom layer that's blurred on top (not in lite mode).
    const bloom = !this.lite;
    const g = this.glowCtx;
    if (bloom) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, W, H);
      // fire, lava, burning cells and other glowing materials
      g.drawImage(this.terrainGlow, 0, 0);
    }
    const both = (draw: (c: CanvasRenderingContext2D) => void) => {
      draw(ctx);
      if (bloom) draw(g);
    };

    // particles: glowing materials (sparks, plasma) add light; fades follow fade_based_on_lifetime
    this.drawParticles(w);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.partOver.canvas, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.partAdd.canvas, 0, 0);
    if (bloom) {
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.partAdd.canvas, 0, 0);
      g.globalAlpha = 1;
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
    // lightning: bolts and electric arcs
    for (const b of w.bolts) {
      const a = 1 - b.age / b.life;
      both((c) => polyline(c, b.points, b.color, 4, 0.35 * a));
      polyline(ctx, b.points, b.color, 2, 0.9 * a);
      polyline(ctx, b.points, '#ffffff', 1.1, a);
    }

    // projectiles: every sprite layer, animated from the projectile's birth
    let lights = 0;
    for (const p of w.projectiles) {
      const layers = p.visual?.sprites;
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
        if (bloom) glow(g, p.x, p.y, 10, '#9fd8ff', 0.45);
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
        // velocity_sets_scale: stretched along the motion, like the game's spark bolts
        const f0 = layers[0]!.frames[0]!;
        const stretch = p.streak ? Math.max(1, Math.min(3, Math.hypot(p.x - p.px, p.y - p.py) / Math.max(1, f0.w * layers[0]!.scale))) : 1;
        for (const l of layers) this.layer(l, p.age, p.x, p.y, rot, 1, stretch);
      } else if (p.streak && (p.x !== p.px || p.y !== p.py)) {
        both((c) => line(c, p.px, p.py, p.x, p.y, p.visual?.trail?.color ?? p.light?.color ?? '#ffffff', 1.2, 0.9));
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.light?.color ?? p.visual?.trail?.color ?? '#ffffff';
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
      }
      if (bloom && p.light && lights < MAX_LIGHTS) {
        lights++;
        glow(g, p.x, p.y, Math.min(28, p.light.radius * 0.45), p.light.color, 0.5);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // effects: muzzle flashes, explosion sprites, blast leftovers
    for (const fx of w.effects) for (const l of fx.vis.sprites ?? []) this.layer(l, fx.age, fx.x, fx.y, fx.rot, fx.flip, 1);

    // light from explosions and casts
    for (const f of w.flashes) {
      const t = f.age / f.life;
      glow(ctx, f.x, f.y, f.r * (0.7 + t * 0.6), f.color, 0.6 * (1 - t));
      if (bloom) glow(g, f.x, f.y, f.r * (0.7 + t * 0.6), f.color, 0.8 * (1 - t));
    }

    // bloom: the glow layer shrunk and stretched back smoothly, added over the scene
    if (!this.lite) {
      const bc = this.bloomCtx;
      bc.globalCompositeOperation = 'copy';
      bc.drawImage(this.glow, 0, 0, this.bloomSmall.width, this.bloomSmall.height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.bloomSmall, 0, 0, W, H);
      ctx.restore();
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
      ctx.fillStyle = f.self ? '#ff5a5a' : f.crit ? '#ffd23f' : '#ffffff';
      ctx.fillText(f.self ? `-${f.text}` : f.text, f.x, f.y);
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
   * One sprite layer of an entity `age` frames old: rotated, mirrored vertically when `flip` < 0 (aimed left),
   * stretched along x for streaks. Additive layers add light; additive and emissive ones also bloom.
   */
  private layer(l: SpriteLayer, age: number, x: number, y: number, rot: number, flip: number, stretch: number) {
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
    if (!this.lite && (l.additive || l.emissive)) draw(this.glowCtx);
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

function polyline(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number, alpha: number) {
  if (alpha <= 0 || pts.length < 2) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** One soft round light per colour, drawn once and stretched to any radius (gradients per light are slow). */
const glowSprites = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string) {
  let c = glowSprites.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowSprites.set(color, c);
  }
  return c;
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
