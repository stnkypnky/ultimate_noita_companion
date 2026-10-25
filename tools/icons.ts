// Renders the app icons from the game's own wand sprite (needs the game installed). Run: npm run icons
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { findNoita } from './extract/paths.ts';
import { Wak } from './extract/wak.ts';

const root = join(import.meta.dirname, '..');
const out = join(root, 'public/icons');
await mkdir(out, { recursive: true });
const wak = new Wak(join(findNoita(), 'data/data.wak'));

type Px = { w: number; h: number; d: Uint32Array };
/** The scene is laid out on a 32×32 grid of game pixels, then scaled by whole pixels. */
const GRID = 32;

async function sprite(path: string): Promise<Px> {
  const { data, info } = await sharp(wak.bytes(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: new Uint32Array(data.buffer, data.byteOffset, info.width * info.height).slice() };
}

/** Scale2x (EPX): doubles pixel art while keeping diagonal edges clean. */
function scale2x(s: Px): Px {
  const w = s.w * 2, h = s.h * 2, d = new Uint32Array(w * h);
  const at = (x: number, y: number) => s.d[Math.min(s.h - 1, Math.max(0, y)) * s.w + Math.min(s.w - 1, Math.max(0, x))]!;
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), e = at(x, y + 1);
      d[2 * y * w + 2 * x] = c === a && c !== e && a !== b ? a : p;
      d[2 * y * w + 2 * x + 1] = a === b && a !== c && b !== e ? b : p;
      d[(2 * y + 1) * w + 2 * x] = e === c && e !== b && c !== a ? c : p;
      d[(2 * y + 1) * w + 2 * x + 1] = b === e && b !== a && e !== c ? e : p;
    }
  return { w, h, d };
}

/** RotSprite-style rotation: upscale 8× with Scale2x, rotate nearest-neighbour, sample back down, trim. */
function rotate(src: Px, deg: number): Px {
  const big = scale2x(scale2x(scale2x(src)));
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const n = Math.ceil(Math.hypot(src.w, src.h)) + 2;
  const d = new Uint32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (x - n / 2 + 0.5) * 8, dy = (y - n / 2 + 0.5) * 8;
      const sx = Math.floor(cos * dx + sin * dy + big.w / 2), sy = Math.floor(-sin * dx + cos * dy + big.h / 2);
      if (sx >= 0 && sy >= 0 && sx < big.w && sy < big.h) d[y * n + x] = big.d[sy * big.w + sx]!;
    }
  let x0 = n, y0 = n, x1 = 0, y1 = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (d[y * n + x]! >>> 24) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  const w = x1 - x0 + 1, h = y1 - y0 + 1, t = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) t.set(d.subarray((y + y0) * n + x0, (y + y0) * n + x1 + 1), y * w);
  return { w, h, d: t };
}

const rgba = (hex: string, a = 255) => {
  const v = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
};

// Scene: the ice-crystal wand aimed up-right, a spark bolt just leaving the tip.
const wand = rotate(await sprite('data/items_gfx/wand_good_2.png'), -45);
const scene: Px = { w: GRID, h: GRID, d: new Uint32Array(GRID * GRID) };
const wx = Math.round((GRID - wand.w) / 2) - 2, wy = Math.round((GRID - wand.h) / 2) + 2;
for (let y = 0; y < wand.h; y++)
  for (let x = 0; x < wand.w; x++) if (wand.d[y * wand.w + x]! >>> 24) scene.d[(y + wy) * GRID + x + wx] = wand.d[y * wand.w + x]!;
const tip = { x: wx + wand.w + 1, y: wy - 2 };
const spark: [number, number, string, number?][] = [
  [0, 0, '#ffffff'], [1, -1, '#ffffff'], [-1, 1, '#bdf3ff'], [-2, 2, '#6fd6ff', 200], [-3, 3, '#3f8fd8', 120],
  [1, 0, '#bdf3ff'], [0, -1, '#bdf3ff'], [2, -2, '#e8fbff', 230],
];
for (const [dx, dy, c, a] of spark) scene.d[(tip.y + dy) * GRID + tip.x + dx] = rgba(c, a);

async function art(k: number) {
  const buf = Buffer.from(scene.d.buffer);
  return sharp(buf, { raw: { width: GRID, height: GRID, channels: 4 } })
    .resize(GRID * k, GRID * k, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

/** Full-bleed icon: cave dark, a cool glow at the tip, a warm ember glow behind, a few ember pixels. */
async function icon(size: number, k: number, embers = true) {
  const off = (size - GRID * k) / 2;
  const gx = off + (tip.x + 0.5) * k, gy = off + (tip.y + 0.5) * k;
  const px = (x: number, y: number, c: string, o: number) =>
    `<rect x="${off + x * k}" y="${off + y * k}" width="${k / 2}" height="${k / 2}" fill="${c}" opacity="${o}"/>`;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <radialGradient id="v" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#1d1622"/><stop offset="1" stop-color="#07050a"/></radialGradient>
      <radialGradient id="c"><stop offset="0" stop-color="#6fd6ff" stop-opacity="0.55"/><stop offset="1" stop-color="#6fd6ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="w"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      <radialGradient id="e"><stop offset="0" stop-color="#ff7a1a" stop-opacity="0.22"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#v)"/>
    <circle cx="${size * 0.4}" cy="${size * 0.64}" r="${size * 0.45}" fill="url(#e)"/>
    <circle cx="${gx}" cy="${gy}" r="${k * 12}" fill="url(#c)"/>
    <circle cx="${gx}" cy="${gy}" r="${k * 4}" fill="url(#w)"/>
    ${embers ? [px(5, 25, '#ff7a1a', 1), px(4, 21, '#ffb347', 0.8), px(27, 22, '#ff7a1a', 0.6), px(23, 28, '#ffd27a', 0.7), px(4, 7, '#ff9a3c', 0.45), px(9, 3, '#ff7a1a', 0.35)].join('') : ''}
  </svg>`);
  return sharp(bg).composite([{ input: await art(k), left: off, top: off }]).png();
}

await (await icon(512, 16)).toFile(join(out, 'icon-512.png'));
await (await icon(192, 6)).toFile(join(out, 'icon-192.png'));
await (await icon(180, 5, true)).toFile(join(out, 'apple-touch-icon.png'));
// Maskable: art kept inside the 80% safe circle.
await (await icon(512, 12)).toFile(join(out, 'icon-maskable-512.png'));
// Favicons: one screen pixel per game pixel, so the sprite is exact.
await (await icon(64, 2, false)).toFile(join(out, 'favicon-64.png'));
await (await icon(32, 1, false)).toFile(join(out, 'favicon-32.png'));

console.log('icons written to public/icons');
