/* ===================== app/fight.js: the Fight tab (sparring) =====================
   Sparring: your fitted bot in the class you're building against any opponent in that class (a named one from
   SIM.OPPONENTS with its own driver, or a test build), in any arena (the class's own first), one on one or a four-bot
   rumble, or a best of three with a pit window between rounds (app/pit.js: you fix your bot under a 60 s clock with the
   kit you picked; their crew fixes theirs; damage carries from round to round). You drive it yourself (app/controls.js)
   or hand it to SCRAP_SIM's AI in a style you pick and watch. No stakes and nothing saved: free practice, before the
   career and during it (Kelbo, PR 7). A career event's bouts (app/career.js) run here too: ftEvent starts one with the
   day's damage, the bell hands the result straight to the career, and the pit window after it carries to the next fight. After the bell: the post-mortem (app/report.js) and Replay, which re-runs the sim
   from the log (seed, builds, your recorded inputs) in the same arena view; the scrub bar jumps by re-running the sim
   from the start to that moment (a round is a few thousand steps, a blink), so it works on every tier.
   Fight mode: the 3D view grows to fill the screen (#app.fighting hides the panel and the tab bar) and an overlay (#fov)
   carries the clock, a strip per bot (damage silhouette, weapon speed, battery, heat), the controls, Pause and a 2D
   toggle (app/debugview.js's top-down view, also the fallback where WebGL isn't there). At the bell a banner offers a
   rematch or the results: who won and how, the judges' table, every bot's state, and the fight log in words.
   Feedback: the sim's fx events go to SCRAP_VIS (sparks, shake, a part flying off when one is destroyed), SCRAP_SOUND
   (clangs and motor whine, if Settings → Sound is on) and buzz() (scaled by the hit, only for hits on or by you).
   The frame loop steps the sim at its fixed 60 Hz with an accumulator clamped to 5 steps a frame, so a stall never
   fast-forwards the round, and pauses when the page is hidden (visibilitychange). The 2D view draws at 30 fps on Lite. */
const FT={F:null,opp:"wedge",arena:"auto",style:"you",mode:"duel",kit:"basic",rounds:[],rv:0,bout:null,rp:null,speed:1,paused:false,raf:0,last:0,lastDraw:0,acc:0,flashes:[],logN:0,hudT:0,fights:0,
  you:false,on:false,view2d:false,partN:0,buzzT:0};
const ftArena=cls=>FT.arena==="auto"?SIM.CLASSES[cls].arenaId:FT.arena;
const ftAuto=(cfg,cls)=>SIM.autoStyle(SIM.evalBuild(cfg),ftArena(cls));
const ftGL=()=>!!(window.SCRAP_VIS&&SCRAP_VIS._state&&SCRAP_VIS._state.r);
/* the opponent picked: a named one in this class, else a test build */
function ftOpp(cls,id){id=id||FT.opp;const op=SIM.OPPONENTS.find(o=>o.id===id&&o.cls===cls);
  if(op)return{id,name:op.name,cfg:SIM.opponentCfg(op),driver:Object.assign({},op.driver),op};
  const t=SIM.TEST_BUILDS.find(x=>x.id===id)||SIM.TEST_BUILDS[0],cfg=Object.assign({},t.cfg,{cls});
  return{id:t.id,name:t.name,cfg,driver:{style:"auto",skill:0.7}};}
/* a rumble's other two bots: picked from the class's named opponents and the test builds by the seed */
function ftRumble(cls,seed,skip){const pool=SIM.OPPONENTS.filter(o=>o.cls===cls).map(o=>o.id).concat(SIM.TEST_BUILDS.filter(t=>t.id!=="sloppy").map(t=>t.id)).filter(id=>id!==skip),out=[];
  let k=seed>>>3;while(out.length<2&&pool.length){const id=pool.splice(k%pool.length,1)[0];out.push(ftOpp(cls,id));k=(k*2654435761>>>7)+1;}return out;}

function ftStart(){const bot=bBot(),cls=bCls();if(!bot.cfg)return;
  const opp=ftOpp(cls),you=FT.style==="you";
  const seed=((Date.now()&0x7fffffff)^(++FT.fights*0x9E3779B1))>>>0;   // the app picks the seed; the sim is deterministic from it
  const bots=[{cfg:bot.cfg,name:"You",driver:you?null:{style:FT.style,skill:0.7}},{cfg:opp.cfg,name:opp.name,driver:opp.driver}];
  if(FT.mode==="rumble")for(const o of ftRumble(cls,seed,opp.id))bots.push({cfg:o.cfg,name:o.name,driver:o.driver});
  FT.you=you;FT.sig=bnSig(bot.cfg);FT.rounds=[];FT.rv=0;FT.rp=null;
  const kit=()=>Object.assign({},PIT_KITS[FT.kit].allow);
  FT.bout=FT.mode==="bo3"?{seed,bots,kit:FT.kit,wins:{0:0,1:0},n:0,dmg:[{},{}],flags:[{},{}],left:[kit(),kit()],pits:[],over:false}:null;
  ftGo(SIM.newFight({seed,fx:true,arena:ftArena(cls),bots}));}
/* a fight (a round, or a replay) into fight mode */
function ftGo(F){FT.F=F;FT.flashes=[];FT.logN=0;FT.acc=0;FT.paused=false;FT.last=performance.now();FT.partN=0;FT.flung={};ftFrame.done=null;
  ftEnter();ftLoop();}
/* a finished round goes into the list the results show; in a best of three it scores and carries its damage */
function ftRecord(F){if(F.recorded||FT.rp)return;F.recorded=true;FT.rounds.push({F,log:null});FT.rv=FT.rounds.length-1;const B=FT.bout;if(!B)return;if(B.ev)F.ev=true;
  F.bots.forEach((o,i)=>{if(o.mini)return;B.dmg[i]=SIM.damageTaken(o.b,o.st);B.flags[i]={bent:!!o.flags.bent,smoke:!!o.flags.smoke,cell:!!o.flags.cell,esc:o.flags.esc||null};});   // a stopped round's damage counts too (an event takes it home)
  if(F.reason==="stopped"){B.over=true;B.stopped=true;ftEvDone(B,F);return;}
  B.n++;if(F.winner!=null)B.wins[F.winner]=(B.wins[F.winner]||0)+1;
  const need=B.need||2,max=B.max||3;if(Object.keys(B.wins).some(t=>B.wins[t]>=need)||B.n>=max)B.over=true;
  ftEvDone(B,F);}
