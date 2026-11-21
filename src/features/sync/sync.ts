// Device sync, wired to the app: the pairing group, the connection, and the adapter that lets the engine
// read and merge progress, reveals, settings and saved builds.
import { create } from 'zustand';
import { APP_BUILD } from '@/app/version';
import { checkForUpdate } from '@/app/appUpdate';
import { useGameData } from '@/data/store';
import { saveTime, scanTime, useProgress } from '@/store/progress';
import { decodeProgress, encodeProgress } from '@/features/progress/codec';
import { deviceId, deviceName, setDeviceName } from './device';
import { buildTime, newerSave, startEngine, type BuildRecord, type Engine, type Kind, type Peer, type SyncAdapter } from './engine';
import { applySettings, settingsLog, watchSettings } from './settings';
import { broadcastTransport, p2pTransport, type Transport } from './transport';

const GROUP_KEY = 'sync-group';
const AUTO_KEY = 'sync-auto';

export type Group = { key: string; room: string };

type SyncState = {
  group: Group | null;
  /** Auto-sync with paired devices (on by default once paired). */
  auto: boolean;
  status: 'off' | 'connecting' | 'online' | 'error';
  peers: Peer[];
  /** Last thing that arrived from another device. */
  last?: { kind: Kind; from: string; at: number };
  /** Set when a device sent a save made for different game data (update the app on both). */
  mismatch?: string;
  error?: string;
};

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const storedGroup = (): Group | null => {
  try {
    const g = JSON.parse(ls.get(GROUP_KEY) ?? 'null') as Group | null;
    return g && typeof g.key === 'string' && typeof g.room === 'string' ? g : null;
  } catch {
    return null;
  }
};

export const useSync = create<SyncState>(() => ({
  group: storedGroup(),
  auto: ls.get(AUTO_KEY) !== '0',
  status: 'off',
  peers: [],
}));

