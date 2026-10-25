/// <reference lib="webworker" />
// Runs Noita's own gun.lua in Lua-in-WASM. One engine is created once and reused for every simulation.
import { LuaFactory, type LuaEngine } from 'wasmoon';
import wasmUrl from 'wasmoon/dist/glue.wasm?url';
import engineSource from './lua/engine.lua?raw';
import driverSource from './lua/driver.lua?raw';
import { castWand, resetWand, runWand, type LuaCall } from './protocol';
import type { LiveCast, SimRequest, SimResult } from './types';

export type WorkerIn =
  | { id: number; type: 'init'; base: string }
  | { id: number; type: 'run'; req: SimRequest }
  /** Live play: set up the wand, then fire it one trigger pull at a time. */
  | { id: number; type: 'live:reset'; req: SimRequest }
  | { id: number; type: 'live:cast'; frame: number; mana: number };
export type WorkerOut = { id: number; ok: true; result?: SimResult; live?: LiveCast } | { id: number; ok: false; error: string };

let engine: Promise<LuaCall> | null = null;

async function createEngine(base: string): Promise<LuaCall> {
  const files: string[] = await (await fetch(`${base}game/lua/files.json`)).json();
  const sources = new Map<string, string>();
  await Promise.all(files.map(async (f) => sources.set(f, await (await fetch(`${base}game/lua/${f}`)).text())));

  const lua: LuaEngine = await new LuaFactory(wasmUrl).createEngine();
  lua.global.set('__read_file', (path: string) => sources.get(path) ?? null);
  await lua.doString(engineSource);
  await lua.doString('dofile("data/scripts/gun/gun.lua")');
  await lua.doString(driverSource);
  return (fn, ...args) => (lua.global.get(fn) as (...a: unknown[]) => unknown)(...args);
}

let liveCasts = 0;

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      engine ??= createEngine(msg.base);
      await engine;
      postMessage({ id: msg.id, ok: true } satisfies WorkerOut);
    } else {
      if (!engine) throw new Error('simulator not initialised');
      const call = await engine;
      if (msg.type === 'run') {
        postMessage({ id: msg.id, ok: true, result: runWand(call, msg.req) } satisfies WorkerOut);
      } else if (msg.type === 'live:reset') {
        resetWand(call, msg.req);
        liveCasts = 0;
        postMessage({ id: msg.id, ok: true } satisfies WorkerOut);
      } else {
        postMessage({ id: msg.id, ok: true, live: castWand(call, msg.frame, msg.mana, ++liveCasts) } satisfies WorkerOut);
      }
    }
  } catch (err) {
    postMessage({ id: msg.id, ok: false, error: String((err as Error)?.message ?? err) } satisfies WorkerOut);
  }
};
