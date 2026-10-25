// Mina in the test range: movement and levitation from player_base.xml, the arm and wand she aims with,
// and the game's own choice of wand sprite.
import type { RangeKit, WandSprite } from '@/data/types';
import type { SimWand } from '@/sim/types';

export type Controls = { left: boolean; right: boolean; up: boolean };

/** What the player is doing, for the HUD and the sprite. */
export type PlayerState = {
  vx: number;
  vy: number;
  grounded: boolean;
  flying: boolean;
  /** Levitation left, seconds (the HUD's flying bar). */
  flyEnergy: number;
  /** Ran dry: no levitation until the feet touch ground. */
  flyExhausted: boolean;
  framesSinceFly: number;
  upHeld: boolean;
  anim: string;
  animTime: number;
  hp: number;
  /** Frames of invincibility left (DamageModelComponent invincibility_frames, at spawn). */
  invincible: number;
  dead: number;
};

export const SPAWN_INVINCIBILITY = 60;

/** Fallbacks matching player_base.xml, for worlds built without the extracted kit (unit tests). */
export const DEFAULT_MOVE: RangeKit['player']['move'] = {
  runVelocity: 154,
  accelX: 0.15,
  gravity: 350,
  jumpVelocityY: -95,
  jumpVelocityX: 56,
  velocityMinX: -57,
  velocityMaxX: 57,
  velocityMinY: -200,
  velocityMaxY: 350,
  flyVelocityX: 52,
  flySpeedMaxUp: 95,
  flySpeedMaxDown: 85,
  flySpeedMult: 20,
  flySpeedChangeSpd: 0.25,
  climbOverY: 4,
};
export const DEFAULT_FLIGHT: RangeKit['player']['flight'] = { timeMax: 3, rechargeAir: 0.4, rechargeGround: 6, airWaitFrames: 38, needsRecharge: true };

export function newPlayerState(flight: RangeKit['player']['flight'], hp: number): PlayerState {
  return {
    vx: 0,
    vy: 0,
    grounded: true,
    flying: false,
    flyEnergy: flight.timeMax,
    flyExhausted: false,
    framesSinceFly: 999,
    upHeld: false,
    anim: 'stand',
    animTime: 0,
    hp,
    invincible: SPAWN_INVINCIBILITY,
    dead: 0,
  };
}

/** Terrain the body collides with: true where a cell is solid. */
export type Solid = (x: number, y: number) => boolean;

/** Half-width and height of the body's terrain box (CharacterDataComponent collision_aabb, rounded). */
const HALF_W = 2;
const BODY_H = 7;

const blocked = (solid: Solid, x: number, feet: number) => {
  for (let yy = feet - BODY_H; yy < feet; yy++) for (let xx = x - HALF_W; xx < x + HALF_W; xx++) if (solid(xx, yy)) return true;
  return false;
};
const onGround = (solid: Solid, x: number, feet: number) => {
  for (let xx = x - HALF_W; xx < x + HALF_W; xx++) if (solid(xx, feet)) return true;
  return false;
};

/**
 * One frame of CharacterPlatformingComponent-style movement. Positions are the feet; returns the new ones.
 * Walking and air control ease toward their top speeds by accel_x / fly_speed_change_spd each frame;
 * levitation burns fly_time_max seconds and refills fast on ground, slowly in the air after a pause.
 */
export function stepPlayer(
  s: PlayerState,
  pos: { x: number; y: number },
  c: Controls,
  move: RangeKit['player']['move'],
  flight: RangeKit['player']['flight'],
  solid: Solid,
  dt: number,
): { x: number; y: number } {
  let { x, y } = pos;
  const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  s.grounded = onGround(solid, x, y);

  // Horizontal: walk on ground, slower drift in the air. Knocked faster than that (recoil, blasts),
  // the player slides back down to walking speed instead of stopping dead.
  const top = s.grounded ? move.velocityMaxX : move.flyVelocityX;
  if (s.vx > move.velocityMaxX || s.vx < move.velocityMinX) {
    s.vx *= s.grounded ? 0.85 : 0.97;
  } else {
    s.vx += (dir * top - s.vx) * move.accelX;
    s.vx = Math.max(move.velocityMinX, Math.min(move.velocityMaxX, s.vx)) || 0;
  }

  // Vertical: jump on the press, then levitate while held.
  const pressed = c.up && !s.upHeld;
  s.upHeld = c.up;
  s.flying = false;
  if (pressed && s.grounded) {
    s.vy = move.jumpVelocityY;
  } else if (c.up && s.flyEnergy > 0 && !s.flyExhausted) {
    // Held through a landing, levitation lifts straight off again.
    s.flying = true;
    s.vy += (-move.flySpeedMaxUp - s.vy) * move.flySpeedChangeSpd;
    s.flyEnergy = Math.max(0, s.flyEnergy - dt);
    s.framesSinceFly = 0;
    if (s.flyEnergy === 0 && flight.needsRecharge) s.flyExhausted = true;
  }
  if (!s.flying) {
    s.vy = Math.min(move.velocityMaxY, s.vy + move.gravity * dt);
    s.framesSinceFly++;
  }
  s.vy = Math.max(move.velocityMinY, s.vy);

  // Refill: quickly on ground, slowly in the air once levitation has rested.
  if (s.grounded) {
    s.flyEnergy = Math.min(flight.timeMax, s.flyEnergy + flight.rechargeGround * dt);
    s.flyExhausted = false;
  } else if (s.framesSinceFly > flight.airWaitFrames) {
    s.flyEnergy = Math.min(flight.timeMax, s.flyEnergy + flight.rechargeAir * dt);
  }

  // Move a pixel at a time; step up small ledges (climb_over_y) while walking.
  const nx = Math.round(Math.abs(s.vx * dt) * 4) / 4;
  let remaining = nx;
  const sx = Math.sign(s.vx);
  while (remaining > 0) {
    const step = Math.min(1, remaining);
    remaining -= step;
    const tx = x + sx * step;
    if (!blocked(solid, tx, y)) {
      x = tx;
      continue;
    }
    let climbed = false;
    for (let up = 1; up <= move.climbOverY && s.grounded; up++) {
      if (!blocked(solid, tx, y - up)) {
        x = tx;
        y -= up;
        climbed = true;
        break;
      }
    }
    if (!climbed) {
      s.vx = 0;
      break;
    }
  }
  remaining = Math.abs(s.vy * dt);
  const sy = Math.sign(s.vy);
  while (remaining > 0) {
    const step = Math.min(1, remaining);
    remaining -= step;
    // Falling stops on the row under the feet; rising stops when the head would enter rock.
    if (sy > 0 ? onGround(solid, x, Math.floor(y)) : blocked(solid, x, y - step)) {
      s.vy = 0;
      if (sy > 0) y = Math.floor(y);
      break;
    }
    y += sy * step;
  }
  s.grounded = onGround(solid, x, y);
  if (s.grounded && s.vy > 0) s.vy = 0;

  // Animation
  const anim = s.grounded
    ? Math.abs(s.vx) > 6
      ? 'walk'
      : 'stand'
    : s.flying
      ? Math.abs(s.vx) > 6
        ? 'fly_move'
        : 'fly_idle'
      : s.vy < 0
        ? 'jump_up'
        : 'jump_fall';
  if (anim !== s.anim) {
    s.anim = anim;
    s.animTime = 0;
  } else {
    s.animTime += dt;
  }
  if (s.invincible > 0) s.invincible--;
  return { x, y };
}

