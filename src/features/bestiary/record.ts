// "Your record" with a creature: what the save's stats files say. Pure, so it's easy to test.
import type { DeathRecord, EnemyStat } from '@/store/progress';
import { causeText } from '@/features/live/runMath';

export type Count = { key: string; n: number };

export type Record_ = {
  died: number;
  killedYou: number;
  /** You killed it, by damage cause ("projectile"). */
  byYou: Count[];
  youKilled: number;
  /** Other creatures that killed it (ids; a few are effects, not creatures). */
  byOthers: Count[];
  /** The world: fire, drowning, materials. */
  byWorld: Count[];
  /** Creatures it has killed (ids). */
  victims: Count[];
  /** Your deaths to it, newest first. */
  deaths: DeathRecord[];
};

const NICE: Record<string, string> = { physicshit: 'physics', radioactive: 'toxic', healthstealing: 'life steal', electricity: 'electric' };
/** "$damage_physicshit" → "physics"; "damage from material: acid" → "acid". */
export const causeLabel = (s: string) => {
  const c = causeText(s);
  return NICE[c] ?? c;
};

const counts = (m: Record<string, number> | undefined, label = (k: string) => k): Count[] => {
  const merged = new Map<string, number>();
  for (const [k, n] of Object.entries(m ?? {})) merged.set(label(k), (merged.get(label(k)) ?? 0) + n);
  return [...merged].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
};

export function recordOf(id: string, stat: EnemyStat | undefined, deaths: readonly DeathRecord[] | undefined): Record_ | null {
  const mine = (deaths ?? []).filter((d) => d.killer === id);
  if (!stat && !mine.length) return null;
  const byYou = counts(stat?.byYou, causeLabel);
  return {
    died: stat?.died ?? 0,
    killedYou: Math.max(stat?.killedYou ?? 0, mine.length),
    byYou,
    youKilled: byYou.reduce((s, c) => s + c.n, 0),
    byOthers: counts(stat?.byOthers),
    byWorld: counts(stat?.byWorld, causeLabel),
    victims: counts(stat?.victims),
    deaths: mine,
  };
}
