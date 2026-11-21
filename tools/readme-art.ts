// Draws the README's art (docs/readme/*.svg) from the game's own fonts, frames and sprites.
// GitHub shows README images through <img>, which keeps an SVG's CSS and SMIL animation but loads no
// fonts or files, so text becomes paths and every bitmap becomes pixel rectangles (or a data URI).
// Usage: npm run readme-art
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/readme');
const GAME = join(ROOT, 'public/game');

const need = (p: string) => {
  if (!existsSync(p)) throw new Error(`readme-art: missing ${p} (run npm run extract first)`);
  return p;
};

// ---------- Fonts ----------
/** Caps only: the game's headline font. */
const CAPS = opentype.loadSync(need(join(GAME, 'fonts/font_pixel_big.otf')));
/** Mixed case: the game's body font. */
const BODY = opentype.loadSync(need(join(GAME, 'fonts/font_pixel_noshadow.otf')));
const RUNES = opentype.loadSync(need(join(GAME, 'fonts/font_pixel_runes.otf')));

/** Text as an SVG path, `g` CSS px per game pixel (fonts are 8 game pixels to the em). */
const textPath = (font: opentype.Font, s: string, x: number, baseline: number, g: number) =>
  font.getPath(s, x, baseline, 8 * g, { kerning: false }).toPathData(1);
/** Drawn width, without the 1-pixel gap every glyph carries on its right. */
const textWidth = (font: opentype.Font, s: string, g: number) => font.getAdvanceWidth(s, 8 * g, { kerning: false }) - g;

/** Game-style text: the glyphs plus the game's one-pixel drop shadow. */
function text(font: opentype.Font, s: string, x: number, baseline: number, g: number, fill: string, opts: { anchor?: 'start' | 'middle' | 'end'; shadow?: string; cls?: string } = {}) {
  const w = textWidth(font, s, g);
  const left = opts.anchor === 'middle' ? Math.round(x - w / 2) : opts.anchor === 'end' ? x - w : x;
  const shadow = opts.shadow === 'none' ? '' : `<path d="${textPath(font, s, left + g, baseline + g, g)}" fill="${opts.shadow ?? '#000'}" fill-opacity=".73"/>`;
  return `<g${opts.cls ? ` class="${opts.cls}"` : ''}>${shadow}<path d="${textPath(font, s, left, baseline, g)}" fill="${fill}"/></g>`;
}

// ---------- Bitmaps ----------
type Bitmap = { w: number; h: number; data: Uint8Array };

async function load(file: string): Promise<Bitmap> {
  const { data, info } = await sharp(need(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data: new Uint8Array(data) };
}
const at = (b: Bitmap, x: number, y: number) => b.data.subarray((y * b.w + x) * 4, (y * b.w + x) * 4 + 4);

function crop(b: Bitmap, r: { x: number; y: number; w: number; h: number }): Bitmap {
  const out = new Uint8Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) out.set(b.data.subarray(((r.y + y) * b.w + r.x) * 4, ((r.y + y) * b.w + r.x + r.w) * 4), y * r.w * 4);
  return { w: r.w, h: r.h, data: out };
}

/** Resample a frame to w×h: `edge` pixels of each border are kept, the middle repeats (a 9-slice). */
function slice(b: Bitmap, w: number, h: number, ex: number, ey = ex): Bitmap {
  const map = (v: number, size: number, src: number, e: number) => (v < e ? v : v >= size - e ? src - (size - v) : e + ((v - e) % (src - 2 * e)));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out.set(at(b, map(x, w, b.w, ex), map(y, h, b.h, ey)), (y * w + x) * 4);
  return { w, h, data: out };
}

/**
 * A bitmap as crisp rectangles, `g` CSS px per pixel: runs of one colour per row, stacked down while the
 * row below repeats them. `skip` drops pixels (for a frame's see-through middle).
 */
