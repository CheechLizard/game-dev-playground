-- The node canvas: a weapon graph as icons and wires you can drag.
--
-- This is the one surface in the project that is not a stack of rows, because
-- a graph is not a list. It therefore does its own hit testing rather than
-- going through ui's widgets -- but it takes its colours, its tones and its
-- 4px rhythm from ui like everything else, so it still looks like the rest of
-- the program rather than like a node editor someone bolted on.
--
-- A node is a 48px tile: an icon, a three-letter tag, and nothing else. The
-- numbers live in the inspector, on the same widgets the zoo's placards use.
-- Putting a module's properties on its box makes a six-module weapon wider
-- than any panel it has to fit in, and the shape of the graph is what the
-- canvas is for -- the values have a better home a few pixels away.
--
-- It knows nothing about any game: hand it a graph and a rectangle.

local mods = require("framework.mws.modules")
local graph = require("framework.mws.graph")
local ui = require("framework.ui")
local fonts = require("framework.fonts")

local flowchart = {}

local NODE = 48             -- graph-space, before zoom. Square.
local TAG = 11              -- the strip at the bottom holding the short name
local PORT_HIT = 7

flowchart.NODE = NODE

-- ------------------------------------------------------------------- icons
--
-- One per module type, drawn from primitives like every other piece of art
-- here. Each draws inside a box of half-extent `s` centred on the origin,
-- in whatever colour is already set.

local ICONS = {}

--- A cell with a terminal on top and a charge level inside.
ICONS.battery = function(g, s)
  g.rectangle("line", -s * 0.52, -s * 0.66, s * 1.04, s * 1.32)
  g.rectangle("fill", -s * 0.2, -s * 0.92, s * 0.4, s * 0.26)
  g.rectangle("fill", -s * 0.3, -s * 0.12, s * 0.6, s * 0.66)
end

--- A play triangle against a bar: the thing that starts it.
ICONS.trigger = function(g, s)
  g.rectangle("fill", -s * 0.8, -s * 0.66, s * 0.26, s * 1.32)
  g.polygon("fill", -s * 0.28, -s * 0.66, s * 0.82, 0, -s * 0.28, s * 0.66)
end

--- The same arrow three times over: one window, many strikes.
ICONS.repeater = function(g, s)
  for i = 0, 2 do
    local x = -s * 0.85 + i * s * 0.62
    g.polygon("fill", x, -s * 0.52, x + s * 0.44, 0, x, s * 0.52)
  end
end

--- One input fanning into three: the only module that branches.
ICONS.barrel = function(g, s)
  g.circle("fill", -s * 0.72, 0, s * 0.2)
  g.line(-s * 0.54, 0, s * 0.82, -s * 0.68)
  g.line(-s * 0.54, 0, s * 0.88, 0)
  g.line(-s * 0.54, 0, s * 0.82, s * 0.68)
end

--- A dart with a trail: the strike itself, in flight.
ICONS.striker = function(g, s)
  g.polygon("fill", s * 0.88, 0, s * 0.08, -s * 0.5, s * 0.26, 0, s * 0.08, s * 0.5)
  g.line(-s * 0.88, 0, s * 0.02, 0)
end

--- A burst: what happens where it lands.
ICONS.payload = function(g, s)
  for i = 0, 7 do
    local a = i * (math.pi / 4)
    local inner = (i % 2 == 0) and s * 0.32 or s * 0.42
    local outer = (i % 2 == 0) and s * 0.92 or s * 0.66
    g.line(math.cos(a) * inner, math.sin(a) * inner,
           math.cos(a) * outer, math.sin(a) * outer)
  end
  g.circle("fill", 0, 0, s * 0.18)
end

--- A nozzle throwing particles it will never hear from again.
ICONS.emitter = function(g, s)
  g.polygon("fill", -s * 0.88, -s * 0.46, -s * 0.24, -s * 0.22,
                    -s * 0.24, s * 0.22, -s * 0.88, s * 0.46)
  local dots = { { 0.10, -0.52 }, { 0.46, -0.18 }, { 0.20, 0.30 },
                 { 0.66, 0.44 }, { 0.80, -0.56 }, { 0.56, 0.02 } }
  local d = math.max(1, s * 0.17)
  for _, p in ipairs(dots) do
    g.rectangle("fill", p[1] * s, p[2] * s, d, d)
  end
