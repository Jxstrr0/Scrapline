/* ===================== app/report.js: the post-mortem =====================
   Built from a finished fight (F, the sim's fight object) for your bot (bot 0), under the Fight tab's result card:
     rpTimeline(F)   the hits along the round: yours above the line, theirs on you below, bar height by energy
     rpCauses(F)     what went wrong, in order: every plate or part of yours destroyed, with the cause chain ("left front
                     wheel lost at 0:42: undercutter hit on your left side, 85 J; the left plate had given at 0:30"),
                     and the failures that aren't a part (a speed controller, the battery smoking or going flat); a hit
                     that came down into the open weapon bay says so (0.1.15.3)
     rpHint(F)       one redesign hint: the biggest reason you lost or got hurt, told by the stress report's own COMBOS;
                     its kind picks the commentator's post-mortem line (pit, inv, weapon, under, face, pinned, held, gen)
                     rule when one fits (the same words as the Build tab), else in plain words
     rpBill(o)       the repair bill: each damaged part's fee and each destroyed part's price (REPAIR_COST), plus the
                     workshop hours (REPAIR_HOURS). Shown only while sparring; charged from PR 7.
     rpReveal(F, i)  the opponent's build, revealed after the fight, with Copy to designs
   Everything reads the fight's log and end state; nothing is stored. */
const RP_FACE={front:"front",back:"rear",left:"left side",right:"right side",top:"top"};
const rpT=t=>ftT(t);
const rpWeapon=(F,a)=>{if(a==null||a<0)return"the arena";const w=SIM.part("weapon",F.bots[a].cfg.weapon);return!w||w.id==="none"?"a ram":w.name.toLowerCase();};
const rpWho=(F,a)=>a===0?"you":esc(F.bots[a].name);

/* ---- the timeline ---- */
function rpTimeline(F){const dur=Math.max(F.endT!=null?F.endT:F.t,1),mm=Math.max(F.M.mass,1e-6),W=300,H=64,mid=32;let by=0,on=0,nb=0,no=0,bars="";
  for(const e of F.log){if(!(e.k==="hit"||e.k==="grind"||e.k==="haz"||e.k==="ram"&&(e.x||e.pb)||e.k==="wall"&&(e.x||e.pb)))continue;
    const mine=e.a===0,me=e.v===0;if(!mine&&!me)continue;const x=(e.t/dur*W).toFixed(1),h=Math.min(28,3+Math.sqrt((e.E||0)/mm)*2.2).toFixed(1),hurt=e.x&&e.x.some(p=>p[2]);
    if(mine){by+=e.E||0;nb++;bars+=`<rect class="tlby" x="${x}" y="${(mid-1-h).toFixed(1)}" width="2.4" height="${h}"/>`;}
    else{on+=e.E||0;no++;bars+=`<rect class="tlon${hurt?" hurt":""}" x="${x}" y="${mid+1}" width="2.4" height="${h}"/>`;}}
  for(const e of F.log)if(e.k==="fail"&&e.v===0&&(e.what==="part"||e.what==="weapon"||e.what==="dead"))bars+=`<circle class="tlfail" cx="${(e.t/dur*W).toFixed(1)}" cy="${H-4}" r="3"/>`;
  return`<div class="tl"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${nb} hits by you (${Math.round(by)} J), ${no} on you (${Math.round(on)} J)">
    <line class="tlmid" x1="0" y1="${mid}" x2="${W}" y2="${mid}"/>${bars}</svg>
    <div class="tlkey"><span><i class="tlby"></i>by you ${nb} · <span class="readout">${Math.round(by)} J</span></span><span><i class="tlon"></i>on you ${no} · <span class="readout">${Math.round(on)} J</span></span><span>0:00 – ${rpT(dur)}</span></div></div>`;}

