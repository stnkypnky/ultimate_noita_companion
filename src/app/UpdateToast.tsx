import { AnimatePresence, motion } from 'motion/react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Prompts to reload when a new version of the app has been downloaded. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  const show = needRefresh || offlineReady;
  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

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
          <span className="flex-1 text-sm">
            {needRefresh ? 'A new version is ready.' : 'Ready to work offline.'}
          </span>
          {needRefresh && (
            <button
              className="btn-game font-game text-[16px] px-3 py-1.5"
              onClick={() => void updateServiceWorker(true)}
            >
              Reload
            </button>
          )}
          <button className="px-2 py-1.5 text-sm text-muted hover:text-ink" onClick={close}>
            Dismiss
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
