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

/** The text of a biome script's init(), up to the next top-level function. */
export const initBody = (src: string) => /function\s+init\s*\([^)]*\)([\s\S]*?)(?=\nfunction\s|$)/.exec(src)?.[1];

export type SceneCall = { file: string; visual: string; background: string; dx: number; dy: number };

/** "y-40+300" → 260: the literal sum after the coordinate. */
const offset = (e: string) => [...e.slice(1).replace(/\s/g, '').matchAll(/([+-])(\d+)/g)].reduce((n, m) => n + Number(m[2]) * (m[1] === '-' ? -1 : 1), 0);

export type EntityCall = { file: string; dx: number; dy: number };
/** A script's functions by name: their parameters and body (up to the next top-level function). */
export type Helpers = Map<string, { params: string[]; body: string }>;

/** The top-level functions a script defines. */
export function functionsOf(src: string): Helpers {
  const out: Helpers = new Map();
  for (const m of src.matchAll(/(?:^|\n)function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)([\s\S]*?)(?=\nfunction\s|$)/g))
    out.set(m[1]!, { params: m[2]!.split(',').map((p) => p.trim()).filter(Boolean), body: m[3]! });
  return out;
}

/**
 * What a function body loads at its x/y (plus literal offsets), in order: pixel scenes and entities. Commented-out
 * lines don't count. Of an if-block, one branch: its else (the usual case: no gamepad, no unlock, the common room),
 * or with no else, its first branch; a branch on a parameter passed as false is skipped. Calls to the script's own
 * helpers at x/y (spawn_altar_top(x, y, false)) are followed.
 */
