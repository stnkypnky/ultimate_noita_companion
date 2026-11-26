// Extracts game data from the local Noita install into public/game/. Run: npm run extract
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { Enemy, EntityVisual, GameVersion, Item, Legs, Projectile, RangeProp, SpriteLayer } from '../../src/data/types.ts';
import { collectItems } from './items.ts';
import { collectVisuals, rangeProps, type LayerOut } from './visuals.ts';
import { rangeKit } from './kit.ts';
import { BIOMES } from '../../src/features/range/biomes.ts';
import { buildWorldMap } from './map.ts';
import { Wak } from './wak.ts';
import { findNoita } from './paths.ts';
import { createLuaHost, loadGun, seedSource } from './lua.ts';
import { materialTable, runAllSeedInfo, setupSeed } from '../../src/seed/seed.ts';
import { parseTranslations } from './translations.ts';
import { buildProjectile, buildSpells, type RawAction } from './spells.ts';
import { buildPerks, type RawPerk } from './perks.ts';
import { buildMaterials } from './materials.ts';
import { buildEnemies, enemyIconFiles, linkEnemies, type LegsOut } from './enemies.ts';
import { biomeSpawns } from './spawns.ts';
import { materialSources } from './materialSources.ts';
import { perkOdds } from './perkOdds.ts';
import { EntityLoader } from './entity.ts';
import { buildAtlas, buildPackedAtlas, firstFrame } from './sprites.ts';
import { bitmapFont } from './fonts.ts';
import { FIXED_POIS, POI_TABLE } from './pois.ts';
import { placePois, type PoiData, type PoiInfo, type PoiStats } from '../../src/seed/poi.ts';
import { generateLayouts, templateOf, type Template } from '../../src/seed/layout.ts';
import { ENGINE_SPAWNS, itemDetails, itemSpawnsOf, placeItems, type ItemData, type ItemStats } from '../../src/seed/items.ts';
import { itemEntities, sceneSpawns } from './worldItems.ts';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'public/game');

const noita = findNoita();
console.log(`Noita: ${noita}`);
const wak = new Wak(join(noita, 'data/data.wak'));
console.log(`data.wak: ${wak.entries.size} files`);
const readGame = (p: string) => (wak.has(p) ? wak.text(p) : undefined);

const t = parseTranslations(readFileSync(join(noita, 'data/translations/common.csv'), 'utf8'));
console.log(`translations: ${t.size} keys`);

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'data'), { recursive: true });
const writeJson = (rel: string, v: unknown) => writeFile(join(OUT, rel), JSON.stringify(v));

// ---------- Spells (reflection through the real gun scripts) ----------
const gunHost = await createLuaHost(readGame);
await loadGun(gunHost);
const rawActions = JSON.parse(gunHost.call<string>('reflect_actions')) as RawAction[];
const defaultState = JSON.parse(gunHost.call<string>('default_state_json')) as Record<string, number>;
const reflectErrors = rawActions.filter((a) => a.reflect_error);
if (reflectErrors.length) console.warn(`reflection errors: ${reflectErrors.map((a) => `${a.id}: ${a.reflect_error}`).join('\n  ')}`);

const spellIconInputs = await Promise.all(
  [...new Set(rawActions.map((a) => a.sprite))].filter((s) => wak.has(s)).map(async (s) => ({ key: s, png: await firstFrame(wak.bytes(s)) })),
);
const spellAtlas = await buildAtlas(spellIconInputs);
const spells = buildSpells(rawActions, t, spellAtlas.rects);

const loader = new EntityLoader(wak);
const projectiles: Record<string, Projectile> = {};
for (const file of new Set(spells.flatMap((s) => s.projectiles))) {
  const p = buildProjectile(file, loader);
  if (p) projectiles[file] = p;
}
console.log(`spells: ${spells.length}, projectiles: ${Object.keys(projectiles).length}`);

// Lua sources the simulator needs at runtime: exactly what loading gun.lua touched.
const luaFiles = [...gunHost.filesRead];
for (const f of luaFiles) {
  const dest = join(OUT, 'lua', f);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, wak.bytes(f));
}
gunHost.close();

