// The Run page's building blocks: wands (with a simulated cast), flasks, perks and the detail sheet.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ChevronDown, Wand2 } from 'lucide-react';
import { useIsDesktop } from '@/ui/hooks';
import { useData } from '@/data/store';
import { fmtNum, seconds } from '@/data/format';
import { ALCHEMY_KEY } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { AtlasIcon, SpellIcon } from '@/ui/GameIcon';
import { HudBar, StatIcon, type StatIconName } from '@/ui/game';
import { Sheet } from '@/ui/Sheet';
import { DEFAULT_OPTIONS, encodeWand, resize, type SimOptions, type Wand } from '@/features/wand/model';
import { useSimulation } from '@/features/wand/useSimulation';
import { WandPortrait } from '@/features/wand/WandPortrait';
import { SpellDetail } from '@/features/spells/SpellDetail';
import { PerkDetail } from '@/features/perks/PerksPage';
import { MaterialDetail, titleCase, useMaterialVisibility } from '@/features/materials/MaterialsPage';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { alchemyRecipes } from '@/features/alchemy/aplc';
import type { LiveFlask, LiveRun, LiveSpell, LiveWand } from './parse';
import { toBuilderWand } from './toBuilder';

export type Detail = { kind: 'spell' | 'perk' | 'material'; id: string };
export type OpenDetail = (d: Detail) => void;

/** The run's wands as the simulator wants them: mana left out, so a recharging wand doesn't re-run the sim. */
const wandKey = (w: LiveWand) => JSON.stringify({ ...w, mana: undefined, active: undefined });

/** Every carried wand, active first, each simulated with the run's other wands (for spells that copy them). */
export function Wands({ run, onOpen, past }: { run: LiveRun; onOpen: OpenDetail; past?: boolean }) {
  const unlimited = run.perks.some((p) => p.id === 'UNLIMITED_SPELLS');
  const options = useMemo<SimOptions>(() => ({ ...DEFAULT_OPTIONS, unlimitedSpells: unlimited }), [unlimited]);
  const ordered = [...run.wands].sort((a, b) => Number(b.active) - Number(a.active));
  if (!ordered.length) return <p className="panel p-4 text-sm text-muted">{past ? 'No wands.' : 'No wands in hand.'}</p>;
  return (
    <div className="space-y-3">
      {ordered.map((w) => (
        <WandCard key={run.wands.indexOf(w)} wand={w} all={run.wands} options={options} onOpen={onOpen} past={past} />
      ))}
    </div>
  );
}

function WandCard({ wand, all, options, onOpen, past }: { wand: LiveWand; all: LiveWand[]; options: SimOptions; onOpen: OpenDetail; past?: boolean }) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [showStats, setShowStats] = useState(false);
  const key = wandKey(wand);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => toBuilderWand(wand), [key]);
  const othersKey = all.filter((w) => w !== wand).map(wandKey).join('|');
  const others = useMemo(
    () => all.filter((w) => w !== wand).map((w) => w.spells.map((s) => s.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [othersKey],
  );
  const sim = useSimulation(built, options, others);
  const s = sim.summary;

  const stats: { icon: StatIconName; label: string; value: string }[] = [
    { icon: 'gun_shuffle', label: 'Shuffle', value: wand.shuffle ? 'Yes' : 'No' },
    { icon: 'gun_actions_per_round', label: 'Spells/cast', value: String(Math.round(wand.spellsPerCast)) },
    { icon: 'fire_rate_wait', label: 'Cast delay', value: seconds(wand.castDelay) },
    { icon: 'gun_reload_time', label: 'Recharge', value: seconds(wand.rechargeTime) },
    { icon: 'mana_max', label: 'Mana max', value: fmtNum(wand.manaMax, 0) },
    { icon: 'mana_charge_speed', label: 'Mana charge', value: fmtNum(wand.manaChargeSpeed, 0) },
    { icon: 'gun_capacity', label: 'Capacity', value: String(wand.capacity) },
    { icon: 'spread_degrees', label: 'Spread', value: `${fmtNum(wand.spread, 1)}°` },
  ];

  return (
    <section className={`panel p-4 ${wand.active ? 'ring-1 ring-toxic/40' : ''}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="grid h-12 min-w-12 shrink-0 place-items-center">
          <WandPortrait wand={built} scale={desktop ? 3 : 2} />
        </span>
        <div className="min-w-0 flex-1 basis-32">
          <h3 className="font-game line-clamp-2 text-[16px] leading-tight break-words" title={wand.name || 'Wand'}>
            {wand.name || 'Wand'}
          </h3>
          {wand.active && <span className="font-game-caps text-[8px] text-toxic">{past ? 'Last held' : 'In hand'}</span>}
        </div>
        <button
          onClick={() => void encodeWand(built).then((code) => navigate(`/wand#w=${code}`))}
          className="inline-flex items-center justify-center gap-1.5 btn-game quiet font-game text-[16px] px-2.5 py-1 max-sm:w-full"
        >
          <Wand2 size={14} /> Open in builder
        </button>
      </header>

      {!past && wand.mana !== undefined && wand.manaMax > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <HudBar value={Math.max(0, Math.min(1, wand.mana / wand.manaMax))} color="#42a8e2" className="flex-1" label="Mana" />
          <span className="font-game w-20 text-right text-[16px] text-ink">
            {Math.round(wand.mana)}
            <span className="text-faint">/{Math.round(wand.manaMax)}</span>
          </span>
        </div>
      )}

      <WandSlotsRow wand={wand} built={built} onOpen={onOpen} />

      {/* Phones: the wand's stats fold away so the slots and the simulation stay in view. */}
      {(desktop || showStats) && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="flex items-center gap-1.5">
              <StatIcon name={st.icon} />
              <dt className="text-faint">{st.label}</dt>
              <dd className="ml-auto font-medium text-ink tabular-nums">{st.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!desktop && (
        <button onClick={() => setShowStats(!showStats)} aria-expanded={showStats} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs text-muted hover:text-ink">
          <ChevronDown size={14} className={showStats ? 'rotate-180' : ''} /> {showStats ? 'Hide wand stats' : `Wand stats · ${seconds(wand.castDelay)} delay · ${seconds(wand.rechargeTime)} recharge`}
        </button>
      )}

      {s ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile icon="damage_projectile" label="Damage / sec" value={fmtNum(s.dps, 0)} accent />
          <Tile icon="gun_reload_time" label="Cycle time" value={seconds(s.cycleFrames)} />
          <Tile icon="mana_drain" label="Mana / cycle" value={fmtNum(s.manaUsed, 0)} warn={s.manaUsed > wand.manaMax} />
          <Tile icon="gun_actions_per_round" label="Casts / cycle" value={String(s.casts)} />
        </div>
      ) : sim.status === 'running' ? (
        <p className="mt-3 text-xs text-faint">Simulating…</p>
      ) : null}
      {s && s.skippedForMana > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ember">
          <AlertTriangle size={13} /> Runs out of mana: {s.skippedForMana} spell{s.skippedForMana > 1 ? 's' : ''} skipped per cycle
        </p>
      )}
    </section>
  );
}

