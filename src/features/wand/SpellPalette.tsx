import { memo, useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import MiniSearch from 'minisearch';
import { useData } from '@/data/store';
import { SPELL_TYPES, type Spell, type SpellType } from '@/data/types';
import { useSpoilers } from '@/store/progress';
import { Chip, ChipRow, SearchInput } from '@/ui/controls';
import { SpellIcon, TYPE_COLOR, TYPE_LABEL, TYPE_SHORT } from '@/ui/GameIcon';
import { useDebounced } from '@/ui/hooks';
import type { DragData } from './WandSlots';

/** Searchable spell list. Drag a spell onto the wand, or tap to drop it in the selected / first empty slot. */
export function SpellPalette({ onPick, scale = 2, compact }: { onPick: (id: string) => void; scale?: number; compact?: boolean }) {
  const { spells, spellById } = useData();
  const { visible, mode } = useSpoilers();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SpellType | null>(null);
  const q = useDebounced(query);

  const search = useMemo(() => {
    const ms = new MiniSearch<Spell>({ fields: ['name', 'description', 'id'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3 } } });
    ms.addAll(spells);
    return ms;
  }, [spells]);

  const available = useMemo(() => spells.filter((s) => visible(s.discoverFlag)), [spells, visible]);
  const shown = useMemo(() => {
    let list = q ? search.search(q).map((r) => spellById.get(r.id as string)!).filter((s) => visible(s.discoverFlag)) : available;
    if (type) list = list.filter((s) => s.type === type);
    return list;
  }, [q, search, spellById, available, type, visible]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 pb-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Find a spell…" />
        <ChipRow>
          {SPELL_TYPES.map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(type === t ? null : t)} color={TYPE_COLOR[t]}>
              {compact ? TYPE_SHORT[t] : TYPE_LABEL[t]}
            </Chip>
          ))}
        </ChipRow>
      </div>
      <div className="scrollbar-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1">
          {shown.map((s) => (
            <PaletteSpell key={s.id} spell={s} scale={scale} onPick={onPick} />
          ))}
        </div>
        {mode !== 'all' && available.length < spells.length && (
          <p className="mt-3 text-center text-[11px] text-faint">{spells.length - available.length} undiscovered spells hidden</p>
        )}
      </div>
    </div>
  );
}

const PaletteSpell = memo(function PaletteSpell({ spell, scale, onPick }: { spell: Spell; scale: number; onPick: (id: string) => void }) {
  const drag = useDraggable({ id: `pal:${spell.id}`, data: { source: 'palette', spellId: spell.id } satisfies DragData });
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => onPick(spell.id)}
      title={`${spell.name} — ${spell.mana} mana`}
      aria-label={`Add ${spell.name}`}
      className={`grid touch-manipulation select-none place-items-center rounded-md p-0.5 transition hover:bg-surface-2 active:scale-95 ${drag.isDragging ? 'opacity-30' : ''}`}
    >
      <SpellIcon type={spell.type} icon={spell.icon} scale={scale} />
    </button>
  );
});
