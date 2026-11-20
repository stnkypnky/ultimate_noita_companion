// Small pure helpers for the Run page (kept free of UI imports so they're easy to test).
import type { WorldMap } from '@/data/types';
import { chunkOf, holyMountains } from '@/features/map/world';
import type { LiveRun } from './parse';

/** Which Holy Mountain comes next below the player (1-based), or null past the last one. */
export function nextMountain(map: WorldMap, y: number): number | null {
  const { cy } = chunkOf(map, 0, y);
  for (const [row, n] of holyMountains(map)) if (row > cy) return n;
  return null;
}

/**
 * Perks taken so far, as the seed report's per-mountain picks. The mod doesn't say where each was taken, so
 * they all count as taken at the mountain before the next one: right for which perks have left the deck,
 * approximate after Extra Perk or Gamble.
 */
export function picksBefore(run: Pick<LiveRun, 'perks'>, next: number): string[][] {
  if (next <= 1) return [];
  const taken = run.perks.flatMap((p) => Array<string>(p.count).fill(p.id));
  return [...Array.from({ length: next - 2 }, () => [] as string[]), taken];
}

/** "$animal_zombie_weak" → "zombie weak". */
export const killedByText = (s: string) => s.replace(/^\$animal_/, '').replace(/_/g, ' ');

/** "$damage_explosion" → "explosion"; "damage from material: acid" → "acid". */
export const causeText = (s: string) =>
  s
    .replace(/^\$damage_/, '')
    .replace(/^damage from material:\s*/, '')
    .replace(/_/g, ' ')
    .trim();

type Named = { id: string; name: string };
type Death = { date: string; seed: number; killer?: string; cause?: string };

/**
 * What killed you, from the game's "<who> | <cause>": `who` is a creature id (mod 4, kills files), an
 * "$animal_<id>" key, a translated name (older saves), or empty, as the game writes it now (" | bite"). An empty
 * one is looked up in the save's deaths (its _kills.xml keeps the creature) by seed, nearest to `at` (ms).
 */
export function resolveKiller(
  s: string,
  enemies: readonly Named[],
  opts: { seed?: number; at?: number; deaths?: readonly Death[] } = {},
): { enemy?: Named; who?: string; cause?: string } {
  const i = s.indexOf('|');
  let who = (i < 0 ? s : s.slice(0, i)).trim();
  let cause = i < 0 ? '' : s.slice(i + 1).trim();
  if (who === 'NULL') who = '';
  if (!who && opts.seed !== undefined && opts.deaths) {
    const same = opts.deaths.filter((d) => d.seed === opts.seed && d.killer);
    const at = opts.at;
    const best = at === undefined ? same[0] : [...same].sort((a, b) => Math.abs(Date.parse(a.date) - at) - Math.abs(Date.parse(b.date) - at))[0];
    if (best) {
      who = best.killer!;
      cause ||= best.cause ?? '';
    }
  }
  const id = who.replace(/^\$animal_/, '');
  const lower = who.toLowerCase();
  const enemy = who ? enemies.find((e) => e.id === id) ?? enemies.find((e) => e.name.toLowerCase() === lower) : undefined;
  return { ...(enemy ? { enemy } : {}), ...(who && !enemy ? { who: killedByText(who) } : {}), ...(cause ? { cause: causeText(cause) } : {}) };
}

/** "Kalmamato (bite)", "zombie weak", "explosion". */
export function killerLabel(k: ReturnType<typeof resolveKiller>): string {
  const name = k.enemy?.name ?? k.who;
  return name ? (k.cause ? `${name} (${k.cause})` : name) : k.cause ?? 'unknown';
}

/** "4:05", "1:02:09". */
export function clock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
