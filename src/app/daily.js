/* ===================== app/daily.js: THE DAILY CHALLENGE and REPLAY CODES (0.1.20.0) =====================
   Daily challenge (Kelbo: bring your own bot). The date (the phone's own, local) picks a class, an opponent in it and an
   arena, and the fight's seed, so everyone gets the same fight that day; you drive. Bring your fitted bot for that class,
   any of your saved designs for it, or a starting point. Sandbox rules: nothing costs, nothing carries over, in either mode.
   S.daily (inside scr-save, SAVE_V 10) keeps {last, streak, top, best, tries}: the last day you fought it, how many days in
   a row, your longest run, today's best result and today's tries. A stopped fight doesn't count.
     dlDay(d)      "YYYY-MM-DD", local         dlPick(day)   {day, cls, opp, arena, seed}
     dlCard()      the Fight tab's card        dlStart()     the fight          dlRecord(F)   a finished daily round
   Replay codes: a fight's log (seed, builds, arena, rules, your inputs; no entries, the replay makes them again) as
   "SCRRP1:" + JSON -> LZW -> base64url + a 6-character checksum, with buZip / buUnzip / buSum from app/savecode.js. The
   post-mortem's Share button makes one; the Fight tab's Replay codes card plays one and shows its post-mortem. Nothing
   is stored: a pasted code lives only until the next fight. A code made on another version may play out differently. */
