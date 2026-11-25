// Hidden mechanics for items: what they actually do once kicked, thrown, held or opened. The item page
// shows only the game's own hint; these sit behind "Show hidden mechanics". Read from the game's scripts
// (path given) or noita.wiki.gg. Timings are frames at 60 fps.
import type { MechanicNote } from './mechanics';

const WIKI = 'https://noita.wiki.gg/wiki/';
type Entries = Record<`item:${string}`, MechanicNote[]>;

const n = (text: string, source: string, secret?: boolean): MechanicNote => (secret ? { text, source, secret } : { text, source });

// ── Chests ────────────────────────────────────────────────────────────────────────────────
const SPOTS = 'data/scripts/biome_scripts.lua';
const fixed = (file: string) =>
  n('Its contents are fixed by where it sits in the world: reloading, or breaking it instead of opening it, won’t change them.', `data/scripts/items/${file}.lua`);

function chests(): Entries {
  return {
    'item:chest_random': [
      n('Chests share their spawn spots with hearts: a spot holds a heart 30% of the time, a chest 40%, and nothing otherwise.', SPOTS),
      n('Deeper than the first few areas, 1 in 10 of those chests is a mimic that attacks when you come close.', SPOTS),
      fixed('chest_random'),
      n('Under the Greed curse, its Chaos die becomes a Greed Die and its Shiny orb a Cruel Orb.', 'data/scripts/items/chest_random.lua', true),
    ],
    'item:chest_random_super': [
      n('Only 1 in 1000 chest spots holds one. Some bosses and special spots also drop one, and a lucky Greed Die roll gives two.', SPOTS),
      fixed('chest_random_super'),
      n('Under the Greed curse, some Mines spots that always hold a chest give a Great treasure chest 1 time in 50 instead of 1 in 1000.', `${WIKI}Eternal_Wealth`, true),
      n('Before anything else it has a 1 in 100,001 chance of holding the Sampo.', 'data/scripts/items/chest_random_super.lua', true),
    ],
    'item:chest_leggy': [
      n('Touching it, kicking it, damaging it or just walking near it turns it into a Leggy mimic.', 'data/scripts/items/chest_leggy.lua'),
      n('Of the mimics that take a chest spot, 1 in 20 is this one; the rest are ordinary chest mimics. A warning sign is sometimes painted nearby (1 in 30 by a mimic, 1 in 300 by a real chest).', SPOTS),
    ],
    'item:heart': [
      n('On Valentine’s Day (14 February), heart spots hold a heart 65% of the time instead of 30%, and a chest only 5%.', SPOTS),
      n('Which spot holds a heart is fixed by its position in the world, like chest contents.', SPOTS),
    ],
    'item:utility_box': [
      n('Found in a few special places, and some fall from the sky.', 'data/scripts/items/utility_box.lua'),
      fixed('utility_box'),
    ],
  };
}

// ── Eggs (data/scripts/items/egg_hatch.lua) ───────────────────────────────────────────────
const HATCH = 'data/scripts/items/egg_hatch.lua';
const SPAWNS = 'data/scripts/item_spawnlists.lua';
const breaks = n('It breaks when it hits something hard (above 80 px/s) or takes damage, so a gentle drop won’t open it.', HATCH);
const tame = n('Hatchlings are charmed for good: they fight on your side, have 4× their normal max HP, and drop no gold when they die.', HATCH);
const sameSpot = n('What hatches is decided by where the egg breaks: the same spot always hatches the same thing.', HATCH);

