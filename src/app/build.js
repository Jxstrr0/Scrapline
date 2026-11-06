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
   PR 8: a spinner's weapon row has your own disc profile (teeth, rim, a name; R&D "disc" and a fabricator in the career),
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
  if(!b.draft||!bNormed.has(b.draft)){b.draft=SIM.normCfg(Object.assign({},b.draft&&typeof b.draft==="object"?b.draft:b.cfg||SIM.DEFAULT_CFG,{cls}));bNormed.add(b.draft);}
  return b;}
const draft=()=>bBot().draft;
/* evalBuild results for this draft, kept until it changes */
let bEvalKey="",bEvalRes=null;
function bEval(){const k=JSON.stringify(draft());if(k!==bEvalKey){bEvalKey=k;bEvalRes=bEv(draft());}return bEvalRes;}
const bTry=mut=>{const c=clone(draft());mut(c);return c;};

/* change the draft. Refused (with the grams) if it would go over the limit and adds weight. */
function bSet(mut,why){const before=bEval(),c=bTry(mut),r=bEv(c);
  if(r.totalG>r.limitG&&r.totalG>before.totalG){toast(`${fmtG(r.totalG-r.limitG)} over the ${r.className} limit. Take something off first.`);buzz(30);return false;}
  bBot().draft=SIM.normCfg(c);bNormed.add(bBot().draft);bLayoutSync();save();bRender();if(why)toast(why);return true;}
