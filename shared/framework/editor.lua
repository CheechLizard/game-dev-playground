-- The in-game editor (F1).
--
-- Every page, section and control is generated from the schema. There is no
-- second list of settings to keep in sync: add a setting to the schema and it
-- appears here; delete it and it vanishes from here and from profiles.
--
-- Games extend the editor only with *actions* (buttons that do something), via
-- editor.action{...}. Values always go through the schema.

local schema = require("framework.schema")
local config = require("framework.config")
local profiles = require("framework.profiles")
local debugdraw = require("framework.debugdraw")
local ui = require("framework.ui")
local fonts = require("framework.fonts")

local editor = {}

editor.open = false
editor.baseWidth = 440
editor.baseSidebarWidth = 132
editor.width = 440
editor.sidebarWidth = 132
editor.page = nil
editor.search = ""
editor.actions = {}       -- page -> section -> { action, ... }
editor.actionPages = {}   -- ordered page names that only contain actions
editor.hooks = {}         -- name -> function, for things like "restart run"
editor.message = nil
editor.messageUntil = 0

local PROFILE_PAGE = "Profiles"

--- Register a button. Actions live alongside generated settings on their page.
-- @param def { page, section, label, fn, order, tone, help }
function editor.action(def)
  assert(type(def.page) == "string" and type(def.fn) == "function",
    "editor.action: needs a page and a fn")
  local page = def.page
  editor.actions[page] = editor.actions[page] or {}
  local section = def.section or "Actions"
  editor.actions[page][section] = editor.actions[page][section] or {}
  local list = editor.actions[page][section]
  list[#list + 1] = {
    label = def.label or "action",
    fn = def.fn,
    order = def.order or #list + 1,
    tone = def.tone,
    help = def.help,
  }
  table.sort(list, function(a, b) return a.order < b.order end)
end

--- Register a named hook the editor can call, e.g. "restartRun".
function editor.hook(name, fn) editor.hooks[name] = fn end

--- Show a line in the editor's footer for a few seconds. Public because the
-- launcher reports screenshots through it.
function editor.notify(text)
  editor.message = text
  editor.messageUntil = (love and love.timer and love.timer.getTime() or 0) + 4
end

local notify = editor.notify