// ---------- pairing ----------

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function roomFor(key: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`noita-companion:${key}`)));
  return [...hash.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const validPairKey = (k: string) => /^[A-Za-z0-9_-]{22}$/.test(k);

/** The group this device is in, creating one (as its first member) if needed. */
export async function ensureGroup(): Promise<Group> {
  const have = useSync.getState().group;
  if (have) return have;
  const key = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return joinGroup(key);
}

export async function joinGroup(key: string): Promise<Group> {
  if (!validPairKey(key)) throw new Error('That pairing link is incomplete. Scan the code again.');
  const group = { key, room: await roomFor(key) };
  ls.set(GROUP_KEY, JSON.stringify(group));
  useSync.setState({ group, auto: true });
  ls.set(AUTO_KEY, '1');
  await restart();
  return group;
}

export const pairLink = (g: Group) => `${location.origin}${import.meta.env.BASE_URL}pair#k=${g.key}`;

export async function unpair() {
  stop();
  ls.set(GROUP_KEY, null);
  useSync.setState({ group: null, peers: [], status: 'off', last: undefined });
}

export async function setAutoSync(on: boolean) {
  ls.set(AUTO_KEY, on ? '1' : '0');
  useSync.setState({ auto: on });
  await restart();
}

// ---------- adapter ----------

const lists = () => {
  const d = useGameData.getState().data;
  return d ? { lists: { spells: d.spells, perks: d.perks, enemies: d.enemies }, hash: d.version.gameHash } : null;
};

const dexie = () => import('@/store/db');

type Live = NonNullable<SyncAdapter['live']>;
const liveHooks: { get?: Live['get']; apply?: Live['apply']; subs: Set<() => void> } = { subs: new Set() };

/** The live-run feature plugs in here (kept out of this module so it loads only when used). */
export function registerLive(get: Live['get'], apply: Live['apply']) {
  liveHooks.get = get;
  liveHooks.apply = apply;
}
/** Tell paired devices the live run changed. */
export function liveChanged() {
  liveHooks.subs.forEach((f) => f());
}

type Runs = NonNullable<SyncAdapter['runs']>;
const runHooks: { all?: Runs['all']; apply?: Runs['apply']; subs: Set<() => void> } = { subs: new Set() };

/** Run history plugs in the same way. */
export function registerRuns(all: Runs['all'], apply: Runs['apply']) {
  runHooks.all = all;
  runHooks.apply = apply;
}
/** Tell paired devices the run history changed. */
export function runsChanged() {
  runHooks.subs.forEach((f) => f());
}

export const appAdapter: SyncAdapter = {
  progress: {
    time: () => saveTime(useProgress.getState().progress),
    scanned: () => scanTime(useProgress.getState().progress),
    encode: async () => {
      const p = useProgress.getState().progress;
      const l = lists();
      return p && l ? encodeProgress(p, l.lists, l.hash) : null;
    },
    apply: async (code) => {
      const l = lists();
      if (!l) return;
      const { progress, versionMismatch } = await decodeProgress(code, l.lists, l.hash);
      if (versionMismatch) {
        // Bitsets are indexed by this build's spell list; a different build would scramble them.
        useSync.setState({ mismatch: progress.source ?? 'another device' });
        return;
      }
      useSync.setState({ mismatch: undefined });
      const mine = useProgress.getState().progress;
      if (newerSave(saveTime(progress), scanTime(progress), saveTime(mine), mine ? scanTime(mine) : undefined)) useProgress.getState().updateProgress(progress);
    },
  },
  reveals: {
    get: () => useProgress.getState().revealedAt,
    apply: (log) => useProgress.getState().mergeReveals(log),
  },
  settings: { get: settingsLog, apply: (log) => void applySettings(log) },
  builds: {
    all: async () => {
      const { db } = await dexie();
      const [builds, dead] = await Promise.all([db.builds.toArray(), db.tombstones.toArray()]);
      return [...builds, ...dead] as BuildRecord[];
    },
    apply: async (recs) => {
      const { db } = await dexie();
      await db.transaction('rw', db.builds, db.tombstones, async () => {
        for (const r of recs) {
          const [b, t] = await Promise.all([db.builds.get(r.id), db.tombstones.get(r.id)]);
          const mine = b ? b.updatedAt : t ? t.deletedAt : -1;
          if (buildTime(r) <= mine) continue;
          if ('deletedAt' in r) {
            await db.builds.delete(r.id);
            await db.tombstones.put({ id: r.id, deletedAt: r.deletedAt });
          } else {
            await db.tombstones.delete(r.id);
            await db.builds.put({ id: r.id, name: r.name, code: r.code, createdAt: r.createdAt, updatedAt: r.updatedAt });
          }
        }
      });
    },
  },
  live: {
    get: () => liveHooks.get?.() ?? null,
    apply: (run, at, from) => liveHooks.apply?.(run, at, from),
  },
  runs: {
    all: async () => (runHooks.all ? runHooks.all() : []),
    apply: async (recs) => runHooks.apply?.(recs),
  },
  watch: (fn) => {
    const offProgress = useProgress.subscribe((s, p) => {
      if (s.progress !== p.progress) fn('progress');
      if (s.revealedAt !== p.revealedAt) fn('reveals');
    });
    const offSettings = watchSettings(() => fn('settings'));
    const onLive = () => fn('live');
    liveHooks.subs.add(onLive);
    const onRuns = () => fn('runs');
    runHooks.subs.add(onRuns);
    let offBuilds = () => {};
    let cancelled = false;
    void dexie().then(async ({ db }) => {
      const { liveQuery } = await import('dexie');
      if (cancelled) return;
      let first = true;
      const sub = liveQuery(() => Promise.all([db.builds.count(), db.builds.orderBy('updatedAt').last(), db.tombstones.toArray()])).subscribe(() => {
        if (first) first = false;
        else fn('builds');
      });
      offBuilds = () => sub.unsubscribe();
    });
    return () => {
      cancelled = true;
      offProgress();
      offSettings();
      offBuilds();
      liveHooks.subs.delete(onLive);
      runHooks.subs.delete(onRuns);
    };
  },
};

// ---------- connection ----------

let engine: Engine | null = null;
let generation = 0;
const local = () => ls.get('sync-transport') === 'local';
const tabId = Math.random().toString(36).slice(2, 8);

function stop() {
  generation++;
  engine?.stop();
  engine = null;
}

async function restart() {
  stop();
  const { group, auto } = useSync.getState();
  if (!group || !auto) return useSync.setState({ status: 'off', peers: [] });
  const gen = generation;
  useSync.setState({ status: 'connecting', error: undefined });
  let transport: Transport;
  try {
    transport = local() ? broadcastTransport(group.room) : await p2pTransport(group.room, group.key);
  } catch (e) {
    return useSync.setState({ status: 'error', error: `Couldn't start device sync (${(e as Error).message}).` });
  }
  if (gen !== generation) return transport.leave();
  engine = startEngine(
    transport,
    appAdapter,
    // Same-device testing: each tab acts as its own device.
    { id: local() ? `${deviceId()}-${tabId}` : deviceId(), name: deviceName(), build: APP_BUILD },
    {
      onPeers: (peers) => {
        useSync.setState({ peers, status: 'online' });
        // Another device already runs a newer version: fetch it here too.
        if (peers.some((p) => (p.build ?? 0) > APP_BUILD)) void checkForUpdate();
      },
      onReceived: (kind, from) => kind !== 'live' && useSync.setState({ last: { kind, from: from?.name ?? 'another device', at: Date.now() } }),
    },
  );
  useSync.setState({ status: 'online' });
}

let started = false;
/** On launch (after stored state and game data are in). */
export function startDeviceSync() {
  if (started) return;
  started = true;
  if (!engine) void restart();
}

/** Ask every paired device for anything newer now. */
export function syncDevicesNow() {
  if (engine) engine.resync();
  else void restart();
}

/** A new device name should reach peers: reconnect so the hello carries it. */
export function renameDeviceTo(name: string) {
  if (name.trim() === deviceName()) return;
  setDeviceName(name);
  if (useSync.getState().group) void restart();
}