/* moving parts is free: if the draft and the fitted bot have the same parts, the fitted bot takes the new layout */
function bLayoutSync(){const b=bBot();if(b.cfg&&SIM.sameParts(b.cfg,b.draft))b.cfg.layout=clone(b.draft.layout);}
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
  const order={chassis:["armour","edge","speed"],armour:["armour","speed"],drive:["speed","run","push"],wheels:["speed","edge","push"],
    battery:["run","speed"],electronics:["run","speed","heat"],weapon:["wj","edge","run"],weaponMaterial:["wj","bend"],extras:["edge","armour","speed"]}[slot]||["speed","wj"];
  for(const k of order){
    if(k==="speed")num(x=>x.driveSpeed,r,base," m/s",1,true,0.05);
    if(k==="push")num(x=>x.pushN,r,base," N",base.pushN<100?1:0,true,base.pushN*0.03);
    if(k==="wj")num(x=>x.weapon.energyJ||0,r,base," J",0,true,Math.max(1,(base.weapon.energyJ||0)*0.01));
    if(k==="armour")num(armour,r,base," J armour",0,true,Math.max(1,armour(base)*0.01));
    if(k==="run")num(run,r,base," s run",0,true,2);
    if(k==="edge")num(x=>x.height.frontEdgeMm,r,base," mm edge",1,false,0.1);
    if(k==="heat")num(x=>x.heat.fightDerateS==null?999:x.heat.fightDerateS,r,base," s heat",0,true,2);
    if(k==="bend")num(x=>x.weapon.bendJ||0,r,base," J to bend",0,true,1);}
  return out.concat(cand.slice(0,2)).join("");}

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
  {id:"cls",t:"Class",sum:()=>SIM.CLASSES[bCls()].name+" · "+fmtG(crLimitG(bCls())),
    body:()=>`<div class="seg" role="group" aria-label="Weight class">${SIM.CLASS_IDS.map(id=>{const c=SIM.CLASSES[id],on=id===bCls(),f=S.bots[id]&&S.bots[id].cfg;
      return`<button type="button" data-cls="${id}" class="${on?"on":""}" aria-pressed="${on}">${c.name.replace("weight","")}<small>${fmtG(crLimitG(id))}${f?" ·&nbsp;fitted":""}</small></button>`;}).join("")}</div>
      <p>One bot per class. Each class keeps its own bot, draft and designs.</p>`},
  {id:"chassis",t:"Chassis",sum:()=>bName("chassis",draft().chassis),
    body:()=>bOpts("chassis",draft().chassis,bFit("chassis"),(c,id)=>{c.chassis=id;})},
  {id:"armour",t:"Armour",sum:()=>{const r=bEval();return"weakest: "+FACE_LBL[r.weakestFace].toLowerCase();},
    body:()=>{const d=draft(),f=B.face;
      return bArmourMap()+`<div class="seg faces" role="group" aria-label="Face">${["front","back","left","right","top"].map(x=>`<button type="button" data-face="${x}" class="${x===f?"on":""}" aria-pressed="${x===f}">${FACE_LBL[x]}<small>${esc(bName("armour",d.armour[x]).replace("HDPE, ","HDPE "))}</small></button>`).join("")}</div>`
        +bOpts("armour",d.armour[f],bFit("armour",f),(c,id)=>{c.armour[f]=id;})
        +`<div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="armour-all">${FACE_LBL[f]} plate on all four sides</button></div>`;}},
  {id:"drive",t:"Drive & wheels",sum:()=>bName("drive",draft().drive)+" · "+bName("wheels",draft().wheels).toLowerCase(),
    body:()=>`<h4>Drive</h4>`+bOpts("drive",draft().drive,bFit("drive"),(c,id)=>{c.drive=id;})+`<h4>Wheels</h4>`+bOpts("wheels",draft().wheels,bFit("wheels"),(c,id)=>{c.wheels=id;})},
  {id:"power",t:"Power",sum:()=>bName("battery",draft().battery)+" · "+bName("electronics",draft().electronics),
    body:()=>`<h4>Battery</h4>`+bOpts("battery",draft().battery,bFit("battery"),(c,id)=>{c.battery=id;})+`<h4>Speed controllers</h4>`+bOpts("electronics",draft().electronics,bFit("electronics"),(c,id)=>{c.electronics=id;})},
  {id:"weapon",t:"Weapon",sum:()=>bName("weapon",draft().weapon)+(draft().disc?` · “${draft().disc.name}”`:""),
    body:()=>bOpts("weapon",draft().weapon,bFit("weapon"),(c,id)=>{c.weapon=id;})+bDisc()},
  {id:"material",t:"Weapon material",sum:()=>draft().weapon==="none"?"no weapon":bName("weaponMaterial",draft().weaponMaterial),
    body:()=>draft().weapon==="none"?"<p>No weapon fitted, so there is nothing to make out of anything.</p>":bOpts("weaponMaterial",draft().weaponMaterial,bFit("weaponMaterial"),(c,id)=>{c.weaponMaterial=id;})+"<p>The disc, arm or wedge plate. Tougher stock bends later and bites harder; lighter stock stores less energy.</p>"},
  {id:"extras",t:"Extras",sum:()=>draft().extras.length?draft().extras.map(e=>bName("extras",e).toLowerCase()).join(", "):"none",
    body:()=>{const base=bEval(),M=SIM.classMult(bCls()),f=bBot().cfg;
      return`<div class="opts">`+SIM.PARTS.extras.map(p=>{const on=draft().extras.indexOf(p.id)>=0,c=bTry(x=>{x.extras=on?x.extras.filter(e=>e!==p.id):x.extras.concat([p.id]);}),r=bEv(c);
        return`<button type="button" class="opt${on?" on":""}${!on&&r.totalG>r.limitG?" over":""}" data-extra="${p.id}" aria-pressed="${on}"><span>${esc(p.name)}${f&&f.extras.indexOf(p.id)>=0?'<span class="tag">fitted</span>':""}${bLock("extras",p.id)}</span><span class="pr">${fmt$(p.cost*M.cost)}</span><small class="d">${on?"<i>fitted to the draft · tap to take off</i>":bDelta(r,base,"extras")}</small></button>`;}).join("")+`</div>`;}},
  {id:"layout",t:"Layout & side profile",sum:()=>{const r=bEval();return`COM ${Math.round(r.com.x*1000)}, ${Math.round(r.com.y*1000)} mm`;},
    body:()=>bLayout()+bProfile()},
  {id:"stress",t:"Stress report",sum:()=>{const s=bStress(),n=k=>s.filter(x=>x.sev===k).length,b=n("bad"),w=n("warn");return b?`${b} bad${w?`, ${w} weak`:""}`:w?`${w} weak`:"nothing serious";},
    body:()=>{const s=bStress();return`<ul class="stress">${s.length?s.map(x=>{const v=SEV_LBL[x.sev]||SEV_LBL.info;return`<li><span class="sev ${v[0]}">${v[1]}</span><span>${esc(x.text)}${x.measured?' <span class="bntag">Bench</span>':x.paper?` <span class="bntag">${esc(x.paper)}</span>`:""}</span></li>`;}).join(""):"<li>Nothing to report.</li>"}</ul>${tmHas("engineer")?`<p class="hint">${esc(tmFirst(tmHas("engineer").name))} has worked out the impact and drop lines on paper.</p>`:""}`;}},
  {id:"designs",t:"Designs",sum:()=>{const n=bDesigns().length;return n?`${n} saved`:"none saved";},body:()=>bDesignsBody()}
];
/* your own disc profile (sim/parts.js DISC_PROFILES): any spinner but the saw; teeth, rim and a name */
function bDisc(){const d=draft(),w=SIM.part("weapon",d.weapon);if(!w||w.type!=="spinner")return"";const lock=crDiscLock(),dp=d.disc,base=bEval();
  const tryD=x=>{const c=bTry(q=>{q.disc=x;});return bEv(c);};
  const opt=(lbl,x,on,key)=>{const r=on?base:tryD(x);return`<button type="button" class="opt${on?" on":""}${!on&&r.totalG>r.limitG?" over":""}" data-disc="${key}" aria-pressed="${on}"><span>${lbl}</span><small class="d">${on?"<i>chosen</i>":bDelta(r,base,"weapon")}</small></button>`;};
  const cur=dp||{name:"",teeth:2,rim:"mid"};
  return`<h4>Disc profile${lock?` <span class="tag lock">${esc(lock)}</span>`:""}</h4>
    <div class="opts">${opt("Stock disc",null,!dp,"stock")}${opt(dp?`Your disc: ${esc(dp.name)}`:"Your own disc",dp||{name:"Own disc",teeth:2,rim:"mid"},!!dp,"own")}</div>
    ${dp?`<div class="opts">${[1,2,3].map(t=>opt(`${t} ${t>1?"teeth":"tooth"}`,Object.assign({},cur,{teeth:t}),cur.teeth===t,"t"+t)).join("")}</div>
      <div class="opts">${Object.keys(SIM.DISC_PROFILES.rim).map(k=>opt(ftCap(SIM.DISC_PROFILES.rim[k].name),Object.assign({},cur,{rim:k}),cur.rim===k,"r"+k)).join("")}</div>
      <div class="dname"><input id="discName" maxlength="${SIM.DISC_PROFILES.nameMax}" value="${esc(dp.name)}" aria-label="Disc name" autocomplete="off"><button type="button" class="btn sm" data-act="disc-name">Name it</button></div>`:""}
    <p>Fewer teeth bite deeper; a heavier rim stores more energy and spins up slower.${lock?" You can design one here; fitting it needs the R&amp;D and a fabricator.":""} A new profile is a new disc: fitting it pays for the material again.</p>`;}
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
  const L=r.lengthM*1000,H=h.heightMm,rad=SIM.part("wheels",cfg.wheels).radiusMm*M.len;
  const axleY=rad,bodyY=h.drivesInverted?rad-H/2:h.clearanceMm;   // centred axles, or low axles under a box that sits on its clearance
  let wpn="",reach=0,top=bodyY+H;
  if(wp.type==="wedge"||wp.type==="lifter"||wp.type==="flipper"){reach=(wp.reachMm||40)*M.len;wpn=`<path class="wp" d="M${L},${bodyY+H*0.6} L${L+reach},${h.frontEdgeMm} L${L},${bodyY}"/>`;}
  else if(r.weapon.radiusM&&cfg.weapon!=="hsp"){const R=r.weapon.radiusM*1000,cy=Math.max(R+h.frontEdgeMm+1,bodyY+H/2);reach=R*1.05;top=Math.max(top,cy+R);
    wpn=`<circle class="wp" cx="${L}" cy="${cy}" r="${R}"/><path class="wp" d="M${L-R*0.2},${bodyY+H*0.3} L${L+R*0.9},${h.frontEdgeMm}"/>`;}
  else if(cfg.weapon==="hsp"){const R=r.weapon.radiusM*1000;reach=R*0.5;wpn=`<line class="wp" x1="${L/2-R}" y1="${bodyY+H+3}" x2="${L/2+R+reach}" y2="${bodyY+H+3}" stroke-width="4"/>`;top+=6;}
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
function bRender(){visBot();if(B.sel&&!SIM.footprints(draft()).some(f=>f.key===B.sel))B.sel=null;
  const r=bEval(),c=SIM.CLASSES[bCls()],pct=100*r.totalG/r.limitG,bar=$("bwBar"),v=VERDICT[r.verdict]||VERDICT.flaws,w=r.weapon;
  $("bwCls").textContent=c.name;
  $("bwNum").innerHTML=r.totalG>r.limitG?`<span class="broke">${fmtG(r.totalG-r.limitG)} over</span>`:`${fmtG(r.limitG-r.totalG)} left`;
  $("bwFill").style.width=Math.min(100,pct).toFixed(1)+"%";bar.classList.toggle("near",pct>=97&&pct<=100);bar.classList.toggle("over",pct>100);
  const m=$("bwMeter");m.setAttribute("aria-valuemax",r.limitG);m.setAttribute("aria-valuenow",Math.round(r.totalG));m.setAttribute("aria-valuetext",`${fmtG(r.totalG)} of ${fmtG(r.limitG)}`);
  $("bCap").innerHTML=`<span><b>${r.driveSpeed.toFixed(1)}</b> m/s</span><span>${w.energyJ>=1?`<b class="readout">${Math.round(w.energyJ).toLocaleString("en-GB")}</b> J`:`<b>${w.type==="none"?"no weapon":w.type}</b>`}</span><span>weak <b>${FACE_LBL[bWeak(r)].toLowerCase()}</b></span><span><b class="readout">${fmtS(r.runtimeS)}</b> run</span><span class="chip ${v[0]}">${v[1]}</span>`;
  $("bRows").innerHTML=B_SECS.map(s=>{const o=!!B.open[s.id];return`<div class="acc${o?" open":""}" data-sec="${s.id}"><button type="button" class="acch" aria-expanded="${o}"><span class="t">${s.t}</span><span class="sum">${esc(s.sum())}</span><span class="chev"></span></button><div class="accb">${o?s.body():""}</div></div>`;}).join("");
  bFitBar(r);
  if(!$("bxRaw").hidden&&$("bxRaw").open)$("simOut").textContent=JSON.stringify(r,(k,v)=>typeof v==="number"?Math.round(v*1000)/1000:v,1);}
