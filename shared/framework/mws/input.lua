-- The weapon boundary accepts normalized application events, not devices.
-- Bindings, keyboard repeat, quick taps and between-tick coalescing belong
-- to the application input layer above this adapter. There is no event queue.

local input = {}
input.__index = input

input.FIRE_BUTTON_DOWN = "FIRE_BUTTON_DOWN"
input.FIRE_BUTTON_UP = "FIRE_BUTTON_UP"

function input.new()
  return setmetatable({ hot = false }, input)
end

--- Consume one normalized action event. Unknown events leave state alone.
function input:handle(event)
  if event == input.FIRE_BUTTON_DOWN then
    self.hot = true
  elseif event == input.FIRE_BUTTON_UP then
    self.hot = false
  else
    return false
  end
  return true
end

--- One signal bit for this simulation tick. Sampling never drains a backlog.
function input:sample()
  return self.hot and 1 or 0
end

return input
