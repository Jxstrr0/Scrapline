/* ===================== app/build.js: the Build tab =====================
   Design the bot for a weight class (docs/SCRAPLINE-PLAN.md section 5):
   - the weight bar and summary capsule, pinned at the top (grams left, speed, weapon J, weakest face, runtime, verdict);
   - section rows (Class, Chassis, Armour, Drive & wheels, Power, Weapon, Weapon material, Extras, Layout and side profile,
     Stress report, Designs). Every option shows its price and a PEW-style delta line (.d) against the current draft;
   - the layout editor on the chassis grid (tap a part, tap where it goes; drag works too), exposure shaded per cell, the
     centre of mass marked; the side profile strip shows clearance and front edge height in mm;
   - designs: named blueprints per class, plus the sim's TEST_BUILDS as starting points.
   Pay on fit, no refund (plan section 1): edits make a draft (S.bots[cls].draft); the Fit bar shows what fitting it costs
   (SIM.fitBill: every part that differs from the fitted bot, at full price) and Fit charges it in the career (money and
   workshop hours, cut by tools: crFitHours); before the career it is free. In the career a part may need a tool and a
   class may not be open yet (crFitBlock, app/career.js). Going over the weight limit is refused, never fitted. Moving parts on the grid is free.
   PR 8: a spinner's weapon row has your own disc profile (rim, a name; its teeth are the Tooth count dial from 0.1.48; R&D "disc" and a fabricator in the career),
   the class limit follows the season's rule changes (crLimitG, app/team.js), and with an engineer on the team the stress
   report works out the impact and drop lines for the draft (no bench needed).
   ?sim=1 adds the raw evalBuild() result at the bottom. */
const B={open:{stress:true},face:"front",sel:null,drag:null,delKey:null};
const fmtG=g=>Math.abs(g)>=10000?(g/1000).toLocaleString("en-GB",{maximumFractionDigits:1})+" kg":Math.round(g).toLocaleString("en-GB")+" g";
const fmtS=s=>s==null||!isFinite(s)?"never":Math.round(s)+" s";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const FACE_LBL={front:"Front",back:"Rear",left:"Left",right:"Right",top:"Top"};
const SEV_LBL={bad:["broke","Bad"],warn:["worn","Weak"],info:["info","Note"],good:["ok","Good"]};
const VERDICT={valid:["ok","Ready"],flaws:["worn","Flaws"],over:["broke","Over"],invalid:["broke","Can't fit"]};
const clone=o=>JSON.parse(JSON.stringify(o));
/* evalBuild at the season's weight limit (the career's rule changes, app/team.js crLimitG) */
const bEv=cfg=>SIM.evalBuild(cfg,{limitG:crLimitG(SIM.normCfg(cfg).cls)});

/* ---- the bot and its draft for the class on the Build tab ---- */
function bCls(){const c=ST().buildCls;return SIM.CLASSES[c]?c:"beetle";}
/* a save from an older or damaged game may hold a draft or bot with missing fields or unknown ids: each one goes through
   normCfg once (unknown parts become the defaults) before anything reads it */
const bNormed=new WeakSet();
function bBot(cls){cls=cls||bCls();let b=S.bots[cls];
  if(!b||typeof b!=="object")b=S.bots[cls]={cfg:null,damage:{},draft:null};
  if(!b.damage||typeof b.damage!=="object")b.damage={};
  if(b.cfg&&!bNormed.has(b.cfg)){b.cfg=typeof b.cfg==="object"?SIM.normCfg(Object.assign({},b.cfg,{cls})):null;if(b.cfg)bNormed.add(b.cfg);}
  if(!b.draft&&!b.cfg&&crOn()){b.draft=crStarter(cls);bNormed.add(b.draft);}   // a class's first draft in a career is the starter bot: nothing on it is locked yet (0.1.30)
  if(!b.draft||!bNormed.has(b.draft)){b.draft=SIM.normCfg(Object.assign({},b.draft&&typeof b.draft==="object"?b.draft:b.cfg||SIM.DEFAULT_CFG,{cls}));bNormed.add(b.draft);}
  return b;}
const draft=()=>bBot().draft;
/* evalBuild results for this draft, kept until it changes */
let bEvalKey="",bEvalRes=null;
function bEval(){const k=crLimitG(bCls())+JSON.stringify(draft());if(k!==bEvalKey){bEvalKey=k;bEvalRes=bEv(draft());}return bEvalRes;}
const bTry=mut=>{const c=clone(draft());mut(c);return c;};

/* change the draft. Refused (with the grams) if it would put the bot over the limit, or further over than it is: that
   covers a change that lowers the limit too, like taking Shuffler legs off a bot built to their higher limit (0.1.52.3) */
function bSet(mut,why){const before=bEval(),c=bTry(mut),r=bEv(c),over=r.totalG-r.limitG;
  if(over>0&&over>Math.max(0,before.totalG-before.limitG)){
    toast(r.limitG<before.limitG?`That lowers the limit to ${fmtG(r.limitG)}: the bot would be ${fmtG(over)} over. Take something off first.`:`${fmtG(over)} over the ${r.className} limit. Take something off first.`);buzz(30);return false;}
  bBot().draft=SIM.normCfg(c);bNormed.add(bBot().draft);bLayoutSync();save();bRender();if(why)toast(why);return true;}
/* moving parts and turning the dials are free: if the draft and the fitted bot have the same parts, the fitted bot takes
   the new layout and dials (0.1.33) */
function bLayoutSync(){const b=bBot();if(b.cfg&&SIM.sameParts(b.cfg,b.draft)){b.cfg.layout=clone(b.draft.layout);b.cfg.tune=clone(b.draft.tune);}}
const buzz=ms=>{try{if(!reduced()&&navigator.vibrate)navigator.vibrate(ms);}catch(e){}};

/* the stress report: with measured numbers from the bench when the draft is the fitted, tested bot (app/bench.js) */
function bStress(){const r=bEval(),m=typeof benchMeasured==="function"?benchMeasured(bCls(),draft()):null,eng=tmHas("engineer");
  if(!eng)return m?SIM.stressReport(r,m):r.stress;
  /* the engineer works the impact and drop tests out on paper for the draft (kept until the draft changes) */
  const k=JSON.stringify(draft());if(bStress.k!==k){bStress.k=k;bStress.paper={impact:SIM.runBench(r,"impact"),drop:SIM.runBench(r,"drop")};}
  const mm=Object.assign({},bStress.paper,m||{}),bench=id=>(SIM.COMBOS.find(c=>c.id===id)||{}).bench;
  return SIM.stressReport(r,mm).map(l=>l.measured&&!(m&&m[bench(l.id)])?Object.assign({},l,{measured:false,paper:tmFirst(eng.name)}):l);}

/* the weak side: measured by the impact test when the draft is the tested bot, else predicted */
function bWeak(r){const m=typeof benchMeasured==="function"?benchMeasured(bCls(),draft()):null;return m&&m.impact&&m.impact.weakest||r.weakestFace;}

