// The ways to sync a save: read the save folder on the PC, or paste a sync code made there. Shared by
// Progress Sync, Home and the "sync your save first" lock screen.
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ClipboardCopy, FolderOpen, Laptop, Pause, Radio, RefreshCw, Smartphone, Upload } from 'lucide-react';
import { useData } from '@/data/store';
import { useProgress, type Progress } from '@/store/progress';
import { useIsDesktop } from '@/ui/hooks';
import { timeAgo, useNow } from '@/ui/time';
import { deviceName } from '@/features/sync/device';
import { SyncCodeError, decodeProgress } from './codec';
import { chooseSaveFolder, resumeSaveWatch, stopSaveWatch, syncSaveNow, useSaveWatch } from './liveSave';
import { SAVE_PATH, ScanError, canPickDirectory, filesFromDrop, filesFromInput, parseSave, type SaveFile } from './scan';

/** The folder picker on a computer, or the steps to sync from the PC on a phone; then a sync-code box. */
export function SyncSave({ compact }: { compact?: boolean }) {
  const desktop = useIsDesktop();
  const importProgress = useProgress((s) => s.importProgress);
  return (
    <div className="space-y-3">
      {desktop ? <ScanSave onScanned={importProgress} compact={compact} /> : <PhoneHowTo />}
      <PasteCode />
    </div>
  );
}

export function PhoneHowTo() {
  return (
    <ol className="space-y-3 panel p-4 text-sm text-muted">
      <Step n={1} icon={<Laptop size={16} />}>
        Open this app on the PC where you play Noita and go to <b className="text-ink">Progress Sync</b>.
      </Step>
      <Step n={2} icon={<FolderOpen size={16} />}>
        Choose your <code className="text-ink">save00</code> folder. Nothing is uploaded — it's read in your browser.
      </Step>
      <Step n={3} icon={<Smartphone size={16} />}>
        Under <b className="text-ink">Your devices</b>, tap <b className="text-ink">Pair a device</b> and scan the code with this phone's camera. After that,
        this phone keeps itself up to date.
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

export function ScanSave({ onScanned, compact }: { onScanned: (p: Progress) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const watch = useSaveWatch();
  const now = useNow();
  const live = watch.status === 'live';

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await job();
      setDone(true);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof ScanError ? e.message : `Couldn't read that folder (${(e as Error).message}). Try dragging it onto this page instead.`);
    } finally {
      setBusy(false);
    }
  };
  /** One-off read (drop, or a browser without folder handles). */
  const readOnce = (get: () => Promise<SaveFile[]>) => run(async () => onScanned({ ...(await parseSave(await get())), source: deviceName() }));

  const choose = () => {
    if (!canPickDirectory()) return input.current?.click();
    void run(chooseSaveFolder);
  };

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
        void readOnce(() => filesFromDrop(items));
      }}
      className={`rounded-[var(--radius)] border-2 border-dashed text-center transition-colors ${compact ? 'p-4' : 'p-6'} ${
        dragging ? 'border-ember bg-ember/10' : 'border-line-strong bg-surface'
      }`}
    >
      {live ? (
        <>
          <p className="inline-flex items-center gap-2 font-game text-[16px] text-toxic">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-toxic" aria-hidden /> Live sync on
          </p>
          <p className="mt-1 text-sm text-muted">
            Watching your save folder — new discoveries show up by themselves.
            {watch.lastChange ? ` Last change ${timeAgo(watch.lastChange, now)}.` : watch.lastScan ? ` Checked ${timeAgo(watch.lastScan, now)}.` : ''}
          </p>
        </>
      ) : (
        <>
          {!compact && <Upload className="mx-auto text-ember" size={28} />}
          <p className={`${compact ? '' : 'mt-3'} font-medium`}>
            {watch.status === 'needs-permission' ? 'Resume live sync with your save folder' : 'Choose or drop your Noita save folder'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {watch.status === 'unsupported'
              ? 'Read entirely in your browser. This browser can’t keep watching a folder — use Chrome or Edge for live sync.'
              : watch.status === 'standby'
                ? 'Live sync is running in another tab of the companion.'
                : 'Read entirely in your browser. Choose the folder once and the companion keeps itself up to date.'}
          </p>
        </>
      )}

      {!live && (
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
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {live ? (
          <>
            <button disabled={busy} onClick={() => void run(syncSaveNow)} className="inline-flex items-center gap-2 btn-game font-game text-[16px] px-4 py-2.5 disabled:opacity-60">
              <RefreshCw size={16} /> {busy ? 'Reading…' : 'Sync now'}
            </button>
            <button onClick={stopSaveWatch} className="inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-4 py-2.5">
              <Pause size={16} /> Stop watching
            </button>
          </>
        ) : watch.hasHandle && watch.status !== 'standby' && watch.status !== 'unsupported' ? (
          <>
            <button disabled={busy} onClick={() => void run(resumeSaveWatch)} className="inline-flex items-center gap-2 btn-game font-game text-[16px] px-4 py-2.5 disabled:opacity-60">
              <Radio size={16} /> {busy ? 'Reading…' : 'Resume live sync'}
            </button>
            <button disabled={busy} onClick={choose} className="inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-4 py-2.5 disabled:opacity-60">
              <FolderOpen size={17} /> Other folder
            </button>
          </>
        ) : (
          <button disabled={busy} onClick={choose} className="inline-flex items-center gap-2 btn-game font-game text-[16px] px-4 py-2.5 disabled:opacity-60">
            <FolderOpen size={17} /> {busy ? 'Reading…' : 'Choose save folder'}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        {...({ webkitdirectory: '', directory: '' } as object)}
        onChange={(e) => e.target.files && void readOnce(async () => filesFromInput(e.target.files!))}
      />

      <AnimatePresence>
        {(error ?? (watch.status === 'error' || watch.status === 'needs-permission' ? watch.error : undefined)) && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 text-sm text-blood">
            {error ?? watch.error}
          </motion.p>
        )}
        {done && !live && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 text-sm text-toxic">
            Progress synced on this device. Pair your phone on Progress Sync to keep it up to date too.
          </motion.p>
        )}
      </AnimatePresence>
      {!compact && !live && (
        <p className="mt-4 text-xs text-faint">
          If the picker says the folder contains system files, drag <code>save00</code> from File Explorer onto this box instead.
        </p>
      )}
    </div>
  );
}

export function PasteCode() {
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
