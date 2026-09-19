-- Performance overlay: frame timing, per-scope costs, and live counters.
--
-- Instrument a system by wrapping it:
--     perf.push("update.enemies")  ...  perf.pop()
-- and report interesting quantities with:
--     perf.count("enemies", #enemies)

local perf = {}

local HISTORY = 180

local now = (love and love.timer and love.timer.getTime)
  or function() return os.clock() end

perf.enabled = true
perf.history = {}        -- rolling frame times in ms
perf.historyHead = 0
perf.scopes = {}         -- name -> { ms, calls, order }
perf.scopeOrder = {}
perf.counters = {}       -- name -> { value, order }
perf.counterOrder = {}
perf.fps = 0
perf.frameMs = 0
perf.peakMs = 0

local stack = {}
local frameStart = 0
local fpsAccum, fpsFrames = 0, 0

for i = 1, HISTORY do perf.history[i] = 0 end

function perf.beginFrame()
  frameStart = now()
  for _, scope in pairs(perf.scopes) do
    scope.ms = 0
    scope.calls = 0
  end
  for _, counter in pairs(perf.counters) do counter.value = 0 end
  stack = {}
end

function perf.push(name)
  if not perf.enabled then return end
  stack[#stack + 1] = { name = name, t = now() }
end

function perf.pop()
  if not perf.enabled then return end
  local frame = table.remove(stack)
  if not frame then return end
  local ms = (now() - frame.t) * 1000
  local scope = perf.scopes[frame.name]
  if not scope then
    scope = { ms = 0, calls = 0, avg = 0 }
    perf.scopes[frame.name] = scope
    perf.scopeOrder[#perf.scopeOrder + 1] = frame.name
    table.sort(perf.scopeOrder)
  end
  scope.ms = scope.ms + ms
  scope.calls = scope.calls + 1
end

--- Time a function call. Returns whatever the function returns.
function perf.measure(name, fn, ...)
  perf.push(name)
  local a, b, c = fn(...)
  perf.pop()
  return a, b, c
end

function perf.count(name, value)
  local counter = perf.counters[name]
  if not counter then
    counter = { value = 0 }
    perf.counters[name] = counter
    perf.counterOrder[#perf.counterOrder + 1] = name
    table.sort(perf.counterOrder)
  end
  counter.value = (counter.value or 0) + (value or 1)
end

function perf.endFrame(dt)
  perf.frameMs = (now() - frameStart) * 1000
  perf.historyHead = perf.historyHead % HISTORY + 1
  perf.history[perf.historyHead] = perf.frameMs

  -- Smooth per-scope costs so the numbers are readable rather than jittery.
  for _, scope in pairs(perf.scopes) do
    scope.avg = (scope.avg or scope.ms) * 0.9 + scope.ms * 0.1
  end

  fpsAccum = fpsAccum + (dt or 0)
  fpsFrames = fpsFrames + 1
  if fpsAccum >= 0.25 then
    perf.fps = fpsFrames / fpsAccum
    fpsAccum, fpsFrames = 0, 0
    local peak = 0
    for i = 1, HISTORY do
      if perf.history[i] > peak then peak = perf.history[i] end
    end
    perf.peakMs = peak
  end
end

-- ------------------------------------------------------------------ draw


--- Draw the overlay. Pure love.graphics; safe to skip when headless.
function perf.draw(x, y, theme)
  if not love or not love.graphics then return end
  local g = love.graphics
  theme = theme or {}

  -- The overlay sizes itself off the UI font, like the editor does, so it
  -- stays readable when the text size is raised rather than keeping its own
  -- hardcoded metrics.
  local fonts = require("framework.fonts")
  local previousFont = g.getFont()
  local font = fonts.set("small")
  local ROW_H = font:getHeight() + 3
  local PANEL_W = math.max(198, font:getWidth("projectiles") + font:getWidth("0000") + 24)
  local fg = theme.fg or { 0.95, 0.95, 0.95, 1 }
  local dim = theme.dim or { 0.6, 0.6, 0.65, 1 }
  local accent = theme.accent or { 0.35, 0.85, 0.65, 1 }
  local warn = theme.warn or { 0.9, 0.35, 0.4, 1 }

  local statRows = (love.graphics.getStats and 6 or 4)
  local scopeRows = #perf.scopeOrder > 0 and (#perf.scopeOrder + 1) or 0
  local counterRows = #perf.counterOrder > 0 and (#perf.counterOrder + 1) or 0
  local height = 12 + ROW_H * 2.4 + 8 + (statRows + scopeRows + counterRows) * ROW_H

  g.setColor(0, 0, 0, 0.72)
  g.rectangle("fill", x, y, PANEL_W, height)
  g.setColor(dim)
  g.rectangle("line", x + 0.5, y + 0.5, PANEL_W - 1, height - 1)

  local cy = y + 4
  local function row(label, value, colour)
    g.setColor(colour or fg)
    g.print(label, x + 5, cy)
    if value then
      local w = g.getFont():getWidth(value)
      g.print(value, x + PANEL_W - 5 - w, cy)
    end
    cy = cy + ROW_H
  end

  local budget = 16.7
  row("FPS", string.format("%.0f", perf.fps),
    perf.fps < 55 and warn or accent)
  row("frame", string.format("%.2f ms", perf.frameMs),
    perf.frameMs > budget and warn or fg)
  row("peak", string.format("%.2f ms", perf.peakMs),
    perf.peakMs > budget and warn or dim)
  if love.graphics.getStats then
    local stats = love.graphics.getStats()
    row("draws", tostring(stats.drawcalls), dim)
    row("vram", string.format("%.1f MB", stats.texturememory / 1048576), dim)
  end
  row("lua mem", string.format("%.0f KB", collectgarbage("count")), dim)

  -- Frame-time graph, oldest on the left.
  local gx, gy, gw, gh = x + 5, cy + 2, PANEL_W - 10, ROW_H * 2.4
  g.setColor(0, 0, 0, 0.5)
  g.rectangle("fill", gx, gy, gw, gh)
  g.setColor(warn[1], warn[2], warn[3], 0.35)
  local budgetY = gy + gh - math.min(gh, (budget / 33.4) * gh)
  g.line(gx, budgetY, gx + gw, budgetY)
  g.setColor(accent)
  local step = gw / HISTORY
  for i = 1, HISTORY do
    local sample = perf.history[(perf.historyHead + i - 1) % HISTORY + 1]
    local h = math.min(gh, (sample / 33.4) * gh)
    if h > 0 then
      g.rectangle("fill", gx + (i - 1) * step, gy + gh - h, math.max(1, step), h)
    end
  end
  cy = gy + gh + 4

  if #perf.scopeOrder > 0 then
    g.setColor(dim)
    g.print("systems", x + 5, cy)
    cy = cy + ROW_H
    for _, name in ipairs(perf.scopeOrder) do
      local scope = perf.scopes[name]
      row("  " .. name, string.format("%.2f", scope.avg or 0),
        (scope.avg or 0) > 4 and warn or fg)
    end
  end

  if #perf.counterOrder > 0 then
    g.setColor(dim)
    g.print("counts", x + 5, cy)
    cy = cy + ROW_H
    for _, name in ipairs(perf.counterOrder) do
      row("  " .. name, string.format("%d", perf.counters[name].value or 0), fg)
    end
  end

  g.setColor(1, 1, 1, 1)
  if previousFont then g.setFont(previousFont) end
end

--- Width the overlay will draw at, so callers can right-align it.
function perf.panelWidth()
  if not (love and love.graphics) then return 198 end
  local font = require("framework.fonts").role("small")
  return math.max(198, font:getWidth("projectiles") + font:getWidth("0000") + 24)
end

return perf
