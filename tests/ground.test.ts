// The real overworld ground line from the mod's samples (src/features/map/ground.ts).
import { describe, expect, it } from 'vitest';
import { groundLine, mergeSurface, surfaceAt, type GroundPoint } from '../src/features/map/ground.ts';

const flat = (x0: number, x1: number, y: number): GroundPoint[] => {
  const out: GroundPoint[] = [];
  for (let x = x0; x <= x1; x += 16) out.push([x, y]);
  return out;
};

describe('overworld ground', () => {
  it('merges samples one per column, the newer winning, sorted', () => {
    const merged = mergeSurface([[8, 100], [24, 100]], [[24, 90], [40, 95]]);
    expect(merged).toEqual([
      [8, 100],
      [24, 90],
      [40, 95],
    ]);
    expect(mergeSurface(undefined, [[40, 1], [8, 2]])).toEqual([
      [8, 2],
      [40, 1],
    ]);
  });

  it('drops a treetop: a tree only a couple of columns wide', () => {
    const pts = flat(8, 8 + 16 * 20, 300);
    pts[10] = [pts[10]![0], 240];
    pts[11] = [pts[11]![0], 245];
    expect(groundLine(pts).every((p) => p[1] === 300)).toBe(true);
  });

  it('keeps a real slope', () => {
    const pts: GroundPoint[] = flat(8, 8 + 16 * 20, 0).map(([x], i) => [x, 300 - i * 8]);
    const line = groundLine(pts);
    expect(line[10]![1]).toBe(pts[10]![1]);
  });

  it('reads the height between samples, but not across ground you have not seen', () => {
    const line: GroundPoint[] = [
      [8, 100],
      [24, 120],
      [400, 300],
    ];
    expect(surfaceAt(line, 16)).toBe(110);
    expect(surfaceAt(line, 200)).toBeUndefined();
    expect(surfaceAt(line, 390)).toBe(300);
    expect(surfaceAt(line, 2000)).toBeUndefined();
    expect(surfaceAt([], 10)).toBeUndefined();
  });
});
