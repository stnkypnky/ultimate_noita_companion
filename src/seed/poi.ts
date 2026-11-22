// Points of interest placed for a seed: each cave area's generated layout walked chunk by chunk as the engine
// does (TwoAbove/noita-tools' MapHandler.iterateMap), the biome's own script run at its room markers
// (seed.lua: seed_poi_load / seed_poi_chunk), and the rooms it loads kept when they're ones worth showing.
import type { WorldMap } from '@/data/types';
import type { LuaCall } from '@/sim/protocol';
import type { AreaLayout } from './layout';
import { widthFromPix } from './wang';

/** A curated point of interest, by the pixel scene file the game loads for it, or a portal's entity file (data/pois.json). */
export type PoiInfo = { name: string; kind: PoiKind; text?: string; wiki?: string; w: number; h: number };
export type PoiKind = 'room' | 'puzzle' | 'shop' | 'treasure' | 'secret' | 'hazard' | 'portal';
/** scenes: placed per seed by the biome scripts; fixed: at fixed spots (map.json's scenes), by file or `group:<from>`. */
export type PoiData = { scenes: Record<string, PoiInfo>; fixed?: Record<string, PoiInfo> };
/** One placed for a seed: the scene file and its top-left world position. */
export type SeedPoi = { file: string; x: number; y: number };

export type PoiStats = { biome: string; markers: number; placed: number; errors: number };

/**
 * Where the engine calls a spawn function for a layout pixel: one 10-pixel grid over the whole world, counted from
 * its left edge and from the top of the biome map (51.2 layout pixels per chunk, cut where GetWidthFromPix cuts),
 * less 5. Checked against the real game's own calls (the mod's "Record world generation" trace); counting from each
 * chunk's corner instead drifts by up to 8 pixels, which picks different rooms.
 */
export function markerAt(map: WorldMap, cx: number, cy: number, px: number, py: number) {
  const top = map.mapTop ?? 0;
  return {
    x: 10 * (Math.trunc((cx * map.chunk) / 10) + px) - (map.w / 2) * map.chunk - 5,
    y: 10 * (Math.trunc(((cy - top) * map.chunk) / 10) + py) + (top - map.offsetY) * map.chunk - 5,
  };
}

export function placePois(call: LuaCall, map: WorldMap, layouts: AreaLayout[], data: PoiData, stats?: PoiStats[]): SeedPoi[] {
  const out: SeedPoi[] = [];
  const chunkX = (cx: number) => (cx - map.w / 2) * map.chunk;
  const chunkY = (cy: number) => (cy - map.offsetY) * map.chunk;
  const biomeAt = (x: number, y: number) => {
    const cx = Math.floor(x / map.chunk + map.w / 2);
    const cy = Math.floor(y / map.chunk + map.offsetY);
    return cx < 0 || cy < 0 || cx >= map.w || cy >= map.h ? -1 : map.cells[cy * map.w + cx]!;
  };
  const scripts = new Map<string, { spawns: Map<number, string>; init: boolean } | null>();
  for (const l of layouts) {
    const a = map.areas[l.area]!;
    const biome = map.biomes[a.biome]!;
    const script = biome.luaScript;
    if (!script) continue;
    if (!scripts.has(script)) {
      const r = JSON.parse(call('seed_poi_load', script) as string) as { spawns?: Record<string, string>; init?: boolean; error?: string };
      scripts.set(script, r.spawns ? { spawns: new Map(Object.entries(r.spawns).map(([c, n]) => [parseInt(c, 16), n])), init: !!r.init } : null);
    }
    // Loaded again for each area: tables a script changes as it places rooms (unique ones) start over, as they do
    // for a game that loads the biome fresh.
    else call('seed_poi_load', script);
    const s = scripts.get(script);
    if (!s || (!s.spawns.size && !s.init)) continue;
    const st: PoiStats = { biome: biome.id, markers: 0, placed: 0, errors: 0 };
    for (let cy = a.y1; cy <= a.y2; cy++) {
      for (let cx = a.x1; cx <= a.x2; cx++) {
        if (map.cells[cy * map.w + cx] !== a.biome) continue;
        // This chunk's part of the layout: 51 or 52 layout pixels each way, 10 world pixels per pixel.
        const dw = widthFromPix(a.x1, cx);
        // Rows as the game numbers them (biome_map.png's), which the layout's sizes are cut by.
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
            markers.push(`${name},${at.x},${at.y}`);
          }
        }
        if (!markers.length && !s.init) continue;
        st.markers += markers.length;
        const r = JSON.parse(call('seed_poi_chunk', gx, gy, map.chunk, markers.join(';')) as string) as {
          scenes?: ({ f: string; x: number; y: number; any?: boolean } | { e: string; x: number; y: number })[] | Record<string, never>;
          errors: number;
        };
        st.errors += r.errors;
        for (const sc of Array.isArray(r.scenes) ? r.scenes : []) {
          if ('e' in sc) {
            // A portal: an entity at its centre, kept with its box's top left like the rooms.
            const info = data.scenes[sc.e];
            if (!info) continue;
            out.push({ file: sc.e, x: Math.round(sc.x - info.w / 2), y: Math.round(sc.y - info.h / 2) });
            st.placed++;
            continue;
          }
          const info = data.scenes[sc.f];
          if (!info) continue;
          // The engine only loads a scene that stays inside its biome (unless the script says to skip that check):
          // all four corners in this biome.
          const rx = sc.x + Math.floor(info.w / 10) * 10;
          const by = sc.y + Math.floor(info.h / 10) * 10;
          if (!sc.any && [biomeAt(sc.x, sc.y), biomeAt(rx, sc.y), biomeAt(sc.x, by), biomeAt(rx, by)].some((k) => k !== a.biome)) continue;
          out.push({ file: sc.f, x: Math.round(sc.x), y: Math.round(sc.y) });
          st.placed++;
        }
      }
    }
    stats?.push(st);
  }
  return out;
}
