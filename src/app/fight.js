/* ===================== app/fight.js: the Fight tab =====================
   PR 4a: an AI-against-AI fight of the bot fitted in the Build tab's class, against any test build (SIM.TEST_BUILDS),
   played in the top-down debug view (app/debugview.js) with the fight log in words underneath. Both bots are driven by
   SCRAP_SIM's AI (rush or keep-away; "auto" picks keep-away for spinners); no stakes, nothing saved. PR 5 replaces this
   with sparring in the 3D arena (any opponent, any arena, your own driving), the HUD, and the pit window in PR 6.
   The frame loop steps the sim at its fixed 60 Hz with an accumulator clamped to 5 steps a frame, so a stall never
   fast-forwards the round, and pauses when the page is hidden (visibilitychange) or the tab is left. Lite draws at 30 fps. */
const FT={F:null,opp:"wedge",style:"auto",speed:1,paused:false,raf:0,last:0,lastDraw:0,acc:0,flashes:[],logN:0,hudT:0,fights:0};
const FT_STYLES=[["auto","Auto"],["rush","Rush"],["keepaway","Keep-away"]];
const ftAuto=cfg=>{const w=SIM.part("weapon",SIM.normCfg(cfg).weapon);return w&&(w.type==="spinner"||w.type==="saw")?"keepaway":"rush";};

function ftStart(){const bot=bBot(),cls=bCls();if(!bot.cfg)return;
  const opp=SIM.TEST_BUILDS.find(t=>t.id===FT.opp)||SIM.TEST_BUILDS[0],oc=Object.assign({},opp.cfg,{cls});
  const seed=((Date.now()&0x7fffffff)^(++FT.fights*0x9E3779B1))>>>0;   // the app picks the seed; the sim is deterministic from it
  FT.F=SIM.newFight({seed,fx:true,bots:[
    {cfg:bot.cfg,name:"You",driver:{style:FT.style==="auto"?ftAuto(bot.cfg):FT.style,skill:0.7}},
    {cfg:oc,name:opp.name,driver:{style:ftAuto(oc),skill:0.7}}]});
  FT.sig=bnSig(bot.cfg);FT.flashes=[];FT.logN=0;FT.acc=0;FT.paused=false;FT.last=performance.now();
  ftRender();ftLoop();}
function ftLoop(){if(!FT.raf)FT.raf=requestAnimationFrame(ftFrame);}
function ftPause(on){if(!FT.F||FT.F.over)return;FT.paused=on;if(!on){FT.last=performance.now();FT.acc=0;ftLoop();}ftControls();}
function ftFrame(now){FT.raf=0;const F=FT.F;if(!F)return;
  if(curTab!=="fight"||document.hidden){if(!F.over&&!FT.paused)ftPause(true);return;}
  if(!FT.paused&&!F.over){let dt=(now-FT.last)/1000;FT.last=now;if(!(dt>0))dt=0;FT.acc+=Math.min(dt,0.25)*FT.speed;
    let k=0;while(FT.acc>=1/60&&k<5&&!F.over){SIM.stepFight(F,null);FT.acc-=1/60;k++;}
    if(k===5)FT.acc=Math.min(FT.acc,1/60);   // clamped: a slow frame loses time instead of catching up
    if(F.fxq&&F.fxq.length){for(const e of F.fxq)if(e.k!=="ram"||e.E>2*F.M.mass)FT.flashes.push(Object.assign({t0:now},e));F.fxq.length=0;}}
  FT.flashes=FT.flashes.filter(f=>now-f.t0<500);
  if(gfxTier()!=="lite"||now-FT.lastDraw>=31||F.over){DEBUGVIEW.draw($("ftCv"),F,FT.flashes,now);FT.lastDraw=now;}
  if(now-FT.hudT>120||F.over){FT.hudT=now;ftHud();ftLog();}
  if(F.over&&!ftFrame.done){ftFrame.done=F;ftControls();buzz([20,40,20]);}
  if((!FT.paused&&!F.over)||FT.flashes.length)ftLoop();}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&FT.F&&!FT.F.over&&!FT.paused)ftPause(true);});

