// The companion mod's companion_live.json (mod/noita_companion/files/export.lua), or the same object
// relayed by another device. Untrusted either way: only well-formed fields survive, everything capped.

export type LiveSpell = { id: string; slot?: number; uses?: number };
export type LiveWand = {
  name: string;
  sprite?: string;
  active: boolean;
  shuffle: boolean;
  spellsPerCast: number;
  castDelay: number;
  rechargeTime: number;
  manaMax: number;
  mana?: number;
  manaChargeSpeed: number;
  capacity: number;
  spread: number;
  speedMultiplier: number;
  spells: LiveSpell[];
  alwaysCasts: string[];
};
export type LiveFlask = { name: string; capacity?: number; contents: { material: string; amount: number }[] };

export type LiveRun = {
  status: 'alive' | 'dead' | 'paused' | 'no_player';
  seed: number;
  ngPlus: number;
  biome?: { id: string; name: string };
  hp?: number;
  maxHp?: number;
  gold?: number;
  depth?: number;
  wands: LiveWand[];
  flasks: LiveFlask[];
  /** Spells carried in the inventory, not on a wand. */
  spells: LiveSpell[];
  perks: { id: string; count: number }[];
  /** Unix seconds when the mod wrote it. */
  time?: number;

  // Mod version 2 onwards (all optional: an older mod just leaves them out).
  /** The mod's version; missing = 1. */
  mod?: number;
  /** Player position in world pixels. */
  x?: number;
  y?: number;
  /** Seconds played this run. */
  playtime?: number;
  kills?: number;
  /** Orbs picked up this run. */
  orbs?: number;
  /** Fungal shifts done so far, and seconds until the next one can happen (0 = ready). */
  fungal?: { count: number; readyIn: number };
  /** Creatures met this run (entity file ids, as the save's stats_<id>.xml use). */
  seen?: string[];
  /** Carried items other than wands and flasks (stones, eggs, dice…). */
  items?: LiveItem[];
  /** What killed you, when status is dead. */
  killedBy?: string;
  /** Mod 5: the real overworld ground line near where you've been, as [x, y] world pixels (first solid from above). */
  surface?: [number, number][];
};
export type LiveItem = { id: string; name: string; held?: boolean };

const MAX_BYTES = 256 * 1024;
const STATUSES = ['alive', 'dead', 'paused', 'no_player'] as const;

