// Run history: the mod's snapshots folded into one record per run, with a timeline and what was discovered.
// Pure (no storage, no UI) so it's easy to test; runs.ts stores and syncs the records.
import { RARE_ITEMS, SECRET_ITEMS, SECRET_MATERIALS } from '@/data/spoilers';
import type { LiveRun, LiveWand } from './parse';
import { liveFlags } from './state';
import { mergeSurface } from '@/features/map/ground';

export type RunEventKind = 'start' | 'biome' | 'perk' | 'spell' | 'wand' | 'item' | 'found' | 'hp_low' | 'died' | 'won';
/** `id`: a spell, perk or item id, or (for found) a spoiler key; `text`: a biome name or what killed you. */
export type RunEvent = { t: number; k: RunEventKind; id?: string; text?: string };

export type RunRecord = {
  /** `${seed}-${startedAt}` */
  id: string;
  seed: number;
  ngPlus: number;
  /** The device that recorded it (the one reading the mod's file). */
  device: string;
  startedAt: number;
  endedAt?: number;
  /** Last change (ms): newer wins when devices merge. */
  updatedAt: number;
  outcome: 'ongoing' | 'died' | 'ended' | 'won';
  /** For a win: 'ngplus' when it went on into New Game+. */
  ending?: 'ngplus';
  killedBy?: string;
  maxDepth: number;
  /** Name of the deepest biome reached. */
  deepest?: string;
  gold: number;
  kills?: number;
  orbs?: number;
  playtime?: number;
  perks: { id: string; count: number }[];
  wands: LiveWand[];
  events: RunEvent[];
  /** Health over time: [ms, hp, max hp], one sample about every 30 s. */
  hp: [number, number, number][];
  /** Spoiler keys discovered for the first time during this run. */
  found: string[];
  /** Every spell carried at some point this run (to tell new pickups apart). */
  carried: string[];
  /** The run as it last was (the death screen, for a death): the Run page shows a past run from it. */
  last?: LiveRun;
  /** What was last in hand (this device only, not synced): an ending's gold takes it all just before the end. */
  held?: { t: number; wands: LiveWand[]; flasks: LiveRun['flasks']; items?: LiveRun['items'] };
};

export const MAX_EVENTS = 200;
export const MAX_HP_SAMPLES = 240;
/** Runs kept and synced, the ongoing one included. */
export const MAX_RUNS = 10;
/** Won runs are kept past MAX_RUNS, up to this many. */
export const MAX_WON = 30;
/** Wands that vanish this soon before the end were taken by it (the gold), not dropped. */
const HELD_MS = 30_000;

/** The ending's gold kills you with "midas" damage: the game records it as killed_by " | midas". */
export const isMidas = (killedBy?: string) => !!killedBy && /\|\s*midas\s*$/i.test(killedBy);
const wonRun = (run: LiveRun) => run.won === true || (run.status === 'dead' && isMidas(run.killedBy));

/** Newest first: the latest MAX_RUNS, plus older wins. */
export function capRuns(recs: RunRecord[]): RunRecord[] {
  const sorted = [...recs].sort((a, b) => b.startedAt - a.startedAt);
  const recent = sorted.slice(0, MAX_RUNS);
  const wins = sorted.slice(MAX_RUNS).filter((r) => r.outcome === 'won').slice(0, MAX_WON);
  return [...recent, ...wins];
}

/** Records saved before wins were told apart: a "death" to the ending's gold is a win. */
export function upgradeRecord(rec: RunRecord): RunRecord {
  if (rec.outcome !== 'died' || !isMidas(rec.killedBy)) return rec;
  const { killedBy: _k, ...rest } = rec;
  return { ...rest, outcome: 'won', events: rec.events.map((e) => (e.k === 'died' && isMidas(e.text) ? { t: e.t, k: 'won' } : e)) };
}

/** A snapshot as kept on a record: without the creatures-met list (the record's `found` has what matters). */
const keepSnapshot = (run: LiveRun): LiveRun => {
  const { seen: _seen, time: _time, ...rest } = run;
  return structuredClone(rest);
};
const HP_SAMPLE_MS = 30_000;

/** What the save (not the live run) already knew before: flags, creatures, and earlier runs' discoveries. */
export type Known = (key: string) => boolean;

/**
 * Discoveries worth listing: spells, perks, creatures, the secret and rare items, the secret materials, and
 * the hidden map areas you walk into (map:<biome>; a secret room inside one, map:scene:…, stays a secret).
 */
