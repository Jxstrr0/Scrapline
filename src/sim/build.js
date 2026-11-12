/* ---- sim/build.js: K (the build-maths constants) and evalBuild(cfg), the one point where grams and millimetres become
   kg, m, s, J and W. Plan section 4d. It returns, for any cfg (parts.js says the shape):
     valid, errors, totalG / limitG / massKg / limitKg / underBudgetPct   the budget (grams kept for the weight bar)
     com {x,y} m, comOffsetMm, pull (-1..1, + pulls right), moi kg m^2, polygon [[x,y]..] m, widthM, lengthM
     driveSpeed m/s, accel m/s^2, pushN, turnRate rad/s and turnAccel rad/s^2 (a spin on the spot, as the fight turns it),
     scrubShare (the share of the drive's push the tyres' scrub takes in a turn; 1 or more: it can't pivot), trackM, powerScale (0..1: battery or ESC holding power back), grip,
     wheelbase {id, strafe, latMul, scrubMul, crrMul, underMul, caster, wheels, strafeSpeed} (the wheel layout, 0.1.31),
     drive {f0 stall push N, v0 no-load m/s, tractionN, resistN}, power {driveW, weaponW, idleW, capW, batteryWs usable}
     height {clearanceMm, frontEdgeMm, heightMm, invertible, proudMm, backEdgeMm, frontBareMm (the edge with the front
            knocked off)}
     front {id, name, slope, ramMul, underGrip}, back {id, name, ramMul, kick, selfRights} (0.1.32, frontInfo / backInfo)
     weapon {type, energyJ, allRound / melty (0.1.34: an all-round spinner, the whole bot spinning), storedJ, tipSpeed, rpm, spinUpS, recoilFactor, bite, shearJ, reachM, mountM, launchJ,
             canLiftKg, flipHeightM, shots, ...}
     bay {kind, rect, circle, depthM, openTop, openBelow, topFrac, belowFrac, u} the weapon bay (bayOf, below)
     armourMapJ {face: {id, thickMm, massG, absorbJ, hpJ, deflect, prot}}, weakestFace, exposureScore,
     cells [[exposure]] per grid cell, parts [{key, slot, id, cells, massKg, hpJ, exposure, pos}]
     runtimeS, avgDrawW, peakW, heat {rateW, coolingW, secsToDerate, fightDerateS, drive{..}, weapon{..}}
     cost (euros), buildHours, layout {place, moved, unplaced}, stress (COMBOS lines, sim/combos.js)
     tune {volt, wheel, bias, teeth} (the dials, 0.1.33: TUNE in sim/parts.js), wheelRadiusMm (after the wheel-size dial)
   Coordinates: chassis centre is the origin, +x right, +y forward (the front face is +y). ---- */
const K={
  g:9.81,
  crr:0.08,             // rolling and scrub resistance, x weight
  usableBattery:0.8,    // share of a LiPo's capacity you can take in a fight
  driveDuty:0.55,       // average share of full drive power in a fight
  weaponDuty:0.35,      // average share of full weapon power (spin-ups and holding speed)
  spinEff:0.35,         // share of weapon power that ends up in the disc while spinning up
  recoilRef:150,        // J of stored energy per kg of bot that gives a recoil factor of 1 (x the weapon's recoil)
  flipLever:25,         // a flipper needs this x the opponent's weight in ram force (lever and geometry)
  flipEff:0.5,          // share of the ram's work that goes into the launch
  liftLever:4,          // a lifter needs this x the opponent's weight in arm force
  heatJPerKg:60000,     // J a kg of motor (and its gearbox and mount) soaks before it derates
  passiveCoolW:15,      // W each motor group (drive, weapon) sheds with no fan, at beetle scale (x power)
  proudMm:2,            // wheels must stand this far proud of both faces (x len) for the bot to drive upside down
  lowClearMm:3,         // ground clearance (x edge) when the axles sit low
  faceWeight:{front:1,back:0.6,left:0.8,right:0.8},   // how often each face is hit, for exposure
  topWeight:0.15,       // exposure from above, through the top plate
  protRefJ:40,          // armour "absorb + 0.3 hp" (beetle J) that halves a face's exposure
  protHp:0.3,
  plateRefMm:46,        // the box height (beetle mm, HDPE's) a side plate's hp and absorb are worked out at, whatever box it is on
  runtimeMin:90         // a round is 90 s
};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const r3=v=>Math.round(v*1000)/1000;

