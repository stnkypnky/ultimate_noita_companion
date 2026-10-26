import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import MiniSearch from 'minisearch';
import { Skull } from 'lucide-react';
import { useData } from '@/data/store';
import type { DamageType, Enemy } from '@/data/types';
import { SECRET_MATERIALS, materialKey } from '@/data/spoilers';
import { useProgress, useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Chip, ChipRow, SearchInput, Section, Select, StatTable, useSearchFocus } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { MasterDetail } from '@/ui/MasterDetail';
import { HiddenNotice } from '@/ui/Spoiler';
import { Runes, StatIcon, statIconFor } from '@/ui/game';
import { useDebounced } from '@/ui/hooks';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';

type Filter = 'boss' | 'flies' | 'ranged' | 'killedYou';
type Sort = 'game' | 'name' | 'hp' | 'gold' | 'killedYou';

export const enemyKey = (id: string) => `enemy:${id}`;

const DAMAGE_LABEL: Record<DamageType, string> = {
  projectile: 'Projectile', explosion: 'Explosion', melee: 'Melee', slice: 'Slice', fire: 'Fire', electricity: 'Electric',
  ice: 'Ice', drill: 'Drill', curse: 'Curse', holy: 'Holy', healing: 'Healing', radioactive: 'Toxic', poison: 'Poison',
  physics_hit: 'Physics', overeating: 'Overeating',
};

