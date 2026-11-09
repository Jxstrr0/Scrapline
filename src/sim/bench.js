/* ---- sim/bench.js: the seven bench tests (six from plan section 6, the test dummy from 0.1.38), and WEDGE_GAUGES. Each test takes an evalBuild() result (or a
   cfg) and measures it by running it, mostly at the fight's 60 Hz step, so a measured number can differ from evalBuild's
   prediction: the drive test's bot may not reach top speed on the track, a spinner's motor has less torque at low rpm,
   the endurance run has real bursts and real derating. Nothing here is random and nothing is kept: the rig is safe
   (Kelbo, PR 3), so the impact and drop tests report what would break on a fresh bot.
     benchDrive      a short track: top speed reached, time over it, pull to one side; a spin on the spot
     benchWeapon     spinners: spin-up trace, stored energy, a hit on a fixed anvil, rpm lost, recoil; flippers and
                     lifters: test masses; hammers, crushers, wedges and pushers: strike or ram energy
     benchImpact     a swinging mass hits each face harder and harder (single hits on a fresh bot) until a part behind
                     it is destroyed: when the plate gives, which part dies first and at what energy (sim/damage.js)
     benchGauge      feeler gauges at WEDGE_GAUGES slid under the front edge: who gets under you, who you get under
     benchEndurance  fight-pace bursts (drive and weapon) until the battery is flat: runtime, heat, when motors derate
     benchDrop       a drop from a big flipper throw, landing upright and upside down: damage, can it still drive, can
                     it get back on its wheels
     benchDummy      the bot let loose on three boxes that don't fight back (BENCH_DUMMIES), in the real fight sim: hits,
                     damage, what breaks and when (0.1.38)
   runBench(x, id) runs one by id; BENCH_TESTS lists them with their workshop hours (the drive and weapon tests are free).
   stressReport(b, measured) (sim/combos.js) uses the results in place of the predictions. ---- */
const WEDGE_GAUGES={      // the leading-edge heights (mm) of the wedges, lifters and forks common in each class, low to high
  ant:    [0.5,1,1.5,2,3],
  beetle: [1,1.5,2,3,4,6],
  hobby:  [1,2,3,4,6,8],
  feather:[1.5,2,3,5,7,10],
  heavy:  [2,3,4,6,9,12]
};
const BENCH={
  dummy:{S:20,seed:38,style:"aggressive",skill:0.8,traceS:0.5},   // the test dummy: seconds a dummy, the fight's seed, who drives your bot, the chart's step
  trackM:2.4,        // drive test track, beetle scale (x len)
  pullYaw:0.12,      // heading drift from an off-centre COM: pull x this x speed / track width (rad/s)
  spinTorque:3,      // a spinner motor's torque runs out below 1/3 of top rpm (full power only above it)
  windage:0.1,       // share of spin-up power lost to air and bearings at top rpm
  kickShare:0.06,    // share of a spinner hit's energy that kicks the attacker back (x the weapon's recoil)
  testMass:[0.5,0.75,1,1.25],   // flipper and lifter test masses, x the class limit
  impactStartJ:2,    // impact test: the first swing (J at beetle scale, x mass) ...
  impactStep:1.15,   // ... each swing this much harder ...
  impactMaxJ:4000,   // ... and nothing in the class hits harder than this
  cycleS:10,         // endurance: one burst cycle; the drive runs the first K.driveDuty of it, the weapon K.weaponDuty
  weaponFrom:0.4,    //   starting this far into it (so they overlap, as they do in a fight)
  enduranceMaxS:600,
  derate:0.5,        // an overheated motor group runs at this share of power ...
  recoverAt:0.85,    // ... until it cools below this share of its heat budget
  dropM:0.7,         // drop test height at beetle scale (x len): a big flipper throw
  dropShare:0.5,     // share of the landing the bot takes (the rest goes into the floor and the bounce)
  threatJ:120        // a big spinner hit in the class (J at beetle scale, x mass): a face that breaks below it is a weak side
};
const BENCH_TESTS=[   // hours: workshop hours at beetle scale (x hoursScale), charged from PR 7
  {id:"drive",    name:"Drive",       hours:0},
  {id:"weapon",   name:"Weapon",      hours:0},
  {id:"impact",   name:"Impact",      hours:2},
  {id:"gauge",    name:"Wedge gauge", hours:0.5},
  {id:"endurance",name:"Endurance",   hours:1.5},
  {id:"drop",     name:"Drop",        hours:1},
  {id:"dummy",    name:"Test dummy",  hours:1}
];
/* the test dummies (0.1.38): three boxes that don't drive and don't fight back, soft to hard. Built from parts like any
   bot, in the class on the bench, so a hit on one does what it would do to a real opponent built that way. */
