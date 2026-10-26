import { describe, expect, it } from 'vitest';
import { parseXml } from '../tools/extract/entity.ts';
import { parseTranslations, tr } from '../tools/extract/translations.ts';
import { buildMaterials } from '../tools/extract/materials.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Projectile, Spell } from '../src/data/types.ts';

const gameJson = <T>(name: string): T => JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data', name), 'utf8')) as T;
const spells = gameJson<Spell[]>('spells.json');
const projectiles = gameJson<Record<string, Projectile>>('projectiles.json');

describe('xml', () => {
  it('parses loose Noita XML with ordered children', () => {
    const [e] = parseXml('<Entity name="x"><A a="1"/><B/><A a="2"/></Entity>');
    expect(e?.children.map((c) => `${c.tag}${c.attrs.a ?? ''}`)).toEqual(['A1', 'B', 'A2']);
  });
});

describe('translations', () => {
  it('maps $keys to English', () => {
    const t = parseTranslations(',en,ru\naction_bomb,Bomb,Бомба\n');
    expect(tr(t, '$action_bomb')).toBe('Bomb');
    expect(tr(t, 'plain')).toBe('plain');
  });
});

describe('materials', () => {
  it('inherits from CellDataChild parents', () => {
    const xml = `<Materials>
      <CellData name="fire" ui_name="Fire" cell_type="fire" tags="[fire]"><Graphics color="7fff6000"/></CellData>
      <CellDataChild _parent="fire" name="fire_blue" ui_name="Blue fire"><Graphics color="7f82DCFF"/></CellDataChild>
      <Reaction probability="80" input_cell1="water" input_cell2="[fire]" output_cell1="steam" output_cell2="air"/>
    </Materials>`;
    const { materials, reactions } = buildMaterials(xml, new Map());
    const blue = materials.find((m) => m.id === 'fire_blue')!;
    expect(blue.state).toBe('fire');
    expect(blue.tags).toEqual(['[fire]']);
    expect(blue.color).toBe('#82dcff7f');
    expect(reactions[0]).toMatchObject({ probability: 80, inputs: ['water', '[fire]'], outputs: ['steam', 'air'] });
  });
});

describe('extracted game data', () => {
  const byId = new Map(spells.map((s) => [s.id, s]));
  const proj = projectiles;

  it('has the full spell list', () => {
    expect(byId.size).toBeGreaterThan(400);
  });

  it('matches known Spark Bolt stats', () => {
    const s = byId.get('LIGHT_BULLET')!;
    expect(s.mana).toBe(5);
    expect(s.stats.fire_rate_wait).toBe(3);
    expect(proj[s.projectiles[0]!]!.damage.projectile).toBe(3);
  });

  it('matches known Bomb stats', () => {
    const s = byId.get('BOMB')!;
    expect(s.maxUses).toBe(3);
    expect(proj[s.projectiles[0]!]!.explosion).toMatchObject({ damage: 125, radius: 60 });
  });

  it('reads multicast draw counts via reflection', () => {
    expect(byId.get('BURST_3')!.draw).toBe(3);
  });

  it('records trigger payloads', () => {
    expect(byId.get('LIGHT_BULLET_TRIGGER')!.trigger).toEqual({ kind: 'hit', draw: 1 });
    expect(byId.get('LIGHT_BULLET_TIMER')!.trigger).toMatchObject({ kind: 'timer', draw: 1, delay: 10 });
  });
});

describe('bestiary', () => {
  const enemies = gameJson<import('../src/data/types.ts').Enemy[]>('enemies.json');
  const byId = new Map(enemies.map((e) => [e.id, e]));

  it('finds bosses in their own folders and names them', () => {
    const boss = byId.get('boss_alchemist')!;
    expect(boss.name).toBe('Ylialkemisti');
    expect(boss.boss).toBe(true);
    expect(boss.hp).toBe(1000);
  });

  it("reads gold, resistances and attacks from the creature's file", () => {
    const acid = byId.get('acidshooter')!;
    // drop_money.lua: 10 × max(1, floor(max_hp)).
    expect(acid.gold).toBe(10);
    expect(acid.resist?.radioactive).toBe(0);
    // Checked against the wiki: Acid ball 6, melee 5-10, bleeds acid, hurt by lava/poison/freezing liquids.
    expect(acid.attacks?.find((a) => a.kind === 'ranged')).toMatchObject({ projectile: 'Acid ball', damage: [6, 6] });
    expect(acid.attacks?.find((a) => a.kind === 'melee')?.damage).toEqual([5, 10]);
    expect(acid.bleeds).toEqual({ hit: 'slime_green', spray: 'acid' });
    expect(acid.hurtBy?.map((h) => h.material)).toEqual(['lava', 'poison', 'blood_cold', 'blood_cold_vapour']);
    // Hurtta: 12.5 health, a 6.25 leap.
    const hurtta = byId.get('zombie')!;
    expect(hurtta.hp).toBe(12.5);
    expect(hurtta.attacks?.find((a) => a.kind === 'dash')?.damage).toEqual([6.25, 6.25]);
    expect(enemies.filter((e) => e.portrait).length).toBeGreaterThan(150);
  });
});
