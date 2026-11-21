// How the game lays out a biome's caves: Sean Barrett's herringbone Wang tiles (stb_herringbone_wang_tile, public
// domain) over the biome's wang_template_file, seeded from the world seed, retried until a path runs from top to
// bottom, then Noita's fix-ups (main-path shaft, "c0ffee" random blocks, RandomMaterials colours).
//
// Ported from TwoAbove/noita-tools (MIT, src/services/SeedInfo/noita_random/src/wang/wang.cpp, stb_hbwang.h,
// search.cpp, pix.cpp), which reverse-engineered the engine's version and checks it against maps from the game.
// Output: one pixel per 10×10 world pixels, in the template's colours (white = the biome's rock, black = open cave).

/** The engine's Park–Miller generator with its world-seed helpers (noita_random.cpp NollaPrng). */
class Prng {
  constructor(public seed = 0) {}
  static of(seed: number) {
    const r = new Prng(seed);
    r.next();
    return r;
  }
  fromWorldSeed(s: number) {
    this.seed = s;
    if (2147483647.0 <= this.seed) this.seed = s * 0.5;
  }
  next() {
    const s = Math.trunc(this.seed) | 0;
    let v = (Math.imul(0x41a7, s) - Math.imul(0x7fffffff, Math.trunc(s / 0x1f31d))) | 0;
    if (v <= 0) v = (v + 0x7fffffff) | 0;
    this.seed = v;
    return v / 0x7fffffff;
  }
  nextU() {
    this.next();
    return Math.trunc(this.seed * 4.656612875e-10 * 2147483645.0) >>> 0;
  }
  random(a: number, b: number) {
    return a + Math.trunc((b + 1 - a) * this.next());
  }
}

/** GetRNG: the area's generator, stepped by width and seed. */
function areaRng(worldSeed: number, width: number) {
  const r = new Prng();
  r.fromWorldSeed(worldSeed);
  r.next();
  // width + seed + 11·(width / −11) − 12·(seed / 12), in the C++'s integer arithmetic: width mod 11 + seed mod 12.
  let iters = (width % 11) + (worldSeed % 12);
  while (iters > 0) {
    r.next();
    iters--;
  }
  return r;
}

// ---------------------------------------------------------------- herringbone tiles (stb_hbwang.h) ----------------

type Tile = { a: number; b: number; c: number; d: number; e: number; f: number; pixels: Uint8Array };
export type Tileset = { isCorner: boolean; numColor: number[]; side: number; h: Tile[]; v: Tile[] };