const BENCH_DUMMIES=[
  {id:"ply",  name:"Plywood box",   line:"a first-season bot",
    cfg:{chassis:"ply",armour:{front:"hdpe6",back:"hdpe6",left:"hdpe6",right:"hdpe6",top:"hdpe6"},drive:"single",wheels:"foam",battery:"small",electronics:"basic",weapon:"none",weaponMaterial:"steel",extras:[]}},
  {id:"alu",  name:"Aluminium box", line:"a mid-table bot",
    cfg:{chassis:"alu",armour:{front:"alu",back:"alu",left:"alu",right:"alu",top:"hdpe10"},drive:"dual",wheels:"rubber",battery:"med",electronics:"dual",weapon:"none",weaponMaterial:"steel",extras:[]}},
  {id:"steel",name:"Armoured brick",line:"the hardest box in the class",
    cfg:{chassis:"steel",armour:{front:"ar500",back:"ar500",left:"ar500",right:"ar500",top:"steel"},drive:"gearbox",wheels:"pu",battery:"large",electronics:"failsafe",weapon:"none",weaponMaterial:"steel",extras:["skid","bar"]}}
];
const asBuild=x=>x&&x.armourMapJ?x:evalBuild(x);

/* a part key in words: "left front drive pod", "Large LiPo", "Vertical spinner" */
function benchPartName(b,key){const p=b.parts.find(q=>q.key===key);if(!p)return key;
  if(p.caster)return"swivel caster";
  if(p.slot==="drive"||p.slot==="wheels"){const side=p.pos[0]<0?"left":"right",same=b.parts.filter(q=>q.slot===p.slot&&!q.caster&&(q.pos[0]<0)===(p.pos[0]<0));
    const ys=same.map(q=>q.pos[1]),fb=same.length>1?(p.pos[1]>=Math.max(...ys)?" front":p.pos[1]<=Math.min(...ys)?" rear":" middle"):"";
    return side+fb+(p.slot==="drive"?" drive pod":" wheel");}
  const pp=part(p.slot==="extras"?"extras":p.slot,p.id);return pp?pp.name:key;}

function benchDrive(x){const b=asBuild(x),M=classMult(b.cls),dt=1/STEP_HZ,d=b.drive,m=Math.max(b.massKg,1e-6),track=BENCH.trackM*M.len;
  const w=Math.max(b.trackM,1e-3),trace=[[0,0,0]];let v=0,s=0,t=0,th=0,lat=0,top=0,n=0;
  const moves=d.f0>d.resistN&&d.v0>0;
  while(moves&&s<track&&t<30){const F=Math.min(d.f0*Math.max(0,1-v/d.v0),d.tractionN);v=Math.max(0,v+(F-d.resistN)/m*dt);
    th+=b.pull*BENCH.pullYaw*v/w*dt;s+=v*Math.cos(th)*dt;lat+=v*Math.sin(th)*dt;t+=dt;if(v>top)top=v;if(++n%3===0)trace.push([t,v,lat]);}
  if(moves)trace.push([t,v,lat]);
  let om=0,ang=0,ts=0;if(b.turnRate>0&&b.turnAccel>0)while(ang<2*Math.PI&&ts<20){om=Math.min(b.turnRate,om+b.turnAccel*dt);ang+=om*dt;ts+=dt;}
  return{id:"drive",moves,trackM:track,timeS:moves&&s>=track?t:null,topSpeed:top,predicted:b.driveSpeed,driftMm:lat*1000,
    spinS:ang>=2*Math.PI?ts:null,turnDegS:b.turnRate*180/Math.PI,pushN:b.pushN,trace};}

