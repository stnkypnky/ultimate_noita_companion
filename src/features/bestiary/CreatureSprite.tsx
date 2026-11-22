import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { gameUrl } from '@/data/store';
import type { Enemy, Icon, Legs, SpriteLayer } from '@/data/types';
import { AtlasIcon } from '@/ui/GameIcon';
import { AMPLITUDE, PERIOD, legsAt, motionAt, type Point } from './motion';

type Anim = NonNullable<Enemy['anims']>[number];

let atlas: Promise<HTMLImageElement> | null = null;
const loadAtlas = () =>
  (atlas ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      atlas = null;
      reject(new Error('bestiary atlas'));
    };
    img.src = gameUrl('sprites/bestiary.png');
  }));

const NAMES: Record<string, string> = { stand: 'Idle', idle: 'Idle', attack_ranged: 'Shoot', attack_melee: 'Melee', attack_dash: 'Dash', still: 'Still' };
export const animLabel = (n: string) => NAMES[n] ?? n.charAt(0).toUpperCase() + n.slice(1).replace(/_/g, ' ');

/** Where a layer's frame lands, in game pixels around the creature's pivot. */
function place(l: SpriteLayer, f: { w: number; h: number }) {
  const sx = (l.sx ?? 1) * l.scale;
  const sy = (l.sy ?? 1) * l.scale;
  return { x: -l.ox * (l.sx ?? 1), y: -l.oy * (l.sy ?? 1), w: f.w * sx, h: f.h * sy };
}

