import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addFound, foldSnapshot, foundKeys, isDiscovery, mergeRuns, parseRunRecord, snapshotOf, MAX_RUNS, type RunRecord } from '../src/features/live/history.ts';
import { parseLiveRun, parseLiveWand } from '../src/features/live/parse.ts';
import { chunkWorld, hiddenAreaAt } from '../src/features/map/world.ts';
import type { WorldMap } from '../src/data/types.ts';

const wand = (spells: string[]) => ({
  name: 'Wand',
  active: true,
  shuffle: false,
  spellsPerCast: 1,
  castDelay: 10,
  rechargeTime: 20,
  manaMax: 100,
  manaChargeSpeed: 50,
  capacity: 4,
  spread: 0,
  speedMultiplier: 1,
  spells: spells.map((id, slot) => ({ id, slot })),
  alwaysCasts: [],
});

const snap = (o: Record<string, unknown>) =>
  parseLiveRun({ v: 1, mod: 2, status: 'alive', seed: 42, hp: 100, maxHp: 100, gold: 0, depth: 10, biome: { id: '$biome_coalmine', name: 'Coal Pits' }, wands: [wand(['LIGHT_BULLET'])], ...o })!;

const known = (keys: string[]) => (k: string) => keys.includes(k);
const ctx = { known: known(['action_light_bullet']), device: 'PC' };