end

--- Draw a module type's icon centred on cx, cy at half-extent `size`.
-- Exposed so the palette marks a button with the same shape the canvas uses.
function flowchart.icon(typeId, cx, cy, size)
  local g = love.graphics
  local fn = ICONS[typeId]
  g.push()
  g.translate(cx, cy)
  if fn then fn(g, size) else g.circle("line", 0, 0, size * 0.7) end
  g.pop()
end

-- ------------------------------------------------------------------- state

function flowchart.newView()
  return {
    panX = 0, panY = 0,
    zoom = 2,
    selected = nil,       -- node id
    dragging = nil,       -- { id, dx, dy } while a tile is being moved
    linking = nil,        -- { from = id, port = n } while a wire is out
    panning = nil,        -- while the canvas itself is being dragged
    message = nil,
  }
end

local function toScreen(view, rect, gx, gy)
  return rect.x + (gx - view.panX) * view.zoom,
         rect.y + (gy - view.panY) * view.zoom
end

local function toGraph(view, rect, sx, sy)
  return (sx - rect.x) / view.zoom + view.panX,
         (sy - rect.y) / view.zoom + view.panY
end

local function inPort(node) return node.x, node.y + NODE / 2 end

--- How many output ports to show: one more than are wired, so there is always
-- somewhere to drag a new branch from and no separate "add port" control.
local function visiblePorts(g, node)
  local t = mods.byId[node.type]
  if not t or t.outputs <= 0 then return 0 end
  if t.outputs == 1 then return 1 end
  local highest = 0
  for port, childId in pairs(node.outputs) do
    if childId and g.nodes[childId] and port > highest then highest = port end
  end
  return math.min(t.outputs, highest + 1)
end

local function outPort(g, node, port)
  local count = math.max(1, visiblePorts(g, node))
  return node.x + NODE, node.y + (NODE / (count + 1)) * port
end

local function nodeAt(view, rect, g, sx, sy)
  local gx, gy = toGraph(view, rect, sx, sy)
  for i = #g.order, 1, -1 do
    local node = g.nodes[g.order[i]]
    if node and gx >= node.x and gx <= node.x + NODE
       and gy >= node.y and gy <= node.y + NODE then
      return node
    end
  end
  return nil
end

--- The output port nearest a point, within reach. Nearest rather than first:
-- ports on a 48px tile sit a few pixels apart, so overlapping hit areas are
-- the rule and taking whichever came first in the list takes the wrong one.
local function portAt(view, rect, g, sx, sy)
  local bestNode, bestPort, bestD2
  local reach = PORT_HIT * view.zoom
  for _, id in ipairs(g.order) do
    local node = g.nodes[id]
    for port = 1, visiblePorts(g, node) do
      local ox, oy = toScreen(view, rect, outPort(g, node, port))
      local dx, dy = sx - ox, sy - oy
      local d2 = dx * dx + dy * dy
      if d2 <= reach * reach and (not bestD2 or d2 < bestD2) then
        bestNode, bestPort, bestD2 = node, port, d2
      end
    end
  end
  return bestNode, bestPort
end

-- ------------------------------------------------------------------ drawing

local function setColour(c, alpha)
  love.graphics.setColor(c[1], c[2], c[3], alpha or c[4] or 1)
end

--- A wire. Two verticals and a horizontal rather than a curve: at this
-- resolution a bezier is four grey pixels and an elbow is a diagram.
local function wire(x1, y1, x2, y2)
  local g = love.graphics
  if x2 < x1 + 10 then
    -- Wired backwards: go around rather than through the tiles.
    local drop = math.max(y1, y2) + 26
    g.line(x1, y1, x1 + 8, y1, x1 + 8, drop, x2 - 8, drop, x2 - 8, y2, x2, y2)
    return
  end
  local mid = x1 + (x2 - x1) * 0.5
  g.line(x1, y1, mid, y1, mid, y2, x2, y2)
end

