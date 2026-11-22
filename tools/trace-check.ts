// Checks the map against what the game really did: reads save00/companion_trace.txt (written by the mod's "Record
// world generation" setting), takes its last session's seed, walks that seed's layouts as the app does (every spawn
// function, and the rooms' own markers), and compares the game's marker calls, rooms and items with ours, by biome.
// Usage: npx tsx tools/trace-check.ts [trace file] [--fixture tests/fixtures/trace-<seed>.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLuaHost, seedSource } from './extract/lua.ts';
import { generateLayouts, templateOf, type Template } from '../src/seed/layout.ts';
import { placeItems, type ItemData, type ItemWalk } from '../src/seed/items.ts';
import type { WorldMap } from '../src/data/types.ts';

const args = process.argv.slice(2);
const fixtureAt = args.indexOf('--fixture');
const fixture = fixtureAt >= 0 ? args.splice(fixtureAt, 2)[1] : undefined;
const file = args[0] ?? join(homedir(), 'AppData/LocalLow/Nolla_Games_Noita/save00/companion_trace.txt');

type Line = { t: 'S' | 'P' | 'E'; name: string; x: number; y: number };
/** The last session that has a seed: its lines. */
function lastSession(text: string) {
  const sessions: { seed: number; lines: Line[] }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('# session')) sessions.push({ seed: 0, lines: [] });
    const s = sessions.at(-1);
    if (!s) continue;
    const seed = /^seed (\d+)/.exec(raw);
    if (seed) s.seed = Number(seed[1]);
    const m = /^([SPE]) (\S+) (-?[\d.]+) (-?[\d.]+)$/.exec(raw);
    if (m) s.lines.push({ t: m[1] as Line['t'], name: m[2]!, x: Number(m[3]), y: Number(m[4]) });
  }
  return sessions.filter((s) => s.seed).at(-1);
}

const session = lastSession(readFileSync(file, 'utf8'));
if (!session) throw new Error(`no session with a seed in ${file}`);
const GAME = join(import.meta.dirname, '../public/game');
const map = JSON.parse(readFileSync(join(GAME, 'data/map.json'), 'utf8')) as WorldMap;
const data = JSON.parse(readFileSync(join(GAME, 'data/world_items.json'), 'utf8')) as ItemData;
const shipped = new Set(JSON.parse(readFileSync(join(GAME, 'lua/seed-files.json'), 'utf8')) as string[]);
const host = await createLuaHost((p) => (shipped.has(p) && existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
await host.lua.doString(seedSource);
const tilesets = new Map<string, Template>();
for (const n of new Set(map.biomes.flatMap((b) => (b.wangTemplate ? [b.wangTemplate] : [])))) {
  const { data: px, info } = await sharp(join(GAME, `wang/${n}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  tilesets.set(n, templateOf(new Uint8Array(px), info.width, info.height));
}
const overlay = new Uint8Array(await sharp(join(GAME, 'wang/coalmine_overlay.png')).removeAlpha().raw().toBuffer());
const layouts = generateLayouts(map, session.seed, tilesets, overlay);
host.call('sim_set_world_seed', session.seed);
host.call('seed_set_flags', true, '');
const walk: ItemWalk = { scenes: [], calls: [] };
const items = placeItems(host.call, map, layouts, data, undefined, walk);

// Only what happened in the cave biomes our walk covers (the game also runs Holy Mountains and the like).
const caveBiomes = new Set(layouts.map((l) => map.areas[l.area]!.biome));
const biomeOf = (x: number, y: number) => {
  const cx = Math.floor(x / map.chunk + map.w / 2);
  const cy = Math.floor(y / map.chunk + map.offsetY);
  return cx < 0 || cy < 0 || cx >= map.w || cy >= map.h ? -1 : map.cells[cy * map.w + cx]!;
};
const key = (n: string, x: number, y: number) => `${n}|${Math.round(x)}|${Math.round(y)}`;
const ourCalls = new Set(walk.calls.map(([n, x, y]) => key(n, x, y)));
const ourScenes = new Set(walk.scenes.map(([n, x, y]) => key(n, x, y)));
const inCaves = (l: Line) => caveBiomes.has(biomeOf(l.x, l.y));
const report = (what: string, lines: Line[], ours: Set<string>) => {
  const byBiome = new Map<string, { n: number; hit: number; miss: Line[] }>();
  for (const l of lines) {
    const id = map.biomes[biomeOf(l.x, l.y)]!.id;
    const b = byBiome.get(id) ?? { n: 0, hit: 0, miss: [] };
    b.n++;
    if (ours.has(key(l.name, l.x, l.y))) b.hit++;
    else b.miss.push(l);
    byBiome.set(id, b);
  }
  console.log(`${what}: ${lines.filter((l) => ours.has(key(l.name, l.x, l.y))).length} / ${lines.length} match`);
  for (const [id, b] of byBiome) {
    console.log(`  ${id}: ${b.hit}/${b.n}${b.miss.length ? `  missed: ${b.miss.slice(0, 4).map((l) => `${l.name.replace('data/biome_impl/', '')}@${l.x},${l.y}`).join(' ')}` : ''}`);
  }
};
const calls = session.lines.filter((l) => l.t === 'S' && l.name !== 'init' && inCaves(l));
const scenes = session.lines.filter((l) => l.t === 'P' && inCaves(l));
console.log(`seed ${session.seed}: ${calls.length} marker calls and ${scenes.length} rooms in the cave biomes`);
// Calls the walk skips (enemies, props) aren't in the trace either; calls from a room's markers count as well.
report('marker calls', calls, ourCalls);
report('rooms', scenes, ourScenes);
// Items: what the game loaded that the map's Items layer knows (wands, chests, hearts, flasks…).
const loaded = session.lines.filter((l) => l.t === 'E' && data.entities[l.name] && inCaves(l));
report('items', loaded, new Set(items.map((i) => key(i.file, i.x, i.y))));

if (fixture) {
  writeFileSync(fixture, JSON.stringify({ seed: session.seed, scenes: scenes.map((s) => [s.name, s.x, s.y]), calls: calls.map((c) => [c.name, c.x, c.y]) }));
  console.log('wrote', fixture);
}
process.exit(0);
