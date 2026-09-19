-- Debug overlay layers: colliders, hit areas, ranges, spawn rings and so on.
--
-- A layer is registered as an ordinary bool setting on the "Overlays" page, so
-- it shows up in the editor and is saved into config profiles for free -- one
-- mechanism, not two. The layer's live state is mirrored into a plain table so
-- hot draw code can guard on a single lookup:
--
--     if dd.on.colliders then dd.circle("colliders", x, y, r) end

local schema = require("framework.schema")
local config = require("framework.config")

local dd = {}

dd.on = {}        -- id -> boolean, cheap to read in draw loops
dd.layers = {}    -- ordered array of layer records
dd.colors = {}    -- id -> {r,g,b,a}
dd.master = true  -- master switch, F4 by default

local byId = {}

--- Clear the registry. Used by tests and hot-reload, alongside schema.reset().
function dd.reset()
  dd.on = {}
  dd.layers = {}
  dd.colors = {}
  byId = {}
end

--- Register an overlay layer. Call at load time, before config.build().
-- @param def { id, label, group, default, color, order, help }
function dd.register(def)
  assert(type(def.id) == "string", "debugdraw: layer needs an id")
  assert(not byId[def.id], "debugdraw: duplicate layer id '" .. def.id .. "'")

  local layer = {
    id = def.id,
    label = def.label or def.id,
    group = def.group or "Layers",
    color = def.color or { 1, 0.35, 0.4, 0.9 },
    key = "overlay." .. def.id,
  }
  byId[def.id] = layer
  dd.layers[#dd.layers + 1] = layer
  dd.colors[def.id] = layer.color
  dd.on[def.id] = def.default or false

  schema.register{
    page = "Overlays",
    section = layer.group,
    order = 80,
    settings = {
      { key = layer.key, label = layer.label, type = "bool",
        default = def.default or false, order = def.order, help = def.help },
    },
  }

  config.listen(layer.key, function(_, value)
    dd.on[def.id] = value
  end)
  return layer
end

--- Re-read every layer's state from config. Needed after a bulk change such as
-- loading a profile, which deliberately skips per-key listeners.
function dd.sync()
  for _, layer in ipairs(dd.layers) do
    dd.on[layer.id] = config.get(layer.key) or false
  end
end

function dd.toggle(id)
  config.set("overlay." .. id, not dd.on[id])
end

function dd.setAll(value)
  for _, layer in ipairs(dd.layers) do
    config.set(layer.key, value)
  end
end

-- ------------------------------------------------------- drawing helpers
-- Each helper takes the layer id first and no-ops when that layer is off, so
-- call sites stay short. Guard whole blocks with `dd.on.<id>` when the setup
-- cost matters.

local function active(id)
  return dd.master and dd.on[id] and love and love.graphics
end

local function setColor(id, alpha)
  local c = dd.colors[id]
  love.graphics.setColor(c[1], c[2], c[3], (c[4] or 1) * (alpha or 1))
end

function dd.circle(id, x, y, r, alpha)
  if not active(id) then return end
  setColor(id, alpha)
  love.graphics.circle("line", x, y, r)
end

function dd.filledCircle(id, x, y, r, alpha)
  if not active(id) then return end
  setColor(id, (alpha or 1) * 0.25)
  love.graphics.circle("fill", x, y, r)
  setColor(id, alpha)
  love.graphics.circle("line", x, y, r)
end

function dd.rect(id, x, y, w, h, alpha)
  if not active(id) then return end
  setColor(id, alpha)
  love.graphics.rectangle("line", x, y, w, h)
end

function dd.line(id, x1, y1, x2, y2, alpha)
  if not active(id) then return end
  setColor(id, alpha)
  love.graphics.line(x1, y1, x2, y2)
end

function dd.cross(id, x, y, size, alpha)
  if not active(id) then return end
  size = size or 3
  setColor(id, alpha)
  love.graphics.line(x - size, y, x + size, y)
  love.graphics.line(x, y - size, x, y + size)
end

function dd.text(id, str, x, y, alpha)
  if not active(id) then return end
  setColor(id, alpha)
  love.graphics.print(str, x, y)
end

--- Restore the draw colour. Call once after a batch of overlay drawing.
function dd.finish()
  if love and love.graphics then love.graphics.setColor(1, 1, 1, 1) end
end

return dd
