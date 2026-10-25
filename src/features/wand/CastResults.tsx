import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CornerDownRight, Loader2 } from 'lucide-react';
import { useData } from '@/data/store';
import { fmtNum, seconds } from '@/data/format';
import type { CastView, ProjectileView } from '@/sim/analyze';
import { SpellIcon } from '@/ui/GameIcon';
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

      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {view.damage > 0 && <span className="rounded bg-ember/15 px-1.5 py-0.5 text-ember">≈{fmtNum(view.damage, 0)} dmg</span>}
        {c.no_mana > 0 && <span className="rounded bg-gold/15 px-1.5 py-0.5 text-gold">{c.no_mana} skipped (mana)</span>}
        {c.reload !== undefined && <span className="rounded bg-frost/15 px-1.5 py-0.5 text-frost">Recharge {seconds(c.reload)}</span>}
      </div>
    </>
  );
}

const TRIGGER_LABEL = { hit: 'on hit', timer: 'after', death: 'on expiry' } as const;

function ProjectileRow({ p, depth }: { p: ProjectileView; depth: number }) {
  const dmg = Object.entries(p.damage)
    .filter(([, v]) => v)
    .map(([k, v]) => `${fmtNum(v!, 1)} ${k === 'projectile' ? '' : k}`.trim());
  return (
    <li style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 text-[13px]">
        {depth > 0 && <CornerDownRight size={13} className="text-faint" />}
        {p.spell ? <SpellIcon type={p.spell.type} icon={p.spell.icon} scale={1} /> : <span className="h-5 w-5 rounded bg-surface-3" />}
        <span className="truncate">{p.spell?.name ?? p.file.split('/').pop()}</span>
        <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">
          {dmg.join(' + ') || '—'}
          {p.explosion && ` · ${fmtNum(p.explosion.damage, 0)} expl r${p.explosion.radius}`}
          {p.critChance > 0 && <span className="text-gold"> · {fmtNum(p.critChance, 0)}% crit</span>}
        </span>
      </div>
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
