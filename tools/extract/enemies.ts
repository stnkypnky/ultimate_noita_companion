import { basename } from 'node:path';
import sharp from 'sharp';
import type { DamageType, Enemy, EnemyBehavior } from '../../src/data/types.ts';
import { comp, comps, num, type El, type EntityLoader } from './entity.ts';
import { humanize, tr, type Translations } from './translations.ts';
import { buildProjectile } from './spells.ts';
import { spriteFrame, spriteLayer, type LayerOut } from './visuals.ts';
import { parseXml } from './entity.ts';
import type { AtlasInput } from './sprites.ts';
import type { Wak } from './wak.ts';
import type { BiomeSpawns } from './spawns.ts';

const HP = 25;

/**
 * Enemies as listed on the in-game Progress screen: one icon per id in data/ui_gfx/animal_icons/.
 * The same ids name the save's stats/stats_<id>.xml files.
 */
export function enemyIconFiles(wak: Wak): string[] {
  // player.png is you (named DEBUG_NAME:player), not a creature.
  return wak.list('data/ui_gfx/animal_icons/').filter((f) => f.endsWith('.png') && !f.includes('/_') && !f.endsWith('/player.png'));
}

/** The entity file for a Progress-screen id: animals/<id>.xml, animals/<id>/<id>.xml (bosses), or anywhere. */
function entityFile(wak: Wak, id: string): string | undefined {
  const direct = [`data/entities/animals/${id}.xml`, `data/entities/animals/${id}/${id}.xml`].find((f) => wak.has(f));
  if (direct) return direct;
  const all = wak.list('data/entities/').filter((f) => f.endsWith(`/${id}.xml`));
  return all.find((f) => f.includes('/animals/')) ?? all[0];
}

/** damage_multipliers keys the game uses, mapped to our damage types. */
const MULTIPLIERS: Record<string, DamageType> = {
  projectile: 'projectile',
  explosion: 'explosion',
  melee: 'melee',
  slice: 'slice',
  fire: 'fire',
  electricity: 'electricity',
  ice: 'ice',
  drill: 'drill',
  curse: 'curse',
  holy: 'holy',
  healing: 'healing',
  radioactive: 'radioactive',
  poison: 'poison',
  physics_hit: 'physics_hit',
  overeating: 'overeating',
};

/** Tags and settings that make a creature immune to something, in plain words. */
// (teleportable_NOT and glue_NOT are on nearly every creature, so they say nothing here.)
const IMMUNE_TAGS: Record<string, string> = {
  polymorphable_NOT: 'Polymorph',
  curse_NOT: 'Curses',
  touchmagic_immunity: 'Touch spells',
};
const PROTECTION: Record<string, string> = {
  PROTECTION_FIRE: 'Fire',
  PROTECTION_RADIOACTIVITY: 'Toxic sludge',
  PROTECTION_EXPLOSION: 'Explosions',
  PROTECTION_MELEE: 'Melee',
  PROTECTION_ELECTRICITY: 'Electricity',
  PROTECTION_FREEZE: 'Freezing',
  PROTECTION_POLYMORPH: 'Polymorph',
  PROTECTION_PROJECTILE: 'Projectiles',
  PROTECTION_ALL: 'All damage',
};

/** An enemy as built here: its animation frames are still image keys (packed into the atlas afterwards). */
export type EnemyOut = Omit<Enemy, 'anims'> & { anims?: { name: string; layers: LayerOut[] }[] };
export type EnemyBuild = { enemies: EnemyOut[]; portraits: AtlasInput[]; images: Map<string, Buffer>; scripts: Map<string, string[]> };

