// Checks the map's room placement against what the game really did: reads save00/companion_trace.txt (written by
// the mod's "Record world generation" setting), takes its last session's seed, places that seed's rooms the way the
// app does, and compares each marker call and pixel scene the game logged with ours.
// Usage: npx tsx tools/trace-check.ts [trace file] [--fixture tests/fixtures/trace.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLuaHost, seedSource } from './extract/lua.ts';
import { generateLayouts, templateOf, type Template } from '../src/seed/layout.ts';
import { placePois, type PoiData, type SeedPoi } from '../src/seed/poi.ts';
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
const shipped = new Set(JSON.parse(readFileSync(join(GAME, 'lua/seed-files.json'), 'utf8')) as string[]);
const host = await createLuaHost((p) => (shipped.has(p) && existsSync(join(GAME, 'lua', p)) ? readFileSync(join(GAME, 'lua', p), 'utf8') : undefined));
await host.lua.doString(seedSource);
const tilesets = new Map<string, Template>();
for (const n of new Set(map.biomes.flatMap((b) => (b.wangTemplate ? [b.wangTemplate] : [])))) {
  const { data, info } = await sharp(join(GAME, `wang/${n}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  tilesets.set(n, templateOf(new Uint8Array(data), info.width, info.height));
}
const overlay = new Uint8Array(await sharp(join(GAME, 'wang/coalmine_overlay.png')).removeAlpha().raw().toBuffer());
const layouts = generateLayouts(map, session.seed, tilesets, overlay);
host.call('sim_set_world_seed', session.seed);
// Every scene a room function loads, not only the curated ones, each a 1-pixel box (no biome-edge check).
const everything: PoiData = { scenes: new Proxy({}, { get: (_t, k) => ({ name: String(k), kind: 'room', w: 1, h: 1 }) }) };
const ours: SeedPoi[] = placePois(host.call, map, layouts, everything);

const scenes = session.lines.filter((l) => l.t === 'P');
const key = (f: string, x: number, y: number) => `${f}|${Math.round(x)}|${Math.round(y)}`;
const mine = new Set(ours.map((p) => key(p.file, p.x, p.y)));
const exact = scenes.filter((s) => mine.has(key(s.name, s.x, s.y)));
console.log(`seed ${session.seed}: the game loaded ${scenes.length} pixel scenes (${new Set(scenes.map((s) => s.name)).size} kinds); ours places ${ours.length}`);
console.log(`exact matches (file and spot): ${exact.length}`);
// Where the game loaded a scene we don't have at that spot: what do we have nearby, and how far off?
const missed = scenes.filter((s) => !mine.has(key(s.name, s.x, s.y)));
const near = (s: Line) =>
  ours
    .map((p) => ({ p, d: Math.hypot(p.x - s.x, p.y - s.y) }))
    .filter((n) => n.d < 40)
    .sort((a, b) => a.d - b.d)[0];
for (const s of missed.slice(0, 40)) {
  const n = near(s);
  console.log(`  game ${s.name.replace('data/biome_impl/', '')} @ ${s.x},${s.y}  ours: ${n ? `${n.p.file.replace('data/biome_impl/', '')} @ ${n.p.x},${n.p.y} (off ${n.p.x - s.x},${n.p.y - s.y})` : 'nothing near'}`);
}
// The marker calls themselves: do our marker positions line up with the engine's?
const calls = session.lines.filter((l) => l.t === 'S' && l.name !== 'init');
const offsets = new Map<string, number>();
for (const c of calls) {
  const n = ours.find((p) => Math.abs(p.x - c.x) <= 12 && Math.abs(p.y - c.y) <= 12);
  if (n) offsets.set(`${n.x - c.x},${n.y - c.y}`, (offsets.get(`${n.x - c.x},${n.y - c.y}`) ?? 0) + 1);
}
console.log(`marker calls: ${calls.length}; offsets from our nearest room (ours - game): ${[...offsets].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`).join(' ')}`);

if (fixture) {
  // The rooms (and the marker calls in the cave biomes), for a test that needs no game.
  writeFileSync(fixture, JSON.stringify({ seed: session.seed, scenes: scenes.map((s) => [s.name, s.x, s.y]), calls: calls.map((c) => [c.name, c.x, c.y]) }));
  console.log('wrote', fixture);
}
process.exit(0);
