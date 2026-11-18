// The live-run store on its own (no app imports), so the spoiler hook can read it without a cycle.
import { create } from 'zustand';
import type { LiveRun } from './parse';

type LiveState = {
  run: LiveRun | null;
  /** When the mod last wrote it (ms). */
  at: number;
  /** Device it came from; null = this one. */
  from: string | null;
};

export const useLiveRun = create<LiveState>(() => ({ run: null, at: 0, from: null }));

/** Spoiler flags for what's in hand right now: you can see it in-game, so it isn't a spoiler. */
export function liveFlags(run: LiveRun | null): string[] {
  if (!run) return [];
  const spells = [...run.wands.flatMap((w) => [...w.spells.map((s) => s.id), ...w.alwaysCasts]), ...run.spells.map((s) => s.id)];
  return [...spells.map((id) => `action_${id.toLowerCase()}`), ...run.perks.map((p) => `perk_picked_${p.id.toLowerCase()}`)];
}
