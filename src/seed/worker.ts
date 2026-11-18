/// <reference lib="webworker" />
// The seed tool's Lua engine: the fake engine, the engine's RNG and seed.lua, running the game's own scripts.
import { LuaFactory } from 'wasmoon';
import wasmUrl from 'wasmoon/dist/glue.wasm?url';
import engineSource from '../sim/lua/engine.lua?raw';
import seedSource from './lua/seed.lua?raw';
import { NoitaRandom } from '../sim/rng';
import type { LuaCall } from '../sim/protocol';
import { biomeModifiers, fungalShifts, generateWand, holyMountainPerks, holyMountainShops, setupSeed, type SeedSetup, type ShopWand } from './seed';
import { generateLayouts, type AreaLayout } from './layout';
import { buildTileset, type Tileset } from './wang';
import { placePois, type PoiData, type PoiStats, type SeedPoi } from './poi';
import type { WorldMap } from '../data/types';

export type SeedQuery = SeedSetup & {
  /** Perks taken at each Holy Mountain (changes what the later ones offer). */
  picks: string[][];
  shopSpots: { x: number; y: number }[];
};
export type SeedReport = {
  modifiers: ReturnType<typeof biomeModifiers>;
  fungal: ReturnType<typeof fungalShifts>;
  perks: ReturnType<typeof holyMountainPerks>;
  shops: ReturnType<typeof holyMountainShops>;
};
/** One random wand from generate_gun (cost, level as a wand_level_XX.lua passes them), at a random spot and seed. */
export type WandRoll = { seed: number; x: number; y: number; cost: number; level: number };
export type SeedIn =
  | { id: number; base: string; query: SeedQuery }
  | { id: number; base: string; layoutSeed: number }
  | { id: number; base: string; poiSeed: number }
  | { id: number; base: string; roll: WandRoll };
export type SeedOut =
  | { id: number; ok: true; report?: SeedReport; layouts?: AreaLayout[]; wand?: ShopWand; pois?: SeedPoi[] }
  | { id: number; ok: false; error: string };

// ---- Cave layouts (wang.ts): the map and the templates, decoded once ----
let layoutData: Promise<{ map: WorldMap; tilesets: Map<string, Tileset>; overlay?: Uint8Array }> | null = null;

/** Raw RGB of a PNG, without colour management (the game reads the stored values). */
async function rgbOf(url: string) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const rgb = new Uint8Array(bmp.width * bmp.height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i]!;
    rgb[j++] = rgba[i + 1]!;
    rgb[j++] = rgba[i + 2]!;
  }
  return { rgb, w: bmp.width, h: bmp.height };
}

async function loadLayoutData(base: string) {
  const map = (await (await fetch(`${base}game/data/map.json`)).json()) as WorldMap;
  const tilesets = new Map<string, Tileset>();
  const names = [...new Set(map.biomes.flatMap((b) => (b.wangTemplate ? [b.wangTemplate] : [])))];
  await Promise.all(
    names.map(async (n) => {
      const img = await rgbOf(`${base}game/wang/${n}.png`);
      const ts = buildTileset(img.rgb, img.w, img.h);
      if (ts) tilesets.set(n, ts);
    }),
  );
  const overlay = await rgbOf(`${base}game/wang/coalmine_overlay.png`).then((o) => o.rgb, () => undefined);
  return { map, tilesets, overlay };
}

let engine: Promise<LuaCall> | null = null;

async function createEngine(base: string): Promise<LuaCall> {
  const files: string[] = await (await fetch(`${base}game/lua/seed-files.json`)).json();
  const sources = new Map<string, string>();
  await Promise.all(files.map(async (f) => sources.set(f, await (await fetch(`${base}game/lua/${f}`)).text())));
  const lua = await new LuaFactory(wasmUrl).createEngine();
  lua.global.set('__read_file', (path: string) => sources.get(path) ?? null);
  for (const [k, f] of Object.entries(new NoitaRandom().luaGlobals())) lua.global.set(k, f);
  await lua.doString(engineSource);
  await lua.doString(seedSource);
  return (fn, ...args) => (lua.global.get(fn) as (...a: unknown[]) => unknown)(...args);
}

// Points of interest run the cave biomes' own scripts, which define globals of their own: a separate Lua engine,
// so they can't disturb the scripts the seed report runs.
let poiEngine: Promise<LuaCall> | null = null;
let poiData: Promise<PoiData> | null = null;

self.onmessage = async (e: MessageEvent<SeedIn>) => {
  const { id, base } = e.data;
  if ('poiSeed' in e.data) {
    try {
      const seed = e.data.poiSeed >>> 0;
      const d = await (layoutData ??= loadLayoutData(base));
      const data = await (poiData ??= fetch(`${base}game/data/pois.json`).then((r) => r.json() as Promise<PoiData>));
      const call = await (poiEngine ??= createEngine(base));
      call('sim_set_world_seed', seed);
      const stats: PoiStats[] = [];
      const pois = placePois(call, d.map, generateLayouts(d.map, seed, d.tilesets, d.overlay), data, stats);
      if (import.meta.env.DEV) console.debug('[poi]', seed, stats.filter((s) => s.markers));
      postMessage({ id, ok: true, pois } satisfies SeedOut);
    } catch (err) {
      postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) } satisfies SeedOut);
    }
    return;
  }
  if ('layoutSeed' in e.data) {
    try {
      const d = await (layoutData ??= loadLayoutData(base));
      const layouts = generateLayouts(d.map, e.data.layoutSeed, d.tilesets, d.overlay);
      postMessage({ id, ok: true, layouts } satisfies SeedOut, { transfer: layouts.map((l) => l.rgb.buffer) });
    } catch (err) {
      postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) } satisfies SeedOut);
    }
    return;
  }
  if ('roll' in e.data) {
    const r = e.data.roll;
    try {
      engine ??= createEngine(base);
      const call = await engine;
      call('sim_set_world_seed', r.seed >>> 0);
      call('seed_set_flags', true, '');
      postMessage({ id, ok: true, wand: generateWand(call, r.x, r.y, r.cost, r.level).wand } satisfies SeedOut);
    } catch (err) {
      postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) } satisfies SeedOut);
    }
    return;
  }
  const { query } = e.data;
  try {
    engine ??= createEngine(base);
    const call = await engine;
    setupSeed(call, query);
    const extraItems = query.picks.flat().filter((p) => p === 'EXTRA_SHOP_ITEM').length;
    const noShuffle = query.picks.flat().includes('NO_MORE_SHUFFLE');
    const report: SeedReport = {
      modifiers: biomeModifiers(call),
      fungal: fungalShifts(call),
      perks: holyMountainPerks(call, query.picks),
      shops: holyMountainShops(call, query.shopSpots, extraItems, noShuffle),
    };
    postMessage({ id, ok: true, report } satisfies SeedOut);
  } catch (err) {
    postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) } satisfies SeedOut);
  }
};
