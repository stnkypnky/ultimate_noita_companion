import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { gameUrl } from '@/data/store';
import type { Chain, Enemy, Icon, Legs, SpriteLayer } from '@/data/types';
import { AtlasIcon } from '@/ui/GameIcon';
import { AMPLITUDE, CHAIN_PERIOD, STRIKE, chainAt, legCycle, legsAt, motionAt, slitherAt, slitherHeight, slitherReach, wriggleAmplitude, type Point } from './motion';

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

/**
 * Where a layer's frame lands, in game pixels around the creature's pivot. A negative scale mirrors it about its
 * pivot (a worm's head turned to lead its body): `flip` says to draw it mirrored within this box.
 */
function place(l: SpriteLayer, f: { w: number; h: number }) {
  const fx = l.sx ?? 1;
  const fy = l.sy ?? 1;
  const w = f.w * l.scale * Math.abs(fx);
  const h = f.h * l.scale * Math.abs(fy);
  return { x: fx < 0 ? l.ox * -fx - w : -l.ox * fx, y: fy < 0 ? l.oy * -fy - h : -l.oy * fy, w, h, flipX: fx < 0, flipY: fy < 0 };
}

/** A worm's layers' centres, tail to head, along its body. */
const centresX = (a: Anim) =>
  a.layers.map((l) => {
    const p = place(l, l.frames[0]!);
    return p.x + p.w / 2;
  });

/** A worm's segment spacing: how far apart its layers' centres sit, tail to head. */
function chainGap(a: Anim) {
  const xs = centresX(a);
  return xs.length > 1 ? Math.abs(xs[xs.length - 1]! - xs[0]!) / (xs.length - 1) : 10;
}

/** How far each layer of a worm sits behind its head's centre. */
function behindHead(a: Anim) {
  const xs = centresX(a);
  return xs.map((x) => Math.max(0, xs[xs.length - 1]! - x));
}

/** Half the diagonal of a worm's biggest part: how far it reaches from its centre however it turns. */
const partRadius = (a: Anim) => Math.max(...a.layers.map((l) => Math.hypot(l.frames[0]!.w, l.frames[0]!.h) * l.scale)) / 2;

/** Each chain swings out of step with the others. */
const chainPhase = (i: number) => i * 1.7;

