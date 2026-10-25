import { parse } from 'csv-parse/sync';

export type Translations = Map<string, string>;

/** common.csv: key,en,ru,... -> map of key -> English. Keys are referenced in data as "$key". */
export function parseTranslations(csv: string): Translations {
  const rows: string[][] = parse(csv, { relax_column_count: true, relax_quotes: true, skip_empty_lines: true });
  const map: Translations = new Map();
  for (const row of rows.slice(1)) {
    const [key, en] = row;
    if (key && en !== undefined) map.set(key, en.replace(/\\n/g, '\n'));
  }
  return map;
}

/** Resolve "$key" (optionally with "$0"-style params left in place) to English. */
export function tr(t: Translations, s: string | undefined | null, fallback = ''): string {
  if (!s) return fallback;
  if (!s.startsWith('$')) return s;
  return t.get(s.slice(1)) ?? (fallback || s);
}

/** "gem_box2d_white" -> "Gem box2d white" */
export const humanize = (id: string) => id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
