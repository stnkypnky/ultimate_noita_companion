import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { gameUrl } from '@/data/store';
import type { Enemy, SpriteLayer } from '@/data/types';
import { AtlasIcon } from '@/ui/GameIcon';

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

/** The box every frame of the animation fits in. */
function bounds(a: Anim) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of a.layers)
    for (const f of l.frames) {
      const p = place(l, f);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + p.w);
      y1 = Math.max(y1, p.y + p.h);
    }
  return Number.isFinite(x0) ? { x0, y0, w: x1 - x0, h: y1 - y0 } : null;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The creature, animated from its sprite sheet, with a picker for its animations. */
export function CreatureSprite({ enemy: e, box = 168 }: { enemy: Enemy; box?: number }) {
  const anims = e.anims?.filter((a) => a.layers.some((l) => l.frames.some((f) => f.w > 0))) ?? [];
  const [pick, setPick] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion());
  const anim = anims[Math.min(pick, anims.length - 1)];
  const canvas = useRef<HTMLCanvasElement>(null);
  const frameCount = anim ? Math.max(...anim.layers.map((l) => l.frames.length)) : 0;

  const fit = useMemo(() => {
    if (!anim) return null;
    const b = bounds(anim);
    if (!b) return null;
    const scale = Math.max(1, Math.min(6, Math.floor((box - 8) / Math.max(b.w, b.h))));
    return { b, scale, w: Math.ceil(b.w * scale), h: Math.ceil(b.h * scale) };
  }, [anim, box]);

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
          for (const l of anim.layers) {
            const n = l.frames.length;
            const i = l.loop ? Math.floor(t / Math.max(0.016, l.wait)) % n : Math.min(n - 1, Math.floor(t / Math.max(0.016, l.wait)));
            const f = l.frames[i]!;
            if (!f.w) continue;
            const p = place(l, f);
            ctx.globalAlpha = l.alpha;
            ctx.globalCompositeOperation = l.additive ? 'lighter' : 'source-over';
            ctx.drawImage(img, f.x, f.y, f.w, f.h, (p.x - fit.b.x0) * fit.scale, (p.y - fit.b.y0) * fit.scale, p.w * fit.scale, p.h * fit.scale);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          if (playing && frameCount > 1) raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [anim, fit, playing, frameCount]);

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
        {frameCount > 1 && (
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
