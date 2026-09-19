-- Config profiles: named sets of overrides stored in the repo as JSON.
--
-- A profile stores only the values that differ from the schema defaults. That
-- means adding a setting never invalidates an existing profile, and deleting a
-- setting quietly drops it the next time the profile is saved.
--
--   config/profiles/_index.json   profile order + which one loads at launch
--   config/profiles/<name>.json   one profile

local json = require("lib.json")
local fs = require("lib.fs")
local schema = require("framework.schema")
local config = require("framework.config")

local profiles = {}

-- Autosave state. Declared here rather than beside the autosave functions
-- below: profiles.load is defined earlier in this file and touches suppress,
-- and a local declared further down is not in scope at that point.
local dirty, sinceChange, suppress = false, 0, 0

profiles.dir = "config/profiles"
profiles.list = {}        -- ordered array of profile names
profiles.active = nil     -- currently loaded profile name
profiles.startup = nil    -- profile loaded at launch
profiles.orphans = {}     -- keys found in the active profile but not in the schema
profiles.lastWriteLocation = nil
profiles.status = nil     -- last human-readable result, shown in the editor

local function indexPath()
  return profiles.dir .. "/_index.json"
end

local function profilePath(name)
  return profiles.dir .. "/" .. name .. ".json"
end

--- Profile names become filenames, so keep them boring.
function profiles.sanitise(name)
  name = tostring(name or ""):lower():gsub("[^%w%-_]+", "-"):gsub("^%-+", ""):gsub("%-+$", "")
  return name
end

local function readJson(path)
  local data = fs.read(path)
  if not data then return nil end
  local value, err = json.decode(data)
  if not value then
    profiles.status = "Failed to parse " .. path .. ": " .. tostring(err)
    return nil
  end
  return value
end

local function writeIndex()
  local ok, location = fs.write(indexPath(), json.encode({
    startup = profiles.startup or "default",
    profiles = profiles.list,
  }) .. "\n")
  profiles.lastWriteLocation = location
  return ok
end

local function contains(list, value)
  for _, v in ipairs(list) do
    if v == value then return true end
  end
  return false
end

