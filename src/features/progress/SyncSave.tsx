// The ways to sync a save: read the save folder on the PC, or paste a sync code made there. Shared by
// Progress Sync, Home and the "sync your save first" lock screen.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ClipboardCopy, FolderOpen, Laptop, RefreshCw, Smartphone, Upload } from 'lucide-react';
import { useData } from '@/data/store';
import { db } from '@/store/db';
import { useProgress, type Progress } from '@/store/progress';
import { useIsDesktop } from '@/ui/hooks';
import { SyncCodeError, decodeProgress } from './codec';
import { SAVE_PATH, ScanError, canPickDirectory, filesFromDrop, filesFromHandle, filesFromInput, parseSave, pickDirectory, type SaveFile } from './scan';

const HANDLE_KEY = 'save-dir';

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
        Scan the QR code it shows with this phone's camera, or paste its link below.
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
      className={`rounded-[var(--radius)] border-2 border-dashed text-center transition-colors ${compact ? 'p-4' : 'p-6'} ${
        dragging ? 'border-ember bg-ember/10' : 'border-line-strong bg-surface'
      }`}
    >
      {!compact && <Upload className="mx-auto text-ember" size={28} />}
      <p className={`${compact ? '' : 'mt-3'} font-medium`}>Choose or drop your Noita save folder</p>
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
        <button disabled={busy} onClick={choose} className="inline-flex items-center gap-2 btn-game font-game text-[16px] px-4 py-2.5 disabled:opacity-60">
          <FolderOpen size={17} /> {busy ? 'Reading…' : 'Choose save folder'}
        </button>
        {savedHandle && (
          <button disabled={busy} onClick={resync} className="inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-4 py-2.5 disabled:opacity-60">
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
            Progress synced on this device. Use “Send to phone” on Progress Sync to copy it to your phone.
          </motion.p>
        )}
      </AnimatePresence>
      {!compact && (
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
