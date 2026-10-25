import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { Check, ClipboardCopy, FolderOpen, Laptop, RefreshCw, Smartphone, Trash2, Upload } from 'lucide-react';
import { useData } from '@/data/store';
import { db } from '@/store/db';
import { useProgress, type Progress } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Section } from '@/ui/controls';
import { useIsDesktop } from '@/ui/hooks';
import { ProgressSummary } from './ProgressSummary';
import { SyncCodeError, decodeProgress, encodeProgress } from './codec';
import { SAVE_PATH, ScanError, canPickDirectory, filesFromDrop, filesFromHandle, filesFromInput, parseSave, pickDirectory, type SaveFile } from './scan';

const HANDLE_KEY = 'save-dir';

export function ProgressPage() {
  const progress = useProgress((s) => s.progress);
  const importProgress = useProgress((s) => s.importProgress);
  const clearProgress = useProgress((s) => s.clearProgress);
  const desktop = useIsDesktop();

  return (
    <Page title="Progress Sync" subtitle="Spoiler protection based on what you've actually discovered">
      {progress ? (
        <Section
          title="Your progress"
          aside={
            <span className="text-xs text-faint">Synced {new Date(progress.syncedAt).toLocaleString()}</span>
          }
        >
          <ProgressSummary progress={progress} />
          <div className="mt-3 flex flex-wrap gap-2">
            <ShareToPhone progress={progress} />
            <button onClick={clearProgress} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:text-blood">
              <Trash2 size={15} /> Forget progress
            </button>
          </div>
        </Section>
      ) : (
        <p className="mt-2 rounded-[var(--radius)] border border-line bg-surface p-4 text-sm text-muted">
          No progress synced yet. Until you sync, undiscovered spells, perks and secrets stay hidden (change this in Settings).
        </p>
      )}

      <Section title={desktop ? 'Sync from this computer' : 'Sync from your PC'}>
        {desktop ? <ScanSave onScanned={importProgress} /> : <PhoneHowTo />}
      </Section>

      <Section title="Have a sync code?">
        <PasteCode />
      </Section>
    </Page>
  );
}

function PhoneHowTo() {
  return (
    <ol className="space-y-3 rounded-[var(--radius)] border border-line bg-surface p-4 text-sm text-muted">
      <Step n={1} icon={<Laptop size={16} />}>
        Open this app on the PC where you play Noita and go to <b className="text-ink">Progress Sync</b>.
      </Step>
      <Step n={2} icon={<FolderOpen size={16} />}>
        Choose your <code className="text-ink">save00</code> folder. Nothing is uploaded — it's read in your browser.
      </Step>
      <Step n={3} icon={<Smartphone size={16} />}>
        Scan the QR code it shows with this phone's camera.
      </Step>
    </ol>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ember">{n}</span>
      <span className="flex-1 pt-1">
        <span className="mr-1.5 inline-block align-[-3px] text-faint">{icon}</span>
        {children}
      </span>
    </li>
  );
}

function ScanSave({ onScanned }: { onScanned: (p: Progress) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [savedHandle, setSavedHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void db.handles.get(HANDLE_KEY).then((h) => setSavedHandle(h?.handle ?? null));
  }, []);

  const run = async (get: () => Promise<SaveFile[]>) => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const progress = await parseSave(await get());
      onScanned(progress);
      setDone(true);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof ScanError ? e.message : `Couldn't read that folder (${(e as Error).message}). Try dragging it onto this page instead.`);
    } finally {
      setBusy(false);
    }
  };

  const choose = () => {
    if (!canPickDirectory()) return input.current?.click();
    void run(async () => {
      const dir = await pickDirectory();
      await db.handles.put({ key: HANDLE_KEY, handle: dir });
      setSavedHandle(dir);
      return filesFromHandle(dir);
    });
  };

  const resync = () =>
    savedHandle &&
    void run(async () => {
      const h = savedHandle as FileSystemDirectoryHandle & { requestPermission?: (o: object) => Promise<string> };
      if (h.requestPermission && (await h.requestPermission({ mode: 'read' })) !== 'granted') throw new ScanError('Permission to read the folder was denied.');
      return filesFromHandle(savedHandle);
    });

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const items = e.dataTransfer.items;
        void run(() => filesFromDrop(items));
      }}
      className={`rounded-[var(--radius)] border-2 border-dashed p-6 text-center transition-colors ${
        dragging ? 'border-ember bg-ember/10' : 'border-line-strong bg-surface'
      }`}
    >
      <Upload className="mx-auto text-ember" size={28} />
      <p className="mt-3 font-medium">Choose or drop your Noita save folder</p>
      <p className="mt-1 text-sm text-muted">Read entirely in your browser — nothing is uploaded.</p>

      <button
        onClick={() => {
          void navigator.clipboard.writeText(SAVE_PATH);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mx-auto mt-3 flex max-w-full items-center gap-2 rounded-lg bg-raised px-3 py-1.5 font-mono text-xs text-muted hover:text-ink"
        title="Copy path — paste it into the folder picker's address bar"
      >
        <span className="truncate">{SAVE_PATH}</span>
        {copied ? <Check size={14} className="text-toxic" /> : <ClipboardCopy size={14} />}
      </button>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button disabled={busy} onClick={choose} className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 font-semibold text-bg disabled:opacity-60">
          <FolderOpen size={17} /> {busy ? 'Reading…' : 'Choose save folder'}
        </button>
        {savedHandle && (
          <button disabled={busy} onClick={resync} className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 py-2.5 disabled:opacity-60">
            <RefreshCw size={16} /> Re-sync
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        {...({ webkitdirectory: '', directory: '' } as object)}
        onChange={(e) => e.target.files && void run(async () => filesFromInput(e.target.files!))}
      />

      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 text-sm text-blood">
            {error}
          </motion.p>
        )}
        {done && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 text-sm text-toxic">
            Progress synced on this device. Use “Send to phone” above to copy it to your phone.
          </motion.p>
        )}
      </AnimatePresence>
      <p className="mt-4 text-xs text-faint">
        If the picker says the folder contains system files, drag <code>save00</code> from File Explorer onto this box instead.
      </p>
    </div>
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
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-bg">
        <Smartphone size={16} /> {open ? 'Hide QR code' : 'Send to phone'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full overflow-hidden"
          >
            <div className="mt-2 flex flex-col items-center gap-4 rounded-[var(--radius)] border border-line bg-surface p-5 sm:flex-row sm:items-start">
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
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-ink"
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

function PasteCode() {
  const { spells, perks, enemies, version } = useData();
  const importProgress = useProgress((s) => s.importProgress);
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const code = value.includes('#p=') ? value.split('#p=')[1]! : value;
    try {
      const { progress } = await decodeProgress(code, { spells, perks, enemies }, version.gameHash);
      importProgress(progress);
      navigate('/');
    } catch (e) {
      setError(e instanceof SyncCodeError ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste a sync link or code"
        className="h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-faint focus:border-line-strong focus:outline-none"
      />
      <button disabled={!value.trim()} onClick={() => void submit()} className="h-11 rounded-xl bg-surface-2 px-4 text-sm font-medium disabled:opacity-50">
        Import
      </button>
      {error && <p className="text-sm text-blood sm:hidden">{error}</p>}
      {error && <p className="hidden text-sm text-blood sm:block">{error}</p>}
    </div>
  );
}