export function isDiscovery(key: string) {
  if (key.startsWith('action_') || key.startsWith('perk_picked_') || key.startsWith('enemy:')) return true;
  if (key.startsWith('map:')) return !key.startsWith('map:scene:');
  if (key.startsWith('item:')) return SECRET_ITEMS.has(key.slice(5)) || key.slice(5) in RARE_ITEMS;
  if (key.startsWith('essence_')) return SECRET_ITEMS.has(key);
  if (key.startsWith('material:')) return SECRET_MATERIALS.has(key.slice(9));
  return false;
}

const carriedSpells = (run: LiveRun) => [...run.wands.flatMap((w) => [...w.spells.map((s) => s.id), ...w.alwaysCasts]), ...run.spells.map((s) => s.id)];

function pushEvent(rec: RunRecord, e: RunEvent) {
  rec.events.push(e);
  // Keep the start; drop the oldest of the rest.
  if (rec.events.length > MAX_EVENTS) rec.events.splice(1, rec.events.length - MAX_EVENTS);
}

/** Add discoveries (spoiler keys) to a run, each once. Returns whether anything was new. */
export function addFound(rec: RunRecord, keys: string[], at: number, known: Known): boolean {
  let changed = false;
  for (const key of keys) {
    if (!isDiscovery(key) || known(key) || rec.found.includes(key)) continue;
    rec.found.push(key);
    pushEvent(rec, { t: at, k: 'found', id: key });
    changed = true;
  }
  return changed;
}

function newRecord(run: LiveRun, at: number, device: string): RunRecord {
  const startedAt = Math.round(at - (run.playtime ?? 0) * 1000);
  return {
    // New Game+ goes on with the same play time, so it would get the won run's id without the suffix.
    id: `${run.seed}-${startedAt}${run.ngPlus ? `-ng${run.ngPlus}` : ''}`,
    seed: run.seed,
    ngPlus: run.ngPlus,
    device,
    startedAt,
    updatedAt: at,
    outcome: 'ongoing',
    maxDepth: 0,
    gold: 0,
    perks: [],
    wands: [],
    events: [{ t: at, k: 'start' }],
    hp: [],
    found: [],
    carried: [],
  };
}

/**
 * Fold one snapshot into the current run. A different seed (or a new life after dying) starts a new record;
 * the one it replaces is returned as `closed` (outcome 'ended' if it hadn't died). Going quiet never ends a
 * run: the game may just be paused or closed for a while.
 */
