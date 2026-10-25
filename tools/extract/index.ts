// Extracts game data from the local Noita install into public/game/. Run: npm run extract
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { EntityVisual, GameVersion, Item, Projectile, RangeProp, SpriteLayer } from '../../src/data/types.ts';
import { collectItems } from './items.ts';
import { collectVisuals, rangeProps, type LayerOut } from './visuals.ts';
import { rangeKit } from './kit.ts';
import { Wak } from './wak.ts';
import { findNoita } from './paths.ts';
import { createLuaHost, loadGun } from './lua.ts';
import { parseTranslations } from './translations.ts';
import { buildProjectile, buildSpells, type RawAction } from './spells.ts';
import { buildPerks, type RawPerk } from './perks.ts';
import { buildMaterials } from './materials.ts';
import { buildEnemies, enemyIconFiles } from './enemies.ts';
import { EntityLoader } from './entity.ts';
import { buildAtlas, buildPackedAtlas, firstFrame } from './sprites.ts';

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
const enemies = buildEnemies(enemyIcons, loader, t, enemyAtlas.rects);
console.log(`enemies: ${enemies.length}`);

// ---------- Items (world pickups) ----------
const itemData = await collectItems(wak, loader, t);
const itemAtlas = await buildAtlas(itemData.images, 16);
const items: Item[] = itemData.items.map(({ iconKey, ...it }) => ({ ...it, icon: itemAtlas.rects.get(iconKey) ?? { x: 0, y: 0, w: 0, h: 0 } }));
console.log(`items: ${items.length}`);

// ---------- Materials ----------
const { materials, reactions, textures } = buildMaterials(wak.text('data/materials.xml'), t);
await mkdir(join(OUT, 'materials'), { recursive: true });
for (const [id, tex] of textures) {
  if (wak.has(tex)) await writeFile(join(OUT, 'materials', `${id}.png`), wak.bytes(tex));
}
console.log(`materials: ${materials.length}, reactions: ${reactions.length}, textures: ${textures.size}`);

// ---------- Test range: projectile/effect visuals, dummy & player sprites ----------
const materialLook = new Map(materials.map((m) => [m.id, { color: m.color, glow: m.cellType === 'fire', texture: textures.get(m.id) }]));
const visualFiles = [...new Set([...spells.flatMap((s) => s.projectiles), ...spells.flatMap((s) => [...s.extraEntities, ...String(s.stats.extra_entities ?? '').split(',')])].filter(Boolean))];
const vis = await collectVisuals(visualFiles, wak, loader, materialLook);
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
  const { sprites, explosion, ...rest } = v;
  visuals[file] = {
    ...rest,
    ...(sprites ? { sprites: sprites.map(layer) } : {}),
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
const kit = await rangeKit(wak);
for (const [rel, png] of Object.entries(kit.files)) await writeFile(join(OUT, rel), png);
console.log(`range kit: ${Object.keys(kit.kit.player.anims).length} player animations, ${kit.kit.wands.length} wand sprites`);

// ---------- UI chrome from the game ----------
await mkdir(join(OUT, 'ui'), { recursive: true });
for (const f of wak.list('data/ui_gfx/inventory/')) {
  if (/(item_bg_|quick_inventory_box|full_inventory_box)/.test(f)) await writeFile(join(OUT, 'ui', f.split('/').pop()!), wak.bytes(f));
}

// ---------- Write ----------
await mkdir(join(OUT, 'sprites'), { recursive: true });
await writeFile(join(OUT, 'sprites/spells.png'), spellAtlas.png);
await writeFile(join(OUT, 'sprites/perks.png'), perkAtlas.png);
await writeFile(join(OUT, 'sprites/enemies.png'), enemyAtlas.png);
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

const hashFile = join(noita, '_version_hash.txt');
const branchFile = join(noita, '_branch.txt');
const version: GameVersion = {
  gameHash: existsSync(hashFile) ? readFileSync(hashFile, 'utf8').trim() : 'unknown',
  branch: existsSync(branchFile) ? readFileSync(branchFile, 'utf8').trim() : 'unknown',
  extractedAt: new Date().toISOString(),
  counts: { spells: spells.length, perks: perks.length, enemies: enemies.length, items: items.length, materials: materials.length, reactions: reactions.length, projectiles: Object.keys(projectiles).length },
  atlases: { spells: spellAtlas.size, perks: perkAtlas.size, enemies: enemyAtlas.size, items: itemAtlas.size, projectiles: projAtlas.size },
};
await writeJson('version.json', version);
wak.close();
console.log('done →', OUT);