/* ---- delta lines: what an option would change, against the draft ---- */
function bDelta(r,base,slot){const out=[];const dg=r.totalG-base.totalG;
  if(r.totalG>r.limitG)return`<i class="dn">${fmtG(r.totalG-r.limitG)} over</i>`;
  out.push(`<i>${Math.abs(dg)<0.5?"±0 g":(dg>0?"+":"−")+fmtG(Math.abs(dg))}</i>`);
  const cand=[];
  const num=(v,a,b,unit,dp,goodUp,min)=>{const d=v(a)-v(b);if(!isFinite(d)||Math.abs(d)<min)return;cand.push(`<i class="${(d>0)===goodUp?"up":"dn"}">${d>0?"+":"−"}${Math.abs(d).toFixed(dp)}${unit}</i>`);};
  const armour=x=>{let t=0;for(const f of ["front","back","left","right","top"])t+=x.armourMapJ[f].absorbJ+x.armourMapJ[f].hpJ;return t;};
  const run=x=>isFinite(x.runtimeS)?x.runtimeS:999;
  const order={chassis:["hull","armour","edge","speed"],armour:["armour","speed"],drive:["speed","run","push"],wheels:["speed","edge","push"],wheelbase:["slide","push","turn","run"],
    battery:["run","speed"],electronics:["run","speed","heat"],weapon:["wj","edge","run"],weaponMaterial:["wj","bend"],extras:["edge","armour","speed"],front:["edge","armour","speed"],back:["right","armour","run","speed"],
    volt:["speed","wj","heat","run"],teeth:["hitj","kick","bend"],wheel:["inv","clr","speed","edge"],bias:["edge","push"],body:["inv","tall","armour","edge"]}[slot]||["speed","wj"];
  for(const k of order){
    if(k==="inv"&&!!r.height.drivesInverted!==!!base.height.drivesInverted)cand.push(r.height.drivesInverted?'<i class="up">drives upside down</i>':'<i class="dn">can\'t drive upside down</i>');
    if(k==="right"&&!!r.height.selfRight!==!!base.height.selfRight)cand.push(r.height.selfRight?'<i class="up">self-rights</i>':'<i class="dn">no self-righter</i>');
    if(k==="tall")num(x=>x.height.heightMm,r,base," mm tall",1,false,0.5);
    if(k==="speed")num(x=>x.driveSpeed,r,base," m/s",1,true,0.05);
    if(k==="turn")num(x=>x.turnRate,r,base," turn",1,true,0.2);
    if(k==="slide"&&!!r.wheelbase.strafe!==!!base.wheelbase.strafe)cand.push(r.wheelbase.strafe?'<i class="up">slides sideways</i>':'<i class="dn">no sideways slide</i>');
    if(k==="push")num(x=>x.pushN,r,base," N",base.pushN<100?1:0,true,base.pushN*0.03);
    if(k==="wj")num(x=>x.weapon.energyJ||0,r,base," J",0,true,Math.max(1,(base.weapon.energyJ||0)*0.01));
    if(k==="hull")num(x=>{const ch=SIM.part("chassis",x.cfg.chassis),bd=SIM.part("body",x.cfg.body);return ch?ch.hp*(bd?bd.hpMul:1)*SIM.classMult(x.cls).mass:0;},r,base," J hull",0,true,1);   /* 0.1.53: the box's own strength; its plates no longer change with its height */
    if(k==="armour")num(armour,r,base," J armour",0,true,Math.max(1,armour(base)*0.01));
    if(k==="run")num(run,r,base," s run",0,true,2);
    if(k==="clr")num(x=>x.height.clearanceMm,r,base," mm ride",1,false,0.1);
    if(k==="edge")num(x=>x.height.frontEdgeMm,r,base," mm edge",1,false,0.1);
    if(k==="heat")num(x=>x.heat.fightDerateS==null?999:x.heat.fightDerateS,r,base," s heat",0,true,2);
    if(k==="hitj")num(x=>(x.weapon.storedJ||0)*(x.weapon.bite||0),r,base," J a hit",0,true,1);   /* 0.1.48, the Tooth count dial: what a full-speed hit lands, the kick back, the wait before the next */
    if(k==="kick")num(x=>(x.weapon.recoil||0)*100,r,base,"% kick",0,false,1);
    if(k==="gap")num(x=>(x.weapon.hitGap||1)*SIM.FIGHT.hitGapS,r,base," s between hits",2,false,0.005);
    if(k==="bend")num(x=>x.weapon.bendJ||0,r,base," J to bend",0,true,1);}
  return out.concat(cand.slice(0,slot==="body"||SIM.TUNE[slot]?3:2)).join("");}

/* ---- option rows ---- */
function bOpts(slot,cur,fittedId,mk,price){const base=bEval(),cls=bCls(),M=SIM.classMult(cls);
  return`<div class="opts">`+SIM.PARTS[slot].map(p=>{const c=bTry(x=>mk(x,p.id)),r=p.id===cur?base:bEv(c),on=p.id===cur;
    const pr=price===false?"":p.cost?fmt$(p.cost*M.cost):"—";
    return`<button type="button" class="opt${on?" on":""}${r.totalG>r.limitG&&!on?" over":""}" data-slot="${slot}" data-id="${p.id}" aria-pressed="${on}"><span>${esc(p.name)}${fittedId===p.id?'<span class="tag">fitted</span>':""}${bLock(slot,p.id)}</span><span class="pr">${pr}</span><small class="d">${on?"<i>chosen</i>":bDelta(r,base,slot)}</small></button>`;}).join("")+`</div>`;}
/* in the career a part may need a tool first: shown on the option, refused at Fit (app/career.js) */
const bLock=(slot,id)=>{const w=crPartLock(slot,id);return w?`<span class="tag lock">${esc(w)}</span>`:"";};
const bName=(slot,id)=>{const p=SIM.part(slot,id);return p?p.name:id;};

