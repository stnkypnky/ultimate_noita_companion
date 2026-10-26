// One-off audit: what the bestiary extractor sees for each creature, merged through <Base>. Usage: npx tsx tools/audit-enemies.ts [id...]
import { join } from 'node:path';
import { Wak } from './extract/wak.ts';
import { findNoita } from './extract/paths.ts';
import { EntityLoader, comp, comps } from './extract/entity.ts';

const wak = new Wak(join(findNoita(), 'data/data.wak'));
const loader = new EntityLoader(wak);
const ids = process.argv.slice(2);
const all = wak.list('data/ui_gfx/animal_icons/').filter((f) => f.endsWith('.png') && !f.includes('/_')).map((f) => f.split('/').pop()!.replace('.png', ''));

function file(id: string) {
  const direct = [`data/entities/animals/${id}.xml`, `data/entities/animals/${id}/${id}.xml`].find((f) => wak.has(f));
  if (direct) return direct;
  const any = wak.list('data/entities/').filter((f) => f.endsWith(`/${id}.xml`));
  return any.find((f) => f.includes('/animals/')) ?? any[0];
}

const counts: Record<string, number> = {};
const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
for (const id of ids.length ? ids : all) {
  const f = file(id);
  const e = f ? loader.load(f) : null;
  if (!e) {
    bump('no file');
    if (ids.length) console.log(id, 'NO FILE');
    continue;
  }
  const dms = comps(e, 'DamageModelComponent');
  const ai = comp(e, 'AnimalAIComponent');
  const melee = Object.fromEntries(Object.entries(ai?.attrs ?? {}).filter(([k]) => k.startsWith('attack_melee')));
  if (dms.length > 1) bump('multiple DamageModels');
  if (!ai) bump('no AnimalAI');
  if (ai && ai.attrs.attack_melee_enabled === undefined) bump('melee enabled unset');
  if (ids.length) {
    console.log(`== ${id} (${f})`);
    console.log('  tags:', e.attrs.tags);
    for (const dm of dms) {
      const a = dm.attrs;
      console.log('  DM:', { hp: a.hp, max_hp: a.max_hp, blood: a.blood_material, spray: a.blood_spray_material, mats: a.materials_that_damage, how: a.materials_how_much_damage, prop: a.materials_damage_proportional_to_maxhp, ragdoll: a.ragdoll_material });
      console.log('  mult:', comp(dm, 'damage_multipliers')?.attrs);
    }
    console.log('  AI melee:', melee, 'dash:', ai?.attrs.attack_dash_enabled, ai?.attrs.attack_dash_damage, 'ranged:', ai?.attrs.attack_ranged_enabled, ai?.attrs.attack_ranged_entity_file);
    console.log('  lua death:', comps(e, 'LuaComponent').map((l) => l.attrs.script_death).filter(Boolean));
    console.log('  effects:', comps(e, 'GameEffectComponent').map((g) => `${g.attrs.effect}/${g.attrs.frames}`));
    console.log('  other attack comps:', e.children.map((c) => c.tag).filter((t) => /Attack|Worm|Laser|Explosion|AreaDamage|Projectile/.test(t)));
  }
}
if (!ids.length) console.log(counts);
