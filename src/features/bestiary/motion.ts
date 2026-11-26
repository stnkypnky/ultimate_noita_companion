import type { Legs, Motion } from '@/data/types';

/** How far a layer moves from its pivot (game pixels) and turns (radians). */
export type Offset = { dx: number; dy: number; rot: number };
export type Point = [number, number];
/** A limb's joints; `side` it bends to (−1 left, 1 right), and `strike` for the limb that attacks. */
export type LegPose = { hip: Point; knee: Point; foot: Point; side?: number; strike?: boolean };

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

/** What legsAt needs to know about the legs. */
export type LegShape = Pick<Legs, 'count' | 'reach'> & Partial<Pick<Legs, 'grip' | 'maxAngle' | 'hips'>> & { attacker?: { reach: number; radius: number } };

/** Seconds between one leg's step and the next's. */
const STEP_SLOT = 0.4;
/** Seconds a foot is off the ground. */
const STEP_TIME = 0.28;
/** Seconds of one strike: wind up, lunge, hold, draw back. */
export const STRIKE = 1.4;

const walkingLegs = (legs: LegShape) => legs.hips?.length ?? Math.max(1, legs.count - (legs.attacker ? 1 : 0));
/** Seconds until the legs are back where they started: each steps out and back once. */
export const legCycle = (legs: LegShape) => 2 * walkingLegs(legs) * STEP_SLOT;

const ease = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: Point, b: Point, u: number): Point => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** The order legs step in: across the body and back, so neighbours don't step one after another. */
function stepOrder(n: number) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let jump = Math.floor(n / 2) + 1;
  while (jump > 1 && gcd(jump, n) !== 1) jump--;
  const slot = new Array<number>(n);
  for (let k = 0; k < n; k++) slot[(k * jump) % n] = k;
  return slot;
}

/**
 * Each leg's hip, knee and foot `t` seconds in, from the body's pivot, as the game's IK legs hold it:
 * - 'cling' (IKLimbsAnimatorComponent): feet grab walls and ceilings all around, so the legs radiate from the body;
 * - 'walk' (IKLimbWalkerComponent): feet stand on the ground below, within maxAngle of straight down.
 * Feet stay put while the body bobs; one leg at a time lifts and sets down a little way along. Knees bend outward.
 * In 'attack' the striking limb lunges at prey within its radius and draws back; otherwise it waits folded in.
 */
export function legsAt(legs: LegShape, t: number, mode: 'idle' | 'attack' = 'idle'): LegPose[] {
  const n = walkingLegs(legs);
  const seg = legs.reach / 2;
  const bob = motionAt('scuttle', 0, 1, t).dy;
  const grip = legs.grip ?? 'walk';
  const maxAngle = legs.maxAngle ?? 0.8;
  const order = stepOrder(n);
  const cycle = n * STEP_SLOT;
  const out: LegPose[] = [];
  for (let i = 0; i < n; i++) {
    const hip: Point = [legs.hips?.[i] ?? 0, bob];
    // Its two footholds (it steps from one to the other), the way it lifts in between, and the side its knee
    // bends to: left legs left, right legs right, one straight up or down to the right.
    let spots: [Point, Point];
    let up: Point;
    let side: number;
    if (grip === 'cling') {
      // Evenly round the body, clockwise from straight up; reach most of the way out.
      const th = -Math.PI / 2 + ((i + 0.5) / n) * 2 * Math.PI;
      side = Math.cos(th) < -1e-6 ? -1 : 1;
      const r = legs.reach * 0.85;
      const d = 0.12;
      spots = [th - d, th + d].map((a): Point => [hip[0] + r * Math.cos(a), r * Math.sin(a)]) as [Point, Point];
      up = [-Math.cos(th), -Math.sin(th)];
    } else {
      // Standing high on its legs, feet spread across the allowed angle.
      // Nearly straight-legged, as Jalkamatkatavara stands in the game.
      const h = legs.reach * 0.85;
      const phi = (n > 1 ? ((i + 0.5) / n) * 2 - 1 : 0) * maxAngle * 0.9;
      side = phi < -1e-6 ? -1 : 1;
      const x = hip[0] + h * Math.tan(phi);
      const stride = legs.reach * 0.08;
      spots = [
        [x - stride / 2, h],
        [x + stride / 2, h],
      ];
      up = [0, -1];
    }
    const local = t - order[i]! * STEP_SLOT;
    const k = Math.floor(local / cycle);
    const u = (local - k * cycle) / STEP_TIME;
    const from = spots[((k % 2) + 2) % 2]!;
    const to = spots[(((k + 1) % 2) + 2) % 2]!;
    let foot: Point;
    if (u < 1) {
      const lift = legs.reach * 0.12 * Math.sin(Math.PI * u);
      const p = lerp(from, to, ease(u));
      foot = [p[0] + up[0] * lift, p[1] + up[1] * lift];
    } else foot = to;
    out.push({ ...solve(hip, foot, seg, seg, side), side });
  }
  const a = legs.attacker;
  if (a) {
    const hip: Point = [0, bob];
    const s = a.reach / 2;
    // Folded in under the body, front side; it strikes forward and down.
    const rest: Point = [a.reach * 0.25, a.reach * 0.6 + bob];
    let foot = rest;
    if (mode === 'attack') {
      const u = (((t % STRIKE) + STRIKE) % STRIKE) / STRIKE;
      const far = Math.min(a.radius, a.reach) * 0.95;
      const hit: Point = [far * Math.cos(0.45), far * Math.sin(0.45) + bob];
      const back: Point = [a.reach * 0.05, a.reach * 0.15 + bob];
      if (u < 0.3) foot = lerp(rest, back, ease(u / 0.3));
      else if (u < 0.42) foot = lerp(back, hit, ease((u - 0.3) / 0.12));
      else if (u < 0.6) foot = hit;
      else foot = lerp(hit, rest, ease((u - 0.6) / 0.4));
    }
    out.push({ ...solve(hip, foot, s, s, 1), side: 1, strike: true });
  }
  return out;
}

/**
 * Two-segment IK: the knee where both segments keep their length; the foot as near the target as they reach.
 * The knee bends upward, and out to `side` (−1 left, 1 right) when that decides it.
 */
export function solve(hip: Point, target: Point, a: number, b: number, side = 0): LegPose {
  const vx = target[0] - hip[0];
  const vy = target[1] - hip[1];
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, Math.hypot(vx, vy)));
  const base = Math.atan2(vy, vx);
  const bend = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const knees = [base - bend, base + bend].map((th): Point => [hip[0] + a * Math.cos(th), hip[1] + a * Math.sin(th)]);
  const score = (k: Point) => side * (k[0] - hip[0]) - (k[1] - hip[1]);
  const knee = score(knees[0]!) >= score(knees[1]!) ? knees[0]! : knees[1]!;
  const dir = Math.atan2(hip[1] + d * Math.sin(base) - knee[1], hip[0] + d * Math.cos(base) - knee[0]);
  return { hip, knee, foot: [knee[0] + b * Math.cos(dir), knee[1] + b * Math.sin(dir)] };
}
