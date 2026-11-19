// Run history, stored and synced. The device that reads the mod's file records each run (history.ts does
// the folding); paired devices receive the records. What a run discovered stays discovered on every device.
import { create } from 'zustand';
import { useProgress } from '@/store/progress';
import { deviceName } from '@/features/sync/device';
import { registerRuns, runsChanged } from '@/features/sync/sync';
import { MAX_RUNS, addFound, foldSnapshot, foundKeys, mergeRuns, parseRunRecord, type Known, type RunRecord } from './history';
import { parseLiveRun, parseLiveWand, type LiveRun } from './parse';
import { useLiveRun } from './state';
import type { WorldMap } from '@/data/types';
import { hiddenAreaAt, loadMap } from '@/features/map/world';

/** Paired devices hear about an ongoing run at most this often (and at once when it starts or ends). */
const PUSH_EVERY_MS = 30_000;

export const useRuns = create<{ records: RunRecord[]; loaded: boolean }>(() => ({ records: [], loaded: false }));

const dexie = () => import('@/store/db');
let current: RunRecord | null = null;
let pending: { run: LiveRun; at: number } | null = null;
let lastPush = 0;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function publish(records: RunRecord[]) {
  useRuns.setState({ records, loaded: true });
  const found = foundKeys(records);
  const have = useLiveRun.getState().found;
  if (found.length !== have.length || found.some((k, i) => k !== have[i])) useLiveRun.setState({ found });
}

/** Push now, or soon: an ongoing run only every PUSH_EVERY_MS. */
function schedulePush(now: boolean) {
  clearTimeout(pushTimer);
  const wait = now ? 0 : Math.max(0, lastPush + PUSH_EVERY_MS - Date.now());
  pushTimer = setTimeout(() => {
    lastPush = Date.now();
    runsChanged();
  }, wait);
}

async function save(recs: RunRecord[]) {
  const { db } = await dexie();
  const merged = mergeRuns(useRuns.getState().records, recs);
  await db.transaction('rw', db.runs, async () => {
    await db.runs.bulkPut(recs.filter((r) => merged.includes(r)));
    const keep = new Set(merged.map((r) => r.id));
    const drop = (await db.runs.toCollection().primaryKeys()).filter((id) => !keep.has(id));
    if (drop.length) await db.runs.bulkDelete(drop);
  });
  publish(merged);
}

/** What the save already knew (not counting the live run itself), plus earlier runs' discoveries. */
function knownBefore(except?: string): Known {
  const p = useProgress.getState().progress;
  const flags = new Set(p?.flags ?? []);
  const enemies = new Set((p?.enemies ?? []).map((e) => `enemy:${e}`));
  const earlier = new Set(foundKeys(useRuns.getState().records.filter((r) => r.id !== except)));
  return (key) => flags.has(key) || enemies.has(key) || earlier.has(key);
}

/** The world map, once loaded: to tell which area a snapshot's position is in. */
let worldMap: WorldMap | null = null;

/** Walking into a hidden map area discovers it. */
function areaFound(map: WorldMap, run: LiveRun): string[] {
  if (run.x === undefined || run.y === undefined || (run.status !== 'alive' && run.status !== 'paused')) return [];
  const key = hiddenAreaAt(map, run.x, run.y);
  return key ? [key] : [];
}

/** A snapshot read from the mod's file on this device. */
export function recordSnapshot(run: LiveRun, at: number) {
  if (!useRuns.getState().loaded) {
    // Read before the history finished loading: fold it in right after.
    pending = { run, at };
    return;
  }
  const extra = worldMap ? areaFound(worldMap, run) : [];
  const { current: next, closed, changed } = foldSnapshot(current, run, at, { known: knownBefore(current?.id), device: deviceName(), extra });
  if (!changed) return;
  const started = !!next && next.id !== current?.id;
  const ended = !!closed || (next?.outcome !== 'ongoing' && current?.outcome === 'ongoing');
  current = next;
  void save([...(closed ? [closed] : []), ...(next ? [next] : [])]).then(() => schedulePush(started || ended));
}

/** Spells and perks the save records mid-run (their flag files appear as you find them). */
function watchNewFlags() {
  return useProgress.subscribe((s, prev) => {
    if (!current || current.outcome !== 'ongoing' || !useLiveRun.getState().active || useLiveRun.getState().from !== null) return;
    const before = new Set(prev.progress?.flags ?? []);
    const fresh = (s.progress?.flags ?? []).filter((f) => !before.has(f));
    if (!fresh.length || !prev.progress) return;
    const rec = structuredClone(current);
    const earlier = knownBefore(rec.id);
    if (!addFound(rec, fresh, Date.now(), earlier)) return;
    current = rec;
    void save([rec]).then(() => schedulePush(false));
  });
}

let started = false;
export async function startRunHistory() {
  if (started) return;
  started = true;
  registerRuns(
    async () => useRuns.getState().records.map((r) => r as RunRecord),
    async (raw) => {
      const recs = raw.map((r) => parseRunRecord(r, parseLiveWand, parseLiveRun)).filter((r): r is RunRecord => !!r);
      const mine = new Map(useRuns.getState().records.map((r) => [r.id, r.updatedAt]));
      const newer = recs.filter((r) => r.updatedAt > (mine.get(r.id) ?? -1));
      if (!newer.length) return;
      // A newer copy of the run being recorded here (another recorder): follow it.
      const mineNow = newer.find((r) => r.id === current?.id);
      if (mineNow) current = mineNow;
      await save(newer);
    },
  );
  watchNewFlags();
  void loadMap().then(
    (m) => (worldMap = m),
    () => {},
  );
  const { db } = await dexie();
  const records = (await db.runs.toArray()).sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_RUNS);
  const me = deviceName();
  current = records.find((r) => r.outcome === 'ongoing' && r.device === me) ?? null;
  publish(records);
  if (pending) {
    const p = pending;
    pending = null;
    recordSnapshot(p.run, p.at);
  }
}
