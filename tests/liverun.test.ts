import { describe, expect, it, vi } from 'vitest';
import { parseLiveRun } from '../src/features/live/parse.ts';
import { STALE_MS, liveFlags, setLiveRun, useLiveRun } from '../src/features/live/state.ts';
import { toBuilderWand } from '../src/features/live/toBuilder.ts';
import { bottomItems, railItems } from '../src/app/nav.ts';
import { clock, nextMountain, picksBefore } from '../src/features/live/runMath.ts';
import type { WorldMap } from '../src/data/types.ts';

describe('run page helpers', () => {
  // A 1-wide world of 512-px chunks, the surface at row 2, Holy Mountains at rows 5 and 9.
  const biome = (id: string) => ({ id }) as WorldMap['biomes'][number];
  const map = {
    w: 1,
    h: 12,
    chunk: 512,
    offsetY: 2,
    biomes: [biome('coalmine'), biome('temple_altar')],
    cells: [0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
  } as unknown as WorldMap;

  it('finds the next Holy Mountain below the player', () => {
    expect(nextMountain(map, 100)).toBe(1); // row 2
    expect(nextMountain(map, 2 * 512 + 10)).toBe(1); // row 4, just above it
    expect(nextMountain(map, 3 * 512 + 10)).toBe(2); // row 5: standing in the first, so the next is the second
    expect(nextMountain(map, 4 * 512)).toBe(2); // row 6
    expect(nextMountain(map, 9 * 512)).toBeNull(); // row 11, past the last
  });

  it('counts the perks taken so far as picks before the next mountain', () => {
    const run = { perks: [{ id: 'SHIELD', count: 2 }, { id: 'EXTRA_HP', count: 1 }] };
    expect(picksBefore(run, 1)).toEqual([]);
    expect(picksBefore(run, 3)).toEqual([[], ['SHIELD', 'SHIELD', 'EXTRA_HP']]);
  });

  it('formats play time', () => {
    expect(clock(65.9)).toBe('1:05');
    expect(clock(3729)).toBe('1:02:09');
  });
});

const wand = {
  name: 'Wand',
  active: true,
  shuffle: false,
  spellsPerCast: 1,
  castDelay: 9.6,
  rechargeTime: 20,
  manaMax: 300.4,
  manaChargeSpeed: 80,
  capacity: 4,
  spread: -1.26,
  speedMultiplier: 1.0123,
  spells: [
    { id: 'BOMB', slot: 2, uses: 1 },
    { id: 'LIGHT_BULLET', slot: 0 },
  ],
  alwaysCasts: ['BURST_2'],
};

describe('live run file (companion mod)', () => {
  it('keeps well-formed fields and drops the rest', () => {
    const run = parseLiveRun(
      JSON.stringify({
        v: 1,
        status: 'hacked',
        seed: 42,
        hp: 'lots',
        gold: 10,
        wands: [wand, 'nope'],
        spells: [{ id: 'NUKE' }, { id: '<script>' }],
        perks: [{ id: 'SHIELD', count: 2 }, { id: 5 }],
        flasks: [{ contents: [{ material: 'water', amount: 5 }, { material: '../x', amount: 1 }] }],
      }),
    );
    expect(run).toMatchObject({ status: 'alive', seed: 42, gold: 10, spells: [{ id: 'NUKE' }], perks: [{ id: 'SHIELD', count: 2 }] });
    expect(run?.hp).toBeUndefined();
    expect(run?.wands).toHaveLength(1);
    expect(run?.flasks[0]?.contents).toEqual([{ material: 'water', amount: 5 }]);
  });

  it('survives being relayed to another device (as the store sends it)', () => {
    const run = parseLiveRun({ v: 1, seed: 7, wands: [wand] })!;
    const relayed = JSON.parse(JSON.stringify({ v: 1, ...run }));
    expect(parseLiveRun(relayed)).toEqual(run);
  });

  it('reads the mod-2 fields, and counts creatures met and items carried as discovered', () => {
    const run = parseLiveRun({
      v: 1,
      mod: 2,
      x: 120.4,
      y: 2399.6,
      playtime: 65.5,
      kills: 3,
      orbs: 1,
      fungal: { count: 2, readyIn: 40 },
      seen: ['zombie', 'zombie', '../evil', 'longleg'],
      items: [{ id: 'evil_eye', name: 'Evil eye', held: true }, { id: 'bad id' }],
      killedBy: 'zombie',
    })!;
    expect(run).toMatchObject({ mod: 2, x: 120, y: 2400, playtime: 65.5, kills: 3, orbs: 1, fungal: { count: 2, readyIn: 40 }, killedBy: 'zombie' });
    expect(run.seen).toEqual(['zombie', 'longleg']);
    expect(run.items).toEqual([{ id: 'evil_eye', name: 'Evil eye', held: true }]);
    expect(liveFlags(run)).toEqual(expect.arrayContaining(['enemy:zombie', 'enemy:longleg', 'item:evil_eye']));
    // An old mod's file has none of them.
    const old = parseLiveRun({ v: 1, seed: 1 })!;
    expect(old.mod ?? old.x ?? old.seen ?? old.fungal).toBeUndefined();
  });

  it('rejects junk and oversized input', () => {
    expect(parseLiveRun('not json')).toBeNull();
    expect(parseLiveRun(JSON.stringify({ v: 2 }))).toBeNull();
    expect(parseLiveRun('x'.repeat(300_000))).toBeNull();
  });

  it('turns carried spells and perks into spoiler flags', () => {
    const run = parseLiveRun({ v: 1, wands: [wand], spells: [{ id: 'NUKE' }], perks: [{ id: 'SHIELD', count: 1 }] });
    expect(liveFlags(run).sort()).toEqual(['action_bomb', 'action_burst_2', 'action_light_bullet', 'action_nuke', 'perk_picked_shield']);
  });

  it('converts a carried wand for the builder, keeping slots and charges', () => {
    const w = toBuilderWand(parseLiveRun({ v: 1, wands: [wand] })!.wands[0]!);
    expect(w).toMatchObject({ name: 'Wand from my run', castDelay: 10, manaMax: 300, spread: -1.3, capacity: 4, alwaysCasts: ['BURST_2'] });
    expect(w.spells).toEqual(['LIGHT_BULLET', null, 'BOMB', null]);
    expect(w.charges).toEqual([null, null, 1, null]);
    expect(w.sprite).toBeUndefined();
    const numbered = toBuilderWand(parseLiveRun({ v: 1, wands: [{ ...wand, sprite: 'data/items_gfx/wands/wand_0042.png' }] })!.wands[0]!);
    expect(numbered.sprite).toBe('data/items_gfx/wands/wand_0042.png');
  });

  it('keeps every spell, in order, when the mod reports the same slot for all of them', () => {
    const same = { ...wand, capacity: 10, spells: ['FIRE_TRAIL', 'BOMB', 'SUMMON_HOLLOW_EGG', 'SPREAD_REDUCE'].map((id) => ({ id, slot: 0 })) };
    const w = toBuilderWand(parseLiveRun({ v: 1, wands: [same] })!.wands[0]!);
    expect(w.spells.slice(0, 5)).toEqual(['FIRE_TRAIL', 'BOMB', 'SUMMON_HOLLOW_EGG', 'SPREAD_REDUCE', null]);
  });
});

describe('a game is running', () => {
  it('is active while snapshots are fresh, and turns itself off when they stop', () => {
    vi.useFakeTimers();
    const run = parseLiveRun({ v: 1, seed: 1 })!;
    const now = Date.now();
    setLiveRun(run, now - STALE_MS - 1, 'Old PC', now);
    expect(useLiveRun.getState().active).toBe(false);
    setLiveRun(run, now, null, now);
    expect(useLiveRun.getState().active).toBe(true);
    vi.advanceTimersByTime(STALE_MS + 1);
    expect(useLiveRun.getState().active).toBe(false);
    vi.useRealTimers();
  });

  it('puts Run in the nav only then: after Home on the rail, in Materials’ slot on the phone', () => {
    expect(railItems(false).some((n) => n.to === '/run')).toBe(false);
    expect(railItems(true).map((n) => n.to).slice(0, 2)).toEqual(['/', '/run']);
    expect(bottomItems(false).map((n) => n.to)).toEqual(['/', '/wand', '/spells', '/materials']);
    expect(bottomItems(true).map((n) => n.to)).toEqual(['/', '/wand', '/spells', '/run']);
  });
});
