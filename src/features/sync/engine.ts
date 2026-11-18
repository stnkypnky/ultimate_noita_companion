// The device-sync protocol. When two devices meet they swap a short digest of what they hold, then each
// sends whatever the other is missing or has older. After that, local changes are pushed as they happen.
// Everything that arrives is someone else's data: it is shape-checked here and merged by the adapter.
import type { RevealLog } from '@/store/progress';
import type { Transport } from './transport';

export type BuildRecord = { id: string; name: string; code: string; createdAt: number; updatedAt: number } | { id: string; deletedAt: number };
export const buildTime = (b: BuildRecord) => ('deletedAt' in b ? b.deletedAt : b.updatedAt);

export type SettingsLog = Record<string, { value: string; t: number }>;

export type Kind = 'progress' | 'reveals' | 'settings' | 'builds' | 'live';

export type SyncAdapter = {
  progress: {
    /** How recent the local save is (ms, 0 = none). */
    time: () => number;
    encode: () => Promise<string | null>;
    /** Apply a code if it's newer than what's here. */
    apply: (code: string, at: number) => Promise<void>;
  };
  reveals: { get: () => RevealLog; apply: (log: RevealLog) => void };
  settings: { get: () => SettingsLog; apply: (log: SettingsLog) => void };
  builds: { all: () => Promise<BuildRecord[]>; apply: (recs: BuildRecord[]) => Promise<void> };
  live?: { get: () => { run: unknown; at: number } | null; apply: (run: unknown, at: number, from: string) => void };
  /** Calls back whenever local state of a kind changes (also after remote data was applied). */
  watch: (fn: (kind: Kind) => void) => () => void;
};

export type Peer = { peerId: string; id: string; name: string };

export type EngineHooks = {
  onPeers?: (peers: Peer[]) => void;
  onReceived?: (kind: Kind, from: Peer | undefined) => void;
};

type Digest = { p: number; r: [number, number]; s: [number, number]; b: Record<string, number> };

const logDigest = (log: Record<string, { t: number }>): [number, number] => [Math.max(0, ...Object.values(log).map((e) => e.t)), Object.keys(log).length];

const str = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

function validBuild(x: unknown): x is BuildRecord {
  if (!obj(x) || !str(x.id, 64)) return false;
  if ('deletedAt' in x) return num(x.deletedAt);
  return str(x.name, 120) && str(x.code, 8192) && num(x.createdAt) && num(x.updatedAt);
}

function validLog(x: unknown, value: 'boolean' | 'string'): boolean {
  if (!obj(x)) return false;
  const entries = Object.entries(x);
  return (
    entries.length <= 20000 &&
    entries.every(([k, e]) => k.length <= 200 && obj(e) && num(e.t) && (value === 'boolean' ? typeof e.on === 'boolean' : str(e.value, 2000)))
  );
}

function validDigest(x: unknown): x is Digest {
  if (!obj(x) || !num(x.p) || !obj(x.b)) return false;
  const pair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(num);
  return pair(x.r) && pair(x.s) && Object.values(x.b).every(num);
}

export type Engine = { stop: () => void; resync: () => void; peers: () => Peer[] };

