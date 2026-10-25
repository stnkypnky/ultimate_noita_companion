// The player in the test range: movement and levitation from the game's player_base.xml.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RangeWorld, type RangeData } from '../src/features/range/world.ts';
import { pickWandSprite } from '../src/features/range/player.ts';
import type { EntityVisual, Material, Projectile, RangeKit, Reaction } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
let data: RangeData;
let kit: RangeKit;

beforeAll(() => {
  const materials = json<Material[]>('data/materials.json');
  kit = json<RangeKit>('data/range_kit.json');
  data = {
    projectiles: json<Record<string, Projectile>>('data/projectiles.json'),
    visuals: json<Record<string, EntityVisual>>('data/visuals.json'),
    materialColor: new Map(materials.map((m) => [m.id, m.color])),
    rockDurability: materials.find((m) => m.id === 'rock_static')?.durability ?? 0,
    kit,
    materials,
    reactions: json<Reaction[]>('data/reactions.json'),
  };
});

function settle(w: RangeWorld) {
  for (let i = 0; i < 30; i++) w.step();
}

describe('player', () => {
  it('walks at the game speed', () => {
    const w = new RangeWorld(data);
    settle(w);
    const x0 = w.player.x;
    w.controls.right = true;
    for (let i = 0; i < 60; i++) w.step();
    // velocity_max_x 57 px/s, eased in by accel_x
    expect(w.player.x - x0).toBeGreaterThan(40);
    expect(w.player.x - x0).toBeLessThanOrEqual(57);
    expect(w.body.anim).toBe('walk');
  });

  it('levitates for fly_time_max seconds, then falls', () => {
    const w = new RangeWorld(data);
    settle(w);
    const ground = w.player.y;
    w.controls.up = true;
    let flyingFrames = 0;
    let peak = ground;
    // Fly until the bar runs dry.
    for (let i = 0; i < 400 && !w.body.flyExhausted; i++) {
      w.step();
      if (w.body.flying) flyingFrames++;
      peak = Math.min(peak, w.player.y);
    }
    expect(flyingFrames / 60).toBeCloseTo(kit.player.flight.timeMax, 1);
    expect(w.body.flyEnergy).toBe(0);
    expect(peak).toBeLessThan(ground - 40);
    // Still holding up: no more levitation in the air, the player falls.
    for (let i = 0; i < 20; i++) w.step();
    expect(w.body.flying).toBe(false);
    expect(w.body.vy).toBeGreaterThan(0);
  });

  it('refills levitation quickly on the ground', () => {
    const w = new RangeWorld(data);
    settle(w);
    w.body.flyEnergy = 0;
    // fly_recharge_spd_ground: 6 s of flight per second
    for (let i = 0; i < 30; i++) w.step();
    expect(w.body.flyEnergy).toBeCloseTo(kit.player.flight.timeMax, 1);
  });

  it('dies at 0 HP and respawns with full health', () => {
    const w = new RangeWorld(data);
    for (let i = 0; i < 70; i++) w.step(); // spawn invincibility wears off
    w.explode(w.player.x, w.player.y - 6, 20, 500, -1);
    expect(w.body.dead).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) w.step();
    expect(w.body.dead).toBe(0);
    expect(w.body.hp).toBe(w.maxHp);
  });

  it('shoots from the tip of the wand it holds', () => {
    const w = new RangeWorld(data);
    w.wandSprite = kit.wands[0];
    w.auto = false;
    w.aim = { x: w.player.x + 100, y: w.player.y - 10 };
    settle(w);
    const { hand, tip } = w.pose;
    const len = kit.wands[0]!.tip[0] - kit.wands[0]!.grip[0];
    expect(Math.hypot(tip.x - hand.x, tip.y - hand.y)).toBeCloseTo(len, 0);
    expect(tip.x).toBeGreaterThan(w.player.x);
  });
});

describe('wand sprite', () => {
  it('picks the sprite the game would, from the wand stats', () => {
    const s = pickWandSprite(kit.wands, { shuffle: false, spellsPerCast: 1, castDelay: 10, rechargeTime: 20, manaMax: 300, manaChargeSpeed: 100, capacity: 8, spread: 0, speedMultiplier: 1 });
    expect(s).toBeDefined();
    expect(s!.shuffle).toBe(0);
    expect(s!.actionsPerRound).toBe(0);
  });
});
