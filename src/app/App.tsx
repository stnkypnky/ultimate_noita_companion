import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Splash } from './Splash';
import { useGameData } from '@/data/store';

const MIN_SPLASH_MS = 1100;

export function App() {
  const status = useGameData((s) => s.status);
  const load = useGameData((s) => s.load);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void load();
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, [load]);

  const ready = minElapsed && status !== 'loading';

  return (
    <>
      {ready && <RouterProvider router={router} />}
      <AnimatePresence>{!ready && <Splash key="splash" />}</AnimatePresence>
    </>
  );
}
