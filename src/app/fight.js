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
  you:false,on:false,view2d:false,partN:0,buzzT:0,
  ext:null};   // ext: the shown fight isn't a spar of your fitted bot: {kind:"daily", day, bring, res} or {kind:"code", ver} (app/daily.js)
const ftArena=cls=>FT.arena==="auto"?SIM.CLASSES[cls].arenaId:FT.arena;
const ftAuto=(cfg,cls)=>SIM.autoStyle(SIM.evalBuild(cfg),ftArena(cls));
const ftGL=()=>!!(window.SCRAP_VIS&&SCRAP_VIS._state&&SCRAP_VIS._state.r);
/* the opponent picked: a named one in this class, else a test build */
function ftOpp(cls,id){id=id||FT.opp;const op=SIM.OPPONENTS.find(o=>o.id===id&&o.cls===cls);
  if(op)return{id,name:op.name,cfg:SIM.opponentCfg(op),driver:Object.assign({},op.driver),op,livery:lvOpp("op:"+id)};
  const t=SIM.TEST_BUILDS.find(x=>x.id===id)||SIM.TEST_BUILDS[0],cfg=Object.assign({},t.cfg,{cls});
  return{id:t.id,name:lvOppName("tb:"+t.id,t.name),cfg,driver:{style:"auto",skill:0.7},livery:lvOpp("tb:"+t.id)};}   // a test build fights as a club regular (0.1.24)
/* a rumble's other two bots: picked from the class's named opponents and the test builds by the seed */
function ftRumble(cls,seed,skip){const pool=SIM.OPPONENTS.filter(o=>o.cls===cls).map(o=>o.id).concat(SIM.TEST_BUILDS.filter(t=>t.id!=="sloppy").map(t=>t.id)).filter(id=>id!==skip),out=[];
  let k=seed>>>3;while(out.length<2&&pool.length){const id=pool.splice(k%pool.length,1)[0];out.push(ftOpp(cls,id));k=(k*2654435761>>>7)+1;}return out;}

function ftStart(){const bot=bBot(),cls=bCls();if(!bot.cfg)return;
  const opp=ftOpp(cls),you=FT.style==="you";
  const seed=((Date.now()&0x7fffffff)^(++FT.fights*0x9E3779B1))>>>0;   // the app picks the seed; the sim is deterministic from it
  const bots=[{cfg:bot.cfg,name:lvBotName(cls),livery:lvMine(),driver:you?null:{style:FT.style,skill:0.7}},{cfg:opp.cfg,name:opp.name,livery:opp.livery,driver:opp.driver}];
  if(FT.mode==="rumble")for(const o of ftRumble(cls,seed,opp.id))bots.push({cfg:o.cfg,name:o.name,livery:o.livery,driver:o.driver});
  lvField(bots);
  FT.you=you;FT.sig=bnSig(bot.cfg);FT.rounds=[];FT.rv=0;FT.rp=null;FT.ext=null;
  const kit=()=>Object.assign({},PIT_KITS[FT.kit].allow);
  FT.bout=FT.mode==="bo3"?{seed,bots,kit:FT.kit,wins:{0:0,1:0},n:0,dmg:[{},{}],flags:[{},{}],left:[kit(),kit()],pits:[],over:false}:null;
  ftGo(SIM.newFight({seed,fx:true,arena:ftArena(cls),bots}));}
/* a fight (a round, or a replay) into fight mode */
function ftGo(F){FT.F=F;FT.flashes=[];FT.logN=0;FT.acc=0;FT.paused=false;FT.last=performance.now();FT.partN=0;FT.flung={};FT.spin={};FT.whl={};FT.crowdT=0;ftFrame.done=null;
  ftEnter();ftVoiceBegin(F);ftLoop();}
/* a finished round goes into the list the results show; in a best of three it scores and carries its damage */
function ftRecord(F){if(F.recorded||FT.rp)return;F.recorded=true;FT.rounds.push({F,log:null});FT.rv=FT.rounds.length-1;if(FT.ext&&FT.ext.kind==="daily")dlRecord(F);
  if(!FT.ext&&!(FT.bout&&FT.bout.ev)&&S.mode!=="career"){rlConsider(F,{});save();}const B=FT.bout;if(!B)return;if(B.ev)F.ev=true;
  F.bots.forEach((o,i)=>{if(o.mini)return;B.dmg[i]=SIM.damageTaken(o.b,o.st);B.flags[i]={bent:!!o.flags.bent,smoke:!!o.flags.smoke,cell:!!o.flags.cell,esc:o.flags.esc||null};});   // a stopped round's damage counts too (an event takes it home)
  if(F.reason==="stopped"){B.over=true;B.stopped=true;ftEvDone(B,F);return;}
  B.n++;if(F.winner!=null)B.wins[F.winner]=(B.wins[F.winner]||0)+1;
  const need=B.need||2,max=B.max||3;if(Object.keys(B.wins).some(t=>B.wins[t]>=need)||B.n>=max)B.over=true;
  ftEvDone(B,F);}
