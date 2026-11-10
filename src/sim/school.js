/* ---- school.js: the driving school (0.1.47, Kelbo). SCHOOL, DRILLS, drillSpec, drillStep, drillMedal, drillAuto.
   A drill is a short round in the real fight sim, in the school's own beetleweights (the same bots for everyone, so a
   medal is driving, not parts), on a floor laid out for it. newFight({drill: id}) sets it up: the drill's floor, the
   bots where it wants them (no ring, no jitter), a fixed seed. stepFight hands the end of each step to drillStep, which
   ticks the drill's steps off and ends the round; nobody is judged.
     DRILLS[i]   id, name, line (what to do), tip (how), kind, limitS (the round's length), medals [gold, silver, bronze],
                 bot (cfg), start [x, y, heading, upside down], others [{cfg, name, at: [x, y, heading], driver}],
                 arena (as sim/arenas.js), steps, zone [x, y, r] (hold), penS (time added per second on a lit grate)
     kind        "time"  do every step; the score is the seconds from your first touch of the controls to the last step
                         (plus penS), less is better. Out of time, in the pit or counted out: no score.
                 "hold"  the seconds your bot's centre is inside zone, of limitS. More is better.
                 "hit"   the biggest single hit on bot 1, in joules, in limitS. More is better.
     steps       {go: [x, y], r}        get your centre inside the ring (r: SCHOOL.gateR). With face (a heading, rad) and
                                        tol: only while pointing that way. With slow (m/s): only at or under that speed.
                                        With flip: the school turns you over as you reach it.
                 {hit: J}               land one hit of J or more on bot 1
                 {pit: 1}               bot 1 is in the pit
   Lengths are metres at beetle scale; headings are radians, 0 along +x, pi/2 up the floor. F.drill is the state the
   view draws from (k: the step you're on, steps, zone, hold, big, pen, t0, score, medal 0..3, pass, why).
   drillAuto(F) is the instructor: a plain path follower that drives bot 0 through any drill. tools/sim-test.js runs it
   to prove every drill can be done, and the app plays it back as the demonstration. ---- */