function eggs(): Entries {
  return {
    'item:egg_monster': [
      n('It hatches one Hurtta (77%) or two (23%).', HATCH),
      tame,
      breaks,
      sameSpot,
      n(
        'The Summon Egg spell casts one of four eggs at random: this one, a Slimy egg, a Toasty egg, or a look-alike Egg that hatches three Lepakko (67%), a Pikkuturso (29%) or a Turso (4%).',
        'data/scripts/gun/gun_actions.lua',
      ),
      n('About 2% of ordinary potion spots hold one instead, and 7% in the Ancient Laboratory.', SPAWNS),
    ],
    'item:egg_slime': [
      n('It hatches one Limanuljaska (77%) or two (23%), the kind with harmless slime.', HATCH),
      tame,
      breaks,
      sameSpot,
      n('About 4% of ordinary potion spots hold one instead. The Summon Egg spell can cast it too.', SPAWNS),
    ],
    'item:egg_fire': [
      n('It hatches three Pikkutulikärpänen (77%) or one Suurtulikärpänen (23%).', HATCH),
      tame,
      breaks,
      sameSpot,
      n('Found in the Ancient Laboratory (about 3.5% of its potion spots), or cast by the Summon Egg spell.', SPAWNS),
    ],
    'item:egg_purple': [
      n('Despite its name, it hatches spiders: three Hämis (67%), four (29%) or five (4%).', HATCH),
      tame,
      breaks,
      sameSpot,
      n('About 1% of ordinary potion spots hold one, 3.5% in the Ancient Laboratory, and rarely the Giant tree’s egg spots.', SPAWNS),
    ],
    'item:egg_worm': [
      n('It hatches a Pikkumato (67%), a Mato (29%) or a Jättimato (4%).', HATCH),
      n('Unlike every other egg, its worm is not charmed: it’s a normal hostile worm at normal HP, and it drops gold.', HATCH),
      breaks,
      sameSpot,
      n('Found in the egg spots of the Giant tree.', 'data/scripts/biomes/mountain_tree.lua'),
    ],
    'item:egg_hollow': [
      n('Nothing hatches: it bursts for 5 damage. Cast by the Summon Hollow Egg spell, it fires the next spell in the wand where it breaks.', 'data/scripts/gun/gun_actions.lua'),
      n('Catch it before it lands and the spell stays inside, so you can carry spell grenades. The stored spell is lost when you save and quit.', `${WIKI}Hollow_Egg`),
      n('Eggs in your inventory crack open if you die or are polymorphed, so a stored Chunk of Soil or Circle of Shielding can save you.', `${WIKI}Hollow_Egg`),
      n('Add Explosive Projectile for a 325-damage grenade. Kills from a stored spell count as trick kills.', `${WIKI}Hollow_Egg`),
    ],
  };
}

// ── Dice ──────────────────────────────────────────────────────────────────────────────────
const ROLL = 'data/scripts/items/die_roll.lua';
const rolls = n('It rolls when kicked, when anything damages it, or when you put it down from your inventory. The result lands about 1.7 s later.', ROLL);
const neverBreaks = n('It has 9999 HP, so you can keep rolling it. An explosive face can knock it about and roll it again.', `${WIKI}Chaos_Die`);

function dice(): Entries {
  const chaos = 'data/scripts/items/die_status.lua';
  const greed = 'data/scripts/items/greed_die_status.lua';
  return {
    'item:physics_die': [
      rolls,
      n(
        'Each face is 16.5%: ① 32 ice bolts all around it, ② 12 lightning bolts, ③ 8 fireballs, ④ 24 lasers, ⑤ 8 Laahustussieni (they drop no gold), ⑥ 10 tentacles.',
        chaos,
      ),
      n('1 roll in 100 is special: a smile (0.5%) casts a long Circle of Vigour, a frown (0.5%) a Circle of Acid that ignores walls.', chaos),
      n('Its shots fly out in every direction and can hit you: kick it and back off, or roll it from afar.', chaos),
      neverBreaks,
      n('Under the Greed curse it’s replaced by a Greed Die.', SPAWNS, true),
    ],
    'item:physics_greed_die': [
      rolls,
      n(
        'Each face is 16.5%: ① 4 giant black holes, ② 12 green meteors, ③ 16 laser-emitter orbs, ④ 16 gold nuggets of 10, ⑤ 12 of 50, ⑥ 8 of 200 (1600 gold).',
        greed,
      ),
      n('1 roll in 100 is special and ends the die: a frown (0.5%) shoots 16 large discs, a smile (0.5%) drops two Great treasure chests.', greed),
      n('It replaces the Chaos die everywhere while the Greed curse is on.', SPAWNS),
    ],
  };
}

