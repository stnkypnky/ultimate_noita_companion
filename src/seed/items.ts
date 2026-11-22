// Items placed for a seed: what the biome scripts' spawn functions load as the world generates (wands, chests,
// hearts, flasks…), including the ones inside the rooms they place, with what the seed decides about each: a
// wand's stats and spells, a chest's contents, a flask's material. The walk over the layout is placePois' (and
// TwoAbove/noita-tools'); a room's own markers are run at its corner plus their offset, as the engine does.
import type { WorldMap } from '@/data/types';
import type { LuaCall } from '@/sim/protocol';
import type { AreaLayout } from './layout';
import { generateWand, setWand, type ShopWand } from './seed';
import { widthFromPix } from './wang';
import { markerAt } from './poi';

export type ItemKind = 'wand' | 'chest' | 'heart' | 'flask' | 'refresh' | 'spell' | 'other';

/**
 * An item entity file the scripts may load (data/items.json's item_entities): what it is, its items.json id, how a
 * wand one rolls (its generate_gun call), and the init script that picks a flask's material.
 */
export type ItemEntity = {
  kind: ItemKind;
  name: string;
  item?: string;
  /** A procedural wand: its generate_gun( cost, level, unshuffle ). */
  wand?: { cost: number; level: number; unshuffle: boolean };
  /** A set wand: the stats its file sets, the script that picks its spells where it lies, spells it always has. */
  preset?: { stats: Record<string, string>; script?: string; spells?: string[] };
  init?: string;
};
/** A room's spawn markers (its material picture's marker pixels: rgb, dx, dy) and its size, by scene file. */
export type SceneSpawns = Record<string, { w: number; h: number; m: [number, number, number][] }>;
export type ItemData = { entities: Record<string, ItemEntity>; scenes: SceneSpawns };

/** One thing an item gives or is: an entity's item, or a spell. */
export type ItemThing = { kind: ItemKind; file: string; name: string; item?: string; wand?: ShopWand; material?: string };
/** One item placed for a seed, at its world position. */
export type SeedItem = ItemThing & {
  x: number;
  y: number;
  /** What a chest gives when opened. */
  contents?: ItemThing[];
};

/**
 * The colours the engine itself gives a spawn function in every biome's layout (as noita-tools' maps.json has
 * them); a biome's script registers more of its own.
 */
export const ENGINE_SPAWNS: Record<string, string> = {
  ff0000: 'spawn_small_enemies',
  '800000': 'spawn_big_enemies',
  '00ff00': 'spawn_items',
  c88d1a: 'spawn_props',
  c88000: 'spawn_props2',
  c80040: 'spawn_props3',
  ffff00: 'spawn_lamp',
  ff0aff: 'load_pixel_scene',
  ff0080: 'load_pixel_scene2',
  ff8000: 'spawn_unique_enemy',
  c84040: 'spawn_unique_enemy2',
  '804040': 'spawn_unique_enemy3',
  '96c850': 'spawn_ghostlamp',
  '60a064': 'spawn_candles',
  '50a000': 'spawn_potion_altar',
  bca0f0: 'spawn_potions',
  '00ff5a': 'spawn_apparition',
  '78ffff': 'spawn_heart',
  '50a0f0': 'spawn_wands',
  bf26a6: 'spawn_portal',
  '04a977': 'spawn_end_portal',
  ffd171: 'spawn_orb',
  ffd181: 'spawn_perk',
  ffff81: 'spawn_all_perks',
  c7eb28: 'spawn_wand_trap',
  e8ff80: 'spawn_wand_trap_ignite',
  '2768de': 'spawn_wand_trap_electricity_source',
  '2768df': 'spawn_wand_trap_electricity',
  '6b4f9b': 'spawn_moon',
  d7b3e8: 'spawn_collapse',
  '33934c': 'spawn_shopitem',
  d0d0b4: 'spawn_treasure',
  '41704d': 'spawn_specialshop',
  '235a15': 'spawn_music_machine',
};
/** Spawn functions the item pass leaves out (by part of the name): creatures, props, lights and the like. */
export const ITEM_SKIP = [
  'enem',
  'spawn_props',
  'lamp',
  'candle',
  'vines',
  'torch',
  'skulls',
  'apparition',
  'collapse',
  'ghost',
  'music_machine',
  'spawn_bridge',
  'spawn_moon',
  'spawn_portal',
  'spawn_end_portal',
  'spawn_orb',
  'spawn_perk',
  'spawn_all_perks',
  // Holy Mountain shops: the seed's report has them.
  'shopitem',
  'specialshop',
];
const ENGINE_ARG = Object.entries(ENGINE_SPAWNS)
  .map(([c, n]) => `${c}=${n}`)
  .join(';');