function Tile({ label, value, accent, warn, icon }: { label: string; value: string; accent?: boolean; warn?: boolean; icon: StatIconName }) {
  return (
    <div className="slot px-3 py-2" title={warn ? 'More than the wand holds: it waits for mana mid-cycle' : undefined}>
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-faint uppercase">
        <StatIcon name={icon} />
        {label}
      </div>
      <div className={`font-game mt-1 text-[20px] leading-none ${accent ? 'text-ember' : warn ? 'text-blood' : ''}`}>{value}</div>
    </div>
  );
}

/** The wand's slots, placed exactly as the builder places them (toBuilderWand), so both always agree. */
function WandSlotsRow({ wand, built, onOpen }: { wand: LiveWand; built: Wand; onOpen: OpenDetail }) {
  const slots: (LiveSpell | null)[] = resize(
    built.spells.map((id, i) => (id ? { id, ...(built.charges?.[i] != null ? { uses: built.charges[i]! } : {}) } : null)),
    Math.max(wand.capacity, 1),
  );
  return (
    <div className="mt-3 flex flex-wrap gap-0.5">
      {wand.alwaysCasts.map((id, i) => (
        <SpellButton key={`a${i}`} spell={{ id }} always onOpen={onOpen} />
      ))}
      {slots.map((slot, i) => (slot ? <SpellButton key={i} spell={slot} onOpen={onOpen} /> : <span key={i} className="h-[38px] w-[38px] bg-surface-2/60" title="Empty" />))}
    </div>
  );
}

export function SpellButton({ spell, always, onOpen }: { spell: LiveSpell; always?: boolean; onOpen: OpenDetail }) {
  const { spellById } = useData();
  const s = spellById.get(spell.id);
  if (!s) return <span className="grid h-[38px] w-[38px] place-items-center bg-surface-2/60 text-[8px] text-faint">{spell.id}</span>;
  return (
    <button
      onClick={() => onOpen({ kind: 'spell', id: spell.id })}
      title={`${always ? 'Always casts ' : ''}${s.name}${spell.uses !== undefined ? ` (${spell.uses} left)` : ''}`}
      className={`relative grid h-[38px] w-[38px] place-items-center bg-surface-2/60 hover:bg-surface-2 ${always ? 'ring-1 ring-gold/60' : ''}`}
    >
      <SpellIcon type={s.type} icon={s.icon} scale={2} />
      {spell.uses !== undefined && <span className="absolute right-0.5 bottom-0 font-game text-[8px] text-gold">{spell.uses}</span>}
    </button>
  );
}

