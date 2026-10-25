// Falling sand with the game's materials and reactions.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Cells, K_GAS } from '../src/features/range/cells.ts';
import type { Material, Reaction } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
let materials: Material[];
let reactions: Reaction[];

beforeAll(() => {
  materials = json<Material[]>('data/materials.json');
  reactions = json<Reaction[]>('data/reactions.json');
});

/** A 40×30 box with rock walls and floor. */
function box() {
  const c = new Cells(40, 30, materials, reactions);
  const rock = c.index('rock_static');
  for (let x = 0; x < 40; x++) c.set(x, 29, rock);
  for (let y = 0; y < 30; y++) {
    c.set(0, y, rock);
    c.set(39, y, rock);
  }
  return c;
}
const run = (c: Cells, n: number) => {
  for (let i = 0; i < n; i++) c.step();
};
const count = (c: Cells, id: string) => c.mat.reduce((n, m) => n + (m === c.index(id) ? 1 : 0), 0);
const rowOf = (c: Cells, id: string) => {
  const m = c.index(id);
  let top = Infinity;
  for (let i = 0; i < c.mat.length; i++) if (c.mat[i] === m) top = Math.min(top, Math.floor(i / c.w));
  return top;
};

describe('cells', () => {
  it('water falls and levels out across the floor', () => {
    const c = box();
    const water = c.index('water');
    for (let y = 2; y < 12; y++) for (let x = 18; x < 22; x++) c.set(x, y, water);
    run(c, 400);
    expect(count(c, 'water')).toBe(40);
    // 40 cells over a 38-wide floor: one or two rows deep.
    expect(rowOf(c, 'water')).toBeGreaterThanOrEqual(27);
  });

  it('sand piles up instead of flowing flat', () => {
    const c = box();
    const sand = c.index('sand');
    for (let y = 2; y < 12; y++) for (let x = 18; x < 22; x++) c.set(x, y, sand);
    run(c, 300);
    expect(rowOf(c, 'sand')).toBeLessThan(27);
  });

  it('oil floats on water', () => {
    const c = box();
    for (let y = 20; y < 24; y++) for (let x = 10; x < 30; x++) c.set(x, y, c.index('oil'));
    for (let y = 10; y < 14; y++) for (let x = 10; x < 30; x++) c.set(x, y, c.index('water'));
    run(c, 600);
    expect(rowOf(c, 'oil')).toBeLessThan(rowOf(c, 'water'));
  });

  it('lava meets water: rock and steam, by the game reaction', () => {
    const c = box();
    for (let x = 1; x < 39; x++) c.set(x, 28, c.index('lava'));
    for (let x = 1; x < 39; x++) c.set(x, 27, c.index('water'));
    run(c, 60);
    expect(count(c, 'steam') + count(c, 'rock_static')).toBeGreaterThan(110);
  });

  it('fire sets oil alight and it burns away', () => {
    const c = box();
    for (let y = 25; y < 29; y++) for (let x = 1; x < 39; x++) c.set(x, y, c.index('oil'));
    const before = count(c, 'oil');
    for (let x = 18; x < 23; x++) c.set(x, 24, c.index('fire'));
    run(c, 900);
    expect(count(c, 'oil')).toBeLessThan(before * 0.5);
  });

  it('gases rise and fade after their lifetime', () => {
    const c = box();
    c.set(20, 25, c.index('smoke'));
    run(c, 5);
    expect(c.mats[c.mat.find((m) => m === c.index('smoke')) ?? 0]?.kind).toBe(K_GAS);
    expect(rowOf(c, 'smoke')).toBeLessThan(25);
    run(c, 400);
    expect(count(c, 'smoke')).toBe(0);
  });

  it('goes quiet once everything has settled', () => {
    const c = box();
    for (let y = 2; y < 6; y++) for (let x = 18; x < 22; x++) c.set(x, y, c.index('sand'));
    run(c, 300);
    expect(c.busy).toBe(false);
  });

  it('digging respects material durability and never touches the border', () => {
    const c = box();
    const hard = c.addHard('test_bedrock', 'rock_hard_border');
    c.set(5, 5, hard);
    for (let x = 6; x < 10; x++) c.set(x, 5, c.index('rock_static'));
    expect(c.carve(7, 5, 4, 100, 9)).toBe(0);
    expect(c.carve(7, 5, 4, 100, 10)).toBe(4);
    expect(c.at(5, 5)).toBe(hard);
  });
});