// ---------- Perks ----------
const perkHost = await createLuaHost(readGame);
await perkHost.lua.doString('dofile("data/scripts/perks/perk_list.lua") __perks_json = json_encode(perk_list)');
const rawPerks = JSON.parse(perkHost.lua.global.get('__perks_json') as string) as RawPerk[];
perkHost.close();
const perkIconInputs = await Promise.all(
  [...new Set(rawPerks.map((p) => p.ui_icon).filter((s): s is string => !!s && wak.has(s)))].map(async (s) => ({ key: s, png: await firstFrame(wak.bytes(s)) })),
);
const perkAtlas = await buildAtlas(perkIconInputs, 16);
const perks = buildPerks(rawPerks, t, perkAtlas.rects);
console.log(`perks: ${perks.length}`);

// ---------- Enemies (progress-screen list) ----------
const enemyIcons = enemyIconFiles(wak);
const enemyAtlas = await buildAtlas(await Promise.all(enemyIcons.map(async (f) => ({ key: f, png: await firstFrame(wak.bytes(f)) }))), 24);
const spellNameByFile = new Map<string, string>();
for (const s of spells) for (const f of s.projectiles) if (!spellNameByFile.has(f)) spellNameByFile.set(f, s.name);
const bestiary = await buildEnemies(enemyIcons, wak, loader, t, enemyAtlas.rects, spellNameByFile);
linkEnemies(bestiary.enemies, await biomeSpawns(wak, t), wak.text('data/genome_relations.csv'));
// Portraits and every animation frame share one atlas.
const portraitAtlas = await buildPackedAtlas([...bestiary.portraits, ...[...bestiary.images].map(([key, png]) => ({ key: `f:${key}`, png }))], 2048);
const frameIcon = (k: string) => portraitAtlas.rects.get(`f:${k}`) ?? { x: 0, y: 0, w: 0, h: 0 };
/** Legs with their image keys swapped for where the images landed in the atlas. */
function legIcons({ upper, lower, lowerRight, knee, attacker, ...rest }: LegsOut): Legs {
  return {
    ...rest,
    upper: frameIcon(upper),
    lower: frameIcon(lower),
    ...(lowerRight ? { lowerRight: frameIcon(lowerRight) } : {}),
    ...(knee ? { knee: frameIcon(knee) } : {}),
    ...(attacker
      ? { attacker: { reach: attacker.reach, radius: attacker.radius, upper: frameIcon(attacker.upper), lower: frameIcon(attacker.lower), ...(attacker.joint ? { joint: frameIcon(attacker.joint) } : {}) } }
      : {}),
  };
}
const enemies: Enemy[] = bestiary.enemies.map(({ anims, legs, ...e }) => ({
  ...e,
  ...(portraitAtlas.rects.has(e.id) ? { portrait: portraitAtlas.rects.get(e.id)! } : {}),
  ...(anims ? { anims: anims.map((a) => ({ ...a, layers: a.layers.map((l) => ({ ...l, frames: l.frames.map(frameIcon) })) })) } : {}),
  ...(legs ? { legs: legIcons(legs) } : {}),
}));
console.log(`enemies: ${enemies.length}, ${bestiary.portraits.length} portraits, ${bestiary.images.size} frames, atlas ${portraitAtlas.size.join('x')}`);
if (process.env.ENEMY_SCRIPTS) for (const [id, s] of bestiary.scripts) console.log(`  ${id}: ${s.join(' ')}`);

// ---------- Items (world pickups) ----------
const itemData = await collectItems(wak, loader, t);
const itemAtlas = await buildAtlas(itemData.images, 16);
const items: Item[] = itemData.items.map(({ iconKey, ...it }) => ({ ...it, icon: itemAtlas.rects.get(iconKey) ?? { x: 0, y: 0, w: 0, h: 0 } }));
console.log(`items: ${items.length}`);

