import { basename } from 'node:path';
import sharp from 'sharp';
import type { Chain, DamageType, Enemy, EnemyBehavior, Legs, Motion } from '../../src/data/types.ts';
import { comp, comps, num, type El, type EntityLoader } from './entity.ts';
import { humanize, tr, type Translations } from './translations.ts';
import { buildProjectile } from './spells.ts';
import { spriteFrame, spriteLayer, type LayerOut } from './visuals.ts';
import { parseXml } from './entity.ts';
import type { AtlasInput } from './sprites.ts';
import { normalize, type Wak } from './wak.ts';
import type { BiomeSpawns } from './spawns.ts';

const HP = 25;

/**
 * Enemies as listed on the in-game Progress screen: one icon per id in data/ui_gfx/animal_icons/.
 * The same ids name the save's stats/stats_<id>.xml files.
 */
export function enemyIconFiles(wak: Wak): string[] {
  // player.png is you, Mina: the Progress screen lists her too.
  return wak.list('data/ui_gfx/animal_icons/').filter((f) => f.endsWith('.png') && !f.includes('/_'));
}

/** Entity names the game leaves as debug text: the player entity is "DEBUG_NAME:player". */
const NAMES: Record<string, string> = { player: 'Mina' };

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
/**
 * Lasting effects that make it weaker to something. ALLERGY_RADIOACTIVE is the Hiisi's: Toxic Sludge hurts them fast,
 * and unlike other creatures a toxic stain alone can kill them (wiki: Hiisi, Toxic Sludge). The files give no number.
 */
const WEAK_EFFECTS: Record<string, string> = {
  ALLERGY_RADIOACTIVE: 'Toxic sludge',
};

