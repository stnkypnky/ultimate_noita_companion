-- Cast recorder, wand simulation driver and spell reflection.
-- Load order: engine.lua -> data/scripts/gun/gun.lua -> driver.lua

DEFAULT_STATE = {}
ConfigGunActionInfo_Init(DEFAULT_STATE)

-- Shot-state fields worth reporting (everything except bookkeeping).
local STATE_KEYS = {}
for k, v in pairs(DEFAULT_STATE) do
  if not k:match("^action_") and not k:match("^state_") then STATE_KEYS[#STATE_KEYS + 1] = k end
end
table.sort(STATE_KEYS)

local function state_diff(state, base)
  local out = {}
  for _, k in ipairs(STATE_KEYS) do
    local v = state[k]
    if v ~= nil and v ~= base[k] then out[k] = v end
  end
  return out
end

---------------------------------------------------------------------------
-- Recording hooks (the engine calls these while a shot is being built)
---------------------------------------------------------------------------
local rec = nil

local function new_shot() return { projectiles = {}, state = {} } end

function BeginProjectile(file)
  if not rec then return end
  local p = { file = file }
  local shot = rec.stack[#rec.stack]
  table.insert(shot.projectiles, p)
  rec.proj_stack[#rec.proj_stack + 1] = p
end

function EndProjectile()
  if rec then rec.proj_stack[#rec.proj_stack] = nil end
end

local function begin_trigger(kind, delay)
  if not rec then return end
  local p = rec.proj_stack[#rec.proj_stack]
  local sub = new_shot()
  if p then p.trigger = { kind = kind, delay = delay, shot = sub } end
  rec.stack[#rec.stack + 1] = sub
end

function BeginTriggerTimer(frames) begin_trigger("timer", frames) end
function BeginTriggerHitWorld() begin_trigger("hit") end
function BeginTriggerDeath() begin_trigger("death") end
function EndTrigger() if rec then rec.stack[#rec.stack] = nil end end

-- Called by register_action() once a shot (root or trigger payload) is fully drawn.
function ConfigGunActionInfo_PassToGame(state)
  if not rec then return end
  local shot = rec.stack[#rec.stack]
  shot.state = state_diff(state, DEFAULT_STATE)
  shot.draw = state.action_draw_many_count
end

function ConfigGunShotEffects_PassToGame(effects)
  if rec then rec.cast.recoil = effects.recoil_knockback end
end
function SetProjectileConfigs() end
function ActionUsed() end
function LogAction() end
function BaabInstruction(name) if rec then table.insert(rec.cast.events, { kind = "baab", name = name }) end end

function OnActionPlayed(id)
  if rec then table.insert(rec.cast.played, id) end
end

-- Also note which deck slot each played action came from (-1 = always cast / generated).
local orig_play_action = play_action
function play_action(action)
  if rec then table.insert(rec.cast.slots, action.inventoryitem_id or -1) end
  return orig_play_action(action)
end

function OnNotEnoughManaForAction()
  if rec then rec.cast.no_mana = rec.cast.no_mana + 1 end
end

function StartReload(t)
  if rec then rec.cast.reload = t end
end

function ActionUsesRemainingChanged(inv_id, uses)
  if rec then table.insert(rec.cast.uses, { inv = inv_id, uses = uses }) end
  return true
end

---------------------------------------------------------------------------
-- Simulation
---------------------------------------------------------------------------
local sim = nil

function total_fire_rate_wait(shot)
  local sum = shot.state.fire_rate_wait or DEFAULT_STATE.fire_rate_wait
  for _, p in ipairs(shot.projectiles) do
    if p.trigger then sum = sum + total_fire_rate_wait(p.trigger.shot) end
  end
  return sum
end

function sim_reset(actions_per_round, shuffle, reload_time, deck_capacity, fire_rate_wait, spread, speed_mult,
                   mana_max, mana_charge, mana_start, hp, max_hp, money, frame0)
  world_reset({ hp = hp, max_hp = max_hp, money = money, frame = frame0 })
  gun = {}
  ConfigGun_Init(gun)
  gun.actions_per_round = actions_per_round
  gun.shuffle_deck_when_empty = shuffle
  gun.reload_time = reload_time
  gun.deck_capacity = deck_capacity

  state_from_game = {}
  ConfigGunActionInfo_Init(state_from_game)
  state_from_game.fire_rate_wait = fire_rate_wait
  state_from_game.spread_degrees = spread
  state_from_game.speed_multiplier = speed_mult

  _clear_deck(false)
  active_extra_modifiers = {}
  start_reload = false
  got_projectiles = false
  playing_permanent_card = false

  sim = { mana_max = mana_max, mana_charge = mana_charge, mana = mana_start, always = {}, next_inv = 1 }
end

-- uses: remaining charges, or -1 for unlimited. Returns the deck slot's inventory id.
function sim_add_card(action_id, uses)
  local inv = sim.next_inv
  sim.next_inv = inv + 1
  _add_card_to_deck(action_id, inv, uses, true)
  return inv
end

function sim_add_always_cast(action_id)
  table.insert(sim.always, action_id)
end

function sim_set_flag(flag, value)
  __world.flags[flag] = value
end

function sim_set_flags_all(value)
  __world.flags_all = value
end

-- One trigger pull on the given frame with the wand's current mana; the deck carries over between calls.
function sim_cast(frame, wand_mana)
  __world.frame = frame
  local cast = { frame = frame, mana_before = wand_mana, played = {}, slots = {}, uses = {}, events = {}, no_mana = 0 }
  rec = { stack = { new_shot() }, proj_stack = {}, cast = cast }

  _start_shot(wand_mana)
  for _, id in ipairs(sim.always) do _play_permanent_card(id) end
  _draw_actions_for_shot(true)

  cast.mana_after = mana
  cast.shot = rec.stack[1]
  rec = nil

  -- Cast delay accumulates over every shot registered during the cast, payloads included
  -- (a Bomb inside a trigger still costs its cast delay). The wand's base delay lives in the root state.
  local delay = total_fire_rate_wait(cast.shot)
  cast.cast_delay = delay
  local nf = frame + math.max(delay, 0)
  if cast.reload then nf = math.max(nf, frame + math.max(cast.reload, 0)) end
  cast.next_frame = math.max(nf, frame + 1)
  return cast
end

-- Where every deck card is after the last cast (inventory ids in draw order) and its remaining charges.
function sim_deck_state()
  local function ids(list)
    local out = {}
    for i, a in ipairs(list) do out[i] = a.inventoryitem_id end
    return out
  end
  local uses = {}
  for _, list in ipairs({ deck, hand, discarded }) do
    for _, a in ipairs(list) do uses[#uses + 1] = { inv = a.inventoryitem_id, uses = a.uses_remaining } end
  end
  return { deck = ids(deck), discarded = ids(discarded), uses = uses }
end

-- Live play: one cast plus the deck afterwards, as JSON.
function sim_cast_json(frame, wand_mana)
  local cast = sim_cast(frame, wand_mana)
  return json_encode({ cast = cast, deck = sim_deck_state(), missing = __world.missing })
end

-- Fires up to max_casts casts (stopping after the first recharge when stop_on_reload).
function sim_run(max_casts, stop_on_reload)
  local casts = {}
  local frame = __world.frame
  local wand_mana = sim.mana
  local next_frame = frame

  for i = 1, max_casts do
    if next_frame > frame then
      wand_mana = math.min(sim.mana_max, wand_mana + sim.mana_charge * (next_frame - frame) / 60)
      frame = next_frame
    end

    local cast = sim_cast(frame, wand_mana)
    cast.index = i
    wand_mana = cast.mana_after
    next_frame = cast.next_frame

    casts[#casts + 1] = cast
    if stop_on_reload and cast.reload then break end
  end

  local missing = {}
  for k in pairs(__world.missing) do missing[#missing + 1] = k end
  table.sort(missing)
  return json_encode({ casts = casts, missing = missing, log = __world.log })
end

---------------------------------------------------------------------------
-- Reflection: what each action does to an empty shot (like the in-game tooltip)
---------------------------------------------------------------------------
local reflect_projectiles = nil
local reflect_trigger = nil
function Reflection_RegisterProjectile(file)
  if reflect_projectiles then table.insert(reflect_projectiles, file) end
end

-- In reflection mode the trigger helpers return before drawing their payload, so note what they would draw.
local orig_timer, orig_hit, orig_death = add_projectile_trigger_timer, add_projectile_trigger_hit_world, add_projectile_trigger_death
function add_projectile_trigger_timer(file, delay, count)
  if reflecting then reflect_trigger = { kind = "timer", draw = count, delay = delay } end
  return orig_timer(file, delay, count)
end
function add_projectile_trigger_hit_world(file, count)
  if reflecting then reflect_trigger = { kind = "hit", draw = count } end
  return orig_hit(file, count)
end
function add_projectile_trigger_death(file, count)
  if reflecting then reflect_trigger = { kind = "death", draw = count } end
  return orig_death(file, count)
end

local STATIC_FIELDS = {
  "id", "name", "description", "sprite", "sprite_unidentified", "type", "spawn_level", "spawn_probability",
  "price", "mana", "max_uses", "never_unlimited", "recursive", "spawn_requires_flag", "spawn_manual_unlock",
  "related_projectiles", "related_extra_entities", "custom_xml_file", "ai_never_uses", "is_dangerous_blast",
  "custom_uses_logic",
}

function reflect_actions()
  local out = {}
  local saved_reflecting = reflecting
  reflecting = true
  for i, a in ipairs(actions) do
    local r = {}
    for _, k in ipairs(STATIC_FIELDS) do r[k] = a[k] end
    r.index = i

    c = {}
    reset_modifiers(c)
    shot_effects = {}
    ConfigGunShotEffects_Init(shot_effects)
    current_reload_time = 0
    deck, hand, discarded = {}, {}, {}
    reflect_projectiles = {}
    reflect_trigger = nil
    set_current_action(a)
    local ok, err = pcall(a.action, 0, 0)
    r.trigger = reflect_trigger
    if ok then
      r.stats = state_diff(c, DEFAULT_STATE)
      r.reload_delta = current_reload_time
      r.draw = c.action_draw_many_count
      r.projectiles = reflect_projectiles
    else
      r.reflect_error = tostring(err)
    end
    out[#out + 1] = r
  end
  reflecting = saved_reflecting
  reflect_projectiles = nil
  return json_encode(out)
end

function default_state_json()
  return json_encode(DEFAULT_STATE)
end