/* a career event's bout is over (or stopped): the career records it at once and hands back the bell's banner */
function ftEvDone(B,F){if(B.over&&B.ev&&!B.reported){B.reported=true;B.banner=B.ev.onDone(B,F);}}
function ftBoutWinner(B){const a=B.wins[0]||0,b=B.wins[1]||0;return a>b?0:b>a?1:null;}
/* the pit between rounds: you fix yours (PIT.open), their crew fixes theirs (pitAuto), then the next round */
function ftPit(){const B=FT.bout,F=FT.F;if(!B||B.over)return;const e=$("fEnd");if(e)e.hidden=true;
  const theirs=pitAuto(F.bots[1].b,B.dmg[1],B.flags[1],B.left[1]);
  if(!PIT_KITS[B.kit]){B.pits.push({mine:[],lost:null,theirs});ftNextRound();return;}   // an event entered with no kit: nothing to work with
  PIT.open({host:$("fov"),b:F.bots[0].b,dmg:B.dmg[0],flags:B.flags[0],kit:B.kit,left:B.left[0],title:`Pit window · round ${B.n+1} next`,
    onDone:r=>{B.pits.push({mine:r.done,lost:r.lost,theirs});ftNextRound();}});}
function ftNextRound(){const B=FT.bout;const seed=B.ev?B.ev.seedN(B.n):(B.seed+Math.imul(B.n,0x9E3779B1))>>>0;
  const bots=B.bots.map((b,i)=>Object.assign({},b,{damage:clone(B.dmg[i]),flags:Object.assign({},B.flags[i])}));
  ftGo(SIM.newFight({seed,fx:true,arena:B.ev?B.ev.arena:ftArena(FT.F.cls),rules:B.ev?B.ev.rules:undefined,bots}));
  const t=B.pits[B.pits.length-1].theirs;toast(`${FT.F.bots[1].name}'s crew: ${t.length?t.map(x=>PIT_NAMES[x.kind].toLowerCase()).join(", "):"nothing to fix"}`);}
/* ---- career events (app/career.js) ----
   ftEvent(o): one of your bouts at an event, driven by you. o: {bots (newFight specs, with the day's damage), seed,
   seedN(n) (round n's seed), arena, rules (the season's, app/team.js crFightRules), bo (1 or 3), teams, kit, left (each bot's kit counts, shared with the day), label,
   title, onDone(B, F) (records it; returns the bell's banner {t, s, cls, pit}), pit() (the pit window after the bout
   when you have another fight: {dmg, flags, kit, left, title}, or null)}. */
function ftEvent(o){const cls=o.bots[0].cfg.cls,bot=bBot(cls);FT.you=true;FT.sig=bnSig(bot.cfg);FT.rounds=[];FT.rv=0;FT.rp=null;
  FT.bout={seed:o.seed,bots:o.bots,kit:o.kit,wins:{},n:0,dmg:o.bots.map(b=>clone(b.damage||{})),flags:o.bots.map(b=>Object.assign({},b.flags||{})),left:o.left,pits:[],over:false,need:Math.ceil(o.bo/2),max:o.bo,ev:o};
  ftGo(SIM.newFight({seed:o.seed,fx:true,arena:o.arena,rules:o.rules,bots:o.bots}));}
/* a quick-simmed bout's fights, to look at on the Fight tab (results, post-mortem, replay) */
function ftShowSim(Fs,res,day,nx){FT.rounds=Fs.map(F=>{F.recorded=true;F.ev=true;return{F,log:null};});FT.rv=Fs.length-1;FT.rp=null;FT.sig=bnSig(bBot(day.cls).cfg);
  FT.bout=nx.bo>1?{wins:res.wins,n:Fs.length,over:true,pits:[],stopped:false}:null;}
function ftEvPit(){const B=FT.bout,sp=B&&B.ev&&B.ev.pit(),F=FT.F;if(!sp){ftEvBack();return;}const e=$("fEnd");if(e)e.hidden=true;
  PIT.open({host:$("fov"),b:F.bots[0].b,dmg:sp.dmg,flags:sp.flags,kit:sp.kit,left:sp.left,title:sp.title,onDone:()=>{save();ftEvBack();}});}
function ftEvBack(){ftExit();showTab("career");}
/* the round shown on the results card */
const ftShown=()=>FT.rounds[FT.rv]?FT.rounds[FT.rv].F:null;
/* ---- replay: the same fight again from its log ---- */
const ftReplayOk=F=>{const R=FT.rounds.find(x=>x.F===F);if(!R)return false;if(!R.log)R.log=SIM.fightResult(F).log;return!R.log.noReplay;};
function ftRpFight(log,n){const play={};for(const k in log.inputs||{})play[k]=SIM.unpackInputs(log.inputs[k]);
  const F=SIM.newFight({seed:log.seed,arena:log.arena,rules:log.rules,bots:log.bots,play,fx:true});F.fxq=null;
  while(F.n<n&&!F.over)SIM.stepFight(F,null);F.fxq=[];
  if(F.n>=log.steps&&!F.over){F.over=true;F.endT=F.t;F.reason="stopped";}   // a jump to the end of a stopped round ends there
  return F;}
function ftReplay(i){const R=FT.rounds[i];if(!R||!ftReplayOk(R.F))return;
  FT.rp={i,log:R.log,steps:R.log.steps,speed:1};FT.you=false;ftGo(ftRpFight(R.log,0));}
function ftSeek(n){const rp=FT.rp;if(!rp)return;const F=ftRpFight(rp.log,Math.max(0,Math.min(rp.steps,n|0)));
  FT.F=F;FT.flashes=[];FT.partN=F.log.length;FT.flung={};FT.acc=0;FT.last=performance.now();ftFrame.done=null;
  const e=$("fEnd");if(e)e.hidden=true;
  if(ftGL())SCRAP_VIS.setFight(F,true);if(FT.view2d)DEBUGVIEW.draw($("fCv"),F,[],performance.now());
  ftOverlay();ftLoop();}