/* ---- readouts under the view ---- */
function ftBar(v,cls){return`<span class="ftbar"><i class="${cls||""}" style="width:${Math.round(Math.max(0,Math.min(1,v))*100)}%"></i></span>`;}
function ftHud(){const F=FT.F,el=$("ftHud");if(!F||!el)return;
  el.innerHTML=F.bots.map(o=>{const w=o.b.weapon,h=o.b.heat,bat=o.b.power.batteryWs>0?o.bat/o.b.power.batteryWs:0,lost=SIM.damageShare(o.b,o.st);
    const heat=Math.max(h.drive.budgetJ>0?o.heat.d/h.drive.budgetJ:0,h.weapon&&h.weapon.budgetJ>0?o.heat.w/h.weapon.budgetJ:0);
    let wt="";if(!o.fx.weaponOk&&w.type!=="none")wt=`<span class="broke">weapon gone</span>`;
    else if(w.type==="spinner"||w.type==="saw")wt=`disc ${ftBar(o.wp.om/(w.omega||1))} <span class="readout">${Math.round(o.wp.om*60/(2*Math.PI)).toLocaleString("en-GB")} rpm</span>`;
    else if(w.type==="flipper")wt=`<span class="readout">${o.wp.shots}/${w.shots}</span> shots`;
    else if(w.type==="none"||w.type==="wedge")wt=w.type==="wedge"?"wedge":"pusher";
    else wt=w.type;
    const st=o.out?`<span class="broke">${o.out==="ko"?"counted out":"in the pit"}</span>`:o.fx.dead?`<span class="broke">dead: ${esc(o.fx.dead)}</span>`:o.flat?`<span class="broke">battery flat</span>`:
      o.immobileS>0?`<span class="worn">immobile ${Math.ceil(F.rules.koS-o.immobileS)} s</span>`:[o.inverted?"upside down":"",o.under?"under a wedge":"",o.held!=null?"lifted":"",o.fx.sides.left.out?"left side out":"",o.fx.sides.right.out?"right side out":""].filter(Boolean).map(s=>`<span class="worn">${s}</span>`).join(" · ");
    return`<div class="ftbot"><b style="color:${DV_COL.bots[o.i%DV_COL.bots.length]}">●</b> <b>${esc(o.name)}</b> <small>${esc(SIM.part("weapon",o.cfg.weapon).name)}</small>
      <div class="ftrow"><span>${wt}</span><span>battery ${ftBar(bat,bat<0.2?"lo":"")}</span><span>heat ${ftBar(heat,heat>0.85?"lo":"")}</span><span>damage <span class="${lost>0.5?"broke":lost>0.15?"worn":"ok"}">${Math.round(lost*100)}%</span></span></div>${st?`<div class="ftrow">${st}</div>`:""}</div>`;}).join("");
  const r=$("ftRes");if(r){if(F.over){const win=F.winner==null?null:F.bots.find(o=>o.team===F.winner);
    r.textContent=F.reason==="draw"?`Draw at ${ftT(F.endT)}`:`${win.i===0?"You win":win.name+" wins"}${F.reason==="ko"?" by knockout":F.reason==="pit"?": into the pit":" on damage"} at ${ftT(F.endT)}`;r.className="ftres "+(F.winner===0?"ok":F.winner==null?"":"broke");}
    else r.textContent=FT.paused?"Paused":"";}}
const FT_HOLD=SIM.FIGHT.holdMaxS;
const ftT=t=>{t=Math.round(t);return`${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`;};

