-- World rendering: camera, sprites and the debug overlays.
--
-- Sprites are drawn from primitives rather than image files so the whole game
-- runs with no assets. Everything uses one of three foreground colours on the
-- dark background, per the art direction.

local config = require("framework.config")
local dd = require("framework.debugdraw")

local render = {}

render.camera = { x = 0, y = 0, shakeX = 0, shakeY = 0 }

local function palette(name)
  return config.values.palette[name]
end

--- Blend a colour toward white, for hit flashes.
local function flash(colour, amount)
  if amount <= 0 then return colour[1], colour[2], colour[3], colour[4] or 1 end
  local t = math.min(1, amount)
  return colour[1] + (1 - colour[1]) * t,
         colour[2] + (1 - colour[2]) * t,
         colour[3] + (1 - colour[3]) * t,
         colour[4] or 1
end

function render.updateCamera(r, dt)
  local c = config.values
  local viewW, viewH = c.render.width, c.render.height
  local targetX = r.player.x - viewW / 2
  local targetY = r.player.y - viewH / 2

  -- Clamp so the camera never shows outside the arena, unless the arena is
  -- smaller than the view, in which case centre it.
  if r.arenaW > viewW then
    targetX = math.max(0, math.min(r.arenaW - viewW, targetX))
  else
    targetX = (r.arenaW - viewW) / 2
  end
  if r.arenaH > viewH then
    targetY = math.max(0, math.min(r.arenaH - viewH, targetY))
  else
    targetY = (r.arenaH - viewH) / 2
  end

  local lerp = math.min(1, c.run.cameraLerp * dt)
  render.camera.x = render.camera.x + (targetX - render.camera.x) * lerp
  render.camera.y = render.camera.y + (targetY - render.camera.y) * lerp

  local shake = r.shakeAmount * c.render.screenShake
  if shake > 0.01 then
    render.camera.shakeX = (love.math.random() - 0.5) * shake
    render.camera.shakeY = (love.math.random() - 0.5) * shake
  else
    render.camera.shakeX, render.camera.shakeY = 0, 0
  end
end

function render.snapCamera(r)
  local c = config.values
  render.camera.x = r.player.x - c.render.width / 2
  render.camera.y = r.player.y - c.render.height / 2
end

-- ----------------------------------------------------------------- sprites

local function drawShape(shape, x, y, radius)
  local g = love.graphics
  if shape == "dot" then
    g.rectangle("fill", x - radius, y - radius, radius * 2, radius * 2)
  elseif shape == "block" then
    g.rectangle("fill", x - radius, y - radius, radius * 2, radius * 2)
    g.setColor(0, 0, 0, 0.35)
    g.rectangle("fill", x - radius + 1, y - radius + 1, radius * 2 - 2, radius * 2 - 2)
  elseif shape == "diamond" then
    g.polygon("fill", x, y - radius, x + radius, y, x, y + radius, x - radius, y)
  elseif shape == "arrow" then
    g.polygon("fill", x, y - radius, x + radius, y + radius, x - radius, y + radius)
  elseif shape == "ring" then
    g.circle("line", x, y, radius)
    g.circle("line", x, y, radius * 0.55)
  else -- blob
    g.circle("fill", x, y, radius)
  end
end

-- --------------------------------------------------------------------- draw

