-- Build serializable views of the actual active world, never saved substitutes.
local json=require("lib.json")
local config=require("framework.config")
local profiles=require("framework.profiles")
local G=require("framework.mws.graph")
local D=require("diagnostics")
local I={}
local function arrayCopy(values)
  local out=json.array() for _,v in ipairs(values or {}) do out[#out+1]=v end return out
end
local function identity(ctx)
  return {mode=ctx.mode,paused=ctx.paused,time=ctx.run and ctx.run.time,
    epoch=ctx.run and ctx.run.trace and ctx.run.trace.epoch,
    selectedModule=ctx.bench and ctx.bench.view.selected,
    weaponName=ctx.bench and require("bench").selectionName(ctx.bench)}
end
function I.config(ctx,args)
  local out={world=identity(ctx),profile=profiles.active,
    settings={},restartPending=config.needsRestart(),weapons=json.array()}
  for key,value in pairs(config.flat) do
    if not args.prefix or key:sub(1,#args.prefix)==args.prefix then out.settings[key]=value end
  end
  for index,w in ipairs(ctx.run and ctx.run.player.weapons or {}) do
    out.weapons[#out.weapons+1]={slot=index,id=w.id,level=w.level,
      graph=w.graph and G.toTable(w.graph),source="live_memory"}
  end
  return out
end
function I.runtime(ctx)
  local r=ctx.run
  local out={world=identity(ctx),weapons=json.array(),strikes=json.array(),enemies=json.array()}
  if not r then return out end
  out.player={x=r.player.x,y=r.player.y,aimX=r.player.facingX,aimY=r.player.facingY,
    fireSignal=r.fireSignal}
  for index,w in ipairs(r.player.weapons) do
    local rt=w.mws
    local item={slot=index,id=w.id,version=rt and rt.version,
      sequences=json.array(),triggers=json.array()}
    if rt and rt.version==2 then
      item.valid=rt.valid item.stats=rt.stats item.runtimeTime=rt.time
      item.generation=rt.generation
      item.problems=arrayCopy(rt.problems)
      for _,seq in ipairs(rt.sequences) do
        item.sequences[#item.sequences+1]={id=seq.id,root=seq.root.id,parent=seq.parent,
          capacity=seq.capacity,refill=seq.rate,charge=seq.energy}
      end
      for _,id in ipairs(w.graph.order) do
        local n=w.graph.nodes[id] local info=rt.info[id]
        if n.type=="trigger" then
          item.triggers[#item.triggers+1]={id=id,subclass=n.props.subclass,
            hot=info and info.hot==1,sequence=info and info.sequence}
        end
      end
    end
    out.weapons[#out.weapons+1]=item
  end
  for _,s in ipairs(r.strikes) do
    local strike=D.strike(r,s)
    strike.x,strike.y,strike.dirX,strike.dirY=s.x,s.y,s.dirX,s.dirY
    strike.hitCount=s.hitCount strike.payloads=arrayCopy(s.payloadIds)
    out.strikes[#out.strikes+1]=strike
  end
  -- Enough context to explain Seeking and hits, with a bounded response.
  out.enemyCount=#r.enemies
  for i=1,math.min(100,#r.enemies) do
    local e=r.enemies[i]
    out.enemies[#out.enemies+1]={kind=e.id,x=e.x,y=e.y,hp=e.hp,radius=e.radius,dead=e.dead==true}
  end
  out.enemiesTruncated=#r.enemies>100
  return out
end
function I.events(ctx,args)
  if not ctx.run or not ctx.run.trace then return {world=identity(ctx),events=json.array()} end
  local result=ctx.run.trace:read(args.after,args.limit)
  result.world=identity(ctx)
  return result
end
function I.call(name,args,ctx)
  if name=="get_active_config" then return I.config(ctx,args)
  elseif name=="get_runtime_state" then return I.runtime(ctx)
  elseif name=="get_recent_events" then return I.events(ctx,args) end
  error("Unknown inspection tool")
end
return I
