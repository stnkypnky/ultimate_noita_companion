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
