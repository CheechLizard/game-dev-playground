-- World rendering: camera, sprites and the debug overlays.
--
-- Sprites are drawn from primitives rather than image files so the whole game
-- runs with no assets. Everything uses one of three foreground colours on the
-- dark background, per the art direction.

local config = require("framework.config")
local dd = require("framework.debugdraw")

local render = {}

render.camera = { x = 0, y = 0, shakeX = 0, shakeY = 0 }

-- Set by the game to draw beneath the entities; nil in an ordinary run.
render.underlay = nil

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

--- Draw an enemy sprite. Exposed because the zoo draws the same shapes the
-- arena does; there must be one definition of what a Brute looks like.
function render.drawShape(shape, x, y, radius)
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

-- ------------------------------------------------------------ weapon icons
-- Placeholder art, drawn from primitives to match the art direction: no image
-- files anywhere in the project. Each icon reads as its firing pattern, so the
-- shop grid is scannable without reading the names.

local ICONS = {}

function ICONS.blaster(g, s)
  -- A barrel with a single shot leaving it.
  g.rectangle("fill", -s * 0.7, -s * 0.16, s * 0.9, s * 0.32)
  g.rectangle("fill", s * 0.45, -s * 0.1, s * 0.2, s * 0.2)
  g.circle("fill", s * 0.82, 0, s * 0.13)
end

function ICONS.scatter(g, s)
  -- A cone of pellets.
  g.rectangle("fill", -s * 0.75, -s * 0.18, s * 0.6, s * 0.36)
  for i = -1, 1 do
    local a = i * 0.42
    for step = 1, 3 do
      local d = s * (0.25 + step * 0.22)
      g.circle("fill", math.cos(a) * d, math.sin(a) * d, s * 0.09)
    end
  end
end

function ICONS.lance(g, s)
  -- One long piercing bar with a head, skewering two marks.
  g.rectangle("fill", -s * 0.85, -s * 0.09, s * 1.4, s * 0.18)
  g.polygon("fill", s * 0.55, -s * 0.28, s * 0.95, 0, s * 0.55, s * 0.28)
  g.setColor(1, 1, 1, 0.35)
  g.circle("line", -s * 0.2, 0, s * 0.26)
  g.circle("line", s * 0.25, 0, s * 0.26)
end

function ICONS.orbiter(g, s)
  -- Blades on an orbit ring.
  g.setColor(1, 1, 1, 0.35)
  g.circle("line", 0, 0, s * 0.62)
  g.setColor(1, 1, 1, 1)
  g.circle("fill", 0, 0, s * 0.16)
  for i = 0, 2 do
    local a = i * (math.pi * 2 / 3)
    g.circle("fill", math.cos(a) * s * 0.62, math.sin(a) * s * 0.62, s * 0.17)
  end
end

function ICONS.aura(g, s)
  -- Concentric pulses around the wielder.
  g.circle("fill", 0, 0, s * 0.17)
  for i = 1, 3 do
    g.setColor(1, 1, 1, 0.45 - i * 0.1)
    g.circle("line", 0, 0, s * (0.24 + i * 0.2))
  end
end

-- Passive icons. Same rules as the weapon icons: primitives only, and each
-- one has to be tellable from the others at shop-cell size, which a shared
-- generic mark is not.

local PASSIVE_ICONS = {}

function PASSIVE_ICONS.power(g, s)        -- a cell with its terminal
  g.rectangle("fill", -s * 0.34, -s * 0.62, s * 0.68, s * 1.24)
  g.rectangle("fill", -s * 0.14, -s * 0.8, s * 0.28, s * 0.2)
  g.setColor(0, 0, 0, 0.5)
  g.rectangle("fill", -s * 0.18, -s * 0.34, s * 0.36, s * 0.5)
end

function PASSIVE_ICONS.coolant(g, s)      -- a snowflake
  for i = 0, 2 do
    local a = i * (math.pi / 3)
    local dx, dy = math.cos(a) * s * 0.72, math.sin(a) * s * 0.72
    g.setLineWidth(math.max(1, s * 0.13))
    g.line(-dx, -dy, dx, dy)
  end
  g.setLineWidth(1)
end

function PASSIVE_ICONS.boots(g, s)        -- speed chevrons
  for i = 0, 1 do
    local y = -s * 0.35 + i * s * 0.55
    g.polygon("fill", -s * 0.6, y + s * 0.26, 0, y - s * 0.26, s * 0.6, y + s * 0.26,
      s * 0.6, y + s * 0.02, 0, y - s * 0.5, -s * 0.6, y + s * 0.02)
  end
end

