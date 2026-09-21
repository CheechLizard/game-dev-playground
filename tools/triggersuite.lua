-- v2 signal conformance tests, separate from the legacy graph/runtime suite.
-- Expected traces are examples of externally observable signal behavior.

local triggers = require("framework.mws.triggers")
local input = require("framework.mws.input")
local tests = {}

local function trace(nodes, bits)
  local out = {}
  for digit in bits:gmatch(".") do
    local value = tonumber(digit)
    for _, node in ipairs(nodes) do value = node:step(value) end
    out[#out + 1] = tostring(value)
  end
  return table.concat(out)
end

function tests.run(suite, check, eq)
  suite("mws v2: normalized input boundary")
  do
    local adapter, other = input.new(), input.new()
    eq("input starts cold", adapter:sample(), 0)
    check("normalized down is accepted", adapter:handle(input.FIRE_BUTTON_DOWN))
    eq("down makes input hot", adapter:sample(), 1)
    eq("sampling held input does not consume it", adapter:sample(), 1)
    adapter:handle(input.FIRE_BUTTON_DOWN)
    eq("repeated normalized down remains hot", adapter:sample(), 1)
    eq("another adapter remains independent", other:sample(), 0)
    check("raw device events are not interpreted", not adapter:handle("space"))
    eq("unknown event leaves input unchanged", adapter:sample(), 1)
    check("normalized up is accepted", adapter:handle(input.FIRE_BUTTON_UP))
    eq("up makes input cold", adapter:sample(), 0)
    -- Deliberately feeding a burst at this boundary does not invent a replay
    -- queue. The input layer must present the intended coalesced tick state.
    for _ = 1, 20 do
      adapter:handle(input.FIRE_BUTTON_DOWN)
      adapter:handle(input.FIRE_BUTTON_UP)
    end
    local output = {}
    for _ = 1, 8 do output[#output + 1] = adapter:sample() end
    eq("the adapter has no historical press backlog", table.concat(output), "00000000")
  end

  suite("mws v2: basic trigger signals")
  do
    local bits = "000111001100"
    eq("inverter matches the specification",
      trace({ triggers.new("inverter") }, bits), "111000110011")
    eq("single matches the specification",
      trace({ triggers.new("single") }, bits), "000100001000")
    eq("toggle matches the specification",
      trace({ triggers.new("toggle") }, bits), "000111110000")
    eq("two inverters restore the signal",
      trace({ triggers.new("inverter"), triggers.new("inverter") }, bits), bits)
    eq("single accepts hot input on the first tick",
      trace({ triggers.new("single") }, "11101"), "10001")
    eq("toggle accepts hot input on the first tick and holds after release",
      trace({ triggers.new("toggle") }, "11001"), "11110")
    eq("inverter then single pulses initially and on release",
      trace({ triggers.new("inverter"), triggers.new("single") }, bits), "100000100010")
    eq("single then inverter has a different meaning",
      trace({ triggers.new("single"), triggers.new("inverter") }, bits), "111011110111")
    local first, second = triggers.new("toggle"), triggers.new("toggle")
    first:step(1)
    eq("toggle state belongs to one instance", second:step(0), 0)
    eq("boolean input is accepted", triggers.new("single"):step(true), 1)
    check("non-bit numbers are refused", not pcall(function()
      triggers.new("single"):step(2)
    end))
    check("unknown subclasses are refused", not pcall(triggers.new, "timer"))
  end

  suite("mws v2: delay")
  do
    eq("delay preserves multiple pulses and releases without retrigger reset",
      trace({ triggers.new("delay", { delayTicks = 3 }) }, "1101001000000"),
      "0001101001000")
    eq("cold input does not cancel a pending pulse",
      trace({ triggers.new("delay", { delayTicks = 2 }) }, "10000"), "00100")
    eq("zero delay passes through in the same tick",
      trace({ triggers.new("delay", { delayTicks = 0 }) }, "010110"), "010110")
    eq("serial delays add",
      trace({ triggers.new("delay", { delayTicks = 2 }),
              triggers.new("delay", { delayTicks = 3 }) }, "110000000"), "000001100")
    local a = triggers.new("delay", { delayTicks = 2 })
    local b = triggers.new("delay", { delayTicks = 2 })
    a:step(1)
    eq("delay history is instance-local", trace({ b }, "0000"), "0000")
    -- Longer than the delay's history window: catches overwrite/wrap bugs.
    local stream = "101100001011000010110000"
    eq("longer streams retain their exact shifted shape",
      trace({ triggers.new("delay", { delayTicks = 4 }) }, stream),
      "0000" .. stream:sub(1, -5))
    check("fractional delay ticks are refused", not pcall(triggers.new,
      "delay", { delayTicks = 1.5 }))
  end

  suite("mws v2: repeater")
  do
    local props = { periodTicks = 5, pulseTicks = 2 }
    eq("first pulse is immediate and width is respected",
      trace({ triggers.new("repeater", props) }, "111111111111"), "110001100011")
    eq("cold input stops output and reactivation resets the pattern",
      trace({ triggers.new("repeater", props) }, "1110111111"), "1100110001")
    eq("cold input can end a pulse before its configured width",
      trace({ triggers.new("repeater", props) }, "10101"), "10101")
    eq("a repeater can drive a downstream single",
      trace({ triggers.new("repeater", props), triggers.new("single") },
        "111111111111"), "100001000010")
    eq("toggle controls continuous repetition until the next press",
      trace({ triggers.new("toggle"), triggers.new("repeater",
        { periodTicks = 3, pulseTicks = 1 }) }, "10000010000"), "10010000000")
    check("a pulse must leave a cold interval", not pcall(triggers.new,
      "repeater", { periodTicks = 2, pulseTicks = 2 }))
    local configured = triggers.new("repeater", props)
    props.periodTicks = 100
    eq("instance configuration is copied from authoring input",
      trace({ configured }, "111111"), "110001")
    check("unknown properties are not silently discarded", not pcall(triggers.new,
      "repeater", { fireRate = 10 }))
  end

  suite("mws v2: sensors and event conversion")
  do
    local proximity = triggers.new("proximity")
    local out = {}
    for _, detected in ipairs({ false, true, true, true, false }) do
      out[#out + 1] = proximity:step(0, { proximity = detected })
    end
    eq("proximity stays hot while enemies are present", table.concat(out), "01110")
    local hit, miss, complete = triggers.new("hit"), triggers.new("miss"), triggers.new("complete")
    local hitOut, missOut, completeOut = {}, {}, {}
    -- The agreed piercing example: two hits, then completion with count two.
    local events = {
      { kind = "hit", hitCount = 1 },
      { kind = "hit", hitCount = 2 },
      { kind = "complete", hitCount = 2, reason = "range" },
      { kind = "complete", hitCount = 0, reason = "energy" },
    }
    for _, event in ipairs(events) do
      hitOut[#hitOut + 1] = hit:step(0, { event = event })
      missOut[#missOut + 1] = miss:step(0, { event = event })
      completeOut[#completeOut + 1] = complete:step(0, { event = event })
    end
    eq("hit reacts to individual contacts", table.concat(hitOut), "1100")
    eq("miss reacts only to zero-hit completion", table.concat(missOut), "0001")
    eq("complete accepts successful and zero-hit endings", table.concat(completeOut), "0011")
    eq("event output does not leak into later ticks", complete:step(0), 0)
    eq("the retired raw miss event is not zero-hit completion",
      miss:step(0, { event = { kind = "miss" } }), 0)
    check("missing hit counts cannot masquerade as misses", not pcall(function()
      miss:step(0, { event = { kind = "complete" } })
    end))
    check("an unresolved event batch is not silently collapsed", not pcall(function()
      hit:step(0, { events = events })
    end))
  end
end

return tests