function evalBuild(cfgIn,opts){
  const errors=unknownIds(cfgIn).map(s=>"Unknown "+s),cfg=normCfg(cfgIn),c0=CLASSES[cfg.cls],M=classMult(cfg.cls);
  /* opts.limitG: a season's rule change to the class limit (the career, PR 8); the parts still scale by the class */
  const c1=opts&&opts.limitG>0&&opts.limitG!==c0.limitG?Object.assign({},c0,{limitG:opts.limitG}):c0;
  const pick=(slot,id)=>part(slot,id);   // normCfg has already swapped unknown ids for the defaults
  const ch=pick("chassis",cfg.chassis),bd=pick("body",cfg.body),dr=pick("drive",cfg.drive),wh=pick("wheels",cfg.wheels),bt=pick("battery",cfg.battery),
    el=pick("electronics",cfg.electronics),wp=pick("weapon",cfg.weapon),wm=pick("weaponMaterial",cfg.weaponMaterial),wb=pick("wheelbase",cfg.wheelbase),
    fr=pick("front",cfg.front),bk=pick("back",cfg.back);   // 0.1.32: the swappable front and the back slot
  /* legs (0.1.34): the rules let a walker carry more (wheelbase limitMul, on top of any season's limit) */
  const c=wb.limitMul&&wb.limitMul!==1?Object.assign({},c1,{limitG:Math.round(c1.limitG*wb.limitMul)}):c1;
  const allRound=ALL_ROUND.indexOf(wp.id)>=0;   // a shell, ring or meltybrain (0.1.34): it covers the front and the back
  const ownFront=OWN_FRONT.indexOf(wp.type)>=0||allRound;   // a wedge, lifter, flipper or grabber is its own front
  if(fr.id!=="none"&&ownFront)errors.push("The "+wp.name.toLowerCase()+(allRound?" spins all the way round":" is its own front")+": no room for "+fr.name.toLowerCase());
  if(bk.id!=="none"&&allRound)errors.push("The "+wp.name.toLowerCase()+" spins all the way round: no room for "+bk.name.toLowerCase());
  /* 0.1.63: a thwackbot tail's boom comes off the back; a two-wheel drum runs on one big wheel a side */
  const tail=wp.mount==="back";
  if(bk.id!=="none"&&tail)errors.push("The "+wp.name.toLowerCase()+"'s boom takes the back: no room for "+bk.name.toLowerCase());
  if(bd.twoWheel&&wb.id!=="std")errors.push("A "+bd.name.toLowerCase()+" runs on one big wheel a side: no "+wb.name.toLowerCase());
  if(bd.twoWheel&&wh.tracks)errors.push("A "+bd.name.toLowerCase()+" runs on wheels, not tracks");
  const wbScrub=wb.scrubMul*(bd.scrubMul||1),wbLat=wb.latMul*(bd.latMul||1);
  /* the tuning dials (0.1.33, TUNE in sim/parts.js): each a multiplier at 1 when the dial is stock */
  const tu=cfg.tune,TV=TUNE.volt,TW=TUNE.wheel,TB=TUNE.bias;
  const vCell=1+TV.cells*tu.volt,vPow=1+TV.power*tu.volt,vSpd=1+TV.speed*tu.volt,vHeat=Math.max(TV.heatMin,1+TV.heat*tu.volt);
  const wSize=1+TW.size*tu.wheel,wMass=1+TW.mass*tu.wheel,wSpd=1+TW.speed*tu.wheel,wForce=1+TW.force*tu.wheel,wExp=1+TW.exposure*tu.wheel;
  const bEdge=1+TB.edge*tu.bias,bPush=1+TB.push*tu.bias;
  const ex=cfg.extras.map(id=>part("extras",id));
  const has=k=>ex.some(e=>e[k]);

  /* ---- geometry (mm) ---- */
  const cellMm=c.cellMm,W=c.gridW*cellMm,L=c.gridH*cellMm,H=ch.heightMm*bd.heightMul*M.len;
  const cellsAll=c.gridW*c.gridH;let cellsOn=0;
  for(let y=0;y<c.gridH;y++)for(let x=0;x<c.gridW;x++)if(cellOn(cfg.cls,cfg.chassis,x,y))cellsOn++;
  const cellFrac=cellsOn/cellsAll;
  const cx=x=>((x+0.5)-c.gridW/2)*cellMm/1000, cy=y=>(c.gridH/2-(y+0.5))*cellMm/1000;   // cell centre in m
  const cut=ch.shape==="wedge"?c.fp*cellMm/1000:0;
  const hw=W/2000,hl=L/2000,boomM=tail&&wp.boomMm?wp.boomMm*M.len/1000:0;   // a thwackbot's boom, from the back face to the head
  const polygon=cut?[[-hw+cut,hl],[hw-cut,hl],[hw,hl-cut],[hw,-hl],[-hw,-hl],[-hw,hl-cut]]:[[-hw,hl],[hw,hl],[hw,-hl],[-hw,-hl]];

  /* ---- mass items: {key, slot, id, g, x, y} (x, y in m), plus the moment-of-inertia extras ---- */
  const items=[];const addM=(key,slot,id,g,x,y)=>{items.push({key,slot,id,g,x,y});};
  addM("chassis","chassis",ch.id,ch.massPerCell*bd.massMul*BASE.cells*M.mass*cellFrac,0,cut?-cut*0.2:0);

  /* armour: plate area x thickness x density; the top covers the whole outline */
  const faceArea={front:(W-2*cut*1000+2*Math.SQRT2*cut*1000)*H,   // a custom shape's two cut corners are armoured with the front
    back:W*H,left:(L-cut*1000)*H,right:(L-cut*1000)*H,top:W*L*cellFrac};
  const facePos={front:[0,hl],back:[0,-hl],left:[-hw,0],right:[hw,0],top:[0,0]};
  const armourMapJ={};
  /* a plate's hp and absorb go with its thickness, not its height (0.1.15.2, Kelbo): a low body's shorter side plates weigh
     less but stop a hit as well, and a tall body's bigger ones weigh more without adding hp. The top doesn't change height.
     The same goes for the box's own height (0.1.53, Kelbo): every box's side plates protect as on a K.plateRefMm box. */
  for(const f of FACES){const a=pick("armour",cfg.armour[f]),t=a.thickMm*M.thick,g=faceArea[f]*t*a.density/1000,gp=f==="top"?g:g/bd.heightMul*K.plateRefMm/ch.heightMm;
    let absorbJ=a.absorbPerG*gp,hpJ=a.hpPerG*gp,deflect=Math.min(0.8,a.deflect+(bd.deflect[f]||0));
    if(f==="front")for(const e of ex){if(e.frontAbsorbJ)absorbJ+=e.frontAbsorbJ*M.mass;if(e.frontDeflect)deflect=Math.min(0.8,deflect+e.frontDeflect);}
    if(f==="front"&&fr.absorbJ)absorbJ+=fr.absorbJ*M.mass;if(f==="back"&&bk.absorbJ)absorbJ+=bk.absorbJ*M.mass;
    armourMapJ[f]={id:a.id,name:a.name,thickMm:r3(t),massG:g,absorbJ,hpJ,deflect};
    if(g>0)addM("armour_"+f,"armour",a.id,g,facePos[f][0],facePos[f][1]);}
  for(const f of FACES){const A=armourMapJ[f],eff=A.absorbJ+K.protHp*A.hpJ;A.prot=eff/(eff+K.protRefJ*M.mass);}

  /* ---- layout ---- */
  const lay=autoLayout(cfg),fps=footprints(cfg);
  for(const k of lay.unplaced)errors.push("No room on the chassis for the "+(k.indexOf("drive")===0?"drive pods":k));
  const fpOf=k=>fps.find(f=>f.key===k);
  const centreOf=k=>{const f=fpOf(k),p=lay.place[k];if(!f||!p)return null;return[(cx(p[0])+cx(p[0]+f.w-1))/2,(cy(p[1])+cy(p[1]+f.h-1))/2];};
  const cellsOf=k=>{const f=fpOf(k),p=lay.place[k],o=[];if(!f||!p)return o;for(let i=0;i<f.w;i++)for(let j=0;j<f.h;j++)o.push([p[0]+i,p[1]+j]);return o;};

  /* drive pods and wheels (the wheels sit at the pod's outer edge) */
  const podKeys=fps.filter(f=>f.slot==="drive").map(f=>f.key);
  const podG=dr.massG*M.mass/dr.pods+wb.podG*M.mass;
  let leftX=[],rightX=[];const wheelAt=[];   // [key, side, y]
  const nWheels=wb.perSide?2*wb.perSide:dr.pods,wheelG=wh.massG*M.mass*wb.wheelMul*wMass/nWheels;
  for(const k of podKeys){const p=centreOf(k);if(!p)continue;addM(k,"drive",dr.id,podG,p[0],p[1]);
    const side=p[0]<0?-1:1;(side<0?leftX:rightX).push(side*hw);
    if(!wb.perSide){wheelAt.push(["wheel"+k.slice(5),side,p[1]]);addM("wheel"+k.slice(5),"wheels",wh.id,wheelG,side*hw,p[1]);}}
  /* the wheel layout (0.1.31): perSide wheels a side, spread along it (one sits by the pods), chain-driven from the pods */
  if(wb.perSide){const n=wb.perSide,ys=n===1?null:Array.from({length:n},(_,i)=>(0.72-1.44*i/(n-1))*hl);
    for(const side of [-1,1]){const own=podKeys.map(centreOf).filter(p=>p&&(p[0]<0)===(side<0)),my=own.length?own.reduce((a,p)=>a+p[1],0)/own.length:0;
      for(let i=0;i<n;i++)wheelAt.push(["wheel"+(2*i+(side<0?0:1)),side,ys?ys[i]:my]);}
    wheelAt.sort((a,b)=>(+a[0].slice(5))-(+b[0].slice(5)));
    for(const q of wheelAt)addM(q[0],"wheels",wh.id,wheelG,q[1]*hw,q[2]);}
  if(wb.massG)addM(wb.caster?"caster":"wheelbase","wheelbase",wb.id,wb.massG*M.mass,0,wb.caster?-hl*0.85:0);
  if(podKeys.length&&(!leftX.length||!rightX.length))errors.push("The drive pods need to be on both sides");
  if(wb.podsNeed&&dr.pods<wb.podsNeed)errors.push(wb.name+" need a motor on every wheel: two motors a side");
  if(wh.tracks&&wb.id!=="std")errors.push("Tracks run the whole side: they only go on a wheel on each pod");
  const bp=centreOf("battery");if(bp)addM("battery","battery",bt.id,bt.massG*M.mass*vCell,bp[0],bp[1]);
  const ep=centreOf("electronics");if(ep)addM("electronics","electronics",el.id,el.massG*M.mass,ep[0],ep[1]);

  /* weapon: structure x material, the motor at the mount, the disc at the mount (a front spinner's disc sits on the
     front edge); a wedge with no cells hangs off the front face */
  const isSpin=wp.type==="spinner"||wp.type==="saw";
  let wpos=centreOf("weapon")||[0,hl];
  const frontMounted=wp.mount==="front";
  const discPos=allRound?[0,0]:tail?[0,-hl-boomM]:isSpin&&frontMounted&&wp.id!=="hsp"?[wpos[0],hl]:wpos;   // an all-round spinner turns about the middle
  const DP=cfg.disc?{r:DISC_PROFILES.rim[cfg.disc.rim]}:null;   // your own disc profile (normCfg keeps it on spinners only)
  const nTeeth=TUNE.teeth.base+tu.teeth,TT=DISC_PROFILES.teeth[nTeeth];   // 0.1.48: the Tooth count dial (two, and every factor 1, on anything but a disc or a drum)
  const structG=wp.massG*wm.massMult*M.mass,motorG=wp.motorMassG*M.mass,discG=isSpin?wp.discMass*wm.massMult*M.mass*(DP?DP.r.mass:1):0;
  if(structG)addM("weapon_struct","weapon",wp.id,structG,tail?0:wpos[0],wp.fp?wpos[1]:tail?-hl-boomM/2:hl);
  if(motorG)addM("weapon_motor","weapon",wp.id,motorG,wpos[0],wpos[1]);
  if(discG)addM("weapon_disc","weapon",wp.id,discG,discPos[0],discPos[1]);
  for(const e of ex){const p=e.fp?centreOf(e.id):[0,e.id==="bar"?hl:0];if(p)addM(e.id,"extras",e.id,e.massG*M.mass,p[0],p[1]);}
  /* the front hangs off the front face; the back's plate off the back, a kicker in its cells */
  if(fr.massG)addM("front","front",fr.id,fr.massG*M.mass,0,hl);
  const kpos=bk.fp?centreOf("back"):[0,-hl];if(kpos&&bk.massG+bk.motorMassG)addM("back","back",bk.id,(bk.massG+bk.motorMassG)*M.mass,kpos[0],kpos[1]);

  /* ---- mass, budget, COM, inertia ---- */
  let totalG=0,mx=0,my=0;for(const it of items){totalG+=it.g;mx+=it.g*it.x;my+=it.g*it.y;}
  const massKg=totalG/1000,limitKg=c.limitG/1000;
  /* the weight-bias dial slides ballast along the bot: the centre of mass moves with it (+ forward) */
  const com={x:totalG?mx/totalG:0,y:(totalG?my/totalG:0)+TB.com*tu.bias*L/1000};
  /* yaw inertia about the COM: points, plus the chassis and top plate as flat plates, plus the disc's own inertia */
  let moi=0;for(const it of items){const dx=it.x-com.x,dy=it.y-com.y;moi+=it.g/1000*(dx*dx+dy*dy);}
  const plate=g=>g/1000*((W/1000)*(W/1000)+(L/1000)*(L/1000))/12;
  moi+=plate(items[0].g)+plate(armourMapJ.top.massG);
  const radM=isSpin?(tail?Math.hypot(com.x,com.y+hl+boomM)+0.012*M.len:wp.bodyR?Math.hypot(W,L)/2000*wp.bodyR:wp.radius*M.len/1000):0;   // a shell or ring is as big as the bot; a tail reaches from the centre of mass to past its head
  const shapeK=wp.shapeK*(DP?DP.r.shapeK:1);
  if(isSpin&&!tail)moi+=discG/1000*radM*radM*(wp.id==="hsp"||allRound?shapeK:0.25);   // a tail's head is a weight on the boom, already in the sum
  if(totalG>c.limitG+1e-6)errors.push("Over the "+c.name+" limit");
  if(ex.some(e=>e.minibot)&&!MINIBOT.cls[cfg.cls])errors.push("An "+c.name.toLowerCase()+" has nothing smaller to carry as a minibot");
  const underBudgetPct=(1-totalG/c.limitG)*100;

  /* ---- power: the battery and the ESC cap what the motors may draw at once ---- */
  const brushMismatch=!!dr.brushless&&!el.brushless;
  const drivePowerW=dr.powerW*M.power*(brushMismatch?0.6:1)*wb.powerMul*vPow,weaponPowerW=wp.powerW*M.power*vPow;
  const idleW=(el.idleW+bk.powerW)*M.power;   // a kicker's valves and gas (0.1.32) are a small steady draw
  const peakW=drivePowerW+weaponPowerW+idleW;
  const capW=Math.min(bt.dischargeW*M.power*vCell,el.maxPowerW*M.power);
  const powerScale=peakW>0?Math.min(1,capW/peakW):1;

  /* ---- drive: force falls with speed, F = F0 (1 - v / v0); traction caps the push ---- */
  const v0=dr.speedMs*Math.sqrt(M.len)*(brushMismatch?0.6:1)*Math.sqrt(powerScale)*vSpd*wSpd*(wb.speedMul||1),F0=dr.forceN*M.mass*powerScale*vSpd*wForce;
  const grip=wh.grip*wb.gripMul*bPush,weightN=massKg*K.g,traction=grip*weightN,pushN=Math.min(F0,traction);
  const resist=K.crr*weightN*wb.crrMul;
  const driveSpeed=F0>resist?v0*(1-resist/F0):0;
  const accel=Math.max(0,(pushN-resist)/Math.max(massKg,1e-6));
  const trackM=leftX.length&&rightX.length?(rightX.reduce((a,b)=>a+b,0)/rightX.length-leftX.reduce((a,b)=>a+b,0)/leftX.length):W/1000;
  /* turning on the spot, worked out the way the fight turns it (0.1.55.1; sim/fight.js stepDrive): each side pushes
     F0 / 2 x (1 - its wheel speed / v0), capped by grip, against the tyres' scrub, FIGHT.scrub x grip x weight (x the wheel
     layout's scrubMul) at the wheels. It settles where push and scrub are level; a drive weaker than its scrub can't
     pivot at all. scrubShare is the share of the drive's stall push the scrub takes. Grippier tyres turn slower. */
  const scrubN=FIGHT.scrub*traction*wbScrub,scrubShare=F0>0?scrubN/F0:1;
  const turnRate=trackM>0&&F0>scrubN?2*v0/trackM*(1-scrubN/F0):0;
  const turnAccel=moi>0?Math.max(0,pushN-scrubN)*trackM/2/moi:0;
  /* pull: with the COM off to one side, the light side's wheels slip first and the heavy side pushes it round */
  const pull=clamp(-com.x/(trackM/2||1),-1,1);

  /* ---- height profile ---- */
  const rWheel=Math.max(wh.radiusMm*M.len*wSize,bd.twoWheel?H*bd.wheelMul/2:0),proud=rWheel-H/2;   // a two-wheel drum's wheels stand taller than it
  const inv=bd.inverts||!!wp.inverts,centred=inv||!wh.tracks&&proud>=K.proudMm*M.len;   // a meltybrain runs either way up
  const clearanceMm=centred?(inv?Math.max(proud,K.lowClearMm*M.edge):proud):K.lowClearMm*M.edge;
  /* the leading edge: the weapon's (or the clearance), a fitted front's if lower (0.1.32), then a skid plate and the body.
     frontBareMm is the same without the front, for when the front is knocked off */
  const edgeOn=base=>{let e=base;for(const x of ex)if(x.edgeMm)e+=x.edgeMm*M.edge;e+=bd.edgeMm*M.edge;return Math.max(0.5*M.edge,e*bEdge);};   // a heavy nose sits it down
  const edge0=wp.edgeMm!=null?wp.edgeMm*M.edge:clearanceMm,frontBareMm=edgeOn(edge0);
  const frontEdgeMm=edgeOn(fr.edgeMm!=null&&!ownFront?Math.min(edge0,fr.edgeMm*M.edge):edge0);
  const selfRight=has("selfRight")||!!wp.selfRights||!!bk.selfRights;
  const backEdgeMm=bk.edgeMm!=null?Math.max(0.5*M.edge,bk.edgeMm*M.edge):clearanceMm;
  const invertible=centred||selfRight;
  const height={clearanceMm:r3(clearanceMm),frontEdgeMm:r3(frontEdgeMm),heightMm:r3(H),invertible,drivesInverted:centred,selfRight,proudMm:r3(proud),backEdgeMm:r3(backEdgeMm),frontBareMm:r3(frontBareMm)};

  /* ---- weapon ---- */
  const weapon={type:wp.type,id:wp.id,energyJ:0,bite:0,reachM:0,mountM:allRound?[0,0]:tail?[com.x,com.y]:wpos,allRound,melty:!!wp.bodyK,thwack:tail,boomM,edgeMm:wp.edgeMm!=null?r3(wp.edgeMm*M.edge):null,
    hpJ:wp.hp*M.mass*wm.hp/160,material:wm.name};
  if(isSpin){const rpm=wp.rpmMax/M.len*vSpd,omega=rpm*2*Math.PI/60,I=tail?moi:wp.bodyK?wp.bodyK*massKg*radM*radM:shapeK*discG/1000*radM*radM,storedJ=0.5*I*omega*omega,rc=wp.recoil*TT.recoil;
    const spinUpS=weaponPowerW>0?storedJ/(weaponPowerW*powerScale*K.spinEff):Infinity;
    Object.assign(weapon,{rpm,omega,inertia:I,storedJ,energyJ:storedJ,tipSpeed:omega*radM,spinUpS,spinPowerW:weaponPowerW*powerScale*K.spinEff,radiusM:radM,discKg:discG/1000,recoil:rc,
      recoilFactor:clamp(rc*storedJ/(Math.max(massKg,1e-6)*K.recoilRef),0,1.5),bite:wp.bite*wm.bite*TT.bite,teeth:nTeeth,hitGap:TT.gap,minSpin:TT.spin,profile:cfg.disc||null,
      shearJ:wm.hp*wm.shearMult*M.mass*(wp.bendMul||1)*TT.bend,bendJ:wm.hp*M.mass*(wp.bendMul||1)*TT.bend,
      /* the most one hit can land (0.1.48.2): a hit only takes the disc's bite out of what it stores, at the top of the bite's
         jitter, and a vertical on a sloped front catches the lip. Bending and shearing are judged on this, not on storedJ */
      hitMaxJ:storedJ*Math.min(0.98,Math.min(0.98,wp.bite*wm.bite*TT.bite*(1+FIGHT.biteJitter))*(FIGHT.lip[wp.id]||1)),reachM:radM,sawJps:wp.sawJps?wp.sawJps*M.power:0});}
  if(wp.type==="flipper"){const F=wp.forceN*M.mass,stroke=wp.strokeMm*M.len/1000,launchJ=F*stroke;
    Object.assign(weapon,{shots:wp.shots,forceN:F,launchJ,energyJ:launchJ,rechargeS:wp.rechargeS,canLiftKg:F/(K.g*K.flipLever),
      flipHeightM:Math.max(0,launchJ*K.flipEff/(limitKg*K.g)-stroke),reachM:wp.reachMm*M.len/1000,bite:wm.bite});}
  if(wp.type==="lifter"||wp.type==="grabber"){const F=wp.liftN*M.mass*powerScale*vSpd,liftM=wp.liftMm*M.len/1000;
    Object.assign(weapon,{liftN:F,liftM,energyJ:F*liftM,canLiftKg:F/(K.g*K.liftLever),reachM:wp.reachMm*M.len/1000,bite:wm.bite});}
  if(wp.type==="hammer")Object.assign(weapon,{energyJ:wp.energyJ*M.mass*powerScale*vPow,swingS:wp.swingS/Math.sqrt(powerScale),reachM:0.6*L/1000,bite:wm.bite});
  if(wp.type==="crusher")Object.assign(weapon,{forceN:wp.forceN*M.mass*powerScale*vSpd,energyJ:wp.crushJ*M.mass*powerScale*vPow,reachM:0.5*L/1000,bite:wm.bite});
  if(wp.type==="wedge")Object.assign(weapon,{reachM:wp.reachMm*M.len/1000,bite:wm.bite});

  const bay=bayOf(wp,weapon,wpos,fpOf("weapon"),lay.place.weapon,{W:W/1000,L:L/1000,H:H/1000,clr:clearanceMm/1000,cell:cellMm/1000,c,M,cellFrac});

  /* ---- exposure: per cell, from each face (closer and less armoured is worse) and from above ---- */
  const cells=[];let topE=K.topWeight*(1-armourMapJ.top.prot);
  for(let y=0;y<c.gridH;y++){const row=[];for(let x=0;x<c.gridW;x++){
    if(!cellOn(cfg.cls,cfg.chassis,x,y)){row.push(null);continue;}
    const d={front:y/c.fp,back:(c.gridH-1-y)/c.fp,left:x/c.fp,right:(c.gridW-1-x)/c.fp};let e=topE;
    for(const f in K.faceWeight)e+=K.faceWeight[f]*(1-armourMapJ[f].prot)/((1+d[f])*(1+d[f]));
    row.push(r3(e));}cells.push(row);}
  const cellE=(x,y)=>(cells[y]&&cells[y][x])||0;

  /* ---- the parts list (PR 4a damages these): each internal part's cells, hp and worst exposure ---- */
  const parts=[];
  const addPart=(key,slot,id,hp,g)=>{const cl=cellsOf(key);let e=0;for(const q of cl)e=Math.max(e,cellE(q[0],q[1]));
    parts.push({key,slot,id,cells:cl,massKg:r3(g/1000),hpJ:hp,exposure:r3(e),pos:centreOf(key)});};
  for(const k of podKeys)addPart(k,"drive",dr.id,dr.hp*M.mass,podG);
  for(const q of wheelAt){const side=q[1]<0?"left":"right",pk=podKeys.find(k=>"wheel"+k.slice(5)===q[0]);
    parts.push({key:q[0],slot:"wheels",id:wh.id,cells:pk?cellsOf(pk):[],massKg:r3(wheelG/1000),hpJ:wh.hp*M.mass*wb.hpMul,
      exposure:r3(wExp*(wh.exposure*(1-armourMapJ[side].prot*0.5)+K.faceWeight[side]*wh.exposure*0.5)),pos:[q[1]*hw,q[2]]});}
  if(wb.caster)parts.push({key:"caster",slot:"wheels",id:"caster",caster:true,cells:[],massKg:r3(wb.massG*M.mass/1000),hpJ:wb.casterHp*M.mass,
    exposure:r3(0.3*(1-armourMapJ.back.prot*0.5)),pos:[0,-hl*0.85]});
  addPart("battery","battery",bt.id,bt.hp*M.mass,bt.massG*M.mass*vCell);
  addPart("electronics","electronics",el.id,el.hp*M.mass,el.massG*M.mass);
  if(wp.type!=="none"){if(wp.fp)addPart("weapon","weapon",wp.id,weapon.hpJ,structG+motorG+discG);
    else parts.push({key:"weapon",slot:"weapon",id:wp.id,cells:[],massKg:r3((structG+discG)/1000),hpJ:weapon.hpJ,exposure:r3(K.faceWeight[tail?"back":"front"]),pos:[0,tail?-hl-boomM:hl]});}
  if(fr.hp&&!ownFront)parts.push({key:"front",slot:"front",id:fr.id,cells:[],massKg:r3(fr.massG*M.mass/1000),hpJ:fr.hp*M.mass,exposure:r3(K.faceWeight.front),pos:[0,hl]});
  if(bk.hp){if(bk.fp)addPart("back","back",bk.id,bk.hp*M.mass,(bk.massG+bk.motorMassG)*M.mass);
    else parts.push({key:"back",slot:"back",id:bk.id,cells:[],massKg:r3(bk.massG*M.mass/1000),hpJ:bk.hp*M.mass,exposure:r3(K.faceWeight.back),pos:[0,-hl]});}
  for(const e of ex){if(e.fp)addPart(e.id,"extras",e.id,e.hp*M.mass,e.massG*M.mass);
    else parts.push({key:e.id,slot:"extras",id:e.id,cells:[],massKg:r3(e.massG*M.mass/1000),hpJ:e.hp*M.mass,exposure:0,pos:[0,e.id==="bar"?hl:0]});}
  let es=0,eg=0;for(const p of parts)if(p.cells.length){es+=p.exposure*p.massKg;eg+=p.massKg;}
  const exposureScore=eg?es/eg:0;
  let weakestFace="front",wv=1e9;for(const f of ["front","back","left","right"]){const A=armourMapJ[f],v=(A.absorbJ+A.hpJ)/K.faceWeight[f];if(v<wv){wv=v;weakestFace=f;}}

  /* ---- runtime and heat ---- */
  const avgDrawW=(drivePowerW*K.driveDuty+weaponPowerW*K.weaponDuty)*powerScale+idleW;
  const batWs=bt.capacityWs*M.mass*K.usableBattery*vCell,runtimeS=avgDrawW>0?batWs/avgDrawW:Infinity;
  const coolTotal=el.coolingW*M.power;
  const group=(heatW,motorKg,duty,share)=>{const rateW=heatW*M.power,coolW=K.passiveCoolW*M.power+coolTotal*share,budgetJ=K.heatJPerKg*motorKg;
    const full=rateW>coolW?budgetJ/(rateW-coolW):null,fight=rateW*duty>coolW?budgetJ/(rateW*duty-coolW):null;
    return{rateW,coolW,budgetJ,secsToDerate:full,fightDerateS:fight};};
  const weaponMotorKg=motorG/1000;
  const heatD=group((dr.heatW+el.heatW)*vHeat,dr.massG*dr.motorFrac*M.mass/1000,K.driveDuty,weaponMotorKg&&wp.heatW?0.5:1);
  const heatW_=wp.heatW&&weaponMotorKg?group(wp.heatW*vHeat,weaponMotorKg,K.weaponDuty,0.5):null;
  const minN=(a,b)=>a==null?b:b==null?a:Math.min(a,b);
  const heat={rateW:heatD.rateW+(heatW_?heatW_.rateW:0),coolingW:heatD.coolW+(heatW_?heatW_.coolW:0),drive:heatD,weapon:heatW_,
    secsToDerate:minN(heatD.secsToDerate,heatW_&&heatW_.secsToDerate),fightDerateS:minN(heatD.fightDerateS,heatW_&&heatW_.fightDerateS),
    hotPart:heatW_&&heatW_.fightDerateS!=null&&(heatD.fightDerateS==null||heatW_.fightDerateS<heatD.fightDerateS)?"weapon":"drive"};

  /* ---- cost and hours: the whole bot bought new (fitBill, below) ---- */
  const bill=fitBill(null,cfg),cost=bill.cost,hours=bill.hours;

  const b={cfg,cls:c.id,className:c.name,valid:!errors.length,errors,
    totalG,limitG:c.limitG,massKg,limitKg,underBudgetPct,
    com,comOffsetMm:Math.hypot(com.x,com.y)*1000,pull,moi,polygon,widthM:W/1000,lengthM:L/1000,
    driveSpeed,accel,pushN,turnRate,turnAccel,scrubShare,trackM,powerScale,peakW,brushMismatch,grip,
    wheelbase:{id:wb.id,strafe:wb.strafe,latMul:wbLat,scrubMul:wbScrub,crrMul:wb.crrMul,underMul:wb.underMul,caster:!!wb.caster,
      wheels:wheelAt.length,strafeSpeed:v0*wb.strafe,legs:!!wb.legs},
    limits:{batteryW:bt.dischargeW*M.power*vCell,escW:el.maxPowerW*M.power},
    drive:{f0:F0,v0,tractionN:traction,resistN:resist},
    power:{driveW:drivePowerW,weaponW:weaponPowerW,idleW,capW,batteryWs:batWs},
    height,weapon,bay,front:frontInfo(fr,ownFront,M),back:backInfo(bk,M,limitKg),armourMapJ,weakestFace,exposureScore,cells,parts,
    runtimeS,avgDrawW,heat,cost,buildHours:hours,layout:lay,tune:Object.assign({},tu),wheelRadiusMm:r3(rWheel),
    items:items.map(it=>({key:it.key,slot:it.slot,id:it.id,g:Math.round(it.g*10)/10}))};
  b.stress=stressReport(b);
  b.verdict=!b.valid?(totalG>c.limitG?"over":"invalid"):b.stress.some(s=>s.sev==="bad"||s.sev==="warn")?"flaws":"valid";
  return b;}

