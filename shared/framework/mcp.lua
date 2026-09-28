-- Read-only MCP over Streamable HTTP, served by the running LÖVE process.
-- Stateless JSON responses; no SSE, arbitrary evaluation, or file access.
-- Nonblocking sockets, bounded clients/bytes/requests, and slow-client expiry
-- keep inspection from pausing the simulation. LuaSocket ships with LÖVE.
local json=require("lib.json")
local MCP={} MCP.__index=MCP
local VERSIONS={["2025-03-26"]=true,["2025-06-18"]=true,["2025-11-25"]=true}
local VERSION="2025-11-25"
local MAX_HEADER,MAX_BODY,MAX_CLIENTS=8192,65536,8
local definitions={
  {name="get_active_config",title="Read active game configuration",
    description="Read current settings and all equipped weapon graphs directly from memory, including unsaved module edits. Optional prefix filters global settings only.",
    properties={prefix={type="string",maxLength=128}}},
  {name="get_runtime_state",title="Read live weapon state",
    description="Read the active mode, selected module, triggers, battery reservoirs, strike counters, live colliders and targets.",properties={}},
  {name="get_recent_events",title="Read strike and sound history",
    description="Read ordered strike, hit, completion and audio events. sound_played means audio was started; sound_queued does not. Complete with miss=true means zero hits. Pass cursor as after for more; reset it when epoch changes. History is bounded and dropped reports expired events.",
    properties={after={type="integer",minimum=0},limit={type="integer",minimum=1,maximum=500}}},
}
local byName={}
for _,d in ipairs(definitions) do byName[d.name]=d end
local resources={
  {uri="playground://active-config",name="Active configuration",tool="get_active_config"},
  {uri="playground://runtime",name="Live weapon state",tool="get_runtime_state"},
  {uri="playground://events",name="Recent strike and sound events",tool="get_recent_events"},
}
local function object(v) return type(v)=="table" and v~=json.null and not json.isArray(v) end
local function rpcError(id,code,message)
  return {jsonrpc="2.0",id=id or json.null,error={code=code,message=message}}
end
local function invalidArguments(def,args)
  if not object(args) then return "arguments must be an object" end
  for key,value in pairs(args) do
    local p=def.properties[key]
    if not p then return "Unknown argument: "..tostring(key) end
    if p.type=="string" then
      if type(value)~="string" or #value>p.maxLength then return key.." must be a string of at most "..p.maxLength.." bytes" end
    elseif type(value)~="number" or value~=math.floor(value) or value<p.minimum
      or value> (p.maximum or 9007199254740991) then
      return key.." must be an integer in the supported range"
    end
  end
end
function MCP.new(options)
  return setmetatable({call=assert(options.call),socket=options.socket,
    instance={source=options.source or "unknown",startedAt=os.date("!%Y-%m-%dT%H:%M:%SZ"),
      session=tostring({}):gsub("table: ",""),readOnly=true},clients={},status="disabled"},MCP)
end
function MCP:invoke(name,args)
  local result=self.call(name,args)
  return {instance=self.instance,data=result}