/* ---- each section: title, a one-line summary, and its body ---- */
const B_SECS=[
  /* your bot's name and your team (0.1.24, app/livery.js): the name is per class, the team (colours, badge) is shared */
  {id:"team",t:"Name & team",sum:()=>lvBotName(bCls())+" · "+lvMine().name,
    body:()=>{const t=lvMine();return`<div class="field"><label class="lbl" for="bName">Bot name</label><input id="bName" type="text" maxlength="${LIVERY.maxName}" autocomplete="off" value="${esc(lvBotName(bCls()))}"></div>
      <div class="lvrow">${lvBadge(t,44)}<div><b>${esc(t.name)}</b><small>Team colours and badge, on every bot you field</small></div><button type="button" class="btn sm" data-act="team">Edit team</button></div>`;}},
  {id:"cls",t:"Class",sum:()=>SIM.CLASSES[bCls()].name+" · "+fmtG(crLimitG(bCls())),
    body:()=>`<div class="seg" role="group" aria-label="Weight class">${SIM.CLASS_IDS.map(id=>{const c=SIM.CLASSES[id],on=id===bCls(),f=S.bots[id]&&S.bots[id].cfg;
      return`<button type="button" data-cls="${id}" class="${on?"on":""}" aria-pressed="${on}">${c.name.replace("weight","")}<small>${fmtG(crLimitG(id))}${f?" ·&nbsp;fitted":""}</small></button>`;}).join("")}</div>
      <p>One bot per class. Each class keeps its own bot, draft and designs.</p>`},
  {id:"chassis",t:"Chassis",sum:()=>bName("chassis",draft().chassis),
    body:()=>bOpts("chassis",draft().chassis,bFit("chassis"),(c,id)=>{c.chassis=id;})},
  {id:"body",t:"Body",sum:()=>bName("body",draft().body),
    body:()=>{const p=SIM.part("body",draft().body);return(p&&p.line?`<p>${esc(p.line)}</p>`:"")+bOpts("body",draft().body,bFit("body"),(c,id)=>{c.body=id;if(SIM.part("body",id).twoWheel){c.wheelbase="std";if(SIM.part("wheels",c.wheels).tracks)c.wheels="rubber";}});}},   // a two-wheel drum (0.1.63) runs on one big wheel a side
  {id:"armour",t:"Armour",sum:()=>{const r=bEval();return"weakest: "+FACE_LBL[r.weakestFace].toLowerCase();},
    body:()=>{const d=draft(),f=B.face;
      return bArmourMap()+`<div class="seg faces" role="group" aria-label="Face">${["front","back","left","right","top"].map(x=>`<button type="button" data-face="${x}" class="${x===f?"on":""}" aria-pressed="${x===f}">${FACE_LBL[x]}<small>${esc(bName("armour",d.armour[x]).replace("HDPE, ","HDPE "))}</small></button>`).join("")}</div>`
        +bOpts("armour",d.armour[f],bFit("armour",f),(c,id)=>{c.armour[f]=id;})
        +`<div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="armour-all">${FACE_LBL[f]} plate on all four sides</button></div>`;}},
  {id:"drive",t:"Drive & wheels",sum:()=>bName("drive",draft().drive)+" · "+bName("wheels",draft().wheels).toLowerCase()+(draft().wheelbase&&draft().wheelbase!=="std"?" · "+bName("wheelbase",draft().wheelbase).toLowerCase():""),
    body:()=>{const p=SIM.part("wheelbase",draft().wheelbase||"std");
      return`<h4>Drive</h4>`+bOpts("drive",draft().drive,bFit("drive"),(c,id)=>{c.drive=id;})+`<h4>Wheels</h4>`+bOpts("wheels",draft().wheels,bFit("wheels"),(c,id)=>{c.wheels=id;})
      +`<h4>Wheel layout</h4>`+(p&&p.line?`<p>${esc(p.line)}</p>`:"")+bOpts("wheelbase",draft().wheelbase||"std",bFit("wheelbase"),(c,id)=>{c.wheelbase=id;});}},
  {id:"power",t:"Power",sum:()=>bName("battery",draft().battery)+" · "+bName("electronics",draft().electronics),
    body:()=>`<h4>Battery</h4>`+bOpts("battery",draft().battery,bFit("battery"),(c,id)=>{c.battery=id;})+`<h4>Speed controllers</h4>`+bOpts("electronics",draft().electronics,bFit("electronics"),(c,id)=>{c.electronics=id;})},
  {id:"weapon",t:"Weapon",sum:()=>bName("weapon",draft().weapon)+(draft().disc?` · “${draft().disc.name}”`:""),
    body:()=>bOpts("weapon",draft().weapon,bFit("weapon"),(c,id)=>{c.weapon=id;if(SIM.ALL_ROUND.indexOf(id)>=0){c.front="none";c.back="none";}if(SIM.part("weapon",id).mount==="back")c.back="none";})+bDisc()},
  {id:"material",t:"Weapon material",sum:()=>draft().weapon==="none"?"no weapon":bName("weaponMaterial",draft().weaponMaterial),
    body:()=>draft().weapon==="none"?"<p>No weapon fitted, so there is nothing to make out of anything.</p>":bOpts("weaponMaterial",draft().weaponMaterial,bFit("weaponMaterial"),(c,id)=>{c.weaponMaterial=id;})+"<p>The disc, arm or wedge plate. Tougher stock bends later and bites harder; lighter stock stores less energy.</p>"},
  /* 0.1.32: a front attachment (not on a bot whose weapon is its own front) and the back slot */
  {id:"attach",t:"Front & back",sum:()=>{const d=draft(),f=d.front&&d.front!=="none"?bName("front",d.front):"",k=d.back&&d.back!=="none"?bName("back",d.back):"";
      return f||k?[f,k].filter(Boolean).join(" · ").toLowerCase().replace(/^./,c=>c.toUpperCase()):"nothing fitted";},
    body:()=>{const d=draft(),own=SIM.OWN_FRONT.indexOf(SIM.part("weapon",d.weapon).type)>=0,round=SIM.ALL_ROUND.indexOf(d.weapon)>=0,pf=SIM.part("front",d.front||"none"),pk=SIM.part("back",d.back||"none");
      if(round)return`<p>The ${esc(bName("weapon",d.weapon).toLowerCase())} spins all the way round the bot: there is no room for a front or a back.</p>`;
      return`<h4>Front</h4>`+(own?`<p>The ${esc(bName("weapon",d.weapon).toLowerCase())} is its own front: there is no room for an attachment.</p>`:(pf&&pf.line?`<p>${esc(pf.line)}</p>`:"")+bOpts("front",d.front||"none",bFit("front"),(c,id)=>{c.front=id;}))
      +`<h4>Back</h4>`+(SIM.part("weapon",d.weapon).mount==="back"?`<p>The ${esc(bName("weapon",d.weapon).toLowerCase())}'s boom comes off the back: there is no room for a back.</p>`:(pk&&pk.line?`<p>${esc(pk.line)}</p>`:"")+bOpts("back",d.back||"none",bFit("back"),(c,id)=>{c.back=id;}))
      +`<p class="hint">Swap the front between rounds in the pit to suit the bot you're fighting.</p>`;}},
  {id:"extras",t:"Extras",sum:()=>draft().extras.length?draft().extras.map(e=>bName("extras",e).toLowerCase()).join(", "):"none",
    body:()=>{const base=bEval(),M=SIM.classMult(bCls()),f=bBot().cfg;
      return`<div class="opts">`+SIM.PARTS.extras.map(p=>{const on=draft().extras.indexOf(p.id)>=0,c=bTry(x=>{x.extras=on?x.extras.filter(e=>e!==p.id):x.extras.concat([p.id]);}),r=bEv(c);
        return`<button type="button" class="opt${on?" on":""}${!on&&r.totalG>r.limitG?" over":""}" data-extra="${p.id}" aria-pressed="${on}"><span>${esc(p.name)}${f&&f.extras.indexOf(p.id)>=0?'<span class="tag">fitted</span>':""}${bLock("extras",p.id)}</span><span class="pr">${fmt$(p.cost*M.cost)}</span><small class="d">${on?"<i>fitted to the draft · tap to take off</i>":bDelta(r,base,"extras")}</small></button>`;}).join("")+`</div>`;}},
  /* 0.1.33: the tuning dials (sim/parts.js TUNE), free to turn like moving parts */
  {id:"tune",t:"Tuning",sum:()=>{const t=draft().tune||{},on=SIM.TUNE_IDS.filter(k=>t[k]&&SIM.tuneOn(k,draft().weapon));return on.length?on.map(k=>SIM.TUNE[k].name+" "+bTuneLbl(k,t[k]).toLowerCase()).join(" · "):"all stock";},
    body:()=>bTune()},
  {id:"layout",t:"Layout & side profile",sum:()=>{const r=bEval();return`COM ${Math.round(r.com.x*1000)}, ${Math.round(r.com.y*1000)} mm`;},
    body:()=>bLayout()+bProfile()},
  {id:"stress",t:"Stress report",sum:()=>{const s=bStress(),n=k=>s.filter(x=>x.sev===k).length,b=n("bad"),w=n("warn");return b?`${b} bad${w?`, ${w} weak`:""}`:w?`${w} weak`:"nothing serious";},
    body:()=>{const s=bStress();return`<ul class="stress">${s.length?s.map(x=>{const v=SEV_LBL[x.sev]||SEV_LBL.info;return`<li><span class="sev ${v[0]}">${v[1]}</span><span>${esc(x.text)}${x.measured?' <span class="bntag">Bench</span>':x.paper?` <span class="bntag">${esc(x.paper)}</span>`:""}</span></li>`;}).join(""):"<li>Nothing to report.</li>"}</ul>${tmHas("engineer")?`<p class="hint">${esc(tmFirst(tmHas("engineer").name))} has worked out the impact and drop lines on paper.</p>`:""}`;}},
  {id:"designs",t:"Designs",sum:()=>{const n=bDesigns().length;return n?`${n} saved`:"none saved";},body:()=>bDesignsBody()}
];
/* your own disc profile (sim/parts.js DISC_PROFILES): a spinner with a disc or a drum; rim and a name (0.1.48: the teeth are a Tuning dial) */
function bDisc(){const d=draft(),w=SIM.part("weapon",d.weapon);if(!w||w.type!=="spinner"||w.bodyR)return"";const lock=crDiscLock(),dp=d.disc,base=bEval();
  const tryD=x=>{const c=bTry(q=>{q.disc=x;});return bEv(c);};
  const opt=(lbl,x,on,key)=>{const r=on?base:tryD(x);return`<button type="button" class="opt${on?" on":""}${!on&&r.totalG>r.limitG?" over":""}" data-disc="${key}" aria-pressed="${on}"><span>${lbl}</span><small class="d">${on?"<i>chosen</i>":bDelta(r,base,"weapon")}</small></button>`;};
  const cur=dp||{name:"",rim:"mid"};
  return`<h4>Disc profile${lock?` <span class="tag lock">${esc(lock)}</span>`:""}</h4>
    <div class="opts">${opt("Stock disc",null,!dp,"stock")}${opt(dp?`Your disc: ${esc(dp.name)}`:"Your own disc",dp||{name:"Own disc",rim:"mid"},!!dp,"own")}</div>
    ${dp?`<div class="opts">${Object.keys(SIM.DISC_PROFILES.rim).map(k=>opt(ftCap(SIM.DISC_PROFILES.rim[k].name),Object.assign({},cur,{rim:k}),cur.rim===k,"r"+k)).join("")}</div>
      <div class="dname"><input id="discName" maxlength="${SIM.DISC_PROFILES.nameMax}" value="${esc(dp.name)}" aria-label="Disc name" autocomplete="off"><button type="button" class="btn sm" data-act="disc-name">Name it</button></div>`:""}
    <p>A heavier rim stores more energy and spins up slower. The number of teeth is a dial, under Tuning.${lock?" You can design one here; fitting it needs the R&amp;D and a fabricator.":""} A new profile is a new disc: fitting it pays for the material again.</p>`;}
