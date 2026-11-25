// Companion notes for creatures whose tricks the game files don't spell out (they live in Lua scripts, or in
// where and how the game places them). Each is paraphrased from the noita.wiki.gg page it links to.
// `where` is only given when no biome spawn table places the creature; hidden places go in `secret`.

export type EnemyInfo = {
  text: string;
  tips?: string[];
  /** Where it's found, when no biome spawn table places it (bosses, rooms, events). */
  where?: string;
  /** A noita.wiki.gg URL, or the data.wak path of the script it was read from. */
  source: string;
  /** Spoiler part: shown only after a tap. */
  secret?: string;
};

export const WIKI = 'https://noita.wiki.gg/wiki/';

const GATE: EnemyInfo = {
  text: 'One of four constructs the Gate Guardian splits into once awakened. Each flies erratically at you inside a red aura that deals rapid Curse damage and erases terrain; they have no ranged attacks and often get in each other’s way.',
  tips: ['Explosion damage works best; Slice works too, though discs can bounce off their bodies.'],
  source: `${WIKI}Veska`,
  secret: 'The Gate Guardian sits between the Temple of the Art and the Magical Temple and wakes when three eggs are thrown at it. Each construct drops a random unlocked spell.',
};

const SPIRIT = (page: string, effect: string, extra = ''): EnemyInfo => ({
  text: `One of the four Aave ghosts. It has no attack of its own: it puts ${effect} on every creature near it, you included, and follows you while it can see you. It leaves no corpse.${extra}`,
  tips: ['Kill it before you fight anything else near it.'],
  source: `${WIKI}${page}`,
});