function ftLoop(){if(!FT.raf)FT.raf=requestAnimationFrame(ftFrame);}
function ftPause(on){const F=FT.F;if(!F||F.over)return;FT.paused=on;if(on)SCRAP_SOUND.stop();else{FT.last=performance.now();FT.acc=0;ftLoop();}
  const p=$("fPause");if(p){p.hidden=!on||!!FT.rp;if(on){const r=p.querySelector("[data-fv=resume]");if(r)r.focus({preventScroll:true});}}const b=document.querySelector('[data-fv="pause"]');if(b)b.setAttribute("aria-pressed",on);if(FT.on)ftOverlay();}
function ftFrame(now){FT.raf=0;const F=FT.F;if(!F)return;
  if(curTab!=="fight"||document.hidden){if(!F.over&&!FT.paused)ftPause(true);return;}
  if(!FT.paused&&!F.over){let dt=(now-FT.last)/1000;FT.last=now;if(!(dt>0))dt=0;FT.acc+=Math.min(dt,0.25)*(FT.rp?FT.rp.speed:FT.you?1:FT.speed);
    let k=0;while(FT.acc>=1/60&&k<5&&!F.over){SIM.stepFight(F,FT.you&&FT.on&&!FT.rp?{0:CONTROLS.read(F,F.bots[0])}:null);FT.acc-=1/60;k++;
      if(FT.rp&&F.n>=FT.rp.steps&&!F.over){F.over=true;F.endT=F.t;if(!F.reason)F.reason="stopped";}}   // a stopped fight's replay ends where it was stopped
    if(k===5)FT.acc=Math.min(FT.acc,1/60);   // clamped: a slow frame loses time instead of catching up
    ftFeedback(now);}
  FT.flashes=FT.flashes.filter(f=>now-f.t0<500);
  if(FT.on&&FT.view2d&&(gfxTier()!=="lite"||now-FT.lastDraw>=31||F.over)){DEBUGVIEW.draw($("fCv"),F,FT.flashes,now);FT.lastDraw=now;}
  if(now-FT.hudT>120||F.over){FT.hudT=now;ftOverlay();}
  if(F.over&&ftFrame.done!==F){ftFrame.done=F;ftEnd();}
  if((!FT.paused&&!F.over)||FT.flashes.length)ftLoop();}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&FT.F&&!FT.F.over&&!FT.paused)ftPause(true);});

/* ---- feedback: sparks and shake (SCRAP_VIS), clangs (SCRAP_SOUND), buzz ---- */
function ftFeedback(now){const F=FT.F,q=F.fxq,mm=Math.max(F.M.mass,1e-6),snd=ST().sound!==false,me=F.bots[0];
  if(q&&q.length){const ev=[];let bz=0;
    for(const e of q){const En=(e.E||0)/mm;if(e.k==="ram"&&En<=2)continue;FT.flashes.push(Object.assign({t0:now},e));ev.push(e);
      if(snd&&(e.k!=="land"||En>4))SCRAP_SOUND.hit(Math.sqrt(Math.min(1,En/140)),e.k==="hit"||e.k==="flip"?"hit":e.k);
      const mine=e.v===0||F.bots.filter(o=>!o.mini).length===2||Math.hypot(e.x-me.x,e.y-me.y)<me.rad*1.5;
      if(mine&&(e.k==="hit"||e.k==="flip"||e.k==="haz"||En>20))bz=Math.max(bz,Math.round(12+40*Math.min(1,En/140)));}
    if(bz&&now-FT.buzzT>140){FT.buzzT=now;buzz(bz);}
    if(FT.on&&!FT.view2d)SCRAP_VIS.fx(ev);q.length=0;}
  /* a destroyed part or a broken plate flies off */
  const L=F.log,parts=[];for(let n=FT.partN;n<L.length;n++){const e=L[n];
    let key=null;if(e.k==="fail"&&(e.what==="part"||e.what==="weapon"))key=e.key||"weapon";
    else if((e.k==="hit"||e.k==="grind"||e.k==="haz")&&e.pb)key="armour_"+e.f;
    if(key&&!FT.flung[e.v+":"+key]){FT.flung[e.v+":"+key]=1;parts.push({k:"part",v:e.v,key});}}   // each part flies off once
  FT.partN=L.length;if(parts.length&&FT.on&&!FT.view2d)SCRAP_VIS.fx(parts);}

