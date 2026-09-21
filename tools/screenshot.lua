-- Lua-only capture launcher for macOS/Linux: no accessibility or desktop APIs.
-- The child LÖVE process captures its own rendered frame through capture.lua.
-- Run from the checkout root: luajit tools/screenshot.lua shot.png [flags]
package.path="shared/?.lua;shared/?/init.lua;"..package.path
local capture=require("framework.capture")
local ffi=require("ffi")
local function fail(message)
  io.stderr:write("screenshot: "..message.."\n") os.exit(1)
end
if not arg[1] or arg[1]=="--help" then
  print([[Usage: luajit tools/screenshot.lua output.png [capture options]
  --mode bench --at 2 --seed 7 --set bench.holdFire=true
  --frames 4 --every 0.5     writes output-001.png through output-004.png
  --editor Levels          captures the in-game editor too
Uses the game's Lua renderer only. Run from the checkout root.
LOVE_BIN overrides the LÖVE executable; SCREENSHOT_TIMEOUT defaults to 60 seconds.]])
  os.exit(arg[1] and 0 or 1)
end
local root=io.open("main.lua","r")
if not root then fail("run this tool from the checkout root") end root:close()
if ffi.os~="OSX" and ffi.os~="Linux" then fail("this launcher supports macOS and Linux") end
local args={"--capture",arg[1]}
for i=2,#arg do
  if arg[i]=="--hold" then fail("--hold is for interactive love runs, not this screenshot tool") end
  if arg[i]=="--capture" then fail("supply the output filename first, without --capture") end
  args[#args+1]=arg[i]
end
local plan,err=capture.parse(args)
if not plan then fail(err or "missing capture output") end
local timeout=tonumber(os.getenv("SCREENSHOT_TIMEOUT") or "60")
if not timeout or timeout<1 or timeout>600 then fail("SCREENSHOT_TIMEOUT must be 1 to 600 seconds") end

-- Direct process arguments avoid shell interpolation of paths or settings.
ffi.cdef[[
  int posix_spawnp(int *pid, const char *file, const void *actions,
    const void *attributes, char *const argv[], char *const envp[]);
  int waitpid(int pid, int *status, int options);
  int kill(int pid, int sig);
  struct screenshot_timespec { long seconds; long nanoseconds; };
  int nanosleep(const struct screenshot_timespec *req, void *remaining);
  char ***_NSGetEnviron(void);
  extern char **environ;
]]
local values={os.getenv("LOVE_BIN") or "love","."}
for _,v in ipairs(args) do values[#values+1]=v end
local argv=ffi.new("char *[?]",#values+1)
for i,v in ipairs(values) do argv[i-1]=ffi.cast("char *",v) end
local env=ffi.os=="OSX" and ffi.C._NSGetEnviron()[0] or ffi.C.environ
local pid,status=ffi.new("int[1]"),ffi.new("int[1]")
for i=1,plan.frames do
  local path=capture.outputPath(plan,i)
  local previous=io.open(path,"rb")
  if previous then
    previous:close()
    if not os.remove(path) then fail("cannot replace "..path) end
  end
end
local result=ffi.C.posix_spawnp(pid,values[1],nil,nil,argv,env)
if result~=0 then fail("could not launch LÖVE (error "..result..")") end
local started=os.time()
local pause=ffi.new("struct screenshot_timespec",{0,50000000})
while true do
  local done=ffi.C.waitpid(pid[0],status,1)
  if done==pid[0] then break end
  if done<0 and ffi.errno()~=4 then fail("could not read capture process status") end
  if os.time()-started>=timeout then
    ffi.C.kill(pid[0],9) ffi.C.waitpid(pid[0],status,0)
    fail("capture timed out after "..timeout.." seconds")
  end
  ffi.C.nanosleep(pause,nil)
end
if status[0]~=0 then fail("LÖVE failed (process status "..status[0]..")") end
for i=1,plan.frames do
  local path=capture.outputPath(plan,i)
  local f=io.open(path,"rb")
  if not f then fail("missing screenshot: "..path) end
  local signature=f:read(8) f:close()
  if signature~="\137PNG\13\10\26\10" then fail("invalid PNG: "..path) end
  print(path)
end
