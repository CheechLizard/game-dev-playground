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

local game = {}

local current = nil

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
  if not current then return end
  render.draw(current)
end

function game.drawScreenOverlay(scale, ox, oy)
  if not current then return end
  hud.draw(current, scale, ox, oy)

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

function game.keypressed(key)
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
      current.shop.cursor = math.max(1, current.shop.cursor - 1)
    elseif key == "down" or key == "s" then
      current.shop.cursor = math.min(#current.shop.items, current.shop.cursor + 1)
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
    shop.cursor = math.max(1, shop.cursor - 1)
  elseif button == "dpdown" then
    shop.cursor = math.min(#shop.items, shop.cursor + 1)
  elseif button == "a" then
    current:shopBuy(shop.cursor)
  elseif button == "x" then
    current:shopReroll()
  elseif button == "start" or button == "b" then
    current:closeShop()
  end
end

return game
