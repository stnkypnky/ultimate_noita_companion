// The world map: data/biome_impl/biome_map.png (loaded by data/scripts/biome_map.lua, one pixel per 512×512
// chunk), its colours resolved to biomes through data/biome/_biomes_all.xml, and the pixel scenes the game
// places at fixed world positions (data/biome/_pixel_scenes.xml).
import sharp from 'sharp';
import type { MapBiome, MapScene, WorldMap } from '../../src/data/types.ts';
import { tr, type Translations } from './translations.ts';
import type { Wak } from './wak.ts';

const CHUNK = 512;
const attr = (s: string, k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1];

/** The widest-ranging <MaterialComponent> is the biome's main rock (the others are seams and ores). */
function mainMaterial(xml: string) {
  let best: { name: string; span: number } | null = null;
  for (const m of xml.matchAll(/<MaterialComponent[\s\S]*?(?:<\/MaterialComponent>|\/>)/g)) {
    const name = attr(m[0], 'material_name');
    if (!name || attr(m[0], '_enabled') === '0' || attr(m[0], 'is_rare') === '1') continue;
    const span = Number(attr(m[0], 'material_max') ?? 0) - Number(attr(m[0], 'material_min') ?? 0);
    if (!best || span > best.span) best = { name, span };
  }
  return best?.name;
}