export function scriptCalls(
  body: string,
  helpers: Helpers = new Map(),
  falsy: Set<string> = new Set(),
  depth = 0,
  /** Where it runs (the chunk's corner): conditions on x and y are then decided. */
  env?: { x: number; y: number },
): { scenes: SceneCall[]; entities: EntityCall[] } {
  type Calls = { scenes: SceneCall[]; entities: EntityCall[] };
  type Branch = { calls: Calls; cond: boolean | null; isElse: boolean };
  type Frame = { kind: 'if' | 'block'; branches: Branch[] };
  const calls = (): Calls => ({ scenes: [], entities: [] });
  const root = calls();
  const stack: Frame[] = [];
  const into = () => stack.at(-1)?.branches.at(-1)?.calls ?? root;
  const condAfter = (line: string, from: number) => evalCond(/^([\s\S]*?)\bthen\b/.exec(line.slice(from))?.[1] ?? '', env, falsy);
  // The branch an if-block takes: the first that's surely true; at the first that can't be told, the else (the usual
  // case), or else the first that isn't surely false.
  const pick = (bs: Branch[]) => {
    for (const b of bs) {
      if (b.cond === true) return b;
      if (b.cond === null) {
        const rest = bs.filter((x) => x.cond !== false);
        return rest.find((x) => x.isElse) ?? rest[0];
      }
    }
    return undefined;
  };
  const add = (to: Calls, c: Calls, dx = 0, dy = 0) => {
    to.scenes.push(...c.scenes.map((s) => ({ ...s, dx: s.dx + dx, dy: s.dy + dy })));
    to.entities.push(...c.entities.map((e) => ({ ...e, dx: e.dx + dx, dy: e.dy + dy })));
  };
  // A picture passed by name: the body's own `local name = "…"`.
  const locals = new Map([...body.matchAll(/\blocal\s+([A-Za-z_]\w*)\s*=\s*"([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
  const str = (a: string) => (a.startsWith('"') ? a.slice(1, -1) : (locals.get(a) ?? ''));
  const token = new RegExp(
    [
      /LoadPixelScene\(\s*"([^"]+)"\s*,\s*("[^"]*"|[A-Za-z_]\w*)\s*,\s*(x[-+\d\s]*)\s*,\s*(y[-+\d\s]*)\s*,\s*("[^"]*"|[A-Za-z_]\w*)[^)]*\)/.source,
      /EntityLoad\(\s*"([^"]+)"\s*,\s*(x[-+\d\s]*)\s*,\s*(y[-+\d\s]*)\s*\)/.source,
      /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|--.*$/.source,
      /\b(if|elseif|else|end|function|do)\b/.source,
      /\b([A-Za-z_]\w*)\(\s*(x[-+\d\s]*)\s*,\s*(y[-+\d\s]*)\s*((?:,[^()]*)?)\)/.source,
    ].join('|'),
    'g',
  );
  for (const line of body.split(/\r?\n/)) {
    for (const m of line.matchAll(token)) {
      if (m[1] !== undefined) {
        into().scenes.push({ file: m[1], visual: str(m[2]!), background: str(m[5]!), dx: offset(m[3]!), dy: offset(m[4]!) });
        continue;
      }
      if (m[6] !== undefined) {
        into().entities.push({ file: m[6], dx: offset(m[7]!), dy: offset(m[8]!) });
        continue;
      }
      const kw = m[9];
      if (kw === 'if') stack.push({ kind: 'if', branches: [{ calls: calls(), cond: condAfter(line, m.index + 2), isElse: false }] });
      else if (kw === 'function' || kw === 'do') stack.push({ kind: 'block', branches: [{ calls: calls(), cond: true, isElse: false }] });
      else if (kw === 'elseif' || kw === 'else') {
        const f = stack.at(-1);
        if (f?.kind !== 'if') continue;
        f.branches.push({ calls: calls(), cond: kw === 'else' ? true : condAfter(line, m.index + 6), isElse: kw === 'else' });
      } else if (kw === 'end') {
        // The body's own end has no frame left to close.
        const f = stack.pop();
        if (!f) continue;
        const kept = f.kind === 'block' ? f.branches[0] : pick(f.branches);
        if (kept) add(into(), kept.calls);
      } else if (m[10] !== undefined) {
        // A helper of the script's own, called at the chunk; not its definition.
        const h = helpers.get(m[10]);
        if (!h || depth >= 3 || /function\s+$/.test(line.slice(0, m.index)) || h.params[0] !== 'x' || h.params[1] !== 'y') continue;
        const args = m[13]!.replace(/^,/, '').split(',').map((a) => a.trim());
        const off = new Set(h.params.slice(2).filter((_, i) => args[i] === 'false' || args[i] === 'nil'));
        const dx = offset(m[11]!);
        const dy = offset(m[12]!);
        add(into(), scriptCalls(h.body, helpers, off, depth + 1, env && { x: env.x + dx, y: env.y + dy }), dx, dy);
      }
    }
  }
  return root;
}

/**
 * A Lua condition, as far as it can be told without running the game: true, false, or null (it depends on
 * something else). Knows x and y (when given), numbers, comparisons, and/or/not, and parameters passed as false.
 */
/** "(a < b)": one pair of brackets around the whole thing. */
const wrapped = (t: string) => {
  if (!t.startsWith('(') || !t.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    depth += t[i] === '(' ? 1 : t[i] === ')' ? -1 : 0;
    if (depth === 0 && i < t.length - 1) return false;
  }
  return true;
};

export function evalCond(c: string, env: { x: number; y: number } | undefined, falsy: Set<string>): boolean | null {
  const any = (vs: (boolean | null)[], stop: boolean) => (vs.includes(stop) ? stop : vs.includes(null) ? null : !stop);
  const num = (e: string) => {
    const s = e.replace(/\bx\b/g, env ? `(${env.x})` : 'x').replace(/\by\b/g, env ? `(${env.y})` : 'y').trim();
    return /^[\d\s.+\-*/()]+$/.test(s) ? (Function(`return (${s})`)() as number) : null;
  };
  const term = (t: string): boolean | null => {
    t = t.trim();
    while (wrapped(t)) t = t.slice(1, -1).trim();
    const not = /^not\s+([\s\S]+)$/.exec(t);
    if (not) {
      const v = term(not[1]!);
      return v === null ? null : !v;
    }
    if (t === 'true') return true;
    if (t === 'false' || t === 'nil' || falsy.has(t)) return false;
    const cmp = /^([\s\S]+?)\s*(==|~=|<=|>=|<|>)\s*([\s\S]+)$/.exec(t);
    if (!cmp) return null;
    const a = num(cmp[1]!);
    const b = num(cmp[3]!);
    if (a === null || b === null) return null;
    return { '==': a === b, '~=': a !== b, '<=': a <= b, '>=': a >= b, '<': a < b, '>': a > b }[cmp[2] as '=='];
  };
  if (!c.trim()) return null;
  return any(c.split(/\s+or\s+/).map((o) => any(o.split(/\s+and\s+/).map(term), false)), true);
}

/** The pixel scenes an init() loads (see scriptCalls). */
export const initSceneCalls = (init: string, helpers?: Helpers) => scriptCalls(init, helpers).scenes;

/** A script with the scripts it pulls in (dofile / dofile_once), as one text: its helpers can come from either. */
function withIncludes(wak: Wak, script: string, seen = new Set<string>()): string {
  if (seen.has(script) || !wak.has(script)) return '';
  seen.add(script);
  const src = wak.text(script);
  const inc = [...src.matchAll(/dofile(?:_once)?\(\s*"([^"]+)"\s*\)/g)].map((m) => withIncludes(wak, m[1]!, seen));
  // The script's own definitions come last, so they win over the included ones (as they do when it runs).
  return [...inc, src].join('\n');
}

/** Portal entities: the game's teleports, and where Summon Portal opens. */
export const isPortal = (file: string) => /entities\/buildings\/(teleport|mystery_teleport)[^/]*\.xml$/.test(file) || file.endsWith('/summon_portal_target.xml');

/**
 * Spawn colours the engine knows before any script registers its own (as rrggbb): the portal at the foot of each
 * biome, in every Holy Mountain's top (altar_top*.png), runs biome_scripts.lua's spawn_portal.
 */
const ENGINE_SPAWNS: Record<string, string> = { bf26a6: 'spawn_portal' };

/** An entity's TeleportComponent target, its own attributes over its <Base> file's. */
function teleportTarget(wak: Wak, file: string, depth = 0): { x?: number; y?: number; absX?: boolean; absY?: boolean } {
  if (depth > 4 || !wak.has(file)) return {};
  const xml = wak.text(file);
  const base = /<Base\s+file="([^"]+)"/.exec(xml)?.[1];
  const inherited = base ? teleportTarget(wak, base, depth + 1) : {};
  const own = /<TeleportComponent\b([^>]*)>/.exec(xml)?.[1] ?? '';
  const num = (k: string) => (attr(own, k.replace('.', '\\.')) !== undefined ? Number(attr(own, k.replace('.', '\\.'))) : undefined);
  const flag = (k: string) => (attr(own, k) !== undefined ? attr(own, k) === '1' : undefined);
  return {
    x: num('target.x') ?? inherited.x,
    y: num('target.y') ?? inherited.y,
    absX: flag('target_x_is_absolute_position') ?? inherited.absX,
    absY: flag('target_y_is_absolute_position') ?? inherited.absY,
  };
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
        // Its script places the rooms (points of interest) at markers in the layout.
        if (script && wak.has(script)) biomes[k]!.luaScript = script;
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

  // The world goes on past biome_map.png: above it the top row's biomes carry on (sky, and the Work's Heaven at the
  // top of the_sky), below it the bottom row's (Hell). Rows repeating the edge rows, far enough to hold every scene the
  // game places out there (the Work's shops, the two moons).
  const sceneXml = wak.text('data/biome/_pixel_scenes.xml');
  const sceneYs = [sceneXml, ...[...sceneXml.matchAll(/<File>([^<]+)<\/File>/g)].map((m) => m[1]!.trim()).filter((f) => wak.has(f)).map((f) => wak.text(f))].flatMap((t) =>
    [...t.matchAll(/pos_y="(-?\d+)"/g)].map((m) => Number(m[1])),
  );
  const rowsAbove = Math.max(0, Math.ceil(-Math.min(...sceneYs) / CHUNK) - offsetY);
  const rowsBelow = Math.max(0, Math.ceil((Math.max(...sceneYs) + CHUNK) / CHUNK) - (info.height - offsetY));
  const firstRow = cells.slice(0, info.width);
  const lastRow = cells.slice(-info.width);
  cells.unshift(...Array.from({ length: rowsAbove }, () => firstRow).flat());
  cells.push(...Array.from({ length: rowsBelow }, () => lastRow).flat());
  const H = info.height + rowsAbove + rowsBelow;
  const OFFSET_Y = offsetY + rowsAbove;

  // Pixel scenes at fixed spots, inside the drawn world. Spliced scenes (.plz pieces) show by their PNG backgrounds.
  const x0 = -(info.width / 2) * CHUNK;
  const y0 = -OFFSET_Y * CHUNK;
  const inside = (x: number, y: number) => x >= x0 && x < x0 + info.width * CHUNK && y >= y0 && y < y0 + H * CHUNK;
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
  // Portals at fixed spots: a portal-spawning function's colour in one of those rooms' material files (or the engine's
  // own portal colour), or an EntityLoad in init() itself. Cave biomes' portals come with the seed instead (their
  // markers are in the generated layout).
  const portals: NonNullable<WorldMap['portals']> = [];
  /** Per biome and material file: its portal-spawn marker pixels (each biome's script has its own colours). */
  const pixels = new Map<string, { w: number; found: { i: number; e: EntityCall[] }[] }>();
  const spawnersByBiome = new Map<number, Map<string, EntityCall[]>>();
  const sizes = new Map<string, Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>>();
  const chunksOf = (k: number) => cells.flatMap((v, c) => (v === k ? [{ x: (c % info.width) * CHUNK + x0, y: Math.floor(c / info.width) * CHUNK + y0 }] : []));
  for (const [k, script] of roomScripts) {
    const src = withIncludes(wak, script);
    const helpers = functionsOf(src);
    const init = initBody(wak.text(script));
    if (!init) continue;
    // Run at each chunk: what init() loads can depend on where it is (the Lava Lake pit's cracked floor).
    const placed = chunksOf(k).map((c) => ({ c, calls: scriptCalls(init, helpers, undefined, 0, c) }));
    for (const { c, calls } of placed) {
      for (const call of calls.scenes) {
        const visual = await imageKey(call.visual);
        const look = visual ?? (await imageKey(call.file));
        const back = await imageKey(call.background);
        if (!look) continue;
        if (!sizes.has(look)) sizes.set(look, await sharp(images.get(look)!).metadata());
        const meta = sizes.get(look)!;
        scenes.push({ id: biomes[k]!.id, file: call.file, from: 'biome', x: c.x + call.dx, y: c.y + call.dy, w: meta.width ?? 0, h: meta.height ?? 0, image: look, ...(back && back !== look ? { background: back } : {}), ...(!visual ? { materials: true } : {}) });
      }
    }
    if (biomes[k]!.wangTemplate) continue;
    for (const { c, calls } of placed) for (const e of calls.entities.filter((e) => isPortal(e.file))) portals.push({ entity: e.file, x: c.x + e.dx, y: c.y + e.dy });
    // Spawn colour (rrggbb) → the portals its function loads.
    const spawners = new Map<string, EntityCall[]>();
    const registered = [...src.matchAll(/^[ \t]*RegisterSpawnFunction\(\s*0x([0-9a-fA-F]{6,8})\s*,\s*"(\w+)"/gm)].map((m) => [m[1]!.slice(-6).toLowerCase(), m[2]!] as const);
    for (const [color, fn] of [...Object.entries(ENGINE_SPAWNS), ...registered]) {
      const h = helpers.get(fn);
      const found = h ? scriptCalls(h.body, helpers).entities.filter((e) => isPortal(e.file)) : [];
      if (found.length) spawners.set(color, found);
    }
    if (!spawners.size) continue;
    spawnersByBiome.set(k, spawners);
    for (const { c, calls } of placed) {
      for (const call of calls.scenes) {
        if (!call.file.endsWith('.png') || !wak.has(call.file)) continue;
        const cacheKey = `${k}|${call.file}`;
        if (!pixels.has(cacheKey)) {
          const px = await sharp(wak.bytes(call.file)).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
          const found: { i: number; e: EntityCall[] }[] = [];
          for (let i = 0; i < px.info.width * px.info.height; i++) {
            if (!px.data[i * 4 + 3]) continue;
            const hex = [px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]].map((v) => v!.toString(16).padStart(2, '0')).join('');
            const e = spawners.get(hex);
            if (e) found.push({ i, e });
          }
          pixels.set(cacheKey, { w: px.info.width, found });
        }
        const px = pixels.get(cacheKey)!;
        for (const { i, e: es } of px.found) for (const e of es) portals.push({ entity: e.file, x: c.x + call.dx + (i % px.w) + e.dx, y: c.y + call.dy + Math.floor(i / px.w) + e.dy });
      }
    }
  }
  // Where every portal entity leads, the seed's ones included.
  const portalTargets: NonNullable<WorldMap['portalTargets']> = {};
  for (const f of [...wak.list('data/entities/buildings/'), 'data/entities/misc/summon_portal_target.xml'].filter(isPortal)) {
    const t = teleportTarget(wak, f);
    if (t.x !== undefined && t.y !== undefined) portalTargets[f] = { x: t.x, y: t.y, absX: !!t.absX, absY: !!t.absY };
  }
  const portalImage = await imageKey('data/buildings_gfx/teleport_center.png');
  for (const m of sceneXml.matchAll(/<PixelScene\s[\s\S]*?>/g)) await addScene(m[0], 'pixel_scenes');
  for (const m of sceneXml.matchAll(/<Image\s[\s\S]*?>/g)) await addScene(m[0], 'background_images');
  for (const m of sceneXml.matchAll(/<File>([^<]+)<\/File>/g)) {
    const f = m[1]!.trim();
    if (!wak.has(f)) continue;
    for (const s of wak.text(f).matchAll(/<PixelScene\s[\s\S]*?>/g)) await addScene(s[0], f.split('/').pop()!.replace(/\.xml$/, ''));
  }
  // Portals in the fixed scenes: a marker pixel runs the spawn function of the biome it lands in (the Lava Lake's).
  const anyColor = new Set([...spawnersByBiome.values()].flatMap((m) => [...m.keys()]));
  const biomeIndexAt = (x: number, y: number) => {
    const cx = Math.floor((x - x0) / CHUNK);
    const cy = Math.floor((y - y0) / CHUNK);
    return cx < 0 || cy < 0 || cx >= info.width || cy >= H ? -1 : cells[cy * info.width + cx]!;
  };
  // A spliced scene's pieces are .plz we can't read, but its whole material picture sits beside its list, from the
  // 512 grid line at or above its first piece (as the Tree's does: 1024 × 2048 from −2048, −1536).
  const spliced = [...sceneXml.matchAll(/<File>([^<]+)<\/File>/g)].flatMap((m) => {
    const f = m[1]!.trim();
    const png = f.replace(/\.xml$/, '.png');
    if (!wak.has(f) || !wak.has(png)) return [];
    const xml = wak.text(f);
    const xs = [...xml.matchAll(/pos_x="(-?\d+)"/g)].map((v) => Number(v[1]));
    const ys = [...xml.matchAll(/pos_y="(-?\d+)"/g)].map((v) => Number(v[1]));
    return xs.length ? [{ file: png, x: Math.floor(Math.min(...xs) / CHUNK) * CHUNK, y: Math.floor(Math.min(...ys) / CHUNK) * CHUNK }] : [];
  });
  for (const s of [...scenes.filter((s) => s.from !== 'biome'), ...spliced]) {
    if (!s.file.endsWith('.png') || !wak.has(s.file)) continue;
    const px = await sharp(wak.bytes(s.file)).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    // The biomes under the scene, for a marker whose own chunk's script doesn't know its colour (the Lava Lake portal
    // sits just outside the pit's chunk that registers it).
    const under = new Set<number>();
    for (let y = s.y; y < s.y + px.info.height; y += CHUNK / 2) for (let x = s.x; x < s.x + px.info.width; x += CHUNK / 2) under.add(biomeIndexAt(x, y));
    for (let i = 0; i < px.info.width * px.info.height; i++) {
      if (!px.data[i * 4 + 3]) continue;
      const hex = [px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]].map((v) => v!.toString(16).padStart(2, '0')).join('');
      if (!anyColor.has(hex)) continue;
      const x = s.x + (i % px.info.width);
      const y = s.y + Math.floor(i / px.info.width);
      const k = [biomeIndexAt(x, y), ...under].find((b) => spawnersByBiome.get(b)?.has(hex));
      for (const e of k === undefined ? [] : spawnersByBiome.get(k)!.get(hex)!) portals.push({ entity: e.file, x: x + e.dx, y: y + e.dy });
    }
  }
  // And drawn: the whole material picture over its pieces' backgrounds (the Lava Lake is nothing but this).
  for (const s of spliced) {
    if (!inside(s.x, s.y)) continue;
    const look = await imageKey(s.file);
    if (!look) continue;
    const meta = await sharp(images.get(look)!).metadata();
    const name = s.file.split('/').pop()!.replace(/\.png$/, '');
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    // The area it lays out: the one under its middle, when every chunk of that area is inside the picture (the Lava
    // Lake; not the Tree, a landmark in the open forest).
    const home = biomeIndexAt(s.x + w / 2, s.y + h / 2);
    const b = biomes[home];
    const whole = !!b && !b.wangTemplate && !!b.material && chunksOf(home).every((c) => c.x >= s.x && c.y >= s.y && c.x + CHUNK <= s.x + w + CHUNK / 2 && c.y + CHUNK <= s.y + h + CHUNK / 2);
    scenes.push({ id: name, file: s.file, from: name, x: s.x, y: s.y, w, h, image: look, materials: true, ...(whole ? { area: b.id, rock: b.material } : {}) });
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
  // patch, over the whole box (checked against noita-tools' areas and its generated-map fixtures). Only within
  // biome_map.png: past it the layout isn't known, so those rows are drawn plain.
  const areas: WorldMap['areas'] = [];
  const seen = new Uint8Array(cells.length);
  const mapRows = (y: number) => y >= rowsAbove && y < rowsAbove + info.height;
  for (let i = rowsAbove * info.width; i < (rowsAbove + info.height) * info.width; i++) {
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
        if (nx < 0 || nx >= info.width || !mapRows(ny)) continue;
        const m = ny * info.width + nx;
        if (!seen[m] && cells[m] === k) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    areas.push({ biome: k, x1, y1, x2, y2 });
  }

  const map: WorldMap = { w: info.width, h: H, offsetY: OFFSET_Y, mapTop: rowsAbove, chunk: CHUNK, cells, biomes, scenes, shops, areas, portals, portalTargets, ...(portalImage ? { portalImage } : {}) };
  return { map, images, backgrounds: [...backgrounds], wangImages };
}
