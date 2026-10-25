import type { Material, Reaction } from '../../src/data/types.ts';
import { comp, num, parseXml, type El } from './entity.ts';
import { humanize, tr, type Translations } from './translations.ts';

/** "7fFF6060" (AARRGGBB) -> "#ff6060 7f" as #rrggbbaa */
function argbToHex(v: string | undefined): string {
  if (!v) return '#00000000';
  const s = v.replace(/^0x/i, '').padStart(8, '0').toLowerCase();
  return `#${s.slice(2)}${s.slice(0, 2)}`;
}

const tagsOf = (s: string | undefined) =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function effectTypes(el: El | undefined): string[] {
  return (el?.children ?? []).filter((c) => c.tag === 'StatusEffect').map((c) => c.attrs.type ?? '').filter(Boolean);
}

export function buildMaterials(xml: string, t: Translations): { materials: Material[]; reactions: Reaction[]; textures: Map<string, string> } {
  const root = parseXml(xml).find((e) => e.tag === 'Materials');
  if (!root) throw new Error('materials.xml: no <Materials>');

  // Resolve CellDataChild inheritance: attributes and Graphics merge over the parent.
  const raw = new Map<string, El>();
  for (const el of root.children) {
    if (el.tag !== 'CellData' && el.tag !== 'CellDataChild') continue;
    const name = el.attrs.name;
    if (!name) continue;
    let resolved = el;
    if (el.tag === 'CellDataChild' && el.attrs._parent) {
      const parent = raw.get(el.attrs._parent);
      if (parent) {
        const pg = comp(parent, 'Graphics');
        const g = comp(el, 'Graphics');
        const graphics = pg || g ? { tag: 'Graphics', attrs: { ...pg?.attrs, ...g?.attrs }, children: g?.children ?? pg?.children ?? [] } : undefined;
        resolved = {
          tag: 'CellData',
          attrs: { ...parent.attrs, ...el.attrs },
          children: [
            ...parent.children.filter((c) => c.tag !== 'Graphics' && !el.children.some((k) => k.tag === c.tag)),
            ...el.children.filter((c) => c.tag !== 'Graphics'),
            ...(graphics ? [graphics] : []),
          ],
        };
      }
    }
    raw.set(name, resolved);
  }

  const textures = new Map<string, string>();
  const materials: Material[] = [];
  for (const [id, el] of raw) {
    const a = el.attrs;
    const g = comp(el, 'Graphics');
    const cellType = a.cell_type ?? 'liquid';
    const liquidSand = a.liquid_sand === '1';
    const liquidStatic = a.liquid_static === '1';
    const state: Material['state'] =
      cellType === 'gas' ? 'gas' : cellType === 'fire' ? 'fire' : cellType === 'solid' || liquidStatic ? 'solid' : liquidSand ? 'powder' : 'liquid';
    const tex = g?.attrs.texture_file;
    if (tex) textures.set(id, tex);
    const effects = comp(el, 'StatusEffects');
    materials.push({
      id,
      name: tr(t, a.ui_name, humanize(id)),
      ...(el.attrs._parent ? { parent: el.attrs._parent } : {}),
      cellType,
      state,
      tags: tagsOf(a.tags),
      color: argbToHex(g?.attrs.color ?? a.wang_color),
      ...(tex ? { texture: `${id}.png` } : {}),
      density: num(a.density, 1),
      burnable: a.burnable === '1',
      fireHp: num(a.fire_hp, 0),
      lifetime: num(a.lifetime, 0),
      glow: num(a.gfx_glow, 0) > 0,
      liquidGravity: num(a.liquid_gravity, 0.5),
      hp: num(a.hp, 100),
      durability: num(a.durability, 0),
      conductive: a.electrical_conductivity === '1',
      electricalConductivity: a.electrical_conductivity === '1',
      onFire: a.on_fire === '1',
      temperatureOfFire: num(a.temperature_of_fire, 0),
      autoignitionTemperature: num(a.autoignition_temperature, 0),
      stickiness: num(a.stickyness, 0),
      liquidSand,
      liquidStatic,
      stains: effectTypes(comp(effects, 'Stains')),
      ingestion: effectTypes(comp(effects, 'Ingestion')),
      showInCreative: a.show_in_creative_mode === '1',
    });
  }

  const reactions: Reaction[] = [];
  for (const el of root.children) {
    if (el.tag !== 'Reaction' && el.tag !== 'ReqReaction') continue;
    const a = el.attrs;
    const inputs = [a.input_cell1, a.input_cell2, a.input_cell3].filter((x): x is string => !!x);
    const outputs = [a.output_cell1, a.output_cell2, a.output_cell3].filter((x): x is string => !!x);
    reactions.push({
      probability: num(a.probability, 100),
      inputs,
      outputs,
      fast: a.fast_reaction === '1',
      ...(a.req_lifetime ? { requiresLifetime: num(a.req_lifetime, 0) } : {}),
      ...(a.direction ? { direction: a.direction } : {}),
      ...(comp(el, 'ExplosionConfig') ? { explosion: true } : {}),
      ...(a.entity ? { entity: a.entity } : {}),
    });
  }

  return { materials, reactions, textures };
}