const num = (x: unknown, fallback = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const optNum = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const str = (x: unknown, max = 200): string | undefined => (typeof x === 'string' && x.length <= max ? x : undefined);
const arr = (x: unknown, max: number): unknown[] => (Array.isArray(x) ? x.slice(0, max) : []);
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const id = (x: unknown) => (typeof x === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(x) ? x : undefined);

const spell = (x: unknown): LiveSpell | null => {
  const o = obj(x);
  const i = o && id(o.id);
  if (!o || !i) return null;
  const s: LiveSpell = { id: i };
  const slot = optNum(o.slot);
  const uses = optNum(o.uses);
  if (slot !== undefined) s.slot = Math.max(0, Math.min(63, Math.floor(slot)));
  if (uses !== undefined && uses >= 0) s.uses = Math.floor(uses);
  return s;
};

const wand = (x: unknown): LiveWand | null => {
  const o = obj(x);
  if (!o) return null;
  return {
    name: str(o.name, 60) ?? 'Wand',
    sprite: str(o.sprite, 120),
    active: o.active === true,
    shuffle: o.shuffle === true,
    spellsPerCast: num(o.spellsPerCast, 1),
    castDelay: num(o.castDelay),
    rechargeTime: num(o.rechargeTime),
    manaMax: num(o.manaMax),
    mana: optNum(o.mana),
    manaChargeSpeed: num(o.manaChargeSpeed),
    capacity: Math.max(0, Math.min(64, Math.floor(num(o.capacity)))),
    spread: num(o.spread),
    speedMultiplier: num(o.speedMultiplier, 1),
    spells: arr(o.spells, 64).map(spell).filter((s): s is LiveSpell => !!s),
    alwaysCasts: arr(o.alwaysCasts, 16).map(id).filter((s): s is string => !!s),
  };
};

/** One wand, checked the same way (for run records from other devices). */
export const parseLiveWand = wand;

const flask = (x: unknown): LiveFlask | null => {
  const o = obj(x);
  if (!o) return null;
  return {
    name: str(o.name, 60) ?? 'Flask',
    capacity: optNum(o.capacity),
    contents: arr(o.contents, 16)
      .map((c) => {
        const co = obj(c);
        const m = co && id(co.material);
        return co && m ? { material: m, amount: Math.max(0, num(co.amount)) } : null;
      })
      .filter((c): c is { material: string; amount: number } => !!c),
  };
};

/** Parse the mod's file (a string) or an already-parsed object from another device. */
export function parseLiveRun(input: unknown): LiveRun | null {
  let raw: unknown = input;
  if (typeof input === 'string') {
    if (input.length > MAX_BYTES) return null;
    try {
      raw = JSON.parse(input);
    } catch {
      return null;
    }
  }
  const o = obj(raw);
  if (!o || o.v !== 1) return null;
  const biome = obj(o.biome);
  // Unnamed areas (the starting surface, among others) come back as _EMPTY_: show no biome then.
  const rawBiome = biome ? str(biome.id, 80) : undefined;
  const biomeId = rawBiome !== '_EMPTY_' ? rawBiome : undefined;
  return {
    status: (STATUSES as readonly unknown[]).includes(o.status) ? (o.status as LiveRun['status']) : 'alive',
    seed: num(o.seed),
    ngPlus: num(o.ngPlus),
    biome: biome && biomeId ? { id: biomeId, name: str(biome.name, 80) ?? biomeId } : undefined,
    hp: optNum(o.hp),
    maxHp: optNum(o.maxHp),
    gold: optNum(o.gold),
    depth: optNum(o.depth),
    wands: arr(o.wands, 4).map(wand).filter((w): w is LiveWand => !!w),
    flasks: arr(o.flasks, 4).map(flask).filter((f): f is LiveFlask => !!f),
    spells: arr(o.spells, 64).map(spell).filter((s): s is LiveSpell => !!s),
    perks: arr(o.perks, 200)
      .map((p) => {
        const po = obj(p);
        const i = po && id(po.id);
        return po && i ? { id: i, count: Math.max(1, Math.floor(num(po.count, 1))) } : null;
      })
      .filter((p): p is { id: string; count: number } => !!p),
    time: optNum(o.time),
    ...v2(o),
  };
}

/** The mod-2 fields, each only if present and well-formed. */
function v2(o: Record<string, unknown>): Partial<LiveRun> {
  const out: Partial<LiveRun> = {};
  const count = (x: unknown) => {
    const n = optNum(x);
    return n !== undefined && n >= 0 ? Math.floor(n) : undefined;
  };
  const mod = count(o.mod);
  if (mod) out.mod = mod;
  const x = optNum(o.x);
  const y = optNum(o.y);
  if (x !== undefined && y !== undefined) {
    out.x = Math.round(x);
    out.y = Math.round(y);
  }
  const playtime = optNum(o.playtime);
  if (playtime !== undefined && playtime >= 0) out.playtime = playtime;
  const kills = count(o.kills);
  if (kills !== undefined) out.kills = kills;
  const orbs = count(o.orbs);
  if (orbs !== undefined) out.orbs = Math.min(orbs, 99);
  const f = obj(o.fungal);
  const fc = f && count(f.count);
  if (f && fc !== undefined && fc !== null) out.fungal = { count: Math.min(fc, 99), readyIn: count(f.readyIn) ?? 0 };
  if (Array.isArray(o.seen)) out.seen = [...new Set(arr(o.seen, 400).map(id).filter((s): s is string => !!s))];
  if (Array.isArray(o.surface)) {
    const pts = arr(o.surface, 4000).flatMap((p) => {
      if (!Array.isArray(p) || p.length !== 2) return [];
      const [px, py] = p as unknown[];
      return typeof px === 'number' && typeof py === 'number' && Number.isFinite(px) && Number.isFinite(py) ? [[Math.round(px), Math.round(py)] as [number, number]] : [];
    });
    if (pts.length) out.surface = pts;
  }
  if (Array.isArray(o.items))
    out.items = arr(o.items, 32)
      .map((it) => {
        const io = obj(it);
        const i = io && id(io.id);
        return io && i ? { id: i, name: str(io.name, 80) ?? '', ...(io.held === true ? { held: true } : {}) } : null;
      })
      .filter((it): it is LiveItem => !!it);
  const killedBy = str(o.killedBy, 120);
  if (killedBy) out.killedBy = killedBy;
  return out;
}
