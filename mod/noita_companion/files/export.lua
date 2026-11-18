-- Builds a snapshot of the current run and writes it as JSON. Kept free of Noita globals at load time so
-- the companion's tests can run it with stubbed API functions.

local EVERY_FRAMES = 30      -- look twice a second
local HEARTBEAT_SECONDS = 30 -- rewrite at least this often, so the app can tell the game is still running

local last_json = nil
local last_write = 0

-- ---------- JSON ----------

local function esc(s)
  return (s:gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"' end
    if c == '\\' then return '\\\\' end
    return string.format("\\u%04x", c:byte())
  end))
end

local function is_array(t)
  local n = 0
  for _ in pairs(t) do n = n + 1 end
  for i = 1, n do if t[i] == nil then return false end end
  return true
end

function companion_json(v)
  local ty = type(v)
  if ty == "nil" then return "null" end
  if ty == "boolean" then return v and "true" or "false" end
  if ty == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return string.format("%.4g", v)
  end
  if ty == "string" then return '"' .. esc(v) .. '"' end
  if ty == "table" then
    local out = {}
    if next(v) == nil then return v.__object and "{}" or "[]" end
    if is_array(v) then
      for i = 1, #v do out[i] = companion_json(v[i]) end
      return "[" .. table.concat(out, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do if k ~= "__object" then keys[#keys + 1] = tostring(k) end end
    table.sort(keys)
    for i, k in ipairs(keys) do out[i] = '"' .. esc(k) .. '":' .. companion_json(v[k]) end
    return "{" .. table.concat(out, ",") .. "}"
  end
  return "null"
end

-- ---------- reading the run ----------

local function comp(e, name)
  return EntityGetFirstComponentIncludingDisabled(e, name)
end

local function child_named(e, name)
  for _, c in ipairs(EntityGetAllChildren(e) or {}) do
    if EntityGetName(c) == name then return c end
  end
  return nil
end

local function translated(key)
  if key == nil or key == "" then return "" end
  if GameTextGetTranslatedOrNot then return GameTextGetTranslatedOrNot(key) end
  return key
end

local function read_spell(e)
  local action = comp(e, "ItemActionComponent")
  if not action then return nil end
  local id = ComponentGetValue2(action, "action_id")
  local item = comp(e, "ItemComponent")
  local spell = { id = id }
  if item then
    local uses = ComponentGetValue2(item, "uses_remaining")
    if uses and uses >= 0 then spell.uses = uses end
    local x = ComponentGetValue2(item, "inventory_slot")
    spell.slot = x or 0
    if ComponentGetValue2(item, "permanently_attached") then spell.always = true end
  end
  return spell
end

local function read_wand(e, active)
  local ab = comp(e, "AbilityComponent")
  if not ab then return nil end
  local spells, always = {}, {}
  for _, c in ipairs(EntityGetAllChildren(e) or {}) do
    local s = read_spell(c)
    if s then
      if s.always then always[#always + 1] = s.id
      else spells[#spells + 1] = { id = s.id, slot = s.slot, uses = s.uses } end
    end
  end
  table.sort(spells, function(a, b) return a.slot < b.slot end)
  local deck = ComponentObjectGetValue2(ab, "gun_config", "deck_capacity") or 0
  return {
    name = translated(ComponentGetValue2(ab, "ui_name")),
    sprite = ComponentGetValue2(ab, "sprite_file"),
    active = active or nil,
    shuffle = ComponentObjectGetValue2(ab, "gun_config", "shuffle_deck_when_empty") and true or false,
    spellsPerCast = ComponentObjectGetValue2(ab, "gun_config", "actions_per_round"),
    castDelay = ComponentObjectGetValue2(ab, "gunaction_config", "fire_rate_wait"),
    rechargeTime = ComponentObjectGetValue2(ab, "gun_config", "reload_time"),
    manaMax = ComponentGetValue2(ab, "mana_max"),
    mana = ComponentGetValue2(ab, "mana"),
    manaChargeSpeed = ComponentGetValue2(ab, "mana_charge_speed"),
    -- Always-cast spells take deck slots that aren't shown as slots in the game.
    capacity = deck - #always,
    spread = ComponentObjectGetValue2(ab, "gunaction_config", "spread_degrees"),
    speedMultiplier = ComponentObjectGetValue2(ab, "gunaction_config", "speed_multiplier"),
    spells = spells,
    alwaysCasts = always,
  }
end

local function read_flask(e)
  local inv = comp(e, "MaterialInventoryComponent")
  if not inv then return nil end
  local counts = ComponentGetValue2(inv, "count_per_material_type") or {}
  local contents = {}
  for i, n in pairs(counts) do
    if n and n > 0 then contents[#contents + 1] = { material = CellFactory_GetName(i - 1), amount = math.floor(n + 0.5) } end
  end
  table.sort(contents, function(a, b) return a.amount > b.amount end)
  local item = comp(e, "ItemComponent")
  local name = item and translated(ComponentGetValue2(item, "item_name")) or ""
  local sucker = comp(e, "MaterialSuckerComponent")
  return { name = name, capacity = sucker and ComponentGetValue2(sucker, "barrel_size") or nil, contents = contents }
end

local function read_perks()
  local perks = {}
  if not perk_list then
    if dofile_once then dofile_once("data/scripts/perks/perk_list.lua") end
  end
  for _, p in ipairs(perk_list or {}) do
    local n = tonumber(GlobalsGetValue("PERK_PICKED_" .. p.id .. "_PICKUP_COUNT", "0")) or 0
    if n > 0 then perks[#perks + 1] = { id = p.id, count = n } end
  end
  return perks
end

local function player()
  local list = EntityGetWithTag("player_unit") or {}
  return list[1]
end

function companion_state(status)
  local p = player()
  local state = {
    v = 1,
    status = status or "alive",
    seed = tonumber(StatsGetValue("world_seed") or "") or 0,
    ngPlus = tonumber(SessionNumbersGetValue("NEW_GAME_PLUS_COUNT") or "") or 0,
  }
  if not p then
    state.status = status or "no_player"
    return state
  end
  local x, y = EntityGetTransform(p)
  local biome = BiomeMapGetName(x, y)
  state.biome = { id = biome, name = translated(biome) }
  local dm = comp(p, "DamageModelComponent")
  if dm then
    state.hp = math.floor(ComponentGetValue2(dm, "hp") * 25 + 0.5)
    state.maxHp = math.floor(ComponentGetValue2(dm, "max_hp") * 25 + 0.5)
  end
  local wallet = comp(p, "WalletComponent")
  if wallet then state.gold = ComponentGetValue2(wallet, "money") end
  state.depth = math.floor(y / 10 + 0.5) / 10 -- metres-ish, like the game's depth readout (px / 10)

  local inv2 = comp(p, "Inventory2Component")
  local active = inv2 and ComponentGetValue2(inv2, "mActiveItem") or 0
  local wands, flasks = {}, {}
  local quick = child_named(p, "inventory_quick")
  for _, e in ipairs(quick and EntityGetAllChildren(quick) or {}) do
    if EntityHasTag(e, "wand") then
      local w = read_wand(e, e == active)
      if w then wands[#wands + 1] = w end
    else
      local f = read_flask(e)
      if f then flasks[#flasks + 1] = f end
    end
  end
  state.wands = wands
  state.flasks = flasks

  local bag = {}
  local full = child_named(p, "inventory_full")
  for _, e in ipairs(full and EntityGetAllChildren(full) or {}) do
    local s = read_spell(e)
    if s then bag[#bag + 1] = { id = s.id, uses = s.uses } end
  end
  state.spells = bag
  state.perks = read_perks()
  return state
end

-- ---------- writing ----------

local function save_path()
  local home = os.getenv("USERPROFILE") or ""
  return home .. "\\AppData\\LocalLow\\Nolla_Games_Noita\\save00\\companion_live.json"
end

-- Write via a temp file and rename, so the app never reads half a file.
local function write_file(path, text)
  local tmp = path .. ".tmp"
  local f = io.open(tmp, "wb")
  if not f then return false end
  f:write(text)
  f:close()
  os.remove(path)
  return os.rename(tmp, path)
end

companion_writer = companion_writer or write_file

function companion_write(status, now)
  now = now or os.time()
  local state = companion_state(status)
  local body = companion_json(state)
  if body == last_json and now - last_write < HEARTBEAT_SECONDS then return false end
  last_json = body
  last_write = now
  state.time = now
  companion_writer(save_path(), companion_json(state))
  return true
end

function companion_tick(frame, now)
  if frame % EVERY_FRAMES ~= 0 then return false end
  local ok, wrote = pcall(companion_write, nil, now)
  return ok and wrote
end
