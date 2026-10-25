import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import MiniSearch from 'minisearch';
import { motion } from 'motion/react';
import { useData } from '@/data/store';
import { SPELL_TYPES, type Spell, type SpellType } from '@/data/types';
import { useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Chip, ChipRow, SearchInput, Select, useSearchFocus } from '@/ui/controls';
import { SpellIcon, TYPE_COLOR, TYPE_LABEL } from '@/ui/GameIcon';
import { MasterDetail } from '@/ui/MasterDetail';
import { useDebounced } from '@/ui/hooks';
import { SpellDetail } from './SpellDetail';

type Sort = 'game' | 'name' | 'mana' | 'type';

export function SpellsPage() {
  const { spells, spellById } = useData();
  const { id } = useParams();
  const navigate = useNavigate();
  const { visible, mode } = useSpoilers();
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<SpellType[]>([]);
  const [sort, setSort] = useState<Sort>('game');
  const q = useDebounced(query);
  const searchRef = useSearchFocus();

  const search = useMemo(() => {
    const ms = new MiniSearch<Spell>({ fields: ['name', 'description', 'id'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3 } } });
    ms.addAll(spells);
    return ms;
  }, [spells]);

  const shown = useMemo(() => {
    let list = q ? search.search(q).map((r) => spellById.get(r.id as string)!) : [...spells];
    // Searching never surfaces hidden spells (their names are spoilers).
    if (q) list = list.filter((s) => visible(s.discoverFlag));
    // Filtering by type would leak an undiscovered spell's type, so hidden ones drop out too.
    if (types.length) list = list.filter((s) => types.includes(s.type) && visible(s.discoverFlag));
    if (!q) {
      const hiddenLast = (a: Spell, b: Spell) => Number(!visible(a.discoverFlag)) - Number(!visible(b.discoverFlag));
      const by: Record<Sort, (a: Spell, b: Spell) => number> = {
        game: (a, b) => a.index - b.index,
        name: (a, b) => hiddenLast(a, b) || a.name.localeCompare(b.name),
        mana: (a, b) => hiddenLast(a, b) || a.mana - b.mana,
        type: (a, b) => SPELL_TYPES.indexOf(a.type) - SPELL_TYPES.indexOf(b.type) || a.index - b.index,
      };
      list.sort(by[sort]);
    }
    return list;
  }, [q, search, spellById, spells, types, sort, visible]);

  const discovered = spells.filter((s) => visible(s.discoverFlag)).length;
  const selected = id ? spellById.get(id) : undefined;
  const close = useCallback(() => navigate('/spells'), [navigate]);
  const toggleType = (t: SpellType) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  return (
    <Page
      wide
      title="Spells"
      subtitle={mode === 'all' ? `${spells.length} spells` : `${discovered} of ${spells.length} discovered`}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search spells…" />
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <ChipRow>
                {SPELL_TYPES.map((t) => (
                  <Chip key={t} active={types.includes(t)} onClick={() => toggleType(t)} color={TYPE_COLOR[t]}>
                    {TYPE_LABEL[t]}
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
                  { value: 'mana', label: 'Mana' },
                  { value: 'type', label: 'Type' },
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
        detail={selected ? <SpellDetail spell={selected} /> : null}
        empty={<p className="mt-24 text-center text-sm text-faint">Select a spell to see its details.</p>}
        list={
          <>
            {shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted">No discovered spells match.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {shown.map((s, i) => (
                  <SpellTile key={s.id} spell={s} hidden={!visible(s.discoverFlag)} active={s.id === id} index={i} />
                ))}
              </ul>
            )}
          </>
        }
      />
    </Page>
  );
}

function SpellTile({ spell, hidden, active, index }: { spell: Spell; hidden: boolean; active: boolean; index: number }) {
  const navigate = useNavigate();
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 30) * 0.01 }}
    >
      <button
        onClick={() => navigate(`/spells/${spell.id}`)}
        data-active={active || undefined}
        className="slot slot-hover flex w-full items-center gap-3 p-2 text-left"
      >
        <SpellIcon type={spell.type} icon={spell.icon} hidden={hidden} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] font-medium ${hidden ? 'text-faint' : ''}`}>{hidden ? '???' : spell.name}</span>
          {!hidden && <span className="block text-[11px] text-faint">{spell.mana} mana</span>}
        </span>
      </button>
    </motion.li>
  );
}
