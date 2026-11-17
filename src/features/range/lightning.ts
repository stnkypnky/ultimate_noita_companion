// Lightning in the game's look. The engine stamps data/particles/lightning_ray.png along a jagged path:
// a hard white core one to four pixels thick, inside a half-transparent deep blue fringe (#1a39f4 at ~52%).
// There's no soft gradient, so this works in whole pixels too, and re-crackles every frame while it lives.

/** A pixel of the bolt, in world (game) pixels. */
export type Cell = [number, number];

export type Crackle = {
  /** The main channel: white core pixels. */
  core: Cell[];
  /** Pixels that thicken the core where the bolt is at its brightest. */
  thick: Cell[];
  /** Forks off the main channel: thinner, white core too. */
  forks: Cell[];
};

export type CrackleOptions = {
  /** Largest sideways wander from the straight line, in pixels. */
  amp: number;
  /** How many forks to grow (0 for short arcs). */
  forks?: number;
  /** Thicken the core (strikes are fatter than arcs). */
  heavy?: boolean;
  random?: () => number;
};

/** The game's lightning colours, from lightning_ray.png, lightning_skinny.png and spark_electric.png. */
export const LIGHTNING = {
  core: '#ffffff',
  fringe: '#1a39f4',
  fringeAlpha: 0.52,
  glow: '#6479f8',
  sparks: ['#72bbfa', '#bcdffd', '#8dcbf5'],
} as const;

/** Vertices of a jagged path from (x0, y0) to (x1, y1), by midpoint displacement; never further than `amp` off the line. */
export function crackPath(x0: number, y0: number, x1: number, y1: number, amp: number, random = Math.random): [number, number][] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return [[x0, y0], [x1, y1]];
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  // Offsets along the normal at evenly spaced points, refined level by level with shrinking kicks.
  let offs = [0, 0];
  let kick = Math.min(amp, len * 0.35);
  while ((len / (offs.length - 1)) > 3) {
    const next: number[] = [];
    for (let i = 0; i < offs.length - 1; i++) {
      next.push(offs[i]!, (offs[i]! + offs[i + 1]!) / 2 + (random() * 2 - 1) * kick);
    }
    next.push(offs[offs.length - 1]!);
    offs = next;
    kick *= 0.58;
  }
  const n = offs.length - 1;
  return offs.map((o, i) => {
    const t = i / n;
    // Pinned at both ends; the wander is allowed to grow toward the middle.
    const lim = amp * Math.min(1, Math.sin(Math.PI * t) * 1.6);
    const c = Math.max(-lim, Math.min(lim, o));
    return [x0 + (x1 - x0) * t + nx * c, y0 + (y1 - y0) * t + ny * c];
  });
}

/** Whole-pixel line between two points (Bresenham), appended to `out` without repeating the joint. */
function plot(out: Cell[], ax: number, ay: number, bx: number, by: number) {
  let x = Math.round(ax);
  let y = Math.round(ay);
  const ex = Math.round(bx);
  const ey = Math.round(by);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  const last = out[out.length - 1];
  if (!last || last[0] !== x || last[1] !== y) out.push([x, y]);
  while (x !== ex || y !== ey) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push([x, y]);
  }
}

export function rasterize(path: [number, number][]): Cell[] {
  const out: Cell[] = [];
  for (let i = 1; i < path.length; i++) plot(out, path[i - 1]![0], path[i - 1]![1], path[i]![0], path[i]![1]);
  return out;
}

/** One frame of a bolt: the main channel, its thick stretches and a few forks. */
export function crackle(x0: number, y0: number, x1: number, y1: number, o: CrackleOptions): Crackle {
  const random = o.random ?? Math.random;
  const path = crackPath(x0, y0, x1, y1, o.amp, random);
  const core = rasterize(path);
  const len = Math.hypot(x1 - x0, y1 - y0);

  // The ray texture's core swells and thins along its length; double it up over a few random stretches.
  const thick: Cell[] = [];
  if (o.heavy && core.length > 4) {
    const px = Math.abs(y1 - y0) > Math.abs(x1 - x0) ? 1 : 0;
    const py = 1 - px;
    let on = random() < 0.5;
    let run = 0;
    for (const [x, y] of core) {
      if (--run <= 0) {
        on = !on;
        run = 3 + Math.floor(random() * 10);
      }
      if (on) thick.push([x + px, y + py]);
    }
  }

  const forks: Cell[] = [];
  const angle = Math.atan2(y1 - y0, x1 - x0);
  for (let f = 0; f < (o.forks ?? 0) && path.length > 4; f++) {
    const at = path[1 + Math.floor(random() * (path.length * 0.8 - 1))]!;
    const a = angle + (random() < 0.5 ? -1 : 1) * (0.4 + random() * 0.7);
    const flen = Math.min(32, len * (0.08 + random() * 0.14));
    const fork = crackPath(at[0], at[1], at[0] + Math.cos(a) * flen, at[1] + Math.sin(a) * flen, Math.max(1.5, o.amp * 0.4), random);
    forks.push(...rasterize(fork));
  }
  return { core, thick, forks };
}
