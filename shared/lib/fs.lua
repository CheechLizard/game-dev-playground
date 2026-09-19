-- Thin filesystem shim.
--
-- Profiles are meant to live in the repo so they can be diffed and committed,
-- but love.filesystem can only write to the save directory. So: read through
-- love.filesystem when it is there (it sees the mounted source tree), and write
-- through plain io, which lands in the repo when the game is launched from the
-- repo root. If the io write fails -- read-only checkout, a .love bundle, a
-- packaged build -- fall back to the save directory and say so.

local fs = {}

local hasLove = type(love) == "table" and love.filesystem ~= nil

function fs.read(path)
  if hasLove then
    local data = love.filesystem.read(path)
    if data then return data end
  end
  local f = io.open(path, "rb")
  if not f then return nil, "cannot open " .. path end
  local data = f:read("*a")
  f:close()
  return data
end

function fs.exists(path)
  if hasLove and love.filesystem.getInfo(path) then return true end
  local f = io.open(path, "rb")
  if f then f:close() return true end
  return false
end

local isWindows = package.config:sub(1, 1) == "\\"
local devnull = isWindows and "nul" or "/dev/null"

local function mkdirp(path)
  local dir = path:match("^(.*)/[^/]*$")
  if not dir or dir == "" then return end
  -- Create each level in turn. `mkdir -p` is not portable to Windows, and we
  -- only ever create a couple of levels.
  local accum = dir:sub(1, 1) == "/" and "" or nil
  for segment in dir:gmatch("[^/]+") do
    accum = accum and (accum .. "/" .. segment) or segment
    os.execute('mkdir "' .. accum .. '" 2>' .. devnull)
  end
end

--- Write a file. Returns true, location where location is "repo" or "save".
function fs.write(path, data)
  mkdirp(path)
  local f = io.open(path, "wb")
  if f then
    local ok = f:write(data)
    f:close()
    if ok then return true, "repo" end
  end
  if hasLove then
    local dir = path:match("^(.*)/[^/]*$")
    if dir then love.filesystem.createDirectory(dir) end
    local ok, err = love.filesystem.write(path, data)
    if ok then return true, "save" end
    return false, err
  end
  return false, "cannot write " .. path
end

function fs.remove(path)
  local ok = os.remove(path)
  if ok then return true end
  if hasLove then return love.filesystem.remove(path) end
  return false
end

--- List files in a directory. Only reliable under LÖVE; returns an empty list
-- otherwise, which is why the profile index file is authoritative.
function fs.list(dir)
  if hasLove then
    local ok, items = pcall(love.filesystem.getDirectoryItems, dir)
    if ok and items then return items end
  end
  local out = {}
  local pipe = io.popen and io.popen('ls -1 "' .. dir .. '" 2>/dev/null')
  if pipe then
    for line in pipe:lines() do out[#out + 1] = line end
    pipe:close()
  end
  return out
end

return fs