/** A biome script loaded fresh for the item pass: its spawn functions by colour (rrggbb), and whether it has an init. */
export function itemSpawnsOf(call: LuaCall, script: string) {
  return JSON.parse(call('seed_items_load', script, ENGINE_ARG, ITEM_SKIP.join(',')) as string) as { spawns?: Record<string, string>; init?: boolean; error?: string };
}

/** Whole pixels, half to even: where the engine puts an entity, and so the position its own scripts seed by. */
export function roundHalfEven(v: number) {
  const f = Math.floor(v);
  const d = v - f;
  return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
}

type Rec = { f: string; x: number; y: number; any?: boolean } | { e: string; x: number; y: number } | { s: string; x: number; y: number };
export type ItemStats = { biome: string; markers: number; scenes: number; items: number; errors: number };

/** Rooms load rooms (a wand altar inside a structure): this many levels deep. */
const MAX_DEPTH = 3;

/** Everything the walk did, for checks against the game's own (the mod's trace): rooms asked for and markers run. */
export type ItemWalk = { scenes: [string, number, number][]; calls: [string, number, number][] };

export function placeItems(call: LuaCall, map: WorldMap, layouts: AreaLayout[], data: ItemData, stats?: ItemStats[], seen?: ItemWalk): SeedItem[] {
  const out: SeedItem[] = [];
  const chunkX = (cx: number) => (cx - map.w / 2) * map.chunk;
  const chunkY = (cy: number) => (cy - map.offsetY) * map.chunk;
  const biomeAt = (x: number, y: number) => {
    const cx = Math.floor(x / map.chunk + map.w / 2);
    const cy = Math.floor(y / map.chunk + map.offsetY);
    return cx < 0 || cy < 0 || cx >= map.w || cy >= map.h ? -1 : map.cells[cy * map.w + cx]!;
  };
  const loaded = new Map<string, { spawns: Map<number, string>; init: boolean } | null>();
  for (const l of layouts) {
    const a = map.areas[l.area]!;
    const biome = map.biomes[a.biome]!;
    const script = biome.luaScript;
    if (!script) continue;
    // Loaded fresh for each area, as placePois does (tables a script changes as it goes start over).
    const r = itemSpawnsOf(call, script);
    if (!loaded.has(script)) loaded.set(script, r.spawns ? { spawns: new Map(Object.entries(r.spawns).map(([c, n]) => [parseInt(c, 16), n])), init: !!r.init } : null);
    const s = loaded.get(script);
    if (!s || (!s.spawns.size && !s.init)) continue;
    const st: ItemStats = { biome: biome.id, markers: 0, scenes: 0, items: 0, errors: 0 };
    const run = (gx: number, gy: number, markers: string[], withInit: boolean) => {
      st.markers += markers.length;
      if (seen) for (const m of markers) {
        const [name, x, y] = m.split(',');
        seen.calls.push([name!, Number(x), Number(y)]);
      }
      const res = JSON.parse(call('seed_items_chunk', gx, gy, map.chunk, markers.join(';'), withInit) as string) as { rec?: Rec[] | Record<string, never>; errors: number };
      st.errors += res.errors;
      return Array.isArray(res.rec) ? res.rec : [];
    };
    const take = (recs: Rec[], depth: number) => {
      for (const rec of recs) {
        if ('s' in rec) {
          out.push({ kind: 'spell', file: rec.s, name: rec.s, x: rec.x, y: rec.y });
          st.items++;
          continue;
        }
        if ('e' in rec) {
          const ent = data.entities[rec.e];
          if (!ent) continue;
          out.push({ kind: ent.kind, file: rec.e, name: ent.name, ...(ent.item ? { item: ent.item } : {}), x: rec.x, y: rec.y });
          st.items++;
          continue;
        }
        // Every room the scripts ask for (the game's trace logs the same calls, before the engine's own check).
        seen?.scenes.push([rec.f, rec.x, rec.y]);
        const scene = data.scenes[rec.f];
        if (!scene) continue;
        // The engine only loads a scene that stays inside its biome, unless the script says to skip that check.
        const rx = rec.x + Math.floor(scene.w / 10) * 10;
        const by = rec.y + Math.floor(scene.h / 10) * 10;
        if (!rec.any && [biomeAt(rec.x, rec.y), biomeAt(rx, rec.y), biomeAt(rec.x, by), biomeAt(rx, by)].some((k) => k !== a.biome)) continue;
        st.scenes++;
        if (depth >= MAX_DEPTH) continue;
        const markers = scene.m.flatMap(([rgb, dx, dy]) => {
          const name = s.spawns.get(rgb);
          return name ? [`${name},${rec.x + dx},${rec.y + dy},1`] : [];
        });
        if (markers.length) take(run(rec.x, rec.y, markers, false), depth + 1);
      }
    };
    for (let cy = a.y1; cy <= a.y2; cy++) {
      for (let cx = a.x1; cx <= a.x2; cx++) {
        if (map.cells[cy * map.w + cx] !== a.biome) continue;
        const dw = widthFromPix(a.x1, cx);
        const top = map.mapTop ?? 0;
        const dh = widthFromPix(a.y1 - top, cy - top);
        const cw = widthFromPix(cx, cx + 1);
        const ch = widthFromPix(cy - top, cy + 1 - top);
        const gx = chunkX(cx);
        const gy = chunkY(cy);
        const markers: string[] = [];
        for (let px = 0; px < cw; px++) {
          for (let py = 0; py < ch; py++) {
            const lx = dw + px;
            const ly = dh + py;
            if (lx >= l.width || ly >= l.height) continue;
            const o = (ly * l.width + lx) * 3;
            const name = s.spawns.get((l.rgb[o]! << 16) | (l.rgb[o + 1]! << 8) | l.rgb[o + 2]!);
            if (!name) continue;
            const at = markerAt(map, cx, cy, px, py);
            markers.push(`${name},${at.x},${at.y},10`);
          }
        }
        if (!markers.length && !s.init) continue;
        take(run(gx, gy, markers, true), 0);
      }
    }
    stats?.push(st);
  }
  return out;
}

