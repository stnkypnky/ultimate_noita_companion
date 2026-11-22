import { afterEach, describe, expect, it } from 'vitest';
import { ALL_LAYERS, DEFAULT_OFF, LAYER_GROUPS, layerColor, readOff } from '../src/features/map/layers.ts';

const store = new Map<string, string>();
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

afterEach(() => {
  store.clear();
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('map layers', () => {
  it('starts with the crowded item layers off, everything else on', () => {
    Object.assign(globalThis, { localStorage: fake });
    expect([...readOff('map')].sort()).toEqual([...DEFAULT_OFF].sort());
    expect(readOff('map').has('caves')).toBe(false);
    expect(readOff('map').has('item:wand')).toBe(false);
  });

  it('remembers each map on its own, and drops layers it no longer knows', () => {
    Object.assign(globalThis, { localStorage: fake });
    store.set('map-layers:map', JSON.stringify(['names', 'poi:hazard', 'gone:layer', 7]));
    expect([...readOff('map')].sort()).toEqual(['names', 'poi:hazard']);
    expect([...readOff('run')].sort()).toEqual([...DEFAULT_OFF].sort());
  });

  it('falls back to the defaults without storage, or with a broken entry', () => {
    expect([...readOff('map')].sort()).toEqual([...DEFAULT_OFF].sort());
    Object.assign(globalThis, { localStorage: fake });
    store.set('map-layers:map', '{not json');
    expect([...readOff('map')].sort()).toEqual([...DEFAULT_OFF].sort());
  });

  it('lists every layer once, each pin layer with a colour', () => {
    const ids = LAYER_GROUPS.flatMap((g) => g.layers.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(ALL_LAYERS.size);
    for (const id of ids) if (id !== 'caves' && id !== 'names') expect(layerColor(id), id).toMatch(/^#[0-9a-f]{6}$/);
  });
});
