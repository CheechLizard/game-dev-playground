-- A small immediate-mode UI, sized for the in-game editor.
--
-- Widgets are called every frame and return their (possibly changed) value
-- plus a changed flag. Identity comes from a string id, so two widgets in the
-- same panel must not share one.
--
-- The editor draws in screen space, after the pixel-art canvas has been
-- scaled up, so everything here works in real pixels.

local ui = {}

ui.theme = {
  bg        = { 0.07, 0.07, 0.10, 0.96 },
  panel     = { 0.11, 0.11, 0.15, 1 },
  raised    = { 0.17, 0.17, 0.23, 1 },
  hover     = { 0.24, 0.24, 0.32, 1 },
  activeBg  = { 0.30, 0.30, 0.42, 1 },
  accent    = { 0.35, 0.85, 0.65, 1 },
  accentDim = { 0.20, 0.45, 0.38, 1 },
  fg        = { 0.92, 0.92, 0.95, 1 },
  dim       = { 0.55, 0.56, 0.64, 1 },
  warn      = { 0.95, 0.55, 0.30, 1 },
  danger    = { 0.90, 0.32, 0.38, 1 },
  line      = { 0.22, 0.22, 0.30, 1 },
}

ui.rowHeight = 20
ui.pad = 6

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

local function rect(mode, x, y, w, h, colour, radius)
  love.graphics.setColor(colour)
  love.graphics.rectangle(mode, x, y, w, h, radius or 0)
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
function ui.setCursorY(y) cursor.y = y end
function ui.advance(h) cursor.y = cursor.y + h end
function ui.space(h) cursor.y = cursor.y + (h or ui.pad) end

local function nextRow(height)
  local x, y, w = cursor.x, cursor.y, cursor.w
  cursor.y = cursor.y + (height or ui.rowHeight) + 2
  return x, y, w
end

ui.nextRow = nextRow

-- ----------------------------------------------------------------- widgets

function ui.panel(x, y, w, h, colour)
  rect("fill", x, y, w, h, colour or ui.theme.panel)
end

function ui.label(str, colour, height)
  local x, y, w = nextRow(height or 16)
  text(ellipsise(str, w), x, y + 2, colour or ui.theme.fg)
  return x, y, w
end

function ui.heading(str)
  local x, y, w = nextRow(20)
  text(str:upper(), x, y + 4, ui.theme.accent)
  love.graphics.setColor(ui.theme.line)
  love.graphics.line(x, y + 18, x + w, y + 18)
  return x, y, w
end

function ui.separator()
  local x, y, w = nextRow(6)
  love.graphics.setColor(ui.theme.line)
  love.graphics.line(x, y + 3, x + w, y + 3)
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

  local bg = ui.theme.raised
  if opts.tone == "accent" then bg = ui.theme.accentDim end
  if opts.tone == "danger" then bg = { 0.35, 0.14, 0.17, 1 } end
  if opts.selected then bg = ui.theme.activeBg end
  if over then bg = ui.theme.hover end
  if active == id and over then bg = ui.theme.activeBg end
  if opts.disabled then bg = { 0.13, 0.13, 0.16, 1 } end

  rect("fill", x, y, w, h, bg, 2)
  local fg = opts.disabled and ui.theme.dim
    or (opts.tone == "danger" and ui.theme.danger)
    or (opts.selected and ui.theme.accent)
    or ui.theme.fg
  text(ellipsise(caption, w - 8), x + 4, y + (h - 12) / 2, fg, w - 8, opts.align or "left")

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

  local boxW, boxH = 26, 12
  local bx = x + w - boxW
  rect("fill", x, y, w, h, over and ui.theme.raised or { 0, 0, 0, 0 }, 2)
  text(ellipsise(label, w - boxW - 8), x + 4, y + 4, ui.theme.fg)
  rect("fill", bx, y + (h - boxH) / 2, boxW, boxH,
    value and ui.theme.accentDim or ui.theme.raised, boxH / 2)
  rect("fill", value and (bx + boxW - boxH + 1) or (bx + 1), y + (h - boxH) / 2 + 1,
    boxH - 2, boxH - 2, value and ui.theme.accent or ui.theme.dim, (boxH - 2) / 2)

  return value, changed
