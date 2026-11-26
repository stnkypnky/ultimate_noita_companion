import { describe, expect, it } from 'vitest';
import type { Motion } from '../src/data/types.ts';
import { AMPLITUDE, CHAIN_PERIOD, CHAIN_SWAY, PERIOD, chainAt, legsAt, motionAt, slitherAt, slitherHeight, slitherReach, solve, wriggleAmplitude } from '../src/features/bestiary/motion.ts';

const KINDS: Motion[] = ['wriggle', 'float', 'hover', 'scuttle'];
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('hanging chains', () => {
  it('keep their links joined, gap apart, hanging below the anchor, and repeat every period', () => {
    for (let s = 0; s < 30; s++) {
      const t = s * 0.173;
      const links = chainAt([3, 5], 7, 16, t, 1.2);
      expect(links).toHaveLength(7);
      links.forEach(({ from, to }, i) => {
        if (i === 0) expect(from).toEqual([3, 5]);
        else expect(from).toEqual(links[i - 1]!.to);
        close(Math.hypot(to[0] - from[0], to[1] - from[1]), 16);
        // Never swings past CHAIN_SWAY from straight down.
        expect(Math.abs(Math.atan2(to[1] - from[1], to[0] - from[0]) - Math.PI / 2)).toBeLessThanOrEqual(CHAIN_SWAY + 1e-9);
        expect(to[1]).toBeGreaterThan(from[1]);
      });
      const again = chainAt([3, 5], 7, 16, t + CHAIN_PERIOD, 1.2);
      again.forEach((l, i) => {
        close(l.to[0], links[i]!.to[0]);
        close(l.to[1], links[i]!.to[1]);
      });
    }
  });
});

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

  const times = Array.from({ length: 120 }, (_, s) => s * 0.05);

  it('keeps leg segments their length, whichever way they hold on', () => {
    for (const grip of ['cling', 'walk'] as const)
      for (const t of times)
        for (const { hip, knee, foot } of legsAt({ count: 8, reach: 80, grip, attacker: { reach: 80, radius: 80 } }, t, 'attack')) {
          close(Math.hypot(knee[0] - hip[0], knee[1] - hip[1]), 40);
          close(Math.hypot(foot[0] - knee[0], foot[1] - knee[1]), 40);
        }
  });

  it('spreads clinging legs all around the body', () => {
    const quadrants = new Set(legsAt({ count: 8, reach: 40, grip: 'cling' }, 0).map(({ hip, foot }) => `${Math.sign(foot[0] - hip[0])}${Math.sign(foot[1] - hip[1])}`));
    expect(quadrants).toEqual(new Set(['11', '1-1', '-11', '-1-1']));
  });

  it('stands walking legs on the ground below, within their angle', () => {
    const legs = { count: 7, reach: 40, grip: 'walk' as const, maxAngle: 0.8, hips: [-6, -4, -2, 2, 4, 6], attacker: { reach: 40, radius: 40 } };
    for (const t of times) {
      const walking = legsAt(legs, t).filter((l) => !l.strike);
      expect(walking).toHaveLength(6);
      for (const { hip, foot } of walking) {
        expect(foot[1]).toBeGreaterThan(hip[1]);
        // A lifted foot swings a little wider than where it stands.
        expect(Math.abs(Math.atan2(foot[0] - hip[0], foot[1] - hip[1]))).toBeLessThan(0.8 + 0.15);
      }
      // Right legs bend right, left legs left: knees outward.
      for (const { hip, knee, side } of walking) expect(Math.sign(knee[0] - hip[0])).toBe(side);
    }
  });

  it('lifts one leg at a time', () => {
    const legs = { count: 8, reach: 40, grip: 'cling' as const };
    for (const t of times) {
      const moved = legsAt(legs, t).filter((l, i) => {
        // A foot is down where it was a moment ago.
        const before = legsAt(legs, t - 0.02)[i]!.foot;
        return Math.hypot(l.foot[0] - before[0], l.foot[1] - before[1]) > 1e-6;
      });
      expect(moved.length).toBeLessThanOrEqual(1);
    }
  });

  it('strikes with the attacking limb out to its radius, and keeps it folded otherwise', () => {
    const legs = { count: 8, reach: 40, grip: 'cling' as const, attacker: { reach: 40, radius: 40 } };
    const far = (mode: 'idle' | 'attack') => Math.max(...times.map((t) => {
      const a = legsAt(legs, t, mode).find((l) => l.strike)!;
      return Math.hypot(a.foot[0] - a.hip[0], a.foot[1] - a.hip[1]);
    }));
    expect(far('attack')).toBeGreaterThan(40 * 0.9);
    expect(far('idle')).toBeLessThan(40 * 0.7);
  });

  it('reaches as far as it can toward a foot out of range', () => {
    const { foot } = solve([0, 0], [100, 0], 10, 10);
    expect(foot[0]).toBeCloseTo(20, 3);
    close(foot[1], 0);
  });
});