// ---------- Materials ----------
const { materials, reactions, textures, wang } = buildMaterials(wak.text('data/materials.xml'), t);
await mkdir(join(OUT, 'materials'), { recursive: true });
for (const [id, tex] of textures) {
  if (!wak.has(tex)) continue;
  await writeFile(join(OUT, 'materials', `${id}.png`), wak.bytes(tex));
  // The texture's average colour: how the material reads from afar (its `color` is often just its wang key).
  const s = await sharp(wak.bytes(tex), { ignoreIcc: true }).stats();
  const m = materials.find((x) => x.id === id);
  if (m && s.channels.length >= 3) m.look = `#${s.channels.slice(0, 3).map((c) => Math.round(c.mean).toString(16).padStart(2, '0')).join('')}`;
}
console.log(`materials: ${materials.length}, reactions: ${reactions.length}, textures: ${textures.size}`);

// ---------- Seed tool: the game scripts it runs, found by running them once ----------
const seedHost = await createLuaHost(readGame);
await seedHost.lua.doString(seedSource);
setupSeed(seedHost.call, { seed: 1, materials: materialTable(materials), allUnlocked: true, flags: [] });
runAllSeedInfo(seedHost.call);
// The world map (built here so the seed tool gets the cave biomes' scripts: they place points of interest).
const world = await buildWorldMap(wak, t);
const poiScripts = [...new Set(world.map.biomes.flatMap((b) => (b.luaScript ? [b.luaScript] : [])))];
for (const s of poiScripts) {
  const r = JSON.parse(seedHost.call('seed_poi_load', s) as string) as { error?: string };
  if (r.error) console.warn(`points of interest: ${s} failed to load: ${r.error}`);
}
// A whole placement for one seed, so whatever the room functions load as they run is shipped too.
const tilesets = new Map<string, Template>();
for (const [key, png] of world.wangImages) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  tilesets.set(key, templateOf(new Uint8Array(data), info.width, info.height));
}
const overlay = new Uint8Array(await sharp(readFileSync(join(import.meta.dirname, 'assets/coalmine_overlay.png'))).removeAlpha().raw().toBuffer());
const seedOneLayouts = generateLayouts(world.map, 1, tilesets, overlay);
{
  seedHost.call('sim_set_world_seed', 1);
  const stats: PoiStats[] = [];
  const placed = placePois(seedHost.call, world.map, seedOneLayouts, { scenes: new Proxy({}, { get: () => undefined }) }, stats);
  const errors = stats.reduce((n, s) => n + s.errors, 0);
  console.log(`points of interest: seed 1 ran ${stats.reduce((n, s) => n + s.markers, 0)} room markers (${errors} failed, ${placed.length} kept)`);
}
/** Set wands' own scripts (level_1_wand.lua…): which run depends on the seed, so all are shipped. */
const presetScripts: string[] = [];
// The map's Items layer: the item entities, the markers inside the rooms (in any colour some biome spawns by), and
// a whole item pass for seed 1, so the scripts chests, flasks and wands run are shipped too.
{
  const colours = new Set(Object.keys(ENGINE_SPAWNS).map((c) => parseInt(c, 16)));
  for (const s of poiScripts) {
    const r = itemSpawnsOf(seedHost.call, s);
    if (r.error) console.warn(`items: ${s} failed to load: ${r.error}`);
    for (const c of Object.keys(r.spawns ?? {})) colours.add(parseInt(c, 16));
  }
  const worldItems: ItemData = { entities: itemEntities(wak, items), scenes: await sceneSpawns(wak, colours) };
  presetScripts.push(...Object.values(worldItems.entities).flatMap((e) => (e.preset?.script && wak.has(e.preset.script) ? [e.preset.script] : [])));
  await writeJson('data/world_items.json', worldItems);
  seedHost.call('sim_set_world_seed', 1);
  const stats: ItemStats[] = [];
  const placed = itemDetails(seedHost.call, worldItems, placeItems(seedHost.call, world.map, seedOneLayouts, worldItems, stats));
  const by = new Map<string, number>();
  for (const it of placed) by.set(it.kind, (by.get(it.kind) ?? 0) + 1);
  console.log(
    `items: ${Object.keys(worldItems.entities).length} entities, ${Object.keys(worldItems.scenes).length} rooms with markers; seed 1 placed ${placed.length} (${[...by].map(([k, n]) => `${k} ${n}`).join(', ')}), ` +
      `${stats.reduce((n, s) => n + s.markers, 0)} markers (${stats.reduce((n, s) => n + s.errors, 0)} failed); ` +
      `${placed.filter((i) => i.wand).length} wands rolled, ${placed.filter((i) => i.contents?.length).length} chests opened, ${placed.filter((i) => i.material).length} flasks filled`,
  );
}
// Shop wands load data/scripts/gun/procedural/wand_<kind>_<level>.lua by level, which depends on the seed: take them all.
// The item scripts too (chests, flasks): which of their branches run depends on the seed.
const seedLuaFiles = [
  ...new Set([
    ...seedHost.filesRead,
    ...wak.list('data/scripts/gun/procedural/').filter((f) => /\/wand_(level|unshuffle)_\d+\.lua$/.test(f)),
    ...wak.list('data/scripts/items/').filter((f) => f.endsWith('.lua')),
    ...presetScripts,
  ]),
];
for (const f of seedLuaFiles) {
  const dest = join(OUT, 'lua', f);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, wak.bytes(f));
}
// How often each perk is offered: the real perk deck over many seeds.
{
  const t0 = Date.now();
  const odds = perkOdds(seedHost.call, materialTable(materials));
  for (const p of perks) {
    const o = odds.get(p.id);
    if (o) p.odds = o;
  }
  console.log(`perk odds: ${odds.size} perks offered, ${Date.now() - t0} ms`);
}
seedHost.close();
console.log(`seed tool: ${seedLuaFiles.length} game scripts`);
// Texts the seed tool shows: biome modifier descriptions ("The air feels extremely humid").
await writeJson('data/seed_strings.json', Object.fromEntries([...t].filter(([k]) => k.startsWith('biomemodifierdesc_'))));

