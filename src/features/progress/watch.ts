// Live watching of a Noita save folder (File System Access handle). A cheap fingerprint decides whether
// anything changed; only then is the save re-read. FileSystemObserver (Chrome 133+) makes it instant,
// polling is the fallback and the safety net.
import { LIVE_FILE, filesFromHandle, type SaveFile } from './scan';

type Dir = FileSystemDirectoryHandle;
type Entry = FileSystemHandle;

const entries = async (dir: Dir): Promise<Entry[]> => {
  const out: Entry[] = [];
  for await (const e of (dir as unknown as { values(): AsyncIterable<Entry> }).values()) out.push(e);
  return out;
};
const child = async (dir: Dir, name: string, kind: 'file' | 'directory'): Promise<Entry | null> =>
  (await entries(dir)).find((e) => e.name === name && e.kind === kind) ?? null;

/** The save slot inside the picked folder: the folder itself, or save00 / the first saveNN in it. */
export async function resolveSaveDir(dir: Dir): Promise<Dir | null> {
  if (await child(dir, 'persistent', 'directory')) return dir;
  const slots = (await entries(dir)).filter((e) => e.kind === 'directory' && /^save\d\d$/.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  for (const s of slots) if (await child(s as Dir, 'persistent', 'directory')) return s as Dir;
  return null;
}

async function names(dir: Dir | null, path: string[]): Promise<string> {
  let d: Dir | null = dir;
  for (const p of path) d = d ? ((await child(d, p, 'directory')) as Dir | null) : null;
  return d ? (await entries(d)).map((e) => e.name).sort().join(',') : '-';
}

async function mtime(dir: Dir | null, path: string[]): Promise<number> {
  let d: Dir | null = dir;
  for (const p of path.slice(0, -1)) d = d ? ((await child(d, p, 'directory')) as Dir | null) : null;
  const f = d ? ((await child(d, path.at(-1)!, 'file')) as FileSystemFileHandle | null) : null;
  return f ? (await f.getFile()).lastModified : 0;
}

/**
 * Changes whenever Noita writes progress: a new flag or orb file, a new run in stats/sessions, or the
 * stats files rewritten at the end of a run (_stats.salakieli is rewritten with them).
 */
export async function fingerprint(save: Dir): Promise<string> {
  const parts = await Promise.all([
    names(save, ['persistent', 'flags']),
    names(save, ['persistent', 'orbs_new']),
    names(save, ['stats', 'sessions']),
    mtime(save, ['stats', '_stats.salakieli']).then(String),
  ]);
  return parts.join('|');
}

export type WatchCallbacks = {
  /** The save changed (or a forced sync): here are its files. */
  onScan: (files: SaveFile[]) => Promise<void> | void;
  /** The mod's live run file changed. */
  onLive?: (text: string, lastModified: number) => void;
  onError?: (e: Error) => void;
};

export type WatchOptions = { pollMs?: number; hiddenPollMs?: number; debounceMs?: number };

export type SaveWatch = { stop: () => void; syncNow: () => Promise<void> };

type ObserverRecord = { relativePathComponents?: string[] };
type ObserverCtor = new (cb: (records: ObserverRecord[]) => void) => { observe: (h: Dir, o: object) => Promise<void>; disconnect: () => void };

/** Start watching. The first check always scans, so the companion is current right away. */
export function startSaveWatch(root: Dir, cb: WatchCallbacks, opts: WatchOptions = {}): SaveWatch {
  const pollMs = opts.pollMs ?? 5000;
  const hiddenPollMs = opts.hiddenPollMs ?? 30000;
  const debounceMs = opts.debounceMs ?? 1500;
  let stopped = false;
  let last: string | null = null;
  let lastLive = 0;
  let save: Dir | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let observer: InstanceType<ObserverCtor> | null = null;

  const check = (force: boolean) =>
    (running ??= (async () => {
      try {
        save ??= await resolveSaveDir(root);
        if (!save) throw new Error("That folder doesn't look like a Noita save.");
        if (cb.onLive) {
          const t = await mtime(save, [LIVE_FILE]);
          if (t && t !== lastLive) {
            lastLive = t;
            const f = (await child(save, LIVE_FILE, 'file')) as FileSystemFileHandle;
            cb.onLive(await (await f.getFile()).text(), t);
          }
        }
        const fp = await fingerprint(save);
        if (force || fp !== last) {
          last = fp;
          await cb.onScan(await filesFromHandle(root));
        }
      } catch (e) {
        if (!stopped) cb.onError?.(e as Error);
      } finally {
        running = null;
      }
    })());

  const schedule = () => {
    clearTimeout(timer);
    if (stopped) return;
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    // With an observer, polling is just a slow safety net.
    const every = observer ? Math.max(hiddenPollMs, pollMs) : visible ? pollMs : hiddenPollMs;
    timer = setTimeout(() => void check(false).then(schedule), every);
  };

  const soon = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void check(false), debounceMs);
  };

  const Observer = (globalThis as unknown as { FileSystemObserver?: ObserverCtor }).FileSystemObserver;
  if (Observer) {
    try {
      observer = new Observer((records) => {
        // world/ chunks are rewritten constantly while playing; they don't matter here.
        if (records.some((r) => !r.relativePathComponents?.some((p) => p === 'world'))) soon();
      });
      observer.observe(root, { recursive: true }).catch(() => (observer = null));
    } catch {
      observer = null;
    }
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') soon();
    schedule();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  void check(true).then(schedule);

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(debounce);
      observer?.disconnect();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    },
    syncNow: async () => {
      await running;
      await check(true);
    },
  };
}
