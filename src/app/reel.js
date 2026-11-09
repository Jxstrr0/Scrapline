/* ===================== app/reel.js: THE HIGHLIGHT REEL (0.1.27.0) =====================
   Your best moments, kept as you go (Kelbo: a season reel and a Highlights card). After each of your fights the game
   picks that round's best moment of yours (rlPick): an opponent into the pit or counted out, a part torn off, a flip,
   a big hit; a rival, a final or the championship add to its score. Career event fights (driven or quick-simmed) go
   into this season's five (cur) and the career's best three (best); at the season's end this season's five become last
   season's reel (last, lastY) and the season sheet offers it. Sandbox spars of your fitted bot keep their own five (sb).
   Spars in the career, the daily challenge and pasted codes aren't kept.
   A moment keeps the fight's log cut down to the clip's end (seed, arena, rules, bots, your inputs: no entries, the sim
   makes them again; about 1 KB, a few more when you drove), so it plays back through the replay (app/fight.js FT.rp,
   with FT.reel holding the list): each clip starts a few seconds before the moment, slows for it, and the next one
   follows. A moment saved on another version can play out differently: before a clip plays, the sim runs it and checks
   the moment still happens; if not, it is dropped (rlDrop) and the reel says so.
   S.reel (inside scr-save, SAVE_V 13): {m: {id: moment}, cur, last, best, sb: [ids], lastY, n}. A moment:
   {id, sc, what (pit|ko|part|flip|hit), title, sub, tf (the moment, s), t0, t1 (the clip), key {k, a, v} (the log entry
   that must happen again), y, mode, ver, log}.
     rlPick(F, ctx)     the round's best moment, or null      rlConsider(F, ctx)   keep it if it makes a list
     rlSeasonEnd(y)     this season's five become last season's          rlCareerReset()   a new career's lists start empty
     rlCard()           the Fight tab's Highlights card       rlPlay(ids, title)   the reel, in fight mode */
const REEL={keep:5,best:3,perEv:2,hitEn:70,hitTop:260,pre:3,post:2,koPost:3,match:0.3,gapMs:900,
  sc:{pit:72,ko:64,part:46,flip:32,hit:20,hitAdd:40,fast:18,won:10,rival:15,final:15,champ:10}};
const RL={t:0};   // UI only: the timer between clips
function rlState(){let R=S.reel;if(!buObjS(R)||!buObjS(R.m))R=S.reel={m:{},cur:[],last:[],best:[],sb:[],lastY:null,n:0};
  for(const k of["cur","last","best","sb"])if(!Array.isArray(R[k]))R[k]=[];return R;}