/* ---- fight mode: the overlay on the 3D view ---- */
function ftEnter(){const F=FT.F;FT.on=true;FT.view2d=!ftGL();$("app").classList.add("fighting");
  document.documentElement.classList.add("infight");   // no backup reminder or update bar over a fight (savecode.js, css)
  const old=$("fov");if(old)old.remove();
  const el=document.createElement("div");el.id="fov";el.className="fov";
  el.innerHTML=`<div class="fovtop"><span class="fclock readout" id="fClock" role="timer" aria-label="Round clock">${ftT(F.rules.roundS)}</span><span class="fnote" id="fNote" role="status" aria-live="polite"></span>
      ${ftGL()?`<button type="button" class="fbtn" data-fv="2d" aria-pressed="${FT.view2d}">2D</button>`:""}${FT.rp?'<button type="button" class="fbtn" data-fv="results">Close</button>':'<button type="button" class="fbtn" data-fv="pause" aria-pressed="false">Pause</button>'}</div>
    <div class="fbots" id="fBots">${F.bots.filter(o=>!o.mini).map(o=>`<div class="fbot" data-i="${o.i}"><canvas class="fsil" width="44" height="44" aria-hidden="true"></canvas><div class="fbinfo"><b style="color:${DV_COL.bots[o.i%DV_COL.bots.length]}">${esc(o.name)}</b>
      <span class="fbar" title="weapon"><i data-b="w"></i></span><span class="fbar" title="battery"><i data-b="bat"></i></span><span class="fbar" title="heat"><i data-b="heat"></i></span><small data-b="st"></small></div></div>`).join("")}</div>
    <canvas id="fCv" class="fcv" role="img" aria-label="Top-down view of the fight"${FT.view2d?"":" hidden"}></canvas>
    <div class="fpause" id="fPause" hidden><p>Paused</p><div class="row"><button type="button" class="btn pri" data-fv="resume">Resume</button><button type="button" class="btn" data-fv="quit">${FT.bout&&FT.bout.ev?"Forfeit":"Stop the fight"}</button></div></div>
    <div class="fend" id="fEnd" hidden role="alertdialog" aria-labelledby="fEndT"><b id="fEndT"></b><p id="fEndS"></p><div class="row" id="fEndBtns"></div></div>
    ${FT.rp?`<div class="frp" id="fRp"><button type="button" class="fbtn" data-fv="rpplay" aria-pressed="false">Pause</button>
      <input type="range" id="fRpPos" min="0" max="${FT.rp.steps}" step="15" value="0" aria-label="Replay position"><span class="readout" id="fRpT">${ftT(FT.F.rules.roundS)}</span>
      <button type="button" class="fbtn" data-fv="rpspeed" aria-label="Replay speed">1×</button></div>`:""}`;
  $("view").appendChild(el);el.addEventListener("click",ftOvClick);
  const pos=$("fRpPos");if(pos){pos.addEventListener("pointerup",()=>{if(FT.rp)FT.rp.drag=false;});pos.addEventListener("blur",()=>{if(FT.rp)FT.rp.drag=false;});
    pos.addEventListener("input",()=>{FT.rp.drag=true;$("fRpT").textContent=ftT(Math.max(0,FT.F.rules.roundS-pos.value/SIM.STEP_HZ));});
    pos.addEventListener("change",()=>{FT.rp.drag=false;ftSeek(+pos.value);});}
  SCRAP_VIS.setRun({reduce:reduced()});
  if(ftGL()){SCRAP_VIS.setFight(F);SCRAP_VIS.setView("arena");}
  if(FT.you)CONTROLS.mount(el);
  ftOverlay();}
function ftExit(){FT.on=false;PIT.close();CONTROLS.unmount();if(FT.rp){FT.rp=null;FT.F=ftShown();}SCRAP_SOUND.stop();$("app").classList.remove("fighting");document.documentElement.classList.remove("infight");const el=$("fov");if(el)el.remove();
  if(window.SCRAP_VIS){SCRAP_VIS.setView("workshop");SCRAP_VIS.setFight(null);}
  ftRender();const r=$("ftResCard");if(r)r.scrollIntoView({block:"start"});}
function ftOvClick(e){const b=e.target.closest("[data-fv]");if(!b)return;const a=b.dataset.fv,F=FT.F;
  if(a==="pause")ftPause(!FT.paused);
  else if(a==="resume")ftPause(false);
  else if(a==="quit"){const ev=FT.bout&&FT.bout.ev;if(F&&!F.over){FT.paused=false;F.over=true;F.endT=F.t;F.reason="stopped";ftRecord(F);}if(ev)ftEvBack();else ftExit();}
  else if(a==="evpit")ftEvPit();
  else if(a==="evback")ftEvBack();
  else if(a==="again"){ftExit();ftStart();}
  else if(a==="pit")ftPit();
  else if(a==="endbout"){const B=FT.bout;if(B&&!B.over){B.over=true;B.stopped=true;ftEvDone(B,F);}if(B&&B.ev)ftEvBack();else ftExit();}
  else if(a==="rpagain")ftSeek(0);
  else if(a==="rpplay"){if(F.over){ftSeek(0);return;}ftPause(!FT.paused);b.textContent=FT.paused?"Play":"Pause";b.setAttribute("aria-pressed",FT.paused);}
  else if(a==="rpspeed"){const sp=[1,2,0.5],k=(sp.indexOf(FT.rp.speed)+1)%sp.length;FT.rp.speed=sp[k];b.textContent=(sp[k]===0.5?"½":sp[k])+"×";}
  else if(a==="results")ftExit();
  else if(a==="2d"){FT.view2d=!FT.view2d;b.setAttribute("aria-pressed",FT.view2d);$("fCv").hidden=!FT.view2d;if(FT.view2d)DEBUGVIEW.draw($("fCv"),F,[],performance.now());}}