// ---------- Test range: projectile/effect visuals, dummy & player sprites ----------
const materialLook = new Map(materials.map((m) => [m.id, { color: m.color, glow: m.cellType === 'fire', texture: textures.get(m.id) }]));
const visualFiles = [...new Set([...spells.flatMap((s) => s.projectiles), ...spells.flatMap((s) => [...s.extraEntities, ...String(s.stats.extra_entities ?? '').split(',')])].filter(Boolean))];
// Physics images mark each pixel's material with its wang_color.
const wangLook = new Map([...wang].flatMap(([rgb, id]) => (materialLook.has(id) ? [[rgb, materialLook.get(id)!] as const] : [])));
const vis = await collectVisuals(visualFiles, wak, loader, materialLook, wangLook);
// Entities spells spawn indirectly (bounce effects, orbiting projectiles, chain-bolt hops) need projectile data too.
for (const f of vis.entities) {
  if (projectiles[f]) continue;
  const p = buildProjectile(f, loader);
  if (p) projectiles[f] = p;
}
const projAtlas = await buildPackedAtlas(vis.images, 1024);
const layer = (l: LayerOut): SpriteLayer => ({ ...l, frames: l.frames.map((k) => projAtlas.rects.get(k)!) });
const visuals: Record<string, EntityVisual> = {};
for (const [file, v] of Object.entries(vis.visuals)) {
  const { sprites, explosion, spriteEmitters, ...rest } = v;
  visuals[file] = {
    ...rest,
    ...(sprites ? { sprites: sprites.map(layer) } : {}),
    ...(spriteEmitters ? { spriteEmitters: spriteEmitters.map((s) => ({ ...s, sprite: layer(s.sprite) })) } : {}),
    ...(explosion ? { explosion: { ...explosion, sprite: explosion.sprite && layer(explosion.sprite) } } : {}),
  };
}
const props: Record<string, RangeProp> = {};
for (const [key, f] of Object.entries(await rangeProps(wak))) {
  const m = await sharp(f.png).metadata();
  props[key] = { w: m.width ?? 0, h: m.height ?? 0, ox: f.ox, oy: f.oy };
  await mkdir(join(OUT, 'sprites'), { recursive: true });
  await writeFile(join(OUT, `sprites/range_${key}.png`), f.png);
}
console.log(`visuals: ${Object.keys(visuals).length} entities, ${vis.images.length} sprites; range props: ${Object.keys(props).join(', ')}`);
// The world map: biome per chunk, and the pictures of the fixed pixel scenes.
await mkdir(join(OUT, 'map'), { recursive: true });
for (const [key, png] of world.images) await writeFile(join(OUT, 'map', `${key}.png`), png);
await writeJson('data/map.json', world.map);
// Cave layouts: the wang templates, the Mines' fixed entrance overlay (from noita-tools, MIT), and which material
// each layout colour is (materials.xml wang_color).
await mkdir(join(OUT, 'wang'), { recursive: true });
for (const [key, png] of world.wangImages) await writeFile(join(OUT, 'wang', `${key}.png`), png);
await writeFile(join(OUT, 'wang', 'coalmine_overlay.png'), readFileSync(join(import.meta.dirname, 'assets/coalmine_overlay.png')));
await writeJson('data/wang_colors.json', Object.fromEntries(wang));
// Where each material is found: biomes, rooms, flasks, pouches and creatures.
const sources = await materialSources(wak, world.map, wang, enemies, new Set(materials.map((m) => m.id)));
await writeJson('data/material_sources.json', sources);
console.log(`material sources: ${Object.keys(sources).length} materials placed`);
console.log(`map: ${world.map.w}×${world.map.h} chunks, ${world.map.biomes.length} biomes, ${world.map.scenes.length} pixel scenes`);
// Points of interest: the curated rooms with their sizes (a room only loads where it fits inside its biome).
const sized = async (table: typeof POI_TABLE) => {
  const out: Record<string, PoiInfo> = {};
  for (const [file, e] of Object.entries(table)) {
    const m = file.endsWith('.png') && wak.has(file) ? await sharp(wak.bytes(file)).metadata() : null;
    if (file.endsWith('.png') && !m) {
      console.warn(`points of interest: missing ${file}`);
      continue;
    }
    // A portal (an entity file) brings its own size.
    out[file] = { ...e, w: m?.width ?? ('w' in e && e.w ? e.w : 0), h: m?.height ?? ('h' in e && e.h ? e.h : 0) };
  }
  return out;
};
const poiData: PoiData = { scenes: await sized(POI_TABLE), fixed: await sized(FIXED_POIS) };
await writeJson('data/pois.json', poiData);
console.log(`points of interest: ${Object.keys(poiData.scenes).length} placed per seed, ${Object.keys(poiData.fixed!).length} fixed, from ${poiScripts.length} biome scripts`);
// The cave backgrounds behind each biome the range can look like and the map shows (Topology background_image).
await mkdir(join(OUT, 'backgrounds'), { recursive: true });
for (const bg of new Set([...BIOMES.flatMap((b) => (b.background ? [b.background] : [])), ...world.backgrounds])) {
  const file = `data/weather_gfx/${bg}.png`;
  if (wak.has(file)) await writeFile(join(OUT, 'backgrounds', `${bg}.png`), wak.bytes(file));
  else console.warn(`range background missing: ${file}`);
}
const kit = await rangeKit(wak);
for (const [rel, png] of Object.entries(kit.files)) await writeFile(join(OUT, rel), png);
console.log(`range kit: ${Object.keys(kit.kit.player.anims).length} player animations, ${kit.kit.wands.length} wand sprites`);

