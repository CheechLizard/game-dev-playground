-- Launcher.
--
-- Boot order matters:
--   1. the game registers its schema (settings.lua) and overlay layers
--   2. config.build() materialises defaults from that schema
--   3. profiles.init() loads whichever profile is marked for launch
--   4. the game starts, reading values that are already correct
--
-- Run from the repo root so profile writes land in the repo:
--     love .
--     love . --game horde-survivor

love.filesystem.setRequirePath(
  "shared/?.lua;shared/?/init.lua;?.lua;?/init.lua")

local config = require("framework.config")
local profiles = require("framework.profiles")
local debugdraw = require("framework.debugdraw")
local editor = require("framework.editor")
local perf = require("framework.perf")
local input = require("framework.input")
local ui = require("framework.ui")
local fonts = require("framework.fonts")

local DEFAULT_GAME = "horde-survivor"

local game
local canvas
local scale, offsetX, offsetY = 1, 0, 0

local function pickGame()
  local args = arg or {}
  for i, a in ipairs(args) do
    if a == "--game" and args[i + 1] then return args[i + 1] end
  end
  return DEFAULT_GAME
end

local function recomputeLetterbox()
  local ww, wh = love.graphics.getDimensions()
  local cw, ch = canvas:getDimensions()
  -- Integer scaling only; a fractional scale makes pixel art shimmer.
  scale = math.max(1, math.floor(math.min(ww / cw, wh / ch)))
  offsetX = math.floor((ww - cw * scale) / 2)
  offsetY = math.floor((wh - ch * scale) / 2)
end

local function rebuildCanvas()
  canvas = love.graphics.newCanvas(config.get("render.width"), config.get("render.height"))
  canvas:setFilter("nearest", "nearest")
  recomputeLetterbox()
end

function love.load()
  love.graphics.setDefaultFilter("nearest", "nearest")
  love.graphics.setLineStyle("rough")

  local name = pickGame()
  love.filesystem.setRequirePath(
    "games/" .. name .. "/?.lua;games/" .. name .. "/?/init.lua;"
    .. love.filesystem.getRequirePath())
  game = require("game")

  -- 1. schema, 2. defaults, 3. profile, 4. game
  -- Font settings are framework-level, so they register alongside the game's.
  fonts.registerSettings()
  ui.registerSettings()
  game.registerSettings()
  config.build()
  profiles.init()
  debugdraw.sync()

  rebuildCanvas()
  config.listen("render.width", rebuildCanvas)
  config.listen("render.height", rebuildCanvas)

  input.init()
  love.graphics.setFont(fonts.role("body"))
  game.load()
end

function love.resize()
  recomputeLetterbox()
end

function love.update(dt)
  perf.beginFrame()
  -- Clamp dt so a hitch or a drag of the window does not teleport everything.
  dt = math.min(dt, 1 / 20)

  ui.beginFrame()
  perf.push("game.update")
  game.update(dt)
  perf.pop()
  input.clear()
  perf.endFrame(dt)
end

function love.draw()
  perf.push("game.draw")
  love.graphics.setCanvas(canvas)
  love.graphics.clear(game.backgroundColor())
  game.draw()
  love.graphics.setCanvas()
  perf.pop()

  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.draw(canvas, offsetX, offsetY, 0, scale, scale)

  -- Screen-space overlays sit on top of the scaled canvas, unpixelated, so
  -- text stays readable at any window size.
  game.drawScreenOverlay(scale, offsetX, offsetY)
  if config.values.perf.show then
    perf.draw(love.graphics.getWidth() - perf.panelWidth() - 8, 8, ui.theme)
  end
  editor.draw()
  ui.endFrame()
end

function love.keypressed(key, scancode, isrepeat)
  if key == "f1" then editor.toggle() return end
  if key == "f2" then config.set("perf.show", not config.get("perf.show")) return end
  if key == "f3" then debugdraw.toggle("colliders") return end
  if key == "f4" then debugdraw.master = not debugdraw.master return end
  if key == "f5" and game.setMode then game.setMode("zoo") return end
  if key == "f6" and game.setMode then game.setMode("range") return end

  ui.keypressed(key)
  if ui.capturingKeyboard() then return end

  input.keypressed(key)
  if game.keypressed then game.keypressed(key, scancode, isrepeat) end
end

function love.textinput(t) ui.textinput(t) end
function love.wheelmoved(dx, dy) ui.wheelmoved(dx, dy) end
function love.gamepadpressed(pad, button)
  input.gamepadpressed(pad, button)
  if game.gamepadpressed then game.gamepadpressed(pad, button) end
end
function love.joystickadded(pad) input.gamepadAdded(pad) end
function love.joystickremoved(pad) input.gamepadRemoved(pad) end

--- Canvas coordinates for a screen point, for mouse-driven debug tools.
function love.mouseToWorld(mx, my)
  return (mx - offsetX) / scale, (my - offsetY) / scale
end
