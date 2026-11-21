// Keeping the installed app up to date. The service worker downloads a new version in the background; this
// decides when to switch to it. Right after launch, or while the app is in the background, it switches by itself.
// While you're using it, it asks first: a reload can stop the save folder being watched until you allow it again.
import { create } from 'zustand';
import { useSaveWatch } from '@/features/progress/liveSave';

type UpdateState = {
  /** A new version is downloaded and waiting. */
  ready: boolean;
  /** "Later" was tapped: stop asking (it still switches by itself next time the app is in the background). */
  dismissed: boolean;
  offlineReady: boolean;
  /** Switching to it (the page reloads). */
  applying: boolean;
  checking: boolean;
  checkedAt?: number;
};

export const useAppUpdate = create<UpdateState>(() => ({ ready: false, dismissed: false, offlineReady: false, applying: false, checking: false }));

let registration: ServiceWorkerRegistration | undefined;
let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
let started = false;
const launchedAt = Date.now();

/** Switching mid-use is fine unless a save folder is being watched (it may need permission again after a reload). */
const quietToSwitch = () => document.hidden && useSaveWatch.getState().status !== 'live';

export function startAppUpdates() {
  if (started || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  started = true;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        useAppUpdate.setState({ ready: true });
        if (Date.now() - launchedAt < 20_000 || quietToSwitch()) void applyUpdate();
      },
      onOfflineReady: () => useAppUpdate.setState({ offlineReady: true }),
      onRegisteredSW: (_url, r) => {
        registration = r;
        setInterval(() => void checkForUpdate(), 30 * 60_000);
      },
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForUpdate();
    else if (useAppUpdate.getState().ready && quietToSwitch()) void applyUpdate();
  });
  // Once the new version has taken over, load it.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (useAppUpdate.getState().applying) location.reload();
  });
}

let lastCheck = 0;
/** Ask the server for a newer version (at most once a minute unless forced). */
export async function checkForUpdate(force = false) {
  if (!registration || (!force && Date.now() - lastCheck < 60_000)) return;
  lastCheck = Date.now();
  useAppUpdate.setState({ checking: true });
  try {
    await registration.update();
  } catch {
    /* offline */
  } finally {
    useAppUpdate.setState({ checking: false, checkedAt: Date.now() });
  }
}

/** Switch to the downloaded version and reload. */
export async function applyUpdate() {
  if (useAppUpdate.getState().applying) return;
  useAppUpdate.setState({ applying: true });
  // If the hand-over signal never arrives, reload anyway rather than sit there.
  setTimeout(() => location.reload(), 4000);
  try {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    await updateSW?.(true);
  } catch {
    /* the timeout reloads */
  }
}

/**
 * Last resort for an app stuck on an old or broken version: drop the stored copy of the app and load it fresh.
 * Your progress, builds and settings are kept (they live elsewhere).
 */
export async function repairApp() {
  useAppUpdate.setState({ applying: true });
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } finally {
    location.reload();
  }
}
