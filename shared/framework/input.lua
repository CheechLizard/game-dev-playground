-- Input: WASD/arrows on the keyboard, left thumbstick on a gamepad.
-- Whichever moved most recently wins, so switching mid-run just works.

local input = {}

input.deadzone = 0.22
input.source = "keyboard"
input.gamepad = nil

local pressed = {}   -- edge-triggered actions consumed this frame
local fireSources,firePressed={},false

-- Application input normalization, above the MWS adapter. Bursts collapse to
-- one observable hot tick; a held source stays hot. There is no press queue.
function input.fireDown(source)
  if not fireSources[source] then firePressed=true end
  fireSources[source]=true
end
function input.fireUp(source) fireSources[source]=nil end
function input.pulseFire() firePressed=true end
function input.sampleFire()
  local hot=firePressed or next(fireSources)~=nil
  firePressed=false
  return hot
end
function input.resetFire() fireSources={} firePressed=false end

function input.init()
  if not love or not love.joystick then return end
  local pads = love.joystick.getJoysticks()
  for _, pad in ipairs(pads) do
    if pad:isGamepad() then input.gamepad = pad break end
  end
end

function input.gamepadAdded(pad)
  if pad:isGamepad() and not input.gamepad then input.gamepad = pad end
end

function input.gamepadRemoved(pad)
  input.fireUp(pad)
  if input.gamepad == pad then
    input.gamepad = nil
    input.init()
  end
end

local function keyboardAxis()
  if not (love and love.keyboard) then return 0, 0 end
  local k = love.keyboard.isDown
  local x = (k("d") or k("right")) and 1 or 0
  x = x - ((k("a") or k("left")) and 1 or 0)
  local y = (k("s") or k("down")) and 1 or 0
  y = y - ((k("w") or k("up")) and 1 or 0)
  return x, y
end

local function padAxis()
  local pad = input.gamepad
  if not pad or not pad:isConnected() then return 0, 0 end
  local x = pad:getGamepadAxis("leftx") or 0
  local y = pad:getGamepadAxis("lefty") or 0
  local mag = math.sqrt(x * x + y * y)
  if mag < input.deadzone then return 0, 0 end
  -- Rescale past the deadzone so slow movement is still reachable.
  local scaled = math.min(1, (mag - input.deadzone) / (1 - input.deadzone))
  return x / mag * scaled, y / mag * scaled
end

--- Movement vector, magnitude clamped to 1.
function input.move()
  local px, py = padAxis()
  if px ~= 0 or py ~= 0 then
    input.source = "gamepad"
    return px, py
  end
  local kx, ky = keyboardAxis()
  if kx ~= 0 or ky ~= 0 then
    input.source = "keyboard"
    local mag = math.sqrt(kx * kx + ky * ky)
    return kx / mag, ky / mag
  end
  return 0, 0
end

--- Record an edge-triggered action for this frame.
function input.press(action)
  pressed[action] = true
end

--- Consume an edge-triggered action. Returns true at most once per press.
function input.consume(action)
  if pressed[action] then
    pressed[action] = nil
    return true
  end
  return false
end

function input.clear()
  pressed = {}
end

--- Map raw keys and gamepad buttons onto named actions.
local KEY_ACTIONS = {
  escape = "cancel", space = "confirm", ["return"] = "confirm",
  r = "restart", p = "pause",
  -- Cycle through a list: weapons in the zoo, enemy types on the range.
  [","] = "prev", ["."] = "next",
  -- Menu navigation. Arrows only: WASD stays movement, so a menu cannot
  -- fight the player's hands over the same keys.
  up = "menuUp", down = "menuDown",
}
local PAD_ACTIONS = {
  a = "confirm", b = "cancel", start = "pause", back = "restart",
  leftshoulder = "prev", rightshoulder = "next",
  dpup = "menuUp", dpdown = "menuDown",
}

function input.keypressed(key,isrepeat)
  -- Repeats cannot recreate a press after focus, an editor, or a weapon swap
  -- cleared the held-source table. Only a fresh physical down starts firing.
  if key=="z" and not isrepeat then input.fireDown("keyboard") end
  local action = KEY_ACTIONS[key]
  if action then input.press(action) end
end

function input.keyreleased(key)
  if key=="z" then input.fireUp("keyboard") end
end

function input.gamepadpressed(pad, button)
  if button=="x" then input.fireDown(pad) end
  local action = PAD_ACTIONS[button]
  if action then input.press(action) end
end
function input.gamepadreleased(pad,button)
  if button=="x" then input.fireUp(pad) end
end

return input
