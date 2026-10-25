import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence } from 'motion/react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Splash } from './Splash';
import { useGameData } from '@/data/store';
import { useProgress } from '@/store/progress';
import { useWand } from '@/features/wand/store';

// Long enough for the splash wand to light the whole title.
const MIN_SPLASH_MS = 1500;

// Persisted stores load asynchronously from IndexedDB; render only once both are in.
const PERSISTED = [useProgress, useWand] as const;
const subscribeHydration = (cb: () => void) => {
  const offs = PERSISTED.map((s) => s.persist.onFinishHydration(cb));
  return () => offs.forEach((off) => off());
};
const isHydrated = () => PERSISTED.every((s) => s.persist.hasHydrated());

export function App() {
  const status = useGameData((s) => s.status);
  const error = useGameData((s) => s.error);
  const load = useGameData((s) => s.load);
  const hydrated = useSyncExternalStore(subscribeHydration, isHydrated);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void load();
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, [load]);

  const ready = minElapsed && hydrated && status !== 'loading';

  return (
    <>
      {ready && status === 'ready' && <RouterProvider router={router} />}
      {ready && status === 'missing' && <LoadError error={error} />}
      <AnimatePresence>{!ready && <Splash key="splash" />}</AnimatePresence>
    </>
  );
}

function LoadError({ error }: { error?: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <h1 className="font-game text-[24px]">The arcane files are missing</h1>
        <p className="mt-2 text-sm text-muted">Game data couldn't be loaded. If you're offline, connect once so the app can cache it.</p>
        {error && <code className="mt-4 block text-xs text-faint">{error}</code>}
        <button onClick={() => location.reload()} className="mt-6 btn-game font-game text-[16px] px-4 py-2">
          Try again
        </button>
      </div>
    </div>
  );
}
