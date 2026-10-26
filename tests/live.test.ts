// The live wand (what the test range fires): real gun.lua for each trigger pull, our port of the engine's timing and mana.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, loadGun, type LuaHost } from '../tools/extract/lua.ts';
import { WandRuntime } from '../src/features/range/wand.ts';
import { castWand, resetWand, runWand } from '../src/sim/protocol.ts';
import type { SimCast, SimRequest, SimWand } from '../src/sim/types.ts';

const LUA = join(import.meta.dirname, '../public/game/lua');
let host: LuaHost;
const call = (fn: string, ...args: unknown[]) => host.call(fn, ...args);

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(LUA, p)) ? readFileSync(join(LUA, p), 'utf8') : undefined));
  await loadGun(host);
});

function request(deck: string[], wand: Partial<SimWand> = {}, uses = -1): SimRequest {
  return {
    wand: { shuffle: false, spellsPerCast: 1, castDelay: 10, rechargeTime: 20, manaMax: 1000, manaChargeSpeed: 100, capacity: deck.length, spread: 0, speedMultiplier: 1, ...wand },
    deck: deck.map((id) => ({ id, uses })),
    alwaysCasts: [],
    options: { maxCasts: 64, stopOnReload: true, hp: 100, maxHp: 100, money: 0, frame: 0 },
  };
}

/** A wand in hand, ticked frame by frame like the range does. */
function hold(req: SimRequest) {
  const casts: SimCast[] = [];
  let n = 0;
  const wand = new WandRuntime({ reset: (r) => resetWand(call, r), cast: (f, m) => castWand(call, f, m, ++n) }, (c) => casts.push(c));
  let frame = 0;
  wand.equip(req, frame);
  /** Advance `frames` frames with the trigger held (or not). */
  const run = (frames: number, trigger = true) => {
    for (let i = 0; i < frames; i++) wand.tick(++frame, trigger);
  };
  return { wand, casts, run, frame: () => frame };
}

const played = (c: SimCast) => c.played.join(',');

describe('live wand', () => {
  it('fires the same casts as the cast simulator when the trigger is held', () => {
    const deck = ['BURST_2', 'LIGHT_BULLET', 'DAMAGE', 'BOMB', 'LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET', 'BULLET'];
    const req = request(deck, { manaMax: 300, manaChargeSpeed: 120 });
    const batch = runWand(call, { ...req, options: { ...req.options, maxCasts: 12, stopOnReload: false } }).casts;
    const live = hold(req);
    live.run(batch.at(-1)!.frame - batch[0]!.frame + 1);
    expect(live.casts.map(played)).toEqual(batch.map(played));
    // Same spacing between casts, and the same mana going into each one.
    expect(live.casts.map((c) => c.frame - live.casts[0]!.frame)).toEqual(batch.map((c) => c.frame - batch[0]!.frame));
    live.casts.forEach((c, i) => expect(c.mana_before).toBeCloseTo(batch[i]!.mana_before, 6));
  });

  it('runs out of mana and skips what it cannot afford', () => {
    // Bombs cost 25; 60 mana that never recharges buys two.
    const live = hold(request(['BOMB'], { manaMax: 60, manaChargeSpeed: 0, rechargeTime: 0 }));
    live.run(400);
    const [a, b, c] = live.casts;
    expect(a!.shot.projectiles).toHaveLength(1);
    expect(b!.shot.projectiles).toHaveLength(1);
    expect(c!.shot.projectiles).toHaveLength(0);
    expect(c!.no_mana).toBe(1);
    expect(live.wand.mana).toBeCloseTo(10);
    expect(live.wand.noManaFrame).toBeGreaterThan(0);
  });

  it('recharges mana while it waits', () => {
    const live = hold(request(['BOMB'], { manaMax: 100, manaChargeSpeed: 30, rechargeTime: 0 }));
    live.run(1);
    expect(live.wand.mana).toBeCloseTo(75);
    live.run(60, false);
    expect(live.wand.mana).toBeCloseTo(100);
  });

  it('waits for the longer of cast delay and recharge time', () => {
    // Spark bolt: 10 + 3 frames of cast delay.
    const slow = hold(request(['LIGHT_BULLET'], { rechargeTime: 40 }));
    slow.run(60);
    expect(slow.casts[1]!.frame - slow.casts[0]!.frame).toBe(40);
    const fast = hold(request(['LIGHT_BULLET'], { rechargeTime: 5 }));
    fast.run(60);
    expect(fast.casts[1]!.frame - fast.casts[0]!.frame).toBe(13);
  });

  it('remembers its place in the deck when the trigger is released', () => {
    const live = hold(request(['LIGHT_BULLET', 'BOMB', 'BULLET']));
    live.run(1);
    live.run(300, false);
    live.run(1);
    expect(live.casts.map(played)).toEqual(['LIGHT_BULLET', 'BOMB']);
    expect(live.wand.deck?.deck).toEqual([3]);
  });

  it('starts the deck over after a wand swap, keeping spent charges', () => {
    const live = hold(request(['BOMB', 'LIGHT_BULLET'], {}, 3));
    live.run(1);
    live.wand.swap();
    live.run(200);
    expect(live.casts.map(played).slice(0, 2)).toEqual(['BOMB', 'BOMB']);
    expect(live.wand.deck?.uses.find((u) => u.inv === 1)?.uses).toBeLessThan(2);
  });

  it('fires once per frame at most', () => {
    const live = hold(request(['LIGHT_BULLET'], { castDelay: -20, rechargeTime: -20 }));
    live.run(10);
    expect(live.casts).toHaveLength(10);
  });
});

describe('recovering from a failed cast', () => {
  it('picks the wand back up after a misfire (e.g. a timeout while the app was in the background)', async () => {
    vi.useFakeTimers();
    try {
      const casts: SimCast[] = [];
      let n = 0;
      let failNext = true;
      const wand = new WandRuntime(
        {
          reset: (r) => resetWand(call, r),
          cast: (f, m) => {
            if (failNext) {
              failNext = false;
              return Promise.reject(new Error('The simulation took too long and was stopped.'));
            }
            return castWand(call, f, m, ++n);
          },
        },
        (c) => casts.push(c),
      );
      let frame = 0;
      wand.equip(request(['LIGHT_BULLET']), frame);
      wand.tick(++frame, true);
      await Promise.resolve();
      await Promise.resolve();
      expect(wand.error).toMatch(/too long/);
      // A second later it reloads itself and fires again.
      await vi.advanceTimersByTimeAsync(1100);
      for (let i = 0; i < 5; i++) wand.tick(++frame, true);
      expect(wand.error).toBeNull();
      expect(casts.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
