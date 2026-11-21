// Where each material is found: biome terrain (the <Materials> noise layers and the wang tile caves), the rooms each
// biome's script places, the fixed pixel scenes, what flasks and pouches hold, and what creatures bleed.
import sharp from 'sharp';
import type { Enemy, MaterialContainer, MaterialSources, MaterialWhere, WorldMap } from '../../src/data/types.ts';
import type { Wak } from './wak.ts';

const attr = (s: string, k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1];

/** Lua without its comments (block comments first: `--[[ … ]]` hides whole table entries). */
export const stripLuaComments = (src: string) => src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '').replace(/--[^\n]*/g, '');

/** The `material="…"` entries of a top-level Lua table `name = { … }`, in order. */
export function luaTableMaterials(src: string, name: string): string[] {
  const code = stripLuaComments(src);
  const start = new RegExp(`(?:^|\\n)\\s*${name}\\s*=\\s*\\{`).exec(code);
  if (!start) throw new Error(`no table ${name}`);
  let depth = 0;
  let i = start.index + start[0].length - 1;
  const from = i;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) break;
  }
  return [...code.slice(from, i).matchAll(/material\s*=\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/** Fails the extract when a script's odds no longer read as the code below assumes: re-check it by hand. */
function expect(src: string, file: string, snippets: string[]) {
  const flat = stripLuaComments(src).replace(/\s+/g, ' ');
  for (const s of snippets) if (!flat.includes(s.replace(/\s+/g, ' '))) throw new Error(`${file} changed: "${s}" not found; re-check its odds in materialSources.ts`);
}

type Odds = Map<string, number>;
const add = (o: Odds, m: string, p: number) => o.set(m, (o.get(m) ?? 0) + p);
const uniform = (o: Odds, list: string[], p: number) => list.forEach((m) => add(o, m, p / list.length));
/** Chance that Random(a, b) (inclusive integers) is at most n. */
const atMost = (a: number, b: number, n: number) => Math.max(0, Math.min(1, (n - a + 1) / (b - a + 1)));

/** What each kind of flask or pouch holds, as odds 0..1 (ignoring the game's special-date drinks). */
export function containerOdds(read: (path: string) => string): Record<MaterialContainer['kind'], Odds> {
  // A random flask (world flasks, shops, chests): data/scripts/items/potion.lua init().
  const potionFile = 'data/scripts/items/potion.lua';
  const potion = read(potionFile);
  expect(potion, potionFile, [
    'if( Random( 0, 100 ) <= 75 ) then',
    'if( Random( 0, 100000 ) <= 50 ) then potion_material = "magic_liquid_hp_regeneration"',
    'elseif( Random( 200, 100000 ) <= 250 ) then potion_material = "purifying_powder"',
    'elseif( Random( 250, 100000 ) <= 500 ) then',
    'potion_material = "magic_liquid_weakness" else potion_material = random_from_array( materials_magic )',
    'else potion_material = random_from_array( materials_standard )',
  ]);
  const flask: Odds = new Map();
  const magic = atMost(0, 100, 75);
  const hp = atMost(0, 100000, 50);
  const purifying = (1 - hp) * atMost(200, 100000, 250);
  const weakness = (1 - hp) * (1 - atMost(200, 100000, 250)) * atMost(250, 100000, 500);
  add(flask, 'magic_liquid_hp_regeneration', magic * hp);
  add(flask, 'purifying_powder', magic * purifying);
  add(flask, 'magic_liquid_weakness', magic * weakness);
  uniform(flask, luaTableMaterials(potion, 'materials_magic'), magic * (1 - hp - purifying - weakness));
  uniform(flask, luaTableMaterials(potion, 'materials_standard'), 1 - magic);

  // The flask you start with, once you have died at least once (the very first run's is water).
  const startFile = 'data/scripts/items/potion_starting.lua';
  const start = read(startFile);
  expect(start, startFile, [
    'if( r_value <= 65 ) then r_value = Random( 1, 100 )',
    'if( r_value <= 10 ) then return "mud" end',
    'if( r_value <= 20 ) then return "water_swamp" end',
    'if( r_value <= 30 ) then return "water_salt" end',
    'if( r_value <= 40 ) then return "swamp" end',
    'if( r_value <= 50 ) then return "snow" end return "water"',
    'elseif( r_value <= 70 ) then return "blood"',
    'elseif( r_value <= 99 ) then r_value = Random( 0, 100 ) return random_from_array( { "acid", "magic_liquid_polymorph", "magic_liquid_random_polymorph", "magic_liquid_berserk", "magic_liquid_charm","magic_liquid_movement_faster" } )',
    'if( r_value == 666 ) then return "urine" end',
    'if( r_value == 79 ) then return "gold" end return random_from_array( { "slime", "gunpowder_unstable" } )',
  ]);
  const starting: Odds = new Map();
  for (const m of ['mud', 'water_swamp', 'water_salt', 'swamp', 'snow']) add(starting, m, 0.65 * 0.1);
  add(starting, 'water', 0.65 * 0.5);
  add(starting, 'blood', 0.05);
  uniform(starting, ['acid', 'magic_liquid_polymorph', 'magic_liquid_random_polymorph', 'magic_liquid_berserk', 'magic_liquid_charm', 'magic_liquid_movement_faster'], 0.29);
  add(starting, 'urine', 0.01 / 100001);
  add(starting, 'gold', 0.01 / 100001);
  uniform(starting, ['slime', 'gunpowder_unstable'], 0.01 * (1 - 2 / 100001));

  // What the Alchemist enemy throws (alchemist.xml attack_ranged_entity_file).
  const throwFile = 'data/scripts/items/potion_aggressive.lua';
  const thrown = read(throwFile);
  expect(thrown, throwFile, ['local potion = random_from_array( potions )']);
  const alchemist: Odds = new Map();
  uniform(alchemist, luaTableMaterials(thrown, 'potions'), 1);

  // The rare flask chests can drop (chest_random.lua, chest_random_super.lua).
  const secretFile = 'data/scripts/items/potion_secret.lua';
  const secret = read(secretFile);
  expect(secret, secretFile, ['local potion = random_from_array( potions )']);
  const chestFlask: Odds = new Map();
  uniform(chestFlask, luaTableMaterials(secret, 'potions'), 1);

  // A powder pouch: data/scripts/items/powder_stash.lua.
  const pouchFile = 'data/scripts/items/powder_stash.lua';
  const stash = read(pouchFile);
  expect(stash, pouchFile, [
    'if( Random( 0, 100 ) <= 75 ) then potion_material = random_from_array( materials_magic )',
    'else potion_material = random_from_array( materials_standard )',
  ]);
  const pouch: Odds = new Map();
  uniform(pouch, luaTableMaterials(stash, 'materials_magic'), atMost(0, 100, 75));
  uniform(pouch, luaTableMaterials(stash, 'materials_standard'), 1 - atMost(0, 100, 75));

  return { flask, starting, alchemist, chestFlask, pouch };
}

/** Material pixels of a material-key picture (wang tiles, pixel scenes), by material id. */
async function materialPixels(png: Buffer, wang: Map<string, string>) {
  const { data, info } = await sharp(png, { ignoreIcc: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map<string, number>();
  const byRgb = new Map<number, number>();
  for (let i = 0; i < data.length; i += 3) {
    const v = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    byRgb.set(v, (byRgb.get(v) ?? 0) + 1);
  }
  for (const [v, n] of byRgb) {
    const id = wang.get(v.toString(16).padStart(6, '0'));
    if (id && id !== 'air') counts.set(id, (counts.get(id) ?? 0) + n);
  }
  return { counts, total: info.width * info.height };
}

/** Biomes a player would call a place: named by the game, or the Forest. Filler rock and sky are left out. */
const isPlace = (b: WorldMap['biomes'][number]) => (!!b.name && b.name !== '_EMPTY_' && b.name !== '???') || b.id.startsWith('hills');

export async function materialSources(wak: Wak, map: WorldMap, wang: Map<string, string>, enemies: Enemy[], known: Set<string>): Promise<MaterialSources> {
  const out: MaterialSources = {};
  const entry = (id: string) => (out[id] ??= {});
  const where = (id: string, w: MaterialWhere) => {
    if (!known.has(id) || id === 'air') return;
    const list = (entry(id).biomes ??= []);
    const have = list.find((x) => x.biome === w.biome && x.how === w.how);
    if (have) have.share = Math.max(have.share ?? 0, w.share ?? 0) || undefined;
    else list.push(w.share === undefined ? { biome: w.biome, how: w.how } : w);
  };

  const pixelCache = new Map<string, Awaited<ReturnType<typeof materialPixels>>>();
  const pixels = async (file: string) => {
    if (!pixelCache.has(file)) pixelCache.set(file, await materialPixels(wak.bytes(file), wang));
    return pixelCache.get(file)!;
  };

  const seen = new Set<string>();
  for (const b of map.biomes) {
    if (!b.file || seen.has(b.file) || !wak.has(b.file) || !isPlace(b)) continue;
    seen.add(b.file);
    const xml = wak.text(b.file);
    // Terrain noise: the common bands are the ground itself, the rare ones pockets and ores.
    for (const m of xml.matchAll(/<MaterialComponent[\s\S]*?(?:<\/MaterialComponent>|\/>)/g)) {
      const name = attr(m[0], 'material_name');
      if (!name || attr(m[0], '_enabled') === '0') continue;
      where(name, { biome: b.id, how: attr(m[0], 'is_rare') === '1' ? 'pockets' : 'ground' });
    }
    // The caves: what the wang tile template paints besides rock and open space.
    const tpl = attr(xml, 'wang_template_file');
    if (tpl && wak.has(tpl)) {
      const { counts, total } = await pixels(tpl);
      // A few stray pixels (gold's handful in the Mines tiles) aren't something a player would find.
      for (const [id, n] of counts) if (n / total >= 1e-5) where(id, { biome: b.id, how: 'caves', share: n / total });
    }
    // Rooms its script can place: the material pictures it names.
    const script = attr(xml, 'lua_script');
    if (script && wak.has(script)) {
      const src = stripLuaComments(wak.text(script));
      const files = new Set([
        ...[...src.matchAll(/material_file\s*=\s*"([^"]+\.png)"/g)].map((m) => m[1]!),
        ...[...src.matchAll(/LoadPixelScene\(\s*"([^"]+\.png)"/g)].map((m) => m[1]!),
      ]);
      for (const f of files) {
        if (!wak.has(f)) continue;
        for (const id of (await pixels(f)).counts.keys()) where(id, { biome: b.id, how: 'rooms' });
      }
    }
  }

  // Fixed pixel scenes count as rooms of the place they sit in.
  for (const s of map.scenes) {
    if (!s.file.endsWith('.png') || !wak.has(s.file)) continue;
    const cx = Math.floor((s.x + s.w / 2) / map.chunk + map.w / 2);
    const cy = Math.floor((s.y + s.h / 2) / map.chunk + map.offsetY);
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) continue;
    const home = map.biomes[map.cells[cy * map.w + cx]!]!;
    if (!isPlace(home)) continue;
    for (const id of (await pixels(s.file)).counts.keys()) where(id, { biome: home.id, how: 'rooms' });
  }

  // Flasks and pouches.
  const odds = containerOdds((p) => wak.text(p));
  for (const [kind, o] of Object.entries(odds) as [MaterialContainer['kind'], Odds][]) {
    for (const [id, p] of o) if (known.has(id) && p > 0) (entry(id).containers ??= []).push({ kind, odds: p });
  }

  // Creatures that bleed it.
  for (const e of enemies) {
    for (const id of new Set([e.bleeds?.hit, e.bleeds?.spray].filter((x): x is string => !!x))) {
      if (known.has(id)) (entry(id).bleeds ??= []).push(e.id);
    }
  }

  for (const s of Object.values(out)) s.biomes?.sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  return out;
}
