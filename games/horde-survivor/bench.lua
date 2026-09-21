-- The bench: a level whose subject is a weapon graph.
--
-- The zoo gives every enemy a cage and the range gives every weapon a room.
-- The bench gives one weapon its whole graph: the player stands in an arena
-- across the top of the screen firing it, and the graph is laid out as a
-- flowchart underneath. Editing a module retunes the weapon mid-shot -- there
-- is no apply step, because the run is holding the same table the canvas is
-- drawing.
--
-- Like the zoo and the range it is an ordinary sandbox run, so what happens
-- here is what happens in a real run. What differs is only the camera, the
-- spawning, and that half the screen is a diagram.

local config = require("framework.config")
local content = require("content")
local fonts = require("framework.fonts")
local render = require("render")
local runModule = require("run")
local ui = require("framework.ui")
local arsenal = require("arsenal")
local flowchart = require("framework.mws.flowchart")
local mws = require("framework.mws")
local input = require("framework.input")

local G = mws.graph

local bench = {}

-- ------------------------------------------------------------------- layout
--
-- The panel is measured in screen pixels and the arena in canvas pixels, so
-- the split is converted once, here, rather than everywhere.

local function metrics()
  local c = config.values
  local ww, wh = love.graphics.getDimensions()
  local cw, ch = c.render.width, c.render.height
  local scale = math.max(1, math.floor(math.min(ww / cw, wh / ch)))
  local ox = math.floor((ww - cw * scale) / 2)
  local oy = math.floor((wh - ch * scale) / 2)
  local arenaBottom = math.floor(wh * c.bench.arenaFraction)
  return scale, ox, oy, arenaBottom, ww, wh, cw, ch
end

local ARENA_MARGIN = 4

--- The arena is the top strip; the graph gets the rest. Recomputed every
-- frame because the window can be resized, and a fixed arena would either
-- hide the player behind the panel or leave a band of nothing.
local function fitArena(s)
  local scale, _, oy, arenaBottom, _, _, cw = metrics()
  local r = s.run

  r.arenaW = cw - ARENA_MARGIN * 2
  r.arenaH = math.max(60, (arenaBottom - oy) / scale - ARENA_MARGIN * 2)

  -- Pinned, not followed: the arena is exactly the visible strip, so there is
  -- nothing to scroll to.
  render.camera.x = -ARENA_MARGIN
  render.camera.y = -ARENA_MARGIN
  render.camera.shakeX, render.camera.shakeY = 0, 0

  -- The arena is only known once the window is, so the player is placed on
  -- the first frame rather than in bench.new -- where it would be positioned
  -- against a full-height arena and then clamped out of the strip.
  if not s.placed then
    s.placed = true
    r.player.x, r.player.y = r.arenaW * 0.5, r.arenaH * 0.5
  end
end

-- --------------------------------------------------------------------- init

