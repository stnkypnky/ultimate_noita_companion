import { useMemo, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from './kv';
import { liveFlags, useLiveRun } from '@/features/live/state';

export type RunSummary = {
  runs: number;
  deaths: number;
  playtimeSec: number;
  kills: number;
  bestGold: number;
  /** Most recent runs first. */
  recent: { seed: number; date: string; playtimeSec: number; killedBy?: string }[];
};

/** One creature's history from save00/stats/stats_<id>.xml (the maps are only in local progress, not sync codes). */
export type EnemyStat = {
  died: number;
  killedYou: number;
  /** Killed by you, per damage cause ("$damage_projectile" → 14). */
  byYou?: Record<string, number>;
  /** Killed by other creatures (their ids). */
  byOthers?: Record<string, number>;
  /** Killed by the world: fire, drowning, materials… */
  byWorld?: Record<string, number>;
  /** What it has killed (creature ids, not you). */
  victims?: Record<string, number>;
};

/** A run that ended in death, from stats/sessions/<stamp>_kills.xml and _stats.xml. */
export type DeathRecord = {
  /** "2026-11-19T18:49:13", the session's start. */
  date: string;
  seed: number;
  /** The creature that killed you (enemy id), when one did. */
  killer?: string;
  /** "bite", "$damage_explosion", "damage from material: acid". */
  cause?: string;
};

export type Progress = {
  syncedAt: string;
  /** When the save itself last changed (newest file time). Missing on older syncs; see `saveTime`. */
  savedAt?: string;
  /** Name of the device that read the save. */
  source?: string;
  /** Persistent flags from save00/persistent/flags (action_*, perk_picked_*, card_unlocked_*, progress_*). */
  flags: string[];
  /** Enemy ids seen, from save00/stats/stats_<enemy>.xml. */
  enemies: string[];
  /** From the same files: how many of each have died, and how many times one killed you. */
  enemyStats?: Record<string, EnemyStat>;
  orbs: number[];
  runs?: RunSummary;
  /** Deaths, newest first (capped), with what killed you. */
  deaths?: DeathRecord[];
};

/** How recent this save is, for picking the newest between devices (ms; 0 if unknown). */
export const saveTime = (p: Progress | null | undefined) => (p ? Date.parse(p.savedAt ?? p.syncedAt) || 0 : 0);

/** Same discoveries, ignoring when or where it was read. */
export function sameProgress(a: Progress | null, b: Progress | null): boolean {
  if (!a || !b) return a === b;
  const strip = ({ syncedAt: _s, savedAt: _a, source: _n, ...rest }: Progress) => ({
    ...rest,
    flags: [...rest.flags].sort(),
    enemies: [...rest.enemies].sort(),
    enemyStats: Object.entries(rest.enemyStats ?? {}).sort(([x], [y]) => x.localeCompare(y)),
  });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/**
 * 'progress' — show only what the save says you've discovered (plus anything revealed by hand).
 * 'all'      — no spoiler protection.
 */
export type SpoilerMode = 'progress' | 'all';

type ProgressState = {
  onboarded: boolean;
  mode: SpoilerMode;
  progress: Progress | null;
  /** Spoiler keys revealed individually (derived from `revealedAt`). */
  revealed: string[];
  /** Every reveal or re-hide with its time, so devices can merge them (newest wins per key). */
  revealedAt: RevealLog;
  /** When the spoiler mode was last changed by hand (ms), for syncing it. */
  modeAt: number;
  setMode: (m: SpoilerMode) => void;
  setOnboarded: () => void;
  importProgress: (p: Progress) => void;
  /** A background update (live watch, another device): keeps the spoiler mode the player chose. */
  updateProgress: (p: Progress) => void;
  clearProgress: () => void;
  reveal: (key: string) => void;
  hideAgain: (key: string) => void;
  /** Re-hide every individually revealed item. */
  hideAll: () => void;
  /** Merge reveals from another device. */
  mergeReveals: (log: RevealLog) => void;
};

export type RevealLog = Record<string, { on: boolean; t: number }>;

const revealedFrom = (log: RevealLog) => Object.keys(log).filter((k) => log[k]!.on);

export const useProgress = create<ProgressState>()(
  persist(
    (set) => {
      const logged = (s: ProgressState, keys: string[], on: boolean) => {
        const t = Date.now();
        const revealedAt = { ...s.revealedAt };
        for (const k of keys) revealedAt[k] = { on, t };
        return { revealedAt, revealed: revealedFrom(revealedAt) };
      };
      return {
        onboarded: false,
        mode: 'progress',
        progress: null,
        revealed: [],
        revealedAt: {},
        modeAt: 0,
        setMode: (mode) => set({ mode, modeAt: Date.now() }),
        setOnboarded: () => set({ onboarded: true }),
        importProgress: (progress) => set((s) => ({ progress, onboarded: true, mode: 'progress', modeAt: s.mode === 'progress' ? s.modeAt : Date.now() })),
        updateProgress: (progress) => set({ progress, onboarded: true }),
        clearProgress: () => set({ progress: null }),
        reveal: (key) => set((s) => (s.revealed.includes(key) ? s : logged(s, [key], true))),
        hideAgain: (key) => set((s) => logged(s, [key], false)),
        hideAll: () => set((s) => logged(s, s.revealed, false)),
        mergeReveals: (log) =>
          set((s) => {
            const revealedAt = mergeRevealLogs(s.revealedAt, log);
            return revealedAt === s.revealedAt ? s : { revealedAt, revealed: revealedFrom(revealedAt) };
          }),
      };
    },
    {
      name: 'progress',
      storage: createJSONStorage(() => idbStorage),
      version: 2,
      migrate: (old, version) => {
        const s = old as ProgressState;
        // v1 kept only the list; date old reveals at 1 so any real change elsewhere beats them.
        if (version < 2) return { ...s, revealedAt: Object.fromEntries((s.revealed ?? []).map((k) => [k, { on: true, t: 1 }])), modeAt: 0 };
        return s;
      },
    },
  ),
);

/** Per key, the newest entry wins; on a tie, revealed wins. Returns `a` itself when nothing changes. */
export function mergeRevealLogs(a: RevealLog, b: RevealLog): RevealLog {
  let out: RevealLog | null = null;
  for (const [k, e] of Object.entries(b)) {
    if (!e || typeof e.t !== 'number' || typeof e.on !== 'boolean') continue;
    const mine = a[k];
    if (!mine || e.t > mine.t || (e.t === mine.t && e.on && !mine.on)) (out ??= { ...a })[k] = { on: e.on, t: e.t };
  }
  return out ?? a;
}

/** Whether the stored progress has loaded from IndexedDB yet (so a missing save isn't judged too early). */
export function useProgressHydrated() {
  return useSyncExternalStore(
    (cb) => useProgress.persist.onFinishHydration(cb),
    () => useProgress.persist.hasHydrated(),
    () => false,
  );
}

/** The app's features need a synced save (a save folder read, or a sync code from one). */
export const useHasSave = () => useProgress((s) => s.progress !== null);

/** Returns a stable predicate: is this spoiler key visible to the player? */
export function useSpoilers() {
  const mode = useProgress((s) => s.mode);
  const flags = useProgress((s) => s.progress?.flags);
  const enemies = useProgress((s) => s.progress?.enemies);
  const revealed = useProgress((s) => s.revealed);
  const reveal = useProgress((s) => s.reveal);
  // What's in hand in the current run (companion mod) is on screen in-game, so it isn't hidden either.
  const run = useLiveRun((s) => s.run);
  // Discovered during a run (creatures met, secret items carried…), before the save itself records them.
  const found = useLiveRun((s) => s.found);

  return useMemo(() => {
    const known = new Set<string>([...(flags ?? []), ...(enemies ?? []).map((e) => `enemy:${e}`), ...revealed, ...liveFlags(run), ...found]);
    const flagSet = new Set(flags ?? []);
    const visible = (key: string) => mode === 'all' || known.has(key);
    return { mode, visible, reveal, hasFlag: (f: string) => flagSet.has(f) };
  }, [mode, flags, enemies, revealed, reveal, run, found]);
}
