// Wires the current run from the companion mod: read from the save folder on the PC, or relayed by a
// paired device. Kept in memory only; the next file write or relay brings it back.
import { onLiveFile } from '@/features/progress/liveSave';
import { liveChanged, registerLive } from '@/features/sync/sync';
import { parseLiveRun } from './parse';
import { setLiveRun, useLiveRun } from './state';

let started = false;
export function startLiveRun() {
  if (started) return;
  started = true;
  onLiveFile((text, at) => {
    const run = parseLiveRun(text);
    if (!run || at <= useLiveRun.getState().at) return;
    setLiveRun(run, at, null);
    liveChanged();
  });
  registerLive(
    () => {
      const { run, at } = useLiveRun.getState();
      // Relayed in the mod's own format, so the receiving device checks it with the same parser.
      return run ? { run: { v: 1, ...run }, at } : null;
    },
    (raw, at, from) => {
      const run = parseLiveRun(raw);
      if (!run || at <= useLiveRun.getState().at) return;
      setLiveRun(run, at, from);
    },
  );
}
