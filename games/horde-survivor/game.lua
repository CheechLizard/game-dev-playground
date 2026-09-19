-- Horde survivor: the game module main.lua drives.
--
-- main.lua calls registerSettings() before config.build(), so everything this
-- game exposes to the editor is declared by the time defaults are materialised.

local config = require("framework.config")
local editor = require("framework.editor")
local debugdraw = require("framework.debugdraw")
local input = require("framework.input")
local perf = require("framework.perf")

local settings = require("settings")
local content = require("content")
local runModule = require("run")
local render = require("render")
local hud = require("hud")
local sandbox = require("sandbox")

local game = {}

local current = nil
local paused = false

-- "run" is the game. "zoo" and "range" are the inspection levels; both hold a
-- sandbox whose own run is simulated in place of the real one.
local mode = "run"
local sandboxState = nil

--- Enter a level outright. `next` is "run", "zoo" or "range".
local function enterMode(next)
  mode = next
  render.underlay = nil
  if next == "run" then
    sandboxState = nil
    if current then render.snapCamera(current) end
  else
    sandboxState = sandbox.new(next)
    render.snapCamera(sandboxState.run)
  end
end

--- Switch level. Asking for the level you are already in returns to the run,
-- so F5 and F6 toggle rather than needing a second key to leave.
function game.setMode(next)
  if next ~= "run" and mode == next then next = "run" end
  enterMode(next)
end

function game.mode() return mode end


--- True when the simulation is frozen, either by the pause key or because the
-- editor is open and configured to pause. The shop and the end-of-run summary
-- are their own states and are not affected.
function game.isPaused()
  if paused then return true end
  return editor.open and config.values.run.pauseWithEditor
end

function game.togglePause()
  paused = not paused
  return paused
end

-- ------------------------------------------------------------- registration

local function registerDebugActions()
  editor.action{ page = "Debug", section = "Run", order = 1,
    label = "Restart run", tone = "accent",
    fn = function() game.restart() end }
  editor.action{ page = "Debug", section = "Run", order = 2,
    label = "Next wave now",
    fn = function() if current then current.waveTime = 1e9 end end }
  editor.action{ page = "Debug", section = "Run", order = 3,
    label = "Open shop",
    fn = function() if current then current:openShop() end end }
  editor.action{ page = "Debug", section = "Run", order = 4,
    label = "Skip to last wave",
    fn = function()
      if current then
        current.wave = current:waveCount()
        current.waveTime = 0
      end
    end }

  editor.action{ page = "Debug", section = "Player", order = 1,
    label = "+1 level",
    fn = function() if current then current:levelUp() end end }
  editor.action{ page = "Debug", section = "Player", order = 2,
    label = "+100 gold",
    fn = function() if current then current:addGold(100) end end }
  editor.action{ page = "Debug", section = "Player", order = 3,
    label = "Heal to full",
    fn = function()
      if current then current.player.hp = current:playerStat("maxHp") end
    end }
  editor.action{ page = "Debug", section = "Player", order = 4,
    label = "Give every weapon",
    fn = function()
      if not current then return end
      for _, def in ipairs(content.weapons) do current:addWeapon(def.id) end
    end }
  editor.action{ page = "Debug", section = "Player", order = 5,
    label = "Kill player", tone = "danger",
    fn = function()
      if current then
        current.player.iframe = 0
        current:damagePlayer(1e9, "the editor")
      end
    end }

  editor.action{ page = "Debug", section = "Enemies", order = 1,
    label = "Clear all enemies",
    fn = function()
      if current then
        current.enemies = {}
        current.enemyShots = {}
      end
    end }
  editor.action{ page = "Debug", section = "Enemies", order = 2,
    label = "Kill all enemies",
    fn = function()
      if not current then return end
      -- Copy the list: killEnemy adds pickups but leaves the list intact.
      local snapshot = {}
      for i, e in ipairs(current.enemies) do snapshot[i] = e end
      for _, e in ipairs(snapshot) do
        if not e.dead then current:killEnemy(e, nil) end
      end
    end }

  -- One spawn button per enemy, generated from content so the list cannot
  -- drift from the enemies that actually exist.
  for i, def in ipairs(content.enemies) do
    editor.action{ page = "Debug", section = "Spawn", order = i,
      label = "Spawn 10 " .. def.name,
      fn = function()
        if not current then return end
        for _ = 1, 10 do
          local x, y = current:offscreenPoint()
          current:spawnEnemy(def.id, x, y)
        end
      end }
  end

  editor.action{ page = "Levels", section = "Go to", order = 1,
    label = "Play the run", tone = "accent",
    fn = function() game.setMode("run") end }
  editor.action{ page = "Levels", section = "Go to", order = 2,
    label = "Zoo (F5)",
    fn = function() game.setMode("zoo") end }
  editor.action{ page = "Levels", section = "Go to", order = 3,
    label = "Range (F6)",
    fn = function() game.setMode("range") end }

  editor.action{ page = "Overlays", section = "All", order = 1,
    label = "Turn every overlay on",
    fn = function() debugdraw.setAll(true) end }
  editor.action{ page = "Overlays", section = "All", order = 2,
    label = "Turn every overlay off",
    fn = function() debugdraw.setAll(false) end }