/** Frame index of the current animation. */
export function animFrame(kit: RangeKit, s: PlayerState) {
  const a = kit.player.anims[s.anim] ?? kit.player.anims.stand!;
  const i = Math.floor(s.animTime / a.wait);
  return { anim: a, index: a.loop ? i % a.count : Math.min(i, a.count - 1) };
}

/** Where the wand is held and where its tip is, for a player at `feet` facing `facing` and aiming along `angle`. */
export function wandPose(kit: RangeKit | undefined, s: PlayerState, feet: { x: number; y: number }, facing: number, angle: number, wand: WandSprite | undefined) {
  const k = kit?.player;
  const pivot = k?.pivot ?? [6, 14];
  const entity = { x: feet.x, y: feet.y - ((k?.feet ?? 17) - pivot[1]) };
  let armRoot = { x: entity.x - facing * 3, y: entity.y - 7 };
  if (kit) {
    const { anim, index } = animFrame(kit, s);
    const [hx, hy] = anim.arm[index] ?? anim.arm[0]!;
    armRoot = { x: entity.x + facing * (hx + 0.5 - pivot[0]), y: entity.y + hy + 0.5 - pivot[1] };
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const flip = facing < 0 ? -1 : 1;
  // Arm-local and wand-local points rotate with the aim; facing left mirrors them vertically.
  const local = (lx: number, ly: number, from: { x: number; y: number }) => ({ x: from.x + lx * cos - ly * flip * sin, y: from.y + lx * sin + ly * flip * cos });
  const armHand = kit ? [kit.arm.hand[0] - kit.arm.ox, kit.arm.hand[1] - kit.arm.oy] : [4, 0];
  const hand = local(armHand[0]!, armHand[1]!, armRoot);
  const tip = wand ? local(wand.tip[0] - wand.grip[0], wand.tip[1] - wand.grip[1], hand) : local(10, 0, hand);
  return { entity, armRoot, hand, tip, flip };
}

/**
 * The sprite the game would give a wand with these stats: GetWand() from gun_procedural.lua scores every
 * sprite against the stats mapped into the table's scale. Ties are broken by `variant` (the game rolls).
 */
export function pickWandSprite(wands: WandSprite[], w: SimWand, variant = 0): WandSprite | undefined {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const g = {
    fireRateWait: clamp((w.castDelay + 5) / 7 - 1, 0, 4),
    actionsPerRound: clamp(w.spellsPerCast - 1, 0, 2),
    shuffle: clamp(w.shuffle ? 1 : 0, 0, 1),
    deckCapacity: clamp((w.capacity - 3) / 3, 0, 7),
    spreadDegrees: clamp((w.spread + 5) / 5 - 1, 0, 2),
    reloadTime: clamp((w.rechargeTime + 5) / 25 - 1, 0, 2),
  };
  const score = (s: WandSprite) =>
    Math.abs(g.fireRateWait - s.fireRateWait) * 2 +
    Math.abs(g.actionsPerRound - s.actionsPerRound) * 20 +
    Math.abs(g.shuffle - s.shuffle) * 30 +
    Math.abs(g.deckCapacity - s.deckCapacity) * 5 +
    Math.abs(g.spreadDegrees - s.spreadDegrees) +
    Math.abs(g.reloadTime - s.reloadTime);
  let best = Infinity;
  let picks: WandSprite[] = [];
  for (const s of wands) {
    const sc = score(s);
    if (sc < best - 1e-9) {
      best = sc;
      picks = [s];
    } else if (Math.abs(sc - best) < 1e-9) {
      picks.push(s);
    }
  }
  return picks.length ? picks[((variant % picks.length) + picks.length) % picks.length] : undefined;
}
