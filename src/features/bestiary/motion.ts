import type { Legs, Motion } from '@/data/types';

/** How far a layer moves from its pivot (game pixels) and turns (radians). */
export type Offset = { dx: number; dy: number; rot: number };
export type Point = [number, number];
export type LegPose = { hip: Point; knee: Point; foot: Point };

const TAU = Math.PI * 2;
/** Seconds per cycle of each motion. */
export const PERIOD: Record<Motion, number> = { wriggle: 1.2, slither: 1, float: 3.2, hover: 1.3, scuttle: 1 };
/** Furthest a layer strays from its pivot, game pixels: the sprite box grows by this much. (A slither lays its own path.) */
export const AMPLITUDE: Record<Motion, number> = { wriggle: 2, slither: 0, float: 1.5, hover: 2, scuttle: 1 };
const ROCK = (4 * Math.PI) / 180;

/** Phase between neighbouring worm segments: a wave spans about seven of them. */
const WAVE_STEP = 0.9;
/** How far a worm's body swings: a share of its segment spacing, so long, widely spaced worms slither visibly. */
export const wriggleAmplitude = (gap: number) => Math.max(AMPLITUDE.wriggle, gap * 0.3);

/**
 * Where layer `i` of `n` sits `t` seconds in. A worm's layers run tail first, head last, `gap` game pixels apart:
 * a wave runs from the head down to the tail, each segment tilting along the curve, and the head swings least.
 * Everything else moves as one piece.
 */
export function motionAt(kind: Motion, i: number, n: number, t: number, gap = 10): Offset {
  const p = (t / PERIOD[kind]) * TAU;
  const a = AMPLITUDE[kind];
  switch (kind) {
    case 'wriggle': {
      const tail = n > 1 ? 1 - i / (n - 1) : 0;
      const amp = wriggleAmplitude(gap) * (0.35 + 0.65 * tail);
      const phase = p + i * WAVE_STEP;
      // The curve's slope where this segment sits: its height changes by amp·step·cos per segment of `gap`.
      return { dx: 0, dy: amp * Math.sin(phase), rot: Math.atan((amp * WAVE_STEP * Math.cos(phase)) / Math.max(1, gap)) };
    }
    case 'float':
      return { dx: 0, dy: a * Math.sin(p), rot: ROCK * Math.sin(p - 1) };
    case 'hover':
      return { dx: 0, dy: a * Math.sin(p), rot: 0 };
    case 'scuttle':
      // The body dips with every step: twice a gait cycle.
      return { dx: 0, dy: a * Math.sin(2 * p), rot: 0 };
    case 'slither':
      // Laid out whole by slitherAt.
      return { dx: 0, dy: 0, rot: 0 };
  }
}

/** A closed figure-eight, `a` game pixels wide each side of centre, sampled by distance along it. */
type Path = { a: number; perimeter: number; pts: { x: number; y: number; s: number }[] };
const SAMPLES = 720;
const paths = new Map<number, Path>();

function figureEight(a: number): Path {
  const hit = paths.get(a);
  if (hit) return hit;
  const pts: Path['pts'] = [];
  let s = 0;
  for (let k = 0; k <= SAMPLES; k++) {
    const u = (k / SAMPLES) * TAU;
    const x = a * Math.sin(u);
    const y = a * EIGHT_HEIGHT * Math.sin(2 * u);
    if (k) s += Math.hypot(x - pts[k - 1]!.x, y - pts[k - 1]!.y);
    pts.push({ x, y, s });
  }
  const path = { a, perimeter: s, pts };
  paths.set(a, path);
  return path;
}
/** The loop's height against its width: a little flatter than square. */
const EIGHT_HEIGHT = 0.75;
/** The loop is this many times the worm's length, so its tail never catches its head. */
const LOOP = 1.6;

/** Point and heading `s` game pixels along the path (wrapping round). */
function along(path: Path, s: number): { x: number; y: number; rot: number } {
  const d = ((s % path.perimeter) + path.perimeter) % path.perimeter;
  let lo = 0;
  let hi = path.pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.pts[mid]!.s <= d) lo = mid;
    else hi = mid;
  }
  const p = path.pts[lo]!;
  const q = path.pts[hi]!;
  const k = q.s > p.s ? (d - p.s) / (q.s - p.s) : 0;
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, rot: Math.atan2(q.y - p.y, q.x - p.x) };
}

/** Half-width of the loop a worm `length` game pixels long swims. */
export function slitherReach(length: number) {
  const unit = figureEight(1).perimeter;
  return Math.max(8, Math.round((LOOP * length) / unit));
}
export const slitherHeight = (reach: number) => reach * EIGHT_HEIGHT;

/**
 * A long worm swimming a figure-eight, `t` seconds in: its head leads, and each layer (tail first, head last)
 * follows `behind[i]` game pixels back along the head's trail, turned the way it's going. Faster for bigger worms.
 */
export function slitherAt(behind: number[], gap: number, t: number): { x: number; y: number; rot: number }[] {
  const path = figureEight(slitherReach(Math.max(0, ...behind)));
  const head = t * Math.max(30, gap * 4);
  return behind.map((d) => along(path, head - d));
}

/** Share of a step spent with the foot down. */
const STANCE = 0.7;

/**
 * Each leg's hip, knee and foot `t` seconds in, from the body's pivot. Feet stand spread on the ground below and
 * take turns stepping; each leg is two segments of half the reach, its knee bent upward like a harvestman's.
 */
export function legsAt(legs: Pick<Legs, 'count' | 'reach'>, t: number): LegPose[] {
  const seg = legs.reach / 2;
  const hip: Point = [0, motionAt('scuttle', 0, 1, t).dy];
  const stride = legs.reach * 0.12;
  const out: LegPose[] = [];
  for (let i = 0; i < legs.count; i++) {
    const side = legs.count > 1 ? ((i + 0.5) / legs.count) * 2 - 1 : 0;
    const home: Point = [side * legs.reach * 0.75, legs.reach * 0.5];
    // Neighbours step out of phase, so some feet are always down.
    const phase = (((t / PERIOD.scuttle + (i % 2) * 0.5 + i * 0.13) % 1) + 1) % 1;
    let shift: number;
    let lift = 0;
    if (phase < STANCE) shift = stride * (1 - (2 * phase) / STANCE);
    else {
      const u = (phase - STANCE) / (1 - STANCE);
      shift = stride * (2 * u - 1);
      lift = legs.reach * 0.1 * Math.sin(Math.PI * u);
    }
    out.push(solve(hip, [home[0] + shift, home[1] - lift], seg, seg));
  }
  return out;
}

/** Two-segment IK: the knee where both segments keep their length, bent upward; the foot as near the target as they reach. */
export function solve(hip: Point, target: Point, a: number, b: number): LegPose {
  const vx = target[0] - hip[0];
  const vy = target[1] - hip[1];
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, Math.hypot(vx, vy)));
  const base = Math.atan2(vy, vx);
  const bend = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const knees = [base - bend, base + bend].map((th): Point => [hip[0] + a * Math.cos(th), hip[1] + a * Math.sin(th)]);
  const knee = knees[0]![1] <= knees[1]![1] ? knees[0]! : knees[1]!;
  const dir = Math.atan2(hip[1] + d * Math.sin(base) - knee[1], hip[0] + d * Math.cos(base) - knee[0]);
  return { hip, knee, foot: [knee[0] + b * Math.cos(dir), knee[1] + b * Math.sin(dir)] };
}