/* the round's best moment of yours (bot p, 0 by default): null when there isn't one worth keeping */
function rlPick(F,ctx){ctx=ctx||{};const p=ctx.p||0,me=F.bots[p].team,mm=Math.max(F.M.mass,1e-6),L=F.log,many=F.bots.filter(o=>!o.mini).length>2,C=REEL.sc;
  const opp=i=>i!=null&&i>=0&&!!F.bots[i]&&!F.bots[i].mini&&F.bots[i].team!==me;
  const mine=(v,t,win)=>{let h=null;for(const e of L){if(e.t>t+1e-6)break;if(e.a===p&&e.v===v&&(e.k==="hit"||e.k==="ram"||e.k==="grind"||e.k==="flip"||e.k==="tip")&&t-e.t<=win)h=e;}return h;};
  const won=F.winner!=null&&F.winner===me,out=[];
  for(const e of L){
    if((e.k==="pit"||e.k==="ko")&&opp(e.v)){const h=mine(e.v,e.t,e.k==="ko"?F.rules.koS+3:4);if(!h&&many)continue;   // in a rumble, only the ones you had a hand in
      const f=e.k==="ko"&&h?h.t:e.t;
      out.push({what:e.k,sc:C[e.k]+C.fast*Math.max(0,1-e.t/F.rules.roundS),tf:e.t,key:{k:e.k,v:e.v},t0:f-REEL.pre,t1:e.k==="ko"&&h?h.t+REEL.koPost:e.t+REEL.post,v:e.v});}
    else if(e.k==="fail"&&(e.what==="part"||e.what==="weapon")&&opp(e.v)){const h=mine(e.v,e.t,0.5);if(!h)continue;
      out.push({what:"part",sc:C.part,tf:e.t,key:{k:"fail",v:e.v},t0:h.t-REEL.pre,t1:e.t+REEL.post,v:e.v,part:e.key||"weapon"});}
    else if(e.k==="flip"&&e.a===p&&opp(e.v))out.push({what:"flip",sc:C.flip+(e.inv?10:0),tf:e.t,key:{k:"flip",a:p,v:e.v},t0:e.t-REEL.pre,t1:e.t+REEL.post,v:e.v});
    else if(e.k==="hit"&&e.a===p&&opp(e.v)&&(e.E||0)/mm>=REEL.hitEn)
      out.push({what:"hit",sc:C.hit+C.hitAdd*Math.min(1,(e.E/mm)/REEL.hitTop),tf:e.t,key:{k:"hit",a:p,v:e.v},t0:e.t-REEL.pre,t1:e.t+REEL.post,v:e.v,E:e.E});}
  if(!out.length)return null;
  for(const c of out){if(won)c.sc+=C.won;if(ctx.rival&&ctx.rival[c.v])c.sc+=C.rival;if(ctx.final)c.sc+=C.final;if(ctx.champ)c.sc+=C.champ;}
  const m=out.reduce((a,c)=>c.sc>a.sc?c:a);   // the first of the best
  const end=F.endT!=null?F.endT:F.t;m.t0=Math.max(0,m.t0);m.t1=Math.min(end,m.t1);
  const o=F.bots[m.v],on=o?o.name:"them",T="at "+ftT(m.tf);m.vs=on;
  m.title=m.what==="pit"?`${on} into the pit`:m.what==="ko"?`${on} counted out`:m.what==="part"?`Tore off ${on}'s ${m.part==="weapon"?"weapon":SIM.benchPartName(o.b,m.part)}`
    :m.what==="flip"?`Flipped ${on}`:`Big hit on ${on}: ${Math.round(m.E)} J`;
  m.sub=[ctx.ev?ctx.ev+(ctx.label&&ctx.label!=="fight"?", "+ctx.label:""):"Sparring",ctx.y?String(ctx.y):"",T].filter(Boolean).join(" · ");
  m.sc=Math.round(m.sc*10)/10;delete m.v;delete m.E;delete m.part;return m;}
/* the fight's log cut down to the clip: the steps and your inputs stop at its end (the inputs run at 30 a second) */
function rlLog(F,t1){const L=SIM.fightResult(F).log;if(L.noReplay)return null;const steps=Math.min(L.steps,Math.ceil(t1*SIM.STEP_HZ)+2),ticks=Math.ceil(steps/2)+2,inputs={};
  for(const k in L.inputs||{}){const u=SIM.unpackInputs(L.inputs[k]),n=Math.min(u.n,ticks);inputs[k]=SIM.packInputs({v:u.ch.map(a=>Array.from(a.subarray(0,n)))});}
  return JSON.parse(JSON.stringify({seed:L.seed,arena:L.arena,rules:L.rules||{},steps,bots:L.bots,inputs}));}
/* keep a moment in a list if it makes it: best first, at most perEv from one event (or against one opponent, in the Sandbox), then cut to the cap */
function rlFits(R,list,m,cap){const L=list.map(id=>R.m[id]).filter(Boolean).concat([m]).sort((a,b)=>b.sc-a.sc),per={},out=[];
  for(const x of L){const k=x.evk||x.id;if(x.evk&&(per[k]|0)>=REEL.perEv)continue;per[k]=(per[k]|0)+1;out.push(x);if(out.length>=cap)break;}
  return out;}
