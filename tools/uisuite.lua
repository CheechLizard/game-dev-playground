-- Drive the real immediate-mode widgets with Lua pointer samples. No OS input.
local tests={}
function tests.run(suite,check,eq,near)
  local previousLove=love
  local ok,err=pcall(function()
    local function fixture(height)
      local windowHeight=height or 480
      local mouse={x=0,y=0,down=false}
      local dy,stack=0,{}
      local labels={}
      local font={getWidth=function(_,s) return #tostring(s)*6 end,getHeight=function() return 8 end,
        setFilter=function() end}
      local currentFont=font
      local function noop() end
      love={mouse={getPosition=function() return mouse.x,mouse.y end,
        isDown=function() return mouse.down end},timer={getTime=function() return 0 end},
        keyboard={isDown=function() return false end},
        graphics={setColor=noop,rectangle=noop,line=noop,setScissor=noop,
          setLineWidth=noop,circle=noop,polygon=noop,setFont=function(f) currentFont=f end,
          newFont=function() return font end,
          print=function(s,x,y) labels[#labels+1]={text=s,x=x,y=y+dy,font=currentFont} end,
          printf=function(s,x,y) labels[#labels+1]={text=s,x=x,y=y+dy,font=currentFont} end,
          getFont=function() return currentFont end,
          getWidth=function() return 640 end,getHeight=function() return windowHeight end,
          getDimensions=function() return 640,windowHeight end,
          transformPoint=function(x,y) return x,y+dy end,
          push=function() stack[#stack+1]=dy end,
          pop=function() dy=table.remove(stack) end,
          translate=function(_,y) dy=dy+y end}}
      local u=dofile("shared/framework/ui.lua")
      for _,key in ipairs({"background","fg","accent","line","dim","warn","danger","panel"}) do
        u.theme[key]={1,1,1,1}
      end
      u.halftone=noop
      local function frame(x,y,down,draw,wheel,key)
        mouse.x,mouse.y,mouse.down=x,y,down labels={}
        u.beginFrame()
        if wheel then u.wheelmoved(0,wheel) end
        if key then u.keypressed(key) end
        draw()
        u.drawDeferred()
        u.endFrame()
        return labels
      end
      return u,frame,font,function(h) windowHeight=h end
    end
    suite("ui: dropdown click lifecycle")
    do
      local u,frame=fixture()
      local value,changes,underlying="alpha",0,false
      local function draw()
        u.layout(20,20,200)
        local changed
        value,changed=u.dropdown("test","Choice",value,{"alpha","beta","gamma"})
        if changed then changes=changes+1 end
        u.layout(20,60,200)
        underlying=u.toggle("under","Under the menu",underlying)
      end
      frame(160,30,true,draw) frame(160,30,false,draw)
      check("opening release leaves the dropdown open",u.dropdownOpen())
      frame(160,72,false,draw)
      check("moving to an option keeps the dropdown open",u.dropdownOpen())
      frame(160,72,true,draw)
      check("pressing an option waits for release",u.dropdownOpen())
      frame(160,72,false,draw) frame(160,72,false,draw)
      eq("selected option reaches its widget",value,"beta")
      eq("selection is reported exactly once",changes,1)
      eq("option clicks do not toggle the widget underneath",underlying,false)
      check("selection closes the list",not u.dropdownOpen())
      frame(160,30,true,draw) frame(160,30,false,draw)
      frame(160,30,true,draw) frame(160,30,false,draw)
      check("clicking the same header closes the list",not u.dropdownOpen())
      frame(160,30,true,draw) frame(160,30,false,draw)
      frame(400,300,true,draw) frame(400,300,false,draw)
      check("a later outside click dismisses the list",not u.dropdownOpen())
      eq("dismissal does not change the selection",value,"beta")
      frame(160,30,true,draw) frame(160,30,false,draw)
      check("dropdown owns keyboard input while open",u.capturingKeyboard())
      frame(160,30,false,draw,nil,"escape")
      check("Escape dismisses the list",not u.dropdownOpen())
      frame(400,300,true,draw) frame(160,30,false,draw)
      check("releasing an unrelated drag over the header does not open it",not u.dropdownOpen())
    end
    suite("ui: dropdown inside a scrolled inspector")
    do
      local u,frame=fixture()
      local value="alpha"
      local function draw()
        u.beginScroll("inspector",20,100,250,140)
        u.space(200)
        value=u.dropdown("scrolled","Choice",value,{"alpha","beta","gamma"})
        u.space(300)
        u.endScroll("inspector",20,100,250,140)
      end
      frame(200,180,false,draw)
      frame(200,180,false,draw,-4)
      frame(200,174,true,draw)
      local labels=frame(200,174,false,draw)
      check("scrolled dropdown opens at its visible position",u.dropdownOpen())
      local row
      for _,label in ipairs(labels) do if label.text=="beta" then row=label end end
      check("popup options draw outside the scroll transform",row and row.y>=204 and row.y<224)
      frame(200,216,true,draw) frame(200,216,false,draw) frame(200,216,false,draw)
      eq("scrolled popup selects the visible option",value,"beta")
    end
    suite("ui: dropdown window edges and long lists")
    do
      local u,frame,_,resize=fixture(180)
      local values={} for i=1,20 do values[i]="option "..i end
      local value=values[1]
      local function draw()
        u.layout(20,150,200)
        value=u.dropdown("long","Choice",value,values)
      end
      frame(160,160,true,draw)
      local labels=frame(160,160,false,draw)
      check("bottom-edge dropdown stays open",u.dropdownOpen())
      local count=0 local visible=true
      for _,label in ipairs(labels) do
        if label.text:match("^option ") then
          count=count+1 visible=visible and label.y>=0 and label.y+8<=180
        end
      end
      check("long popup is bounded by the window",visible and count<20)
      frame(160,100,false,draw,-0.5)
      labels=frame(160,100,false,draw,-0.5)
      local second
      for _,label in ipairs(labels) do if label.text=="option 2" then second=label end end
      check("fractional wheel motion accumulates into whole option rows",second~=nil)
      labels=frame(160,100,false,draw,-100)
      local last
      for _,label in ipairs(labels) do if label.text=="option 20" then last=label end end
      check("scrolling exposes the last option",last~=nil)
      if last then
        frame(160,last.y+4,true,draw) frame(160,last.y+4,false,draw) frame(160,last.y+4,false,draw)
        eq("last option can be selected",value,"option 20")
      end
      frame(160,160,true,draw) frame(160,160,false,draw)
      frame(160,100,false,draw,-100)
      resize(480)
      labels=frame(160,100,false,draw)
      local invalid=false
      for _,label in ipairs(labels) do if label.text=="nil" then invalid=true end end
      check("resizing a scrolled popup does not draw nonexistent options",not invalid)
    end
    suite("ui: deferred dropdown font")
    do
      local u,frame,font=fixture()
      local heading={getWidth=function(_,s) return #s*32 end,getHeight=function() return 48 end}
      local function draw()
        love.graphics.setFont(font)
        u.layout(20,20,200) u.dropdown("font","Choice","alpha",{"alpha","beta"})
        love.graphics.setFont(heading)
      end
      frame(160,30,true,draw)
      local labels=frame(160,30,false,draw)
      local option
      for _,label in ipairs(labels) do if label.text=="beta" then option=label end end
      check("deferred options keep their widget's font",option and option.font==font)
      eq("deferred drawing restores the previous font",love.graphics.getFont(),heading)
    end
    suite("ui: buttons, sliders and steppers")
    do
      local u,frame=fixture()
      local presses,disabled=0,0
      local function draw()
        u.layout(20,20,200)
        if u.button("button","Button") then presses=presses+1 end
        if u.button("disabled","Disabled",{disabled=true}) then disabled=disabled+1 end
      end
      frame(50,30,true,draw) frame(50,30,true,draw)
      eq("holding a button does not activate early",presses,0)
      frame(50,30,false,draw) frame(50,30,false,draw)
      eq("button activates once on release",presses,1)
      frame(50,30,true,draw) frame(400,300,false,draw)
      eq("dragging out cancels a button press",presses,1)
      frame(50,54,true,draw) frame(50,54,false,draw)
      eq("disabled buttons never activate",disabled,0)
      local value=50
      local function slider()
        u.layout(20,20,200) value=u.slider("slider","Value",value,0,100)
      end
      frame(100,42,true,slider) frame(140,42,true,slider)
      near("slider drag is relative to its starting value",value,70)
      frame(500,42,true,slider)
      eq("slider drag clamps at the upper limit",value,100)
      frame(500,42,false,slider) frame(20,42,false,slider)
      eq("released sliders stop following the mouse",value,100)
      local stepped=2
      local function stepper()
        u.layout(20,20,200) stepped=u.stepper("steps","Count",stepped,1,3,1,{integer=true})
      end
      frame(210,30,true,stepper) frame(210,30,false,stepper)
      eq("stepper increments",stepped,3)
      frame(210,30,true,stepper) frame(210,30,false,stepper)
      eq("stepper respects its maximum",stepped,3)
    end
    suite("ui: text and numeric editing")
    do
      local u,frame=fixture()
      local value,commits="",0
      local function draw()
        u.layout(20,20,200)
        local changed value,changed=u.textField("text","Name",value)
        if changed then commits=commits+1 end
      end
      frame(180,30,true,draw) frame(180,30,false,draw)
      u.textinput("hello") frame(180,30,false,draw,nil,"return")
      eq("Enter commits text",value,"hello")
      eq("text commit is delivered once",commits,1)
      frame(180,30,true,draw) frame(180,30,false,draw)
      u.textinput(" changed") frame(180,30,false,draw,nil,"escape")
      eq("Escape cancels text changes",value,"hello")
      value=""
      frame(180,30,true,draw) frame(180,30,false,draw)
      u.textinput("é") frame(180,30,false,draw,nil,"backspace")
      frame(180,30,false,draw,nil,"return")
      eq("backspace removes a complete UTF-8 character",value,"")
      frame(180,30,true,draw) frame(180,30,false,draw)
      u.textinput("saved") frame(400,200,true,draw) frame(400,200,false,draw)
      eq("clicking away commits text",value,"saved")
      frame(180,30,true,draw) frame(180,30,false,draw)
      frame(180,30,false,function() end)
      check("a removed field releases keyboard focus",not u.capturingKeyboard())

      u,frame=fixture()
      local number=5
      local function numeric()
        u.layout(20,20,200) number=u.slider("number","Value",number,0,10)
      end
      frame(210,26,true,numeric) frame(210,26,false,numeric)
      frame(210,26,false,numeric,nil,"backspace") u.textinput("99")
      frame(210,26,false,numeric,nil,"return")
      eq("typed numeric values are clamped",number,10)
      frame(210,26,true,numeric) frame(210,26,false,numeric)
      frame(210,26,false,numeric,nil,"backspace") frame(210,26,false,numeric,nil,"backspace")
      u.textinput("oops") frame(210,26,false,numeric,nil,"return")
      eq("invalid numeric text leaves the previous value",number,10)
      frame(210,26,true,numeric) frame(210,26,false,numeric)
      frame(210,26,false,numeric,nil,"backspace") frame(210,26,false,numeric,nil,"backspace")
      u.textinput("7") frame(400,200,true,numeric) frame(400,200,false,numeric)
      eq("clicking away commits a numeric edit",number,7)
    end
    suite("ui: switching fields in either draw order")
    do
      local u,frame=fixture()
      local first,second="",5
      local function draw()
        u.layout(20,20,200)
        first=u.textField("first","Name",first)
        second=u.slider("second","Value",second,0,100)
      end
      frame(210,50,true,draw) frame(210,50,false,draw)
      frame(210,50,false,draw,nil,"backspace") u.textinput("27")
      frame(180,30,true,draw) frame(180,30,false,draw)
      eq("switching to an earlier field commits the later field",second,27)
      u.textinput("title")
      frame(210,50,true,draw) frame(210,50,false,draw)
      eq("switching to a later field commits the earlier field",first,"title")
      frame(210,50,false,draw,nil,"escape")
      frame(400,200,true,draw) frame(180,30,false,draw)
      check("releasing an unrelated drag does not focus a field",not u.capturingKeyboard())
    end
    suite("ui: clipping Unicode text")
    do
      local u,frame,font=fixture()
      font.getWidth=function(_,s)
        assert(not s:gsub("[\194-\244][\128-\191]+",""):find("[\128-\255]"),"truncated UTF-8")
        return #s*6
      end
      eq("ellipses preserve complete UTF-8 characters",u.ellipsise("ééééé",32),"é...")
      local function draw()
        u.layout(20,20,200) u.slider("number","Value",5,0,10)
      end
      frame(210,26,true,draw) frame(210,26,false,draw)
      u.textinput("ééééééé")
      local rendered=pcall(frame,210,26,false,draw)
      check("long numeric input clips without splitting UTF-8",rendered)
    end
    suite("ui: scroll boundaries and covered controls")
    do
      local u,frame=fixture()
      local offset
      local function draw()
        local _; _,offset=u.beginScroll("panel",20,100,250,100)
        u.space(300) u.endScroll("panel",20,100,250,100)
      end
      frame(150,150,false,draw)
      frame(150,150,false,draw,20)
      eq("scrolling above the first row never draws a negative offset",offset,0)
      frame(150,150,false,draw,-100)
      check("scrolling below the last row clamps before drawing",offset<=216)
      local presses=0
      local function covered()
        u.suspendInput()
        u.layout(20,20,200)
        if u.button("covered","Covered") then presses=presses+1 end
        u.resumeInput()
      end
      frame(50,30,true,covered) frame(50,30,false,covered)
      eq("covered panels receive no pointer clicks",presses,0)
    end
    suite("ui: editor sidebar pages remain reachable")
    do
      local u,frame,font=fixture(240)
      local oldUI,oldFonts=package.loaded["framework.ui"],package.loaded["framework.fonts"]
      package.loaded["framework.ui"]=u
      package.loaded["framework.fonts"]={set=function() return font end}
      local editor=dofile("shared/framework/editor.lua")
      package.loaded["framework.ui"],package.loaded["framework.fonts"]=oldUI,oldFonts
      local names={} for i=1,20 do names[i]="Page "..i end
      editor.pageNames=function() return names end
      editor.open,editor.page=true,names[1]
      local function draw() editor.draw() end
      frame(50,100,false,draw)
      local labels=frame(50,100,false,draw,-100)
      local last
      for _,label in ipairs(labels) do if label.text=="Page 20" then last=label end end
      check("sidebar scroll brings the final page above the footer",last and last.y>50 and last.y<220)
      if last then
        frame(50,last.y+4,true,draw) frame(50,last.y+4,false,draw)
        eq("a page below the original viewport can be selected",editor.page,"Page 20")
      end
    end
    suite("ui: weapon graph editing")
    do
      local u,frame,font=fixture()
      local oldUI,oldFonts=package.loaded["framework.ui"],package.loaded["framework.fonts"]
      package.loaded["framework.ui"]=u
      package.loaded["framework.fonts"]={get=function() return font end}
      local flow=dofile("shared/framework/mws/flowchart.lua")
      package.loaded["framework.ui"],package.loaded["framework.fonts"]=oldUI,oldFonts
      local G=require("framework.mws.graph")
      local g=G.newV2("ui-test")
      local a=G.addNode(g,"trigger",10,10)
      local b=G.addNode(g,"battery",130,10)
      local view=flow.newView()
      local function draw() flow.draw(view,g,0,0,600,300,{}) end
      frame(60,60,true,draw) frame(80,90,true,draw) frame(80,90,false,draw)
      eq("clicking selects the graph node",view.selected,a.id)
      eq("dragging changes node x in graph coordinates",a.x,20)
      eq("dragging changes node y in graph coordinates",a.y,25)
      frame(136,98,true,draw) frame(300,60,false,draw)
      eq("dragging output to a node connects it",a.outputs[1],b.id)
      frame(136,98,true,draw) frame(500,250,false,draw)
      eq("dragging a wired port to empty canvas disconnects",a.outputs[1],nil)
      frame(500,250,true,draw) frame(540,270,true,draw) frame(540,270,false,draw)
      near("canvas panning follows drag at current zoom",view.panX,-20)
      local oldZoom=view.zoom
      frame(500,250,false,draw,1)
      check("canvas wheel zooms",view.zoom>oldZoom)
    end
  end)
  love=previousLove
  if not ok then error(err) end
end
return tests
