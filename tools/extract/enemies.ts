import { basename } from 'node:path';
import type { DamageType, Enemy } from '../../src/data/types.ts';
import { comp, comps, num, type El, type EntityLoader } from './entity.ts';
import { humanize, tr, type Translations } from './translations.ts';
import { buildProjectile } from './spells.ts';
import { spriteFrame } from './visuals.ts';
import type { AtlasInput } from './sprites.ts';
import type { Wak } from './wak.ts';

const HP = 25;

/**
 * Enemies as listed on the in-game Progress screen: one icon per id in data/ui_gfx/animal_icons/.
 * The same ids name the save's stats/stats_<id>.xml files.
 */
export function enemyIconFiles(wak: Wak): string[] {
  return wak.list('data/ui_gfx/animal_icons/').filter((f) => f.endsWith('.png') && !f.includes('/_'));
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

export type EnemyBuild = { enemies: Enemy[]; portraits: AtlasInput[] };

export async function buildEnemies(
  iconFiles: string[],
  wak: Wak,
  loader: EntityLoader,
  t: Translations,
  icons: Map<string, Enemy['icon']>,
  spellNameByFile: Map<string, string>,
): Promise<EnemyBuild> {
  const portraits: AtlasInput[] = [];
  const enemies: Enemy[] = [];
  for (const icon of iconFiles) {
    const id = basename(icon, '.png');
    const file = entityFile(wak, id);
    const e = file ? loader.load(file) : null;
    const dm = comp(e, 'DamageModelComponent');
    const ai = comp(e, 'AnimalAIComponent');
    const tags = (e?.attrs.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const hp = dm ? num(dm.attrs.max_hp, num(dm.attrs.hp, 0)) : 0;

    const enemy: Enemy = {
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
      ...comps(e, 'GameEffectComponent').map((g) => (num(g.attrs.frames, 0) < 0 ? PROTECTION[g.attrs.effect ?? ''] : undefined)),
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
    enemies.push(enemy);
  }
  return { enemies, portraits };
}

/** The sprite that shows the creature itself (not its health bar, shield or glow). */
function mainSprite(e: El | null): El | undefined {
  const sprites = comps(e, 'SpriteComponent').filter((s) => s.attrs._enabled !== '0' && s.attrs.image_file && !s.attrs.image_file.includes('/ui_gfx/'));
  const skip = /health_bar|shield|glow|light|emissive|_emissive|outline|aura/;
  return sprites.find((s) => !skip.test(s.attrs.image_file!) && !skip.test(s.attrs._tags ?? '')) ?? sprites[0];
}

/** Two decimals: the wiki quotes 12.5 health and 6.25 damage. */
const round = (n: number) => Math.round(n * 100) / 100;