const DL={bring:null};
function dlDay(d){d=d||new Date();const p=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
function dlPrev(day){const [y,m,d]=day.split("-").map(Number);return dlDay(new Date(y,m-1,d-1));}
function dlPick(day){let h=2166136261;const s="scr-daily:"+day;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  const r=SIM.rng(h),cls=SIM.rPick(r,SIM.CLASS_IDS),ops=SIM.OPPONENTS.filter(o=>o.cls===cls).map(o=>o.id),
    home=SIM.CLASSES[cls].arenaId,away=SIM.ARENA_IDS.filter(a=>a!==home&&a!=="box");
  const opp=ops.length?SIM.rPick(r,ops):SIM.rPick(r,SIM.TEST_BUILDS.filter(t=>t.id!=="sloppy")).id,arena=r()<0.6||!away.length?home:SIM.rPick(r,away);
  return{day,cls,opp,arena,seed:(Math.floor(r()*0x7fffffff)>>>0)||1};}
const dlState=()=>{if(!buObjS(S.daily))S.daily={last:null,streak:0,top:0,best:null,tries:0};return S.daily;};
/* what you can bring for the day's class: your fitted bot (this mode's garage), your designs, the starting points */
function dlBrings(cls){const out=[],b=S.bots[cls];
  if(b&&buObjS(b.cfg))out.push({id:"fit",name:"Your fitted bot",cfg:b.cfg});
  (Array.isArray(S.designs[cls])?S.designs[cls]:[]).forEach((d,i)=>{if(d&&buObjS(d.cfg))out.push({id:"d"+i,name:d.name,cfg:d.cfg});});
  SIM.TEST_BUILDS.filter(t=>t.id!=="sloppy").forEach(t=>out.push({id:"t:"+t.id,name:t.name,cfg:t.cfg,start:true}));
  return out.map(o=>Object.assign(o,{cfg:SIM.normCfg(Object.assign({},o.cfg,{cls}))}));}
function dlBring(cls){const L=dlBrings(cls);return L.find(o=>o.id===DL.bring)||L[0];}
/* a daily round, scored: a win beats a draw beats a loss; a faster knockout and more damage dealt break ties */
function dlScore(F){const me=F.bots[0],end=F.endT!=null?F.endT:F.t,won=F.winner!=null&&F.winner===me.team,lost=F.winner!=null&&!won;let by=0;
  for(const e of F.log)if(e.a===0&&(e.k==="hit"||e.k==="grind"||e.k==="ram"&&(e.x||e.pb)))by+=e.E||0;
  const ko=F.reason==="ko"||F.reason==="pit",fast=won&&ko?Math.max(0,Math.round((F.rules.roundS-end)*10)):0,
    score=(won?2000:lost?0:1000)+fast+Math.min(999,Math.round(by));
  const txt=won?(ko?`Won ${F.reason==="pit"?"into the pit":"by knockout"} at ${ftT(end)}`:"Won on the judges"):lost?(ko?`Lost: ${me.out==="pit"?"into the pit":"counted out"} at ${ftT(end)}`:"Lost on the judges"):"A draw";
  return{score,txt,won};}
function dlRecord(F){if(F.reason==="stopped")return;const D=dlState(),day=FT.ext.day,r=dlScore(F);
  if(D.last!==day){D.streak=D.last===dlPrev(day)?(D.streak|0)+1:1;D.last=day;D.best=null;D.tries=0;}
  D.tries=(D.tries|0)+1;D.top=Math.max(D.top|0,D.streak);
  const nb=!D.best||r.score>D.best.score;if(nb)D.best={score:r.score,txt:r.txt,bring:FT.ext.bring};
  FT.ext.res=Object.assign(r,{newBest:nb});save();}
function dlStart(){if(FT.on)return;const P=dlPick(dlDay()),b=dlBring(P.cls),opp=ftOpp(P.cls,P.opp);
  const bots=[{cfg:clone(b.cfg),name:"You",driver:null},{cfg:opp.cfg,name:opp.name,driver:opp.driver}];
  FT.you=true;FT.sig=bnSig(b.cfg);FT.rounds=[];FT.rv=0;FT.rp=null;FT.bout=null;FT.ext={kind:"daily",day:P.day,bring:b.name};
  ftGo(SIM.newFight({seed:P.seed,fx:true,arena:P.arena,bots}));}
function dlCard(){const P=dlPick(dlDay()),c=SIM.CLASSES[P.cls],opp=ftOpp(P.cls,P.opp),D=dlState(),today=D.last===P.day,L=dlBrings(P.cls),cur=dlBring(P.cls);
  const prevOk=D.last===P.day||D.last===dlPrev(P.day),run=prevOk?D.streak|0:0,ex=FT.ext&&FT.ext.kind==="daily"&&FT.ext.day===P.day&&FT.ext.res;
  const mine=L.filter(o=>!o.start),starts=L.filter(o=>o.start);
  const when=new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  return`<div class="card dlcard"><h3>Daily challenge <small class="hint">${esc(when)}</small></h3>
    <p>Today: a ${esc(c.name.toLowerCase())} against <b>${esc(opp.name)}</b> in the <b>${esc(SIM.ARENAS[P.arena].name)}</b>. The same fight for everyone today, and you drive. Sandbox rules: nothing costs, nothing carries over.</p>
    <div class="field"><span class="lbl">Bring</span>${mine.length?ftChips("dlbring","Your bots",mine.map(o=>[o.id,esc(o.name)]),cur.id):""}${ftChips("dlbring","Starting points",starts.map(o=>[o.id,esc(o.name)]),cur.id)}
      ${mine.length?"":`<p class="hint">No ${esc(c.name.toLowerCase())} of yours yet: bring a starting point, or fit or save one on the Build tab.</p>`}</div>
    ${ex?`<p class="ftres ${ex.won?"ok":""}" role="status">${esc(ex.txt)} · <span class="readout">${ex.score.toLocaleString("en-GB")}</span> points${ex.newBest?" · today's best":""}</p>`:""}
    <p class="hint">${today&&D.best?`Today's best: ${esc(D.best.txt)} (<span class="readout">${D.best.score.toLocaleString("en-GB")}</span> points, ${esc(D.best.bring||"")}) · ${D.tries} ${D.tries===1?"try":"tries"}`:"Not fought yet today."}
      ${run?` · <b>${run}-day streak</b>`:""}${(D.top|0)>1?` (best ${D.top})`:""}</p>
    <div class="row"><button type="button" class="btn pri" data-dl="go">Fight the daily</button></div></div>`;}

/* ---- replay codes ---- */
const RC_V=1,RC_PREFIX="SCRRP"+RC_V+":";
const RC_MSG={empty:"Paste a replay code into the box first.",damaged:"That code is damaged or cut off. Copy the whole code again, from SCRRP1: to the end.",
  newer:"That code was made by a newer version of the game. Reload the page to update, then try again.",
  save:"That's a save backup, not a replay. Restore it in Settings → Saves.",notcode:"That doesn't look like a replay code. They start with \"SCRRP1:\".",
  bad:"That code opened, but the fight inside doesn't look right."};
function rcCode(log){const d={v:RC_V,ver:VERSION,seed:log.seed,arena:log.arena,rules:log.rules||{},steps:log.steps,bots:log.bots,inputs:log.inputs||{}};
  const body=buZip(new TextEncoder().encode(JSON.stringify(d)));return RC_PREFIX+body+buSum(body);}
function rcOk(d){if(!buObj(d)||d.v!==RC_V||!buNum(d.seed)||!SIM.ARENAS[d.arena]||!buObj(d.rules)||!buNum(d.steps)||d.steps<1||d.steps>60*600||!buObj(d.inputs))return false;
  if(!Array.isArray(d.bots)||d.bots.length<2||d.bots.length>6)return false;
  for(const b of d.bots){if(!buObj(b)||!buObj(b.cfg)||!SIM.CLASSES[b.cfg.cls]||SIM.unknownIds(b.cfg).length||(b.name!=null&&typeof b.name!=="string"))return false;}
  for(const k in d.inputs){const p=d.inputs[k];if(!buObj(p)||!buNum(p.n)||typeof p.d!=="string")return false;}
  return true;}
function rcRead(text){const s=String(text==null?"":text).replace(/[\s​-‍⁠﻿]+/g,"");if(!s)throw new Error("empty");
  const m=/SCRRP(\d+):/.exec(s);if(!m)throw new Error(/SCR\d+:/.test(s)?"save":"notcode");
  if(+m[1]!==RC_V)throw new Error(+m[1]>RC_V?"newer":"notcode");
  const c=s.slice(m.index+m[0].length).replace(/[^A-Za-z0-9_-].*$/,"");if(c.length<7)throw new Error("damaged");
  const body=c.slice(0,-6);if(buSum(body)!==c.slice(-6))throw new Error("damaged");
  let d;try{d=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(buUnzip(body))));}catch(e){throw new Error("damaged");}
  if(!rcOk(d))throw new Error("bad");
  d.bots=d.bots.map(b=>Object.assign({},b,{cfg:SIM.normCfg(Object.assign({},b.cfg)),name:String(b.name||"Bot").slice(0,40)}));
  return d;}
function rcShareOpen(){const R=FT.rounds[FT.rv];if(!R||!ftReplayOk(R.F)){toast("This fight can't be shared");return;}let code="";try{code=rcCode(R.log);}catch(e){}
  if(!code){toast("Couldn't make a replay code on this device");return;}
  openSheet("Share replay",`<p class="hint" style="margin-top:0">This code is the whole fight: both builds, the arena and every move you made. Send it to a friend; they paste it on the Fight tab under <b>Replay codes</b> to watch it and read the post-mortem.</p>
<textarea class="code" id="rcOut" readonly spellcheck="false" aria-label="Replay code"></textarea>
<p class="hint">${code.length.toLocaleString("en-GB")} characters, starting with ${RC_PREFIX}</p>
<div class="row"><button class="btn pri" id="rcCopy">Copy code</button></div>`);
  const ta=$("rcOut");ta.value=code;ta.addEventListener("focus",()=>buSelect(ta));
  $("rcCopy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(ta.value);toast("Copied");return;}catch(e){}
    ta.focus();buSelect(ta);let ok=false;try{ok=document.execCommand("copy");}catch(e){}toast(ok?"Copied":"Code selected. Long-press it and tap Copy.");});}
function rcWatchOpen(){if(FT.on){toast("Let the fight finish first");return;}
  openSheet("Watch a replay",`<p class="hint" style="margin-top:0">Paste a replay code (it starts with ${RC_PREFIX}). It plays the fight and shows its post-mortem; nothing in your game changes.</p>
<textarea class="code" id="rcIn" placeholder="${RC_PREFIX}…" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-label="Replay code" aria-describedby="rcErr"></textarea>
<p class="hint buerr" id="rcErr" role="alert"></p>
<div class="row"><button class="btn pri" id="rcGo">Watch</button></div>`);
  const ta=$("rcIn"),err=$("rcErr");ta.addEventListener("input",()=>{err.textContent="";});
  $("rcGo").addEventListener("click",()=>{let d;try{d=rcRead(ta.value);}catch(e){err.textContent=RC_MSG[e.message]||RC_MSG.damaged;return;}rcWatch(d);});
  if(window.matchMedia&&matchMedia("(hover:hover) and (pointer:fine)").matches)ta.focus({preventScroll:true});}
function rcWatch(d){const log={seed:d.seed,arena:d.arena,rules:d.rules,steps:d.steps,bots:d.bots,inputs:d.inputs};let F;
  try{F=ftRpFight(log,d.steps);}catch(e){toast("That fight wouldn't play on this version");return;}
  F.recorded=true;FT.rounds=[{F,log}];FT.rv=0;FT.bout=null;FT.rp=null;FT.ext={kind:"code",ver:d.ver};FT.sig=bnSig(d.bots[0].cfg);
  closeSheet();showTab("fight");if(d.ver!==VERSION)toast(`Made on v${String(d.ver).slice(0,12)}: it may play out a little differently here`);ftReplay(0);}
function rcCard(){return`<div class="card"><h3>Replay codes</h3><p>Got a code from a friend? Paste it to watch their fight and read its post-mortem. Share your own from any post-mortem.</p>
  <div class="row"><button type="button" class="btn" data-dl="watch">Watch a replay code</button></div></div>`;}

if(typeof document!=="undefined")document.addEventListener("click",e=>{const t=e.target;if(!t.closest)return;let x;
  if((x=t.closest("[data-dlbring]"))){DL.bring=x.dataset.dlbring;ftRender();return;}
  if((x=t.closest("[data-dl]"))){const a=x.dataset.dl;if(a==="go")dlStart();else if(a==="watch")rcWatchOpen();}});
