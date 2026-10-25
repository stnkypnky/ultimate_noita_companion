import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import { useIsDesktop } from './hooks';

/**
 * List + detail. Laptop: persistent side panel next to the list.
 * Phone/tablet: detail slides up as a draggable bottom sheet over the list.
 */
export function MasterDetail({
  list,
  detail,
  detailKey,
  onClose,
  empty,
}: {
  list: ReactNode;
  detail: ReactNode | null;
  detailKey?: string;
  onClose: () => void;
  empty?: ReactNode;
}) {
  const desktop = useIsDesktop();
  const drag = useDragControls();

  useEffect(() => {
    if (!detail) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [detail, onClose]);

  if (desktop) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0">{list}</div>
        <aside className="sticky top-[calc(var(--page-header-h,88px)+4px)] h-[calc(100vh-var(--page-header-h,88px)-24px)] overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={detailKey ?? 'empty'}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.16 }}
              className="scrollbar-thin h-full overflow-y-auto p-5"
            >
              {detail ?? empty}
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>
    );
  }

  return (
    <>
      {list}
      <AnimatePresence>
        {detail && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              className="safe-bottom fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-[22px] border-t border-line-strong bg-surface shadow-[var(--shadow)]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              drag="y"
              dragControls={drag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) onClose();
              }}
            >
              <div className="flex touch-none items-center justify-center pt-2.5 pb-3" onPointerDown={(e) => drag.start(e)}>
                <span className="h-1.5 w-10 rounded-full bg-line-strong" />
              </div>
              <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 rounded-full bg-surface-2 p-2 text-muted">
                <X size={16} />
              </button>
              <div className="scrollbar-thin overflow-y-auto overscroll-contain px-5 pt-2 pb-8">{detail}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