--- Pages come from the schema, plus any page that only carries actions, plus
-- the built-in Profiles page. Computed fresh so a hot reload is reflected.
function editor.pageNames()
  local names, seen = {}, {}
  for _, page in ipairs(schema.pages) do
    names[#names + 1] = page.name
    seen[page.name] = true
  end
  local extras = {}
  for name in pairs(editor.actions) do
    if not seen[name] then extras[#extras + 1] = name end
  end
  table.sort(extras)
  for _, name in ipairs(extras) do names[#names + 1] = name end
  names[#names + 1] = PROFILE_PAGE
  return names
end

function editor.toggle()
  ui.cancelInteractions()
  editor.open = not editor.open
  if editor.open and not editor.page then
    editor.page = editor.pageNames()[1]
  end
end

-- ------------------------------------------------------------ setting rows

local function isModified(entry)
  local value = config.get(entry.key)
  if entry.type == "color" then
    for i = 1, 4 do
      if value[i] ~= entry.default[i] then return true end
    end
    return false
  end
  return value ~= entry.default
end

--- Draw one setting. Returns true when the value changed this frame.
-- Shared with the sandbox placards, so a stat is edited the same way
-- wherever you meet it and there is only one mapping from type to widget.
local function drawSetting(entry, width, opts)
  opts = opts or {}
  -- The reset affordance lives in a gutter reserved on every row, shown only
  -- when the value is modified. It used to take a row of its own, which made
  -- the whole list jump the moment you touched a slider.
  local gutter = ui.unit * 5
  local cx, cy, cw = ui.cursorRect()
  ui.layout(cx, cy, cw - gutter)

  local value = config.get(entry.key)
  local changed, newValue = false, value
  local label = entry.label or entry.key
  if not entry.live then label = label .. " *" end

  if entry.type == "bool" then
    newValue, changed = ui.toggle(entry.key, label, value)
  elseif entry.type == "enum" then
    newValue, changed = ui.dropdown(entry.key, label, value, entry.values)
  elseif entry.type == "color" then
    newValue, changed = ui.color(entry.key, label, value)
  elseif entry.type == "string" then
    newValue, changed = ui.textField(entry.key, label, value)
  elseif entry.type == "int" then
    -- Narrow integer ranges read better as steppers than as sliders.
    if entry.max - entry.min <= 12 then
      newValue, changed = ui.stepper(entry.key, label, value,
        entry.min, entry.max, entry.step or 1, { integer = true })
    else
      newValue, changed = ui.slider(entry.key, label, value, entry.min, entry.max,
        { integer = true, unit = entry.unit })
    end
  else
    newValue, changed = ui.slider(entry.key, label, value, entry.min, entry.max,
      { step = entry.step, unit = entry.unit, format = entry.format })
  end

  if changed then config.set(entry.key, newValue) end

  ui.layout(cx, ui.cursorY(), cw)
  if isModified(entry) then
    local savedY = ui.cursorY()
    if ui.button("reset." .. entry.key, "x", {
        x = cx + cw - gutter + ui.unit / 2, y = cy,
        width = gutter - ui.unit / 2, height = ui.lineHeight,
        align = "center" }) then
      config.resetKey(entry.key)
    end
    ui.setCursorY(savedY)
  end

  local showHelp = opts.showHelp
  if showHelp == nil then showHelp = editor.showHelp end
  if entry.help and showHelp then
    ui.label(entry.help, ui.theme.dim, ui.lineHeight)
  end
  ui.space(ui.unit)
  return changed
end

editor.drawSetting = drawSetting

local function drawActions(page, sectionName, width)
  local sections = editor.actions[page]
  if not sections then return end
  local list = sections[sectionName]
  if not list then return end
  for i, action in ipairs(list) do
    if ui.button(page .. "." .. sectionName .. "." .. i, action.label,
        { tone = action.tone, align = "center" }) then
      action.fn()
    end
  end
  ui.space(4)
end

-- ------------------------------------------------------------ page bodies

local function drawSchemaPage(pageName, width)
  local page
  for _, p in ipairs(schema.pages) do
    if p.name == pageName then page = p break end
  end

  if page then
    for _, section in ipairs(page.sections) do
      ui.heading(section.name)
      ui.space(2)
      for _, entry in ipairs(section.settings) do
        drawSetting(entry, width)
      end
      drawActions(pageName, section.name, width)
      ui.space(4)
    end
  end

  -- Action-only sections that have no matching schema section.
  local sections = editor.actions[pageName]
  if sections then
    local names = {}
    for name in pairs(sections) do
      local covered = false
      if page and page.sectionsByName[name] then covered = true end
      if not covered then names[#names + 1] = name end
    end
    table.sort(names)
    for _, name in ipairs(names) do
      ui.heading(name)
      ui.space(2)
      drawActions(pageName, name, width)
    end
  end

  if not page and not sections then
    ui.label("Nothing registered on this page.", ui.theme.dim)
  end
end

local function drawSearchResults(width)
  local needle = editor.search:lower()
  local hits = 0
  for _, key in ipairs(schema.keys()) do
    local entry = schema.get(key)
    local haystack = (key .. " " .. (entry.label or "") .. " "
      .. entry.page .. " " .. entry.section):lower()
    if haystack:find(needle, 1, true) then
      hits = hits + 1
      if hits <= 60 then
        ui.label(entry.page .. " / " .. entry.section, ui.theme.dim, 13)
        drawSetting(entry, width)
      end
    end
  end
  if hits == 0 then
    ui.label("No settings match '" .. editor.search .. "'", ui.theme.dim)
  elseif hits > 60 then
    ui.label(string.format("... and %d more", hits - 60), ui.theme.dim)
  end
end

local newProfileName = ""

local function drawProfilePage(width)
  ui.heading("Active")
  ui.label(profiles.active or "(none)", ui.theme.accent)
  local diff = config.diffFromDefaults()
  local n = 0
  for _ in pairs(diff) do n = n + 1 end
  ui.label(string.format("%d setting%s differ from defaults", n, n == 1 and "" or "s"),
    ui.theme.dim, 14)
  if profiles.startup then
    ui.label("Loads at launch: " .. profiles.startup, ui.theme.dim, 14)
  end
  ui.space(4)

  if ui.button("profile.save", "Save to '" .. (profiles.active or "default") .. "'",
      { tone = "accent", align = "center" }) then
    profiles.save(profiles.active or "default")
    notify(profiles.status)
  end
  ui.space(2)

  newProfileName = select(1, ui.textField("profile.newname", "New name", newProfileName,
    { width = ui.unit * 42 }))
  if ui.button("profile.saveas", "Save as new profile", { align = "center" }) then
    if profiles.sanitise(newProfileName) == "" then
      notify("Give the new profile a name first")
    else
      profiles.save(newProfileName)
      newProfileName = ""
      notify(profiles.status)
    end
  end
  ui.space(6)

  ui.heading("Profiles")
  for _, name in ipairs(profiles.list) do
    local isActive = (name == profiles.active)
    local isStartup = (name == profiles.startup)
    local caption = name
    if isStartup then caption = caption .. "  [launch]" end
    local x, y, w = ui.nextRow()
    if ui.button("profile.load." .. name, caption,
        { x = x, y = y, width = w - 92, selected = isActive }) then
      profiles.load(name)
      debugdraw.sync()
      notify(profiles.status)
    end
    if ui.button("profile.startup." .. name, "launch",
        { x = x + w - ui.unit * 22, y = y, width = ui.unit * 11, disabled = isStartup }) then
      profiles.setStartup(name)
      notify(profiles.status)
    end
    if ui.button("profile.delete." .. name, "del",
        { x = x + w - ui.unit * 11, y = y, width = ui.unit * 11, tone = "danger",
          disabled = (name == "default") }) then
      profiles.delete(name)
      debugdraw.sync()
      notify(profiles.status)
    end
  end
  ui.space(6)

  if #profiles.orphans > 0 then
    ui.heading("Stale keys")
    ui.label(string.format("%d key%s in this profile no longer exist in the schema:",
      #profiles.orphans, #profiles.orphans == 1 and "" or "s"), ui.theme.warn, 14)
    for i, key in ipairs(profiles.orphans) do
      if i <= 12 then ui.label("  " .. key, ui.theme.dim, ui.unit * 3) end
    end
    if ui.button("profile.prune", "Prune stale keys", { tone = "danger", align = "center" }) then
      profiles.pruneOrphans()
      notify(profiles.status)
    end
    ui.space(6)
  end

  ui.heading("Reset")
  if ui.button("profile.resetall", "Reset every setting to its default",
      { tone = "danger", align = "center" }) then
    config.resetAll()
    debugdraw.sync()
    notify("All settings reset to schema defaults")
  end
  ui.space(4)
  ui.label("Profiles store only the differences from the schema defaults,",
    ui.theme.dim, 13)
  ui.label("so new settings inherit their defaults automatically.", ui.theme.dim, 13)
  if profiles.lastWriteLocation == "save" then
    ui.label("Note: writing to the save directory, not the repo.", ui.theme.warn, 14)
  end
end

-- ------------------------------------------------------------------- draw

function editor.draw()
  if not editor.open then return end
  if not (love and love.graphics) then return end

  local g = love.graphics
  local screenH = g.getHeight()

  -- Everything in the panel is sized off the body font, so raising the text
  -- size on the UI page widens the panel and the rows with it instead of
  -- overflowing a fixed-width column.
  local previousFont = g.getFont()
  local font = fonts.set("small")
  local scale = config.values.ui and config.values.ui.fontScale or 1
  ui.rowHeight = math.max(20, font:getHeight() + 9)
  ui.pad = math.max(6, math.floor(font:getHeight() * 0.45))
  editor.width = math.min(g.getWidth() - ui.sectionGap * 2, editor.baseWidth * scale)
  editor.sidebarWidth = editor.baseSidebarWidth * scale

  local width = editor.width
  local sidebar = editor.sidebarWidth

  ui.panel(0, 0, width, screenH, ui.theme.bg)
  g.setColor(ui.theme.line)
  g.line(width + 0.5, 0, width + 0.5, screenH)
  g.line(sidebar + 0.5, 0, sidebar + 0.5, screenH)

  -- ---- header
  local lineH = font:getHeight() + 2
  local headerH = lineH * 3 + 10
  ui.panel(0, 0, width, headerH, ui.theme.panel)
  g.setColor(ui.theme.accent)
  g.print("EDITOR", 8, 5)
  g.setColor(ui.theme.dim)
  g.print("F1 close   F2 perf   F3 colliders   F4 overlays", 8, 5 + lineH)
  g.setColor(ui.theme.fg)
  g.print(ui.ellipsise("profile: " .. (profiles.active or "-"), width - 16),
    8, 5 + lineH * 2)

  if config.needsRestart() then
    g.setColor(ui.theme.warn)
    local note = "* restart run to apply"
    g.print(note, width - ui.textWidth(note) - 8, 5 + lineH * 2)
  end

  -- ---- sidebar
  local names = editor.pageNames()
  local sidebarY = headerH + 6
  local sidebarH = screenH - sidebarY - (lineH + 10)
  ui.beginScroll("editor.sidebar", 0, sidebarY, sidebar, sidebarH)
  for _, name in ipairs(names) do
    if ui.button("page." .. name, name, { selected = (name == editor.page) }) then
      editor.page = name
      editor.search = ""
      ui.resetScroll("editor.content")
    end
  end

  ui.space(8)
  local helpValue, helpChanged = ui.toggle("editor.help", "Show help", editor.showHelp or false)
  if helpChanged then editor.showHelp = helpValue end
  ui.endScroll("editor.sidebar", 0, sidebarY, sidebar, sidebarH)

  -- ---- search
  local searchY = headerH + 6
  ui.layout(sidebar + 8, searchY, width - sidebar - 16)
  local newSearch, committed = ui.textField("editor.search", "", editor.search,
    { width = width - sidebar - 16 })
  if committed then editor.search = newSearch end
  if editor.search == "" then
    g.setColor(ui.theme.dim)
    g.print("search settings", sidebar + 12, searchY + 4)
  end

  -- ---- content
  local contentY = searchY + ui.rowHeight + 8
  local contentH = screenH - contentY - (lineH + 14)
  local innerWidth = ui.beginScroll("editor.content", sidebar + 1, contentY,
    width - sidebar - 1, contentH)

  if editor.search ~= "" then
    drawSearchResults(innerWidth)
  elseif editor.page == PROFILE_PAGE then
    drawProfilePage(innerWidth)
  else
    drawSchemaPage(editor.page, innerWidth)
  end
  ui.space(20)

  ui.endScroll("editor.content", sidebar + 1, contentY, width - sidebar - 1, contentH)

  -- ---- footer
  local footerH = lineH + 10
  local footerY = screenH - footerH
  ui.panel(0, footerY, width, footerH, ui.theme.panel)
  local now = (love.timer and love.timer.getTime()) or 0
  if editor.message and now < editor.messageUntil then
    g.setColor(ui.theme.accent)
    g.print(ui.ellipsise(editor.message, width - 16), 8, footerY + 5)
  else
    g.setColor(ui.theme.dim)
    g.print(ui.ellipsise(
      "* = takes effect on the next run   |  shift-drag a slider for fine control",
      width - 16), 8, footerY + 5)
  end

  -- The launcher draws dropdowns after all panels.
  g.setColor(1, 1, 1, 1)
  if previousFont then g.setFont(previousFont) end
end

return editor