function rlGc(R){const keep=new Set([].concat(R.cur,R.last,R.best,R.sb));for(const id in R.m)if(!keep.has(id))delete R.m[id];
  for(const k of["cur","last","best","sb"])R[k]=R[k].filter(id=>R.m[id]);}
/* a finished round of yours: keep its best moment if it makes this season's five, the career's best or the Sandbox's five.
   ctx: {p, ev (event name), key (the event's, year:id), label, y, wk, rival {bot index: true}, final, champ}. The caller saves. */
function rlConsider(F,ctx){if(TUT_ON||!F||F.reason==="stopped")return;ctx=ctx||{};let m=null;try{m=rlPick(F,ctx);}catch(e){return;}if(!m)return;
  const R=rlState(),car=S.mode==="career"&&crOn(),lists=car?[["cur",REEL.keep],["best",REEL.best]]:[["sb",REEL.keep]];
  m.id="m"+((R.n=(R.n|0)+1));m.evk=ctx.key||(ctx.ev?`${ctx.y}:${ctx.ev}`:"vs:"+m.vs);m.y=ctx.y||null;m.mode=car?"career":"sandbox";m.ver=VERSION;
  const hit=lists.filter(([k,cap])=>rlFits(R,R[k],m,cap).indexOf(m)>=0);if(!hit.length)return;
  const log=rlLog(F,m.t1);if(!log)return;m.log=log;R.m[m.id]=m;
  for(const [k,cap] of hit)R[k]=rlFits(R,R[k],m,cap).map(x=>x.id);
  rlGc(R);}
function rlSeasonEnd(y){const R=rlState();R.last=R.cur;R.lastY=y;R.cur=[];rlGc(R);}
function rlCareerReset(){const R=rlState();R.cur=[];R.last=[];R.best=[];R.lastY=null;rlGc(R);}
function rlDrop(id){const R=rlState();for(const k of["cur","last","best","sb"])R[k]=R[k].filter(x=>x!==id);rlGc(R);save();}

/* ---- the Highlights card (Fight tab) and the season sheet's button ---- */
function rlRows(ids){const R=rlState();return`<ul class="rllist">${ids.map(id=>R.m[id]).filter(Boolean).map(m=>`<li><span class="nm"><b>${esc(m.title)}</b><small>${esc(m.sub)}</small></span>
    <button type="button" class="btn sm" data-rl="one" data-id="${m.id}" aria-label="Watch: ${esc(m.title)}">Watch</button></li>`).join("")}</ul>`;}
function rlCard(){const R=rlState(),car=S.mode==="career";let h="";
  const block=(t,ids,k,btn)=>ids.length?`<div class="rlsec"><div class="rlhd"><h4>${t}</h4>${ids.length>1?`<button type="button" class="btn sm pri" data-rl="${k}">${btn}</button>`:""}</div>${rlRows(ids)}</div>`:"";
  if(car){h=block("This season",R.cur,"cur","Watch all")+block(`${R.lastY||"Last season"}'s reel`,R.last,"last","Watch the reel")+block("Career best",R.best,"best","Watch all");}
  else h=block("Your best spars",R.sb,"sb","Watch all");
  return`<div class="card" id="rlCard"><h3>Highlights</h3>${h||`<p class="hint">${car?"Knockouts, pit falls, parts torn off and big hits from your event fights land here: the best five of each season, played back in slow motion. At the end of the season they become its reel.":"Knockouts, pit falls, parts torn off and big hits from your spars land here: your best five, played back in slow motion."}</p>`}</div>`;}
const rlSheetBtn=()=>{const R=rlState();return R.last.length?`<div class="row"><button type="button" class="btn pri" data-rl="last">Watch the ${R.lastY||""} reel</button></div>`:"";};