/* ---- the log in words ---- */
function ftName(F,i,poss){if(i==null||i<0)return poss?"the":"the arena";const o=F.bots[i];return o.i===0?(poss?"your":"you"):esc(poss?o.name+"'s":o.name);}
const ftCap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const FT_FACE={front:"front",back:"rear",left:"left side",right:"right side",top:"top"};
function ftParts(F,v,x){return(x||[]).map(p=>`${esc(SIM.benchPartName(F.bots[v].b,p[0]))} ${p[2]?'<span class="broke">destroyed</span>':`−${Math.round(p[1])} J`}`).join(", ");}
function ftLine(F,e){const a=e.a,v=e.v,N=(i,p)=>ftName(F,i,p),J=x=>`<span class="readout">${Math.round(x)} J</span>`,
    V=(i,three,two)=>i===0?two:three;   // "you hit", "Wedge hits"
  switch(e.k){
    case"hit":case"grind":{const plate=e.pb?` · ${N(v,1)} ${FT_FACE[e.f]} plate gives`:e.p>0.5?` · plate −${Math.round(e.p)} J`:"";
      return`${ftCap(N(a))} ${e.k==="grind"?V(a,"grinds","grind"):V(a,"hits","hit")} ${N(v,1)} ${FT_FACE[e.f]||e.f}: ${J(e.E)}${e.n>1?` <small>(${e.n} small hits)</small>`:""}${e.gl?" <small>(glancing)</small>":""}${plate}${e.x?" · "+ftParts(F,v,e.x):""}`;}
    case"ram":case"wall":return e.x||e.pb?`${e.k==="wall"?ftCap(N(v))+" "+V(v,"slams","slam")+" into the wall":"Hard knock on "+N(v,1)+" "+FT_FACE[e.f]}: ${J(e.E)}${e.x?" · "+ftParts(F,v,e.x):""}`:null;
    case"under":return`${ftCap(N(a))} ${V(a,"gets","get")} under ${N(v)}`;
    case"flip":return v<0?`${ftCap(N(a))} ${V(a,"fires and misses","fire and miss")}`:e.heavy?`${ftCap(N(a))} can't lift ${N(v)}: too heavy`:`${ftCap(N(a))} ${V(a,"flips","flip")} ${N(v)} ${Math.round(e.h*100)} cm up`;
    case"lift":return`${ftCap(N(a))} ${V(a,"lifts","lift")} ${N(v)}`;
    case"drop":return`${ftCap(N(a))} ${V(a,"lets","let")} ${N(v)} down (${FT_HOLD} s hold limit)`;
    case"tip":return`${ftCap(N(a))} ${V(a,"tips","tip")} ${N(v)} ${e.inv?"over":"off the lifter"}`;
    case"inv":return e.inv?`${ftCap(N(v))} ${V(v,"lands","land")} upside down`:`${ftCap(N(v))} ${V(v,"lands","land")} back on ${v===0?"your":"its"} wheels`;
    case"land":{const x=e.x||[],tot=x.reduce((q,p)=>q+p[1],0),dead=x.filter(p=>p[2]);if(!dead.length&&tot<2*F.M.mass)return null;
      return`${e.n>1?"Hard landings":"Hard landing"} for ${N(v)}: ${J(tot)} into ${e.inv?"the top":"the wheels and drive"}${dead.length?" · "+dead.map(p=>`${esc(SIM.benchPartName(F.bots[v].b,p[0]))} <span class="broke">destroyed</span>`).join(", "):""}`;}
    case"right":return`${ftCap(N(v))} ${V(v,"self-rights","self-right")}`;
    case"heat":return`${ftCap(N(v,1))} ${e.what==="drive"?"drive motors":"weapon motor"} overheat: half power until they cool`;
    case"self":return e.what==="bent"?`${ftCap(N(v,1))} disc bends on that ${J(e.E)} hit: half the energy from now on`:`${ftCap(N(v,1))} weapon shaft shears!`;
    case"fail":{const P=N(v,1);switch(e.what){
      case"part":return e.key==="weapon"?null:`${ftCap(P)} ${esc(SIM.benchPartName(F.bots[v].b,e.key))} is <span class="broke">destroyed</span>`;
      case"side":return`${ftCap(P)} ${e.side} side is out`;
      case"esc":return`A speed controller in ${P} bot dies: the ${e.side} side is out`;
      case"smoke":return`${ftCap(P)} battery is smoking: power down`;
      case"cell":return`${ftCap(P)} battery is gone, but the failsafe keeps one cell going`;
      case"dead":return`${ftCap(N(v))} ${V(v,"is","are")} <span class="broke">dead</span> (${e.why==="battery"?"battery":e.why==="electronics"?"speed controllers":"chassis broken"})`;
      case"motor":return`${ftCap(P)} weapon motor dies`;
      case"weapon":return`${ftCap(P)} weapon is <span class="broke">wrecked</span>`;
      case"righter":return`${ftCap(N(v))} can't self-right any more`;
      case"flex":return`${ftCap(P)} chassis is flexing: the armour soaks up less`;
      case"flat":return`${ftCap(P)} battery is flat`;}
      return null;}
    case"ko":return`${ftCap(N(v))} ${V(v,"is","are")} <span class="broke">counted out</span>`;
    case"pit":return`${ftCap(N(v))} ${V(v,"goes","go")} into the pit`;
    case"end":return null;}
  return null;}
