// Hidden mechanics: things the game never tells you, curated from noita.wiki.gg (each note links its page).
// Game-file facts (speed-scaled damage, fuses, throw strength...) are added automatically in
// src/ui/HiddenMechanics.tsx; these are the tricks that only show up in play. Most item notes live in
// itemMechanics.ts.
import { ITEM_MECHANICS } from './itemMechanics';

export type MechanicKind = 'spell' | 'item' | 'material' | 'perk';

export type MechanicNote = {
  text: string;
  /** noita.wiki.gg page it comes from. */
  source: string;
  /** Late-game secret: shown only after a deliberate tap. */
  secret?: boolean;
};

const WIKI = 'https://noita.wiki.gg/wiki/';

type Entries = Record<`${MechanicKind}:${string}`, MechanicNote[]>;

/** Iplicate … Heplicate share their rules (game files: gun_actions.lua I_SHOT … HEXA_SHOT). */
function plicates(): Entries {
  const src = `${WIKI}Iplicate_Spell`;
  const shared: MechanicNote[] = [
    { text: 'It only copies when the next spell is a projectile or static projectile with charges left. A modifier in between means no copies at all.', source: src },
    {
      text: 'Copies are the bare projectile (the spell’s related projectile), not a re-cast. A trigger’s copies carry no payload, and Matosade’s copy is a real Jättimato.',
      source: src,
    },
    { text: 'Each copy costs the copied spell’s mana again, and copying stops when mana runs out. Copies never use up charges.', source: src },
    { text: 'Multi-shot spells are copied whole: each copy of Triplicate Bolt is three more bolts.', source: src },
    { text: 'The formation angle applies to every projectile in the same cast, not just the copies.', source: src },
  ];
  const ids = ['I_SHOT', 'Y_SHOT', 'T_SHOT', 'W_SHOT', 'QUAD_SHOT', 'PENTA_SHOT', 'HEXA_SHOT'];
  const out: Entries = {};
  for (const id of ids) out[`spell:${id}`] = [...shared];
  out['spell:PENTA_SHOT']!.unshift({ text: 'The in-game description is off by one: it makes 4 copies (5 projectiles with the original).', source: src });
  out['spell:HEXA_SHOT']!.unshift({ text: 'The in-game description is off by one: it makes 5 copies (6 projectiles with the original).', source: src });
  return out;
}

/** Alpha, Gamma, Tau, Omega, Mu, Phi, Sigma, Zeta. */
function greekLetters(): Entries {
  const src = `${WIKI}Greek_Letter_Spells`;
  const free: MechanicNote = { text: 'Its copies ignore the copied spells’ mana and charges, which makes limited spells like Healing Bolt effectively unlimited.', source: src };
  return {
    'spell:ALPHA': [free],
    'spell:GAMMA': [free],
    'spell:TAU': [free],
    'spell:OMEGA': [free],
    'spell:MU': [free, { text: 'It applies every modifier in the wand to the shot, including ones far from it.', source: src }],
    'spell:PHI': [free],
    'spell:SIGMA': [free],
    'spell:ZETA': [
      free,
      {
        text: 'It copies a random spell from the other wands you carry (up to 3), and does nothing with no other wand. In this app, your 3 most recently saved builds stand in for them.',
        source: src,
      },
    ],
  };
}

/** Kantele and Ocarina (Huilu) notes (game files: data/scripts/magic/kantele.lua, ocarina.lua). */
function noteSpells(): Entries {
  const src = `${WIKI}Note_spells`;
  const shared: MechanicNote[] = [
    { text: 'Notes deal no damage alone and last 2 frames, so they barely leave the wand. Add damage and lifetime modifiers to make them hit.', source: src },
    {
      text: 'Played in the right order, within 24 px of your feet, they perform a song. Any wand works; the instrument isn’t needed. Each song works once per run for each instrument.',
      source: src,
    },
  ];
  const kantele: MechanicNote[] = [
    { text: 'Kantele songs: G D E D is meant to summon a live Holy Bomb at your feet (but see below); A D# E G opens a portal to the mountain top; D E A E D# summons a Jättimato.', source: src, secret: true },
    {
      text: 'The kantele bomb song can’t be finished: its first note (G) also opens the alchemy song, and the game always picks alchemy. Checked by running the song table through the game’s own Lua (kantele.lua).',
      source: src,
    },
  ];
  const ocarina: MechanicNote[] = [
    { text: 'Ocarina songs: F C D C summons a live Holy Bomb; A F D E A2 opens a portal to the mountain top; G# F E B D summons a Jättimato.', source: src, secret: true },
  ];
  const out: Entries = {};
  for (const n of ['A', 'D', 'DIS', 'E', 'G']) out[`spell:KANTELE_${n}`] = [...shared, ...kantele];
  for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'GSHARP', 'A2']) out[`spell:OCARINA_${n}`] = [...shared, ...ocarina];
  return out;
}