export function Perks({ run, onOpen }: { run: LiveRun; onOpen: OpenDetail }) {
  const { perkById } = useData();
  if (!run.perks.length) return <p className="text-sm text-muted">No perks yet.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {run.perks.map((p) => {
        const perk = perkById.get(p.id);
        return (
          <button
            key={p.id}
            onClick={() => onOpen({ kind: 'perk', id: p.id })}
            title={perk?.name ?? p.id}
            className="slot slot-hover relative grid h-11 w-11 place-items-center"
          >
            {perk ? <AtlasIcon atlas="perks" icon={perk.icon} scale={2} /> : <span className="text-[8px]">{p.id}</span>}
            {p.count > 1 && <span className="absolute right-0.5 bottom-0 font-game text-[8px] text-gold">×{p.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Flasks({ run, onOpen }: { run: LiveRun; onOpen: OpenDetail }) {
  const { visible } = useSpoilers();
  const secret = useMemo(() => {
    if (!visible(ALCHEMY_KEY) || !run.seed) return new Map<string, string>();
    const { lc, ap } = alchemyRecipes(run.seed);
    const m = new Map<string, string>();
    for (const id of lc.materials) m.set(id, 'Lively Concoction ingredient');
    for (const id of ap.materials) m.set(id, m.has(id) ? 'LC & AP ingredient' : 'Alchemic Precursor ingredient');
    return m;
  }, [visible, run.seed]);
  if (!run.flasks.length) return <p className="text-sm text-muted">No flasks or pouches.</p>;
  return (
    <div className="space-y-2">
      {run.flasks.map((f, i) => (
        <FlaskRow key={i} flask={f} secret={secret} onOpen={onOpen} />
      ))}
    </div>
  );
}

function FlaskRow({ flask, secret, onOpen }: { flask: LiveFlask; secret: Map<string, string>; onOpen: OpenDetail }) {
  const { materialById } = useData();
  const { isVisible } = useMaterialVisibility();
  const total = flask.contents.reduce((n, c) => n + c.amount, 0);
  return (
    <div className="slot p-3">
      <div className="flex items-baseline justify-between text-xs text-faint">
        <span className="font-game text-[16px] text-ink">{flask.name || 'Flask'}</span>
        {flask.capacity ? `${total} / ${flask.capacity}` : total || 'empty'}
      </div>
      {flask.capacity ? <HudBar value={Math.min(1, total / flask.capacity)} color="#7bd65c" className="mt-1.5" label="Fill" /> : null}
      {flask.contents.length > 0 && (
        <ul className="mt-2 space-y-1">
          {flask.contents.map((c) => {
            const m = materialById.get(c.material);
            const known = isVisible(c.material);
            return (
              <li key={c.material}>
                <button onClick={() => m && onOpen({ kind: 'material', id: c.material })} className="flex w-full items-center gap-2 text-left text-sm hover:text-ink">
                  {m && <MaterialSwatch material={m} size={20} hidden={!known} />}
                  <span className="min-w-0 flex-1 truncate">{m ? (known ? titleCase(m.name) : 'Unknown material') : c.material.replace(/_/g, ' ')}</span>
                  {secret.has(c.material) && <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] text-gold">{secret.get(c.material)}</span>}
                  <span className="font-game text-[16px] text-muted tabular-nums">{c.amount}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- one-line summaries for folded sections on phones ----------

export function PerkSummary({ run }: { run: LiveRun }) {
  const { perkById } = useData();
  if (!run.perks.length) return <>none</>;
  return (
    <>
      {run.perks.slice(0, 8).map((p) => {
        const perk = perkById.get(p.id);
        return perk ? <AtlasIcon key={p.id} atlas="perks" icon={perk.icon} scale={1} /> : null;
      })}
      {run.perks.length > 8 && <span>+{run.perks.length - 8}</span>}
    </>
  );
}

export function SpellSummary({ run }: { run: LiveRun }) {
  const { spellById } = useData();
  return (
    <>
      {run.spells.slice(0, 6).map((sp, i) => {
        const s = spellById.get(sp.id);
        return s ? <SpellIcon key={i} type={s.type} icon={s.icon} scale={1} /> : null;
      })}
      {run.spells.length > 6 && <span>+{run.spells.length - 6}</span>}
    </>
  );
}

export function FlaskSummary({ run }: { run: LiveRun }) {
  const { materialById } = useData();
  const { isVisible } = useMaterialVisibility();
  if (!run.flasks.length) return <>none</>;
  return (
    <>
      {run.flasks.map((f, i) => {
        const main = [...f.contents].sort((a, b) => b.amount - a.amount)[0];
        const m = main && materialById.get(main.material);
        return m ? <MaterialSwatch key={i} material={m} size={14} hidden={!isVisible(main.material)} /> : <span key={i}>empty</span>;
      })}
    </>
  );
}

/** The spell, perk or material you tapped, in a sheet over the Run page. */
export function DetailSheet({ detail, onClose }: { detail: Detail | null; onClose: () => void }) {
  const { spellById, perkById, materialById } = useData();
  const spell = detail?.kind === 'spell' ? spellById.get(detail.id) : undefined;
  const perk = detail?.kind === 'perk' ? perkById.get(detail.id) : undefined;
  const material = detail?.kind === 'material' ? materialById.get(detail.id) : undefined;
  const title = spell ? 'Spell' : perk ? 'Perk' : material ? 'Material' : '';
  return (
    <Sheet open={!!(spell || perk || material)} onClose={onClose} title={title}>
      {spell && <SpellDetail spell={spell} />}
      {perk && <PerkDetail perk={perk} />}
      {material && <MaterialDetail material={material} />}
    </Sheet>
  );
}
