import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { FPS, fmtNum } from '@/data/format';
import { MAX_CAPACITY, type Wand } from './model';
import { useWand } from './store';

type Field = {
  key: keyof Wand;
  label: string;
  unit?: string;
  /** Stored value -> what the user edits. */
  toInput: (v: number) => number;
  fromInput: (v: number) => number;
  step: number;
  min?: number;
  max?: number;
};

const frames = { toInput: (v: number) => Math.round((v / FPS) * 100) / 100, fromInput: (v: number) => Math.round(v * FPS) };
const same = { toInput: (v: number) => v, fromInput: (v: number) => v };

const FIELDS: Field[] = [
  { key: 'spellsPerCast', label: 'Spells / cast', step: 1, min: 1, max: MAX_CAPACITY, ...same },
  { key: 'castDelay', label: 'Cast delay', unit: 's', step: 0.01, ...frames },
  { key: 'rechargeTime', label: 'Recharge', unit: 's', step: 0.01, ...frames },
  { key: 'manaMax', label: 'Mana max', step: 10, min: 0, ...same },
  { key: 'manaChargeSpeed', label: 'Mana charge', unit: '/s', step: 10, min: 0, ...same },
  { key: 'capacity', label: 'Capacity', step: 1, min: 1, max: MAX_CAPACITY, ...same },
  { key: 'spread', label: 'Spread', unit: '°', step: 1, ...same },
];

/** On phones the stats start collapsed to a one-line summary so the slots stay in view. */
export function WandStats({ collapsible }: { collapsible?: boolean }) {
  const wand = useWand((s) => s.wand);
  const setStat = useWand((s) => s.setStat);
  const setCapacity = useWand((s) => s.setCapacity);
  const [open, setOpen] = useState(!collapsible);

  if (!open) {
    const s = (f: number) => `${fmtNum(f / FPS)}s`;
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-raised px-3 py-2.5 text-left text-[13px]"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 text-muted tabular-nums">
          {wand.shuffle && <span className="text-blood">Shuffle</span>}
          <span>
            <b className="text-ink">{wand.spellsPerCast}</b> /cast
          </span>
          <span>
            Delay <b className="text-ink">{s(wand.castDelay)}</b>
          </span>
          <span>
            Recharge <b className="text-ink">{s(wand.rechargeTime)}</b>
          </span>
          <span>
            Mana <b className="text-ink">{wand.manaMax}</b> (+{wand.manaChargeSpeed}/s)
          </span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-faint" />
      </button>
    );
  }

  return (
    // Container query: the stat grid lives in a narrow middle column on laptops.
    <div className="@container">
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
      <button
        onClick={() => setStat('shuffle', !wand.shuffle)}
        aria-pressed={wand.shuffle}
        className={`flex items-center justify-between rounded-[var(--radius-sm)] border px-3 py-2 text-left transition-colors ${
          wand.shuffle ? 'border-blood/50 bg-blood/10' : 'border-line bg-raised hover:border-line-strong'
        }`}
      >
        <span>
          <span className="block text-[11px] tracking-wide text-faint uppercase">Shuffle</span>
          <span className={`font-semibold ${wand.shuffle ? 'text-blood' : ''}`}>{wand.shuffle ? 'Yes' : 'No'}</span>
        </span>
        <Shuffle size={16} className={wand.shuffle ? 'text-blood' : 'text-faint'} />
      </button>
      {FIELDS.map((f) => (
        <NumberStat
          key={f.key}
          field={f}
          value={wand[f.key] as number}
          onChange={(v) => (f.key === 'capacity' ? setCapacity(v) : setStat(f.key, v as never))}
        />
      ))}
    </div>
    {collapsible && (
      <button onClick={() => setOpen(false)} className="mt-1.5 flex w-full items-center justify-center gap-1 py-1 text-xs text-faint hover:text-ink">
        <ChevronUp size={14} /> Collapse
      </button>
    )}
    </div>
  );
}

function NumberStat({ field, value, onChange }: { field: Field; value: number; onChange: (v: number) => void }) {
  const shown = field.toInput(value);
  const [text, setText] = useState(String(shown));
  useEffect(() => setText(String(shown)), [shown]);

  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n)) return setText(String(shown));
    const clamped = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n));
    onChange(field.fromInput(clamped));
  };

  return (
    <label className="block rounded-[var(--radius-sm)] border border-line bg-raised px-3 py-2 focus-within:border-ember/60">
      <span className="block text-[11px] tracking-wide text-faint uppercase">{field.label}</span>
      <span className="flex items-baseline gap-1">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const n = Number(text) + (e.key === 'ArrowUp' ? field.step : -field.step);
              const v = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, Math.round(n * 100) / 100));
              setText(String(v));
              onChange(field.fromInput(v));
            }
          }}
          className="w-full min-w-0 bg-transparent font-semibold tabular-nums outline-none"
          aria-label={field.label}
        />
        {field.unit && <span className="text-xs text-faint">{field.unit}</span>}
      </span>
      {field.unit === 's' && <span className="block text-[10px] text-faint">{fmtNum(value, 0)} frames</span>}
    </label>
  );
}
