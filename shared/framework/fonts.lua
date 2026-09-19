-- Pixel fonts for every screen-space surface: HUD, shop, summary, editor, perf.
--
-- Nothing here draws. It owns the font files, caches one LÖVE font object per
-- (family, pixel size), and hands them out by role. Two rules make pixel fonts
-- look right:
--
--   * nearest filtering, or the glyph edges blur when the window is not at 1x
--   * integer pixel sizes at the font's native multiple, or stems break up
--
-- Sizes are therefore chosen as multiples of each family's design size rather
-- than being scaled arbitrarily.

local schema = require("framework.schema")
local config = require("framework.config")

local fonts = {}

local DIR = "shared/assets/fonts/"

-- Each family records the design size its glyphs were drawn at. Sizes handed
-- to `fonts.get` are snapped to a multiple of it.
fonts.families = {
  arcade = { path = DIR .. "default-arcade/press-start-2p-font/PressStart2P-vaV7.ttf",
             step = 8,  label = "Arcade (Press Start 2P)" },
  pixel  = { path = DIR .. "small-text/pixy/PIXY.ttf",
             step = 8,  label = "Pixel (Pixy)" },
  blocky = { path = DIR .. "blocky/darkbyte-font/Darkbyte-4nly6.ttf",
             step = 8,  label = "Blocky (Darkbyte)" },
  friendly = { path = DIR .. "friendly/yoster-island/yoster.ttf",
             step = 8,  label = "Friendly (Yoster Island)" },
}

local cache = {}
local missing = {}

--- A font object for a family at a pixel size. Cached; safe to call per frame.
function fonts.get(family, size)
  local def = fonts.families[family] or fonts.families.pixel
  size = math.max(def.step, math.floor(size / def.step + 0.5) * def.step)

  local key = family .. ":" .. size
  local hit = cache[key]
  if hit then return hit end

  local ok, font = pcall(love.graphics.newFont, def.path, size)
  if not ok then
    -- A missing or unreadable font file must not take the game down; fall back
    -- to LÖVE's default at the same size and say so once.
    if not missing[family] then
      missing[family] = true
      print(("fonts: could not load %q (%s), using the default font")
        :format(def.path, tostring(font)))
    end
    font = love.graphics.newFont(size)
  end
  font:setFilter("nearest", "nearest")
  cache[key] = font
  return font
end

-- ------------------------------------------------------------------- roles
-- Roles are what calling code asks for. The size each one resolves to scales
-- with `ui.fontScale`, so one setting makes every surface bigger at once.

-- Sizes are in logical pixels. `small` is deliberately 16 rather than 8: at 8
-- these fonts are legible only at 1:1 and the UI read as squinting material,
-- which is what prompted the pass. 8 is still reachable via the world-space
-- name plates, which are drawn into the low-res canvas and want to be tiny.
local ROLE_SIZE = {
  title = 32,   -- screen headings: SHOP, YOU DIED
  heading = 24, -- section headings and the HUD's big numbers
  body = 16,    -- default readable text
  small = 16,   -- dense rows, footnotes, stat tables
}

--- Pixel size for a role at the current UI scale.
function fonts.sizeOf(role)
  local base = ROLE_SIZE[role] or ROLE_SIZE.body
  local scale = (config.values.ui and config.values.ui.fontScale) or 1
  return base * scale
end

--- Font for a role. `title` and `heading` use the display family, the rest use
-- the text family, so headings can be arcade without hurting dense rows.
function fonts.role(role)
  local c = config.values.ui or {}
  local family = (role == "title" or role == "heading")
    and (c.displayFont or "arcade")
    or (c.textFont or "pixel")
  return fonts.get(family, fonts.sizeOf(role))
end

--- Set the current font from a role and return it.
function fonts.set(role)
  local font = fonts.role(role)
  love.graphics.setFont(font)
  return font
end

--- Run `fn` with a role's font active, restoring whatever was set before.
function fonts.with(role, fn)
  local previous = love.graphics.getFont()
  fonts.set(role)
  fn()
  if previous then love.graphics.setFont(previous) end
end

-- ---------------------------------------------------------------- settings

--- Register the font settings. Called before config.build(), like any schema.
function fonts.registerSettings()
  local names, labels = {}, {}
  for id, def in pairs(fonts.families) do
    names[#names + 1] = id
    labels[id] = def.label
  end
  table.sort(names)

  schema.register{
    page = "UI", section = "Text", order = 85, sectionOrder = 10,
    settings = {
      { key = "ui.fontScale", label = "Text size", type = "int",
        default = 1, min = 1, max = 3, unit = "x",
        help = "Multiplies every font size. Integer only, so pixel glyphs "
          .. "stay sharp instead of being resampled." },
      { key = "ui.displayFont", label = "Heading font", type = "enum",
        default = "arcade", values = names },
      { key = "ui.textFont", label = "Body font", type = "enum",
        default = "pixel", values = names },
    },
  }
end

--- Drop cached font objects. Call when a size or family setting changes.
function fonts.invalidate()
  cache = {}
end

return fonts
