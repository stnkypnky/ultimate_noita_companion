-- Noita Companion Live: writes the current run to save00/companion_live.json for the companion app.
dofile_once("mods/noita_companion/files/export.lua")

function OnWorldPostUpdate()
  companion_tick(GameGetFrameNum())
end

function OnPlayerSpawned(player_entity)
  pcall(companion_watch_damage, player_entity)
end

function OnPlayerDied(player_entity)
  pcall(companion_write, "dead")
end

function OnPausedChanged(is_paused, is_inventory_pause)
  if is_paused and not is_inventory_pause then pcall(companion_write, "paused") end
end