/* the tuning dials: a row of steps each, with what the chosen step changes against stock. Free, no Fit needed when only
   the dials (or the layout) differ from the fitted bot */
const bTuneLbl=(k,v)=>SIM.TUNE[k].labels[v-SIM.TUNE[k].min];
function bTune(){const d=draft(),t=d.tune||{},base=bEval();
  return SIM.TUNE_IDS.map(k=>{const T=SIM.TUNE[k],cur=t[k]||0,steps=[];for(let v=T.min;v<=T.max;v++)steps.push(v);
    if(!SIM.tuneOn(k,d.weapon))return`<h4>${esc(T.name)}</h4><p>${esc(T.line)}</p><p class="hint">For a disc or a drum: fit a horizontal or vertical spinner, a drum, an eggbeater, a drisk or an undercutter.</p>`;   /* 0.1.48: a dial that does nothing on this bot says what it needs */
    const stock=cur?bEv(bTry(c=>{c.tune[k]=0;})):base;
    return`<h4>${esc(T.name)}</h4><p>${esc(T.line)}</p><div class="seg tune" role="group" aria-label="${esc(T.name)}">${steps.map(v=>{const on=v===cur,r=on?base:bEv(bTry(c=>{c.tune[k]=v;}));
      return`<button type="button" data-tune="${k}" data-v="${v}" class="${on?"on":""}${!on&&r.totalG>r.limitG?" over":""}" aria-pressed="${on}">${esc(T.labels[v-T.min])}</button>`;}).join("")}</div>
      <p class="d tuned">${cur?bDelta(base,stock,k)+" <span>against stock</span>":"<i>stock</i>"}</p>`;}).join("")
    +`<p class="hint">Free to turn, and the fitted bot takes them at once: no Fit needed.</p>`;}
/* the fitted bot's part in a slot (for the "fitted" tag) */
function bFit(slot,face){const f=bBot().cfg;if(!f)return null;const n=SIM.normCfg(f);return face?n.armour[face]:n[slot];}

/* ---- armour: a top-down sketch, faces drawn by strength; tap one to pick it ---- */
function bArmourMap(){const r=bEval(),A=r.armourMapJ,sel=B.face;
  const w=f=>A[f].id==="none"?1:2+Math.min(8,A[f].prot*10),col=f=>A[f].id==="none"?"var(--crit)":A[f].prot>0.6?"var(--good)":A[f].prot>0.35?"var(--warn)":"var(--crit)";
  const ln=(f,x1,y1,x2,y2)=>`<g class="fc" data-face="${f}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="22"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col(f)}" stroke-width="${w(f)}" stroke-linecap="round"${A[f].id==="none"?' stroke-dasharray="4 4"':""}/>${f===sel?`<line class="sel" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="1.5" transform="${f==="front"?"translate(0,-8)":f==="back"?"translate(0,8)":f==="left"?"translate(-8,0)":"translate(8,0)"}"/>`:""}</g>`;
  return`<svg class="armap" viewBox="0 0 120 150" role="img" aria-label="Armour on each face">
    <g class="fc" data-face="top"><rect x="22" y="22" width="76" height="106" rx="4" fill="${A.top.id==="none"?"transparent":"var(--card2)"}" stroke="${sel==="top"?"var(--clay)":"var(--rule)"}" stroke-width="${sel==="top"?2:1}"/></g>
    <text x="60" y="80" text-anchor="middle" font-size="10" fill="var(--dim)">top</text>
    ${ln("front",22,18,98,18)}${ln("back",22,132,98,132)}${ln("left",18,22,18,128)}${ln("right",102,22,102,128)}
    <text x="60" y="10" text-anchor="middle" font-size="9" fill="var(--dim)">FRONT</text></svg>`;}

/* ---- the plan view (UI round two, release E, 0.1.62; docs/SCRAPLINE-UI-PLAN.md section 8) ----
   A Plan / 3D switch in the corner of the view, on the Build tab only (not on the home screen or in a fight). Plan is an
   SVG laid over the 3D canvas, dark in both themes like the rest of #view: the chassis cell by cell, each part as a
   labelled block (SIM.footprints and the build's layout.place, the same maths as bLayout below), each side's armour as an
   edge stroke coloured and weighted as in bArmourMap, the centre of mass, and FRONT at the top. Tapping a part or a
   side opens its section on the Parts page; a tap that misses by under 22 px still counts, so a small part is a 44 px
   target. Moving parts stays in the Layout section. While Plan shows, the 3D render is paused on every tier
   (SCRAP_VIS.setRun({paused})) and the auto-adjust watch starts over, so the switch never lowers the graphics.
   The choice is settings.buildView ("3d" unless "plan"). PLAN_SEC: a footprint's slot to its Build section. */
const PLAN_SEC={weapon:"weapon",drive:"drive",battery:"power",electronics:"power",back:"attach",extras:"extras"},PLAN_W=80;   // the drawing is PLAN_W units wide in every class, so labels are the same size
const bPlanOn=()=>ST().buildView==="plan";
function bViewSync(){const v=$("bView"),p=$("bPlan");if(!v||!p)return;
  const can=curTab==="build"&&!document.documentElement.classList.contains("home")&&!$("app").classList.contains("fighting"),on=can&&bPlanOn();
  v.hidden=!can;p.hidden=!on;document.documentElement.classList.toggle("bplan",on);
  v.querySelectorAll("button").forEach(b=>{const o=(b.dataset.bview==="plan")===bPlanOn();b.classList.toggle("on",o);b.setAttribute("aria-pressed",o);});
  if(window.SCRAP_VIS)SCRAP_VIS.setRun({paused:on});
  if(on!==bViewSync.was){bViewSync.was=on;if(typeof perfReset==="function")perfReset(true);}
  if(on)p.innerHTML=bPlanSvg();}
/* the parts and sides of the plan, in its own units (PLAN_U a cell): what bPlanSvg draws and bPlanHit measures */
function bPlanItems(){const r=bEval(),c=SIM.CLASSES[bCls()],fps=SIM.footprints(draft()),PLAN_U=PLAN_W/c.gridW,W=c.gridW*PLAN_U,H=c.gridH*PLAN_U,pl=r.layout.place,out=[];
  for(const f of fps){const p=pl[f.key];if(!p)continue;const kind=f.slot==="extras"?f.id:f.slot;
    out.push({kind:"part",key:f.key,slot:f.slot,label:L_LBL[kind]||kind,sec:PLAN_SEC[f.slot]||"layout",x:p[0]*PLAN_U,y:p[1]*PLAN_U,w:f.w*PLAN_U,h:f.h*PLAN_U});}
  const E=9;for(const [f,x1,y1,x2,y2] of [["front",0,-E,W,-E],["back",0,H+E,W,H+E],["left",-E,0,-E,H],["right",W+E,0,W+E,H]])out.push({kind:"face",face:f,sec:"armour",x1,y1,x2,y2});
  return{r,W,H,U:PLAN_U,items:out};}
function bPlanSvg(){const {r,W,H,U,items}=bPlanItems(),c=SIM.CLASSES[bCls()],A=r.armourMapJ;
  const sw=f=>A[f].id==="none"?1.5:2+Math.min(7,A[f].prot*9),col=f=>A[f].id==="none"?"var(--crit)":A[f].prot>0.6?"var(--good)":A[f].prot>0.35?"var(--warn)":"var(--crit)";
  let cells="";for(let y=0;y<c.gridH;y++)for(let x=0;x<c.gridW;x++)if(r.cells[y][x]!=null)cells+=`<rect x="${x*U}" y="${y*U}" width="${U}" height="${U}"/>`;
  const faces=items.filter(i=>i.kind==="face").map(i=>`<g class="pf" tabindex="0" role="button" data-pface="${i.face}" aria-label="${FACE_LBL[i.face]} armour: ${esc(A[i.face].name)}. Open Armour"><line x1="${i.x1}" y1="${i.y1}" x2="${i.x2}" y2="${i.y2}" stroke="${col(i.face)}" stroke-width="${sw(i.face).toFixed(1)}" stroke-linecap="round"${A[i.face].id==="none"?' stroke-dasharray="4 4"':""}/></g>`).join("");
  const parts=items.filter(i=>i.kind==="part").map(i=>{const fs=Math.min(8,Math.max(5,(i.w-3)/(i.label.length*0.56)));
    return`<g class="pp ${i.slot}" tabindex="0" role="button" data-ppart="${i.key}" aria-label="${esc(i.label)}. Open its section"><rect x="${i.x+1.5}" y="${i.y+1.5}" width="${i.w-3}" height="${i.h-3}" rx="3"/><text x="${i.x+i.w/2}" y="${i.y+i.h/2}" font-size="${fs.toFixed(1)}">${esc(i.label)}</text></g>`;}).join("");
  const cx=W*(0.5+r.com.x/r.widthM),cy=H*(0.5-r.com.y/r.lengthM);
  return`<svg viewBox="-16 -26 ${W+32} ${H+42}" role="group" aria-label="Plan of the bot from above: tap a part or a side to open its section">
    <text class="pfront" x="${W/2}" y="-19">FRONT</text><g class="pcell">${cells}</g>${faces}${parts}
    <g class="pcom" aria-hidden="true"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5"/><circle class="d" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2"/></g></svg>
    <p class="pkey"><i aria-hidden="true"></i>centre of mass</p>`;}
