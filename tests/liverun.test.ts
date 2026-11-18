import { describe, expect, it } from 'vitest';
import { parseLiveRun } from '../src/features/live/parse.ts';
import { liveFlags } from '../src/features/live/state.ts';
import { toBuilderWand } from '../src/features/live/CurrentRun.tsx';

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
  });
});
