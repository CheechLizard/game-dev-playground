function love.conf(t)
  t.identity = "game-dev-playground"
  t.version = "11.4"
  t.console = false

  t.window.title = "game-dev-playground"
  t.window.width = 1152          -- 3x the 384x216 internal resolution
  t.window.height = 648
  t.window.minwidth = 640
  t.window.minheight = 360
  t.window.resizable = true
  t.window.vsync = 1
  t.window.highdpi = true

  t.modules.physics = false      -- collision here is circle-vs-circle by hand
  t.modules.video = false
  t.modules.touch = false
end
