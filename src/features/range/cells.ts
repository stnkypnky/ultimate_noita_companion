// Falling sand for the test range: a grid of the game's materials that fall, flow, rise, burn and react
// by Noita's own reaction table (materials.xml). Pure logic, no DOM.
//
// Movement follows each material's cell type and density (powders pile, liquids flow and layer by density,
// gases rise and fade after their lifetime, fire flickers up and spreads to burnable cells, which burn down
// by fire_hp). Reactions are the game's two-material reactions, matched by id or [tag]. Approximated:
// temperatures, three-material and lifetime-gated reactions, and the engine's exact spread rules.
import type { Material, Reaction } from '@/data/types';

export const K_AIR = 0;
export const K_STATIC = 1;
export const K_POWDER = 2;
export const K_LIQUID = 3;
export const K_GAS = 4;
export const K_FIRE = 5;

/** Chunks of 32×32 cells sleep while nothing in them moves, reacts or burns. */
const CHUNK = 32;
const SHIFT = 5;
/** Fire and spark cells with no lifetime of their own flicker out after this many frames. */
const FIRE_LIFE: [number, number] = [12, 40];
/** How far a liquid cell can spread sideways in a frame. */
const DISPERSION = 3;

export type CellMat = {
  id: string;
  kind: number;
  density: number;
  /** #rrggbbaa → components. */
  r: number;
  g: number;
  b: number;
  a: number;
  burnable: boolean;
  fireHp: number;
  /** Frames the cell lasts (gases); 0 = forever. */
  lifetime: number;
  glow: boolean;
  durability: number;
  /** Never removed (the range's bedrock walls). */
  hard: boolean;
  tags: Set<string>;
  /** Status effects contact gives (WET, OILED, BLOODY...). */
  stains: string[];
  /** Sets things on fire (fire, lava). */
  hot: boolean;
  /** Path under game/materials/ of its texture. */
  texture?: string;
};

type Rx = { r: Reaction; /** Output index for the cell being updated and for its neighbour. */ self: number; other: number; out: [number, number] };

const kindOf = (m: Material) =>
  m.state === 'gas' ? K_GAS : m.state === 'fire' ? K_FIRE : m.state === 'powder' ? K_POWDER : m.state === 'liquid' ? K_LIQUID : K_STATIC;

const rnd = (n: number) => Math.floor(Math.random() * n);

export class Cells {
  readonly mat: Uint16Array;
  /** Lifetime left (gases, fire) or fire_hp left (burning cells). */
  readonly life: Int32Array;
  readonly burning: Uint8Array;
  private stamp: Uint32Array;
  readonly mats: CellMat[];
  readonly byId = new Map<string, number>();
  readonly cx: number;
  readonly cy: number;
  private active: Uint8Array;
  private nextActive: Uint8Array;
  /** Chunks whose pixels changed since the renderer last looked (it clears them). */
  readonly dirty: Uint8Array;
  private pairs = new Map<number, Rx[] | null>();
  private reactions: Reaction[];
  frame = 0;

  constructor(
    readonly w: number,
    readonly h: number,
    materials: Material[],
    reactions: Reaction[],
    textures: (m: Material) => string | undefined = (m) => m.texture,
  ) {
    const n = w * h;
    this.mat = new Uint16Array(n);
    this.life = new Int32Array(n);
    this.burning = new Uint8Array(n);
    this.stamp = new Uint32Array(n);
    this.cx = Math.ceil(w / CHUNK);
    this.cy = Math.ceil(h / CHUNK);
    this.active = new Uint8Array(this.cx * this.cy);
    this.nextActive = new Uint8Array(this.cx * this.cy);
    this.dirty = new Uint8Array(this.cx * this.cy).fill(1);
    const air: CellMat = { id: 'air', kind: K_AIR, density: 0, r: 0, g: 0, b: 0, a: 0, burnable: false, fireHp: 0, lifetime: 0, glow: false, durability: 0, hard: false, tags: new Set(), stains: [], hot: false };
    this.mats = [air];
    this.byId.set('air', 0);
    for (const m of materials) {
      if (m.id === 'air') continue;
      const hex = m.color.slice(1);
      const c = (k: number) => parseInt(hex.slice(k, k + 2) || 'ff', 16);
      const tags = new Set(m.tags.map((t) => t.replace(/^\[|\]$/g, '')));
      this.byId.set(m.id, this.mats.length);
      this.mats.push({
        id: m.id,
        kind: kindOf(m),
        density: m.density,
        r: c(0),
        g: c(2),
        b: c(4),
        a: c(6),
        burnable: m.burnable,
        fireHp: m.fireHp || 60,
        lifetime: m.lifetime ?? 0,
        glow: !!m.glow || m.state === 'fire',
        durability: m.durability,
        hard: false,
        tags,
        stains: m.stains,
        hot: m.state === 'fire' || tags.has('fire_lava') || tags.has('lava'),
        ...(textures(m) ? { texture: textures(m) } : {}),
      });
    }
    this.reactions = reactions.filter((r) => r.inputs.length === 2 && r.outputs.length >= 2 && !r.requiresLifetime && r.probability > 0);
  }