end

function game.registerSettings()
  settings.register()
end

-- -------------------------------------------------------------------- load

function game.restart()
  current = runModule.new(os.time() + math.floor(love.timer.getTime() * 1000))
  current.summaryCache = nil
  render.snapCamera(current)
  config.clearRestartPending()
end

function game.load()
  registerDebugActions()
  editor.hook("restartRun", game.restart)
  game.restart()
end

function game.backgroundColor()
  local bg = config.values.palette.background
  return bg[1], bg[2], bg[3], 1
end

function game.run()
  return current
end

-- ------------------------------------------------------------------ update

local function handleShopInput(r)
  local shop = r.shop
  if not shop then return end
  if input.consume("confirm") then
    r:shopBuy(shop.cursor)
  elseif input.consume("cancel") then
    r:closeShop()
  elseif input.consume("restart") then
    r:shopReroll()
  end
end

function game.update(dt)
  if not current then return end
  local c = config.values

  if input.consume("pause") then paused = not paused end

  if sandboxState then
    if input.consume("prev") then sandbox.cycle(sandboxState, -1) end
    if input.consume("next") then sandbox.cycle(sandboxState, 1) end
    if input.consume("restart") then enterMode(mode) end
    if not game.isPaused() then
      local mx, my = input.move()
      sandbox.update(sandboxState, dt * c.debug.timeScale, mx, my)
      render.updateCamera(sandboxState.run, dt)
    end
    perf.count("enemies", #sandboxState.run.enemies)
    return
  end

  if current.state == runModule.STATE.SHOP then
    handleShopInput(current)
    current:update(dt * c.debug.timeScale, 0, 0)
    perf.count("enemies", #current.enemies)
    return
  end

  if input.consume("restart") then
    game.restart()
    return
  end

  if current.state == runModule.STATE.DEAD or current.state == runModule.STATE.WON then
    current:update(dt, 0, 0)
    return
  end

  -- Frozen: no simulation, no camera drift, but the HUD still draws.
  if game.isPaused() then return end

  local mx, my = input.move()

  -- Debug switches are applied around the simulation rather than inside it,
  -- so run.lua stays a clean model of the actual game.
  if c.debug.godMode then current.player.iframe = math.max(current.player.iframe, 0.1) end

  local scaled = dt * c.debug.timeScale
  if c.debug.freezeEnemies or c.debug.freezeSpawns then
    local savedEnemies, savedSpawnTimer
    if c.debug.freezeEnemies then
      savedEnemies = current.enemies
      current.enemies = {}
    end
    if c.debug.freezeSpawns then
      savedSpawnTimer = current.spawnTimer
      current.spawnTimer = 1e9
    end
    current:update(scaled, mx, my)
    if savedEnemies then
      for _, e in ipairs(current.enemies) do savedEnemies[#savedEnemies + 1] = e end
      current.enemies = savedEnemies
    end
    if savedSpawnTimer then current.spawnTimer = savedSpawnTimer end
  else
    current:update(scaled, mx, my)
  end

  render.updateCamera(current, dt)

  perf.count("enemies", #current.enemies)
  perf.count("projectiles", #current.projectiles)
  perf.count("enemy shots", #current.enemyShots)
  perf.count("pickups", #current.pickups)
end

-- -------------------------------------------------------------------- draw

function game.draw()
  if sandboxState then
    render.underlay = function() sandbox.draw(sandboxState) end
    render.draw(sandboxState.run)
    render.underlay = nil
    return
  end
  if not current then return end
  render.draw(current)
end

function game.drawScreenOverlay(scale, ox, oy)
  if sandboxState then
    sandbox.drawOverlay(sandboxState, scale, ox, oy)
    if game.isPaused() then hud.drawPaused(scale, ox, oy) end
    return
  end
  if not current then return end
  hud.draw(current, scale, ox, oy)

  if game.isPaused() and current.state == runModule.STATE.PLAYING then
    hud.drawPaused(scale, ox, oy)
  end

  if config.values.debug.showRunState then
    local g = love.graphics
    g.setColor(1, 1, 1, 0.55)
    g.print(string.format(
      "state=%s  t=%.1f  wave=%d  spawnIn=%.2f  alive=%d  lvl=%d  lp=%.0f/%.0f",
      current.state, current.time, current.wave, current.spawnTimer,
      #current.enemies, current.player.level, current.player.lp, current.player.lpNext),
      ox + 8, oy + 52)
  end
end

-- ------------------------------------------------------------------- input

--- Move the shop cursor across the grid the shop is actually drawn as.
-- Clamps at the edges rather than wrapping: wrapping past the last item into
-- the first is disorienting when the grid's bottom row is short.
local function moveShopCursor(r, dx, dy)
  local shop = r.shop
  if not shop then return end
  local count = #shop.items
  if count == 0 then return end
  local cols = hud.shopColumns(count)
  local index = shop.cursor - 1
  local col, row = index % cols, math.floor(index / cols)

  if dx ~= 0 then
    col = math.max(0, math.min(cols - 1, col + dx))
  end
  if dy ~= 0 then
    local rows = math.ceil(count / cols)
    row = math.max(0, math.min(rows - 1, row + dy))
  end

  -- The last row can be short; fall back to its final cell.
  local target = row * cols + col
  if target >= count then target = count - 1 end
  shop.cursor = target + 1
end

function game.keypressed(key)
  if sandboxState then return end
  if not current then return end

  if current.state == runModule.STATE.SHOP then
    local index = tonumber(key)
    if index and current.shop and current.shop.items[index] then
      current.shop.cursor = index
      current:shopBuy(index)
    elseif key == "r" then
      current:shopReroll()
    elseif key == "return" or key == "kpenter" or key == "escape" then
      current:closeShop()
    elseif key == "up" or key == "w" then
      moveShopCursor(current, 0, -1)
    elseif key == "down" or key == "s" then
      moveShopCursor(current, 0, 1)
    elseif key == "left" or key == "a" then
      moveShopCursor(current, -1, 0)
    elseif key == "right" or key == "d" then
      moveShopCursor(current, 1, 0)
    elseif key == "space" then
      current:shopBuy(current.shop.cursor)
    end
    return
  end

  if key == "r" then game.restart() end
end

function game.gamepadpressed(_, button)
  if not current or current.state ~= runModule.STATE.SHOP then
    if button == "back" then game.restart() end
    return
  end
  local shop = current.shop
  if button == "dpup" then
    moveShopCursor(current, 0, -1)
  elseif button == "dpdown" then
    moveShopCursor(current, 0, 1)
  elseif button == "dpleft" then
    moveShopCursor(current, -1, 0)
  elseif button == "dpright" then
    moveShopCursor(current, 1, 0)
  elseif button == "a" then
    current:shopBuy(shop.cursor)
  elseif button == "x" then
    current:shopReroll()
  elseif button == "start" or button == "b" then
    current:closeShop()
  end
end

return game
