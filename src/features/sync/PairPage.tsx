import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Check, Loader2 } from 'lucide-react';
import { Page } from '@/ui/Page';
import { useHasSave } from '@/store/progress';
import { joinGroup, useSync } from './sync';

/** Landing page for a scanned pairing QR code: /pair#k=<key> */
export function PairPage() {
  const { hash } = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const peers = useSync((s) => s.peers);
  const hasSave = useHasSave();

  useEffect(() => {
    const key = new URLSearchParams(hash.slice(1)).get('k') ?? '';
    // Keep the key out of the address bar and history once it's stored.
    joinGroup(key).then(
      () => {
        setJoined(true);
        history.replaceState(null, '', location.pathname);
      },
      (e: Error) => setError(e.message),
    );
  }, [hash]);

  return (
    <Page title="Pair this device" subtitle="Keep your companions in sync">
      {error && <p className="mt-4 rounded-[var(--radius)] border border-blood/40 bg-blood/10 p-4 text-sm">{error}</p>}
      {joined && (
        <div className="mt-2 space-y-4 panel p-5">
          <p className="flex items-center gap-2 font-game text-[16px] text-toxic">
            <Check size={18} /> Paired
          </p>
          <p className="flex items-center gap-2 text-sm text-muted">
            {peers.length ? (
              <>Connected to {peers.map((p) => p.name).join(', ')}.</>
            ) : (
              <>
                <Loader2 size={15} className="animate-spin" /> Connecting to your other device…
              </>
            )}
          </p>
          <p className="text-sm text-muted">
            {hasSave ? 'Your progress is here. It updates by itself whenever your devices are open.' : 'Your progress will appear as soon as the other device connects.'}
          </p>
          <Link to="/" className="inline-flex btn-game font-game text-[16px] px-4 py-2">
            Go to Home
          </Link>
        </div>
      )}
    </Page>
  );
}