export const ENEMY_INFO: Record<string, EnemyInfo> = {
  bigzombie: {
    text: 'Flings fireballs. When it dies it splits: the body keeps moving erratically and firing, and the head breaks off, flies at you fast and explodes when killed.',
    tips: ['Explosives can destroy the body and head at once.', 'Its small hitbox makes slow, big projectiles miss.'],
    source: `${WIKI}M%C3%A4t%C3%A4nev%C3%A4_ruumis`,
  },
  blob: {
    text: 'Hops around trying to bite you, and every time it is hurt it spawns small Möykky. Alone it is little threat, but they come in groups.',
    tips: ['Use slow, high-damage spells: every hit spawns more Möykky.', 'An instant explosion (on a trigger) can kill it before many spawn.'],
    source: `${WIKI}Kiukkum%C3%B6ykky`,
  },
  miniblob: {
    text: 'Spawned by a Kiukkumöykky when it takes damage. Tiny and erratic, it dashes at you for melee damage.',
    tips: ['Homing helps you hit them; area spells like Chain Bolt clear swarms, and Melee Immunity makes them harmless.'],
    where: 'Spawned by Kiukkumöykky.',
    source: `${WIKI}M%C3%B6ykky`,
  },
  boss_alchemist: {
    text: 'Drifts slowly, firing homing orbs that summon ethereal wands aimed at you. Every so often it raises a field that reflects projectiles back at whoever fired them; it can hurt itself with its own attacks.',
    tips: [
      'The wands aim where you stood when they appeared: keep moving.',
      'Attack while the reflecting field is down (it lasts about 4 seconds).',
      'The field rises every 10 s, and early after a single 50-damage hit or 75 damage in total, so big hits bring it back sooner.',
      'Plasma spells hurt it straight through the field, and Chain Bolt passes through instead of reflecting.',
    ],
    source: `${WIKI}Ylialkemisti`,
    secret:
      'Found in the Abandoned Alchemy Lab, below the Snowy Wasteland. It drops the Crystal Key and four random Greek letter spells. Its first kill also drops a Full Health Regeneration and permanently unlocks all the Greek letter spells and Chaos Die.',
  },
  parallel_alchemist: {
    text: 'The High Alchemist’s shadow: the same wand-summoning orbs and projectile-reflecting field, with different immunities.',
    tips: ['Attack only shortly after its field drops: it gives no sign when it goes up.'],
    source: `${WIKI}Ylialkemisti`,
    secret: 'It spawns only on the surface of the parallel worlds.',
  },
  boss_centipede: {
    text: 'The final boss. It fires cross patterns, arcs, flame jets and lava balls and clears material around itself. At intervals it turns unhittable inside a gravity field that gathers your shots and flings them back, and it summons flying eyes.',
    tips: [
      'Use the platforms as cover.',
      'Acid and poison work very well: it is vulnerable to material damage, and to physics collisions such as Earthquake.',
      'If a reload leaves it stuck passive and unkillable, move away from it and reload again.',
    ],
    where: 'The Laboratory, at the bottom of the main descent.',
    source: `${WIKI}Kolmisilm%C3%A4`,
    secret:
      'Beating it opens the way to The Work. Its health grows with New Game+ and the Orbs of True Knowledge you carry, and orbs change its weaknesses: acid hurts it 90% less from 4 orbs and not at all from 7, and poison halves at 9. From 12 to 16 orbs it is briefly weak to one material each (Polymorphine, Chaotic Polymorphine, Teleportatium, Acceleratium, then Flummoxium), and from 31 it is immune to Touch of spells.',
  },
  boss_dragon: {
    text: 'A huge flying worm with far better air control than a Jättimato. It deletes terrain as it moves, its bite is close to instant death, and it spits fireballs and slow green orbs.',
    tips: ['Melee Immunity blocks the bite.', 'Fight in open space: near walls the bite can kill you.'],
    source: `${WIKI}Suomuhauki`,
    secret: 'It hatches from the giant egg in the Dragoncave, east of the Underground Jungle, once you dig about a third of the way in.',
  },
  boss_ghost: {
    text: 'Moves unpredictably, launching Häive that explode for heavy damage up close and summoning Olematon. It can only be hurt while a Paha Silmä is near it, and its orbiting plasma beams grow stronger every time it takes damage.',
    tips: [
      'Keep the Paha Silmä close to it, and keep matter-destroying spells away from the eye.',
      'Avoid rapid-fire wands: its revenge plasma fills the arena.',
      'Acid can kill it outright.',
      'It is vulnerable for a few frames as it loads in, so it can be killed even without a Paha Silmä.',
      'Three or more More Love perks stop it spawning Häive all the time; hurting it, or a Berserkium stain on you, still sets them off.',
    ],
    source: `${WIKI}Unohdettu`,
    secret: 'It lives in the Forgotten Cave, west of the Snowy Chasm, and drops a Full Health Regeneration and a Sun Seed. Matter-destroying spells can destroy the seed on the ground.',
  },
  boss_ghost_polyp: {
    text: 'The minion the Forgotten fires from its mouth. It explodes for heavy damage up close, and can only be seen and hurt while a Paha Silmä is near.',
    source: `${WIKI}Unohdettu`,
  },
  ethereal_being: {
    text: 'An invisible ghost that can only be seen or hurt while a Paha Silmä is dropped near it. Unseen, it drifts as faint blue sparks dealing small Curse damage; seen, it dashes in for rapid Curse damage. It passes through walls and liquids.',
    tips: ['Drop a Paha Silmä nearby, then use Slice or Explosion damage: it is immune to projectiles and fire.'],
    source: `${WIKI}Olematon`,
  },
  boss_limbs: {
    text: 'Stays nearly immune until it opens its red inner tissue to cast. It chases you through the Pyramid, summons slimes, and fires circular bursts or slightly homing orbs, with leg pokes up close.',
    tips: ['Plasma Beam-style attacks force its shell open; fire works well.', 'Avoid homing: it homes onto the closed shell.'],
    where: 'On an altar inside the Pyramid; it wakes when you come close.',
    source: `${WIKI}Kolmisilm%C3%A4n_koipi`,
    secret: 'The book on its altar hints at where the four music machines are.',
  },
  boss_meat: {
    text: 'A spider-like heart of flesh in a round arena. While its eye is shut it fires slow and homing orbs; then it pushes out a field that destroys terrain and hurts anything touching it, leaving the eye open for a moment.',
    tips: ['The real danger is the Meat Realm’s curse on your health: attack it from outside the biome if you can.'],
    source: `${WIKI}Kolmisilm%C3%A4n_syd%C3%A4n`,
    secret: 'It lives in the western Meat Realm. Killing it lifts the realm’s health curse and drops the Saha wand.',
  },
  boss_pit: {
    text: 'Arguably the most dangerous creature in the game. It fires all-round volleys that polymorph, blind, neutralize your wands or teleport you, summons wands that shoot at you, and digs after you. Its damage protection resets on every hit and rebuilds over about two seconds.',
    tips: ['Use cover; a Projectile Repulsion Field helps a lot.', 'Use slow, heavy-hitting wands: every hit summons more wands.'],
    source: `${WIKI}Sauvojen_tuntija`,
    secret: 'It appears in the chasm east of the Lava Lake, under the bridge, after you come back from the orb room there.',
  },
  parallel_tentacles: {
    text: 'A copy of the Connoisseur of Wands: polymorphing, neutralizing, teleporting and blinding blasts, and summoned wands. Its damage protection fades after each direct hit. It drops nothing.',
    source: `${WIKI}Sauvojen_tuntija`,
    secret: 'It roams the surface of the parallel worlds.',
  },
  boss_robot: {
    text: 'A robot with a projectile-eating shield. It fires ten accelerating rockets, a long expanding plasma beam, and can summon a repair drone. Its death explosion is big.',
    tips: ['Hide from the rockets behind cover explosions can’t break.', 'Projectiles, explosions, melee and fire don’t hurt it: use slice, ice, drill, holy or electricity.'],
    where: 'Deep in the Power Plant, in a round arena.',
    source: `${WIKI}Kolmisilm%C3%A4n_silm%C3%A4`,
  },
  boss_sky: {
    text: 'A passive stone that rolls slowly after you and copies your health. Damage it takes comes back to you as Holy damage, at least as much as it received.',
    tips: ['Cessation with Increase Lifetime kills it safely: the reflected damage misses if you no longer exist.'],
    source: `${WIKI}Kivi`,
    secret: 'It waits in the Kivi Temple, above the Desert east of the Ominous Temple.',
  },
  boss_wizard: {
    text: 'A slow floating boss with random debuffs, green meteors, magic bursts and phasing spheres. Four Death Orbs make it invincible until destroyed, and four Blood Orbs send damage they take back to you as curse damage. It changes phase at half health and again at 20%.',
    tips: [
      'Shoot its head from above: the top of its hitbox is outside its projectile-deleting field.',
      'Don’t hit the Blood Orbs with big shots.',
      'Material damage (a Sea of Acid or Lava, say) and trick kills don’t trigger the Blood Orbs’ revenge.',
      'An Ambrosia stain cancels the damage the Blood Orbs send back.',
      'Melee Immunity makes the last phase trivial.',
    ],
    source: `${WIKI}Mestarien_mestari`,
    secret:
      'Its throne room is on the east edge of the eastern Wizards’ Den. It drops 600 gold, Sauvan Ydin, the book “A Cunning Contraption” and the spells Wand Refresh, Add Trigger, Add Timer, Add Expiration Trigger and Spell Duplication. Drowning it in Swamp (the last hit must be drowning, while it touches more Swamp than any other liquid) is part of the Fish Quest and unlocks Wand Homing.',
  },
  fish_giga: {
    text: 'A huge sea creature that fires piercing orbs in eight directions, and shoots back whenever it is hurt. Projectiles do nothing, and explosions, slice and melee only 1%; Holy damage hits it in full, and only while its eye is open.',
    tips: ['Use Holy damage (Holy Lance works well).'],
    source: `${WIKI}Syv%C3%A4olento`,
    secret: 'It lives at the bottom of the Lake. Killing it turns all water into smoke for the rest of the run.',
  },
  chest_mimic: {
    text: 'Looks exactly like a chest. It can’t move and doesn’t attack until you touch it, then bites for 15–25.',
    tips: ['Shoot suspicious chests open instead of touching them.', 'Hovering a real chest names it; a mimic shows nothing.'],
    where: 'In place of a chest, rarely. Never above the first Holy Mountain, so the Mines’ chests are safe.',
    source: `${WIKI}Matkija`,
  },
  chest_leggy: {
    text: 'A rarer mimic that is even harder to spot: it sleeps until you press interact on it, then grows legs and attacks.',
    tips: ['Shoot suspicious chests open instead of opening them.'],
    where: 'In place of a chest mimic, now and then.',
    source: `${WIKI}Matkija`,
    secret: 'It drops the Leggy Mutation perk.',
  },
  dark_alchemist: {
    text: 'A mimic posing as an Extra Max Health pickup. It bites for 30–40 when you come for it.',
    tips: ['A real heart names its material when you hover it; the mimic shows nothing.'],
    where: 'Very rarely, from treasure chests.',
    source: `${WIKI}Pahan_muisto`,
  },
  shaman_wind: {
    text: 'A mimic posing as a Spell Refresh. Its only attack is a bite for 30–40.',
    tips: ['A real Spell Refresh names itself when you hover it; the mimic shows nothing.'],
    where: 'Very rarely, from utility boxes and treasure chests.',
    source: `${WIKI}Valhe`,
  },
  mimic_potion: {
    text: 'Stands still looking like a green potion until you come near, then grows legs and follows you around. It does no damage.',
    tips: ['Charmed, it can be picked up and poured like a potion; it only refills with Mimicium.'],
    source: `${WIKI}Henkev%C3%A4_potu`,
    secret: 'It always appears in the Barren Temple, and rarely replaces potions on pedestals.',
  },
  coward: {
    text: 'A shielded Hiisi with no attack: its shots teleport a nearby enemy to where they land, so it pulls creatures in from other rooms.',
    tips: ['Kill it first.', 'Sustained fire, explosives or a thrown object break its shield.'],
    source: `${WIKI}Raukka`,
  },
  enlightened_alchemist: {
    text: 'Conjures large spectral wands that each cast a spell after a short delay. The sigil above it tells which: orange a meteor, purple Intense Concentrated Light, white three Pinpoints of Light, blue three Lightning Bolts.',
    source: `${WIKI}Valaistunut_alkemisti`,
  },
  failed_alchemist: {
    text: 'A slow skeletal alchemist with only a melee attack. Some carry a field that makes nearby creatures immune to all damage (not themselves).',
    tips: ['Kill the one with the field first, or lure the others away from it.'],
    source: `${WIKI}Kadotettu_alkemisti`,
  },
  failed_alchemist_b: {
    text: 'Follows you and hurts you while you stand in its field. When killed it becomes a ball of cursed flame that revives it after a few seconds unless destroyed; destroying the ball throws eight streaks of dark flame outward.',
    tips: ['The streaks fly straight and diagonally: destroy the ball from an angle between them.', 'Don’t use Black Hole near it.'],
    source: `${WIKI}Ep%C3%A4alkemisti`,
  },
  friend: {
    text: 'A friendly green blob that follows you and spits seeds, until you get close enough for a friendly kick.',
    where: 'The Friend Room, in one of six places each run.',
    source: `${WIKI}Toveri`,
    secret:
      'After you have killed a Kauhuhirviö it turns hostile, fires fast blue shots and becomes immune to most damage (Drill and Holy still work). Each Kauhuhirviö killed multiplies its health by 1.5 (nearly 30,000 after nine) and makes it attack faster. Guided into the Avarice Diamond instead, it unlocks Giga Holy Bomb and a pillar; killing it after nine Kauhuhirviö earns another pillar.',
  },
  ultimate_killer: {
    text: 'A rare green flyer with a cartoon face. When provoked it spits harmless seeds that grow into plants. Its big death explosion crumbles the ground but deals barely any damage.',
    where: 'Rarely in the Frozen Vault, and in a hidden room.',
    source: `${WIKI}Kauhuhirvi%C3%B6`,
    secret: 'The room holding fourteen of them (and a Toveri) appears in every parallel world. Guide one into the Avarice Diamond to unlock Giga Nuke and a pillar.',
  },
  fungus: {
    text: 'Wanders aimlessly, but jumps at you when you come close and explodes for 125. It also explodes when killed.',
    tips: ['Fight it from a distance.', 'It is very sensitive to fire.'],
    source: `${WIKI}Laahustussieni`,
  },
  fungus_big: {
    text: 'Wanders until you get close, then lunges and explodes on contact. It also explodes when killed.',
    tips: ['Keep your distance: its death explosion hurts.', 'Weak to fire.'],
    source: `${WIKI}Nuijamalikka`,
  },
  fungus_giga: {
    text: 'Lobs pollen balls that burst into more pollen, and sprays pollen when you are close; up close it lunges. It explodes violently when killed and senses invisible creatures.',
    tips: ['Fight from range: its pollen blocks your shots and the death blast is big.'],
    source: `${WIKI}Huhtasieni`,
  },
  gate_monster_a: GATE,
  gate_monster_b: GATE,
  gate_monster_c: GATE,
  gate_monster_d: GATE,
  giantshooter: {
    text: 'Drifts lazily toward you and bites up close. It bleeds acid that eats through terrain, spawns three slimes when its health gets low, and bursts into acid when it dies.',
    tips: ['A thrown Emerald Tablet usually kills it in one hit.', 'Stay above it or away from it to keep out of the acid.'],
    source: `${WIKI}%C3%84itinuljaska`,
  },
  iceskull: {
    text: 'Gives off freezing vapour and fires slow icy shots that freeze you. It also dashes in for melee, which takes half your health while you are frozen. Hurt, it fires twelve shots in a circle.',
    tips: ['Fight it from long range.', 'Use single big hits: every hit triggers its ring of shots.'],
    source: `${WIKI}J%C3%A4%C3%A4ti%C3%B6`,
  },
  icer: {
    text: 'A jetpack robot with an ice flamethrower that hits hard up close. Each shot leaves a cloud of freezing vapour, often worse than the shot. Unusually for a robot, poison hurts it more.',
    tips: ['Kill it quickly before its vapour fills the area.'],
    source: `${WIKI}J%C3%A4%C3%A4hdytyslaite`,
  },
  islandspirit: {
    text: 'Fires a big bouncing blue orb that halves the health of every creature near it just before it fades (armour can’t stop it). Innocent Spirits escort it, and damage you deal to it comes back to you, scaled by how many helpless animals you’ve killed.',
    tips: ['Don’t fight it up close.', 'Being polymorphed stops the reflected damage.'],
    source: `${WIKI}Tapion_vasalli`,
    secret: 'It appears once per run at the sheep statue on the Lake island, after you have killed 29 helpless animals.',
  },
  longleg: {
    text: 'Small leaping spiders in packs of up to eight. Their corpses and gold pile up and block your shots.',
    tips: ['Explosive barrels kill whole packs (trick kills pay double).', 'Fire panics them.'],
    source: `${WIKI}H%C3%A4mis`,
  },
  lukki_tiny: {
    text: 'Small spiders that swarm and hurt whatever their bodies touch. They pour out of big green nests when you attack the nests.',
    tips: ['Nests can be ignored.', 'Rapid hits on a nest draw more out than a few heavy ones.'],
    where: 'Out of green nests in the Underground Jungle and Lukki Lair, when attacked.',
    source: `${WIKI}Pikkuh%C3%A4m%C3%A4h%C3%A4kki`,
  },
  maggot_tiny: {
    text: 'A huge flying worm with 6000 HP that bleeds poisonous Ominous Liquid, fires homing shots from its body and bites hard. It is immune to projectile damage and keeps hunting you once the fight starts.',
    tips: ['Use another damage type, like Slice.', 'Melee Immunity still blocks its bite.'],
    source: `${WIKI}Limatoukka`,
    secret: 'It lies at the buried skull in the Meat Realm and drops a Tier 10 wand among other loot.',
  },
  necrobot: {
    text: 'A shielded robot on treads that fires an accelerating cursed skull. Creatures that die near it come back at half health a few seconds later, again and again. It can pick up and use wands.',
    tips: ['It is weak to electricity.', 'Kill things near it quickly, or they get back up.'],
    source: `${WIKI}Tuonelankone`,
  },
  necrobot_super: {
    text: 'A bigger, red Necrobot. Instead of reviving the fallen it turns them into Pienkätyri, tentacled minions that it can bring back without end.',
    tips: ['Destroy it before fighting its minions.'],
    source: `${WIKI}Marraskone`,
  },
  minipit: {
    text: 'A tentacled minion that flies erratically, digs through terrain and fires short-range plasma bolts that can deal over 100 damage in seconds.',
    tips: ['Destroy the Marraskone first: it keeps reviving them.'],
    where: 'Made by a Marraskone from creatures that die near it.',
    source: `${WIKI}Pienk%C3%A4tyri`,
  },
  necromancer_shop: {
    text: 'A flying skeletal guard that appears when a Holy Mountain is damaged. It fires accelerating homing explosive orbs and short-range sparks, and its shield deflects moving projectiles. Its knockback throws you around.',
    tips: ['Keep moving up and down to dodge.', 'Chain Bolt and Plasma Beam get through its shield.'],
    where: 'A Holy Mountain, when you damage it.',
    source: `${WIKI}Stevari`,
    secret: 'After three are killed, Holy Mountains send Skoude instead.',
  },
  necromancer_super: {
    text: 'A much stronger Stevari with two shields, immune to freezing and stuns. Once it notices you it dissolves all terrain around itself, fires explosive bolts that burst into bubbles, and sparks up close.',
    tips: ['Plasma Beam, especially with homing, works well.', 'The Peace with Gods perk stops new ones and charms existing ones.'],
    where: 'Holy Mountains, once the gods are angry.',
    source: `${WIKI}Skoude`,
  },
  playerghost: {
    text: 'Carries a wand you once died with, so it is as dangerous as that wand. It is hostile to everything, but turns on you when you are in range. It takes half damage from most projectiles.',
    tips: ['Slice and Explosion damage do best.', 'Kick it to make it drop its wand.'],
    where: 'Once per run in one of the main biomes, after enough of your past deaths.',
    source: `${WIKI}Kummitus`,
  },
  wand_ghost: {
    text: 'A wand animated by a spirit. It fires whatever spells it carries, which you can only learn by watching. Killing it drops the wand.',
    tips: ['Keep your distance until you know what it casts.', 'Fire doesn’t hurt it.'],
    source: `${WIKI}Taikasauva`,
  },
  scavenger_leader: {
    text: 'The largest Hiisi. It lobs pairs of grenades from range and swings its shotgun up close. As it takes damage it calls in Kranuhiisi, six in all however fast you hurt it.',
    tips: ['If you can’t kill it quickly, run.', 'Its corpse can shield its summons from your shots.'],
    source: `${WIKI}Toimari`,
  },
  berserkspirit: SPIRIT('Viha-Aave', 'Berserk'),
  confusespirit: SPIRIT('Utu-Aave', 'Confusion'),
  slimespirit: SPIRIT('Neva-Aave', 'Slimy', ' Its slime puts out fire on you.'),
  weakspirit: SPIRIT('Kaamo-Aave', 'Weakness', ' This is the most dangerous of the four: weakened, you take far more damage.'),
  thundermage_big: {
    text: 'A much stronger Ukko. It fires a slow homing Thunder Charge that deals heavy electric and explosive damage and can stun you, and leaves a live charge behind when it dies. One of the hardest-hitting creatures in the game.',
    tips: ['Don’t stand near its corpse: the charge it leaves is still live.'],
    source: `${WIKI}Suur-Ukko`,
  },
  wizard_returner: {
    text: 'Opens with a weak iceball, then copies any spell cast near it (even other creatures’) and fires the copy on a timer, ignoring the spell’s delays and modifiers.',
    tips: ['Cast something harmless near it to make it copy that.', 'A copied multi-projectile spell fires only one projectile, so spread-shot wands are safer.'],
    source: `${WIKI}Palauttajamestari`,
  },
  wizard_swapper: {
    text: 'Its homing blue orbs do no damage but swap your place with whatever they hit. It also swaps itself with anything that hurts it, so your own explosions can end up on you.',
    tips: ['Don’t use Plasma Beam on it: it swaps you into the beam.'],
    source: `${WIKI}Vaihdosmestari`,
  },
  worm_big: {
    text: 'A huge worm that eats through terrain and liquids. It fights other creatures but goes for you once near, lunging into the air to bite. Only its head hurts. Half the time it drops an Extra Max Health.',
    tips: ['Stay far away and shoot: even Spark Bolt works.'],
    source: `${WIKI}J%C3%A4ttimato`,
  },
  worm_skull: {
    text: 'A ghostly worm that moves like a Mato but passes straight through terrain without digging, so it gives little warning before it strikes. It can find you while you are invisible, and drops nothing.',
    tips: ['Melee Immunity doesn’t stop its bite: the bite is Curse damage.', 'It sometimes gets stuck looping upward; that’s your chance to finish it.'],
    source: `${WIKI}Kalmamato`,
  },
  wraith: {
    text: 'Has no attack, but its gravity field draws projectiles to it, and it chases you relentlessly. If it reaches you, every projectile around starts homing in on you.',
    tips: ['Keep your distance; even inaccurate attacks hit it.'],
    source: `${WIKI}Hyypi%C3%B6`,
  },
  wraith_glowing: {
    text: 'Follows you without attacking, but answers every damage tick from your wand with a holy-explosive beam (it needs line of sight).',
    tips: ['Use single heavy hits so it fires fewer beams.', 'Fight it around corners, or kill it with thrown objects or a frozen kick.'],
    source: `${WIKI}Hohtava_hyypi%C3%B6`,
  },
  wraith_storm: {
    text: 'Never attacks, but sits inside a permanent thunder field. Projectiles fired at it from outside bounce back as lightning bolts.',
    tips: ['Fire from inside its field, or teleport onto it.', 'Drop or kick heavy objects onto it.'],
    source: `${WIKI}Ukkoshyypi%C3%B6`,
  },
  hpcrystal: {
    text: 'A still crystal that, while you are near, heals another creature in its radius to full and briefly blocks all damage to it, every few seconds.',
    tips: ['Destroy it before fighting what it protects.'],
    source: `${WIKI}Elvytyskristalli`,
  },
  snowcrystal: {
    text: 'A crystal with a floating eye. Harmless itself, it summons a ghostly copy of an ordinary creature every 8 seconds or so while you are near. The ghosts can’t be hurt and are the real threat.',
    tips: ['Destroy the crystal first; electricity and fire hurt it most.'],
    source: `${WIKI}Haamukivi`,
  },
  basebot_neutralizer: {
    text: 'A flying robot that fires a shot slowing its target for 10 seconds, then pelts slowed targets with projectiles. Projectiles, fire and ice don’t hurt it.',
    source: `${WIKI}Pys%C3%A4ytt%C3%A4j%C3%A4`,
  },
  basebot_sentry: {
    text: 'A flying robot that marks you (or a creature it dislikes): for 20 seconds every creature attacks the marked one, and can see it even if invisible. Projectiles, fire and ice don’t hurt it.',
    tips: ['Kill it before it marks you.'],
    source: `${WIKI}Tarkkailija`,
  },
  bloodcrystal_physics: {
    text: 'A floating crystal body that drifts close to you, then fires eight energy spheres in all directions for heavy damage. Invisibility doesn’t fool it.',
    tips: ['It dies at once if its body is destroyed: a close Black Hole does it.'],
    source: `${WIKI}Verikristalli`,
  },
  statue_physics: {
    text: 'A floating mask that patrols until it spots you, then fires rotating rings of eight green plasma shots about twice a second. Invisibility doesn’t fool it.',
    tips: ['Attack from a distance.'],
    source: `${WIKI}Hohtonaamio`,
  },
  drone_shield: {
    text: 'Has no attack, but while it lives every creature near it is protected from all damage. It wears several layers of shields itself.',
    tips: ['Thrown physics objects punch through its shields fast; so does sustained fire.'],
    source: `${WIKI}Turvalennokki`,
  },
  sheep_bat: {
    text: 'A harmless flying sheep: one of the forms Polymorph can turn you into.',
    where: 'Not found in the world: it comes from Polymorph.',
    source: `${WIKI}Lentolammas`,
  },
  miner_chef: {
    text: 'A Hiisi chef that throws sausages instead of TNT. When the sausages run out it can only kick.',
    where: 'The Hiisi Base kitchen.',
    source: `${WIKI}Kokkihiisi`,
  },
  statue: {
    text: 'A statue that waits like a trap until you come close, then chases you and kicks. Most damage does nothing: melee, physics, curse and toxic damage hurt it.',
    tips: ['A thrown Emerald Tablet as it wakes can kill it outright.'],
    where: 'Ancient Laboratory and The Tower.',
    source: `${WIKI}Patsas`,
  },
  monk: {
    text: 'A robot whose two floating hands fire slow green orbs in straight lines. A hand raising two fingers is attacking; five fingers means it has lost sight of you and stopped. It can see you while you are invisible, but is slow and rarely chases.',
    tips: [
      'Each hand has 65 HP and only non-projectile damage breaks it; with both hands gone it has no attack left.',
      'There is a short pause between it spotting you and its first shot: a Magic Missile or thrown Emerald Tablet fits in that window.',
      'True Orbit mists stop its shots better than Homing mists, which chase the body instead of the hands.',
    ],
    source: `${WIKI}Munkki`,
    secret:
      'Kicking the three rock hand statues in the Snowy Depths releases Munkki: one from the first, two from the second, three from the third, which also gives the Broken Spell. The statues aren’t in parallel worlds. Bringing a statue to the Floating Island altar (with Kuu or Homebringer Teleport Bolt) earns a pillar and a unique laser drone with Munkki hands.',
  },
  ant: {
    text: 'Crawls along the ground, jumps, lunges and swims, and at close range spits a spray of acid that does heavy damage very fast.',
    tips: ['Keep your distance: everything it does is short-range.'],
    source: `${WIKI}Murkku`,
  },
  bat: {
    text: 'Drifts about until it sees you, then flies in and lunges for a bite. It usually comes with a Suurlepakko, which makes more.',
    tips: ['Kill the Suurlepakko first, or the swarm keeps growing.', 'A group can surround you and stun you over and over, even though each one is slow.'],
    source: `${WIKI}Lepakko`,
  },
  firemage_weak: {
    text: 'Patrols on foot, jumping high (often while shooting), and throws fireballs that burst on impact or where you stood. It is immune to fire, sets fire to things around it, and bleeds lava.',
    tips: [
      'Water, mud, brine, snow and ice hurt it fast, and immersion is quickly fatal. A Rain Cloud wand (common in the Mines) or a water flask dropped from above works well.',
      'Killed with water it counts as an accidental kill, worth double gold.',
      'It steers clear of deep water but misses small puddles, and it walks into Toxic Sludge, which you can purify into water.',
      'Holding Kiuaskivi in hand keeps it peaceful.',
    ],
    source: `${WIKI}Stendari`,
  },
  firemage: {
    text: 'A far stronger Stendari. It throws a large light-blue fireball in a slight arc at exactly where you are, which explodes for 50, smashes physical objects and sets a dry target on fire.',
    tips: ['Avoid it unless prepared.', 'It is extremely vulnerable to water.', 'Holding Kiuaskivi in hand keeps it peaceful.'],
    source: `${WIKI}Eldari`,
  },
  scavenger_shield: {
    text: 'Flies around shooting other creatures with a shield gun: each hit gives them a projectile shield for 10.7 s, like the Permanent Shield perk but one that doesn’t recharge.',
    tips: ['Kill it first.', 'Step into one of its shots and the shield is yours.'],
    source: `${WIKI}Kilpihiisi`,
  },
  scavenger_heal: {
    text: 'Follows other Hiisi and shoots healing bolts (+5 HP each) at any that get hurt. It has no damaging attack, but with a wand it picks up it targets its allies.',
    tips: ['Kill it quickly, especially in the Hiisi Base.', 'Charmed with Pheromone it heals you instead.'],
    source: `${WIKI}Parantajahiisi`,
  },
  scavenger_glue: {
    text: 'Comes in pairs and fires glue balls that stick you to nearby surfaces, leaving you an easy target for the other Hiisi. It charges each shot briefly first.',
    tips: ['Watch for the charge-up and move.', 'Shooting the glue breaks it faster.'],
    source: `${WIKI}Liimahiisi`,
    secret: 'It is the only Hiisi that can appear in the Power Plant.',
  },
  scavenger_poison: {
    text: 'Patrols on a jetpack and, once it sees you, fires poison shots that leave a trail of poison. It is immune to poison itself and chases fleeing targets around a few corners.',
    tips: ['Fly above its shots to stay out of the trail.', 'It needs a direct line of sight: arcing spells can chip at it from cover.', 'Toxic Immunity doesn’t protect you from its poison.'],
    source: `${WIKI}Myrkkyhiisi`,
  },
  scavenger_mine: {
    text: 'Flies about alternating between a shotgun and red mines that stick to whatever they hit. A mine blinks yellow when something comes close and explodes half a second later, for 35 and fire.',
    tips: ['Hover above its mines to keep from setting them off, or set them off on purpose.'],
    source: `${WIKI}Miinankylv%C3%A4j%C3%A4`,
  },
  lukki: {
    text: 'A sturdy spider that walks over background walls as if there were no gravity, follows you without really chasing, and jabs with its legs for heavy knockback. Its legs can find you while you are invisible. It runs once badly hurt.',
    tips: ['It eats Emerald Tablets thrown at it.', 'Unlike the long-legged Lukki, it can tunnel through terrain.'],
    source: `${WIKI}Spider`,
  },
  lukki_longleg: {
    text: 'A long-legged spider that walks over background walls, follows you without really chasing, and jabs with its legs for heavy knockback, even while you are invisible. It can’t tunnel, and runs once badly hurt.',
    source: `${WIKI}Spider`,
  },
};