describe('run history', () => {
  it('starts a run, then records what happens in it', () => {
    let { current } = foldSnapshot(null, snap({ playtime: 5 }), 100_000, ctx);
    expect(current).toMatchObject({ id: '42-95000', seed: 42, device: 'PC', outcome: 'ongoing', startedAt: 95_000 });
    expect(current!.events.map((e) => e.k)).toEqual(['start', 'biome']);
    // The starting wand isn't a pickup, and a spell the save already knew isn't a discovery.
    expect(current!.found).toEqual([]);

    ({ current } = foldSnapshot(
      current,
      snap({
        depth: 300,
        hp: 20,
        gold: 150,
        biome: { id: '$biome_excavationsite', name: 'Coal Pits deep' },
        wands: [wand(['LIGHT_BULLET', 'BOMB']), wand([])],
        perks: [{ id: 'SHIELD', count: 1 }],
        seen: ['zombie'],
        items: [{ id: 'evil_eye', name: 'Paha silmä' }],
      }),
      140_000,
      ctx,
    ));
    const kinds = current!.events.map((e) => `${e.k}:${e.id ?? e.text ?? ''}`);
    expect(kinds).toEqual(
      expect.arrayContaining(['biome:Coal Pits deep', 'perk:SHIELD', 'spell:BOMB', 'wand:', 'item:evil_eye', 'hp_low:', 'found:action_bomb', 'found:perk_picked_shield', 'found:enemy:zombie', 'found:item:evil_eye']),
    );
    expect(current).toMatchObject({ maxDepth: 300, deepest: 'Coal Pits deep', gold: 150 });
    expect(current!.hp).toEqual([
      [100_000, 100, 100],
      [140_000, 20, 100],
    ]);
  });

  it('ends a run on death once, and starts a new one on the next life', () => {
    const first = foldSnapshot(null, snap({}), 1000, ctx).current!;
    const dead = foldSnapshot(first, snap({ status: 'dead', killedBy: 'zombie', hp: 0 }), 2000, ctx).current!;
    expect(dead).toMatchObject({ outcome: 'died', endedAt: 2000, killedBy: 'zombie' });
    // The death screen keeps writing "dead": nothing new.
    const again = foldSnapshot(dead, snap({ status: 'dead' }), 3000, ctx);
    expect(again.changed).toBe(false);
    expect(again.current).toBe(dead);
    // Same seed, alive again: a new run.
    const next = foldSnapshot(dead, snap({}), 4000, ctx);
    expect(next.current!.id).not.toBe(dead.id);
    expect(next.closed).toBeUndefined();
  });

  it('records a win, keeping the wands the ending gold took (older mod: no won flag)', () => {
    const first = foldSnapshot(null, snap({ wands: [wand(['LIGHT_BULLET', 'BOMB'])] }), 1000, ctx).current!;
    // The gold takes the wands a moment before it kills you.
    const goldTouched = foldSnapshot(first, snap({ wands: [] }), 3000, ctx).current!;
    const end = foldSnapshot(goldTouched, snap({ status: 'dead', killedBy: ' | midas', hp: 0, wands: [] }), 6000, ctx).current!;
    expect(end).toMatchObject({ outcome: 'won', endedAt: 6000 });
    expect(end.killedBy).toBeUndefined();
    expect(end.wands[0]!.spells.map((s) => s.id)).toEqual(['LIGHT_BULLET', 'BOMB']);
    expect(snapshotOf(end)).toMatchObject({ won: true });
    expect(snapshotOf(end).wands).toHaveLength(1);
    expect(end.events.at(-1)!.k).toBe('won');
    // The death screen keeps writing; nothing new, and no "died".
    expect(foldSnapshot(end, snap({ status: 'dead', killedBy: ' | midas', won: true, wands: [] }), 7000, ctx).current!.outcome).toBe('won');
  });

  it('a win reported by the mod as it begins stays one record', () => {
    const first = foldSnapshot(null, snap({}), 1000, ctx).current!;
    const begun = foldSnapshot(first, snap({ won: true, kills: 3 }), 2000, ctx).current!;
    expect(begun.outcome).toBe('won');
    const end = foldSnapshot(begun, snap({ status: 'dead', won: true, killedBy: ' | midas', kills: 4 }), 3000, ctx);
    expect(end.current!.id).toBe(first.id);
    expect(end.current).toMatchObject({ outcome: 'won', kills: 4 });
    expect(end.current!.events.filter((e) => e.k === 'won' || e.k === 'died').map((e) => e.k)).toEqual(['won']);
  });

  it('going on into New Game+ wins the run and starts a new record', () => {
    const first = foldSnapshot(null, snap({ playtime: 100, ngPlus: 0 }), 200_000, ctx).current!;
    const { current, closed } = foldSnapshot(first, snap({ playtime: 110, ngPlus: 1 }), 210_000, ctx);
    expect(closed).toMatchObject({ id: first.id, outcome: 'won', ending: 'ngplus' });
    expect(current!.id).not.toBe(first.id);
    expect(current!.ngPlus).toBe(1);
  });

  it('upgrades old records of a "death" to the gold into wins, and keeps wins past the run cap', () => {
    const dead = foldSnapshot(foldSnapshot(null, snap({}), 1000, ctx).current!, snap({ status: 'dead', killedBy: 'zombie' }), 2000, ctx).current!;
    const oldWin = { ...dead, id: 'w', startedAt: 0, killedBy: ' | midas', outcome: 'died' as const, events: [{ t: 2000, k: 'died' as const, text: ' | midas' }] };
    const parsed = parseRunRecord(JSON.parse(JSON.stringify(oldWin)), parseLiveWand, parseLiveRun)!;
    expect(parsed.outcome).toBe('won');
    expect(parsed.events.map((e) => e.k)).toEqual(['won']);
    const many = Array.from({ length: MAX_RUNS + 3 }, (_, i) => ({ ...dead, id: `r${i}`, startedAt: 1000 + i }));
    const merged = mergeRuns(many, [parsed]);
    expect(merged).toHaveLength(MAX_RUNS + 1);
    expect(merged.at(-1)!.id).toBe('w');
  });

  it('closes an unfinished run when a different seed starts; going quiet or the menu does not', () => {
    const run = foldSnapshot(null, snap({}), 1000, ctx).current!;
    expect(foldSnapshot(run, parseLiveRun({ v: 1, status: 'no_player', seed: 42 })!, 5000, ctx).changed).toBe(false);
    const { current, closed } = foldSnapshot(run, snap({ seed: 7 }), 9000, ctx);
    expect(closed).toMatchObject({ id: run.id, outcome: 'ended', endedAt: 1000 });
    expect(current!.seed).toBe(7);
  });

  it('adds discoveries once, skipping what was known and what is never hidden', () => {
    const rec = foldSnapshot(null, snap({}), 1, ctx).current!;
    expect(addFound(rec, ['action_nuke', 'action_light_bullet', 'material:water', 'material:midas', 'item:moon', 'item:potion'], 5, ctx.known)).toBe(true);
    expect(rec.found).toEqual(['action_nuke', 'material:midas', 'item:moon']);
    expect(addFound(rec, ['action_nuke'], 6, ctx.known)).toBe(false);
    expect(foundKeys([rec, { ...rec, id: 'b', found: ['enemy:zombie', 'action_nuke'] }]).sort()).toEqual(['action_nuke', 'enemy:zombie', 'item:moon', 'material:midas']);
  });

  it('counts a hidden map area you walk into as a discovery, once; its secret rooms stay secret', () => {
    expect(isDiscovery('map:lavalake')).toBe(true);
    expect(isDiscovery('map:scene:eyespot')).toBe(false);
    const first = foldSnapshot(null, snap({}), 1, { ...ctx, extra: ['map:lavalake'] }).current!;
    expect(first.found).toEqual(['map:lavalake']);
    const again = foldSnapshot(first, snap({}), 2, { ...ctx, extra: ['map:lavalake'] }).current!;
    expect(again.found).toEqual(['map:lavalake']);
    expect(again.events.filter((e) => e.k === 'found')).toHaveLength(1);
    // Known from an earlier run: not news.
    expect(foldSnapshot(null, snap({}), 1, { ...ctx, known: known(['action_light_bullet', 'map:lavalake']), extra: ['map:lavalake'] }).current!.found).toEqual([]);
    expect(parseRunRecord(JSON.parse(JSON.stringify(first)), parseLiveWand)!.found).toEqual(['map:lavalake']);
  });

  it('knows which hidden area a position is in', () => {
    const map = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/map.json'), 'utf8')) as WorldMap;
    const centre = (id: string) => {
      const i = map.cells.findIndex((k) => map.biomes[k]!.id === id);
      const w = chunkWorld(map, i % map.w, Math.floor(i / map.w));
      return [w.x + map.chunk / 2, w.y + map.chunk / 2] as const;
    };
    expect(hiddenAreaAt(map, ...centre('lavalake'))).toBe('map:lavalake');
    // The way down isn't a secret, and neither is off the map.
    expect(hiddenAreaAt(map, ...centre('coalmine'))).toBeNull();
    expect(hiddenAreaAt(map, 1e6, 0)).toBeNull();
  });

  it('accepts records from other devices only when well-formed, and merges by newest', () => {
    // What was last in hand stays on the recording device.
    const { held: _held, ...rec } = foldSnapshot(null, snap({}), 1, ctx).current!;
    const back = parseRunRecord(JSON.parse(JSON.stringify(rec)), parseLiveWand, parseLiveRun);
    expect(back).toEqual(JSON.parse(JSON.stringify(rec)));
    expect(back!.last!.wands).toHaveLength(1);
    expect(parseRunRecord({ ...rec, outcome: 'won' }, parseLiveWand)!.outcome).toBe('won');
    expect(parseRunRecord({ ...rec, outcome: 'bogus' }, parseLiveWand)).toBeNull();
    expect(parseRunRecord({ ...rec, found: ['<script>', 'enemy:zombie'] }, parseLiveWand)!.found).toEqual(['enemy:zombie']);

    const newer: RunRecord = { ...rec, updatedAt: 99, gold: 5 };
    expect(mergeRuns([rec], [newer])[0]!.gold).toBe(5);
    expect(mergeRuns([newer], [rec])[0]!.gold).toBe(5);
    const lots = Array.from({ length: 70 }, (_, i) => ({ ...rec, id: `r${i}`, startedAt: i }));
    const merged = mergeRuns([], lots);
    expect(MAX_RUNS).toBe(10);
    expect(merged).toHaveLength(MAX_RUNS);
    expect(merged[0]!.id).toBe('r69');
  });

  it('keeps the run as it last was, the death screen for a death, to show it again later', () => {
    const run = foldSnapshot(null, snap({ x: 10, y: 2000, flasks: [{ name: 'Flask', capacity: 1000, contents: [{ material: 'water', amount: 500 }] }], seen: ['zombie'] }), 1000, ctx).current!;
    expect(run.last).toMatchObject({ x: 10, y: 2000, status: 'alive' });
    expect(run.last!.seen).toBeUndefined();
    const dead = foldSnapshot(run, snap({ status: 'dead', killedBy: 'zombie', hp: 0, x: 40, y: 2600 }), 2000, ctx).current!;
    expect(snapshotOf(dead)).toMatchObject({ status: 'dead', killedBy: 'zombie', x: 40, y: 2600, hp: 0 });
    expect(snapshotOf(dead).flasks).toEqual([]);
    // Records from before snapshots were kept: rebuilt from the record, without position or flasks.
    const { last: _last, ...old } = dead;
    const rebuilt = snapshotOf(parseRunRecord(JSON.parse(JSON.stringify(old)), parseLiveWand, parseLiveRun)!);
    expect(rebuilt).toMatchObject({ status: 'dead', seed: 42, hp: 0, wands: [{ name: 'Wand' }], flasks: [] });
    expect(rebuilt.x).toBeUndefined();
    // A snapshot from another device for a different seed is not trusted.
    expect(parseRunRecord({ ...JSON.parse(JSON.stringify(dead)), last: { ...dead.last, seed: 9 } }, parseLiveWand, parseLiveRun)!.last).toBeUndefined();
  });
});