/* the strip per bot, the clock and the notes, a few times a second */
function ftOverlay(){const F=FT.F;if(!F||!FT.on)return;
  if(FT.rp&&!FT.rp.drag){const p=$("fRpPos"),t=$("fRpT");if(p)p.value=F.n;if(t)t.textContent=ftT(Math.max(0,F.rules.roundS-F.t));const pb=document.querySelector('[data-fv="rpplay"]');if(pb){const l=F.over?"Again":FT.paused?"Play":"Pause";if(pb.textContent!==l)pb.textContent=l;}}const snd=ST().sound!==false&&!FT.paused&&!F.over;
  const c=$("fClock");if(c)c.textContent=ftT(Math.max(0,F.rules.roundS-F.t));
  F.bots.forEach((o,i)=>{const el=document.querySelector(`.fbot[data-i="${i}"]`);if(!el){if(o.mini&&FT.on&&!FT.view2d)SCRAP_VIS.damage(i,SIM.partStates(o.b,o.st));return;}   // a minibot has no strip, but greys in the arenaconst w=o.b.weapon,h=o.b.heat,states=SIM.partStates(o.b,o.st);
    const bat=o.b.power.batteryWs>0?o.bat/o.b.power.batteryWs:0,heat=Math.max(h.drive.budgetJ>0?o.heat.d/h.drive.budgetJ:0,h.weapon&&h.weapon.budgetJ>0?o.heat.w/h.weapon.budgetJ:0);
    const ws=!o.fx.weaponOk?0:w.type==="spinner"||w.type==="saw"?o.wp.om/(w.omega||1):w.type==="flipper"?o.wp.shots/(w.shots||1):w.type==="none"||w.type==="wedge"?0:1;
    const set=(k,v,lo)=>{const x=el.querySelector(`[data-b="${k}"]`);if(x){x.style.width=Math.round(Math.max(0,Math.min(1,v))*100)+"%";x.classList.toggle("lo",!!lo);}};
    set("w",ws,!o.fx.weaponOk);set("bat",bat,bat<0.2);set("heat",heat,heat>0.85);
    const st=o.out?(o.out==="ko"?"counted out":"in the pit"):o.fx.dead?"dead":o.flat?"battery flat":o.immobileS>0?`immobile ${Math.ceil(F.rules.koS-o.immobileS)}`:o.inverted?"upside down":o.held!=null?"lifted":o.under?"under a wedge":"";
    const sx=el.querySelector('[data-b="st"]');if(sx&&sx.textContent!==st)sx.textContent=st;el.classList.toggle("out",!!o.out);
    ftSil(el.querySelector(".fsil"),o,states);
    if(FT.on&&!FT.view2d)SCRAP_VIS.damage(i,states);
    if(snd&&i<4)SCRAP_SOUND.whine(i,o.out?0:o.wp.om/(w.omega||1),o.out?0:Math.hypot(o.vx,o.vy)/Math.max(o.b.driveSpeed||1,0.1));});
  const n=$("fNote");if(n){const me=F.bots[0],t=F.arena.pit&&!SIM.pitOpen(F)?`Pit opens ${ftT(F.arena.pit.openS)}`:"";
    const s=FT.you&&me.release>F.t?"Pin limit: backing off":FT.you&&me.inverted&&!me.b.height.drivesInverted&&me.fx.righter?"Upside down: self-right":t;if(n.textContent!==s)n.textContent=s;}
  if(!snd)SCRAP_SOUND.stop();}
/* a bot's damage silhouette: the faces as its outline, the parts as dots where the layout put them, green / amber / cool red */
const FT_SC={intact:"#4CC38A",damaged:"#E2A93B",destroyed:"#E5484D"};
function ftSil(cv,o,states,W){if(!cv)return;W=W||44;const g=cv.getContext("2d"),k=W/44,b=o.b,s=36*k/Math.max(b.widthM,b.lengthM),hw=b.widthM/2*s,hl=b.lengthM/2*s,cx=W/2,cy=W/2;
  g.clearRect(0,0,W,W);g.lineWidth=3*k;g.lineCap="round";
  const face=(k,x0,y0,x1,y1)=>{g.strokeStyle=FT_SC[states["armour_"+k]||"intact"];g.globalAlpha=b.armourMapJ[k]&&b.armourMapJ[k].id!=="none"?1:0.35;g.beginPath();g.moveTo(cx+x0,cy+y0);g.lineTo(cx+x1,cy+y1);g.stroke();};
  face("front",-hw,-hl,hw,-hl);face("back",-hw,hl,hw,hl);face("left",-hw,-hl,-hw,hl);face("right",hw,-hl,hw,hl);g.globalAlpha=1;
  g.fillStyle=FT_SC[states.chassis||"intact"];g.globalAlpha=0.18;g.fillRect(cx-hw,cy-hl,2*hw,2*hl);g.globalAlpha=1;
  for(const p of b.parts){if(!p.pos)continue;g.fillStyle=FT_SC[states[p.key]||"intact"];g.beginPath();g.arc(cx+p.pos[0]*s,cy-p.pos[1]*s,(p.key==="weapon"?3:2.2)*k,0,7);g.fill();}}
function ftEnd(){const F=FT.F;SCRAP_SOUND.stop();CONTROLS.unmount();if(!FT.rp)buzz([20,40,20]);ftRecord(F);
  const e=$("fEnd");if(!e||!FT.on)return;const B=FT.bout;let r=ftResult(F),btns='<button type="button" class="btn pri" data-fv="again">Rematch</button><button type="button" class="btn" data-fv="results">Results</button>';
  if(FT.rp){r={t:"Replay: "+r.t,s:r.s,cls:r.cls};btns='<button type="button" class="btn pri" data-fv="rpagain">Watch again</button><button type="button" class="btn" data-fv="results">Close</button>';}
  else if(B&&B.ev&&B.over&&B.banner){const x=B.banner;r={t:x.t,s:x.s,cls:x.cls};
    btns=x.pit?'<button type="button" class="btn pri" data-fv="evpit">To the pit</button><button type="button" class="btn" data-fv="evback">Back to the event</button>':'<button type="button" class="btn pri" data-fv="evback">Back to the event</button><button type="button" class="btn" data-fv="results">Results</button>';}
  else if(B&&F.reason!=="stopped"){const sc=`${B.wins[0]||0}–${B.wins[1]||0}`,w=ftBoutWinner(B);
    if(B.over)r={t:w==null?`Bout drawn ${sc}`:w===0?`You win the bout ${sc}`:`${F.bots[1].name} wins the bout ${sc}`,s:`Round ${B.n}: ${r.t}. ${r.s}`,cls:w==null?"":w===0?"ok":"broke"};
    else{r={t:`Round ${B.n}: ${r.t}`,s:`${r.s} · ${sc} in the bout. Sixty seconds in the pit, then round ${B.n+1}.`,cls:r.cls};
      btns=`<button type="button" class="btn pri" data-fv="pit">${PIT_KITS[B.kit]?"To the pit":"Next round"}</button><button type="button" class="btn" data-fv="endbout">${B.ev?"Forfeit the bout":"Stop the bout"}</button>`;}}
  $("fEndT").textContent=r.t;$("fEndT").className=r.cls;$("fEndS").textContent=r.s;$("fEndBtns").innerHTML=btns;e.hidden=false;
  const p=$("fPause");if(p)p.hidden=true;const btn=e.querySelector(".btn.pri");if(btn)btn.focus({preventScroll:true});}
function ftResult(F){if(F.reason==="stopped")return{t:"Fight stopped",s:"",cls:""};
  const win=F.winner==null?null:F.bots.find(o=>o.team===F.winner);
  if(!win)return{t:"Draw",s:`At ${ftT(F.endT)}, too close for the judges to split`,cls:""};
  return{t:win.i===0?"You win":`${win.name} wins`,s:`${F.reason==="ko"?"By knockout":F.reason==="pit"?"Into the pit":"On the judges' decision"} at ${ftT(F.endT)}`,cls:win.i===0?"ok":"broke"};}