// ── Stones and other curiosities ──────────────────────────────────────────────────────────
function curiosities(): Entries {
  return {
    'item:beamstone': [
      n('Kick it while it lies on the ground: it vanishes and, a few seconds later, a beam strikes from the sky there. Kicking it does nothing while it’s in your inventory.', 'data/scripts/items/beamstone_kick.lua'),
      n('The beam deals 500 damage to anything in it and wipes out every solid above, however hard, even off-screen: a way back to the surface. Step aside before it lands.', `${WIKI}Summon_S%C3%A4dekivi`),
    ],
    'item:broken_wand': [
      n('Throw it: 1 s later it starts firing, 18 shots one every 0.2 s, kicked about by its own recoil.', 'data/scripts/items/broken_wand_spells.lua'),
      n('Each throw picks one spell for all 18 shots: Spark bolt (1 in 3), Arrow, Magic arrow, Bubble spark or Disc projectile (1 in 6 each). Its shots can hit you.', 'data/scripts/items/broken_wand_spells.lua'),
      n('Picking it up and throwing again reloads all 18 shots.', 'data/scripts/items/broken_wand_throw.lua'),
      n('Thrown onto the Hiisi Anvil it’s repaired into a strong tier 5+ wand.', `${WIKI}Broken_Wand`, true),
    ],
    'item:summon_portal_broken': [
      n('Comes from kicking the three hand statues in the Snowy Depths (which also brings out Munkki).', `${WIKI}Broken_Spell`),
      n('Repaired at the Hiisi Anvil it becomes Summon Portal, needed for The End of Everything.', `${WIKI}Broken_Spell`, true),
    ],
    'item:evil_eye': [
      n('Held or thrown, it fires a short red plasma beam: it digs through most materials and burns any creature it touches. Once picked up, the beam stays on even when dropped.', 'data/scripts/items/evil_eye_beam.lua'),
      n('Holding it near a hidden-platform spot (within 200 px) makes invisible platforms appear and solid while you hold it. It also reveals some invisible enemies.', 'data/scripts/items/evil_eye_state.lua'),
      n('Damaging things with it doesn’t break Invisibility.', `${WIKI}Paha_Silm%C3%A4`),
      n('Its platforms lead to the cloudscapes: from the music machine by the Lake, and from the top of the Pyramid.', `${WIKI}Paha_Silm%C3%A4`, true),
    ],
    'item:moon': [
      n('It pulls projectiles and physics objects within 96 px towards itself, harder the closer they are (it stops pulling inside 12 px). It only works on screen.', 'data/scripts/items/moon.lua'),
      n('It hovers above the ground instead of falling. Useful for fishing gold out of acid or lava and drawing slow enemy shots away from you.', `${WIKI}Kuu`),
      n('With Kuulokivi it can move Uusi Aurinko.', `${WIKI}Kuu`, true),
    ],
    'item:musicstone': [
      n('While you hold it, the music of the area plays, slowly rising to its battle track.', `${WIKI}Kuulokivi`),
      n('It pulls on celestial bodies: with Kuu it can move Uusi Aurinko.', `${WIKI}Kuulokivi`, true),
    ],
    'item:poopstone': [
      n('Held in hand, it gives you food poisoning, poison and Slimy: it slowly hurts you and makes you vomit.', 'data/scripts/items/poopstone.lua'),
      n('Held, every third of a second it stains enemies within 160 px with excrement and gives them the same effects for 5 s.', 'data/scripts/items/poopstone.lua'),
      n('Held or lying around, it turns liquids, powders and molten materials within 64 px into excrement. It can drain lava and clear Polymorphine.', `${WIKI}Kakkakikkare`),
      n('An Essence Eater turns Essence of Spirits into one.', `${WIKI}Kakkakikkare`, true),
      n('Brought to the Sun quest, it corrupts it into the Dark Sun.', `${WIKI}Kakkakikkare`, true),
    ],
    'item:stonestone': [
      n('Held or lying around, it turns earth-type solids within 48 px into soft soil: easy digging, but don’t use it in a Holy Mountain, where converted brickwork angers the gods.', `${WIKI}Tannerkivi`),
      n('Kicking it, or kicking while you carry it, sets off a small earthquake that can bury you.', 'data/scripts/items/stonestone.lua'),
      n('An Essence Eater turns Essence of Earth into one.', `${WIKI}Tannerkivi`, true),
    ],
    'item:thunderstone': [
      n('In hand, you’re immune to electricity and Ukko and Suur Ukko won’t attack you. Swap away or throw it and the immunity ends at once.', `${WIKI}Ukkoskivi`),
      n('It keeps sending shocks through anything conductive it touches (water, metal), stunning creatures and setting off traps. Don’t throw it into the pool you’re standing in.', `${WIKI}Ukkoskivi`),
      n('Open chests that sit in water from a distance: one can hold an Ukkoskivi.', `${WIKI}Ukkoskivi`),
      n('An Essence Eater turns Essence of Air into one.', `${WIKI}Ukkoskivi`, true),
    ],
    'item:wandstone': [
      n('While you hold it you can edit wands anywhere, like Tinker with Wands Everywhere (it cancels out No Wand Tinkering).', `${WIKI}Sauvan_Ydin`),
      n('Held or lying around, it turns ordinary liquids within 64 px into Concentrated Mana. Swim through lava lakes with it, or pair it with a water spell for endless mana.', `${WIKI}Sauvan_Ydin`),
    ],
    'item:safe_haven': [
      n('Throw it: about 2 s later it starts to glow, and at about 3.7 s a small hut appears where it landed.', 'data/scripts/items/safe_haven_spawn.lua'),
      n('The hut fills with up to 20 healing bolts that together restore 60% of your max HP. Uncollected ones fade after 4.5 s.', 'data/scripts/items/safe_haven_spawn.lua'),
      n('The hut has a bed, a table, a lantern and an explosive box: don’t fight inside it.', 'data/scripts/items/safe_haven_spawn.lua'),
    ],
    'item:gourd': [
      n('Breaking it releases a small healing field for about 2 s: Regeneration for anything inside, worth about half its max HP. Enemies inside heal too.', `${WIKI}Refreshing_Gourd`),
      n('Found in the Gourd room at the far west of the Cloudscape, and in the Friend room.', `${WIKI}Refreshing_Gourd`, true),
    ],
    'item:greed_curse': [
      n('Picking it up triples the gold enemies drop and opens a portal back to the top of the Mines.', `${WIKI}Eternal_Wealth`),
      n('A few seconds later the curse starts: every couple of seconds, solids around you turn into Greed-cursed rock and liquids and sand into Greed-cursed liquid, both of which hurt to touch.', 'data/scripts/status_effects/effect_curse_radioactive.lua'),
      n('The curse pauses while you’re in an unvisited Holy Mountain or The Work, then returns about 5 s after you leave.', 'data/scripts/magic/greed_curse/check_biome.lua'),
      n('Shiny orbs become Cruel Orbs and Chaos dice become Greed Dice while it lasts.', 'data/scripts/item_spawnlists.lua'),
      n('Unvisited Holy Mountains hold a Greed-cursed crystal behind the left statue: break it to lift the curse for good (cursed ground stays). Sacrifice it at the altar for a gold-dropping meteor rain.', `${WIKI}Eternal_Wealth`, true),
      n('Winning while cursed, or entering the Avarice Diamond in the Tower while cursed, earns pillars (and Divide By 10).', `${WIKI}Eternal_Wealth`, true),
    ],
  };
}

