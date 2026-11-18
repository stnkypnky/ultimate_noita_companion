import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useProgress } from '@/store/progress';

/**
 * First launch: the companion needs a synced save before its features unlock. Spoiler protection follows the
 * save; "Show everything" is in Settings once synced.
 */
export function Onboarding() {
  const onboarded = useProgress((s) => s.onboarded);
  const hasSave = useProgress((s) => s.progress !== null);
  const setOnboarded = useProgress((s) => s.setOnboarded);
  const setMode = useProgress((s) => s.setMode);
  const navigate = useNavigate();
  // Arriving from a sync or pairing QR code: that page itself syncs.
  const path = useLocation().pathname;
  const importing = path.startsWith('/import') || path.startsWith('/pair');

  const go = (to: string) => {
    setMode('progress');
    setOnboarded();
    navigate(to);
  };

  return (
    <AnimatePresence>
      {!onboarded && !hasSave && !importing && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-end bg-black/80 sm:place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboard-title"
            className="panel safe-bottom max-h-dvh w-full max-w-md overflow-y-auto p-6 short:p-4"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="font-game-caps text-[16px] text-gold">Welcome, seeker</div>
            <h2 id="onboard-title" className="mt-1 font-game text-[24px]">Bring your save</h2>
            <p className="mt-2 text-sm text-muted">
              The companion is built around your own game. Sync your Noita save and it shows what you’ve discovered, keeps the
              rest a secret, and unlocks every section. Your save is read in your browser and never uploaded.
            </p>
            <div className="mt-5 space-y-2">
              <Option
                icon={<RefreshCw size={18} />}
                title="Sync my save"
                text="On the PC where Noita is installed, or with a sync code from it."
                onClick={() => go('/progress')}
                primary
              />
              <Option icon={<ArrowRight size={18} />} title="Look around first" text="See what the companion offers. Everything unlocks once you sync." onClick={() => go('/')} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Option({ icon, title, text, onClick, primary }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      data-active={primary || undefined}
      className="slot slot-hover flex w-full items-start gap-3 p-4 text-left"
    >
      <span className={`mt-0.5 ${primary ? 'text-ember' : 'text-muted'}`}>{icon}</span>
      <span>
        <span className="font-game block text-[16px]">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </button>
  );
}
