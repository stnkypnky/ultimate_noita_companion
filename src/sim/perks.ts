// Perks that change what a wand's casts do. Most add a ShotEffectComponent whose `extra_modifier` gun.lua
// runs after every projectile spell (perk_list.lua → gun_extra_modifiers.lua), so the simulator only has to
// hand those names to the real gun.lua. A few are engine game effects with no Lua: their numbers come from
// the wiki (linked below) and are applied where damage is worked out.

export type PerkEffect = {
  /** gun_extra_modifiers.lua entries, added once per pickup (each pickup adds its own component). */
  mods?: string[];
  /** Only the first pickup adds the modifier (Personal Laser: later pickups strengthen the laser). */
  once?: boolean;
  /** Stacks the game allows to count. */
  maxStacks?: number;
  /** Damage multiplier per stack (an engine game effect). */
  damageMult?: number;
  /** Only while health is low (Living on the Edge). */
  lowHpOnly?: boolean;
  /** Extra critical hit chance per stack, for every projectile of a cast (an engine game effect). */
  critPerStack?: number;
  /** Part of what the perk does isn't simulated; shown as a note. */
  note?: string;
};

export const PERK_EFFECTS: Record<string, PerkEffect> = {
  LOWER_SPREAD: { mods: ['lower_spread'] },
  LASER_AIM: { mods: ['laser_aim'] },
  FAST_PROJECTILES: { mods: ['fast_projectiles'] },
  BOUNCE: { mods: ['bounce'] },
  LOW_RECOIL: { mods: ['low_recoil'] },
  EXTRA_KNOCKBACK: { mods: ['extra_knockback'] },
  PROJECTILE_HOMING_SHOOTER: { mods: ['projectile_homing_shooter', 'powerful_shot'] },
  DUPLICATE_PROJECTILE: { mods: ['duplicate_projectile'] },
  PERSONAL_LASER: { mods: ['slow_firing'], once: true, note: 'The laser itself isn’t simulated, only its slower firing.' },
  FOOD_CLOCK: { mods: ['food_clock'], note: 'Its satiation-based damage isn’t simulated.' },
  // https://noita.wiki.gg/wiki/Critical_Hit_+ : "+10% Critical Hit chance for all spells", per stack, not per projectile.
  CRITICAL_HIT: { critPerStack: 10 },
  // https://noita.wiki.gg/wiki/Glass_Cannon : 5x damage; 2 pickups give 25x. Damage multipliers share a chain of
  // three, and Glass Cannon only counts in the first two places.
  GLASS_CANNON: { damageMult: 5, maxStacks: 2 },
  // https://noita.wiki.gg/wiki/Living_on_the_Edge : 3x under 25 HP or 25% of max health; up to three stacks (27x).
  LOW_HP_DAMAGE_BOOST: { damageMult: 3, maxStacks: 3, lowHpOnly: true },
};

/** Perks picked, by id: how many times. */
export type Perks = Record<string, number>;

export const isSimPerk = (id: string) => id in PERK_EFFECTS;

const stacks = (perks: Perks | undefined, id: string) => {
  const n = Math.max(0, Math.floor(perks?.[id] ?? 0));
  const max = PERK_EFFECTS[id]?.maxStacks;
  return max ? Math.min(n, max) : n;
};

/** The extra modifiers gun.lua adds to every cast, in a stable order. */
export function shotModifiers(perks: Perks | undefined): string[] {
  const out: string[] = [];
  for (const [id, e] of Object.entries(PERK_EFFECTS)) {
    const n = stacks(perks, id);
    if (!e.mods || !n) continue;
    for (let i = 0; i < (e.once ? 1 : n); i++) out.push(...e.mods);
  }
  return out;
}

/**
 * The damage multiplier chain (wiki: Glass Cannon, Living on the Edge): at most three multipliers count. The
 * pickup order isn't known, so Glass Cannons take the first places, as they'd count only there.
 */
export function damageMultiplier(perks: Perks | undefined, lowHp = false): number {
  const glass = stacks(perks, 'GLASS_CANNON');
  const edge = lowHp ? Math.min(stacks(perks, 'LOW_HP_DAMAGE_BOOST'), 3 - glass) : 0;
  return 5 ** glass * 3 ** edge;
}

export const critBonus = (perks: Perks | undefined) => stacks(perks, 'CRITICAL_HIT') * PERK_EFFECTS.CRITICAL_HIT!.critPerStack!;

/** Which perk adds a gun_extra_modifiers.lua entry. */
const MOD_PERK = new Map(Object.entries(PERK_EFFECTS).flatMap(([id, e]) => (e.mods ?? []).map((m) => [m, id] as const)));
export const perkForModifier = (mod: string) => MOD_PERK.get(mod);

/** One perk's share of the engine-side boost, for showing where damage comes from. */
export type BoostPart = { perkId: string; mult?: number; crit?: number };

/** The engine-side part of the perks, as projectileDamage() takes it. */
export const perkBoost = (perks: Perks | undefined, lowHp = false) => {
  const parts: BoostPart[] = [];
  const glass = stacks(perks, 'GLASS_CANNON');
  if (glass) parts.push({ perkId: 'GLASS_CANNON', mult: 5 ** glass });
  const edge = lowHp ? Math.min(stacks(perks, 'LOW_HP_DAMAGE_BOOST'), 3 - glass) : 0;
  if (edge > 0) parts.push({ perkId: 'LOW_HP_DAMAGE_BOOST', mult: 3 ** edge });
  const crit = critBonus(perks);
  if (crit) parts.push({ perkId: 'CRITICAL_HIT', crit });
  return { mult: damageMultiplier(perks, lowHp), crit, parts };
};

/** Only the perks the simulator knows, with positive whole counts. */
export function simPerks(list: { id: string; count: number }[]): Perks | undefined {
  const out: Perks = {};
  for (const p of list) if (isSimPerk(p.id) && p.count > 0) out[p.id] = Math.floor(p.count);
  return Object.keys(out).length ? out : undefined;
}
