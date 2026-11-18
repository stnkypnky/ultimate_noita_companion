import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { Check, ClipboardCopy, Smartphone, Trash2 } from 'lucide-react';
import { useData } from '@/data/store';
import { useProgress, type Progress } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Section } from '@/ui/controls';
import { useIsDesktop } from '@/ui/hooks';
import { ProgressSummary } from './ProgressSummary';
import { encodeProgress } from './codec';
import { PasteCode, PhoneHowTo, ScanSave } from './SyncSave';
import { DevicesPanel } from '@/features/sync/DevicesPanel';
import { useSync } from '@/features/sync/sync';

export function ProgressPage() {
  const progress = useProgress((s) => s.progress);
  const importProgress = useProgress((s) => s.importProgress);
  const clearProgress = useProgress((s) => s.clearProgress);
  const desktop = useIsDesktop();
  const paired = useSync((s) => !!s.group);

  return (
    <Page title="Progress Sync" subtitle="Spoiler protection based on what you've actually discovered">
      {progress ? (
        <Section
          title="Your progress"
          aside={
            <span className="text-xs text-faint">
              Save from {new Date(progress.savedAt ?? progress.syncedAt).toLocaleString()}
              {progress.source ? ` · ${progress.source}` : ''}
            </span>
          }
        >
          <ProgressSummary progress={progress} />
          <div className="mt-3 flex flex-wrap gap-2">
            <ShareToPhone progress={progress} />
            <button
              onClick={clearProgress}
              title={paired ? 'Paired devices will send it back; unpair first to forget it everywhere' : undefined}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:text-blood"
            >
              <Trash2 size={15} /> Forget progress{paired ? ' on this device' : ''}
            </button>
          </div>
        </Section>
      ) : (
        <p className="mt-2 panel p-4 text-sm text-muted">
          No save synced yet. The companion needs your save to know what you’ve discovered, so its features unlock once you sync.
        </p>
      )}

      {(desktop || !paired) && (
        <Section title={desktop ? 'Sync from this computer' : 'Sync from your PC'}>
          {desktop ? <ScanSave onScanned={importProgress} /> : <PhoneHowTo />}
        </Section>
      )}

      <Section title="Your devices">
        <DevicesPanel />
      </Section>

      <Section title="Have a sync code?">
        <p className="mb-2 text-sm text-muted">For a one-off copy without pairing, e.g. when the other device is offline.</p>
        <PasteCode />
      </Section>
    </Page>
  );
}

function ShareToPhone({ progress }: { progress: Progress }) {
  const { spells, perks, enemies, version } = useData();
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const code = await encodeProgress(progress, { spells, perks, enemies }, version.gameHash);
      const url = `${location.origin}${import.meta.env.BASE_URL}import#p=${code}`;
      setLink(url);
      // Low error correction keeps the code sparse enough for phone cameras to read off a screen.
      setSvg(await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'L', color: { dark: '#0d0b10', light: '#ffffff' } }));
    })();
  }, [open, progress, spells, perks, enemies, version.gameHash]);

  return (
    <>
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 btn-game font-game text-[16px] px-4 py-2">
        <Smartphone size={16} /> {open ? 'Hide sync code' : 'One-off sync code'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full overflow-hidden"
          >
            <div className="mt-2 flex flex-col items-center gap-4 panel p-5 sm:flex-row sm:items-start">
              <div className="w-72 max-w-full shrink-0 overflow-hidden rounded-xl" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="text-sm text-muted">
                <p>Scan with your phone's camera to open the companion with your progress.</p>
                <p className="mt-2">Or copy the link and send it to yourself:</p>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="mt-2 inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-3 py-1.5"
                >
                  {copied ? <Check size={15} className="text-toxic" /> : <ClipboardCopy size={15} />} {copied ? 'Copied' : 'Copy link'}
                </button>
                <p className="mt-3 text-xs text-faint">{link.length} characters · encodes discoveries only, no personal data</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
