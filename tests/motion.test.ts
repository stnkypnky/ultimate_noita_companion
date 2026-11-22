import { describe, expect, it } from 'vitest';
import type { Motion } from '../src/data/types.ts';
import { AMPLITUDE, PERIOD, legsAt, motionAt, slitherAt, slitherHeight, slitherReach, solve, wriggleAmplitude } from '../src/features/bestiary/motion.ts';

const KINDS: Motion[] = ['wriggle', 'float', 'hover', 'scuttle'];
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('creature motion', () => {
  it('repeats every period and stays within its amplitude', () => {
    for (const k of KINDS) {
      for (let s = 0; s < 40; s++) {
        const t = s * 0.137;
        for (let i = 0; i < 5; i++) {
          const m = motionAt(k, i, 5, t);
          const later = motionAt(k, i, 5, t + PERIOD[k]);
          close(m.dy, later.dy);
          close(m.rot, later.rot);
          expect(Math.hypot(m.dx, m.dy)).toBeLessThanOrEqual((k === 'wriggle' ? wriggleAmplitude(10) : AMPLITUDE[k]) + 1e-9);
        }
      }
    }
  });

  it('sends a wave down a worm, head last and stillest', () => {
    const at = (i: number) => motionAt('wriggle', i, 5, 0.3).dy;
    expect(new Set([0, 1, 2, 3, 4].map(at)).size).toBe(5);
    const swing = (i: number) => Math.max(...Array.from({ length: 60 }, (_, s) => Math.abs(motionAt('wriggle', i, 5, s * 0.02).dy)));
    expect(swing(4)).toBeLessThan(swing(0));
  });

  it('runs the wave from head to tail, segments tilting along it', () => {
    // When the head (last layer) crests, the segment behind it crests a moment later.
    const crest = (i: number) => {
      let best = 0;
      for (let s = 1; s < 120; s++) if (motionAt('wriggle', i, 5, (s / 120) * PERIOD.wriggle).dy > motionAt('wriggle', i, 5, (best / 120) * PERIOD.wriggle).dy) best = s;
      return best;
    };
    const lag = (crest(3) - crest(4) + 120) % 120;
    expect(lag).toBeGreaterThan(0);
    expect(lag).toBeLessThan(60);
    // Widely spaced worms swing further; a segment on the rising side of the wave tilts up toward the head.
    expect(wriggleAmplitude(56)).toBeGreaterThan(wriggleAmplitude(6));
    const m = motionAt('wriggle', 2, 5, 0, 12);
    expect(Math.sign(m.rot)).toBe(Math.sign(Math.cos(2 * 0.9)));
  });

  it('swims a long worm along its own trail, head first', () => {
    // Tail first, head last, 12 px apart.
    const behind = Array.from({ length: 15 }, (_, i) => (14 - i) * 12);
    const reach = slitherReach(168);
    for (let s = 0; s < 40; s++) {
      const t = s * 0.23;
      const pose = slitherAt(behind, 12, t);
      for (let i = 1; i < pose.length; i++) {
        // Neighbours stay joined: never further apart than the trail between them.
        const d = Math.hypot(pose[i]!.x - pose[i - 1]!.x, pose[i]!.y - pose[i - 1]!.y);
        expect(d).toBeLessThanOrEqual(12 + 1e-6);
        expect(d).toBeGreaterThan(6);
      }
      for (const p of pose) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(reach + 1e-6);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(slitherHeight(reach) + 1e-6);
      }
      // A moment later the head has moved the way it faces.
      const head = pose.at(-1)!;
      const next = slitherAt(behind, 12, t + 0.05).at(-1)!;
      expect((next.x - head.x) * Math.cos(head.rot) + (next.y - head.y) * Math.sin(head.rot)).toBeGreaterThan(0);
    }
  });

  it('keeps leg segments their length and knees above the line to the foot', () => {
    const legs = { count: 8, reach: 80 };
    for (let s = 0; s < 30; s++) {
      for (const { hip, knee, foot } of legsAt(legs, s * 0.07)) {
        close(Math.hypot(knee[0] - hip[0], knee[1] - hip[1]), 40);
        close(Math.hypot(foot[0] - knee[0], foot[1] - knee[1]), 40);
        expect(knee[1]).toBeLessThan(Math.max(hip[1], foot[1]));
      }
    }
  });

  it('reaches as far as it can toward a foot out of range', () => {
    const { foot } = solve([0, 0], [100, 0], 10, 10);
    expect(foot[0]).toBeCloseTo(20, 3);
    close(foot[1], 0);
  });
});