local function drawNode(view, rect, g, node, opts)
  local gfx = love.graphics
  local t = mods.byId[node.type]
  local x, y = toScreen(view, rect, node.x, node.y)
  local size = NODE * view.zoom
  local tagH = TAG * view.zoom
  local selected = (view.selected == node.id)
  local problem = opts.problems and opts.problems[node.id]

  setColour(ui.theme.background)
  gfx.rectangle("fill", x, y, size, size)

  local outline = ui.theme.line
  if problem == "error" then outline = ui.theme.danger or ui.theme.warn
  elseif problem == "warn" then outline = ui.theme.warn
  elseif selected then outline = ui.theme.accent end

  if selected then
    -- A ring outside the tile rather than a fill: filling it would force the
    -- icon to invert, and two weights of the same shape already reads as
    -- "this one".
    setColour(ui.theme.accent)
    gfx.rectangle("line", x - 2.5, y - 2.5, size + 5, size + 5)
  end
  setColour(outline)
  gfx.rectangle("line", x + 0.5, y + 0.5, size - 1, size - 1)

  setColour(selected and ui.theme.accent or ui.theme.fg)
  flowchart.icon(node.type, x + size / 2, y + (size - tagH) / 2,
    (size - tagH) * 0.32)

  local font = fonts.get("pixel", 8)
  gfx.setFont(font)
  setColour(ui.theme.line)
  gfx.line(x, y + size - tagH + 0.5, x + size, y + size - tagH + 0.5)
  setColour(selected and ui.theme.accent or ui.theme.dim)
  local tag = t.short or t.name:sub(1, 3)
  gfx.print(tag, x + (size - font:getWidth(tag)) / 2,
    y + size - tagH + math.max(0, (tagH - font:getHeight()) / 2))

  -- Energy, printed under the tile rather than in it, and only on the modules
  -- that have any: a battery says what it supplies, a trigger and a repeater
  -- say what one strike off them costs against the rail that reaches them.
  -- Seeing both on the canvas is most of why the energy rule is learnable.
  local info = opts.info and opts.info[node.id]
  if info and not info.orphan then
    local text
    if node.type == "battery" then
      local supply = opts.propOf and opts.propOf(node, "energyPerSecond")
        or node.props.energyPerSecond or 0
      text = string.format("+%.0f/s", supply)
    elseif node.type == "trigger" or node.type == "repeater" then
      text = string.format("%.0f of %.0f", info.cost or 0, info.rail or 0)
    end
    if text then
      local short = (info.rail or 0) < (info.cost or 0)
      setColour(short and ui.theme.warn or ui.theme.dim)
      gfx.print(text, x + (size - font:getWidth(text)) / 2, y + size + 3)
    end
  end

  -- Ports. Filled means wired, hollow means free.
  local parented = graph.parentOf(g, node.id)
  if parented or not mods.isRoot(node.type) then
    local ix, iy = toScreen(view, rect, inPort(node))
    setColour(parented and ui.theme.fg or ui.theme.dim)
    gfx.circle(parented and "fill" or "line", ix, iy, 2.5)
  end
  for port = 1, visiblePorts(g, node) do
    local px, py = toScreen(view, rect, outPort(g, node, port))
    local wired = node.outputs[port] and g.nodes[node.outputs[port]]
    setColour(wired and ui.theme.fg or ui.theme.dim)
    gfx.circle(wired and "fill" or "line", px, py, 2.5)
  end
end

-- ----------------------------------------------------------------- interact

--- Frame the whole graph inside the rectangle. A graph you cannot find is
-- worse than no graph, so this runs on open and on the Fit button.
function flowchart.fit(view, g, rect)
  if #g.order == 0 then
    view.panX, view.panY, view.zoom = 0, 0, 2
    return
  end
  local minX, minY, maxX, maxY = math.huge, math.huge, -math.huge, -math.huge
  for _, id in ipairs(g.order) do
    local node = g.nodes[id]
    minX = math.min(minX, node.x)
    minY = math.min(minY, node.y)
    maxX = math.max(maxX, node.x + NODE)
    maxY = math.max(maxY, node.y + NODE + 12)   -- room for the energy line
  end
  local pad = 18
  local zx = (rect.w - pad * 2) / math.max(1, maxX - minX)
  local zy = (rect.h - pad * 2) / math.max(1, maxY - minY)
  -- Never below 1: the tiles scale but their 8px pixel font does not, so a
  -- zoom under 1 pushes a tag out of the bottom of its own tile.
  view.zoom = math.max(1, math.min(3, math.min(zx, zy)))
  view.panX = minX - (rect.w / view.zoom - (maxX - minX)) / 2
  view.panY = minY - (rect.h / view.zoom - (maxY - minY)) / 2
