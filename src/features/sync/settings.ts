// Preferences that follow the player between paired devices. They live in localStorage, written by their
// own components, so changes are noticed by a light poll and stamped with the time they were seen.
// Device-specific ones (range performance mode, frame rate, perf probes, collapsed sections) never sync.
import { useProgress, type SpoilerMode } from '@/store/progress';
import type { SettingsLog } from './engine';

export const SYNCED_SETTINGS = [
  'map-spoilers',
  'map-seed',
  'wand-view',
  'wand-random-tier',
  'range-auto',
  'range-distance',
  'range-target',
  'range-wall',
  'range-biome',
] as const;

/** The spoiler mode lives in the progress store; it syncs under this name. */
const MODE = 'spoiler-mode';
const LOG_KEY = 'sync-settings-log';

const allowed = new Set<string>([...SYNCED_SETTINGS, MODE]);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

let log: SettingsLog = (() => {
  try {
    return JSON.parse(read(LOG_KEY) ?? '{}') as SettingsLog;
  } catch {
    return {};
  }
})();
const save = () => write(LOG_KEY, JSON.stringify(log));

/** Stamp any setting whose value changed since we last looked. Returns whether something did. */
export function scanSettings(now = Date.now()): boolean {
  let changed = false;
  for (const k of SYNCED_SETTINGS) {
    const v = read(k);
    if (v !== null && log[k]?.value !== v) {
      // First sight of an old value: date it 1 so a real change on another device wins.
      log = { ...log, [k]: { value: v, t: log[k] ? now : 1 } };
      changed = true;
    }
  }
  const { mode, modeAt } = useProgress.getState();
  if (log[MODE]?.value !== mode || (modeAt && log[MODE]!.t < modeAt)) {
    log = { ...log, [MODE]: { value: mode, t: modeAt || 1 } };
    changed = true;
  }
  if (changed) save();
  return changed;
}

export const settingsLog = () => log;

/** Take any newer values from another device. Returns whether something changed here. */
export function applySettings(remote: SettingsLog): boolean {
  let changed = false;
  for (const [k, e] of Object.entries(remote)) {
    if (!allowed.has(k) || !e || typeof e.value !== 'string' || typeof e.t !== 'number') continue;
    if (log[k] && log[k]!.t >= e.t) continue;
    log = { ...log, [k]: { value: e.value, t: e.t } };
    if (k === MODE) {
      if (e.value === 'progress' || e.value === 'all') useProgress.setState({ mode: e.value as SpoilerMode, modeAt: e.t });
    } else write(k, e.value);
    changed = true;
  }
  if (changed) save();
  return changed;
}

/** Calls back when a local setting changes. */
export function watchSettings(fn: () => void): () => void {
  const tick = () => scanSettings() && fn();
  const t = setInterval(tick, 3000);
  const unsub = useProgress.subscribe((s, p) => s.mode !== p.mode && tick());
  const onVis = () => tick();
  document.addEventListener('visibilitychange', onVis);
  scanSettings();
  return () => {
    clearInterval(t);
    unsub();
    document.removeEventListener('visibilitychange', onVis);
  };
}
