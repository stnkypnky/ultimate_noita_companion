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

/** "4:05", "1:02:09". */
export function clock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