export async function buildEnemies(
  iconFiles: string[],
  wak: Wak,
  loader: EntityLoader,
  t: Translations,
  icons: Map<string, Enemy['icon']>,
  spellNameByFile: Map<string, string>,
): Promise<EnemyBuild> {
  const portraits: AtlasInput[] = [];
  const enemies: EnemyOut[] = [];
  const images = new Map<string, Buffer>();
  const scripts = new Map<string, string[]>();
  for (const icon of iconFiles) {
    const id = basename(icon, '.png');
    const file = entityFile(wak, id);
    const e = file ? loader.load(file) : null;
    const dm = comp(e, 'DamageModelComponent');
    const ai = comp(e, 'AnimalAIComponent');
    const tags = (e?.attrs.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const hp = dm ? num(dm.attrs.max_hp, num(dm.attrs.hp, 0)) : 0;

    const enemy: EnemyOut = {
      id,
      name: tr(t, e?.attrs.name, humanize(id)),
      icon: icons.get(icon) ?? { x: 0, y: 0, w: 0, h: 0 },
      ...(dm ? { hp: round(hp * HP) } : {}),
      ...(tags.length ? { tags } : {}),
      ...(tags.includes('boss') || tags.includes('miniboss') ? { boss: true } : {}),
    };

    if (dm) {
      const mult = comp(dm, 'damage_multipliers');
      const resist: Enemy['resist'] = {};
      for (const [k, v] of Object.entries(mult?.attrs ?? {})) {
        const type = MULTIPLIERS[k];
        const n = Number(v);
        if (type && Number.isFinite(n) && n !== 1) resist[type] = n;
      }
      if (Object.keys(resist).length) enemy.resist = resist;
      // materials_that_damage / materials_how_much_damage (defaults "acid" / "0.1"): damage per frame of contact,
      // shown per second; with materials_damage_proportional_to_maxhp it's a share of max HP instead.
      const mats = (dm.attrs.materials_that_damage ?? 'acid').split(',').map((m) => m.trim());
      const amounts = (dm.attrs.materials_how_much_damage ?? '0.1').split(',');
      const proportional = dm.attrs.materials_damage_proportional_to_maxhp === '1';
      const hurt = mats
        .map((m, i) => ({ material: m, perSecond: num(amounts[i], 0) * 60 * (proportional ? 100 : HP) }))
        .filter((x) => x.material && x.perSecond > 0)
        .map((x) => ({ material: x.material, perSecond: Math.round(x.perSecond * 100) / 100, ...(proportional ? { ofMaxHp: true } : {}) }));
      if (dm.attrs.materials_damage !== '0' && hurt.length) enemy.hurtBy = hurt;
      // What it bleeds: the spray when hit (blood_spray_material, as the wiki lists it), and the particles
      // blood_material throws (default blood_fading).
      enemy.bleeds = { hit: dm.attrs.blood_material || 'blood_fading', ...(dm.attrs.blood_spray_material ? { spray: dm.attrs.blood_spray_material } : {}) };
      const traits: string[] = [];
      if (dm.attrs.air_needed === '0') traits.push("Doesn't breathe");
      if (dm.attrs.fire_probability_of_ignition === '0') traits.push("Doesn't burn");
      if (num(dm.attrs.critical_damage_resistance, 0) > 0) traits.push(`Resists critical hits (${Math.round(num(dm.attrs.critical_damage_resistance, 0) * 100)}%)`);
      if (dm.attrs.falling_damages === '0') traits.push('No fall damage');
      if (traits.length) enemy.traits = traits;
    }

    const immune = [
      ...tags.map((tag) => IMMUNE_TAGS[tag]),
      ...effects(e).map((g) => (num(g.attrs.frames, 0) < 0 ? PROTECTION[g.attrs.effect ?? ''] : undefined)),
    ].filter((x): x is string => !!x);
    if (immune.length) enemy.immune = [...new Set(immune)];

    // Gold: drop_money*.lua drops 10 × max(1, floor(max_hp)) × its multiplier (drop_money16x.lua…).
    const drop = comps(e, 'LuaComponent')
      .map((l) => String(l.attrs.script_death ?? ''))
      .find((s) => /drop_money(\d+x)?\.lua$/.test(s));
    if (drop) {
      const k = Number(drop.match(/drop_money(\d+)x\.lua$/)?.[1] ?? 1);
      enemy.gold = 10 * Math.max(1, Math.floor(hp)) * k;
    }

    const attacks: NonNullable<Enemy['attacks']> = [];
    if (ai) {
      const a = ai.attrs;
      if (a.attack_melee_enabled !== '0' && (a.attack_melee_damage_min || a.attack_melee_damage_max || a.attack_melee_max_distance)) {
        attacks.push({ kind: 'melee', damage: [round(num(a.attack_melee_damage_min, 0.4) * HP), round(num(a.attack_melee_damage_max, 0.6) * HP)] });
      }
      if (a.attack_dash_enabled === '1') attacks.push({ kind: 'dash', damage: [round(num(a.attack_dash_damage, 0.25) * HP), round(num(a.attack_dash_damage, 0.25) * HP)] });
      if (a.attack_ranged_enabled === '1') {
        const pf = a.attack_ranged_entity_file || 'data/entities/projectiles/spear.xml';
        const proj = buildProjectile(pf, loader);
        const dmg = proj ? Object.values(proj.damage).reduce((s, v) => s + (v ?? 0), 0) + (proj.explosion?.damage ?? 0) : 0;
        attacks.push({
          kind: 'ranged',
          // Named after the spell that fires the same projectile (enemy copies live outside deck/ under the same name).
          projectile: spellNameByFile.get(pf) ?? spellNameByFile.get(`data/entities/projectiles/deck/${basename(pf)}`) ?? humanize(basename(pf, '.xml')),
          ...(dmg ? { damage: [round(dmg), round(dmg)] as [number, number] } : {}),
          count: [num(a.attack_ranged_entity_count_min, 1), num(a.attack_ranged_entity_count_max, num(a.attack_ranged_entity_count_min, 1))],
          range: num(a.attack_ranged_max_distance, 160),
        });
      }
    }
    const worm = comp(e, 'WormComponent');
    if (worm) attacks.push({ kind: 'bite', damage: [round(num(worm.attrs.bite_damage, 1) * HP), round(num(worm.attrs.bite_damage, 1) * HP)] });
    if (attacks.length) enemy.attacks = attacks;

    const plat = comp(e, 'CharacterPlatformingComponent');
    const flies = tags.includes('flying') || ai?.attrs.can_fly === '1' || (!!ai && ai.attrs.can_fly === undefined && ai.attrs.can_walk === '0');
    enemy.moves = { ...(plat ? { speed: round(num(plat.attrs.run_velocity, 0)) } : {}), ...(flies ? { flies: true } : {}), ...(worm ? { digs: true } : {}) };
    const herd = comp(e, 'GenomeDataComponent')?.attrs.herd_id;
    if (herd) enemy.herd = herd;

    // A bigger picture for the detail view: the creature's main sprite, first frame.
    const sprite = mainSprite(e);
    const frame = sprite ? await spriteFrame(wak, sprite) : null;
    if (frame) portraits.push({ key: id, png: frame.png });
    if (file) enemy.file = file;

    const anims = sprite ? await animations(wak, e!, sprite, images) : [];
    if (anims.length) enemy.anims = anims;
    const behavior = behaviorOf(e, ai, loader);
    if (Object.keys(behavior).length) enemy.behavior = behavior;
    // Lua the creature runs (for finding the ones whose tricks live in scripts).
    const lua = comps(e, 'LuaComponent').flatMap((l) => Object.entries(l.attrs).filter(([k, v]) => k.startsWith('script_') && v).map(([k, v]) => `${k}=${v}`));
    if (lua.length) scripts.set(id, lua);
    enemies.push(enemy);
  }
  return { enemies, portraits, images, scripts };
}

/** Animations worth showing, in this order after the default one. */
const ANIM_ORDER = ['stand', 'idle', 'walk', 'run', 'move', 'fly', 'swim', 'jump', 'attack', 'attack_ranged', 'attack_melee', 'attack_dash', 'throw', 'fire', 'shoot', 'charge', 'eat', 'open'];
const ANIM_SKIP = /death|dead|die|corpse|ragdoll|hurt|damage|test|_old|^empty$|^none$/i;
const MAX_ANIMS = 5;
const ANIM_FRAMES = 16;
const ANIM_SIZE = 96;
const HEADS_FACING_LEFT = new Set(['data/enemies_gfx/maggot_tiny_head.xml']);

/** Named animations in a <Sprite> file (default first). */
function animNames(wak: Wak, file: string): string[] {
  if (!file.endsWith('.xml') || !wak.has(file)) return [];
  const sprite = parseXml(wak.text(file)).find((x) => x.tag === 'Sprite');
  if (!sprite) return [];
  const names = comps(sprite, 'RectAnimation').map((a) => a.attrs.name ?? '').filter((n) => n && !ANIM_SKIP.test(n));
  const uniq = [...new Set(names)];
  const def = sprite.attrs.default_animation;
  const rank = (n: string) => (n === def ? -1 : ANIM_ORDER.indexOf(n) >= 0 ? ANIM_ORDER.indexOf(n) : 100);
  return uniq.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_ANIMS);
}