/** Read a stbhw template image (RGB) into its tiles; null if it isn't one. */
export function buildTileset(rgb: Uint8Array, w: number, h: number): Tileset | null {
  const header: number[] = [];
  for (let i = 0; i < 9; i++) header.push((rgb[w * 3 - 1 - i]! ^ (i * 55)) & 0xff);
  const corner = header[7] === 0xc0;
  const numColor = [0, 0, 0, 0, 0, 0];
  let varyX: number, varyY: number, side: number;
  if (corner) {
    for (let i = 0; i < 4; i++) numColor[i] = header[i]!;
    varyX = header[4]!;
    varyY = header[5]!;
    side = header[6]!;
  } else {
    for (let i = 0; i < 6; i++) numColor[i] = header[i]!;
    varyX = header[6]!;
    varyY = header[7]!;
    side = header[8]!;
  }
  if (varyX > 64 || varyY > 64 || side === 0 || numColor.slice(0, 4).some((n) => n > 32)) return null;
  const ts: Tileset = { isCorner: corner, numColor, side, h: [], v: [] };
  const stride = w * 3;
  const hRect = (x: number, y: number, a: number, b: number, c: number, d: number, e: number, f: number) => {
    const px = new Uint8Array(3 * side * 2 * side);
    x++;
    y++;
    for (let j = 0; j < side; j++) for (let i = 0; i < side * 2; i++) for (let k = 0; k < 3; k++) px[j * 3 * side * 2 + i * 3 + k] = rgb[(y + j) * stride + (x + i) * 3 + k]!;
    ts.h.push({ a, b, c, d, e, f, pixels: px });
  };
  const vRect = (x: number, y: number, a: number, b: number, c: number, d: number, e: number, f: number) => {
    const px = new Uint8Array(3 * side * 2 * side);
    x++;
    y++;
    for (let j = 0; j < side * 2; j++) for (let i = 0; i < side; i++) for (let k = 0; k < 3; k++) px[j * 3 * side + i * 3 + k] = rgb[(y + j) * stride + (x + i) * 3 + k]!;
    ts.v.push({ a, b, c, d, e, f, pixels: px });
  };
  const row = (rect: typeof hRect, step: number, x: number, y: number, r: [number, number][], variants: number) => {
    for (let vv = 0; vv < variants; vv++)
      for (let f = r[5]![0]; f <= r[5]![1]; f++)
        for (let e = r[4]![0]; e <= r[4]![1]; e++)
          for (let d = r[3]![0]; d <= r[3]![1]; d++)
            for (let c = r[2]![0]; c <= r[2]![1]; c++)
              for (let b = r[1]![0]; b <= r[1]![1]; b++)
                for (let a = r[0]![0]; a <= r[0]![1]; a++) {
                  rect(x, y, a, b, c, d, e, f);
                  x += step;
                }
  };
  const n = numColor;
  let y = 2;
  if (corner) {
    for (let k = 0; k < n[2]!; k++)
      for (let j = 0; j < n[1]!; j++)
        for (let i = 0; i < n[0]!; i++)
          for (let q = 0; q < varyY; q++) {
            row(hRect, 2 * side + 3, 0, y, [[0, n[1]! - 1], [0, n[2]! - 1], [0, n[3]! - 1], [i, i], [j, j], [k, k]], varyX);
            y += side + 3;
          }
    y += 2;
    for (let k = 0; k < n[3]!; k++)
      for (let j = 0; j < n[0]!; j++)
        for (let i = 0; i < n[1]!; i++)
          for (let q = 0; q < varyX; q++) {
            row(vRect, side + 3, 0, y, [[0, n[0]! - 1], [0, n[3]! - 1], [0, n[2]! - 1], [i, i], [j, j], [k, k]], varyY);
            y += side * 2 + 3;
          }
  } else {
    for (let k = 0; k < n[3]!; k++)
      for (let j = 0; j < n[4]!; j++)
        for (let i = 0; i < n[2]!; i++)
          for (let q = 0; q < varyY; q++) {
            row(hRect, 2 * side + 3, 0, y, [[0, n[2]! - 1], [k, k], [0, n[1]! - 1], [j, j], [0, n[0]! - 1], [i, i]], varyX);
            y += side + 3;
          }
    y += 2;
    for (let k = 0; k < n[3]!; k++)
      for (let j = 0; j < n[4]!; j++)
        for (let i = 0; i < n[5]!; i++)
          for (let q = 0; q < varyX; q++) {
            row(vRect, side + 3, 0, y, [[0, n[0]! - 1], [i, i], [0, n[1]! - 1], [j, j], [0, n[5]! - 1], [k, k]], varyY);
            y += side * 2 + 3;
          }
  }
  if (y > h) return null;
  return ts;
}

// The generator's colour grids are globals that corner mode never fully clears: what one map leaves in them can be
// read by the next, in the game as here, so they live as long as the module.
// Row lengths as declared in C (c_color[MAX+6][MAX+6], v_color[MAX+6][MAX+5], h_color[MAX+5][MAX+6]): the generator
// indexes one column left of a row, which in C lands at the end of the row above, so the strides must match.
const MAX = 100;
const GW = MAX + 6;
const VW = MAX + 5;
const cColor = new Int8Array((MAX + 6) * GW);
const vColor = new Int8Array((MAX + 6) * VW);
const hColor = new Int8Array((MAX + 5) * GW);

type Ref = [Int8Array, number];

