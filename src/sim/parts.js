/* ---- parts.js: CLASSES (the five weight classes and how parts scale between them), PARTS (every slot's options), the
   chassis-grid helpers (footprints, where a part may sit, the automatic layout), DEFAULT_CFG and TEST_BUILDS.
   Plan sections 4a-4c. First-pass numbers are guesses, tuned in node (tools/sim-test.js, later tools/fight-test.js).

   Units: every part is written at BEETLE scale (1.5 kg) in grams, millimetres, watts, joules and thalers. classMult(cls)
   scales it to the class: masses by mass (limitG / 1500), lengths by len (chassis width / 180 mm; every chassis is 2:3), armour thickness by
   thick (= mass / len^2, so armour weight grows with the budget, not with the cube of size), spinner rpm by 1 / len (the
   same tip speed in every class), motor power and heat by power (mass^0.85 above a beetle: heavies spin up slower), edges by edge
   (len^0.5: a heavyweight wedge is a few mm, not 4x a beetle's), cost by prizeScale and hours by hoursScale.
   evalBuild (sim/build.js) is the one place these become kg, m, s, J and W.

   A config (cfg) is plain JSON, the same shape for the player, designs and opponents:
     {cls, chassis, armour:{front,back,left,right,top}, drive, wheels, battery, electronics, weapon, weaponMaterial,
      extras:[ids], layout:{<part key>:[x,y]}}
   Layout keys: drive0..drive3, battery, electronics, weapon, and extras that take cells (selfright, minibot). x runs
   left to right across the chassis, y from the front row (0) to the back. Missing or illegal places are filled by
   autoLayout(), so a cfg without a layout is still a whole bot. ---- */
const CLASSES={
  /* gridW x gridH chassis cells of cellMm; fp multiplies every part footprint (a heavyweight's grid is a beetle's at 2x).
     arenaId names the class's usual arena (ARENAS, PR 4b); partsTier the shop tier it opens on (PR 7). */
  ant:    {id:"ant",    name:"Antweight",    limitG:150,    arenaId:"tabletop",   partsTier:1,prizeScale:0.4,hoursScale:0.7,gridW:4,gridH:6, cellMm:25,fp:1},
  beetle: {id:"beetle", name:"Beetleweight", limitG:1500,   arenaId:"clubbox",    partsTier:1,prizeScale:1,  hoursScale:1,  gridW:4,gridH:6, cellMm:45,fp:1},
  hobby:  {id:"hobby",  name:"Hobbyweight",  limitG:5500,   arenaId:"clubbox",    partsTier:2,prizeScale:2.2,hoursScale:1.4,gridW:6,gridH:9, cellMm:50,fp:1},
  feather:{id:"feather",name:"Featherweight",limitG:14000,  arenaId:"regional",   partsTier:3,prizeScale:4,  hoursScale:1.8,gridW:6,gridH:9, cellMm:75,fp:1},
  heavy:  {id:"heavy",  name:"Heavyweight",  limitG:110000, arenaId:"eisenhalle", partsTier:4,prizeScale:20, hoursScale:3,  gridW:8,gridH:12,cellMm:90,fp:2}
};
const CLASS_IDS=["ant","beetle","hobby","feather","heavy"];
const BASE={limitG:1500,widthMm:180,cells:24};   // the beetle every part is written for
function classMult(id){const c=CLASSES[id]||CLASSES.beetle,mass=c.limitG/BASE.limitG,len=c.gridW*c.cellMm/BASE.widthMm;
  return{mass,len,thick:mass/(len*len),power:mass<1?mass:Math.pow(mass,0.85),edge:Math.sqrt(len),cost:c.prizeScale,hours:c.hoursScale,fp:c.fp};}

/* Every option: id, name, massG, cost (thalers), hours (workshop hours to fit), unlock ("start" | "tool:<id>" | "rnd:<id>",
   enforced from PR 7), hp (J of damage it takes before it is destroyed), plus the slot's own stats.
   fp:[w,h] is a footprint in chassis cells (beetle grid); null takes no cells. */