/**
 * The creature's animations: its main sprite's named ones, each drawn with the entity's other visible sprites
 * that share the animation (or are still images). A worm is drawn as its head with a few body parts behind it.
 */
async function animations(wak: Wak, e: El, main: El, images: Map<string, Buffer>): Promise<{ name: string; layers: LayerOut[] }[]> {
  const file = String(main.attrs.image_file ?? '');
  const names = animNames(wak, file);
  const sprites = comps(e, 'SpriteComponent').filter(
    (s) =>
      s === main ||
      (s.attrs._enabled !== '0' && s.attrs.image_file && !s.attrs.image_file.includes('/ui_gfx/') && !notBody(s) && !SPRITE_SKIP.test(s.attrs.image_file) && !SPRITE_SKIP.test(s.attrs._tags ?? '')),
  );
  // Suomuhauki and Limatoukka move like worms too, with their own component.
  const worm = comp(e, 'WormComponent') ?? comp(e, 'BossDragonComponent');
  const held = await heldSprites(wak, e, file);
  // Noita draws lower z_index in front: draw back to front.
  const z = (s: El) => num(s.attrs.z_index, 0);
  const opts = (s: El, anim?: string) => ({
    ...(anim ? { anim } : {}),
    ox: num(s.attrs.offset_x, 0),
    oy: num(s.attrs.offset_y, 0),
    additive: s.attrs.additive === '1',
    emissive: s.attrs.emissive === '1',
    alpha: num(s.attrs.alpha, 1),
    maxFrames: ANIM_FRAMES,
    maxFrame: ANIM_SIZE,
  });
  const out: { name: string; layers: LayerOut[] }[] = [];
  for (const name of names.length ? names : ['']) {
    const layers: LayerOut[] = [];
    if (worm) {
      // Head, then body parts and the tail trailing to the left, part_distance apart.
      const gap = num(worm.attrs.part_distance, 10);
      const parts = sprites.filter((s) => s !== main);
      const body = parts.filter((s) => !/tail/.test(s.attrs.image_file!)).slice(0, 3);
      const tail = parts.find((s) => /tail/.test(s.attrs.image_file!));
      const chain = [...(tail ? [tail] : []), ...body.reverse()];
      const head = await spriteLayer(wak, file, opts(main, name || undefined), images);
      // Heads face right, except Limatoukka's: its body trails off to the right instead.
      const dir = HEADS_FACING_LEFT.has(file) ? -1 : 1;
      for (let i = 0; i < chain.length; i++) {
        const s = chain[i]!;
        // The first body part sits on the head's pivot (the head is drawn over it), so the chain stays joined.
        const shift = dir * gap * (chain.length - 1 - i);
        const l = await spriteLayer(wak, s.attrs.image_file!, opts(s, name || undefined), images);
        // spriteLayer takes the pivot from the sprite file; push it along the chain.
        if (l) layers.push({ ...l, ox: l.ox + shift });
      }
      if (head) layers.push(head);
    } else {
      // Things it holds (Märkiäinen's lantern) hang from a hotspot on its sprite, which moves with the animation.
      const hand = await Promise.all(held.map(async (h) => ({ ...h, at: (await hotspotAt(wak, file, h.hotspot, name || undefined)) ?? h.fallback })));
      const all = [...sprites.map((s) => ({ s, at: [0, 0] as [number, number] })), ...hand];
      for (const { s, at } of all.sort((a, b) => z(b.s) - z(a.s))) {
        const f = String(s.attrs.image_file);
        const isMain = s === main;
        // Other layers join only if they're still images or animate with the same name.
        if (!isMain && f.endsWith('.xml') && name && !animNames(wak, f).includes(name)) continue;
        const l = await spriteLayer(wak, f, opts(s, isMain || f.endsWith('.xml') ? name || undefined : undefined), images);
        if (l) layers.push({ ...l, ox: l.ox - at[0], oy: l.oy - at[1] });
      }
    }
    if (!layers.length) continue;
    // Many sheets copy one pose under every name (Hohtava hyypiö, Pikkumato's "eat"): keep the first.
    const pixels = (ls: LayerOut[]) => ls.flatMap((l) => l.frames.map((k) => images.get(k)));
    const same = (a: LayerOut[], b: LayerOut[]) => {
      const pa = pixels(a);
      const pb = pixels(b);
      return pa.length === pb.length && pa.every((x, i) => !!x && !!pb[i] && x.equals(pb[i]!));
    };
    if (out.some((o) => same(o.layers, layers))) continue;
    out.push({ name: name || 'still', layers });
  }
  return out;
}

