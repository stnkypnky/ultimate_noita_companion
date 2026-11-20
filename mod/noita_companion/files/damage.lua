-- Runs on the player (a LuaComponent's script_damage_received): remembers which creature last hurt you, so a death
-- can name it. The game itself writes killed_by without the creature (" | bite").
function damage_received(damage, message, entity_thats_responsible, is_fatal, projectile_thats_responsible)
  if damage <= 0 then return end
  local me = GetUpdatedEntityID()
  local who = entity_thats_responsible
  if who == nil or who == 0 or who == me then return end
  local file = EntityGetFilename(who)
  local id = type(file) == "string" and file:match("([%w_]+)%.xml$") or nil
  if not id or id == "player" then return end
  GlobalsSetValue("companion_last_attacker", id)
  GlobalsSetValue("companion_last_attacker_frame", tostring(GameGetFrameNum()))
end