/* ---- the weapon bay (0.1.15.3, Kelbo: real weapon bays): the opening the body leaves round the weapon. The 3D bot cuts
   it (vis/bot.js, and the slotted Blender shells), and the fight treats an open one as a weak spot (sim/fight.js).
     kind       "slot" (vertical disc, drisk, saw: a slot through the top), "pocket" (drum, eggbeater: open at the front and top), "well"
                (horizontal disc: a round recess in the top it sits in), "underwell" (undercutter: the same from below),
                "deck" (hammer, flipper, lifter, crusher: a flat deck the arm or plate lies on), "none"
     rect       [x0, y0, x1, y1] m in build coords (+y forward), clipped to the body; circle {x, y, r} m for a well
     depthM     how far a well is cut into the body
     openTop    a hit from above can land in it; openBelow the same from underneath (so from above when upside down)
     topFrac    its share of the top's area (0 when it isn't open from above); belowFrac the same from underneath. A hit
                from above lands in the bay this often (x DAMAGE.bayMul; belowFrac when the bot is upside down) and skips
                the top plate (sim/fight.js, hitFace's bay)
     u          the same in a unit body (x -0.5..0.5 the width, z -0.5..0.5 the length with the front at -z, depth in
                chassis heights), the Blender shells' coordinates
   The sizes follow the 3D bot's weapon (a vertical disc is about 0.18 of its radius thick, a drum about half the width). */
