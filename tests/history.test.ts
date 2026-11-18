import { describe, expect, it } from 'vitest';
import { addFound, foldSnapshot, foundKeys, mergeRuns, parseRunRecord, snapshotOf, MAX_RUNS, type RunRecord } from '../src/features/live/history.ts';
import { parseLiveRun, parseLiveWand } from '../src/features/live/parse.ts';

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

  it('accepts records from other devices only when well-formed, and merges by newest', () => {
    const rec = foldSnapshot(null, snap({}), 1, ctx).current!;
    const back = parseRunRecord(JSON.parse(JSON.stringify(rec)), parseLiveWand, parseLiveRun);
    expect(back).toEqual(JSON.parse(JSON.stringify(rec)));
    expect(back!.last!.wands).toHaveLength(1);
    expect(parseRunRecord({ ...rec, outcome: 'won' }, parseLiveWand)).toBeNull();
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
