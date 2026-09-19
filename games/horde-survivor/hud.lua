-- HUD, shop screen and the end-of-run summary.
--
-- These draw in screen space, on top of the scaled canvas, so text stays crisp
-- at any window size rather than being blown up with the pixel art.

local config = require("framework.config")
local content = require("content")
local runModule = require("run")

local hud = {}

local function palette(name)
  local c = config.values.palette[name]
  return c[1], c[2], c[3], c[4] or 1
end

local function setColor(name, alpha)
  local r, g, b, a = palette(name)
  love.graphics.setColor(r, g, b, (a or 1) * (alpha or 1))
end

local function bar(x, y, w, h, t, fill, back)
  local g = love.graphics
  g.setColor(back or { 0.10, 0.10, 0.14, 0.9 })
  g.rectangle("fill", x, y, w, h)
  g.setColor(fill)
  g.rectangle("fill", x, y, w * math.max(0, math.min(1, t)), h)
  g.setColor(0, 0, 0, 0.45)
  g.rectangle("line", x + 0.5, y + 0.5, w - 1, h - 1)
end

local function formatTime(seconds)
  local m = math.floor(seconds / 60)
  local s = math.floor(seconds % 60)
  return string.format("%d:%02d", m, s)
end

hud.formatTime = formatTime

-- -------------------------------------------------------------------- HUD

