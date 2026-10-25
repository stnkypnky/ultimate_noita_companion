import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import MiniSearch from 'minisearch';
import { useData } from '@/data/store';
import type { Perk } from '@/data/types';
import { useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Chip, ChipRow, SearchInput, Section, StatTable, useSearchFocus } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { MasterDetail } from '@/ui/MasterDetail';
import { HiddenNotice } from '@/ui/Spoiler';
import { useDebounced } from '@/ui/hooks';

type Filter = 'stackable' | 'once' | 'enemies';

export function PerksPage() {
  const { perks, perkById } = useData();
  const { id } = useParams();
  const navigate = useNavigate();
  const { visible, mode } = useSpoilers();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const q = useDebounced(query);
  const searchRef = useSearchFocus();

  const search = useMemo(() => {
    const ms = new MiniSearch<Perk>({ fields: ['name', 'description', 'id'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3 } } });
    ms.addAll(perks);
    return ms;
  }, [perks]);

  const shown = useMemo(() => {
    let list = q ? search.search(q).map((r) => perkById.get(r.id as string)!).filter((p) => visible(p.discoverFlag)) : perks;
    if (filter) {
      const test: Record<Filter, (p: Perk) => boolean> = {
        stackable: (p) => p.stackable,
        once: (p) => !p.stackable,
        enemies: (p) => p.usableByEnemies,
      };
      list = list.filter((p) => test[filter](p) && visible(p.discoverFlag));
    }
    return list;
  }, [q, search, perkById, perks, filter, visible]);

  const discovered = perks.filter((p) => visible(p.discoverFlag)).length;
  const selected = id ? perkById.get(id) : undefined;
  const close = useCallback(() => navigate('/perks'), [navigate]);

  return (
    <Page
      wide
      title="Perks"
      subtitle={mode === 'all' ? `${perks.length} perks` : `${discovered} of ${perks.length} discovered`}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search perks…" />
          <ChipRow>
            {(
              [
                ['stackable', 'Stackable'],
                ['once', 'One per run'],
                ['enemies', 'Enemies can get it'],
              ] as const
            ).map(([f, label]) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? null : f)}>
                {label}
              </Chip>
            ))}
          </ChipRow>
        </>
      }
    >
      <MasterDetail
        detailKey={selected?.id}
        onClose={close}
        detail={selected ? <PerkDetail perk={selected} /> : null}
        empty={<p className="mt-24 text-center text-sm text-faint">Select a perk to see its details.</p>}
        list={
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {shown.map((p) => {
              const hidden = !visible(p.discoverFlag);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => navigate(`/perks/${p.id}`)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] border p-2.5 text-left transition-colors ${
                      p.id === id ? 'border-ember/60 bg-surface-2' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
                    }`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-raised">
                      {hidden ? <span className="font-display text-lg text-faint">?</span> : <AtlasIcon atlas="perks" icon={p.icon} scale={2} />}
                    </span>
                    <span className={`truncate text-[13px] font-medium ${hidden ? 'text-faint' : ''}`}>{hidden ? '???' : p.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        }
      />
    </Page>
  );
}

function PerkDetail({ perk }: { perk: Perk }) {
  const { visible, reveal } = useSpoilers();
  if (!visible(perk.discoverFlag)) return <HiddenNotice what="perk" onReveal={() => reveal(perk.discoverFlag)} />;

  const rows = [
    { label: 'Stackable', value: perk.stackable ? (perk.maxStack ? `Up to ${perk.maxStack}` : 'Yes') : 'No' },
    ...(perk.stackable && perk.stackableRare ? [{ label: 'Stacking', value: 'Rarely reappears' }] : []),
    ...(perk.maxInPool ? [{ label: 'Max in perk pool', value: String(perk.maxInPool) }] : []),
    { label: 'Enemies can have it', value: perk.usableByEnemies ? 'Yes' : 'No' },
    ...(!perk.inDefaultPool ? [{ label: 'Perk pool', value: 'Special only' }] : []),
    ...(perk.removesOtherPerks ? [{ label: 'Note', value: 'Removes other perks' }] : []),
  ];

  return (
    <article>
      <header className="flex items-start gap-4 pr-10 lg:pr-0">
        <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-line bg-raised">
          <AtlasIcon atlas="perks" icon={perk.icon} scale={4} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight">{perk.name}</h2>
          <code className="text-xs text-faint">{perk.id}</code>
        </div>
      </header>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{perk.description}</p>
      <Section title="Details">
        <StatTable rows={rows} />
      </Section>
    </article>
  );
}
