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

    // player, wand, dummy
    const { props } = this.img;
    const pl = props.player;
    if (pl) ctx.drawImage(this.img.player, Math.round(w.player.x - pl.ox), Math.round(w.player.y - pl.h));
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w.player.x + 2, w.muzzle.y + 3);
    ctx.lineTo(w.muzzle.x, w.muzzle.y);
    ctx.stroke();
    const dm = props.dummy;
    if (dm) {
      const dx = Math.round(w.dummy.x - dm.ox);
      const dy = Math.round(w.dummy.y - dm.h);
      ctx.drawImage(this.img.dummy, dx, dy);
      if (w.dummy.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = w.dummy.flash / 8;
        ctx.drawImage(this.img.dummy, dx, dy);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // particles (glowing ones add light)
    for (const q of w.particles) {
      const a = 1 - q.life / q.max;
      ctx.globalCompositeOperation = q.glow ? 'lighter' : 'source-over';
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
    }
    ctx.globalAlpha = 1;

    // projectiles
    let lights = 0;
    for (const p of w.projectiles) {
      const sp = p.visual?.sprite;
      if (sp && sp.icon.w) {
        ctx.globalCompositeOperation = sp.additive ? 'lighter' : 'source-over';
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.rotate && (p.vx || p.vy)) ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.drawImage(this.img.projectiles, sp.icon.x, sp.icon.y, sp.icon.w, sp.icon.h, -sp.ox, -sp.oy, sp.icon.w, sp.icon.h);
        ctx.restore();
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
      ctx.fillStyle = f.crit ? '#ffd23f' : '#ffffff';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
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