// ── Essences (data/scripts/essences/) ─────────────────────────────────────────────────────
const EATER = (stone: string) => n(`An Essence Eater removes it and gives you a ${stone}. Each eater works once.`, `${WIKI}Essences`);

function essences(): Entries {
  const e = (f: string) => `data/scripts/essences/${f}.lua`;
  return {
    'item:essence_fire': [
      n('Every 2 s a fiery explosion goes off around you. It doesn’t hurt you directly, but sets you on fire and sets off nearby explosives.', e('fire')),
      n('Taking it makes you take 1.3× projectile and explosion damage for the rest of the run, even after it’s removed.', e('essence_pickup')),
      EATER('Kiuaskivi'),
    ],
    'item:essence_laser': [
      n('Every 2 s it fires 8 small explosive bolts in a ring around you. They dig terrain and can hurt you without Explosion immunity.', e('laser')),
      EATER('Tannerkivi'),
    ],
    'item:essence_air': [
      n('Every 0.67 s it fires 16 bursts of air in a ring, pushing away enemies, powders and objects. It breaks flasks and sets off fragile explosives near you.', e('air')),
      EATER('Ukkoskivi'),
    ],
    'item:essence_water': [
      n('Every 1.7 s it fires one shot in a random direction; where it hits, terrain and physics objects turn into lava. Standing still repeats the same shot.', e('water')),
      n('It doesn’t hurt you or most enemies, but it’s easy to get stuck in the rock it leaves. Freeze Field makes it far safer.', `${WIKI}Essences`),
      EATER('Vuoksikivi'),
    ],
    'item:essence_alcohol': [
      n('You’re permanently drunk, and every projectile you fire leaves a trail of flammable whiskey.', e('essence_pickup')),
      n('The whiskey keeps catching fire around you: Fire immunity (or Freeze Field) and Breathless help a lot.', `${WIKI}Essences`),
      EATER('Kakkakikkare'),
    ],
  };
}

// ── The Sun quest ─────────────────────────────────────────────────────────────────────────
function sun(): Entries {
  const src = `${WIKI}Sun_Quest`;
  return {
    'item:sunseed': [
      n('Dropped by Unohdettu, the ghost of the Forgotten Cave. Matter-destroying spells can destroy it while it lies on the ground.', `${WIKI}Unohdettu`),
      n('While you hold it you see as with the All-Seeing Eye, which also lifts magical darkness.', `${WIKI}Auringonsiemen`),
      n('It turns nearby powders into exploding Gunpowder (metal powders excepted) and quickly destroys coal and blue sand.', `${WIKI}Auringonsiemen`),
      n('Drop it on top of the Pyramid and it explodes into Aurinkokivi. The blast can fling the stone into the sand; a pool of non-evaporating liquid like blood up there helps.', src),
    ],
    'item:sunstone': [
      n('Lying around or in hand it curses anything nearby; tucked in your inventory it’s harmless.', src),
      n('A big enough explosion within about 130 px turns it into Auringonmuna (several blasts must land within 0.8 s). Walls don’t block it. Move it first: the egg is much harder to carry.', src),
    ],
  };
}

export const ITEM_MECHANICS: Entries = { ...chests(), ...eggs(), ...dice(), ...curiosities(), ...essences(), ...sun() };