/* ---- the cause chain ---- */
/* the moment just before t when a did something to v (under, flip), within win seconds */
function rpBefore(F,k,a,v,t,win){let best=null;for(const e of F.log){if(e.t>t+1e-6)break;if(e.k===k&&e.v===v&&(a==null||e.a===a)&&t-e.t<=win)best=e;}return best;}
function rpPlateGone(F,v,f,t){for(const e of F.log){if(e.t>t+1e-6)break;if(e.v===v&&e.pb&&e.f===f)return e;}return null;}
function rpTopPlate(F,v){const o=F.bots[v],a=o&&o.b.armourMapJ&&o.b.armourMapJ.top;return!!a&&a.id!=="none";}
function rpHow(F,e,f){const me=F.bots[0],mm=Math.max(F.M.mass,1e-6),J=`<span class="readout">${Math.round(e.E||0)} J</span>`;
  switch(e.k){
    case"hit":case"grind":{let s=`${rpWeapon(F,e.a)} ${e.k==="grind"?"grinding":"hit"} ${e.bay===2?"into your open weapon bay from underneath, while you were upside down":e.bay?"straight into your open weapon bay"+(rpTopPlate(F,e.v)?", past the top plate":""):"on your "+(RP_FACE[e.f]||e.f)}, ${J}`;
      const u=rpBefore(F,"under",e.a,0,e.t,3);
      if(u||e.f==="front"&&F.bots[e.a]&&F.bots[e.a].b.weapon.type!=="none"&&rpBefore(F,"lift",e.a,0,e.t,3)){const mine=me.b.height.frontEdgeMm,th=F.bots[e.a].b.height.frontEdgeMm;
        s+=`; ${rpWho(F,e.a)} got under you first: your front edge ${ftMm(mine)} mm, theirs ${ftMm(th)} mm`;}
      return s;}
    case"ram":return`a hard knock on your ${RP_FACE[e.f]||e.f}, ${J}`;
    case"wall":return`slammed into the wall, ${J}`;
    case"haz":return`${e.what==="pusher"?"the wall pusher":"the floor spinner"}, ${J}`;
    case"land":{const tot=(e.x||[]).reduce((q,p)=>q+p[1],0),fl=rpBefore(F,"flip",null,0,e.t,4);
      return`a hard landing${e.inv?" upside down, onto the top":""} (<span class="readout">${Math.round(tot)} J</span>)${fl&&fl.a!=null?`: ${rpWho(F,fl.a)} flipped you ${Math.round((fl.h||0)*100)} cm up`:""}`;}}
  return"";}
const ftMm=v=>(Math.round(v*10)/10).toFixed(1).replace(/\.0$/,"");
function rpCauses(F){const me=F.bots[0],out=[],seen={};
  for(const e of F.log){if(e.v!==0)continue;
    if(e.pb&&!seen["armour_"+e.f]){seen["armour_"+e.f]=1;out.push({t:e.t,html:`<b>${ftCap(RP_FACE[e.f])} plate</b> gives at ${rpT(e.t)}: ${rpHow(F,e)}.`});}
    for(const p of e.x||[]){if(!p[2]||seen[p[0]])continue;seen[p[0]]=1;
      const nm=SIM.benchPartName(me.b,p[0]),f=e.f||(e.k==="land"?(e.inv?"top":null):null);let s=`<b>${esc(ftCap(nm))}</b> lost at ${rpT(e.t)}: ${rpHow(F,e)}`;
      if(f&&f!=="top"&&e.k!=="land"){const gone=rpPlateGone(F,0,f,e.t),a=me.b.armourMapJ[f];
        if(!a||a.id==="none")s+=`; no armour on that side`;else if(gone&&gone!==e)s+=`; the ${RP_FACE[f]} plate had given at ${rpT(gone.t)}`;}
      out.push({t:e.t,html:s+"."});}
    if(e.k==="fail"&&["esc","shock","smoke","cell","dead","motor","righter","flex","flat"].indexOf(e.what)>=0||e.k==="self"&&e.what!=="flip"||e.k==="heat"){
      const s=ftLine(F,e);if(s)out.push({t:e.t,html:`${s} <small>(${rpT(e.t)})</small>.`});}}
  if(me.out)out.push({t:F.endT||F.t,html:me.out==="pit"?`<b>Into the pit</b> at ${rpT(F.endT||F.t)}.`:`<b>Counted out</b> at ${rpT(F.endT||F.t)}${me.inverted&&!me.b.height.drivesInverted?": stuck upside down":me.fx.dead?`: ${me.fx.dead==="battery"?"no battery":me.fx.dead==="electronics"?"no speed controllers":"chassis broken"}`:""}.`});
  return out.sort((a,b)=>a.t-b.t);}