end
function MCP:dispatch(message)
  if not object(message) or message.jsonrpc~="2.0" or type(message.method)~="string"
    or (message.id~=nil and type(message.id)~="number" and type(message.id)~="string")
    or (type(message.id)=="number" and (message.id~=message.id or math.abs(message.id)==math.huge)) then
    return rpcError(nil,-32600,"Invalid JSON-RPC request"),400
  end
  local id=message.id local method=message.method local p=message.params or {}
  if not object(p) then return rpcError(id,-32602,"params must be an object"),400 end
  if id==nil then return nil,202 end -- Notifications never get JSON-RPC replies.
  local result
  if method=="initialize" then
    if type(p.protocolVersion)~="string" then return rpcError(id,-32602,"Missing protocolVersion"),200 end
    result={protocolVersion=VERSIONS[p.protocolVersion] and p.protocolVersion or VERSION,
      capabilities={tools={listChanged=false},resources={subscribe=false,listChanged=false}},
      serverInfo={name="game-dev-playground",version="1.0.0"},
      instructions="Read-only access to the running game. Check instance.source and world.mode before diagnosing. Config includes unsaved weapon edits. Use get_recent_events to correlate strike IDs, completion reasons and actual sound playback; queued audio is not proof it played. Event cursors belong to the returned epoch; reset after when it changes. No tool edits settings or controls the player."}
  elseif method=="ping" then result={}
  elseif method=="tools/list" then
    local list=json.array()
    for _,d in ipairs(definitions) do
      list[#list+1]={name=d.name,title=d.title,description=d.description,
        inputSchema={type="object",properties=d.properties,additionalProperties=false},
        annotations={readOnlyHint=true,destructiveHint=false,idempotentHint=true,openWorldHint=false}}
    end
    result={tools=list}
  elseif method=="tools/call" then
    local def=type(p.name)=="string" and byName[p.name]
    if not def then return rpcError(id,-32602,"Unknown tool"),200 end
    local args=p.arguments or {}
    local why=invalidArguments(def,args)
    if why then return rpcError(id,-32602,why),200 end
    local ok,value=pcall(function() return self:invoke(p.name,args) end)
    if ok then
      result={content=json.array{{type="text",text=json.encode(value)}},structuredContent=value,isError=false}
    else result={content=json.array{{type="text",text="Inspection failed: "..tostring(value)}},isError=true} end
  elseif method=="resources/list" then
    local list=json.array()
    for _,r in ipairs(resources) do list[#list+1]={uri=r.uri,name=r.name,mimeType="application/json"} end
    result={resources=list}
  elseif method=="resources/templates/list" then result={resourceTemplates=json.array()}
  elseif method=="resources/read" then
    local found
    for _,r in ipairs(resources) do if r.uri==p.uri then found=r end end
    if not found then return rpcError(id,-32002,"Unknown resource"),200 end
    result={contents=json.array{{uri=found.uri,mimeType="application/json",
      text=json.encode(self:invoke(found.tool,{}))}}}
  else return rpcError(id,-32601,"Method not found"),200 end
  return {jsonrpc="2.0",id=id,result=result},200
end
local statusText={[200]="OK",[202]="Accepted",[400]="Bad Request",[403]="Forbidden",
  [404]="Not Found",[405]="Method Not Allowed",[411]="Length Required",
  [413]="Content Too Large",[415]="Unsupported Media Type",[500]="Internal Server Error"}
local function response(code,body)
  local ok,data=pcall(function() return body and json.encode(body) or "" end)
  if not ok then code=500 data=json.encode(rpcError(nil,-32603,"Response could not be serialized")) end
  return "HTTP/1.1 "..code.." "..statusText[code].."\r\nContent-Type: application/json\r\n"
    .."Content-Length: "..#data.."\r\nConnection: close\r\nCache-Control: no-store\r\n"
    ..(code==405 and "Allow: POST\r\n" or "").."\r\n"..data
end
function MCP:handle(method,path,headers,body)
  local host=headers.host
  local localHost="127.0.0.1:"..self.port local namedHost="localhost:"..self.port
  if host~=localHost and host~=namedHost then return 403,rpcError(nil,-32600,"Invalid Host") end
  if headers.origin and headers.origin~="http://"..localHost and headers.origin~="http://"..namedHost then
    return 403,rpcError(nil,-32600,"Invalid Origin")
  end
  if path~="/mcp" then return 404 end
  if method~="POST" then return 405 end
  if headers["mcp-protocol-version"] and not VERSIONS[headers["mcp-protocol-version"]] then
    return 400,rpcError(nil,-32600,"Unsupported MCP protocol version")
  end
  local media=(headers["content-type"] or ""):lower():match("^%s*([^;]+)") or ""
  if media:gsub("%s+$","")~="application/json" then return 415 end
  local message,why=json.decode(body,true)
  if why then return 400,rpcError(nil,-32700,"Invalid JSON") end
  local ok,value,code=pcall(self.dispatch,self,message)
  if not ok then return 500,rpcError(nil,-32603,"Internal inspection error") end
  return code,value
end
function MCP:close()
  for _,c in ipairs(self.clients) do c.socket:close() end
  self.clients={}
  if self.listener then self.listener:close() self.listener=nil end
  self.status="disabled"
end
function MCP:configure(enabled,port)
  if self.enabled==enabled and self.port==port then return end
  self:close() self.enabled=enabled self.port=port
  if not enabled then return end
  if not self.socket then
    local ok,value=pcall(require,"socket")
    if not ok then self.status="LuaSocket unavailable" return end
    self.socket=value
  end
  local listener,why=self.socket.bind("127.0.0.1",port,MAX_CLIENTS)
  if not listener then
    self.status="Cannot listen on 127.0.0.1:"..port..": "..tostring(why)
    io.stderr:write("MCP: "..self.status.."\n") return
  end
  listener:settimeout(0) self.listener=listener
  self.instance.url="http://127.0.0.1:"..port.."/mcp"
  self.status=self.instance.url
end
local function parseHeader(c)
  local boundary=c.input:find("\r\n\r\n",1,true)
  if not boundary then return #c.input>MAX_HEADER and 413 or nil end
  if boundary>MAX_HEADER then return 413 end
  local block=c.input:sub(1,boundary-1)
  local first=block:match("^([^\r\n]+)")
  if not first then return 400 end
  c.method,c.path=first:match("^(%u+) ([^ ]+) HTTP/1%.[01]$")
  if not c.method then return 400 end
  c.headers={}
  for line in block:sub(#first+3):gmatch("[^\r\n]+") do
    local name,value=line:match("^([%w%-]+):%s*(.-)%s*$")
    if not name then return 400 end
    name=name:lower()
    if c.headers[name] then return 400 end
    c.headers[name]=value
  end
  if c.headers["transfer-encoding"] then return 400 end
  local length=c.headers["content-length"]
  if not length and c.method=="POST" then return 411 end
  if length and not length:match("^%d+$") then return 400 end
  c.length=tonumber(length or 0)
  if c.length>MAX_BODY then return 413 end
  c.input=c.input:sub(boundary+4)
end
function MCP:update()
  if not self.listener then return end
  local now=self.socket.gettime()
  for _=1,2 do
    if #self.clients>=MAX_CLIENTS then break end
    local s=self.listener:accept()
    if not s then break end
    s:settimeout(0)
    self.clients[#self.clients+1]={socket=s,input="",deadline=now+3,offset=1}
  end
  local live={} local requests=0
  for _,c in ipairs(self.clients) do
    if now<c.deadline then
      if not c.output then
        -- One bounded read per client per frame; timeout partials are normal.
        local data,why,partial=c.socket:receive(4096)
        c.input=c.input..(data or partial or "")
        local errorCode
        if not c.headers then errorCode=parseHeader(c) end
        if errorCode then c.output=response(errorCode)
        elseif c.headers and #c.input>=c.length and requests<2 then
          requests=requests+1
          local code,body=self:handle(c.method,c.path,c.headers,c.input:sub(1,c.length))
          c.output=response(code,body)
        elseif why=="closed" then c.deadline=0 end
      end
      if c.output then
        local last=math.min(#c.output,c.offset+65535)
        local sent,why,partial=c.socket:send(c.output,c.offset,last)
        c.offset=(sent or partial or c.offset-1)+1
        if c.offset>#c.output or why=="closed" then c.deadline=0 end
      end
    end
    if now<c.deadline then live[#live+1]=c else c.socket:close() end
  end
  self.clients=live
end
return MCP
