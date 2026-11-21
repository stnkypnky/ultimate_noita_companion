// Development probe: place points of interest for one seed straight from the game files, and print what each
// cave biome produced. Usage: npx tsx tools/poi-probe.ts [seed] [file filter]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { Wak } from './extract/wak.ts';
import { createLuaHost, seedSource } from './extract/lua.ts';
import { generateLayouts, templateOf, type Template } from '../src/seed/layout.ts';
import { placePois, type PoiStats } from '../src/seed/poi.ts';
import type { WorldMap } from '../src/data/types.ts';

const seed = Number(process.argv[2] ?? 123);
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const noita = process.env.NOITA_DIR ?? 'C:/Program Files (x86)/Steam/steamapps/common/Noita';
const wak = new Wak(join(noita, 'data/data.wak'));
const pub = join(import.meta.dirname, '../public/game');
const map = JSON.parse(readFileSync(join(pub, 'data/map.json'), 'utf8')) as WorldMap;
// Scripts per biome, from the biome files (until the extractor records them).
for (const b of map.biomes) {
  if (b.luaScript || !b.wangTemplate || !b.file || !wak.has(b.file)) continue;
  const s = /\blua_script="([^"]*)"/.exec(wak.text(b.file))?.[1];
  if (s && wak.has(s)) b.luaScript = s;
}
const tilesets = new Map<string, Template>();
for (const n of new Set(map.biomes.flatMap((b) => (b.wangTemplate ? [b.wangTemplate] : [])))) {
  const { data, info } = await sharp(join(pub, `wang/${n}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  tilesets.set(n, templateOf(new Uint8Array(data), info.width, info.height));
}
const ov = await sharp(join(pub, 'wang/coalmine_overlay.png')).removeAlpha().raw().toBuffer();
let t = Date.now();
const layouts = generateLayouts(map, seed, tilesets, new Uint8Array(ov));
console.log(`layouts: ${layouts.length} in ${Date.now() - t} ms`);

const host = await createLuaHost((p) => (wak.has(p) ? wak.text(p) : undefined));
await host.lua.doString(seedSource);
host.call('sim_set_world_seed', seed >>> 0);
// Every scene counts as interesting here, at its real size where we can read it.
const sizes = new Map<string, { w: number; h: number }>();
const scenes = new Proxy({} as Record<string, { name: string; kind: 'room'; w: number; h: number }>, {
  get: (_, f: string) => {
    if (filter && !filter.test(f)) return undefined;
    if (!sizes.has(f)) sizes.set(f, { w: 0, h: 0 });
    return { name: f, kind: 'room', ...sizes.get(f)! };
  },
});
for (const f of wak.list('data/biome_impl/')) {
  if (!f.endsWith('.png')) continue;
  const m = await sharp(wak.bytes(f)).metadata().catch(() => null);
  if (m) sizes.set(f, { w: m.width ?? 0, h: m.height ?? 0 });
}
t = Date.now();
const stats: PoiStats[] = [];
const pois = placePois(host.call, map, layouts, { scenes }, stats);
console.log(`placed ${pois.length} in ${Date.now() - t} ms`);
for (const s of stats) console.log(s);
const missing = Object.keys(host.lua.global.get('__world')?.missing ?? {});
if (missing.length) console.log('engine calls stubbed:', missing.join(', '));
const by = new Map<string, number>();
for (const p of pois) by.set(p.file, (by.get(p.file) ?? 0) + 1);
for (const [f, n] of [...by].sort()) console.log(n, f);
if (filter) for (const p of pois) console.log(p.file, p.x, p.y);
host.close();
wak.close();