const SCHOOL={cls:"beetle",seed:0x5C01,gateR:0.15,tol:0.5,roundS:40};
const schoolBot=(id,over)=>Object.assign({},TEST_BUILDS.find(t=>t.id===id).cfg,over||{},{cls:SCHOOL.cls});
const SCHOOL_FLOOR={id:"school",name:"Driving school",sizeM:2.4,wallE:0.35,pit:null,hazards:[]};
const schoolFloor=o=>Object.assign({},SCHOOL_FLOOR,o||{});
const DRILLS=[
  {id:"cones",name:"Round the pit",kind:"time",limitS:40,medals:[7.5,10.5,16],
    line:"Eight rings round an open pit, in order. Near, far, near, far.",tip:"Lift off before a near ring: the pit is one bot's length behind it.",
    bot:schoolBot("wedge"),start:[0.9,-0.5,Math.PI/2],arena:schoolFloor({pit:{rect:[-0.2,-0.2,0.2,0.2],openS:0}}),
    steps:[[0.5,0],[0.67,0.67],[0,0.5],[-0.67,0.67],[-0.5,0],[-0.67,-0.67],[0,-0.5],[0.67,-0.67]].map(p=>({go:p}))},
  {id:"stop",name:"Stop on the mark",kind:"time",limitS:40,medals:[6.5,9,14],
    line:"Four marks. Each one only counts once you've all but stopped on it. The last is at the pit's edge.",tip:"Brake early. A bot at full speed needs about its own length to stop.",
    bot:schoolBot("wedge"),start:[-0.9,-0.9,0],arena:schoolFloor({pit:{rect:[-0.3,0.95,0.3,1.2],openS:0}}),
    steps:[{go:[0.8,-0.9],slow:0.25},{go:[0.8,0],slow:0.25},{go:[-0.8,0],slow:0.25},{go:[0,0.72],slow:0.25}]},
  {id:"line",name:"Hold the line",kind:"hold",limitS:20,medals:[17,13,8],zone:[0,0,0.42],
    line:"The brick wants you out of the ring. Stay in it for as much of twenty seconds as you can.",tip:"Meet it nose to nose and keep driving. Side on, you slide.",
    bot:schoolBot("wedge"),start:[0,-0.25,Math.PI/2],arena:schoolFloor(),
    others:[{cfg:schoolBot("brick"),name:"The brick",at:[0,0.9,-Math.PI/2],driver:{style:"aggressive",skill:0.7}}],steps:[]},
  {id:"target",name:"On target",kind:"hit",limitS:15,medals:[100,70,40],
    line:"One parked box, fifteen seconds. Your biggest single hit is your score.",tip:"A disc hits hardest at full speed: wait for the bar to fill, then drive in square.",
    bot:schoolBot("vsp"),start:[0,-0.9,Math.PI/2],arena:schoolFloor(),
    others:[{cfg:Object.assign({},BENCH_DUMMIES[1].cfg,{cls:SCHOOL.cls}),name:"The box",at:[0,0.5,-Math.PI/2]}],steps:[]},
  {id:"shove",name:"Into the pit",kind:"time",limitS:40,medals:[4.5,7,12],
    line:"Put the parked box in the pit.",tip:"Line up behind it first. A push off-centre spins it away from you.",
    bot:schoolBot("wedge"),start:[0.3,-0.95,Math.PI/2],arena:schoolFloor({pit:{rect:[-0.3,0.85,0.3,1.2],openS:0}}),
    others:[{cfg:Object.assign({},BENCH_DUMMIES[0].cfg,{cls:SCHOOL.cls}),name:"The box",at:[-0.35,-0.1,0]}],steps:[{pit:1}]},
  {id:"right",name:"Back on your wheels",kind:"time",limitS:40,medals:[9.5,13,19],
    line:"You start on your back. Self-right, reach the ring, and the school turns you over again. Three rings.",tip:"Hold Self-right the moment you're over, and have the stick pushed before the bot lands.",
    bot:schoolBot("hsp",{weapon:"none",extras:["selfright"]}),start:[-0.8,-0.8,0,true],arena:schoolFloor(),
    steps:[{go:[0.8,-0.8],flip:true},{go:[0.8,0.8],flip:true},{go:[-0.8,0.8]}]},
  {id:"slide",name:"Sideways",kind:"time",limitS:40,medals:[7.5,11,17],
    line:"Mecanum wheels. A ring only counts while your nose points up the floor, so slide to it: hold Slide and steer.",tip:"Let go of Slide to square the nose up, then hold it again.",
    bot:schoolBot("wedge",{wheelbase:"mecanum",drive:"dual",armour:{front:"steel",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe10"},extras:[]}),start:[-0.8,-0.8,Math.PI/2],arena:schoolFloor(),
    steps:[[0.7,-0.6],[-0.7,-0.2],[0.7,0.2],[-0.7,0.6],[0.7,0.9]].map(p=>({go:p,face:Math.PI/2,tol:0.45}))},
  {id:"grate",name:"Mind the grate",kind:"time",limitS:45,medals:[13.5,17,24],penS:3,
    line:"Six crossings of a furnace grate that lights every four seconds. Every second on it while it burns costs you three.",tip:"Watch the pilot light. Cross as the flame dies, not as it starts.",
    bot:schoolBot("wedge"),start:[-0.8,-0.75,0],
    arena:schoolFloor({hazards:[{type:"flame",rect:[-1.2,-0.22,1.2,0.22],warnS:1,activeS:1.6,periodS:4,startS:1.5,heatFrac:0.3,Jps:6,tickS:0.5}]}),
    steps:[[-0.8,0.75],[-0.3,-0.75],[0.2,0.75],[0.6,-0.75],[0.9,0.75],[0,-0.75]].map(p=>({go:p}))}
];
const drillOf=id=>DRILLS.find(d=>d.id===id)||null;
/* the fight a drill is (newFight's options); name and livery are the app's */
function drillSpec(id,me){const d=drillOf(id);if(!d)return null;
  return{seed:SCHOOL.seed,drill:d.id,arena:"box",rules:{roundS:d.limitS},
    bots:[Object.assign({cfg:d.bot,name:"School bot"},me||{})].concat((d.others||[]).map(o=>({cfg:o.cfg,name:o.name,driver:o.driver?Object.assign({},o.driver):null})))};}
/* newFight calls this once the bots exist: put them where the drill wants them and start its state */
function drillSetup(F,id){const d=drillOf(id),L=F.M.len;if(!d)return;
  const put=(o,p)=>{o.x=p[0]*L;o.y=p[1]*L;o.h=wrapA(p[2]||0);o.inverted=!!p[3];o.pw=worldPoly(o,o.poly);};
  put(F.bots[0],d.start);(d.others||[]).forEach((q,i)=>{if(F.bots[i+1])put(F.bots[i+1],q.at);});
  F.drill={id:d.id,kind:d.kind,k:0,n:d.steps.length,t0:d.kind==="time"?null:0,hold:0,big:0,pen:0,seen:0,score:null,medal:0,pass:false,why:null,
    zone:d.zone?[d.zone[0]*L,d.zone[1]*L,d.zone[2]*L]:null,
    steps:d.steps.map(s=>s.go?Object.assign({},s,{go:[s.go[0]*L,s.go[1]*L],r:(s.r||SCHOOL.gateR)*L,tol:s.tol||SCHOOL.tol,slow:s.slow?s.slow*Math.sqrt(L):0}):Object.assign({},s))};}
/* a score's medal: 3 gold, 2 silver, 1 bronze, 0 none */
function drillMedal(d,score){if(typeof d==="string")d=drillOf(d);if(!d||score==null)return 0;const m=d.medals,ok=v=>d.kind==="time"?score<=v+1e-9:score>=v-1e-9;
  return ok(m[0])?3:ok(m[1])?2:ok(m[2])?1:0;}
function drillEnd(F,pass,why){const D=F.drill,d=drillOf(D.id);
  D.score=d.kind==="hold"?r2(D.hold):d.kind==="hit"?Math.round(D.big):pass?r2(F.t-D.t0+D.pen):null;
  D.medal=d.kind==="time"&&!pass?0:drillMedal(d,D.score);D.pass=d.kind==="time"?pass:D.medal>0;D.why=why;
  F.over=true;F.endT=F.t;F.reason="drill";F.winner=D.pass?F.bots[0].team:null;logIt(F,{k:"end",w:F.winner,why:"drill"});}
/* the end of a drill's step, in place of the knockout and judges' rules */
function drillStep(F){const D=F.drill,d=drillOf(D.id),me=F.bots[0],it=F.bots[1],u=me.input||{};
  if(D.t0==null&&(u.throttle||u.steer||u.strafe||u.weapon||u.selfRight))D.t0=F.t-F.dt;
  let hitJ=0;for(;D.seen<F.log.length;D.seen++){const e=F.log[D.seen];if(e.a===0&&e.v===1&&(e.k==="hit"||e.k==="grind"||e.k==="ram")&&e.E>hitJ)hitJ=e.E;}
  if(hitJ>D.big)D.big=hitJ;
  if(d.penS&&!me.air)for(const h of F.arena.haz)if(h.type==="flame"&&flamePhase(F,h)===2&&inHaz(h,me))D.pen+=F.dt*d.penS;
  if(D.zone&&!me.out&&Math.hypot(me.x-D.zone[0],me.y-D.zone[1])<D.zone[2])D.hold+=F.dt;
  if(me.out){drillEnd(F,false,me.out);return;}
  const s=D.steps[D.k];
  if(s){let ok=false;
    if(s.go)ok=!me.air&&Math.hypot(me.x-s.go[0],me.y-s.go[1])<s.r&&(s.face==null||Math.abs(wrapA(me.h-s.face))<s.tol)&&(!s.slow||Math.hypot(me.vx,me.vy)<=s.slow);
    else if(s.hit)ok=hitJ>=s.hit*F.M.mass;
    else if(s.pit)ok=!!it&&it.out==="pit";
    if(ok){D.k++;if(s.flip&&!me.inverted){me.inverted=true;me.righting=0;logIt(F,{k:"inv",v:0,inv:1});}}}
  if(d.kind==="time"&&D.k>=D.n){if(D.t0==null)D.t0=0;drillEnd(F,true,"done");return;}
  if(F.t>=F.rules.roundS-1e-9)drillEnd(F,d.kind!=="time","time");}
/* the instructor: bot 0's input for this step */
function drillAuto(F){const D=F.drill,u={throttle:0,steer:0,weapon:0,selfRight:0,slide:0};if(!D||F.over)return u;
  const d=drillOf(D.id),me=F.bots[0],it=F.bots[1],sp=Math.hypot(me.vx,me.vy);
  if(me.inverted&&!me.b.height.drivesInverted){u.selfRight=1;return u;}
  const turn=a=>{const e=wrapA(a-me.h);u.steer=clamp1(-(2.6*e-0.1*me.w));return e;};
  const to=(x,y,stopR)=>{const dx=x-me.x,dy=y-me.y,dist=Math.hypot(dx,dy),a=Math.abs(turn(Math.atan2(dy,dx)));
    u.throttle=(a<0.35?1:a<1.2?Math.cos(a):0)*(stopR?Math.min(1,Math.max(0,(dist-stopR*0.3)/(sp*0.22+0.05))):1);return dist;};
  const s=D.steps[D.k];
  if(d.kind==="hold"){const dist=Math.hypot(me.x-D.zone[0],me.y-D.zone[1]);
    if(it&&dist<D.zone[2]*0.45){const e=Math.abs(turn(Math.atan2(it.y-me.y,it.x-me.x)));u.throttle=e<0.4&&Math.hypot(it.x-me.x,it.y-me.y)<me.rad+it.rad+0.08?1:0;}
    else to(D.zone[0],D.zone[1],D.zone[2]*0.3);
    return u;}
  if(d.kind==="hit"&&it){u.weapon=1;const w=me.b.weapon,up=!(w.omega>0)||me.wp.om>=w.omega*0.97,dist=Math.hypot(it.x-me.x,it.y-me.y);
    if(up)to(it.x,it.y);else if(dist<0.9*F.M.len){turn(Math.atan2(it.y-me.y,it.x-me.x));u.throttle=-0.6;}else turn(Math.atan2(it.y-me.y,it.x-me.x));
    return u;}
  if(!s)return u;
  if(s.pit&&it&&F.arena.pit){const r=F.arena.pit.rect,px=(r[0]+r[2])/2,py=(r[1]+r[3])/2,ax=it.x-px,ay=it.y-py,al=Math.hypot(ax,ay)||1,
      bx=it.x+ax/al*0.4*F.M.len,by=it.y+ay/al*0.4*F.M.len,off=Math.abs(wrapA(Math.atan2(it.y-me.y,it.x-me.x)-Math.atan2(py-it.y,px-it.x)));
    if(off<0.3)to(it.x,it.y);else to(bx,by,0.05);
    if(Math.hypot(me.x-px,me.y-py)<0.45*F.M.len&&Math.hypot(it.x-me.x,it.y-me.y)>me.rad+it.rad+0.1)u.throttle=Math.min(u.throttle,0);   // never follow it in
    return u;}
  if(s.go){const dx=s.go[0]-me.x,dy=s.go[1]-me.y;
    if(s.face!=null){const e=wrapA(s.face-me.h);if(Math.abs(e)>s.tol*0.4){turn(s.face);return u;}
      const c=Math.cos(me.h),sn=Math.sin(me.h),fw=dx*c+dy*sn,rt=dx*sn-dy*c;u.slide=1;u.throttle=clamp1(fw*5);u.steer=clamp1(rt*5);return u;}
    to(s.go[0],s.go[1],s.slow?s.r:0);
    for(const h of F.arena.haz)if(h.type==="flame"&&!inHaz(h,me)&&(me.y<h.rect[1])!==(s.go[1]<h.rect[1])&&[0.1,0.25,0.4,0.55].some(a=>flamePhase({t:F.t+a},h)===2)&&Math.abs(me.y-(h.rect[1]+h.rect[3])/2)<(h.rect[3]-h.rect[1])/2+me.rad+sp*0.3)u.throttle=Math.min(u.throttle,0);   // wait at the grate's edge while it's lit
    if(s.slow&&Math.hypot(dx,dy)<s.r&&sp>s.slow)u.throttle=0;}
  return u;}
