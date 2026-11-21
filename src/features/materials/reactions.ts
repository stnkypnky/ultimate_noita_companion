// A material's reactions as a player reads them. A reaction written with groups ("[fire] + water") is resolved from
// the viewed material's side: its own slot shows the material itself, and a group in the results that echoes an
// input ("[fire]", "[meltable]_molten") is that same material (or its molten form), as the engine substitutes it.
import { groupMembers, hasTag, parseGroup } from '@/data/materialGroups';
import type { Material, Reaction } from '@/data/types';

export type Side = { kind: 'material'; id: string } | { kind: 'group'; pattern: string };

export type ReactionRow = {
  inputs: Side[];
  outputs: Side[];
  /** The best chance among the reactions merged into this row. */
  probability: number;
  explosion: boolean;
};

type Ctx = {
  materials: Material[];
  byId: Map<string, Material>;
  /** How a material reads on the page (name and hint): rows that read the same are merged. Default: its id. */
  label?: (id: string) => string;
};

/** Whether pattern `p` takes material `m`, and which base material its group then stands for. */
function match(p: string, m: Material, byId: Map<string, Material>): { tag?: string; base: string } | null {
  const g = parseGroup(p);
  if (!g) return p === m.id ? { base: m.id } : null;
  if (!g.suffix) return hasTag(m, g.tag) ? { tag: g.tag, base: m.id } : null;
  if (!m.id.endsWith(g.suffix)) return null;
  const base = byId.get(m.id.slice(0, -g.suffix.length));
  return base && hasTag(base, g.tag) ? { tag: g.tag, base: base.id } : null;
}

function side(p: string, bound: Map<string, string>, ctx: Ctx): Side {
  const g = parseGroup(p);
  if (!g) return { kind: 'material', id: p };
  const base = bound.get(g.tag);
  if (base !== undefined) {
    const id = base + g.suffix;
    if (ctx.byId.has(id)) return { kind: 'material', id };
  }
  // A group of one is just that material (the [lava] group is lava).
  const members = groupMembers(p, ctx.materials, ctx.byId);
  return members.length === 1 ? { kind: 'material', id: members[0]!.id } : { kind: 'group', pattern: p };
}

const sideKey = (s: Side, ctx: Ctx) => (s.kind === 'material' ? (ctx.label?.(s.id) ?? s.id) : s.pattern);

/** Builds a row (with `slot` moved to the front when `front`), merging into `rows` when the same pairs are already there. */
function addRow(rows: Map<string, ReactionRow>, r: Reaction, slot: number, bound: Map<string, string>, ctx: Ctx, front: boolean) {
  const order = r.inputs.map((_, i) => i);
  if (front) order.unshift(...order.splice(order.indexOf(slot), 1));
  const inputs = order.map((i) => side(r.inputs[i]!, bound, ctx));
  const outputs = order.map((i) => (r.outputs[i] !== undefined ? side(r.outputs[i]!, bound, ctx) : null)).filter((s): s is Side => !!s);
  // What goes in and what comes out, in any order: "water + cement" and "cement + water" are one row, and so are
  // reactions with look-alike variants (three kinds of ice) a player can't tell apart.
  const names = (list: Side[]) =>
    list
      .map((s) => sideKey(s, ctx))
      .sort()
      .join('+');
  const key = `${names(inputs)}=${names(outputs)}`;
  const have = rows.get(key);
  if (have) {
    have.probability = Math.max(have.probability, r.probability);
    have.explosion ||= !!r.explosion;
  } else rows.set(key, { inputs, outputs, probability: r.probability, explosion: !!r.explosion });
}

/**
 * The reactions a material takes part in: `asInput` where it is one of the ingredients (it first in each row), and
 * `asOutput` where it is made from other things.
 */
export function reactionsOf(m: Material, reactions: Reaction[], ctx: Ctx): { asInput: ReactionRow[]; asOutput: ReactionRow[] } {
  const asInput = new Map<string, ReactionRow>();
  const asOutput = new Map<string, ReactionRow>();
  for (const r of reactions) {
    const i = r.inputs.findIndex((p) => match(p, m, ctx.byId));
    if (i >= 0) {
      const hit = match(r.inputs[i]!, m, ctx.byId)!;
      addRow(asInput, r, i, new Map(hit.tag ? [[hit.tag, hit.base]] : []), ctx, true);
      continue;
    }
    // Made by it: a result slot that is this material, where the ingredient in that slot wasn't already it.
    const j = r.outputs.findIndex((p) => match(p, m, ctx.byId));
    if (j < 0) continue;
    const hit = match(r.outputs[j]!, m, ctx.byId)!;
    addRow(asOutput, r, j, new Map(hit.tag ? [[hit.tag, hit.base]] : []), ctx, false);
  }
  return { asInput: [...asInput.values()], asOutput: [...asOutput.values()] };
}

/** The material ids a row names outright (for spoiler checks). */
export const rowMaterials = (row: ReactionRow) => [...row.inputs, ...row.outputs].flatMap((s) => (s.kind === 'material' ? [s.id] : []));