/* a career event's bout is over (or stopped): the career records it at once and hands back the bell's banner */
function ftEvDone(B,F){if(B.over&&B.ev&&!B.reported){B.reported=true;ftFrontBack(B);B.banner=B.ev.onDone(B,F);}}
/* a front swapped in the pit (0.1.32) was the bout's own spare: the fitted front goes home with the damage it had */
function ftFrontBack(B){const f=B.front0;if(!f||B.bots[0].cfg.front===f.id)return;if(f.dmg==null)delete B.dmg[0].front;else B.dmg[0].front=f.dmg;}
function ftBoutWinner(B){const a=B.wins[0]||0,b=B.wins[1]||0;return a>b?0:b>a?1:null;}
/* the pit between rounds: you fix yours (PIT.open), their crew fixes theirs (pitAuto), then the next round */
function ftPit(){const B=FT.bout,F=FT.F;if(!B||B.over)return;const e=$("fEnd");if(e)e.hidden=true;
  const theirs=pitAuto(F.bots[1].b,B.dmg[1],B.flags[1],B.left[1]);
  if(!PIT_KITS[B.kit]){B.pits.push({mine:[],lost:null,theirs});ftNextRound();return;}   // an event entered with no kit: nothing to work with
  const fronts=pitFronts(B.bots[0].cfg),onFront=id=>{if(!B.front0)B.front0={id:B.bots[0].cfg.front||"none",dmg:B.dmg[0].front};   // 0.1.32: a front swap, for the rest of the bout
    B.bots=B.bots.slice();B.bots[0]=Object.assign({},B.bots[0],{cfg:Object.assign({},B.bots[0].cfg,{front:id})});
    if(B.front0.id===id&&B.front0.dmg!=null)B.dmg[0].front=B.front0.dmg;else delete B.dmg[0].front;};
  PIT.open({host:$("fov"),b:F.bots[0].b,dmg:B.dmg[0],flags:B.flags[0],kit:B.kit,left:B.left[0],fronts,onFront,title:`Pit window · round ${B.n+1} next`,
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
/* ---- watching a simmed bout (0.1.29): the career sims and records the match first, so a reload can't change it; then
   each round plays back from its log like a live fight (the announcer's intro, live calls, no scrub bar), with the
   score at each bell and the career's banner at the last. FT.watch: {k (the round playing), banner, voice} ---- */
function ftWatch(banner,voice){if(FT.on||!FT.rounds.length){toastHold(false);return;}FT.watch={k:-1,banner,voice};ftWatchNext();}
function ftWatchNext(){const W=FT.watch;if(!W)return;const e=$("fEnd");if(e)e.hidden=true;
  const R=FT.rounds[++W.k];if(!R||!ftReplayOk(R.F)){FT.watch=null;toastHold(false);if(FT.on)ftExit();else ftRender();toast("That fight can't be played back: see the results");return;}
  if(W.k)W.voice=Object.assign({},W.voice,{first:false});
  const F=ftRpFight(R.log,0);FT.rp={i:W.k,log:R.log,steps:R.log.steps,speed:FT.rp?FT.rp.speed:1,slow:ftSlowPlan(R.log,F.M.mass),watch:true};FT.you=false;ftGo(F);}
/* your rounds and theirs so far in the watched bout */
function ftWatchScore(){const k=FT.watch?FT.watch.k:FT.rounds.length-1,me=FT.rounds[0].F.bots[0].team;let a=0,b=0;
  for(let j=0;j<=k&&j<FT.rounds.length;j++){const w=FT.rounds[j].F.winner;if(w==null)continue;if(w===me)a++;else b++;}return{me:a,them:b};}
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
  const F=ftRpFight(R.log,0);FT.rp={i,log:R.log,steps:R.log.steps,speed:1,slow:ftSlowPlan(R.log,F.M.mass)};FT.you=false;ftGo(F);}
/* ---- slow-motion replays (0.1.25): the replay eases to a crawl for the big hits, a part or the weapon failing and the
   knockout, then picks the pace back up. The windows come from the fight log (seconds into the fight), so a scrub lands
   on the same pace; the manual speed multiplies it. Pure timing: the sim is stepped the same way, only less often. ---- */
const FT_SLOW={hitEn:70,hit:[0.1,0.5,0.35],fail:[0.15,0.8,0.3],ko:[1.3,0.5,0.25],gap:1.5,maxS:2.5,easeIn:0.15,easeOut:0.4,noKo:["judges","draw","stopped"]};
function ftSlowPlan(log,mass){const W=[],mm=Math.max(mass,1e-6),add=(t,c)=>{const a=t-c[0],b=t+c[1],L=W[W.length-1];
    if(L&&a<L.b+FT_SLOW.gap){if(L.b-L.a<FT_SLOW.maxS){L.b=Math.max(L.b,b);L.f=Math.min(L.f,c[2]);}}else W.push({a,b,f:c[2]});};
  for(const e of log.entries||[]){
    if(e.k==="fail"&&(e.what==="part"||e.what==="weapon"||e.what==="esc"))add(e.t,FT_SLOW.fail);
    else if(e.k==="hit"&&e.E/mm>=FT_SLOW.hitEn)add(e.t,FT_SLOW.hit);
    else if(e.k==="end"&&FT_SLOW.noKo.indexOf(e.why)<0)add(e.t,FT_SLOW.ko);}
  return W;}
/* the share of full pace at fight time t: 1 outside the windows, eased down to the window's pace inside */
function ftSlowAt(W,t){let f=1;for(const w of W){const a=w.a-FT_SLOW.easeIn,b=w.b+FT_SLOW.easeOut;if(t<a||t>b)continue;
    const k=t<w.a?(t-a)/FT_SLOW.easeIn:t>w.b?1-(t-w.b)/FT_SLOW.easeOut:1;f=Math.min(f,1-(1-w.f)*k);}return f;}
function ftSeek(n){const rp=FT.rp;if(!rp)return;const F=ftRpFight(rp.log,Math.max(rp.s0||0,Math.min(rp.steps,n|0)));
  FT.F=F;FT.flashes=[];FT.partN=F.log.length;FT.flung={};FT.spin={};FT.whl={};FT.acc=0;FT.last=performance.now();ftFrame.done=null;
  SCRAP_VOICE.stop();if(F.n===0)ftVoiceBegin(F,true);else SCRAP_VOICE.seek(F);
  const e=$("fEnd");if(e)e.hidden=true;
  if(ftGL())SCRAP_VIS.setFight(F,true);if(FT.view2d)DEBUGVIEW.draw($("fCv"),F,[],performance.now());
  ftOverlay();ftLoop();}
/* ---- the voices (sound/voice.js): the announcer's intro, the live calls, the bell, the post-mortem line, captions ----
   Voice reads the fight log and the app's state, never the sim. The intro holds the fight (FT.hold) until it ends or
   Skip is pressed; muted, the same calls come up as captions (#fCap) and nothing waits. */
const ftVoiceOn=()=>ST().sound!==false&&ST().voice!==false;
function ftVoiceLoad(){if(curTab==="fight"&&ST().sound!==false)SCRAP_SOUND.prep();if(curTab==="fight"&&ftVoiceOn())SCRAP_VOICE.load();}   // prep: the effects pack
const ftVKind=F=>{const M=F.bots.filter(o=>!o.mini);if(M.length<=2)return"duel";return new Set(M.map(o=>o.team)).size===M.length?"rumble":"tag";};
const ftVName=F=>F.bots.filter(o=>!o.mini&&o.team!==F.bots[0].team).length===1?F.bots.find(o=>!o.mini&&o.team!==F.bots[0].team):null;
function ftVoiceBegin(F,again){FT.hold=false;const sk=$("fSkip");if(sk)sk.hidden=true;
  const W=FT.rp&&FT.rp.watch?FT.watch:null,rp=!!FT.rp&&!W,B=FT.bout,vc=W?W.voice||null:!rp&&B&&B.ev?B.ev.voice||null:null,src=FT.rp&&FT.rounds[FT.rp.i]?FT.rounds[FT.rp.i].F:null;   // W: a watched sim, voiced like a live bout
  const rivals=FT.rp?(src&&src.vRiv)||{}:vc?vc.rivals||{}:{};F.vRiv=rivals;const kind=ftVKind(F);
  SCRAP_VOICE.begin(F,{speed:FT.rp?FT.rp.speed:FT.you?1:FT.speed,replay:rp,rivals,kind});
  if(W&&again){if(F.n)SCRAP_VOICE.seek(F);return;}
  if(rp){if(FT.rp.reel){SCRAP_VOICE.seek(F);if(FT.reel&&FT.reel.k===0)SCRAP_VOICE.say("pm:replay");}else if(!again)SCRAP_VOICE.say("pm:replay");return;}
  /* the intro: the day's welcome (first bout of an event day), the round, the two corners, the countdown */
  const cues=[],round=W?W.k:B?B.n:0,opp=ftVName(F),rv=opp?rivals[opp.i]:null;
  if(vc&&vc.first&&!round){const c=S.career;cues.push("intro");if(vc.season)cues.push("career:season");
    if(c&&c.act>(c.actSaid|0)){if(c.act===1)cues.push("career:act1");else if(c.act===2)cues.push("career:act2");c.actSaid=c.act;}
    if(c&&c.act===3)cues.push("career:defend");
    cues.push("venue:"+vc.venue,"event:"+vc.event,vc.venue==="eisenhalle"?"c:tv":"c:intro","class:"+vc.cls,"kind:"+vc.kind);}
  else if(!vc&&!round&&kind!=="duel")cues.push("kind:"+kind);
  if(!round){if(vc&&vc.fmt==="bracket")cues.push("round:"+vc.label);
    if(kind==="duel"){cues.push("name:you");if(rv)cues.push("rival:"+rv);else if(opp&&SCRAP_VOICE.pool("name:"+opp.name).length)cues.push("name:"+opp.name);}}
  else if(W){if(round===2)cues.push("bo3:decider");}
  else if(B){if(PIT_KITS[B.kit])cues.push("pitclose");if(Object.keys(B.wins).length>=2&&Object.values(B.wins).every(w=>w===1))cues.push("bo3:decider");}
  cues.push("countdown");
  const bell=()=>{if(ST().sound!==false&&FT.F===F&&FT.on&&!FT.paused&&!F.over&&!document.hidden&&curTab==="fight")SCRAP_SOUND.sfx("bell",0.7);};   // the bell opens the round (sounds/sfx/, every tier); not when a pause, a scrub or leaving cut the intro short
  if(SCRAP_VOICE.intro(cues,()=>{FT.hold=false;FT.last=performance.now();FT.acc=0;const k=$("fSkip");if(k)k.hidden=true;bell();})){FT.hold=true;const k=$("fSkip");if(k)k.hidden=false;}
  else{SCRAP_VOICE.seq(cues);bell();}}   // nothing to hear yet (still loading) or muted: captions, and the fight starts at once
/* the bell: the result calls, then (in a career) a first win or the Open title */
function ftVoiceEnd(F){if(F.reason==="stopped")return;const B=FT.bout,rp=!!FT.rp,extra=[],me=F.bots[0].team;
  const bout=FT.watch&&FT.rounds.length>1?Object.assign(ftWatchScore(),{over:FT.watch.k>=FT.rounds.length-1}):!rp&&B&&B.wins?{me:B.wins[me]||0,them:Object.keys(B.wins).filter(t=>String(t)!==String(me)).reduce((a,t)=>a+(B.wins[t]||0),0),over:!!B.over}:null;
  if(!rp&&B&&B.ev&&B.over&&!B.stopped&&crOn()){const c=S.career,vc=B.ev.voice||{},won=(B.wins[me]||0)>=(B.need||1);
    if(won&&!c.fw){c.fw=true;extra.push("career:first");}
    if(won&&vc.event==="Scrapline Open Final"&&vc.label==="final")extra.push("career:open");save();}
  SCRAP_VOICE.end(F,{kind:ftVKind(F),bout,extra});}
/* the post-mortem line for the round on the results card, once (after the bell's calls) */
function ftVoicePm(F){if(F.pmSaid||!F.over||F.reason==="stopped"||FT.on)return;F.pmSaid=true;const k=rpHint(F).kind||"gen";SCRAP_VOICE.seq([["pm:"+k,"pm:gen"]],{queue:true});}
/* a caption: the line at the bottom of the fight for a few seconds (only when sound or voices are off) */
SCRAP_VOICE.onCap=(text,who)=>{const el=$("fCap");if(!el||!FT.on)return;el.textContent=(who==="a"?"Duncan: ":"Jess: ")+text;el.hidden=false;el.classList.toggle("fcom",who!=="a");
  clearTimeout(ftVoicePm.t);ftVoicePm.t=setTimeout(()=>{el.hidden=true;},Math.max(2200,text.length*70));};
function ftLoop(){if(!FT.raf)FT.raf=requestAnimationFrame(ftFrame);}
function ftPause(on){const F=FT.F;if(!F||F.over)return;FT.paused=on;if(on){SCRAP_SOUND.stop();SCRAP_VOICE.stop();}else{FT.last=performance.now();FT.acc=0;ftLoop();}
  const p=$("fPause");if(p){p.hidden=!on||!!FT.rp;if(on){const r=p.querySelector("[data-fv=resume]");if(r)r.focus({preventScroll:true});}}const b=document.querySelector('[data-fv="pause"]');if(b)b.setAttribute("aria-pressed",on);if(FT.on)ftOverlay();}
function ftFrame(now){FT.raf=0;const F=FT.F;if(!F)return;
  if(curTab!=="fight"||document.hidden){if(!F.over&&!FT.paused)ftPause(true);return;}
  if(FT.hold&&!FT.paused&&!F.over)FT.last=now;   // the announcer's intro: the clock waits
  else if(!FT.paused&&!F.over){let dt=(now-FT.last)/1000;FT.last=now;if(!(dt>0))dt=0;const sp=FT.rp?FT.rp.speed:FT.you?1:FT.speed,slow=FT.rp&&FT.rpAuto!==false&&FT.rp.slow?ftSlowAt(FT.rp.slow,F.t):1;FT.acc+=Math.min(dt,0.25)*sp*slow;
    if(FT.rp&&(slow<0.9)!==!!FT.rp.dip){FT.rp.dip=slow<0.9;const rb=$("fRp");if(rb)rb.classList.toggle("slow",FT.rp.dip);}
    let k=0;while(FT.acc>=1/60&&k<5&&!F.over){SIM.stepFight(F,FT.you&&FT.on&&!FT.rp?{0:CONTROLS.read(F,F.bots[0])}:null);FT.acc-=1/60;k++;
      if(FT.rp&&F.n>=FT.rp.steps&&!F.over){F.over=true;F.endT=F.t;if(!F.reason)F.reason="stopped";}}   // a stopped fight's replay ends where it was stopped
    if(k===5)FT.acc=Math.min(FT.acc,1/60);   // clamped: a slow frame loses time instead of catching up
    if(k&&!F.over)SCRAP_VOICE.tick(F,sp);
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
    if(key&&!FT.flung[e.v+":"+key]){FT.flung[e.v+":"+key]=1;parts.push({k:"part",v:e.v,key});}   // each part flies off once
    if(snd)ftSfx(F,e,now);}
  FT.partN=L.length;if(parts.length&&snd&&!SCRAP_SOUND.sfx("partoff",0.8))SCRAP_SOUND.hit(0.8,"part");   // recorded only (Full / Ultra); Lite stays silent here as before
  if(parts.length&&FT.on&&!FT.view2d)SCRAP_VIS.fx(parts);}

/* ---- the effects pack (sound/synth.js sfx, sounds/sfx/): one fight log entry's sounds. The weapon's own sound (a hammer,
   a crusher, a flipper, a lifter), a layer for what the hit landed on (the plate's material, or the chassis's; a tyre when a
   wheel took it), metal giving way, hazards, the pit, the crowd's ooh and groan (every tier, one every 3.5 s at most).
   synth.js drops the Full / Ultra ones on Lite. ---- */
const FT_MAT={ply:"ply",hdpe:"hdpe",hdpe6:"hdpe",hdpe10:"hdpe",hdpe15:"hdpe",ti:"ti"};   // anything else metal rings as steel ("ar")
const FT_BED={regional:"reg",stahl:"reg",eisenau:"reg",grauwald:"reg",eisenhalle:"big"};   // the crowd bed by arena; the rest are a club crowd
const FT_SPIN={hsp:"spin_h",vsp:"spin_v",drum:"spin_drum",saw:"spin_saw",under:"spin_under"};
function ftSfx(F,e,now){const SS=SCRAP_SOUND,mm=Math.max(F.M.mass,1e-6),A=e.a!=null&&e.a>=0?F.bots[e.a]:null,V=e.v!=null&&e.v>=0?F.bots[e.v]:null,wid=A?A.b.cfg.weapon:"";
  const crowd=k=>{if(now-(FT.crowdT||0)<3500)return;if(SS.sfx(k,0.55))FT.crowdT=now;};
  if(e.k==="hit"&&V){const En=(e.E||0)/mm,v=0.25+0.5*Math.min(1,En/140);
    if(wid==="hammer")SS.sfx("hammer",0.7);else if(wid==="crusher")SS.sfx("crush",0.7);
    const pl=V.b.armourMapJ[e.f],id=pl&&pl.id!=="none"?pl.id:V.b.cfg.chassis;
    SS.sfx(e.x&&e.x.some(q=>/^wheel/.test(q[0]))?"tyre":FT_MAT[id]||"ar",v*0.8);
    if(En>60&&!V.mini)crowd("ooh");}
  else if(e.k==="flip"&&e.a!=null)SS.sfx(wid==="flipper2"?"fliphp":"flip",0.75);
  else if(e.k==="lift")SS.sfx("lifter",0.6);
  else if(e.k==="grab")SS.sfx("grab",0.7);
  else if(e.k==="kick"&&!e.heavy)SS.sfx("kick",0.7);
  else if(e.k==="under"||e.k==="grind")SS.sfx("scrape",0.45);
  else if(e.k==="haz")SS.sfx(e.what==="pusher"?"pusher":"floorspin",0.6);
  else if(e.k==="pitopen")SS.sfx("pitopen",0.7);
  else if(e.k==="right")SS.sfx("selfright",0.6);
  else if(e.k==="self"&&(e.what==="bent"||e.what==="shear")){SS.sfx(e.what==="bent"?"bend":"snap",0.7);crowd("groan");}
  else if(e.k==="fail"){if(e.what==="smoke")SS.sfx("smoke",0.55);else if(e.what==="dead"||e.what==="flat"||e.what==="cell"){SS.sfx("powerdown",0.6);if(V&&!V.mini)crowd("groan");}
    else if(e.what==="weapon")crowd("groan");}
  else if(e.k==="land"&&(e.E||0)/mm>30)SS.sfx("land",0.5);
  else if(e.k==="wall"&&(e.E||0)/mm>40)SS.sfx("thud",0.5);}
/* a spinner coming up to speed (its share of full speed climbs past a third from under a tenth): its spin-up, once each time */
function ftSpinUp(F,o,i){const id=FT_SPIN[o.b.cfg.weapon];if(!id)return;const w=o.b.weapon,r=o.out||!o.fx.weaponOk?0:o.wp.om/(w.omega||1),m=FT.spin||(FT.spin={});
  if(r<0.1)m[i]=1;else if(r>0.33&&m[i]){m[i]=0;SCRAP_SOUND.sfx(id,i===0?0.5:0.35);}}
/* the wheel layouts (0.1.31, Full / Ultra): a mecanum or swerve bot starting a slide, a caster bot changing direction */
function ftWheelSfx(F,o,i){const wb=o.b.wheelbase;if(!wb||o.out)return;const m=FT.whl||(FT.whl={}),s=m[i]||(m[i]={sl:0,dir:0,t:-9}),v=i===0?0.45:0.3;
  if(wb.strafe>0){const sl=Math.abs((o.input&&o.input.strafe)||0)>0.3;if(sl&&!s.sl&&F.t-s.t>0.6){s.t=F.t;SCRAP_SOUND.sfx(wb.id==="swerve"?"swerve":"mecanum",v);}s.sl=sl;}
  else if(wb.caster){const vf=Math.cos(o.h)*o.vx+Math.sin(o.h)*o.vy,d=Math.abs(vf)>0.2*Math.max(o.b.driveSpeed,0.1)?Math.sign(vf):0;
    if(d&&s.dir&&d!==s.dir&&F.t-s.t>0.8){s.t=F.t;SCRAP_SOUND.sfx("caster",v*0.8);}if(d)s.dir=d;}}
/* ---- fight mode: the overlay on the 3D view ---- */
function ftEnter(){const F=FT.F;FT.on=true;FT.view2d=!ftGL();$("app").classList.add("fighting");
  document.documentElement.classList.add("infight");   // no backup reminder or update bar over a fight (savecode.js, css)
  const old=$("fov");if(old)old.remove();
  const el=document.createElement("div");el.id="fov";el.className="fov";
  el.innerHTML=`<div class="fovtop"><span class="fclock readout" id="fClock" role="timer" aria-label="Round clock">${ftT(F.rules.roundS)}</span><span class="fnote" id="fNote" role="status" aria-live="polite"></span>
      ${ftGL()?`<button type="button" class="fbtn" data-fv="2d" aria-pressed="${FT.view2d}">2D</button>`:""}<button type="button" class="fbtn" data-fv="skip" id="fSkip" hidden>Skip</button>${FT.rp?'<button type="button" class="fbtn" data-fv="results">Close</button>':'<button type="button" class="fbtn" data-fv="pause" aria-pressed="false">Pause</button>'}</div>
    <div class="fbots${F.bots.filter(o=>!o.mini).length>2?" many":""}" id="fBots">${F.bots.filter(o=>!o.mini).map((o,n)=>`<div class="fbot${n%2?" r":""}" data-i="${o.i}" style="--tc:${ftTeamCol(o)}"><canvas class="fmap" aria-hidden="true"></canvas><div class="fbinfo"><b>${o.livery?lvBadge(o.livery,18,"in"):""}${esc(o.name)}</b>
      ${ftArmed(o)?'<span class="fbl">Weapon</span><span class="fbar"><i data-b="w"></i></span>':'<span class="fbl" data-nil="1">Weapon</span><span class="fnil">none</span>'}<span class="fbl">Drive</span><span class="fbar"><i data-b="dr"></i></span><span class="fbl">Battery</span><span class="fbar"><i data-b="bat"></i></span>
      <small data-b="worst"></small><small class="fbst" data-b="st"></small></div></div>`).join("")}</div>
    <canvas id="fCv" class="fcv" role="img" aria-label="Top-down view of the fight"${FT.view2d?"":" hidden"}></canvas>
    <div class="fpause" id="fPause" hidden><p>Paused</p><div class="row"><button type="button" class="btn pri" data-fv="resume">Resume</button><button type="button" class="btn" data-fv="quit">${FT.bout&&FT.bout.ev?"Forfeit":"Stop the fight"}</button></div></div>
    <p class="fcap" id="fCap" aria-live="polite" hidden></p>
    <div class="fend" id="fEnd" hidden role="alertdialog" aria-labelledby="fEndT"><b id="fEndT"></b><p id="fEndS"></p><div class="row" id="fEndBtns"></div></div>
    ${FT.rp?`<div class="frp" id="fRp"><button type="button" class="fbtn" data-fv="rpplay" aria-pressed="false">Pause</button>
      <input type="range" id="fRpPos"${FT.rp.watch?" hidden":""} min="${FT.rp.s0||0}" max="${FT.rp.steps}" step="15" value="${FT.rp.s0||0}" aria-label="Replay position"><span class="readout" id="fRpT">${ftT(Math.max(0,FT.F.rules.roundS-FT.F.t))}</span>
      <button type="button" class="fbtn" data-fv="rpspeed" aria-label="Replay speed">${ftSpLbl(FT.rp.speed)}</button>
      <button type="button" class="fbtn" data-fv="rpslow" aria-pressed="${FT.rpAuto!==false}" aria-label="Automatic slow motion on big moments">Slow-mo</button>${FT.reel&&FT.reel.k<FT.reel.list.length-1?'<button type="button" class="fbtn" data-fv="rlnext" aria-label="Next highlight">Next</button>':""}</div>`:""}${FT.reel?rlBanner():""}`;
  $("view").appendChild(el);el.addEventListener("click",ftOvClick);
  const dpr=Math.min(window.devicePixelRatio||1,2);el.querySelectorAll(".fmap").forEach(cv=>{const w=cv.clientWidth||56;cv.width=cv.height=Math.round(w*dpr);});
  ftPinchOn();
  const pos=$("fRpPos");if(pos){pos.addEventListener("pointerup",()=>{if(FT.rp)FT.rp.drag=false;});pos.addEventListener("blur",()=>{if(FT.rp)FT.rp.drag=false;});
    pos.addEventListener("input",()=>{FT.rp.drag=true;$("fRpT").textContent=ftT(Math.max(0,FT.F.rules.roundS-pos.value/SIM.STEP_HZ));});
    pos.addEventListener("change",()=>{FT.rp.drag=false;ftSeek(+pos.value);});}
  SCRAP_VIS.setRun({reduce:reduced(),fxLow:fxLow()});
  if(ftGL()){SCRAP_VIS.setFight(F);SCRAP_VIS.setView("arena");}
  if(FT.you)CONTROLS.mount(el);
  ftOverlay();ftInsets();}
/* the band of the screen the HUD leaves clear, for the camera: below the bot cards, above the controls or the replay bar */
function ftInsets(){if(!FT.on||!window.SCRAP_VIS)return;const v=$("view"),b=$("fBots");if(!v)return;const r=v.getBoundingClientRect();
  const q=b&&b.getBoundingClientRect(),c=b&&b.querySelector(".fbot"),cw=c?c.getBoundingClientRect().width:0;
  /* cards in the corners of a wide screen leave the middle clear: count half of them */
  const t=!q?56:Math.max(0,(q.bottom-r.top)*(r.width-2*cw>r.width*0.3?0.55:1)),bt=FT.rp?72:FT.you&&ST().controls!=="tactical"?Math.min(130,r.height*0.2):16;
  SCRAP_VIS.setRun({inset:{t,b:bt}});}
/* pinch (or the mouse wheel) nudges the camera in and out. It listens on the whole view, so it works over the arena,
   the tap layer and between the controls; a finger that lands on a button, the stick or a card isn't counted */
function ftPinchOn(){const v=$("view");if(!v||FT.pinch)return;const P=FT.ptrs=new Map();let d0=0,z0=1;
  const skip=e=>!!e.target.closest("button,input,[data-c=pad],.fbot,.fpit,.fend,.fpause");
  const dist=()=>{const [a,b]=[...P.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  const set=z=>{FT.zoom=Math.max(0.55,Math.min(1.8,z));SCRAP_VIS.setRun({zoom:FT.zoom});};
  const down=e=>{if(e.isPrimary)P.clear();if(!FT.on||skip(e))return;P.set(e.pointerId,{x:e.clientX,y:e.clientY});if(P.size===2){d0=dist();z0=FT.zoom||1;}};
  const move=e=>{const p=P.get(e.pointerId);if(!p)return;p.x=e.clientX;p.y=e.clientY;if(P.size===2&&d0>0)set(z0*d0/Math.max(dist(),1));};
  const up=e=>{P.delete(e.pointerId);if(P.size<2)d0=0;};
  const wheel=e=>{if(!FT.on||skip(e))return;e.preventDefault();set((FT.zoom||1)*(1+Math.sign(e.deltaY)*0.08));};
  v.addEventListener("pointerdown",down);v.addEventListener("pointermove",move);v.addEventListener("pointerup",up);v.addEventListener("pointercancel",up);v.addEventListener("wheel",wheel,{passive:false});
  FT.pinch=()=>{v.removeEventListener("pointerdown",down);v.removeEventListener("pointermove",move);v.removeEventListener("pointerup",up);v.removeEventListener("pointercancel",up);v.removeEventListener("wheel",wheel);P.clear();};}
function ftExit(){const rl=!!FT.reel;FT.reel=null;if(FT.watch)toastHold(false);FT.watch=null;clearTimeout(RL.t);if(FT.rp||(FT.F&&FT.F.reason==="stopped"))SCRAP_VOICE.stop();FT.on=false;if(FT.pinch){FT.pinch();FT.pinch=null;}PIT.close();CONTROLS.unmount();if(FT.rp){FT.rp=null;FT.F=ftShown();}SCRAP_SOUND.stop();$("app").classList.remove("fighting");document.documentElement.classList.remove("infight");const el=$("fov");if(el)el.remove();
  if(window.SCRAP_VIS){SCRAP_VIS.setView("workshop");SCRAP_VIS.setFight(null);}
  ftRender();const r=$(rl?"rlCard":"ftResCard");if(r)r.scrollIntoView({block:"start"});}
function ftOvClick(e){const b=e.target.closest("[data-fv]");if(!b)return;const a=b.dataset.fv,F=FT.F;
  if(a==="pause")ftPause(!FT.paused);
  else if(a==="skip")SCRAP_VOICE.skip();
  else if(a==="resume")ftPause(false);
  else if(a==="quit"){const ev=FT.bout&&FT.bout.ev;if(F&&!F.over){FT.paused=false;F.over=true;F.endT=F.t;F.reason="stopped";ftRecord(F);}if(ev)ftEvBack();else ftExit();}
  else if(a==="evpit")ftEvPit();
  else if(a==="evback")ftEvBack();
  else if(a==="again"){const dl=FT.ext&&FT.ext.kind==="daily";ftExit();if(dl)dlStart();else ftStart();}
  else if(a==="pit")ftPit();
  else if(a==="endbout"){const B=FT.bout;if(B&&!B.over){B.over=true;B.stopped=true;ftEvDone(B,F);}if(B&&B.ev)ftEvBack();else ftExit();}
  else if(a==="rpagain")ftSeek(0);
  else if(a==="wnext")ftWatchNext();
  else if(a==="rpplay"){if(F.over){ftSeek(0);return;}ftPause(!FT.paused);b.textContent=FT.paused?"Play":"Pause";b.setAttribute("aria-pressed",FT.paused);}
  else if(a==="rpspeed"){const sp=[1,2,0.5,0.25],k=(sp.indexOf(FT.rp.speed)+1)%sp.length;FT.rp.speed=sp[k];b.textContent=ftSpLbl(sp[k]);}
  else if(a==="rlnext"){const e=$("fEnd");if(e)e.hidden=true;rlNext();}
  else if(a==="rlagain")rlAgain();
  else if(a==="rpslow"){FT.rpAuto=FT.rpAuto===false;b.setAttribute("aria-pressed",FT.rpAuto!==false);}
  else if(a==="results")ftExit();
  else if(a==="2d"){FT.view2d=!FT.view2d;b.setAttribute("aria-pressed",FT.view2d);$("fCv").hidden=!FT.view2d;if(FT.view2d)DEBUGVIEW.draw($("fCv"),F,[],performance.now());}}
const ftSpLbl=v=>(v===0.5?"½":v===0.25?"¼":v)+"×";
/* the strip per bot, the clock and the notes, a few times a second */
function ftOverlay(){const F=FT.F;if(!F||!FT.on)return;
  if(FT.rp&&!FT.rp.drag){const p=$("fRpPos"),t=$("fRpT");if(p)p.value=F.n;if(t)t.textContent=ftT(Math.max(0,F.rules.roundS-F.t));const pb=document.querySelector('[data-fv="rpplay"]');if(pb){const l=F.over?"Again":FT.paused?"Play":"Pause";if(pb.textContent!==l)pb.textContent=l;}}const snd=ST().sound!==false&&!FT.paused&&!F.over;
  const c=$("fClock");if(c)c.textContent=ftT(Math.max(0,F.rules.roundS-F.t));
  const many=F.bots.filter(o=>!o.mini).length>2;
  F.bots.forEach((o,i)=>{const el=document.querySelector(`.fbot[data-i="${i}"]`);if(!el){if(o.mini&&FT.on&&!FT.view2d)SCRAP_VIS.damage(i,SIM.partStates(o.b,o.st));return;}   // a minibot has no strip, but greys in the arena
    const w=o.b.weapon,h=o.b.heat,states=SIM.partStates(o.b,o.st);
    const bat=o.b.power.batteryWs>0?o.bat/o.b.power.batteryWs:0,heat=Math.max(h.drive.budgetJ>0?o.heat.d/h.drive.budgetJ:0,h.weapon&&h.weapon.budgetJ>0?o.heat.w/h.weapon.budgetJ:0);
    const ws=!o.fx.weaponOk?0:w.type==="spinner"||w.type==="saw"?o.wp.om/(w.omega||1):w.type==="flipper"?o.wp.shots/(w.shots||1):w.type==="none"||w.type==="wedge"?0:1;
    if(o.flags.bent&&states.weapon==="intact")states.weapon="damaged";
    /* three bars: how long is how ready (disc speed, shots left; drive left on each side; charge), the colour is how damaged */
    const set=(k,v,cls)=>{const x=el.querySelector(`[data-b="${k}"]`);if(!x)return;const p=Math.round(Math.max(0,Math.min(1,v))*100)+"%";if(x.style.width!==p)x.style.width=p;if(x.className!==cls)x.className=cls;};
    const dr=ftDrive(o,states),bs=o.flags.smoke||states.battery==="destroyed"?"broke":states.battery==="damaged"||bat<0.2?"worn":"ok";
    set("w",ftArmed(o)?ws:0,!o.fx.weaponOk?"broke":FT_ST[states.weapon]||"ok");set("dr",dr.v,dr.cls);set("bat",bat,bs);
    const st=o.out?(o.out==="ko"?"Counted out":"In the pit"):o.fx.dead?"Dead":o.flat?"Battery flat":o.immobileS>0?`Immobile ${Math.ceil(F.rules.koS-o.immobileS)}`:o.inverted?"Upside down":o.held!=null?"Lifted":o.under?"Under a wedge":heat>0.85?"Overheating":"";
    const sx=el.querySelector('[data-b="st"]');if(sx&&sx.textContent!==st)sx.textContent=st;
    /* where the status line is hidden (a rumble, a phone on its side), the status takes the worst part's place */
    const wo=st&&(many||FT_SHORT.matches)?{t:st,cls:"stw"}:ftWorst(o,states),wx=el.querySelector('[data-b="worst"]');if(wx){if(wx.textContent!==wo.t)wx.textContent=wo.t;if(wx.className!==wo.cls)wx.className=wo.cls;}el.classList.toggle("out",!!o.out);
    ftMap(el.querySelector(".fmap"),o,states);
    if(FT.on&&!FT.view2d)SCRAP_VIS.damage(i,states);
    if(snd&&i<4){SCRAP_SOUND.whine(i,o.out?0:o.wp.om/(w.omega||1),o.out?0:Math.hypot(o.vx,o.vy)/Math.max(o.b.driveSpeed||1,0.1));if(!F.over&&!FT.paused){ftSpinUp(F,o,i);ftWheelSfx(F,o,i);}}});
  if(snd&&!F.over&&!FT.paused)SCRAP_SOUND.crowd(FT_BED[F.arena.id]||"club");   // the crowd under the fight (every tier)
  const n=$("fNote");if(n){const me=F.bots[0],t=F.arena.pit&&!SIM.pitOpen(F)?`Pit opens ${ftT(F.arena.pit.openS)}`:"";
    const s=FT.hold&&!F.over?"Intro · fight starts at the bell":FT.you&&me.release>F.t?"Pin limit: backing off":FT.you&&me.inverted&&!me.b.height.drivesInverted&&me.fx.righter?"Upside down: self-right":t;if(n.textContent!==s)n.textContent=s;}   // the intro holds the clock: say so (a play-tester thought the fight had hung)
  if(!snd)SCRAP_SOUND.stop();}
/* the bell at the end, and the crowd: a cheer for a knockout or the pit, applause for the judges (every tier) */
function ftEndSfx(F){if(F.reason==="stopped"||ST().sound===false)return;SCRAP_SOUND.sfx("bell",0.7);
  if(F.reason==="judges"||F.reason==="draw")SCRAP_SOUND.sfx("clap",0.6);else SCRAP_SOUND.sfx("cheer",0.6);}
/* a bot's damage silhouette: the faces as its outline, the parts as dots where the layout put them, green / amber / cool red */
const FT_SC={intact:"#4CC38A",damaged:"#E2A93B",destroyed:"#E5484D"};
function ftSil(cv,o,states,W){if(!cv)return;W=W||44;const g=cv.getContext("2d"),k=W/44,b=o.b,s=36*k/Math.max(b.widthM,b.lengthM),hw=b.widthM/2*s,hl=b.lengthM/2*s,cx=W/2,cy=W/2;
  g.clearRect(0,0,W,W);g.lineWidth=3*k;g.lineCap="round";
  const face=(k,x0,y0,x1,y1)=>{g.strokeStyle=FT_SC[states["armour_"+k]||"intact"];g.globalAlpha=b.armourMapJ[k]&&b.armourMapJ[k].id!=="none"?1:0.35;g.beginPath();g.moveTo(cx+x0,cy+y0);g.lineTo(cx+x1,cy+y1);g.stroke();};
  face("front",-hw,-hl,hw,-hl);face("back",-hw,hl,hw,hl);face("left",-hw,-hl,-hw,hl);face("right",hw,-hl,hw,hl);g.globalAlpha=1;
  g.fillStyle=FT_SC[states.chassis||"intact"];g.globalAlpha=0.18;g.fillRect(cx-hw,cy-hl,2*hw,2*hl);g.globalAlpha=1;
  for(const p of b.parts){if(!p.pos)continue;g.fillStyle=FT_SC[states[p.key]||"intact"];g.beginPath();g.arc(cx+p.pos[0]*s,cy-p.pos[1]*s,(p.key==="weapon"?3:2.2)*k,0,7);g.fill();}}
/* ---- the bot cards (0.1.15.4): a bot map per bot, three labelled bars, the worst part named ---- */
const FT_ST={intact:"ok",damaged:"worn",destroyed:"broke"};
const FT_SHORT=window.matchMedia?matchMedia("(max-height:560px) and (orientation:landscape)"):{matches:false};   // the status line is hidden there (style.css)
const ftArmed=o=>o.b.weapon.type!=="none"&&o.b.weapon.type!=="wedge";   // a wedge or a pusher has no weapon bar
function ftTeamCol(o){return o.livery?dvCol(o):DV_COL.bots[(o.team!=null?o.team:o.i)%DV_COL.bots.length];}   // its team's main colour (0.1.24), else the colour of its ring and stripe in the arena
/* drive: what is left of the motors and wheels on each side (a side whose controller is dead counts as none) */
function ftDrive(o,states){const b=o.b,side={left:[0,0],right:[0,0]};let worst=0;
  for(const p of b.parts){if(p.slot!=="drive"&&p.slot!=="wheels"||!(p.hpJ>0))continue;const s=side[p.pos&&p.pos[0]<0?"left":"right"];s[0]+=Math.max(0,o.st.parts[p.key]);s[1]+=p.hpJ;
    worst=Math.max(worst,["intact","damaged","destroyed"].indexOf(states[p.key]||"intact"));}
  const v=k=>o.fx.sides&&o.fx.sides[k]&&o.fx.sides[k].out?0:side[k][1]>0?side[k][0]/side[k][1]:1,l=v("left"),r=v("right");
  return{v:(l+r)/2,cls:!l||!r?"broke":["ok","worn","broke"][worst]};}
const FT_FACE_N={front:"Front",back:"Rear",left:"Left",right:"Right",top:"Top"};
function ftPartName(b,key){if(key.startsWith("armour_"))return`${FT_FACE_N[key.slice(7)]||key.slice(7)} plate`;if(key==="chassis")return"Chassis";
  const p=b.parts.find(q=>q.key===key);if(!p)return key;
  if(p.caster)return"Caster";
  if(p.slot==="drive"||p.slot==="wheels"){const x=p.pos||[0,0],same=b.parts.filter(q=>q.slot===p.slot&&!q.caster&&(q.pos&&q.pos[0]<0)===(x[0]<0)).map(q=>q.pos[1]).sort((u,v)=>v-u),
      i=same.indexOf(x[1]),n=same.length,where=n<2?"":n===2?(i===0?" front":" rear"):n===3?[" front"," middle"," rear"][i]:[" front"," second"," third"," rear"][i]||"";
    return`${x[0]<0?"Left":"Right"}${where} ${p.slot==="drive"?"motor":"wheel"}`;}
  return{weapon:"Weapon",battery:"Battery",electronics:"Electronics",armour:"Armour",selfright:"Self-righter"}[p.slot]||(p.slot.charAt(0).toUpperCase()+p.slot.slice(1));}
/* the part in the worst shape: anything destroyed first (the weapon, electronics and battery before the rest), then the
   most worn */
const FT_RANK=["weapon","electronics","battery","drive","wheels"];
function ftWorst(o,states){const b=o.b;let best=null,bk=-1;
  for(const key in states){const s=states[key];if(s==="intact")continue;const p=b.parts.find(q=>q.key===key),slot=p?p.slot:key.startsWith("armour_")?"armour":"chassis";
    const hp=p?p.hpJ:key.startsWith("armour_")?b.armourMapJ[key.slice(7)].hpJ:0,left=p?o.st.parts[key]:key.startsWith("armour_")?o.st.armour[key.slice(7)]:o.st.chassis,share=hp>0?Math.max(0,left)/hp:0;
    const r=FT_RANK.indexOf(slot),k=(s==="destroyed"?2:1)*10+(r<0?0:(FT_RANK.length-r)/FT_RANK.length)+(1-share)*0.5;if(k>bk){bk=k;best={key,s};}}
  if(!best)return{t:"No damage",cls:"none"};
  const n=ftPartName(b,best.key);return{t:`${n} ${best.s==="destroyed"?best.key.startsWith("armour_")?"gone":"broken":"worn"}`,cls:best.s==="destroyed"?"broke":"worn"};}
/* the bot map: the chassis outline with each face's plate coloured, every part in its layout cells, the wheels at the
   sides, green / amber / cool red; a broken part is crossed out as well, so the colour isn't the only sign */
const FT_MC={intact:"#4CC38A",damaged:"#E2A93B",destroyed:"#E5484D"};
function ftMap(cv,o,states){if(!cv)return;const W=cv.width,g=cv.getContext("2d"),b=o.b,c=SIM.CLASSES[b.cfg.cls]||{},cell=b.widthM/(c.gridW||4);   // evalBuild: the width is the grid's
  const sig=JSON.stringify(states)+(o.out?1:0);if(cv._sig===sig&&cv.width===cv._w)return;cv._sig=sig;cv._w=W;   // redraw only when something changed
  const wx=b.widthM+cell*0.7,s=W*0.9/Math.max(wx,b.lengthM),X=x=>W/2+x*s,Y=y=>W/2-y*s,lw=Math.max(2,W/26);
  g.clearRect(0,0,W,W);
  const poly=b.polygon||[[-b.widthM/2,b.lengthM/2],[b.widthM/2,b.lengthM/2],[b.widthM/2,-b.lengthM/2],[-b.widthM/2,-b.lengthM/2]];
  g.beginPath();poly.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1])));g.closePath();g.fillStyle="#2A2925";g.fill();
  g.globalAlpha=0.22;g.fillStyle=FT_MC[states.chassis||"intact"];g.fill();g.globalAlpha=1;
  /* the parts, cell by cell (wheels share the motors' cells, so they are drawn on the sides instead) */
  const gw=c.gridW||4,gh=c.gridH||6,cx=x=>((x+0.5)-gw/2)*cell,cy=y=>(gh/2-(y+0.5))*cell,gap=Math.max(1,W/60);
  for(const p of b.parts){if(p.slot==="wheels"||!p.cells||!(p.hpJ>0))continue;const st=states[p.key]||"intact";g.fillStyle=FT_MC[st];g.globalAlpha=p.key==="weapon"?0.95:0.7;
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const q of p.cells){const a=X(cx(q[0])-cell/2)+gap,bb=Y(cy(q[1])+cell/2)+gap,sz=cell*s-2*gap;g.fillRect(a,bb,sz,sz);x0=Math.min(x0,a);y0=Math.min(y0,bb);x1=Math.max(x1,a+sz);y1=Math.max(y1,bb+sz);}
    g.globalAlpha=1;
    if(st==="destroyed"){g.strokeStyle="#141413";g.lineWidth=Math.max(1.5,W/40);g.beginPath();g.moveTo(x0+2,y0+2);g.lineTo(x1-2,y1-2);g.moveTo(x1-2,y0+2);g.lineTo(x0+2,y1-2);g.stroke();}
    const lab={weapon:"W",battery:"B",electronics:"E"}[p.slot];if(lab&&Math.min(x1-x0,y1-y0)>=W/9){g.fillStyle="#141413";g.font=`700 ${Math.round(Math.min(x1-x0,y1-y0)*0.6)}px ${FT.font||(FT.font=getComputedStyle(document.documentElement).getPropertyValue("--font")||"sans-serif")}`;g.textAlign="center";g.textBaseline="middle";g.fillText(lab,(x0+x1)/2,(y0+y1)/2+1);}}
  /* the armour, one stroke per edge of the outline, coloured by the face it belongs to */
  g.lineCap="round";g.lineWidth=lw;
  /* each edge's outward normal (away from the middle, whichever way the outline winds) picks its face */
  poly.forEach((p,i)=>{const q=poly[(i+1)%poly.length],dx=q[0]-p[0],dy=q[1]-p[1],out=dy*(p[0]+q[0])-dx*(p[1]+q[1])>=0,nx=out?dy:-dy,ny=out?-dx:dx,f=Math.abs(nx)>Math.abs(ny)?nx>0?"right":"left":ny>0?"front":"back";
    const A=b.armourMapJ[f],has=A&&A.id!=="none";g.strokeStyle=has?FT_MC[states["armour_"+f]||"intact"]:"#6B665D";g.globalAlpha=has?1:0.6;g.setLineDash(has?[]:[lw,lw*1.2]);
    g.beginPath();g.moveTo(X(p[0]),Y(p[1]));g.lineTo(X(q[0]),Y(q[1]));g.stroke();});
  g.setLineDash([]);g.globalAlpha=1;
  /* the wheels */
  const tw=cell*0.46,tl=cell*0.82;
  for(const p of b.parts){if(p.slot!=="wheels"||!p.pos)continue;const st=states[p.key]||"intact",x=X(p.pos[0]),y=Y(p.pos[1]);
    g.fillStyle=FT_MC[st];g.strokeStyle="#141413";g.lineWidth=Math.max(1,W/100);g.beginPath();if(g.roundRect)g.roundRect(x-tw*s/2,y-tl*s/2,tw*s,tl*s,tw*s*0.35);else g.rect(x-tw*s/2,y-tl*s/2,tw*s,tl*s);g.fill();g.stroke();
    if(st==="destroyed"){g.beginPath();g.moveTo(x-tw*s/2,y-tl*s/2);g.lineTo(x+tw*s/2,y+tl*s/2);g.stroke();}}
}
function ftEnd(){const F=FT.F;SCRAP_SOUND.stop();if(FT.rp&&FT.rp.reel){if(F.reason!=="stopped")ftEndSfx(F);rlClipEnd();return;}ftEndSfx(F);CONTROLS.unmount();if(!FT.rp)buzz([20,40,20]);ftRecord(F);ftVoiceEnd(F);
  const e=$("fEnd");if(!e||!FT.on)return;const B=FT.bout;let r=ftResult(F),btns='<button type="button" class="btn pri" data-fv="again">Rematch</button><button type="button" class="btn" data-fv="results">Results</button>';
  if(!FT.rp&&FT.ext&&FT.ext.kind==="daily"){const x=FT.ext.res;if(x)r={t:r.t,s:`${r.s} · ${x.score.toLocaleString("en-GB")} points${x.newBest?", today's best":""}`,cls:r.cls};btns=btns.replace(">Rematch<",">Try again<");}
  if(FT.rp&&FT.watch){const W=FT.watch,sc=ftWatchScore();
    if(W.k>=FT.rounds.length-1){toastHold(false);const x=W.banner;r={t:x.t,s:x.s,cls:x.cls};btns='<button type="button" class="btn pri" data-fv="evback">Back to the event</button><button type="button" class="btn" data-fv="results">Results</button>';}
    else{r={t:`Round ${W.k+1}: ${r.t}`,s:`${r.s} · ${sc.me}–${sc.them} in the bout.`,cls:r.cls};btns=`<button type="button" class="btn pri" data-fv="wnext">Round ${W.k+2}</button><button type="button" class="btn" data-fv="evback">Back to the event</button>`;}}
  else if(FT.rp){r={t:"Replay: "+r.t,s:r.s,cls:r.cls};btns='<button type="button" class="btn pri" data-fv="rpagain">Watch again</button><button type="button" class="btn" data-fv="results">Close</button>';}
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
      return`${ftCap(N(a))} ${e.k==="grind"?V(a,"grinds","grind"):V(a,"hits","hit")} ${N(v,1)} ${FT_FACE[e.f]||e.f}: ${J(e.E)}${e.n>1?` <small>(${e.n} small hits)</small>`:""}${e.gl?" <small>(glancing)</small>":""}${e.bay?` <small>(into the open weapon bay${e.bay===2?" underneath":""})</small>`:""}${plate}${e.x?" · "+ftParts(F,v,e.x):""}`;}
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
function ftRender(){const el=$("ftBody");if(!el)return;ftVoiceLoad();const bot=bBot(),cls=bCls(),c=SIM.CLASSES[cls];
  const chips=`<div class="seg bncls" role="group" aria-label="Weight class">${SIM.CLASS_IDS.map(id=>`<button type="button" data-ftcls="${id}" class="${id===cls?"on":""}" aria-pressed="${id===cls}">${SIM.CLASSES[id].name.replace("weight","")}</button>`).join("")}</div>`;
  const dl=dlCard(),ext=!!(FT.ext&&ftShown());
  if(!bot.cfg){if(!ext){FT.F=null;FT.rounds=[];FT.bout=null;}el.innerHTML=chips+ftEvCard()+dl+rlCard()+`<div class="card"><h3>Nothing fitted in the ${c.name} yet</h3><p>A fight uses the bot you've fitted, not the draft on the Build tab. Fit the draft first.</p>
    <div class="row"><button type="button" class="btn pri" data-ft="fit">Fit the draft</button><button type="button" class="btn" data-ft="build">Open Build</button></div></div>`+(ext?ftResHtml(ftShown()):"")+rcCard();if(ext)ftResPost(ftShown());return;}
  {const R0=ftShown()||FT.F;if(R0&&!FT.on&&!FT.ext&&(R0.cls!==cls||FT.sig!==bnSig(bot.cfg))){FT.F=null;FT.rounds=[];FT.bout=null;}}   // a refit ends the old fight
  const R=ftShown(),drafted=!(bot.draft&&bnSig(bot.draft)===bnSig(bot.cfg)),wp=SIM.part("weapon",bot.cfg.weapon),you=FT.style==="you";
  el.innerHTML=chips+ftEvCard()+dl+`<div class="card"><h3>Sparring</h3>
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
    ${R?ftResHtml(R):""}${rlCard()}${rcCard()}`;
  if(R)ftResPost(R);}