type Held = { s: El; hotspot: string; fallback: [number, number] };

/**
 * Sprites on child entities pinned to one of its hotspots (InheritTransformComponent parent_hotspot_tag):
 * what it carries, like Märkiäinen's lantern.
 */
async function heldSprites(wak: Wak, e: El, mainFile: string): Promise<Held[]> {
  const out: Held[] = [];
  for (const child of comps(e, 'Entity')) {
    const tag = comp(child, 'InheritTransformComponent')?.attrs.parent_hotspot_tag;
    if (!tag) continue;
    const spot = comps(e, 'HotspotComponent').find((h) => (h.attrs._tags ?? '').split(',').map((x) => x.trim()).includes(tag));
    if (!spot?.attrs.sprite_hotspot_name || !mainFile.endsWith('.xml') || !wak.has(mainFile)) continue;
    for (const s of comps(child, 'SpriteComponent')) {
      const f = s.attrs.image_file ?? '';
      if (s.attrs._enabled === '0' || !f || f.includes('/ui_gfx/') || notBody(s) || SPRITE_SKIP.test(f) || SPRITE_SKIP.test(s.attrs._tags ?? '')) continue;
      out.push({ s, hotspot: spot.attrs.sprite_hotspot_name, fallback: [num(spot.attrs['offset.x'], 0), num(spot.attrs['offset.y'], 0)] });
    }
  }
  return out;
}

