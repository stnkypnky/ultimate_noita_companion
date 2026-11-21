// Plain names for the material groups ("[tags]") that reactions are written with. Each was checked against the
// materials that carry the tag in materials.xml. tests/materialReactions.test.ts requires every group a reaction
// uses to be named here.
import type { Material } from './types';

export const GROUP_LABEL: Record<string, string> = {
  '[acid]': 'Acid',
  '[alchemy]': 'Most materials',
  '[any_liquid]': 'Any liquid',
  '[burnable]': 'Flammable materials',
  '[burnable_fast]': 'Flammable gases',
  '[cold]': 'Ice and freezing materials',
  '[corrodible]': 'Anything acid eats',
  '[evaporable]': 'Liquids that evaporate',
  '[evaporable_by_fire]': 'Liquids fire boils away',
  '[evaporable_custom]': 'Liquids that boil into their own vapour',
  '[evaporable_fast]': 'Liquids that boil quickly',
  '[fire]': 'Any fire',
  '[fire_strong]': 'Strong fire',
  '[freezable]': 'Freezable water',
  '[frozen]': 'Ice and snow',
  '[fungus]': 'Fungal materials',
  '[gold]': 'Gold and molten metals',
  '[grows_fungus]': 'Fungal soil',
  '[grows_grass]': 'Soil that grows grass',
  '[ice]': 'Ice',
  '[impure]': 'Impure liquids',
  '[lava]': 'Lava',
  '[liquid]': 'Liquids',
  '[magic_faster]': 'Movement potions',
  '[meat]': 'Meat',
  '[meltable]': 'Wax and plastic',
  '[meltable_by_fire]': 'Honey',
  '[meltable_metal]': 'Meltable metals',
  '[meltable_metal_generic]': 'Steel and other metal',
  '[meltable_plastic]': 'Plastic',
  '[meltable_to_acid]': 'Frozen acid',
  '[meltable_to_blood]': 'Frozen blood and meat',
  '[meltable_to_cold]': 'Ice that melts to freezing liquid',
  '[meltable_to_lava]': 'Rock that melts to lava',
  '[meltable_to_lava_fast]': 'Sand that melts to lava',
  '[meltable_to_poison]': 'Frozen poison',
  '[meltable_to_radioactive]': 'Toxic ice',
  '[meltable_to_slime]': 'Frozen slime',
  '[meltable_to_water]': 'Ice and snow that melt to water',
  '[molten_metal]': 'Molten metals',
  '[radioactive]': 'Toxic sludge and mist',
  '[regenerative]': 'Healing liquids',
  '[requires_air]': 'Plants that need air',
  '[rust]': 'Steel that rusts',
  '[rust_box2d]': 'Metal objects that rust',
  '[rust_oxide]': 'Metal that oxidises',
  '[sand_ground]': 'Sand and soil',
  '[sand_metal]': 'Metal powders',
  '[slime]': 'Slime',
  '[static]': 'Solid terrain',
  '[vapour]': 'Vapours and clouds',
  '[water]': 'Water-like liquids',
};

/** A group with a suffix ("[meltable]_molten"): each member's own form with that suffix. */
const SUFFIX_LABEL: Record<string, string> = {
  '[meltable]_molten': 'Molten wax and plastic',
  '[meltable_plastic]_molten': 'Molten plastic',
  '[meltable_metal]_molten': 'Molten metals',
  '[evaporable_custom]_vapour': 'Their vapours',
  '[rust_oxide]_oxide': 'Oxidised metal',
  '[rust_box2d]_rust': 'Rusted metal objects',
};

/** "[tag]" or "[tag]_suffix" split apart; null for a plain material id. */
export function parseGroup(p: string): { tag: string; suffix: string } | null {
  const m = /^(\[[^\]]+\])(.*)$/.exec(p);
  return m ? { tag: m[1]!, suffix: m[2]! } : null;
}

export function groupLabel(p: string): string {
  if (SUFFIX_LABEL[p]) return SUFFIX_LABEL[p];
  const g = parseGroup(p);
  if (!g) return p;
  const base = GROUP_LABEL[g.tag] ?? g.tag.slice(1, -1).replace(/_/g, ' ');
  return g.suffix ? `${base} (${g.suffix.replace(/^_/, '')})` : base;
}

/** Whether a material belongs to a tag. [any_liquid] is the engine's own: every flowing liquid. */
export const hasTag = (m: Material, tag: string) => (tag === '[any_liquid]' ? m.state === 'liquid' : m.tags.includes(tag));

/** Materials a group pattern stands for. */
export function groupMembers(p: string, materials: Material[], byId: Map<string, Material>): Material[] {
  const g = parseGroup(p);
  if (!g) return [];
  const base = materials.filter((m) => hasTag(m, g.tag));
  if (!g.suffix) return base;
  return base.flatMap((m) => {
    const x = byId.get(m.id + g.suffix);
    return x ? [x] : [];
  });
}