/* ---- the redesign hint ---- */
/* which Build row the Fix it button opens: by stress-report line id, else by the hint's kind (":kind") */
const RP_FIX={shear:"weapon",spinup:"weapon",flip:"weapon",lift:"weapon",recoil:"weapon",bend:"material",bare:"armour",impact:"armour",
  runtime:"power",heat:"power",power:"power",brushless:"power",com:"layout",nose:"layout",edgeHigh:"body",drop:"chassis",invert:"extras",righter:"extras",
  slow:"drive",pusher:"drive",":pit":"drive",":inv":"extras",":under":"body",":face":"armour",":weapon":"weapon"};
function rpHint(F){const me=F.bots[0],b=me.b,lines=SIM.stressReport(b),rule=(...ids)=>{for(const id of ids){const l=lines.find(x=>x.id===id&&x.sev!=="good");if(l)return l;}return null;};
  const L=F.log.filter(e=>e.v===0),faceJ={};let unders=0,shear=false,bent=false,flat=false,hot=false;
  for(const e of L){if((e.k==="hit"||e.k==="grind"||e.k==="haz"||e.k==="ram")&&e.f)faceJ[e.f]=(faceJ[e.f]||0)+(e.E||0);
    if(e.k==="under")unders++;if(e.k==="self"&&e.what==="shear")shear=true;if(e.k==="self"&&e.what==="bent")bent=true;if(e.k==="fail"&&e.what==="flat")flat=true;if(e.k==="heat")hot=true;}
  const lost=F.winner!=null&&F.winner!==me.team,ret=(l,why)=>l?{why,text:esc(l.text),rule:true,rid:l.id}:null;
  let h=null,kind="gen";   // kind: which post-mortem line the commentator reads (sound/voice.js pm:<kind>)
  if(me.out==="pit")kind="pit",h=ret(rule("slow"),"You went into the pit.")||{why:"You went into the pit.",text:"More push keeps you off the edge: grippier wheels or more drive, and armour the back so you can afford to turn away."};
  if(!h&&me.inverted&&!b.height.drivesInverted&&(me.out||lost))kind="inv",h=ret(rule("invert","drop","righter"),"You ended upside down.")||{why:"You ended upside down.",text:"Make it drive inverted (wheels proud of both sides) or fit a self-righter that survives the landing."};
  if(!h&&shear)kind="weapon",h=ret(rule("shear"),"Your weapon shaft sheared.");
  /* wedged: only worth a hint when it cost you, or kept happening, and there's an edge to win */
  if(!h&&(unders>=3||unders>=1&&lost)){const best=F.bots.filter(o=>o.i!==0).reduce((m,o)=>Math.min(m,o.b.height.frontEdgeMm),1e9),why=`They got under you ${unders===1?"once":unders+" times"}.`;
    h=ret(rule("edgeHigh"),why)||(best<b.height.frontEdgeMm-0.05?{why,text:`Your front edge is ${ftMm(b.height.frontEdgeMm)} mm and theirs ${ftMm(best)} mm: a lower wedge or front plate, or a nose-heavy layout, keeps you on top.`}:null);if(h)kind="under";}
  if(!h&&bent)h=ret(rule("bend"),"Your disc bent.");
  if(!h&&flat)h=ret(rule("runtime"),"Your battery went flat.");
  if(!h&&hot)h=ret(rule("heat"),"Your motors overheated.");
  if(!h){const f=Object.keys(faceJ).sort((x,y)=>faceJ[y]-faceJ[x])[0];
    if(f&&faceJ[f]>0){const a=b.armourMapJ[f],why=`Your ${RP_FACE[f]} took ${Math.round(faceJ[f])} J.`,pl=a&&a.id!=="none"?SIM.part("armour",a.id):null;
      const st=SIM.partStates(b,me.st),gone=st["armour_"+f]==="destroyed"||!pl;
      if(gone||lost)h=ret(rule("bare"),why)||{why,text:pl?`The ${RP_FACE[f]} plate (${esc(pl.name.toLowerCase())}) ${st["armour_"+f]==="destroyed"?"gave":"held, just"}: a thicker plate there, or turn that face away from their weapon.`:`Nothing armours the ${RP_FACE[f]}: a plate there is the cheapest fix.`};if(h)kind="face";}}
  if(!h){kind=!lost?"gen":F.log.some(e=>e.k==="release"&&e.v===0)?"pinned":"held";const l=lines.find(x=>x.sev==="bad")||lines.find(x=>x.sev==="warn");h=l?{why:lost?"You lost, but nothing broke the fight open.":"It held up.",text:esc(l.text),rule:true,rid:l.id}:{why:"It held up.",text:"Nothing in the stress report to fix. Try a tougher opponent, or a different arena."};}
  h.kind=kind;h.sec=RP_FIX[h.rid]||RP_FIX[":"+kind]||null;return h;}