function bayOf(wp,w,pos,fp,at,g){const hw=g.W/2,hl=g.L/2,len=g.M.len,bodyH=Math.max(0.001,g.H-g.clr),id=wp.id,T=wp.type,r=w.radiusM||0,cx=pos[0],cy=pos[1];
  const clip=(x0,y0,x1,y1)=>[Math.max(-hw,x0),Math.max(-hl,y0),Math.min(hw,x1),Math.min(hl,y1)];
  const fr=fp&&at?[(at[0]-g.c.gridW/2)*g.cell,(g.c.gridH/2-(at[1]+fp.h))*g.cell,(at[0]+fp.w-g.c.gridW/2)*g.cell,(g.c.gridH/2-at[1])*g.cell]:null;
  let kind="none",rect=null,circle=null,depthM=0,openTop=false,openBelow=false;
  if(id==="vsp"||id==="saw"){kind="slot";const sw=Math.min(fr?fr[2]-fr[0]:g.W,0.3*r+0.006*len);rect=clip(cx-sw/2,cy-r*1.05,cx+sw/2,cy+r*1.05);openTop=true;openBelow=id==="vsp";}
  /* the drisk (0.1.46) is small for its bay: it sits forward, a third of it past the front, in a slot that runs out through the front */
  else if(id==="drisk"){kind="slot";const sw=Math.min(fr?fr[2]-fr[0]:g.W,r+0.006*len),yd=Math.max(cy,hl-r*0.65);rect=clip(cx-sw/2,yd-r*1.05,cx+sw/2,hl);openTop=openBelow=true;}
  else if(id==="drum"||id==="beater"){kind="pocket";const dw=Math.min(g.W*0.7,Math.max(r*2,g.W*0.5))+0.006*len;rect=clip(cx-dw/2,cy-r*1.15,cx+dw/2,hl);openTop=openBelow=true;}
  else if(id==="hsp"||id==="under"){kind=id==="hsp"?"well":"underwell";const rr=r*1.06;circle={x:cx,y:cy,r:rr};rect=clip(cx-rr,cy-rr,cx+rr,cy+rr);
    depthM=Math.min(bodyH*0.45,Math.max(0.004*len,r*0.08)*2.2+0.002*len);if(id==="hsp")openTop=true;else openBelow=true;}
  else if(T==="hammer"){kind="deck";const dw=Math.max(fr?fr[2]-fr[0]:0,0.034*len);rect=clip(-dw/2,-0.3*hl-0.01*len,dw/2,hl);}
  else if(T==="flipper"){kind="deck";rect=clip(-0.47*g.W,hl-0.58*g.L,0.47*g.W,hl);}
  else if((T==="lifter"||T==="grabber"||T==="crusher")&&fr){kind="deck";rect=clip(fr[0],T==="crusher"?Math.min(fr[1],hl-0.32*g.L):fr[1],fr[2],hl);}
  const area=rect?Math.max(0,rect[2]-rect[0])*Math.max(0,rect[3]-rect[1])*(circle?Math.PI/4:1):0;
  const frac=clamp(area/(g.W*g.L*g.cellFrac),0,1),topFrac=openTop?frac:0,belowFrac=openBelow?frac:0;
  const u=rect?{rect:[rect[0]/g.W,-rect[3]/g.L,rect[2]/g.W,-rect[1]/g.L],circle:circle?{x:circle.x/g.W,z:-circle.y/g.L,rx:circle.r/g.W,rz:circle.r/g.L}:null,depth:depthM/bodyH}:null;
  return{kind,rect,circle,depthM,openTop,openBelow,topFrac,belowFrac,u};}