/** A wand's stats, a flask's material: what its own script rolls where it lies (the seed already set). */
function detail(call: LuaCall, data: ItemData, t: ItemThing, x: number, y: number): ItemThing {
  const ent = data.entities[t.file];
  const rx = roundHalfEven(x);
  const ry = roundHalfEven(y);
  try {
    if (ent?.wand) return { ...t, wand: generateWand(call, rx, ry, ent.wand.cost, ent.wand.level, ent.wand.unshuffle).wand };
    if (ent?.preset) {
      // Set wands carry the game's own name ("Slim Rapid bolt wand").
      const wand = setWand(call, rx, ry, ent.preset);
      return { ...t, name: ent.preset.stats.ui_name ? wand.name : t.name, wand };
    }
    if (ent?.kind === 'flask' && ent.init) {
      const m = call('seed_flask', rx, ry, ent.init) as string;
      return m ? { ...t, material: m } : t;
    }
  } catch {
    /* kept without it */
  }
  return t;
}

/**
 * Each item's details: wands' stats and spells, flasks' materials, and what chests give (their wands and flasks
 * too). The unlocks that decide which spells can appear must be set first (seed_set_flags).
 */
export function itemDetails(call: LuaCall, data: ItemData, items: SeedItem[]): SeedItem[] {
  return items.map((it) => {
    if (it.kind !== 'chest') return { ...it, ...detail(call, data, it, it.x, it.y) };
    try {
      const drops = JSON.parse(call('seed_chest', roundHalfEven(it.x), roundHalfEven(it.y)) as string) as ({ e: string; x?: number; y?: number } | { s: string })[] | Record<string, never>;
      const contents = (Array.isArray(drops) ? drops : []).flatMap((d): ItemThing[] => {
        if ('s' in d) return [{ kind: 'spell', file: d.s, name: d.s }];
        const ent = data.entities[d.e];
        if (!ent) return [];
        const t: ItemThing = { kind: ent.kind, file: d.e, name: ent.name, ...(ent.item ? { item: ent.item } : {}) };
        return [detail(call, data, t, d.x ?? it.x, d.y ?? it.y)];
      });
      return { ...it, contents };
    } catch {
      return it;
    }
  });
}