/* what a tap at (clientX, clientY) is on: a part it is inside, else the nearest part or side within 22 px */
function bPlanHit(px,py){const svg=document.querySelector("#bPlan svg");if(!svg||!svg.getScreenCTM)return null;const m=svg.getScreenCTM();if(!m)return null;
  const pt=svg.createSVGPoint();pt.x=px;pt.y=py;const q=pt.matrixTransform(m.inverse()),lim=22/Math.max(0.01,m.a);let best=null,bd=lim;
  for(const i of bPlanItems().items){let d;
    if(i.kind==="part"){const dx=Math.max(i.x-q.x,0,q.x-i.x-i.w),dy=Math.max(i.y-q.y,0,q.y-i.y-i.h);d=Math.hypot(dx,dy);if(d===0)return i;}
    else{const tx=Math.max(Math.min(q.x,Math.max(i.x1,i.x2)),Math.min(i.x1,i.x2)),ty=Math.max(Math.min(q.y,Math.max(i.y1,i.y2)),Math.min(i.y1,i.y2));d=Math.hypot(q.x-tx,q.y-ty);}
    if(d<bd){bd=d;best=i;}}
  return best;}
function bPlanGo(i){if(!i)return;if(i.kind==="face")B.face=i.face;bOpenSec(i.sec);}
function bPlanBind(){const v=$("bView"),p=$("bPlan");if(!v||!p)return;
  v.addEventListener("click",e=>{const b=e.target.closest("[data-bview]");if(!b)return;const w=b.dataset.bview==="plan"?"plan":"3d";if(ST().buildView===w)return;ST().buildView=w;save();bViewSync();});
  p.addEventListener("click",e=>{bPlanGo(bPlanHit(e.clientX,e.clientY));});
  p.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const g=e.target.closest("[data-ppart],[data-pface]");if(!g)return;e.preventDefault();
    const it=bPlanItems().items.find(i=>g.dataset.ppart?i.key===g.dataset.ppart:i.face===g.dataset.pface);bPlanGo(it);});}
bPlanBind();

/* ---- layout editor ---- */
const L_LBL={drive:"Drive",battery:"Battery",electronics:"ESC",weapon:"Weapon",selfright:"Righter",minibot:"Minibot"};
function bLayout(){const r=bEval(),c=SIM.CLASSES[bCls()],cfg=draft(),fps=SIM.footprints(cfg),W=c.gridW,H=c.gridH,pl=r.layout.place;
  let cells="";for(let y=0;y<H;y++)for(let x=0;x<W;x++){const e=r.cells[y][x];
    cells+=e==null?`<div class="cell off"></div>`:`<div class="cell" style="background:rgba(226,169,59,${Math.min(0.75,0.06+e*0.55).toFixed(2)})"></div>`;}
  let parts="";for(const f of fps){const p=pl[f.key];if(!p)continue;const kind=f.slot==="extras"?f.id:f.slot;
    parts+=`<button type="button" class="lpart ${f.slot}${B.sel===f.key?" sel":""}" data-part="${f.key}" style="left:${100*p[0]/W}%;top:${100*p[1]/H}%;width:${100*f.w/W}%;height:${100*f.h/H}%">${L_LBL[kind]||kind}</button>`;}
  const cx=50+100*r.com.x/r.widthM,cy=50-100*r.com.y/r.lengthM;
  const hint=B.sel?`Now tap where the ${(L_LBL[B.sel.replace(/\d$/,"")]||B.sel).toLowerCase()} goes.`:"Tap a part, then tap where it goes (or drag it).";
  return`<div class="lwrap"><div class="lfront">▲ Front</div>
    <div class="lgrid" id="lGrid" style="grid-template-columns:repeat(${W},1fr)">${cells}${parts}<span class="lcom" style="left:${cx}%;top:${cy}%"></span></div>
    <div class="lkey"><span><i style="background:rgba(226,169,59,.65)"></i>exposed</span><span><i style="background:rgba(226,169,59,.1)"></i>sheltered</span><span><i style="border-radius:50%;background:var(--lilac)"></i>centre of mass</span></div>
    <p class="hint" id="lHint">${hint}</p>
    <div class="row" style="width:100%"><button type="button" class="btn sm" data-act="layout-reset">Put everything back</button></div></div>`;}
/* place the selected part so the tapped cell sits at its middle; pods snap to their side, front weapons to the front row */
function bPlace(key,cx,cy){const cfg=draft(),c=SIM.CLASSES[cfg.cls],f=SIM.footprints(cfg).find(x=>x.key===key),r=bEval();if(!f)return;
  let x=cx-Math.floor((f.w-1)/2),y=cy-Math.floor((f.h-1)/2);
  if(f.mount==="left")x=0;if(f.mount==="right")x=c.gridW-f.w;if(f.mount==="front")y=0;
  x=Math.max(0,Math.min(c.gridW-f.w,x));y=Math.max(0,Math.min(c.gridH-f.h,y));
  const taken=new Set();for(const g of SIM.footprints(cfg)){if(g.key===key)continue;const p=r.layout.place[g.key];if(!p)continue;for(let i=0;i<g.w;i++)for(let j=0;j<g.h;j++)taken.add((p[0]+i)+","+(p[1]+j));}
  if(!SIM.placeOk(cfg,f,x,y,taken)){const shape=SIM.placeOk(cfg,f,x,y,null);
    toast(shape?"Something's already there":f.mount==="edge"&&!(y===0||x===0||y+f.h===c.gridH||x+f.w===c.gridW)?"A horizontal spinner has to sit on an edge":"It doesn't fit there");buzz(20);return;}
  const place=Object.assign({},r.layout.place,{[key]:[x,y]});B.sel=null;
  bSet(d=>{d.layout=place;});buzz(8);}
function bCellAt(ev){const g=$("lGrid");if(!g)return null;const rc=g.getBoundingClientRect(),c=SIM.CLASSES[bCls()];
  const x=Math.floor((ev.clientX-rc.left)/rc.width*c.gridW),y=Math.floor((ev.clientY-rc.top)/rc.height*c.gridH);
  return x<0||y<0||x>=c.gridW||y>=c.gridH?null:[x,y];}

