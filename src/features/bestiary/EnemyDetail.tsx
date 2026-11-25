import { Link } from 'react-router';
import { Eye, Skull } from 'lucide-react';
import { useData } from '@/data/store';
import type { DamageType, Enemy } from '@/data/types';
import { ENEMY_INFO, enemyTips } from '@/data/enemyInfo';
import { SECRET_MATERIALS, materialKey } from '@/data/spoilers';
import { useProgress, useSpoilers } from '@/store/progress';
import { useLiveRun } from '@/features/live/state';
import { useRuns } from '@/features/live/runs';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { BulletList, Section, StatTable } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { Source } from '@/ui/ItemDescription';
import { HiddenNotice, InlineSpoiler } from '@/ui/Spoiler';
import { StatIcon, statIconFor } from '@/ui/game';
import { CreatureSprite } from './CreatureSprite';
import { behaviorLines, combatStyle } from './fightStyle';
import { DAMAGE_LABEL, howToBeat } from './tactics';
import { recordOf, type Count } from './record';
import { rarity, useBiomeView } from './biomes';

export const enemyKey = (id: string) => `enemy:${id}`;

export function EnemyDetail({ enemy: e }: { enemy: Enemy }) {
  const { visible, reveal } = useSpoilers();
  const { materialById } = useData();
  if (!visible(enemyKey(e.id))) return <HiddenNotice what="creature" onReveal={() => reveal(enemyKey(e.id))} />;

  const matVisible = (id: string) => !SECRET_MATERIALS.has(id) || visible(materialKey(id));
  const resist = Object.entries(e.resist ?? {}).sort((a, b) => a[1]! - b[1]!) as [DamageType, number][];
  const style = combatStyle(e);
  const info = ENEMY_INFO[e.id];

  return (
    <article>
      <header className="flex flex-col items-center gap-4 pr-10 sm:flex-row sm:items-start lg:pr-0">
        <CreatureSprite enemy={e} />
        <div className="min-w-0 self-stretch">
          <h2 className="font-game text-[24px] leading-tight">{e.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {e.boss && <span className="font-game bg-blood/15 px-2 py-0.5 text-[16px] text-blood">Boss</span>}
            {!e.boss && <span className="font-game bg-gold/10 px-2 py-0.5 text-[16px] text-gold">{style.label}</span>}
            <MetThisRun id={e.id} />
          </div>
          <p className="mt-1.5 text-sm text-muted">{style.blurb}</p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        <Big label="Health" value={e.hp !== undefined ? String(e.hp) : '—'} />
        <Big label="Gold" value={e.gold !== undefined ? String(e.gold) : '—'} />
        <Big label="Moves" value={e.moves?.digs ? 'Digs' : e.moves?.flies ? 'Flies' : e.behavior?.swims ? 'Swims' : e.moves?.speed && e.moves.speed >= 5 ? `${e.moves.speed} px/s` : e.moves?.speed === 0 ? 'Still' : 'Walks'} />
      </div>
      <p className="mt-1.5 text-xs text-faint">Base values: some areas (The Vault, Temple of the Art…) make creatures tougher and richer.</p>

      <YourRecord enemy={e} />

      <Section title="How it fights">
        <BulletList items={behaviorLines(e)} />
        {e.attacks && (
          <div className="mt-2">
            <StatTable
              rows={e.attacks.map((a) => ({
                label:
                  a.kind === 'ranged'
                    ? `Shoots ${a.projectile ?? 'projectiles'}${a.count && a.count[1] > 1 ? ` ×${a.count[0] === a.count[1] ? a.count[0] : `${a.count[0]}–${a.count[1]}`}` : ''}`
                    : a.kind === 'dash'
                      ? 'Dash attack'
                      : a.kind === 'bite'
                        ? 'Bite'
                        : 'Melee',
                value: a.damage ? (a.damage[0] === a.damage[1] ? `${a.damage[0]}` : `${a.damage[0]}–${a.damage[1]}`) : '—',
                icon: a.kind === 'ranged' ? 'damage_projectile' : 'damage_melee',
              }))}
            />
          </div>
        )}
        {!e.attacks && !e.behavior?.aura && (
          <p className="mt-2 flex items-center gap-2 text-sm text-faint">
            <Skull size={15} /> It has no attack of its own.
          </p>
        )}
      </Section>

      <HowToBeat enemy={e} />
      <WhereItLives enemy={e} />

      {resist.length > 0 && (
        <Section title="Damage taken">
          <StatTable
            rows={resist.map(([type, m]) => ({
              label: DAMAGE_LABEL[type] ?? type,
              value: m === 0 ? 'Immune' : `${Math.round(m * 100)}%`,
              // Good for you when it takes more, bad when it shrugs it off.
              good: m > 1,
              bad: m < 1,
              icon: statIconFor(`${DAMAGE_LABEL[type]} damage`),
            }))}
          />
          <p className="mt-1.5 text-xs text-faint">Everything else hits it for 100%.</p>
        </Section>
      )}

      {(e.immune || e.traits) && (
        <Section title="Traits">
          <div className="flex flex-wrap gap-1.5">
            {e.immune?.map((x) => (
              <span key={x} className="slot px-2.5 py-1.5 text-xs text-muted">
                Immune: {x}
              </span>
            ))}
            {e.traits?.map((x) => (
              <span key={x} className="slot px-2.5 py-1.5 text-xs text-muted">
                {x}
              </span>
            ))}
          </div>
        </Section>
      )}

      {e.hurtBy && (
        <Section title="Hurt by">
          <div className="flex flex-wrap gap-1.5">
            {byName(
              [...e.hurtBy].sort((a, b) => b.perSecond - a.perSecond),
              (h) => materialById.get(h.material)?.name ?? h.material,
            ).map((h) => {
              const m = materialById.get(h.material);
              const show = matVisible(h.material);
              return (
                <Link key={h.material} to={`/materials/${h.material}`} className="slot slot-hover inline-flex items-center gap-2 py-1.5 pr-2.5 pl-1.5 text-sm">
                  {m && <MaterialSwatch material={m} size={20} hidden={!show} />}
                  {show ? capitalize(m?.name ?? h.material.replace(/_/g, ' ')) : '???'}
                  <span className="text-xs text-blood">{h.ofMaxHp ? `${fmtRate(h.perSecond)}%/s` : `${fmtRate(h.perSecond)}/s`}</span>
                </Link>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-faint">{e.hurtBy.some((h) => h.ofMaxHp) ? 'Share of its max health lost' : 'Health lost'} per second of contact.</p>
        </Section>
      )}

      {e.bleeds && (
        <Section title="Bleeds">
          <div className="flex flex-wrap gap-1.5">
            {byName(
              [e.bleeds.spray, e.bleeds.hit].filter((x): x is string => !!x && materialById.has(x)),
              (id) => materialById.get(id)!.name,
            ).map((id, i) => {
              const m = materialById.get(id)!;
              return (
                <Link key={id} to={`/materials/${id}`} className="slot slot-hover inline-flex items-center gap-2 py-1.5 pr-2.5 pl-1.5 text-sm">
                  <MaterialSwatch material={m} size={20} hidden={!matVisible(id)} />
                  {matVisible(id) ? capitalize(m.name) : '???'}
                  {i > 0 && <span className="text-xs text-faint">also</span>}
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Family enemy={e} />

      {info && (
        <Section title="Notes">
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-muted">
            {info.text} <Source source={info.source} />
          </p>
          {info.secret && (
            <div className="mt-2">
              <InlineSpoiler label="Show late-game secret">
                <p className="text-[15px] leading-relaxed text-muted">{info.secret}</p>
              </InlineSpoiler>
            </div>
          )}
        </Section>
      )}
    </article>
  );
}

function MetThisRun({ id }: { id: string }) {
  const met = useLiveRun((s) => s.active && !!s.run?.seen?.includes(id));
  if (!met) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-toxic/10 px-2 py-0.5 text-toxic">
      <Eye size={12} /> Met this run
    </span>
  );
}


function HowToBeat({ enemy: e }: { enemy: Enemy }) {
  const tips = howToBeat(e);
  const extra = enemyTips(e.id);
  if (!tips.length && !extra.length) return null;
  return (
    <Section title="How to beat it">
      <BulletList items={[...extra.map((text) => ({ text, tone: 'good' as const })), ...tips]} />
    </Section>
  );
}

function WhereItLives({ enemy: e }: { enemy: Enemy }) {
  const { ready, habitats } = useBiomeView();
  const { reveal } = useSpoilers();
  const where = ENEMY_INFO[e.id]?.where;
  const list = habitats(e);
  if (!list.length && !where) return null;
  return (
    <Section title="Where it lives">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((h) =>
            h.shown ? (
              <span key={h.name} className="slot inline-flex items-center gap-2 px-2.5 py-1.5 text-sm">
                {h.name}
                <span className={`text-xs ${rarity(h.share) === 'Common' ? 'text-toxic' : rarity(h.share) === 'Uncommon' ? 'text-gold' : 'text-faint'}`}>{rarity(h.share)}</span>
                {h.count[1] > 1 && <span className="text-xs text-faint">×{h.count[0] === h.count[1] ? h.count[0] : `${h.count[0]}–${h.count[1]}`}</span>}
              </span>
            ) : (
              <button
                key={h.name}
                type="button"
                onClick={() => h.keys.forEach(reveal)}
                title="An area you haven't reached. Tap to reveal its name."
                className="slot slot-hover inline-flex items-center gap-2 px-2.5 py-1.5 text-sm text-faint"
              >
                {ready ? '???' : '…'}
              </button>
            ),
          )}
        </div>
      )}
      {where && <p className={`text-sm text-muted ${list.length ? 'mt-2' : ''}`}>{where}</p>}
      {list.length > 0 && <p className="mt-1.5 text-xs text-faint">How often it turns up among the creatures each area spawns.</p>}
    </Section>
  );
}

/** A creature named for linking: its icon and name, or "???" when you haven't met it. */
export function CreatureChip({ id, n, detail }: { id: string; n?: number; /** Shown after the name once met, e.g. its health. */ detail?: string }) {
  const { enemyById } = useData();
  const { visible } = useSpoilers();
  const c = enemyById.get(id);
  const label = (s: string) => (n && n > 1 ? `${s} ×${n}` : s);
  if (!c) return <span className="slot px-2.5 py-1.5 text-xs text-muted">{label(id.replace(/_/g, ' '))}</span>;
  const shown = visible(enemyKey(id));
  return (
    <Link to={`/bestiary/${id}`} className="slot slot-hover inline-flex items-center gap-1.5 py-1 pr-2.5 pl-1 text-sm">
      {shown ? <AtlasIcon atlas="enemies" icon={c.icon} scale={1} /> : <span className="font-game w-6 text-center text-[16px] text-faint">?</span>}
      <span className={shown ? '' : 'text-faint'}>{label(shown ? c.name : '???')}</span>
      {shown && detail && <span className="text-xs text-faint">{detail}</span>}
    </Link>
  );
}

function Family({ enemy: e }: { enemy: Enemy }) {
  const { enemies, enemyById } = useData();
  // A relative with the same name (the weaker Hurtta) is told apart by its health.
  const hpIfSameName = (id: string) => {
    const v = enemyById.get(id);
    return v && v.name === e.name && v.hp !== undefined ? `${v.hp} HP` : undefined;
  };
  const foes = new Set((e.relations?.foes ?? []).filter((h) => h !== 'player'));
  const hunted = foes.size ? enemies.filter((x) => x.herd && foes.has(x.herd) && x.id !== e.id) : [];
  if (!e.variants?.length && !hunted.length) return null;
  return (
    <Section title="Variants & rivals">
      {e.variants?.length ? (
        <>
          <p className="mb-1.5 text-xs text-faint">Related creatures</p>
          <div className="flex flex-wrap gap-1.5">
            {e.variants.map((id) => (
              <CreatureChip key={id} id={id} detail={hpIfSameName(id)} />
            ))}
          </div>
        </>
      ) : null}
      {hunted.length > 0 && <Rivals list={hunted} />}
    </Section>
  );
}

/** Creatures of herds it goes after: the ones you've met, and how many more. */
function Rivals({ list }: { list: Enemy[] }) {
  const { visible } = useSpoilers();
  const met = list.filter((x) => visible(enemyKey(x.id)));
  const more = list.length - met.length;
  return (
    <>
      <p className="mt-3 mb-1.5 text-xs text-faint">Fights these creatures when they meet</p>
      <div className="flex flex-wrap gap-1.5">
        {met.slice(0, 16).map((x) => (
          <CreatureChip key={x.id} id={x.id} />
        ))}
        {(more > 0 || met.length > 16) && (
          <span className="px-1 py-1.5 text-xs text-faint">
            {met.length > 16 ? `+${met.length - 16} more` : ''}
            {met.length > 16 && more > 0 ? ', ' : ''}
            {more > 0 ? `${more} you haven't met` : ''}
          </span>
        )}
      </div>
    </>
  );
}

function YourRecord({ enemy: e }: { enemy: Enemy }) {
  const stat = useProgress((s) => s.progress?.enemyStats?.[e.id]);
  const deaths = useProgress((s) => s.progress?.deaths);
  const runs = useRuns((s) => s.records);
  const r = recordOf(e.id, stat, deaths);
  if (!r) return null;
  const killed = r.killedYou ? `killed you ${r.killedYou === 1 ? 'once' : `${r.killedYou} times`}` : 'never killed you';
  const others = [...r.byOthers, ...r.byWorld];
  const runOf = (seed: number) => runs.find((x) => x.seed === seed && x.outcome === 'died');
  return (
    <Section title="Your record">
      <p className="msg-box font-game text-[16px]">
        {r.youKilled ? `You killed ${r.youKilled}` : `${r.died} died`} · {killed}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {r.byYou.length > 0 && (
          <Counts title="How you killed it" items={r.byYou} />
        )}
        {r.deaths.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-faint">Runs it ended</p>
            <ul className="space-y-1 text-sm">
              {r.deaths.slice(0, 6).map((d) => {
                const run = runOf(d.seed);
                const when = new Date(d.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                return (
                  <li key={d.date} className="flex items-center gap-2 text-muted">
                    <Skull size={13} className="shrink-0 text-blood" />
                    {run ? (
                      <Link to={`/run/${encodeURIComponent(run.id)}`} className="underline decoration-dotted underline-offset-2 hover:text-gold">
                        {when}
                      </Link>
                    ) : (
                      <span>{when}</span>
                    )}
                    <span className="text-xs text-faint">seed {d.seed}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {others.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-faint">What else killed it</p>
            <div className="flex flex-wrap gap-1.5">
              {r.byOthers.slice(0, 8).map((c) => (
                <CreatureChip key={c.key} id={c.key} n={c.n} />
              ))}
              {r.byWorld.slice(0, 6).map((c) => (
                <span key={c.key} className="slot px-2.5 py-1.5 text-xs text-muted">
                  {capitalize(c.key)} ×{c.n}
                </span>
              ))}
            </div>
          </div>
        )}
        {r.victims.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-faint">What it has killed</p>
            <div className="flex flex-wrap gap-1.5">
              {r.victims.slice(0, 10).map((c) => (
                <CreatureChip key={c.key} id={c.key} n={c.n} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function Counts({ title, items }: { title: string; items: Count[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-faint">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 8).map((c) => (
          <span key={c.key} className="slot px-2.5 py-1.5 text-xs text-muted">
            {capitalize(c.key)} <span className="text-ink">×{c.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The first of each name: materials that share a name (two kinds of toxic gas) read as one to the player. */
const byName = <T,>(xs: T[], name: (x: T) => string) => xs.filter((x, i) => xs.findIndex((y) => name(y).toLowerCase() === name(x).toLowerCase()) === i);
/** 6, 1.5, 0.06, or "<0.01" for the trickles (poo gas). */
const fmtRate = (n: number) => (n >= 10 ? String(Math.round(n)) : n >= 0.01 ? String(Number(n.toPrecision(2))) : '<0.01');

function Big({ label, value }: { label: string; value: string }) {
  const icon = label === 'Health' ? 'hud_health' : label === 'Gold' ? 'hud_money' : 'speed_multiplier';
  return (
    <div className="slot px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-faint uppercase">
        <StatIcon name={icon} />
        {label}
      </div>
      <div className="font-game mt-1 text-[24px] leading-none">{value}</div>
    </div>
  );
}
