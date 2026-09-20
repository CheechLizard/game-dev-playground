-- LÖVE keys the save directory to t.identity -- to the string, not to the
-- checkout. A fixed identity means every worktree shares one save folder, so
-- two parallel agents writing the same filename silently overwrite each
-- other's. Captures and profiles are written into the checkout and only fall
-- back here, but the fallback is exactly the case where a collision would be
-- confusing. Deriving the identity from the source directory keeps parallel
-- checkouts apart.
-- The canonical clone keeps the plain name, so its existing saves still resolve.
local function identity()
  local dir = (love.filesystem.getSource() or ""):match("([^/\\]+)[/\\]*$")
  if not dir or dir == "game-dev-playground" then
    return "game-dev-playground"
  end
  return "game-dev-playground-" .. dir:gsub("[^%w%-_]", "-")
end

function love.conf(t)
  t.identity = identity()
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