/* ---- side profile: the bot from the side, to scale, front to the right ---- */
function bProfile(){const r=bEval(),h=r.height,cfg=draft(),wp=SIM.part("weapon",cfg.weapon),M=SIM.classMult(cfg.cls);
  const L=r.lengthM*1000,H=h.heightMm,rad=r.wheelRadiusMm||SIM.part("wheels",cfg.wheels).radiusMm*M.len;
  const axleY=rad,bodyY=h.drivesInverted?rad-H/2:h.clearanceMm;   // centred axles, or low axles under a box that sits on its clearance
  let wpn="",reach=0,top=bodyY+H;
  if(wp.type==="wedge"||wp.type==="lifter"||wp.type==="flipper"){reach=(wp.reachMm||40)*M.len;wpn=`<path class="wp" d="M${L},${bodyY+H*0.6} L${L+reach},${h.frontEdgeMm} L${L},${bodyY}"/>`;}
  else if(r.weapon.radiusM&&cfg.weapon!=="hsp"){const R=r.weapon.radiusM*1000,cy=Math.max(R+h.frontEdgeMm+1,bodyY+H/2);reach=R*1.05;top=Math.max(top,cy+R);
    wpn=`<circle class="wp" cx="${L}" cy="${cy}" r="${R}"/><path class="wp" d="M${L-R*0.2},${bodyY+H*0.3} L${L+R*0.9},${h.frontEdgeMm}"/>`;}
  else if(cfg.weapon==="hsp"){const R=r.weapon.radiusM*1000;reach=R*0.5;wpn=`<line class="wp" x1="${L/2-R}" y1="${bodyY+H+3}" x2="${L/2+R+reach}" y2="${bodyY+H+3}" stroke-width="4"/>`;top+=6;}
  else if(wp.type==="spear"){reach=r.weapon.reachM*1000+H*0.25;const y=bodyY+H*0.5;   // 0.1.64: the rod out of the front at half height, and its point
    wpn=`<line class="wp" x1="${L}" y1="${y}" x2="${L+reach-H*0.2}" y2="${y}" stroke-width="3"/><path class="wp" d="M${L+reach-H*0.2},${y+H*0.1} L${L+reach},${y} L${L+reach-H*0.2},${y-H*0.1}"/>`;}
  else if(wp.edgeMm!=null){wpn=`<path class="wp" d="M${L},${bodyY+H*0.5} L${L+H*0.3},${h.frontEdgeMm} L${L},${bodyY}"/>`;reach=H*0.3;}
  const pad=Math.max(8,L*0.04),vw=L+reach+pad*2,vh=top+pad*2,Y=y=>vh-pad-y;   // y up from the ground
  const flip=s=>s.replace(/(cy|y1|y2)="([\d.\-]+)"/g,(m,a,v)=>`${a}="${Y(+v)}"`).replace(/([ML])([\d.\-]+),([\d.\-]+)/g,(m,c,x,y)=>`${c}${+x+pad},${Y(+y)}`).replace(/(cx|x1|x2)="([\d.\-]+)"/g,(m,a,v)=>`${a}="${+v+pad}"`);
  const wheels=(r.parts.filter(p=>p.slot==="wheels"&&p.pos&&p.pos[0]<0).map(p=>L/2+p.pos[1]*1000)).map(x=>`<circle class="wh" cx="${x+pad}" cy="${Y(axleY)}" r="${rad}"/>`).join("");
  return`<svg class="profile" viewBox="0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}" role="img" aria-label="Side profile: clearance ${h.clearanceMm.toFixed(1)} mm, front edge ${h.frontEdgeMm.toFixed(1)} mm">
    <line class="gnd" x1="0" y1="${Y(0)}" x2="${vw}" y2="${Y(0)}"/>
    <rect class="body" x="${pad}" y="${Y(bodyY+H)}" width="${L}" height="${H}" rx="2"/>${wheels}${flip(wpn)}
    <line class="mk" x1="${pad+L+reach+pad*0.5}" y1="${Y(0)}" x2="${pad+L+reach+pad*0.5}" y2="${Y(h.frontEdgeMm)}"/></svg>
    <p class="plist">Clearance <b>${h.clearanceMm.toFixed(1)} mm</b> · front edge <b>${h.frontEdgeMm.toFixed(1)} mm</b> · height <b>${Math.round(H)} mm</b><br>${h.drivesInverted?"Drives either way up":h.selfRight?"Self-rights when flipped":'<span class="broke">Stuck if flipped</span>'} · ${SIM.WEDGE_GAUGES[cfg.cls].filter(g=>g<h.frontEdgeMm).length} of ${SIM.WEDGE_GAUGES[cfg.cls].length} common wedges get under it</p>`;}

/* ---- designs: blueprints for this class, and the sim's archetypes as starting points ---- */
const D_MAX=12;
function bDesigns(){const c=bCls();if(!Array.isArray(S.designs[c]))S.designs[c]=[];return S.designs[c];}
function bDesignsBody(){const L=bDesigns(),cls=bCls();
  const item=(nm,cfg,key,del)=>{const r=bEv(Object.assign({},cfg,{cls})),v=VERDICT[r.verdict]||VERDICT.flaws,bill=SIM.fitBill(bBot().cfg,Object.assign({},cfg,{cls}));
    return`<li><span class="nm">${esc(nm)}<small>${fmtG(r.totalG)} · <span class="${v[0]}">${v[1].toLowerCase()}</span> · to fit ${bill.lines.length?fmt$(bill.cost):"nothing"}</small></span><button type="button" class="btn sm" data-load="${key}">Load</button>${del?`<button type="button" class="btn sm ghost" data-del="${key}">${B.delKey===key?"Sure?":"Delete"}</button>`:""}</li>`;};
  return`<ul class="dlist">${L.length?L.map((d,i)=>item(d.name,d.cfg,"d"+i,true)).join(""):"<li><span class=\"nm\">No designs for this class yet.</span></li>"}</ul>
    <div class="dname"><input id="dName" maxlength="32" placeholder="Name this draft" aria-label="Design name" autocomplete="off"><button type="button" class="btn sm pri" data-act="design-save">Save</button></div>
    <h4>Starting points</h4><ul class="dlist">${SIM.TEST_BUILDS.map(t=>item(t.name,t.cfg,"t:"+t.id,false)).join("")}</ul>
    <p>Load puts a design in the draft; nothing is bought until you fit it.</p>`;}

/* ---- the pinned bar, the Fit bar, the rows ---- */
function bRender(){visBot();bViewSync();if(B.sel&&!SIM.footprints(draft()).some(f=>f.key===B.sel))B.sel=null;
  const r=bEval(),c=SIM.CLASSES[bCls()],pct=100*r.totalG/r.limitG,bar=$("bwBar"),v=VERDICT[r.verdict]||VERDICT.flaws,w=r.weapon;
  $("bwCls").textContent=c.name;
  $("bwNum").innerHTML=r.totalG>r.limitG?`<span class="broke">${fmtG(r.totalG-r.limitG)} over</span>`:`${fmtG(r.limitG-r.totalG)} left`;
  bar.classList.toggle("near",pct>=97&&pct<=100);bar.classList.toggle("over",pct>100);
  /* the mass budget in bands (0.1.58): one band a group, widths in grams of the limit (squeezed to fit when over) */
  const G=shGroups(r),sc=100/Math.max(r.limitG,r.totalG);
  $("bwMeter").innerHTML=G.map(g=>`<i data-band="${g.sec}" style="width:${(g.g*sc).toFixed(2)}%"></i>`).join("");
  $("bBands").innerHTML=G.map(g=>`<button type="button" data-band="${g.sec}"><small>${g.label}</small><b class="mono">${Math.round(g.g).toLocaleString("en-GB")}</b></button>`).join("");
  /* Sheet or Parts (0.1.58): Parts until a bot is fitted in the class, Sheet after; picked again when the class changes */
  if(B.pageCls!==bCls()){B.pageCls=bCls();B.page=bBot().cfg?"sheet":"parts";}
  if(typeof TUT_ON!=="undefined"&&TUT_ON)B.page="parts";   // the tutorial points at the parts
  const sheet=B.page==="sheet";
  document.querySelectorAll("#bPage button").forEach(x=>{const on=x.dataset.bpage===B.page;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});
  $("bVerdict").innerHTML=`<span class="chip ${v[0]}">${v[1]}</span>`;
  $("bCap").hidden=sheet;$("bRows").hidden=sheet;$("bSheet").hidden=!sheet;
  $("bSheet").innerHTML=sheet?sheetHtml(bCls(),draft()):"";
  bNextBout();
  const m=$("bwMeter");m.setAttribute("aria-valuemax",r.limitG);m.setAttribute("aria-valuenow",Math.round(r.totalG));m.setAttribute("aria-valuetext",`${fmtG(r.totalG)} of ${fmtG(r.limitG)}`);
  const run=r.runtimeS==null||!isFinite(r.runtimeS)?"no limit":`${Math.floor(r.runtimeS/60)}:${String(Math.round(r.runtimeS%60)).padStart(2,"0")}`,cell=(l,v)=>`<span class="bst"><small>${l}</small><b>${v}</b></span>`;
  $("bCap").innerHTML=cell("Top speed",`${r.driveSpeed.toFixed(1)}<i> m/s</i>`)+(w.energyJ>=1?cell("Hit energy",`<span class="readout">${Math.round(w.energyJ).toLocaleString("en-GB")}</span><i> J</i>`):cell("Weapon",w.type==="none"?"none":esc(w.type)))
    +cell("Weak side",FACE_LBL[bWeak(r)])+cell("Battery",run);
  $("bRows").innerHTML=sheet?"":B_SECS.map(s=>{const o=!!B.open[s.id];return`<div class="acc${o?" open":""}" data-sec="${s.id}"><button type="button" class="acch" aria-expanded="${o}"><span class="t">${s.t}</span><span class="sum">${esc(s.sum())}</span><span class="chev"></span></button><div class="accb">${o?s.body():""}</div></div>`;}).join("");
  bFitBar(r);
  if(!$("bxRaw").hidden&&$("bxRaw").open)$("simOut").textContent=JSON.stringify(r,(k,v)=>typeof v==="number"?Math.round(v*1000)/1000:v,1);}