function render.draw(r)
  local g = love.graphics
  local c = config.values
  local cam = render.camera

  g.push()
  g.translate(-math.floor(cam.x + cam.shakeX), -math.floor(cam.y + cam.shakeY))

  render.drawBackground(r)

  -- Pickups first, so they sit under the things that matter.
  local accent = palette("accent")
  for _, pk in ipairs(r.pickups) do
    if pk.kind == "lp" then
      g.setColor(accent[1], accent[2], accent[3], 1)
      g.rectangle("fill", pk.x - 1, pk.y - 1, 2, 2)
    elseif pk.kind == "gold" then
      g.setColor(0.98, 0.82, 0.35, 1)
      g.rectangle("fill", pk.x - 1.5, pk.y - 1.5, 3, 3)
    elseif pk.kind == "hp" then
      local col = palette("enemy")
      g.setColor(col[1], col[2], col[3], 1)
      g.rectangle("fill", pk.x - 2, pk.y - 1, 4, 2)
      g.rectangle("fill", pk.x - 1, pk.y - 2, 2, 4)
    elseif pk.kind == "weapon" then
      local col = palette("player")
      g.setColor(col[1], col[2], col[3], 1)
      g.circle("line", pk.x, pk.y, 4 + math.sin(r.time * 6) * 0.6)
    end
    dd.cross("pickups", pk.x, pk.y, 5)
  end

  -- Enemies.
  for _, e in ipairs(r.enemies) do
    local base = palette(e.def.palette or "enemy")
    g.setColor(flash(base, e.hitFlash > 0 and 0.85 or 0))
    if e.elite then
      g.setColor(flash(base, 0.35 + (e.hitFlash > 0 and 0.5 or 0)))
    end
    if e.behaviour == "charge" and e.phase == "windup" then
      -- Telegraph the charge by blinking.
      local blink = math.floor(r.time * 14) % 2 == 0
      g.setColor(flash(base, blink and 0.9 or 0.1))
    end
    drawShape(e.def.shape, e.x, e.y, e.radius)

    dd.circle("colliders", e.x, e.y, e.radius)
    if dd.on.enemyPaths then
      dd.line("enemyPaths", e.x, e.y, e.x + e.vx * 0.25, e.y + e.vy * 0.25)
    end
    if dd.on.enemyState then
      dd.text("enemyState",
        string.format("%d/%d %s", math.ceil(e.hp), math.ceil(e.maxHp), e.phase or ""),
        e.x - 10, e.y - e.radius - 9)
    end
  end

  -- Enemy shots.
  local enemyCol = palette("enemy")
  g.setColor(enemyCol[1], enemyCol[2], enemyCol[3], 1)
  for _, s in ipairs(r.enemyShots) do
    g.circle("fill", s.x, s.y, s.radius)
    dd.circle("colliders", s.x, s.y, s.radius)
  end

  -- Player projectiles.
  local playerCol = palette("player")
  g.setColor(playerCol[1], playerCol[2], playerCol[3], 1)
  for _, pr in ipairs(r.projectiles) do
    g.circle("fill", pr.x, pr.y, pr.radius)
    dd.circle("colliders", pr.x, pr.y, pr.radius)
  end

  -- Orbit blades and aura rings.
  for _, w in ipairs(r.player.weapons) do
    if w.def.kind == "orbit" and w.blades then
      g.setColor(playerCol[1], playerCol[2], playerCol[3], 1)
      for _, blade in ipairs(w.blades) do
        g.circle("fill", blade.x, blade.y, blade.r)
        dd.circle("hitAreas", blade.x, blade.y, blade.r)
      end
    elseif w.def.kind == "aura" then
      local radius = (require("run").weaponValue(w.id, "radius", w.level) or 0)
        * r:playerStat("areaMult")
      g.setColor(accent[1], accent[2], accent[3], 0.13)
      g.circle("fill", r.player.x, r.player.y, radius)
      g.setColor(accent[1], accent[2], accent[3], 0.35)
      g.circle("line", r.player.x, r.player.y, radius)
      dd.circle("hitAreas", r.player.x, r.player.y, radius)
    end
    if dd.on.playerAim and w.target and not w.target.dead then
      dd.line("playerAim", r.player.x, r.player.y, w.target.x, w.target.y)
    end
  end

  -- Player, blinking while invulnerable.
  local p = r.player
  local visible = p.iframe <= 0 or math.floor(r.time * 20) % 2 == 0
  if visible then
    g.setColor(flash(playerCol, p.hitFlash > 0 and 0.9 or 0))
    g.circle("fill", p.x, p.y, c.player.radius)
    -- A small nub showing facing, so movement reads at 384x216.
    g.rectangle("fill", p.x + p.facingX * c.player.radius - 1,
      p.y + p.facingY * c.player.radius - 1, 2, 2)
  end

  dd.circle("colliders", p.x, p.y, c.player.radius)
  dd.circle("pickupRange", p.x, p.y, r:playerStat("pickupRange"))

  if dd.on.spawnRing then
    local margin = c.wave.spawnMargin
    dd.rect("spawnRing",
      cam.x - margin, cam.y - margin,
      c.render.width + margin * 2, c.render.height + margin * 2)
  end
  dd.rect("arenaBounds", 0, 0, r.arenaW, r.arenaH)

  if dd.on.grid then
    local cell = 16
    local x0 = math.floor(cam.x / cell) * cell
    local y0 = math.floor(cam.y / cell) * cell
    for x = x0, cam.x + c.render.width, cell do
      dd.line("grid", x, cam.y, x, cam.y + c.render.height, 0.5)
    end
    for y = y0, cam.y + c.render.height, cell do
      dd.line("grid", cam.x, y, cam.x + c.render.width, y, 0.5)
    end
  end

  dd.finish()
  g.pop()
  g.setColor(1, 1, 1, 1)
end

function render.drawBackground(r)
  local c = config.values
  if not c.render.showGrid then return end
  local g = love.graphics
  local cam = render.camera
  local bg = palette("background")
  -- A faint grid, two steps up from the background, to give motion a reference.
  g.setColor(bg[1] + 0.045, bg[2] + 0.05, bg[3] + 0.07, 1)
  local cell = c.render.gridSize
  local x0 = math.floor(cam.x / cell) * cell
  local y0 = math.floor(cam.y / cell) * cell
  for x = x0, cam.x + c.render.width + cell, cell do
    g.rectangle("fill", x, cam.y, 1, c.render.height)
  end
  for y = y0, cam.y + c.render.height + cell, cell do
    g.rectangle("fill", cam.x, y, c.render.width, 1)
  end
end

return render