document.addEventListener("keydown",e=>{if(!FT.on||e.key!=="Escape"||sheetOn())return;const F=FT.F;if(F&&!F.over){ftPause(!FT.paused);e.preventDefault();}});

/* ---- the results card under the setup: what happened, each bot's state, the judges ---- */
function ftBar(v,cls){return`<span class="ftbar"><i class="${cls||""}" style="width:${Math.round(Math.max(0,Math.min(1,v))*100)}%"></i></span>`;}
function ftHud(F){const el=$("ftHud");if(!F||!el)return;
  el.innerHTML=F.bots.filter(o=>!o.mini).map(o=>{const w=o.b.weapon,lost=SIM.damageShare(o.b,o.st),bat=o.b.power.batteryWs>0?o.bat/o.b.power.batteryWs:0;
    const st=o.out?`<span class="broke">${o.out==="ko"?"counted out":"in the pit"}</span>`:o.fx.dead?`<span class="broke">dead: ${esc(o.fx.dead)}</span>`:o.flat?`<span class="broke">battery flat</span>`:
      [o.inverted?"upside down":"",!o.fx.weaponOk&&w.type!=="none"?"weapon gone":"",o.fx.sides.left.out?"left side out":"",o.fx.sides.right.out?"right side out":""].filter(Boolean).map(s=>`<span class="worn">${s}</span>`).join(" · ");
    return`<div class="ftbot"><b style="color:${DV_COL.bots[o.i%DV_COL.bots.length]}">●</b> <b>${esc(o.name)}</b> <small>${esc(SIM.part("weapon",o.cfg.weapon).name)}</small>
      <div class="ftrow"><span>battery ${ftBar(bat,bat<0.2?"lo":"")}</span><span>damage <span class="${lost>0.5?"broke":lost>0.15?"worn":"ok"}">${Math.round(lost*100)}%</span></span><span>hits landed <span class="readout">${o.stats.hits}</span></span></div>${st?`<div class="ftrow">${st}</div>`:""}</div>`;}).join("");
  const r=$("ftRes");if(r){const x=ftResult(F);r.textContent=x.t+(x.s?": "+x.s.charAt(0).toLowerCase()+x.s.slice(1):"");r.className="ftres "+x.cls;}
  const j=$("ftJudge");if(j)j.innerHTML=ftJudges(F);}
/* the judges' three scores, out of 100 between the teams, when the bell decided it */
function ftJudges(F){if(!F.over||!F.judge)return"";const sc=F.judge.scores,teams=Object.keys(sc),nm=k=>{const o=F.bots.find(b=>String(b.team)===k);return o.i===0?"You":esc(o.name);};
  const W=SIM.JUDGE_WEIGHTS,row=(lbl,key,max)=>`<tr><th scope="row">${lbl}${max?` <small>/${max}</small>`:""}</th>${teams.map(k=>`<td class="readout">${sc[k][key].toFixed(1)}</td>`).join("")}</tr>`;
  return`<table class="ftjudge"><caption>The judges</caption><thead><tr><th></th>${teams.map(k=>`<th scope="col">${nm(k)}</th>`).join("")}</tr></thead><tbody>
    ${row("Damage","damage",W.damage*100)}${row("Aggression","aggression",W.aggression*100)}${row("Control","control",W.control*100)}${row("Total","total",0)}</tbody></table>`;}
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
    case"release":return`${ftCap(N(a))} ${V(a,"backs","back")} off ${N(v)} (${FT_HOLD} s pin limit)`;
    case"tip":return`${ftCap(N(a))} ${V(a,"tips","tip")} ${N(v)} ${e.inv?"over":"off the lifter"}`;
    case"inv":return e.inv?`${ftCap(N(v))} ${V(v,"lands","land")} upside down`:`${ftCap(N(v))} ${V(v,"lands","land")} back on ${v===0?"your":"its"} wheels`;
    case"land":{const x=e.x||[],tot=x.reduce((q,p)=>q+p[1],0),dead=x.filter(p=>p[2]);if(!dead.length&&tot<2*F.M.mass)return null;
      return`${e.n>1?"Hard landings":"Hard landing"} for ${N(v)}: ${J(tot)} into ${e.inv?"the top":"the wheels and drive"}${dead.length?" · "+dead.map(p=>`${esc(SIM.benchPartName(F.bots[v].b,p[0]))} <span class="broke">destroyed</span>`).join(", "):""}`;}
    case"right":return`${ftCap(N(v))} ${V(v,"self-rights","self-right")}`;
    case"heat":return`${ftCap(N(v,1))} ${e.what==="drive"?"drive motors":"weapon motor"} overheat: half power until they cool`;
    case"self":return e.what==="flip"?`${ftCap(N(v))} ${V(v,"throws itself","throw yourself")} over on the recoil`:e.what==="bent"?`${ftCap(N(v,1))} disc bends on that ${J(e.E)} hit: half the energy from now on`:`${ftCap(N(v,1))} weapon shaft shears!`;
    case"fail":{const P=N(v,1);switch(e.what){
      case"part":return e.key==="weapon"?null:`${ftCap(P)} ${esc(SIM.benchPartName(F.bots[v].b,e.key))} is <span class="broke">destroyed</span>`;
      case"side":return`${ftCap(P)} ${e.side} side is out`;
      case"esc":return`A speed controller in ${P} bot dies: the ${e.side} side is out`;
      case"shock":return`That hit shakes ${P} electronics loose`;
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
    case"pitopen":return"The pit opens";
    case"haz":{const what=e.what==="pusher"?`The wall pusher shoves ${N(v)}`:`The floor spinner throws ${N(v)}`;
      return`${what}: ${J(e.E)}${e.x?" · "+ftParts(F,v,e.x):""}`;}
    case"end":return e.why==="judges"||e.why==="draw"?`Time: it goes to the judges${e.j&&e.j[0]?` · you ${Math.round(e.j[0].total)}, ${esc(F.bots[1].name)} ${Math.round((e.j[1]||{}).total||0)}`:""}`:null;}
  return null;}