// ---------- UI chrome from the game ----------
await mkdir(join(OUT, 'ui'), { recursive: true });
for (const f of wak.list('data/ui_gfx/inventory/')) {
  if (/(item_bg_|quick_inventory_box|full_inventory_box)/.test(f)) await writeFile(join(OUT, 'ui', f.split('/').pop()!), wak.bytes(f));
}
// Panel frames (the tooltip 9-piece, the important-message box, tabs) and the inventory stat icons.
for (const f of ['9piece0.png', '9piece0_gray.png', '3piece_important_msg.png', 'tab.png', 'tab_hovered.png', 'tab_selected.png']) {
  await writeFile(join(OUT, 'ui', f), wak.bytes(`data/ui_gfx/decorations/${f}`));
}
await mkdir(join(OUT, 'ui/icons'), { recursive: true });
const statIcons = wak.list('data/ui_gfx/inventory/icon_').filter((f) => f.endsWith('.png'));
for (const f of statIcons) await writeFile(join(OUT, 'ui/icons', f.split('/icon_').pop()!), wak.bytes(f));
// The banners the game shows on entering a biome with a modifier (Humid, Booby-trapped…), for the map.
await mkdir(join(OUT, 'ui/modifiers'), { recursive: true });
for (const f of wak.list('data/ui_gfx/decorations_biome_modifier/').filter((f) => f.endsWith('.png'))) {
  await writeFile(join(OUT, 'ui/modifiers', f.split('/').pop()!), wak.bytes(f));
}
// The HUD's health and gold icons, for creature stats.
for (const f of ['health', 'money']) await writeFile(join(OUT, `ui/icons/hud_${f}.png`), wak.bytes(`data/ui_gfx/hud/${f}.png`));
// The game's bitmap fonts live next to data.wak, not inside it.
await mkdir(join(OUT, 'fonts'), { recursive: true });
const fontsDir = join(noita, 'data/fonts');
for (const [file, family] of [
  ['font_pixel_noshadow', 'Noita Pixel'],
  ['font_pixel_big', 'Noita Pixel Caps'],
  ['font_pixel_runes', 'Noita Runes'],
] as const) {
  await writeFile(join(OUT, `fonts/${file}.otf`), await bitmapFont(fontsDir, file, family));
}
console.log(`ui: ${statIcons.length} stat icons, 3 fonts`);