/* ---- the repair bill ---- */
function rpPrice(b,key){const cfg=b.cfg,M=SIM.classMult(b.cls),c=(slot,id)=>{const p=SIM.part(slot,id);return p?p.cost*M.cost:0;};
  if(key.indexOf("armour_")===0)return{kind:"armour",price:c("armour",cfg.armour[key.slice(7)])};
  if(key==="chassis")return{kind:"chassis",price:c("chassis",cfg.chassis)};
  const p=b.parts.find(q=>q.key===key);if(!p)return{kind:"extras",price:0};
  const n=s=>Math.max(1,b.parts.filter(q=>q.slot===s).length);
  if(p.slot==="wheels")return{kind:"wheel",price:c("wheels",cfg.wheels)/n("wheels")};
  if(p.slot==="drive")return{kind:"pod",price:c("drive",cfg.drive)/n("drive")};
  if(p.slot==="weapon")return{kind:"weapon",price:c("weapon",cfg.weapon)+c("weaponMaterial",cfg.weaponMaterial)};
  if(key==="battery")return{kind:"battery",price:c("battery",cfg.battery)};
  if(key==="electronics")return{kind:"electronics",price:c("electronics",cfg.electronics)};
  return{kind:"extras",price:c("extras",p.id)};}
function rpBill(o){const b=o.b,st=o.st,states=SIM.partStates(b,st),hs=SIM.classMult(b.cls).hours,lines=[];let cost=0,hours=0;
  if(o.flags&&o.flags.bent&&states.weapon==="intact")states.weapon="damaged";
  for(const key in states){const s=states[key];if(s==="intact")continue;const pr=rpPrice(b,key),hp=pitHp(b,key);
    const left=key.indexOf("armour_")===0?st.armour[key.slice(7)]:key==="chassis"?st.chassis:st.parts[key],lostSh=hp>0?Math.min(1,Math.max(0,1-left/hp)):1;
    const fee=s==="destroyed"?pr.price*(key==="chassis"?REPAIR_COST.rebuildShare:1):pr.price*(REPAIR_COST.minShare+Math.max(lostSh,0.05)*(REPAIR_COST.maxShare-REPAIR_COST.minShare));
    const h=(REPAIR_HOURS[pr.kind]||0.5)*hs*(s==="destroyed"?1:0.2+0.6*lostSh);cost+=fee;hours+=h;
    lines.push({key,kind:pr.kind,name:pitName(b,key),state:s,cost:Math.round(fee),hours:Math.round(h*10)/10,lost:lostSh});}
  lines.sort((x,y)=>y.cost-x.cost);
  return{lines,cost:Math.round(cost),hours:Math.round(hours*10)/10};}
function rpBillHtml(o,ev){const bill=rpBill(o);
  if(!bill.lines.length)return`<p class="ok">Nothing to pay: it came out without a scratch.</p>`;
  return`<table class="rpbill"><tbody>${bill.lines.map(l=>`<tr><th scope="row">${esc(ftCap(l.name))} <small class="${l.state==="destroyed"?"broke":"worn"}">${l.state==="destroyed"?(l.key==="chassis"?"rebuild":"re-buy"):Math.round(l.lost*100)+"% gone"}</small></th><td class="readout">${fmt$(l.cost)}</td><td class="readout">${l.hours} h</td></tr>`).join("")}</tbody>
    <tfoot><tr><th scope="row">Total</th><td class="readout">${fmt$(bill.cost)}</td><td class="readout">${bill.hours} h</td></tr></tfoot></table>
    <p class="hint">Everything still broken after this round. ${ev?"An event's damage goes home with the bot: fix it in the workshop on the Career tab, for euros and workshop hours, or take it to the next event as it is.":"Sparring is free: nothing is charged. At a career event, this comes out of your money and your workshop week."}</p>`;}

