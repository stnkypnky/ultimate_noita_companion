// One-material alchemy lookup: how a material is made, and what it reacts with.
import type { Material, Reaction } from '@/data/types';

/** Does a reaction slot ("water" or a tag like "[fire]") take this material? */
export const takes = (m: Pick<Material, 'id' | 'tags'>, slot: string) => slot === m.id || m.tags.includes(slot);

/** A reaction with nothing secret in it: tags never are, materials are when `isVisible` says so. */
export const isSafe = (r: Reaction, isVisible: (id: string) => boolean) =>
  [...r.inputs, ...r.outputs].every((x) => x.startsWith('[') || isVisible(x));

export type Lookup = {
  /** Reactions that produce the material from other inputs. */
  makes: Reaction[];
  /** Reactions the material takes part in as an input. */
  mixes: Reaction[];
  /** Matching reactions left out because they would spoil a secret material. */
  hidden: number;
};

export function lookupReactions(m: Pick<Material, 'id' | 'tags'>, reactions: Reaction[], isVisible: (id: string) => boolean): Lookup {
  const makes: Reaction[] = [];
  const mixes: Reaction[] = [];
  let hidden = 0;
  for (const r of reactions) {
    const asInput = r.inputs.some((x) => takes(m, x));
    const asOutput = !asInput && r.outputs.includes(m.id);
    if (!asInput && !asOutput) continue;
    if (!isSafe(r, isVisible)) {
      hidden++;
      continue;
    }
    (asInput ? mixes : makes).push(r);
  }
  // Reactions that name the material itself come before the ones it only joins through a tag ("any water").
  const direct = (r: Reaction) => (r.inputs.includes(m.id) ? 0 : 1);
  mixes.sort((a, b) => direct(a) - direct(b));
  return { makes, mixes, hidden };
}

/**
 * "[magic_liquid]" → "Any magic liquid". An output like "[meltable]_molten" means the matched material's
 * own variant, so it reads "Molten form".
 */
export const tagLabel = (tag: string) => {
  const variant = tag.match(/^\[[^\]]+\]_(\w+)$/);
  if (variant) return `${variant[1]!.replace(/^\w/, (c) => c.toUpperCase())} form`;
  return `Any ${tag.replace(/^\[|\]$/g, '').replace(/_/g, ' ')}`;
};

/**
 * Drop reactions that read the same once named (several materials share a name, like two kinds of Blood).
 * `name` turns an id or tag into what the player sees.
 */
export function dedupeByName(reactions: Reaction[], name: (x: string) => string): Reaction[] {
  const seen = new Set<string>();
  return reactions.filter((r) => {
    const key = `${unique(r.inputs.map(name)).join('+')}>${unique(r.outputs.map(name)).join('+')}@${r.probability}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Inputs and outputs without repeats (the game often lists "cement, fire, cement" or the same output twice). */
export const unique = (xs: string[]) => [...new Set(xs)];
