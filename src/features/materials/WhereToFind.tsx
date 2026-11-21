// "Where to find it" on a material's page: the places it turns up (with the map's spoiler rules), the flasks and
// pouches that can hold it, and the creatures that bleed it.
import { useEffect, useMemo, useState } from 'react';
import { fetchJson, useData } from '@/data/store';
import type { MaterialContainer, MaterialSources, MaterialWhere } from '@/data/types';
import { useBiomeView } from '@/features/bestiary/biomes';
import { CreatureChip, enemyKey } from '@/features/bestiary/EnemyDetail';
import { useSpoilers } from '@/store/progress';
import { Section, StatTable } from '@/ui/controls';

let sources: Promise<MaterialSources> | null = null;
const loadSources = () => (sources ??= fetchJson<MaterialSources>('data/material_sources.json'));

export function useMaterialSources() {
  const [data, setData] = useState<MaterialSources | null>(null);
  useEffect(() => {
    let live = true;
    loadSources().then((d) => live && setData(d), () => {});
    return () => {
      live = false;
    };
  }, []);
  return data;
}

const HOW: Record<MaterialWhere['how'], string> = { ground: 'ground', pockets: 'pockets', caves: 'caves', rooms: 'rooms' };
const HOW_ORDER: MaterialWhere['how'][] = ['ground', 'caves', 'pockets', 'rooms'];

/** How much of a cave biome's tiles it fills: a pool here and there, or all over. */
const plenty = (share: number) => (share >= 0.01 ? 'Common' : share >= 0.002 ? 'Uncommon' : 'Rare');

const pct = (p: number) =>
  p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.01 ? `${(p * 100).toFixed(1)}%` : p >= 0.001 ? `${(p * 100).toFixed(2)}%` : `1 in ${Math.round(1 / p).toLocaleString('en-US')}`;

const CONTAINER: Record<MaterialContainer['kind'], string> = {
  flask: 'Random flask',
  starting: 'Starting flask',
  alchemist: 'Flasks a creature throws',
  chestFlask: 'Rare chest flask',
  pouch: 'Powder pouch',
};
const CONTAINER_NOTE: Partial<Record<MaterialContainer['kind'], string>> = {
  starting: 'After your first death; your very first run starts with water.',
  chestFlask: 'The rare flask a treasure chest can hold.',
};

const SHOW_PLACES = 10;
const SHOW_CREATURES = 12;

export function WhereToFind({ id }: { id: string }) {
  const data = useMaterialSources();
  const src = data?.[id];
  const { ready, info } = useBiomeView();
  const { visible, reveal } = useSpoilers();
  const { enemyById } = useData();
  const [allPlaces, setAllPlaces] = useState(false);
  const [allCreatures, setAllCreatures] = useState(false);

  // One chip per place name (the Tower's floors, a biome and its variants), with every way it turns up there.
  const places = useMemo(() => {
    const out = new Map<string, { name: string; keys: string[]; shown: boolean; how: Set<MaterialWhere['how']>; share: number }>();
    for (const w of src?.biomes ?? []) {
      const i = info(w.biome, w.biome.replace(/_/g, ' '));
      const p = out.get(i.name) ?? { name: i.name, keys: [], shown: false, how: new Set(), share: 0 };
      if (!p.keys.includes(i.key)) p.keys.push(i.key);
      p.shown ||= i.shown;
      p.how.add(w.how);
      p.share = Math.max(p.share, w.share ?? 0);
      out.set(i.name, p);
    }
    // Most of it first: ground, then common caves, then the rest; places you can see before hidden ones.
    const rank = (p: { how: Set<string>; share: number }) => (p.how.has('ground') ? 1 : 0) + p.share * 10 + (p.how.has('caves') ? 0.05 : 0) + (p.how.has('pockets') ? 0.02 : 0);
    return [...out.values()].sort((a, b) => Number(b.shown) - Number(a.shown) || rank(b) - rank(a));
  }, [src, info]);

  // Creatures by name (Hurtta and its turret twins once each), met ones first.
  const creatures = useMemo(() => {
    const seen = new Set<string>();
    const list = (src?.bleeds ?? []).filter((e) => {
      const name = enemyById.get(e)?.name ?? e;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    return list.sort((a, b) => Number(visible(enemyKey(b))) - Number(visible(enemyKey(a))));
  }, [src, enemyById, visible]);

  if (!src || (!places.length && !src.containers?.length && !creatures.length)) return null;
  const alchemist = enemyById.get('alchemist');
  const containerRows = (src.containers ?? [])
    .slice()
    .sort((a, b) => b.odds - a.odds)
    .map((c) => ({
      label: c.kind === 'alchemist' && alchemist && visible(enemyKey('alchemist')) ? `Thrown by ${alchemist.name}` : CONTAINER[c.kind],
      value: pct(c.odds),
      note: CONTAINER_NOTE[c.kind],
    }));
  const shownPlaces = allPlaces ? places : places.slice(0, SHOW_PLACES);
  const shownCreatures = allCreatures ? creatures : creatures.slice(0, SHOW_CREATURES);

  return (
    <Section title="Where to find it">
      {places.length > 0 && (
        <>
          <h4 className="mb-1.5 text-xs text-faint">In the world</h4>
          <div className="flex flex-wrap gap-1.5">
            {shownPlaces.map((p) =>
              p.shown ? (
                <span key={p.name} className="slot inline-flex items-center gap-2 px-2.5 py-1.5 text-sm">
                  {p.name}
                  <span className="text-xs text-faint">
                    {HOW_ORDER.filter((h) => p.how.has(h))
                      .map((h) => (h === 'caves' ? `${plenty(p.share).toLowerCase()} in ${HOW[h]}` : HOW[h]))
                      .join(', ')}
                  </span>
                </span>
              ) : (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => p.keys.forEach(reveal)}
                  title="An area you haven't reached. Tap to reveal its name."
                  className="slot slot-hover inline-flex items-center gap-2 px-2.5 py-1.5 text-sm text-faint"
                >
                  {ready ? '???' : '…'}
                </button>
              ),
            )}
            {places.length > SHOW_PLACES && (
              <button type="button" onClick={() => setAllPlaces(!allPlaces)} className="px-2 py-1.5 text-xs text-faint hover:text-gold">
                {allPlaces ? 'Show fewer' : `+${places.length - SHOW_PLACES} more`}
              </button>
            )}
          </div>
        </>
      )}

      {containerRows.length > 0 && (
        <div className={places.length ? 'mt-4' : ''}>
          <h4 className="mb-1.5 text-xs text-faint">In flasks and pouches</h4>
          <StatTable
            rows={containerRows.map((r) => ({
              label: r.label,
              value: r.value,
            }))}
          />
          {containerRows.some((r) => r.note) && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-faint">
              {containerRows.flatMap((r) => (r.note ? [<li key={r.label}>{`${r.label}: ${r.note}`}</li>] : []))}
            </ul>
          )}
        </div>
      )}

      {creatures.length > 0 && (
        <div className={places.length || containerRows.length ? 'mt-4' : ''}>
          <h4 className="mb-1.5 text-xs text-faint">Bled by</h4>
          <div className="flex flex-wrap gap-1.5">
            {shownCreatures.map((e) => (
              <CreatureChip key={e} id={e} />
            ))}
            {creatures.length > SHOW_CREATURES && (
              <button type="button" onClick={() => setAllCreatures(!allCreatures)} className="px-2 py-1.5 text-xs text-faint hover:text-gold">
                {allCreatures ? 'Show fewer' : `+${creatures.length - SHOW_CREATURES} more`}
              </button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