export function foldSnapshot(
  prev: RunRecord | null,
  run: LiveRun,
  at: number,
  /** extra: spoiler keys found that the snapshot itself can't say (the hidden map area you're standing in). */
  ctx: { known: Known; device: string; extra?: string[] },
): { current: RunRecord | null; closed?: RunRecord; changed: boolean } {
  if (run.status === 'no_player' || !run.seed) return { current: prev, changed: false };
  const won = wonRun(run);
  // A won run keeps taking snapshots while the ending plays out (and the gold kills you).
  const open = prev?.outcome === 'ongoing' || (prev?.outcome === 'won' && won && !prev.ending) ? prev : null;
  const same = !!open && open.seed === run.seed && open.ngPlus === run.ngPlus;
  let closed: RunRecord | undefined;
  if (open && !same) {
    // Same world, one New Game+ further: the run was won on the mountain top.
    const ngPlus = open.outcome === 'ongoing' && open.seed === run.seed && run.ngPlus === open.ngPlus + 1;
    closed = ngPlus
      ? { ...open, outcome: 'won', ending: 'ngplus', endedAt: at, updatedAt: at, events: [...open.events, { t: at, k: 'won', text: 'ngplus' }] }
      : open.outcome === 'won'
        ? undefined
        : { ...open, outcome: 'ended', endedAt: open.updatedAt, updatedAt: at };
  }

  if (!same) {
    // The death screen (or a finished ending) keeps reporting: that run is already recorded.
    if (run.status === 'dead' || won) return { current: closed ? null : prev, closed, changed: !!closed };
  }
  const rec: RunRecord = same ? structuredClone(open!) : newRecord(run, at, ctx.device);

  // Timeline.
  const lastBiome = [...rec.events].reverse().find((e) => e.k === 'biome')?.text;
  if (run.biome && run.biome.name !== lastBiome) pushEvent(rec, { t: at, k: 'biome', text: run.biome.name });
  const before = new Map(rec.perks.map((p) => [p.id, p.count]));
  for (const p of run.perks) if (p.count > (before.get(p.id) ?? 0)) pushEvent(rec, { t: at, k: 'perk', id: p.id });
  if (same) {
    // What you start with (or had when the companion first saw the run) isn't news; what's picked up after is.
    const had = new Set([...rec.carried, ...rec.events.filter((e) => e.k === 'spell').map((e) => e.id!)]);
    for (const id of new Set(carriedSpells(run))) if (!had.has(id)) pushEvent(rec, { t: at, k: 'spell', id });
    if (run.wands.length > rec.wands.length) pushEvent(rec, { t: at, k: 'wand' });
  }
  rec.carried = [...new Set([...rec.carried, ...carriedSpells(run)])].slice(0, 400);
  const hadItems = new Set(rec.events.filter((e) => e.k === 'item').map((e) => e.id));
  for (const it of run.items ?? []) if (!hadItems.has(it.id)) {
    hadItems.add(it.id);
    pushEvent(rec, { t: at, k: 'item', id: it.id, text: it.name });
  }
  const last = rec.hp.at(-1);
  if (run.hp !== undefined && run.maxHp) {
    if (last && last[1] / last[2] >= 0.25 && run.hp / run.maxHp < 0.25 && run.status !== 'dead') pushEvent(rec, { t: at, k: 'hp_low' });
    if (!last || at - last[0] >= HP_SAMPLE_MS || run.status === 'dead') {
      rec.hp.push([at, Math.max(0, Math.round(run.hp)), Math.round(run.maxHp)]);
      // Long runs: keep every other old sample.
      if (rec.hp.length > MAX_HP_SAMPLES) rec.hp = rec.hp.filter((_, i) => i % 2 === 0 || i >= rec.hp.length - 20);
    }
  }
  addFound(rec, [...liveFlags(run), ...(ctx.extra ?? [])], at, ctx.known);

  // The run's numbers.
  const depth = run.depth ?? 0;
  if (depth >= rec.maxDepth) {
    rec.maxDepth = depth;
    if (run.biome) rec.deepest = run.biome.name;
  }
  rec.gold = run.gold ?? rec.gold;
  if (run.kills !== undefined) rec.kills = run.kills;
  if (run.orbs !== undefined) rec.orbs = run.orbs;
  if (run.playtime !== undefined) rec.playtime = run.playtime;
  rec.perks = run.perks.map((p) => ({ ...p }));
  // The ground line sampled so far this run: the mod forgets it when the game restarts, the record doesn't.
  const ground = mergeSurface(rec.last?.surface, run.surface);
  rec.last = keepSnapshot(run);
  if (ground.length) rec.last.surface = ground;
  const ending = run.status === 'dead' || won;
  if (run.wands.length) {
    rec.held = { t: at, wands: rec.last.wands, flasks: rec.last.flasks, ...(rec.last.items ? { items: rec.last.items } : {}) };
  } else if (ending && rec.held && at - rec.held.t <= HELD_MS) {
    // The end took everything you carried (an older mod reports the inventory after the gold): show it as it was.
    rec.last.wands = rec.held.wands;
    rec.last.flasks = rec.held.flasks;
    if (rec.held.items) rec.last.items = rec.held.items;
  }
  rec.wands = rec.last.wands.map((w) => ({ ...w, mana: undefined }));
  if (won) {
    if (rec.outcome !== 'won') {
      rec.outcome = 'won';
      rec.endedAt = at;
      delete rec.killedBy;
      pushEvent(rec, { t: at, k: 'won' });
    }
  } else if (run.status === 'dead') {
    rec.outcome = 'died';
    rec.endedAt = at;
    if (run.killedBy) rec.killedBy = run.killedBy;
    pushEvent(rec, { t: at, k: 'died', text: run.killedBy });
  }
  rec.updatedAt = at;
  return { current: rec, closed, changed: true };
}

/** The run to show for a record: its last snapshot, or (records from before snapshots were kept) one rebuilt from it. */
export function snapshotOf(rec: RunRecord): LiveRun {
  if (rec.outcome === 'won') return { ...(rec.last ?? rebuilt(rec)), won: true };
  if (rec.last) return rec.outcome === 'died' ? { ...rec.last, status: 'dead', killedBy: rec.last.killedBy ?? rec.killedBy } : rec.last;
  return rebuilt(rec);
}

function rebuilt(rec: RunRecord): LiveRun {
  const hp = rec.hp.at(-1);
  return {
    status: rec.outcome === 'died' ? 'dead' : 'alive',
    seed: rec.seed,
    ngPlus: rec.ngPlus,
    ...(rec.deepest ? { biome: { id: '', name: rec.deepest } } : {}),
    ...(hp ? { hp: rec.outcome === 'died' ? 0 : hp[1], maxHp: hp[2] } : {}),
    gold: rec.gold,
    depth: rec.maxDepth,
    wands: rec.wands,
    flasks: [],
    spells: [],
    perks: rec.perks,
    ...(rec.kills !== undefined ? { kills: rec.kills } : {}),
    ...(rec.orbs !== undefined ? { orbs: rec.orbs } : {}),
    ...(rec.playtime !== undefined ? { playtime: rec.playtime } : {}),
    ...(rec.killedBy ? { killedBy: rec.killedBy } : {}),
  };
}

