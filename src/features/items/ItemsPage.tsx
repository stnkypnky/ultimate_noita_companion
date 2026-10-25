import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Package } from 'lucide-react';
import { useData } from '@/data/store';
import type { Item } from '@/data/types';
import { SECRET_ITEMS, itemKey } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { SearchInput, useSearchFocus } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import { MasterDetail } from '@/ui/MasterDetail';
import { HiddenNotice } from '@/ui/Spoiler';
import { useDebounced } from '@/ui/hooks';

function ItemIcon({ item, scale, hidden }: { item: Item; scale: number; hidden?: boolean }) {
  const size = 24 * scale;
  return (
    <span className="grid shrink-0 place-items-center rounded-lg bg-raised" style={{ width: size, height: size }}>
      {hidden ? (
        <span className="font-display text-faint" style={{ fontSize: 10 * scale }}>
          ?
        </span>
      ) : item.icon.w ? (
        <AtlasIcon atlas="items" icon={item.icon} scale={scale} />
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
  const q = useDebounced(query).toLowerCase();
  const searchRef = useSearchFocus();

  const isVisible = useCallback((it: Item) => !SECRET_ITEMS.has(it.id) || visible(itemKey(it.id)), [visible]);
  const shown = useMemo(
    () => (q ? items.filter((it) => isVisible(it) && (it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q))) : items),
    [items, q, isVisible],
  );
  const selected = id ? items.find((it) => it.id === id) : undefined;
  const close = useCallback(() => navigate('/items'), [navigate]);

  return (
    <Page wide title="Items" subtitle={`${items.length} world pickups`} toolbar={<SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search items…" />}>
      <MasterDetail
        detailKey={selected?.id}
        onClose={close}
        detail={
          selected ? (
            isVisible(selected) ? (
              <article>
                <header className="flex items-center gap-4 pr-10 lg:pr-0">
                  <ItemIcon item={selected} scale={3} />
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl leading-tight">{selected.name}</h2>
                    <code className="text-xs text-faint">{selected.id}</code>
                  </div>
                </header>
                <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-muted">{selected.description || 'No in-game description.'}</p>
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
              return (
                <li key={it.id}>
                  <button
                    onClick={() => navigate(`/items/${it.id}`)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] border p-2 text-left transition-colors ${
                      it.id === id ? 'border-ember/60 bg-surface-2' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
                    }`}
                  >
                    <ItemIcon item={it} scale={2} hidden={hidden} />
                    <span className={`truncate text-[13px] font-medium ${hidden ? 'text-faint' : ''}`}>{hidden ? '???' : it.name}</span>
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