function chooseTile(list: Tile[], refs: Ref[], rand: () => number): Tile | null {
  let m = 1 << 30;
  for (let pass = 0; pass < 2; pass++) {
    let n = 0;
    for (const t of list) {
      const want = [t.a, t.b, t.c, t.d, t.e, t.f];
      let ok = true;
      for (let k = 0; k < 6; k++) {
        const v = refs[k]![0][refs[k]![1]]!;
        if (v >= 0 && v !== want[k]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      n++;
      if (n > m) {
        for (let k = 0; k < 6; k++) refs[k]![0][refs[k]![1]] = want[k]!;
        return t;
      }
    }
    if (n === 0) return null;
    m = rand() % n;
  }
  return null;
}

/** stbhw_generate_image: a w×h RGB map from the tileset; null when it can't (too big, or no fitting tile). */
export function generateImage(ts: Tileset, w: number, h: number, rand: () => number): Uint8Array | null {
  const side = ts.side;
  const xmax = Math.trunc(w / side) + 6;
  const ymax = Math.trunc(h / side) + 6;
  if (xmax > MAX + 6 || ymax > MAX + 6) return null;
  const out = new Uint8Array(w * h * 3);
  const draw = (t: Tile, x: number, y: number, tw: number, th: number) => {
    for (let j = 0; j < th; j++) {
      if (y + j < 0 || y + j >= h) continue;
      for (let i = 0; i < tw; i++) {
        if (x + i < 0 || x + i >= w) continue;
        const s = (j * tw + i) * 3;
        const d = ((y + j) * w + x + i) * 3;
        out[d] = t.pixels[s]!;
        out[d + 1] = t.pixels[s + 1]!;
        out[d + 2] = t.pixels[s + 2]!;
      }
    }
  };
  const C = (j: number, i: number): Ref => [cColor, j * GW + i];
  const H = (j: number, i: number): Ref => [hColor, j * GW + i];
  const V = (j: number, i: number): Ref => [vColor, j * VW + i];
  if (ts.isCorner) {
    const cc = ts.numColor;
    for (let j = 0; j < ymax; j++) for (let i = 0; i < xmax; i++) cColor[j * GW + i] = rand() % cc[(i - j + 1) & 3]!;
    const match = (x: number, y: number) => cColor[y * GW + x] === cColor[(y + 1) * GW + x + 1];
    const change = (old: number, n: number) => (old + 1 + (rand() % (n - 1))) % n;
    for (let j = 0; j < ymax - 3; j++) {
      for (let i = 0; i < xmax - 3; i++) {
        if (match(i, j) && match(i, j + 1) && match(i, j + 2) && match(i + 1, j) && match(i + 1, j + 1) && match(i + 1, j + 2)) {
          const p = (i + 1 - (j + 1) + 1) & 3;
          if (cc[p]! > 1) cColor[(j + 1) * GW + i + 1] = change(cColor[(j + 1) * GW + i + 1]!, cc[p]!);
        }
        if (match(i, j) && match(i + 1, j) && match(i + 2, j) && match(i, j + 1) && match(i + 1, j + 1) && match(i + 2, j + 1)) {
          const p = (i + 2 - (j + 1) + 1) & 3;
          if (cc[p]! > 1) cColor[(j + 1) * GW + i + 2] = change(cColor[(j + 1) * GW + i + 2]!, cc[p]!);
        }
      }
    }
  } else {
    vColor.fill(-1);
    hColor.fill(-1);
  }
  let ypos = -side;
  for (let j = -1; ypos < h; j++) {
    const phase = j & 3;
    for (let i = phase === 0 ? 0 : phase - 4; ; i += 4) {
      let xpos = i * side;
      if (xpos >= w) break;
      if (xpos + side * 2 >= 0 && ypos >= 0) {
        const refs = ts.isCorner
          ? [C(j + 2, i + 2), C(j + 2, i + 3), C(j + 2, i + 4), C(j + 3, i + 2), C(j + 3, i + 3), C(j + 3, i + 4)]
          : [H(j + 2, i + 2), H(j + 2, i + 3), V(j + 2, i + 2), V(j + 2, i + 4), H(j + 3, i + 2), H(j + 3, i + 3)];
        const t = chooseTile(ts.h, refs, rand);
        if (!t) return null;
        draw(t, xpos, ypos, side * 2, side);
      }
      xpos += side * 3;
      if (xpos < w) {
        const refs = ts.isCorner
          ? [C(j + 2, i + 5), C(j + 3, i + 5), C(j + 4, i + 5), C(j + 2, i + 6), C(j + 3, i + 6), C(j + 4, i + 6)]
          : [H(j + 2, i + 5), V(j + 2, i + 5), V(j + 2, i + 6), V(j + 3, i + 5), V(j + 3, i + 6), H(j + 4, i + 5)];
        const t = chooseTile(ts.v, refs, rand);
        if (!t) return null;
        draw(t, xpos, ypos, side, side * 2);
      }
    }
    ypos += side;
  }
  return out;
}

// ---------------------------------------------------------------- Noita's fix-ups (wang.cpp MapGen) ---------------

const BLACK = 0x000000;
const WHITE = 0xffffff;
const PURPLE = 0x7f007f;
const COFFEE = 0xc0ffee;
const MINT = 0xcff7c8;
const HELL_GREEN = 0x8aff80;
const NO_PARENT = -1;
/** Room markers whose rooms are walled off while the path is checked (load_pixel_scene*, gunpowder pools, oil tank). */
const BLOCKED = new Set([0x00ac6e, 0x70d79e, 0x70d79f, 0x70d7a1, 0x7868ff, 0xc35700, 0xff0080, 0xff00ff, 0xff0aff]);
const PATH_MIN_X = 159;
const PATH_MAX_X = 223;

const get = (m: Uint8Array, w: number, x: number, y: number) => {
  const p = (y * w + x) * 3;
  return (m[p]! << 16) | (m[p + 1]! << 8) | m[p + 2]!;
};
const set = (m: Uint8Array, w: number, x: number, y: number, c: number) => {
  const p = (y * w + x) * 3;
  m[p] = (c >> 16) & 0xff;
  m[p + 1] = (c >> 8) & 0xff;
  m[p + 2] = c & 0xff;
};
const fill = (m: Uint8Array, w: number, x1: number, x2: number, y1: number, y2: number, c: number) => {
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) set(m, w, x, y, c);
};
const grey = (c: number, limit: number) => {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return r <= limit && r === g && g === b && c !== BLACK && c !== WHITE;
};

function floodFill(m: Uint8Array, w: number, h: number, x0: number, y0: number, from: number, to: number) {
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;
  const visited = new Uint8Array(w * h);
  const stack = [x0, y0];
  visited[y0 * w + x0] = 1;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    set(m, w, x, y, to);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const p = ny * w + nx;
      if (visited[p]) continue;
      const c = get(m, w, nx, ny);
      if (c !== from || c === to) continue;
      visited[p] = 1;
      stack.push(nx, ny);
    }
  }
}

