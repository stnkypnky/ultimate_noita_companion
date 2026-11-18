// The "live" indicator: a small pixel-art crystal that glows green while a game is running, like the
// light on a console, Noita style. Takes Lucide's {size, className} so it can stand in as a nav icon.

// One row per line of a 16×16 grid: [first column, last column]. A gem with a pointed top and bottom.
const ROWS: Record<number, [number, number]> = {
  1: [7, 8],
  2: [6, 9],
  3: [5, 10],
  4: [4, 11],
  5: [4, 11],
  6: [4, 11],
  7: [4, 11],
  8: [4, 11],
  9: [4, 11],
  10: [4, 11],
  11: [4, 11],
  12: [5, 10],
  13: [6, 9],
  14: [7, 8],
};
/** Pale glints on the upper-left facet. */
const GLINTS = new Set(['6,4', '5,5', '5,6', '6,5', '7,2']);

const OUTLINE = '#173d14';
const LIGHT = '#8fe86a';
const DARK = '#4fa63b';
const GLINT = '#e2ffd2';
const CORE = '#b9f79a';

const PIXELS: { x: number; y: number; fill: string }[] = [];
for (const [row, [a, b]] of Object.entries(ROWS)) {
  const y = Number(row);
  for (let x = a; x <= b; x++) {
    const edge = x === a || x === b || y === 1 || y === 14;
    const fill = edge ? OUTLINE : GLINTS.has(`${x},${y}`) ? GLINT : (x === 7 || x === 8) && y >= 6 && y <= 9 ? CORE : x < 8 ? LIGHT : DARK;
    PIXELS.push({ x, y, fill });
  }
}

export function LiveCrystal({ size = 20, className = '', off }: { size?: number; className?: string; off?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden
      className={`live-crystal ${className}`}
      data-off={off || undefined}
    >
      {PIXELS.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={p.fill} />
      ))}
    </svg>
  );
}
