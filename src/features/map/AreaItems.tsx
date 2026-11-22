// The items a seed places in an area (the map's Items layer, listed): the tapped chunk's first, then the rest by
// depth, each with what the seed decides about it (a wand's stats, a chest's contents, a flask's material).
import { useId, useMemo, useState } from 'react';
import { ChevronDown, Package } from 'lucide-react';
import { useData } from '@/data/store';
import type { WorldMap } from '@/data/types';
import { SECRET_ITEMS, itemKey } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { Section } from '@/ui/controls';
import { AtlasIcon } from '@/ui/GameIcon';
import type { ItemThing, SeedItem } from '@/seed/items';
import { ITEM_COLOR, ITEM_LABELS, ITEM_ONE } from './layers';
import { MaterialName, SpellChip, WandLink } from './SeedPanel';
import { biomeName, chunkOf, type makeVisibility } from './world';

/**
 * An item's picture and name; a secret one stays "???" until revealed (tap). `plain`: nothing to tap (it sits inside
 * the row's own button).
 */
function ThingName({ t, plain }: { t: ItemThing; plain?: boolean }) {
  const { items, spellById } = useData();
  const { visible, reveal } = useSpoilers();
  const item = t.item ? items.find((i) => i.id === t.item) : undefined;
  if (t.kind === 'spell') {
    if (!plain) return <SpellChip id={t.file} />;
    const s = spellById.get(t.file);
    return <span className="text-sm text-ink">{s && visible(s.discoverFlag) ? s.name : 'Undiscovered spell'}</span>;
  }
  const hidden = !!t.item && SECRET_ITEMS.has(t.item) && !visible(itemKey(t.item));
  if (hidden)
    return plain ? (
      <span className="text-xs text-faint">??? secret item</span>
    ) : (
      <button onClick={() => reveal(itemKey(t.item!))} className="text-xs text-faint" title="A secret item: tap to reveal it">
        ??? secret item
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      {t.kind === 'wand' ? (
        <img src={`${import.meta.env.BASE_URL}icons/wand.png`} alt="" className="pixelated h-4 w-4" />
      ) : item?.icon.w ? (
        <AtlasIcon atlas="items" icon={item.icon} scale={1} />
      ) : (
        <Package size={14} className="text-faint" />
      )}
      {t.name}
    </span>
  );
}

/** What it is beyond its name: a wand's stats and spells, a flask's material. */
function ThingDetail({ t }: { t: ItemThing }) {
  if (t.wand) return <WandLink wand={t.wand} name="Wand from the map" />;
  if (t.material)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        holds <MaterialName id={t.material} />
      </span>
    );
  return null;
}

/** A few words on what's inside, for the closed row: "8 slots · 5 spells", "opens to 2 things". */
function brief(it: SeedItem) {
  if (it.wand) {
    const n = it.wand.spells.filter(Boolean).length + it.wand.alwaysCasts.length;
    return `${it.wand.capacity} slot${it.wand.capacity === 1 ? '' : 's'} · ${n} spell${n === 1 ? '' : 's'}`;
  }
  if (it.contents?.length) return `opens to ${it.contents.length} thing${it.contents.length === 1 ? '' : 's'}`;
  if (it.material) return 'filled';
  return '';
}