function ftLog(F){const el=$("ftLog");if(!F||!el)return;const L=F.log;el.innerHTML="";let html="";
  for(let n=0;n<L.length;n++){const s=ftLine(F,L[n]);if(s)html+=`<li data-n="${n}"><span class="ftt">${L[n].t.toFixed(1)}</span>${s}</li>`;}
  el.innerHTML=html;FT.logN=L.length;}

/* ---- the tab ---- */
function ftRender(){const el=$("ftBody");if(!el)return;const bot=bBot(),cls=bCls(),c=SIM.CLASSES[cls];
  const chips=`<div class="seg bncls" role="group" aria-label="Weight class">${SIM.CLASS_IDS.map(id=>`<button type="button" data-ftcls="${id}" class="${id===cls?"on":""}" aria-pressed="${id===cls}">${SIM.CLASSES[id].name.replace("weight","")}</button>`).join("")}</div>`;
  if(!bot.cfg){FT.F=null;FT.rounds=[];FT.bout=null;el.innerHTML=chips+`<div class="card"><h3>Nothing fitted in the ${c.name} yet</h3><p>A fight uses the bot you've fitted, not the draft on the Build tab. Fit the draft first.</p>
    <div class="row"><button type="button" class="btn pri" data-ft="fit">Fit the draft</button><button type="button" class="btn" data-ft="build">Open Build</button></div></div>`;return;}
  {const R0=ftShown()||FT.F;if(R0&&!FT.on&&(R0.cls!==cls||FT.sig!==bnSig(bot.cfg))){FT.F=null;FT.rounds=[];FT.bout=null;}}   // a refit ends the old fight
  const R=ftShown(),drafted=!(bot.draft&&bnSig(bot.draft)===bnSig(bot.cfg)),wp=SIM.part("weapon",bot.cfg.weapon),you=FT.style==="you";
  el.innerHTML=chips+ftEvCard()+`<div class="card"><h3>Sparring</h3>
    <p>Your fitted ${esc(c.name.toLowerCase())} (${esc(wp?wp.name.toLowerCase():"")}) against anyone in the class, in any arena. No stakes: free practice, fresh every time, and the repair bill is shown, never charged.</p>
    ${drafted?'<p class="hint">Your draft on the Build tab has changes that aren\'t fitted. The fight uses what\'s fitted. <button type="button" class="lnk" data-ft="build">Open Build</button></p>':""}
    ${ftPicker(cls)}
    <div class="field"><span class="lbl">Format</span>${segHtml("ftMode","ftmode",[["duel","One on one"],["bo3","Best of three","pit between"],["rumble","Rumble","four bots"]],FT.mode)}</div>
    <div class="field" id="ftKitF"${FT.mode==="bo3"?"":" hidden"}><span class="lbl">Pit kit</span>${ftChips("ftkit","Pit kit",Object.keys(PIT_KITS).map(k=>[k,esc(PIT_KITS[k].name)]),FT.kit)}
      <p class="hint" id="ftKitLine">${ftKitLine()}</p></div>
    <div class="field"><span class="lbl">Arena</span>${ftChips("ftarena","Arena",[["auto",`${esc(SIM.ARENAS[c.arenaId].name)} <small>(class)</small>`]].concat(SIM.ARENA_IDS.filter(id=>id!==c.arenaId).map(id=>[id,esc(SIM.ARENAS[id].name)])),FT.arena)}</div>
    <div class="field"><span class="lbl">Driver</span>${ftChips("ftstyle","Driver",[["you","You drive"],["auto",`AI: auto <small>(${esc(SIM.AI_STYLES[ftAuto(bot.cfg,cls)].name.toLowerCase())})</small>`]].concat(SIM.AI_STYLE_IDS.map(id=>[id,"AI: "+esc(SIM.AI_STYLES[id].name.toLowerCase())])),FT.style)}
      <p class="hint" id="ftDrvHint">${ftDrvHint()}</p></div>
    <div class="field" id="ftSpeedF"${you?" hidden":""}><span class="lbl">Speed</span>${segHtml("ftSpeed","ftspeed",[["1","1×"],["2","2×"],["4","4×"]],String(FT.speed))}</div>
    <div class="row"><button type="button" class="btn pri" data-ft="go">Fight</button></div></div>
    ${R?`<div class="card" id="ftResCard"><h3>${FT.bout?"The bout":"Last fight"}</h3>${ftBoutHtml()}<p class="ftres" id="ftRes" role="status"></p><div id="ftJudge"></div><div id="ftHud"></div></div>
    ${rpHtml(R)}
    <div class="card"><h3>Fight log</h3><ol class="ftlog" id="ftLog" aria-label="Fight log"></ol></div>`:""}`;
  if(R){ftHud(R);ftLog(R);rpDraw(R);}}
/* while a career event is on: the way back to it */
function ftEvCard(){const c=S.career;if(!crOn()||!(c.day||CR.end))return"";const nm=c.day?crEv(c.day.ev).name:CR.end.name;
  return`<div class="card crback"><h3>${esc(nm)}</h3><p>${c.day?"You're at an event.":"The event is over."} Sparring here is free practice and changes nothing.</p><div class="row"><button type="button" class="btn pri" data-ft="career">Back to the event</button></div></div>`;}
