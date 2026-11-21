import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import MiniSearch from 'minisearch';
import { ChevronDown } from 'lucide-react';
import { useData } from '@/data/store';
import type { Material } from '@/data/types';
import { groupLabel, groupMembers } from '@/data/materialGroups';
import { SECRET_MATERIALS, materialKey } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { DiscoveryBar } from '@/features/progress/DiscoveryBar';
import { Page } from '@/ui/Page';
import { Chip, ChipRow, SearchInput, Section, StatTable, useSearchFocus } from '@/ui/controls';
import { MasterDetail } from '@/ui/MasterDetail';
import { HiddenNotice, SecretCallout } from '@/ui/Spoiler';
import { HiddenMechanics } from '@/ui/HiddenMechanics';
import { useDebounced } from '@/ui/hooks';
import { MaterialSwatch } from './MaterialSwatch';
import { collapseVariants, nameHints } from '@/features/alchemy/lookup';
import { reactionsOf, rowMaterials, type ReactionRow, type Side } from './reactions';
import { WhereToFind } from './WhereToFind';

const STATES = ['liquid', 'powder', 'solid', 'gas', 'fire'] as const;
const STATE_LABEL: Record<Material['state'], string> = { liquid: 'Liquids', powder: 'Powders', solid: 'Solids', gas: 'Gases', fire: 'Fire' };

export const titleCase = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

/** Visibility of materials, honouring the curated secret list. */
export function useMaterialVisibility() {
  const { visible, reveal } = useSpoilers();
  return useMemo(
    () => ({
      isVisible: (id: string) => !SECRET_MATERIALS.has(id) || visible(materialKey(id)),
      reveal: (id: string) => reveal(materialKey(id)),
    }),
    [visible, reveal],
  );
}

