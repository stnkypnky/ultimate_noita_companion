// Reads a Noita save folder (save00, or the Nolla_Games_Noita folder above it) entirely on-device.
import type { Progress, RunSummary } from '@/store/progress';

export type SaveFile = { path: string; text: () => Promise<string> };

export class ScanError extends Error {}

const norm = (p: string) => p.replace(/\\/g, '/');

/** The directories we need; everything else (notably world/, thousands of chunks) is skipped. */
const WANTED = [/(^|\/)persistent\/flags\/[^/]+$/, /(^|\/)persistent\/orbs_new\/[^/]+$/, /(^|\/)stats\/[^/]+$/, /(^|\/)stats\/sessions\/[^/]+$/];
export const isWanted = (path: string) => WANTED.some((r) => r.test(norm(path)));

/** Pick the save slot: save00 if present, else the first folder containing persistent/flags. */
function findRoot(paths: string[]): string | null {
  const roots = new Set<string>();
  for (const p of paths) {
    const m = norm(p).match(/^(.*?)persistent\/flags\/[^/]+$/);
    if (m) roots.add(m[1]!);
  }
  if (!roots.size) return null;
  const list = [...roots].sort();
  return list.find((r) => /(^|\/)save00\/$/.test(r)) ?? list[0]!;
}

const attr = (xml: string, name: string) => xml.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

export async function parseSave(files: SaveFile[]): Promise<Progress> {
  const root = findRoot(files.map((f) => f.path));
  if (root === null) {
    throw new ScanError("That folder doesn't look like a Noita save. Choose save00 inside Nolla_Games_Noita.");
  }
  const rel = (f: SaveFile) => (norm(f.path).startsWith(root) ? norm(f.path).slice(root.length) : null);
  const under = (dir: string) =>
    files
      .map((f) => ({ f, r: rel(f) }))
      .filter((x): x is { f: SaveFile; r: string } => !!x.r && x.r.startsWith(dir) && !x.r.slice(dir.length).includes('/'))
      .map((x) => ({ file: x.f, name: x.r.slice(dir.length) }))
      .filter((x) => x.name && !x.name.endsWith('.vdf') && !x.name.startsWith('DONT'));

  const flags = under('persistent/flags/').map((x) => x.name);
  const orbs = under('persistent/orbs_new/')
    .map((x) => Number(x.name))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  const enemies = under('stats/')
    .map((x) => x.name.match(/^stats_(.+)\.xml$/)?.[1])
    .filter((x): x is string => !!x);

  const sessions = under('stats/sessions/').filter((x) => x.name.endsWith('_stats.xml'));
  let runs: RunSummary | undefined;
  if (sessions.length) {
    const parsed = await Promise.all(
      sessions.map(async ({ file, name }) => {
        const xml = await file.text();
        const stats = xml.match(/<stats\s[^>]*>/)?.[0] ?? '';
        const stamp = name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        return {
          date: stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}` : name,
          seed: Number(attr(stats, 'world_seed') ?? 0),
          dead: attr(stats, 'dead') === '1',
          playtimeSec: Math.round(Number(attr(stats, 'playtime') ?? 0)),
          kills: Number(attr(stats, 'enemies_killed') ?? 0),
          gold: Number(attr(stats, 'gold_all') ?? 0),
          killedBy: attr(stats, 'killed_by')?.split('|')[0]?.trim() || undefined,
        };
      }),
    );
    parsed.sort((a, b) => b.date.localeCompare(a.date));
    runs = {
      runs: parsed.length,
      deaths: parsed.filter((r) => r.dead).length,
      playtimeSec: parsed.reduce((s, r) => s + r.playtimeSec, 0),
      kills: parsed.reduce((s, r) => s + r.kills, 0),
      bestGold: Math.max(0, ...parsed.map((r) => r.gold)),
      recent: parsed.slice(0, 5).map(({ seed, date, playtimeSec, killedBy }) => ({ seed, date, playtimeSec, ...(killedBy ? { killedBy } : {}) })),
    };
  }

  return { syncedAt: new Date().toISOString(), flags, enemies, orbs, ...(runs ? { runs } : {}) };
}

// ---------- Sources ----------

/** <input type="file" webkitdirectory> */
export function filesFromInput(list: FileList): SaveFile[] {
  return [...list].filter((f) => isWanted(f.webkitRelativePath || f.name)).map((f) => ({ path: f.webkitRelativePath || f.name, text: () => f.text() }));
}

/** File System Access API directory handle (Chrome/Edge). */
export async function filesFromHandle(dir: FileSystemDirectoryHandle, prefix = '', depth = 0): Promise<SaveFile[]> {
  const out: SaveFile[] = [];
  for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    const path = `${prefix}${entry.name}`;
    if (entry.kind === 'file') {
      if (isWanted(path)) {
        const fh = entry as FileSystemFileHandle;
        out.push({ path, text: async () => (await fh.getFile()).text() });
      }
    } else if (depth < 4 && entry.name !== 'world' && !entry.name.startsWith('save_rec')) {
      out.push(...(await filesFromHandle(entry as FileSystemDirectoryHandle, `${path}/`, depth + 1)));
    }
  }
  return out;
}

/** Drag-and-dropped folder (works even where folder pickers refuse system folders). */
export async function filesFromDrop(items: DataTransferItemList): Promise<SaveFile[]> {
  const out: SaveFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string, depth: number): Promise<void> => {
    const path = `${prefix}${entry.name}`;
    if (entry.isFile) {
      if (isWanted(path)) {
        const fe = entry as FileSystemFileEntry;
        out.push({ path, text: () => new Promise<File>((res, rej) => fe.file(res, rej)).then((f) => f.text()) });
      }
      return;
    }
    if (depth > 4 || entry.name === 'world') return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns results in batches; keep reading until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, `${path}/`, depth + 1);
    }
  };
  const roots = [...items].map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
  for (const r of roots) await walk(r, '', 0);
  return out;
}

export const SAVE_PATH = '%USERPROFILE%\\AppData\\LocalLow\\Nolla_Games_Noita\\save00';

export const canPickDirectory = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  return picker({ id: 'noita-save', mode: 'read' });
}
