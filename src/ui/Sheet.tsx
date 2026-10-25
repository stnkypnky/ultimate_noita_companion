import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useIsDesktop } from './hooks';

/** Modal panel: bottom sheet on phones, centred dialog on laptops. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const desktop = useIsDesktop();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-[65] flex bg-black/60 backdrop-blur-[2px] ${desktop ? 'items-center justify-center p-6' : 'items-end'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className={`safe-bottom flex max-h-[85vh] w-full flex-col shadow-[var(--shadow)] ${
              desktop ? 'panel max-w-lg' : 'border-t-2 border-gold/60 bg-[#0d0a09f2]'
            }`}
            initial={desktop ? { scale: 0.96, opacity: 0 } : { y: '100%' }}
            animate={desktop ? { scale: 1, opacity: 1 } : { y: 0 }}
            exit={desktop ? { scale: 0.96, opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <header className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="font-game text-[24px]">{title}</h2>
              <button aria-label="Close" onClick={onClose} className="slot slot-hover p-2 text-muted hover:text-ink">
                <X size={16} />
              </button>
            </header>
            <div className="scrollbar-thin overflow-y-auto px-5 pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
