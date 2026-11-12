/* ---- parts.js: CLASSES (the five weight classes and how parts scale between them), PARTS (every slot's options), the
   chassis-grid helpers (footprints, where a part may sit, the automatic layout), DEFAULT_CFG and TEST_BUILDS.
   Plan sections 4a-4c. First-pass numbers are guesses, tuned in node (tools/sim-test.js, later tools/fight-test.js).

   Units: every part is written at BEETLE scale (1.5 kg) in grams, millimetres, watts, joules and euros. classMult(cls)
   scales it to the class: masses by mass (limitG / 1500), lengths by len (chassis width / 180 mm; every chassis is 2:3), armour thickness by
   thick (= mass / len^2, so armour weight grows with the budget, not with the cube of size), spinner rpm by 1 / len (the
   same tip speed in every class), motor power and heat by power (mass^0.85 above a beetle: heavies spin up slower), edges by edge
   (len^0.5: a heavyweight wedge is a few mm, not 4x a beetle's), cost by prizeScale and hours by hoursScale.
   evalBuild (sim/build.js) is the one place these become kg, m, s, J and W.

   A config (cfg) is plain JSON, the same shape for the player, designs and opponents:
     {cls, chassis, armour:{front,back,left,right,top}, drive, wheels, wheelbase, battery, electronics, weapon, weaponMaterial,
      front, back, extras:[ids], layout:{<part key>:[x,y]}, tune:{volt, wheel, bias, teeth}}   (tune: whole steps, TUNE below)
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

/* Every option: id, name, massG, cost (euros), hours (workshop hours to fit), unlock ("start" | "tool:<id>" | "rnd:<id>",
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
  /* the body: the shell's shape over the chassis, any material (0.1.14.0, Kelbo: real shapes, not paint). massMul and hpMul
     scale the chassis's own mass and hp, flexAdd adds to its flex, heightMul scales its height (a low body leaves the wheels
     proud, so it drives upside down; a tall one doesn't), edgeMm is added to the front edge (x class), deflect adds to each
     face's armour deflect (glancing hits), inverts: it drives upside down whatever the wheels. "plain" is the box as before. */
  body:[
    {id:"plain",  name:"Plain box",    massMul:1,   hpMul:1,   flexAdd:0,   heightMul:1,   edgeMm:0,   deflect:{},                    cost:0,  hours:0,unlock:"start",
      line:"The box as it comes. Nothing to add, nothing to get wrong."},
    {id:"scrap",  name:"Scrap frame",  massMul:0.8, hpMul:0.7, flexAdd:0.15,heightMul:1,   edgeMm:0,   deflect:{},                    cost:10, hours:2,unlock:"start",
      line:"An open tube frame with patched panels. Light and cheap, and it flexes: the armour mounts give."},
    {id:"slab",   name:"Slab",         massMul:1.1, hpMul:1.1, flexAdd:0,   heightMul:1,   edgeMm:0,   deflect:{left:0.1,right:0.1},  cost:30, hours:3,unlock:"start",
      line:"Chamfered edges, corner guards, bolt heads. Side hits glance off a little more often."},
    {id:"wedge",  name:"Wedge shell",  massMul:1.1, hpMul:1,   flexAdd:0,   heightMul:0.85,edgeMm:-0.5,deflect:{front:0.05,top:0.15}, cost:60, hours:5,unlock:"tool:welder",
      line:"The top slopes down to a low front. Hits on the top glance; less room inside."},
    {id:"dome",   name:"Dome",         massMul:1.12,hpMul:1.05,flexAdd:0,   heightMul:1.15,edgeMm:0,   deflect:{top:0.3},             cost:90, hours:6,unlock:"tool:press",
      line:"A rounded clamshell. Hammers and saws skate off the top, but it sits tall, so small wheels won't reach the floor upside down."},
    {id:"pancake",name:"Pancake",      massMul:0.95,hpMul:1,   flexAdd:0,   heightMul:0.7, edgeMm:0,   deflect:{top:0.1},             cost:70, hours:5,unlock:"tool:mill",
      line:"Very low and flat. Wheels stand proud, so it drives either way up; it rides on its wheels, so wedges get under it more easily."},
    {id:"invert", name:"Invertible",   massMul:1.2, hpMul:1,   flexAdd:0,   heightMul:1,   edgeMm:0,   deflect:{},                    cost:110,hours:7,unlock:"tool:cnc",
      line:"The same both ways up: it drives upside down and never needs to self-right. The heaviest body."},
    /* 0.1.63, the odd ones (Kelbo): a drum lying across the bot between two wheels taller than it. twoWheel: the wheels
       are at least wheelMul x the body's height across (they stand proud both ways up), the bot runs on one wheel a
       side (every pod drives it), so it turns on the spot easily (scrubMul) and slides when it is shoved (latMul) */
    {id:"cylinder",name:"Two-wheel drum",massMul:1.15,hpMul:1, flexAdd:0,   heightMul:1.1, edgeMm:0,   deflect:{front:0.15,back:0.15,top:0.25},cost:100,hours:6,unlock:"tool:lathe",
      inverts:true,twoWheel:true,wheelMul:1.5,scrubMul:0.45,latMul:0.7,
      line:"A drum between two big wheels. It drives either way up and hits glance off its curve, but two wheels turn on a coin and shove easily."}
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
  /* the wheel layout (0.1.31, Kelbo: odd drive, swivel wheels, more wheels for more drain). perSide: driven wheels a side
     (null: one per drive pod, as before); wheelMul x the wheel set's mass; massG extra (chains, caster, mounts); podG extra
     per drive pod (swerve's steering servos). The drive in the fight: gripMul x the tyres' grip, latMul x how hard they
     resist sliding sideways (mecanum rollers let a shove through), scrubMul x the scrub of turning, crrMul x rolling
     resistance, powerMul x the drive's draw and heat, underMul x the grip kept while sat on a wedge (the back wheels still
     reach the floor), strafe: the share of top speed it can slide sideways at (0: it can't), podsNeed: drive pods it
     needs (a mecanum wheel needs its own motor), caster: a swivel wheel at the back that can be hit (casterHp) and, broken,
     drags (DAMAGE.casterDrag). hpMul x each wheel's hp. Tracks run the whole side, so they only go with "std".
     Legs (0.1.34): speedMul x the top speed; limitMul x the class's weight limit (leagues let walkers and shufflers
     carry more, as they're so slow); the "wheels" are its feet. */
  wheelbase:[
    {id:"std",    name:"Wheel on each pod",   perSide:null,wheelMul:1,  massG:0, podG:0, gripMul:1,   latMul:1,   scrubMul:1,   crrMul:1,   powerMul:1,   underMul:1,  strafe:0,   hpMul:1,  cost:0,  hours:0,  unlock:"start",
      line:"A wheel on every drive pod. Nothing to add, nothing to go wrong."},
    {id:"caster", name:"Two wheels + caster", perSide:1,   wheelMul:0.7,massG:25,podG:0, gripMul:0.75,latMul:0.75,scrubMul:0.9, crrMul:0.9, powerMul:1,   underMul:1,  strafe:0,   hpMul:1,  cost:15, hours:1,  unlock:"start",caster:true,casterHp:20,
      line:"Two driven wheels in the middle and a swivel wheel at the back. Spins on the spot and runs light; pushes less, and a broken caster drags."},
    {id:"six",    name:"Six wheels",          perSide:3,   wheelMul:1.3,massG:20,podG:0, gripMul:1.1, latMul:1.1, scrubMul:1.15,crrMul:1.2, powerMul:1.12,underMul:2.5,strafe:0,   hpMul:1,  cost:40, hours:3,  unlock:"tool:drillpress",
      line:"Three chain-driven wheels a side. Pushes harder, keeps driving on a wedge and with a wheel gone; turns slower and drains more."},
    {id:"eight",  name:"Eight wheels",        perSide:4,   wheelMul:1.5,massG:25,podG:0, gripMul:1.2, latMul:1.2, scrubMul:1.15,crrMul:1.2, powerMul:1.25,underMul:3.5,strafe:0,   hpMul:1,  cost:70, hours:4.5,unlock:"tool:welder",
      line:"Four wheels a side. Hardest to lift or stop, and the heaviest and thirstiest drive. Turns like a lorry."},
    {id:"mecanum",name:"Mecanum wheels",      perSide:null,wheelMul:1.4,massG:0, podG:0, gripMul:0.8, latMul:0.35,scrubMul:0.8, crrMul:1.1, powerMul:1.1, underMul:1,  strafe:0.7, hpMul:0.7,cost:80, hours:3,  unlock:"tool:printer",podsNeed:4,
      line:"Rollers round each wheel let it slide sideways: step round a spinner and hit it in the side. It pushes badly and gets shoved about."},
    {id:"swerve", name:"Swerve pods",         perSide:null,wheelMul:1.1,massG:0, podG:50,gripMul:0.9, latMul:0.75,scrubMul:0.7, crrMul:1,   powerMul:1.2, underMul:1,  strafe:0.95,hpMul:0.75,cost:260,hours:6,  unlock:"rnd:swerve",
      line:"Every wheel turns on its own servo: it slides sideways and still pushes. Heavy, dear and hungry."},
    {id:"legs",   name:"Shuffler legs",       perSide:2,   wheelMul:1.8,massG:40,podG:0, gripMul:1,   latMul:1.3, scrubMul:1.3, crrMul:1.6, powerMul:1.15,underMul:2.5,strafe:0,   hpMul:1.5,cost:220,hours:6,  unlock:"rnd:legs",legs:true,speedMul:0.45,limitMul:1.15,
      line:"Cams and feet instead of wheels: four big shuffling legs. Slow, but the rules give walkers 15% more weight, and they're hard to shove."}
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
  /* type: none | wedge | lifter | flipper | hammer | spinner | crusher | saw | spear. mount "front" means the mount touches the
     front row; "edge" any edge. massG is the structure (wedge plate, arm, forks, mount) and scales with the material;
     motorMassG the motor or the pneumatics. edgeMm the leading edge height (null: the chassis front is the edge).
     Spinners: discMass (g, x material), radius (mm), rpmMax, shapeK (I = shapeK m r^2: 0.5 a disc), bite (how much of the
     disc catches), recoil (how hard it kicks the attacker back). Flipper: shots, forceN, strokeMm, rechargeS. Lifter:
     liftN, liftMm. Hammer: swingS, energyJ. Crusher: forceN, crushJ. Saw: a small spinner that grinds (sawJps).
     selfRights: the weapon can push the bot back over.
     The odd ones (0.1.34, Kelbo's build features, part four) hit all the way round (ALL_ROUND in sim/build.js): bodyR
     sizes the spinning part from the chassis instead of radius (x half its diagonal), bendMul x the hp it bends and
     shears at. Shell spinner: the whole shell over the bot spins. Ring spinner: a toothed hoop round a body that stays
     still. Meltybrain (melty): the whole bot spins on its drive and steers by pulsing its wheels once a turn; its
     stored energy is the whole bot's (bodyK x its mass x the radius squared), it drives both ways up (inverts), and a
     hard hit can lose its heading (FIGHT.melty). None of them leaves room for a front or a back.
     Two more verticals (0.1.46). Eggbeater (beater): an open frame cut from one billet, two bars on a wide axle. Light,
     quick to spin up and it bites deepest of all, but the frame bends early (bendMul 0.65). Drisk: a drum as narrow as a
     thick disc. The heaviest vertical and the hardest to bend (bendMul 1.25), with a narrow hit zone and a strong gyro.
     Thwackbot tail (0.1.63, Kelbo): a boom boomMm long off the back with a head of discMass on its end, and no motor of
     its own. Held, the drive spins the whole bot on the spot (like a meltybrain, FIGHT.thwack) and the head sweeps a circle
     round the centre of mass; the energy is the whole bot's spin (its yaw inertia, head and all, at rpmMax). The boom takes
     the back slot. Let go and it is a bot with a tail.
     Piston spear (0.1.64, Kelbo): a pneumatic ram down the middle with a hardened point. On the gas like a flipper (shots,
     forceN over strokeMm, rechargeS): each shot stabs the point out strokeMm past the front, and whatever face it meets
     takes the stroke's energy through part of its armour (FIGHT.spear.absorb) and a shove away. It doesn't lift and it
     doesn't right the bot; it fires either way up, and a front fits either side of it. */
  weapon:[
    {id:"none",   name:"No weapon (pusher)",  type:"none",   fp:null, mount:"front",massG:0,  motorMassG:0,  powerW:0,  heatW:0, edgeMm:null,hp:0, cost:0,  hours:0,unlock:"start"},
    {id:"wedge",  name:"Wedge",               type:"wedge",  fp:null, mount:"front",massG:120,motorMassG:0,  powerW:0,  heatW:0, edgeMm:1,   hp:80,cost:25, hours:2,unlock:"start",reachMm:40},
    {id:"lifter", name:"Lifter",              type:"lifter", fp:[2,2],mount:"front",massG:160,motorMassG:110,powerW:120,heatW:25,edgeMm:2,   hp:60,cost:90, hours:4,unlock:"start",reachMm:45,liftN:70,liftMm:80,selfRights:true},
    {id:"flipper",name:"Flipper (pneumatic)", type:"flipper",fp:[2,3],mount:"front",massG:190,motorMassG:170,powerW:10, heatW:0, edgeMm:2,   hp:60,cost:180,hours:6,unlock:"tool:drillpress",reachMm:70,shots:18,forceN:450,strokeMm:40,rechargeS:1.0,selfRights:true},
    {id:"flipper2",name:"High-pressure flipper",type:"flipper",fp:[2,3],mount:"front",massG:215,motorMassG:195,powerW:10,heatW:0,edgeMm:2,  hp:65,cost:320,hours:7,unlock:"rnd:pneumatics",reachMm:70,shots:24,forceN:560,strokeMm:42,rechargeS:0.7,selfRights:true},
    {id:"hammer", name:"Hammer",              type:"hammer", fp:[2,2],mount:"front",massG:170,motorMassG:130,powerW:200,heatW:30,edgeMm:3,   hp:60,cost:120,hours:5,unlock:"start",swingS:0.7,energyJ:30,selfRights:true},
    {id:"hsp",    name:"Horizontal spinner",  type:"spinner",fp:[2,2],mount:"edge", massG:40, motorMassG:90, powerW:300,heatW:40,edgeMm:null,hp:70,cost:150,hours:5,unlock:"start",discMass:300,radius:75,rpmMax:5600, shapeK:0.5, bite:0.62,recoil:1.0},
    {id:"vsp",    name:"Vertical spinner",    type:"spinner",fp:[2,2],mount:"front",massG:60, motorMassG:80, powerW:300,heatW:45,edgeMm:2.5, hp:70,cost:150,hours:5,unlock:"start",discMass:250,radius:50,rpmMax:9000, shapeK:0.5, bite:0.85,recoil:0.6},
    {id:"drum",   name:"Drum",                type:"spinner",fp:[2,1],mount:"front",massG:50, motorMassG:80, powerW:280,heatW:45,edgeMm:3,   hp:80,cost:140,hours:5,unlock:"start",discMass:280,radius:30,rpmMax:11000,shapeK:0.55,bite:0.88,recoil:0.4},
    {id:"beater", name:"Eggbeater",           type:"spinner",fp:[2,1],mount:"front",massG:35, motorMassG:80, powerW:280,heatW:45,edgeMm:3,   hp:65,cost:170,hours:6,unlock:"tool:mill",discMass:150,radius:36,rpmMax:9000, shapeK:0.8, bite:0.9, recoil:0.5,bendMul:0.65},
    {id:"drisk",  name:"Drisk (thick disc)",  type:"spinner",fp:[2,2],mount:"front",massG:50, motorMassG:80, powerW:300,heatW:45,edgeMm:2.5, hp:90,cost:170,hours:6,unlock:"tool:lathe",discMass:300,radius:42,rpmMax:9000, shapeK:0.5, bite:0.88,recoil:0.55,bendMul:1.25},
    {id:"under",  name:"Undercutter",         type:"spinner",fp:[2,1],mount:"front",massG:50, motorMassG:80, powerW:280,heatW:40,edgeMm:3,   hp:70,cost:140,hours:5,unlock:"start",discMass:250,radius:60,rpmMax:5500, shapeK:0.5, bite:0.62,recoil:0.9},
    {id:"crusher",name:"Crusher",             type:"crusher",fp:[2,3],mount:"front",massG:150,motorMassG:120,powerW:220,heatW:35,edgeMm:3,   hp:90,cost:260,hours:8,unlock:"rnd:crusher",forceN:900,crushJ:30},
    {id:"grabber",name:"Grabber",             type:"grabber",fp:[2,2],mount:"front",massG:170,motorMassG:120,powerW:150,heatW:25,edgeMm:2,   hp:70,cost:200,hours:7,unlock:"rnd:grabber",reachMm:50,liftN:95,liftMm:30},
    {id:"shell",  name:"Shell spinner",       type:"spinner",fp:[2,2],mount:"any",  massG:60, motorMassG:100,powerW:300,heatW:45,edgeMm:2,   hp:110,cost:260,hours:8,unlock:"tool:lathe",discMass:210,bodyR:1.0, rpmMax:2100, shapeK:0.75,bite:0.36,recoil:1.0},
    {id:"ring",   name:"Ring spinner",        type:"spinner",fp:[2,2],mount:"any",  massG:50, motorMassG:90, powerW:220,heatW:45,edgeMm:null,hp:60, cost:240,hours:8,unlock:"rnd:ring",discMass:200,bodyR:1.12,rpmMax:2000, shapeK:1.0, bite:0.36,recoil:1.0,bendMul:0.5},
    {id:"melty",  name:"Meltybrain",          type:"spinner",fp:null, mount:"front",massG:30, motorMassG:0,  powerW:200,heatW:0, edgeMm:null,hp:70, cost:300,hours:8,unlock:"rnd:melty",discMass:60,bodyR:1.05,rpmMax:1400, shapeK:1.0, bite:0.5, recoil:1.3,bodyK:0.33,inverts:true},
    {id:"thwack", name:"Thwackbot tail",      type:"spinner",fp:null, mount:"back", massG:70, motorMassG:0,  powerW:220,heatW:0, edgeMm:null,hp:90, cost:160,hours:6,unlock:"tool:welder",discMass:130,boomMm:105,rpmMax:720, shapeK:1.0, bite:0.7, recoil:1.2},
    {id:"spear",  name:"Piston spear",        type:"spear",  fp:[1,3],mount:"front",massG:150,motorMassG:160,powerW:10, heatW:0, edgeMm:null,hp:70, cost:200,hours:6,unlock:"tool:drillpress",shots:20,forceN:400,strokeMm:55,rechargeS:0.7},
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
  /* front (0.1.32): a swappable front on a bot whose weapon leaves the front free (a pusher, a spinner, a hammer, a
     crusher, a saw; a wedge, lifter, flipper or grabber is its own front). No cells: it hangs off the front face like a
     wedge plate. edgeMm the leading edge it gives (the lower of it and the weapon's), slope added to the chance a
     horizontal disc glances off the front (and a vertical disc bites its lip, FIGHT.lip), absorbJ added to the front
     plate's absorb, ramMul x the damage a ram with the front does to what it hits, underGrip the share of grip a bot it
     is under keeps on top of WEDGE_RULES.underGrip (forks have gaps: the other bot's wheels still touch). */
  front:[
    {id:"none",     name:"Plain front",  massG:0, hp:0, cost:0, hours:0,  unlock:"start",edgeMm:null,slope:0,   absorbJ:0, ramMul:1,  underGrip:0,
      line:"Whatever the armour and the weapon make of it."},
    {id:"wedgelets",name:"Wedgelets",    massG:60,hp:50,cost:30,hours:1.5,unlock:"start",edgeMm:1,   slope:0.35,absorbJ:0, ramMul:1,  underGrip:0,
      line:"Two little hinged wedges either side of the weapon. Gets under, and turns some of a spinner's hit."},
    {id:"forks",    name:"Forks",        massG:45,hp:35,cost:35,hours:2,  unlock:"tool:drillpress",edgeMm:0.6,slope:0,absorbJ:0,ramMul:1,underGrip:0.15,
      line:"Steel tines lower than any wedge: under almost anything. Gaps between them let a spinner in, and the bot on top keeps some grip."},
    {id:"plow",     name:"Plow",         massG:115,hp:75,cost:40,hours:2,  unlock:"tool:welder",edgeMm:1.5,slope:0.5,absorbJ:6, ramMul:1,  underGrip:0,
      line:"A wide curved scoop. Heavy, but a horizontal spinner skates off it and it soaks a hit."},
    {id:"spike",    name:"Ram spike",    massG:50,hp:60,cost:25,hours:1,  unlock:"start",edgeMm:null,slope:0,   absorbJ:0, ramMul:2.5,underGrip:0,
      line:"A hardened point on the front. Every ram hurts more; no help getting under."}
  ],
  /* back (0.1.32): the rear. edgeMm a low rear edge that gets under like a front one (null: the clearance), ramMul and
     absorbJ as the front's, on the back face. A kicker is a small pneumatic flipper facing backwards: it fires with the
     weapon button at a bot touching the back (kickN, strokeMm, shots, rechargeS; its own gas, its own power), and pushes
     the bot back over (selfRights). It takes cells (fp, mount "back": its footprint on the back row). */
  back:[
    {id:"none",     name:"Plain back",   fp:null, massG:0, motorMassG:0, powerW:0,hp:0, cost:0,  hours:0,  unlock:"start",edgeMm:null,absorbJ:0, ramMul:1,
      line:"Turn your back and it's a box."},
    {id:"rearwedge",name:"Rear wedge",   fp:null, massG:70,motorMassG:0, powerW:0,hp:50,cost:25, hours:1.5,unlock:"start",edgeMm:1.5,absorbJ:0, ramMul:1,
      line:"A low plate on the back. Something that comes at you from behind finds a wedge, not a wall."},
    {id:"rearspike",name:"Rear spike",   fp:null, massG:55,motorMassG:0, powerW:0,hp:55,cost:25, hours:1,  unlock:"start",edgeMm:null,absorbJ:10,ramMul:2,
      line:"A point on the back: a bot that shoves you from behind pays for it."},
    {id:"kicker",   name:"Back-up flipper",fp:[2,1],mount:"back",massG:80,motorMassG:90,powerW:5,hp:40,cost:150,hours:5,unlock:"tool:drillpress",edgeMm:2,absorbJ:0,ramMul:1,
      kickN:400,strokeMm:25,shots:10,rechargeS:1.5,reachMm:45,selfRights:true,
      line:"A small flipper facing backwards, on its own gas: flicks off anything that gets behind you, and rights you. Takes room and weight."}
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
/* your own disc profile (R&D "disc", PR 8): a spinner's cfg may carry disc {name, rim light|mid|heavy}. A heavier rim
   puts more of the disc's mass at the edge (disc mass x mass, I x shapeK), so it stores more energy and spins up slower.
   A medium rim is the stock disc (every factor 1). Spinners with a disc or a drum only (not the saw, a shell, a ring or
   a meltybrain).
   teeth: what each tooth count does (0.1.48: set by the Tooth count dial, TUNE.teeth below; before that it was part of
   the disc profile, 1 to 3). Fewer teeth bite deeper (bite x) and kick the bot harder (recoil x); more teeth take a
   smaller bite each, so the disc keeps its speed, kicks less, can hit the same bot again sooner (gap x
   FIGHT.hitGapS), still bites at a lower speed (spin x FIGHT.minSpin) and spreads the hit over more teeth, so it takes
   more to bend it or shear the shaft (bend x). Two teeth are stock (every factor 1). Tuned in 0.1.48 so that every
   count wins some matchups: one tooth for the big single hit, four or five for a disc that is always biting. */
const DISC_PROFILES={teeth:{1:{bite:1.12,recoil:1.15,gap:1.3,bend:0.92,spin:1.2},2:{bite:1,recoil:1,gap:1,bend:1,spin:1},3:{bite:0.94,recoil:0.85,gap:0.8,bend:1.1,spin:0.88},4:{bite:0.9,recoil:0.72,gap:0.64,bend:1.2,spin:0.78},5:{bite:0.86,recoil:0.6,gap:0.5,bend:1.3,spin:0.7}},
  rim:{light:{mass:0.85,shapeK:0.9,name:"light rim"},mid:{mass:1,shapeK:1,name:"medium rim"},heavy:{mass:1.2,shapeK:1.12,name:"heavy rim"}},nameMax:24};
/* the tuning dials (0.1.33, Kelbo; teeth 0.1.48): free settings on any bot, cfg.tune {volt, wheel, bias, teeth}, each a
   whole step from min to max (0 is stock). Free to turn (no parts, no hours), like moving parts on the grid. Per step:
     volt   more cells in series: the battery's mass, capacity and discharge x (1 + cells), the motors' power x
            (1 + power), drive speed and force, spinner rpm and hammer energy x (1 + speed), heat x (1 + heat) (never
            below heatMin). Up is faster and harder hitting, heavier and hotter; down runs cool and light.
     wheel  wheel diameter x (1 + size): ride height follows (sim/build.js, proud), wheel mass x (1 + mass), top speed x
            (1 + speed), push x (1 + force), wheel exposure x (1 + exposure). Big wheels drive upside down and run
            fast but lift the front edge for wedges; small ones push and sit low.
     bias   ballast shifted along the bot: the centre of mass moves com x the length (+ forward), the front edge x
            (1 + edge) (a heavy nose sits down on the floor), push x (1 + push) (a heavy tail loads the wheels).
     teeth  the disc's tooth count, base + the step (one to five; two is stock): DISC_PROFILES.teeth has what each count
            does. only: the dial is for these bots alone (tuneOn; "disc": a spinner with a disc or a drum, as the disc
            profile), and reads 0 on any other.
   labels: what the Build tab shows at each step, min first. */
const TUNE={
  volt: {min:-2,max:2,name:"Voltage",   cells:0.14,power:0.18,speed:0.06,heat:0.4,heatMin:0.4,labels:["Low","Lower","Stock","Higher","High"],
    line:"More cells: faster, harder hitting, heavier and hotter. Fewer: cool and light."},
  wheel:{min:-2,max:2,name:"Wheel size",size:0.15,mass:0.2,speed:0.08,force:-0.08,exposure:0.12,labels:["Smallest","Small","Stock","Big","Biggest"],
    line:"Big wheels ride high: fast, and they drive upside down, but wedges get under you. Small ones sit low and push."},
  bias: {min:-2,max:2,name:"Weight bias",com:0.04,edge:-0.12,push:-0.03,labels:["Tail","Back","Centre","Front","Nose"],
    line:"A heavy nose keeps the front edge on the floor; a heavy tail loads the wheels for pushing."},
  teeth:{min:-1,max:3,name:"Tooth count",base:2,only:"disc",labels:["One","Two","Three","Four","Five"],
    line:"Fewer teeth bite deeper, kick harder and bend sooner. More teeth take smaller bites: the disc keeps its speed, hits again sooner and still bites when it's slow."}
};
const TUNE_IDS=["volt","wheel","bias","teeth"];
/* does this dial do anything on a bot with this weapon? (teeth: a spinner with a disc or a drum) */
function tuneOn(k,weaponId){const T=TUNE[k];if(!T)return false;if(T.only!=="disc")return true;const w=part("weapon",weaponId);return!!w&&w.type==="spinner"&&!w.bodyR;}
/* a cfg's dials, cleaned: whole steps inside each dial's range, 0 for anything else */
function normTune(t){const o={};t=t&&typeof t==="object"?t:{};
  for(const k of TUNE_IDS){const v=Math.round(+t[k]);o[k]=isFinite(v)?Math.max(TUNE[k].min,Math.min(TUNE[k].max,v)):0;}
  return o;}
/* a minibot (extras "minibot", R&D, PR 8) is a real little bot: at the bell it drops off its parent as a small AI-driven
   wedge on the same team. It shoves and distracts but doesn't count for knockouts or the judges, and stops when its
   parent is out. It is built as cfg in the class below (cls: the class it's built in, by its parent's class; an
   antweight has nothing smaller). driver: its AI. */
const MINIBOT={cls:{beetle:"ant",hobby:"ant",feather:"beetle",heavy:"feather"},
  cfg:{chassis:"hdpe",armour:{front:"hdpe10",back:"hdpe6",left:"hdpe6",right:"hdpe6",top:"none"},drive:"single",wheels:"rubber",battery:"small",electronics:"basic",weapon:"wedge",weaponMaterial:"alu",extras:[]},
  driver:{style:"rush"}};
const PART_SLOTS=["chassis","body","drive","wheels","wheelbase","battery","electronics","weapon","weaponMaterial","front","back"];   // single-choice slots
const FACES=["front","back","left","right","top"];
function part(slot,id){const l=PARTS[slot];if(!l)return null;for(const p of l)if(p.id===id)return p;return null;}

/* a balanced first beetle: HDPE box, dual drive, vertical spinner, close to the limit */
const DEFAULT_CFG={cls:"beetle",chassis:"hdpe",body:"plain",
  armour:{front:"steel",back:"hdpe10",left:"hdpe10",right:"hdpe10",top:"hdpe15"},
  drive:"dual",wheels:"rubber",wheelbase:"std",battery:"large",electronics:"dual",weapon:"vsp",weaponMaterial:"steel",front:"none",back:"none",extras:[],layout:{},
  tune:{volt:0,wheel:0,bias:0,teeth:0}};

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
  o.tune=normTune(cfg.tune);   // 0.1.33: the tuning dials (all 0 for a cfg from before them)
  /* 0.1.48: a disc profile from before the Tooth count dial carried its own teeth (1 to 3): they go onto the dial, unless
     the cfg already has that dial (so old bots, designs and replay codes hit exactly as they did) */
  const lt=cfg.disc&&typeof cfg.disc==="object"?+cfg.disc.teeth:NaN;
  if(!(cfg.tune&&typeof cfg.tune==="object"&&cfg.tune.teeth!=null)&&(lt===1||lt===2||lt===3)&&DISC_PROFILES.rim[cfg.disc.rim])o.tune.teeth=lt-TUNE.teeth.base;
  for(const k of TUNE_IDS)if(!tuneOn(k,o.weapon))o.tune[k]=0;
  const dp=normDisc(cfg.disc);if(dp&&tuneOn("teeth",o.weapon))o.disc=dp;   // spinners with a disc only (not a shell, ring or meltybrain)
  return o;}
/* a disc profile, cleaned: {name, rim}, or null for the stock disc (or anything that isn't one) */
function normDisc(d){if(!d||typeof d!=="object")return null;const r=d.rim;
  if(!DISC_PROFILES.rim[r])return null;
  const name=String(d.name==null?"":d.name).replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,DISC_PROFILES.nameMax)||"Own disc";
  return{name,rim:r};}
/* the same disc to cut: the rim (the name is paint, not metal; the teeth are a dial) */
const sameDisc=(a,b)=>!a===!b&&(!a||a.rim===b.rim);

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
  const k=part("back",cfg.back);if(k&&k.fp)add("back","back",k.id,k.fp,k.mount);
  for(const x of cfg.extras){const p=part("extras",x);if(p)add(x,"extras",x,p.fp,"any");}
  return out;}
/* may a part of this footprint sit with its top-left cell at (x,y)? taken: a Set of "x,y" cells already used */
function placeOk(cfg,f,x,y,taken){const c=CLASSES[cfg.cls];
  if(f.mount==="front"&&y!==0)return false;
  if(f.mount==="back"&&y+f.h!==c.gridH)return false;
  if(f.mount==="edge"&&!(y===0||x===0||y+f.h===c.gridH||x+f.w===c.gridW))return false;
  if(f.mount==="left"&&x!==0)return false;
  if(f.mount==="right"&&x+f.w!==c.gridW)return false;
  for(let i=0;i<f.w;i++)for(let j=0;j<f.h;j++){if(!cellOn(cfg.cls,cfg.chassis,x+i,y+j))return false;if(taken&&taken.has((x+i)+","+(y+j)))return false;}
  return true;}
/* where a part goes if the player hasn't put it anywhere: weapon front and centre, drive pods on the sides (two near the
   middle, four front and back), battery in the middle, electronics behind it, extras at the back */
function preferred(c,f,podIndex,pods){const W=c.gridW,H=c.gridH,cx=Math.round((W-f.w)/2);
  if(f.slot==="weapon")return f.mount==="any"?[cx,Math.round((H-f.h)/2)]:[cx,0];   // an all-round spinner's motor sits in the middle
  if(f.slot==="back")return[cx,H-f.h];
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
  {id:"brick",  name:"Brick",        cfg:{chassis:"steel",armour:{front:"ar500",back:"ar500",left:"ar500",right:"ar500",top:"steel"},drive:"gearbox",wheels:"pu",battery:"large",electronics:"failsafe",weapon:"none",weaponMaterial:"steel",extras:["skid","bar"]}},
  {id:"invert", name:"Invertible box",cfg:{chassis:"hdpe",armour:{front:"hdpe15",back:"hdpe15",left:"hdpe15",right:"hdpe15",top:"hdpe10"},drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"drum",weaponMaterial:"steel",extras:[]}},
  {id:"sloppy", name:"Sloppy budget",cfg:{chassis:"ply",armour:{front:"hdpe6",back:"none",left:"none",right:"none",top:"none"},drive:"single",wheels:"foam",battery:"small",electronics:"basic",weapon:"wedge",weaponMaterial:"alu",extras:[]}}
];
