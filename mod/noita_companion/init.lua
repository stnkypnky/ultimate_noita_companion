-- Noita Companion Live: writes the current run to save00/companion_live.json for the companion app.
dofile_once("mods/noita_companion/files/export.lua")

-- "Record world generation" (mod settings): every biome script gets files/trace.lua appended, which logs the
-- rooms and items the game places to save00/companion_trace.txt. Each game start adds a "# session" line.
local TRACE_BIOMES = {
  "data/biome_impl/static_tile/temples_common.lua", "data/biome_impl/static_tile/watchtower.lua",
  "data/scripts/biomes/clouds.lua", "data/scripts/biomes/coalmine.lua", "data/scripts/biomes/coalmine_alt.lua",
  "data/scripts/biomes/crypt.lua", "data/scripts/biomes/excavationsite.lua", "data/scripts/biomes/fungicave.lua",
  "data/scripts/biomes/fungiforest.lua", "data/scripts/biomes/lake_deep.lua", "data/scripts/biomes/liquidcave.lua",
  "data/scripts/biomes/meat.lua", "data/scripts/biomes/pyramid.lua", "data/scripts/biomes/rainforest.lua",
  "data/scripts/biomes/rainforest_dark.lua", "data/scripts/biomes/robobase.lua", "data/scripts/biomes/sandcave.lua",
  "data/scripts/biomes/snowcastle.lua", "data/scripts/biomes/snowcave.lua", "data/scripts/biomes/the_end.lua",
  "data/scripts/biomes/tower.lua", "data/scripts/biomes/vault.lua", "data/scripts/biomes/vault_frozen.lua",
  "data/scripts/biomes/wandcave.lua", "data/scripts/biomes/winter.lua", "data/scripts/biomes/wizardcave.lua",
}
local tracing = ModSettingGet("noita_companion.trace") == true

local function trace_line(line)
  local home = os.getenv("USERPROFILE")
  local f = home and io.open(home .. "\\AppData\\LocalLow\\Nolla_Games_Noita\\save00\\companion_trace.txt", "a")
  if f then
    f:write(line, "\n")
    f:close()
  end
end

if tracing then
  pcall(trace_line, "# session " .. tostring(os.time()))
  for _, s in ipairs(TRACE_BIOMES) do ModLuaFileAppend(s, "mods/noita_companion/files/trace.lua") end
end

-- The biome scripts' trace lines arrive as tagged entities (files/trace.lua): write them out and remove them.
local function collect_trace()
  local list = EntityGetWithTag("companion_trace")
  if not list or #list == 0 then return end
  local lines = {}
  for _, e in ipairs(list) do
    local c = EntityGetFirstComponentIncludingDisabled(e, "VariableStorageComponent")
    if c then lines[#lines + 1] = ComponentGetValue2(c, "value_string") end
    EntityKill(e)
  end
  if #lines > 0 then trace_line(table.concat(lines, "\n")) end
end

function OnWorldPostUpdate()
  if tracing then pcall(collect_trace) end
  companion_tick(GameGetFrameNum())
end

function OnPlayerSpawned(player_entity)
  if tracing then pcall(trace_line, "seed " .. tostring(StatsGetValue("world_seed"))) end
  pcall(companion_watch_damage, player_entity)
end

function OnPlayerDied(player_entity)
  pcall(companion_write, "dead")
end

function OnPausedChanged(is_paused, is_inventory_pause)
  if is_paused and not is_inventory_pause then pcall(companion_write, "paused") end
end