function PASSIVE_ICONS.plating(g, s)      -- a shield
  g.polygon("fill", 0, -s * 0.75, s * 0.62, -s * 0.42, s * 0.62, s * 0.2,
    0, s * 0.78, -s * 0.62, s * 0.2, -s * 0.62, -s * 0.42)
  g.setColor(0, 0, 0, 0.45)
  g.polygon("fill", 0, -s * 0.46, s * 0.36, -s * 0.26, s * 0.36, s * 0.14,
    0, s * 0.46, -s * 0.36, s * 0.14, -s * 0.36, -s * 0.26)
end

function PASSIVE_ICONS.resonator(g, s)    -- widening pulses
  g.circle("fill", -s * 0.55, 0, s * 0.16)
  for i = 1, 3 do
    g.setColor(1, 1, 1, 0.8 - i * 0.18)
    g.arc("line", "open", -s * 0.55, 0, s * (0.24 + i * 0.26), -0.9, 0.9)
  end
end

function PASSIVE_ICONS.magnet(g, s)       -- a horseshoe
  g.setLineWidth(math.max(2, s * 0.26))
  g.arc("line", "open", 0, s * 0.08, s * 0.52, math.pi, math.pi * 2)
  g.setLineWidth(1)
  g.rectangle("fill", -s * 0.65, s * 0.04, s * 0.26, s * 0.5)
  g.rectangle("fill", s * 0.39, s * 0.04, s * 0.26, s * 0.5)
end

function PASSIVE_ICONS.scope(g, s)        -- a crosshair
  g.circle("line", 0, 0, s * 0.52)
  g.circle("fill", 0, 0, s * 0.11)
  for i = 0, 3 do
    local a = i * (math.pi / 2)
    g.line(math.cos(a) * s * 0.38, math.sin(a) * s * 0.38,
           math.cos(a) * s * 0.85, math.sin(a) * s * 0.85)
  end
end

function PASSIVE_ICONS.ledger(g, s)       -- a stack of coins
  for i = 0, 2 do
    local y = s * 0.42 - i * s * 0.36
    g.ellipse("fill", 0, y, s * 0.6, s * 0.2)
    g.setColor(0, 0, 0, 0.35)
    g.ellipse("line", 0, y, s * 0.6, s * 0.2)
    g.setColor(1, 1, 1, 1)
  end
end

--- Draw a passive's placeholder icon. Falls back to a ringed dot so a newly
-- added passive is visible before it has art of its own.
function render.drawPassiveIcon(id, x, y, size, colour)
  local g = love.graphics
  local col = colour or palette("accent")
  g.push()
  g.translate(x, y)
  g.setColor(col[1], col[2], col[3], col[4] or 1)
  local icon = PASSIVE_ICONS[id]
  if icon then
    icon(g, size * 0.5)
  else
    g.circle("line", 0, 0, size * 0.34)
    g.circle("fill", 0, 0, size * 0.13)
  end
  g.pop()
  g.setColor(1, 1, 1, 1)
end

--- Draw a weapon's placeholder icon centred on (x, y), sized to `size` px.
-- Falls back to a generic mark so a new weapon is never invisible.
function render.drawWeaponIcon(id, x, y, size, colour)
  local g = love.graphics
  local col = colour or palette("player")
  g.push()
  g.translate(x, y)
  g.setColor(col[1], col[2], col[3], col[4] or 1)
  local icon = ICONS[id]
  if icon then
    icon(g, size * 0.5)
  else
    g.circle("line", 0, 0, size * 0.32)
    g.rectangle("fill", -size * 0.06, -size * 0.06, size * 0.12, size * 0.12)
  end
  g.pop()
  g.setColor(1, 1, 1, 1)
end

-- --------------------------------------------------------------------- draw

