import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Lock } from 'lucide-react';
import { useHasSave, useProgressHydrated } from '@/store/progress';
import { SyncSave } from '@/features/progress/SyncSave';
import { isOpenPath } from './nav';

/**
 * The companion's features need a synced save: until there is one, every section but Home, Progress Sync,
 * sync-code import and Settings shows how to sync instead.
 */
export function SaveGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const hydrated = useProgressHydrated();
  const hasSave = useHasSave();
  if (isOpenPath(pathname) || hasSave) return <>{children}</>;
  // Don't flash the lock while the stored save is still loading.
  if (!hydrated) return null;
  return <SaveRequired />;
}

export function SaveRequired() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-10 pb-10 md:px-8">
      <div className="panel p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center bg-surface-2 text-ember">
            <Lock size={22} />
          </span>
          <div>
            <div className="font-game-caps text-[16px] text-gold">Save required</div>
            <h1 className="font-game text-[24px] leading-tight">Sync your save to use the companion</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Everything here is tailored to your own game: what you’ve discovered, what’s still a secret. Sync your Noita save once and
          every section unlocks.
        </p>
        <div className="mt-5">
          <SyncSave compact />
        </div>
        <p className="mt-4 text-center text-xs text-faint">
          More options on <Link to="/progress" className="text-muted underline hover:text-ink">Progress Sync</Link>.
        </p>
      </div>
    </div>
  );
}