--- Every weapon in the game built from modules, in content order.
local function mwsWeapons()
  local out = {}
  for _,def in ipairs(require("weaponprototypes").list) do out[#out+1]=def end
  for _, def in ipairs(content.weapons) do
    if def.kind == "mws" then out[#out + 1] = def end
  end
  return out
end

function bench.new()
  -- Capture seeds LÖVE's generator, making targets reproducible across runs.
  local seed=(love and love.math and love.math.random(1,2147483646)) or os.time()
  local r = runModule.new(seed)
  r.sandbox = true
  r.player.invulnerable = true
  r.arenaW, r.arenaH = config.values.render.width, config.values.render.height
  r.player.vx, r.player.vy = 0, 0
  r.player.weapons = {}

  local s = {
    run = r,
    defs = mwsWeapons(),
    placed = false,
    selection = 1,
    view = flowchart.newView(),
    fitPending = true,
    showHelp = false,
    spawnTimer = 0,
    accumulator = 0,
  }
  local selected=1
  for i,d in ipairs(s.defs) do if d.id==config.values.bench.prototype then selected=i end end
  if #s.defs > 0 then bench.equip(s, selected) end
  return s
end

--- Hold exactly one weapon, and put its graph on the canvas.
function bench.equip(s, index)
  if #s.defs == 0 then return end
  s.selection = ((index - 1) % #s.defs) + 1
  local def = s.defs[s.selection]
  if def.prototype then config.set("bench.prototype",def.id) end
  s.prototype=config.values.bench.prototype
  local r = s.run
  r.player.weapons = {}
  r.strikes, r.effects, r.particles = {}, {}, {}
  local weapon = r:addWeapon(def.prototype and "blaster" or def.id)
  if def.prototype then r:buildWeaponGraph(weapon,arsenal.load(def.graph)) end
  s.weapon = weapon
  s.graph = weapon and weapon.graph
  -- Open on the module that starts the weapon, so the inspector has something
  -- in it the moment the bench appears rather than an instruction to click.
  local roots = s.graph and G.roots(s.graph)
  s.view.selected = roots and roots[1] and roots[1].id or nil
  s.fitPending = true
  s.accumulator=0
  input.resetFire()
end

function bench.cycle(s, direction)
  bench.equip(s, s.selection + direction)
end

function bench.selectionName(s)
  local def = s.defs[s.selection]
  return def and def.name or "(no modular weapon)"
end

--- Re-arm after a structural edit. The runtime caches the energy analysis and
-- the striker-to-payload wiring, both of which a rewire invalidates.
local function rearm(s)
  if s.weapon and s.weapon.mws then s.weapon.mws:rebuild() end
end

--- The weapon's live numbers, level and player bonuses included, so the
-- canvas shows what the weapon actually has rather than what the graph says.
local function propOf(s)
  local rt = s.weapon and s.weapon.mws
  if not rt then return nil end
  return function(node, name) return rt:prop(node, name) end
end

-- ------------------------------------------------------------------- update

function bench.update(s, dt, moveX, moveY)
  local r = s.run
  local c = config.values
  if s.prototype~=c.bench.prototype then
    for i,d in ipairs(s.defs) do if d.id==c.bench.prototype then bench.equip(s,i) break end end
  end
  fitArena(s)

  r.player.invulnerable = true
  r.player.hp = r:playerStat("maxHp")
  r.state = runModule.STATE.PLAYING

  -- The host freezes dummy AI/motion before collision checks, not after they
  -- have already moved. Combat and hit effects continue normally.
  r.stationaryEnemies=c.bench.dummyStill
  local target = math.max(0, math.floor(c.bench.population))
  s.spawnTimer = s.spawnTimer - dt
  if s.spawnTimer <= 0 and #r.enemies < target then
    s.spawnTimer = 0.35
    local margin = 16
    r:spawnEnemy(c.bench.dummy,
      margin + r.rng.next() * (r.arenaW - margin * 2),
      margin + r.rng.next() * (r.arenaH - margin * 2))
  end

  if s.graph and s.graph.version==2 then
    s.accumulator=s.accumulator+dt
    while s.accumulator+1e-9>=1/60 do
      s.accumulator=s.accumulator-1/60
      r.fireSignal=input.sampleFire() or c.bench.holdFire
      r:update(1/60,moveX,moveY)
    end
  else r.fireSignal=nil r:update(dt, moveX, moveY) end

  for _, e in ipairs(r.enemies) do
    e.x = math.max(e.radius, math.min(r.arenaW - e.radius, e.x))
    e.y = math.max(e.radius, math.min(r.arenaH - e.radius, e.y))
  end
end

-- --------------------------------------------------------------------- draw

--- World-space: a border, so the strip reads as a place rather than as
-- whatever was left over.
function bench.draw(s)
  local g = love.graphics
  local r = s.run
  local col = config.values.palette.player
  g.setColor(col[1], col[2], col[3], 0.22)
  g.rectangle("line", 0.5, 0.5, r.arenaW - 1, r.arenaH - 1)
  g.setColor(1, 1, 1, 1)
end

-- ------------------------------------------------------------------ overlay

local function problemMap(g)
  local map = {}
  for _, p in ipairs(G.validate(g)) do
    if p.nodeId and (p.level == "error" or map[p.nodeId] ~= "error") then
      map[p.nodeId] = p.level
    end
  end
  return map
end

local function firstProblem(g)
  local fallback
  for _, p in ipairs(G.validate(g)) do
    if p.level == "error" then return p.text, true end
    fallback = fallback or p.text
  end
  return fallback, false
end

--- Delete the selection from the keyboard. The canvas is a mouse surface, and
-- reaching for a button every time you remove a module gets old fast.
local function handleKeys(s, g)
  if ui.capturingKeyboard() then return end
  for _, key in ipairs(ui.keysPressed()) do
    if (key == "delete" or key == "backspace") and s.view.selected then
      G.removeNode(g, s.view.selected)
      s.view.selected = nil
      rearm(s)
    end
  end
end

function bench.drawOverlay(s, scale, ox, oy)
  local gfx = love.graphics
  local _, _, _, arenaBottom, ww, wh = metrics()
  local g = s.graph

  local small = fonts.role("small")
  gfx.setFont(small)
  local lineH = small:getHeight() + 2
  local pad = ui.pad

  local panelY = arenaBottom
  gfx.setColor(ui.theme.background)
  gfx.rectangle("fill", 0, panelY, ww, wh - panelY)
  gfx.setColor(ui.theme.line)
  gfx.line(0, panelY + 0.5, ww, panelY + 0.5)

  if not g then
    gfx.setColor(ui.theme.dim)
    gfx.print("No modular weapon to edit.", pad, panelY + pad)
    return
  end

  handleKeys(s, g)

  -- ---- header: which weapon, whether its batteries keep up, what is wrong
  local headerH = lineH * 2 + pad
  ui.panel(0, panelY + 1, ww, headerH, ui.theme.panel)
  gfx.setColor(ui.theme.accent)
  gfx.print("BENCH", pad, panelY + pad / 2)
  gfx.setColor(ui.theme.fg)
  gfx.print(bench.selectionName(s), pad + ui.unit * 14, panelY + pad / 2)
  gfx.setColor(ui.theme.dim)
  local swap = ", .  swap weapon"
  gfx.print(swap, ww - ui.textWidth(swap) - pad, panelY + pad / 2)

  local demand, supply = G.budget(g, arsenal.cost, propOf(s))
  local stalling = supply < demand
  local energyText = string.format("energy  %.0f/s in   %.0f/s out%s",
    supply, demand, stalling and "   STALLING" or "")
  if g.version==2 then
    local rt=s.weapon.mws
    local parts={}
    for _,seq in ipairs(rt.sequences) do
      parts[#parts+1]=string.format("S%d %.0f/%.0f +%.0f/s",seq.id,seq.energy,seq.capacity,seq.rate)
    end
    energyText=table.concat(parts,"   ")
    stalling=rt.stalled
  end
  local statusY = panelY + pad / 2 + lineH
  gfx.setColor(stalling and ui.theme.warn or ui.theme.dim)
  gfx.print(energyText, pad, statusY)

  -- Measured, not guessed: the energy line's width depends on the numbers in
  -- it and on the UI font size, and a fixed column put the two on top of
  -- each other the moment either grew.
  local problem, isError = firstProblem(g)
  local statusX = pad + ui.textWidth(energyText) + ui.sectionGap
  gfx.setColor(isError and (ui.theme.danger or ui.theme.warn)
    or (problem and ui.theme.warn or ui.theme.dim))
  local stats=s.weapon.mws.stats
  local status=stats and string.format("fire %d  hit %d  end %d  miss %d  skip %d%s",
    stats.fired,stats.hits,stats.completed,stats.misses,stats.skipped,
    stats.limited>0 and "  LIMIT REACHED" or "")
  gfx.print(ui.ellipsise(problem
    or status or string.format("%d modules   %d live strikes", #g.order, #s.run.strikes),
    ww - statusX - pad), statusX, statusY)

  -- ---- body: canvas on the left, the selected module's values on the right
  local bodyY = panelY + headerH + 1
  local bodyH = wh - bodyY
  local inspectW = math.floor(math.max(260, math.min(ww * 0.3, 420)))
  local canvasW = ww - inspectW

  local toolsH = (ui.rowHeight + ui.rowGap) * 4 + pad
  local canvasH = math.max(60, bodyH - toolsH)
  local rect = { x = 0, y = bodyY, w = canvasW, h = canvasH }
  if s.fitPending then
    flowchart.fit(s.view, g, rect)
    s.fitPending = false
  end

  if flowchart.draw(s.view, g, 0, bodyY, canvasW, canvasH, {
        info = s.weapon.mws and s.weapon.mws.info,
        problems = problemMap(g),
        propOf = propOf(s),
      }) then
    rearm(s)
  end

  gfx.setColor(ui.theme.line)
  gfx.line(0, bodyY + canvasH + 0.5, canvasW, bodyY + canvasH + 0.5)
  gfx.line(canvasW + 0.5, bodyY, canvasW + 0.5, wh)

  -- ---- palette and actions, under the canvas
  gfx.setFont(small)
  ui.layout(pad, bodyY + canvasH + pad / 2, canvasW - pad * 2)
  if g.version==2 then
    local cx,cy,cw=ui.nextRow() local bw=math.floor(cw/3)-ui.rowGap
    if ui.button("bench.fire","Fire pulse",{x=cx,y=cy,width=bw}) then input.pulseFire() end
    if ui.button("bench.hold","Hold fire",{x=cx+bw+ui.rowGap,y=cy,width=bw,selected=config.get("bench.holdFire")}) then
      config.set("bench.holdFire",not config.get("bench.holdFire"))
    end
    if ui.button("bench.reset","Reset test",{x=cx+2*(bw+ui.rowGap),y=cy,width=bw}) then rearm(s) end
  end
  local picked = flowchart.palette(canvasW - pad * 2, g.version==2 and 5 or 4, g)
  if picked then
    flowchart.addNode(s.view, g, picked, rect)
    rearm(s)
  end

  local x, y, w = ui.nextRow()
  local cell = math.floor(w / 4) - ui.rowGap
  local function slot(i) return x + (cell + ui.rowGap) * i end
  local def = s.defs[s.selection]

  if ui.button("bench.delete", "Delete", { x = slot(0), y = y, width = cell,
      tone = "danger", align = "center", disabled = not s.view.selected }) then
    G.removeNode(g, s.view.selected)
    s.view.selected = nil
    rearm(s)
  end
  if ui.button("bench.fit", "Fit", { x = slot(1), y = y, width = cell,
      align = "center" }) then
    s.fitPending = true
  end
  if ui.button("bench.save", "Save", { x = slot(2), y = y, width = cell,
      tone = "accent", align = "center" }) then
    arsenal.save(def.graph or def.id, g)
    s.notice = arsenal.status
  end
  if ui.button("bench.revert", "Revert", { x = slot(3), y = y, width = cell,
      align = "center",
      disabled = not arsenal.hasOverride(def.graph or def.id) }) then
    local restored=arsenal.revert(def.graph or def.id)
    s.graph = s.run:buildWeaponGraph(s.weapon,restored)
    s.view.selected = nil
    s.fitPending = true
    s.notice = arsenal.status
  end

  gfx.setFont(small)
  gfx.setColor(s.notice and ui.theme.accent or ui.theme.dim)
  local eventText
  if g.version==2 then
    local log=s.weapon.mws.log local e=log[#log]
    eventText=e and string.format("%s S%d hits=%d %s | Z fire | drag ports to wire",e.kind,e.sequence,e.hitCount,e.reason or "")
      or "Z fire | drag ports to wire | edits reset the test"
  end
  gfx.print(ui.ellipsise(s.notice or s.view.message or eventText
    or "drag a port to wire   drag a tile to move   drag the canvas to pan"
       .. "   wheel to zoom   del to remove",
    canvasW - pad * 2), pad, wh - lineH - pad / 2)

  -- ---- inspector: its own header row, then the module's values below it.
  -- The help toggle lives in that row rather than floating over the list,
  -- where it sat on top of whatever had scrolled under it.
  local helpW = ui.unit * 12
  local headRowY = bodyY + pad / 2
  gfx.setColor(ui.theme.dim)
  gfx.print("INSPECTOR", canvasW + pad, headRowY + (ui.rowHeight - lineH) / 2)
  if ui.button("bench.help", "help", { x = ww - helpW - pad, y = headRowY,
      width = helpW, align = "center", selected = s.showHelp }) then
    s.showHelp = not s.showHelp
  end

  local listY = headRowY + ui.rowHeight + ui.rowGap
  local listH = wh - listY - pad / 2
  gfx.setColor(ui.theme.line)
  gfx.line(canvasW + 1, listY - ui.rowGap / 2 + 0.5, ww, listY - ui.rowGap / 2 + 0.5)
  local innerW = ui.beginScroll("bench.inspector", canvasW + 1, listY,
    inspectW - 1, listH)
  if flowchart.inspector(s.view, g, innerW, { showHelp = s.showHelp }) then rearm(s) end
  ui.endScroll("bench.inspector", canvasW + 1, listY, inspectW - 1, listH)

  -- The launcher draws dropdowns after all panels.
  gfx.setColor(1, 1, 1, 1)
end

return bench