--- Read the index, then fold in any .json files sitting in the directory that
-- the index does not know about (someone added one by hand or via git).
function profiles.refresh()
  local index = readJson(indexPath())
  profiles.list = {}
  if index and type(index.profiles) == "table" then
    for _, name in ipairs(index.profiles) do
      if type(name) == "string" and fs.exists(profilePath(name)) then
        profiles.list[#profiles.list + 1] = name
      end
    end
  end
  profiles.startup = (index and index.startup) or "default"

  local discovered = {}
  for _, item in ipairs(fs.list(profiles.dir)) do
    local name = item:match("^(.+)%.json$")
    if name and name ~= "_index" and not contains(profiles.list, name) then
      discovered[#discovered + 1] = name
    end
  end
  table.sort(discovered)
  for _, name in ipairs(discovered) do
    profiles.list[#profiles.list + 1] = name
  end

  if not contains(profiles.list, "default") then
    table.insert(profiles.list, 1, "default")
  end
  return profiles.list
end

--- Load a profile over the current values. Resets everything to schema
-- defaults first, so loading is absolute rather than cumulative.
function profiles.load(name)
  suppress = suppress + 1
  local ok, a, b = pcall(profiles.applyLoad, name)
  suppress = suppress - 1
  if not ok then error(a, 0) end
  return a, b
end

function profiles.applyLoad(name)
  config.resetAll()
  profiles.orphans = {}

  local data = readJson(profilePath(name))
  if not data then
    profiles.active = name
    profiles.status = (name == "default")
      and "Using schema defaults (no default.json yet)"
      or ("Profile '" .. name .. "' not found; using schema defaults")
    return false
  end

  local values = data.values or {}
  for key in pairs(values) do
    if not schema.get(key) then
      profiles.orphans[#profiles.orphans + 1] = key
    end
  end
  table.sort(profiles.orphans)

  config.applyValues(values)
  config.clearRestartPending()
  profiles.active = name
  profiles.meta = { description = data.description, savedAt = data.savedAt }
  profiles.status = "Loaded profile '" .. name .. "'"
    .. (#profiles.orphans > 0 and (" (" .. #profiles.orphans .. " stale key(s))") or "")
  return true
end

--- Save the current values as `name`. Only the diff from defaults is written,
-- and keys that no longer exist in the schema are dropped.
function profiles.save(name, description)
  name = profiles.sanitise(name)
  if name == "" then
    profiles.status = "Profile name must contain at least one letter or digit"
    return false
  end

  local payload = {
    name = name,
    description = description or (profiles.meta and profiles.meta.description) or "",
    savedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    values = config.diffFromDefaults(),
  }

  local ok, location = fs.write(profilePath(name), json.encode(payload) .. "\n")
  profiles.lastWriteLocation = location
  if not ok then
    profiles.status = "Could not write profile: " .. tostring(location)
    return false
  end

  if not contains(profiles.list, name) then
    profiles.list[#profiles.list + 1] = name
  end
  profiles.active = name
  profiles.meta = { description = payload.description, savedAt = payload.savedAt }
  profiles.orphans = {}
  writeIndex()

  local n = 0
  for _ in pairs(payload.values) do n = n + 1 end
  profiles.status = string.format("Saved '%s' (%d override%s) to %s",
    name, n, n == 1 and "" or "s", location == "save" and "save dir" or "repo")
  return true
end

function profiles.delete(name)
  if name == "default" then
    profiles.status = "The default profile cannot be deleted"
    return false
  end
  fs.remove(profilePath(name))
  for i, v in ipairs(profiles.list) do
    if v == name then table.remove(profiles.list, i) break end
  end
  if profiles.startup == name then profiles.startup = "default" end
  if profiles.active == name then profiles.load("default") end
  writeIndex()
  profiles.status = "Deleted profile '" .. name .. "'"
  return true
end

--- Choose which profile loads at launch.
function profiles.setStartup(name)
  profiles.startup = name
  if writeIndex() then
    profiles.status = "'" .. name .. "' will load at launch"
    return true
  end
  profiles.status = "Could not update the profile index"
  return false
end

--- Drop keys that the schema no longer declares by rewriting the file.
function profiles.pruneOrphans()
  if not profiles.active then return false end
  local n = #profiles.orphans
  local ok = profiles.save(profiles.active)
  if ok then
    profiles.status = string.format("Pruned %d stale key%s from '%s'",
      n, n == 1 and "" or "s", profiles.active)
  end
  return ok
end

--- Called once at boot: find the profiles, then load the startup one.
-- ---------------------------------------------------------------- autosave
--
-- Edits live in memory until a profile is written, which means a session of
-- tuning is lost by quitting without pressing Save. Autosave closes that gap:
-- any change marks the active profile dirty and it is written once the edits
-- stop, rather than on every frame of a slider drag.

function profiles.registerSettings()
  schema.register{
    page = "UI", section = "Profiles", order = 85, sectionOrder = 30,
    settings = {
      { key = "profiles.autosave", label = "Autosave", type = "bool",
        default = true,
        help = "Write changes back to the active profile automatically." },
      { key = "profiles.autosaveDelay", label = "Autosave delay", type = "number",
        default = 0.8, min = 0.1, max = 10, unit = "s", format = "%.2f",
        help = "Quiet time after the last change before writing." },
    },
  }
end

--- Tick the autosave timer. Called once per frame by the launcher.
function profiles.update(dt)
  if not dirty then return end
  local c = config.values.profiles
  if not (c and c.autosave) then return end
  sinceChange = sinceChange + dt
  if sinceChange < (c.autosaveDelay or 0.8) then return end
  dirty = false
  profiles.save(profiles.active or "default")
end

function profiles.init()
  profiles.refresh()
  profiles.load(profiles.startup or "default")

  config.listen(function(key)
    -- A nil key is a rebuild or a profile load, not an edit. Loading a
    -- profile also sets every one of its keys, so it is suppressed outright
    -- or the load would immediately dirty what it just read.
    if key == nil or suppress > 0 then return end
    dirty, sinceChange = true, 0
  end)
end

return profiles