/** An enemy as built here: its animation frames and leg images are still image keys (packed into the atlas afterwards). */
export type LegsOut = Omit<Legs, 'upper' | 'lower' | 'lowerRight' | 'knee' | 'attacker'> & {
  upper: string;
  lower: string;
  lowerRight?: string;
  knee?: string;
  attacker?: { reach: number; radius: number; upper: string; lower: string; joint?: string };
};
/** A chain as built here: its pieces' images are still image keys. */
export type ChainOut = Omit<Chain, 'pieces'> & { pieces: { key: string; ox: number; oy: number }[] };
export type EnemyOut = Omit<Enemy, 'anims' | 'legs' | 'chains'> & {
  anims?: { name: string; layers: LayerOut[]; motion?: Motion }[];
  legs?: LegsOut;
  chains?: ChainOut[];
};
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
      // The Progress screen's own name first: chest_leggy.xml calls itself $animal_lukki (Hämähäkki), but it's Jalkamatkatavara.
      name: NAMES[id] ?? t.get(`animal_${id}`) ?? tr(t, e?.attrs.name, humanize(id)),
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
    const weak = effects(e)
      .map((g) => (num(g.attrs.frames, 0) < 0 ? WEAK_EFFECTS[g.attrs.effect ?? ''] : undefined))
      .filter((x): x is string => !!x);
    if (weak.length) enemy.weakTo = [...new Set(weak)];

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

    const anims = sprite ? await animations(wak, e!, sprite, images, loader) : [];
    // Physics bodies draw their image from the physics shape: alone, or under their sprite (the Healer drone's glow,
    // the potion mimic's face).
    const body = e && (!anims.length || comp(e, 'PhysicsImageShapeComponent')) ? await stillBody(wak, e, tags, images) : null;
    if (body && !anims.length) anims.push({ name: 'still', layers: [body] });
    else if (body) for (const a of anims) a.layers.unshift(body);
    const legs = e ? await legsOf(wak, e, loader, images) : undefined;
    if (legs) enemy.legs = legs;
    const chains = e && anims.length ? await chainsOf(wak, e, sprite, loader, images) : [];
    if (chains.length) enemy.chains = chains;
    const behavior = behaviorOf(e, ai, loader);
    if (anims.length) enemy.anims = withMotion(anims, e, legs, behavior);
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
/** Layers (head, tail and body parts) from which a worm swims a loop rather than wriggling in a line. */
const LONG_WORM = 9;

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
async function animations(wak: Wak, e: El, main: El, images: Map<string, Buffer>, loader: EntityLoader): Promise<{ name: string; layers: LayerOut[] }[]> {
  const file = String(main.attrs.image_file ?? '');
  const names = animNames(wak, file);
  // A creature made of parts on child entities (the Leviathan's eye and tentacles), when its own sprite has no animations.
  const parts = names.length ? [] : partSprites(e, loader);
  const sprites = comps(e, 'SpriteComponent').filter(
    (s) =>
      s === main ||
      (s.attrs._enabled !== '0' && s.attrs.image_file && !s.attrs.image_file.includes('/ui_gfx/') && !notBody(s) && !SPRITE_SKIP.test(s.attrs.image_file) && !SPRITE_SKIP.test(s.attrs._tags ?? '')),
  );
  // Suomuhauki and Limatoukka move like worms too, with their own component.
  const worm = comp(e, 'WormComponent') ?? comp(e, 'BossDragonComponent');
  const held = await heldSprites(wak, e, file);
  const loose = looseSprites(e);
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
      // Head, then every body part and the tail trailing to the left, part_distance apart, as long as in the game.
      const gap = num(worm.attrs.part_distance, 10);
      const parts = sprites.filter((s) => s !== main);
      const body = parts.filter((s) => !/tail/.test(s.attrs.image_file!));
      const tail = parts.find((s) => /tail/.test(s.attrs.image_file!));
      const chain = [...(tail ? [tail] : []), ...body.reverse()];
      // Head sprites face left, like the tails taper left; the game turns the head to where it's going, so it's
      // mirrored to lead the body.
      const head = await spriteLayer(wak, file, { ...opts(main, name || undefined), sx: -1 }, images);
      for (let i = 0; i < chain.length; i++) {
        const s = chain[i]!;
        // The first body part sits on the head's pivot (the head is drawn over it), so the chain stays joined.
        const shift = gap * (chain.length - 1 - i);
        const l = await spriteLayer(wak, s.attrs.image_file!, opts(s, name || undefined), images);
        // spriteLayer takes the pivot from the sprite file; push it along the chain.
        if (l) layers.push({ ...l, ox: l.ox + shift });
      }
      if (head) layers.push(head);
    } else {
      // Things it holds (Märkiäinen's lantern) hang from a hotspot on its sprite, which moves with the animation.
      const hand = await Promise.all(held.map(async (h) => ({ ...h, at: (await hotspotAt(wak, file, h.hotspot, name || undefined)) ?? h.fallback })));
      // Held things and loose parts are always there, in their own pose when they don't share the animation (Mina's
      // arm has "default" and "down", not her "walk").
      const always = new Set<El>([...hand, ...loose].map((x) => x.s));
      const all = [...sprites.map((s) => ({ s, at: [0, 0] as [number, number] })), ...hand, ...parts, ...loose];
      // Emissive sprites are drawn in their own pass over everything else (eyes, lamps).
      const glow = (s: El) => (s.attrs.emissive === '1' || /_emissive/.test(s.attrs.image_file ?? '') ? 1 : 0);
      for (const { s, at } of all.sort((a, b) => glow(a.s) - glow(b.s) || z(b.s) - z(a.s))) {
        const f = String(s.attrs.image_file);
        const isMain = s === main;
        // Other layers join only if they're still images or animate with the same name.
        if (!isMain && !always.has(s) && f.endsWith('.xml') && name && !animNames(wak, f).includes(name)) continue;
        // A part with no shared name plays its first animation that moves (the Leviathan's eye opening).
        const anim = isMain || f.endsWith('.xml') ? name || (isMain ? undefined : movingAnim(wak, f)) : undefined;
        const l = await spriteLayer(wak, f, opts(s, anim), images);
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

/** A child entity with its own <Base> files merged in (the loader only resolves the top entity's). */
function resolveChild(child: El, loader: EntityLoader): El {
  const out: El = { tag: 'Entity', attrs: { ...child.attrs }, children: [] };
  for (const c of child.children) {
    if (c.tag === 'Base' && c.attrs.file) out.children.push(...(loader.load(c.attrs.file)?.children ?? []), ...c.children);
    else out.children.push(c);
  }
  return out;
}

/** Visible sprites on child entities that follow the creature from a fixed spot (InheritTransformComponent's Transform). */
function partSprites(e: El, loader: EntityLoader): { s: El; at: [number, number] }[] {
  const out: { s: El; at: [number, number] }[] = [];
  for (const raw of comps(e, 'Entity')) {
    const child = resolveChild(raw, loader);
    const inherit = comp(child, 'InheritTransformComponent');
    if (!inherit || inherit.attrs.parent_hotspot_tag || comp(child, 'IKLimbComponent')) continue;
    const tf = comp(inherit, 'Transform')?.attrs ?? {};
    for (const s of comps(child, 'SpriteComponent')) {
      const f = s.attrs.image_file ?? '';
      if (s.attrs._enabled === '0' || !f || f.includes('/ui_gfx/') || notBody(s) || SPRITE_SKIP.test(f) || SPRITE_SKIP.test(s.attrs._tags ?? '')) continue;
      out.push({ s, at: [num(tf['position.x'], 0), num(tf['position.y'], 0)] });
    }
  }
  return out;
}

/**
 * Sprites on plain child entities that sit on the creature's pivot: no transform of their own, and not creatures in
 * their own right (the Monk's hands have their own health and scripts). Unohdettu's pupil is one; eye.lua turns it
 * towards you, so it's drawn in the middle of the eye.
 */
function looseSprites(e: El): { s: El; at: [number, number] }[] {
  const out: { s: El; at: [number, number] }[] = [];
  for (const child of comps(e, 'Entity')) {
    if (child.children.some((c) => c.tag === 'Base' || c.tag === 'Entity' || c.tag === 'InheritTransformComponent' || c.tag === 'DamageModelComponent')) continue;
    for (const s of comps(child, 'SpriteComponent')) {
      const f = s.attrs.image_file ?? '';
      if (s.attrs._enabled === '0' || !f || f.includes('/ui_gfx/') || notBody(s) || SPRITE_SKIP.test(f) || SPRITE_SKIP.test(s.attrs._tags ?? '')) continue;
      out.push({ s, at: [0, 0] });
    }
  }
  return out;
}

/** A sprite's first frame at full size (a .png, or a <Sprite> sheet's default animation), and the sheet's pivot. */
async function firstFrame(wak: Wak, file: string): Promise<{ key: string; png: Buffer; ox: number; oy: number } | null> {
  const path = realPath(wak, file);
  if (!path) return null;
  if (path.endsWith('.png')) return { key: path, png: wak.bytes(path), ox: 0, oy: 0 };
  if (!path.endsWith('.xml')) return null;
  const sprite = parseXml(wak.text(path)).find((x) => x.tag === 'Sprite');
  const img = sprite && realPath(wak, sprite.attrs.filename ?? '');
  if (!sprite || !img) return null;
  const rects = comps(sprite, 'RectAnimation');
  const rect = rects.find((a) => a.attrs.name === sprite.attrs.default_animation) ?? rects[0];
  let png = wak.bytes(img);
  if (rect) {
    const meta = await sharp(png).metadata();
    const width = num(rect.attrs.frame_width, meta.width ?? 1);
    const height = num(rect.attrs.frame_height, meta.height ?? 1);
    const left = num(rect.attrs.pos_x, 0);
    const top = num(rect.attrs.pos_y, 0);
    if (left + width <= (meta.width ?? 0) && top + height <= (meta.height ?? 0)) png = await sharp(png).extract({ left, top, width, height }).png().toBuffer();
  }
  return { key: `${path}#0`, png, ox: num(sprite.attrs.offset_x, 0), oy: num(sprite.attrs.offset_y, 0) };
}

/** Where a child entity sits on the creature: the last InheritTransformComponent Transform (an override on a <Base>). */
function childAt(child: El): [number, number] {
  const tf = comps(child, 'InheritTransformComponent')
    .map((i) => comp(i, 'Transform'))
    .filter((t): t is El => !!t)
    .at(-1)?.attrs;
  return [num(tf?.['position.x'], 0), num(tf?.['position.y'], 0)];
}

/**
 * Its VerletPhysicsComponent chains: tails, tentacles, vines, hair and capes. Each holds num_points points
 * resting_distance apart, with one sprite on each link from the anchor out. Sprites stretch along their link unless
 * scale_sprite_x is off. Noita draws lower z_index in front, so a chain goes behind the body unless it's lower.
 * Cloth (Mina's cape) has no sprites and is skipped.
 */
async function chainsOf(wak: Wak, e: El, main: El | undefined, loader: EntityLoader, images: Map<string, Buffer>): Promise<ChainOut[]> {
  const mainZ = num(main?.attrs.z_index, 0);
  const out: ChainOut[] = [];
  for (const raw of comps(e, 'Entity')) {
    const child = resolveChild(raw, loader);
    const v = comp(child, 'VerletPhysicsComponent');
    if (!v || v.attrs.type === 'CLOTH') continue;
    const sprites = comps(child, 'SpriteComponent').filter((s) => s.attrs._enabled !== '0' && s.attrs.image_file);
    const pieces: ChainOut['pieces'] = [];
    for (const s of sprites) {
      const f = await firstFrame(wak, s.attrs.image_file!);
      if (!f) continue;
      const key = `chain:${f.key}`;
      if (!images.has(key)) images.set(key, f.png);
      // The component's offset places the piece on its link; without one, the sheet's own pivot.
      pieces.push({ key, ox: s.attrs.offset_x !== undefined ? num(s.attrs.offset_x, 0) : f.ox, oy: s.attrs.offset_y !== undefined ? num(s.attrs.offset_y, 0) : f.oy });
    }
    if (!pieces.length) continue;
    out.push({
      at: childAt(child),
      gap: num(v.attrs.resting_distance, 2),
      stretch: v.attrs.scale_sprite_x !== '0',
      front: sprites.every((s) => num(s.attrs.z_index, 0) < mainZ),
      pieces,
    });
  }
  return out;
}

/** A sprite file's first animation with more than one frame. */
function movingAnim(wak: Wak, file: string): string | undefined {
  if (!file.endsWith('.xml') || !wak.has(file)) return undefined;
  const sprite = parseXml(wak.text(file)).find((x) => x.tag === 'Sprite');
  return comps(sprite ?? null, 'RectAnimation').find((a) => num(a.attrs.frame_count, 1) > 1 && !ANIM_SKIP.test(a.attrs.name ?? ''))?.attrs.name;
}

const lowerPaths = new WeakMap<Wak, Map<string, string>>();
/** The archive's spelling of a path: entity files name lukki_limb_A_long.png, the archive holds lukki_limb_a_long.png. */
function realPath(wak: Wak, path: string): string | undefined {
  if (wak.has(path)) return normalize(path);
  let m = lowerPaths.get(wak);
  if (!m) lowerPaths.set(wak, (m = new Map([...wak.entries.keys()].map((k) => [k.toLowerCase(), k]))));
  return m.get(normalize(path).toLowerCase());
}

/**
 * The body of a creature with no SpriteComponent to show: a physics body's own image (crystals, gate guardians),
 * pivoting where PhysicsImageShapeComponent puts it. The wand ghost is a wand flying on its own; the game hands it
 * a random one, so it's drawn with a plain starter wand.
 */
async function stillBody(wak: Wak, e: El, tags: string[], images: Map<string, Buffer>): Promise<LayerOut | null> {
  const shape = comp(e, 'PhysicsImageShapeComponent');
  // A flask's shape is its normal map (potion_normals.png): the picture is the file beside it (potion.png).
  const shapeImage = shape?.attrs.image_file ?? '';
  const shapeFile = shapeImage ? (realPath(wak, shapeImage.replace(/_normals\.png$/, '.png')) ?? realPath(wak, shapeImage)) : undefined;
  const file = shapeFile ?? (tags.includes('wand_ghost') ? realPath(wak, WAND_GHOST_WAND) : undefined);
  if (!file) return null;
  const meta = await sharp(wak.bytes(file)).metadata();
  const centred = !shape || shape.attrs.centered === '1';
  const ox = centred ? (meta.width ?? 0) / 2 : num(shape.attrs.offset_x, 0);
  const oy = centred ? (meta.height ?? 0) / 2 : num(shape.attrs.offset_y, 0);
  return spriteLayer(wak, file, { ox, oy, maxFrames: ANIM_FRAMES, maxFrame: ANIM_SIZE }, images);
}
const WAND_GHOST_WAND = 'data/items_gfx/wands/wand_0000.png';

/**
 * Its IK legs: the walking limb's two segments (and knee), how many it has and how far they reach, where their hips
 * sit, how they hold on (all around, or standing on the ground), and the limb it strikes with.
 */
async function legsOf(wak: Wak, e: El, loader: EntityLoader, images: Map<string, Buffer>): Promise<LegsOut | undefined> {
  const limbs = comps(e, 'Entity')
    .map((c) => resolveChild(c, loader))
    .filter((c) => comp(c, 'IKLimbComponent'));
  const walkers = limbs.filter((l) => !comp(l, 'IKLimbAttackerComponent'));
  const walker = walkers[0] ?? limbs[0];
  if (!walker) return undefined;
  const joint = (s: El) => /knee|elbow/.test(s.attrs.image_file!);
  const parts = (limb: El) => {
    const sprites = comps(limb, 'SpriteComponent').filter((s) => s.attrs._enabled !== '0' && s.attrs.image_file);
    const seg = sprites.filter((s) => !joint(s));
    return { seg, joint: sprites.find(joint) };
  };
  // A segment's image: a .png, or the first frame of a <Sprite> sheet (Kolmisilmä's arms are animated sheets).
  const key = async (s: El | undefined) => {
    const f = s && (await firstFrame(wak, s.attrs.image_file!));
    if (!f) return undefined;
    const k = `leg:${f.key}`;
    if (!images.has(k)) images.set(k, f.png);
    return k;
  };
  const { seg, joint: kneeSprite } = parts(walker);
  const upper = await key(seg[0]);
  const lower = await key(seg[1] ?? seg[0]);
  if (!upper || !lower) return undefined;
  const knee = await key(kneeSprite);

  // Hips placed apart (Jalkamatkatavara's six, under the chest), left to right.
  const hipX = (l: El) => num(comp(comp(l, 'InheritTransformComponent'), 'Transform')?.attrs['position.x'], 0);
  const legs = walkers.length ? walkers : [walker];
  const hips = legs.map(hipX);
  // Legs on the right whose lower segment differs from the first leg's (feet that point outward).
  const lowers = await Promise.all(
    legs.map((l) => {
      const p = parts(l).seg;
      return key(p[1] ?? p[0]);
    }),
  );
  const lowerRight = lowers.find((k, i) => hipX(legs[i]!) > 0 && k !== lower);

  // IKLimbsAnimatorComponent moves the legs to any surface (walls first); without it each leg is an
  // IKLimbWalkerComponent that keeps its foot on the ground below. One that flies and can't walk (Kolmisilmä hangs in
  // the middle of its arena) has no ground below: its limbs grab the walls all around.
  const walkComp = comp(walker, 'IKLimbWalkerComponent');
  const path = comp(e, 'PathFindingComponent')?.attrs;
  const hangs = path?.can_fly === '1' && path.can_walk === '0';
  const grip: LegsOut['grip'] = comp(e, 'IKLimbsAnimatorComponent') || hangs || !walkComp ? 'cling' : 'walk';

  const strike = limbs.find((l) => comp(l, 'IKLimbAttackerComponent'));
  let attacker: LegsOut['attacker'];
  if (strike) {
    const p = parts(strike);
    const au = await key(p.seg[0]);
    const al = await key(p.seg[1] ?? p.seg[0]);
    const aj = await key(p.joint);
    if (au && al)
      attacker = {
        reach: num(comp(strike, 'IKLimbComponent')!.attrs.length, 40),
        radius: num(comp(strike, 'IKLimbAttackerComponent')!.attrs.radius, 54),
        upper: au,
        lower: al,
        ...(aj ? { joint: aj } : {}),
      };
  }

  return {
    count: limbs.length,
    reach: num(comp(walker, 'IKLimbComponent')!.attrs.length, 40),
    upper,
    lower,
    ...(lowerRight ? { lowerRight } : {}),
    pivot: num(seg[0]!.attrs.offset_y, 0),
    ...(knee ? { knee } : {}),
    grip,
    ...(grip === 'walk' ? { maxAngle: num(walkComp!.attrs.ground_attachment_max_angle, 0.8) } : {}),
    ...(hips.some((x) => x !== 0) ? { hips } : {}),
    ...(attacker ? { attacker } : {}),
  };
}

/**
 * How the game moves it in code: legs step and worms' bodies follow their heads (always), and when no sprite
 * animation plays, physics bodies drift and the rest bob.
 * A creature with an animation that plays opens on it, even when its default pose is a still one (Peura's stand).
 */
function withMotion(anims: { name: string; layers: LayerOut[] }[], e: El | null, legs: LegsOut | undefined, b: EnemyBehavior) {
  const plays = (a: { layers: LayerOut[] }) => a.layers.some((l) => l.frames.length > 1);
  const first = anims.findIndex(plays);
  if (first > 0) anims.unshift(...anims.splice(first, 1));
  // A limb that strikes (IKLimbAttackerComponent) gets an Attack to show it in, if the sprite has none of its own.
  if (legs?.attacker && anims.length && !anims.some((a) => a.name === 'attack')) anims.push({ name: 'attack', layers: anims[0]!.layers });
  // Legs and a worm's trailing body move in code whatever the sprites do.
  const worm = comp(e, 'WormComponent') || comp(e, 'BossDragonComponent');
  if (!legs && !worm && (first >= 0 || b.immobile)) return anims;
  const kind: Motion = legs ? 'scuttle' : worm ? 'wriggle' : b.physics || comp(e, 'PhysicsImageShapeComponent') ? 'float' : 'hover';
  // A worm of seven body parts or more (with its head and tail) is too long to show straight: it swims a loop instead.
  return anims.map((a) => ({ ...a, motion: kind === 'wriggle' && a.layers.length >= LONG_WORM ? 'slither' : kind }));
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
// Glowing _emissive layers (eyes, lamps) are drawn: the game draws them over the body.
const SPRITE_SKIP = /health_bar|shield|glow(?!ing)|light(?!ning)|outline|aura|hotspot|fog_of_war|area_indicator/;
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