function bFitBar(r){const b=bBot(),fb=$("fitBar");
  if(b.cfg&&SIM.sameParts(b.cfg,b.draft)){fb.hidden=true;return;}
  const bill=SIM.fitBill(b.cfg,b.draft),ok=r.valid,n=bill.lines.length,off=bill.removed.length;
  const what=[n?`${n} new part${n===1?"":"s"}`:"",off?`${off} taken off`:""].filter(Boolean).join(", ")||"Parts changed";
  fb.hidden=false;
  const blk=ok?crFitBlock(b.draft):null;
  fb.innerHTML=`<span class="ft"><b>${b.cfg?what:"Nothing fitted yet"}</b>${!ok?(r.totalG>r.limitG?"Over the limit":"Can't be fitted: "+esc(r.errors[0]||"")):blk?`<span class="worn">${esc(blk)}</span>`:`${fmt$(bill.cost)} · ${crFitHours(bill)} h in the workshop`}</span>${b.cfg?'<button type="button" class="btn sm ghost" data-act="undo">Undo</button>':""}<button type="button" class="btn sm pri" data-act="fit"${ok&&!blk?"":" disabled"}>Fit</button>`;}

/* ---- fit: show the bill, then charge it (once the career exists) ---- */
function bFitOpen(){const b=bBot(),r=bEval();if(!r.valid)return;const blk=crFitBlock(b.draft);if(blk){toast(blk);return;}
  const bill=SIM.fitBill(b.cfg,b.draft),c=crOn()?S.career:null,free=!c,h=crFitHours(bill);
  const face=l=>l.face?` (${FACE_LBL[l.face].toLowerCase()})`:"";
  openSheet("Fit these parts",`<ul class="bill">${bill.lines.map(l=>`<li><span>${esc(l.name)}${face(l)}</span><span>${fmt$(l.cost)}</span></li>`).join("")}${bill.removed.map(l=>`<li><span>${esc(l.name)}${face(l)} taken off</span><span>—</span></li>`).join("")}
    <li class="tot"><span>Total · ${h} h</span><span>${fmt$(bill.cost)}</span></li></ul>
    <p class="hint">${free?"No charge: money starts with the career (Career tab).":`Paid in full; parts taken off are gone. You have ${fmt$(c.money||0)} and ${crR1(c.hours)} h this week.`}</p>
    <div class="row"><button type="button" class="btn pri" data-act="fit-ok">${free?"Fit":"Fit · "+fmt$(bill.cost)}</button></div>`);}
