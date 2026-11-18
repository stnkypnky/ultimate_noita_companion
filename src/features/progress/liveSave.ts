// Keeps the companion current with the save folder on this computer: remembers the picked folder,
// resumes watching on launch when the browser still grants access, and imports only real changes.
import { create } from 'zustand';
import { sameProgress, useProgress } from '@/store/progress';
import { deviceName } from '@/features/sync/device';
import { ScanError, canPickDirectory, parseSave, pickDirectory, type SaveFile } from './scan';
import { startSaveWatch, type SaveWatch } from './watch';

const HANDLE_KEY = 'save-dir';
const OFF_KEY = 'save-watch-off';

export type WatchStatus =
  /** No folder remembered (or watching switched off). */
  | 'idle'
  /** This browser can't keep a folder (Firefox, Safari): drop or pick each time. */
  | 'unsupported'
  /** A folder is remembered but the browser wants a click before reading it again. */
  | 'needs-permission'
  /** Another tab of the app is already watching. */
  | 'standby'
  | 'live'
  | 'error';

type State = {
  status: WatchStatus;
  hasHandle: boolean;
  /** When an actual change was last imported (ms). */
  lastChange?: number;
  /** When the folder was last read (ms). */
  lastScan?: number;
  error?: string;
};

export const useSaveWatch = create<State>(() => ({ status: 'idle', hasHandle: false }));

type Handle = FileSystemDirectoryHandle & {
  queryPermission?: (o: object) => Promise<PermissionState>;
  requestPermission?: (o: object) => Promise<PermissionState>;
};

// Dexie stays off the first page (see kv.ts).
const handles = async () => (await import('@/store/db')).db.handles;

let handle: Handle | null = null;
let watch: SaveWatch | null = null;
let releaseLock: (() => void) | null = null;
const liveHandlers = new Set<(text: string, at: number) => void>();

/** The mod's live run file (registered by the live feature, so this module stays small). */
export function onLiveFile(fn: (text: string, at: number) => void): () => void {
  liveHandlers.add(fn);
  return () => liveHandlers.delete(fn);
}

const offFlag = (on?: boolean) => {
  try {
    if (on === undefined) return localStorage.getItem(OFF_KEY) === '1';
    if (on) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* ignore */
  }
  return false;
};

/** Apply a freshly read save; returns whether anything changed. */
export async function applyScan(files: SaveFile[]): Promise<boolean> {
  const progress = await parseSave(files);
  useSaveWatch.setState({ lastScan: Date.now(), error: undefined });
  const current = useProgress.getState().progress;
  if (sameProgress(current, progress) && current?.savedAt) return false;
  useProgress.getState().updateProgress({ ...progress, source: deviceName() });
  useSaveWatch.setState({ lastChange: Date.now() });
  return true;
}

async function begin(h: Handle) {
  stopWatch();
  handle = h;
  offFlag(false);
  const run = () => {
    watch = startSaveWatch(h, {
      onScan: async (files) => {
        await applyScan(files);
        if (useSaveWatch.getState().status !== 'live') useSaveWatch.setState({ status: 'live' });
      },
      onLive: (text, at) => liveHandlers.forEach((fn) => fn(text, at)),
      onError: (e) => useSaveWatch.setState({ status: 'error', error: e instanceof ScanError ? e.message : `Couldn't read the save folder (${e.message}).` }),
    });
  };
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return run();
  useSaveWatch.setState({ status: 'standby' });
  // One tab watches; the others wait their turn and take over if it closes.
  void locks.request('noita-save-watch', () => {
    if (handle !== h) return;
    run();
    return new Promise<void>((resolve) => (releaseLock = resolve));
  });
}

function stopWatch() {
  watch?.stop();
  watch = null;
  releaseLock?.();
  releaseLock = null;
}

/** On launch: pick up where the player left off, without a click if the browser allows it. */
export async function initSaveWatch() {
  if (!canPickDirectory()) return useSaveWatch.setState({ status: 'unsupported' });
  const h = (await (await handles()).get(HANDLE_KEY).catch(() => undefined))?.handle as Handle | undefined;
  if (!h) return;
  handle = h;
  useSaveWatch.setState({ hasHandle: true });
  if (offFlag()) return;
  const perm = h.queryPermission ? await h.queryPermission({ mode: 'read' }).catch(() => 'prompt' as const) : 'granted';
  if (perm === 'granted') await begin(h);
  else useSaveWatch.setState({ status: 'needs-permission' });
}

/** Must run from a click: the folder picker, then live watching. */
export async function chooseSaveFolder() {
  const dir = (await pickDirectory()) as Handle;
  await (await handles()).put({ key: HANDLE_KEY, handle: dir });
  useSaveWatch.setState({ hasHandle: true });
  await begin(dir);
}

/** Must run from a click when the status is 'needs-permission' (or to restart after stopping). */
export async function resumeSaveWatch() {
  const h = handle;
  if (!h) return;
  if (h.requestPermission && (await h.requestPermission({ mode: 'read' })) !== 'granted') {
    useSaveWatch.setState({ status: 'needs-permission', error: 'Permission to read the folder was denied.' });
    return;
  }
  await begin(h);
}

export function stopSaveWatch() {
  stopWatch();
  offFlag(true);
  useSaveWatch.setState({ status: 'idle' });
}

/** Read the folder now, changed or not. */
export async function syncSaveNow() {
  if (watch) return watch.syncNow();
  return resumeSaveWatch();
}