/** The seven runestones share a switch (runestone_activate.lua); five of them act on projectiles. */
function runestones(): Entries {
  const wiki = `${WIKI}Runestones`;
  const activate = 'data/scripts/items/runestones/runestone_activate.lua';
  const shared = (radius: number): MechanicNote[] => [
    { text: 'It does nothing until switched on. Kick it to switch it on, and kick it again to switch it off.', source: activate },
    { text: 'Throwing it always switches it on, and picking it up always switches it off, so pick it up to make it safe.', source: activate },
    { text: `While it’s on, a pulse of glowing particles marks its reach: ${radius} px around the stone, through walls.`, source: 'data/scripts/items/runestones/' },
    {
      text: 'One on an item pedestal starts switched on 1 time in 10. Enemies inside its reach can then be far more dangerous than usual.',
      source: 'data/scripts/item_spawnlists.lua',
    },
  ];
  const yours: MechanicNote = { text: 'It changes your own projectiles as well as enemies’, so fighting inside its reach can backfire.', source: wiki };
  const swap: MechanicNote = {
    text: 'The new projectile keeps the old one’s speed and direction, and the old one never explodes. Fast spells turn into very fast replacements.',
    source: wiki,
  };
  // What it does comes first: the item page shows only the game's "You feel like kicking it".
  const does = (file: string, text: string): MechanicNote => ({ text, source: `data/scripts/items/runestones/${file}.lua` });
  return {
    'item:runestone_slow': [
      does('runestone_slow', 'Switched on, it slows every projectile within 192 px: every 10 frames it cuts their speed to a quarter, so anything inside barely moves.'),
      ...shared(192),
      yours,
    ],
    'item:runestone_disc': [does('runestone_disc', 'Switched on, it turns every projectile within 192 px into a Disc projectile.'), ...shared(192), yours, swap],
    'item:runestone_fireball': [does('runestone_fireball', 'Switched on, it turns every projectile within 192 px into a Fireball.'), ...shared(192), yours, swap],
    'item:runestone_laser': [does('runestone_laser', 'Switched on, it turns every projectile within 192 px into a Laser.'), ...shared(192), yours, swap],
    'item:runestone_null': [
      does('runestone_null', 'Switched on, it erases every projectile within 192 px. Erased projectiles don’t explode, so explosive spells that fly into it just vanish.'),
      ...shared(192),
      yours,
    ],
    'item:runestone_lava': [
      does('runestone_lava', 'Switched on, every 40 frames it turns every liquid within 192 px into lava.'),
      ...shared(192),
      { text: 'The new lava reacts with the liquids around it.', source: wiki },
    ],
    'item:runestone_metal': [
      does('runestone_metal', 'Switched on, it turns meltable metals within 160 px, such as copper and metal dust, into poison.'),
      ...shared(160),
    ],
  };
}

