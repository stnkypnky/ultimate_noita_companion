import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LuaFactory, type LuaEngine } from 'wasmoon';

const SIM_LUA = join(import.meta.dirname, '../../src/sim/lua');
export const engineSource = readFileSync(join(SIM_LUA, 'engine.lua'), 'utf8');
export const driverSource = readFileSync(join(SIM_LUA, 'driver.lua'), 'utf8');

export type LuaHost = {
  lua: LuaEngine;
  /** Every game file the scripts loaded, in load order. */
  filesRead: string[];
  call: <T = unknown>(fn: string, ...args: unknown[]) => T;
  close: () => void;
};

/** A fresh Lua state with the fake engine installed; game files are read through `readFile`. */
export async function createLuaHost(readFile: (path: string) => string | undefined): Promise<LuaHost> {
  const lua = await new LuaFactory().createEngine();
  const filesRead: string[] = [];
  lua.global.set('__read_file', (path: string) => {
    const text = readFile(path);
    if (text !== undefined && !filesRead.includes(path)) filesRead.push(path);
    return text ?? null;
  });
  await lua.doString(engineSource);
  return {
    lua,
    filesRead,
    call: (fn, ...args) => {
      const f = lua.global.get(fn) as ((...a: unknown[]) => unknown) | undefined;
      if (typeof f !== 'function') throw new Error(`Lua function not found: ${fn}`);
      return f(...args) as never;
    },
    close: () => lua.global.close(),
  };
}

/** Load gun.lua (which pulls in gun_actions.lua etc.) plus our recorder/driver. */
export async function loadGun(host: LuaHost) {
  await host.lua.doString('dofile("data/scripts/gun/gun.lua")');
  await host.lua.doString(driverSource);
}
