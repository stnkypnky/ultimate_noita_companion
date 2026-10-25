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
  s: string;
  p: string;
  e: string;
  /** Other persistent flags (secret unlocks, progress_*, …). */
  f: string[];
  o: number[];
  r?: RunSummary;
};

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
  const known = new Set([...lists.spells, ...lists.perks].map((x) => x.discoverFlag));
  const payload: Payload = {
    v: 1,
    g: gameHash.slice(0, 8),
    t: progress.syncedAt,
    s: bitset(lists.spells.length, (i) => flags.has(lists.spells[i]!.discoverFlag)),
    p: bitset(lists.perks.length, (i) => flags.has(lists.perks[i]!.discoverFlag)),
    e: bitset(lists.enemies.length, (i) => enemies.has(lists.enemies[i]!.id)),
    f: progress.flags.filter((f) => !known.has(f)),
    o: progress.orbs,
    ...(progress.runs ? { r: progress.runs } : {}),
  };
  return packJson(payload);
}

export class SyncCodeError extends Error {}

export async function decodeProgress(code: string, lists: Lists, gameHash: string): Promise<{ progress: Progress; versionMismatch: boolean }> {
  let payload: Payload;
  try {
    payload = await unpackJson<Payload>(code);
  } catch {
    throw new SyncCodeError("That sync code couldn't be read. Make sure you copied all of it.");
  }
  if (payload.v !== 1) throw new SyncCodeError('This sync code was made by a newer version of the app.');
  const flags = [
    ...readBits(payload.s, lists.spells.length).map((i) => lists.spells[i]!.discoverFlag),
    ...readBits(payload.p, lists.perks.length).map((i) => lists.perks[i]!.discoverFlag),
    ...payload.f,
  ];
  return {
    progress: {
      syncedAt: payload.t,
      flags,
      enemies: readBits(payload.e, lists.enemies.length).map((i) => lists.enemies[i]!.id),
      orbs: payload.o,
      ...(payload.r ? { runs: payload.r } : {}),
    },
    versionMismatch: payload.g !== gameHash.slice(0, 8),
  };
}
