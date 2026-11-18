// The live-run store on its own (no app imports), so the spoiler hook can read it without a cycle.
import { create } from 'zustand';
import { itemKey, materialKey } from '@/data/spoilers';
import type { LiveRun } from './parse';

/** Quieter than this and the game is probably closed (the mod rewrites at least every 30 s). */
export const STALE_MS = 90_000;

type LiveState = {
  run: LiveRun | null;
  /** When the mod last wrote it (ms). */
  at: number;
  /** Device it came from; null = this one. */
  from: string | null;
  /** A game is running right now: a snapshot newer than STALE_MS. */
  active: boolean;
  /** Spoiler keys discovered during recorded runs (run history), on every paired device. */
  found: string[];
};

export const useLiveRun = create<LiveState>(() => ({ run: null, at: 0, from: null, active: false, found: [] }));

let staleTimer: ReturnType<typeof setTimeout> | undefined;

/** Store a new snapshot; `active` turns itself off once it goes stale. */
export function setLiveRun(run: LiveRun, at: number, from: string | null, now = Date.now()) {
  clearTimeout(staleTimer);
  const left = at + STALE_MS - now;
  useLiveRun.setState({ run, at, from, active: left > 0 });
  if (left > 0) staleTimer = setTimeout(() => useLiveRun.setState({ active: false }), left);
}

/** True while a game is running (on this device or a paired one). */
export const useRunActive = () => useLiveRun((s) => s.active);

/** Spoiler flags for what's in hand right now: you can see it in-game, so it isn't a spoiler. */
export function liveFlags(run: LiveRun | null): string[] {
  if (!run) return [];
  const spells = [...run.wands.flatMap((w) => [...w.spells.map((s) => s.id), ...w.alwaysCasts]), ...run.spells.map((s) => s.id)];
  return [
    ...spells.map((id) => `action_${id.toLowerCase()}`),
    ...run.perks.map((p) => `perk_picked_${p.id.toLowerCase()}`),
    // A flask's tooltip names what's in it.
    ...run.flasks.flatMap((f) => f.contents.map((c) => materialKey(c.material))),
    // Mod 2: creatures you've met this run and the items you carry.
    ...(run.seen ?? []).map((id) => `enemy:${id}`),
    ...(run.items ?? []).map((it) => itemKey(it.id)),
  ];
}
