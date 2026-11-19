import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ChevronDown, CornerDownRight, Loader2, Wand as WandIcon } from 'lucide-react';
import { useData } from '@/data/store';
import { fmtNum, seconds } from '@/data/format';
import type { Spell } from '@/data/types';
import type { CastView, ProjectileView } from '@/sim/analyze';
import { AtlasIcon, SpellIcon } from '@/ui/GameIcon';
import type { SimState } from './useSimulation';
import { Runes, StatIcon, type StatIconName } from '@/ui/game';

export function CastResults({ sim, onHoverCast }: { sim: SimState; onHoverCast: (c: CastView | null) => void }) {
  if (sim.status === 'idle') {
    return (
      <div className="slot p-8 text-center text-sm text-muted">
        <Runes className="mb-3 block text-[16px] text-gold/40">an empty wand casts nothing</Runes>
        Add spells to the wand to see every cast simulated with the game's own casting code.
      </div>
    );
  }
  const s = sim.summary;
  return (
    <div className="space-y-3">
      {sim.status === 'error' && (
        <p className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-blood/40 bg-blood/10 p-3 text-sm text-blood">
          <AlertTriangle size={16} /> {sim.error}
        </p>
      )}
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile icon="gun_actions_per_round" label="Casts / cycle" value={String(s.casts)} />
          <Tile icon="gun_reload_time" label="Cycle time" value={seconds(s.cycleFrames)} />
          <Tile icon="mana_drain" label="Mana / cycle" value={fmtNum(s.manaUsed, 0)} />
          <Tile icon="damage_projectile" label="Damage / sec" value={fmtNum(s.dps, 0)} accent hint="Expected, one hit per projectile, crits averaged" />
        </div>
      )}
      {s && s.payloadCount > 0 && s.damage > 0 && (
        <p className="text-xs text-muted tabular-nums" title="Expected damage over one cycle, one hit per projectile, crits averaged">
          ≈{fmtNum(s.damage, 0)} dmg per cycle: {fmtNum(s.carrierDamage, 0)} from cast projectiles, {fmtNum(s.payloadDamage, 0)} from {s.payloadCount} payload
          projectile{s.payloadCount === 1 ? '' : 's'} ({fmtNum((s.payloadDamage / s.damage) * 100, 0)}%)
        </p>
      )}
      {s && s.skippedForMana > 0 && (
        <p className="msg-box font-game text-[16px]">
          Not enough mana: {s.skippedForMana} spell{s.skippedForMana > 1 ? 's' : ''} skipped
        </p>
      )}
      {s && !s.recharged && <p className="text-xs text-faint">Showing the first {s.casts} casts — the wand hasn't recharged yet.</p>}

      <ol className="relative space-y-2">
        <AnimatePresence initial={false}>
          {sim.casts.map((c) => (
            <motion.li
              key={c.cast.index}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onMouseEnter={() => onHoverCast(c)}
              onMouseLeave={() => onHoverCast(null)}
              onFocus={() => onHoverCast(c)}
              onBlur={() => onHoverCast(null)}
              tabIndex={0}
              className="panel p-3 outline-none focus-visible:border-ember/60 hover:border-line-strong"
            >
              <CastCard view={c} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {sim.status === 'running' && (
        <p className="flex items-center gap-2 text-xs text-faint">
          <Loader2 size={13} className="animate-spin" /> Simulating…
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, accent, hint, icon }: { label: string; value: string; accent?: boolean; hint?: string; icon: StatIconName }) {
  return (
    <div className="slot px-3 py-2" title={hint}>
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-faint uppercase">
        <StatIcon name={icon} />
        {label}
      </div>
      <div className={`font-game mt-1 text-[24px] leading-none ${accent ? 'text-ember' : ''}`}>{value}</div>
    </div>
  );
}

function CastCard({ view }: { view: CastView }) {
  const { spellById } = useData();
  const [timing, setTiming] = useState(false);
  const c = view.cast;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-game text-[16px] text-gold">Cast {c.index}</span>
        <span className="text-faint">{seconds(c.frame)}</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted tabular-nums">
          <span title="Cast delay" className="flex items-center gap-1">
            <StatIcon name="fire_rate_wait" />
            {seconds(c.cast_delay)}
          </span>
          <span title="Mana" className="flex items-center gap-1">
            <StatIcon name="mana_drain" />
            {fmtNum(c.mana_before, 0)} → {fmtNum(c.mana_after, 0)}
          </span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {c.played.map((id, i) => {
          const s = spellById.get(id);
          return s ? (
            <span key={i} title={s.name} className={c.slots[i] === -1 ? 'rounded ring-1 ring-gold/60' : ''}>
              <SpellIcon type={s.type} icon={s.icon} scale={1} />
            </span>
          ) : null;
        })}
      </div>

      {view.projectiles.length > 0 && (
        <ul className="mt-2 space-y-1">
          {view.projectiles.map((p, i) => (
            <ProjectileRow key={i} p={p} depth={0} />
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {view.damage > 0 && <span className="rounded bg-ember/15 px-1.5 py-0.5 text-ember">≈{fmtNum(view.damage, 0)} dmg</span>}
        {view.payloadCount > 0 && (
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-muted" title="Expected damage of the directly cast projectiles, and of their trigger payloads">
            {view.payloadCount} payload{view.payloadCount === 1 ? '' : 's'} · {fmtNum(view.carrierDamage, 0)} + {fmtNum(view.payloadDamage, 0)}
          </span>
        )}
        {c.no_mana > 0 && <span className="rounded bg-gold/15 px-1.5 py-0.5 text-gold">{c.no_mana} skipped (mana)</span>}
        {c.reload !== undefined && <span className="rounded bg-frost/15 px-1.5 py-0.5 text-frost">Recharge {seconds(c.reload)}</span>}
        {view.timing.length > 0 && (
          <button
            type="button"
            aria-expanded={timing}
            onClick={() => setTiming((o) => !o)}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-faint outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-ember/60"
          >
            Timing &amp; mana <ChevronDown size={12} className={`transition-transform ${timing ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {timing && <TimingTable view={view} />}
    </>
  );
}

const frames = (f: number) => `${f > 0 ? '+' : ''}${fmtNum(f / 60, 2)} s`;

function TimingTable({ view }: { view: CastView }) {
  const c = view.cast;
  const showReload = view.timing.some((t) => t.reload);
  return (
    <table className="mt-2 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2/60 text-[12px] tabular-nums">
      <thead className="text-[11px] tracking-wide text-faint uppercase">
        <tr>
          <th className="px-2 py-1 text-left font-normal">Played</th>
          <th className="px-2 py-1 text-right font-normal" title="Cast delay">Delay</th>
          {showReload && <th className="px-2 py-1 text-right font-normal" title="Added to the recharge time">Recharge</th>}
          <th className="px-2 py-1 text-right font-normal">Mana</th>
        </tr>
      </thead>
      <tbody>
        {view.timing.map((t, i) => (
          <tr key={i} className="border-t border-line/50">
            <td className="w-full max-w-0 px-2 py-0.5" style={{ paddingLeft: t.payload ? 20 : undefined }}>
              <span className="flex items-center gap-1">
                {t.payload && <CornerDownRight size={12} className="shrink-0 text-faint" />}
                <Who spell={t.spell} perkId={t.perkId} wand={t.wand} />
              </span>
            </td>
            <td className="whitespace-nowrap px-2 text-right" title={`${t.delay} frames`}>{t.delay ? frames(t.delay) : ''}</td>
            {showReload && <td className="whitespace-nowrap px-2 text-right" title={`${t.reload} frames`}>{t.reload ? frames(t.reload) : ''}</td>}
            <td className="whitespace-nowrap px-2 text-right">{t.mana ? fmtNum(t.mana, 0) : ''}</td>
          </tr>
        ))}
        <tr className="border-t border-line font-medium">
          <td className="px-2 py-1">Total</td>
          <td className="whitespace-nowrap px-2 text-right" title={`${c.cast_delay} frames`}>
            {seconds(c.cast_delay)}
            {c.cast_delay < 0 && <span className="block text-[11px] font-normal text-faint">counts as 0</span>}
          </td>
          {showReload && <td className="whitespace-nowrap px-2 text-right">{c.reload !== undefined ? seconds(c.reload) : ''}</td>}
          <td className="whitespace-nowrap px-2 text-right">{fmtNum(view.manaUsed, 0)}</td>
        </tr>
      </tbody>
    </table>
  );
}

const TRIGGER_LABEL = { hit: 'on hit', timer: 'after', death: 'on expiry' } as const;

/** Icon and name of whatever a breakdown line is about: a spell, a perk or the wand itself. */
function Who({ spell, perkId, wand, fallback }: { spell?: Spell; perkId?: string; wand?: boolean; fallback?: string }) {
  const { perkById } = useData();
  const perk = perkId ? perkById.get(perkId) : undefined;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {spell ? (
        <SpellIcon type={spell.type} icon={spell.icon} scale={1} />
      ) : perk ? (
        <AtlasIcon atlas="perks" icon={perk.icon} scale={1} />
      ) : (
        <WandIcon size={14} className="mx-[3px] text-faint" />
      )}
      <span className="truncate">{spell?.name ?? perk?.name ?? (wand ? 'Wand' : fallback ?? '?')}</span>
    </span>
  );
}

const plus = (v: number, digits = 1) => (v > 0 ? `+${fmtNum(v, digits)}` : fmtNum(v, digits));

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function ProjectileDetail({ p }: { p: ProjectileView }) {
  const s = p.stats;
  const hasBlast = !!p.explosion;
  const hasCrit = p.sources.some((x) => x.crit);
  const life = s.lifetime ? (s.lifetime[0] === s.lifetime[1] ? seconds(s.lifetime[0]) : `${fmtNum(s.lifetime[0] / 60)}–${seconds(s.lifetime[1])}`) : 'until it hits';
  return (
    <div className="mt-1 mb-2 ml-7 space-y-2 rounded-[var(--radius-sm)] border border-line bg-surface-2/60 p-2 text-[12px]">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 whitespace-nowrap">
        <Stat label="Speed" value={s.speed[0] === s.speed[1] ? `${s.speed[0]} px/s` : `${s.speed[0]}–${s.speed[1]} px/s`} />
        <Stat label="Lifetime" value={life} />
        <Stat label="Spread" value={s.spread < 0 ? `0° (${fmtNum(s.spread, 1)})` : `${fmtNum(s.spread, 1)}°`} />
        <Stat label="Bounces" value={String(s.bounces)} />
        <Stat label="Knockback" value={fmtNum(s.knockback, 1)} />
        <Stat label="Gravity" value={fmtNum(s.gravity, 0)} />
        {p.explosion && <Stat label="Blast radius" value={`${p.explosion.radius} px`} />}
        {s.piercesEnemies && <Stat label="Pierces" value="enemies" />}
        {s.goesThroughWalls && <Stat label="Passes" value="through walls" />}
        {s.effects.length > 0 && <Stat label="On hit" value={s.effects.map((e) => e.replace(/^effect_/, '').replace(/_/g, ' ')).join(', ')} />}
      </dl>
      <table className="w-full tabular-nums">
        <caption className="pb-0.5 text-left text-[11px] tracking-wide text-faint uppercase">Damage from</caption>
        <thead className="sr-only">
          <tr>
            <th>Source</th>
            <th>Hit</th>
            {hasBlast && <th>Blast</th>}
            {hasCrit && <th>Crit</th>}
          </tr>
        </thead>
        <tbody>
          {p.sources.map((x, i) => (
            <tr key={i} className="border-t border-line/50 first:border-t-0">
              <td className="w-full max-w-0 py-0.5 pr-2">
                <Who spell={x.spell} perkId={x.perkId} wand={x.wand} fallback={x.mult === 0 ? 'Null shot' : p.file.split('/').pop()} />
              </td>
              {x.mult !== undefined ? (
                <td colSpan={1 + (hasBlast ? 1 : 0) + (hasCrit ? 1 : 0)} className="text-right text-ember">
                  × {fmtNum(x.mult, 0)}
                </td>
              ) : (
                <>
                  <td className="whitespace-nowrap text-right">{x.base ? fmtNum(x.damage, 1) : x.damage ? plus(x.damage) : ''}</td>
                  {hasBlast && <td className="whitespace-nowrap pl-2 text-right text-muted">{x.base && x.explosion ? `${fmtNum(x.explosion, 1)} blast` : !x.base && x.explosion ? `${plus(x.explosion)} blast` : ''}</td>}
                  {hasCrit && <td className="whitespace-nowrap pl-2 text-right text-gold">{x.crit ? `${plus(x.crit, 0)}% crit` : ''}</td>}
                </>
              )}
            </tr>
          ))}
          <tr className="border-t border-line font-medium">
            <td className="w-full max-w-0 py-0.5 pr-2">Total</td>
            <td className="whitespace-nowrap text-right">{fmtNum(p.total - (p.explosion?.damage ?? 0), 1)}</td>
            {hasBlast && <td className="whitespace-nowrap pl-2 text-right text-muted">{fmtNum(p.explosion!.damage, 1)} blast</td>}
            {hasCrit && <td className="whitespace-nowrap pl-2 text-right text-gold">{fmtNum(p.critChance, 0)}% crit</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ProjectileRow({ p, depth }: { p: ProjectileView; depth: number }) {
  const [open, setOpen] = useState(false);
  const dmg = Object.entries(p.damage)
    .filter(([, v]) => v)
    .map(([k, v]) => `${fmtNum(v!, 1)} ${k === 'projectile' ? '' : k}`.trim());
  return (
    <li style={{ marginLeft: depth * 16 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] text-left text-[13px] outline-none hover:bg-surface-2/60 focus-visible:ring-1 focus-visible:ring-ember/60"
      >
        {depth > 0 && <CornerDownRight size={13} className="shrink-0 text-faint" />}
        {p.spell ? <SpellIcon type={p.spell.type} icon={p.spell.icon} scale={1} /> : <span className="h-5 w-5 rounded bg-surface-3" />}
        <span className="truncate">{p.spell?.name ?? p.file.split('/').pop()}</span>
        <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">
          {dmg.join(' + ') || '—'}
          {p.explosion && ` · ${fmtNum(p.explosion.damage, 0)} expl r${p.explosion.radius}`}
          {p.critChance > 0 && <span className="text-gold"> · {fmtNum(p.critChance, 0)}% crit</span>}
        </span>
        <ChevronDown size={13} className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <ProjectileDetail p={p} />}
      {p.trigger && (
        <>
          <div className="mt-0.5 text-[11px] text-faint" style={{ marginLeft: 16 }}>
            Payload {TRIGGER_LABEL[p.trigger.kind]}
            {p.trigger.kind === 'timer' && p.trigger.delay !== undefined && ` ${seconds(p.trigger.delay)}`}
          </div>
          <ul className="mt-0.5 space-y-1">
            {p.trigger.children.map((ch, i) => (
              <ProjectileRow key={i} p={ch} depth={depth + 1} />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