/* ---- the opponent's build, revealed ---- */
function rpReveal(F,i){const o=F.bots[i],b=o.b,cfg=o.cfg,P=(s,id)=>{const p=SIM.part(s,id);return p?esc(p.name):"none";},w=b.weapon;
  const arm=["front","back","left","right","top"].map(f=>`${RP_FACE[f]} ${P("armour",cfg.armour[f]).toLowerCase()}`).join(" · ");
  const wl=w.type==="none"?"none":`${P("weapon",cfg.weapon)} in ${P("weaponMaterial",cfg.weaponMaterial).toLowerCase()}${w.storedJ?` · <span class="readout">${Math.round(w.storedJ)} J</span> stored`:""}`;
  return`<div class="rprev"><h4><b style="color:${DV_COL.bots[i%DV_COL.bots.length]}">●</b> ${esc(o.name)}</h4><dl class="rpdl">
    <dt>Weapon</dt><dd>${wl}</dd><dt>Armour</dt><dd>${arm}</dd>
    <dt>Chassis</dt><dd>${P("chassis",cfg.chassis)}</dd><dt>Drive</dt><dd>${P("drive",cfg.drive)}, ${P("wheels",cfg.wheels).toLowerCase()} · <span class="readout">${(Math.round(b.driveSpeed*10)/10).toFixed(1)} m/s</span></dd>
    <dt>Power</dt><dd>${P("battery",cfg.battery)}, ${P("electronics",cfg.electronics).toLowerCase()}</dd>
    <dt>Extras</dt><dd>${cfg.extras.length?cfg.extras.map(e=>P("extras",e)).join(", "):"none"}</dd>
    <dt>Weight</dt><dd><span class="readout">${fmtG(b.totalG)}</span> of ${fmtG(b.limitG)} · front edge <span class="readout">${ftMm(b.height.frontEdgeMm)} mm</span></dd></dl>
    <div class="row"><button type="button" class="btn sm" data-rpcopy="${i}">Copy to designs</button></div></div>`;}
function rpCopy(F,i){const o=F.bots[i],cls=F.cls;if(!Array.isArray(S.designs[cls]))S.designs[cls]=[];const L=S.designs[cls];
  if(L.length>=D_MAX){toast(`${D_MAX} designs per class. Delete one on the Build tab first.`);return;}
  let nm=`${o.name} (copy)`.slice(0,32),k=2;while(L.some(d=>d.name===nm))nm=`${o.name} (copy ${k++})`.slice(0,32);
  L.push({name:nm,cfg:clone(o.cfg)});save();toast(`Saved ${nm} to your designs: load it on the Build tab`);}

/* ---- the whole post-mortem for the shown round ---- */
function rpHtml(F){const me=F.bots[0],c=rpCauses(F),h=rpHint(F);
  return`<div class="card" id="rpCard"><h3>Post-mortem</h3>${rpTimeline(F)}
    <div class="rpmap"><canvas id="rpSil" width="112" height="112" aria-hidden="true"></canvas><div><h4>What went wrong</h4>
      ${c.length?`<ul class="rpcause">${c.map(x=>`<li>${x.html}</li>`).join("")}</ul>`:`<p class="ok">Nothing broke.</p>`}
      <p class="rpkey"><span style="color:${FT_SC.intact}">●</span> intact <span style="color:${FT_SC.damaged}">●</span> damaged <span style="color:${FT_SC.destroyed}">●</span> destroyed</p></div></div>
    <div class="rphint"><h4>Redesign hint</h4><p><b>${h.why}</b> ${h.text}${h.rule?' <small class="hint">(stress report)</small>':""}</p>
      <div class="row">${h.sec&&B_SECS.some(x=>x.id===h.sec)?`<button type="button" class="btn sm" data-ft="fix" data-sec="${h.sec}">Fix it: ${esc(B_SECS.find(x=>x.id===h.sec).t)}</button>`:'<button type="button" class="btn sm" data-ft="build">Open Build</button>'}<button type="button" class="btn sm pri" data-ft="replay"${ftReplayOk(F)?"":" disabled"}>Replay</button></div>
      ${ftReplayOk(F)?"":'<p class="hint">This fight is too long to replay.</p>'}</div></div>
  <div class="card"><h3>Repair bill</h3>${rpBillHtml(me,!!F.ev)}</div>
  <div class="card"><h3>${F.bots.filter(o=>!o.mini).length>2?"Their builds":"Their build"}</h3>${F.bots.filter(o=>o.i!==0&&!o.mini).map(o=>rpReveal(F,o.i)).join("")}</div>`;}
function rpDraw(F){const cv=$("rpSil");if(cv&&F){const me=F.bots[0],s=SIM.partStates(me.b,me.st);if(me.flags.bent&&s.weapon==="intact")s.weapon="damaged";ftSil(cv,me,s,112);}}