/** Where a named hotspot sits, from the creature's pivot, in the first frame of an animation: its colour in the hotspot sheet. */
async function hotspotAt(wak: Wak, spriteFile: string, name: string, anim?: string): Promise<[number, number] | null> {
  const sprite = parseXml(wak.text(spriteFile)).find((x) => x.tag === 'Sprite');
  const sheet = sprite?.attrs.hotspots_filename;
  const colour = comps(sprite ?? null, 'Hotspot').find((h) => h.attrs.name === name)?.attrs.color;
  if (!sprite || !sheet || !colour || !wak.has(sheet)) return null;
  const rgb = parseInt(colour, 16);
  const [r, g, b] = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
  const rects = comps(sprite, 'RectAnimation');
  const rect = (anim && rects.find((a) => a.attrs.name === anim)) || rects.find((a) => a.attrs.name === sprite.attrs.default_animation) || rects[0];
  const { data, info } = await sharp(wak.bytes(sheet)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = num(rect?.attrs.pos_x, 0);
  const y0 = num(rect?.attrs.pos_y, 0);
  const w = num(rect?.attrs.frame_width, info.width);
  const h = num(rect?.attrs.frame_height, info.height);
  const ox = rect?.attrs.has_offset === '1' ? num(rect.attrs.offset_x, 0) : num(sprite.attrs.offset_x, 0);
  const oy = rect?.attrs.has_offset === '1' ? num(rect.attrs.offset_y, 0) : num(sprite.attrs.offset_y, 0);
  for (let y = y0; y < Math.min(y0 + h, info.height); y++) {
    for (let x = x0; x < Math.min(x0 + w, info.width); x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3]! > 0 && data[i] === r && data[i + 1] === g && data[i + 2] === b) return [x - x0 - ox, y - y0 - oy];
    }
  }
  return null;
}

