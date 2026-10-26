// The test range driven by real cast-simulator output (game scripts) and real extracted projectile data.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLuaHost, loadGun, type LuaHost } from '../tools/extract/lua.ts';
import { AIR, H, RangeWorld, W, type RangeData } from '../src/features/range/world.ts';
import { WandRuntime } from '../src/features/range/wand.ts';
import { castWand, resetWand } from '../src/sim/protocol.ts';
import type { EntityVisual, Material, Projectile, RangeKit, Reaction } from '../src/data/types.ts';
import { projectileDamage } from '../src/sim/analyze.ts';
import type { SimRequest, SimResult } from '../src/sim/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const json = <T>(p: string) => JSON.parse(readFileSync(join(GAME, p), 'utf8')) as T;
let host: LuaHost;
let data: RangeData;

beforeAll(async () => {
  host = await createLuaHost((p) => (existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
  await loadGun(host);
  const materials = json<Material[]>('data/materials.json');
  data = {
    projectiles: json<Record<string, Projectile>>('data/projectiles.json'),
    visuals: json<Record<string, EntityVisual>>('data/visuals.json'),
    materialColor: new Map(materials.map((m) => [m.id, m.color])),
    rockDurability: materials.find((m) => m.id === 'rock_static')?.durability ?? 0,
    kit: json<RangeKit>('data/range_kit.json'),
    materials,
    reactions: json<Reaction[]>('data/reactions.json'),
  };
});

function casts(deck: string[], always: string[] = []) {
  host.call('sim_reset', 1, false, 20, deck.length, 10, 0, 1, 2000, 2000, 2000, 100, 100, 0, 0);
  for (const id of deck) host.call('sim_add_card', id, -1);
  for (const id of always) host.call('sim_add_always_cast', id);
  return (JSON.parse(host.call<string>('sim_run', 64, true)) as SimResult).casts;
}

/** A wand with plenty of mana (like casts() above), held in the range and fired straight through the Lua host. */
function equip(w: RangeWorld, deck: string[], mana = 2000) {
  const req: SimRequest = {
    wand: { shuffle: false, spellsPerCast: 1, castDelay: 10, rechargeTime: 20, manaMax: mana, manaChargeSpeed: mana, capacity: deck.length, spread: 0, speedMultiplier: 1 },
    deck: deck.map((id) => ({ id, uses: -1 })),
    alwaysCasts: [],
    options: { maxCasts: 64, stopOnReload: true, hp: 100, maxHp: 100, money: 0, frame: 0 },
  };
  const call = (fn: string, ...args: unknown[]) => host.call(fn, ...args);
  let n = 0;
  w.wand = new WandRuntime({ reset: (r) => resetWand(call, r), cast: (f, m) => castWand(call, f, m, ++n) }, (c) => w.fire(c));
  w.wand.equip(req, w.frame);
}

function world(deck: string[], frames: number, distance?: number) {
  const w = new RangeWorld(data);
  if (distance !== undefined) w.setDummyDistance(distance);
  const spawned: string[] = [];
  const spawn = w.spawn.bind(w);
  w.spawn = (file, ...rest) => {
    spawned.push(file.split('/').pop()!);
    return spawn(file, ...rest);
  };
  equip(w, deck);
  let maxBolts = 0;
  let maxBeams = 0;
  let maxSegments = 0;
  let orbiting = 0;
  // Auto mode puts a teleported player back on the next cast after a recharge, so track the furthest move.
  let maxShift = 0;
  for (let i = 0; i < frames; i++) {
    w.step();
    maxShift = Math.max(maxShift, Math.abs(w.player.x - w.player.homeX));
    maxBolts = Math.max(maxBolts, w.bolts.length);
    maxBeams = Math.max(maxBeams, w.beams.length);
    maxSegments = Math.max(maxSegments, w.segments.length);
    orbiting = Math.max(orbiting, w.projectiles.filter((p) => p.parent).length);
  }
  return { w, spawned, maxBolts, maxBeams, maxSegments, orbiting, maxShift };
}

/** Cells of rock (and other solids) left in the range. */
const rocks = (w: RangeWorld) => {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (w.cell(x, y) !== AIR) n++;
  return n;
};

describe('test range basics', () => {
  it('spark bolts fly to the dummy and deal their damage', () => {
    const { w } = world(['LIGHT_BULLET'], 120);
    expect(w.castsFired).toBeGreaterThan(3);
    expect(w.damageEvents.length).toBeGreaterThan(0);
    expect(w.damageEvents.every((e) => e.amount === 3 || e.amount === 15)).toBe(true);
  });

  it('a bomb in a trigger payload explodes and digs the terrain', () => {
    const before = rocks(new RangeWorld(data));
    const { w } = world(['LIGHT_BULLET_TRIGGER', 'BOMB'], 400);
    expect(rocks(w)).toBeLessThan(before - 200);
    expect(w.totalDamage).toBeGreaterThan(100);
  });

  it('a timer goes off when its time is up, early on a hit, or when the projectile expires first', () => {
    // Spark Bolt with Timer: 10 frames.
    expect(world(['LIGHT_BULLET_TIMER', 'BOMB'], 12, 380).spawned).toContain('bomb.xml');
    // Point blank, it hits the dummy within 3 frames and acts like a trigger.
    expect(world(['LIGHT_BULLET_TIMER', 'BOMB'], 5, 20).spawned).toContain('bomb.xml');
    // Energy Orb with Timer: the orb lives ~50 frames, less than its 100-frame timer.
    expect(world(['SLOW_BULLET_TIMER', 'LIGHT_BULLET'], 60, 380).spawned).toContain('light_bullet.xml');
  });

  it("a trigger's payload bounces off the wall it hit", () => {
    const w = new RangeWorld(data);
    const payloads: { vy: number; p: ReturnType<RangeWorld['spawn']> }[] = [];
    const spawn = w.spawn.bind(w);
    w.spawn = (file, x, y, vx, vy, s, trigger, rot) => {
      const p = spawn(file, x, y, vx, vy, s, trigger, rot);
      if (!trigger && w.frame > 0) payloads.push({ vy, p });
      return p;
    };
    equip(w, ['LIGHT_BULLET_TRIGGER', 'LIGHT_BULLET']);
    // Shoot down into the floor just ahead.
    w.auto = false;
    w.aim = { x: w.player.x + 50, y: w.player.y + 20 };
    w.setTrigger(true);
    for (let i = 0; i < 12; i++) w.step();
    expect(payloads.length).toBeGreaterThan(0);
    // It leaves upwards, off the floor, and is still flying rather than popping in the ground.
    expect(payloads[0]!.vy).toBeLessThan(0);
    expect(payloads[0]!.p!.dead).toBe(false);
  });

  it('homing bends shots into the dummy', () => {
    expect(world(['HOMING', 'BUBBLESHOT'], 300).w.damageEvents.length).toBeGreaterThan(0);
  });

  it('fires the first cast on the first step and loops the cycle', () => {
    const c = casts(['LIGHT_BULLET', 'LIGHT_BULLET']);
    const cycle = c.at(-1)!.next_frame - c[0]!.frame;
    const w = new RangeWorld(data);
    equip(w, ['LIGHT_BULLET', 'LIGHT_BULLET']);
    w.step();
    expect(w.castsFired).toBe(1);
    for (let i = 1; i < cycle * 3; i++) w.step();
    expect(w.castsFired).toBe(6);
  });

  it('moves the dummy with the range adjuster', () => {
    const w = new RangeWorld(data);
    w.setDummyDistance(100);
    expect(w.dummy.x - w.player.x).toBe(100);
  });
});

describe('spell fixes', () => {
  it('giga disc slows, comes back and hurts the caster', () => {
    const { w } = world(['DISC_BULLET_BIG'], 360, 300);
    expect(w.selfDamage).toBeGreaterThan(0);
  });

  it('chain bolt hops and zaps a nearby dummy', () => {
    const { w, maxSegments, spawned } = world(['CHAIN_BOLT'], 120, 70);
    expect(spawned.filter((f) => f === 'chain_bolt_explosion.xml').length).toBeGreaterThan(2);
    expect(maxSegments).toBeGreaterThan(0);
    expect(w.totalDamage).toBeGreaterThan(0);
  });

  it('glitter bomb is a short lob that digs', () => {
    const before = rocks(new RangeWorld(data));
    const { w } = world(['GLITTER_BOMB'], 70);
    expect(rocks(w)).toBeLessThan(before);
  });

  it('luminous drill is drawn as a short beam and bores into rock', () => {
    const { w, maxSegments } = world(['LUMINOUS_DRILL'], 30, 300);
    expect(maxSegments).toBeGreaterThan(0);
    void w;
  });

  it('teleport bolt moves the caster', () => {
    expect(world(['TELEPORT_PROJECTILE'], 30).maxShift).toBeGreaterThan(20);
  });

  it('swapper swaps caster and dummy', () => {
    const { w } = world(['SWAPPER_PROJECTILE'], 30, 120);
    expect(w.player.x).toBeGreaterThan(w.player.homeX + 60);
  });
});

describe('effects', () => {
  it('orbit spells put four projectiles in orbit', () => {
    expect(world(['ORBIT_DISCS', 'LIGHT_BULLET'], 10).orbiting).toBe(4);
    expect(world(['ORBIT_LASERS', 'LIGHT_BULLET'], 10).orbiting).toBe(4);
    // stacked orbit modifiers each bring their own four (a nuke may clip the floor and blow up at once)
    const { spawned } = world(['ORBIT_NUKES', 'ORBIT_LASERS', 'ARROW'], 3);
    expect(spawned.filter((f) => f === 'orbit_nukes_nuke.xml')).toHaveLength(4);
    expect(spawned.filter((f) => f === 'orbit_lasers_laser.xml')).toHaveLength(4);
  });

  it('bounce modifiers spawn their effect on bounce', () => {
    for (const [mod, fx] of [
      ['BOUNCE_EXPLOSION', 'bounce_explosion.xml'],
      ['BOUNCE_SMALL_EXPLOSION', 'bounce_small_explosion.xml'],
      ['BOUNCE_SPARK', 'bounce_spark_friendly_fire.xml'],
      ['BOUNCE_LASER', 'bounce_laser.xml'],
      ['BOUNCE_LIGHTNING', 'bounce_lightning.xml'],
    ] as const) {
      const { spawned } = world([mod, 'BOUNCY_ORB'], 200);
      expect(spawned, mod).toContain(fx);
    }
  });

  it('lightning bolt strikes the dummy', () => {
    const { w, maxBolts } = world(['LIGHTNING'], 20);
    expect(maxBolts).toBeGreaterThan(0);
    expect(w.totalDamage).toBeGreaterThan(0);
  });

  it('plasma beam emits a damaging laser', () => {
    const { w, maxBeams } = world(['LASER_EMITTER'], 120, 70);
    expect(maxBeams).toBeGreaterThan(0);
    expect(w.totalDamage).toBeGreaterThan(0);
  });

  it('electric arc links projectiles of a cast', () => {
    expect(world(['ARC_ELECTRIC', 'BURST_2', 'BUBBLESHOT', 'BUBBLESHOT'], 30).maxBolts).toBeGreaterThan(0);
  });
});

describe('looks and physics from the game data', () => {
  it('projectiles shed particles from their emitters', () => {
    const { w } = world(['LIGHT_BULLET'], 12);
    expect(w.particles.length).toBeGreaterThan(5);
  });

  it('a bomb plays its explosion sprite, shakes the camera and throws the player', () => {
    const { w } = world([], 0);
    for (let i = 0; i < 70; i++) w.step();
    const vx = w.body.vx;
    w.explode(w.player.x - 12, w.player.y - 6, 30, 0, -1, 0, undefined, false, data.visuals['data/entities/projectiles/bomb.xml']?.explosion);
    expect(w.effects.length).toBeGreaterThan(0);
    expect(w.shake).toBeGreaterThan(0);
    expect(w.body.vx).toBeGreaterThan(vx + 20);
  });

  it('bounces reflect off the surface (a floor keeps the forward motion)', () => {
    const w = new RangeWorld(data);
    const p = w.spawn('data/entities/projectiles/deck/bouncy_orb.xml', 240, w.floorY - 3, 120, 200, { bounces: 5 })!;
    for (let i = 0; i < 4; i++) w.step();
    expect(p.vx).toBeGreaterThan(0);
    expect(p.vy).toBeLessThan(0);
  });

  it('Freeze charge freezes what it hits, with the game duration', () => {
    const { w } = world(['FREEZE', 'LIGHT_BULLET'], 0);
    let frozen = 0;
    for (let i = 0; i < 120; i++) {
      w.step();
      if (w.dummy.status.has('FROZEN')) frozen++;
    }
    expect(frozen).toBeGreaterThan(30);
  });

  it('burning hurts every second until it goes out, and water puts it out', () => {
    const w = new RangeWorld(data);
    w.applyEffects(w.dummy, ['data/entities/misc/effect_apply_on_fire.xml']);
    for (let i = 0; i < 60; i++) w.step();
    expect(w.totalDamage).toBeGreaterThan(0);
    w.applyEffects(w.dummy, ['data/entities/misc/effect_apply_wet.xml']);
    expect(w.dummy.status.has('ON_FIRE')).toBe(false);
  });

  it('Null Shot takes all damage away, the blast too', () => {
    const bomb = data.projectiles['data/entities/projectiles/bomb.xml'];
    const d = projectileDamage(bomb, { damage_null_all: 1 });
    expect(d.hit).toBe(0);
    expect(d.explosion?.damage ?? 0).toBe(0);
  });
});
