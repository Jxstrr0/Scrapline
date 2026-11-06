/* ---- sim/build.js: K (the build-maths constants) and evalBuild(cfg), the one point where grams and millimetres become
   kg, m, s, J and W. Plan section 4d. It returns, for any cfg (parts.js says the shape):
     valid, errors, totalG / limitG / massKg / limitKg / underBudgetPct   the budget (grams kept for the weight bar)
     com {x,y} m, comOffsetMm, pull (-1..1, + pulls right), moi kg m^2, polygon [[x,y]..] m, widthM, lengthM
     driveSpeed m/s, accel m/s^2, pushN, turnRate rad/s, trackM, powerScale (0..1: battery or ESC holding power back)
     height {clearanceMm, frontEdgeMm, heightMm, invertible, proudMm}
     weapon {type, energyJ, storedJ, tipSpeed, rpm, spinUpS, recoilFactor, bite, shearJ, reachM, mountM, launchJ,
             canLiftKg, flipHeightM, shots, ...}
     armourMapJ {face: {id, thickMm, massG, absorbJ, hpJ, deflect, prot}}, weakestFace, exposureScore,
     cells [[exposure]] per grid cell, parts [{key, slot, id, cells, massKg, hpJ, exposure, pos}]
     runtimeS, avgDrawW, peakW, heat {rateW, coolingW, secsToDerate, fightDerateS, drive{..}, weapon{..}}
     cost (thalers), buildHours, layout {place, moved, unplaced}, stress (COMBOS lines, sim/combos.js)
   Coordinates: chassis centre is the origin, +x right, +y forward (the front face is +y). ---- */
const K={
  g:9.81,
  crr:0.08,             // rolling and scrub resistance, x weight
  turnScrub:0.5,        // a skid-steer turns at this share of the wheel-speed turn rate
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
  runtimeMin:90         // a round is 90 s
};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const r3=v=>Math.round(v*1000)/1000;