function benchWeapon(x){const b=asBuild(x),w=b.weapon,dt=1/STEP_HZ,m=Math.max(b.massKg,1e-6),g=K.g,wp=part("weapon",b.cfg.weapon);
  const r={id:"weapon",type:w.type,name:wp?wp.name:w.type,hitJ:0};
  if((w.type==="spinner"||w.type==="saw")&&w.inertia>0&&w.spinPowerW>0){const I=w.inertia,wm=w.omega,P=w.spinPowerW;
    const tau0=BENCH.spinTorque*P/wm,c=BENCH.windage*P/(wm*wm*wm);
    const spin=(from,stop)=>{let om=from,t=0,n=0,t90=null;const tr=[[0,from/wm]];
      while(t<60){const tq=Math.min(tau0,om>0?P/om:tau0)-c*om*om;om=Math.min(wm,om+tq/I*dt);t+=dt;
        if(t90==null&&om>=0.9*wm)t90=t;if(++n%4===0)tr.push([t,om/wm]);if(om>=stop*wm)break;}
      tr.push([t,om/wm]);return{t,t90,tr};};
    const up=spin(0,0.99),hitJ=w.storedJ*w.bite,after=wm*Math.sqrt(Math.max(0,1-w.bite)),back=spin(after,0.9);
    const full=up.tr[up.tr.length-1][1]>=0.99;   // spinUpS and t90 are null if it never gets there in 60 s
    Object.assign(r,{kind:"spin",rpm:w.rpm,storedJ:w.storedJ,tipSpeed:w.tipSpeed,spinUpS:full?up.t:null,t90:up.t90,predicted:w.spinUpS,trace:up.tr,
      hitJ,rpmAfter:after*60/(2*Math.PI),recoverS:back.t,recoilMm:1000*hitJ*BENCH.kickShare*(w.recoil||0)/(Math.max(b.grip,0.1)*m*g),
      shearJ:w.shearJ,bendJ:w.bendJ});
    return r;}
  if(w.type==="flipper"||w.type==="lifter"||w.type==="grabber"){const rows=BENCH.testMass.map(f=>{const kg=f*b.limitKg,lifts=w.canLiftKg>=kg;
      const h=!lifts?0:w.type==="flipper"?Math.max(0,w.launchJ*K.flipEff/(kg*g)-(wp.strokeMm*classMult(b.cls).len/1000)):w.liftM;
      return{kg,lifts,heightM:h};});
    const lim=rows.find(q=>q.kg===b.limitKg)||rows[2],v0=Math.sqrt(2*g*lim.heightM),tr=[];
    if(w.type==="flipper"&&v0>0){const T=2*v0/g;for(let i=0;i<=40;i++){const t=T*i/40;tr.push([t,Math.max(0,v0*t-g*t*t/2)]);}}
    Object.assign(r,{kind:w.type==="flipper"?"flip":"lift",rows,canLiftKg:w.canLiftKg,shots:w.shots||null,rechargeS:w.rechargeS||null,
      launchJ:w.launchJ||0,forceN:w.forceN||w.liftN||0,hitJ:w.type==="flipper"?w.launchJ*K.flipEff:w.energyJ,trace:tr});
    return r;}
  if(w.type==="hammer")return Object.assign(r,{kind:"hammer",energyJ:w.energyJ,swingS:w.swingS,hitJ:w.energyJ*(w.bite||1)});
  if(w.type==="crusher")return Object.assign(r,{kind:"crush",energyJ:w.energyJ,forceN:w.forceN,hitJ:w.energyJ});
  const ramJ=0.5*m*b.driveSpeed*b.driveSpeed;
  return Object.assign(r,{kind:"ram",ramJ,pushN:b.pushN,edgeMm:b.height.frontEdgeMm,reachM:w.reachM||0,hitJ:ramJ});}

function benchImpact(x){const b=asBuild(x),M=classMult(b.cls),faces={};let weakest=null;
  for(const f of FACES){const A=b.armourMapJ[f],steps=[];let plateJ=A.hpJ>0?null:0,firstJ=null,failJ=null,fail=null,chain=[];
    for(let E=BENCH.impactStartJ*M.mass;E<=BENCH.impactMaxJ*M.mass;E*=BENCH.impactStep){const h=hitFace(b,f,E);
      steps.push([E,A.hpJ>0?h.plate/A.hpJ:1,h.parts.length?Math.min(1,h.parts[0].dmg/Math.max(b.parts.find(p=>p.key===h.parts[0].key).hpJ,1e-9)):0]);
      if(plateJ==null&&h.plateBroken)plateJ=E;
      if(firstJ==null&&h.parts.length)firstJ=E;
      const dead=h.parts.find(p=>p.destroyed);
      if(dead){failJ=E;fail=dead.key;chain=h.parts.map(p=>({key:p.key,name:benchPartName(b,p.key),dmg:p.dmg,destroyed:p.destroyed}));break;}}
    faces[f]={armour:A.name,absorbJ:A.absorbJ,hpJ:A.hpJ,plateJ,firstJ,failJ,failKey:fail,failName:fail?benchPartName(b,fail):null,chain,steps};
    if(f!=="top"&&failJ!=null&&(weakest==null||failJ<faces[weakest].failJ))weakest=f;}
  return{id:"impact",faces,weakest,maxJ:BENCH.impactMaxJ*M.mass};}