/** Its lasting effects, including those on child entities (Kalmamato's freeze protection sits on one). */
const effects = (e: El | null) => [...comps(e, 'GameEffectComponent'), ...comps(e, 'Entity').flatMap((c) => comps(c, 'GameEffectComponent'))];

// glow/light but not wraith_glowing or a lightning mage: those are the creature.
const SPRITE_SKIP = /health_bar|shield|glow(?!ing)|light(?!ning)|outline|aura|_emissive|hotspot|fog_of_war/;
/** Sprites that aren't the creature: the hole it punches in the fog of war, and the like. */
const notBody = (s: El) => s.attrs.fog_of_war_hole === '1' || /fog_of_war/.test(s.attrs.image_file ?? '');

/** Plain facts from its AI and parts; the app turns them into sentences. */
function behaviorOf(e: El | null, ai: El | undefined, loader: EntityLoader): EnemyBehavior {
  const b: EnemyBehavior = {};
  const a = ai?.attrs ?? {};
  if (ai) {
    if (a.sense_creatures !== '0') b.sight = num(a.creature_detection_range_x, 50);
    if (a.sense_creatures_through_walls === '1') b.throughWalls = true;
    if (a.hide_from_prey === '1') b.hides = true;
    const canFly = a.can_fly !== '0';
    const flee = num(a.escape_if_damaged_probability, 30);
    if (!canFly && flee > 0) b.flees = flee;
    if (a.attack_ranged_enabled === '1') {
      if (a.attack_ranged_predict === '1') b.predicts = true;
      const min = num(a.attack_ranged_min_distance, 10);
      if (min > 20) b.minRange = min;
      if (a.attack_ranged_use_message === '1') b.wand = true;
      const proj = buildProjectile(a.attack_ranged_entity_file || 'data/entities/projectiles/spear.xml', loader);
      const fx = (proj?.effects ?? []).map((x) => x.replace(/\.xml$/, ''));
      if (fx.length) b.inflicts = [...new Set(fx)];
    }
    if (a.tries_to_ranged_attack_friends === '1') b.helpsFriends = true;
    if (a.can_fly === '0' && a.can_walk === '0') b.immobile = true;
  }
  if (comp(e, 'AdvancedFishAIComponent') || comp(e, 'FishAIComponent')) b.swims = true;
  if (comp(e, 'TeleportComponent') || comps(e, 'LuaComponent').some((l) => /teleport/i.test(Object.values(l.attrs).join(' ')))) b.teleports = true;
  if (comp(e, 'ItemPickUpperComponent')) b.picksUp = true;
  if (comp(e, 'EnergyShieldComponent')) b.shield = true;
  if (comp(e, 'PhysicsAIComponent')) b.physics = true;
  if (effects(e).some((g) => g.attrs.effect === 'INVISIBILITY' && num(g.attrs.frames, 0) < 0)) b.invisible = true;
  if (comp(e, 'CellEaterComponent') || comp(e, 'WormComponent')) b.eats = true;
  const near = comp(e, 'DamageNearbyEntitiesComponent');
  if (near) b.aura = { damage: round(num(near.attrs.damage, 0.1) * HP), type: (near.attrs.damage_type ?? 'DAMAGE_MELEE').replace(/^DAMAGE_/, '').toLowerCase(), radius: num(near.attrs.radius, 10) };
  const deathScripts = comps(e, 'LuaComponent').map((l) => String(l.attrs.script_death ?? '')).filter(Boolean);
  if (comp(e, 'ExplodeOnDamageComponent') || deathScripts.some((s) => /explo/i.test(s))) b.explodes = true;

  return b;
}