// Tips that hold for a whole family of creatures, shown with each member's own tips.
type FamilyTips = { ids: string[]; tips: string[]; source: string };

const HIISI_TOXIC = [
  'miner', 'miner_weak', 'miner_fire', 'miner_hell', 'miner_santa', 'miner_chef', 'shotgunner', 'shotgunner_weak', 'shotgunner_hell',
  'sniper', 'sniper_hell', 'scavenger_smg', 'scavenger_grenade', 'scavenger_mine', 'scavenger_poison', 'scavenger_clusterbomb',
  'scavenger_leader', 'coward',
];
const HIISI_TOXIC_PROOF = ['scavenger_invis', 'scavenger_shield', 'scavenger_heal', 'scavenger_glue', 'alchemist'];

export const FAMILY_TIPS: FamilyTips[] = [
  {
    ids: HIISI_TOXIC,
    tips: ['Toxic Sludge hurts it fast, and unlike most creatures a toxic stain alone can kill it.'],
    source: `${WIKI}Hiisi`,
  },
  {
    ids: [...HIISI_TOXIC, ...HIISI_TOXIC_PROOF],
    tips: ['It picks up wands it finds. Kick the wand out of its hands; it drops one by itself once the charges run out.'],
    source: `${WIKI}Hiisi`,
  },
  {
    ids: [
      'assassin', 'basebot_hidden', 'basebot_neutralizer', 'basebot_sentry', 'basebot_soldier', 'drone_lasership', 'drone_physics', 'drone_shield',
      'flamer', 'icer', 'missilecrab', 'necrobot', 'necrobot_super', 'roboguard', 'roboguard_big', 'spearbot',
    ],
    tips: ['Like other robots it sinks in liquids. Acid, Lava and Concentrated Mana still hurt it.'],
    source: `${WIKI}Robot`,
  },
  { ids: ['basebot_hidden'], tips: ['Electricity heals it instead of hurting it.'], source: `${WIKI}Robot` },
  {
    ids: ['lukki', 'lukki_longleg', 'lukki_tiny'],
    tips: [
      'Spiders bunch up, so area spells work well; heavy hits beat rapid fire.',
      'They count as physics bodies: Burst of Air and Black Hole push and pull them.',
    ],
    source: `${WIKI}Spider`,
  },
  {
    ids: ['worm', 'worm_tiny', 'worm_big'],
    tips: [
      'Its digging can break into a Holy Mountain and anger the gods; a Worm Crystal softens the damage.',
      'Worm Pheromone, or eating Meat of an Innocent Creature, draws worms to you from farther away.',
    ],
    source: `${WIKI}Worm`,
  },
];

/** A creature's own tips, then the tips of every family it belongs to. */
export const enemyTips = (id: string): string[] => [
  ...(ENEMY_INFO[id]?.tips ?? []),
  ...FAMILY_TIPS.filter((f) => f.ids.includes(id)).flatMap((f) => f.tips),
];