/* the shown fight's result, post-mortem and log (a spar, a daily round or a pasted replay code) */
function ftResHtml(R){const h=FT.ext?FT.ext.kind==="daily"?"Daily challenge":"From a replay code":FT.bout?"The bout":"Last fight";
  return`<div class="card" id="ftResCard"><h3>${h}</h3>${ftBoutHtml()}<p class="ftres" id="ftRes" role="status"></p><div id="ftJudge"></div><div id="ftHud"></div></div>
    ${rpHtml(R)}
    <div class="card"><h3>Fight log</h3><ol class="ftlog" id="ftLog" aria-label="Fight log"></ol></div>`;}
function ftResPost(R){ftHud(R);ftLog(R);rpDraw(R);ftVoicePm(R);}
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
    ${ftChips("ftopp","Club regulars",SIM.TEST_BUILDS.map(t=>[t.id,`${esc(lvOppName("tb:"+t.id,t.name))} <small>${esc(t.name.toLowerCase())}</small>`]),FT.opp)}
    <p class="hint" id="ftOppLine">${ftOppLine(cur)}</p></div>`;}
function ftOppLine(o){const tm=o.livery?`${lvBadge(o.livery,22,"in")}<b>${esc(o.name)}</b> · ${esc(o.livery.name)}`:`<b>${esc(o.name)}</b>`;
  if(!o.op)return`${tm}. A club regular's take on the ${esc(SIM.TEST_BUILDS.find(t=>t.id===o.id).name.toLowerCase())} test build, driven ${esc(SIM.AI_STYLES[SIM.autoStyle(SIM.evalBuild(o.cfg),ftArena(o.cfg.cls)) ].name.toLowerCase())}.`;
  const v=WORLD.venues[o.op.from];return`${tm}${v?` · ${esc(v.name)}`:""} · ${esc(SIM.part("weapon",o.cfg.weapon).name.toLowerCase())}, drives ${esc(SIM.AI_STYLES[o.driver.style].name.toLowerCase())}. ${esc(o.op.line)}`;}
