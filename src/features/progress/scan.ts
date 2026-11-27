// Reads a Noita save folder (save00, or the Nolla_Games_Noita folder above it) entirely on-device.
import type { DeathRecord, EnemyStat, Progress, RunSummary } from '@/store/progress';

/** `lastModified` (ms) dates the save itself, not the scan; sources that can't tell leave it out. */
export type SaveFile = { path: string; text: () => Promise<string>; lastModified?: number };

/** The mod's live run file (Phase 4), written next to persistent/ and stats/. */
export const LIVE_FILE = 'companion_live.json';

export class ScanError extends Error {}

const norm = (p: string) => p.replace(/\\/g, '/');

/** The directories we need; everything else (notably world/, thousands of chunks) is skipped. */
const WANTED = [
  /(^|\/)persistent\/flags\/[^/]+$/,
  /(^|\/)persistent\/orbs_new\/[^/]+$/,
  /(^|\/)stats\/[^/]+$/,
  /(^|\/)stats\/sessions\/[^/]+$/,
  /(^|\/)companion_live\.json$/,
];
export const isWanted = (path: string) => WANTED.some((r) => r.test(norm(path)));
export const isLiveFile = (path: string) => norm(path).split('/').pop() === LIVE_FILE;

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
  const statFiles = under('stats/')
    .map((x) => ({ ...x, id: x.name.match(/^stats_(.+)\.xml$/)?.[1] }))
    .filter((x): x is typeof x & { id: string } => !!x.id);
  const enemies = statFiles.map((x) => x.id);
  // <Stats deaths="…" kills="…" player_kills="…">: how many have died, and how many times one killed the player.
  // Its <death_map> says what killed them ("player | $damage_projectile"), its <kill_map> what they killed.
  const enemyStats: NonNullable<Progress['enemyStats']> = {};
  await Promise.all(
    statFiles.map(async ({ file, id }) => {
      const xml = await file.text();
      const head = xml.match(/<Stats\s[^>]*>/)?.[0] ?? '';
      const died = Number(attr(head, 'deaths') ?? 0);
      const killedYou = Number(attr(head, 'player_kills') ?? 0);
      if (!died && !killedYou) return;
      const stat: EnemyStat = { died, killedYou };
      for (const [key, n] of mapEntries(xml, 'death_map')) {
        const [who, cause] = splitKiller(key);
        const bucket = who === 'player' ? (stat.byYou ??= {}) : who ? (stat.byOthers ??= {}) : (stat.byWorld ??= {});
        const k = who === 'player' || !who ? cause || '?' : who;
        bucket[k] = (bucket[k] ?? 0) + n;
      }
      for (const [victim, n] of mapEntries(xml, 'kill_map')) {
        if (victim !== 'player' && victim) (stat.victims ??= {})[victim] = (stat.victims?.[victim] ?? 0) + n;
      }
      enemyStats[id] = stat;
    }),
  );
  // The game's Progress screen counts a creature once one has died or one has killed you, by its own stats file.
  // A file of zeros (met it, never fought it) and a killer known only from a session's record don't count.
  const counted = Object.keys(enemyStats).sort();

  // The game leaves the killer's name out of killed_by (" | bite"), but each session's _kills.xml keeps it in
  // its death_map ("worm_skull | bite"). That's also the only record when no stats_<id>.xml was written.
  const killsBySession = new Map<string, { killer?: string; cause?: string }>();
  await Promise.all(
    under('stats/sessions/')
      .filter((x) => x.name.endsWith('_kills.xml'))
      .map(async ({ file, name }) => {
        const xml = await file.text();
        const first = mapEntries(xml, 'death_map')[0];
        if (!first) return;
        const [who, cause] = splitKiller(first[0]);
        killsBySession.set(name.replace(/_kills\.xml$/, ''), { ...(who && who !== 'player' ? { killer: who } : {}), ...(cause ? { cause } : {}) });
      }),
  );

  const sessions = under('stats/sessions/').filter((x) => x.name.endsWith('_stats.xml'));
  let runs: RunSummary | undefined;
  let deaths: DeathRecord[] | undefined;
  if (sessions.length) {
    const parsed = await Promise.all(
      sessions.map(async ({ file, name }) => {
        const xml = await file.text();
        const stats = xml.match(/<stats\s[^>]*>/)?.[0] ?? '';
        const stamp = name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        const [who, cause] = splitKiller(attr(stats, 'killed_by') ?? '');
        const kills = killsBySession.get(name.replace(/_stats\.xml$/, ''));
        const ended = attr(stats, 'dead') === '1';
        // The ending's gold "kills" you with midas damage: that's a win, not a death.
        const won = ended && !who && cause.toLowerCase() === 'midas';
        return {
          date: stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}` : name,
          seed: Number(attr(stats, 'world_seed') ?? 0),
          dead: ended && !won,
          won,
          playtimeSec: Math.round(Number(attr(stats, 'playtime') ?? 0)),
          kills: Number(attr(stats, 'enemies_killed') ?? 0),
          gold: Number(attr(stats, 'gold_all') ?? 0),
          killer: kills?.killer,
          cause: cause || kills?.cause,
          killedBy: who || kills?.killer || undefined,
        };
      }),
    );
    parsed.sort((a, b) => b.date.localeCompare(a.date));
    // Whatever killed you, you've met; and count the deaths even where its own stats file missed them.
    const byKiller = new Map<string, number>();
    for (const r of parsed) if (r.dead && r.killer) byKiller.set(r.killer, (byKiller.get(r.killer) ?? 0) + 1);
    for (const [id, n] of byKiller) {
      if (!enemies.includes(id)) enemies.push(id);
      const s = (enemyStats[id] ??= { died: 0, killedYou: 0 });
      s.killedYou = Math.max(s.killedYou, n);
    }
    deaths = parsed
      .filter((r) => r.dead)
      .slice(0, MAX_DEATHS)
      .map((r) => ({ date: r.date, seed: r.seed, ...(r.killer ? { killer: r.killer } : {}), ...(r.cause ? { cause: r.cause } : {}) }));
    runs = {
      runs: parsed.length,
      deaths: parsed.filter((r) => r.dead).length,
      playtimeSec: parsed.reduce((s, r) => s + r.playtimeSec, 0),
      kills: parsed.reduce((s, r) => s + r.kills, 0),
      bestGold: Math.max(0, ...parsed.map((r) => r.gold)),
      recent: parsed.slice(0, 5).map(({ seed, date, playtimeSec, killedBy, won }) => ({ seed, date, playtimeSec, ...(killedBy && !won ? { killedBy } : {}) })),
      wins: parsed.filter((r) => r.won).slice(0, MAX_WINS).map(({ seed, date, playtimeSec, kills }) => ({ seed, date, playtimeSec, kills })),
    };
  }

  // The mod's live file changes every second mid-run; it isn't save progress.
  const newest = Math.max(0, ...files.filter((f) => rel(f) !== null && !isLiveFile(f.path)).map((f) => f.lastModified ?? 0));
  return {
    syncedAt: new Date().toISOString(),
    ...(newest ? { savedAt: new Date(newest).toISOString() } : {}),
    flags,
    enemies,
    counted,
    enemyStats,
    orbs,
    ...(runs ? { runs } : {}),
    ...(deaths?.length ? { deaths } : {}),
  };
}

const MAX_DEATHS = 60;
const MAX_WINS = 100;

/** `<map><E key="…" value="3">…</map>` entries, in file order. */
function mapEntries(xml: string, map: string): [string, number][] {
  const body = xml.match(new RegExp(`<${map}>([\\s\\S]*?)</${map}>`))?.[1] ?? '';
  return [...body.matchAll(/<E\s+key="([^"]*)"\s+value="([^"]*)"/g)].map((m) => [m[1]!, Number(m[2]) || 0]);
}

/** "worm_skull | bite" → ["worm_skull", "bite"]; "NULL | …" and " | …" have no killer (""). */
export function splitKiller(s: string): [string, string] {
  const i = s.indexOf('|');
  const who = (i < 0 ? s : s.slice(0, i)).trim();
  const cause = i < 0 ? '' : s.slice(i + 1).trim();
  return [who === 'NULL' ? '' : who, cause];
}

// ---------- Sources ----------

/** <input type="file" webkitdirectory> */
export function filesFromInput(list: FileList): SaveFile[] {
  return [...list]
    .filter((f) => isWanted(f.webkitRelativePath || f.name))
    .map((f) => ({ path: f.webkitRelativePath || f.name, text: () => f.text(), lastModified: f.lastModified }));
}

/** File System Access API directory handle (Chrome/Edge). */
export async function filesFromHandle(dir: FileSystemDirectoryHandle, prefix = '', depth = 0): Promise<SaveFile[]> {
  const jobs: Promise<SaveFile[]>[] = [];
  for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    const path = `${prefix}${entry.name}`;
    if (entry.kind === 'file') {
      if (isWanted(path)) {
        jobs.push(
          (entry as FileSystemFileHandle).getFile().then((file) => [{ path, text: () => file.text(), lastModified: file.lastModified }]),
        );
      }
    } else if (depth < 4 && entry.name !== 'world' && !entry.name.startsWith('save_rec')) {
      jobs.push(filesFromHandle(entry as FileSystemDirectoryHandle, `${path}/`, depth + 1));
    }
  }
  return (await Promise.all(jobs)).flat();
}

/** Drag-and-dropped folder (works even where folder pickers refuse system folders). */
export async function filesFromDrop(items: DataTransferItemList): Promise<SaveFile[]> {
  const out: SaveFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string, depth: number): Promise<void> => {
    const path = `${prefix}${entry.name}`;
    if (entry.isFile) {
      if (isWanted(path)) {
        const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
        out.push({ path, text: () => file.text(), lastModified: file.lastModified });
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