// ---------- Write ----------
await mkdir(join(OUT, 'sprites'), { recursive: true });
await writeFile(join(OUT, 'sprites/spells.png'), spellAtlas.png);
await writeFile(join(OUT, 'sprites/perks.png'), perkAtlas.png);
await writeFile(join(OUT, 'sprites/enemies.png'), enemyAtlas.png);
await writeFile(join(OUT, 'sprites/bestiary.png'), portraitAtlas.png);
await writeJson('data/enemies.json', enemies);
await writeFile(join(OUT, 'sprites/items.png'), itemAtlas.png);
await writeJson('data/items.json', items);
await writeFile(join(OUT, 'sprites/projectiles.png'), projAtlas.png);
await writeJson('data/visuals.json', visuals);
await writeJson('data/range_props.json', props);
await writeJson('data/range_kit.json', kit.kit);
await writeJson('data/spells.json', spells);
await writeJson('data/projectiles.json', projectiles);
await writeJson('data/perks.json', perks);
await writeJson('data/materials.json', materials);
await writeJson('data/reactions.json', reactions);
await writeJson('data/default_state.json', defaultState);
await writeJson('lua/files.json', luaFiles);
await writeJson('lua/seed-files.json', seedLuaFiles);

const hashFile = join(noita, '_version_hash.txt');
const branchFile = join(noita, '_branch.txt');
const version: GameVersion = {
  gameHash: existsSync(hashFile) ? readFileSync(hashFile, 'utf8').trim() : 'unknown',
  branch: existsSync(branchFile) ? readFileSync(branchFile, 'utf8').trim() : 'unknown',
  extractedAt: new Date().toISOString(),
  counts: { spells: spells.length, perks: perks.length, enemies: enemies.length, items: items.length, materials: materials.length, reactions: reactions.length, projectiles: Object.keys(projectiles).length },
  atlases: { spells: spellAtlas.size, perks: perkAtlas.size, enemies: enemyAtlas.size, bestiary: portraitAtlas.size, items: itemAtlas.size, projectiles: projAtlas.size },
};
await writeJson('version.json', version);
wak.close();
console.log('done →', OUT);
