import type { RangeProp } from '@/data/types';
import { gameUrl } from '@/data/store';
import { AIR, BEDROCK, H, W, type RangeWorld } from './world';

/** Drawing scale over world pixels: sprites stay crisp, text stays readable. */
export const SCALE = 2;
const MAX_LIGHTS = 160;

export type RangeImages = {
  projectiles: HTMLImageElement;
  dummy: HTMLImageElement;
  player: HTMLImageElement;
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

let assets: Promise<RangeImages> | null = null;
export function loadRangeImages(props: Record<string, RangeProp>): Promise<RangeImages> {
  assets ??= Promise.all([
    loadImage(gameUrl('sprites/projectiles.png')),
    loadImage(gameUrl('sprites/range_dummy.png')),
    loadImage(gameUrl('sprites/range_player.png')),
    loadImage(gameUrl('materials/rock_static.png')),
    loadImage(gameUrl('materials/rock_hard_border.png')),
  ]).then(([projectiles, dummy, player, rock, bedrock]) => ({ projectiles, dummy, player, rock: pixels(rock), bedrock: pixels(bedrock), props }));
  return assets;
}

export class RangeRenderer {
  private terrain = document.createElement('canvas');
  private terrainVersion = -1;
  private backdrop: CanvasPattern | null = null;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private img: RangeImages,
  ) {
    this.terrain.width = W;
    this.terrain.height = H;
    ctx.imageSmoothingEnabled = false;
    const bg = document.createElement('canvas');
    bg.width = img.rock.width;
    bg.height = img.rock.height;
    bg.getContext('2d')!.putImageData(img.rock, 0, 0);
    this.backdrop = ctx.createPattern(bg, 'repeat');
  }

  /** Re-texture the terrain (only when it changed). Rock gets a lit top edge like Noita's surfaces. */
  private paintTerrain(w: RangeWorld) {
    if (this.terrainVersion === w.terrainVersion) return;
    this.terrainVersion = w.terrainVersion;
    const out = new ImageData(W, H);
    const { rock, bedrock } = this.img;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = w.terrain[y * W + x]!;
        if (c === AIR) continue;
        const tex = c === BEDROCK ? bedrock : rock;
        const si = ((y % tex.height) * tex.width + (x % tex.width)) * 4;
        const di = (y * W + x) * 4;
        const edge = y > 0 && w.terrain[(y - 1) * W + x] === AIR ? 1.35 : 1;
        out.data[di] = Math.min(255, tex.data[si]! * edge);
        out.data[di + 1] = Math.min(255, tex.data[si + 1]! * edge);
        out.data[di + 2] = Math.min(255, tex.data[si + 2]! * edge);
        out.data[di + 3] = 255;
      }
    }
    this.terrain.getContext('2d')!.putImageData(out, 0, 0);
  }

  draw(w: RangeWorld) {
    const ctx = this.ctx;
    this.paintTerrain(w);
    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;

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

    // player (faces the dummy), wand, dummy
    const { props } = this.img;
    const pl = props.player;
    const f = w.facing;
    if (pl) this.actorSprite(this.img.player, pl, w.player.x, w.player.y, f, w.player.flash);
    const m = w.muzzle;
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w.player.x + f * 2, m.y + 3);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    const dm = props.dummy;
    if (dm) this.actorSprite(this.img.dummy, dm, w.dummy.x, w.dummy.y, 1, w.dummy.flash);

    // particles (glowing ones add light)
    for (const q of w.particles) {
      const a = 1 - q.life / q.max;
      ctx.globalCompositeOperation = q.glow ? 'lighter' : 'source-over';
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
    }
    ctx.globalAlpha = 1;

    // laser beams: glow, then a bright core
    for (const b of w.beams) {
      line(ctx, b.x0, b.y0, b.x1, b.y1, b.color, b.radius * 2 + 1, 0.45);
      line(ctx, b.x0, b.y0, b.x1, b.y1, '#ffffff', Math.max(0.6, b.radius * 0.5), 0.9);
    }
    // fading lines: drill beams, chain-bolt hops
    for (const s of w.segments) {
      const a = 1 - s.age / s.life;
      line(ctx, s.x0, s.y0, s.x1, s.y1, s.color, s.width + 1.5, 0.35 * a);
      line(ctx, s.x0, s.y0, s.x1, s.y1, s.color, s.width, a);
    }
    // lightning: bolts and electric arcs
    for (const b of w.bolts) {
      const a = 1 - b.age / b.life;
      polyline(ctx, b.points, b.color, 4, 0.35 * a);
      polyline(ctx, b.points, b.color, 2, 0.9 * a);
      polyline(ctx, b.points, '#ffffff', 1.1, a);
      const mid = b.points[Math.floor(b.points.length / 2)]!;
      glow(ctx, mid[0], mid[1], 26, b.color, 0.25 * a);
    }

    // projectiles
    let lights = 0;
    for (const p of w.projectiles) {
      const sp = p.visual?.sprite;
      if (p.beamLike) {
        // Very fast, few-frame projectiles (luminous drill) read as a short laser from where they started.
        const c = p.trails[0] ?? p.light?.color ?? '#ffffff';
        line(ctx, p.spawnX, p.spawnY, p.x, p.y, c, 2.5, 0.5);
        line(ctx, p.spawnX, p.spawnY, p.x, p.y, '#ffffff', 0.8, 0.9);
      } else if (sp && sp.icon.w) {
        ctx.globalCompositeOperation = sp.additive ? 'lighter' : 'source-over';
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.physicsBody) ctx.rotate(p.spin);
        else if (p.rotate || p.parent) ctx.rotate(p.rot);
        // velocity_sets_scale: stretch along the motion, like the game's spark bolts
        const stretch = p.streak ? Math.max(1, Math.min(3, Math.hypot(p.x - p.px, p.y - p.py) / sp.icon.w)) : 1;
        ctx.drawImage(this.img.projectiles, sp.icon.x, sp.icon.y, sp.icon.w, sp.icon.h, -sp.ox * stretch, -sp.oy, sp.icon.w * stretch, sp.icon.h);
        ctx.restore();
      } else if (p.streak && (p.x !== p.px || p.y !== p.py)) {
        line(ctx, p.px, p.py, p.x, p.y, p.trails[0] ?? p.light?.color ?? '#ffffff', 1.2, 0.9);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.light?.color ?? p.trails[0] ?? '#ffffff';
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
      }
      if (p.light && lights < MAX_LIGHTS) {
        lights++;
        glow(ctx, p.x, p.y, Math.min(28, p.light.radius * 0.45), p.light.color, 0.35);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // explosions
    for (const f of w.flashes) {
      const t = f.age / 14;
      glow(ctx, f.x, f.y, f.r * (0.7 + t * 0.6), f.color, 0.9 * (1 - t));
    }

    // damage numbers
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '600 7px "Pixelify Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2;
    for (const f of w.floaters) {
      ctx.globalAlpha = Math.min(1, 2 - f.age / 30);
      ctx.strokeStyle = '#000';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.self ? '#ff5a5a' : f.crit ? '#ffd23f' : '#ffffff';
      ctx.fillText(f.self ? `-${f.text}` : f.text, f.x, f.y);
    }
    ctx.restore();
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

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  if (r < 1 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