function ftLog(){const F=FT.F,el=$("ftLog");if(!F||!el)return;const L=F.log;if(FT.logN>L.length)FT.logN=0;
  if(FT.logN===L.length)return;const atEnd=el.scrollTop+el.clientHeight>=el.scrollHeight-8;let html="";
  /* a small hit merges into an entry up to 6 back and can grow after it was written: redraw those lines, then add the new ones */
  const from=Math.max(0,FT.logN-6);while(el.lastElementChild&&+el.lastElementChild.dataset.n>=from)el.lastElementChild.remove();
  for(let n=from;n<L.length;n++){const s=ftLine(F,L[n]);if(s)html+=`<li data-n="${n}"><span class="ftt">${L[n].t.toFixed(1)}</span>${s}</li>`;}
  FT.logN=L.length;if(html)el.insertAdjacentHTML("beforeend",html);
  while(el.children.length>400)el.firstElementChild.remove();
  if(atEnd)el.scrollTop=el.scrollHeight;}

/* ---- the tab ---- */
function ftControls(){const el=$("ftCtl");if(!el)return;const F=FT.F,live=F&&!F.over;
  el.innerHTML=`<button type="button" class="btn pri" data-ft="go">${F?"New fight":"Fight"}</button>${live?`<button type="button" class="btn" data-ft="pause">${FT.paused?"Resume":"Pause"}</button>`:""}`;
  const r=$("ftRes");if(r&&live)r.textContent=FT.paused?"Paused":"";}
