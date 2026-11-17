// Lightning drawn in whole pixels like the game's lightning_ray.png.
import { describe, expect, it } from 'vitest';
import { crackPath, crackle, rasterize } from '../src/features/range/lightning.ts';

/** A repeatable random source. */
const seeded = (s: number) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);

/** Distance of a point from the straight line between the ends. */
const off = (x0: number, y0: number, x1: number, y1: number, [x, y]: [number, number]) =>
  Math.abs((x1 - x0) * (y0 - y) - (x0 - x) * (y1 - y0)) / Math.hypot(x1 - x0, y1 - y0);

describe('lightning', () => {
  it('starts and ends exactly at its two points', () => {
    for (let s = 1; s < 20; s++) {
      const p = crackPath(10, 20, 250, 90, 9, seeded(s));
      expect(p[0]).toEqual([10, 20]);
      expect(p[p.length - 1]).toEqual([250, 90]);
    }
  });

  it('stays within its wander', () => {
    for (let s = 1; s < 20; s++) {
      for (const pt of crackPath(0, 0, 200, 0, 8, seeded(s))) expect(off(0, 0, 200, 0, pt)).toBeLessThanOrEqual(8 + 1e-9);
    }
  });

  it('is jagged in short steps, not a few long strokes', () => {
    const p = crackPath(0, 0, 240, 0, 8, seeded(3));
    expect(p.length).toBeGreaterThan(64);
  });

  it('rasterizes to a connected line of whole pixels', () => {
    const cells = rasterize(crackPath(5, 5, 180, 60, 9, seeded(7)));
    for (const [x, y] of cells) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    }
    for (let i = 1; i < cells.length; i++) {
      expect(Math.max(Math.abs(cells[i]![0] - cells[i - 1]![0]), Math.abs(cells[i]![1] - cells[i - 1]![1]))).toBe(1);
    }
    expect(cells[0]).toEqual([5, 5]);
    expect(cells[cells.length - 1]).toEqual([180, 60]);
  });

  it('grows forks and a thicker core on heavy strikes only', () => {
    const heavy = crackle(0, 0, 200, 0, { amp: 8, forks: 2, heavy: true, random: seeded(11) });
    expect(heavy.forks.length).toBeGreaterThan(0);
    expect(heavy.thick.length).toBeGreaterThan(0);
    const arc = crackle(0, 0, 60, 0, { amp: 5, forks: 0, heavy: false, random: seeded(11) });
    expect(arc.forks).toEqual([]);
    expect(arc.thick).toEqual([]);
  });
});