const PARTS={
  /* massPerCell x 24 cells is the bare box at beetle scale; flex weakens armour mounts (PR 4a); heightMm is the box's
     height; shape "wedge" cuts the two front corner cells off the grid */
  chassis:[
    {id:"ply",    name:"Plywood box",    massPerCell:13,hp:120,flex:0.30,heightMm:50,shape:"box",  cost:30, hours:4,unlock:"start"},
    {id:"hdpe",   name:"HDPE box",       massPerCell:14,hp:160,flex:0.40,heightMm:46,shape:"box",  cost:45, hours:4,unlock:"start"},
    {id:"alu",    name:"Aluminium box",  massPerCell:11,hp:200,flex:0.15,heightMm:42,shape:"box",  cost:80, hours:6,unlock:"tool:bandsaw"},
    {id:"steel",  name:"Steel box",      massPerCell:18,hp:300,flex:0.08,heightMm:40,shape:"box",  cost:70, hours:7,unlock:"tool:welder"},
    {id:"ti",     name:"Titanium box",   massPerCell:11,hp:320,flex:0.10,heightMm:38,shape:"box",  cost:350,hours:9,unlock:"rnd:titanium"},
    {id:"custom", name:"Custom shape",   massPerCell:10,hp:260,flex:0.12,heightMm:34,shape:"wedge",cost:300,hours:10,unlock:"rnd:custom"}
  ],
  /* per face. Mass is worked out from the face's area x thickMm x density (g/cm3), so it follows the chassis. absorbPerG and
     hpPerG are J per gram of plate: absorb is eaten before any damage, hp is what the plate takes before it is gone.
     deflect: 0..1 chance a glancing hit skids off. thickMm is at beetle scale (x thick in other classes). */
  armour:[
    {id:"none",  name:"None",              thickMm:0,  density:0,   absorbPerG:0,   hpPerG:0,  deflect:0,   cost:0, hours:0,  unlock:"start"},
    {id:"hdpe6", name:"HDPE, thin",        thickMm:2.4,density:0.95,absorbPerG:0.60,hpPerG:2.0,deflect:0.05,cost:6, hours:0.5,unlock:"start"},
    {id:"hdpe10",name:"HDPE, medium",      thickMm:4,  density:0.95,absorbPerG:0.60,hpPerG:2.0,deflect:0.05,cost:9, hours:0.5,unlock:"start"},
    {id:"hdpe15",name:"HDPE, thick",       thickMm:6,  density:0.95,absorbPerG:0.60,hpPerG:2.0,deflect:0.05,cost:13,hours:0.6,unlock:"start"},
    {id:"alu",   name:"Aluminium",         thickMm:2,  density:2.70,absorbPerG:0.40,hpPerG:2.5,deflect:0.10,cost:15,hours:1,  unlock:"tool:bandsaw"},
    {id:"steel", name:"Hardened steel",    thickMm:0.8,density:7.85,absorbPerG:0.25,hpPerG:3.5,deflect:0.25,cost:18,hours:1.2,unlock:"tool:drillpress"},
    {id:"ar500", name:"AR500",             thickMm:1.2,density:7.85,absorbPerG:0.30,hpPerG:4.0,deflect:0.35,cost:35,hours:1.5,unlock:"tool:welder"},
    {id:"ti",    name:"Titanium",          thickMm:1.2,density:4.50,absorbPerG:0.50,hpPerG:5.0,deflect:0.30,cost:90,hours:2,  unlock:"rnd:titanium"}
  ],
  /* the whole drive: pods (motor + gearbox) x pods, each pod fp cells, sitting against the left or right edge.
     speedMs no-load top speed and forceN stall push (both sides together) at beetle scale; powerW electrical draw flat out;
     heatW heat flat out; motorFrac the share of massG that is motor (the part that soaks heat). hp is per pod. */
  drive:[
    {id:"single",   name:"One motor a side",     pods:2,fp:[1,2],massG:70, motorFrac:0.6,speedMs:2.6,forceN:12,powerW:120,heatW:45,hp:40,cost:60, hours:2,  unlock:"start"},
    {id:"dual",     name:"Two motors a side",    pods:4,fp:[1,1],massG:130,motorFrac:0.6,speedMs:2.8,forceN:20,powerW:220,heatW:70,hp:30,cost:110,hours:3,  unlock:"start"},
    {id:"brushless",name:"Brushless",            pods:2,fp:[1,2],massG:80, motorFrac:0.5,speedMs:4.0,forceN:16,powerW:300,heatW:60,hp:30,cost:220,hours:3,  unlock:"rnd:brushless",brushless:true},
    {id:"gearbox",  name:"High-torque gearbox",  pods:2,fp:[1,2],massG:120,motorFrac:0.5,speedMs:2.0,forceN:30,powerW:200,heatW:55,hp:55,cost:160,hours:3.5,unlock:"tool:drillpress"}
  ],
  /* the set of wheels. grip is a friction coefficient; exposure 0..1 how far they stand proud of the sides (hit first);
     radiusMm decides clearance and whether the bot drives upside down. tracks never stand proud on top. */
  wheels:[
    {id:"foam",  name:"Foam",           massG:20, grip:0.80,radiusMm:30,exposure:0.60,hp:25,cost:10,hours:0.5,unlock:"start"},
    {id:"rubber",name:"Rubber",         massG:35, grip:1.00,radiusMm:28,exposure:0.50,hp:35,cost:20,hours:0.5,unlock:"start"},
    {id:"pu",    name:"Polyurethane",   massG:40, grip:1.15,radiusMm:27,exposure:0.45,hp:45,cost:35,hours:0.8,unlock:"tool:printer"},
    {id:"solid", name:"Solid hubs",     massG:60, grip:0.70,radiusMm:24,exposure:0.35,hp:80,cost:30,hours:0.8,unlock:"start"},
    {id:"tracks",name:"Tracks",         massG:110,grip:1.30,radiusMm:16,exposure:0.25,hp:60,cost:90,hours:2,  unlock:"tool:mill",tracks:true}
  ],
  /* capacityWs stored energy (W s), dischargeW the most it can deliver at once */
  battery:[
    {id:"small",name:"Small LiPo",          fp:[1,1],massG:45, capacityWs:16000,dischargeW:400,hp:25,cost:25,hours:0.3,unlock:"start"},
    {id:"med",  name:"Medium LiPo",         fp:[2,1],massG:70, capacityWs:28000,dischargeW:600,hp:30,cost:40,hours:0.3,unlock:"start"},
    {id:"large",name:"Large LiPo",          fp:[2,1],massG:110,capacityWs:42000,dischargeW:700,hp:35,cost:65,hours:0.4,unlock:"start"},
    {id:"hd",   name:"High-discharge LiPo", fp:[2,1],massG:85, capacityWs:26000,dischargeW:1100,hp:30,cost:80,hours:0.4,unlock:"rnd:cells"}
  ],
  /* maxPowerW the most the speed controllers pass; coolingW extra cooling; failsafe stops a dead receiver running away
     and keeps a battery hit from ending the fight as often (PR 4a); idleW the receiver and logic */
  electronics:[
    {id:"basic",    name:"Basic ESC",            fp:[1,1],massG:15,maxPowerW:300,heatW:6, coolingW:0, idleW:1,hp:20,cost:20,hours:1,  unlock:"start"},
    {id:"dual",     name:"Dual ESC",             fp:[1,1],massG:25,maxPowerW:550,heatW:8, coolingW:0, idleW:1,hp:25,cost:45,hours:1,  unlock:"start"},
    {id:"brushless",name:"Brushless ESC",        fp:[1,1],massG:30,maxPowerW:900,heatW:10,coolingW:0, idleW:1,hp:22,cost:90,hours:1.5,unlock:"rnd:brushless",brushless:true},
    {id:"failsafe", name:"Dual ESC + failsafe",  fp:[1,1],massG:30,maxPowerW:550,heatW:8, coolingW:0, idleW:1,hp:40,cost:70,hours:1.5,unlock:"start",failsafe:true},
    {id:"cooling",  name:"Dual ESC + fans",      fp:[1,1],massG:45,maxPowerW:550,heatW:8, coolingW:25,idleW:2,hp:25,cost:60,hours:1.5,unlock:"tool:printer"}
  ],
  /* type: none | wedge | lifter | flipper | hammer | spinner | crusher | saw. mount "front" means the mount touches the
     front row; "edge" any edge. massG is the structure (wedge plate, arm, forks, mount) and scales with the material;
     motorMassG the motor or the pneumatics. edgeMm the leading edge height (null: the chassis front is the edge).
     Spinners: discMass (g, x material), radius (mm), rpmMax, shapeK (I = shapeK m r^2: 0.5 a disc), bite (how much of the
     disc catches), recoil (how hard it kicks the attacker back). Flipper: shots, forceN, strokeMm, rechargeS. Lifter:
     liftN, liftMm. Hammer: swingS, energyJ. Crusher: forceN, crushJ. Saw: a small spinner that grinds (sawJps).
     selfRights: the weapon can push the bot back over. */
  weapon:[
    {id:"none",   name:"No weapon (pusher)",  type:"none",   fp:null, mount:"front",massG:0,  motorMassG:0,  powerW:0,  heatW:0, edgeMm:null,hp:0, cost:0,  hours:0,unlock:"start"},
    {id:"wedge",  name:"Wedge",               type:"wedge",  fp:null, mount:"front",massG:120,motorMassG:0,  powerW:0,  heatW:0, edgeMm:1,   hp:80,cost:25, hours:2,unlock:"start",reachMm:40},
    {id:"lifter", name:"Lifter",              type:"lifter", fp:[2,2],mount:"front",massG:160,motorMassG:110,powerW:120,heatW:25,edgeMm:2,   hp:60,cost:90, hours:4,unlock:"start",reachMm:60,liftN:70,liftMm:80,selfRights:true},
    {id:"flipper",name:"Flipper (pneumatic)", type:"flipper",fp:[2,3],mount:"front",massG:190,motorMassG:170,powerW:10, heatW:0, edgeMm:2,   hp:60,cost:180,hours:6,unlock:"tool:drillpress",reachMm:70,shots:12,forceN:450,strokeMm:40,rechargeS:1.0,selfRights:true},
    {id:"hammer", name:"Hammer",              type:"hammer", fp:[2,2],mount:"front",massG:170,motorMassG:130,powerW:200,heatW:30,edgeMm:3,   hp:60,cost:120,hours:5,unlock:"start",swingS:0.7,energyJ:25,selfRights:true},
    {id:"hsp",    name:"Horizontal spinner",  type:"spinner",fp:[2,2],mount:"edge", massG:40, motorMassG:90, powerW:300,heatW:40,edgeMm:null,hp:70,cost:150,hours:5,unlock:"start",discMass:300,radius:75,rpmMax:6000, shapeK:0.5, bite:0.75,recoil:1.0},
    {id:"vsp",    name:"Vertical spinner",    type:"spinner",fp:[2,2],mount:"front",massG:60, motorMassG:80, powerW:300,heatW:45,edgeMm:2.5, hp:70,cost:150,hours:5,unlock:"start",discMass:250,radius:50,rpmMax:9000, shapeK:0.5, bite:0.90,recoil:0.6},
    {id:"drum",   name:"Drum",                type:"spinner",fp:[2,1],mount:"front",massG:50, motorMassG:80, powerW:280,heatW:45,edgeMm:3,   hp:80,cost:140,hours:5,unlock:"start",discMass:280,radius:30,rpmMax:12000,shapeK:0.55,bite:1.00,recoil:0.4},
    {id:"under",  name:"Undercutter",         type:"spinner",fp:[2,1],mount:"front",massG:50, motorMassG:80, powerW:280,heatW:40,edgeMm:3,   hp:70,cost:140,hours:5,unlock:"start",discMass:250,radius:60,rpmMax:7000, shapeK:0.5, bite:0.80,recoil:0.9},
    {id:"crusher",name:"Crusher",             type:"crusher",fp:[2,3],mount:"front",massG:150,motorMassG:120,powerW:220,heatW:35,edgeMm:3,   hp:90,cost:260,hours:8,unlock:"rnd:crusher",forceN:900,crushJ:30},
    {id:"saw",    name:"Overhead saw",        type:"saw",    fp:[2,2],mount:"front",massG:100,motorMassG:90, powerW:260,heatW:50,edgeMm:3,   hp:60,cost:220,hours:7,unlock:"rnd:saw",discMass:80,radius:45,rpmMax:10000,shapeK:0.5,bite:0.5,recoil:0.2,sawJps:15}
  ],
  /* what the weapon's working part is made of: massMult on the disc / arm / wedge, hp the J it takes before it bends
     (the shaft shears at shearMult x hp of stored energy), bite multiplies the weapon's bite */
  weaponMaterial:[
    {id:"alu",  name:"Aluminium",  massMult:0.60,hp:90, shearMult:1.5,bite:0.70,cost:20, hours:0,  unlock:"start"},
    {id:"steel",name:"Steel",      massMult:1.00,hp:160,shearMult:1.5,bite:0.90,cost:30, hours:0,  unlock:"start"},
    {id:"s7",   name:"S7 tool steel",massMult:1.00,hp:260,shearMult:1.5,bite:1.00,cost:70,hours:1, unlock:"tool:mill"},
    {id:"ti",   name:"Titanium",   massMult:0.62,hp:220,shearMult:1.5,bite:0.85,cost:120,hours:1.5,unlock:"rnd:titanium"}
  ],
  /* any number of these. effect fields are read by evalBuild: selfRight, edgeMm (added to the front edge), underAbsorbJ
     (underside armour), frontAbsorbJ and frontDeflect (an anti-spinner bar), minibot */
  extras:[
    {id:"selfright",name:"Self-righter",     fp:[1,1],massG:60, hp:25,cost:50, hours:2,unlock:"start",selfRight:true},
    {id:"skid",     name:"Skid plate",       fp:null, massG:50, hp:60,cost:20, hours:1,unlock:"start",edgeMm:-1,underAbsorbJ:15},
    {id:"bar",      name:"Anti-spinner bar", fp:null, massG:70, hp:70,cost:30, hours:1.5,unlock:"tool:welder",frontAbsorbJ:15,frontDeflect:0.15},
    {id:"minibot",  name:"Minibot",          fp:[1,2],massG:150,hp:20,cost:120,hours:4,unlock:"rnd:minibot",minibot:true}
  ]
};
const PART_SLOTS=["chassis","drive","wheels","battery","electronics","weapon","weaponMaterial"];   // single-choice slots
const FACES=["front","back","left","right","top"];
function part(slot,id){const l=PARTS[slot];if(!l)return null;for(const p of l)if(p.id===id)return p;return null;}