end

--- Draw the canvas and handle everything done on it. Returns true when the
-- graph's *structure* changed, so the caller can re-arm the weapon.
-- @param opts { info, problems, propOf }
function flowchart.draw(view, g, x, y, w, h, opts)
  opts = opts or {}
  local gfx = love.graphics
  local rect = { x = x, y = y, w = w, h = h }
  local mx, my = ui.mousePos()
  local over = ui.mouseInside(x, y, w, h)
  local changed = false

  setColour(ui.theme.background)
  gfx.rectangle("fill", x, y, w, h)
  gfx.setScissor(x, y, w, h)
  gfx.setLineWidth(1)

  -- Wires under the tiles, so a wire never crosses an icon.
  for _, id in ipairs(g.order) do
    local node = g.nodes[id]
    for port = 1, visiblePorts(g, node) do
      local childId = node.outputs[port]
      local child = childId and g.nodes[childId]
      if child then
        local x1, y1 = toScreen(view, rect, outPort(g, node, port))
        local x2, y2 = toScreen(view, rect, inPort(child))
        setColour(ui.theme.dim, 0.9)
        wire(x1, y1, x2, y2)
      end
    end
  end

  if view.linking then
    local from = g.nodes[view.linking.from]
    if from then
      local x1, y1 = toScreen(view, rect, outPort(g, from, view.linking.port))
      setColour(ui.theme.accent)
      wire(x1, y1, mx, my)
    else
      view.linking = nil
    end
  end

  for _, id in ipairs(g.order) do
    drawNode(view, rect, g, g.nodes[id], opts)
  end

  gfx.setScissor()

  if over then
    local wheel = ui.takeWheel()
    if wheel ~= 0 then
      -- Zoom about the cursor, so whatever you are looking at stays put.
      local gx, gy = toGraph(view, rect, mx, my)
      view.zoom = math.max(1, math.min(5, view.zoom * (1 + wheel * 0.14)))
      local nx, ny = toGraph(view, rect, mx, my)
      view.panX = view.panX + (gx - nx)
      view.panY = view.panY + (gy - ny)
    end
  end

  if ui.mouseClicked() and over then
    local portNode, port = portAt(view, rect, g, mx, my)
    if portNode then
      -- Grabbing a wired port takes the wire off rather than refusing: one
      -- gesture for wiring and for rewiring, and one fewer thing to know.
      if portNode.outputs[port] then
        graph.disconnect(g, portNode.id, port)
        changed = true
      end
      view.linking = { from = portNode.id, port = port }
    else
      local node = nodeAt(view, rect, g, mx, my)
      if node then
        view.selected = node.id
        local gx, gy = toGraph(view, rect, mx, my)
        view.dragging = { id = node.id, dx = gx - node.x, dy = gy - node.y }
      else
        view.panning = { x = mx, y = my, panX = view.panX, panY = view.panY }
      end
    end
  end

  if view.dragging and ui.mouseDown() then
    local node = g.nodes[view.dragging.id]
    if node then
      local gx, gy = toGraph(view, rect, mx, my)
      node.x = math.floor(gx - view.dragging.dx)
      node.y = math.floor(gy - view.dragging.dy)
    end
  end

  if view.panning and ui.mouseDown() then
    view.panX = view.panning.panX - (mx - view.panning.x) / view.zoom
    view.panY = view.panning.panY - (my - view.panning.y) / view.zoom
  end

  if ui.mouseReleased() then
    if view.linking then
      local target = nodeAt(view, rect, g, mx, my)
      if target and target.id ~= view.linking.from then
        local ok, why = graph.connect(g, view.linking.from, view.linking.port,
          target.id)
        view.message = ok and nil or why
        changed = changed or ok
      end
      view.linking = nil
    end
    view.dragging = nil
    view.panning = nil
  end

  gfx.setColor(1, 1, 1, 1)
  return changed
end

