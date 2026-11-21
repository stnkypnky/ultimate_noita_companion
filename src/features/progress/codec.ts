// Compact, URL-safe encoding of a player's progress so a PC can hand it to a phone via QR code.
import type { Enemy, Perk, Spell } from '@/data/types';
import type { Progress, RunSummary } from '@/store/progress';
import { fromBase64Url, packJson, toBase64Url, unpackJson } from '../../lib/encoding';

type Lists = { spells: Pick<Spell, 'discoverFlag'>[]; perks: Pick<Perk, 'discoverFlag'>[]; enemies: Pick<Enemy, 'id'>[] };

type Payload = {
  v: 1;
  /** Game data build (first 8 of the version hash) the bitsets were made against. */
  g: string;
  t: string;
  /** When the save last changed, and which device read it (both optional, added for device sync). */
  a?: string;
  n?: string;
  s: string;
  p: string;
  e: string;
  /** The creatures the game counts (a subset of `e`); older codes lack it. */
  c?: string;
  /** Other persistent flags (secret unlocks, progress_*, …). */
  f: string[];
  o: number[];
  r?: RunSummary;
  /** Creature history: [index in the enemies list, how many died, times it killed you]. */
  k?: [number, number, number][];
  /** Deaths to a creature, newest first: [date, seed, index in the enemies list, cause]. */
  d?: [string, number, number, string][];
};

/** How many creature deaths a code carries (they're what the Run page and Bestiary need). */
const CODE_DEATHS = 20;

// ---------- bitsets ----------

function bitset(n: number, has: (i: number) => boolean): string {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) if (has(i)) bytes[i >> 3]! |= 1 << (i & 7);
  return toBase64Url(bytes);
}

function readBits(s: string, n: number): number[] {
  const bytes = fromBase64Url(s);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if ((bytes[i >> 3] ?? 0) & (1 << (i & 7))) out.push(i);
  return out;
}

// ---------- public API ----------

export async function encodeProgress(progress: Progress, lists: Lists, gameHash: string): Promise<string> {
  const flags = new Set(progress.flags);
  const enemies = new Set(progress.enemies);
  const counted = new Set(progress.counted);
  const known = new Set([...lists.spells, ...lists.perks].map((x) => x.discoverFlag));
  const payload: Payload = {
    v: 1,
    g: gameHash.slice(0, 8),
    t: progress.syncedAt,
    ...(progress.savedAt ? { a: progress.savedAt } : {}),
    ...(progress.source ? { n: progress.source.slice(0, 40) } : {}),
    s: bitset(lists.spells.length, (i) => flags.has(lists.spells[i]!.discoverFlag)),
    p: bitset(lists.perks.length, (i) => flags.has(lists.perks[i]!.discoverFlag)),
    e: bitset(lists.enemies.length, (i) => enemies.has(lists.enemies[i]!.id)),
    ...(progress.counted ? { c: bitset(lists.enemies.length, (i) => counted.has(lists.enemies[i]!.id)) } : {}),
    f: progress.flags.filter((f) => !known.has(f)),
    o: progress.orbs,
    ...(progress.runs ? { r: progress.runs } : {}),
  };
  const stats = progress.enemyStats;
  if (stats) {
    const k = lists.enemies.flatMap((e, i) => (stats[e.id] ? [[i, stats[e.id]!.died, stats[e.id]!.killedYou] as [number, number, number]] : []));
    if (k.length) payload.k = k;
  }
  const index = new Map(lists.enemies.map((e, i) => [e.id, i]));
  const d = (progress.deaths ?? [])
    .filter((x) => x.killer && index.has(x.killer))
    .slice(0, CODE_DEATHS)
    .map((x) => [x.date, x.seed, index.get(x.killer!)!, (x.cause ?? '').slice(0, 60)] as [string, number, number, string]);
  if (d.length) payload.d = d;
  return packJson(payload);
}

export class SyncCodeError extends Error {}

/** Codes also arrive from other devices, so check the shape before trusting it. */
function validRuns(r: unknown): r is RunSummary {
  const x = r as RunSummary;
  return (
    !!x &&
    typeof x === 'object' &&
    (['runs', 'deaths', 'playtimeSec', 'kills', 'bestGold'] as const).every((k) => Number.isFinite(x[k])) &&
    Array.isArray(x.recent) &&
    x.recent.every((e) => e && Number.isFinite(e.seed) && typeof e.date === 'string' && Number.isFinite(e.playtimeSec) && (e.killedBy === undefined || typeof e.killedBy === 'string'))
  );
}

export async function decodeProgress(code: string, lists: Lists, gameHash: string): Promise<{ progress: Progress; versionMismatch: boolean }> {
  let payload: Payload;
  try {
    payload = await unpackJson<Payload>(code);
  } catch {
    throw new SyncCodeError("That sync code couldn't be read. Make sure you copied all of it.");
  }
  if (payload?.v !== 1) throw new SyncCodeError('This sync code was made by a newer version of the app.');
  const ok =
    typeof payload.t === 'string' &&
    typeof payload.s === 'string' &&
    typeof payload.p === 'string' &&
    typeof payload.e === 'string' &&
    (payload.c === undefined || typeof payload.c === 'string') &&
    Array.isArray(payload.f) &&
    payload.f.every((x) => typeof x === 'string') &&
    Array.isArray(payload.o) &&
    payload.o.every((x) => Number.isInteger(x)) &&
    (payload.a === undefined || typeof payload.a === 'string') &&
    (payload.n === undefined || typeof payload.n === 'string') &&
    (payload.k === undefined || (Array.isArray(payload.k) && payload.k.every((x) => Array.isArray(x) && x.length === 3 && x.every(Number.isFinite)))) &&
    (payload.r === undefined || validRuns(payload.r)) &&
    (payload.d === undefined ||
      (Array.isArray(payload.d) &&
        payload.d.every((x) => Array.isArray(x) && x.length === 4 && typeof x[0] === 'string' && Number.isFinite(x[1]) && Number.isInteger(x[2]) && typeof x[3] === 'string')));
  if (!ok) throw new SyncCodeError("That sync code couldn't be read. Make sure you copied all of it.");
  const flags = [
    ...readBits(payload.s, lists.spells.length).map((i) => lists.spells[i]!.discoverFlag),
    ...readBits(payload.p, lists.perks.length).map((i) => lists.perks[i]!.discoverFlag),
    ...payload.f,
  ];
  return {
    progress: {
      syncedAt: payload.t,
      ...(payload.a ? { savedAt: payload.a } : {}),
      ...(payload.n ? { source: payload.n } : {}),
      flags,
      enemies: readBits(payload.e, lists.enemies.length).map((i) => lists.enemies[i]!.id),
      ...(payload.c !== undefined ? { counted: readBits(payload.c, lists.enemies.length).map((i) => lists.enemies[i]!.id) } : {}),
      ...(payload.k
        ? { enemyStats: Object.fromEntries(payload.k.filter(([i]) => lists.enemies[i]).map(([i, died, killedYou]) => [lists.enemies[i]!.id, { died, killedYou }])) }
        : {}),
      orbs: payload.o,
      ...(payload.r ? { runs: payload.r } : {}),
      ...(payload.d?.length
        ? {
            deaths: payload.d
              .filter(([, , i]) => lists.enemies[i])
              .map(([date, seed, i, cause]) => ({ date, seed, killer: lists.enemies[i]!.id, ...(cause ? { cause } : {}) })),
          }
        : {}),
    },
    versionMismatch: payload.g !== gameHash.slice(0, 8),
  };
}
