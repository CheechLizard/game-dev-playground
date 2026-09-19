-- Live config values, derived entirely from the schema.
--
-- Reads in hot loops go through the nested `config.values` tree so they cost
-- a couple of table lookups:   local speed = C.player.moveSpeed
-- Writes go through config.set so listeners and dirty-tracking stay correct.

local schema = require("framework.schema")

local config = {}

config.values = {}          -- nested tree, e.g. values.player.moveSpeed
config.flat = {}            -- key -> value
config.restartPending = {}  -- key -> true for settings marked live = false

local listeners = {}        -- key -> { fn, ... }
local globalListeners = {}

local function splitKey(key)
  local parts = {}
  for part in key:gmatch("[^%.]+") do parts[#parts + 1] = part end
  return parts
end

local function writeNested(key, value)
  local parts = splitKey(key)
  local node = config.values
  for i = 1, #parts - 1 do
    local p = parts[i]
    if type(node[p]) ~= "table" then node[p] = {} end
    node = node[p]
  end
  node[parts[#parts]] = value
end

--- Rebuild every value from schema defaults. Call after the schema is fully
-- registered and before any profile is applied.
function config.build()
  config.values = {}
  config.flat = {}
  config.restartPending = {}
  for _, key in ipairs(schema.keys()) do
    local entry = schema.get(key)
    local value = schema.copyDefault(entry)
    config.flat[key] = value
    writeNested(key, value)
  end
end

function config.get(key)
  return config.flat[key]
end

--- Set a value. Returns true when the stored value actually changed.
-- `silent` skips listeners (used when bulk-applying a profile).
function config.set(key, value, silent)
  local entry = schema.get(key)
  if not entry then return false, "unknown setting '" .. tostring(key) .. "'" end

  local coerced, reason = schema.coerce(entry, value)
  if coerced == nil then return false, reason end

  local old = config.flat[key]
  if entry.type == "color" then
    local same = true
    for i = 1, 4 do
      if (old and old[i]) ~= coerced[i] then same = false break end
    end
    if same then return false end
  elseif old == coerced then
    return false
  end

  config.flat[key] = coerced
  writeNested(key, coerced)
  if not entry.live then config.restartPending[key] = true end

  if not silent then
    for _, fn in ipairs(listeners[key] or {}) do fn(key, coerced, old) end
    for _, fn in ipairs(globalListeners) do fn(key, coerced, old) end
  end
  return true
end

--- Restore one setting to its schema default.
function config.resetKey(key)
  local entry = schema.get(key)
  if not entry then return false end
  return config.set(key, schema.copyDefault(entry))
end

--- Restore every setting to its schema default.
function config.resetAll()
  for _, key in ipairs(schema.keys()) do
    config.set(key, schema.copyDefault(schema.get(key)), true)
  end
  for _, fn in ipairs(globalListeners) do fn(nil, nil, nil) end
end

--- Apply a flat table of key -> value. Unknown or invalid entries are
-- collected and returned so the caller can report them rather than fail.
function config.applyValues(values)
  local problems = {}
  for key, value in pairs(values or {}) do
    local ok, reason = config.set(key, value, true)
    if not ok and reason then
      problems[#problems + 1] = { key = key, reason = reason }
    end
  end
  for _, fn in ipairs(globalListeners) do fn(nil, nil, nil) end
  return problems
end

--- Every value that differs from its schema default. This is what a profile
-- stores, so adding a new setting never invalidates an existing profile.
function config.diffFromDefaults()
  local diff = {}
  for _, key in ipairs(schema.keys()) do
    local entry = schema.get(key)
    local value = config.flat[key]
    local default = entry.default
    if entry.type == "color" then
      local same = true
      for i = 1, 4 do
        if value[i] ~= default[i] then same = false break end
      end
      if not same then
        diff[key] = { value[1], value[2], value[3], value[4] }
      end
    elseif value ~= default then
      diff[key] = value
    end
  end
  return diff
end

--- Subscribe to changes. Pass no key to hear about every change; the callback
-- then also fires once with nil after a bulk apply or reset.
function config.listen(key, fn)
  if type(key) == "function" then
    globalListeners[#globalListeners + 1] = key
    return
  end
  listeners[key] = listeners[key] or {}
  listeners[key][#listeners[key] + 1] = fn
end

function config.clearListeners()
  listeners = {}
  globalListeners = {}
end

--- True when a setting marked `live = false` has been touched since the last
-- run started. The editor surfaces this as a "restart run to apply" banner.
function config.needsRestart()
  return next(config.restartPending) ~= nil
end

function config.clearRestartPending()
  config.restartPending = {}
end

return config