/* the Next bout banner (0.1.58), career only: today's next fight when an event day is on, else the next event you can
   enter. It names an opponent only when the draw is known (a fight today). Tapping it goes to Career › This week. */
function bNextBout(){const el=$("bNext");if(!el)return;let t="";
  if(crOn()&&!S.career.over){const c=S.career;
    if(c.day){const nx=crNext(c.day);if(nx){const vs=nx.idx.filter(i=>i!==0).map(i=>c.day.field[i]).filter(Boolean).map(e=>lvOppName(e.id,e.name));
      t=`<b>Next bout</b> ${esc(nx.label)}${vs.length?" vs "+esc(crAnd(vs)):""}`;}}
    else{const e=crCalendar().find(e=>e.week>=c.week&&e.week<=TIME.weeks&&!c.events[crKey(e)]&&!crClassLock(e.cls)&&S.bots[e.cls]&&S.bots[e.cls].cfg);
      if(e)t=`<b>Next bout</b> ${esc(e.name)} · ${e.week===c.week?"this week":"week "+e.week}`;}}
  el.hidden=!t;el.innerHTML=t?`<span>${t}</span><span class="chev" aria-hidden="true"></span>`:"";}
/* open one section on the Parts page (a mass band, and the post-mortem's Fix it) */
function bOpenSec(id){B.page="parts";B.pageCls=bCls();B.open={[id]:true};bRender();bToHead(id);}
function bFitBar(r){const b=bBot(),fb=$("fitBar");
  if(b.cfg&&SIM.sameParts(b.cfg,b.draft)){fb.hidden=true;return;}
  const bill=SIM.fitBill(b.cfg,b.draft),ok=r.valid,n=bill.lines.length,off=bill.removed.length;
  const what=[n?`${n} new part${n===1?"":"s"}`:"",off?`${off} taken off`:""].filter(Boolean).join(", ")||"Parts changed";
  fb.hidden=false;
  const blk=ok?crFitBlock(b.draft):null;
  fb.innerHTML=`<span class="ft"><b>${b.cfg?what:"Nothing fitted yet"}</b>${!ok?(r.totalG>r.limitG?(crOn()&&bCls()===LEGACY.cls&&crLegend()?`Over the champion's limit: ${fmtG(r.limitG)} at legend level ${crLegend()}, not ${fmtG(SIM.CLASSES[bCls()].limitG)}`:"Over the limit"):"Can't be fitted: "+esc(r.errors[0]||"")):blk?`<span class="worn">${esc(blk)}</span>`:`${fmt$(bill.cost)} · ${b.cfg||!crOn()?crFitHours(bill)+" h in the workshop":"first build, no hours"}`}</span>${b.cfg?'<button type="button" class="btn sm ghost" data-act="undo">Undo</button>':""}<button type="button" class="btn sm pri" data-act="fit"${ok&&!blk?"":" disabled"}>Fit</button>`;}

/* ---- fit: show the bill, then charge it (once the career exists) ---- */
function bFitOpen(){const b=bBot(),r=bEval();if(!r.valid)return;const blk=crFitBlock(b.draft);if(blk){toast(blk);return;}
  const bill=SIM.fitBill(b.cfg,b.draft),c=crOn()?S.career:null,free=!c,h=c?crFitH(b,bill):crFitHours(bill),first=c&&!b.cfg;
  const face=l=>l.face?` (${FACE_LBL[l.face].toLowerCase()})`:"";
  openSheet("Fit these parts",`<ul class="bill">${bill.lines.map(l=>`<li><span>${esc(l.name)}${face(l)}</span><span>${fmt$(l.cost)}</span></li>`).join("")}${bill.removed.map(l=>`<li><span>${esc(l.name)}${face(l)} taken off</span><span>—</span></li>`).join("")}
    <li class="tot"><span>Total · ${first?"first build, no hours":h+" h"}</span><span>${fmt$(bill.cost)}</span></li></ul>
    <p class="hint">${free?"No charge: money starts with the career (Career tab).":`Paid in full; parts taken off are gone. You have ${fmt$(c.money||0)} and ${crR1(c.hours)} h this week.${first?" A first build takes none of them: only later changes cost hours.":""}`}</p>
    ${c?crFitHoursHint(h):""}
    <div class="row"><button type="button" class="btn pri" data-act="fit-ok"${c&&crFitShort(h)>0?" disabled":""}>${free?"Fit":"Fit · "+fmt$(bill.cost)}</button></div>`);}
function bFitDo(){const b=bBot(),bill=SIM.fitBill(b.cfg,b.draft),c=crOn()?S.career:null,h=crFitH(b,bill),blk=crFitBlock(b.draft);if(blk){toast(blk);return;}
  if(c){if((c.money||0)<bill.cost){toast(`Need ${fmt$(bill.cost-(c.money||0))} more`);return;}const sh=crFitShort(h);if(sh>0){toast(`That takes ${h} h in the workshop: ${sh} h more than you can find before next week ends`);return;}
    crPay(bill.cost,`Fitted: ${SIM.CLASSES[bCls()].name.toLowerCase()}, ${bill.lines.length} part${bill.lines.length===1?"":"s"}`);c.hours=crR1(c.hours-h);}
  bClearDamage(b,bill);b.cfg=clone(b.draft);bNormed.add(b.cfg);save();hud();closeSheet();bRender();toast(c?`Fitted · ${fmt$(bill.cost)}`:"Fitted");buzz([10,30,10]);shopSfx("ratchet");if((curTab==="bench"||curTab==="fight")&&TAB_RENDER[curTab])TAB_RENDER[curTab]();}

/* new parts come undamaged, and parts taken off take their damage with them; everything else keeps its damage. Damage keys
   are part keys (sim/build.js parts: drive0, wheel1, battery, weapon, selfright ...) or armour_<face> for a plate. */
function bClearDamage(b,bill){const d=b.damage,hit=k=>{for(const x in d)if(k(x))delete d[x];};
  for(const l of bill.lines.concat(bill.removed)){const s=l.slot;
    if(s==="armour")hit(x=>x==="armour_"+l.face);
    else if(s==="drive")hit(x=>/^drive\d$/.test(x));
    else if(s==="wheels")hit(x=>/^wheel\d$/.test(x));
    else if(s==="weapon"||s==="weaponMaterial")hit(x=>x==="weapon");
    else if(s==="extras")hit(x=>x===l.id);
    else hit(x=>x===s);}}

/* One section open at a time: after opening one, bring its header up under the weight bar so the closed ones above it do not push it off screen. */
function bToHead(id){const r=document.querySelector(`#bRows [data-sec="${id}"]`),P=$("panel"),bar=$("bwBar");if(!r||!P)return;const d=r.getBoundingClientRect().top-(bar?bar.getBoundingClientRect().bottom:P.getBoundingClientRect().top)-8;if(d)P.scrollTo({top:P.scrollTop+d,behavior:"auto"});}
/* ---- events (one set, on the tab) ---- */
function bClick(e){const t=e.target;let x;
  if((x=t.closest("[data-bpage]"))){if(B.page!==x.dataset.bpage){B.page=x.dataset.bpage;bRender();pageIn($(B.page==="sheet"?"bSheet":"bRows"));}return;}
  if((x=t.closest("[data-band]"))){bOpenSec(x.dataset.band);return;}
  if(t.closest("#bNext")){goTo("career/week");return;}
  if((x=t.closest("[data-shtest]"))){const id=x.dataset.shtest;BN.pick=[id];showTab("bench");const c=document.querySelector(`#bnBody [data-test="${id}"]`);if(c)c.scrollIntoView({block:"start",behavior:"auto"});return;}
  if(t.closest('[data-act="team"]')){lvOpen();return;}
  if((x=t.closest(".acch"))){const id=x.parentNode.dataset.sec,was=!!B.open[id];B.open=was?{}:{[id]:true};bRender();if(!was){bToHead(id);const nb=document.querySelector(`#bRows [data-sec="${id}"] .accb`);if(nb&&!reduced())nb.classList.add("pgin");}return;}
  if((x=t.closest("[data-cls]"))){ST().buildCls=x.dataset.cls;B.sel=null;B.delKey=null;save();bRender();return;}
  if((x=t.closest("[data-face]"))){B.face=x.dataset.face;bRender();return;}
  if((x=t.closest(".opt[data-slot]"))){const s=x.dataset.slot,id=x.dataset.id;
    bSet(c=>{if(s==="armour")c.armour[B.face]=id;else c[s]=id;});return;}
  if((x=t.closest(".opt[data-disc]"))){const k=x.dataset.disc,d=draft().disc,cur=d||{name:"Own disc",rim:"mid"};
    bSet(c=>{if(k==="stock")delete c.disc;else if(k==="own")c.disc=cur;else c.disc=Object.assign({},cur,{rim:k.slice(1)});});return;}
  if((x=t.closest("[data-tune]"))){const k=x.dataset.tune,v=+x.dataset.v;if((draft().tune||{})[k]===v)return;
    if(bSet(c=>{c.tune=Object.assign({},c.tune,{[k]:v});}))shopSfx("dial");buzz(8);return;}
  if((x=t.closest(".opt[data-extra]"))){const id=x.dataset.extra;bSet(c=>{c.extras=c.extras.indexOf(id)>=0?c.extras.filter(e=>e!==id):c.extras.concat([id]);});return;}
  if((x=t.closest("[data-load]"))){const k=x.dataset.load,src=k[0]==="t"?SIM.TEST_BUILDS.find(t=>"t:"+t.id===k):bDesigns()[+k.slice(1)];if(!src||!src.cfg||typeof src.cfg!=="object")return;
    const cfg=Object.assign(clone(src.cfg),{cls:bCls()}),r=bEv(cfg);
    B.sel=null;bBot().draft=SIM.normCfg(cfg);bNormed.add(bBot().draft);bLayoutSync();save();bRender();
    const bill=SIM.fitBill(bBot().cfg,bBot().draft);toast(r.totalG>r.limitG?`${src.name} is over the limit in this class`:`${src.name} loaded into the draft${bill.lines.length?" · fitting it costs "+fmt$(bill.cost):""}`);return;}
  if((x=t.closest("[data-del]"))){const k=x.dataset.del;if(B.delKey!==k){B.delKey=k;bRender();clearTimeout(bClick.t);bClick.t=setTimeout(()=>{B.delKey=null;if(curTab==="build")bRender();},3000);return;}
    const L=bDesigns(),d=L.splice(+k.slice(1),1)[0];B.delKey=null;save();bRender();toast(`Deleted ${d?d.name:"the design"}`);return;}
  if((x=t.closest("[data-act]"))){const a=x.dataset.act;
    if(a==="armour-all"){const id=draft().armour[B.face];bSet(c=>{for(const f of ["front","back","left","right"])c.armour[f]=id;},`${bName("armour",id)} on all four sides`);}
    else if(a==="layout-reset"){B.sel=null;bSet(c=>{c.layout={};},"Parts back in their usual places");}
    else if(a==="undo"){const b=bBot();b.draft=clone(b.cfg);bNormed.add(b.draft);B.sel=null;save();bRender();toast("Back to the fitted bot");}
    else if(a==="fit")bFitOpen();
    else if(a==="disc-name"){const nm=($("discName").value||"").trim();if(draft().disc&&bSet(c=>{c.disc=Object.assign({},c.disc,{name:nm});},`Disc named ${SIM.normDisc(Object.assign({},draft().disc,{name:nm})).name}`)){
      const bb=bBot();if(bb.cfg&&bb.cfg.disc&&SIM.sameParts(bb.cfg,bb.draft)){bb.cfg.disc=clone(bb.draft.disc);save();}}}   // a new name is free: the fitted disc takes it
    else if(a==="design-save"){const L=bDesigns();if(L.length>=D_MAX){toast(`${D_MAX} designs per class. Delete one first.`);return;}
      const nm=($("dName").value||"").trim().slice(0,32)||`Design ${L.length+1}`;L.push({name:nm,cfg:clone(draft())});save();bRender();toast(`Saved ${nm}`);}
    return;}}
/* layout: tap or drag a part, tap a cell */
function bDown(e){const p=e.target.closest(".lpart");if(!p)return;B.drag={key:p.dataset.part,x:e.clientX,y:e.clientY,moved:false,id:e.pointerId};
  try{$("tab-build").setPointerCapture(e.pointerId);}catch(err){}}   // the release still reaches us if it lands outside the tab
function bMove(e){const d=B.drag;if(!d||e.pointerId!==d.id)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)d.moved=true;}
function bUp(e){const tg=document.elementFromPoint(e.clientX,e.clientY)||e.target,g=tg.closest&&tg.closest("#lGrid"),d=B.drag;B.drag=null;   // with the pointer captured, e.target is the tab
  if(d&&d.moved){const c=bCellAt(e);if(c)bPlace(d.key,c[0],c[1]);return;}
  if(!g)return;
  const p=tg.closest(".lpart");
  if(p){B.sel=B.sel===p.dataset.part?null:p.dataset.part;bRender();return;}   // tapping a part picks it (or another one)
  if(B.sel){const c=bCellAt(e);if(c)bPlace(B.sel,c[0],c[1]);}}