/** The sprite that shows the creature itself (not its health bar, shield or glow). */
function mainSprite(e: El | null): El | undefined {
  const sprites = comps(e, 'SpriteComponent').filter((s) => s.attrs._enabled !== '0' && s.attrs.image_file && !s.attrs.image_file.includes('/ui_gfx/') && !notBody(s));
  const skip = /health_bar|shield|glow(?!ing)|light(?!ning)|emissive|outline|aura/;
  return sprites.find((s) => !skip.test(s.attrs.image_file!) && !skip.test(s.attrs._tags ?? '')) ?? sprites[0];
}

/** Two decimals: the wiki quotes 12.5 health and 6.25 damage. */
const round = (n: number) => Math.round(n * 100) / 100;

/** Not a family: every boss starts with boss_, and these words are shared by unrelated creatures. */
const NOT_FAMILY = new Set(['boss', 'chest', 'effect', 'giant', 'big', 'mage', 'ghost', 'statue', 'friend']);

/**
 * What ties creatures together: the biomes that spawn them, their family (same first word in the id:
 * shotgunner/shotgunner_weak, the scavenger_* Hiisi, the worms), and how their herds get along.
 */
export function linkEnemies(enemies: EnemyOut[], biomes: BiomeSpawns[], relationsCsv: string) {
  const byFile = new Map(enemies.filter((e) => e.file).map((e) => [e.file!, e]));
  const byId = new Map(enemies.map((e) => [e.id, e]));
  // Biomes also spawn their own copies (animals/crypt/worm_skull.xml): the creature of the same name.
  const enemyOf = (file: string) => byFile.get(file) ?? (file.includes('/animals/') ? byId.get(basename(file, '.xml')) : undefined);
  const SHOWN_SHARE = 0.001;
  for (const b of biomes) {
    const best = new Map<EnemyOut, { share: number; count: [number, number] }>();
    for (const x of b.entries) {
      const e = enemyOf(x.file);
      if (!e || x.share < SHOWN_SHARE) continue;
      const was = best.get(e);
      best.set(e, was ? { share: Math.max(was.share, x.share), count: [Math.min(was.count[0], x.count[0]), Math.max(was.count[1], x.count[1])] } : { share: x.share, count: [...x.count] });
    }
    for (const [e, s] of best) (e.spawns ??= []).push({ biome: b.id, name: b.name, share: Math.round(s.share * 1000) / 1000, count: [Math.max(1, s.count[0]), Math.max(1, s.count[1])] });
  }
  for (const e of enemies) e.spawns?.sort((a, b) => b.share - a.share);

  const family = (id: string) => (id.includes('_') ? id.split('_')[0]! : id);
  const groups = new Map<string, string[]>();
  for (const e of enemies) {
    const f = family(e.id);
    if (!NOT_FAMILY.has(f)) groups.set(f, [...(groups.get(f) ?? []), e.id]);
  }
  for (const e of enemies) {
    const g = groups.get(family(e.id));
    if (g && g.length > 1) e.variants = g.filter((x) => x !== e.id);
  }

  // genome_relations.csv: row herd's feeling towards each column herd, 0 (hostile) to 100 (friendly).
  const rows = relationsCsv.trim().split(/\r?\n/).map((l) => l.split(',').map((s) => s.trim()));
  const head = rows[0]!.slice(1);
  const feel = new Map(rows.slice(1).map((r) => [r[0]!, new Map(head.map((h, i) => [h, Number(r[i + 1])]))]));
  const herds = new Set(enemies.map((e) => e.herd).filter(Boolean));
  for (const e of enemies) {
    const mine = e.herd ? feel.get(e.herd) : undefined;
    if (!mine) continue;
    const allies: string[] = [];
    const foes: string[] = [];
    for (const [h, v] of mine) {
      if (h === e.herd || !herds.has(h) || !Number.isFinite(v)) continue;
      if (v >= 80) allies.push(h);
      else if (v <= 0) foes.push(h);
    }
    e.relations = { allies, foes };
  }
}