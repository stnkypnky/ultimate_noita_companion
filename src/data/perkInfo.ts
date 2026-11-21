// Companion notes for every perk: what it really does, its numbers, and how to play it. Numbers were read from the
// perk's code in perk_list.lua (and the scripts it attaches) and checked against its noita.wiki.gg page, which each
// note links. HP is shown as the game shows it (25 per internal unit). Late-game secrets go in `secret`.

export type PerkInfo = {
  /** What it does, in more words than the game's one-liner. */
  text: string;
  /** Its modifier amounts. */
  numbers?: { label: string; value: string }[];
  /** Strategies, synergies and things the game never says. */
  tips?: string[];
  /** Spoiler part: shown only after a tap. */
  secret?: string;
  /** The noita.wiki.gg page it was checked against. */
  source: string;
};

const W = 'https://noita.wiki.gg/wiki/';
const n = (label: string, value: string) => ({ label, value });

export const PERK_INFO: Record<string, PerkInfo> = {
  // ── Offence ─────────────────────────────────────────────────────────────────────────────
  CRITICAL_HIT: {
    text: 'Every spell you cast gets a higher chance to critically hit. Crits deal 5× damage.',
    numbers: [n('Critical chance', '+10% per copy')],
    tips: ['Stacks with Critical Plus (+15%) and the "Critical on…" modifiers.', 'Chance past 100% turns into extra critical damage.', 'It does not grow with multicasts: each spell gets the same +10%.'],
    source: `${W}Critical_Hit_%2B`,
  },
  GLASS_CANNON: {
    text: 'The boost covers explosions too: blasts grow five times bigger. The 50 HP cap stays for the rest of the run, and a second copy multiplies damage again.',
    numbers: [n('Max HP', 'Set to 50'), n('Spell damage', '×5'), n('Explosion size', '×5'), n('Max copies', '2')],
    tips: ['Take Extra Life or Saving Grace before or with it.', 'Pairs with Living on the Edge: 50 max HP keeps you near its threshold.', 'Stronger Hearts and Extra Health are wasted on it.'],
    source: `${W}Glass_Cannon`,
  },
  LOW_HP_DAMAGE_BOOST: {
    text: 'When you’re nearly dead, your spells deal triple damage.',
    numbers: [n('Spell damage', '×3 per copy (×9, ×27)'), n('Kicks in at', '25 HP or 25% of max HP'), n('Max copies', '3')],
    tips: ['Glass Cannon keeps you under the threshold almost all the time.', 'Saving Grace leaves you at 1 HP, right in its range.'],
    source: `${W}Living_on_the_Edge`,
  },
  RISKY_CRITICAL: {
    text: 'Enemy projectiles that fly close past you make your next spells more likely to crit.',
    numbers: [n('Critical chance', '+40% per near miss'), n('Near-miss range', '56 px'), n('Max copies', '3')],
    source: `${W}Close_Call`,
  },
  LOWER_SPREAD: {
    text: 'Your spells fly straighter and hit harder, more so in big multicasts, but your wands cast more slowly.',
    numbers: [n('Spread', '−25°'), n('Bonus damage', '17.5 × n² for an n-spell multicast'), n('Cast delay', 'Longer')],
    tips: ['Turns wide multicasts (Triple Spark Bolt) into strong tight volleys.', 'It is added to Healing Bolt too, which can make it hurt.'],
    source: `${W}Concentrated_Spells`,
  },
  PROJECTILE_HOMING_SHOOTER: {
    text: 'Your spells curve back to you, and each projectile spell gets a hidden damage and speed boost.',
    numbers: [n('Projectile damage', '+15 per spell'), n('Explosion damage', '+2.5'), n('Lifetime', '+20 frames'), n('Speed', '×2.5')],
    tips: [
      'The flat +15 is huge on fast, weak wands: it stacks per spell in a multicast.',
      'Lets Luminous Drill and Chainsaw reach enemies at range.',
      'Put multicasts inside a trigger’s payload, or they turn back before reaching anything.',
      'Dangerous: Disc Projectile, Plasma Beam and explosives come back at you, and Healing Bolt hurts instead of heals.',
    ],
    source: `${W}Boomerang_Spells`,
  },
  PROJECTILE_HOMING: {
    text: 'Your spells home gently towards the nearest enemy, at no mana cost.',
    tips: ['Best on slow or static projectiles (Death Cross, Slime Mist).', 'It picks the nearest enemy, not the one you aim at.', 'Teleport Bolt and Black Hole get pulled towards enemies too.'],
    source: `${W}Homing_Shots`,
  },
  BOUNCE: {
    text: 'Every projectile spell bounces more and lasts longer.',
    numbers: [n('Bounces', '+3 per spell'), n('Lifetime', '+60 frames')],
    source: `${W}Bouncing_Spells`,
  },
  FAST_PROJECTILES: {
    text: 'Your projectiles fly much faster. Each projectile spell in a cast multiplies it again.',
    numbers: [n('Speed', '×1.75 per projectile spell'), n('Two in one cast', '×3.06'), n('Three in one cast', '×5.36')],
    tips: ['Speed-scaled spells (Arrow, Rock) hit harder.', 'Fast shots can tunnel through thin enemies or walls they would have hit.'],
    source: `${W}Faster_Projectiles`,
  },
  DUPLICATE_PROJECTILE: {
    text: 'Half your casts fire an extra copy of the projectile, but enemy projectiles hurt you more.',
    numbers: [n('Copy chance', '50% per cast'), n('Projectile damage taken', '+25%')],
    tips: ['The copy keeps every modifier except mana cost.', 'Triggers usually aren’t copied; the last spell drawn is.', 'Spells out of charges are never copied.'],
    source: `${W}Projectile_Duplication`,
  },
  LASER_AIM: {
    text: 'An aiming laser shows where you shoot, and projectile spells fly faster and straighter.',
    numbers: [n('Spread', '−20° per spell'), n('Projectile speed', '+40% per spell')],
    tips: ['It applies once per projectile spell, so multicasts gain the most.'],
    source: `${W}Pinpointer`,
  },
  EXTRA_KNOCKBACK: {
    text: 'Your spells knock enemies back further.',
    numbers: [n('Knockback', '+6 per spell')],
    tips: ['Mostly useful against melee enemies; heavy enemies past the Underground Jungle barely move.'],
    source: `${W}Extra_Knockback_on_Spells`,
  },
  PERSONAL_LASER: {
    text: 'A short plasma beam constantly fires from you towards the nearest enemy.',
    numbers: [n('Damage', '3.75 per frame (+0.625 per copy)'), n('Length', '54 px (+12 per copy)'), n('Max copies', '5')],
    tips: ['Melts weak enemies that get close, and digs through soft ground.'],
    source: `${W}Personal_Plasma_Beam`,
  },
  ELECTRICITY: {
    text: 'You are immune to electricity and constantly electrify conductive materials around you: water, blood and metal.',
    numbers: [n('Shock', 'Every 0.5 s')],
    tips: [
      'Enemies standing in water or blood near you get shocked; those kills count as trick kills.',
      'It breaks nearby flasks and sets off explosives like propane tanks.',
      'Blocked shocks can still trigger Teleportitis.',
    ],
    source: `${W}Electricity`,
  },
  CONTACT_DAMAGE: {
    text: 'Enemies that touch you take damage every frame, more the lower your health is.',
    numbers: [n('At full HP', '1 per frame'), n('At 25% HP', '3.8 per frame')],
    source: `${W}Contact_Damage`,
  },
  STRONG_KICK: {
    text: 'Your kick becomes a real attack: more force, more damage and knockback, and it can crack ice.',
    numbers: [n('Kick force', '×1.7'), n('Kick damage', '+60 per copy'), n('Kick knockback', '+250'), n('Throw speed', '+25')],
    tips: ['Kicking a frozen enemy shatters it.'],
    source: `${W}Never_Skip_Leg_Day`,
  },
  TELEKINESIS: {
    text: 'Your kick becomes telekinesis: kick to pick up objects and creatures at a distance, then kick again to throw them.',
    tips: ['Throw heavy objects (rocks, minecarts) into enemies for big physics damage.', 'You can no longer kick normally.'],
    source: `${W}Telekinetic_Kick`,
  },
  // ── Defence ─────────────────────────────────────────────────────────────────────────────
  SAVING_GRACE: {
    text: 'A hit that would kill you from above 1 HP leaves you at 1 HP instead, and blocks all damage for a moment. It works again once you heal above 1 HP.',
    numbers: [n('Grace period', '60 frames (1 s)'), n('Halo', '+1')],
    tips: ['Doesn’t help at exactly 1 HP: several quick hits still kill.', 'Doesn’t work while polymorphed.', 'Pairs well with Living on the Edge and Extra Life.'],
    source: `${W}Saving_Grace`,
  },
  RESPAWN: {
    text: 'When you die, you come back once with 100 HP. Each copy is one more life.',
    numbers: [n('Revive health', '100 HP'), n('Invulnerable after', '30 frames'), n('Halo', '+1')],
    tips: ['It can’t save you while polymorphed: death in Polymorphine is final.', 'Saving Grace can trigger again after a revive.'],
    source: `${W}Extra_Life`,
  },
  EXTRA_HP: {
    text: 'Raises your max HP by half, and current HP by the same amount.',
    numbers: [n('Max HP', '+50% per copy')],
    tips: ['Capped by Glass Cannon.', 'Take it late: it multiplies whatever max HP you have.'],
    source: `${W}Extra_Health`,
  },
  HEARTS_MORE_EXTRA_HP: {
    text: 'Extra max HP pickups (the heart containers) give much more.',
    numbers: [n('Extra Max HP pickup', '+25 → +50'), n('Large pickup', '+50 → +100'), n('Each extra copy', '+0.25×'), n('Max copies', '9')],
    tips: ['Take it early to get the most from every heart afterwards.', 'Useless with Glass Cannon.'],
    source: `${W}Stronger_Hearts`,
  },
  ADVENTURER: {
    text: 'Entering a biome you haven’t visited this run heals you.',
    numbers: [n('Healing', '60 HP per new biome')],
    tips: ['Side biomes count: a quick visit to one is a free heal.'],
    source: `${W}Healthy_Exploration`,
  },
  VAMPIRISM: {
    text: 'You lose a quarter of your max HP, but drinking blood heals you. Blood no longer fills your stomach, and you can’t get food poisoning.',
    numbers: [n('Max HP', '−25%'), n('Healing', '4 HP per 10% of a flask of blood'), n('Halo', '−1')],
    tips: [
      'The max HP cut uses your max HP when you take it: take it early, then pick up hearts.',
      'Drink from a flask, so you don’t swallow other liquids from the ground.',
      'More Blood and slicing spells (Chainsaw) give more to drink.',
      'Avoid Freeze Field (it freezes blood) and Exploding Corpses.',
    ],
    source: `${W}Vampirism`,
  },
  WAND_EXPERIMENTER: {
    text: 'Firing a wand you haven’t edited yet heals you, a little less with each cast.',
    numbers: [n('Shuffle wand', '48, 24, 12, 8, 6, 4, 2 HP (104 total)'), n('Non-shuffle wand', '30, 15, 9, 6, 4, 3, 2 HP (69 total)')],
    tips: ['Test every wand you find and buy: it’s free healing.', 'Dropping spells on the ground doesn’t count as editing.', 'Beware wands with dangerous spells: they can hurt more than they heal.'],
    source: `${W}Wand_Experimenter`,
  },
  STAINLESS_ARMOUR: {
    text: 'You take half damage while you have no stains (wet, bloody, oily…). Each copy halves it again.',
    numbers: [n('Damage taken', '÷2 per copy'), n('Three copies', '12.5%')],
    tips: ['Pairs with Repelling Cape, which shakes stains off fast.', 'Being on fire is not a stain.', 'Effects that set your HP (Blood Magic) ignore it.'],
    source: `${W}Stainless_Armour`,
  },
  SHIELD: {
    text: 'A shield around you blocks projectiles and recharges on its own.',
    numbers: [n('Max copies', '5'), n('Recharge', 'Faster with each copy')],
    tips: ['Fungal Disease’s spores break it constantly.', 'Levitation Trail sparks break it too.'],
    source: `${W}Permanent_Shield`,
  },
  TELEPORTITIS: {
    text: 'You take less damage, but every hit teleports you a short way.',
    numbers: [n('Damage taken', '−20%'), n('Cooldown', '60 frames')],
    tips: [
      'Your aim nudges where you land.',
      'It can drop you in lava or acid, or skip a Holy Mountain.',
      'Speedrunners pair it with a little damage over time for repeated teleports.',
    ],
    source: `${W}Teleportitis`,
  },
  TELEPORTITIS_DODGE: {
    text: 'You teleport aside just before an enemy projectile hits you.',
    numbers: [n('Recharge', '130 frames')],
    tips: ['It moves you 90° from your aim: aim straight left or right to dodge upward.', 'Walls stop the dodge short.', 'Very strong in projectile-heavy areas such as the Snowy Depths.'],
    source: `${W}Teleportitis_Dodge`,
  },
  PROJECTILE_REPULSION: {
    text: 'A field pushes projectiles away from you, but projectile hits hurt more.',
    numbers: [n('Radius', '50 px'), n('Projectile damage taken', '×1.26 per copy')],
    tips: ['Your own projectiles leave faster and fly further (Black Holes dig long tunnels).', 'It makes Healing Bolt hard to hit yourself with.'],
    source: `${W}Projectile_Repulsion_Field`,
  },
  PROJECTILE_REPULSION_SECTOR: {
    text: 'A cone in front of your wand hand pushes projectiles away, much more strongly than the repulsion field.',
    tips: ['It also pushes your own projectiles: Black Holes fly further.', 'It can push circle fields (Circle of Transmogrification) around.'],
    source: `${W}Projectile_Repulsion_Sector`,
  },
  PROJECTILE_EATER_SECTOR: {
    text: 'A red sector behind you, opposite your wand hand, destroys any projectile that touches it, yours included.',
    tips: ['Good against snipers and Giga Disc Projectile.', 'It can eat your own Black Holes and tentacles at some angles.'],
    source: `${W}Projectile_Eater`,
  },
  PROJECTILE_SLOW_FIELD: {
    text: 'Projectiles near you slow down, your own included.',
    tips: ['Pairs with Projectile Repulsion Field and Phasing: slow shots are easier to repel or phase.'],
    source: `${W}Projectile_Slower`,
  },
  ORBIT: {
    text: 'Slow enemy projectiles near you may pass harmlessly behind you, but the ones that do hit hurt more.',
    numbers: [n('Phase chance', '50% per frame'), n('Range', '12 px'), n('Damage taken', '+33% from projectiles and explosions')],
    tips: ['Only projectiles slower than 1000 speed can phase.', 'Pairs with Projectile Slower and Repulsion Field.'],
    source: `${W}Phasing`,
  },
  FREEZE_FIELD: {
    text: 'Liquids around you freeze and fires go out. You become immune to fire, and in practice to lava.',
    tips: ['You can’t collect freezable liquids any more.', 'Take Gas Blood or Oil Blood so your own blood doesn’t trap you in ice.', 'Avoid More Blood and Vampirism.'],
    source: `${W}Freeze_Field`,
  },
  FIRE_GAS: {
    text: 'Gases near you turn into fire: toxic gas, freezing vapour, polymorph gas and the like burn away before they reach you.',
    numbers: [n('Radius', '48 px')],
    tips: ['It gives no fire immunity: pair it with Fire Immunity, Oil Blood or Freeze Field.', 'It removes the danger of drowning in gas.'],
    source: `${W}Gas_Fire`,
  },
  REPELLING_CAPE: {
    text: 'Stains wear off much faster while you move.',
    numbers: [n('Stain drop chance', '×10 per copy'), n('Max copies', '8')],
    tips: ['Pairs with Stainless Armour and Invisibility.', 'Careful: without a wet stain you catch fire easily.', 'Good stains (Ambrosia) wear off fast too.'],
    source: `${W}Repelling_Cape`,
  },
  NO_MORE_KNOCKBACK: {
    text: 'Nothing can knock you back or out of the air, and you can’t be dazed.',
    source: `${W}No_More_Knockback`,
  },
  PROTECTION_FIRE: {
    text: 'You take no fire damage, and burning wears off faster.',
    tips: ['Lava and fiery explosions still hurt.'],
    source: `${W}Fire_Immunity`,
  },
  PROTECTION_RADIOACTIVITY: {
    text: 'You take no toxic damage and can’t be stained toxic. Toxic sludge even washes other stains off you.',
    tips: ['Acid and poison still hurt: don’t mix them up.', 'A dip in toxic sludge is a quick way to clear stains for Stainless Armour or Invisibility.'],
    source: `${W}Toxic_Immunity`,
  },
  PROTECTION_EXPLOSION: {
    text: 'Explosions don’t hurt you.',
    tips: ['Fire and gases they leave behind still do.', 'Makes your own bombs and nukes safe.'],
    source: `${W}Explosion_Immunity`,
  },
  PROTECTION_MELEE: {
    text: 'You take no melee damage, which makes many enemies harmless, worms included.',
    tips: ['Slice and bite damage still hurt.', 'Pairs with Worm Attractor.'],
    source: `${W}Melee_Immunity`,
  },
  PROTECTION_ELECTRICITY: {
    text: 'You take no electricity damage, so you also aren’t stunned by it.',
    tips: ['Some lightning explosions can still stun you.'],
    source: `${W}Electricity_Immunity`,
  },
  // ── Movement ────────────────────────────────────────────────────────────────────────────
  BREATH_UNDERWATER: {
    text: 'You never run out of air, and you swim freely: no more bobbing up in liquids.',
    numbers: [n('Swimming', 'About 20% faster')],
    tips: ['Lets you dive for things at the bottom of lakes, and survive gas clouds.'],
    source: `${W}Breathless`,
  },
  HOVER_BOOST: {
    text: 'Your levitation meter is twice as big, but takes twice as long to refill on the ground.',
    numbers: [n('Levitation', '×2 per copy'), n('Refill time', '×2 per copy')],
    tips: ['3–5 copies and you rarely need to land.', 'Rage-fueled Levitation refills it in fights.'],
    source: `${W}Strong_Levitation`,
  },
  FASTER_LEVITATION: {
    text: 'You levitate faster, and fall faster too.',
    numbers: [n('Levitation speed', '+75% per copy'), n('Fall speed', '+40% (up to 1.68×)')],
    source: `${W}Faster_Levitation`,
  },
  MOVEMENT_FASTER: {
    text: 'You run faster. It doesn’t change how fast you levitate.',
    numbers: [n('Run speed', 'About +40% per copy')],
    source: `${W}Faster_Movement`,
  },
  ANGRY_LEVITATION: {
    text: 'Any creature dying near you refills some of your levitation.',
    numbers: [n('Refill', '1.2 s of levitation per death'), n('Range', '240 px')],
    tips: ['You don’t have to make the kill yourself.'],
    source: `${W}Rage-fueled_Levitation`,
  },
  LEVITATION_TRAIL: {
    text: 'While you levitate, you leave a trail of sparks that hurt enemies.',
    numbers: [n('Spark', 'Every 3 frames'), n('Damage', '3 each'), n('Lifetime', 'Up to 5 s')],
    tips: ['Glass Cannon and Homing Shots boost the sparks.', 'The sparks can hit your own pets and break your shields.'],
    source: `${W}Levitation_Trail`,
  },
  ATTACK_FOOT: {
    text: 'You grow spider legs: you climb walls and ceilings, run faster, and a leg attacks enemies near you. You can’t levitate freely any more.',
    numbers: [n('Run speed', '×1.25 per copy'), n('Leg reach', '×1.5 per copy'), n('Max copies', '3')],
    tips: ['Two mutations plus Lukki Minion give the Lukki Transformation (+10% run speed).'],
    source: `${W}Lukki_Mutation`,
  },
  LEGGY_FEET: {
    text: 'You grow four big legs and an arm that attacks enemies near you, and run faster, but lose free levitation. Unlike Lukki Mutation, the legs don’t stick to walls.',
    numbers: [n('Arm damage', '12.5 melee'), n('Arm reach', '40 px'), n('Run speed', '+25% per copy')],
    secret: 'It comes from defeating the Leggy Mimic, a chest that walks.',
    source: `${W}Leggy_Mutation`,
  },
  DISSOLVE_POWDERS: {
    text: 'Powders around you dissolve: soil, sand, coal, gunpowder, snow, salt and similar.',
    tips: ['Makes digging with Ground to Sand easy.'],
    source: `${W}Dissolve_Powders`,
  },
  WORM_SMALLER_HOLES: {
    text: 'Worms and Lukki stop tearing up the ground as they burrow.',
    tips: ['Worm Attractor cancels the repelling, but not the smaller tunnels.'],
    source: `${W}Feared_by_Worms`,
  },
  // ── Wands and spells ────────────────────────────────────────────────────────────────────
  EDIT_WANDS_EVERYWHERE: {
    text: 'You can edit wands anywhere, not just in Holy Mountains.',
    tips: ['It cancels No Wand Tinkering if you have both.'],
    secret: 'A few hidden places also let you edit wands for a while: the Lake Cabin’s chambers and the Meditation Cube.',
    source: `${W}Tinker_with_Wands_Everywhere`,
  },
  NO_WAND_EDITING: {
    text: 'You can’t edit wands, even in Holy Mountains. In exchange, enemies sometimes drop blood money that heals you.',
    numbers: [n('Blood money', '20% of kills: 50 gold, heals 5 HP')],
    tips: ['Set up your wands before taking it.', 'Tinker With Wands Everywhere cancels it.'],
    source: `${W}No_Wand_Tinkering`,
  },
  UNLIMITED_SPELLS: {
    text: 'Most limited-use spells never run out of charges.',
    tips: [
      'Bombs and explosives become unlimited digging tools.',
      'A few strong spells (Black Hole, Healing Bolt, nukes) stay limited; taking the perk refills them once.',
      'Pairs with Bombs Materialized and Vampirism (unlimited blood spells).',
    ],
    source: `${W}Unlimited_Spells`,
  },
  ABILITY_ACTIONS_MATERIALIZED: {
    text: 'Bomb-type spells (Bomb, TNT, Holy Bomb, Propane Tank, Rock…) can be held in item slots and thrown by hand.',
    tips: ['With Unlimited Spells you get endless bombs.', 'Spells used this way don’t count towards your spell progress.'],
    source: `${W}Bombs_Materialized`,
  },
  ALWAYS_CAST: {
    text: 'The wand you hold gets a random always-cast spell: usually a modifier, sometimes a multicast or a projectile.',
    numbers: [n('Spell level', 'Up to 6')],
    tips: ['Hold the wand you want it on when you pick it up.', 'A wand can get at most 4 this way.'],
    source: `${W}Always_Cast_(Perk)`,
  },
  EXTRA_MANA: {
    text: 'The wand you hold gets far more mana and faster recharge, but half its spell slots.',
    numbers: [n('Max mana', '+100 to +600'), n('Mana recharge', '+100 to +300, or ×2 to ×3.5'), n('Spell slots', 'Halved (at least 1)')],
    tips: ['Wasted if you aren’t holding a wand.', 'Spells in the lost slots drop out of the wand.', 'Best on a small wand that only needs a few spells.'],
    source: `${W}High_Mana,_Low_Capacity`,
  },
  FASTER_WANDS: {
    text: 'Every wand you carry casts and reloads faster, and recharges mana faster.',
    numbers: [n('Cast delay and reload', '−20% and −5 frames'), n('Mana recharge', '+30/s')],
    tips: ['Carry the wands you care about when you take it: only the ones in your inventory change.'],
    source: `${W}Faster_Wands`,
  },
  EXTRA_SLOTS: {
    text: 'Every wand you carry gains spell slots.',
    numbers: [n('Slots', '+1 to +3 per wand'), n('Limit', '25 slots')],
    tips: ['Carry the wands you care about when you take it.'],
    source: `${W}Extra_Wand_Capacity`,
  },
  NO_MORE_SHUFFLE: {
    text: 'All wands become non-shuffle: the ones you carry, the ones nearby and every wand you find later.',
    tips: ['Makes any wand predictable to build, a big help for triggers and modifiers.'],
    source: `${W}No_More_Shuffle`,
  },
  LOW_RECOIL: {
    text: 'Firing kicks you back much less.',
    numbers: [n('Recoil', 'Halved, then −16')],
    source: `${W}Low_Recoil`,
  },
  MEGA_BEAM_STONE: {
    text: 'You get Sädekivi, a stone that fires a huge beam upwards when you kick it on the ground.',
    numbers: [n('Beam damage', '125 per frame for 4 frames')],
    tips: ['The beam cuts through any material above it, so it opens a way back to the surface.', 'Kick it on the ground; it does nothing in your hands.'],
    source: `${W}Summon_S%C3%A4dekivi`,
  },
  // ── Perks and shops ─────────────────────────────────────────────────────────────────────
  EXTRA_PERK: {
    text: 'Every Holy Mountain after this one offers one more perk.',
    numbers: [n('Perks per Holy Mountain', '+1 per copy'), n('Max copies', '5')],
    tips: ['Take it early: it pays off at every mountain after.'],
    source: `${W}Extra_Perk`,
  },
  PERKS_LOTTERY: {
    text: 'When you take a perk in a Holy Mountain, the others may stay so you can take another.',
    numbers: [n('Chance the others stay', '50%, better with each copy')],
    tips: ['Take it early: every later mountain can give two perks.'],
    source: `${W}Perk_Lottery`,
  },
  GAMBLE: {
    text: 'You instantly get two perks: the next two the coming Holy Mountain would offer.',
    tips: ['They’re set by the seed, so the seed tool can tell you what you’d get.', 'A Gamble among them is skipped.'],
    source: `${W}Gamble`,
  },
  EXTRA_SHOP_ITEM: {
    text: 'Holy Mountain shops stock more.',
    numbers: [n('Wand shops', '+1 wand per copy'), n('Spell shops', '+2 spells per copy'), n('Max copies', '5')],
    source: `${W}Extra_Item_in_Holy_Mountain`,
  },
  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  EXTRA_MONEY: {
    text: 'Each copy doubles it again: two copies give 4×, three give 8×. Blood money’s healing doesn’t change.',
    numbers: [n('Gold', '×2 per copy')],
    tips: ['Take it early: everything you pick up afterwards counts double, and Holy Mountain shops get affordable.'],
    source: `${W}Greed`,
  },
  EXTRA_MONEY_TRICK_KILL: {
    text: 'Enemies you kill by trick (with the world, other enemies or their own attacks) drop much more gold.',
    numbers: [n('Trick-kill gold', '×4, doubling per copy (×64 at 5)'), n('Max useful copies', '5')],
    tips: ['Pairs with Trick Blood Money and Greed.'],
    source: `${W}Trick_Greed`,
  },
  TRICK_BLOOD_MONEY: {
    text: 'Trick kills drop blood money, gold that heals you when you pick it up.',
    numbers: [n('Healing', '2 HP (10 gold) up to 20 HP (200,000 gold)')],
    tips: ['Trick Greed makes it drop more.', 'Gold Is Forever keeps it until you need healing.'],
    source: `${W}Trick_Blood_Money`,
  },
  GOLD_IS_FOREVER: {
    text: 'Gold never vanishes, even when you leave it behind.',
    tips: ['Lets you save blood money for later.', 'Very long runs can lag from piles of gold.'],
    source: `${W}Gold_is_Forever`,
  },
  EXPLODING_GOLD: {
    text: 'Gold nuggets explode when you pick them up or when enemies touch them. The blasts can’t hurt you directly.',
    tips: ['Attract Gold pulls the nuggets into enemies.', 'Careful near propane tanks: what they set off can hurt you.'],
    source: `${W}Exploding_Gold`,
  },
  ATTRACT_ITEMS: {
    text: 'Gold nuggets fly towards you.',
    numbers: [n('Max copies', '6'), n('Each copy', 'Longer range, stronger pull')],
    tips: ['Pulls gold out of dangerous liquids like Polymorphine.'],
    source: `${W}Attract_Gold`,
  },
  // ── Creatures ───────────────────────────────────────────────────────────────────────────
  GENOME_MORE_HATRED: {
    text: 'Creatures hate each other more, so they fight among themselves.',
    numbers: [n('Faction relations', '−25 per copy'), n('Halo', '−1')],
    tips: ['At 3 copies everything fights everything.', 'Infighting often breaks flasks you wanted.'],
    source: `${W}More_Hatred`,
  },
  GENOME_MORE_LOVE: {
    text: 'Creatures like you and each other more: many spawn neutral.',
    numbers: [n('Faction relations', '+25 per copy'), n('Halo', '+1')],
    tips: ['At 4 copies almost everything is neutral, and neutral healers heal you.', 'Bosses, worms and fungi don’t care.', 'Your Homunculi go neutral too.'],
    source: `${W}More_Love`,
  },
  PEACE_WITH_GODS: {
    text: 'The Holy Mountain’s guardians forgive you for stealing or breaking things there.',
    numbers: [n('Halo', '+1')],
    tips: ['Lets you take shop items for free or dig through the Holy Mountain without the guardians attacking.'],
    source: `${W}Peace_with_Gods`,
  },
  GLOBAL_GORE: {
    text: 'Every creature, you included, bleeds a lot more.',
    numbers: [n('Halo', '−1')],
    tips: ['Pairs with Vampirism: more blood to drink.'],
    source: `${W}More_Blood`,
  },
  EXPLODING_CORPSES: {
    text: 'Enemies explode when they die, and you’re immune to explosions.',
    numbers: [n('Halo', '−1')],
    tips: ['Great against groups, but it scatters gold and sets off traps.', 'It destroys corpses (and their blood).'],
    source: `${W}Exploding_Corpses`,
  },
  PLAGUE_RATS: {
    text: 'Rats are your friends, and dying enemies release plague rats that fight for you.',
    numbers: [n('Max copies', '5'), n('Each copy', 'More rats per kill')],
    tips: ['With Revenge Rats and Spontaneous Generation you get the Ratty Transformation (+15% run speed).', 'More Hatred turns the rats on you.'],
    source: `${W}Plague_Rats`,
  },
  VOMIT_RATS: {
    text: 'Vomit and urine near you turn into rat powder, which spawns friendly plague rats. You get a flask of vomit.',
    numbers: [n('Rat limit', '30')],
    source: `${W}Spontaneous_Generation`,
  },
  REVENGE_RATS: {
    text: 'Taking damage can summon a friendly rat.',
    numbers: [n('Rat limit', '20')],
    source: `${W}Revenge_Rats`,
  },
  CORDYCEPS: {
    text: 'Whenever any creature dies, a friendly exploding mushroom creature springs up.',
    tips: ['Their explosions can hurt you: take Explosion Immunity.', 'Their kills are trick kills.', 'With Fungal Colony and Fungal Disease: the Funky Transformation.'],
    source: `${W}Cordyceps`,
  },
  MOLD: {
    text: 'Slime near you turns into fungus powder, which can spawn friendly exploding fungi. You get a flask of slime.',
    numbers: [n('Fungus limit', '30')],
    tips: ['Explosion Immunity is a must.', 'With Slime Blood, getting hurt makes exploding helpers.'],
    source: `${W}Fungal_Colony`,
  },
  FUNGAL_DISEASE: {
    text: 'Near enemies, you shoot out bursts of spore pods that hurt them.',
    numbers: [n('Max copies', '3')],
    tips: ['It shreds your own Permanent Shield.'],
    source: `${W}Fungal_Disease`,
  },
  ANGRY_GHOST: {
    text: 'A ghost follows you and copies the spells you cast nearby, firing them at your enemies.',
    tips: ['With Hungry Ghost and Mournful Spirit: the Ghostly Transformation.'],
    source: `${W}Angry_Ghost`,
  },
  HUNGRY_GHOST: {
    text: 'A ghost follows you and eats enemy projectiles, growing stronger as it eats.',
    numbers: [n('Eat range', '12 px'), n('Eats', 'Every 160 frames'), n('Max copies', '5')],
    source: `${W}Hungry_Ghost`,
  },
  DEATH_GHOST: {
    text: 'Dying enemies leave grey ghosts that wander and curse other enemies. They can’t hurt you.',
    tips: ['Good at clearing flying enemies.', 'With Angry Ghost and Hungry Ghost: the Ghostly Transformation (levitation refills 15% faster in the air).'],
    source: `${W}Mournful_Spirit`,
  },
  HOMUNCULUS: {
    text: 'Each time you leave a Holy Mountain, a small helper (a homunculus) joins you and fights enemies.',
    numbers: [n('Max copies', '10')],
    tips: ['More Love at 4 copies makes them neutral and useless.'],
    source: `${W}Homunculus`,
  },
  LUKKI_MINION: {
    text: 'A friendly Lukki spider follows you and attacks enemies.',
    numbers: [n('Damage', '5 melee every 7 frames')],
    source: `${W}Lukki_Minion`,
  },
  WORM_ATTRACTOR: {
    text: 'More worms spawn, and they come for you.',
    tips: ['Take Melee Immunity and the worms become harmless diggers.', 'Worms are the source of worm blood, and the giant worm can drop extra max HP.'],
    source: `${W}Worm_Attractor`,
  },
  // ── Senses ──────────────────────────────────────────────────────────────────────────────
  REMOVE_FOG_OF_WAR: {
    text: 'The whole map is revealed: no fog of war and no darkness.',
    tips: ['Heart containers and chests are easy to spot.', 'Also lifts the darkness of the Darkness and Gloomy biome modifiers.'],
    source: `${W}All-Seeing_Eye_(Perk)`,
  },
  RADAR_ENEMY: {
    text: 'Red markers around you point to nearby enemies, even through walls or invisible ones.',
    source: `${W}Enemy_Radar`,
  },
  WAND_RADAR: {
    text: 'Green markers around you point to nearby wands. Bigger means closer.',
    source: `${W}Wand_Radar`,
  },
  ITEM_RADAR: {
    text: 'Blue markers around you point to nearby items: hearts, flasks, spell refreshers and more.',
    source: `${W}Item_Radar`,
  },
  MOON_RADAR: {
    text: 'A marker near you always points towards the Moon.',
    secret: 'It is found in a hidden room east of the Overgrown Cavern.',
    source: `${W}Moon_Radar`,
  },
  MAP: {
    text: 'Stand still for a moment and a map of the area around you appears.',
    secret: 'It is dropped by a boss deep in the world. Its map marks the Holy Mountains, the Laboratory, the Essences and other hidden places.',
    source: `${W}Spatial_Awareness`,
  },
  // ── Body ────────────────────────────────────────────────────────────────────────────────
  INVISIBILITY: {
    text: 'Enemies can’t see you. Stains, casting, kicking and getting hurt make you visible for a while.',
    numbers: [n('Visible for', '300 frames after casting or being hit')],
    tips: ['Repelling Cape and Toxic Immunity help keep stains off.'],
    source: `${W}Invisibility`,
  },
  IRON_STOMACH: {
    text: 'You can eat and drink anything without harm, and overeating never hurts.',
    tips: ['Drinking a bad liquid gives brief immunity to its effect.', 'Pairs with Eat Your Vegetables and Vampirism.', 'You can no longer vomit, which Spontaneous Generation needs.'],
    source: `${W}Iron_Stomach`,
  },
  FOOD_CLOCK: {
    text: 'Your spells hit harder the fuller your stomach is, but you lose health when it runs low. You get a flask of porridge.',
    numbers: [n('Starving', 'About 0.7% of max HP per second below 25% fullness')],
    tips: ['Blood, meat and porridge all count as food.', 'Iron Stomach lets you overeat safely for the biggest bonus.'],
    source: `${W}Eat_Your_Vegetables`,
  },
  BLEED_SLIME: {
    text: 'You bleed slime, three times as much, and slime no longer slows you. Projectiles hurt you less.',
    numbers: [n('Projectile damage taken', '×0.75 per copy'), n('Bleeding', '×3')],
    tips: ['Take it after Oil Blood or Gas Blood to keep their immunities.'],
    source: `${W}Slime_Blood`,
  },
  BLEED_OIL: {
    text: 'You bleed oil, three times as much, and you are immune to fire.',
    numbers: [n('Bleeding', '×3')],
    tips: ['Take it after Gas Blood or Slime Blood to keep their effects.', 'Oil is slippery and flammable around enemies.'],
    source: `${W}Oil_Blood`,
  },
  BLEED_GAS: {
    text: 'You bleed flammable gas, three times as much. You are immune to toxic damage and feel lighter.',
    numbers: [n('Gravity', '×0.75'), n('Bleeding', '×3')],
    tips: ['With Gas Fire, getting hit sets you on fire unless you are fire immune.', 'Pairs with Freeze Field: no frozen blood to get stuck in.'],
    source: `${W}Gas_Blood`,
  },
  REVENGE_EXPLOSION: {
    text: 'Getting hurt sets off an explosion around you that hurts enemies but not you. You also resist explosions.',
    numbers: [n('Explosion', '150 damage, 72 px radius'), n('Cooldown', '10 frames'), n('Explosion damage taken', '×0.75 per copy')],
    tips: ['It clears harmful gases, lava and acid around you.', 'Glass Cannon makes the blast much bigger.'],
    source: `${W}Revenge_Explosion`,
  },
  REVENGE_TENTACLE: {
    text: 'Getting hurt summons a tentacle that lashes out at enemies. Projectiles hurt you less.',
    numbers: [n('Projectile damage taken', '×0.75 per copy')],
    source: `${W}Revenge_Tentacle`,
  },
  REVENGE_BULLET: {
    text: 'Getting hurt fires a shot back at your attacker. Projectiles and explosions hurt you less.',
    numbers: [n('Return shot', '2× the damage you took'), n('Cooldown', '10 frames'), n('Damage taken', '×0.8 per copy')],
    source: `${W}Revenge_Bullets`,
  },
  MANA_FROM_KILLS: {
    text: 'Enemies dying near you release a mana-recharging liquid: stand in it to refill your wand.',
    numbers: [n('Range', '240 px')],
    source: `${W}Kills_To_Mana`,
  },
};