--- Add a node where there is room to see it: just right of the selection, or
-- in the middle of the view. A node dropped off screen reads as the button
-- not having worked.
function flowchart.addNode(view, g, typeId, rect)
  local x, y = 40, 40
  local anchor = view.selected and g.nodes[view.selected]
  if anchor then
    x, y = anchor.x + NODE + 36, anchor.y
  elseif rect then
    x, y = toGraph(view, rect, rect.x + rect.w / 2, rect.y + rect.h / 2)
    x, y = math.floor(x - NODE / 2), math.floor(y - NODE / 2)
  end
  local node = graph.addNode(g, typeId, x, y)
  -- Wire it straight onto the selection when a port is free, because that is
  -- overwhelmingly the next thing you were going to do.
  if anchor then
    local t = mods.byId[anchor.type]
    for port = 1, (t and t.outputs or 0) do
      if not anchor.outputs[port] then
        if graph.connect(g, anchor.id, port, node.id) then break end
      end
    end
  end
  view.selected = node.id
  return node
end

-- ---------------------------------------------------------------- inspector
--
-- The selected module's properties, drawn with the editor's own widgets --
-- the same deal the zoo's placards make, so a value is edited the same way
-- wherever you meet it. The rows come from the module's property list, which
-- is the only place a module's properties are declared, so one added there
-- appears here with no edit to this file.

local function drawProp(node, prop, idPrefix)
  local id = idPrefix .. "." .. prop.name
  local value = node.props[prop.name]
  if value == nil then value = prop.default end
  local label = prop.label or prop.name

  if prop.type == "bool" then
    return ui.toggle(id, label, value and true or false)
  elseif prop.type == "enum" then
    return ui.dropdown(id, label, value, prop.values)
  elseif prop.type == "string" then
    return ui.textField(id, label, tostring(value))
  elseif prop.type == "int" then
    if (prop.max - prop.min) <= 12 then
      return ui.stepper(id, label, value, prop.min, prop.max, 1, { integer = true })
    end
    return ui.slider(id, label, value, prop.min, prop.max,
      { integer = true, unit = prop.unit })
  end
  return ui.slider(id, label, value, prop.min, prop.max,
    { unit = prop.unit, format = prop.format })
end

--- @param opts { showHelp }
-- @return true when a value changed this frame
function flowchart.inspector(view, g, width, opts)
  opts = opts or {}
  local node = view.selected and g.nodes[view.selected]
  if not node then
    ui.label("Nothing selected.", ui.theme.dim)
    ui.label("Click a module to edit it.", ui.theme.dim)
    return false
  end

  local t = mods.byId[node.type]
  ui.heading(t.name)
  ui.label(t.blurb, ui.theme.dim, ui.lineHeight)
  ui.space(2)

  local changed = false
  for _, prop in ipairs(mods.props(node.type)) do
    local value, did = drawProp(node, prop, "mws." .. node.id)
    if did then
      node.props[prop.name] = mods.coerce(prop, value)
      changed = true
    end
    if prop.help and opts.showHelp then
      ui.label(prop.help, ui.theme.dim, ui.lineHeight)
    end
    ui.space(ui.unit)
  end
  return changed
end

--- The palette: one button per module type, each marked with the same icon
-- the canvas uses, so the shape you pick is the shape you get.
-- @return the type id clicked this frame, or nil
function flowchart.palette(width, perRow)
  perRow = perRow or 4
  local picked = nil
  local cellW = math.floor(width / perRow)
  local cellH = ui.rowHeight + ui.rowGap
  local x0, y0 = ui.cursorRect()
  local row, col = 0, 0
  local font = fonts.get("pixel", 8)

  for _, t in ipairs(mods.types) do
    local bx = x0 + col * cellW
    local by = y0 + row * cellH
    local bw = cellW - ui.rowGap
    if ui.button("mws.add." .. t.id, "", { x = bx, y = by, width = bw }) then
      picked = t.id
    end
    -- Drawn over the button rather than passed to it: ui.button takes a
    -- caption, and a caption cannot be a picture.
    love.graphics.setFont(font)
    setColour(ui.theme.fg)
    flowchart.icon(t.id, bx + ui.pad + 5, by + ui.rowHeight / 2, 5)
    love.graphics.print(ui.ellipsise(t.name, bw - ui.pad * 2 - 16),
      bx + ui.pad + 14, by + (ui.rowHeight - font:getHeight()) / 2)

    col = col + 1
    if col >= perRow then col, row = 0, row + 1 end
  end

  local rows = row + (col > 0 and 1 or 0)
  ui.setCursorY(y0 + rows * cellH)
  return picked
end

return flowchart
