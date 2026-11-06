/* ---- combos.js: COMBOS, the stress-report rules, and stressReport(b), which runs them over an evalBuild() result.
   These don't change the physics; they say in plain words what the physics is about to do to you ("spinner shaft will
   shear above 240 J on this material", "rear armour none: drive pods exposed"). The same rules write the post-mortem's
   redesign hints in PR 6. Plan section 4d.
   Each rule: {id, sev, test(b) -> falsy or a value handed to text, text(b, v)}. sev is "bad" (will lose you fights),
   "warn" (a weakness), "info" (worth knowing) or "good"; it may be a function of (b, v). stressReport sorts bad first. ---- */
const SEV_ORDER={bad:0,warn:1,info:2,good:3};
const FACE_NAME={front:"Front",back:"Rear",left:"Left",right:"Right",top:"Top"};
const PART_NAME={drive:"drive pods",battery:"battery",electronics:"speed controllers",weapon:"weapon",extras:"extras",wheels:"wheels"};
const n0=v=>String(Math.round(v)),n1=v=>(Math.round(v*10)/10).toFixed(1).replace(/\.0$/,"");
const gOrKg=g=>g>=1000?n1(g/1000)+" kg":n0(g)+" g";
/* parts whose cells touch a face's edge row or column */
function partsOnFace(b,f){const c=CLASSES[b.cls],out=new Set();
  for(const p of b.parts){if(p.slot==="wheels")continue;for(const q of p.cells){
    if((f==="front"&&q[1]<c.fp)||(f==="back"&&q[1]>=c.gridH-c.fp)||(f==="left"&&q[0]<c.fp)||(f==="right"&&q[0]>=c.gridW-c.fp)){out.add(p.slot);break;}}}
  if((f==="left"||f==="right")&&b.parts.some(p=>p.slot==="wheels"))out.add("wheels");
  return[...out];}
