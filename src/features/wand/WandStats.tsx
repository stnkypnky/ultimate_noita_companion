import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Dices, Shuffle } from 'lucide-react';
import { FPS, fmtNum } from '@/data/format';
import { WAND_TIERS, rollWand } from '@/seed/client';
import { MAX_CAPACITY, resize, type Wand } from './model';
import { useWand } from './store';
import { WandPortrait } from './WandPortrait';
import { StatIcon, type StatIconName } from '@/ui/game';

type Field = {
  key: keyof Wand;
  label: string;
  icon: StatIconName;
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
  { key: 'spellsPerCast', label: 'Spells / cast', icon: 'gun_actions_per_round', step: 1, min: 1, max: MAX_CAPACITY, ...same },
  { key: 'castDelay', label: 'Cast delay', icon: 'fire_rate_wait', unit: 's', step: 0.01, ...frames },
  { key: 'rechargeTime', label: 'Recharge', icon: 'gun_reload_time', unit: 's', step: 0.01, ...frames },
  { key: 'manaMax', label: 'Mana max', icon: 'mana_max', step: 10, min: 0, ...same },
  { key: 'manaChargeSpeed', label: 'Mana charge', icon: 'mana_charge_speed', unit: '/s', step: 10, min: 0, ...same },
  { key: 'capacity', label: 'Capacity', icon: 'gun_capacity', step: 1, min: 1, max: MAX_CAPACITY, ...same },
  { key: 'spread', label: 'Spread', icon: 'spread_degrees', unit: '°', step: 1, ...same },
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
        className="flex w-full items-center gap-2 slot px-3 py-2.5 text-left text-[13px]"
      >
        <WandPortrait wand={wand} scale={2} />
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
    <div className="slot mb-2 flex items-center justify-center gap-3 px-3 py-2">
      <WandPortrait wand={wand} />
      {wand.rare && <span className="rare-name font-game text-[16px]">Rare</span>}
    </div>
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
      <button
        onClick={() => setStat('shuffle', !wand.shuffle)}
        aria-pressed={wand.shuffle}
        className="slot slot-hover flex items-center justify-between px-3 py-2 text-left"
      >
        <span>
          <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-faint uppercase">
            <StatIcon name="gun_shuffle" />
            Shuffle
          </span>
          <span className={`font-game text-[16px] ${wand.shuffle ? 'text-blood' : ''}`}>{wand.shuffle ? 'Yes' : 'No'}</span>
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
    <RandomizeStats />
    {collapsible && (
      <button onClick={() => setOpen(false)} className="mt-1.5 flex w-full items-center justify-center gap-1 py-1 text-xs text-faint hover:text-ink">
        <ChevronUp size={14} /> Collapse
      </button>
    )}
    </div>
  );
}

const TIERS = Object.keys(WAND_TIERS).map(Number);
const TIER_KEY = 'wand-random-tier';

/**
 * Rolls new stats as a wand of the chosen tier would spawn in the game (its own generate_gun, run in the
 * seed worker). Spells stay; a smaller capacity drops the ones past the end (undo brings them back).
 */
function RandomizeStats() {
  const edit = useWand((s) => s.edit);
  const [tier, setTierState] = useState(() => {
    try {
      const t = Number(localStorage.getItem(TIER_KEY));
      return TIERS.includes(t) ? t : 3;
    } catch {
      return 3;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const setTier = (t: number) => {
    setTierState(t);
    try {
      localStorage.setItem(TIER_KEY, String(t));
    } catch {
      /* not remembered */
    }
  };
  const roll = async () => {
    setBusy(true);
    setError(false);
    try {
      const r = await rollWand(tier);
      const capacity = Math.max(1, Math.min(MAX_CAPACITY, r.capacity));
      edit((w) => ({
        ...w,
        shuffle: r.shuffle,
        spellsPerCast: Math.max(1, r.spellsPerCast),
        castDelay: r.castDelay,
        rechargeTime: r.rechargeTime,
        manaMax: Math.round(r.manaMax),
        manaChargeSpeed: Math.round(r.manaChargeSpeed),
        capacity,
        spread: Math.round(r.spread * 10) / 10,
        speedMultiplier: r.speedMultiplier,
        spells: resize(w.spells, capacity),
        ...(w.charges ? { charges: resize(w.charges, capacity) } : {}),
        // The sprite the game picked for these stats (GetWand), and whether it rolled a rare wand.
        sprite: r.sprite,
        rare: r.rare || undefined,
      }));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button onClick={roll} disabled={busy} className="btn-game quiet font-game px-3 py-1.5 text-[16px] disabled:opacity-60" title="New stats, as a wand of this tier spawns in the game">
        <Dices size={15} className={busy ? 'animate-spin' : undefined} /> Randomize
      </button>
      <span className="text-[11px] tracking-wide text-faint uppercase">Tier</span>
      <span role="radiogroup" aria-label="Wand tier" className="inline-flex gap-1">
        {TIERS.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={tier === t}
            onClick={() => setTier(t)}
            className={`font-game min-w-7 px-1.5 py-0.5 text-[16px] ${tier === t ? 'bg-ember text-[#120a04] [text-shadow:none]' :'bg-surface-2 text-muted hover:text-ink'}`}
          >
            {t}
          </button>
        ))}
      </span>
      {error && <span className="text-xs text-blood">Couldn’t load the game’s wand scripts.</span>}
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
    <label className="slot block px-3 py-2 focus-within:outline-2 focus-within:outline-solid focus-within:outline-gold/60">
      <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-faint uppercase">
        <StatIcon name={field.icon} />
        {field.label}
      </span>
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
          className="font-game w-full min-w-0 bg-transparent text-[16px] outline-none"
          aria-label={field.label}
        />
        {field.unit && <span className="text-xs text-faint">{field.unit}</span>}
      </span>
      {field.unit === 's' && <span className="block text-[10px] text-faint">{fmtNum(value, 0)} frames</span>}
    </label>
  );
}
