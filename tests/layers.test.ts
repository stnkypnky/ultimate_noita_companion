import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_LAYERS, DEFAULT_OFF, LAYER_GROUPS, layerColor, readOff, wandTier, WAND_TIER_COLOR } from '../src/features/map/layers.ts';
import type { ItemData } from '../src/seed/items.ts';

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

describe('wand tiers', () => {
  const data = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/world_items.json'), 'utf8')) as ItemData;
  const wands = Object.entries(data.entities).filter(([, e]) => e.kind === 'wand');

  it('gives rolled wands the tier their file names, and set wands their own', () => {
    for (const [file, e] of wands) {
      const t = wandTier(file);
      expect(WAND_TIER_COLOR[`${t}`]).toBeDefined();
      if (e.wand) expect(typeof t).toBe('number');
      else expect(['altar', 'special']).toContain(t);
    }
    expect(wandTier('data/entities/items/wand_level_03_better.xml')).toBe(3);
    expect(wandTier('data/entities/items/wand_unshuffle_10.xml')).toBe(10);
    expect(wandTier('data/entities/items/wands/level_01/wand_012.xml')).toBe('altar');
    expect(wandTier('data/entities/items/wands/experimental/experimental_wand_1.xml')).toBe('special');
  });
});