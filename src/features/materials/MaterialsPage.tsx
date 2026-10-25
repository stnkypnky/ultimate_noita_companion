import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import MiniSearch from 'minisearch';
import { ArrowRight } from 'lucide-react';
import { useData } from '@/data/store';
import type { Material, Reaction } from '@/data/types';
import { SECRET_MATERIALS, materialKey } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Chip, ChipRow, SearchInput, Section, StatTable, useSearchFocus } from '@/ui/controls';
import { MasterDetail } from '@/ui/MasterDetail';
import { HiddenNotice } from '@/ui/Spoiler';
import { useDebounced } from '@/ui/hooks';
import { MaterialSwatch } from './MaterialSwatch';

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

  const search = useMemo(() => {
    const ms = new MiniSearch<Material>({ fields: ['name', 'id', 'tagText'], storeFields: ['id'], extractField: (m, f) => (f === 'tagText' ? m.tags.join(' ') : String((m as Record<string, unknown>)[f] ?? '')), searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3 } } });
    ms.addAll(materials);
    return ms;
  }, [materials]);

  const shown = useMemo(() => {
    let list = q ? search.search(q).map((r) => materialById.get(r.id as string)!) : [...materials].sort((a, b) => a.name.localeCompare(b.name));
    if (!internal) list = list.filter((m) => m.showInCreative);
    if (state) list = list.filter((m) => m.state === state);
    // Searching or filtering never surfaces secret materials.
    if (q || state) list = list.filter((m) => isVisible(m.id));
    return list;
  }, [q, search, materialById, materials, internal, state, isVisible]);

  const selected = id ? materialById.get(id) : undefined;
  const close = useCallback(() => navigate('/materials'), [navigate]);
  // Several materials share a display name (7× "brickwork"); show their ids to tell them apart.
  const dupes = useMemo(() => {
    const count = new Map<string, number>();
    for (const m of materials) count.set(m.name.toLowerCase(), (count.get(m.name.toLowerCase()) ?? 0) + 1);
    return new Set([...count].filter(([, n]) => n > 1).map(([name]) => name));
  }, [materials]);

  return (
    <Page
      wide
      title="Materials"
      subtitle={`${shown.length} materials`}
      toolbar={
        <>
          <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Search materials or [tags]…" />
          <ChipRow>
            {STATES.map((s) => (
              <Chip key={s} active={state === s} onClick={() => setState(state === s ? null : s)}>
                {STATE_LABEL[s]}
              </Chip>
            ))}
            <Chip active={internal} onClick={() => setInternal(!internal)}>
              Internal variants
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
              return (
                <li key={m.id}>
                  <button
                    onClick={() => navigate(`/materials/${m.id}`)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] border p-2.5 text-left transition-colors ${
                      m.id === id ? 'border-ember/60 bg-surface-2' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
                    }`}
                  >
                    <MaterialSwatch material={m} hidden={hidden} />
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] font-medium ${hidden ? 'text-faint' : ''}`}>{hidden ? '???' : titleCase(m.name)}</span>
                      {!hidden && (
                        <span className="block truncate text-[11px] text-faint">
                          {titleCase(m.state)}
                          {dupes.has(m.name.toLowerCase()) && ` · ${m.id}`}
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

function MaterialDetail({ material: m }: { material: Material }) {
  const { reactionsByMaterial } = useData();
  const { isVisible, reveal } = useMaterialVisibility();
  if (!isVisible(m.id)) return <HiddenNotice what="material" onReveal={() => reveal(m.id)} />;

  const related = [...(reactionsByMaterial.get(m.id) ?? []), ...m.tags.flatMap((t) => reactionsByMaterial.get(t) ?? [])];
  const unique = [...new Set(related)];
  const safe = unique.filter((r) => [...r.inputs, ...r.outputs].every((x) => x.startsWith('[') || isVisible(x)));
  const hiddenCount = unique.length - safe.length;
  const asInput = safe.filter((r) => r.inputs.some((x) => x === m.id || m.tags.includes(x)));
  const asOutput = safe.filter((r) => r.outputs.includes(m.id) && !asInput.includes(r));

  const rows = [
    { label: 'State', value: titleCase(m.state) },
    { label: 'Density', value: String(m.density) },
    ...(m.burnable ? [{ label: 'Flammable', value: m.autoignitionTemperature ? `Ignites at ${m.autoignitionTemperature}°` : 'Yes' }] : []),
    ...(m.onFire ? [{ label: 'Burning', value: 'Always' }] : []),
    ...(m.conductive ? [{ label: 'Conducts electricity', value: 'Yes' }] : []),
    ...(m.state === 'solid' && m.durability ? [{ label: 'Durability', value: String(m.durability) }] : []),
    ...(m.stains.length ? [{ label: 'On contact', value: m.stains.map(effectName).join(', ') }] : []),
    ...(m.ingestion.length ? [{ label: 'When ingested', value: m.ingestion.map(effectName).join(', ') }] : []),
  ];

  return (
    <article>
      <header className="flex items-center gap-4 pr-10 lg:pr-0">
        <MaterialSwatch material={m} size={64} />
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight">{titleCase(m.name)}</h2>
          <code className="text-xs text-faint">{m.id}</code>
        </div>
      </header>

      <Section title="Properties">
        <StatTable rows={rows} />
      </Section>

      {m.tags.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {m.tags.map((t) => (
              <span key={t} className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-muted">
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}

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

function ReactionList({ reactions }: { reactions: Reaction[] }) {
  return (
    <ul className="space-y-1.5">
      {reactions.map((r, i) => (
        <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-line bg-raised px-2.5 py-2">
          {r.inputs.map((x, j) => (
            <MatChip key={`i${j}`} id={x} />
          ))}
          <ArrowRight size={14} className="mx-0.5 text-faint" />
          {r.outputs.map((x, j) => (
            <MatChip key={`o${j}`} id={x} />
          ))}
          <span className="ml-auto pl-2 text-[11px] text-faint tabular-nums">{r.probability}%</span>
        </li>
      ))}
    </ul>
  );
}

function MatChip({ id }: { id: string }) {
  const { materialById } = useData();
  if (id.startsWith('[')) return <span className="rounded bg-arcane/15 px-1.5 py-0.5 font-mono text-[11px] text-arcane">{id}</span>;
  const m = materialById.get(id);
  if (!m) return <span className="text-xs text-muted">{id}</span>;
  return (
    <Link to={`/materials/${id}`} className="inline-flex items-center gap-1.5 rounded bg-surface-2 py-0.5 pr-1.5 pl-0.5 text-xs hover:bg-surface-3">
      <MaterialSwatch material={m} size={16} />
      {titleCase(m.name)}
    </Link>
  );
}
