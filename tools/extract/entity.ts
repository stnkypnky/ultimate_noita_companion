import { XMLParser } from 'fast-xml-parser';
import type { Wak } from './wak.ts';

export type El = { tag: string; attrs: Record<string, string>; children: El[] };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  commentPropName: '#comment',
});

type Raw = Record<string, unknown> & { ':@'?: Record<string, string> };

function toEl(raw: Raw): El | null {
  const tag = Object.keys(raw).find((k) => k !== ':@');
  if (!tag || tag === '#text' || tag === '#comment') return null;
  const kids = (raw[tag] as Raw[]) ?? [];
  return { tag, attrs: { ...(raw[':@'] ?? {}) }, children: kids.map(toEl).filter((e): e is El => e !== null) };
}

/** Parses an XML document and returns its root elements. Noita XML is loose, so wrap it. */
export function parseXml(text: string): El[] {
  const raw = parser.parse(`<__root>${text.replace(/<\?xml[^>]*\?>/, '')}</__root>`) as Raw[];
  const root = raw.map(toEl).find((e) => e?.tag === '__root');
  return root?.children ?? [];
}

const clone = (e: El): El => ({ tag: e.tag, attrs: { ...e.attrs }, children: e.children.map(clone) });

/** Merge `over` into `base` the way <Base> overrides work: attributes overwrite, same-tag children merge in order. */
function mergeInto(base: El, over: El) {
  Object.assign(base.attrs, over.attrs);
  const used = new Set<El>();
  for (const child of over.children) {
    const target = base.children.find((c) => c.tag === child.tag && !used.has(c));
    if (target) {
      used.add(target);
      mergeInto(target, child);
    } else {
      base.children.push(clone(child));
    }
  }
}

/** Loads an entity file with all <Base file="..."> inheritance resolved. */
export class EntityLoader {
  private cache = new Map<string, El | null>();
  constructor(private wak: Wak) {}

  load(path: string, depth = 0): El | null {
    if (this.cache.has(path)) {
      const hit = this.cache.get(path);
      return hit ? clone(hit) : null;
    }
    if (depth > 12 || !this.wak.has(path)) return null;
    const root = parseXml(this.wak.text(path)).find((e) => e.tag === 'Entity') ?? null;
    if (!root) {
      this.cache.set(path, null);
      return null;
    }
    const result: El = { tag: 'Entity', attrs: { ...root.attrs }, children: [] };
    for (const child of root.children) {
      if (child.tag === 'Base' && child.attrs.file) {
        const base = this.load(child.attrs.file, depth + 1);
        if (base) {
          for (const override of child.children) {
            const target = base.children.find((c) => c.tag === override.tag);
            if (target) mergeInto(target, override);
            else base.children.push(clone(override));
          }
          // Base tags are additive onto ours.
          if (base.attrs.tags) result.attrs.tags = [result.attrs.tags, base.attrs.tags].filter(Boolean).join(',');
          result.children.push(...base.children);
        }
      } else {
        result.children.push(child);
      }
    }
    this.cache.set(path, result);
    return clone(result);
  }
}

export const comp = (e: El | null | undefined, tag: string) => e?.children.find((c) => c.tag === tag);
export const comps = (e: El | null | undefined, tag: string) => e?.children.filter((c) => c.tag === tag) ?? [];

export function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
