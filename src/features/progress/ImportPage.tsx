import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AlertTriangle, Download } from 'lucide-react';
import { useData } from '@/data/store';
import { useProgress, type Progress } from '@/store/progress';
import { Page } from '@/ui/Page';
import { ProgressSummary } from './ProgressSummary';
import { decodeProgress } from './codec';

/** Landing page for a scanned sync QR code: /import#p=<code> */
export function ImportPage() {
  const { hash } = useLocation();
  const { spells, perks, enemies, version } = useData();
  const importProgress = useProgress((s) => s.importProgress);
  const navigate = useNavigate();
  const [result, setResult] = useState<{ progress: Progress; versionMismatch: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(hash.slice(1)).get('p');
    if (!code) return setError('This link has no progress code in it.');
    decodeProgress(code, { spells, perks, enemies }, version.gameHash).then(setResult, (e: Error) => setError(e.message));
  }, [hash, spells, perks, enemies, version.gameHash]);

  return (
    <Page title="Import progress" subtitle="From your PC's Noita save">
      {error && <p className="mt-4 rounded-[var(--radius)] border border-blood/40 bg-blood/10 p-4 text-sm">{error}</p>}
      {result && (
        <div className="mt-2 space-y-4">
          <ProgressSummary progress={result.progress} />
          {result.versionMismatch && (
            <p className="flex gap-2 rounded-[var(--radius)] border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
              <AlertTriangle size={18} className="shrink-0" />
              This code was made with a different game data version. Most progress will still carry over; re-sync if anything looks off.
            </p>
          )}
          <button
            onClick={() => {
              importProgress(result.progress);
              navigate('/', { replace: true });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ember px-4 py-3 font-semibold text-bg sm:w-auto"
          >
            <Download size={18} /> Use this progress on this device
          </button>
          <p className="text-xs text-faint">Replaces any progress previously synced here. Individually revealed items stay revealed.</p>
        </div>
      )}
    </Page>
  );
}