function benchGauge(x){const b=asBuild(x),M=classMult(b.cls),tol=WEDGE_RULES.tolMm*M.edge,e=b.height.frontEdgeMm;
  const rows=(WEDGE_GAUGES[b.cls]||[]).map(mm=>({mm,under:mm<e-tol,youUnder:e<mm-tol}));
  return{id:"gauge",edgeMm:e,tolMm:tol,rows,under:rows.filter(q=>q.under).length,youUnder:rows.filter(q=>q.youUnder).length};}

function benchEndurance(x){const b=asBuild(x),P=b.power,h=b.heat,dt=0.25,cyc=BENCH.cycleS,dOn=K.driveDuty*cyc,
    w0=BENCH.weaponFrom*cyc,w1=w0+K.weaponDuty*cyc,drawW=P.weaponW>0,hasW=!!h.weapon&&drawW,ps=b.powerScale,trace=[[0,1,0,0]];
  let bat=P.batteryWs,t=0,qd=0,qw=0,dDer=false,wDer=false,dAt=null,wAt=null,peakD=0,peakW=0,derS=0,n=0;
  const grp=(q,on,full,g,der)=>Math.max(0,q+(g.rateW*(full>0?on/full:0)-g.coolW)*dt);
  while(bat>0&&t<BENCH.enduranceMaxS){const ph=t%cyc;
    /* the battery or ESC holds the motors to powerScale of full power, as evalBuild has it (and as the drive and weapon
       tests feel it); an overheated group backs off further */
    const dW=ph<dOn?P.driveW*ps*(dDer?BENCH.derate:1):0,wW=drawW&&ph>=w0&&ph<w1?P.weaponW*ps*(wDer?BENCH.derate:1):0;
    bat-=(dW+wW+P.idleW)*dt;
    qd=grp(qd,dW,P.driveW*ps,h.drive);if(!dDer&&qd>=h.drive.budgetJ){dDer=true;if(dAt==null)dAt=t;}else if(dDer&&qd<=BENCH.recoverAt*h.drive.budgetJ)dDer=false;
    if(hasW){qw=grp(qw,wW,P.weaponW*ps,h.weapon);if(!wDer&&qw>=h.weapon.budgetJ){wDer=true;if(wAt==null)wAt=t;}else if(wDer&&qw<=BENCH.recoverAt*h.weapon.budgetJ)wDer=false;}
    if(dDer||wDer)derS+=dt;
    const fd=h.drive.budgetJ>0?qd/h.drive.budgetJ:0,fw=hasW&&h.weapon.budgetJ>0?qw/h.weapon.budgetJ:0;if(fd>peakD)peakD=fd;if(fw>peakW)peakW=fw;
    t+=dt;if(++n%4===0)trace.push([t,Math.max(0,bat)/P.batteryWs,fd,fw]);}
  return{id:"endurance",runtimeS:bat<=0?t:null,ranS:t,driveDerateS:dAt,weaponDerateS:hasW?wAt:null,derateS:dAt==null?wAt:wAt==null?dAt:Math.min(dAt,wAt),
    hotPart:wAt!=null&&(dAt==null||wAt<dAt)?"weapon":"drive",deratedS:derS,peakDrive:peakD,peakWeapon:hasW?peakW:null,hasWeapon:hasW,
    predicted:{runtimeS:b.runtimeS,derateS:b.heat.fightDerateS},trace};}

function benchDrop(x){const b=asBuild(x),M=classMult(b.cls),hM=BENCH.dropM*M.len,E=b.massKg*K.g*hM*BENCH.dropShare;
  const alive=(st,k)=>!(k in st.parts)||st.parts[k]>0;
  const canDrive=st=>{const side=s=>b.parts.some(p=>p.slot==="drive"&&(p.pos[0]<0)===(s<0)&&alive(st,p.key))&&b.parts.some(p=>p.slot==="wheels"&&!p.caster&&(p.pos[0]<0)===(s<0)&&alive(st,p.key));
    return side(-1)&&side(1)&&alive(st,"battery")&&alive(st,"electronics");};
  const skid=b.cfg.extras.indexOf("skid")>=0?part("extras","skid").underAbsorbJ*M.mass:0;
  /* on its wheels: the landing goes through the unarmoured underside into the wheels and drive pods (landHit, sim/damage.js) */
  const up=damageState(b),upParts=landHit(b,up,E,false).parts.map(p=>({key:p.key,name:benchPartName(b,p.key),dmg:p.dmg,frac:p.dmg/b.parts.find(q=>q.key===p.key).hpJ,destroyed:p.destroyed}));
  const inv=damageState(b),hit=hitFace(b,"top",E,inv);
  const righter=b.cfg.extras.indexOf("selfright")>=0?alive(inv,"selfright"):b.back&&b.back.selfRights&&!part("weapon",b.cfg.weapon).selfRights?alive(inv,"back"):b.height.selfRight&&alive(inv,"weapon");
  const invDrive=canDrive(inv);
  const outcome=b.height.drivesInverted&&invDrive?"drives":b.height.selfRight&&righter&&invDrive?"rights":"stuck";
  return{id:"drop",heightM:hM,energyJ:E,skidJ:Math.min(E,skid),
    upright:{parts:upParts,canDrive:canDrive(up),worst:upParts.reduce((a,p)=>p.frac>(a?a.frac:0)?p:a,null)},
    inverted:{hit,parts:hit.parts.map(p=>({key:p.key,name:benchPartName(b,p.key),dmg:p.dmg,destroyed:p.destroyed})),canDrive:invDrive,righter,outcome}};}