end

--- Horizontal slider with an inline numeric readout. Dragging is relative to
-- where the drag started, so the handle does not jump on grab.
function ui.slider(id, label, value, min, max, opts)
  opts = opts or {}
  local x, y, w = nextRow(opts.height or 30)
  local labelH = 14
  local trackY = y + labelH
  local trackH = 12
  local changed = false

  local readout = opts.format and string.format(opts.format, value)
    or (opts.integer and string.format("%d", value) or string.format("%.3g", value))
  if opts.unit then readout = readout .. " " .. opts.unit end

  text(ellipsise(label, w - textWidth(readout) - 10), x, y, ui.theme.fg)
  text(readout, x, y, ui.theme.accent, w, "right")

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
  rect("fill", x, trackY, w, trackH, ui.theme.raised, 2)
  rect("fill", x, trackY, w * t, trackH,
    (active == id or over) and ui.theme.accent or ui.theme.accentDim, 2)
  local hx = x + math.max(2, math.min(w - 2, w * t))
  rect("fill", hx - 2, trackY - 1, 4, trackH + 2, ui.theme.fg, 1)

  return value, changed
end

--- Stepper for values where dragging is imprecise or the range is huge.
function ui.stepper(id, label, value, min, max, step, opts)
  opts = opts or {}
  local x, y, w = nextRow()
  local h = ui.rowHeight
  local btnW = 20
  local changed = false

  text(ellipsise(label, w - btnW * 2 - 60), x, y + 4, ui.theme.fg)

  local function tinyButton(bid, caption, bx)
    local over = hovered(bx, y, btnW, h)
    if over then hot = bid end
    if over and clicked() then active = bid end
    rect("fill", bx, y, btnW, h, over and ui.theme.hover or ui.theme.raised, 2)
    text(caption, bx, y + 4, ui.theme.fg, btnW, "center")
    return over and released() and active == bid
  end

  local readout = opts.integer and string.format("%d", value) or string.format("%.4g", value)
  local rx = x + w - btnW * 2 - 46
  rect("fill", rx, y, 44, h, ui.theme.panel, 2)
  text(readout, rx, y + 4, ui.theme.accent, 44, "center")

  if tinyButton(id .. ".dec", "-", x + w - btnW * 2 - 2) then
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
  local boxW = math.min(140, w * 0.55)
  local bx = x + w - boxW
  local changed = false

  text(ellipsise(label, w - boxW - 8), x, y + 4, ui.theme.fg)

  local over = hovered(bx, y, boxW, h)
  if over then hot = id end
  if over and released() then
    openDropdown = (openDropdown and openDropdown.id == id) and nil
      or { id = id, x = bx, y = y + h, w = boxW, values = values, value = value }
  end

  rect("fill", bx, y, boxW, h, over and ui.theme.hover or ui.theme.raised, 2)
  text(ellipsise(tostring(value), boxW - 20), bx + 4, y + 4, ui.theme.accent)
  text("v", bx + boxW - 12, y + 4, ui.theme.dim)

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
  local total = #d.values * h + 4
  rect("fill", d.x - 1, d.y - 1, d.w + 2, total + 2, ui.theme.line, 2)
  rect("fill", d.x, d.y, d.w, total, ui.theme.panel, 2)
  for i, option in ipairs(d.values) do
    local oy = d.y + 2 + (i - 1) * h
    local over = inside(d.x, oy, d.w, h)
    if over then rect("fill", d.x, oy, d.w, h, ui.theme.hover) end
    text(ellipsise(tostring(option), d.w - 8), d.x + 4, oy + 4,
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
  local swatch = 16
  text(ellipsise(label, w - swatch - 8), x, y + 4, ui.theme.fg)
  rect("fill", x + w - swatch, y + 2, swatch, swatch,
    { value[1], value[2], value[3], value[4] or 1 }, 2)
  love.graphics.setColor(ui.theme.line)
  love.graphics.rectangle("line", x + w - swatch + 0.5, y + 2.5, swatch - 1, swatch - 1)

  local names = { "R", "G", "B" }
  local out = { value[1], value[2], value[3], value[4] or 1 }
  for i = 1, 3 do
    local v, c = ui.slider(id .. "." .. i, names[i], out[i], 0, 1,
      { height = 26, format = "%.2f" })
    if c then out[i] = v ; changed = true end
  end
  return out, changed
end

--- Single-line text field. Click to focus, enter or click-away to commit.
function ui.textField(id, label, value, opts)
  opts = opts or {}
  local x, y, w = nextRow()
  local h = ui.rowHeight
  local boxW = opts.width or math.min(180, w * 0.6)
  local bx = x + w - boxW
  local committed = false

  if label and label ~= "" then
    text(ellipsise(label, w - boxW - 8), x, y + 4, ui.theme.fg)
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
  rect("fill", bx, y, boxW, h, keyboardFocus == id and ui.theme.activeBg or ui.theme.raised, 2)
  if keyboardFocus == id then
    love.graphics.setColor(ui.theme.accent)
    love.graphics.rectangle("line", bx + 0.5, y + 0.5, boxW - 1, h - 1, 2)
  end
  local caret = (keyboardFocus == id and math.floor(love.timer.getTime() * 2) % 2 == 0) and "_" or ""
  text(ellipsise(shown .. caret, boxW - 8), bx + 4, y + 4,
    shown == "" and ui.theme.dim or ui.theme.fg)

  return value, committed
end

-- ----------------------------------------------------------------- scrolling

local scrollOffsets = {}

--- Begin a clipped, scrollable region. Returns the inner content width.
function ui.beginScroll(id, x, y, w, h)
  local offset = scrollOffsets[id] or 0
  if hovered(x, y, w, h) and mouse.wheel ~= 0 then
    offset = offset - mouse.wheel * 34
  end

  scissorStack[#scissorStack + 1] = { x = x, y = y, w = w, h = h }
  love.graphics.push()
  love.graphics.setScissor(x, y, w, h)
  love.graphics.translate(0, -offset)
  -- The mouse must be offset to match, or hit tests miss after scrolling.
  mouse.y = mouse.y + offset

  scrollOffsets[id] = offset
  local barW = 6
  ui.layout(x + ui.pad, y + ui.pad, w - ui.pad * 2 - barW)
  return w - ui.pad * 2 - barW, offset
end

function ui.endScroll(id, x, y, w, h)
  local offset = scrollOffsets[id] or 0
  local contentHeight = cursor.y + offset - y
  mouse.y = mouse.y - offset
  love.graphics.pop()
  love.graphics.setScissor()
  table.remove(scissorStack)

  local maxOffset = math.max(0, contentHeight - h + ui.pad)
  if offset > maxOffset then offset = maxOffset end
  if offset < 0 then offset = 0 end
  scrollOffsets[id] = offset

  if maxOffset > 0 then
    local barW = 6
    local bx = x + w - barW - 2
    local trackH = h - 4
    local thumbH = math.max(24, trackH * (h / contentHeight))
    local t = offset / maxOffset
    rect("fill", bx, y + 2, barW, trackH, { 0, 0, 0, 0.35 }, 3)
    rect("fill", bx, y + 2 + (trackH - thumbH) * t, barW, thumbH, ui.theme.dim, 3)
  end
end

function ui.resetScroll(id) scrollOffsets[id] = 0 end

function ui.mouseInside(x, y, w, h) return inside(x, y, w, h) end
function ui.mousePos() return mouse.x, mouse.y end

return ui