export const MECHANICS: Entries = {
  ...ITEM_MECHANICS,
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
  ...plicates(),
  ...greekLetters(),
  ...noteSpells(),
  ...runestones(),
  'spell:DUPLICATE': [
    { text: 'It copies spells already cast earlier in the same cast, never one after it. Put it after what you want doubled.', source: `${WIKI}Spell_Duplication` },
    {
      text: 'Copied draws still draw, so it acts as a multicast as big as the draws it copies: +1 for each modifier, +2 for Double Spell, and so on.',
      source: `${WIKI}Spell_Duplication`,
    },
    { text: 'It never copies another Spell Duplication, and each copy counts toward the recursion limit, which stops Greek letters being copied forever.', source: `${WIKI}Spell_Duplication` },
  ],
  'spell:WORM_RAIN': [
    {
      text: 'Its own worms can’t drop Extra Max Health. A Plicate or Add Trigger copying it summons its related projectile instead: a real Jättimato, which drops one with a 50% chance (game files: worm_death.lua).',
      source: `${WIKI}J%C3%A4ttimato`,
    },
  ],
  'spell:FREEZE': [
    {
      text: 'A frozen Jättimato can be kicked to death in one go. It thaws fast, so be quick. Killed this way it doesn’t bleed, but it still has its 50% chance to drop Extra Max Health.',
      source: `${WIKI}J%C3%A4ttimato`,
    },
    {
      text: 'Any Melee damage kills a frozen creature outright: kicks, Summon Tentacle, Tentacler. On a frozen player it takes half their current HP, or kills at 25% HP or less.',
      source: `${WIKI}Status_Effects`,
    },
  ],
  'spell:POLLEN': [
    {
      text: 'Pollen is a living thing your own friendly-fire spells can hit. A trigger projectile that hits it releases its payload, and a piercing one (Holy Lance) releases a copy for every Pollen it passes through.',
      source: `${WIKI}Pollen`,
    },
    {
      text: 'Put another Pollen in that payload and you get a trigger loop: each released Pollen is hit at once and releases the next, a payload copy every frame until the carrier expires. This is the engine behind “projection” art wands.',
      source: `${WIKI}Pollen`,
    },
    { text: 'Your blasts don’t hurt it (explosion damage ×0), so a cloud of Pollen also blocks enemy shots like a shield.', source: `${WIKI}Pollen` },
  ],
  'spell:LANCE_HOLY': [
    {
      text: 'It has friendly fire and passes through what it hits, so an attached trigger fires once for each thing it touches, Pollen included. That makes it the usual carrier for Pollen trigger loops.',
      source: `${WIKI}Holy_Lance`,
    },
  ],
  'spell:SPIRALING_SHOT': [
    {
      text: 'It sets the projectile’s velocity every frame, curving it out from where it started at a fixed speed, so gravity never builds up. Slowed with Heavy Shot and Deceleration, a Holy Lance glides in a smooth line, which projection wands rely on.',
      source: `${WIKI}Spiral_Arc`,
    },
    { text: 'Projectiles circle their point of origin, so a Trigger, Timer or Long-Distance Cast moves that origin out to where you want the pattern.', source: `${WIKI}Spiral_Arc` },
  ],
  'spell:ADD_TRIGGER': [
    {
      text: 'Useful failure: if the spell it targets can’t take a trigger (a Black Hole with 0 charges, Blood Magic, a Plicate…), the modifiers it skipped still apply, and they stay in the wand to be used again. With Divide By, that copies modifiers many times for one mana cost (Divide By 10 → 11 copies).',
      source: `${WIKI}Add_Trigger#Useful_Failure`,
    },
  ],
  'spell:TENTACLE_RAY': [
    {
      text: 'Its tentacles deal Melee damage, and Melee damage kills any frozen creature instantly. Pair it with Freeze charge to one-shot a Jättimato (50% Extra Max Health).',
      source: `${WIKI}Status_Effects`,
    },
  ],
  'spell:TENTACLE': [
    { text: 'The tentacle deals Melee damage, which kills any frozen creature instantly (and halves a frozen player’s HP).', source: `${WIKI}Status_Effects` },
  ],
  'spell:HEAL_BULLET': [
    { text: 'It heals only by hitting you (8.75 HP, doubled with Berserkium), and it has friendly fire on. Aim it at the ground and walk into it, or bring it back with Boomerang, Bounce or Orbiting Arc.', source: `${WIKI}Healing_Bolt` },
    { text: 'Healing is negative damage. Damage Plus and the Concentrated Spells or Boomerang perks add positive damage, so a boosted bolt can hurt instead.', source: `${WIKI}Healing_Bolt` },
    { text: 'Divide By multiplies the healing. It only has 20 charges and Unlimited Spells doesn’t help, so copy it with Alpha or Gamma instead.', source: `${WIKI}Healing_Bolt` },
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

  'item:physics_gold_orb': [
    { text: 'Kick it for gold. The first kick always gives 30 gold.', source: `${WIKI}Shiny_Orb` },
    {
      text: 'Kicks 2–4 can’t explode. Each rolls a 22-sided die: 20 gold (9 in 22), 30 gold (11 in 22), 100 gold (1 in 22) or 200 gold (1 in 22).',
      source: 'data/scripts/items/gold_orb.lua',
    },
    {
      text: 'From the 5th kick it can explode, destroying the orb: 4 in 22 on kick 5, and 1 more in 22 with every kick after. The 200-gold result is gone from kick 5, and the 100-gold one from kick 10. With low health, stop at 4 kicks.',
      source: 'data/scripts/items/gold_orb.lua',
    },
    { text: 'Telekinetic Kick counts as a kick, so you can work it from outside the blast.', source: `${WIKI}Shiny_Orb` },
    { text: 'Explosion Immunity or an Ambrosia stain stops the blast damage, but the blast can still set you on fire.', source: `${WIKI}Shiny_Orb` },
    { text: 'It’s a heavy metal ball: pick it up and throw it to hurt enemies.', source: `${WIKI}Shiny_Orb` },
  ],
  'item:physics_gold_orb_greed': [
    { text: 'Kick it for blood money. The first kick always gives 40 gold (four 10s).', source: 'data/scripts/items/gold_orb_greed.lua' },
    {
      text: 'Later kicks roll a 21-sided die: one 50 nugget (8 in 21), four 10s (10 in 21), two 200s (1 in 21) or a 1000 (1 in 21). Blood money heals you as you pick it up.',
      source: 'data/scripts/items/gold_orb_greed.lua',
    },
    {
      text: 'Unlike the Shiny orb it can explode from the 2nd kick (1 in 21). From the 4th kick it’s 3 in 21, then 1 more in 21 with every kick. Its blast is a giga explosion, far bigger than the Shiny orb’s.',
      source: 'data/scripts/items/gold_orb_greed.lua',
    },
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
