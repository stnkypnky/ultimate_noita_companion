import { Link } from 'react-router';
import { useSaveWatch } from '@/features/progress/liveSave';
import { useSync } from './sync';

/** A small live indicator in the corner: save watching on this PC, and paired devices online. */
export function SyncChip() {
  const watching = useSaveWatch((s) => s.status);
  const { group, auto, peers } = useSync();
  const live = watching === 'live';
  const paired = !!group && auto;
  if (!live && !paired && watching !== 'needs-permission') return null;

  const label =
    watching === 'needs-permission' && !live
      ? 'Resume sync'
      : [live ? 'Live' : null, paired ? (peers.length ? `${peers.length} device${peers.length > 1 ? 's' : ''}` : 'No devices online') : null]
          .filter(Boolean)
          .join(' · ');
  const on = live || peers.length > 0;

  return (
    <Link
      to="/progress"
      title="Progress Sync"
      className="safe-top pointer-events-auto fixed right-3 top-2 z-20 inline-flex items-center gap-1.5 rounded-full border border-line bg-raised/90 px-2.5 py-1 text-[11px] text-muted shadow hover:text-ink md:right-4 md:top-3"
    >
      <span className={`h-2 w-2 rounded-full ${on ? 'animate-pulse bg-toxic' : watching === 'needs-permission' ? 'bg-gold' : 'bg-faint'}`} aria-hidden />
      {label}
    </Link>
  );
}
