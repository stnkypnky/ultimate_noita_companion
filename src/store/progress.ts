import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from './db';

export type RunSummary = { runs: number; wins: number; deaths: number; bestDepth?: number; playtimeSec?: number };

export type Progress = {
  syncedAt: string;
  /** Persistent flags from save00/persistent/flags (action_*, perk_picked_*, card_unlocked_*, progress_*). */
  flags: string[];
  /** Enemy ids seen, from save00/stats/stats_<enemy>.xml. */
  enemies: string[];
  orbs: number[];
  runs?: RunSummary;
};

/**
 * 'progress' — show only what the save says you've discovered (plus anything revealed by hand).
 * 'all'      — no spoiler protection.
 */
export type SpoilerMode = 'progress' | 'all';

type ProgressState = {
  onboarded: boolean;
  mode: SpoilerMode;
  progress: Progress | null;
  /** Spoiler keys revealed individually. */
  revealed: string[];
  setMode: (m: SpoilerMode) => void;
  setOnboarded: () => void;
  importProgress: (p: Progress) => void;
  clearProgress: () => void;
  reveal: (key: string) => void;
  hideAgain: (key: string) => void;
};

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      onboarded: false,
      mode: 'progress',
      progress: null,
      revealed: [],
      setMode: (mode) => set({ mode }),
      setOnboarded: () => set({ onboarded: true }),
      importProgress: (progress) => set({ progress, onboarded: true, mode: 'progress' }),
      clearProgress: () => set({ progress: null }),
      reveal: (key) => set((s) => (s.revealed.includes(key) ? s : { revealed: [...s.revealed, key] })),
      hideAgain: (key) => set((s) => ({ revealed: s.revealed.filter((k) => k !== key) })),
    }),
    { name: 'progress', storage: createJSONStorage(() => idbStorage), version: 1 },
  ),
);

/** Returns a stable predicate: is this spoiler key visible to the player? */
export function useSpoilers() {
  const mode = useProgress((s) => s.mode);
  const flags = useProgress((s) => s.progress?.flags);
  const enemies = useProgress((s) => s.progress?.enemies);
  const revealed = useProgress((s) => s.revealed);
  const reveal = useProgress((s) => s.reveal);

  return useMemo(() => {
    const known = new Set<string>([...(flags ?? []), ...(enemies ?? []).map((e) => `enemy:${e}`), ...revealed]);
    const flagSet = new Set(flags ?? []);
    const visible = (key: string) => mode === 'all' || known.has(key);
    return { mode, visible, reveal, hasFlag: (f: string) => flagSet.has(f) };
  }, [mode, flags, enemies, revealed, reveal]);
}