function ftClick(e){const t=e.target;let x;
  if((x=t.closest("[data-ft]"))){const a=x.dataset.ft;
    if(a==="go")ftStart();
    else if(a==="replay")ftReplay(FT.rv);
    else if(a==="build")showTab("build");
    else if(a==="rcode")rcShareOpen();
    else if(a==="fix"){const id=x.dataset.sec;B.open={[id]:true};showTab("build");requestAnimationFrame(()=>{const r=document.querySelector(`#bRows [data-sec="${id}"]`);if(r){const P=$("panel"),bar=$("bwBar");P.scrollTo({top:P.scrollTop+r.getBoundingClientRect().top-(bar?bar.getBoundingClientRect().bottom:P.getBoundingClientRect().top)-8,behavior:document.documentElement.classList.contains("reduce")?"auto":"smooth"});const h=r.querySelector(".acch");if(h)h.focus({preventScroll:true});}});}
    else if(a==="career")showTab("career");
    else if(a==="fit"){const r=bEval();if(!r.valid){toast(r.totalG>r.limitG?"The draft is over the limit: fix it on the Build tab":"The draft can't be fitted: see the Build tab");return;}bFitOpen();}
    return;}
  if((x=t.closest("[data-ftcls]"))){ST().buildCls=x.dataset.ftcls;B.sel=null;B.delKey=null;FT.F=null;FT.rounds=[];FT.bout=null;FT.ext=null;save();ftRender();visBot();return;}
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
    let rt=0;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(FT.on)ftInsets();if(FT.on&&FT.view2d&&FT.F)DEBUGVIEW.draw($("fCv"),FT.F,FT.flashes,performance.now());},150);});}
  ftRender();};