function rects(b: Bitmap, ox: number, oy: number, g: number, skip?: (rgba: Uint8Array) => boolean) {
  type Open = { x: number; y: number; w: number; h: number; c: string };
  const done: Open[] = [];
  let open = new Map<string, Open>();
  for (let y = 0; y < b.h; y++) {
    const next = new Map<string, Open>();
    for (let x = 0; x < b.w; ) {
      const p = at(b, x, y);
      if (p[3]! < 8 || skip?.(p)) {
        x++;
        continue;
      }
      const c = `${p[0]},${p[1]},${p[2]},${p[3]}`;
      let end = x + 1;
      while (end < b.w && `${at(b, end, y).join(',')}` === c) end++;
      const key = `${x},${end - x},${c}`;
      const prev = open.get(key);
      if (prev) {
        prev.h++;
        next.set(key, prev);
        open.delete(key);
      } else next.set(key, { x, y, w: end - x, h: 1, c });
      x = end;
    }
    done.push(...open.values());
    open = next;
  }
  done.push(...open.values());
  return done
    .map(({ x, y, w, h, c }) => {
      const [r, gg, bb, a] = c.split(',').map(Number) as [number, number, number, number];
      const hex = `#${[r, gg, bb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      return `<rect x="${ox + x * g}" y="${oy + y * g}" width="${w * g}" height="${h * g}" fill="${hex}"${a < 255 ? ` fill-opacity="${(a / 255).toFixed(2)}"` : ''}/>`;
    })
    .join('');
}

const dataUri = async (file: string, darken = 1) => {
  const buf = await sharp(need(file)).modulate({ brightness: darken }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
};

// ---------- Icons ----------
type Box = { x: number; y: number; w: number; h: number };
const json = <T,>(name: string) => JSON.parse(readFileSync(need(join(GAME, 'data', name)), 'utf8')) as T;
const list = <T,>(v: T[] | Record<string, T>) => (Array.isArray(v) ? v : Object.values(v));
const iconOf = (file: string, id: string) => {
  const hit = list(json<{ id: string; icon: Box }[]>(file)).find((e) => e.id === id);
  if (!hit) throw new Error(`readme-art: no ${id} in ${file}`);
  return hit.icon;
};

/** The Run page's live crystal (src/ui/LiveCrystal.tsx), redrawn as a 16×16 bitmap. */
function crystal(): Bitmap {
  const rows: Record<number, [number, number]> = { 1: [7, 8], 2: [6, 9], 3: [5, 10], 4: [4, 11], 5: [4, 11], 6: [4, 11], 7: [4, 11], 8: [4, 11], 9: [4, 11], 10: [4, 11], 11: [4, 11], 12: [5, 10], 13: [6, 9], 14: [7, 8] };
  const glints = new Set(['6,4', '5,5', '5,6', '6,5', '7,2']);
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const data = new Uint8Array(16 * 16 * 4);
  for (const [row, [a, b]] of Object.entries(rows)) {
    const y = Number(row);
    for (let x = a; x <= b; x++) {
      const edge = x === a || x === b || y === 1 || y === 14;
      const fill = edge ? '#173d14' : glints.has(`${x},${y}`) ? '#e2ffd2' : (x === 7 || x === 8) && y >= 6 && y <= 9 ? '#b9f79a' : x < 8 ? '#8fe86a' : '#4fa63b';
      data.set([...hex(fill), 255], (y * 16 + x) * 4);
    }
  }
  return { w: 16, h: 16, data };
}

// ---------- Shared SVG bits ----------
const GOLD = '#eda949';
const INK = '#f3ede6';
const MUTED = '#b9aa9c';
const BG = '#0a0807';

/** Seeded random, so re-running the script gives the same embers. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rising embers like the app's splash: square pixels cooling from yellow to red. */
function embers(n: number, w: number, h: number, seed: number, size: number) {
  const r = rng(seed);
  const css: string[] = [];
  const els: string[] = [];
  for (let i = 0; i < n; i++) {
    const dur = 5 + r() * 7;
    const delay = -r() * dur;
    const drift = Math.round((r() - 0.5) * 80);
    const s = size * (1 + Math.floor(r() * 2));
    css.push(`.e${i}{animation:rise${i} ${dur.toFixed(2)}s linear ${delay.toFixed(2)}s infinite}@keyframes rise${i}{0%{transform:translate(0,0);opacity:0;fill:#ffd27a}15%{opacity:1}55%{fill:#ff9a2a}100%{transform:translate(${drift}px,${-h * (0.6 + r() * 0.5)}px);opacity:0;fill:#e2441a}}`);
    els.push(`<rect class="ember e${i}" x="${Math.round(r() * w)}" y="${Math.round(h - r() * h * 0.25)}" width="${s}" height="${s}" fill="#ffb347" opacity=".8"/>`);
  }
  return { css: `@media (prefers-reduced-motion: no-preference){${css.join('')}}@media (prefers-reduced-motion: reduce){.ember{display:none}}`, els: els.join('') };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const svg = (w: number, h: number, label: string, body: string, css = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><title>${esc(label)}</title>${css ? `<style>${css}</style>` : ''}${body}</svg>\n`;

const write = (name: string, content: string) => {
  writeFileSync(join(OUT, name), content);
  console.log(`${name.padEnd(24)} ${(content.length / 1024).toFixed(1)} KB`);
};

// ---------- Main ----------
mkdirSync(OUT, { recursive: true });
const panel = await load(join(GAME, 'ui/9piece0.png'));
const slot = await load(join(GAME, 'ui/full_inventory_box.png'));
const msg = await load(join(GAME, 'ui/3piece_important_msg.png'));
const wand = await load(join(ROOT, 'public/icons/wand.png'));
const atlas = {
  spells: await load(join(GAME, 'sprites/spells.png')),
  perks: await load(join(GAME, 'sprites/perks.png')),
  enemies: await load(join(GAME, 'sprites/enemies.png')),
  items: await load(join(GAME, 'sprites/items.png')),
};
const icon = (kind: keyof typeof atlas, id: string) => crop(atlas[kind], iconOf(`${kind}.json`, id));
/** The 9-piece frame's see-through black middle. */
const frameMiddle = (p: Uint8Array) => p[0] === 0 && p[1] === 0 && p[2] === 0;
/** A panel in the game's gold frame, solid inside so it reads the same on GitHub's light and dark themes. */
const framed = (w: number, h: number, g: number) =>
  `<rect x="${g}" y="${g}" width="${w - 2 * g}" height="${h - 2 * g}" fill="${BG}"/>${rects(slice(panel, w / g, h / g, 2), 0, 0, g, frameMiddle)}`;

// ----- Banner -----
{
  const W = 1280;
  const H = 400;
  const G = 4;
  const L = 24; // game px per letter pixel for UNC
  const cave = await dataUri(join(GAME, 'backgrounds/background_coalmine.png'), 0.55);
  const em = embers(48, W, H, 7, G);

  // UNC, one path per letter so each can flash when the bolt lands.
  const word = 'UNC';
  const wordW = textWidth(CAPS, word, L);
  const baseline = 214;
  let cx = Math.round(W / 2 - wordW / 2);
  const letters: { d: string; shadow: string; hit: { x: number; y: number } }[] = [];
  for (const ch of word) {
    const w = textWidth(CAPS, ch, L);
    letters.push({ d: textPath(CAPS, ch, cx, baseline, L), shadow: textPath(CAPS, ch, cx + L / 2, baseline + L / 2, L), hit: { x: cx + w / 2, y: baseline - 3.5 * L } });
    cx += CAPS.getAdvanceWidth(ch, 8 * L);
  }

  // The wand, held low on the left and tipped up; bolts lob out of its tip in arcs, like the splash screen.
  const WG = 7;
  const grip = { x: 150, y: 318 };
  const angle = -32;
  const rad = (angle * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const muzzle = { x: grip.x + dir.x * 15 * WG, y: grip.y + dir.y * 15 * WG };
  const LOOP = 5;
  const fires = [0.35, 0.95, 1.55];
  const FLIGHT = 0.42;
  const kt = (t: number) => (t / LOOP).toFixed(4);
  const r = rng(3);

  const bolts = letters
    .map((l, i) => {
      const t0 = fires[i]!;
      const t1 = t0 + FLIGHT;
      const reach = Math.hypot(l.hit.x - muzzle.x, l.hit.y - muzzle.y);
      const c = { x: muzzle.x + dir.x * reach * 0.62, y: muzzle.y + dir.y * reach * 0.62 };
      const path = `M${muzzle.x.toFixed(1)},${muzzle.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${l.hit.x.toFixed(1)},${l.hit.y.toFixed(1)}`;
      const motion = `<animateMotion dur="${LOOP}s" repeatCount="indefinite" path="${path}" keyPoints="0;0;1;1" keyTimes="0;${kt(t0)};${kt(t1)};1" calcMode="linear"/>`;
      const show = `<animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;${kt(t0 - 0.001)};${kt(t0)};${kt(t1)};${kt(t1 + 0.001)};1" calcMode="discrete"/>`;
      // A short trail of sparks: copies that run a few frames behind.
      const trail = [0.03, 0.06, 0.09]
        .map((lag, k) => {
          const a = t0 + lag;
          const b = t1 + lag;
          return `<rect x="-${G / 2}" y="-${G / 2}" width="${G}" height="${G}" fill="${['#bdf3ff', '#6fd6ff', '#3f8fd8'][k]}" opacity="0"><animateMotion dur="${LOOP}s" repeatCount="indefinite" path="${path}" keyPoints="0;0;1;1" keyTimes="0;${kt(a)};${kt(b)};1" calcMode="linear"/><animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" values="0;0;${0.9 - k * 0.25};${0.9 - k * 0.25};0;0" keyTimes="0;${kt(a - 0.001)};${kt(a)};${kt(b)};${kt(b + 0.001)};1" calcMode="discrete"/></rect>`;
        })
        .join('');
      const bolt = `<g opacity="0">${motion}${show}<circle r="14" fill="#6fd6ff" opacity=".45" filter="url(#blur)"/><rect x="-${G}" y="-${G}" width="${G * 2}" height="${G * 2}" fill="#fff"/></g>`;
      // Impact: a spark burst, a ring of light, and the letter flashing white-hot.
      const sparks = Array.from({ length: 12 }, () => {
        const a = r() * Math.PI * 2;
        const v = 30 + r() * 60;
        const fall = 20 + r() * 30;
        const color = ['#ffffff', '#bdf3ff', '#6fd6ff', '#6fd6ff', '#ffd27a'][Math.floor(r() * 5)];
        const tx = (Math.cos(a) * v).toFixed(0);
        const ty = (Math.sin(a) * v + fall).toFixed(0);
        return `<rect x="${(l.hit.x - G / 2).toFixed(0)}" y="${(l.hit.y - G / 2).toFixed(0)}" width="${G}" height="${G}" fill="${color}" opacity="0"><animateTransform attributeName="transform" type="translate" dur="${LOOP}s" repeatCount="indefinite" values="0 0;0 0;${tx} ${ty};${tx} ${ty}" keyTimes="0;${kt(t1)};${kt(t1 + 0.6)};1"/><animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" values="0;0;1;0;0" keyTimes="0;${kt(t1)};${kt(t1 + 0.01)};${kt(t1 + 0.6)};1"/></rect>`;
      }).join('');
      const ring = `<circle cx="${l.hit.x.toFixed(0)}" cy="${l.hit.y.toFixed(0)}" r="10" fill="#6fd6ff" opacity="0" filter="url(#blur)"><animate attributeName="r" dur="${LOOP}s" repeatCount="indefinite" values="10;10;70;70" keyTimes="0;${kt(t1)};${kt(t1 + 0.35)};1"/><animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" values="0;0;.8;0;0" keyTimes="0;${kt(t1)};${kt(t1 + 0.02)};${kt(t1 + 0.35)};1"/></circle>`;
      const flash = `<path d="${l.d}" fill="#fff" opacity="0" filter="url(#glow)"><animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" values="0;0;1;0;0" keyTimes="0;${kt(t1)};${kt(t1 + 0.02)};${kt(t1 + 0.55)};1"/></path>`;
      const muzzleFlash = `<circle cx="${muzzle.x.toFixed(0)}" cy="${muzzle.y.toFixed(0)}" r="16" fill="#6fd6ff" opacity="0" filter="url(#blur)"><animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" values="0;0;.9;0;0" keyTimes="0;${kt(t0)};${kt(t0 + 0.01)};${kt(t0 + 0.15)};1"/></circle>`;
      return { trail, bolt, sparks, ring, flash, muzzleFlash };
    });

  // The wand recoils a little on every cast.
  const recoil = fires
    .flatMap((t) => [`${kt(t)}`, `${kt(t + 0.01)}`, `${kt(t + 0.14)}`])
    .join(';');
  const back = `${(-dir.x * 2 * WG).toFixed(1)} ${(-dir.y * 2 * WG).toFixed(1)}`;
  const recoilValues = fires.flatMap(() => ['0 0', back, '0 0']).join(';');
  const wandEl = `<g><animateTransform attributeName="transform" type="translate" dur="${LOOP}s" repeatCount="indefinite" values="0 0;${recoilValues};0 0" keyTimes="0;${recoil};1"/><g transform="translate(${grip.x} ${grip.y}) rotate(${angle}) translate(${-2 * WG} ${-4.5 * WG})">${rects(wand, 0, 0, WG)}</g></g>`;

  // Subtitle in the game's orange message box, and the motto in runes.
  const SG = 3;
  const sub = 'ULTIMATE NOITA COMPANION';
  const subW = textWidth(CAPS, sub, SG);
  const boxW = Math.ceil(subW / SG) + 2 * 12 + 4;
  const box = slice(msg, boxW, 24, 12, 0);
  const boxX = Math.round(W / 2 - (boxW * SG) / 2);
  const boxY = 252;
  const motto = 'wands  runs  worlds  no spoilers';

  const css = `${em.css}
.word{filter:url(#lit)}
@media (prefers-reduced-motion: reduce){.fx{display:none}}`;
  const body = `<defs>
<pattern id="cave" width="1024" height="512" patternUnits="userSpaceOnUse"><image href="${cave}" width="1024" height="512" style="image-rendering:pixelated"/></pattern>
<radialGradient id="vig" cx="50%" cy="45%" r="70%"><stop offset="40%" stop-color="${BG}" stop-opacity="0"/><stop offset="100%" stop-color="${BG}" stop-opacity=".95"/></radialGradient>
<linearGradient id="goldfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe6bd"/><stop offset=".22" stop-color="#ffd48a"/><stop offset=".22" stop-color="${GOLD}"/><stop offset=".78" stop-color="${GOLD}"/><stop offset=".78" stop-color="#d27d1f"/><stop offset="1" stop-color="#d27d1f"/></linearGradient>
<filter id="blur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="10" result="b"/><feFlood flood-color="#6fd6ff"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="lit" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="14" result="b"/><feFlood flood-color="#f89000" flood-opacity=".55"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="${W}" height="${H}" fill="${BG}"/>
<rect width="${W}" height="${H}" fill="url(#cave)" opacity=".8"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
${em.els}
<g class="word">${letters.map((l) => `<path d="${l.shadow}" fill="#2a1206"/>`).join('')}${letters.map((l) => `<path d="${l.d}" fill="url(#goldfill)"/>`).join('')}</g>
<g class="fx">${bolts.map((b) => b.flash).join('')}</g>
${rects(box, boxX, boxY, SG)}
${text(CAPS, sub, W / 2, boxY + 12 * SG + 3 * SG, SG, '#ffcf4a', { anchor: 'middle' })}
${text(RUNES, motto, W / 2, 360, 2, GOLD, { anchor: 'middle', shadow: 'none' }).replace('<g>', '<g opacity=".6">')}
${wandEl}
<g class="fx">${bolts.map((b) => b.muzzleFlash + b.trail + b.bolt + b.ring + b.sparks).join('')}</g>
${rects(slice(panel, W / G, H / G, 2), 0, 0, G, frameMiddle)}`;
  write('banner.svg', svg(W, H, 'UNC, the Ultimate Noita Companion: a wand fires spark bolts that light up the letters U N C', body, css));
}

// ----- Section headers -----
type Header = { file: string; title: string; tagline: string; icon: Bitmap };
const headers: Header[] = [
  { file: 'h-wand.svg', title: 'Wand Builder', tagline: "Nolla's own gun.lua, running in your browser", icon: wand },
  { file: 'h-range.svg', title: 'Test Range', tagline: 'Fire it for real: falling sand, fire, blood and bad ideas', icon: icon('spells', 'BOMB') },
  { file: 'h-run.svg', title: 'Live Run', tagline: 'Your game, mirrored on your phone while you play', icon: crystal() },
  { file: 'h-map.svg', title: 'World Map & Seed', tagline: 'Your seed, laid out cave by cave', icon: icon('perks', 'MAP') },
  { file: 'h-bestiary.svg', title: 'Bestiary', tagline: 'Know what bit you, and how to bite back', icon: icon('enemies', 'zombie_weak') },
  { file: 'h-lore.svg', title: 'Spells Perks Items', tagline: 'Every number straight from the game files', icon: icon('spells', 'LIGHT_BULLET') },
  { file: 'h-materials.svg', title: 'Materials & Alchemy', tagline: 'What it is, where it is, what it does to you', icon: icon('items', 'potion') },
  { file: 'h-spoilers.svg', title: 'No Spoilers', tagline: 'Your save decides what UNC shows', icon: icon('perks', 'REMOVE_FOG_OF_WAR') },
  { file: 'h-sync.svg', title: 'Every Device', tagline: 'Phone, tablet and PC, kept in step', icon: icon('spells', 'SWAPPER_PROJECTILE') },
  { file: 'h-start.svg', title: 'Get Started', tagline: 'Three steps, no gold needed', icon: icon('items', 'goldnugget') },
  { file: 'h-dev.svg', title: 'Development', tagline: 'Dig into the source', icon: icon('spells', 'DIGGER') },
];
for (const h of headers) {
  const W = 880;
  const H = 96;
  const G = 4;
  const sx = 2 * G;
  const sy = 2 * G;
  const ix = sx + 2 * G + Math.round(((16 - h.icon.w) / 2) * G);
  const iy = sy + 2 * G + Math.round(((16 - h.icon.h) / 2) * G);
  const tx = sx + 20 * G + 6 * G;
  const body = `${framed(W, H, G)}
${rects(slot, sx, sy, G)}
${rects(h.icon, ix, iy, G)}
${text(CAPS, h.title.toUpperCase(), tx, 50, G, GOLD)}
${text(BODY, h.tagline, tx, 78, 2, MUTED)}
<g opacity=".28">${text(RUNES, h.title.toLowerCase(), W - 6 * G, 54, 3, GOLD, { anchor: 'end', shadow: 'none' })}</g>`;
  write(h.file, svg(W, H, h.title, body));
}

// ----- "Choose a perk": three cards that open the app -----
type Card = { file: string; title: string; lines: [string, string]; icon: Bitmap; glow: string };
const cards: Card[] = [
  { file: 'perk-wand.svg', title: 'Wand Builder', lines: ['Build it, cast it,', 'watch it explode'], icon: wand, glow: '#6fd6ff' },
  { file: 'perk-map.svg', title: 'World Map', lines: ['Every cave of', 'your seed'], icon: icon('perks', 'MAP'), glow: GOLD },
  { file: 'perk-run.svg', title: 'Live Run', lines: ['Your run, live', 'on your phone'], icon: crystal(), glow: '#7bd65c' },
];
cards.forEach((c, i) => {
  const W = 280;
  const H = 300;
  const G = 4;
  const IG = 6;
  const iw = c.icon.w * IG;
  const ih = c.icon.h * IG;
  const ix = Math.round(W / 2 - iw / 2);
  const iy = 78 - Math.round(ih / 2) + 24;
  const css = `@media (prefers-reduced-motion: no-preference){.bob{animation:bob 3.2s ease-in-out ${(-i * 1.1).toFixed(1)}s infinite}.halo{animation:halo 3.2s ease-in-out ${(-i * 1.1).toFixed(1)}s infinite}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes halo{0%,100%{opacity:.5}50%{opacity:.85}}`;
  const body = `<defs><radialGradient id="h"><stop offset="0" stop-color="${c.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient></defs>
${framed(W, H, G)}
${text(CAPS, 'PERK', W / 2, 32, 2, MUTED, { anchor: 'middle' })}
<ellipse class="halo" cx="${W / 2}" cy="${iy + ih / 2}" rx="96" ry="80" fill="url(#h)" opacity=".6"/>
<g class="bob">${rects(c.icon, ix, iy, IG)}</g>
<rect x="${W / 2 - 44}" y="190" width="88" height="${G}" fill="${c.glow}" opacity=".35"/>
${text(CAPS, c.title.toUpperCase(), W / 2, 226, 3, GOLD, { anchor: 'middle' })}
${text(BODY, c.lines[0], W / 2, 254, 2, INK, { anchor: 'middle' })}
${text(BODY, c.lines[1], W / 2, 276, 2, INK, { anchor: 'middle' })}`;
  write(c.file, svg(W, H, `Perk: ${c.title}. ${c.lines.join(' ')}`, body, css));
});

// ----- Rune divider -----
{
  const W = 880;
  const H = 40;
  const word = 'unc';
  const w = textWidth(RUNES, word, 3);
  const body = `<defs><linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="${GOLD}" stop-opacity="0"/><stop offset="1" stop-color="${GOLD}" stop-opacity=".7"/></linearGradient><linearGradient id="r" x1="1" x2="0"><stop offset="0" stop-color="${GOLD}" stop-opacity="0"/><stop offset="1" stop-color="${GOLD}" stop-opacity=".7"/></linearGradient></defs>
<rect x="40" y="19" width="${W / 2 - w / 2 - 64}" height="2" fill="url(#l)"/>
<rect x="${W / 2 + w / 2 + 24}" y="19" width="${W / 2 - w / 2 - 64}" height="2" fill="url(#r)"/>
${text(RUNES, word, W / 2, 29, 3, GOLD, { anchor: 'middle', shadow: 'none' })}`;
  write('divider.svg', svg(W, H, 'divider', body));
}

// ----- Footer: the death screen -----
{
  const W = 880;
  const H = 300;
  const G = 4;
  const em = embers(18, W, H, 11, 4);
  const rows: [string, string][] = [
    ['Killed by', 'a README that went on a bit'],
    ['Depth', 'The Credits'],
    ['Gold', '0  (UNC is free)'],
    ['Enemies slain', '0  (the scroll wheel does not count)'],
  ];
  const left = 220;
  const body = `${framed(W, H, G)}
${em.els}
${text(CAPS, 'YOU HAVE DIED', W / 2, 74, 5, '#e2445c', { anchor: 'middle' })}
${rows.map(([k, v], i) => `${text(BODY, k, left, 128 + i * 30, 2, MUTED)}${text(BODY, v, left + 170, 128 + i * 30, 2, INK)}`).join('\n')}
${(() => {
  const label = 'TRY AGAIN: OPEN UNC';
  const bw = Math.ceil(textWidth(CAPS, label, 2) / 2) + 2 * 12 + 4;
  const bx = Math.round(W / 2 - bw);
  return `${rects(slice(msg, bw, 24, 12, 0), bx, 228, 2)}${text(CAPS, label, W / 2, 228 + 12 * 2 + 3 * 2, 2, '#ffcf4a', { anchor: 'middle' })}`;
})()}`;
  write('footer.svg', svg(W, H, 'You have died. Killed by a README that went on a bit. Try again: open UNC.', body, em.css));
}