/* ---- the front and the back (0.1.32) as the fight reads them. front {id, name, slope, ramMul, underGrip} (a plain
   front, or one the weapon has no room for, is all zeros and ones); back {id, name, ramMul, kick} where kick is the
   kicker's flip {forceN, launchJ, strokeM, canLiftKg, shots, rechargeS, reachM} or null ---- */
const OWN_FRONT=["wedge","lifter","flipper","grabber"];
const ALL_ROUND=["shell","ring","melty"];   // 0.1.34: spinners that hit all the way round (and leave no room for a front or a back)
function frontInfo(fr,own,M){const on=!own&&fr.id!=="none";
  return{id:on?fr.id:"none",name:on?fr.name:"",slope:on?fr.slope:0,ramMul:on?fr.ramMul:1,underGrip:on?fr.underGrip:0};}
function backInfo(bk,M,limitKg){let kick=null;
  if(bk.kickN){const F=bk.kickN*M.mass,st=bk.strokeMm*M.len/1000;kick={forceN:F,launchJ:F*st,strokeM:st,canLiftKg:F/(K.g*K.flipLever),
    shots:bk.shots,rechargeS:bk.rechargeS,reachM:bk.reachMm*M.len/1000};}
  return{id:bk.id,name:bk.id==="none"?"":bk.name,ramMul:bk.ramMul,kick,selfRights:!!bk.selfRights};}
