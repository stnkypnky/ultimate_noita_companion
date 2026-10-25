import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import QRCode from 'qrcode';
import { Check, ClipboardCopy, Copy, Save, Trash2 } from 'lucide-react';
import { useData } from '@/data/store';
import { db } from '@/store/db';
import { SpellIcon } from '@/ui/GameIcon';
import { decodeWand, encodeWand, type Wand } from './model';
import { useWand } from './store';

export const shareUrl = (code: string) => `${location.origin}${import.meta.env.BASE_URL}wand#w=${code}`;

/** Save / load builds on this device and share the current wand as a link or QR code. */
export function BuildsPanel({ onLoaded }: { onLoaded?: () => void }) {
  const wand = useWand((s) => s.wand);
  const load = useWand((s) => s.load);
  const setStat = useWand((s) => s.setStat);
  const builds = useLiveQuery(() => db.builds.orderBy('updatedAt').reverse().toArray(), []);
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    void encodeWand(wand).then(async (c) => {
      if (!live) return;
      setCode(c);
      setQr(await QRCode.toString(shareUrl(c), { type: 'svg', margin: 2, errorCorrectionLevel: 'L', color: { dark: '#0d0b10', light: '#ffffff' } }));
    });
    return () => {
      live = false;
    };
  }, [wand]);

  const save = async () => {
    const existing = builds?.find((b) => b.name === wand.name);
    const now = Date.now();
    await db.builds.put({ id: existing?.id ?? crypto.randomUUID(), name: wand.name, code, createdAt: existing?.createdAt ?? now, updatedAt: now });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-5">
      <section>
        <label className="text-xs font-semibold tracking-[0.14em] text-faint uppercase" htmlFor="wand-name">
          Build name
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="wand-name"
            value={wand.name}
            onChange={(e) => setStat('name', e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-raised px-3 text-sm focus:border-line-strong focus:outline-none"
          />
          <button onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-ember px-3 text-sm font-semibold text-bg">
            {saved ? <Check size={16} /> : <Save size={16} />} {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold tracking-[0.14em] text-faint uppercase">Share</h3>
        <div className="mt-2 flex items-start gap-4">
          <div className="w-32 shrink-0 overflow-hidden rounded-lg" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="min-w-0 text-sm text-muted">
            <p>Anyone opening the link gets this exact wand.</p>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl(code));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-ink"
            >
              {copied ? <Check size={15} className="text-toxic" /> : <ClipboardCopy size={15} />} {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold tracking-[0.14em] text-faint uppercase">Saved on this device</h3>
        {!builds?.length ? (
          <p className="mt-2 text-sm text-faint">No saved builds yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {builds.map((b) => (
              <SavedRow
                key={b.id}
                name={b.name}
                code={b.code}
                onLoad={async () => {
                  load(await decodeWand(b.code));
                  onLoaded?.();
                }}
                onDuplicate={() => void db.builds.put({ ...b, id: crypto.randomUUID(), name: `${b.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() })}
                onDelete={() => void db.builds.delete(b.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SavedRow({ name, code, onLoad, onDuplicate, onDelete }: { name: string; code: string; onLoad: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { spellById } = useData();
  const [preview, setPreview] = useState<Wand | null>(null);
  useEffect(() => {
    void decodeWand(code).then(setPreview, () => setPreview(null));
  }, [code]);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-raised p-2">
      <button onClick={onLoad} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="mt-1 flex gap-0.5 overflow-hidden">
          {preview?.spells
            .filter((s): s is string => !!s)
            .slice(0, 12)
            .map((id, i) => {
              const s = spellById.get(id);
              return s ? <SpellIcon key={i} type={s.type} icon={s.icon} scale={1} /> : null;
            })}
        </span>
      </button>
      <button onClick={onDuplicate} title="Duplicate" className="rounded-lg p-2 text-faint hover:text-ink">
        <Copy size={15} />
      </button>
      <button
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
        onBlur={() => setConfirm(false)}
        title="Delete"
        className={`rounded-lg p-2 ${confirm ? 'bg-blood/15 text-blood' : 'text-faint hover:text-blood'}`}
      >
        {confirm ? <span className="text-xs font-semibold">Delete?</span> : <Trash2 size={15} />}
      </button>
    </li>
  );
}
