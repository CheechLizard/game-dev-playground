-- A small immediate-mode UI, sized for the in-game editor.
--
-- Widgets are called every frame and return their (possibly changed) value
-- plus a changed flag. Identity comes from a string id, so two widgets in the
-- same panel must not share one.
--
-- The editor draws in screen space, after the pixel-art canvas has been
-- scaled up, so everything here works in real pixels.

local schema = require("framework.schema")
local config = require("framework.config")

local ui = {}

-- ------------------------------------------------------------------ theme
--
-- The interface is one bit deep plus an accent: a black ground, white text
-- and lines, and a single accent for selection and emphasis. Every tone in
-- between is a halftone dither of the foreground rather than a grey, so the
-- whole UI stays in three registered colours however many states it grows.
--
-- These are schema settings like everything else. ui.theme is a cache rebuilt
-- from them each frame, not a second list of colours to keep in sync.

function ui.registerSettings()
  schema.register{
    page = "UI", section = "Theme", order = 85, sectionOrder = 20,
    settings = {
      { key = "ui.background", label = "Background", type = "color",
        default = { 0, 0, 0, 1 } },
      { key = "ui.foreground", label = "Text and lines", type = "color",
        default = { 1, 1, 1, 1 } },
      { key = "ui.accent", label = "Accent", type = "color",
        default = { 0.361, 0.831, 0.639, 1 },
        help = "The only colour besides the background and the foreground. "
          .. "Selection, values and emphasis. Everything between the two is "
          .. "halftone dither, not a grey." },
    },
  }
end

ui.theme = {}

local function syncTheme()
  local c = config.values.ui
  if not c or not c.background then return end
  local t = ui.theme
  t.background = c.background
  t.fg         = c.foreground
  t.accent     = c.accent
  t.line       = c.foreground
  -- No greys: de-emphasis comes from layout and density, never from colour.
  t.dim        = c.foreground
  t.warn       = c.accent
  t.danger     = c.accent
  t.panel      = c.background
  t.bg         = { c.background[1], c.background[2], c.background[3], 0.96 }
end

-- Fill densities, not colours: a halftone of the foreground. Passed to rect()
-- wherever a surface needs to read as raised, hovered or inert.
ui.tone = {
  inert  = 0.12,
  raised = 0.25,
  hover  = 0.5,
  heavy  = 0.75,
}

-- ---------------------------------------------------------------- spacing
--
-- One contract for every surface. Each offset is a multiple of ui.unit, and
-- ui.unit tracks ui.fontScale so the rhythm survives at 2x and 3x instead of
-- the text growing while the gaps stay put. Nothing here uses a raw pixel.
--
--   unit 4 . pad 8 . gap 8 . sectionGap 16 . lineHeight 16 . rowHeight 20
--
ui.BASE_UNIT = 4

local function syncMetrics()
  local s = (config.values.ui and config.values.ui.fontScale) or 1
  local u = ui.BASE_UNIT * s
  ui.unit       = u
  ui.rowGap     = u          -- between stacked rows
  ui.pad        = u * 2      -- panel edge to content, and row inset
  ui.gap        = u * 2      -- between related items
  ui.sectionGap = u * 4      -- between unrelated blocks
  ui.lineHeight = u * 4
  ui.rowHeight  = u * 5
end

syncMetrics()

-- ------------------------------------------------------------- mouse state

local mouse = { x = 0, y = 0, down = false, prevDown = false, wheel = 0 }
local hot, active = nil, nil
local dragStart = { x = 0, y = 0, value = 0 }
local keyboardFocus = nil
local textBuffer = ""
local pendingKeys = {}
local cursor = { x = 0, y = 0, w = 200 }
local scissorStack = {}
local openDropdown = nil

function ui.beginFrame()
  syncTheme()
  syncMetrics()
  mouse.prevDown = mouse.down
  if love and love.mouse then
    mouse.x, mouse.y = love.mouse.getPosition()
    mouse.down = love.mouse.isDown(1)
  end
  hot = nil
end

function ui.endFrame()
  if not mouse.down then active = nil end
  mouse.wheel = 0
  pendingKeys = {}
end

function ui.wheelmoved(_, dy) mouse.wheel = mouse.wheel + dy end
function ui.textinput(text)
  if keyboardFocus then textBuffer = textBuffer .. text end
