// Keeps several open tabs of the app in step: a change to progress in one tab is copied to the others.
import { useProgress } from '@/store/progress';

const KEYS = ['progress', 'mode', 'modeAt', 'revealed', 'revealedAt', 'onboarded'] as const;
type Shared = Pick<ReturnType<typeof useProgress.getState>, (typeof KEYS)[number]>;

let started = false;

export function startTabSync() {
  if (started || typeof BroadcastChannel === 'undefined') return;
  started = true;
  const ch = new BroadcastChannel('companion-tabs');
  let applying = false;
  ch.onmessage = (e: MessageEvent<{ kind: string; state: Shared }>) => {
    if (e.data?.kind !== 'progress') return;
    applying = true;
    useProgress.setState(e.data.state);
    applying = false;
  };
  useProgress.subscribe((s, prev) => {
    if (applying || KEYS.every((k) => s[k] === prev[k])) return;
    ch.postMessage({ kind: 'progress', state: Object.fromEntries(KEYS.map((k) => [k, s[k]])) as Shared });
  });
}
