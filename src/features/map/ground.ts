// The real overworld ground line, from the companion mod's samples (mod 5: a ray down every 16 px near you). The
// forest, desert and snow above the caves come from the engine's own noise, which the app can't rebuild, so where
// you've been the map draws the ground the game really has.
export type GroundPoint = [number, number];

export const GROUND_STEP = 16;
const MAX_POINTS = 4000;

/** Both sample sets, one point per 16 px column; `newer` wins where both have one. Sorted by x. */
export function mergeSurface(older?: GroundPoint[], newer?: GroundPoint[]): GroundPoint[] {
  if (!older?.length) return newer ? [...newer].sort((a, b) => a[0] - b[0]).slice(0, MAX_POINTS) : [];
  if (!newer?.length) return older;
  const cols = new Map<number, GroundPoint>();
  for (const p of older) cols.set(Math.floor(p[0] / GROUND_STEP), p);
  for (const p of newer) cols.set(Math.floor(p[0] / GROUND_STEP), p);
  return [...cols.values()].sort((a, b) => a[0] - b[0]).slice(0, MAX_POINTS);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/**
 * The ground line to draw: a rolling median over 7 neighbouring columns (112 px). The rays can't tell a treetop
 * from the ground (trees are solid wood), and a tree is only a few columns wide, so the median drops it while
 * hills and cliffs stay.
 */
export function groundLine(points: GroundPoint[]): GroundPoint[] {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const R = 3;
  return pts.map((p, i) => {
    const ys: number[] = [];
    for (let j = Math.max(0, i - R); j <= Math.min(pts.length - 1, i + R); j++) {
      if (Math.abs(pts[j]![0] - p[0]) <= R * GROUND_STEP + 1) ys.push(pts[j]![1]);
    }
    return [p[0], median(ys)];
  });
}

/** The ground's height at world x, between two samples at most 64 px apart (or right on one); undefined elsewhere. */
export function surfaceAt(line: GroundPoint[], x: number): number | undefined {
  if (!line.length) return undefined;
  let lo = 0;
  let hi = line.length - 1;
  if (x < line[0]![0] - GROUND_STEP || x > line[hi]![0] + GROUND_STEP) return undefined;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line[mid]![0] <= x) lo = mid;
    else hi = mid;
  }
  const a = line[lo]!;
  const b = line[hi]!;
  if (x <= a[0]) return x >= a[0] - GROUND_STEP ? a[1] : undefined;
  if (x >= b[0]) return x <= b[0] + GROUND_STEP ? b[1] : undefined;
  if (b[0] - a[0] > 4 * GROUND_STEP) {
    // A gap (somewhere you haven't been): only right next to a sample.
    if (x - a[0] <= GROUND_STEP) return a[1];
    if (b[0] - x <= GROUND_STEP) return b[1];
    return undefined;
  }
  return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
}
