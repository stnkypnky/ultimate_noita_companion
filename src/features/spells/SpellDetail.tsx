import { Link } from 'react-router';
import { Wand2 } from 'lucide-react';
import { useData } from '@/data/store';
import type { DamageType, Projectile, Spell } from '@/data/types';
import { fmtNum, prettyEntity, seconds, spellStatLines } from '@/data/format';
import { useSpoilers } from '@/store/progress';
import { Section, StatTable } from '@/ui/controls';
import { SpellIcon, TYPE_COLOR, TYPE_LABEL } from '@/ui/GameIcon';
import { HiddenNotice, InlineSpoiler } from '@/ui/Spoiler';
import { StatIcon, type StatIconName } from '@/ui/game';

const DAMAGE_LABEL: Record<DamageType, string> = {
  projectile: 'Projectile', explosion: 'Explosion', melee: 'Melee', slice: 'Slice', fire: 'Fire', electricity: 'Electric',
  ice: 'Ice', drill: 'Drill', curse: 'Curse', holy: 'Holy', healing: 'Healing', radioactive: 'Toxic', poison: 'Poison',
  physics_hit: 'Physics', overeating: 'Overeating',
};

export function SpellDetail({ spell }: { spell: Spell }) {
  const { projectiles } = useData();
  const { visible, reveal, hasFlag, mode } = useSpoilers();

  if (!visible(spell.discoverFlag)) return <HiddenNotice what="spell" onReveal={() => reveal(spell.discoverFlag)} />;

  const effects = spellStatLines(spell.stats, spell.reloadDelta);
  const delay = Number(spell.stats.fire_rate_wait ?? 0);
  const projs = spell.projectiles.map((f) => projectiles[f]).filter((p): p is Projectile => !!p);
  const extra = [...new Set([...String(spell.stats.extra_entities ?? '').split(','), ...spell.extraEntities].filter(Boolean))];

  return (
    <article>
      <header className="flex items-start gap-4 pr-10 lg:pr-0">
        <SpellIcon type={spell.type} icon={spell.icon} scale={4} />
        <div className="min-w-0">
          <h2 className="font-game text-[24px] leading-tight">{spell.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-game px-2 py-0.5 text-[16px]" style={{ background: `${TYPE_COLOR[spell.type]}22`, color: TYPE_COLOR[spell.type] }}>
              {TYPE_LABEL[spell.type]}
            </span>
            <code className="text-faint">{spell.id}</code>
          </div>
        </div>
      </header>

      <p className="mt-4 text-[15px] leading-relaxed text-muted">{spell.description}</p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        <Big icon="mana_drain" label="Mana" value={fmtNum(spell.mana)} tone={spell.mana < 0 ? 'good' : undefined} />
        <Big icon="action_max_uses" label="Uses" value={spell.maxUses === null ? '∞' : String(spell.maxUses)} />
        <Big icon="fire_rate_wait" label="Cast delay" value={delay ? (delay > 0 ? '+' : '') + seconds(delay) : '—'} tone={delay < 0 ? 'good' : delay > 0 ? 'bad' : undefined} />
        <Big
          icon="gun_reload_time"
          label="Recharge"
          value={spell.reloadDelta ? (spell.reloadDelta > 0 ? '+' : '') + seconds(spell.reloadDelta) : '—'}
          tone={spell.reloadDelta < 0 ? 'good' : spell.reloadDelta > 0 ? 'bad' : undefined}
        />
      </div>

      {spell.trigger ? (
        <p className="msg-box font-game mt-3 text-[16px]">
          Casts {spell.trigger.draw} {spell.trigger.draw === 1 ? 'spell' : 'spells'}{' '}
          {spell.trigger.kind === 'hit' ? 'on impact' : spell.trigger.kind === 'death' ? 'when it expires' : `after ${seconds(spell.trigger.delay ?? 0)}`}
        </p>
      ) : (
        spell.draw > 0 && (
          <p className="msg-box font-game mt-3 text-[16px]">
            Draws {spell.draw} {spell.draw === 1 ? 'spell' : 'spells'}
            {spell.type === 'multicast' ? ' and casts them together' : ''}
          </p>
        )
      )}

      <div>
        <Link to={`/wand?add=${spell.id}`} className="btn-game font-game mt-4 text-[16px]">
          <Wand2 size={16} /> Add to wand
        </Link>
      </div>

      {effects.filter((e) => !['Cast delay', 'Recharge time'].includes(e.label)).length > 0 && (
        <Section title="Shot modifiers">
          <StatTable rows={effects.filter((e) => !['Cast delay', 'Recharge time'].includes(e.label))} />
        </Section>
      )}

      {projs.map((p) => (
        <Section key={p.file} title={projs.length > 1 ? `Projectile · ${prettyEntity(p.file)}` : 'Projectile'}>
          <StatTable rows={projectileRows(p)} />
        </Section>
      ))}

      {extra.length > 0 && (
        <Section title="Adds effects">
          <div className="flex flex-wrap gap-1.5">
            {extra.map((e) => (
              <span key={e} className="slot px-2.5 py-1.5 text-xs text-muted">
                {prettyEntity(e)}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Where it appears">
        <SpawnChart spawn={spell.spawn} />
        <p className="mt-2 text-xs text-faint">Shop price {spell.price} gold · appearance weight by wand tier</p>
      </Section>

      {spell.requiresFlag && (
        <Section title="Secret unlock">
          <InlineSpoiler label="Show unlock requirement">
            <p className="text-sm text-muted">
              Only appears after unlocking <code className="text-gold">{spell.requiresFlag.replace('card_unlocked_', '')}</code>
              {mode !== 'all' && <> — {hasFlag(spell.requiresFlag) ? 'you have unlocked it.' : 'not unlocked on your save yet.'}</>}
            </p>
          </InlineSpoiler>
        </Section>
      )}
    </article>
  );
}

function Big({ label, value, tone, icon }: { label: string; value: string; tone?: 'good' | 'bad'; icon: StatIconName }) {
  return (
    <div className="slot px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-faint uppercase">
        <StatIcon name={icon} />
        {label}
      </div>
      <div className={`font-game mt-1 text-[24px] leading-none ${tone === 'good' ? 'text-toxic' : tone === 'bad' ? 'text-blood' : ''}`}>{value}</div>
    </div>
  );
}

function projectileRows(p: Projectile) {
  const rows: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(p.damage)) if (v) rows.push({ label: `${DAMAGE_LABEL[k as DamageType] ?? k} damage`, value: fmtNum(v) });
  if (p.explosion && (p.explosion.damage || p.explosion.radius > 4)) {
    rows.push({ label: 'Explosion', value: `${fmtNum(p.explosion.damage)} dmg · radius ${p.explosion.radius}` });
  }
  const speed = p.speed[0] === p.speed[1] ? fmtNum(p.speed[0]) : `${fmtNum(p.speed[0])}–${fmtNum(p.speed[1])}`;
  if (p.speed[1] > 0) rows.push({ label: 'Speed', value: speed });
  if (p.lifetime > 0) rows.push({ label: 'Lifetime', value: `${seconds(p.lifetime)}${p.lifetimeRandom ? ` ±${p.lifetimeRandom}f` : ''}` });
  if (p.spread) rows.push({ label: 'Spread', value: `${fmtNum(p.spread, 1)}°` });
  if (p.bounces) rows.push({ label: 'Bounces', value: String(p.bounces) });
  if (p.damageEveryFrames > 0) rows.push({ label: 'Damage tick', value: `every ${seconds(p.damageEveryFrames)}` });
  const traits = [
    p.penetrateEntities && 'Pierces',
    p.penetrateWorld && 'Through walls',
    !p.dieOnCollision && 'Survives hits',
    p.friendlyFire && 'Can hurt you',
  ].filter(Boolean);
  if (traits.length) rows.push({ label: 'Traits', value: traits.join(' · ') });
  if (p.effects.length) rows.push({ label: 'On hit', value: p.effects.map(prettyEntity).join(', ') });
  if (p.material) rows.push({ label: 'Emits', value: p.material.replace(/_/g, ' ') });
  return rows;
}

/** Appearance weight per wand/shop tier 0–10. */
function SpawnChart({ spawn }: { spawn: Spell['spawn'] }) {
  if (!spawn.length) return <p className="text-sm text-faint">Doesn't appear in wands or shops.</p>;
  const max = Math.max(...spawn.map((s) => s.prob), 0.0001);
  const tiers = Array.from({ length: 11 }, (_, i) => spawn.find((s) => s.level === i)?.prob ?? 0);
  return (
    <div className="panel flex h-20 items-end gap-1 px-3 pt-3 pb-1.5">
      {tiers.map((p, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full bg-[linear-gradient(#ffcf4a_0_3px,#f89000_3px)]"
            style={{ height: `${(p / max) * 44}px`, opacity: p ? 1 : 0.15, minHeight: 2 }}
            title={`Tier ${i}: ${p}`}
          />
          <span className="text-[10px] text-faint tabular-nums">{i}</span>
        </div>
      ))}
    </div>
  );
}