function ftKitLine(){const k=PIT_KITS[FT.kit],c=SIM.CLASSES[bCls()];return`${esc(k.line)} Free when sparring; ${fmt$(Math.round(k.price*c.prizeScale))} at a career event.`;}
/* the bout's score, the pit work between rounds, and a chip per round to look at */
function ftBoutHtml(){const B=FT.bout,n=FT.rounds.length;let h="";
  if(B&&n&&B.banner)h+=`<p class="ftres ${B.banner.cls||""}">${esc(B.banner.t)}</p>`;   // an event bout: the career's own line (rumbles and tag count by team)
  else if(B&&n){const w=ftBoutWinner(B),opp=FT.rounds[0].F.bots[1].name;
    h+=`<p class="ftres ${B.over&&!B.stopped?w===0?"ok":w==null?"":"broke":""}">${B.stopped||!B.over?"Bout stopped":w==null?"Bout drawn":w===0?"You win the bout":esc(opp)+" wins the bout"} <span class="readout">${B.wins[0]||0}–${B.wins[1]||0}</span></p>`;
    if(B.pits.length)h+=`<ul class="ftpits">${B.pits.map((p,i)=>`<li>Pit ${i+1}: you ${p.mine.length?p.mine.map(x=>PIT_NAMES[x.kind].toLowerCase()).join(", "):"fixed nothing"}${p.lost?` <span class="worn">(the ${PIT_NAMES[p.lost.kind].toLowerCase()} wasn't finished)</span>`:""} · their crew ${p.theirs.length?p.theirs.map(x=>PIT_NAMES[x.kind].toLowerCase()).join(", "):"nothing"}</li>`).join("")}</ul>`;}
  if(n>1)h+=`<div class="seg ftrounds" role="group" aria-label="Round">${FT.rounds.map((r,i)=>`<button type="button" data-ftrv="${i}" class="${i===FT.rv?"on":""}" aria-pressed="${i===FT.rv}">Round ${i+1}</button>`).join("")}</div>`;
  return h;}
function ftDrvHint(){if(FT.style!=="you")return"The AI drives your bot; you watch.";
  return ST().controls==="tactical"?"Tactical controls: tap the floor to drive there, tap them to attack, tap your bot to back off. Change it in Settings.":"Direct controls: a stick under your left thumb, the weapon button under your right. Change it in Settings.";}
/* chip rows (wrap on a phone): [[value, label html]] */
function ftChips(attr,label,items,cur){return`<div class="ftopp" role="group" aria-label="${label}">${items.map(it=>`<button type="button" data-${attr}="${it[0]}" class="${it[0]===cur?"on":""}" aria-pressed="${it[0]===cur}">${it[1]}</button>`).join("")}</div>`;}
function ftPicker(cls){const ops=SIM.OPPONENTS.filter(o=>o.cls===cls),cur=ftOpp(cls);
  return`<div class="field"><span class="lbl">Opponent</span>${ops.length?ftChips("ftopp","Named opponents",ops.map(o=>[o.id,esc(o.name)]),FT.opp):""}
    ${ftChips("ftopp","Test builds",SIM.TEST_BUILDS.map(t=>[t.id,esc(t.name)]),FT.opp)}
    <p class="hint" id="ftOppLine">${ftOppLine(cur)}</p></div>`;}
function ftOppLine(o){if(!o.op)return`A test build, driven ${esc(SIM.AI_STYLES[SIM.autoStyle(SIM.evalBuild(o.cfg),ftArena(o.cfg.cls)) ].name.toLowerCase())}.`;
  const v=WORLD.venues[o.op.from];return`<b>${esc(o.op.name)}</b>${v?` · ${esc(v.name)}`:""} · ${esc(SIM.part("weapon",o.cfg.weapon).name.toLowerCase())}, drives ${esc(SIM.AI_STYLES[o.driver.style].name.toLowerCase())}. ${esc(o.op.line)}`;}
function ftClick(e){const t=e.target;let x;
  if((x=t.closest("[data-ft]"))){const a=x.dataset.ft;
    if(a==="go")ftStart();
    else if(a==="replay")ftReplay(FT.rv);
    else if(a==="build")showTab("build");
    else if(a==="career")showTab("career");
    else if(a==="fit"){const r=bEval();if(!r.valid){toast(r.totalG>r.limitG?"The draft is over the limit: fix it on the Build tab":"The draft can't be fitted: see the Build tab");return;}bFitOpen();}
    return;}
  if((x=t.closest("[data-ftcls]"))){ST().buildCls=x.dataset.ftcls;B.sel=null;B.delKey=null;FT.F=null;FT.rounds=[];FT.bout=null;save();ftRender();visBot();return;}
  if((x=t.closest("[data-ftopp]"))){FT.opp=x.dataset.ftopp;ftOn("ftopp",x);const l=$("ftOppLine");if(l)l.innerHTML=ftOppLine(ftOpp(bCls()));return;}
  if((x=t.closest("[data-ftarena]"))){FT.arena=x.dataset.ftarena;ftRender();return;}
  if((x=t.closest("[data-ftstyle]"))){FT.style=x.dataset.ftstyle;ftOn("ftstyle",x);const s=$("ftSpeedF");if(s)s.hidden=FT.style==="you";const h=$("ftDrvHint");if(h)h.textContent=ftDrvHint();return;}
  if((x=t.closest("[data-ftmode]"))){FT.mode=x.dataset.ftmode;ftSeg("ftMode",x);const k=$("ftKitF");if(k)k.hidden=FT.mode!=="bo3";return;}
  if((x=t.closest("[data-ftkit]"))){FT.kit=x.dataset.ftkit;ftOn("ftkit",x);const l=$("ftKitLine");if(l)l.innerHTML=ftKitLine();return;}
  if((x=t.closest("[data-ftrv]"))){FT.rv=+x.dataset.ftrv;ftRender();const c=$("ftResCard");if(c)c.scrollIntoView({block:"start"});return;}
  if((x=t.closest("[data-rpcopy]"))){const R=ftShown();if(R)rpCopy(R,+x.dataset.rpcopy);return;}
  if((x=t.closest("[data-ftspeed]"))){FT.speed=+x.dataset.ftspeed;ftSeg("ftSpeed",x);return;}}
function ftOn(attr,b){document.querySelectorAll(`[data-${attr}]`).forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});}
function ftSeg(id,b){$(id).querySelectorAll("button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});}
TAB_RENDER.fight=function(){
  if(!ftRender.bound){ftRender.bound=true;$("tab-fight").addEventListener("click",ftClick);
    let rt=0;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(FT.on&&FT.view2d&&FT.F)DEBUGVIEW.draw($("fCv"),FT.F,FT.flashes,performance.now());},150);});}
  ftRender();};