  /** A copy of a material that nothing can remove (the range's border). */
  addHard(id: string, like: string) {
    const base = this.mats[this.byId.get(like) ?? 0]!;
    this.byId.set(id, this.mats.length);
    this.mats.push({ ...base, id, hard: true, burnable: false });
    return this.mats.length - 1;
  }

  /** A falling copy of a solid (same look), for ground shaken loose by Earthquake. */
  loose(m: number) {
    const base = this.mats[m]!;
    const id = `${base.id}:loose`;
    const have = this.byId.get(id);
    if (have !== undefined) return have;
    this.byId.set(id, this.mats.length);
    this.mats.push({ ...base, id, kind: K_POWDER, hard: false });
    return this.mats.length - 1;
  }

  index(id: string) {
    return this.byId.get(id) ?? -1;
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x: number, y: number) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return this.inside(ix, iy) ? this.mat[iy * this.w + ix]! : -1;
  }

  kindAt(x: number, y: number) {
    const m = this.at(x, y);
    return m < 0 ? K_STATIC : this.mats[m]!.kind;
  }

  /** Put a material in a cell (any cell, replacing what's there). */
  set(x: number, y: number, m: number) {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.put(i, m);
  }

  /** Put a material only where there's air. */
  place(x: number, y: number, m: number) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (m <= 0 || !this.inside(ix, iy) || this.mat[iy * this.w + ix]) return false;
    this.put(iy * this.w + ix, m);
    return true;
  }

  /** Fill every cell with air (rebuilding the scene). */
  clear() {
    this.mat.fill(0);
    this.life.fill(0);
    this.burning.fill(0);
    this.dirty.fill(1);
    this.active.fill(0);
    this.nextActive.fill(1);
  }

  /** Light a burnable cell. */
  ignite(i: number) {
    const m = this.mats[this.mat[i]!]!;
    if (!m.burnable || this.burning[i]) return;
    this.burning[i] = 1;
    this.life[i] = m.fireHp;
    this.wake(i);
  }

  /**
   * Remove cells in a circle that are no tougher than `maxDurability` (explosions, digging). Liquids and
   * gases have no durability and always go; the border never does. Returns how many cells were removed.
   */
  carve(cx: number, cy: number, r: number, probability = 100, maxDurability = Infinity) {
    let n = 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(this.h - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(this.w - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = y * this.w + x;
        const m = this.mats[this.mat[i]!]!;
        if (!this.mat[i] || m.hard || m.durability > maxDurability) continue;
        if (probability < 100 && Math.random() * 100 >= probability) continue;
        this.put(i, 0);
        n++;
      }
    }
    return n;
  }

  private put(i: number, m: number) {
    this.mat[i] = m;
    const info = this.mats[m]!;
    this.burning[i] = 0;
    this.life[i] = info.lifetime > 0 ? info.lifetime : info.kind === K_FIRE ? FIRE_LIFE[0] + rnd(FIRE_LIFE[1] - FIRE_LIFE[0]) : 0;
    this.stamp[i] = this.frame;
    this.wake(i);
  }

  /** Mark the cell's chunk (and neighbouring ones it touches) to update next frame and repaint. */
  wake(i: number) {
    const x = i % this.w;
    const y = (i - x) / this.w;
    const x0 = Math.max(0, (x - 1) >> SHIFT);
    const x1 = Math.min(this.cx - 1, (x + 1) >> SHIFT);
    const y0 = Math.max(0, (y - 1) >> SHIFT);
    const y1 = Math.min(this.cy - 1, (y + 1) >> SHIFT);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        this.nextActive[cy * this.cx + cx] = 1;
        this.dirty[cy * this.cx + cx] = 1;
      }
    }
  }

  /** Keep a chunk running next frame without repainting it (a reaction could still happen there). */
  private stayAwake(i: number) {
    const x = i % this.w;
    this.nextActive[(((i - x) / this.w) >> SHIFT) * this.cx + (x >> SHIFT)] = 1;
  }

  /** Is any chunk still moving? */
  get busy() {
    return this.nextActive.some((v) => v === 1);
  }

  // ---------- simulation ----------

  step() {
    this.frame++;
    [this.active, this.nextActive] = [this.nextActive, this.active];
    this.nextActive.fill(0);
    const flip = (this.frame & 1) === 1;
    // Bottom to top so falling cells move once; alternate sides so nothing drifts one way.
    for (let y = this.h - 1; y >= 0; y--) {
      const row = (y >> SHIFT) * this.cx;
      for (let k = 0; k < this.cx; k++) {
        const c = flip ? this.cx - 1 - k : k;
        if (!this.active[row + c]) continue;
        const x0 = c << SHIFT;
        const x1 = Math.min(this.w, x0 + CHUNK);
        if (flip) for (let x = x1 - 1; x >= x0; x--) this.update(x, y);
        else for (let x = x0; x < x1; x++) this.update(x, y);
      }
    }
  }

  private update(x: number, y: number) {
    const i = y * this.w + x;
    const m = this.mat[i]!;
    if (!m || this.stamp[i] === this.frame) return;
    const info = this.mats[m]!;

    // Gases and fire fade; fire spreads to what burns.
    if (info.lifetime > 0 || info.kind === K_FIRE) {
      if (--this.life[i]! <= 0) {
        this.put(i, 0);
        return;
      }
      this.stayAwake(i);
    }
    if (info.kind === K_FIRE || this.burning[i]) this.spreadFire(x, y);
    if (this.burning[i] && this.burn(i, x, y)) return;
    if (this.react(x, y, i, m)) return;

    switch (info.kind) {
      case K_POWDER:
        this.fall(i, x, y, false);
        break;
      case K_LIQUID:
        if (!this.fall(i, x, y, true)) this.spread(i, x, y);
        break;
      case K_GAS:
        this.rise(i, x, y, 1);
        break;
      case K_FIRE:
        // Flames flicker in place more than they climb.
        if (Math.random() < 0.25) this.rise(i, x, y, 0);
        break;
    }
  }

  /** Can the cell at `i` move into `j`: air, or a lighter liquid or gas it sinks through. */
  private canEnter(i: number, j: number) {
    const t = this.mat[j]!;
    if (!t) return true;
    const ti = this.mats[t]!;
    const mi = this.mats[this.mat[i]!]!;
    if (ti.kind === K_STATIC || ti.kind === K_POWDER) return false;
    if (mi.kind === K_GAS || mi.kind === K_FIRE) return false;
    return ti.density < mi.density && this.stamp[j] !== this.frame;
  }

  private swap(i: number, j: number) {
    const m = this.mat[i]!;
    const l = this.life[i]!;
    const b = this.burning[i]!;
    this.mat[i] = this.mat[j]!;
    this.life[i] = this.life[j]!;
    this.burning[i] = this.burning[j]!;
    this.mat[j] = m;
    this.life[j] = l;
    this.burning[j] = b;
    this.stamp[i] = this.stamp[j] = this.frame;
    this.wake(i);
    this.wake(j);
  }

  private fall(i: number, x: number, y: number, liquid: boolean) {
    if (y + 1 >= this.h) return false;
    const below = i + this.w;
    if (this.canEnter(i, below)) {
      this.swap(i, below);
      return true;
    }
    const d = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [d, -d]) {
      const nx = x + dx;
      if (nx < 0 || nx >= this.w) continue;
      // Powders only slide off a slope; liquids also need the side cell open.
      if (this.canEnter(i, below + dx) && (liquid || this.canEnter(i, i + dx))) {
        this.swap(i, below + dx);
        return true;
      }
    }
    return false;
  }

  /** Liquids level out: slide up to a few cells sideways. */
  private spread(i: number, x: number, y: number) {
    const d = Math.random() < 0.5 ? -1 : 1;
    for (const dir of [d, -d]) {
      let to = -1;
      for (let s = 1; s <= DISPERSION; s++) {
        const nx = x + dir * s;
        if (nx < 0 || nx >= this.w) break;
        const j = y * this.w + nx;
        if (!this.canEnter(i, j)) break;
        to = j;
        // Stop at a drop so it falls there next frame.
        if (y + 1 < this.h && this.canEnter(i, j + this.w)) break;
      }
      if (to >= 0) {
        this.swap(i, to);
        return;
      }
    }
  }

  /** Gases (and flickering fire) drift up and sideways into air or past lighter gas. */
  private rise(i: number, x: number, y: number, wander: number) {
    const tryTo = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) return false;
      const j = ny * this.w + nx;
      const t = this.mat[j]!;
      if (t && (this.mats[t]!.kind !== K_GAS || this.stamp[j] === this.frame)) return false;
      if (t && this.mats[t]!.density <= this.mats[this.mat[i]!]!.density) return false;
      this.swap(i, j);
      return true;
    };
    const d = Math.random() < 0.5 ? -1 : 1;
    if (tryTo(x + (Math.random() < 0.3 ? d : 0), y - 1)) return;
    if (tryTo(x + d, y - 1)) return;
    if (wander && Math.random() < 0.5) tryTo(x + d, y);
  }

  // ---------- fire ----------

  private spreadFire(x: number, y: number) {
    // Every neighbour can catch; liquids and powders (oil, gunpowder) far faster than solid blocks (wood).
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !this.inside(x + dx, y + dy)) continue;
        const j = (y + dy) * this.w + x + dx;
        const t = this.mats[this.mat[j]!]!;
        if (t.burnable && !this.burning[j] && Math.random() < (t.kind === K_STATIC ? 0.01 : 0.08)) this.ignite(j);
      }
    }
  }

  /** A burning cell: sheds flames into the air around it and burns down; returns true when it's gone. */
  private burn(i: number, x: number, y: number) {
    this.stayAwake(i);
    this.life[i] = this.life[i]! - 3;
    const fire = this.byId.get('fire') ?? 0;
    if (Math.random() < 0.25) {
      const nx = x + rnd(3) - 1;
      const ny = y - rnd(2);
      if (this.inside(nx, ny) && !this.mat[ny * this.w + nx]) this.put(ny * this.w + nx, fire);
    }
    if (Math.random() < 0.02 && this.inside(x, y - 1) && !this.mat[i - this.w]) this.put(i - this.w, this.byId.get('smoke') ?? 0);
    if (this.life[i]! <= 0) {
      this.put(i, Math.random() < 0.3 ? fire : 0);
      return true;
    }
    return false;
  }

  // ---------- reactions ----------

  private matches(input: string, m: number) {
    const info = this.mats[m]!;
    if (input.startsWith('[')) return info.tags.has(input.slice(1, -1));
    return input === info.id;
  }

  /** The game's reactions between material `a` (this cell) and `b` (its neighbour), either way round. */
  private pairReactions(a: number, b: number): Rx[] | null {
    const key = a * 65536 + b;
    const cached = this.pairs.get(key);
    if (cached !== undefined) return cached;
    const out: Rx[] = [];
    const resolve = (o: string, keep: number) => (o.startsWith('[') ? keep : o === 'air' ? 0 : (this.byId.get(o) ?? -1));
    for (const r of this.reactions) {
      const [i0, i1] = r.inputs as [string, string];
      const [o0, o1] = r.outputs as [string, string];
      if (this.matches(i0, a) && this.matches(i1, b)) out.push({ r, self: 0, other: 1, out: [resolve(o0, a), resolve(o1, b)] });
      else if (this.matches(i0, b) && this.matches(i1, a)) out.push({ r, self: 1, other: 0, out: [resolve(o1, a), resolve(o0, b)] });
    }
    const list = out.filter((x) => x.out[0] >= 0 && x.out[1] >= 0);
    const res = list.length ? list : null;
    this.pairs.set(key, res);
    return res;
  }

  /** Try the reactions with one random neighbour; returns true if this cell changed. */
  private react(x: number, y: number, i: number, m: number) {
    const dir = rnd(4);
    const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
    const ny = y + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
    if (!this.inside(nx, ny)) return false;
    const j = ny * this.w + nx;
    const n = this.mat[j]!;
    const rx = this.pairReactions(m, n);
    if (!rx) return false;
    // A possible reaction keeps the chunk running, except with plain air (moss on every rock top would
    // keep the whole cave awake; the engine also lets quiet areas sleep).
    if (n) this.stayAwake(i);
    for (const { r, out, self } of rx) {
      // Slow reactions are tried a quarter as often.
      if (!r.fast && (this.frame + i) % 4) continue;
      // direction="top": the second material must be above the first.
      if (r.direction === 'top' && (self === 0 ? ny !== y - 1 : ny !== y + 1)) continue;
      if (r.direction === 'bottom' && (self === 0 ? ny !== y + 1 : ny !== y - 1)) continue;
      if (Math.random() * 100 >= r.probability) continue;
      if (out[0] !== m) this.put(i, out[0]);
      if (out[1] !== this.mat[j]) this.put(j, out[1]);
      return out[0] !== m;
    }
    return false;
  }
}
