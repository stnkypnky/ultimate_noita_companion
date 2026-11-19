-- Builds a snapshot of the current run and writes it as JSON. Kept free of Noita globals at load time so
-- the companion's tests can run it with stubbed API functions.

local EVERY_FRAMES = 15      -- look four times a second
local HEARTBEAT_SECONDS = 30 -- rewrite at least this often, so the app can tell the game is still running

local last_json = nil
local last_write = 0
-- The last state read with a living player, and (once you die) the death as it stays on screen. A new
-- game reloads the mod, which clears both.
local last_alive = nil
local dead_state = nil

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
  -- The slot read can come back the same for every spell; then the children's own order is the wand's order
  -- (and sorting equal keys would shuffle it: Lua's sort isn't stable).
  local seen, distinct = {}, true
  for _, s in ipairs(spells) do
    if seen[s.slot] then distinct = false end
    seen[s.slot] = true
  end
  if distinct then
    table.sort(spells, function(a, b) return a.slot < b.slot end)
  else
    for i, s in ipairs(spells) do s.slot = i - 1 end
  end
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

-- A Noita API call that may be missing (older builds) or fail: nil instead of breaking the whole write.
local function try(f, ...)
  if type(f) ~= "function" then return nil end
  local ok, v = pcall(f, ...)
  if ok then return v end
  return nil
end

-- "data/entities/animals/zombie.xml" -> "zombie": the id the save's stats files use (stats_zombie.xml).
local function file_id(e)
  local file = try(EntityGetFilename, e)
  return type(file) == "string" and file:match("([%w_]+)%.xml$") or nil
end

local SEEN_RADIUS = 260 -- about half a screen: creatures you can actually see
local SEEN_MAX = 400
local FUNGAL_COOLDOWN = 60 * 60 * 5 -- data/scripts/magic/fungal_shift.lua
local seen, seen_list, seen_seed = {}, {}, nil

-- Creatures met this run, so the companion can count them as discovered before the run's stats are saved.
local function look_around(seed, x, y)
  if seen_seed ~= seed then seen, seen_list, seen_seed = {}, {}, seed end
  for _, e in ipairs(try(EntityGetInRadiusWithTag, x, y, SEEN_RADIUS, "enemy") or {}) do
    local id = file_id(e)
    if id and not seen[id] and #seen_list < SEEN_MAX then
      seen[id] = true
      seen_list[#seen_list + 1] = id
    end
  end
  return seen_list
end

local function stat(key)
  return tonumber(try(StatsGetValue, key) or "")
end

local function fungal()
  local count = tonumber(GlobalsGetValue("fungal_shift_iteration", "0")) or 0
  local last = tonumber(GlobalsGetValue("fungal_shift_last_frame", "-1000000")) or -1000000
  local frame = try(GameGetFrameNum) or 0
  return { count = count, readyIn = math.max(0, math.floor((last + FUNGAL_COOLDOWN - frame) / 60 + 0.5)) }
end

function companion_state(status)
  local p = player()
  local state = {
    v = 1,
    mod = 3,
    status = status or "alive",
    seed = tonumber(StatsGetValue("world_seed") or "") or 0,
    ngPlus = tonumber(SessionNumbersGetValue("NEW_GAME_PLUS_COUNT") or "") or 0,
  }
  if status == "dead" then
    local by = try(StatsGetValue, "killed_by")
    if by == nil or by == "" then by = try(StatsGetValue, "killed_by_extra") end
    if by ~= "" then state.killedBy = by end
  end
  if not p then
    state.status = status or "no_player"
    return state
  end
  local x, y = EntityGetTransform(p)
  state.x = math.floor(x + 0.5)
  state.y = math.floor(y + 0.5)
  state.playtime = stat("playtime")
  state.kills = stat("enemies_killed")
  state.orbs = try(GameGetOrbCountThisRun)
  state.fungal = try(fungal)
  state.seen = look_around(state.seed, x, y)
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
  local wands, flasks, items = {}, {}, {}
  local quick = child_named(p, "inventory_quick")
  for _, e in ipairs(quick and EntityGetAllChildren(quick) or {}) do
    if EntityHasTag(e, "wand") then
      local w = read_wand(e, e == active)
      if w then wands[#wands + 1] = w end
    else
      local f = read_flask(e)
      if f then
        flasks[#flasks + 1] = f
      else
        -- Stones, eggs, dice and the like: carried items.
        local ic = comp(e, "ItemComponent")
        local id = file_id(e)
        if id then
          items[#items + 1] = { id = id, name = ic and translated(ComponentGetValue2(ic, "item_name")) or "", held = (e == active) or nil }
        end
      end
    end
  end
  state.wands = wands
  state.flasks = flasks
  state.items = items

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

local function copy(t)
  local o = {}
  for k, v in pairs(t) do o[k] = v end
  return o
end

-- The death as it stays on screen: where you fell and what you carried (read from the last living state
-- when the player entity is already gone), no health left, and what killed you.
local function death_state()
  local now = companion_state("dead")
  local state = now
  if now.x == nil and last_alive and last_alive.seed == now.seed then
    state = copy(last_alive)
    state.status = "dead"
    state.killedBy = now.killedBy
  end
  state.hp = 0
  state.playtime = stat("playtime") or state.playtime
  state.kills = stat("enemies_killed") or state.kills
  return state
end

function companion_write(status, now)
  now = now or os.time()
  local state
  if status == "dead" then
    dead_state = death_state()
    state = copy(dead_state)
  elseif dead_state then
    -- The death screen: keep reporting the death (a tick must not turn it into "no player"), and pick up
    -- what killed you if the game only records it after the death callback.
    if not dead_state.killedBy then dead_state.killedBy = companion_state("dead").killedBy end
    state = copy(dead_state)
  else
    state = companion_state(status)
    if state.status == "alive" and state.x then last_alive = copy(state) end
  end
  -- Play time and the fungal countdown tick every second: they ride along with real changes and the
  -- heartbeat instead of forcing a write each time.
  local playtime, ready = state.playtime, state.fungal and state.fungal.readyIn
  state.playtime = nil
  if state.fungal then state.fungal.readyIn = nil end
  local body = companion_json(state)
  state.playtime = playtime
  if state.fungal then state.fungal.readyIn = ready end
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
