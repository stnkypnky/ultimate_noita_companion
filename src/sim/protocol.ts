// Calling driver.lua and normalising what it returns. Shared by the worker and the tests, so both
// talk to the game scripts the same way.
import type { LiveCast, SimCast, SimRequest, SimResult, SimShot } from './types';

/** Calls a global Lua function. */
export type LuaCall = (fn: string, ...args: unknown[]) => unknown;

// The Lua JSON encoder can't tell an empty object from an empty array.
const obj = <T extends object>(v: unknown): T => (Array.isArray(v) || !v ? ({} as T) : (v as T));

function normShot(s: SimShot): SimShot {
  return {
    ...s,
    state: obj(s.state),
    projectiles: (s.projectiles ?? []).map((p) => (p.trigger ? { ...p, trigger: { ...p.trigger, shot: normShot(p.trigger.shot) } } : p)),
  };
}

const normCast = (c: SimCast): SimCast => ({ ...c, played: c.played ?? [], slots: c.slots ?? [], uses: c.uses ?? [], shot: normShot(c.shot) });

/** Set up the wand and its deck (sim_reset + cards). */
export function resetWand(call: LuaCall, { wand, deck, alwaysCasts, options }: SimRequest) {
  call(
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
  for (const card of deck) call('sim_add_card', card.id, card.uses);
  for (const id of alwaysCasts) call('sim_add_always_cast', id);
}

export function runWand(call: LuaCall, req: SimRequest): SimResult {
  resetWand(call, req);
  const raw = JSON.parse(call('sim_run', req.options.maxCasts, req.options.stopOnReload) as string) as SimResult;
  return { casts: raw.casts.map(normCast), missing: raw.missing ?? [], log: raw.log ?? [] };
}

/** One live trigger pull on `frame` with the wand holding `mana`. */
export function castWand(call: LuaCall, frame: number, mana: number, index: number): LiveCast {
  const raw = JSON.parse(call('sim_cast_json', frame, mana) as string) as LiveCast & { missing: unknown };
  const d = obj<Partial<LiveCast['deck']>>(raw.deck);
  return {
    cast: { ...normCast(raw.cast), index },
    deck: { deck: d.deck ?? [], discarded: d.discarded ?? [], uses: d.uses ?? [] },
    // A Lua set: { name = true }.
    missing: Object.keys(obj(raw.missing)),
  };
}