/* the bill sheet's Fit button: bound at load, since the Bench tab opens the sheet too (the Build tab may not have rendered yet) */
document.addEventListener("click",e=>{if(e.target.closest('[data-act="fit-ok"]'))bFitDo();});
/* the workshop's bot in 3D: the draft on the Build tab, the fitted bot elsewhere (the draft while nothing is fitted) */
/* the workshop stage the 3D room is dressed for (props on Full / Ultra, vis/props.js): the career's, else the rented corner */
function visStage(){if(window.SCRAP_VIS&&SCRAP_VIS.setStage)SCRAP_VIS.setStage(typeof crOn==="function"&&crOn()?crStage().id:"corner");}
function visBot(){if(!window.SCRAP_VIS)return;visStage();const bot=bBot(),b=curTab==="build"||!bot.cfg?bEval():bEv(bot.cfg);
  if(typeof lvVis==="function")lvVis();SCRAP_VIS.setBot(b);const w=SIM.part("weapon",b.cfg.weapon),tag=$("tag");
  if(tag&&ftGL())tag.textContent=`${lvBotName(bCls())} · ${b.className} · ${w?w.name.toLowerCase():""}${curTab==="build"&&bot.cfg&&!SIM.sameParts(bot.cfg,b.cfg)?" · draft":""}`;}
TAB_RENDER.build=function(){
  if(!bRender.bound){bRender.bound=true;const tb=$("tab-build");
    tb.addEventListener("click",e=>{if(e.target.closest("#lGrid"))return;bClick(e);});
    tb.addEventListener("pointerdown",bDown);tb.addEventListener("pointermove",bMove);tb.addEventListener("pointerup",bUp);
    tb.addEventListener("pointercancel",()=>{B.drag=null;});
    /* the bot's name: kept when it changes (blur, Enter); an empty one goes back to the class default */
    tb.addEventListener("change",e=>{if(e.target.id!=="bName")return;const b=bBot(),v=e.target.value.trim().slice(0,LIVERY.maxName);if(v&&v!==LIVERY.names[bCls()])b.name=v;else delete b.name;save();bRender();});
    tb.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="bName"){e.preventDefault();e.target.blur();}
      if(e.key==="Enter"&&e.target.id==="dName"){e.preventDefault();bClick({target:tb.querySelector('[data-act="design-save"]')});}
      if(e.key==="Enter"&&e.target.id==="discName"){e.preventDefault();bClick({target:tb.querySelector('[data-act="disc-name"]')});}});
    $("bxRaw").addEventListener("toggle",bRender);
    if(/[?&]sim=1(&|$)/.test(location.search)){$("bxRaw").hidden=false;$("bxRaw").open=true;}
}
  bRender();};
