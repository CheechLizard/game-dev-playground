-- HUD, shop screen and the end-of-run summary.
--
-- These draw in screen space, on top of the scaled canvas, so text stays crisp
-- at any window size rather than being blown up with the pixel art.
--
-- No screen here explains its own controls. The keys are in the README and on
-- the editor's Help page; putting them on the play surface means reading the
-- same sentence every run forever.

local config = require("framework.config")
local content = require("content")
local fonts = require("framework.fonts")
local render = require("render")
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

--- Columns the shop grid uses for a given item count. Shared with input
-- handling in game.lua, so the cursor moves the way the grid looks.
function hud.shopColumns(count)
  if count <= 3 then return count end
  if count <= 6 then return 3 end
  return 4
end

-- -------------------------------------------------------------------- HUD

function hud.draw(r, scale, ox, oy)
  local g = love.graphics
  local c = config.values
  local viewW = c.render.width * scale
  local viewH = c.render.height * scale
  local x0, y0 = ox, oy
  local pad = 12

  local small = fonts.role("small")
  local heading = fonts.role("heading")
  local lineH = small:getHeight()

  -- Health and level, top-left.
  local p = r.player
  local barW = math.min(260, viewW * 0.3)
  local barH = math.max(10, heading:getHeight() * 0.7)

  bar(x0 + pad, y0 + pad, barW, barH,
    p.hp / math.max(1, p.maxHp), { palette("enemy") })
  g.setFont(small)
  g.setColor(1, 1, 1, 0.95)
  g.print(string.format("%d / %d", math.ceil(p.hp), math.ceil(p.maxHp)),
    x0 + pad + 5, y0 + pad + (barH - lineH) / 2)

  local lvlH = math.max(lineH + 2, barH * 0.8)
  local lvlY = y0 + pad + barH + 3
  bar(x0 + pad, lvlY, barW, lvlH,
    p.lp / math.max(1, p.lpNext), { palette("accent") })
  g.setColor(1, 1, 1, 0.9)
  g.print("LV " .. p.level, x0 + pad + 5, lvlY + (lvlH - lineH) / 2)

  -- Timer and wave, top-centre.
  local remaining = math.max(0, r:durationSeconds() - r.time)
  g.setFont(heading)
  g.setColor(1, 1, 1, 0.95)
  g.printf(formatTime(remaining), x0, y0 + pad, viewW, "center")
  g.setFont(small)
  g.setColor(1, 1, 1, 0.6)
  g.printf(string.format("WAVE %d / %d", r.wave, r:waveCount()),
    x0, y0 + pad + heading:getHeight() + 3, viewW, "center")

  local waveT = r.waveTime / math.max(0.001, c.run.waveSeconds)
  bar(x0 + viewW / 2 - 70, y0 + pad + heading:getHeight() + lineH + 8, 140, 3,
    waveT, { palette("player") })

  -- Gold, top-right.
  g.setFont(heading)
  g.setColor(0.98, 0.82, 0.35, 1)
  g.printf(string.format("%d G", math.floor(p.gold)), x0, y0 + pad, viewW - pad, "right")

  -- Build, bottom-left: weapon icons with levels, then passives as a tally.
  local iconSize = math.max(14, heading:getHeight())
  local wy = y0 + viewH - pad - iconSize
  g.setFont(small)
  for i = #p.weapons, 1, -1 do
    local w = p.weapons[i]
    render.drawWeaponIcon(w.id, x0 + pad + iconSize / 2, wy + iconSize / 2, iconSize)
    g.setColor(1, 1, 1, 0.9)
    g.print(string.format("%s  Lv%d", w.def.name, w.level),
      x0 + pad + iconSize + 6, wy + (iconSize - lineH) / 2)
    wy = wy - iconSize - 3
  end

  local owned = {}
  for _, def in ipairs(content.passives) do
    local n = p.passives[def.id]
    if n and n > 0 then owned[#owned + 1] = def.name .. " x" .. n end
  end
  if #owned > 0 then
    g.setColor(1, 1, 1, 0.4)
    g.print(table.concat(owned, "   "), x0 + pad, wy + iconSize - lineH)
  end

  -- Enemy count, bottom-right.
  g.setColor(1, 1, 1, 0.4)
  g.printf(string.format("%d alive", #r.enemies),
    x0, y0 + viewH - pad - lineH, viewW - pad, "right")

  if r.state == runModule.STATE.SHOP then
    hud.drawShop(r, scale, ox, oy)
  elseif r.state == runModule.STATE.DEAD or r.state == runModule.STATE.WON then
    hud.drawSummary(r, scale, ox, oy)
  end
end

--- Drawn over everything when the simulation is frozen. State, not a tip.
function hud.drawPaused(scale, ox, oy)
  local g = love.graphics
  local c = config.values
  local viewW, viewH = c.render.width * scale, c.render.height * scale
  g.setColor(0, 0, 0, 0.45)
  g.rectangle("fill", ox, oy, viewW, viewH)
  local title = fonts.role("title")
  g.setFont(title)
  setColor("player", 0.95)
  g.printf("PAUSED", ox, oy + viewH / 2 - title:getHeight() / 2, viewW, "center")
  g.setColor(1, 1, 1, 1)
end

-- ------------------------------------------------------------------- shop

--- One shop cell. Returns nothing; purely presentational.
local function drawShopCell(item, x, y, w, h, selected, gold)
  local g = love.graphics
  local small = fonts.role("small")
  local body = fonts.role("body")
  local affordable = gold >= item.cost and not item.bought

  g.setColor(selected and 0.20 or 0.11, selected and 0.21 or 0.11,
    selected and 0.30 or 0.15, 0.96)
  g.rectangle("fill", x, y, w, h)
  if selected then
    setColor("accent", 0.95)
    g.rectangle("line", x + 0.5, y + 0.5, w - 1, h - 1)
  else
    g.setColor(0.22, 0.22, 0.30, 1)
    g.rectangle("line", x + 0.5, y + 0.5, w - 1, h - 1)
  end

  -- Art. Weapons and upgrades get their icon; passives and heals get a mark
  -- that at least distinguishes them from each other.
  local iconSize = math.min(w * 0.42, h * 0.40)
  local cx, cy = x + w / 2, y + h * 0.33
  local tint = item.bought and { 0.4, 0.4, 0.45, 1 }
    or (affordable and { palette("player") } or { 0.55, 0.38, 0.38, 1 })

  if item.weaponId then
    render.drawWeaponIcon(item.weaponId, cx, cy, iconSize, tint)
  elseif item.kind == "heal" then
    g.setColor(tint)
    local s = iconSize * 0.38
    g.rectangle("fill", cx - s, cy - s * 0.34, s * 2, s * 0.68)
    g.rectangle("fill", cx - s * 0.34, cy - s, s * 0.68, s * 2)
  elseif item.passiveId then
    render.drawPassiveIcon(item.passiveId, cx, cy, iconSize, tint)
  else
    g.setColor(tint)
    g.circle("line", cx, cy, iconSize * 0.36)
    g.circle("fill", cx, cy, iconSize * 0.14)
  end

  -- Name, then cost, then the blurb in whatever room is left.
  g.setFont(small)
  if item.bought then
    g.setColor(0.45, 0.45, 0.5, 1)
  elseif affordable then
    g.setColor(1, 1, 1, 0.95)
  else
    g.setColor(0.65, 0.45, 0.45, 1)
  end
  local nameY = y + h * 0.56
  g.printf(item.name, x + 4, nameY, w - 8, "center")

  local costY = nameY + small:getHeight() + 3
  g.setColor(0.98, 0.82, 0.35, item.bought and 0.35 or 1)
  g.printf(item.bought and "BOUGHT" or (item.cost .. " G"), x + 4, costY, w - 8, "center")

  local blurbY = costY + small:getHeight() + 3
  if blurbY + small:getHeight() <= y + h - 3 then
    g.setColor(1, 1, 1, 0.35)
    g.printf(item.blurb or "", x + 5, blurbY, w - 10, "center")
  end
  g.setFont(body)
end

function hud.drawShop(r, scale, ox, oy)
  local g = love.graphics
  local c = config.values
  local viewW = c.render.width * scale
  local viewH = c.render.height * scale
  local shop = r.shop
  if not shop then return end

  g.setColor(0, 0, 0, 0.86)
  g.rectangle("fill", ox, oy, viewW, viewH)

  local title = fonts.role("title")
  local small = fonts.role("small")

  local pad = math.max(16, viewW * 0.03)
  local y = oy + pad

  g.setFont(title)
  setColor("accent")
  g.printf("SHOP", ox, y, viewW, "center")
  y = y + title:getHeight() + 6

  g.setFont(small)
  g.setColor(0.98, 0.82, 0.35, 1)
  g.printf(string.format("%d GOLD", math.floor(r.player.gold)), ox, y, viewW, "center")
  y = y + small:getHeight() + 4
  g.setColor(1, 1, 1, 0.45)
  g.printf(string.format("after wave %d   ·   visit %d   ·   reroll %d G",
    r.wave - 1, r.shopVisits, shop.rerollCost), ox, y, viewW, "center")
  y = y + small:getHeight() + pad * 0.8

  -- Grid. Cells share the space left under the header.
  local count = #shop.items
  local cols = hud.shopColumns(count)
  local rows = math.ceil(count / cols)
  local gap = math.max(6, viewW * 0.008)
  local gridW = viewW - pad * 2
  local cellW = (gridW - gap * (cols - 1)) / cols
  local availableH = (oy + viewH - pad) - y
  local cellH = math.min((availableH - gap * (rows - 1)) / rows, cellW * 1.15)
  local gridH = cellH * rows + gap * (rows - 1)
  local gridY = y + math.max(0, (availableH - gridH) / 2)

  for i, item in ipairs(shop.items) do
    local col = (i - 1) % cols
    local row = math.floor((i - 1) / cols)
    -- The last row is centred when it is short, so the grid stays balanced.
    local inRow = math.min(cols, count - row * cols)
    local rowW = cellW * inRow + gap * (inRow - 1)
    local rowX = ox + (viewW - rowW) / 2
    drawShopCell(item, rowX + col * (cellW + gap), gridY + row * (cellH + gap),
      cellW, cellH, shop.cursor == i, r.player.gold)
  end
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

  g.setColor(0, 0, 0, 0.9)
  g.rectangle("fill", ox, oy, viewW, viewH)

  local title = fonts.role("title")
  local heading = fonts.role("heading")
  local small = fonts.role("small")
  local lineH = small:getHeight() + 3

  local pad = math.max(20, viewW * 0.04)
  local panelW = viewW - pad * 2
  local panelX = ox + pad
  local colW = panelW / 2 - pad * 0.5
  local y = oy + pad

  g.setFont(title)
  if s.outcome == runModule.STATE.WON then
    setColor("accent")
    g.printf("YOU SURVIVED", panelX, y, panelW, "center")
    y = y + title:getHeight() + 6
  else
    setColor("enemy")
    g.printf("YOU DIED", panelX, y, panelW, "center")
    y = y + title:getHeight() + 6
    g.setFont(small)
    g.setColor(1, 1, 1, 0.7)
    g.printf("killed by " .. tostring(s.killedBy), panelX, y, panelW, "center")
  end
  y = y + heading:getHeight() + pad * 0.5

  local topY = y

  -- Left column: run stats.
  local lx = panelX
  g.setFont(heading)
  setColor("accent")
  g.print("RUN", lx, y)
  y = y + heading:getHeight() + 6
  g.setFont(small)

  local function stat(label, value)
    g.setColor(1, 1, 1, 0.5)
    g.print(label, lx, y)
    g.setColor(1, 1, 1, 0.95)
    g.printf(value, lx, y, colW, "right")
    y = y + lineH
  end

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
  local rx = panelX + panelW / 2 + pad * 0.5
  local ry = topY
  g.setFont(heading)
  setColor("accent")
  g.print("BUILD", rx, ry)
  ry = ry + heading:getHeight() + 6

  local iconSize = small:getHeight() * 1.6
  g.setFont(small)
  for _, w in ipairs(s.weapons) do
    render.drawWeaponIcon(w.id or "", rx + iconSize / 2, ry + iconSize / 2, iconSize)
    g.setColor(1, 1, 1, 0.95)
    g.print(string.format("%s Lv%d", w.name, w.level), rx + iconSize + 6, ry)
    g.setColor(1, 1, 1, 0.55)
    g.printf(string.format("%d dmg", math.floor(w.damage)), rx, ry, colW, "right")
    bar(rx + iconSize + 6, ry + small:getHeight() + 2, colW - iconSize - 6, 3,
      w.share, { palette("accent") })
    g.setColor(1, 1, 1, 0.35)
    g.print(string.format("%.0f%%  %.1f dps  %d kills", w.share * 100, w.dps, w.kills),
      rx + iconSize + 6, ry + small:getHeight() + 6)
    ry = ry + iconSize + small:getHeight() + 6
  end

  ry = ry + 8
  g.setFont(heading)
  setColor("accent")
  g.print("WHAT HURT YOU", rx, ry)
  ry = ry + heading:getHeight() + 6
  g.setFont(small)
  for i, threat in ipairs(s.threats) do
    if i > 5 then break end
    g.setColor(1, 1, 1, 0.8)
    g.print(threat.name, rx, ry)
    g.setColor(1, 1, 1, 0.5)
    g.printf(string.format("%d", math.floor(threat.damage)), rx, ry, colW, "right")
    ry = ry + lineH
  end
end

return hud