/* ---- fitBill(fitted, draft): what fitting the draft costs, part by part. Pay on fit, no refund (plan section 1): every
   part that differs from the fitted bot is bought at full price; what comes off is gone. A new weapon is made of the
   material, so it pays for the material too. fitted null (or another class) means the whole bot.
   Returns {lines:[{slot, face, id, name, cost, hours}], removed:[{slot, face, id, name}] (what comes off and is not
   replaced: a plate taken off, the weapon taken off, an extra dropped), cost, hours}. evalBuild's cost is
   fitBill(null, cfg).cost. ---- */
function fitBill(fitted,draft){const b=normCfg(draft),a=fitted&&fitted.cls===b.cls?normCfg(fitted):null,M=classMult(b.cls),lines=[];
  let cost=0,hours=0;
  const add=(slot,id,face)=>{const p=part(slot,id);if(!p)return;const c=p.cost*M.cost,h=p.hours*M.hours;cost+=c;hours+=h;
    lines.push({slot,face:face||null,id,name:p.name,cost:Math.round(c),hours:Math.round(h*10)/10});};
  for(const s of ["chassis","body","drive","wheels","wheelbase","battery","electronics","weapon","front","back"])if((!a||a[s]!==b[s])&&!((s==="weapon"||s==="front"||s==="back")&&b[s]==="none")&&!(s==="wheelbase"&&b[s]==="std"))add(s,b[s]);
  if(b.weapon!=="none"&&(!a||a.weaponMaterial!==b.weaponMaterial||a.weapon!==b.weapon||!sameDisc(a.disc,b.disc)))add("weaponMaterial",b.weaponMaterial);   // a new disc profile is a new disc
  for(const f of FACES)if((!a||a.armour[f]!==b.armour[f])&&b.armour[f]!=="none")add("armour",b.armour[f],f);
  for(const e of b.extras)if(!a||a.extras.indexOf(e)<0)add("extras",e);
  const removed=[],off=(slot,id,face)=>{const p=part(slot,id);if(p)removed.push({slot,face:face||null,id,name:p.name});};
  if(a){if(a.weapon!=="none"&&b.weapon==="none")off("weapon",a.weapon);
    for(const s of ["front","back"])if(a[s]!=="none"&&b[s]==="none")off(s,a[s]);
    for(const f of FACES)if(a.armour[f]!=="none"&&b.armour[f]==="none")off("armour",a.armour[f],f);
    for(const e of a.extras)if(b.extras.indexOf(e)<0)off("extras",e);}
  return{lines,removed,cost:Math.round(cost),hours:Math.round(hours*10)/10};}
/* the same cfg? (layout aside: moving parts round the chassis is free) */
function sameParts(a,b){if(!a||!b)return false;a=normCfg(a);b=normCfg(b);if(a.cls!==b.cls)return false;
  for(const s of PART_SLOTS)if(a[s]!==b[s]&&!(s==="weaponMaterial"&&a.weapon==="none"&&b.weapon==="none"))return false;for(const f of FACES)if(a.armour[f]!==b.armour[f])return false;
  if(!sameDisc(a.disc,b.disc))return false;
  return a.extras.slice().sort().join()===b.extras.slice().sort().join();}
