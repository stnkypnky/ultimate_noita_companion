// Where creatures live: each biome's spawn tables (g_small_enemies, g_big_enemies, …) read by running its
// lua_script with every Noita API stubbed out.
import { LuaFactory } from 'wasmoon';
import { tr, humanize, type Translations } from './translations.ts';
import type { Wak } from './wak.ts';

export type SpawnEntry = { file: string; share: number; count: [number, number]; table: string };
export type BiomeSpawns = { id: string; name: string; entries: SpawnEntry[] };

const attr = (xml: string, name: string) => xml.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Runs a biome script and returns its spawn tables: { table: [{ prob, min, max, files }] }. */
const COLLECT = `
local out = {}
for name, t in pairs(_G) do
  if type(t) == "table" and type(name) == "string" and name:match("^g_") and t[1] ~= nil then
    local rows = {}
    for _, row in ipairs(t) do
      if type(row) == "table" and type(row.prob) == "number" then
        local files = {}
        if type(row.entity) == "string" and row.entity ~= "" then files[#files + 1] = row.entity end
        if type(row.entities) == "table" then
          for _, x in ipairs(row.entities) do
            if type(x) == "string" then files[#files + 1] = x
            elseif type(x) == "table" and type(x.entity) == "string" then files[#files + 1] = x.entity end
          end
        end
        rows[#rows + 1] = { prob = row.prob, min = row.min_count or 1, max = row.max_count or row.min_count or 1, files = files }
      end
    end
    if #rows > 0 then out[name] = rows end
  end
end
return out
`;

/** Every Noita API call is a harmless no-op; dofile really loads (biome scripts build on each other's tables). */
const PRELUDE = `
local noop = function() return 0 end
setmetatable(_G, { __index = function(_, k) return noop end })
local loaded = {}
function dofile(path)
  local src = __read(path)
  if not src then return end
  local f = load(src, path)
  if f then local ok = pcall(f) end
end
function dofile_once(path) if loaded[path] then return end loaded[path] = true dofile(path) end
`;

type Row = { prob: number; min: number; max: number; files: string[] };

export async function biomeSpawns(wak: Wak, t: Translations): Promise<BiomeSpawns[]> {
  const factory = new LuaFactory();
  const out: BiomeSpawns[] = [];
  for (const file of wak.list('data/biome/').filter((f) => /^data\/biome\/[^/]+\.xml$/.test(f) && !f.split('/').pop()!.startsWith('_'))) {
    const xml = wak.text(file);
    const script = attr(xml, 'lua_script');
    const id = file.split('/').pop()!.replace(/\.xml$/, '');
    const nameKey = attr(xml, 'name');
    const name = nameKey?.startsWith('$') ? tr(t, nameKey) : '';
    const entries: SpawnEntry[] = [];
    if (script && wak.has(script)) {
      const lua = await factory.createEngine();
      try {
        lua.global.set('__read', (p: string) => (wak.has(p) ? wak.text(p) : null));
        await lua.doString(PRELUDE);
        await lua.doString(`dofile(${JSON.stringify(script)})`);
        const tables = (await lua.doString(COLLECT)) as Record<string, Row[]>;
        for (const [table, rows] of Object.entries(tables ?? {})) {
          const list = Object.values(rows);
          const total = list.reduce((s, r) => s + (r.files && Object.values(r.files).length ? r.prob : 0), 0);
          if (!total) continue;
          for (const r of list) {
            for (const f of Object.values(r.files ?? {})) {
              if (!f.includes('/animals/') && !f.includes('/buildings/')) continue;
              entries.push({ file: f, share: r.prob / total, count: [r.min, r.max], table: table.replace(/^g_/, '') });
            }
          }
        }
      } catch {
        // A script that needs more of the engine than the stubs give: no spawn tables from it.
      } finally {
        lua.global.close();
      }
    }
    if (entries.length) out.push({ id, name: name && name !== '_EMPTY_' ? name : humanize(id), entries });
  }
  return out;
}
