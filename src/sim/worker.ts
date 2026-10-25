/// <reference lib="webworker" />
// Runs Noita's own gun.lua in Lua-in-WASM. One engine is created once and reused for every simulation.
import { LuaFactory, type LuaEngine } from 'wasmoon';
import wasmUrl from 'wasmoon/dist/glue.wasm?url';
import engineSource from './lua/engine.lua?raw';
import driverSource from './lua/driver.lua?raw';
import type { SimCast, SimRequest, SimResult, SimShot } from './types';

export type WorkerIn = { id: number; type: 'init'; base: string } | { id: number; type: 'run'; req: SimRequest };
export type WorkerOut = { id: number; ok: true; result?: SimResult } | { id: number; ok: false; error: string };

let engine: Promise<LuaEngine> | null = null;

async function createEngine(base: string): Promise<LuaEngine> {
  const files: string[] = await (await fetch(`${base}game/lua/files.json`)).json();
  const sources = new Map<string, string>();
  await Promise.all(files.map(async (f) => sources.set(f, await (await fetch(`${base}game/lua/${f}`)).text())));

  const lua = await new LuaFactory(wasmUrl).createEngine();
  lua.global.set('__read_file', (path: string) => sources.get(path) ?? null);
  await lua.doString(engineSource);
  await lua.doString('dofile("data/scripts/gun/gun.lua")');
  await lua.doString(driverSource);
  return lua;
}

const call = (lua: LuaEngine, fn: string, ...args: unknown[]) => (lua.global.get(fn) as (...a: unknown[]) => unknown)(...args);

// The Lua JSON encoder can't tell an empty object from an empty array.
const obj = <T extends object>(v: unknown): T => (Array.isArray(v) || !v ? ({} as T) : (v as T));
function normShot(s: SimShot): SimShot {
  return {
    ...s,
    state: obj(s.state),
    projectiles: (s.projectiles ?? []).map((p) => (p.trigger ? { ...p, trigger: { ...p.trigger, shot: normShot(p.trigger.shot) } } : p)),
  };
}

function run(lua: LuaEngine, { wand, deck, alwaysCasts, options }: SimRequest): SimResult {
  call(
    lua,
    'sim_reset',
    wand.spellsPerCast,
    wand.shuffle,
    wand.rechargeTime,
    wand.capacity,
    wand.castDelay,
    wand.spread,
    wand.speedMultiplier,
    wand.manaMax,
    wand.manaChargeSpeed,
    options.mana ?? wand.manaMax,
    options.hp,
    options.maxHp,
    options.money,
    options.frame,
  );
  for (const card of deck) call(lua, 'sim_add_card', card.id, card.uses);
  for (const id of alwaysCasts) call(lua, 'sim_add_always_cast', id);
  const raw = JSON.parse(call(lua, 'sim_run', options.maxCasts, options.stopOnReload) as string) as SimResult;
  return {
    casts: raw.casts.map((c: SimCast) => ({ ...c, played: c.played ?? [], slots: c.slots ?? [], uses: c.uses ?? [], shot: normShot(c.shot) })),
    missing: raw.missing ?? [],
    log: raw.log ?? [],
  };
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      engine ??= createEngine(msg.base);
      await engine;
      postMessage({ id: msg.id, ok: true } satisfies WorkerOut);
    } else {
      if (!engine) throw new Error('simulator not initialised');
      const result = run(await engine, msg.req);
      postMessage({ id: msg.id, ok: true, result } satisfies WorkerOut);
    }
  } catch (err) {
    postMessage({ id: msg.id, ok: false, error: String((err as Error)?.message ?? err) } satisfies WorkerOut);
  }
};
