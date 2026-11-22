-- Appended to each biome script when "Record world generation" is on (init.lua). Writes a line to
-- save00/companion_trace.txt for every spawn function the engine calls, every pixel scene and entity loaded,
-- so the companion app's map can be checked against what the game really did:
--   S <function> <x> <y>     a spawn function called at a marker (or the biome's init, as "init")
--   P <file> <x> <y>         LoadPixelScene
--   E <file> <x> <y>         EntityLoad
if not __companion_traced then
  __companion_traced = true
  local home = os and os.getenv and os.getenv("USERPROFILE")
  local path = home and (home .. "\\AppData\\LocalLow\\Nolla_Games_Noita\\save00\\companion_trace.txt")
  local function out(line)
    if path and io and io.open then
      local f = io.open(path, "a")
      if f then
        f:write(line, "\n")
        f:close()
        return
      end
    end
    print("[companion_trace] " .. line)
  end
  local function num(v)
    if type(v) == "number" then return string.format("%.3f", v):gsub("%.?0+$", "") end
    return tostring(v)
  end

  local load_scene = LoadPixelScene
  if load_scene then
    LoadPixelScene = function(file, visual, x, y, ...)
      pcall(out, "P " .. tostring(file) .. " " .. num(x) .. " " .. num(y))
      return load_scene(file, visual, x, y, ...)
    end
  end
  for _, k in ipairs({ "EntityLoad", "EntityLoadCameraBound" }) do
    local load = _G[k]
    if load then
      _G[k] = function(file, x, y, ...)
        pcall(out, "E " .. tostring(file) .. " " .. num(x) .. " " .. num(y))
        return load(file, x, y, ...)
      end
    end
  end

  -- The biome's spawn functions (enemies left out: there are thousands, and the map doesn't show them).
  local names = {}
  for k, v in pairs(_G) do
    if type(k) == "string" and type(v) == "function" and (k == "init" or ((string.find(k, "^spawn_") or string.find(k, "^load_")) and k ~= "load_random_pixel_scene" and not string.find(k, "enem"))) then
      names[#names + 1] = k
    end
  end
  for _, k in ipairs(names) do
    local fn = _G[k]
    _G[k] = function(x, y, ...)
      pcall(out, "S " .. k .. " " .. num(x) .. " " .. num(y))
      return fn(x, y, ...)
    end
  end
end
