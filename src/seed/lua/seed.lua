-- Seed tool: runs the game's own scripts (fungal shifts, biome modifiers, perks, shops) for a world seed, with the
-- engine's RNG (src/sim/rng.ts) and just enough of the world stubbed to record what they would do.
-- Loaded after engine.lua. Results go back to JS as JSON strings (json_encode from engine.lua).

__seed = { globals = {}, mats = {}, mat_index = {}, mat_tags = {}, flags_all = true, flags = {} }

function GlobalsGetValue(k, d)
  local v = __seed.globals[k]
  if v == nil then return d end
  return v
end
function GlobalsSetValue(k, v) __seed.globals[k] = tostring(v) end
function print() end
function GameTextGetTranslatedOrNot(s) return s end
function GameTextGet(s) return s end
function EntityGetParent() return 0 end
function GameGetWorldStateEntity() return 0 end

-- Unlocks: HasFlagPersistent answers from the synced save, or "everything unlocked".
function HasFlagPersistent(f)
  if __seed.flags_all then return true end
  return __seed.flags[f] == true
end

--- "id:tag,tag|id:tag" (tags without brackets) → the material table CellFactory_* answers from.
function seed_set_materials(s)
  __seed.mats, __seed.mat_index, __seed.mat_tags = {}, {}, {}
  for entry in string.gmatch(s, "[^|]+") do
    local id, tags = string.match(entry, "^([^:]*):?(.*)$")
    table.insert(__seed.mats, id)
    __seed.mat_index[id] = #__seed.mats
    local t = {}
    for tag in string.gmatch(tags, "[^,]+") do t["[" .. tag .. "]"] = true end
    __seed.mat_tags[#__seed.mats] = t
  end
end
function CellFactory_GetType(name) return __seed.mat_index[name] or -1 end
function CellFactory_GetName(i) return __seed.mats[i] or "" end
function CellFactory_GetUIName(i) return __seed.mats[i] or "" end
function CellFactory_HasTag(i, tag) local t = __seed.mat_tags[i] return t ~= nil and t[tag] == true end

--- "flag,flag,…" from the synced save; all = true ignores it (everything unlocked).
function seed_set_flags(all, list)
  __seed.flags_all = all
  __seed.flags = {}
  for f in string.gmatch(list or "", "[^,]+") do __seed.flags[f] = true end
end

--- Deaths so far (the Mines get no modifier before the 8th death).
__seed.deaths = 8
function seed_set_deaths(n) __seed.deaths = n end
function StatsGlobalGetValue(k)
  if k == "death_count" then return tostring(__seed.deaths) end
  return "0"
end
function GameIsModeFullyDeterministic() return false end

---------------------------------------------------------------------------
-- Biome modifiers (data/scripts/biome_modifiers.lua: get_modifier_mappings, which the game calls at world start)
---------------------------------------------------------------------------
local modifiers_loaded = false
function seed_biome_modifiers()
  if not modifiers_loaded then
    dofile("data/scripts/biome_modifiers.lua")
    modifiers_loaded = true
  end
  local out = {}
  for biome, modifier in pairs(get_modifier_mappings()) do
    if modifier and modifier.id then out[biome] = { id = modifier.id, description = modifier.ui_description or "" } end
  end
  return json_encode(out)
end

---------------------------------------------------------------------------
-- Holy Mountain perks (data/scripts/perks/perk.lua: perk_spawn_many at each altar, perk_reroll_perks)
---------------------------------------------------------------------------
local perks_loaded = false
local function load_perks()
  if not perks_loaded then
    dofile("data/scripts/perks/perk.lua")
    perks_loaded = true
  end
end

--- Perks offered at the first `levels` Holy Mountains. picks: "A,B;;C" = the perks taken at each one, in order
--- (a taken perk leaves the pool if it can't stack; Extra Perk adds an altar slot from the next mountain on).
--- Also the first `reroll_sets` rerolls (rerolls walk the same deck from its end, whichever mountain you're in).
function seed_perks(levels, picks, reroll_sets)
  load_perks()
  __seed.globals = {}
  local per_level = {}
  for chunk in string.gmatch((picks or "") .. ";", "([^;]*);") do table.insert(per_level, chunk) end
  local out = { mountains = {}, rerolls = {}, gambles = {} }
  local function bump(id)
    local key = get_perk_picked_flag_name(id) .. "_PICKUP_COUNT"
    GlobalsSetValue(key, tostring(tonumber(GlobalsGetValue(key, "0")) + 1))
  end
  -- Taking a perk: it counts as picked up; Extra Perk adds an altar slot; some perks take others out of the deck
  -- (remove_other_perks in perk_list.lua).
  local function take(id)
    bump(id)
    if id == "EXTRA_PERK" then
      GlobalsSetValue("TEMPLE_PERK_COUNT", tostring(tonumber(GlobalsGetValue("TEMPLE_PERK_COUNT", "3")) + 1))
    end
    local data = get_perk_with_id(perk_list, id)
    if data and data.remove_other_perks then
      for _, other in ipairs(data.remove_other_perks) do bump(other) end
    end
  end
  -- The next perk off the deck (as one more altar slot would get it).
  local function draw()
    local got
    local count = GlobalsGetValue("TEMPLE_PERK_COUNT", "3")
    GlobalsSetValue("TEMPLE_PERK_COUNT", "1")
    perk_spawn = function(x, y, id) got = id end
    perk_spawn_many(0, 0)
    GlobalsSetValue("TEMPLE_PERK_COUNT", count)
    return got
  end
  for level = 1, levels do
    local offered = {}
    perk_spawn = function(x, y, id) table.insert(offered, id) end
    perk_spawn_many(0, 0)
    table.insert(out.mountains, offered)
    local gamble = {}
    for id in string.gmatch(per_level[level] or "", "[^,]+") do take(id) end
    -- Gamble hands you two more perks from the deck (never Gamble itself).
    if string.find("," .. (per_level[level] or "") .. ",", ",GAMBLE,", 1, true) then
      for _ = 1, 2 do
        local p = draw()
        if p == "GAMBLE" then p = draw() end
        take(p)
        table.insert(gamble, p)
      end
    end
    table.insert(out.gambles, gamble)
  end
  -- Rerolls: each replaces the perks on the altar (3 here) with the next ones from the end of the deck.
  local perks = perk_get_spawn_order()
  local index = #perks
  for r = 1, reroll_sets or 0 do
    local set = {}
    for i = 1, tonumber(GlobalsGetValue("TEMPLE_PERK_COUNT", "3")) do
      local id = perks[index]
      while id == nil or id == "" do
        index = index - 1
        if index <= 0 then index = #perks end
        id = perks[index]
      end
      index = index - 1
      if index <= 0 then index = #perks end
      table.insert(set, id)
    end
    table.insert(out.rerolls, set)
  end
  return json_encode(out)
end

---------------------------------------------------------------------------
-- Spell picks: the engine's GetRandomAction / GetRandomActionWithType (C++), as TwoAbove/noita-tools ported them:
-- a weighted pick over gun_actions.lua's spells in order (locked ones skipped), weights from spawn_level /
-- spawn_probability at that level, seeded by SeededRandom(world seed + i, x, y).
---------------------------------------------------------------------------
local spell_pool = nil
local function pool()
  if spell_pool then return spell_pool end
  if actions == nil then dofile("data/scripts/gun/gun_actions.lua") end
  spell_pool = {}
  for _, a in ipairs(actions) do
    local probs = {}
    local levels, chances = {}, {}
    for v in string.gmatch(a.spawn_level or "", "[^,]+") do table.insert(levels, tonumber(v)) end
    for v in string.gmatch(a.spawn_probability or "", "[^,]+") do table.insert(chances, tonumber(v)) end
    for i, l in ipairs(levels) do probs[l] = chances[i] or 0 end
    local unlocked = a.spawn_requires_flag == nil or HasFlagPersistent(a.spawn_requires_flag)
    table.insert(spell_pool, { id = a.id, type = a.type, probs = probs, unlocked = unlocked })
  end
  return spell_pool
end
local function prob(s, level) return s.probs[level] or 0 end

function GetRandomAction(x, y, level, i)
  local list = pool()
  local seed = GameGetSeed() + (i or 0)
  local sum = 0
  for _, s in ipairs(list) do if s.unlocked then sum = sum + prob(s, level) end end
  local acc = sum * __rng_SeededRandom(seed, x, y)
  for _, s in ipairs(list) do
    if s.unlocked then
      local p = prob(s, level)
      if p ~= 0 then
        if p >= acc then return s.id end
        acc = acc - p
      end
    end
  end
  return list[1].id
end

function GetRandomActionWithType(x, y, level, type, i)
  local list = pool()
  local seed = GameGetSeed() + (i or 0)
  local sum = 0
  for _, s in ipairs(list) do if s.unlocked and s.type == type then sum = sum + prob(s, level) end end
  local acc = sum * __rng_SeededRandom(seed, x, y)
  for _, s in ipairs(list) do
    if s.unlocked and s.type == type then
      local p = prob(s, level)
      if p > 0 and p >= acc then return s.id end
      acc = acc - p
    end
  end
  -- Nothing of that type at this level: the first one of the type from a random start (noita-tools' port, its
  -- skipping included).
  local n = #list
  local start = math.floor(__rng_SeededRandom(seed, x, y) * n)
  local j = 0
  local s = list[1]
  while j < n do
    s = list[((j + start) % n) + 1]
    if s.type == type and prob(s, level) > 0 then
      if list[j + 1].unlocked then return s.id end
      j = j + 1
    else
      j = j + 2
    end
  end
  return s.id
end

---------------------------------------------------------------------------
-- Holy Mountain shops (temple_altar.lua: spawn_all_shopitems → generate_shop_item / generate_shop_wand)
---------------------------------------------------------------------------
local shop_loaded = false

--- positions: "x,y;x,y" (each shop's spot); extra_items: Extra Shop Item perks taken; no_shuffle: No More Shuffle taken.
function seed_shops(positions, extra_items, no_shuffle)
  spell_pool = nil
  if not shop_loaded then
    dofile("data/scripts/biomes/temple_altar.lua")
    dofile_once("data/scripts/gun/procedural/gun_procedural.lua")
    shop_loaded = true
  end
  __seed.globals = {}
  GlobalsSetValue("TEMPLE_SHOP_ITEM_COUNT", tostring(5 + (extra_items or 0)))
  if no_shuffle then GlobalsSetValue("PERK_NO_MORE_SHUFFLE_WANDS", "1") end

  local shops = {}
  local shop, wand
  local handles = 0
  local by_handle = {}
  local sale_at = {}
  local function new_item(t)
    handles = handles + 1
    by_handle[handles] = t
    table.insert(shop.items, t)
    return handles
  end

  local saved = {
    CreateItemActionEntity = CreateItemActionEntity, EntityLoad = EntityLoad, EntityAddComponent = EntityAddComponent,
    EntityGetFirstComponent = EntityGetFirstComponent, ComponentSetValue = ComponentSetValue, ComponentSetValue2 = ComponentSetValue2,
    ComponentObjectSetValue = ComponentObjectSetValue, ComponentGetValue = ComponentGetValue, ComponentGetValue2 = ComponentGetValue2,
    GetUpdatedEntityID = GetUpdatedEntityID, EntityGetTransform = EntityGetTransform, AddGunAction = AddGunAction,
    AddGunActionPermanent = AddGunActionPermanent, SetWandSprite = SetWandSprite, SetItemSprite = SetItemSprite,
  }

  CreateItemActionEntity = function(id, x, y) return new_item({ kind = "spell", spell = id, x = x, y = y }) end
  EntityAddComponent = function(eid, type, t)
    local item = by_handle[eid]
    if item and type == "ItemCostComponent" then item.cost = tonumber(t.cost) end
  end
  EntityLoad = function(file, x, y)
    if string.find(file, "sale_indicator") then
      sale_at[tostring(x) .. "," .. tostring(y)] = true
      return 0
    end
    local script = string.match(file, "^data/entities/items/(wand_[%w_]+)%.xml$")
    if not script then return 0 end
    wand = { kind = "wand", file = file, x = x, y = y, stats = {}, spells = {}, always = {} }
    local h = new_item(wand)
    -- The wand's LuaComponent runs where the engine placed it (whole pixels, rounded half to even).
    local wx, wy = __rng_RoundHalfEven(x), __rng_RoundHalfEven(y)
    GetUpdatedEntityID = function() return h end
    EntityGetTransform = function() return wx, wy end
    dofile("data/scripts/gun/procedural/" .. script .. ".lua")
    wand = nil
    return h
  end
  EntityGetFirstComponent = function(e, type) return type end
  ComponentSetValue = function(c, k, v) if wand then wand.stats[k] = v end end
  ComponentSetValue2 = ComponentSetValue
  ComponentObjectSetValue = function(c, o, k, v) if wand then wand.stats[k] = v end end
  ComponentGetValue = function(c, k) if wand then return wand.stats[k] end end
  ComponentGetValue2 = ComponentGetValue
  AddGunAction = function(e, id) if wand then table.insert(wand.spells, id) end end
  AddGunActionPermanent = function(e, id) if wand then table.insert(wand.always, id) end end
  SetWandSprite = function() end
  SetItemSprite = function() end

  local ok, err = pcall(function()
    for pos in string.gmatch(positions, "[^;]+") do
      local x, y = string.match(pos, "^([-%d.]+),([-%d.]+)$")
      shop = { items = {} }
      spawn_all_shopitems(tonumber(x), tonumber(y))
      shop.type = (shop.items[1] and shop.items[1].kind == "wand") and "wand" or "spell"
      for _, it in ipairs(shop.items) do
        it.sale = sale_at[tostring(it.x) .. "," .. tostring(it.y)] == true
        it.row = (it.kind == "spell" and it.y < tonumber(y)) and "top" or "bottom"
      end
      table.insert(shops, shop)
    end
  end)
  for k, v in pairs(saved) do _G[k] = v end
  if not ok then error(err) end
  return json_encode(shops)
end

--- One generate_gun(cost, level, unshuffle) at (x, y), as a wand's LuaComponent runs it (for checks against known wands).
function seed_wand(x, y, cost, level, unshuffle)
  spell_pool = nil
  dofile_once("data/scripts/gun/procedural/gun_procedural.lua")
  local wand = { stats = {}, spells = {}, always = {} }
  local saved = {
    EntityGetFirstComponent = EntityGetFirstComponent, ComponentSetValue = ComponentSetValue, ComponentSetValue2 = ComponentSetValue2,
    ComponentObjectSetValue = ComponentObjectSetValue, ComponentGetValue = ComponentGetValue, ComponentGetValue2 = ComponentGetValue2,
    GetUpdatedEntityID = GetUpdatedEntityID, EntityGetTransform = EntityGetTransform, AddGunAction = AddGunAction,
    AddGunActionPermanent = AddGunActionPermanent, SetWandSprite = SetWandSprite, SetItemSprite = SetItemSprite,
  }
  EntityGetFirstComponent = function(e, type) return type end
  ComponentSetValue = function(c, k, v) wand.stats[k] = v end
  ComponentSetValue2 = ComponentSetValue
  ComponentObjectSetValue = function(c, o, k, v) wand.stats[k] = v end
  ComponentGetValue = function(c, k) return wand.stats[k] end
  ComponentGetValue2 = ComponentGetValue
  GetUpdatedEntityID = function() return 1 end
  EntityGetTransform = function() return x, y end
  AddGunAction = function(e, id) table.insert(wand.spells, id) end
  AddGunActionPermanent = function(e, id) table.insert(wand.always, id) end
  -- GetWand() picks the sprite from wands.lua to match the rolled stats.
  SetWandSprite = function(e, c, file) wand.sprite = file end
  SetItemSprite = function() end
  local ok, err = pcall(generate_gun, cost, level, unshuffle)
  for k, v in pairs(saved) do _G[k] = v end
  if not ok then error(err) end
  return json_encode(wand)
end

---------------------------------------------------------------------------
-- Points of interest: where a cave biome's own script puts its rooms for this seed. The engine calls the
-- function a biome registers for a colour (RegisterSpawnFunction) at every pixel of that colour in the
-- generated layout, and init(x, y, w, h) once per chunk; the room functions end in LoadPixelScene, which we
-- record instead of drawing. (The colour table and the walk over the layout follow TwoAbove/noita-tools.)
---------------------------------------------------------------------------
-- Spawn colours the engine knows before any biome script registers its own.
local ENGINE_SPAWNS = {
  [0xff0aff] = "load_pixel_scene", [0xff0080] = "load_pixel_scene2",
}
local poi_spawns = {}
local poi_rec = nil

local function poi_hooks(on)
  if on then
    __poi_saved = { LoadPixelScene = LoadPixelScene, EntityLoad = EntityLoad, RegisterSpawnFunction = RegisterSpawnFunction, RaytracePlatforms = RaytracePlatforms }
    LoadPixelScene = function(file, visual, x, y, background, skip_biome_checks)
      if poi_rec then table.insert(poi_rec, { f = file, x = x, y = y, any = skip_biome_checks == true }) end
    end
    EntityLoad = function() return 0 end
    -- No terrain to trace against: the ray "hits" where it starts (as noita-tools does), so props meant to sit on
    -- the ground (the Jungle's hint statues) stay at their spot, off by at most the ray's length.
    RaytracePlatforms = function(x1, y1) return true, x1, y1 end
    RegisterSpawnFunction = function(color, name) poi_spawns[math.tointeger(color) % 0x1000000] = name end
  else
    for k, v in pairs(__poi_saved) do _G[k] = v end
  end
end

--- Load a biome script fresh. Returns its room-placing spawn colours as JSON {"rrggbb": "function"}: those whose
--- function (in the script's own text) loads a pixel scene.
function seed_poi_load(script)
  poi_spawns = {}
  for c, n in pairs(ENGINE_SPAWNS) do poi_spawns[c] = n end
  init = nil
  poi_hooks(true)
  local ok, err = pcall(dofile, script)
  poi_hooks(false)
  if not ok then return json_encode({ error = tostring(err) }) end
  local src = __read_file(script) or ""
  local placers = {}
  -- A function whose text (up to the next top-level function) loads a pixel scene, directly or through
  -- load_random_pixel_scene.
  local pieces = {}
  local from = 1
  while true do
    local s = string.find(src, "\nfunction%s", from)
    if not s then table.insert(pieces, string.sub(src, from)) break end
    table.insert(pieces, string.sub(src, from, s))
    from = s + 1
  end
  for _, piece in ipairs(pieces) do
    local name = string.match(piece, "^function%s+([%w_]+)")
    if name and (string.find(piece, "LoadPixelScene", 1, true) or string.find(piece, "load_random_pixel_scene", 1, true)) then placers[name] = true end
  end
  local out = {}
  for c, n in pairs(poi_spawns) do
    if placers[n] and type(_G[n]) == "function" then out[string.format("%06x", c)] = n end
  end
  return json_encode({ spawns = out, init = type(init) == "function" })
end

--- One chunk of the loaded biome: its init() at the chunk, then each marker "function,x,y;…" in order.
--- Returns the pixel scenes loaded, as JSON [{f, x, y}], and how many calls failed.
function seed_poi_chunk(cx, cy, size, markers)
  poi_rec = {}
  local errors = 0
  poi_hooks(true)
  if type(init) == "function" then
    if not pcall(init, cx, cy, size, size) then errors = errors + 1 end
  end
  for name, x, y in string.gmatch(markers or "", "([%w_]+),([-%d]+),([-%d]+)") do
    local fn = _G[name]
    if type(fn) == "function" and not pcall(fn, tonumber(x), tonumber(y), 10, 10, false) then errors = errors + 1 end
  end
  poi_hooks(false)
  local rec = poi_rec
  poi_rec = nil
  return json_encode({ scenes = rec, errors = errors })
end

---------------------------------------------------------------------------
-- Fungal shifts (data/scripts/magic/fungal_shift.lua)
---------------------------------------------------------------------------
local fungal_loaded = false
local function fungal_once(iter, held)
  local converted = {}
  ConvertMaterialEverywhere = function(from, to) table.insert(converted, { from = __seed.mats[from], to = __seed.mats[to] }) end
  get_held_item_material = function() return held end
  __seed.globals["fungal_shift_iteration"] = tostring(iter)
  __seed.globals["fungal_shift_last_frame"] = "-1000000"
  fungal_shift(1, 0, 0, false)
  return converted
end

--- The first `n` shifts: what each converts with no flask in hand, and what a held flask would change.
function seed_fungal(n)
  if not fungal_loaded then
    dofile("data/scripts/magic/fungal_shift.lua")
    fungal_loaded = true
  end
  local flask = CellFactory_GetType("__flask")
  local out = {}
  for iter = 0, n - 1 do
    local plain = fungal_once(iter, 0)
    local with_flask = fungal_once(iter, flask)
    local role = "none"
    for _, c in ipairs(with_flask) do
      if c.from == "__flask" then role = "from" end
      if c.to == "__flask" then role = "to" end
    end
    local gold, holy = "gold", "grass_holy"
    if role == "to" then
      local g = fungal_once(iter, CellFactory_GetType("gold"))
      if g[1] then gold = g[1].to end
      local h = fungal_once(iter, CellFactory_GetType("grass_holy"))
      if h[1] then holy = h[1].to end
    end
    local from, to = {}, ""
    for _, c in ipairs(plain) do
      table.insert(from, c.from)
      to = c.to
    end
    table.insert(out, { from = from, to = to, flask = role, gold_to = gold, grass_holy_to = holy })
  end
  return json_encode(out)
end
