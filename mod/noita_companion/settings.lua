dofile("data/scripts/lib/mod_settings.lua")

local mod_id = "noita_companion"
mod_settings_version = 1
mod_settings = {
  {
    id = "trace",
    ui_name = "Record world generation",
    ui_description = "For fixing the companion app's map: writes companion_trace.txt into your save folder with every room\nand item the game places as the world loads. Takes effect from the next new game. Leave it off otherwise.",
    value_default = false,
    scope = MOD_SETTING_SCOPE_NEW_GAME,
  },
}

function ModSettingsUpdate(init_scope)
  mod_settings_update(mod_id, mod_settings, init_scope)
end

function ModSettingsGuiCount()
  return mod_settings_gui_count(mod_id, mod_settings)
end

function ModSettingsGui(gui, in_main_menu)
  mod_settings_gui(mod_id, mod_settings, gui, in_main_menu)
end
