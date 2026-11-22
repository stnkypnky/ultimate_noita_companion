import { describe, expect, it } from 'vitest';
import type { Motion } from '../src/data/types.ts';
import { AMPLITUDE, PERIOD, legsAt, motionAt, solve } from '../src/features/bestiary/motion.ts';

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
          expect(Math.hypot(m.dx, m.dy)).toBeLessThanOrEqual(AMPLITUDE[k] + 1e-9);
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
