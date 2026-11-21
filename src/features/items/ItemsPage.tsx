import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Package } from 'lucide-react';
import { useData } from '@/data/store';
import type { Item } from '@/data/types';
import { ITEM_FLAGS, RARE_ITEMS, SECRET_ITEMS, itemKey } from '@/data/spoilers';
import { ITEM_UNLOCKS } from '@/data/unlocks';
import { useSpoilers } from '@/store/progress';
import { DiscoveryBar } from '@/features/progress/DiscoveryBar';
import { Page } from '@/ui/Page';
import { Chip, ChipRow, SearchInput, useSearchFocus } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { MasterDetail } from '@/ui/MasterDetail';
import { HiddenNotice, RareCallout, SecretCallout } from '@/ui/Spoiler';
import { HiddenMechanics, HowToUnlock, itemNotes } from '@/ui/HiddenMechanics';
import { useDebounced } from '@/ui/hooks';
import { ItemDescription, LootTable } from '@/ui/ItemDescription';
import { itemInfo } from '@/data/itemInfo';

/** Secret beats rare: a secret item is styled purple, a rare one gold. */
const kindOf = (id: string) => (SECRET_ITEMS.has(id) ? 'secret' : id in RARE_ITEMS ? 'rare' : null);

function ItemIcon({ item, scale, hidden, kind }: { item: Item; scale: number; hidden?: boolean; kind?: 'secret' | 'rare' | null }) {
  const size = 24 * scale;
  return (
    <span className="grid shrink-0 place-items-center rounded-lg bg-raised" style={{ width: size, height: size }}>
      {hidden ? (
        <span className={`font-game ${kind ? `${kind}-name` : 'text-faint'}`} style={{ fontSize: 8 * scale }}>
          ?
        </span>
      ) : item.icon.w ? (
        <span className={kind ? `${kind}-icon` : undefined}>
          <AtlasIcon atlas="items" icon={item.icon} scale={scale} />
        </span>
      ) : (
        <Package size={10 * scale} className="text-faint" />
      )}
    </span>
  );
}

export function ItemsPage() {
  const { items } = useData();
  const { id } = useParams();
  const navigate = useNavigate();
  const { visible, reveal } = useSpoilers();
  const [query, setQuery] = useState('');
  const [rareOnly, setRareOnly] = useState(false);
  const q = useDebounced(query).toLowerCase();
  const searchRef = useSearchFocus();

  const isVisible = useCallback((it: Item) => !SECRET_ITEMS.has(it.id) || visible(itemKey(it.id)), [visible]);
  // By name, numbers in order: Gold nugget (10), (50), (200)…
  const sorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })), [items]);
  const shown = useMemo(() => {
    let list = rareOnly ? sorted.filter((it) => it.id in RARE_ITEMS) : sorted;
    if (q)
      list = list.filter(
        (it) =>
          isVisible(it) &&
          (it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q) || (itemInfo(it.id)?.text.toLowerCase().includes(q) ?? false)),
      );
    return list;
  }, [sorted, rareOnly, q, isVisible]);
  const selected = id ? items.find((it) => it.id === id) : undefined;
  const close = useCallback(() => navigate('/items'), [navigate]);
  const loot = selected && itemInfo(selected.id)?.loot;
  const selectedKind = selected ? kindOf(selected.id) : null;

  return (
    <Page
      wide
      title="Items"
      progress={<DiscoveryBar kind="items" />}
      subtitle={`${items.length} world pickups`}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search items…" />
          <ChipRow>
            <Chip active={rareOnly} onClick={() => setRareOnly(!rareOnly)}>
              Rare
            </Chip>
          </ChipRow>
        </>
      }
    >
      <MasterDetail
        detailKey={selected?.id}
        onClose={close}
        detail={
          selected ? (
            isVisible(selected) ? (
              <article>
                <header className="flex items-center gap-4 pr-10 lg:pr-0">
                  <ItemIcon item={selected} scale={3} kind={selectedKind} />
                  <div className="min-w-0">
                    <h2 className={`font-game text-[24px] leading-tight ${selectedKind ? `${selectedKind}-name` : ''}`}>{selected.name}</h2>
                  </div>
                </header>
                {selectedKind === 'secret' && <SecretCallout what="item" />}
                {selectedKind === 'rare' && <RareCallout odds={RARE_ITEMS[selected.id]!} />}
                <ItemDescription key={selected.id} item={selected} />
                <HiddenMechanics
                  kind="item"
                  id={selected.id}
                  auto={itemNotes(selected)}
                  extra={loot && <LootTable loot={loot} />}
                />
                <HowToUnlock flag={ITEM_FLAGS[selected.id]} notes={ITEM_UNLOCKS[selected.id] ?? []} />
              </article>
            ) : (
              <HiddenNotice what="item" onReveal={() => reveal(itemKey(selected.id))} />
            )
          ) : null
        }
        empty={<p className="mt-24 text-center text-sm text-faint">Select an item to read its description.</p>}
        list={
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {shown.map((it) => {
              const hidden = !isVisible(it);
              const kind = kindOf(it.id);
              return (
                <li key={it.id}>
                  <button
                    onClick={() => navigate(`/items/${it.id}`)}
                    data-active={it.id === id || undefined}
                    className={`slot slot-hover flex w-full items-center gap-3 p-2 text-left ${kind ?? ''}`}
                  >
                    <ItemIcon item={it} scale={2} hidden={hidden} kind={kind} />
                    <span className={`truncate text-[13px] font-medium ${kind ? `${kind}-name` : ''}`}>{hidden ? '???' : it.name}</span>
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