/* a balanced first beetle: HDPE box, dual drive, vertical spinner, close to the limit */
const DEFAULT_CFG={cls:"beetle",chassis:"hdpe",
  armour:{front:"steel",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe15"},
  drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"vsp",weaponMaterial:"steel",extras:[],layout:{}};

/* fill a cfg's gaps from DEFAULT_CFG (and copy it, so callers can't change ours). An unknown id is swapped for the default
   part (unknown extras are dropped), so evalBuild, footprints and fitBill all see the same bot; unknownIds(cfg) lists them
   and evalBuild reports them. */
function normCfg(cfg){cfg=cfg&&typeof cfg==="object"?cfg:{};const d=DEFAULT_CFG,o={};
  o.cls=CLASSES[cfg.cls]?cfg.cls:d.cls;
  for(const s of PART_SLOTS)o[s]=part(s,cfg[s])?cfg[s]:d[s];
  o.armour={};const a=cfg.armour&&typeof cfg.armour==="object"?cfg.armour:{};
  for(const f of FACES)o.armour[f]=part("armour",a[f])?a[f]:d.armour[f];
  o.extras=Array.isArray(cfg.extras)?cfg.extras.filter((e,i,l)=>part("extras",e)&&l.indexOf(e)===i):[];
  o.layout={};const L=cfg.layout&&typeof cfg.layout==="object"?cfg.layout:{};
  for(const k in L)if(Array.isArray(L[k])&&L[k].length===2&&L[k].every(Number.isInteger))o.layout[k]=[L[k][0],L[k][1]];
  return o;}

/* the ids in a cfg that no part has: ["weapon \"zap\"", "front armour \"plate9\"", "extra \"jet\""] */
function unknownIds(cfg){const out=[];if(!cfg||typeof cfg!=="object")return out;
  for(const s of PART_SLOTS)if(cfg[s]!=null&&!part(s,cfg[s]))out.push(s+" \""+cfg[s]+"\"");
  if(cfg.armour&&typeof cfg.armour==="object")for(const f of FACES)if(cfg.armour[f]!=null&&!part("armour",cfg.armour[f]))out.push(f+" armour \""+cfg.armour[f]+"\"");
  if(Array.isArray(cfg.extras))for(const e of cfg.extras)if(!part("extras",e))out.push("extra \""+e+"\"");
  return out;}

/* ---- the chassis grid ---- */
/* cells that exist on this chassis: a box has them all; the custom shape cuts the front corners */
function cellOn(cls,chassisId,x,y){const c=CLASSES[cls],ch=part("chassis",chassisId)||PARTS.chassis[0];
  if(x<0||y<0||x>=c.gridW||y>=c.gridH)return false;
  if(ch.shape==="wedge"&&y<c.fp&&(x<c.fp||x>=c.gridW-c.fp))return false;
  return true;}
/* the parts that take cells, in placing order: [{key, slot, id, w, h, mount}] at this class's grid size */
function footprints(cfg){cfg=normCfg(cfg);const c=CLASSES[cfg.cls],m=c.fp,out=[];
  const add=(key,slot,id,fp,mount)=>{if(fp)out.push({key,slot,id,w:fp[0]*m,h:fp[1]*m,mount});};
  const w=part("weapon",cfg.weapon);if(w)add("weapon","weapon",w.id,w.fp,w.mount);
  const d=part("drive",cfg.drive)||part("drive",DEFAULT_CFG.drive);
  for(let i=0;i<d.pods;i++)add("drive"+i,"drive",d.id,d.fp,i%2?"right":"left");
  const b=part("battery",cfg.battery);if(b)add("battery","battery",b.id,b.fp,"any");
  const e=part("electronics",cfg.electronics);if(e)add("electronics","electronics",e.id,e.fp,"any");
  for(const x of cfg.extras){const p=part("extras",x);if(p)add(x,"extras",x,p.fp,"any");}
  return out;}
/* may a part of this footprint sit with its top-left cell at (x,y)? taken: a Set of "x,y" cells already used */
function placeOk(cfg,f,x,y,taken){const c=CLASSES[cfg.cls];
  if(f.mount==="front"&&y!==0)return false;
  if(f.mount==="edge"&&!(y===0||x===0||y+f.h===c.gridH||x+f.w===c.gridW))return false;
  if(f.mount==="left"&&x!==0)return false;
  if(f.mount==="right"&&x+f.w!==c.gridW)return false;
  for(let i=0;i<f.w;i++)for(let j=0;j<f.h;j++){if(!cellOn(cfg.cls,cfg.chassis,x+i,y+j))return false;if(taken&&taken.has((x+i)+","+(y+j)))return false;}
  return true;}
/* where a part goes if the player hasn't put it anywhere: weapon front and centre, drive pods on the sides (two near the
   middle, four front and back), battery in the middle, electronics behind it, extras at the back */
function preferred(c,f,podIndex,pods){const W=c.gridW,H=c.gridH,cx=Math.round((W-f.w)/2);
  if(f.slot==="weapon")return[cx,0];
  if(f.slot==="drive"){const x=f.mount==="left"?0:W-f.w;
    if(pods<=2)return[x,Math.round((H-f.h)/2)];
    return[x,podIndex<2?Math.round(H*0.25-f.h/2):Math.round(H*0.75-f.h/2)];}
  if(f.slot==="battery")return[cx,Math.round((H-f.h)/2)];
  if(f.slot==="electronics")return[cx,Math.round((H-f.h)/2)+c.fp];
  return[cx,H-f.h];}
/* place every part: the cfg's own layout where it is legal, else the nearest free legal spot to the preferred one.
   Returns {place:{key:[x,y]}, moved:[keys placed automatically], unplaced:[keys with no room]} */
function autoLayout(cfg){cfg=normCfg(cfg);const c=CLASSES[cfg.cls],fps=footprints(cfg),taken=new Set(),place={},moved=[],unplaced=[];
  const pods=fps.filter(f=>f.slot==="drive").length;
  const mark=(f,x,y)=>{place[f.key]=[x,y];for(let i=0;i<f.w;i++)for(let j=0;j<f.h;j++)taken.add((x+i)+","+(y+j));};
  /* the player's own places first, in order, so a later part can't push an earlier one out */
  const rest=[];
  for(const f of fps){const p=cfg.layout[f.key];if(p&&placeOk(cfg,f,p[0],p[1],taken))mark(f,p[0],p[1]);else rest.push(f);}
  for(const f of rest){const pi=+f.key.replace(/\D/g,"")||0,pr=preferred(c,f,pi,pods);let best=null,bd=1e9;
    for(let y=0;y<c.gridH;y++)for(let x=0;x<c.gridW;x++){if(!placeOk(cfg,f,x,y,taken))continue;
      const d=(x-pr[0])*(x-pr[0])+(y-pr[1])*(y-pr[1])*1.01+(x+y)*1e-6;if(d<bd){bd=d;best=[x,y];}}
    if(best){mark(f,best[0],best[1]);if(cfg.layout[f.key])moved.push(f.key);}else unplaced.push(f.key);}
  return{place,moved,unplaced};}

/* ---- TEST_BUILDS: one of each archetype, written for any class (layout left to autoLayout). tools/sim-test.js checks
   them in every class (each within 5% of the limit, apart from "sloppy" and "glass"); tools/fight-test.js (PR 4a) fights
   them. ---- */
const TEST_BUILDS=[
  {id:"wedge",  name:"Wedge",        cfg:{chassis:"steel",armour:{front:"ar500",back:"hdpe15",left:"ar500",right:"ar500",top:"hdpe15"},drive:"gearbox",wheels:"pu",battery:"large",electronics:"dual",weapon:"wedge",weaponMaterial:"steel",extras:["skid"]}},
  {id:"lifter", name:"Lifter",       cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe15",left:"steel",right:"steel",top:"hdpe15"},drive:"gearbox",wheels:"pu",battery:"large",electronics:"dual",weapon:"lifter",weaponMaterial:"steel",extras:[]}},
  {id:"flipper",name:"Flipper",      cfg:{chassis:"alu",armour:{front:"steel",back:"hdpe15",left:"steel",right:"steel",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"flipper",weaponMaterial:"steel",extras:[]}},
  {id:"hsp",    name:"Horizontal spinner",cfg:{chassis:"hdpe",armour:{front:"hdpe10",back:"hdpe10",left:"hdpe15",right:"hdpe15",top:"hdpe10"},drive:"single",wheels:"solid",battery:"hd",electronics:"dual",weapon:"hsp",weaponMaterial:"s7",extras:["selfright"]}},
  {id:"vsp",    name:"Vertical spinner",cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"vsp",weaponMaterial:"steel",extras:[]}},
  {id:"drum",   name:"Drum",         cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe10",left:"hdpe15",right:"hdpe15",top:"hdpe10"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"drum",weaponMaterial:"steel",extras:[]}},
  {id:"hammer", name:"Hammer",       cfg:{chassis:"alu",armour:{front:"ar500",back:"hdpe15",left:"ar500",right:"ar500",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"hammer",weaponMaterial:"steel",extras:[]}},
  {id:"under",  name:"Undercutter",  cfg:{chassis:"hdpe",armour:{front:"steel",back:"hdpe10",left:"hdpe15",right:"hdpe15",top:"hdpe15"},drive:"dual",wheels:"rubber",battery:"med",electronics:"dual",weapon:"under",weaponMaterial:"steel",extras:[]}},
  /* all weapon, no armour: it can't fill the budget without a bigger disc (disc profiles are R&D, PR 8), so it is
     allowed to come in light like "sloppy" */
  {id:"glass",  name:"Glass cannon", cfg:{chassis:"ply",armour:{front:"none",back:"hdpe6",left:"hdpe6",right:"hdpe6",top:"hdpe6"},drive:"dual",wheels:"foam",battery:"large",electronics:"dual",weapon:"hsp",weaponMaterial:"s7",extras:["selfright"]}},
  {id:"brick",  name:"Brick",        cfg:{chassis:"steel",armour:{front:"ar500",back:"ar500",left:"ar500",right:"ar500",top:"steel"},drive:"gearbox",wheels:"solid",battery:"large",electronics:"failsafe",weapon:"none",weaponMaterial:"steel",extras:["skid"]}},
  {id:"invert", name:"Invertible box",cfg:{chassis:"hdpe",armour:{front:"hdpe15",back:"hdpe15",left:"hdpe15",right:"hdpe15",top:"hdpe10"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"drum",weaponMaterial:"steel",extras:[]}},
  {id:"sloppy", name:"Sloppy budget",cfg:{chassis:"ply",armour:{front:"hdpe6",back:"none",left:"none",right:"none",top:"none"},drive:"single",wheels:"foam",battery:"small",electronics:"basic",weapon:"wedge",weaponMaterial:"alu",extras:[]}}
];