end
function ui.keypressed(key) pendingKeys[#pendingKeys + 1] = key end

--- True while the editor wants the mouse or keyboard, so the game can ignore them.
function ui.capturingKeyboard() return keyboardFocus ~= nil end

local function clicked() return mouse.down and not mouse.prevDown end
local function released() return not mouse.down and mouse.prevDown end

local function inside(x, y, w, h)
  return mouse.x >= x and mouse.x < x + w and mouse.y >= y and mouse.y < y + h
end

--- Hit test that respects the current scissor, so a widget scrolled out of
-- view cannot be clicked through its container.
local function hovered(x, y, w, h)
  local clip = scissorStack[#scissorStack]
  if clip and not (mouse.x >= clip.x and mouse.x < clip.x + clip.w
                   and mouse.y >= clip.y and mouse.y < clip.y + clip.h) then
    return false
  end
  return inside(x, y, w, h)
end

-- ----------------------------------------------------------------- drawing

-- ----------------------------------------------------------------- dither
--
-- A 4x4 ordered (Bayer) pattern per density, tiled. The pattern is anchored
-- to the screen rather than to the rect being filled, so two fills of the
-- same density that meet read as one continuous tone with no seam at the
-- join. The cell scales with ui.unit, or the weave would dissolve into noise
-- at 2x and 3x.
local BAYER = {
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
}
local patterns = {}
local ditherQuad

local function pattern(level)
  if patterns[level] then return patterns[level] end
  local data = love.image.newImageData(4, 4)
  for i = 0, 15 do
    local on = BAYER[i + 1] < level
    data:setPixel(i % 4, math.floor(i / 4), 1, 1, 1, on and 1 or 0)
  end
  local img = love.graphics.newImage(data)
  img:setFilter("nearest", "nearest")
  img:setWrap("repeat", "repeat")
  patterns[level] = img
  return img
end

--- Fill a rect with a halftone of `colour` (default foreground) at `density`.
function ui.halftone(x, y, w, h, density, colour)
  if w <= 0 or h <= 0 then return end
  local level = math.max(0, math.min(16, math.floor(density * 16 + 0.5)))
  if level <= 0 then return end
  local s = math.max(1, ui.unit / ui.BASE_UNIT)
  ditherQuad = ditherQuad or love.graphics.newQuad(0, 0, 1, 1, 4, 4)
  ditherQuad:setViewport((x / s) % 4, (y / s) % 4, w / s, h / s, 4, 4)
  love.graphics.setColor(colour or ui.theme.fg)
  love.graphics.draw(pattern(level), ditherQuad, x, y, 0, s, s)
end

--- `fill` is a colour table (solid) or a number 0..1 (halftone of the
-- foreground). One entry point, so no widget invents its own shading.
-- Corners are square: rounding does not survive a one-bit dither.
local function rect(mode, x, y, w, h, fill)
  if fill == nil then return end
  if type(fill) == "number" then
    ui.halftone(x, y, w, h, fill)
    return
  end
  love.graphics.setColor(fill)
  love.graphics.rectangle(mode, x, y, w, h)
end

local function text(str, x, y, colour, limit, align)
  love.graphics.setColor(colour or ui.theme.fg)
  if limit then
    love.graphics.printf(str, x, y, limit, align or "left")
  else
    love.graphics.print(str, x, y)
  end
end

local function textWidth(str)
  return love.graphics.getFont():getWidth(str)
end

--- Baseline for a single line vertically centred in a row of height h. Every
-- widget uses this rather than its own magic offset.
local function textY(y, h)
  return y + math.floor((h - love.graphics.getFont():getHeight()) / 2)
end

--- Trim a string to fit a pixel width, with an ellipsis.
local function ellipsise(str, maxWidth)
  if textWidth(str) <= maxWidth then return str end
  local out = str
  while #out > 1 and textWidth(out .. "...") > maxWidth do
    out = out:sub(1, #out - 1)
  end
  return out .. "..."
end

ui.ellipsise = ellipsise
ui.textWidth = textWidth

-- ------------------------------------------------------------------ layout

function ui.layout(x, y, w)
  cursor.x, cursor.y, cursor.w = x, y, w
end

function ui.cursorY() return cursor.y end
function ui.cursorRect() return cursor.x, cursor.y, cursor.w end
function ui.setCursorY(y) cursor.y = y end
function ui.advance(h) cursor.y = cursor.y + h end
function ui.space(h) cursor.y = cursor.y + (h or ui.pad) end

local function nextRow(height)
  local x, y, w = cursor.x, cursor.y, cursor.w
  cursor.y = cursor.y + (height or ui.rowHeight) + ui.rowGap
  return x, y, w
end

ui.nextRow = nextRow

-- ----------------------------------------------------------------- widgets

function ui.panel(x, y, w, h, colour)
  rect("fill", x, y, w, h, colour or ui.theme.panel)
end

function ui.label(str, colour, height)
  local h = height or ui.lineHeight
  local x, y, w = nextRow(h)
  text(ellipsise(str, w), x, textY(y, h), colour or ui.theme.fg)
  return x, y, w
end

function ui.heading(str)
  local h = ui.rowHeight
  local x, y, w = nextRow(h)
  text(str:upper(), x, textY(y, h - ui.unit), ui.theme.accent)
  love.graphics.setColor(ui.theme.line)
  love.graphics.line(x, y + h - 1, x + w, y + h - 1)
  return x, y, w
end

function ui.separator()
  local h = ui.gap
  local x, y, w = nextRow(h)
  love.graphics.setColor(ui.theme.line)
  love.graphics.line(x, y + h / 2, x + w, y + h / 2)
end

--- A button. Pass width to override the full row.
function ui.button(id, caption, opts)
  opts = opts or {}
  local x, y, w = nextRow(opts.height)
  if opts.width then w = opts.width end
  if opts.x then x = opts.x end
  if opts.y then y = opts.y ; cursor.y = cursor.y - (opts.height or ui.rowHeight) - 2 end
  local h = opts.height or ui.rowHeight

  local over = hovered(x, y, w, h)
  if over then hot = id end
  if over and clicked() then active = id end
  local fired = over and released() and active == id

  -- Solid accent means "this one is chosen or being pressed". Everything
  -- else is a halftone, with an outline to mark hover. Text sits on top in
  -- the foreground, or the background when the cell underneath is solid.
  local solid = opts.selected or opts.tone == "accent" or (active == id and over)
  -- Nothing dithers behind a label: a halftone and the text are the same
  -- white, so the glyphs dissolve into it. Rest is bare, hover takes a fill
  -- and an outline, and the chosen row goes solid accent with dark text.
  local fill = solid and ui.theme.accent or (over and ui.tone.raised or nil)
  rect("fill", x, y, w, h, fill)
  if over and not solid then
    love.graphics.setColor(ui.theme.fg)
    love.graphics.rectangle("line", x + 0.5, y + 0.5, w - 1, h - 1)
  end
  local fg = solid and ui.theme.background or ui.theme.fg
  text(ellipsise(caption, w - ui.pad), x + ui.unit, textY(y, h), fg,
    w - ui.pad, opts.align or "left")
  if opts.disabled then
    -- Screen-door the cell back instead of tinting the text grey.
    ui.halftone(x, y, w, h, 0.5, ui.theme.background)
  end

  return (fired and not opts.disabled) or false
end

function ui.toggle(id, label, value, opts)
  opts = opts or {}
  local x, y, w = nextRow()
  local h = ui.rowHeight
  local over = hovered(x, y, w, h)
  if over then hot = id end
  local changed = false
  if over and released() and active == id then
    value = not value
    changed = true
  end
  if over and clicked() then active = id end

  local boxH = ui.unit * 3
  local boxW = boxH * 2
  local bx = x + w - boxW
  local by = y + (h - boxH) / 2
  if over then rect("fill", x, y, w, h, ui.tone.inert) end
  text(ellipsise(label, w - boxW - ui.gap), x + ui.unit, textY(y, h), ui.theme.fg)
  -- Track is a halftone well; the knob is solid, accent when on.
  rect("fill", bx, by, boxW, boxH, ui.tone.raised)
  love.graphics.setColor(ui.theme.line)
  love.graphics.rectangle("line", bx + 0.5, by + 0.5, boxW - 1, boxH - 1)
  rect("fill", value and (bx + boxW - boxH) or bx, by, boxH, boxH,
    value and ui.theme.accent or ui.theme.fg)

  return value, changed
end

--- Readout for a numeric value. Never scientific notation: these are numbers
-- you can now type back in, and "1.2e+03" is not something anyone types.
local function formatNumber(value, integer)
  if integer or value == math.floor(value) then
    return string.format("%d", value)
  end
  local s = string.format("%.3f", value)
  s = s:gsub("0+$", "")
  s = s:gsub("%.$", "")
  return s
end

--- Click a numeric readout to type into it. Shares the text-field focus, so
-- only one field anywhere owns the keyboard at a time, and while it does the
-- launcher stops routing keys to the game.
local function numericEntry(id, value, min, max, x, y, w, h, readout, integer)
  local focused = keyboardFocus == id
  local over = hovered(x, y, w, h)
  if over then hot = id end

  if released() then
    if over and not focused then
      keyboardFocus = id
      textBuffer = tostring(value)
      focused = true
    elseif focused and not over then
      keyboardFocus = nil
      focused = false
    end
  end

  local changed = false
  if focused then
    for _, key in ipairs(pendingKeys) do
      if key == "backspace" then
        textBuffer = textBuffer:sub(1, -2)
      elseif key == "return" or key == "kpenter" or key == "tab" then
        -- Anything unparseable is simply declined; the value stands.
        local n = tonumber(textBuffer)
        if n then
          n = math.max(min, math.min(max, n))
          if integer then n = math.floor(n + 0.5) end
          if n ~= value then value, changed = n, true end
        end
        keyboardFocus, focused = nil, false
      elseif key == "escape" then
        keyboardFocus, focused = nil, false
      end
    end
  end

  local shown = readout
  if focused then
    local caret = (math.floor(love.timer.getTime() * 2) % 2 == 0) and "_" or ""
    shown = textBuffer .. caret
    love.graphics.setColor(ui.theme.accent)
    love.graphics.rectangle("line", x + 0.5, y + 0.5, w - 1, h - 1)
  end
  -- Keep the tail of a long entry and print it placed, not wrapped: printf
  -- with a width limit spills onto a second line and over the row below.
  local limit = w - ui.unit
  while #shown > 1 and textWidth(shown) > limit do shown = shown:sub(2) end
  love.graphics.setColor(ui.theme.accent)
  love.graphics.print(shown, x + w - ui.unit / 2 - textWidth(shown), textY(y, h))
  return value, changed, focused
end

--- Horizontal slider with an inline numeric readout. Dragging is relative to
-- where the drag started, so the handle does not jump on grab.
function ui.slider(id, label, value, min, max, opts)
  opts = opts or {}
  local x, y, w = nextRow(opts.height or (ui.unit * 7))
  local labelH = ui.lineHeight
  local trackY = y + labelH
  local trackH = ui.unit * 3
  local changed = false

  local readout = opts.format and string.format(opts.format, value)
    or formatNumber(value, opts.integer)
  if opts.unit then readout = readout .. " " .. opts.unit end

  local readoutW = math.max(ui.unit * 12, textWidth(readout) + ui.gap)
  local typed
  value, typed = numericEntry(id .. ".entry", value, min, max,
    x + w - readoutW, y, readoutW, labelH, readout, opts.integer)
  if typed then changed = true end
  text(ellipsise(label, w - readoutW - ui.gap), x, textY(y, labelH),
    ui.theme.fg)

  local over = hovered(x, trackY, w, trackH)
  if over then hot = id end
  if over and clicked() then
    active = id
    dragStart.x = mouse.x
    dragStart.value = value
  end

  if active == id and mouse.down then
    local span = max - min
    local perPixel = span / math.max(1, w)
    -- Hold shift for fine control.
    if love.keyboard and (love.keyboard.isDown("lshift") or love.keyboard.isDown("rshift")) then
      perPixel = perPixel * 0.15
    end
    local proposed = dragStart.value + (mouse.x - dragStart.x) * perPixel
    proposed = math.max(min, math.min(max, proposed))
    if opts.integer then proposed = math.floor(proposed + 0.5) end
    if opts.step and opts.step > 0 and not opts.integer then
      proposed = math.floor(proposed / opts.step + 0.5) * opts.step
    end
    if proposed ~= value then
      value = proposed
      changed = true
    end
  end

  local t = (max > min) and ((value - min) / (max - min)) or 0
  -- Outline for the span, solid accent for the filled part, and a full-height
  -- tick for the handle. The empty part stays empty.
  rect("fill", x, trackY, w * t, trackH, ui.theme.accent)
  love.graphics.setColor(ui.theme.line)
  love.graphics.rectangle("line", x + 0.5, trackY + 0.5, w - 1, trackH - 1)
  local hw = math.max(2, ui.unit / 2)
  local hx = x + math.max(hw, math.min(w - hw, w * t))
  rect("fill", hx - hw / 2, trackY - ui.unit / 2, hw, trackH + ui.unit,
    ui.theme.fg)

  return value, changed
end

--- Stepper for values where dragging is imprecise or the range is huge.
function ui.stepper(id, label, value, min, max, step, opts)
  opts = opts or {}
  local x, y, w = nextRow()
  local h = ui.rowHeight
  local btnW = ui.rowHeight
  local readoutW = ui.unit * 11
  local changed = false

  text(ellipsise(label, w - btnW * 2 - readoutW - ui.gap), x, textY(y, h),
    ui.theme.fg)

  local function tinyButton(bid, caption, bx)
    local over = hovered(bx, y, btnW, h)
    if over then hot = bid end
    if over and clicked() then active = bid end
    rect("fill", bx, y, btnW, h, over and ui.tone.raised or nil)
    love.graphics.setColor(ui.theme.line)
    love.graphics.rectangle("line", bx + 0.5, y + 0.5, btnW - 1, h - 1)
    text(caption, bx, textY(y, h), ui.theme.fg, btnW, "center")
    return over and released() and active == bid
  end

  local readout = formatNumber(value, opts.integer)
  local rx = x + w - btnW * 2 - readoutW - ui.unit
  local typed
  value, typed = numericEntry(id .. ".entry", value, min, max,
    rx, y, readoutW, h, readout, opts.integer)
  if typed then changed = true end

  if tinyButton(id .. ".dec", "-", x + w - btnW * 2 - ui.unit) then
    value = math.max(min, value - step) ; changed = true
  end
  if tinyButton(id .. ".inc", "+", x + w - btnW) then
    value = math.min(max, value + step) ; changed = true
  end
  return value, changed
end

--- Dropdown. The open list draws on top via ui.drawDeferred at frame end.
function ui.dropdown(id, label, value, values, opts)
  opts = opts or {}
  local x, y, w = nextRow()
  local h = ui.rowHeight
  local boxW = math.min(ui.unit * 35, w * 0.55)
  local bx = x + w - boxW
  local changed = false

  text(ellipsise(label, w - boxW - ui.gap), x, textY(y, h), ui.theme.fg)

  local over = hovered(bx, y, boxW, h)
  if over then hot = id end
  if over and released() then
    openDropdown = (openDropdown and openDropdown.id == id) and nil
      or { id = id, x = bx, y = y + h, w = boxW, values = values, value = value }
  end

  rect("fill", bx, y, boxW, h, over and ui.tone.raised or nil)
  love.graphics.setColor(ui.theme.line)
  love.graphics.rectangle("line", bx + 0.5, y + 0.5, boxW - 1, h - 1)
  text(ellipsise(tostring(value), boxW - ui.unit * 5), bx + ui.unit,
    textY(y, h), ui.theme.accent)
  text("v", bx + boxW - ui.unit * 3, textY(y, h), ui.theme.fg)

  -- A pick made last frame is reported now, once the list has been drawn.
  if ui.dropdownResult and ui.dropdownResult.id == id then
    value = ui.dropdownResult.value
    ui.dropdownResult = nil
    changed = true
  end
  return value, changed
end

--- Draw any open dropdown list. Call once, last, so it sits above everything.
function ui.drawDeferred()
  if not openDropdown then return end
  local d = openDropdown
  local h = ui.rowHeight
  local total = #d.values * h + ui.unit
  rect("fill", d.x, d.y, d.w, total, ui.theme.panel)
  love.graphics.setColor(ui.theme.line)
  love.graphics.rectangle("line", d.x + 0.5, d.y + 0.5, d.w - 1, total - 1)
  for i, option in ipairs(d.values) do
    local oy = d.y + ui.unit / 2 + (i - 1) * h
    local over = inside(d.x, oy, d.w, h)
    if over then rect("fill", d.x, oy, d.w, h, ui.tone.raised) end
    text(ellipsise(tostring(option), d.w - ui.pad), d.x + ui.unit, textY(oy, h),
      option == d.value and ui.theme.accent or ui.theme.fg)
    if over and released() then
      ui.dropdownResult = { id = d.id, value = option }
      openDropdown = nil
    end
  end
  -- Clicking anywhere else dismisses the list.
  if openDropdown and released()
     and not inside(d.x, d.y, d.w, total) then
    openDropdown = nil
  end
end

function ui.dropdownOpen() return openDropdown ~= nil end

--- Colour editor: a swatch plus three channel sliders.
function ui.color(id, label, value)
  local changed = false
  local x, y, w = nextRow()
  local h = ui.rowHeight
  local swatch = ui.lineHeight
  local sy = y + (h - swatch) / 2
  text(ellipsise(label, w - swatch - ui.gap), x, textY(y, h), ui.theme.fg)
  rect("fill", x + w - swatch, sy, swatch, swatch,
    { value[1], value[2], value[3], value[4] or 1 })
  love.graphics.setColor(ui.theme.line)
  love.graphics.rectangle("line", x + w - swatch + 0.5, sy + 0.5, swatch - 1, swatch - 1)

  local names = { "R", "G", "B" }
  local out = { value[1], value[2], value[3], value[4] or 1 }
  for i = 1, 3 do
    local v, c = ui.slider(id .. "." .. i, names[i], out[i], 0, 1,
      { height = ui.unit * 7, format = "%.2f" })
    if c then out[i] = v ; changed = true end
  end
  return out, changed
end

--- Single-line text field. Click to focus, enter or click-away to commit.
function ui.textField(id, label, value, opts)
  opts = opts or {}
  local x, y, w = nextRow()
  local h = ui.rowHeight
  local boxW = opts.width or math.min(ui.unit * 45, w * 0.6)
  local bx = x + w - boxW
  local committed = false

  if label and label ~= "" then
    text(ellipsise(label, w - boxW - ui.gap), x, textY(y, h), ui.theme.fg)
  end

  local over = hovered(bx, y, boxW, h)
  if over then hot = id end
  if released() then
    if over then
      if keyboardFocus ~= id then
        keyboardFocus = id
        textBuffer = value or ""
      end
    elseif keyboardFocus == id then
      keyboardFocus = nil
      value = textBuffer
      committed = true
    end
  end

  if keyboardFocus == id then
    for _, key in ipairs(pendingKeys) do
      if key == "backspace" then
        textBuffer = textBuffer:sub(1, -2)
      elseif key == "return" or key == "kpenter" then
        keyboardFocus = nil
        value = textBuffer
        committed = true
      elseif key == "escape" then
        keyboardFocus = nil
        textBuffer = ""
      end
    end
  end

  local shown = (keyboardFocus == id) and textBuffer or (value or "")
  love.graphics.setColor(keyboardFocus == id and ui.theme.accent or ui.theme.line)
  love.graphics.rectangle("line", bx + 0.5, y + 0.5, boxW - 1, h - 1)
  local caret = (keyboardFocus == id and math.floor(love.timer.getTime() * 2) % 2 == 0) and "_" or ""
  text(ellipsise(shown .. caret, boxW - ui.pad), bx + ui.unit, textY(y, h),
    ui.theme.fg)

  return value, committed
end

-- ----------------------------------------------------------------- scrolling

local scrollOffsets = {}

--- Begin a clipped, scrollable region. Returns the inner content width.
function ui.beginScroll(id, x, y, w, h)
  local offset = scrollOffsets[id] or 0
  if hovered(x, y, w, h) and mouse.wheel ~= 0 then
    offset = offset - mouse.wheel * (ui.rowHeight + ui.rowGap) * 1.5
  end

  scissorStack[#scissorStack + 1] = { x = x, y = y, w = w, h = h }
  love.graphics.push()
  love.graphics.setScissor(x, y, w, h)
  love.graphics.translate(0, -offset)
  -- The mouse must be offset to match, or hit tests miss after scrolling.
  mouse.y = mouse.y + offset

  scrollOffsets[id] = offset
  local barW = ui.unit * 2
  ui.layout(x + ui.pad, y + ui.pad, w - ui.pad * 2 - barW)
  return w - ui.pad * 2 - barW, offset
end

function ui.endScroll(id, x, y, w, h)
  local offset = scrollOffsets[id] or 0
  local contentHeight = cursor.y - y
  mouse.y = mouse.y - offset
  love.graphics.pop()
  love.graphics.setScissor()
  table.remove(scissorStack)

  local maxOffset = math.max(0, contentHeight - h + ui.pad)
  if offset > maxOffset then offset = maxOffset end
  if offset < 0 then offset = 0 end
  scrollOffsets[id] = offset

  if maxOffset > 0 then
    local barW = ui.unit * 2
    local bx = x + w - barW - ui.unit
    local trackH = h - ui.gap
    local thumbH = math.max(ui.rowHeight,
      math.min(trackH, trackH * (h / math.max(1, contentHeight))))
    local t = offset / maxOffset
    rect("fill", bx, y + ui.unit, barW, trackH, ui.tone.inert)
    rect("fill", bx, y + ui.unit + (trackH - thumbH) * t, barW, thumbH,
      ui.theme.fg)
  end
end

function ui.resetScroll(id) scrollOffsets[id] = 0 end

function ui.mouseInside(x, y, w, h) return inside(x, y, w, h) end
function ui.mousePos() return mouse.x, mouse.y end

return ui
