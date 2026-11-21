import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { applyUpdate, startAppUpdates, useAppUpdate } from './appUpdate';

/** Asks to reload when a new version is ready and the app couldn't switch to it by itself. */
export function UpdateToast() {
  const { ready, dismissed, offlineReady, applying } = useAppUpdate();
  useEffect(() => startAppUpdates(), []);

  const show = (ready && !dismissed) || offlineReady || applying;
  const close = () => useAppUpdate.setState({ dismissed: true, offlineReady: false });

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="fixed inset-x-4 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+12px)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-4 py-3 shadow-[var(--shadow)] md:bottom-6"
        >
          <span className="flex-1 text-sm">{applying ? 'Updating…' : ready ? 'A new version is ready.' : 'Ready to work offline.'}</span>
          {ready && !applying && (
            <button className="btn-game font-game text-[16px] px-3 py-1.5" onClick={() => void applyUpdate()}>
              Reload
            </button>
          )}
          {!applying && (
            <button className="px-2 py-1.5 text-sm text-muted hover:text-ink" onClick={close}>
              Later
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