export function startEngine(transport: Transport, adapter: SyncAdapter, me: { id: string; name: string }, hooks: EngineHooks = {}): Engine {
  const peers = new Map<string, Peer>();
  /** What each kind looked like when last pushed, so builds go out as a delta. */
  let sentBuilds = new Map<string, number>();
  let stopped = false;

  const emitPeers = () => hooks.onPeers?.([...peers.values()]);

  const digest = async (): Promise<Digest> => ({
    p: adapter.progress.time(),
    r: logDigest(adapter.reveals.get()),
    s: logDigest(adapter.settings.get()),
    b: Object.fromEntries((await adapter.builds.all()).map((b) => [b.id, buildTime(b)])),
  });

  const hello = async (to?: string) => transport.send({ k: 'hello', v: 1, id: me.id, name: me.name, d: await digest() }, to);

  const sendProgress = async (to?: string) => {
    const code = await adapter.progress.encode();
    if (code) transport.send({ k: 'progress', code, at: adapter.progress.time() }, to);
  };
  const sendLive = (to?: string) => {
    const live = adapter.live?.get();
    if (live) transport.send({ k: 'live', run: live.run, at: live.at }, to);
  };

  /** On meeting a peer: send what it lacks. It does the same for us. */
  const answer = async (to: string, d: Digest) => {
    if (adapter.progress.time() > d.p) await sendProgress(to);
    // Logs merge per key either way, so any difference means both sides send theirs.
    const differs = (a: [number, number], b: [number, number]) => a[0] !== b[0] || a[1] !== b[1];
    if (differs(logDigest(adapter.reveals.get()), d.r)) transport.send({ k: 'reveals', log: adapter.reveals.get() }, to);
    if (differs(logDigest(adapter.settings.get()), d.s)) transport.send({ k: 'settings', log: adapter.settings.get() }, to);
    const newer = (await adapter.builds.all()).filter((b) => buildTime(b) > (d.b[b.id] ?? -1));
    if (newer.length) transport.send({ k: 'builds', recs: newer }, to);
    sendLive(to);
  };

  const pushBuilds = async () => {
    const all = await adapter.builds.all();
    const changed = all.filter((b) => sentBuilds.get(b.id) !== buildTime(b));
    sentBuilds = new Map(all.map((b) => [b.id, buildTime(b)]));
    if (changed.length && peers.size) transport.send({ k: 'builds', recs: changed });
  };

  const push = (kind: Kind) => {
    if (stopped || !peers.size) {
      if (kind === 'builds') void pushBuilds();
      return;
    }
    if (kind === 'progress') void sendProgress();
    else if (kind === 'reveals') transport.send({ k: 'reveals', log: adapter.reveals.get() });
    else if (kind === 'settings') transport.send({ k: 'settings', log: adapter.settings.get() });
    else if (kind === 'builds') void pushBuilds();
    else if (kind === 'live') sendLive();
  };

  transport.onPeer((peerId, joined) => {
    if (stopped) return;
    if (joined) void hello(peerId);
    else if (peers.delete(peerId)) emitPeers();
  });

  transport.onMessage((m, from) => {
    if (stopped || !obj(m)) return;
    const peer = peers.get(from);
    const got = (kind: Kind) => hooks.onReceived?.(kind, peer);
    void (async () => {
      switch (m.k) {
        case 'hello': {
          if (m.v !== 1 || !str(m.id, 64) || !str(m.name, 60) || !validDigest(m.d) || m.id === me.id) return;
          const known = peers.has(from);
          peers.set(from, { peerId: from, id: m.id, name: m.name });
          emitPeers();
          // Peers join at slightly different times: make sure each side has said hello once.
          if (!known) void hello(from);
          await answer(from, m.d);
          return;
        }
        case 'progress':
          if (!str(m.code, 64 * 1024) || !num(m.at) || m.at <= adapter.progress.time()) return;
          await adapter.progress.apply(m.code, m.at);
          return got('progress');
        case 'reveals':
          if (!validLog(m.log, 'boolean')) return;
          adapter.reveals.apply(m.log as RevealLog);
          return got('reveals');
        case 'settings':
          if (!validLog(m.log, 'string')) return;
          adapter.settings.apply(m.log as SettingsLog);
          return got('settings');
        case 'builds':
          if (!Array.isArray(m.recs) || m.recs.length > 2000 || !m.recs.every(validBuild)) return;
          await adapter.builds.apply(m.recs);
          return got('builds');
        case 'live':
          if (!adapter.live || !num(m.at) || m.run === undefined) return;
          adapter.live.apply(m.run, m.at, peer?.name ?? 'another device');
          return got('live');
      }
    })().catch(() => {});
  });

  void adapter.builds.all().then((all) => (sentBuilds = new Map(all.map((b) => [b.id, buildTime(b)]))));
  const unwatch = adapter.watch(push);

  return {
    stop: () => {
      stopped = true;
      unwatch();
      transport.leave();
      peers.clear();
      emitPeers();
    },
    /** Ask everyone for anything newer, and offer ours. */
    resync: () => void hello(),
    peers: () => [...peers.values()],
  };
}