export function BestiaryPage() {
  const { enemies, enemyById } = useData();
  const { id } = useParams();
  const navigate = useNavigate();
  const { visible, mode } = useSpoilers();
  const stats = useProgress((s) => s.progress?.enemyStats);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sort, setSort] = useState<Sort>('game');
  const q = useDebounced(query);
  const searchRef = useSearchFocus();
  const seen = useCallback((e: Enemy) => visible(enemyKey(e.id)), [visible]);

  const search = useMemo(() => {
    const ms = new MiniSearch<Enemy>({ fields: ['name', 'id'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3 } } });
    ms.addAll(enemies);
    return ms;
  }, [enemies]);

  const shown = useMemo(() => {
    // Searching or filtering only ever matches creatures you've seen, so it can't give anything away.
    let list = q ? search.search(q).map((r) => enemyById.get(r.id as string)!).filter(seen) : enemies;
    if (filter) {
      const test: Record<Filter, (e: Enemy) => boolean> = {
        boss: (e) => !!e.boss,
        flies: (e) => !!e.moves?.flies,
        ranged: (e) => !!e.attacks?.some((a) => a.kind === 'ranged'),
        killedYou: (e) => (stats?.[e.id]?.killedYou ?? 0) > 0,
      };
      list = list.filter((e) => seen(e) && test[filter](e));
    }
    if (sort !== 'game') {
      const key: Record<Exclude<Sort, 'game'>, (e: Enemy) => number | string> = {
        name: (e) => e.name,
        hp: (e) => -(e.hp ?? 0),
        gold: (e) => -(e.gold ?? 0),
        killedYou: (e) => -(stats?.[e.id]?.killedYou ?? 0),
      };
      const k = key[sort];
      // Unseen creatures sort last so their numbers don't leak through the order.
      list = [...list].sort((a, b) => Number(!seen(a)) - Number(!seen(b)) || (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
    }
    return list;
  }, [q, search, enemyById, enemies, filter, sort, seen, stats]);

  const discovered = enemies.filter(seen).length;
  const selected = id ? enemyById.get(id) : undefined;
  const close = useCallback(() => navigate('/bestiary'), [navigate]);

  return (
    <Page
      wide
      title="Bestiary"
      subtitle={mode === 'all' ? `${enemies.length} creatures` : `${discovered} of ${enemies.length} encountered`}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search creatures…" />
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <ChipRow>
                {(
                  [
                    ['boss', 'Bosses'],
                    ['flies', 'Flying'],
                    ['ranged', 'Shoots'],
                    ...(stats ? ([['killedYou', 'Killed you']] as const) : []),
                  ] as const
                ).map(([f, label]) => (
                  <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? null : f)}>
                    {label}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            <div className="hidden sm:block">
              <Select
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'game', label: 'Game order' },
                  { value: 'name', label: 'Name' },
                  { value: 'hp', label: 'Health' },
                  { value: 'gold', label: 'Gold' },
                  ...(stats ? [{ value: 'killedYou' as const, label: 'Killed you' }] : []),
                ]}
              />
            </div>
          </div>
        </>
      }
    >
      <MasterDetail
        detailKey={selected?.id}
        onClose={close}
        detail={selected ? <EnemyDetail enemy={selected} /> : null}
        empty={
          <div className="mt-24 text-center text-sm text-faint">
            <Runes className="mb-2 block text-[16px] text-gold/40">know thy enemy</Runes>
            Select a creature to see what it can do.
          </div>
        }
        list={
          shown.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">No encountered creatures match.</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
              {shown.map((e) => {
                const hidden = !seen(e);
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => navigate(`/bestiary/${e.id}`)}
                      data-active={e.id === id || undefined}
                      className="slot slot-hover flex w-full items-center gap-3 p-2 text-left"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center">
                        {hidden ? <span className="font-game text-[16px] text-faint">?</span> : <AtlasIcon atlas="enemies" icon={e.icon} scale={2} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] font-medium ${hidden ? 'text-faint' : ''}`}>{hidden ? '???' : e.name}</span>
                        {!hidden && (
                          <span className="block truncate text-[11px] text-faint">
                            {e.boss ? 'Boss · ' : ''}
                            {e.hp !== undefined ? `${e.hp} HP` : ''}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        }
      />
    </Page>
  );
}

function EnemyDetail({ enemy: e }: { enemy: Enemy }) {
  const { visible, reveal } = useSpoilers();
  const { materialById } = useData();
  const history = useProgress((s) => s.progress?.enemyStats?.[e.id]);
  if (!visible(enemyKey(e.id))) return <HiddenNotice what="creature" onReveal={() => reveal(enemyKey(e.id))} />;

  // The creature's own sprite when it's a usable size, else its Progress-screen icon.
  const portrait = e.portrait && e.portrait.w >= 12 && e.portrait.h >= 12 ? e.portrait : undefined;
  const scale = portrait ? Math.max(1, Math.min(4, Math.floor(72 / Math.max(portrait.w, portrait.h)))) : 4;
  const matVisible = (id: string) => !SECRET_MATERIALS.has(id) || visible(materialKey(id));

  const resist = Object.entries(e.resist ?? {}).sort((a, b) => a[1]! - b[1]!) as [DamageType, number][];

  return (
    <article>
      <header className="flex items-start gap-4 pr-10 lg:pr-0">
        <span className="slot grid h-24 w-24 shrink-0 place-items-center overflow-hidden">
          {portrait ? <AtlasIcon atlas="bestiary" icon={portrait} scale={scale} /> : <AtlasIcon atlas="enemies" icon={e.icon} scale={4} />}
        </span>
        <div className="min-w-0">
          <h2 className="font-game text-[24px] leading-tight">{e.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {e.boss && <span className="font-game bg-blood/15 px-2 py-0.5 text-[16px] text-blood">Boss</span>}
            {e.herd && <span className="text-faint">Herd: {e.herd.replace(/_/g, ' ')}</span>}
          </div>
          <code className="text-xs text-faint">{e.id}</code>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        <Big label="Health" value={e.hp !== undefined ? String(e.hp) : '—'} />
        <Big label="Gold" value={e.gold !== undefined ? String(e.gold) : '—'} />
        <Big label="Moves" value={e.moves?.digs ? 'Digs' : e.moves?.flies ? 'Flies' : e.moves?.speed && e.moves.speed >= 5 ? `${e.moves.speed} px/s` : 'Walks'} />
      </div>
      <p className="mt-1.5 text-xs text-faint">Base values: some areas (The Vault, Temple of the Art…) make creatures tougher and richer.</p>

      {history && (
        <p className="msg-box font-game mt-3 text-[16px]">
          {history.died} died · {history.killedYou ? `killed you ${history.killedYou === 1 ? 'once' : `${history.killedYou} times`}` : 'never killed you'}
        </p>
      )}

      {e.attacks && (
        <Section title="Attacks">
          <StatTable
            rows={e.attacks.map((a) => ({
              label: a.kind === 'ranged' ? `Shoots ${a.projectile ?? 'projectiles'}${a.count && a.count[1] > 1 ? ` ×${a.count[0] === a.count[1] ? a.count[0] : `${a.count[0]}–${a.count[1]}`}` : ''}` : a.kind === 'dash' ? 'Dash attack' : a.kind === 'bite' ? 'Bite' : 'Melee',
              value: a.damage ? (a.damage[0] === a.damage[1] ? `${a.damage[0]}` : `${a.damage[0]}–${a.damage[1]}`) : '—',
              icon: a.kind === 'ranged' ? 'damage_projectile' : 'damage_melee',
            }))}
          />
          {e.attacks.some((a) => a.kind === 'ranged' && a.range) && (
            <p className="mt-1.5 text-xs text-faint">Shoots from up to {e.attacks.find((a) => a.range)?.range} px away.</p>
          )}
        </Section>
      )}

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
            {e.hurtBy.map((h) => {
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
            {[...new Set([e.bleeds.spray, e.bleeds.hit].filter((x): x is string => !!x))].map((id, i) => {
              const m = materialById.get(id);
              if (!m) return null;
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

      {!e.attacks && !resist.length && !e.hurtBy && (
        <p className="mt-6 flex items-center gap-2 text-sm text-faint">
          <Skull size={15} /> Its game file doesn't describe how it fights.
        </p>
      )}
    </article>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