const COMBOS=[
  {id:"over",sev:"bad",test:b=>b.totalG>b.limitG&&b.totalG-b.limitG,
    text:(b,v)=>"Over the "+b.className+" limit by "+gOrKg(v)+". It can't be fitted: take something off."},
  {id:"error",sev:"bad",test:b=>b.errors.filter(e=>e.indexOf("Over the")!==0).join(". "),text:(b,v)=>v+"."},
  {id:"under",sev:"warn",test:b=>b.underBudgetPct>5&&b.limitG-b.totalG,
    text:(b,v)=>gOrKg(v)+" unused ("+n0(b.underBudgetPct)+"% under the limit): that's armour you didn't fit."},
  {id:"shear",sev:"bad",test:b=>b.weapon.storedJ>b.weapon.shearJ&&b.weapon.shearJ,
    text:(b,v)=>"Spinner shaft will shear above "+n0(v)+" J on "+b.weapon.material.toLowerCase()+", and this disc stores "+n0(b.weapon.storedJ)+" J. Use a tougher material or a smaller disc."},
  {id:"bend",sev:"warn",test:b=>b.weapon.storedJ>b.weapon.bendJ&&b.weapon.storedJ<=b.weapon.shearJ&&b.weapon.bendJ,
    text:(b,v)=>"A full-speed hit bends a "+b.weapon.material.toLowerCase()+" disc above "+n0(v)+" J (it stores "+n0(b.weapon.storedJ)+" J): expect it to go out of true."},
  {id:"bare",sev:(b,v)=>v.parts.length?"bad":"warn",
    test:b=>{for(const f of ["front","back","left","right"])if(b.armourMapJ[f].id==="none"&&!(f==="front"&&["wedge","lifter","flipper"].indexOf(b.weapon.type)>=0))return{f,parts:partsOnFace(b,f)};return null;},
    text:(b,v)=>FACE_NAME[v.f]+" armour none"+(v.parts.length?": "+v.parts.map(s=>PART_NAME[s]).join(" and ")+" exposed.":". Nothing sits right behind it yet, but the chassis takes every hit there.")},
  {id:"spinup",sev:(b,v)=>v>7?"bad":"warn",test:b=>b.weapon.spinUpS>4&&b.weapon.spinUpS,
    text:(b,v)=>"Spin-up "+n1(v)+" s: you lose the first exchange."},
  {id:"flip",sev:"bad",test:b=>b.weapon.type==="flipper"&&b.weapon.canLiftKg<b.limitKg&&b.weapon.canLiftKg,
    text:(b,v)=>"Flipper can't lift a bot over "+n1(v)+" kg in this class (the limit is "+n1(b.limitKg)+" kg)."},
  {id:"lift",sev:"warn",test:b=>b.weapon.type==="lifter"&&b.weapon.canLiftKg<b.limitKg&&b.weapon.canLiftKg,
    text:(b,v)=>"Lifter only raises "+n1(v)+" kg: a bot at the "+n1(b.limitKg)+" kg limit stays on the floor."},
  {id:"runtime",sev:(b,v)=>v<K.runtimeMin?"bad":"warn",test:b=>b.runtimeS<K.runtimeMin*1.33&&b.runtimeS,
    text:(b,v)=>"Battery runtime "+n0(v)+" s"+(v<K.runtimeMin?": it goes flat before the 90 s bell.":": no margin for a three-round final.")},
  {id:"heat",sev:(b,v)=>v<K.runtimeMin?"bad":"warn",test:b=>b.heat.fightDerateS!=null&&b.heat.fightDerateS<K.runtimeMin*1.33&&b.heat.fightDerateS,
    text:(b,v)=>(b.heat.hotPart==="weapon"?"Weapon motor":"Drive")+" overheats at "+n0(v)+" s and loses power."},
  {id:"power",sev:"warn",test:b=>b.powerScale<0.95&&b.powerScale,
    text:(b,v)=>"The "+(b.limits.batteryW<=b.limits.escW?"battery":"speed controllers")+" can't feed everything at once: drive and weapon run at "+n0(v*100)+"% when both are flat out."},
  {id:"brushless",sev:"bad",test:b=>b.brushMismatch,text:()=>"Brushless drive on brushed speed controllers: it stutters along at 60%. Fit a brushless ESC."},
  {id:"com",sev:"warn",test:b=>Math.abs(b.com.x)>b.widthM*0.02&&b.com.x,
    text:(b,v)=>"COM "+n0(Math.abs(v)*1000)+" mm off centre: pulls "+(v<0?"right":"left")+"."},
  {id:"nose",sev:"info",test:b=>Math.abs(b.com.y)>b.lengthM*0.15&&b.com.y,
    text:(b,v)=>(v>0?"Nose":"Tail")+"-heavy: the COM sits "+n0(Math.abs(v)*1000)+" mm "+(v>0?"forward":"back")+". "+(v>0?"Good for wedging, worse for turning.":"The front goes light when you push.")},
  {id:"edgeHigh",sev:"warn",test:b=>{const g=WEDGE_GAUGES[b.cls]||[],u=g.filter(x=>x<b.height.frontEdgeMm).length;return u>g.length/2&&u;},
    text:(b,v)=>"Front edge "+n1(b.height.frontEdgeMm)+" mm: most wedges in this class get under you."},
  {id:"edgeLow",sev:"good",test:b=>{const g=WEDGE_GAUGES[b.cls]||[];return g.length&&b.height.frontEdgeMm<=g[0];},
    text:b=>"Front edge "+n1(b.height.frontEdgeMm)+" mm: almost nothing in this class gets under you."},
  {id:"invert",sev:"bad",test:b=>!b.height.invertible,text:()=>"Not invertible and no self-righter: one flip ends the fight."},
  {id:"inverted",sev:"good",test:b=>b.height.drivesInverted,text:b=>"Wheels stand "+n1(b.height.proudMm)+" mm proud both sides: it drives either way up."},
  {id:"righter",sev:"info",test:b=>!b.height.drivesInverted&&b.height.selfRight,
    text:b=>"Doesn't drive upside down; "+(b.cfg.extras.indexOf("selfright")>=0?"the self-righter":"the "+b.weapon.type)+" has to put it back."},
  {id:"recoil",sev:"warn",test:b=>b.weapon.recoilFactor>0.8&&b.weapon.recoilFactor,
    text:(b,v)=>"Recoil "+n1(v)+": every big hit throws you back almost as far as them. Keep your back off the walls."},
  {id:"slow",sev:"warn",test:b=>b.driveSpeed<1.4*Math.sqrt(classMult(b.cls).len)&&b.driveSpeed,
    text:(b,v)=>"Top speed "+n1(v)+" m/s: anything faster picks the fight."},
  {id:"pusher",sev:"info",test:b=>b.weapon.type==="none",text:()=>"No weapon: you win on pushing, hazards and the judges."},
  {id:"covered",sev:"good",test:b=>b.exposureScore<0.6&&["front","back","left","right"].every(f=>b.armourMapJ[f].id!=="none")&&b.exposureScore,
    text:()=>"Every face armoured and the insides tucked away."}
];
function stressReport(b){const out=[];
  for(const r of COMBOS){try{const v=r.test(b);if(!v)continue;   // a rule that throws is skipped, never fatal
    const sev=typeof r.sev==="function"?r.sev(b,v):r.sev;out.push({id:r.id,sev,text:r.text(b,v)});}catch(e){}}
  return out.sort((a,b)=>SEV_ORDER[a.sev]-SEV_ORDER[b.sev]);}