function ftRender(){const el=$("ftBody");if(!el)return;const bot=bBot(),cls=bCls(),c=SIM.CLASSES[cls];
  const chips=`<div class="seg bncls" role="group" aria-label="Weight class">${SIM.CLASS_IDS.map(id=>`<button type="button" data-ftcls="${id}" class="${id===cls?"on":""}" aria-pressed="${id===cls}">${SIM.CLASSES[id].name.replace("weight","")}</button>`).join("")}</div>`;
  if(!bot.cfg){FT.F=null;el.innerHTML=chips+`<div class="card"><h3>Nothing fitted in the ${c.name} yet</h3><p>A fight uses the bot you've fitted, not the draft on the Build tab. Fit the draft first.</p>
    <div class="row"><button type="button" class="btn pri" data-ft="fit">Fit the draft</button><button type="button" class="btn" data-ft="build">Open Build</button></div></div>`;return;}
  if(FT.F&&(FT.F.cls!==cls||FT.sig!==bnSig(bot.cfg)))FT.F=null;   // a refit ends the old fight
  const drafted=!(bot.draft&&bnSig(bot.draft)===bnSig(bot.cfg)),wp=SIM.part("weapon",bot.cfg.weapon);
  el.innerHTML=chips+`<div class="card"><h3>Test fight<span class="soon">debug view</span></h3>
    <p>Your fitted ${esc(c.name.toLowerCase())} (${esc(wp?wp.name.toLowerCase():"")}) against a test build, both driven by the AI. Top-down for now; the 3D arena and your own driving arrive in the next update.</p>
    ${drafted?'<p class="hint">Your draft on the Build tab has changes that aren\'t fitted. The fight uses what\'s fitted. <button type="button" class="lnk" data-ft="build">Open Build</button></p>':""}
    <div class="field"><span class="lbl">Opponent</span><div class="ftopp" role="group" aria-label="Opponent">${SIM.TEST_BUILDS.map(t=>`<button type="button" data-ftopp="${t.id}" class="${t.id===FT.opp?"on":""}" aria-pressed="${t.id===FT.opp}">${esc(t.name)}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">Your AI driver</span>${segHtml("ftStyle","ftstyle",FT_STYLES.map(s=>[s[0],s[1],s[0]==="auto"?(ftAuto(bot.cfg)==="keepaway"?"keep-away":"rush"):""]),FT.style)}</div>
    <div class="field"><span class="lbl">Speed</span>${segHtml("ftSpeed","ftspeed",[["1","1×"],["2","2×"],["4","4×"]],String(FT.speed))}</div>
    <canvas id="ftCv" class="ftcv" role="img" aria-label="Top-down view of the fight"></canvas>
    <p class="ftres" id="ftRes" role="status" aria-live="polite"></p>
    <div class="row" id="ftCtl"></div>
    <div id="ftHud"></div></div>
    <div class="card"><h3>Fight log</h3><ol class="ftlog" id="ftLog" aria-label="Fight log"></ol></div>`;
  ftControls();
  if(FT.F){FT.logN=0;ftHud();ftLog();DEBUGVIEW.draw($("ftCv"),FT.F,[],performance.now());ftFrame.done=FT.F.over?FT.F:null;}
  else{const cv=$("ftCv");requestAnimationFrame(()=>{const g=cv.getContext("2d"),w=cv.clientWidth,d=Math.min(window.devicePixelRatio||1,2);cv.width=cv.height=Math.round(w*d);
    g.fillStyle=DV_COL.floor;g.fillRect(0,0,cv.width,cv.width);g.fillStyle=DV_COL.dim;g.font=`${13*d}px "Space Grotesk",sans-serif`;g.textAlign="center";g.fillText("Pick an opponent and tap Fight",cv.width/2,cv.width/2);});}}
function ftClick(e){const t=e.target;let x;
  if((x=t.closest("[data-ft]"))){const a=x.dataset.ft;
    if(a==="go"){ftFrame.done=null;ftStart();}
    else if(a==="pause")ftPause(!FT.paused);
    else if(a==="build")showTab("build");
    else if(a==="fit"){const r=bEval();if(!r.valid){toast(r.totalG>r.limitG?"The draft is over the limit: fix it on the Build tab":"The draft can't be fitted: see the Build tab");return;}bFitOpen();}
    return;}
  if((x=t.closest("[data-ftcls]"))){ST().buildCls=x.dataset.ftcls;B.sel=null;B.delKey=null;FT.F=null;save();ftRender();return;}
  if((x=t.closest("[data-ftopp]"))){FT.opp=x.dataset.ftopp;document.querySelectorAll("[data-ftopp]").forEach(b=>{const on=b===x;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);});return;}
  if((x=t.closest("[data-ftstyle]"))){FT.style=x.dataset.ftstyle;ftSeg("ftStyle",x);return;}
  if((x=t.closest("[data-ftspeed]"))){FT.speed=+x.dataset.ftspeed;ftSeg("ftSpeed",x);return;}}
function ftSeg(id,b){$(id).querySelectorAll("button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});}
TAB_RENDER.fight=function(){
  if(!ftRender.bound){ftRender.bound=true;$("tab-fight").addEventListener("click",ftClick);
    let rt=0;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(curTab==="fight"&&FT.F)DEBUGVIEW.draw($("ftCv"),FT.F,FT.flashes,performance.now());},150);});}
  ftRender();};