/** Best-first search toward the bottom row (search.cpp), painting what it visits purple. */
class Search {
  private visited: Uint8Array;
  private heap: { x: number; y: number; order: number }[] = [];
  private order = 0;
  endPos = NO_PARENT;
  constructor(
    private map: Uint8Array,
    private w: number,
    private h: number,
    private targetY: number,
    private parents: Int32Array,
  ) {
    this.visited = new Uint8Array(w * h);
  }
  private less(a: { y: number; order: number }, b: { y: number; order: number }) {
    const ap = Math.abs(a.y - this.targetY);
    const bp = Math.abs(b.y - this.targetY);
    return ap !== bp ? ap < bp : a.order < b.order;
  }
  private push(n: { x: number; y: number; order: number }) {
    const hp = this.heap;
    let i = hp.length;
    hp.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(hp[i]!, hp[p]!)) break;
      [hp[i], hp[p]] = [hp[p]!, hp[i]!];
      i = p;
    }
  }
  private pop() {
    const hp = this.heap;
    const top = hp[0]!;
    const last = hp.pop()!;
    if (hp.length) {
      hp[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < hp.length && this.less(hp[l]!, hp[best]!)) best = l;
        if (r < hp.length && this.less(hp[r]!, hp[best]!)) best = r;
        if (best === i) break;
        [hp[i], hp[best]] = [hp[best]!, hp[i]!];
        i = best;
      }
    }
    return top;
  }
  private mark(x: number, y: number) {
    set(this.map, this.w, x, y, PURPLE);
    this.visited[y * this.w + x] = 1;
  }
  find(x: number, y: number) {
    this.mark(x, y);
    this.parents[y * this.w + x] = NO_PARENT;
    this.push({ x, y, order: this.order++ });
    while (this.heap.length) {
      const n = this.pop();
      if (n.y === this.targetY) {
        this.endPos = n.y * this.w + n.x;
        return true;
      }
      for (const [nx, ny] of [
        [n.x, n.y - 1],
        [n.x - 1, n.y],
        [n.x + 1, n.y],
        [n.x, n.y + 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        if (this.visited[ny * this.w + nx]) continue;
        const c = get(this.map, this.w, nx, ny);
        if (c !== BLACK && c !== COFFEE && c !== MINT && c !== HELL_GREEN) continue;
        this.mark(nx, ny);
        this.parents[ny * this.w + nx] = n.y * this.w + n.x;
        this.push({ x: nx, y: ny, order: this.order++ });
      }
    }
    return false;
  }
}

export type WangArea = {
  /** World seed. */
  seed: number;
  width: number;
  height: number;
  /** The area's top-left chunk on the biome map (as biome_map.png coordinates). */
  chunkX: number;
  chunkY: number;
  coalMine: boolean;
  blockOutRooms: boolean;
  /** Reroll until there's a way down (false: tall areas, taken as first laid). Default true. */
  checkPath?: boolean;
  /** RandomMaterials: each colour → the colours it may become (RGB). */
  randomMaterials: { from: number; to: number[] }[];
  /** The Mines' fixed entrance and stairs (256 × 103 RGB), for coalMine areas. */
  overlay?: Uint8Array;
};

class MapGen {
  path: Uint8Array;
  parents: Int32Array;
  endNode = NO_PARENT;
  rooms: [number, number, number, number][] = [];
  worldX: number;
  worldY: number;
  constructor(
    public out: Uint8Array,
    private a: WangArea,
  ) {
    this.path = out.slice();
    this.parents = new Int32Array(a.width * a.height);
    this.worldX = a.chunkX - 35;
    this.worldY = a.chunkY - 14;
  }
  get w() {
    return this.a.width;
  }
  get h() {
    return this.a.height;
  }
  private overlay(apply: boolean, m: Uint8Array) {
    const o = this.a.overlay;
    if (!o) return;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const p = (y * 256 + x) * 3;
        const pix = (o[p]! << 16) | (o[p + 1]! << 8) | o[p + 2]!;
        if (pix === 0x004000) set(m, this.w, x, y, apply ? WHITE : BLACK);
        if (pix === 0x000040) set(m, this.w, x, y, BLACK);
        if (pix === 0xfefefe) set(m, this.w, x, y, apply ? 0x0a3344 : BLACK);
      }
    }
  }
  private mainPathX() {
    const from = Math.trunc((PATH_MIN_X - this.worldX * 512.0) / 10);
    const to = from + Math.trunc((PATH_MAX_X - PATH_MIN_X) / 10);
    return { from, to, main: this.worldY < 29 && to > 0 && from > 0 && this.w > from && to < this.w + from };
  }
  private blockOut(m: Uint8Array) {
    for (let pos = 0; pos < this.w * this.h; pos++) {
      const c = (m[pos * 3]! << 16) | (m[pos * 3 + 1]! << 8) | m[pos * 3 + 2]!;
      if (c === BLACK || c === WHITE || !BLOCKED.has(c)) continue;
      const x = pos % this.w;
      const y = Math.trunc(pos / this.w);
      const sx = x + 1;
      const sy = y + 1;
      let ex = x + 1;
      let ey = y + 1;
      let found = false;
      while (!found && ex < this.w) {
        const cc = get(m, this.w, ex, sy);
        if (cc === BLACK || grey(cc, 0x32)) {
          ex++;
          continue;
        }
        ex--;
        found = true;
      }
      if (ex >= this.w) ex = this.w - 1;
      found = false;
      while (!found && ey < this.h) {
        const cc = get(m, this.w, sx, ey);
        if (cc === BLACK || grey(cc, 0x32)) {
          ey++;
          continue;
        }
        ey--;
        found = true;
      }
      if (ey >= this.h) ey = this.h - 1;
      this.rooms.push([sx, sy, ex, ey]);
      fill(m, this.w, sx, ex, sy, ey, WHITE);
    }
  }
  /** Walls off the marked rooms and lays the Mines' entrance, as before a path check (finalize undoes both). */
  prepare() {
    if (this.a.blockOutRooms) this.blockOut(this.out);
    if (this.a.coalMine) this.overlay(true, this.out);
  }
  hasPath() {
    this.prepare();
    this.path = this.out.slice();
    const m = this.path;
    const { from, main } = this.mainPathX();
    let start = 0;
    if (this.a.coalMine) start = 0x8e;
    else if (main) {
      fill(m, this.w, from, from + Math.trunc((PATH_MAX_X - PATH_MIN_X) / 10), 0, 6, BLACK);
      start = from;
    }
    this.parents.fill(NO_PARENT);
    const s = new Search(m, this.w, this.h, this.h - 1, this.parents);
    if (main) {
      if (s.find(start, 0)) {
        this.endNode = s.endPos;
        return true;
      }
      return false;
    }
    let x = start;
    while (x < this.w) {
      const c = get(m, this.w, x, 0);
      if (c !== BLACK && c !== COFFEE) {
        x++;
        continue;
      }
      if (c === COFFEE) {
        floodFill(m, this.w, this.h, x, 0, COFFEE, BLACK);
        continue;
      }
      if (s.find(x, 0)) {
        this.endNode = s.endPos;
        return true;
      }
      x++;
    }
    return false;
  }
  finalize() {
    const m = this.out;
    const { from, main } = this.mainPathX();
    if (!this.a.coalMine && main) fill(m, this.w, from, from + Math.trunc((PATH_MAX_X - PATH_MIN_X) / 10), 0, 6, BLACK);
    if (this.a.coalMine) this.overlay(false, m);
    if (this.a.blockOutRooms) for (const [x1, y1, x2, y2] of this.rooms) fill(m, this.w, x1, x2, y1, y2, BLACK);
    // Clear the path the check found: random blocks along it become open.
    let cur = this.endNode;
    while (cur !== NO_PARENT && cur >= 0 && cur < this.w * this.h) {
      const x = cur % this.w;
      const y = Math.trunc(cur / this.w);
      if (get(m, this.w, x, y) === COFFEE) floodFill(m, this.w, this.h, x, y, COFFEE, BLACK);
      cur = this.parents[cur]!;
    }
    // The rest of the c0ffee blocks: rock or open, half and half (BIOME_RANDOM_BLOCK_CHANCE).
    const rng = Prng.of(0);
    rng.fromWorldSeed(this.a.seed);
    rng.next();
    for (let pos = 0; pos < this.w * this.h; pos++) {
      if (((m[pos * 3]! << 16) | (m[pos * 3 + 1]! << 8) | m[pos * 3 + 2]!) !== COFFEE) continue;
      const to = 0.5 > Math.fround(rng.next()) ? WHITE : BLACK;
      floodFill(m, this.w, this.h, pos % this.w, Math.trunc(pos / this.w), COFFEE, to);
    }
    // RandomMaterials: each patch of a colour becomes one of its options.
    const reps = this.a.randomMaterials.map((r) => {
      const g = areaRng(this.a.seed, this.w);
      g.next();
      return { ...r, rng: g };
    });
    for (const r of reps) {
      for (let pos = 0; pos < this.w * this.h; pos++) {
        if (((m[pos * 3]! << 16) | (m[pos * 3 + 1]! << 8) | m[pos * 3 + 2]!) !== r.from) continue;
        const i = r.rng.random(0, r.to.length - 1);
        floodFill(m, this.w, this.h, pos % this.w, Math.trunc(pos / this.w), r.from, r.to[i]!);
      }
    }
  }
}