/* the test dummy (0.1.38): the bot is let loose on each of BENCH_DUMMIES for BENCH.dummy.S seconds in the test box, driven
   by the AI (BENCH.dummy.style at .skill), in the real fight sim with a fixed seed, so the numbers are what the same hits
   do in a fight. The dummy has no driver and is never counted out; the run stops early once it couldn't carry on (dead,
   or no drive on either side). For each: hits landed, energy dealt, the biggest hit, the damage as a share of all the
   dummy has, what broke first and when, when it was first put on its back, what the bot did to itself (recoil, its own
   weapon), and a trace [t, share] for the chart. spec is the fight (newFight's options) so the app can play it back. */
function benchDummySpec(b,d){const cls=b.cls;return{seed:BENCH.dummy.seed,arena:"box",rules:{roundS:BENCH.dummy.S,koS:1e9},
  bots:[{cfg:b.cfg,name:"Your bot",driver:{style:BENCH.dummy.style,skill:BENCH.dummy.skill}},{cfg:Object.assign({},d.cfg,{cls}),name:d.name}]};}
function benchDummy(x){const b=asBuild(x),rows=[];
  for(const d of BENCH_DUMMIES){const F=newFight(benchDummySpec(b,d)),me=F.bots[0],t=F.bots[1],trace=[[0,0]];let seen=0,bigJ=0,first=null,invT=null,outT=null,next=BENCH.dummy.traceS;
    while(!F.over){stepFight(F,null);
      for(;seen<F.log.length;seen++){const e=F.log[seen];if(e.v!==t.i)continue;
        if((e.k==="hit"||e.k==="grind"||e.k==="ram")&&e.E>bigJ)bigJ=e.E;
        if(e.k==="fail"&&e.what==="part"&&!first)first={key:e.key,name:benchPartName(t.b,e.key),t:F.t};}
      if(invT==null&&t.inverted&&!t.air)invT=F.t;
      if(F.t>=next-1e-9){trace.push([F.t,damageShare(t.b,t.st)]);next+=BENCH.dummy.traceS;}
      const sd=t.fx.sides;if(t.fx.dead||(sd&&sd.left&&sd.right&&sd.left.out&&sd.right.out)){outT=F.t;break;}}
    const share=damageShare(t.b,t.st),st=partStates(t.b,t.st);trace.push([F.t,share]);
    rows.push({id:d.id,name:d.name,line:d.line,massKg:t.b.massKg,hits:me.stats.hits,dealtJ:me.stats.dealt,bigJ,share,first,invT,outT,ranS:F.t,steps:F.n,
      why:outT==null?null:t.fx.dead||"drive",broke:Object.keys(st).filter(k=>st[k]==="destroyed").map(k=>benchPartName(t.b,k)),
      stuck:invT!=null&&t.inverted&&!t.b.height.drivesInverted,selfJ:me.stats.taken,selfShare:damageShare(me.b,me.st),trace});}
  return{id:"dummy",S:BENCH.dummy.S,rows};}
const BENCH_RUN={drive:benchDrive,weapon:benchWeapon,impact:benchImpact,gauge:benchGauge,endurance:benchEndurance,drop:benchDrop,dummy:benchDummy};
/* run one test by id on a build (or cfg); runBench(x) runs them all: {drive, weapon, impact, gauge, endurance, drop, dummy} */
function runBench(x,id){const b=asBuild(x);if(id)return BENCH_RUN[id]?BENCH_RUN[id](b):null;
  const out={};for(const t of BENCH_TESTS)out[t.id]=BENCH_RUN[t.id](b);return out;}
