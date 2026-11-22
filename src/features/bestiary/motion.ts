import type { Legs, Motion } from '@/data/types';

/** How far a layer moves from its pivot (game pixels) and turns (radians). */
export type Offset = { dx: number; dy: number; rot: number };
export type Point = [number, number];
export type LegPose = { hip: Point; knee: Point; foot: Point };

const TAU = Math.PI * 2;
/** Seconds per cycle of each motion. */
export const PERIOD: Record<Motion, number> = { wriggle: 1.2, float: 3.2, hover: 1.3, scuttle: 1 };
/** Furthest a layer strays from its pivot, game pixels: the sprite box grows by this much. */
export const AMPLITUDE: Record<Motion, number> = { wriggle: 2, float: 1.5, hover: 2, scuttle: 1 };
const ROCK = (4 * Math.PI) / 180;

/**
 * Where layer `i` of `n` sits `t` seconds in. A worm's layers run tail first, head last: a wave travels down the
 * body and the head moves least. Everything else moves as one piece.
 */
export function motionAt(kind: Motion, i: number, n: number, t: number): Offset {
  const p = (t / PERIOD[kind]) * TAU;
  const a = AMPLITUDE[kind];
  switch (kind) {
    case 'wriggle': {
      const tail = n > 1 ? 1 - i / (n - 1) : 0;
      return { dx: 0, dy: a * (0.35 + 0.65 * tail) * Math.sin(p - i * 0.9), rot: 0 };
    }
    case 'float':
      return { dx: 0, dy: a * Math.sin(p), rot: ROCK * Math.sin(p - 1) };
    case 'hover':
      return { dx: 0, dy: a * Math.sin(p), rot: 0 };
    case 'scuttle':
      // The body dips with every step: twice a gait cycle.
      return { dx: 0, dy: a * Math.sin(2 * p), rot: 0 };
  }
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