/* ---- playing the reel: one clip after another through the replay ---- */
function rlPlay(ids,title){if(FT.on)return;if(FT.bout&&FT.bout.ev&&!FT.bout.over){toast("Finish the fight first");return;}
  const R=rlState(),list=ids.map(id=>R.m[id]).filter(m=>m&&m.log);if(!list.length)return;
  if(sheetOn())closeSheet();if(curTab!=="fight")showTab("fight");
  FT.reel={list,k:-1,title,dropped:0,speed:1};rlNext();}
/* the clip, run and checked: the sim plays the moment's fight to the clip's end and the moment has to happen again */
function rlClip(m){try{const log=m.log,s0=Math.max(0,Math.round(m.t0*SIM.STEP_HZ)),s1=Math.min(log.steps,Math.max(s0+1,Math.round(m.t1*SIM.STEP_HZ)));
    const G=ftRpFight(log,s1),k=m.key;
    if(!G.log.some(e=>e.k===k.k&&e.v===k.v&&(k.a==null||e.a===k.a)&&Math.abs(e.t-m.tf)<=REEL.match))return null;
    const F=ftRpFight(log,s0);return{F,s0,s1,slow:ftSlowPlan({entries:G.log},F.M.mass)};}catch(e){return null;}}
function rlNext(){const R=FT.reel;if(!R)return;clearTimeout(RL.t);if(FT.rp)R.speed=FT.rp.speed;
  while(++R.k<R.list.length){const m=R.list[R.k],c=rlClip(m);
    if(c){FT.rp={i:-1,log:m.log,steps:c.s1,s0:c.s0,speed:R.speed,slow:c.slow,reel:true};FT.you=false;ftGo(c.F);return;}
    R.dropped++;rlDrop(m.id);R.list.splice(R.k,1);R.k--;}
  if(FT.on)rlDone();else{FT.reel=null;toast("Those moments play out differently on this version, so they were dropped");ftRender();}}
/* a clip has run out: the next one after a breath, or the end card */
function rlClipEnd(){const R=FT.reel;if(!R)return;clearTimeout(RL.t);
  if(R.k<R.list.length-1){RL.t=setTimeout(()=>{if(FT.reel===R&&FT.on&&FT.F&&FT.F.over)rlNext();},REEL.gapMs);return;}
  rlDone();}
function rlDone(){const R=FT.reel,e=$("fEnd");if(!R||!e)return;
  $("fEndT").textContent=R.list.length?"That's the reel":"Nothing to show";$("fEndT").className="";
  $("fEndS").textContent=R.dropped?`${R.dropped} moment${R.dropped>1?"s":""} played out differently on this version, so ${R.dropped>1?"they were":"it was"} dropped.`:`${R.list.length} moment${R.list.length===1?"":"s"}. ${R.title||""}`;
  $("fEndBtns").innerHTML=`${R.list.length?'<button type="button" class="btn pri" data-fv="rlagain">Watch again</button>':""}<button type="button" class="btn${R.list.length?"":" pri"}" data-fv="results">Close</button>`;
  e.hidden=false;const b=e.querySelector(".btn.pri");if(b)b.focus({preventScroll:true});}
function rlAgain(){const R=FT.reel;if(!R)return;const e=$("fEnd");if(e)e.hidden=true;R.k=-1;rlNext();}
/* the line over the replay bar: which clip, what and where */
function rlBanner(){const R=FT.reel,m=R&&R.list[R.k];if(!m)return"";
  return`<div class="freel" id="fReel" role="status"><b>${esc(m.title)}</b><small><span class="readout">${R.k+1}/${R.list.length}</span> · ${esc(m.sub)}</small></div>`;}
document.addEventListener("click",e=>{const b=e.target.closest("[data-rl]");if(!b)return;const R=rlState(),a=b.dataset.rl;
  if(a==="one")rlPlay([b.dataset.id],"");
  else if(a==="cur")rlPlay(R.cur,"This season's best.");
  else if(a==="last")rlPlay(R.last,`The ${R.lastY||"last"} season's reel.`);
  else if(a==="best")rlPlay(R.best,"Your career's best.");
  else if(a==="sb")rlPlay(R.sb,"Your best spars.");});