function bFitDo(){const b=bBot(),bill=SIM.fitBill(b.cfg,b.draft),c=crOn()?S.career:null,h=crFitHours(bill),blk=crFitBlock(b.draft);if(blk){toast(blk);return;}
  if(c){if((c.money||0)<bill.cost){toast(`Need ${fmt$(bill.cost-(c.money||0))} more`);return;}if(c.hours<h){toast(`That takes ${h} h in the workshop; you have ${crR1(c.hours)} h this week`);return;}
    crPay(bill.cost,`Fitted: ${SIM.CLASSES[bCls()].name.toLowerCase()}, ${bill.lines.length} part${bill.lines.length===1?"":"s"}`);c.hours=crR1(c.hours-h);}
  bClearDamage(b,bill);b.cfg=clone(b.draft);bNormed.add(b.cfg);save();hud();closeSheet();bRender();toast(c?`Fitted · ${fmt$(bill.cost)}`:"Fitted");buzz([10,30,10]);if((curTab==="bench"||curTab==="fight")&&TAB_RENDER[curTab])TAB_RENDER[curTab]();}

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

/* ---- events (one set, on the tab) ---- */
function bClick(e){const t=e.target;let x;
  if((x=t.closest(".acch"))){const id=x.parentNode.dataset.sec;B.open[id]=!B.open[id];bRender();return;}
  if((x=t.closest("[data-cls]"))){ST().buildCls=x.dataset.cls;B.sel=null;B.delKey=null;save();bRender();return;}
  if((x=t.closest("[data-face]"))){B.face=x.dataset.face;bRender();return;}
  if((x=t.closest(".opt[data-slot]"))){const s=x.dataset.slot,id=x.dataset.id;
    bSet(c=>{if(s==="armour")c.armour[B.face]=id;else c[s]=id;});return;}
  if((x=t.closest(".opt[data-disc]"))){const k=x.dataset.disc,d=draft().disc,cur=d||{name:"Own disc",teeth:2,rim:"mid"};
    bSet(c=>{if(k==="stock")delete c.disc;else if(k==="own")c.disc=cur;else if(k[0]==="t")c.disc=Object.assign({},cur,{teeth:+k.slice(1)});else c.disc=Object.assign({},cur,{rim:k.slice(1)});});return;}
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
    else if(a==="disc-name"){const nm=($("discName").value||"").trim();if(draft().disc)bSet(c=>{c.disc=Object.assign({},c.disc,{name:nm});},`Disc named ${SIM.normDisc(Object.assign({},draft().disc,{name:nm})).name}`);}
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
function visBot(){if(!window.SCRAP_VIS)return;const bot=bBot(),b=curTab==="build"||!bot.cfg?bEval():bEv(bot.cfg);
  SCRAP_VIS.setBot(b);const w=SIM.part("weapon",b.cfg.weapon),tag=$("tag");
  if(tag&&ftGL())tag.textContent=`${b.className} · ${w?w.name.toLowerCase():""}${curTab==="build"&&bot.cfg&&!SIM.sameParts(bot.cfg,b.cfg)?" · draft":""}`;}
TAB_RENDER.build=function(){
  if(!bRender.bound){bRender.bound=true;const tb=$("tab-build");
    tb.addEventListener("click",e=>{if(e.target.closest("#lGrid"))return;bClick(e);});
    tb.addEventListener("pointerdown",bDown);tb.addEventListener("pointermove",bMove);tb.addEventListener("pointerup",bUp);
    tb.addEventListener("pointercancel",()=>{B.drag=null;});
    tb.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="dName"){e.preventDefault();bClick({target:tb.querySelector('[data-act="design-save"]')});}
      if(e.key==="Enter"&&e.target.id==="discName"){e.preventDefault();bClick({target:tb.querySelector('[data-act="disc-name"]')});}});
    $("bxRaw").addEventListener("toggle",bRender);
    if(/[?&]sim=1(&|$)/.test(location.search)){$("bxRaw").hidden=false;$("bxRaw").open=true;}
}
  bRender();};