function render.draw(r)
  local g = love.graphics
  local c = config.values
  local cam = render.camera

  g.push()
  g.translate(-math.floor(cam.x + cam.shakeX), -math.floor(cam.y + cam.shakeY))

  render.drawBackground(r)

  -- An optional world-space layer between the background and the entities.
  -- The zoo and the range use it to draw their rooms under the action.
  if render.underlay then render.underlay(r) end

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

  -- Spawn warnings: a ring closing on the spot an enemy is about to occupy,
  -- so the horde can be avoided rather than only reacted to.
  for _, s in ipairs(r.pendingSpawns or {}) do
    local k = (s.total > 0) and math.max(0, s.t / s.total) or 0
    local base = palette("enemy")
    local radius = config.get("enemy." .. s.id .. ".radius") + k * 14
    g.setColor(base[1], base[2], base[3], 0.2 + (1 - k) * 0.6)
    g.circle("line", s.x, s.y, radius, 14)
    if k < 0.25 then
      g.circle("line", s.x, s.y, radius * 0.45, 10)
    end
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
    render.drawShape(e.def.shape, e.x, e.y, e.radius)

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

  -- MWS strikes. The shape comes from the striker's `visual` property, so a
  -- module graph looks like what it says it is without anything here holding
  -- a list of weapons. Drawn from primitives, like all the other art.
  for _, st in ipairs(r.strikes or {}) do
    local sz = st.state.collisionSize
    local kind = st.state.visual
    local brightness=st.state.brightness or 1
    local red,green,blue=playerCol[1]*brightness,playerCol[2]*brightness,playerCol[3]*brightness
    g.setColor(red,green,blue,1)
    if st.v2 and (st.node.props.subclass=="stab" or st.node.props.subclass=="sweep") then
      local reach=st.node.props.range
      g.setLineWidth(math.max(1,sz*2))
      g.line(st.x,st.y,st.x+st.dirX*reach,st.y+st.dirY*reach)
      g.setLineWidth(1)
    elseif st.v2 and st.node.props.subclass=="area" and st.node.props.arc<360 then
      local half=math.rad(st.node.props.arc)/2
      g.setColor(red,green,blue,0.3)
      g.arc("fill","pie",st.x,st.y,sz,st.baseAngle-half,st.baseAngle+half)
      g.setColor(red,green,blue,0.85)
      g.arc("line","pie",st.x,st.y,sz,st.baseAngle-half,st.baseAngle+half)
    elseif kind == "bolt" then
      local lx, ly = st.dirX * sz * 2.5, st.dirY * sz * 2.5
      g.setLineWidth(math.max(1, sz * 0.8))
      g.line(st.x - lx, st.y - ly, st.x + lx, st.y + ly)
      g.setLineWidth(1)
    elseif kind == "blade" then
      local px, py = -st.dirY * sz, st.dirX * sz
      g.polygon("fill", st.x + st.dirX * sz * 2, st.y + st.dirY * sz * 2,
        st.x + px, st.y + py, st.x - px, st.y - py)
    elseif kind == "orb" then
      g.circle("line", st.x, st.y, sz + 1)
      g.circle("fill", st.x, st.y, sz * 0.45)
    elseif kind == "field" then
      g.setColor(red,green,blue, 0.30)
      g.circle("fill", st.x, st.y, sz)
      g.setColor(red,green,blue, 0.85)
      g.circle("line", st.x, st.y, sz)
    elseif kind == "spark" then
      g.rectangle("fill", st.x - sz, st.y - 0.5, sz * 2, 1)
      g.rectangle("fill", st.x - 0.5, st.y - sz, 1, sz * 2)
    else
      g.circle("fill", st.x, st.y, sz)
    end
    dd.circle("colliders", st.x, st.y, sz)
  end

  -- Payload effects: a shape that grows and fades over its short life. One
  -- routine, switched on the effect name, rather than an effect system --
  -- there is nothing here a particle engine would earn its keep on.
  for _, fx in ipairs(r.effects or {}) do
    local t = fx.age / fx.life
    local fade = 1 - t
    local accentCol = palette("accent")
    g.setColor(accentCol[1], accentCol[2], accentCol[3], fade)
    if fx.name == "burst" then
      g.circle("line", fx.x, fx.y, 2 + t * fx.radius)
    elseif fx.name == "shock" then
      for i = 0, 5 do
        local a = i * (math.pi / 3) + t * 2
        local d = 2 + t * fx.radius
        g.line(fx.x + math.cos(a) * 2, fx.y + math.sin(a) * 2,
               fx.x + math.cos(a) * d, fx.y + math.sin(a) * d)
      end
    elseif fx.name == "ring" then
      g.circle("line", fx.x, fx.y, fx.radius * (0.4 + t * 0.6))
    elseif fx.name == "shatter" then
      for i = 0, 3 do
        local a = i * (math.pi / 2) + 0.4
        local d = t * fx.radius
        g.rectangle("fill", fx.x + math.cos(a) * d - 1,
          fx.y + math.sin(a) * d - 1, 2, 2)
      end
    else
      g.rectangle("fill", fx.x - 1, fx.y - 1, 2 + t * 2, 2 + t * 2)
    end
  end

  for _, pt in ipairs(r.particles or {}) do
    local fade = 1 - pt.age / pt.life
    local accentCol = palette("accent")
    g.setColor(accentCol[1], accentCol[2], accentCol[3], fade)
    g.rectangle("fill", pt.x - 0.5, pt.y - 0.5, 1, 1)
  end
  g.setColor(playerCol[1], playerCol[2], playerCol[3], 1)

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
