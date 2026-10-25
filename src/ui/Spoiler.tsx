import { useState } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import { Link } from 'react-router';

/** Shown in place of something the player hasn't discovered yet. */
export function HiddenNotice({ what, onReveal }: { what: string; onReveal: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted">
        <EyeOff size={24} />
      </span>
      <h2 className="mt-4 font-display text-xl">Undiscovered {what}</h2>
      <p className="mt-1 max-w-xs text-sm text-muted">
        You haven't found this one in-game yet. Sync your progress to unlock what you've discovered, or reveal just this
        one.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {confirm ? (
          <button onClick={onReveal} className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-bg">
            <Eye size={16} /> Yes, show me
          </button>
        ) : (
          <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 py-2 text-sm">
            <Eye size={16} /> Reveal this {what}
          </button>
        )}
        <Link to="/progress" className="rounded-xl px-4 py-2 text-sm text-muted hover:text-ink">
          Sync progress
        </Link>
      </div>
    </div>
  );
}

/** Inline secret (e.g. an unlock condition) that needs a deliberate tap to show. */
export function InlineSpoiler({ children, label = 'Show spoiler' }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted hover:text-ink">
      <EyeOff size={13} /> {label}
    </button>
  );
}
