import { useEffect, useRef, useState } from 'react';
import { Layers, Loader2, X } from 'lucide-react';
import { LAYER_GROUPS, layerColor, type LayerId, type MapLayers } from './layers';

/**
 * How many of a layer's things you can see on this map: a number, 'loading' while the seed's are being worked out,
 * or null when the layer doesn't apply here (left out of the panel). Layers without an entry are always offered.
 */
export type LayerCounts = Partial<Record<LayerId, number | 'loading' | null>>;

/** The map's Layers button and panel: a tick box per layer, by group, with how many of each this seed has. */
export function LayersControl({ layers, counts }: { layers: MapLayers; counts: LayerCounts }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', away);
    };
  }, [open]);
  const groups = LAYER_GROUPS.map((g) => ({ ...g, layers: g.layers.filter((l) => counts[l.id] !== null) })).filter((g) => g.layers.length);
  return (
    // Fills the map (less a margin) so the panel can scroll within it, however short the map is; only the button
    // and the panel take taps.
    <div ref={box} className="pointer-events-none absolute inset-2 z-10 flex flex-col items-start">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-black/70 px-2.5 text-sm text-ink hover:bg-black/90"
        title="Choose what the map shows"
      >
        <Layers size={16} /> Layers
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Map layers"
          className="pointer-events-auto mt-1 min-h-0 w-72 max-w-full overflow-y-auto overscroll-contain rounded-xl border border-line bg-[#0d0b10]/95 p-3 text-sm shadow-xl backdrop-blur"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="font-game text-[16px] text-gold">On the map</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-ink">
              <X size={15} />
            </button>
          </div>
          {groups.map((g) => {
            const ids = g.layers.map((l) => l.id);
            const all = ids.every((id) => layers.on(id));
            return (
              <fieldset key={g.id} className="mt-2 first-of-type:mt-0">
                <legend className="flex w-full items-center justify-between py-1 text-xs text-faint">
                  <span>{g.title}</span>
                  {ids.length > 1 && (
                    <button onClick={() => layers.set(ids, !all)} className="text-gold hover:underline">
                      {all ? 'None' : 'All'}
                    </button>
                  )}
                </legend>
                {g.layers.map((l) => {
                  const color = layerColor(l.id);
                  const n = counts[l.id];
                  return (
                    <label key={l.id} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1 hover:bg-white/5">
                      <input type="checkbox" checked={layers.on(l.id)} onChange={(e) => layers.set([l.id], e.target.checked)} className="accent-[var(--color-gold,#ffd36b)]" />
                      {color ? <span className="h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: color }} aria-hidden /> : <span className="w-2.5" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate text-ink">{l.label}</span>
                      {n === 'loading' ? (
                        <Loader2 size={13} className="animate-spin text-faint" aria-label="Working it out" />
                      ) : typeof n === 'number' ? (
                        <span className="text-xs text-faint tabular-nums">{n}</span>
                      ) : null}
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
          <p className="mt-2 text-[11px] text-faint">Counts are what you can see: places you haven't found stay hidden.</p>
        </div>
      )}
    </div>
  );
}
