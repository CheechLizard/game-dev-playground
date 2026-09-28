-- Live inspection contracts: wire protocol, unsaved state and causal audio.
local S={}
function S.run(suite,check,eq,near)
  local json=require("lib.json") local MCP=require("framework.mcp")
  suite("MCP JSON and protocol")
  eq("protocol arrays preserve empty lists",json.encode(json.array()),"[\n]")
  eq("profile empty objects retain their format",json.encode({}),"{}")
  local null=json.decode('{"id":null}',true)
  eq("protocol decoder preserves explicit null",null.id,json.null)
  check("protocol decoder distinguishes empty arrays",json.isArray(json.decode('[]',true)))
  local called=0
  local server=MCP.new({source="test-checkout",call=function(name,args)
    called=called+1 return {name=name,prefix=args.prefix,empty=json.array()}
  end})
  server.port=49321
  local headers={host="127.0.0.1:49321",["content-type"]="application/json",
    ["mcp-protocol-version"]="2025-11-25"}
  local function request(method,params,id)
    return server:handle("POST","/mcp",headers,json.encode({jsonrpc="2.0",id=id,method=method,params=params}))
  end
  local code,reply=request("initialize",{protocolVersion="2025-11-25"},0)
  eq("initialization succeeds",code,200)
  eq("request ID zero is preserved",reply.id,0)
  eq("protocol version is negotiated",reply.result.protocolVersion,"2025-11-25")
  code,reply=request("initialize",{protocolVersion="future"},1)
  eq("unsupported version proposes a supported version",reply.result.protocolVersion,"2025-11-25")
  code,reply=request("notifications/initialized")
  eq("notifications get an empty accepted response",code,202) eq("notification body is empty",reply,nil)
  code,reply=request("tools/list",{},2)
  eq("all three inspection tools are advertised",#reply.result.tools,3)
  for _,tool in ipairs(reply.result.tools) do
    check(tool.name.." is declared read-only",tool.annotations.readOnlyHint and not tool.annotations.destructiveHint)
  end
  code,reply=request("tools/call",{name="get_active_config",arguments={prefix="audio."}},3)
  eq("tool reads reach the live callback",called,1)
  eq("result identifies the serving checkout",reply.result.structuredContent.instance.source,"test-checkout")
  eq("structured and text results agree",json.decode(reply.result.content[1].text).data.prefix,"audio.")
  code,reply=request("tools/call",{name="set_config",arguments={}},4)
  eq("no configuration-writing tool exists",reply.error.code,-32602)
  code,reply=request("tools/call",{name="get_recent_events",arguments={limit=10000}},5)
  eq("event response size is bounded",reply.error.code,-32602)
  code,reply=request("tools/call",{name="get_recent_events",arguments={after=-1}},6)
  eq("invalid cursors are rejected",reply.error.code,-32602)
  code,reply=request("tools/call",{name="get_active_config",arguments={path="/etc/passwd"}},7)
  eq("arbitrary file access is rejected",reply.error.code,-32602)
  code,reply=request("tools/call",{name="get_runtime_state",arguments=json.array()},8)
  eq("array arguments are rejected",reply.error.code,-32602)
  eq("rejected calls never invoke game callbacks",called,1)
  code,reply=request("resources/read",{uri="playground://active-config"},9)
  eq("live config is also readable as an MCP resource",reply.result.contents[1].mimeType,"application/json")
  code,reply=request("resources/read",{uri="file:///etc/passwd"},10)
  eq("resources cannot read arbitrary files",reply.error.code,-32002)
  code,reply=server:handle("POST","/mcp",headers,"not json")
  eq("malformed JSON is rejected without crashing",reply.error.code,-32700)
  code,reply=server:handle("POST","/mcp",headers,'{"jsonrpc":"2.0","id":1e999,"method":"ping"}')
  eq("nonfinite request IDs are rejected",reply.error.code,-32600)
  eq("standalone SSE is explicitly unsupported",server:handle("GET","/mcp",headers,""),405)
  headers.origin="https://untrusted.example"
  eq("foreign web origins cannot inspect the game",request("ping",{},1),403)
  headers.origin=nil headers.host="untrusted.example:49321"
  eq("DNS rebinding hosts cannot inspect the game",request("ping",{},1),403)
  headers.host="127.0.0.1:49321" headers["mcp-protocol-version"]="unknown"
  eq("invalid protocol headers are rejected",request("ping",{},1),400)

  suite("nonblocking local MCP transport")
  do
    local now=0 local accepted={} local boundHost
    local listener={accept=function() return table.remove(accepted,1) end,closed=false,
      settimeout=function() end,close=function(self) self.closed=true end}
    local socket={gettime=function() return now end,bind=function(host)
      boundHost=host return listener
    end}
    local network=MCP.new({source="test",socket=socket,call=function() return {} end})
    network:configure(true,49321)
    eq("listener binds only to loopback",boundHost,"127.0.0.1")
    local function client(chunks)
      return {chunks=chunks,output="",closed=false,settimeout=function() end,
        receive=function(self) return nil,"timeout",table.remove(self.chunks,1) or "" end,
        send=function(self,data,first,last)
          last=math.min(last,first+30)
          self.output=self.output..data:sub(first,last)
          return nil,"timeout",last
        end,close=function(self) self.closed=true end}
    end
    local body='{"jsonrpc":"2.0","id":11,"method":"ping"}'
    local c=client({"POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:49321\r\n",
      "Content-Type: application/json\r\nContent-Length: "..#body.."\r\n\r\n",body:sub(1,10),body:sub(11)})
    accepted[1]=c
    for _=1,30 do network:update() now=now+0.01 end
    check("fragmented requests receive a complete HTTP response",c.closed and c.output:match("HTTP/1.1 200")~=nil)
    local responseBody=c.output:match("\r\n\r\n(.*)")
    eq("partial sends retain every response byte",json.decode(responseBody).id,11)
    local slow=client({"POST /mcp HTTP/1.1\r\n"}) accepted[1]=slow network:update()
    local bad=client({"\r\n\r\n"}) accepted[1]=bad
    for _=1,30 do network:update() end
    check("malformed HTTP cannot crash the game loop",bad.output:match("HTTP/1.1 400")~=nil)
    check("a slow client does not block another response",bad.closed and not slow.closed)
    now=now+4 network:update()
    check("unfinished requests expire",slow.closed)
    network:configure(false,49321)
    check("disabling inspection closes its listener",listener.closed and not network.listener)
  end

  suite("bounded event cursors")
  local Trace=require("framework.eventtrace")
  local trace=Trace.new(3)
  for i=1,5 do trace:record("sample",i) end
  local page=trace:read(0,2)
  check("expired history is reported",page.dropped)
  eq("oldest retained event is returned first",page.events[1].id,3)
  eq("cursor advances through a bounded page",page.cursor,4)
  check("remaining events are flagged",page.hasMore)
  page=trace:read(page.cursor,2)
  eq("next page contains no duplicates",page.events[1].id,5)
  page=trace:read(page.cursor,2)
  eq("idle polling returns no events",#page.events,0)
  check("stale cursors from another epoch are identifiable",trace:read(100,2).cursorAhead)
  check("new runs have distinct epochs",Trace.new().epoch~=trace.epoch)

  suite("live unsaved configuration")
  local config=require("framework.config") local Run=require("run")
  local M=require("framework.mws.v2modules") local I=require("inspection")
  require("tools.simsuite").bootstrap()
  local r=Run.new(1) r.sandbox=true
  local w=r.player.weapons[1]
  local graph=require("weapongraphs").build("v2_pulse")
  r:buildWeaponGraph(w,graph)
  local ctx={run=r,mode="bench",paused=true}
  config.set("audio.volume",0.23)
  local striker=graph.nodes[graph.order[4]] M.set(striker,"draw",87.2)
  local result=I.call("get_active_config",{prefix="audio."},ctx)
  near("global reads reflect current unsaved edits",result.settings["audio.volume"],0.23)
  eq("prefix filters exclude unrelated global settings",result.settings["player.maxHp"],nil)
  near("weapon reads reflect the in-memory graph",result.weapons[1].graph.nodes[4].props.draw,87.2)
  eq("paused state is still inspectable",result.world.paused,true)
  local beforeCharge=w.mws.sequences[1].energy local beforeTime=r.time
  I.call("get_runtime_state",{},ctx) I.call("get_recent_events",{},ctx)
  near("inspection does not advance simulation",r.time,beforeTime)
  near("inspection does not consume battery energy",w.mws.sequences[1].energy,beforeCharge)
  check("runtime snapshots serialize without world references",pcall(json.encode,I.runtime(ctx)))

  suite("same-tick strike death and actual audio")
  local F=require("feedback") local A=require("sound")
  local oldLove,oldCache=love,A.cache
  local ok,err=pcall(function()
    local function voice()
      local v={playing=false}
      function v:clone() return voice() end
      function v:play() self.playing=true end
      function v:stop() self.playing=false end
      function v:isPlaying() return self.playing end
      function v:setVolume() end function v:setPitch() end function v:setLooping() end
      return v
    end
    love={sound={newSoundData=function() return {setSample=function() end} end},audio={newSource=voice}}
    A.stop() A.cache={}
    require("tools.simsuite").bootstrap()
    r=Run.new(7) r.sandbox=true w=r.player.weapons[1]
    graph=require("weapongraphs").build("v2_pulse")
    M.set(graph.nodes[graph.order[1]],"subclass","inverter")
    local battery=graph.nodes[graph.order[2]]
    M.set(battery,"capacity",0.1) M.set(battery,"fillRate",0)
    striker=graph.nodes[graph.order[4]]
    M.set(striker,"subclass","stab") M.set(striker,"startupCost",0.1)
    M.set(striker,"sizeCost",0) M.set(striker,"draw",200)
    r:buildWeaponGraph(w,graph) r.fireSignal=false
    r:update(1/60,0,0)
    eq("test strike dies before the first rendered frame",#r.strikes,0)
    A.update(r,1/60,true)
    local events=r.trace:read(nil,100).events local start,complete,ended,played
    for _,e in ipairs(events) do
      if e.kind=="strike_start" then start=e
      elseif e.kind=="complete" then complete=e
      elseif e.kind=="strike_end" then ended=e
      elseif e.kind=="sound_played" then played=e end
    end
    check("trace retains starts even when the strike is already dead",start~=nil)
    eq("completion records zero-hit Miss eligibility",complete.miss,true)
    eq("termination explains energy exhaustion",ended.reason,"energy")
    check("recorded lifetime is shorter than one frame",ended.age<1/60)
    eq("audio records the sound actually played",played.sound,"shot")
    eq("shot cause is ignition, not Miss",played.cause,"strike_start")
    eq("audio links to the exact start event",played.causeEvent,start.id)
    eq("start and end retain the same strike ID",start.strike,ended.strike)
    eq("audio links to that same strike",played.strike,start.strike)
    eq("audio exposes that its strike had already died",played.alive,false)
    check("runtime generation separates rebuilt weapons",played.generation==w.mws.generation)
    F.sound(r,"shot","sharp") A.update(r,1/60,true)
    local last=r.trace:read(nil,1).events[1]
    eq("cooldown suppression is distinct from playback",last.kind,"sound_suppressed")
    eq("suppression gives a concrete reason",last.reason,"sound_cooldown")
    F.sound(r,"hit","sharp") A.update(r,1/60,false)
    last=r.trace:read(nil,1).events[1]
    eq("paused audio is traced as suppressed",last.reason,"inactive")
  end)
  A.stop() A.cache=oldCache love=oldLove
  if not ok then error(err) end
  require("tools.simsuite").bootstrap()
end
return S