/** Path-checked tries before the layout is taken as it comes (noita-telescope's MAX_PATHFINDING_ATTEMPTS). */
const PATH_TRIES = 99;
/** Areas taller than this many chunks aren't checked for a way down (telescope's BIOME_PATH_HEIGHT_LIMIT_CHUNKS). */
export const PATH_CHECK_MAX_CHUNKS = 4;

/**
 * An area's layout (RGB, width × height), or null when the tiles can't be laid at all. The layout is rerolled until it
 * has a way down; after 99 tries without one, the next is kept as it is (as noita-telescope does). Tall areas (the
 * Snowy Chasm, the Lake) aren't checked: their first layout stands.
 */
export function generateArea(ts: Tileset, a: WangArea): Uint8Array | null {
  const rng = areaRng(a.seed, a.width);
  for (let tries = 0; tries <= PATH_TRIES; tries++) {
    const r2 = Prng.of(rng.nextU());
    const img = generateImage(ts, a.width, a.height + 4, () => r2.nextU());
    if (!img) return null;
    // The first 4 rows are dropped (generated taller, then trimmed from the top).
    const out = img.slice(4 * 3 * a.width);
    const mg = new MapGen(out, a);
    const keep = a.checkPath === false || tries === PATH_TRIES;
    if (keep) mg.prepare();
    if (keep || mg.hasPath()) {
      mg.finalize();
      return out;
    }
  }
  return null;
}

/** Map width in wang pixels of chunks a..b (GetWidthFromPix): 512 world px per chunk, 10 per pixel. */
export const widthFromPix = (a: number, b: number) => Math.trunc((b * 512) / 10) - Math.trunc((a * 512) / 10);
