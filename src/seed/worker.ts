/// <reference lib="webworker" />
// The seed tool's Lua engine: the fake engine, the engine's RNG and seed.lua, running the game's own scripts.
import { LuaFactory } from 'wasmoon';
import wasmUrl from 'wasmoon/dist/glue.wasm?url';
import engineSource from '../sim/lua/engine.lua?raw';
import seedSource from './lua/seed.lua?raw';
import { NoitaRandom } from '../sim/rng';
import type { LuaCall } from '../sim/protocol';
import { biomeModifiers, fungalShifts, holyMountainPerks, holyMountainShops, setupSeed, type SeedSetup } from './seed';

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
export type SeedIn = { id: number; base: string; query: SeedQuery };
export type SeedOut = { id: number; ok: true; report: SeedReport } | { id: number; ok: false; error: string };

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

self.onmessage = async (e: MessageEvent<SeedIn>) => {
  const { id, base, query } = e.data;
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
