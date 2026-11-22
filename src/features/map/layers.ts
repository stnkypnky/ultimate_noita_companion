// What the map shows, layer by layer: each a tick box in the map's Layers panel, remembered per map (the World Map
// and the Run page's map keep their own).
import { useCallback, useState } from 'react';
import type { PoiKind } from '@/seed/poi';
import type { ItemKind } from '@/seed/items';

export type LayerId = 'caves' | 'names' | `poi:${PoiKind}` | 'modifiers' | 'mountains' | `item:${ItemKind}`;

export const POI_LABELS: Record<PoiKind, string> = {
  room: 'Rooms',
  puzzle: 'Puzzles',
  shop: 'Shops',
  treasure: 'Treasure',
  secret: 'Secrets',
  hazard: 'Hazards',
  portal: 'Portals',
};
export const ITEM_LABELS: Record<ItemKind, string> = {
  wand: 'Wands',
  chest: 'Chests',
  heart: 'Max health',
  flask: 'Flasks and pouches',
  refresh: 'Spell refreshers',
  spell: 'Spells on the ground',
  other: 'Other items',
};

/** One of each, for counts ("1 chest"). */
export const ITEM_ONE: Record<ItemKind, string> = {
  wand: 'wand',
  chest: 'chest',
  heart: 'max health',
  flask: 'flask or pouch',
  refresh: 'spell refresher',
  spell: 'spell on the ground',
  other: 'other item',
};

export type LayerGroup = { id: 'world' | 'poi' | 'seed' | 'items'; title: string; layers: { id: LayerId; label: string }[] };
export const LAYER_GROUPS: LayerGroup[] = [
  {
    id: 'world',
    title: 'World',
    layers: [
      { id: 'caves', label: 'Caves (this seed)' },
      { id: 'names', label: 'Area names' },
    ],
  },
  { id: 'poi', title: 'Points of interest', layers: (Object.keys(POI_LABELS) as PoiKind[]).map((k) => ({ id: `poi:${k}` as const, label: POI_LABELS[k] })) },
  {
    id: 'seed',
    title: 'This seed',
    layers: [
      { id: 'modifiers', label: 'Biome modifiers' },
      { id: 'mountains', label: 'Holy Mountain perks' },
    ],
  },
  { id: 'items', title: 'Items', layers: (Object.keys(ITEM_LABELS) as ItemKind[]).map((k) => ({ id: `item:${k}` as const, label: ITEM_LABELS[k] })) },
];
export const ALL_LAYERS = new Set<LayerId>(LAYER_GROUPS.flatMap((g) => g.layers.map((l) => l.id)));
/** Off until ticked: there are many of them, and they'd crowd the map. */
export const DEFAULT_OFF: LayerId[] = ['item:flask', 'item:spell', 'item:other'];

/** Pin colours by kind, from the app's palette. */
export const POI_COLOR: Record<PoiKind, string> = {
  room: '#eda949',
  puzzle: '#9b7bff',
  shop: '#7bd65c',
  treasure: '#f89000',
  secret: '#6cc8ff',
  hazard: '#e2445c',
  portal: '#b46bff',
};
export const ITEM_COLOR: Record<ItemKind, string> = {
  wand: '#ffd36b',
  chest: '#c8823a',
  heart: '#ff5d73',
  flask: '#5fb6ff',
  refresh: '#8ff0d0',
  spell: '#e6d3ff',
  other: '#b9aa9c',
};
export const MODIFIER_COLOR = '#ff9b4a';
export const MOUNTAIN_COLOR = '#ffd36b';

/** The colour a layer's pins are drawn in (none for the world's own layers). */
export function layerColor(id: LayerId): string | undefined {
  if (id.startsWith('poi:')) return POI_COLOR[id.slice(4) as PoiKind];
  if (id.startsWith('item:')) return ITEM_COLOR[id.slice(5) as ItemKind];
  if (id === 'modifiers') return MODIFIER_COLOR;
  if (id === 'mountains') return MOUNTAIN_COLOR;
  return undefined;
}

const storageKey = (key: string) => `map-layers:${key}`;

/** The layers that are off for this map (what's stored, so layers added later start on). */
export function readOff(key: string): Set<LayerId> {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw === null) return new Set(DEFAULT_OFF);
    const list = JSON.parse(raw) as unknown;
    return new Set((Array.isArray(list) ? list : []).filter((x): x is LayerId => typeof x === 'string' && ALL_LAYERS.has(x as LayerId)));
  } catch {
    return new Set(DEFAULT_OFF);
  }
}

function writeOff(key: string, off: Set<LayerId>) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify([...off]));
  } catch {
    /* not remembered */
  }
}

export type MapLayers = { on: (id: LayerId) => boolean; set: (ids: LayerId[], on: boolean) => void };

/** This map's layers; without a key (a map with no Layers panel), the defaults. */
export function useMapLayers(key: string | undefined): MapLayers {
  const [off, setOff] = useState(() => (key ? readOff(key) : new Set(DEFAULT_OFF)));
  const set = useCallback(
    (ids: LayerId[], on: boolean) =>
      setOff((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (on) next.delete(id);
          else next.add(id);
        }
        if (key) writeOff(key, next);
        return next;
      }),
    [key],
  );
  const on = useCallback((id: LayerId) => !off.has(id), [off]);
  return { on, set };
}
