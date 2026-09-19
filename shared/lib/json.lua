-- Minimal JSON encode/decode for config profiles.
-- Encoding sorts object keys so profile files produce stable git diffs.

local json = {}

local escapes = {
  ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b',
  ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

local function escapeString(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return escapes[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end

-- An empty Lua table is ambiguous. Profiles encode objects far more often than
-- arrays, and "no overrides" must serialise as {}, so empty means object.
local function isArray(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" then return false end
    n = n + 1
  end
  return n > 0 and n == #t
end

local function encodeNumber(n)
  if n ~= n or n == math.huge or n == -math.huge then
    error("cannot encode non-finite number")
  end
  if n == math.floor(n) and math.abs(n) < 1e15 then
    return string.format("%d", n)
  end
  -- %.14g keeps float values round-trippable without trailing noise.
  return (string.format("%.14g", n))
end

local encodeValue

local function encodeTable(t, indent, out)
  local nextIndent = indent .. "  "
  if isArray(t) then
    out[#out + 1] = "[\n"
    for i = 1, #t do
      out[#out + 1] = nextIndent
      encodeValue(t[i], nextIndent, out)
      out[#out + 1] = (i < #t) and ",\n" or "\n"
    end
    out[#out + 1] = indent .. "]"
  else
    local keys = {}
    for k in pairs(t) do
      if type(k) ~= "string" then error("object keys must be strings, got " .. type(k)) end
      keys[#keys + 1] = k
    end
    if #keys == 0 then out[#out + 1] = "{}" return end
    table.sort(keys)
    out[#out + 1] = "{\n"
    for i = 1, #keys do
      out[#out + 1] = nextIndent .. escapeString(keys[i]) .. ": "
      encodeValue(t[keys[i]], nextIndent, out)
      out[#out + 1] = (i < #keys) and ",\n" or "\n"
    end
    out[#out + 1] = indent .. "}"
  end
end

encodeValue = function(v, indent, out)
  local t = type(v)
  if v == nil then out[#out + 1] = "null"
  elseif t == "boolean" then out[#out + 1] = tostring(v)
  elseif t == "number" then out[#out + 1] = encodeNumber(v)
  elseif t == "string" then out[#out + 1] = escapeString(v)
  elseif t == "table" then encodeTable(v, indent, out)
  else error("cannot encode value of type " .. t) end
end

function json.encode(value)
  local out = {}
  encodeValue(value, "", out)
  return table.concat(out)
end

-- ---------------------------------------------------------------- decoding

local Parser = {}
Parser.__index = Parser

function Parser.new(s)
  return setmetatable({ s = s, i = 1 }, Parser)
end

function Parser:error(msg)
  local line = 1
  for _ in self.s:sub(1, self.i):gmatch("\n") do line = line + 1 end
  error(string.format("json: %s at line %d", msg, line), 0)
end

function Parser:skip()
  local _, j = self.s:find("^[ \t\r\n]*", self.i)
  self.i = j + 1
end

function Parser:peek()
  return self.s:sub(self.i, self.i)
end

function Parser:expect(c)
  if self:peek() ~= c then self:error("expected '" .. c .. "'") end
  self.i = self.i + 1
end

local unescapes = {
  ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b',
  f = '\f', n = '\n', r = '\r', t = '\t',
}

function Parser:parseString()
  self:expect('"')
  local buf = {}
  while true do
    local c = self:peek()
    if c == "" then self:error("unterminated string") end
    self.i = self.i + 1
    if c == '"' then break end
    if c == "\\" then
      local e = self:peek()
      self.i = self.i + 1
      if unescapes[e] then
        buf[#buf + 1] = unescapes[e]
      elseif e == "u" then
        local hex = self.s:sub(self.i, self.i + 3)
        if not hex:match("^%x%x%x%x$") then self:error("bad \\u escape") end
        self.i = self.i + 4
        local cp = tonumber(hex, 16)
        -- Config data is ASCII in practice; encode the BMP subset as UTF-8.
        if cp < 0x80 then
          buf[#buf + 1] = string.char(cp)
        elseif cp < 0x800 then
          buf[#buf + 1] = string.char(0xC0 + math.floor(cp / 0x40), 0x80 + cp % 0x40)
        else
          buf[#buf + 1] = string.char(
            0xE0 + math.floor(cp / 0x1000),
            0x80 + math.floor(cp / 0x40) % 0x40,
            0x80 + cp % 0x40)
        end
      else
        self:error("bad escape '\\" .. e .. "'")
      end
    else
      buf[#buf + 1] = c
    end
  end
  return table.concat(buf)
end

function Parser:parseNumber()
  local pat = "^%-?%d+%.?%d*[eE]?[%+%-]?%d*"
  local s, e = self.s:find(pat, self.i)
  if not s then self:error("bad number") end
  local n = tonumber(self.s:sub(s, e))
  if not n then self:error("bad number") end
  self.i = e + 1
  return n
end

function Parser:parseValue()
  self:skip()
  local c = self:peek()
  if c == "{" then
    self.i = self.i + 1
    local obj = {}
    self:skip()
    if self:peek() == "}" then self.i = self.i + 1 return obj end
    while true do
      self:skip()
      local k = self:parseString()
      self:skip()
      self:expect(":")
      obj[k] = self:parseValue()
      self:skip()
      local d = self:peek()
      self.i = self.i + 1
      if d == "}" then return obj end
      if d ~= "," then self:error("expected ',' or '}'") end
    end
  elseif c == "[" then
    self.i = self.i + 1
    local arr = {}
    self:skip()
    if self:peek() == "]" then self.i = self.i + 1 return arr end
    while true do
      arr[#arr + 1] = self:parseValue()
      self:skip()
      local d = self:peek()
      self.i = self.i + 1
      if d == "]" then return arr end
      if d ~= "," then self:error("expected ',' or ']'") end
    end
  elseif c == '"' then
    return self:parseString()
  elseif self.s:find("^true", self.i) then self.i = self.i + 4 return true
  elseif self.s:find("^false", self.i) then self.i = self.i + 5 return false
  elseif self.s:find("^null", self.i) then self.i = self.i + 4 return nil
  elseif c:match("[%-%d]") then
    return self:parseNumber()
  end
  self:error("unexpected character '" .. c .. "'")
end

--- Decode a JSON string. Returns value, or nil plus an error message.
function json.decode(s)
  if type(s) ~= "string" then return nil, "json: expected string" end
  local p = Parser.new(s)
  local ok, result = pcall(function()
    local v = p:parseValue()
    p:skip()
    if p.i <= #p.s then p:error("trailing content") end
    return v
  end)
  if not ok then return nil, result end
  return result
end

return json