/** Every key discovered in any recorded run (they stay discovered after the run ends). */
export const foundKeys = (recs: RunRecord[]) => [...new Set(recs.flatMap((r) => r.found))];

// ---------- records from other devices ----------

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const KEY = /^[A-Za-z0-9_:$.-]{1,120}$/;
const EVENT_KINDS = new Set<RunEventKind>(['start', 'biome', 'perk', 'spell', 'wand', 'item', 'found', 'hp_low', 'died', 'won']);

/** A run record from another device: checked field by field, capped, or null. */
export function parseRunRecord(
  x: unknown,
  parseWand: (w: unknown) => LiveWand | null,
  parseRun?: (r: unknown) => LiveRun | null,
): RunRecord | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (!isStr(o.id, 64) || !isNum(o.seed) || !isNum(o.startedAt) || !isNum(o.updatedAt)) return null;
  const outcome = o.outcome === 'died' || o.outcome === 'ended' || o.outcome === 'ongoing' || o.outcome === 'won' ? o.outcome : null;
  if (!outcome) return null;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
  const lastRaw = o.last && typeof o.last === 'object' && !Array.isArray(o.last) ? { ...(o.last as object), v: 1 } : null;
  const last = lastRaw && parseRun ? parseRun(lastRaw) : null;
  return upgradeRecord({
    ...(outcome === 'won' && o.ending === 'ngplus' ? { ending: 'ngplus' as const } : {}),
    ...(last && last.seed === o.seed ? { last: keepSnapshot(last) } : {}),
    id: o.id,
    seed: o.seed,
    ngPlus: isNum(o.ngPlus) ? o.ngPlus : 0,
    device: isStr(o.device, 60) ? o.device : 'another device',
    startedAt: o.startedAt,
    ...(isNum(o.endedAt) ? { endedAt: o.endedAt } : {}),
    updatedAt: o.updatedAt,
    outcome,
    ...(isStr(o.killedBy, 120) ? { killedBy: o.killedBy } : {}),
    maxDepth: isNum(o.maxDepth) ? o.maxDepth : 0,
    ...(isStr(o.deepest, 80) ? { deepest: o.deepest } : {}),
    gold: isNum(o.gold) ? o.gold : 0,
    ...(isNum(o.kills) ? { kills: o.kills } : {}),
    ...(isNum(o.orbs) ? { orbs: o.orbs } : {}),
    ...(isNum(o.playtime) ? { playtime: o.playtime } : {}),
    perks: list(o.perks, 200).flatMap((p) => {
      const po = p as Record<string, unknown> | null;
      return po && isStr(po.id, 64) && KEY.test(po.id) && isNum(po.count) ? [{ id: po.id, count: Math.max(1, Math.floor(po.count)) }] : [];
    }),
    wands: list(o.wands, 4).flatMap((w) => parseWand(w) ?? []),
    events: list(o.events, MAX_EVENTS).flatMap((e) => {
      const eo = e as Record<string, unknown> | null;
      if (!eo || !isNum(eo.t) || !EVENT_KINDS.has(eo.k as RunEventKind)) return [];
      const ev: RunEvent = { t: eo.t, k: eo.k as RunEventKind };
      if (isStr(eo.id, 120) && KEY.test(eo.id)) ev.id = eo.id;
      if (isStr(eo.text, 120)) ev.text = eo.text;
      return [ev];
    }),
    hp: list(o.hp, MAX_HP_SAMPLES).flatMap((s) => (Array.isArray(s) && s.length === 3 && s.every(isNum) ? [s as [number, number, number]] : [])),
    found: list(o.found, 2000).filter((k): k is string => isStr(k, 120) && KEY.test(k)),
    carried: list(o.carried, 400).filter((k): k is string => isStr(k, 64) && KEY.test(k)),
  });
}

/** Merge records from elsewhere into ours: per run, the newer wins. Returns the merged list, newest first, capped. */
export function mergeRuns(mine: RunRecord[], theirs: RunRecord[]): RunRecord[] {
  const by = new Map(mine.map((r) => [r.id, r]));
  for (const r of theirs) {
    const have = by.get(r.id);
    if (!have || r.updatedAt > have.updatedAt) by.set(r.id, r);
  }
  return capRuns([...by.values()]);
}
