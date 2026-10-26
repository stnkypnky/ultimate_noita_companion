import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useProgress } from '@/store/progress';

/** First launch: decide how spoilers are handled before showing any game content. */
export function Onboarding() {
  const onboarded = useProgress((s) => s.onboarded);
  const setOnboarded = useProgress((s) => s.setOnboarded);
  const setMode = useProgress((s) => s.setMode);
  const navigate = useNavigate();
  // Arriving from a sync QR code: the import page itself answers the question.
  const importing = useLocation().pathname.startsWith('/import');

  const choose = (mode: 'progress' | 'all', thenSync = false) => {
    setMode(mode);
    setOnboarded();
    if (thenSync) navigate('/progress');
  };

  return (
    <AnimatePresence>
      {!onboarded && !importing && (
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
            className="panel safe-bottom w-full max-w-md p-6"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="font-game-caps text-[16px] text-gold">Welcome, seeker</div>
            <h2 id="onboard-title" className="mt-1 font-game text-[24px]">How much do you want to know?</h2>
            <p className="mt-2 text-sm text-muted">
              Noita is full of secrets. The companion can hide everything you haven't discovered in-game yet.
            </p>
            <div className="mt-5 space-y-2">
              <Option
                icon={<RefreshCw size={18} />}
                title="Sync my progress"
                text="Show only what my save file says I've found. Best on the PC where Noita is installed."
                onClick={() => choose('progress', true)}
                primary
              />
              <Option
                icon={<EyeOff size={18} />}
                title="Hide everything for now"
                text="Start fully spoiler-free. You can sync or reveal things one at a time later."
                onClick={() => choose('progress')}
              />
              <Option icon={<Eye size={18} />} title="Show me everything" text="No spoiler protection. I've seen it all." onClick={() => choose('all')} />
            </div>
            <p className="mt-4 text-center text-[11px] text-faint">You can change this any time in Settings.</p>
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
