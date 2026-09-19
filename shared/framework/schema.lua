-- Declarative setting schema.
--
-- The schema is the single source of truth for every tunable in a game:
--   * the game reads values through `config`, which is built from this schema
--   * the editor UI is generated from this schema, so nothing is hand-wired
--   * profiles serialise against this schema, so a setting deleted here
--     disappears from the editor and is pruned from profiles
--
-- That last property is the point: you cannot forget to remove a setting from
-- the editor, because the editor has no independent list of settings.

local schema = {}

local VALID_TYPES = {
  number = true, int = true, bool = true,
  enum = true, color = true, string = true,
}

schema.settings = {}   -- key -> entry
schema.pages = {}      -- ordered array of page records
local pagesByName = {}

--- Wipe the registry. Used by tests and by hot-reload.
function schema.reset()
  schema.settings = {}
  schema.pages = {}
  pagesByName = {}
end

local function getPage(name, order)
  local page = pagesByName[name]
  if not page then
    page = { name = name, order = order or 100, sections = {}, sectionsByName = {} }
    pagesByName[name] = page
    schema.pages[#schema.pages + 1] = page
  elseif order and order < page.order then
    page.order = order
  end
  return page
end

local function getSection(page, name, order)
  local section = page.sectionsByName[name]
  if not section then
    section = { name = name, order = order or 100, settings = {} }
    page.sectionsByName[name] = section
    page.sections[#page.sections + 1] = section
  elseif order and order < section.order then
    section.order = order
  end
  return section
end

local function sortAll()
  local function byOrderThenName(a, b)
    if a.order ~= b.order then return a.order < b.order end
    return a.name < b.name
  end
  table.sort(schema.pages, byOrderThenName)
  for _, page in ipairs(schema.pages) do
    table.sort(page.sections, byOrderThenName)
  end
end

local function validate(entry, page, section)
  local where = string.format("%s/%s/%s", page, section, tostring(entry.key))
  assert(type(entry.key) == "string" and entry.key ~= "",
    "schema: setting needs a string key in " .. where)
  assert(not schema.settings[entry.key],
    "schema: duplicate setting key '" .. entry.key .. "'")
  assert(VALID_TYPES[entry.type],
    "schema: unknown type '" .. tostring(entry.type) .. "' for " .. where)
  assert(entry.default ~= nil, "schema: missing default for " .. where)

  if entry.type == "number" or entry.type == "int" then
    assert(type(entry.default) == "number", "schema: default must be a number for " .. where)
    assert(type(entry.min) == "number" and type(entry.max) == "number",
      "schema: numeric setting needs min and max for " .. where)
    assert(entry.min <= entry.max, "schema: min > max for " .. where)
  elseif entry.type == "bool" then
    assert(type(entry.default) == "boolean", "schema: default must be a boolean for " .. where)
  elseif entry.type == "enum" then
    assert(type(entry.values) == "table" and #entry.values > 0,
      "schema: enum needs a non-empty values list for " .. where)
    local found = false
    for _, v in ipairs(entry.values) do
      if v == entry.default then found = true break end
    end
    assert(found, "schema: enum default is not in values for " .. where)
  elseif entry.type == "color" then
    assert(type(entry.default) == "table" and #entry.default >= 3,
      "schema: color default must be {r,g,b[,a]} for " .. where)
  elseif entry.type == "string" then
    assert(type(entry.default) == "string", "schema: default must be a string for " .. where)
  end
end

--- Register a block of settings under a page and section.
-- @param def table: { page, section, order, sectionOrder, settings = { entry, ... } }
function schema.register(def)
  assert(type(def) == "table", "schema.register: expected a table")
  assert(type(def.page) == "string", "schema.register: `page` is required")
  assert(type(def.settings) == "table", "schema.register: `settings` is required")

  local sectionName = def.section or "General"
  local page = getPage(def.page, def.order)
  local section = getSection(page, sectionName, def.sectionOrder or def.order)

  for i, entry in ipairs(def.settings) do
    validate(entry, def.page, sectionName)
    entry.page = def.page
    entry.section = sectionName
    entry.order = entry.order or i
    if entry.live == nil then entry.live = true end
    if entry.type == "int" then
      entry.step = entry.step or 1
    end
    schema.settings[entry.key] = entry
    section.settings[#section.settings + 1] = entry
  end

  table.sort(section.settings, function(a, b)
    if a.order ~= b.order then return a.order < b.order end
    return a.key < b.key
  end)
  sortAll()
end

function schema.get(key)
  return schema.settings[key]
end

--- Force a value into the shape the entry declares. Returns the coerced value,
-- or nil plus a reason when the value cannot be salvaged at all.
function schema.coerce(entry, value)
  local t = entry.type
  if t == "number" or t == "int" then
    local n = tonumber(value)
    if not n then return nil, "not a number" end
    if t == "int" then n = math.floor(n + 0.5) end
    if n < entry.min then n = entry.min end
    if n > entry.max then n = entry.max end
    return n
  elseif t == "bool" then
    if type(value) ~= "boolean" then return nil, "not a boolean" end
    return value
  elseif t == "enum" then
    for _, v in ipairs(entry.values) do
      if v == value then return value end
    end
    return nil, "not one of the allowed values"
  elseif t == "color" then
    if type(value) ~= "table" or #value < 3 then return nil, "not a colour triple" end
    local out = {}
    for i = 1, 4 do
      local c = tonumber(value[i])
      if c then out[i] = math.max(0, math.min(1, c)) end
    end
    if #out < 3 then return nil, "not a colour triple" end
    return out
  elseif t == "string" then
    if type(value) ~= "string" then return nil, "not a string" end
    return value
  end
  return nil, "unknown type"
end

--- Deep-ish copy of a default, so callers never alias the schema's own table.
function schema.copyDefault(entry)
  if entry.type == "color" then
    local out = {}
    for i, v in ipairs(entry.default) do out[i] = v end
    return out
  end
  return entry.default
end

--- Every registered key, sorted. Handy for diffing against a profile.
function schema.keys()
  local keys = {}
  for k in pairs(schema.settings) do keys[#keys + 1] = k end
  table.sort(keys)
  return keys
end

return schema