export async function buildWorldMap(wak: Wak, t: Translations) {
  const all = wak.text('data/biome/_biomes_all.xml');
  const offsetY = Number(attr(all, 'biome_offset_y') ?? 14);
  const byColor = new Map<string, string>();
  for (const m of all.matchAll(/<Biome\s[\s\S]*?>/g)) {
    const file = attr(m[0], 'biome_filename');
    const color = attr(m[0], 'color');
    if (file && color) byColor.set(color.toLowerCase().slice(-6), file);
  }

  const mapFile = /BiomeMapLoadImage\(\s*0,\s*0,\s*"([^"]+)"/.exec(wak.text('data/scripts/biome_map.lua'))?.[1] ?? 'data/biome_impl/biome_map.png';
  const { data, info } = await sharp(wak.bytes(mapFile)).raw().ensureAlpha().toBuffer({ resolveWithObject: true });

  const biomes: MapBiome[] = [];
  const index = new Map<string, number>();
  const cells: number[] = [];
  const backgrounds = new Set<string>();
  const roomScripts: [number, string][] = [];
  const wangImages = new Map<string, Buffer>();
  for (let i = 0; i < info.width * info.height; i++) {
    const hex = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]].map((v) => v!.toString(16).padStart(2, '0')).join('');
    const file = byColor.get(hex) ?? '';
    let k = index.get(file);
    if (k === undefined) {
      k = biomes.length;
      index.set(file, k);
      const xml = file && wak.has(file) ? wak.text(file) : '';
      const nameKey = attr(xml, 'name');
      const name = nameKey && nameKey.startsWith('$') ? tr(t, nameKey) : '';
      const bg = /background_image="data\/weather_gfx\/([^"]+)\.png"/.exec(xml)?.[1];
      if (bg) backgrounds.add(bg);
      biomes.push({
        id: file ? file.split('/').pop()!.replace(/\.xml$/, '') : 'unknown',
        file,
        name,
        color: `#${hex}`,
        ...(mainMaterial(xml) ? { material: mainMaterial(xml)! } : {}),
        ...(bg ? { background: bg } : {}),
        wang: !!attr(xml, 'wang_template_file'),
      });
      const script = attr(xml, 'lua_script');
      if (script && wak.has(script)) roomScripts.push([k, script]);
      // The cave layout's ingredients: its wang tile template and the RandomMaterials colour swaps.
      const tpl = attr(xml, 'wang_template_file');
      if (tpl && wak.has(tpl)) {
        const key = tpl.split('/').pop()!.replace(/\.png$/, '');
        // Re-encoded without the colour profile some templates carry: the game reads the raw values (as stb_image
        // does), and a profile would make a browser or decoder shift them (and break the tile header).
        if (!wangImages.has(key)) wangImages.set(key, await sharp(wak.bytes(tpl), { ignoreIcc: true }).removeAlpha().png().toBuffer());
        biomes[k]!.wangTemplate = key;
        const swaps = [...xml.matchAll(/<RandomColor[^>]*>/g)].flatMap((m) => {
          const from = attr(m[0], 'input_color');
          const to = attr(m[0], 'output_colors');
          return from && to ? [{ from: from.slice(-6).toLowerCase(), to: to.split(',').map((c) => c.trim().slice(-6).toLowerCase()) }] : [];
        });
        if (swaps.length) biomes[k]!.randomMaterials = swaps;
      }
    }
    cells.push(k);
  }

  // Pixel scenes at fixed spots, inside the drawn world. Spliced scenes (.plz pieces) show by their PNG backgrounds.
  const x0 = -(info.width / 2) * CHUNK;
  const y0 = -offsetY * CHUNK;
  const inside = (x: number, y: number) => x >= x0 && x < x0 + info.width * CHUNK && y >= y0 && y < y0 + info.height * CHUNK;
  const images = new Map<string, Buffer>();
  const scenes: MapScene[] = [];
  const imageKey = async (file: string | undefined) => {
    if (!file || !file.endsWith('.png') || !wak.has(file)) return undefined;
    const key = file.replace(/^data\//, '').replace(/\//g, '__');
    if (!images.has(key)) images.set(key, wak.bytes(file));
    return key;
  };
  const addScene = async (el: string, from: string) => {
    const x = Number(attr(el, 'pos_x') ?? attr(el, 'x'));
    const y = Number(attr(el, 'pos_y') ?? attr(el, 'y'));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !inside(x, y)) return;
    const visual = await imageKey(attr(el, 'colors_filename'));
    const look = visual ?? (await imageKey(attr(el, 'material_filename'))) ?? (await imageKey(attr(el, 'filename')));
    const back = await imageKey(attr(el, 'background_filename'));
    const key = look ?? back;
    if (!key) return;
    const meta = await sharp(images.get(key)!).metadata();
    const file = attr(el, 'material_filename') ?? attr(el, 'filename') ?? '';
    // A material file (no visual): its pixels are wang key colours, recoloured as their materials when drawn.
    const raw = !visual && !!attr(el, 'material_filename') && look !== undefined;
    scenes.push({ id: file.split('/').pop()!.replace(/\.\w+$/, ''), file, from, x, y, w: meta.width ?? 0, h: meta.height ?? 0, ...(look ? { image: look } : {}), ...(back && back !== look ? { background: back } : {}), ...(raw ? { materials: true } : {}) });
  };
  // Rooms that draw themselves: a biome script whose init() loads a pixel scene at the chunk (orb rooms, Holy
  // Mountains, secret rooms). Placed at every chunk of that biome, at the script's literal offset.
  for (const [k, script] of roomScripts) {
    const src = wak.text(script);
    const init = /function\s+init\s*\([^)]*\)([\s\S]*?)(?=\nfunction\s|$)/.exec(src)?.[1];
    if (!init) continue;
    const call = /LoadPixelScene\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*(x[-+\d\s]*)\s*,\s*(y[-+\d\s]*)\s*,\s*"([^"]*)"/.exec(init);
    if (!call) continue;
    // "y-40+300" → 260: the literal sum after the coordinate.
    const offset = (e: string) => [...e.slice(1).replace(/\s/g, '').matchAll(/([+-])(\d+)/g)].reduce((n, m) => n + Number(m[2]) * (m[1] === '-' ? -1 : 1), 0);
    const dx = offset(call[3]!);
    const dy = offset(call[4]!);
    const visual = await imageKey(call[2]);
    const look = visual ?? (await imageKey(call[1]));
    const back = await imageKey(call[5]);
    if (!look) continue;
    const meta = await sharp(images.get(look)!).metadata();
    for (let c = 0; c < cells.length; c++) {
      if (cells[c] !== k) continue;
      const x = (c % info.width) * CHUNK + x0 + dx;
      const y = Math.floor(c / info.width) * CHUNK + y0 + dy;
      scenes.push({ id: biomes[k]!.id, file: call[1]!, from: 'biome', x, y, w: meta.width ?? 0, h: meta.height ?? 0, image: look, ...(back && back !== look ? { background: back } : {}), ...(!visual ? { materials: true } : {}) });
    }
  }
  const sceneXml = wak.text('data/biome/_pixel_scenes.xml');
  for (const m of sceneXml.matchAll(/<PixelScene\s[\s\S]*?>/g)) await addScene(m[0], 'pixel_scenes');
  for (const m of sceneXml.matchAll(/<Image\s[\s\S]*?>/g)) await addScene(m[0], 'background_images');
  for (const m of sceneXml.matchAll(/<File>([^<]+)<\/File>/g)) {
    const f = m[1]!.trim();
    if (!wak.has(f)) continue;
    for (const s of wak.text(f).matchAll(/<PixelScene\s[\s\S]*?>/g)) await addScene(s[0], f.split('/').pop()!.replace(/\.xml$/, ''));
  }

  // Holy Mountain shops: temple_altar.lua registers spawn_all_shopitems on pixel colour ff33934c, so each altar
  // picture's marker pixel is where its shop spawns. The last mountain (above the Laboratory) is inside a spliced
  // .plz scene we can't read; its spot is from TwoAbove/noita-tools' temple-locations.json (x 2560, y 13181, less
  // the same −299, −15 every other shop has from its temple point).
  const shops: { x: number; y: number }[] = [];
  const markers = new Map<string, { x: number; y: number }[]>();
  // Only the altars: other biomes' scripts give the same colour other meanings.
  for (const s of scenes.filter((s) => s.from === 'biome' && s.id.startsWith('temple_altar') && s.file.endsWith('.png') && wak.has(s.file))) {
    if (!markers.has(s.file)) {
      const px = await sharp(wak.bytes(s.file)).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
      const found: { x: number; y: number }[] = [];
      for (let i = 0; i < px.info.width * px.info.height; i++) {
        if (px.data[i * 4] === 0x33 && px.data[i * 4 + 1] === 0x93 && px.data[i * 4 + 2] === 0x4c) found.push({ x: i % px.info.width, y: Math.floor(i / px.info.width) });
      }
      markers.set(s.file, found);
    }
    for (const m of markers.get(s.file)!) shops.push({ x: s.x + m.x, y: s.y + m.y });
  }
  shops.sort((a, b) => a.y - b.y);
  shops.push({ x: 2560 - 299, y: 13181 - 15 });

  // Areas: each 4-connected patch of a cave biome, by its bounding box. The game generates a biome's layout once per
  // patch, over the whole box (checked against noita-tools' areas and its generated-map fixtures).
  const areas: WorldMap['areas'] = [];
  const seen = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    if (seen[i] || !biomes[cells[i]!]!.wangTemplate) continue;
    const k = cells[i]!;
    const stack = [i];
    seen[i] = 1;
    let x1 = i % info.width;
    let x2 = x1;
    let y1 = Math.floor(i / info.width);
    let y2 = y1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % info.width;
      const y = (j - x) / info.width;
      x1 = Math.min(x1, x);
      x2 = Math.max(x2, x);
      y1 = Math.min(y1, y);
      y2 = Math.max(y2, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const m = ny * info.width + nx;
        if (!seen[m] && cells[m] === k) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    areas.push({ biome: k, x1, y1, x2, y2 });
  }

  const map: WorldMap = { w: info.width, h: info.height, offsetY, chunk: CHUNK, cells, biomes, scenes, shops, areas };
  return { map, images, backgrounds: [...backgrounds], wangImages };
}
