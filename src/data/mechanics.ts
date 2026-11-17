// Hidden mechanics: things the game never tells you, curated from noita.wiki.gg (each note links its page).
// Game-file facts (speed-scaled damage, fuses, throw strength...) are added automatically in
// src/ui/HiddenMechanics.tsx; these are the tricks that only show up in play.

export type MechanicKind = 'spell' | 'item' | 'material' | 'perk';

export type MechanicNote = {
  text: string;
  /** noita.wiki.gg page it comes from. */
  source: string;
  /** Late-game secret: shown only after a deliberate tap. */
  secret?: boolean;
};

const WIKI = 'https://noita.wiki.gg/wiki/';

export const MECHANICS: Record<`${MechanicKind}:${string}`, MechanicNote[]> = {
  // ── Spells ──────────────────────────────────────────────────────────────────────────────
  'spell:RUBBER_BALL': [
    {
      text: 'Slow it down at the start and let it speed up: Accelerating Shot (×0.32 start speed, then accelerates) and Heavy Shot (×0.3 speed, +43.75 damage) both raise the speed bonus. Together they make one of the strongest damage builds. Up to four Accelerating Shots still leave it above its 5 px/s limit.',
      source: `${WIKI}Bouncing_Burst`,
    },
    {
      text: 'The speed bonus is worked out on impact, so Spells to Power can’t absorb it. But damage it absorbs from other spells does get multiplied by the speed bonus.',
      source: `${WIKI}Bouncing_Burst`,
    },
    { text: 'Gravity or Anti-Gravity stops a slow-started ball from fizzling. Anti-Gravity gives more damage than Gravity.', source: `${WIKI}Bouncing_Burst` },
    { text: 'It lives for over 12 seconds, so trail modifiers get a lot out of it.', source: `${WIKI}Bouncing_Burst` },
  ],
  'spell:BOUNCY_ORB': [
    { text: 'Only its 5 Projectile damage scales with speed. The 5 Slice damage doesn’t.', source: `${WIKI}Energy_Sphere` },
    { text: 'Two Accelerating Shots are the most it takes: 400 × 0.32² ≈ 41 px/s, still above its 20 px/s limit.', source: `${WIKI}Energy_Sphere` },
    { text: 'Its final impact makes a tiny digging blast that doesn’t damage you or enemies.', source: `${WIKI}Energy_Sphere` },
    { text: 'It sets Recoil to 20 whatever comes before it. Put Recoil Dampers after it.', source: `${WIKI}Energy_Sphere` },
  ],
  'spell:ARROW': [
    { text: 'It has 0 Projectile damage, so its speed scaling does nothing until you add damage (Damage Plus, Heavy Shot).', source: `${WIKI}Arrow` },
    { text: 'Arrows stuck in terrain grow Plant Material at the base, which turns to Soil once no air surrounds it.', source: `${WIKI}Arrow` },
    { text: 'It sets Recoil to 30 rather than adding to it, so put it after other recoil spells.', source: `${WIKI}Arrow` },
  ],
  'spell:DISC_BULLET': [
    { text: 'It has no Projectile damage. Its 20 Slice doesn’t scale with speed, so add damage (Damage Plus, Heavy Shot) to use the speed bonus.', source: `${WIKI}Disc_Projectile` },
    { text: 'It can hit you. Remove Bounce or the Projectile Repulsion Field perk makes it much safer.', source: `${WIKI}Disc_Projectile` },
  ],
  'spell:ACCELERATING_SHOT': [
    { text: 'Projectiles start at ×0.32 speed, then speed up (air friction −3) up to terminal velocity, usually 1000 px/s.', source: `${WIKI}Accelerating_Shot` },
    {
      text: 'It does nothing on the first frame, so it can’t save a projectile that starts below its low-speed limit. For speed-scaled spells (Bouncing Burst, Energy Sphere, Arrow, Disc) it raises the damage bonus.',
      source: `${WIKI}Accelerating_Shot`,
    },
    { text: 'Speed modifiers are order-sensitive. Stack too many slowdowns and the multiplier can reach zero, which blocks every later speed change.', source: `${WIKI}Accelerating_Shot` },
  ],
  'spell:HEAVY_SHOT': [
    { text: '×0.3 speed and +43.75 Projectile damage. On speed-scaled spells, that damage is multiplied by the speed bonus.', source: `${WIKI}Heavy_Shot` },
    { text: 'Too many copies make the projectile die of low speed before it reaches anything.', source: `${WIKI}Heavy_Shot` },
    { text: 'Each projectile of a multi-shot spell gets the damage, so it multiplies on spells like Triplicate Bolt.', source: `${WIKI}Heavy_Shot` },
  ],
  'spell:CHAINSAW': [
    {
      text: 'It sets cast delay to 0 when cast, wiping out everything before it, including the wand’s own negative delay. Delay added after it still counts.',
      source: `${WIKI}Chainsaw`,
    },
    { text: 'Cast delay changes inside a trigger are ignored, so it has to sit outside any trigger to reset the delay.', source: `${WIKI}Chainsaw` },
    { text: 'It also cuts recharge time by 0.17 s for 1 mana, which makes it nearly free to add.', source: `${WIKI}Chainsaw` },
  ],
  'spell:BOMB': [
    { text: 'It’s round, so it rolls downhill away from where you put it.', source: `${WIKI}Bomb` },
    { text: 'Kick it to get it up to ceilings and flying enemies its blast would otherwise miss.', source: `${WIKI}Bomb` },
    { text: 'It counts as a projectile, so modifiers like Homing steer it.', source: `${WIKI}Bomb` },
  ],
  'spell:DYNAMITE': [
    { text: 'Homing makes it chase enemies, but it tends to overshoot.', source: `${WIKI}Dynamite` },
    { text: 'With Bombs Materialized you can hold it as an item and throw it by hand.', source: `${WIKI}Dynamite` },
  ],
  'spell:GLITTER_BOMB': [
    { text: 'Its glitter shards drift down and pop for 12.5 explosion damage each. Kills by the shards count as trick kills, which pay more gold.', source: `${WIKI}Glitter_Bomb` },
    { text: 'Its blast is much smaller than Bomb’s, so it’s poor for digging.', source: `${WIKI}Glitter_Bomb` },
    { text: 'The Hungry Ghost perk eats the glitter to boost its damage.', source: `${WIKI}Glitter_Bomb` },
  ],
  'spell:LIGHTNING': [
    { text: 'It electrifies water and other conductive liquids. Anything standing in them gets shocked and stunned, which can kill you if you’re in the pool.', source: `${WIKI}Lightning_Bolt` },
    { text: 'Fired at your feet, its blast hurts you too.', source: `${WIKI}Lightning_Bolt` },
  ],
  'spell:SPELLS_TO_POWER': [
    {
      text: 'Speed bonuses (Bouncing Burst, Energy Sphere, Arrow, Disc) are worked out on impact, so it can’t absorb them. Put it before one of those spells and the damage it absorbs gets the speed bonus too.',
      source: `${WIKI}Bouncing_Burst`,
    },
  ],

  // ── Items ───────────────────────────────────────────────────────────────────────────────
  'item:potion': [
    { text: 'Throw force grows with how far your cursor is from you. A red ❌ on the throw arc means it will break, and it can break inside the safe zone too.', source: `${WIKI}Flask` },
    { text: 'A shattered flask releases only 20% of what was left in it. A damaged flask that didn’t break is repaired when you pick it up.', source: `${WIKI}Flask` },
    { text: 'Spraying splits evenly between materials, whatever the ratio, so you can partly filter a mix. Spraying upward while flying extends your flight.', source: `${WIKI}Flask` },
    { text: 'Drinking always takes 10% of each material in the flask. Below 10% full, effects are weaker.', source: `${WIKI}Flask` },
    { text: 'You can fill a flask from beneath a thin floor, which is handy for Lava or Teleportatium.', source: `${WIKI}Flask` },
  ],
  'item:brimstone': [
    { text: 'Fire immunity lasts about a second after you swap away or throw it, so you can attack or douse yourself in that window.', source: `${WIKI}Kiuaskivi` },
    { text: 'Held or dropped, it keeps lighting flammable things around it. It boils water into steam, and Toxic Sludge into toxic gas.', source: `${WIKI}Kiuaskivi` },
    { text: 'Stendari and Eldari stay passive while you hold it in hand. Carrying it in your inventory isn’t enough.', source: `${WIKI}Kiuaskivi` },
    { text: 'Dropping it into Slime destroys it.', source: `${WIKI}Kiuaskivi` },
  ],
  'item:waterstone': [
    { text: 'While you hold it, your oxygen doesn’t run down, but it won’t refill an empty oxygen bar.', source: `${WIKI}Vuoksikivi` },
    { text: 'It replaces your stains with Wet, like a stack of Repelling Capes, and turns lava near you into volcanic rock.', source: `${WIKI}Vuoksikivi` },
    { text: 'It soaks nearby enemies too, which quickly kills water-weak ones like Stendari.', source: `${WIKI}Vuoksikivi` },
    { text: 'Together with the other elemental stones, it completes Uusi Aurinko.', source: `${WIKI}Vuoksikivi`, secret: true },
  ],

  // ── Materials ───────────────────────────────────────────────────────────────────────────
  'material:magic_liquid_charm': [
    { text: 'Charms creatures it stains: they switch to your side for about 20 s, and charmed healers heal you. The easiest way is a pool they stand in.', source: `${WIKI}Pheromone` },
    {
      text: 'Selling wands: drop an empty wand (no spells, no always-casts) into a pool and it turns into a gold nugget worth at least 200. Wands from deeper down are worth more.',
      source: `${WIKI}Pheromone`,
    },
    { text: 'A wand with usable spells dropped in a pool gets picked up by a friendly ghost, who fights with it for 60 s and then drops it.', source: `${WIKI}Pheromone` },
    { text: 'On you, it does nothing but leave a trail of hearts. It does count as a stain, though, so it turns off Stainless Armour until you wash it off.', source: `${WIKI}Pheromone` },
    { text: 'A wand sunk in a deep pool can come alive as a friendly charmed wand creature (Taikasauva).', source: `${WIKI}Pheromone`, secret: true },
    { text: 'Submerging the Sampo in it starts the final boss fight, held by an invisible ghost.', source: `${WIKI}Pheromone`, secret: true },
  ],
  'material:water': [
    { text: 'It conducts electricity. Lightning or electric arcs into water shock and stun anything in it, and the stun makes electrocution one of the fastest ways to die.', source: `${WIKI}Water` },
  ],
  'material:oil': [{ text: 'Unlike most liquids, it doesn’t conduct electricity.', source: `${WIKI}Electricity` }],

  // ── Perks ───────────────────────────────────────────────────────────────────────────────
  'perk:STAINLESS_ARMOUR': [{ text: 'A Pheromone stain does nothing else to you, but it still counts as a stain and turns this perk off until you wash it off.', source: `${WIKI}Pheromone` }],
  'perk:ABILITY_ACTIONS_MATERIALIZED': [{ text: 'Works on Dynamite and Glitter bomb too: hold them in an item slot and throw them by hand.', source: `${WIKI}Dynamite` }],
  'perk:EXTRA_MONEY_TRICK_KILL': [{ text: 'Glitter bomb shard kills count as trick kills.', source: `${WIKI}Glitter_Bomb` }],
};

export const mechanicsFor = (kind: MechanicKind, id: string): MechanicNote[] => MECHANICS[`${kind}:${id}`] ?? [];