/** The box every frame of the animation fits in, with room for its motion, its legs' reach and its chains' swing. */
function bounds(a: Anim, legs?: Legs, chains?: Chain[]) {
  if (a.motion === 'slither') {
    // The loop it swims, with room for a part turned any way.
    const w = slitherReach(Math.max(...behindHead(a)));
    const h = slitherHeight(w);
    const r = partRadius(a);
    return { x0: -w - r, y0: -h - r, w: 2 * (w + r), h: 2 * (h + r) };
  }
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
  if (a.motion === 'wriggle') {
    // Segments swing up and down and tilt about their own centres.
    const part = Math.max(...a.layers.map((l) => Math.max(l.frames[0]!.w, l.frames[0]!.h) * l.scale));
    const pad = wriggleAmplitude(chainGap(a)) + part * 0.25;
    add(x0, y0, pad);
    add(x1, y1, pad);
  } else if (a.motion) {
    // A rock of a few degrees swings the far corners a little further.
    const pad = AMPLITUDE[a.motion] + Math.max(-x0, x1, -y0, y1) * 0.08;
    add(x0, y0, pad);
    add(x1, y1, pad);
  }
  if (legs) {
    const a = legs.attacker;
    const thick = Math.max(legs.upper.h, legs.lower.h, legs.knee?.h ?? 0, a?.upper.h ?? 0, a?.lower.h ?? 0, a?.joint?.h ?? 0) / 2;
    // Every step of every leg, and the whole strike.
    const span = Math.max(legCycle(legs), STRIKE);
    const samples = Math.ceil(span / 0.05);
    for (let i = 0; i < samples; i++)
      for (const mode of a ? (['idle', 'attack'] as const) : (['idle'] as const))
        for (const leg of legsAt(legs, (i / samples) * span, mode)) for (const pt of [leg.knee, leg.foot]) add(pt[0], pt[1], thick);
  }
  if (chains) {
    // Every link of the whole sway, padded by its piece turned any way, plus the body's bob it hangs from.
    const bob = a.motion ? AMPLITUDE[a.motion] : 0;
    const samples = Math.ceil(CHAIN_PERIOD / 0.05);
    chains.forEach((c, ci) => {
      const pad = Math.max(...c.pieces.map((p) => Math.hypot(Math.max(p.icon.w, c.stretch ? c.gap : 0), p.icon.h))) + bob;
      for (let i = 0; i < samples; i++)
        for (const { from, to } of chainAt(c.at, c.pieces.length, c.gap, (i / samples) * CHAIN_PERIOD, chainPhase(ci))) {
          add(from[0], from[1], pad);
          add(to[0], to[1], pad);
        }
    });
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The chains in front of the body or behind it, hanging from where the body is now (`dy`, its bob). Each piece is
 * drawn from its link's start, turned along it, and stretched to the link when the game stretches it.
 */
function drawChains(ctx: CanvasRenderingContext2D, img: HTMLImageElement, chains: Chain[], t: number, dy: number, front: boolean) {
  chains.forEach((c, ci) => {
    if (c.front !== front) return;
    const links = chainAt([c.at[0], c.at[1] + dy], c.pieces.length, c.gap, t, chainPhase(ci));
    links.forEach(({ from, to }, i) => {
      const p = c.pieces[i]!;
      const ic = p.icon;
      if (!ic.w) return;
      ctx.save();
      ctx.translate(from[0], from[1]);
      ctx.rotate(Math.atan2(to[1] - from[1], to[0] - from[0]));
      if (c.stretch) ctx.scale(c.gap / ic.w, 1);
      ctx.drawImage(img, ic.x, ic.y, ic.w, ic.h, -p.ox, -p.oy, ic.w, ic.h);
      ctx.restore();
    });
  });
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

/**
 * The legs, and the limb that strikes (with its own images: Jalkamatkatavara's is an arm with a fist). Legs on the
 * right use their own lower segment when they have one, so feet point outward.
 */
function drawLegs(ctx: CanvasRenderingContext2D, img: HTMLImageElement, legs: Legs, t: number, mode: 'idle' | 'attack') {
  for (const { hip, knee, foot, side, strike } of legsAt(legs, t, mode)) {
    const a = strike ? legs.attacker : undefined;
    const lower = a ? a.lower : side! > 0 && legs.lowerRight ? legs.lowerRight : legs.lower;
    const joint = a ? a.joint : legs.knee;
    segment(ctx, img, a ? a.upper : legs.upper, legs.pivot, hip, knee);
    segment(ctx, img, lower, legs.pivot, knee, foot);
    if (joint) ctx.drawImage(img, joint.x, joint.y, joint.w, joint.h, knee[0] - joint.w / 2, knee[1] - joint.h / 2, joint.w, joint.h);
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
  const chains = e.chains;
  const moves = !!anim && (anim.layers.some((l) => l.frames.length > 1) || !!anim.motion || !!chains?.length);
  const gap = useMemo(() => (anim?.motion === 'wriggle' || anim?.motion === 'slither' ? chainGap(anim) : 10), [anim]);
  const behind = useMemo(() => (anim?.motion === 'slither' ? behindHead(anim) : null), [anim]);

  const fit = useMemo(() => {
    if (!anim) return null;
    const b = bounds(anim, legs, chains);
    if (!b) return null;
    // Whole pixels where it fits; the few too big for the box (long-legged lukki, the Leviathan) are shrunk.
    const room = (box - 8) / Math.max(b.w, b.h);
    const scale = room >= 1 ? Math.min(6, Math.floor(room)) : room;
    return { b, scale, w: Math.ceil(b.w * scale), h: Math.ceil(b.h * scale) };
  }, [anim, legs, chains, box]);

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
          if (legs) drawLegs(ctx, img, legs, t, anim.name === 'attack' && legs.attacker ? 'attack' : 'idle');
          // Chains hang from the body, wherever its bob has it.
          const bodyDy = anim.motion && anim.motion !== 'slither' ? motionAt(anim.motion, 0, anim.layers.length, t, gap).dy : 0;
          if (chains) drawChains(ctx, img, chains, t, bodyDy, false);
          const swim = behind ? slitherAt(behind, gap, t) : null;
          anim.layers.forEach((l, li) => {
            const f = l.frames[frameAt(l, t)]!;
            if (!f.w) return;
            const p = place(l, f);
            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            ctx.save();
            if (swim) {
              // Each part's centre on the head's trail, turned the way it swims.
              const s = swim[li]!;
              ctx.translate(s.x, s.y);
              ctx.rotate(s.rot);
              ctx.translate(-cx, -cy);
            } else if (anim.motion) {
              const m = motionAt(anim.motion, li, anim.layers.length, t, gap);
              ctx.translate(m.dx, m.dy);
              // A worm's segments tilt about their own centres; a whole body turns about its pivot.
              if (anim.motion === 'wriggle') {
                ctx.translate(cx, cy);
                ctx.rotate(m.rot);
                ctx.translate(-cx, -cy);
              } else ctx.rotate(m.rot);
            }
            if (p.flipX || p.flipY) {
              ctx.translate(cx, cy);
              ctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
              ctx.translate(-cx, -cy);
            }
            ctx.globalAlpha = l.alpha;
            ctx.globalCompositeOperation = l.additive ? 'lighter' : 'source-over';
            ctx.drawImage(img, f.x, f.y, f.w, f.h, p.x, p.y, p.w, p.h);
            ctx.restore();
          });
          if (chains) drawChains(ctx, img, chains, t, bodyDy, true);
          if (playing && moves) raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [anim, fit, legs, chains, gap, behind, playing, moves]);

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