/** The box every frame of the animation fits in, with room for its motion and its legs' reach. */
function bounds(a: Anim, legs?: Legs) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, pad = 0) => {
    x0 = Math.min(x0, x - pad);
    y0 = Math.min(y0, y - pad);
    x1 = Math.max(x1, x + pad);
    y1 = Math.max(y1, y + pad);
  };
  for (const l of a.layers)
    for (const f of l.frames) {
      const p = place(l, f);
      add(p.x, p.y);
      add(p.x + p.w, p.y + p.h);
    }
  if (!Number.isFinite(x0)) return null;
  if (a.motion) {
    // A rock of a few degrees swings the far corners a little further.
    const pad = AMPLITUDE[a.motion] + Math.max(-x0, x1, -y0, y1) * 0.08;
    add(x0, y0, pad);
    add(x1, y1, pad);
  }
  if (legs) {
    const thick = Math.max(legs.upper.h, legs.lower.h, legs.knee?.h ?? 0) / 2;
    for (let i = 0; i < 24; i++) for (const leg of legsAt(legs, (i / 24) * PERIOD.scuttle)) for (const pt of [leg.knee, leg.foot]) add(pt[0], pt[1], thick);
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

/** Seconds an animation that plays once holds its last frame before it plays again. */
const REPLAY_HOLD = 1;

/** Which frame of a layer shows `t` seconds in. One that plays once replays after a pause. */
function frameAt(l: SpriteLayer, t: number) {
  const n = l.frames.length;
  const step = Math.max(0.016, l.wait);
  if (l.loop) return Math.floor(t / step) % n;
  return Math.min(n - 1, Math.floor((t % (n * step + REPLAY_HOLD)) / step));
}

/** One leg segment: the image stretched from one joint to the next, turned to point along it. */
function segment(ctx: CanvasRenderingContext2D, img: HTMLImageElement, ic: Icon, pivot: number, from: Point, to: Point) {
  ctx.save();
  ctx.translate(from[0], from[1]);
  ctx.rotate(Math.atan2(to[1] - from[1], to[0] - from[0]));
  ctx.drawImage(img, ic.x, ic.y, ic.w, ic.h, 0, -pivot, Math.hypot(to[0] - from[0], to[1] - from[1]), ic.h);
  ctx.restore();
}

function drawLegs(ctx: CanvasRenderingContext2D, img: HTMLImageElement, legs: Legs, t: number) {
  for (const { hip, knee, foot } of legsAt(legs, t)) {
    segment(ctx, img, legs.upper, legs.pivot, hip, knee);
    segment(ctx, img, legs.lower, legs.pivot, knee, foot);
    if (legs.knee) ctx.drawImage(img, legs.knee.x, legs.knee.y, legs.knee.w, legs.knee.h, knee[0] - legs.knee.w / 2, knee[1] - legs.knee.h / 2, legs.knee.w, legs.knee.h);
  }
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The creature, animated from its sprite sheet, with a picker for its animations. */
export function CreatureSprite({ enemy: e, box = 168 }: { enemy: Enemy; box?: number }) {
  const anims = e.anims?.filter((a) => a.layers.some((l) => l.frames.some((f) => f.w > 0))) ?? [];
  const [pick, setPick] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion());
  const anim = anims[Math.min(pick, anims.length - 1)];
  const canvas = useRef<HTMLCanvasElement>(null);
  const legs = e.legs;
  const moves = !!anim && (anim.layers.some((l) => l.frames.length > 1) || !!anim.motion);

  const fit = useMemo(() => {
    if (!anim) return null;
    const b = bounds(anim, legs);
    if (!b) return null;
    // Whole pixels where it fits; the few too big for the box (long-legged lukki, the Leviathan) are shrunk.
    const room = (box - 8) / Math.max(b.w, b.h);
    const scale = room >= 1 ? Math.min(6, Math.floor(room)) : room;
    return { b, scale, w: Math.ceil(b.w * scale), h: Math.ceil(b.h * scale) };
  }, [anim, legs, box]);

  useEffect(() => {
    setPick(0);
  }, [e.id]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !anim || !fit) return;
    let raf = 0;
    let alive = true;
    const start = performance.now();
    loadAtlas()
      .then((img) => {
        if (!alive) return;
        const ctx = c.getContext('2d')!;
        const draw = (now: number) => {
          // A frame's timestamp can come from just before `start`.
          const t = playing ? Math.max(0, now - start) / 1000 : 0;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.imageSmoothingEnabled = false;
          // Draw in game pixels around the creature's pivot.
          ctx.setTransform(fit.scale, 0, 0, fit.scale, -fit.b.x0 * fit.scale, -fit.b.y0 * fit.scale);
          // Legs sit behind the body, as in the game.
          if (legs) drawLegs(ctx, img, legs, t);
          anim.layers.forEach((l, li) => {
            const f = l.frames[frameAt(l, t)]!;
            if (!f.w) return;
            const p = place(l, f);
            ctx.save();
            if (anim.motion) {
              const m = motionAt(anim.motion, li, anim.layers.length, t);
              ctx.translate(m.dx, m.dy);
              ctx.rotate(m.rot);
            }
            ctx.globalAlpha = l.alpha;
            ctx.globalCompositeOperation = l.additive ? 'lighter' : 'source-over';
            ctx.drawImage(img, f.x, f.y, f.w, f.h, p.x, p.y, p.w, p.h);
            ctx.restore();
          });
          if (playing && moves) raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [anim, fit, legs, playing, moves]);

  // No usable animation: the still portrait, or the Progress-screen icon.
  if (!anim || !fit) {
    const portrait = e.portrait && e.portrait.w >= 12 && e.portrait.h >= 12 ? e.portrait : undefined;
    const scale = portrait ? Math.max(1, Math.min(4, Math.floor(72 / Math.max(portrait.w, portrait.h)))) : 4;
    return (
      <span className="slot grid shrink-0 place-items-center overflow-hidden" style={{ width: box * 0.6, height: box * 0.6 }}>
        {portrait ? <AtlasIcon atlas="bestiary" icon={portrait} scale={scale} /> : <AtlasIcon atlas="enemies" icon={e.icon} scale={4} />}
      </span>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: box }}>
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        className="slot group relative grid place-items-center overflow-hidden"
        style={{ width: box, height: box }}
        aria-label={playing ? 'Pause animation' : 'Play animation'}
      >
        <canvas ref={canvas} width={fit.w} height={fit.h} className="pixelated" role="img" aria-label={`${e.name}, ${animLabel(anim.name)}`} />
        {moves && (
          <span className="absolute right-1 bottom-1 text-faint opacity-60 group-hover:opacity-100">{playing ? <Pause size={12} /> : <Play size={12} />}</span>
        )}
      </button>
      {anims.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1">
          {anims.map((a, i) => (
            <button
              key={a.name}
              type="button"
              onClick={() => {
                setPick(i);
                if (!reducedMotion()) setPlaying(true);
              }}
              aria-pressed={i === pick}
              className={`font-game px-1.5 text-[16px] leading-6 ${i === pick ? 'text-gold' : 'text-faint hover:text-ink'}`}
            >
              {animLabel(a.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