/** One item: its name and where it is; tap to open what the seed decides about it (closed to start with). */
function ItemRow({ it, here, onGo }: { it: SeedItem; here: boolean; onGo: () => void }) {
  const [open, setOpen] = useState(false);
  const { visible } = useSpoilers();
  // A secret item still hidden opens to its reveal button.
  const secret = !!it.item && SECRET_ITEMS.has(it.item) && !visible(itemKey(it.item));
  const more = !!(it.wand || it.material || it.contents?.length) || secret;
  const id = useId();
  const head = (
    <>
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0" style={{ background: ITEM_COLOR[it.kind] }} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
        <ThingName t={it} plain />
        {here && <span className="text-[11px] text-gold">here</span>}
        {more && <span className="text-xs text-muted">{brief(it)}</span>}
        <span className="font-mono text-[11px] text-faint">
          x {Math.round(it.x)}, y {Math.round(it.y)}
        </span>
      </span>
    </>
  );
  return (
    <li className={`slot p-2.5 ${here ? 'ring-1 ring-gold/50' : ''}`}>
      {more ? (
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="flex w-full items-start gap-2 hover:text-gold">
          {head}
          <ChevronDown size={16} className={`mt-0.5 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      ) : (
        <button onClick={onGo} className="flex w-full items-start gap-2 hover:text-gold" title="Show where it is">
          {head}
        </button>
      )}
      {more && open && (
        <div id={id} className="mt-2 space-y-1.5 pl-[18px]">
          {secret && <ThingName t={it} />}
          <ThingDetail t={it} />
          {it.contents && it.contents.length > 0 && (
            <>
              <div className="text-xs text-muted">Opens to:</div>
              <div className="flex flex-wrap items-center gap-2">
                {it.contents.map((c, j) => (
                  <ThingName key={j} t={c} />
                ))}
              </div>
              {it.contents.map((c, j) => (c.wand || c.material ? <ThingDetail key={j} t={c} /> : null))}
            </>
          )}
          {!here && (
            <button onClick={onGo} className="text-xs text-gold hover:underline">
              Show where it is
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** How many to list before "Show all". */
const FIRST = 12;

export function AreaItems({
  map,
  vis,
  biome,
  chunk,
  items,
  onGo,
}: {
  map: WorldMap;
  vis: ReturnType<typeof makeVisibility>;
  biome: number;
  chunk: { cx: number; cy: number };
  items: SeedItem[] | null;
  onGo: (cx: number, cy: number) => void;
}) {
  const [all, setAll] = useState(false);
  const name = biomeName(map.biomes[biome]!);
  const mine = useMemo(() => {
    const here = (at: { cx: number; cy: number }) => at.cx === chunk.cx && at.cy === chunk.cy;
    return (items ?? [])
      .map((it) => ({ it, at: chunkOf(map, it.x, it.y) }))
      .filter(({ at }) => {
        if (at.cx < 0 || at.cy < 0 || at.cx >= map.w || at.cy >= map.h) return false;
        const k = map.cells[at.cy * map.w + at.cx]!;
        const b = map.biomes[k]!;
        // Areas of the same name count together, as their points of interest do.
        return (k === biome || (!!name && biomeName(b) === name)) && vis.biome(b);
      })
      .sort((a, b) => Number(here(b.at)) - Number(here(a.at)) || a.it.y - b.it.y);
  }, [items, map, biome, name, vis, chunk]);
  if (!items) return <p className="mt-5 text-xs text-faint">Placing this seed's items…</p>;
  if (!mine.length) return null;
  const tally = (Object.keys(ITEM_LABELS) as (keyof typeof ITEM_LABELS)[]).flatMap((k) => {
    const n = mine.filter((m) => m.it.kind === k).length;
    return n ? [`${n} ${n === 1 ? ITEM_ONE[k] : ITEM_LABELS[k].toLowerCase()}`] : [];
  });
  const shown = all ? mine : mine.slice(0, FIRST);
  return (
    <Section title="Items">
      <p className="mb-2 text-xs text-muted">In {name || 'this area'}: {tally.join(' · ')}.</p>
      <ul className="space-y-1.5">
        {shown.map(({ it, at }, i) => (
          <ItemRow key={`${it.file}${it.x},${it.y},${i}`} it={it} here={at.cx === chunk.cx && at.cy === chunk.cy} onGo={() => onGo(at.cx, at.cy)} />
        ))}
      </ul>
      {mine.length > FIRST && (
        <button onClick={() => setAll(!all)} className="mt-2 text-xs text-gold hover:underline">
          {all ? 'Show fewer' : `Show all ${mine.length}`}
        </button>
      )}
      <p className="mt-2 text-[11px] text-faint">Where the seed puts them as the world loads; creatures and explosions move things about. In New Game+ these differ.</p>
    </Section>
  );
}
