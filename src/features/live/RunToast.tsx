// "Run in progress — Open live view": once per run, when a game starts and you're elsewhere in the app.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { useLiveRun } from './state';

const AUTO_HIDE_MS = 15_000;
const SHOWN_KEY = 'run-toast-shown';

/** Runs already announced in this browser session, so a reload doesn't pop the toast again. */
const shownSeeds = () => {
  try {
    return new Set<number>(JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]') as number[]);
  } catch {
    return new Set<number>();
  }
};
const rememberShown = (s: Set<number>) => {
  try {
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...s].slice(-20)));
  } catch {
    /* not remembered */
  }
};

export function RunToast() {
  const active = useLiveRun((s) => s.active);
  const seed = useLiveRun((s) => s.run?.seed ?? 0);
  const biome = useLiveRun((s) => s.run?.biome?.name);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const shown = useRef(shownSeeds());

  useEffect(() => {
    if (!active || shown.current.has(seed)) return;
    shown.current.add(seed);
    rememberShown(shown.current);
    if (pathname === '/run') return;
    setShow(true);
    const t = setTimeout(() => setShow(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
    // Only a new run (or the game coming back) should pop it, not moving around the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, seed]);

  useEffect(() => {
    if (pathname === '/run') setShow(false);
  }, [pathname]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="fixed inset-x-4 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+12px)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-[var(--radius)] border border-toxic/40 bg-surface-2 px-4 py-3 shadow-[var(--shadow)] md:bottom-6"
        >
          <LiveCrystal size={24} />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">Run in progress</span>
            {biome && <span className="block truncate text-xs text-muted">{biome}</span>}
          </span>
          <button className="btn-game font-game text-[16px] px-3 py-1.5" onClick={() => navigate('/run')}>
            Open live view
          </button>
          <button className="px-2 py-1.5 text-sm text-muted hover:text-ink" onClick={() => setShow(false)}>
            Dismiss
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
