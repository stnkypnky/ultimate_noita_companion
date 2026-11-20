import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import MiniSearch from 'minisearch';
import { useData } from '@/data/store';
import type { Enemy } from '@/data/types';
import { useProgress, useSpoilers } from '@/store/progress';
import { useLiveRun } from '@/features/live/state';
import { DiscoveryBar } from '@/features/progress/DiscoveryBar';
import { Page } from '@/ui/Page';
import { Chip, ChipRow, SearchInput, Select, useSearchFocus } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { MasterDetail } from '@/ui/MasterDetail';
import { Runes } from '@/ui/game';
import { useDebounced } from '@/ui/hooks';
import { EnemyDetail, enemyKey } from './EnemyDetail';
import { useBiomeView } from './biomes';
import { combatStyle } from './fightStyle';

type Filter = 'boss' | 'flies' | 'ranged' | 'killedYou' | 'thisRun';
type Sort = 'game' | 'name' | 'hp' | 'gold' | 'killedYou';

export function BestiaryPage() {
  const { enemies, enemyById } = useData();
  const { id } = useParams();
  const navigate = useNavigate();
  const { visible, mode } = useSpoilers();
  const stats = useProgress((s) => s.progress?.enemyStats);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sort, setSort] = useState<Sort>('game');
  const [biome, setBiome] = useState('');
  const q = useDebounced(query);
  const liveSeen = useLiveRun((s) => (s.active ? s.run?.seen : undefined));
  const metNow = useMemo(() => new Set(liveSeen ?? []), [liveSeen]);
  const { habitats } = useBiomeView();
  // Areas you can see that something you've met lives in.
  const biomes = useMemo(() => {
    const names = new Set<string>();
    for (const e of enemies) if (visible(enemyKey(e.id))) for (const h of habitats(e)) if (h.shown) names.add(h.name);
    return [...names].sort();
  }, [enemies, habitats, visible]);
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
        thisRun: (e) => metNow.has(e.id),
      };
      list = list.filter((e) => seen(e) && test[filter](e));
    }
    if (biome) list = list.filter((e) => seen(e) && habitats(e).some((h) => h.shown && h.name === biome));
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
  }, [q, search, enemyById, enemies, filter, sort, seen, stats, metNow, biome, habitats]);

  const selected = id ? enemyById.get(id) : undefined;
  const close = useCallback(() => navigate('/bestiary'), [navigate]);

  return (
    <Page
      wide
      title="Bestiary" progress={<DiscoveryBar kind="enemies" />}
      subtitle={mode === 'all' ? `${enemies.length} creatures` : undefined}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search creatures…" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <ChipRow>
                {(
                  [
                    ['boss', 'Bosses'],
                    ['flies', 'Flying'],
                    ['ranged', 'Shoots'],
                    ...(stats ? ([['killedYou', 'Killed you']] as const) : []),
                    ...(metNow.size ? ([['thisRun', 'This run']] as const) : []),
                  ] as const
                ).map(([f, label]) => (
                  <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? null : f)}>
                    {label}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            {biomes.length > 0 && (
              <Select
                label="Area"
                value={biome}
                onChange={setBiome}
                options={[{ value: '', label: 'All areas' }, ...biomes.map((b) => ({ value: b, label: b }))]}
              />
            )}
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
                            {combatStyle(e).label}
                            {e.hp !== undefined ? ` · ${e.hp} HP` : ''}
                          </span>
                        )}
                      </span>
                      {!hidden && metNow.has(e.id) && (
                        <span title="Met this run" className="shrink-0">
                          <LiveCrystal size={14} />
                        </span>
                      )}
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