export function MaterialsPage() {
  const { materials, materialById } = useData();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isVisible } = useMaterialVisibility();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<Material['state'] | null>(null);
  const [internal, setInternal] = useState(false);
  const q = useDebounced(query);
  const searchRef = useSearchFocus();
  const hints = useMaterialHints();

  const search = useMemo(() => {
    const ms = new MiniSearch<Material>({ fields: ['name', 'id'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3 } } });
    ms.addAll(materials);
    return ms;
  }, [materials]);

  const shown = useMemo(() => {
    let list = q ? search.search(q).map((r) => materialById.get(r.id as string)!) : [...materials].sort((a, b) => a.name.localeCompare(b.name));
    // Same-named variants a player can't tell apart show as one, unless every variant is asked for.
    if (!internal) list = collapseVariants(list.filter((m) => m.showInCreative), hints, (x) => SECRET_MATERIALS.has(x));
    if (state) list = list.filter((m) => m.state === state);
    // Searching or filtering never surfaces secret materials.
    if (q || state) list = list.filter((m) => isVisible(m.id));
    return list;
  }, [q, search, materialById, materials, internal, state, isVisible, hints]);

  const selected = id ? materialById.get(id) : undefined;
  const close = useCallback(() => navigate('/materials'), [navigate]);

  return (
    <Page
      wide
      title="Materials" progress={<DiscoveryBar kind="materials" />}
      subtitle={`${shown.length} materials`}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search materials…" />
          <ChipRow>
            {STATES.map((s) => (
              <Chip key={s} active={state === s} onClick={() => setState(state === s ? null : s)}>
                {STATE_LABEL[s]}
              </Chip>
            ))}
            <Chip active={internal} onClick={() => setInternal(!internal)}>
              All variants
            </Chip>
          </ChipRow>
        </>
      }
    >
      <MasterDetail
        detailKey={selected?.id}
        onClose={close}
        detail={selected ? <MaterialDetail material={selected} /> : null}
        empty={<p className="mt-24 text-center text-sm text-faint">Select a material to see its properties and reactions.</p>}
        list={
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {shown.map((m) => {
              const hidden = !isVisible(m.id);
              const secret = SECRET_MATERIALS.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    onClick={() => navigate(`/materials/${m.id}`)}
                    data-active={m.id === id || undefined}
                    className={`slot slot-hover flex h-full w-full items-center gap-3 p-2.5 text-left ${secret ? 'secret' : ''}`}
                  >
                    <MaterialSwatch material={m} hidden={hidden} secret={secret} />
                    <span className="min-w-0">
                      <span className={`line-clamp-2 text-[13px] leading-tight font-medium ${secret ? 'secret-name' : hidden ? 'text-faint' : ''}`}>
                        {hidden ? '???' : titleCase(m.name)}
                      </span>
                      {!hidden && (
                        <span className="block truncate text-[11px] text-faint">
                          {titleCase(m.state)}
                          {hints.get(m.id) && ` · ${hints.get(m.id)}`}
                        </span>
                      )}
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

export function MaterialDetail({ material: m }: { material: Material }) {
  const { reactions, materials, materialById } = useData();
  const { isVisible, reveal } = useMaterialVisibility();
  const hints = useMaterialHints();
  const hint = hints.get(m.id);
  const rows = useMemo(
    () => reactionsOf(m, reactions, { materials, byId: materialById, label: (id) => `${materialById.get(id)?.name ?? id}·${hints.get(id) ?? ''}`.toLowerCase() }),
    [m, reactions, materials, materialById, hints],
  );
  if (!isVisible(m.id)) return <HiddenNotice what="material" onReveal={() => reveal(m.id)} />;

  const safe = (list: ReactionRow[]) => list.filter((r) => rowMaterials(r).every(isVisible));
  const asInput = safe(rows.asInput);
  const asOutput = safe(rows.asOutput);
  const hiddenCount = rows.asInput.length + rows.asOutput.length - asInput.length - asOutput.length;

  const props = [
    { label: 'State', value: titleCase(m.state) },
    { label: 'Density', value: String(m.density) },
    ...(m.burnable ? [{ label: 'Flammable', value: m.autoignitionTemperature ? `Ignites at ${m.autoignitionTemperature}°` : 'Yes' }] : []),
    ...(m.onFire ? [{ label: 'Burning', value: 'Always' }] : []),
    ...(m.conductive ? [{ label: 'Conducts electricity', value: 'Yes' }] : []),
    ...(m.state === 'solid' && m.durability ? [{ label: 'Durability', value: String(m.durability) }] : []),
    ...(m.stains.length ? [{ label: 'On contact', value: m.stains.map(effectName).join(', ') }] : []),
    ...(m.ingestion.length ? [{ label: 'When ingested', value: m.ingestion.map(effectName).join(', ') }] : []),
  ];

  const secret = SECRET_MATERIALS.has(m.id);
  return (
    <article>
      <header className="flex items-center gap-4 pr-10 lg:pr-0">
        <MaterialSwatch material={m} size={64} secret={secret} />
        <div className="min-w-0">
          <h2 className={`font-game text-[24px] leading-tight ${secret ? 'secret-name' : ''}`}>{titleCase(m.name)}</h2>
          {hint && <p className="text-xs text-faint">{titleCase(hint)}</p>}
        </div>
      </header>
      {secret && <SecretCallout what="material" />}

      <Section title="Properties">
        <StatTable rows={props} />
      </Section>

      <WhereToFind id={m.id} />

      <HiddenMechanics kind="material" id={m.id} />

      {asInput.length > 0 && (
        <Section title={`Reacts with (${asInput.length})`}>
          <ReactionList reactions={asInput} />
        </Section>
      )}
      {asOutput.length > 0 && (
        <Section title={`Created by (${asOutput.length})`}>
          <ReactionList reactions={asOutput} />
        </Section>
      )}
      {hiddenCount > 0 && <p className="mt-3 text-xs text-faint">{hiddenCount} reaction{hiddenCount > 1 ? 's' : ''} hidden to avoid spoilers.</p>}
    </article>
  );
}

const effectName = (e: string) => titleCase(e.toLowerCase().replace(/_/g, ' '));

function ReactionList({ reactions }: { reactions: ReactionRow[] }) {
  return (
    <ul className="space-y-1.5">
      {reactions.map((r, i) => (
        <ReactionItem key={i} row={r} />
      ))}
    </ul>
  );
}

/** One reaction: ingredients = results. A group chip opens the list of materials it stands for, under the row. */
function ReactionItem({ row }: { row: ReactionRow }) {
  const [open, setOpen] = useState<string | null>(null);
  const chip = (s: Side, k: string) =>
    s.kind === 'material' ? <MatChip key={k} id={s.id} /> : <GroupChip key={k} pattern={s.pattern} open={open === s.pattern} onToggle={() => setOpen(open === s.pattern ? null : s.pattern)} />;
  const join = (sides: Side[], p: string) => sides.flatMap((s, j) => [...(j ? [<span key={`${p}+${j}`} className="text-faint">+</span>] : []), chip(s, `${p}${j}`)]);
  return (
    <li className="slot px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {join(row.inputs, 'i')}
        <span className="mx-0.5 text-base font-semibold text-faint" aria-label="results in">
          =
        </span>
        {join(row.outputs, 'o')}
        <span className="ml-auto pl-2 text-[11px] text-faint tabular-nums">
          {row.explosion && 'explodes · '}
          {row.probability}%
        </span>
      </div>
      {open && <GroupMembers pattern={open} />}
    </li>
  );
}

function GroupChip({ pattern, open, onToggle }: { pattern: string; open: boolean; onToggle: () => void }) {
  const count = useGroupMembers(pattern).length;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title="A group of materials: tap to see which"
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${open ? 'bg-gold/20 text-gold' : 'bg-gold/10 text-gold/90 hover:bg-gold/20'}`}
    >
      {groupLabel(pattern)}
      <span className="text-[10px] text-faint tabular-nums">{count}</span>
      <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
    </button>
  );
}

function useGroupMembers(pattern: string) {
  const { materials, materialById } = useData();
  return useMemo(() => groupMembers(pattern, materials, materialById), [pattern, materials, materialById]);
}

/** The materials a group stands for, one chip per name; secret ones you haven't found stay out of the list. */
function GroupMembers({ pattern }: { pattern: string }) {
  const members = useGroupMembers(pattern);
  const { isVisible } = useMaterialVisibility();
  const hints = useMaterialHints();
  const shown = collapseVariants(members.filter((m) => isVisible(m.id)), hints, (x) => SECRET_MATERIALS.has(x));
  const hidden = members.filter((m) => !isVisible(m.id)).length;
  return (
    <div className="mt-2 border-t border-line pt-2">
      <p className="mb-1.5 text-[11px] text-faint">{groupLabel(pattern)}: any of these</p>
      <div className="flex flex-wrap gap-1">
        {shown
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((m) => (
            <MatChip key={m.id} id={m.id} />
          ))}
        {hidden > 0 && <span className="px-1 py-0.5 text-[11px] text-faint">+{hidden} hidden</span>}
      </div>
    </div>
  );
}

const hintCache = new WeakMap<Material[], Map<string, string>>();

/** Hints that tell same-named materials apart ("loose", "blue"), worked out once per data set. */
export function useMaterialHints() {
  const { materials } = useData();
  let hints = hintCache.get(materials);
  if (!hints) hintCache.set(materials, (hints = nameHints(materials)));
  return hints;
}

function MatChip({ id }: { id: string }) {
  const { materialById } = useData();
  const hints = useMaterialHints();
  const m = materialById.get(id);
  if (!m) return <span className="text-xs text-muted">{id}</span>;
  // Same-named materials (two kinds of ice) get a hint, so the rows don't read as repeats.
  const hint = hints.get(id);
  const secret = SECRET_MATERIALS.has(id);
  return (
    <Link to={`/materials/${id}`} className="inline-flex items-center gap-1.5 rounded bg-surface-2 py-0.5 pr-1.5 pl-0.5 text-xs hover:bg-surface-3">
      <MaterialSwatch material={m} size={16} />
      <span className={secret ? 'secret-name' : undefined}>{titleCase(m.name)}</span>
      {hint && <span className="text-[10px] text-faint">· {hint}</span>}
    </Link>
  );
}
