import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import MiniSearch from 'minisearch';
import { useData } from '@/data/store';
import type { Perk } from '@/data/types';
import { useSpoilers } from '@/store/progress';
import { DiscoveryBar } from '@/features/progress/DiscoveryBar';
import { Page } from '@/ui/Page';
import { BulletList, Chip, ChipRow, SearchInput, Section, StatTable, useSearchFocus } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { MasterDetail } from '@/ui/MasterDetail';
import { HiddenNotice, InlineSpoiler, RareCallout } from '@/ui/Spoiler';
import { Source } from '@/ui/ItemDescription';
import { PERK_INFO } from '@/data/perkInfo';
import { deckCopies, perkRarity, runsWording, type PerkRarity } from '@/data/perkRarity';
import { HiddenMechanics } from '@/ui/HiddenMechanics';
import { useDebounced } from '@/ui/hooks';

type Filter = 'stackable' | 'once' | 'enemies' | 'rare';

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
    const ms = new MiniSearch<Perk>({
      fields: ['name', 'description', 'id', 'notes'],
      storeFields: ['id'],
      extractField: (p, f) => (f === 'notes' ? (PERK_INFO[p.id]?.text ?? '') : String((p as Record<string, unknown>)[f] ?? '')),
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3 } },
    });
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
        rare: (p) => perkRarity(p) === 'Rare',
      };
      list = list.filter((p) => test[filter](p) && visible(p.discoverFlag));
    }
    return list;
  }, [q, search, perkById, perks, filter, visible]);

  const selected = id ? perkById.get(id) : undefined;
  const close = useCallback(() => navigate('/perks'), [navigate]);

  return (
    <Page
      wide
      title="Perks" progress={<DiscoveryBar kind="perks" />}
      subtitle={mode === 'all' ? `${perks.length} perks` : undefined}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search perks…" />
          <ChipRow>
            {(
              [
                ['stackable', 'Stackable'],
                ['once', 'One per run'],
                ['enemies', 'Enemies can get it'],
                ['rare', 'Rare'],
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
              const rare = !hidden && perkRarity(p) === 'Rare';
              return (
                <li key={p.id}>
                  <button
                    onClick={() => navigate(`/perks/${p.id}`)}
                    data-active={p.id === id || undefined}
                    className={`slot slot-hover flex w-full items-center gap-3 p-2.5 text-left ${rare ? 'rare' : ''}`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-raised">
                      {hidden ? <span className="font-game text-[16px] text-faint">?</span> : <AtlasIcon atlas="perks" icon={p.icon} scale={2} />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] font-medium ${hidden ? 'text-faint' : rare ? 'rare-name' : ''}`}>{hidden ? '???' : p.name}</span>
                      {!hidden && <span className="line-clamp-2 text-[11px] leading-snug text-faint">{p.description}</span>}
                    </span>
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

const RARITY_TONE: Record<PerkRarity, string> = { Common: 'text-toxic', Uncommon: 'text-gold', Rare: 'rare-name' };

export function PerkDetail({ perk }: { perk: Perk }) {
  const { visible, reveal } = useSpoilers();
  if (!visible(perk.discoverFlag)) return <HiddenNotice what="perk" onReveal={() => reveal(perk.discoverFlag)} />;

  const info = PERK_INFO[perk.id];
  const rarity = perkRarity(perk);
  const stacking = perk.stackable ? (perk.maxStack ? `Up to ${perk.maxStack}` : 'Yes') : 'No';
  const rows = [
    ...(perk.odds
      ? [
          { label: 'Offered in a run', value: runsWording(perk.odds.any) },
          { label: 'At the first Holy Mountain', value: `${(perk.odds.first * 100).toFixed(1)}%` },
        ]
      : [{ label: 'Holy Mountains', value: 'Never offered' }]),
    { label: 'Copies in the perk deck', value: deckCopies(perk) },
    { label: 'Stacks', value: stacking },
    ...(perk.stackable && perk.reappearGap ? [{ label: 'Spacing between copies', value: `At least ${perk.reappearGap} perks` }] : []),
    { label: 'Enemies can have it', value: perk.usableByEnemies ? 'Yes' : 'No' },
    ...(perk.removesOtherPerks ? [{ label: 'Note', value: 'Removes other perks' }] : []),
  ];

  return (
    <article>
      <header className="flex items-start gap-4 pr-10 lg:pr-0">
        <span className={`slot grid h-20 w-20 shrink-0 place-items-center ${rarity === 'Rare' ? 'rare' : ''}`}>
          <AtlasIcon atlas="perks" icon={perk.icon} scale={4} />
        </span>
        <div className="min-w-0">
          <h2 className={`font-game text-[24px] leading-tight ${rarity === 'Rare' ? 'rare-name' : ''}`}>{perk.name}</h2>
          <p className={`font-game text-[16px] ${RARITY_TONE[rarity]}`}>{rarity}</p>
        </div>
      </header>
      {rarity === 'Rare' && <RareCallout what="perk" odds="Never offered in Holy Mountains: it only comes from special places." />}
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{perk.description}</p>
      {info && (
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {info.text} <Source source={info.source} />
        </p>
      )}
      {info?.numbers && info.numbers.length > 0 && (
        <Section title="Numbers">
          <StatTable rows={info.numbers} />
        </Section>
      )}
      <Section title="Rarity and stacking">
        <StatTable rows={rows} />
        {perk.odds && <p className="mt-1.5 text-xs text-faint">From the game’s own perk deck over 5,000 seeds, counting all seven Holy Mountains with no perks taken and no rerolls.</p>}
      </Section>
      {(info?.tips?.length || info?.secret) && (
        <Section title="Tips">
          {info.tips && <BulletList items={info.tips} />}
          {info.secret && (
            <div className={info.tips?.length ? 'mt-2' : ''}>
              <InlineSpoiler label="Show late-game secret">
                <p className="text-sm leading-relaxed text-muted">{info.secret}</p>
              </InlineSpoiler>
            </div>
          )}
        </Section>
      )}
      <HiddenMechanics kind="perk" id={perk.id} />
    </article>
  );
}
