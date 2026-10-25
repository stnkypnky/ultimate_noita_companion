-- Fake Noita engine for running the game's own gun scripts outside the game.
-- Shared by the extractor (Node) and the wand simulator (Web Worker).
-- The host must provide: __read_file(path) -> string|nil

---------------------------------------------------------------------------
-- Lua 5.1 / LuaJIT compatibility (the game runs LuaJIT; we run Lua 5.4)
---------------------------------------------------------------------------
unpack = unpack or table.unpack
loadstring = loadstring or load
table.getn = table.getn or function(t) return #t end
math.pow = math.pow or function(a, b) return a ^ b end
math.mod = math.mod or math.fmod
bit = bit or {
  band = function(a, b, ...) local r = math.tointeger(a) & math.tointeger(b) for _, v in ipairs({...}) do r = r & math.tointeger(v) end return r end,
  bor = function(a, b, ...) local r = math.tointeger(a) | math.tointeger(b) for _, v in ipairs({...}) do r = r | math.tointeger(v) end return r end,
  bxor = function(a, b) return math.tointeger(a) ~ math.tointeger(b) end,
  bnot = function(a) return ~math.tointeger(a) end,
  lshift = function(a, n) return (math.tointeger(a) << n) & 0xFFFFFFFF end,
  rshift = function(a, n) return (math.tointeger(a) & 0xFFFFFFFF) >> n end,
}

---------------------------------------------------------------------------
-- File loading
---------------------------------------------------------------------------
__loaded_files = {}

function dofile(path)
  local src = __read_file(path)
  if src == nil then error("missing file: " .. tostring(path)) end
  local chunk, err = load(src, "@" .. path)
  if not chunk then error(err) end
  return chunk()
end

function dofile_once(path)
  if __loaded_files[path] then return __loaded_files[path] end
  __loaded_files[path] = true
  local result = dofile(path)
  __loaded_files[path] = result or true
  return result
end

---------------------------------------------------------------------------
-- Fake world: one player entity (1) holding the active wand (2)
---------------------------------------------------------------------------
PLAYER = 1
WAND = 2

__world = {
  frame = 0,
  globals = {},
  flags_all = true,     -- HasFlagPersistent() returns true unless flags table says otherwise
  flags = {},
  comps = {},           -- comp_id -> { entity, type, fields }
  next_comp = 100,
  missing = {},         -- engine functions scripts called that we don't implement
  log = {},
}

local function add_comp(entity, type_name, fields)
  local id = __world.next_comp
  __world.next_comp = id + 1
  __world.comps[id] = { entity = entity, type = type_name, fields = fields }
  return id
end

function world_reset(opts)
  opts = opts or {}
  __world.frame = opts.frame or 0
  __world.globals = {}
  __world.comps = {}
  __world.next_comp = 100
  __world.log = {}
  -- hp is in internal units (1 = 25 hp)
  add_comp(PLAYER, "DamageModelComponent", { hp = (opts.hp or 100) / 25, max_hp = (opts.max_hp or 100) / 25 })
  add_comp(PLAYER, "WalletComponent", { money = opts.money or 0, money_spent = 0 })
  add_comp(PLAYER, "Inventory2Component", { mActiveItem = WAND })
end
world_reset()