function hud.draw(r, scale, ox, oy)
  local g = love.graphics
  local c = config.values
  local viewW = c.render.width * scale
  local x0, y0 = ox, oy
  local pad = 8

  -- Health, top-left.
  local p = r.player
  local barW = math.min(220, viewW * 0.3)
  bar(x0 + pad, y0 + pad, barW, 10,
    p.hp / math.max(1, p.maxHp), { palette("enemy") })
  g.setColor(1, 1, 1, 0.95)
  g.print(string.format("%d / %d", math.ceil(p.hp), math.ceil(p.maxHp)),
    x0 + pad + 4, y0 + pad - 1)

  -- Level bar, under health.
  bar(x0 + pad, y0 + pad + 13, barW, 6,
    p.lp / math.max(1, p.lpNext), { palette("accent") })
  g.setColor(1, 1, 1, 0.8)
  g.print("LV " .. p.level, x0 + pad + 4, y0 + pad + 11)

  -- Timer and wave, top-centre.
  local remaining = math.max(0, r:durationSeconds() - r.time)
  local timeText = formatTime(remaining)
  local waveText = string.format("WAVE %d / %d", r.wave, r:waveCount())
  g.setColor(1, 1, 1, 0.95)
  g.printf(timeText, x0, y0 + pad, viewW, "center")
  g.setColor(1, 1, 1, 0.55)
  g.printf(waveText, x0, y0 + pad + 14, viewW, "center")

  -- Wave progress sliver under the timer.
  local waveT = r.waveTime / math.max(0.001, c.run.waveSeconds)
  bar(x0 + viewW / 2 - 60, y0 + pad + 28, 120, 3, waveT, { palette("player") })

  -- Gold, top-right.
  g.setColor(0.98, 0.82, 0.35, 1)
  g.printf(string.format("%d G", math.floor(p.gold)), x0, y0 + pad, viewW - pad, "right")

  -- Weapons, bottom-left.
  local wy = y0 + c.render.height * scale - pad - 14
  for i = #p.weapons, 1, -1 do
    local w = p.weapons[i]
    g.setColor(1, 1, 1, 0.85)
    g.print(string.format("%s  Lv%d", w.def.name, w.level), x0 + pad, wy)
    wy = wy - 14
  end

  -- Enemy count, bottom-right. Cheap situational awareness while tuning.
  g.setColor(1, 1, 1, 0.4)
  g.printf(string.format("%d alive", #r.enemies),
    x0, y0 + c.render.height * scale - pad - 14, viewW - pad, "right")

  if r.state == runModule.STATE.SHOP then
    hud.drawShop(r, scale, ox, oy)
  elseif r.state == runModule.STATE.DEAD or r.state == runModule.STATE.WON then
    hud.drawSummary(r, scale, ox, oy)
  end
end

-- ------------------------------------------------------------------- shop

function hud.drawShop(r, scale, ox, oy)
  local g = love.graphics
  local c = config.values
  local viewW = c.render.width * scale
  local viewH = c.render.height * scale
  local shop = r.shop
  if not shop then return end

  g.setColor(0, 0, 0, 0.82)
  g.rectangle("fill", ox, oy, viewW, viewH)

  local panelW = math.min(480, viewW - 40)
  local panelX = ox + (viewW - panelW) / 2
  local y = oy + 30

  setColor("accent")
  g.printf("SHOP", panelX, y, panelW, "center")
  g.setColor(1, 1, 1, 0.6)
  g.printf(string.format("after wave %d   |   visit %d", r.wave - 1, r.shopVisits),
    panelX, y + 16, panelW, "center")
  g.setColor(0.98, 0.82, 0.35, 1)
  g.printf(string.format("%d gold", math.floor(r.player.gold)),
    panelX, y + 32, panelW, "center")
  y = y + 58

  for i, item in ipairs(shop.items) do
    local rowH = 34
    local selected = (shop.cursor == i)
    local affordable = r.player.gold >= item.cost and not item.bought

    g.setColor(selected and 0.20 or 0.12, selected and 0.20 or 0.12,
      selected and 0.28 or 0.16, 0.95)
    g.rectangle("fill", panelX, y, panelW, rowH)
    if selected then
      setColor("accent", 0.9)
      g.rectangle("line", panelX + 0.5, y + 0.5, panelW - 1, rowH - 1)
    end

    local label = string.format("%d. %s", i, item.name)
    if item.bought then
      g.setColor(0.45, 0.45, 0.5, 1)
      label = label .. "  (bought)"
    elseif affordable then
      g.setColor(1, 1, 1, 0.95)
    else
      g.setColor(0.6, 0.4, 0.4, 1)
    end
    g.print(label, panelX + 10, y + 5)
    g.setColor(1, 1, 1, 0.45)
    g.print(item.blurb or "", panelX + 10, y + 19)

    g.setColor(0.98, 0.82, 0.35, item.bought and 0.35 or 1)
    g.printf(string.format("%d G", item.cost), panelX, y + 10, panelW - 10, "right")

    y = y + rowH + 4
  end

  y = y + 8
  g.setColor(1, 1, 1, 0.7)
  g.printf(string.format("R  reroll (%d G)        SPACE / A  buy        ENTER  next wave",
    shop.rerollCost), panelX, y, panelW, "center")
  g.setColor(1, 1, 1, 0.35)
  g.printf("1-" .. #shop.items .. " to buy directly, arrows or stick to move",
    panelX, y + 15, panelW, "center")
end

-- ---------------------------------------------------------------- summary

function hud.drawSummary(r, scale, ox, oy)
  local g = love.graphics
  local c = config.values
  local viewW = c.render.width * scale
  local viewH = c.render.height * scale
  local s = r.summaryCache
  if not s then
    s = r:summary()
    r.summaryCache = s
  end

  g.setColor(0, 0, 0, 0.88)
  g.rectangle("fill", ox, oy, viewW, viewH)

  local panelW = math.min(560, viewW - 30)
  local panelX = ox + (viewW - panelW) / 2
  local colW = panelW / 2 - 10
  local y = oy + 22

  if s.outcome == runModule.STATE.WON then
    setColor("accent")
    g.printf("YOU SURVIVED", panelX, y, panelW, "center")
  else
    setColor("enemy")
    g.printf("YOU DIED", panelX, y, panelW, "center")
    g.setColor(1, 1, 1, 0.75)
    g.printf("killed by " .. tostring(s.killedBy), panelX, y + 16, panelW, "center")
  end
  y = y + 40

  -- Left column: run stats.
  local lx = panelX
  local function stat(label, value)
    g.setColor(1, 1, 1, 0.5)
    g.print(label, lx, y)
    g.setColor(1, 1, 1, 0.95)
    g.printf(value, lx, y, colW, "right")
    y = y + 13
  end

  setColor("accent")
  g.print("RUN", lx, y) ; y = y + 15
  stat("survived", formatTime(s.time))
  stat("wave reached", string.format("%d / %d", s.wave, r:waveCount()))
  stat("level", tostring(s.level))
  stat("kills", string.format("%d (%d elite)", s.kills, s.elites))
  stat("damage dealt", string.format("%d", s.damageDealt))
  stat("damage taken", string.format("%d", s.damageTaken))
  stat("overall dps", string.format("%.1f", s.dps))
  stat("LP collected", string.format("%d", s.lpCollected))
  stat("gold earned", string.format("%d (spent %d)", s.goldEarned, s.shopSpend))
  stat("peak enemies", tostring(s.peakAlive))

  -- Right column: the build and what it did.
  local rx = panelX + panelW / 2 + 10
  local ry = oy + 62
  setColor("accent")
  g.print("BUILD", rx, ry) ; ry = ry + 15

  for _, w in ipairs(s.weapons) do
    g.setColor(1, 1, 1, 0.95)
    g.print(string.format("%s Lv%d", w.name, w.level), rx, ry)
    g.setColor(1, 1, 1, 0.55)
    g.printf(string.format("%d dmg", math.floor(w.damage)), rx, ry, colW, "right")
    ry = ry + 12
    -- A share bar makes the carry weapon obvious at a glance.
    bar(rx, ry, colW, 3, w.share, { palette("accent") })
    g.setColor(1, 1, 1, 0.35)
    g.print(string.format("%.0f%%  %.1f dps  %d kills", w.share * 100, w.dps, w.kills),
      rx, ry + 5)
    ry = ry + 20
  end

  ry = ry + 6
  setColor("accent")
  g.print("WHAT HURT YOU", rx, ry) ; ry = ry + 15
  for i, threat in ipairs(s.threats) do
    if i > 5 then break end
    g.setColor(1, 1, 1, 0.8)
    g.print(threat.name, rx, ry)
    g.setColor(1, 1, 1, 0.5)
    g.printf(string.format("%d", math.floor(threat.damage)), rx, ry, colW, "right")
    ry = ry + 12
  end

  g.setColor(1, 1, 1, 0.6)
  g.printf("R  run again        F1  editor", panelX, oy + viewH - 24, panelW, "center")
end

return hud
