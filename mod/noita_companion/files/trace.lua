-- Appended to each biome script when "Record world generation" is on (init.lua). Biome scripts run in Lua states
-- of their own that can't write files, so each line is handed over as a small entity tagged "companion_trace" (its
-- text in a VariableStorageComponent), placed where it happened; the mod's init.lua writes them to
-- save00/companion_trace.txt and removes them. Lines:
--   S <function> <x> <y>     a spawn function called at a marker (or the biome's init, as "init")
--   P <file> <x> <y>         LoadPixelScene
--   E <file> <x> <y>         EntityLoad / EntityLoadCameraBound
if not __companion_traced then
  __companion_traced = true
  local function out(line, x, y)
    local e = EntityCreateNew("companion_trace")
    if not e or e == 0 then return end
    EntityAddTag(e, "companion_trace")
    if EntitySetTransform and type(x) == "number" and type(y) == "number" then EntitySetTransform(e, x, y) end
    local fields = { name = "line", value_string = line }
    if EntityAddComponent2 then
      EntityAddComponent2(e, "VariableStorageComponent", fields)
    else
      EntityAddComponent(e, "VariableStorageComponent", fields)
    end
  end
  local function num(v)
    if type(v) == "number" then return (string.format("%.3f", v):gsub("%.?0+$", "")) end
    return tostring(v)
  end

  local load_scene = LoadPixelScene
  if load_scene then
    LoadPixelScene = function(file, visual, x, y, ...)
      pcall(out, "P " .. tostring(file) .. " " .. num(x) .. " " .. num(y), x, y)
      return load_scene(file, visual, x, y, ...)
    end
  end
  for _, k in ipairs({ "EntityLoad", "EntityLoadCameraBound" }) do
    local load = _G[k]
    if load then
      _G[k] = function(file, x, y, ...)
        -- Our own hand-over entities aren't loaded from files, so they never pass through here.
        pcall(out, "E " .. tostring(file) .. " " .. num(x) .. " " .. num(y), x, y)
        return load(file, x, y, ...)
      end
    end
  end

  -- The biome's spawn functions, less the many that only add creatures, props and lights.
  local SKIP = { "enem", "spawn_props", "lamp", "candle", "vines", "torch", "skulls", "apparition", "ghost", "fungi", "nest" }
  local function skipped(k)
    for _, s in ipairs(SKIP) do
      if string.find(k, s, 1, true) then return true end
    end
    return false
  end
  local names = {}
  for k, v in pairs(_G) do
    if type(k) == "string" and type(v) == "function" and (k == "init" or ((string.find(k, "^spawn_") or string.find(k, "^load_")) and k ~= "load_random_pixel_scene" and not skipped(k))) then
      names[#names + 1] = k
    end
  end
  for _, k in ipairs(names) do
    local fn = _G[k]
    _G[k] = function(x, y, ...)
      pcall(out, "S " .. k .. " " .. num(x) .. " " .. num(y), x, y)
      return fn(x, y, ...)
    end
  end
end