function evalBuild(cfgIn){
  const errors=[],cfg=normCfg(cfgIn),c=CLASSES[cfg.cls],M=classMult(cfg.cls);
  const pick=(slot,id)=>{const p=part(slot,id);if(p)return p;errors.push("Unknown "+slot+" \""+id+"\"");return part(slot,DEFAULT_CFG[slot]);};
  const ch=pick("chassis",cfg.chassis),dr=pick("drive",cfg.drive),wh=pick("wheels",cfg.wheels),bt=pick("battery",cfg.battery),
    el=pick("electronics",cfg.electronics),wp=pick("weapon",cfg.weapon),wm=pick("weaponMaterial",cfg.weaponMaterial);
  const ex=[];for(const id of cfg.extras){const p=part("extras",id);if(p)ex.push(p);else errors.push("Unknown extra \""+id+"\"");}
  const has=k=>ex.some(e=>e[k]);

  /* ---- geometry (mm) ---- */
  const cellMm=c.cellMm,W=c.gridW*cellMm,L=c.gridH*cellMm,H=ch.heightMm*M.len;
  const cellsAll=c.gridW*c.gridH;let cellsOn=0;
  for(let y=0;y<c.gridH;y++)for(let x=0;x<c.gridW;x++)if(cellOn(cfg.cls,cfg.chassis,x,y))cellsOn++;
  const cellFrac=cellsOn/cellsAll;
  const cx=x=>((x+0.5)-c.gridW/2)*cellMm/1000, cy=y=>(c.gridH/2-(y+0.5))*cellMm/1000;   // cell centre in m
  const cut=ch.shape==="wedge"?c.fp*cellMm/1000:0;
  const hw=W/2000,hl=L/2000;
  const polygon=cut?[[-hw+cut,hl],[hw-cut,hl],[hw,hl-cut],[hw,-hl],[-hw,-hl],[-hw,hl-cut]]:[[-hw,hl],[hw,hl],[hw,-hl],[-hw,-hl]];

  /* ---- mass items: {key, slot, id, g, x, y} (x, y in m), plus the moment-of-inertia extras ---- */
  const items=[];const addM=(key,slot,id,g,x,y)=>{items.push({key,slot,id,g,x,y});};
  addM("chassis","chassis",ch.id,ch.massPerCell*BASE.cells*M.mass*cellFrac,0,cut?-cut*0.2:0);

  /* armour: plate area x thickness x density; the top covers the whole outline */
  const faceArea={front:(W-2*cut*1000)*H,back:W*H,left:(L-cut*1000)*H,right:(L-cut*1000)*H,top:W*L*cellFrac};
  const facePos={front:[0,hl],back:[0,-hl],left:[-hw,0],right:[hw,0],top:[0,0]};
  const armourMapJ={};
  for(const f of FACES){const a=pick("armour",cfg.armour[f]),t=a.thickMm*M.thick,g=faceArea[f]*t*a.density/1000;
    let absorbJ=a.absorbPerG*g,hpJ=a.hpPerG*g,deflect=a.deflect;
    if(f==="front")for(const e of ex){if(e.frontAbsorbJ)absorbJ+=e.frontAbsorbJ*M.mass;if(e.frontDeflect)deflect=Math.min(0.8,deflect+e.frontDeflect);}
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
  const podG=dr.massG*M.mass/dr.pods,wheelG=wh.massG*M.mass/dr.pods;
  let leftX=[],rightX=[];
  for(const k of podKeys){const p=centreOf(k);if(!p)continue;addM(k,"drive",dr.id,podG,p[0],p[1]);
    const side=p[0]<0?-1:1;addM("wheel"+k.slice(5),"wheels",wh.id,wheelG,side*hw,p[1]);(side<0?leftX:rightX).push(side*hw);}
  if(podKeys.length&&(!leftX.length||!rightX.length))errors.push("The drive pods need to be on both sides");
  const bp=centreOf("battery");if(bp)addM("battery","battery",bt.id,bt.massG*M.mass,bp[0],bp[1]);
  const ep=centreOf("electronics");if(ep)addM("electronics","electronics",el.id,el.massG*M.mass,ep[0],ep[1]);

  /* weapon: structure x material, the motor at the mount, the disc at the mount (a front spinner's disc sits on the
     front edge); a wedge with no cells hangs off the front face */
  const isSpin=wp.type==="spinner"||wp.type==="saw";
  let wpos=centreOf("weapon")||[0,hl];
  const frontMounted=wp.mount==="front";
  const discPos=isSpin&&frontMounted&&wp.id!=="hsp"?[wpos[0],hl]:wpos;
  const structG=wp.massG*wm.massMult*M.mass,motorG=wp.motorMassG*M.mass,discG=isSpin?wp.discMass*wm.massMult*M.mass:0;
  if(structG)addM("weapon_struct","weapon",wp.id,structG,wpos[0],wp.fp?wpos[1]:hl);
  if(motorG)addM("weapon_motor","weapon",wp.id,motorG,wpos[0],wpos[1]);
  if(discG)addM("weapon_disc","weapon",wp.id,discG,discPos[0],discPos[1]);
  for(const e of ex){const p=e.fp?centreOf(e.id):[0,e.id==="bar"?hl:0];if(p)addM(e.id,"extras",e.id,e.massG*M.mass,p[0],p[1]);}

  /* ---- mass, budget, COM, inertia ---- */
  let totalG=0,mx=0,my=0;for(const it of items){totalG+=it.g;mx+=it.g*it.x;my+=it.g*it.y;}
  const massKg=totalG/1000,limitKg=c.limitG/1000;
  const com={x:totalG?mx/totalG:0,y:totalG?my/totalG:0};
  /* yaw inertia about the COM: points, plus the chassis and top plate as flat plates, plus the disc's own inertia */
  let moi=0;for(const it of items){const dx=it.x-com.x,dy=it.y-com.y;moi+=it.g/1000*(dx*dx+dy*dy);}
  const plate=g=>g/1000*((W/1000)*(W/1000)+(L/1000)*(L/1000))/12;
  moi+=plate(items[0].g)+plate(armourMapJ.top.massG);
  const radM=isSpin?wp.radius*M.len/1000:0;
  if(isSpin)moi+=discG/1000*radM*radM*(wp.id==="hsp"?wp.shapeK:0.25);
  if(totalG>c.limitG+1e-6)errors.push("Over the "+c.name+" limit");
  const underBudgetPct=(1-totalG/c.limitG)*100;

  /* ---- power: the battery and the ESC cap what the motors may draw at once ---- */
  const brushMismatch=!!dr.brushless&&!el.brushless;
  const drivePowerW=dr.powerW*M.power*(brushMismatch?0.6:1),weaponPowerW=wp.powerW*M.power;
  const peakW=drivePowerW+weaponPowerW+el.idleW*M.power;
  const capW=Math.min(bt.dischargeW*M.power,el.maxPowerW*M.power);
  const powerScale=peakW>0?Math.min(1,capW/peakW):1;

  /* ---- drive: force falls with speed, F = F0 (1 - v / v0); traction caps the push ---- */
  const v0=dr.speedMs*Math.sqrt(M.len)*(brushMismatch?0.6:1)*Math.sqrt(powerScale),F0=dr.forceN*M.mass*powerScale;
  const weightN=massKg*K.g,traction=wh.grip*weightN,pushN=Math.min(F0,traction);
  const resist=K.crr*weightN;
  const driveSpeed=F0>resist?v0*(1-resist/F0):0;
  const accel=Math.max(0,(pushN-resist)/Math.max(massKg,1e-6));
  const trackM=leftX.length&&rightX.length?(rightX.reduce((a,b)=>a+b,0)/rightX.length-leftX.reduce((a,b)=>a+b,0)/leftX.length):W/1000;
  const turnRate=trackM>0?2*driveSpeed/trackM*K.turnScrub:0;
  const turnAccel=moi>0?pushN*trackM/2/moi:0;
  /* pull: with the COM off to one side, the light side's wheels slip first and the heavy side pushes it round */
  const pull=clamp(-com.x/(trackM/2||1),-1,1);

  /* ---- height profile ---- */
  const rWheel=wh.radiusMm*M.len,proud=rWheel-H/2;
  const centred=!wh.tracks&&proud>=K.proudMm*M.len;
  const clearanceMm=centred?proud:K.lowClearMm*M.edge;
  let frontEdgeMm=wp.edgeMm!=null?wp.edgeMm*M.edge:clearanceMm;
  for(const e of ex)if(e.edgeMm)frontEdgeMm+=e.edgeMm*M.edge;
  frontEdgeMm=Math.max(0.5*M.edge,frontEdgeMm);
  const selfRight=has("selfRight")||!!wp.selfRights;
  const invertible=centred||selfRight;
  const height={clearanceMm:r3(clearanceMm),frontEdgeMm:r3(frontEdgeMm),heightMm:r3(H),invertible,drivesInverted:centred,selfRight,proudMm:r3(proud)};

  /* ---- weapon ---- */
  const weapon={type:wp.type,id:wp.id,energyJ:0,bite:0,reachM:0,mountM:wpos,edgeMm:wp.edgeMm!=null?r3(wp.edgeMm*M.edge):null,
    hpJ:wp.hp*M.mass*wm.hp/160,material:wm.name};
  if(isSpin){const rpm=wp.rpmMax/M.len,omega=rpm*2*Math.PI/60,I=wp.shapeK*discG/1000*radM*radM,storedJ=0.5*I*omega*omega;
    const spinUpS=weaponPowerW>0?storedJ/(weaponPowerW*powerScale*K.spinEff):Infinity;
    Object.assign(weapon,{rpm,omega,inertia:I,storedJ,energyJ:storedJ,tipSpeed:omega*radM,spinUpS,radiusM:radM,discKg:discG/1000,
      recoilFactor:clamp(wp.recoil*storedJ/(Math.max(massKg,1e-6)*K.recoilRef),0,1.5),bite:wp.bite*wm.bite,
      shearJ:wm.hp*wm.shearMult*M.mass,bendJ:wm.hp*M.mass,reachM:radM,sawJps:wp.sawJps?wp.sawJps*M.power:0});}
  if(wp.type==="flipper"){const F=wp.forceN*M.mass,stroke=wp.strokeMm*M.len/1000,launchJ=F*stroke;
    Object.assign(weapon,{shots:wp.shots,forceN:F,launchJ,energyJ:launchJ,rechargeS:wp.rechargeS,canLiftKg:F/(K.g*K.flipLever),
      flipHeightM:Math.max(0,launchJ*K.flipEff/(limitKg*K.g)-stroke),reachM:wp.reachMm*M.len/1000,bite:wm.bite});}
  if(wp.type==="lifter"){const F=wp.liftN*M.mass*powerScale,liftM=wp.liftMm*M.len/1000;
    Object.assign(weapon,{liftN:F,liftM,energyJ:F*liftM,canLiftKg:F/(K.g*K.liftLever),reachM:wp.reachMm*M.len/1000,bite:wm.bite});}
  if(wp.type==="hammer")Object.assign(weapon,{energyJ:wp.energyJ*M.mass*powerScale,swingS:wp.swingS/Math.sqrt(powerScale),reachM:0.6*L/1000,bite:wm.bite});
  if(wp.type==="crusher")Object.assign(weapon,{forceN:wp.forceN*M.mass*powerScale,energyJ:wp.crushJ*M.mass*powerScale,reachM:0.5*L/1000,bite:wm.bite});
  if(wp.type==="wedge")Object.assign(weapon,{reachM:wp.reachMm*M.len/1000,bite:wm.bite});

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
  for(const k of podKeys){const p=centreOf(k);if(!p)continue;const side=p[0]<0?"left":"right";
    parts.push({key:"wheel"+k.slice(5),slot:"wheels",id:wh.id,cells:cellsOf(k),massKg:r3(wheelG/1000),hpJ:wh.hp*M.mass,
      exposure:r3(wh.exposure*(1-armourMapJ[side].prot*0.5)+K.faceWeight[side]*wh.exposure*0.5),pos:[p[0]<0?-hw:hw,p[1]]});}
  addPart("battery","battery",bt.id,bt.hp*M.mass,bt.massG*M.mass);
  addPart("electronics","electronics",el.id,el.hp*M.mass,el.massG*M.mass);
  if(wp.type!=="none"){if(wp.fp)addPart("weapon","weapon",wp.id,weapon.hpJ,structG+motorG+discG);
    else parts.push({key:"weapon",slot:"weapon",id:wp.id,cells:[],massKg:r3(structG/1000),hpJ:weapon.hpJ,exposure:r3(K.faceWeight.front),pos:[0,hl]});}
  for(const e of ex){if(e.fp)addPart(e.id,"extras",e.id,e.hp*M.mass,e.massG*M.mass);
    else parts.push({key:e.id,slot:"extras",id:e.id,cells:[],massKg:r3(e.massG*M.mass/1000),hpJ:e.hp*M.mass,exposure:0,pos:[0,e.id==="bar"?hl:0]});}
  let es=0,eg=0;for(const p of parts)if(p.cells.length){es+=p.exposure*p.massKg;eg+=p.massKg;}
  const exposureScore=eg?es/eg:0;
  let weakestFace="front",wv=1e9;for(const f of ["front","back","left","right"]){const A=armourMapJ[f],v=(A.absorbJ+A.hpJ)/K.faceWeight[f];if(v<wv){wv=v;weakestFace=f;}}

  /* ---- runtime and heat ---- */
  const avgDrawW=(drivePowerW*K.driveDuty+weaponPowerW*K.weaponDuty)*powerScale+el.idleW*M.power;
  const runtimeS=avgDrawW>0?bt.capacityWs*M.mass*K.usableBattery/avgDrawW:Infinity;
  const coolTotal=el.coolingW*M.power;
  const group=(heatW,motorKg,duty,share)=>{const rateW=heatW*M.power,coolW=K.passiveCoolW*M.power+coolTotal*share,budgetJ=K.heatJPerKg*motorKg;
    const full=rateW>coolW?budgetJ/(rateW-coolW):null,fight=rateW*duty>coolW?budgetJ/(rateW*duty-coolW):null;
    return{rateW,coolW,budgetJ,secsToDerate:full,fightDerateS:fight};};
  const weaponMotorKg=motorG/1000;
  const heatD=group(dr.heatW+el.heatW,dr.massG*dr.motorFrac*M.mass/1000,K.driveDuty,weaponMotorKg&&wp.heatW?0.5:1);
  const heatW_=wp.heatW&&weaponMotorKg?group(wp.heatW,weaponMotorKg,K.weaponDuty,0.5):null;
  const minN=(a,b)=>a==null?b:b==null?a:Math.min(a,b);
  const heat={rateW:heatD.rateW+(heatW_?heatW_.rateW:0),coolingW:heatD.coolW+(heatW_?heatW_.coolW:0),drive:heatD,weapon:heatW_,
    secsToDerate:minN(heatD.secsToDerate,heatW_&&heatW_.secsToDerate),fightDerateS:minN(heatD.fightDerateS,heatW_&&heatW_.fightDerateS),
    hotPart:heatW_&&heatW_.fightDerateS!=null&&(heatD.fightDerateS==null||heatW_.fightDerateS<heatD.fightDerateS)?"weapon":"drive"};

  /* ---- cost and hours: the whole bot bought new (fitBill, below) ---- */
  const bill=fitBill(null,cfg),cost=bill.cost,hours=bill.hours;

  const b={cfg,cls:c.id,className:c.name,valid:!errors.length,errors,
    totalG,limitG:c.limitG,massKg,limitKg,underBudgetPct,
    com,comOffsetMm:Math.hypot(com.x,com.y)*1000,pull,moi,polygon,widthM:W/1000,lengthM:L/1000,
    driveSpeed,accel,pushN,turnRate,turnAccel,trackM,powerScale,peakW,brushMismatch,
    height,weapon,armourMapJ,weakestFace,exposureScore,cells,parts,
    runtimeS,avgDrawW,heat,cost,buildHours:hours,layout:lay,
    items:items.map(it=>({key:it.key,slot:it.slot,id:it.id,g:Math.round(it.g*10)/10}))};
  b.stress=stressReport(b);
  b.verdict=!b.valid?(totalG>c.limitG?"over":"invalid"):b.stress.some(s=>s.sev==="bad"||s.sev==="warn")?"flaws":"valid";
  return b;}

/* ---- fitBill(fitted, draft): what fitting the draft costs, part by part. Pay on fit, no refund (plan section 1): every
   part that differs from the fitted bot is bought at full price; what comes off is gone. A new weapon is made of the
   material, so it pays for the material too. fitted null (or another class) means the whole bot.
   Returns {lines:[{slot, face, id, name, cost, hours}], cost, hours}. evalBuild's cost is fitBill(null, cfg).cost. ---- */
function fitBill(fitted,draft){const b=normCfg(draft),a=fitted&&fitted.cls===b.cls?normCfg(fitted):null,M=classMult(b.cls),lines=[];
  let cost=0,hours=0;
  const add=(slot,id,face)=>{const p=part(slot,id);if(!p)return;const c=p.cost*M.cost,h=p.hours*M.hours;cost+=c;hours+=h;
    lines.push({slot,face:face||null,id,name:p.name,cost:Math.round(c),hours:Math.round(h*10)/10});};
  for(const s of ["chassis","drive","wheels","battery","electronics","weapon"])if(!a||a[s]!==b[s])add(s,b[s]);
  if(b.weapon!=="none"&&(!a||a.weaponMaterial!==b.weaponMaterial||a.weapon!==b.weapon))add("weaponMaterial",b.weaponMaterial);
  for(const f of FACES)if((!a||a.armour[f]!==b.armour[f])&&b.armour[f]!=="none")add("armour",b.armour[f],f);
  for(const e of b.extras)if(!a||a.extras.indexOf(e)<0)add("extras",e);
  return{lines,cost:Math.round(cost),hours:Math.round(hours*10)/10};}
/* the same cfg? (layout aside: moving parts round the chassis is free) */
function sameParts(a,b){if(!a||!b)return false;a=normCfg(a);b=normCfg(b);if(a.cls!==b.cls)return false;
  for(const s of PART_SLOTS)if(a[s]!==b[s])return false;for(const f of FACES)if(a.armour[f]!==b.armour[f])return false;
  return a.extras.slice().sort().join()===b.extras.slice().sort().join();}