local function comps_of(entity, type_name)
  local list = {}
  for id, c in pairs(__world.comps) do
    if c.entity == entity and c.type == type_name then list[#list + 1] = id end
  end
  table.sort(list)
  return list
end

function GetUpdatedEntityID() return PLAYER end
function GameGetFrameNum() return __world.frame end
function EntityGetComponent(e, t) local l = comps_of(e, t) if #l == 0 then return nil end return l end
EntityGetComponentIncludingDisabled = EntityGetComponent
function EntityGetFirstComponent(e, t) return comps_of(e, t)[1] end
EntityGetFirstComponentIncludingDisabled = EntityGetFirstComponent
function ComponentGetValue2(c, f) local comp = __world.comps[c] return comp and comp.fields[f] end
function ComponentSetValue2(c, f, v) local comp = __world.comps[c] if comp then comp.fields[f] = v end end
function ComponentGetValue(c, f) local v = ComponentGetValue2(c, f) return v ~= nil and tostring(v) or "" end
ComponentSetValue = ComponentSetValue2
function EntityGetTransform(e) return 0, 0, 0, 1, 1 end
function EntityGetWithTag(tag) if tag == "player_unit" then return { PLAYER } end return {} end
function EntityGetInRadiusWithTag() return {} end
function EntityGetAllChildren() return nil end
function EntityGetName() return "" end
function EntityHasTag(e, tag) return e == PLAYER and tag == "player_unit" end
function EntityGetRootEntity(e) return e end
function EntityLoad(file) table.insert(__world.log, { kind = "entity_load", file = file }) return 0 end
function EntityInflictDamage(e, amount)
  local id = comps_of(e, "DamageModelComponent")[1]
  if id then local f = __world.comps[id].fields f.hp = math.max(f.hp - amount, 0) end
end
function GlobalsGetValue(k, d) local v = __world.globals[k] if v == nil then return d end return v end
function GlobalsSetValue(k, v) __world.globals[k] = tostring(v) end
function HasFlagPersistent(f)
  local v = __world.flags[f]
  if v == nil then return __world.flags_all end
  return v
end
function AddFlagPersistent(f) __world.flags[f] = true end
function GameHasFlagRun() return false end
function ModIsEnabled() return false end
function ModSettingGet() return nil end
function GamePrint(s) table.insert(__world.log, { kind = "print", text = tostring(s) }) end
GamePrintImportant = GamePrint
function print_error(s) table.insert(__world.log, { kind = "error", text = tostring(s) }) end

-- Deterministic RNG standing in for the engine's. Not bit-identical to Noita,
-- but stable for a given (frame, seed) so results are reproducible.
function SetRandomSeed(x, y)
  math.randomseed(math.floor((x or 0) * 1000) // 1, math.floor((y or 0) * 1000) // 1)
end
function Random(a, b)
  if a == nil then return math.random() end
  if b == nil then a, b = 0, a end
  a, b = math.floor(a), math.floor(b)
  if b < a then return a end
  return math.random(a, b)
end

-- Anything else capitalised (an engine API we haven't stubbed) becomes a recorded no-op.
setmetatable(_G, {
  __index = function(_, name)
    if type(name) == "string" and name:match("^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9_]*$") then
      local fn = function() __world.missing[name] = true return nil end
      rawset(_G, name, fn)
      return fn
    end
    return nil
  end,
})

---------------------------------------------------------------------------
-- Minimal JSON encoder (results are handed back to JS as strings)
---------------------------------------------------------------------------
local function esc(s)
  return (s:gsub('[%c"\\]', function(ch)
    if ch == '"' then return '\\"' elseif ch == "\\" then return "\\\\"
    elseif ch == "\n" then return "\\n" elseif ch == "\t" then return "\\t"
    else return string.format("\\u%04x", ch:byte()) end
  end))
end

function json_encode(v)
  local t = type(v)
  if t == "nil" then return "null"
  elseif t == "boolean" then return v and "true" or "false"
  elseif t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    if math.type(v) == "integer" then return tostring(v) end
    return string.format("%.10g", v)
  elseif t == "string" then return '"' .. esc(v) .. '"'
  elseif t == "table" then
    local n = #v
    if n > 0 or next(v) == nil then
      local out = {}
      for i = 1, n do out[i] = json_encode(v[i]) end
      return "[" .. table.concat(out, ",") .. "]"
    end
    local out, keys = {}, {}
    for k in pairs(v) do if type(k) == "string" then keys[#keys + 1] = k end end
    table.sort(keys)
    for _, k in ipairs(keys) do
      local val = v[k]
      if type(val) ~= "function" then out[#out + 1] = '"' .. esc(k) .. '":' .. json_encode(val) end
    end
    return "{" .. table.concat(out, ",") .. "}"
  end
  return "null"
end
