/* ===================== app/career.js: the career and the Career tab =====================
   The career (plan section 11) lives in S.career (null until Start career; crFresh() gives its shape). Starting one is a
   fresh start (Kelbo, PR 7): Th 1,500 (TIME.startMoney), nothing fitted, hand tools only; saved designs stay as
   blueprints and the Beetle draft is the starter bot.
   Time: you act (fit, bench, repair, enter the week's event and fight it), then Close week: rent comes out, the week's
   workshop hours come in (WORKSHOP_STAGES; unused hours carry over up to TIME.bankWeeks weeks' worth). 52 weeks a
   season, 20 seasons. At the end of a season you move up an act (TIME.acts: Garage, Circuit, Heavyweight, Legacy) if
   you placed top two at the act's championship or your rep reached its repTo; the Heavyweight act only by winning the
   Scrapline Open Final (repTo is not used there).
   Events (SEASON_EVENTS, EVENT_KINDS): one a week at most, in your act's calendar and the one before's. Entering pays the
   entry fee, travel (WORLD.venues km and nights, x the stage's travel) and a pit kit (PIT_KITS x the class's prizeScale,
   or none), and takes the day's workshop hours. The field is drawn from the seed: rivals in the class, the class's named
   opponents, the test builds. Formats: a club meet is a four-bot round robin; tournaments and championships are
   eight-bot brackets with a best-of-three final; a rumble is one four-bot free-for-all; tag team is you and a partner
   against two. Before each of your fights: drive it (the Fight tab's fight mode, app/fight.js ftEvent, with the pit
   window after it when you have another fight) or Quick sim (the AI drives your bot at your driver skill and your crew
   does the pit work). The other fights are simulated. Damage carries through the day and home: S.bots[cls].damage and
   flags, repaired in the workshop card (REPAIR_COST / REPAIR_HOURS via rpBill, money and hours) or not at all.
   Money: prizes in, and out go parts (app/build.js), repairs, pit kits, entries, travel, tools and the workshop (Shop
   tab), rent. Going broke at Close week brings the Haldis Savings Bank's one loan; broke again ends the run.
   Driver skill: xp per fight (TIME.xp) sets your assist level (ASSISTS via crLevel, used by app/controls.js) and the
   skill a quick sim drives at. Rivals (RIVALS) remember every fight (S.rivals) and their bots take a step a season.
   Sparring on the Fight tab stays free practice with nothing kept (Kelbo, PR 7). */
const CR={};   // UI state only, never saved
const crOn=()=>!!(S.career&&!S.career.over);
const crHash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
const crStage=()=>WORKSHOP_STAGES.find(w=>w.id===(S.career&&S.career.stage))||WORKSHOP_STAGES[0];
const crAct=()=>TIME.acts[S.career?S.career.act:0]||TIME.acts[0];
const crHas=t=>!crOn()||t==="hand"||!!S.unlocks.tools[t];
const crKey=e=>S.career.year+":"+e.id;
const crR1=x=>Math.round(x*10)/10;
/* driver skill: the assist level and the quick-sim skill */
function crLevel(){if(!crOn())return"rookie";const xp=S.career.driverXp||0;let l="rookie";for(const[k,v]of TIME.levels)if(xp>=v)l=k;return l;}
function crSkill(){const x=S.career?S.career.driverXp||0:0;return Math.min(TIME.skill.max,TIME.skill.base+x*TIME.skill.perXp);}

/* ---- what the career allows: parts by tool, classes by act and workshop ---- */
function crPartLock(slot,id){if(!crOn())return null;const p=SIM.part(slot,id);if(!p||!p.unlock||p.unlock==="start")return null;
  const k=p.unlock.split(":");if(k[0]==="tool")return crHas(k[1])?null:"needs a "+(TOOLS[k[1]]?TOOLS[k[1]].name.toLowerCase():k[1]);
  return"needs R&D (PR 8)";}
/* every locked part in a cfg: [{slot, id, name, why}] */
function crCfgLocks(cfg){if(!crOn()||!cfg)return[];const c=SIM.normCfg(cfg),out=[],add=(slot,id)=>{const w=crPartLock(slot,id);if(w&&!out.some(x=>x.slot===slot&&x.id===id))out.push({slot,id,name:SIM.part(slot,id).name,why:w});};
  for(const s of["chassis","drive","wheels","battery","electronics","weapon"])add(s,c[s]);
  if(c.weapon!=="none")add("weaponMaterial",c.weaponMaterial);
  for(const f of SIM.FACES)add("armour",c.armour[f]);for(const e of c.extras)add("extras",e);return out;}
/* why a class can't be fitted yet in the career, or null */
function crClassLock(cls){if(!crOn())return null;const c=S.career;
  const ok=TIME.acts.slice(0,c.act+1).some(a=>a.classes.indexOf(cls)>=0);
  if(!ok){const a=TIME.acts.find(x=>x.classes.indexOf(cls)>=0);return`opens in the ${a?a.name:"next"} act`;}
  const st=crStage();if(SIM.CLASS_IDS.indexOf(cls)>SIM.CLASS_IDS.indexOf(st.maxCls)){const n=WORKSHOP_STAGES.find(w=>SIM.CLASS_IDS.indexOf(w.maxCls)>=SIM.CLASS_IDS.indexOf(cls));return`needs ${n?n.name.toLowerCase():"a bigger workshop"}`;}
  return null;}
/* why the draft can't be fitted in the career right now, or null */
function crFitBlock(cfg){if(!crOn())return null;if(S.career.day)return"You're at an event: fit after it";
  const cl=crClassLock(cfg.cls);if(cl)return`${SIM.CLASSES[cfg.cls].name} ${cl}`;
  const L=crCfgLocks(cfg);return L.length?`${L[0].name} ${L[0].why}${L.length>1?` (and ${L.length-1} more)`:""}`:null;}
/* tools cut build and repair hours: x (1 - cut) for each owned tool that names the slot, down to half */
function crCut(slot){if(!crOn())return 1;let m=1;for(const t of TOOL_IDS)if(S.unlocks.tools[t]){const c=TOOLS[t].cut;m*=1-((c[slot]||0)+(c.all||0));}return Math.max(0.5,m);}
function crFitHours(bill){return crR1(bill.lines.reduce((a,l)=>a+l.hours*crCut(l.slot),0));}
const CR_KIND_SLOT={wheel:"wheels",pod:"drive",armour:"armour",battery:"battery",electronics:"electronics",weapon:"weapon",extras:"extras",chassis:"chassis"};

/* ---- money ---- */
function crLedger(amt,what){const c=S.career;c.ledger.unshift({y:c.year,w:c.week,what,amt:Math.round(amt)});if(c.ledger.length>60)c.ledger.length=60;}
function crPay(amt,what){amt=Math.round(amt);if(!amt)return;S.career.money-=amt;crLedger(-amt,what);}
/* prize money: half goes to the bank while a loan is owed */
function crEarn(amt,what){const c=S.career;amt=Math.round(amt);if(!amt)return;c.money+=amt;crLedger(amt,what);
  if(c.loan.owed>0){const k=Math.min(c.loan.owed,Math.round(amt*TIME.loanShare));c.loan.owed-=k;c.money-=k;crLedger(-k,`Loan repayment to ${WORLD.bank}`);}}

/* ---- start ---- */
function crFresh(){const st=WORKSHOP_STAGES[0];return{seed:((Date.now()&0x7fffffff)^0x5C1A)>>>0,year:WORLD.startYear,week:1,season:0,act:0,
  money:TIME.startMoney,loan:{taken:false,owed:0},hours:st.hours*TIME.bankWeeks,driverXp:0,rep:0,stage:st.id,
  events:{},entered:null,day:null,results:[],ledger:[],broke:0,over:false,done:false,seasons:[]};}
/* the starter bot: the default build with anything a fresh career can't fit swapped for what it can */
const CR_START={chassis:"hdpe",drive:"dual",wheels:"rubber",battery:"large",electronics:"dual",weapon:"vsp",weaponMaterial:"steel",armour:"hdpe15"};
function crStarter(cls){const c=clone(SIM.DEFAULT_CFG);c.cls=cls;
  for(const s of["chassis","drive","wheels","battery","electronics","weapon","weaponMaterial"])if(crPartLock(s,c[s]))c[s]=CR_START[s];
  for(const f of SIM.FACES)if(crPartLock("armour",c.armour[f]))c.armour[f]=CR_START.armour;
  c.extras=c.extras.filter(e=>!crPartLock("extras",e));c.layout={};return SIM.normCfg(c);}
/* UI state that belongs to one game: cleared on a new career, a loaded slot or a restored code */
function crReset(){CR.end=null;CR.seen=false;CR.kit=null;CR.restartAsk=false;FT.F=null;FT.rounds=[];FT.bout=null;}
function crStart(){crReset();S.career=crFresh();S.unlocks.tools={hand:true};S.rivals={};S.lastFight=null;S.bots={};
  ST().buildCls="beetle";const b=bBot("beetle");b.draft=crStarter("beetle");bNormed.add(b.draft);
  crLedger(TIME.startMoney,"Savings");save();hud();closeSheet();crRender();toast(`Career started · ${fmt$(TIME.startMoney)}`);}

/* ---- the calendar ---- */
function crCalendar(){const a=Math.min(S.career.act,2);return SEASON_EVENTS.filter(e=>e.act===a||e.act===a-1).sort((x,y)=>x.week-y.week);}
const crThisWeek=()=>crCalendar().find(e=>e.week===S.career.week)||null;
const crEv=id=>SEASON_EVENTS.find(e=>e.id===id);
function crEntry(e){return Math.round(EVENT_KINDS[e.kind].entry*SIM.CLASSES[e.cls].prizeScale);}
function crPrize(e,i){const p=EVENT_KINDS[e.kind].prizes;return Math.round((p[Math.min(i,p.length-1)]||0)*SIM.CLASSES[e.cls].prizeScale);}
function crTravel(e){const v=WORLD.venues[e.venue],st=crStage();return{cost:Math.round(v.km*2*TIME.perKm*st.travel+v.nights*TIME.night),hours:TIME.eventHours+v.nights*TIME.nightHours,nights:v.nights};}
const crKitPrice=(kit,cls)=>kit==="none"?0:Math.round(PIT_KITS[kit].price*SIM.CLASSES[cls].prizeScale);
/* why you can't enter, or null */
function crCantEnter(e,kit){const c=S.career,b=S.bots[e.cls];
  if(c.events[crKey(e)])return"Already done this season";
  const cl=crClassLock(e.cls);if(cl)return`${SIM.CLASSES[e.cls].name}: ${cl}`;
  if(!b||!b.cfg)return`No ${SIM.CLASSES[e.cls].name.toLowerCase()} fitted yet`;
  const t=crTravel(e),cost=crEntry(e)+t.cost+crKitPrice(kit||"none",e.cls);
  if(c.money<cost)return`Need ${fmt$(cost-c.money)} more`;
  if(c.hours<t.hours)return`It takes ${t.hours} h of your week; you have ${crR1(c.hours)} h`;
  return null;}

/* ---- rivals ---- */
function crBaseCfg(base,cls){const k=base.split(":");
  if(k[0]==="op"){const op=SIM.OPPONENTS.find(o=>o.id===k[1]);if(op)return Object.assign(SIM.opponentCfg(op),{cls});}
  const t=SIM.TEST_BUILDS.find(x=>x.id===k[1])||SIM.TEST_BUILDS[0];return Object.assign(clone(t.cfg),{cls});}
function crMerge(cfg,step){const c=clone(cfg);for(const k in step){if(k==="armour")Object.assign(c.armour,step.armour);else if(k==="extras")c.extras=Array.from(new Set(c.extras.concat(step.extras)));else c[k]=step[k];}return c;}
function crRivalLevel(rv){const m=S.rivals[rv.id]||{};return(S.career?S.career.season:0)+Math.floor((m.w||0)/2);}
function crRivalCfg(rv,cls){let cfg=crBaseCfg(rv.bots[cls].base,cls);const n=Math.min(crRivalLevel(rv),rv.steps.length);
  for(let i=0;i<n;i++){const t=crMerge(cfg,rv.steps[i]);if(SIM.evalBuild(t).valid)cfg=t;}return cfg;}
function crTalk(rv){const m=S.rivals[rv.id];if(!m||!m.last)return rv.talk.first;if(m.last.won&&m.run>=2)return rv.talk.streak;return m.last.won?rv.talk.lost:rv.talk.won;}   // last.won: you won it

/* ---- the field: who else is there ---- */
function crField(e){const c=S.career,k=EVENT_KINDS[e.kind],R=SIM.rng((c.seed^crHash(crKey(e)))>>>0),cls=e.cls;
  const skill=Math.min(EVENT_SKILL_MAX,k.skill+EVENT_SKILL_ACT*e.act),out=[];
  const rv=RIVALS.filter(r=>r.bots[cls]).map(r=>({id:"rv:"+r.id,rival:r.id,name:r.bots[cls].name,who:r.name,cfg:crRivalCfg(r,cls),driver:{style:"auto",skill:Math.min(EVENT_SKILL_MAX,Math.max(skill,r.skill+0.03*crRivalLevel(r)))}}));
  const pool=SIM.OPPONENTS.filter(o=>o.cls===cls).map(o=>({id:"op:"+o.id,name:o.name,cfg:SIM.opponentCfg(o),driver:{style:o.driver.style,skill:Math.max(skill,o.driver.skill)}}))
    .concat(SIM.TEST_BUILDS.filter(t=>t.id!=="sloppy"||e.kind==="club").map(t=>({id:"tb:"+t.id,name:t.name,cfg:Object.assign(clone(t.cfg),{cls}),driver:{style:"auto",skill}})));
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(R()*(i+1)),t=pool[i];pool[i]=pool[j];pool[j]=t;}
  /* rivals come to the bigger days; a club meet gets one of them at most */
  const nRv=e.kind==="club"?Math.min(1,rv.length):rv.length;for(let i=rv.length-1;i>0;i--){const j=Math.floor(R()*(i+1)),t=rv[i];rv[i]=rv[j];rv[j]=t;}
  const need=k.size-1;for(const x of rv.slice(0,nRv))if(out.length<need)out.push(x);for(const x of pool)if(out.length<need)out.push(x);
  return out;}
/* a new event day: field[0] is you */
function crNewDay(e,kit){const c=S.career,b=bBot(e.cls),k=EVENT_KINDS[e.kind];
  const me={id:"you",name:"You",cfg:clone(b.cfg),driver:null,dmg:clone(b.damage||{}),flags:Object.assign({},b.flags||{}),left:kit==="none"?{}:Object.assign({},PIT_KITS[kit].allow)};
  const crew=Object.assign({},PIT_KITS[k.crewKit].allow),field=[me].concat(crField(e).map(x=>Object.assign(x,{dmg:{},flags:{},left:Object.assign({},crew)})));
  if(e.kind==="tag"){const p=field[3];field.splice(3,1);field.splice(1,0,p);p.partner=true;}   // you and field[1] against field[2] and field[3]
  const day={key:crKey(e),ev:e.id,cls:e.cls,kind:e.kind,kit,seed:(c.seed^crHash(crKey(e)+"/day"))>>>0,field,fights:[],done:false,out:false};
  if(k.format==="league"){day.fx=[[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];day.i=0;day.res=[];field.forEach(f=>{f.pts=0;f.diff=0;});}
  else if(k.format==="bracket"){day.rd=0;day.pairs=[[0,1],[2,3],[4,5],[6,7]];day.won=[null,null,null,null];day.lost={};}
  return day;}
/* your next fight today: {idx: field indexes, teams, bo, label} or null */
function crNext(day){if(!day||day.done)return null;const k=EVENT_KINDS[day.kind];
  if(k.format==="league"){const f=day.fx[day.i];if(!f||f[0]!==0)return null;const n=day.res.filter(r=>r.a===0).length;return{idx:f,teams:null,bo:1,label:["first fight","second fight","last fight"][n]||"fight"};}
  if(k.format==="bracket"){if(day.lost[0]!=null)return null;const p=day.pairs.findIndex(x=>x[0]===0||x[1]===0);if(p<0||day.won[p]!=null)return null;
    const pr=day.pairs[p],nm=["quarter-final","semi-final","final"][day.rd]||"round";return{idx:pr[0]===0?pr:[pr[1],pr[0]],teams:null,bo:day.pairs.length===1?3:1,label:nm,p};}
  if(day.fights.length)return null;
  if(k.format==="tag")return{idx:[0,1,2,3],teams:[0,0,1,1],bo:1,label:"tag match"};
  return{idx:[0,1,2,3],teams:[0,1,2,3],bo:1,label:"rumble"};}
const crArena=day=>SIM.CLASSES[day.cls].arenaId;
const crMatchSeed=(day,idx,n)=>(day.seed+crHash(idx.join(",")+"#"+n+"#"+(day.rd||0)))>>>0;
const crEvals=new Map();
function crB(e){const k=JSON.stringify(e.cfg);let b=crEvals.get(k);if(!b){b=SIM.evalBuild(e.cfg);crEvals.set(k,b);if(crEvals.size>40)crEvals.delete(crEvals.keys().next().value);}return b;}
const crFlags=f=>{const o={};if(f.bent)o.bent=true;if(f.smoke)o.smoke=true;if(f.cell)o.cell=true;if(f.esc)o.esc=f.esc;return o;};
/* a bot spec for newFight from a field entry: you are the AI at your driver skill in a quick sim, else the player */
function crSpec(day,i,team,quick){const e=day.field[i];return{cfg:e.cfg,name:e.name,team,driver:i===0?(quick?{style:"auto",skill:crSkill()}:null):e.driver,damage:clone(e.dmg),flags:Object.assign({},e.flags)};}
/* a finished bout: the winning team (most rounds; level goes to the smaller damage share, then the first) */
function crBoutWinner(wins,F,teams){let best=null,bw=-1,tie=false;for(const t of teams){const w=wins[t]||0;if(w>bw){bw=w;best=t;tie=false;}else if(w===bw)tie=true;}
  if(!tie)return best;const top=teams.filter(t=>(wins[t]||0)===bw),sh=t=>{const os=F.bots.filter(o=>o.team===t);return os.reduce((a,o)=>a+SIM.damageShare(o.b,o.st)+(o.out?1:0),0)/Math.max(1,os.length);};
  return top.sort((a,b)=>sh(a)-sh(b)||a-b)[0];}
/* a whole match without anyone watching: rounds to the bo, the crews' pit work between */
function crSimMatch(day,idx,teams,bo,quick){const T=teams||idx.map((_,k)=>k),wins={},Fs=[],need=Math.ceil(bo/2);
  for(let n=0;n<bo;n++){const F=SIM.newFight({seed:crMatchSeed(day,idx,n),arena:crArena(day),bots:idx.map((i,k)=>crSpec(day,i,T[k],quick))});
    const cap=Math.ceil(F.rules.roundS*SIM.STEP_HZ)+2;let s=0;while(!F.over&&s++<cap)SIM.stepFight(F,null);
    Fs.push(F);crCarry(day,idx,F);if(F.winner!=null)wins[F.winner]=(wins[F.winner]||0)+1;
    if(Object.keys(wins).some(t=>wins[t]>=need))break;
    if(n<bo-1)for(const i of idx)if(i!==0||quick)crCrew(day,i);}
  return{wt:crBoutWinner(wins,Fs[Fs.length-1],Array.from(new Set(T))),wins,Fs,teams:T};}
function crCarry(day,idx,F){F.bots.forEach((o,k)=>{const e=day.field[idx[k]];e.dmg=SIM.damageTaken(o.b,o.st);e.flags=crFlags(o.flags);});}
/* a crew's pit work between fights (pitAuto, app/pit.js) */
function crCrew(day,i){const e=day.field[i];if(!e.left||!Object.keys(e.left).length)return[];return pitAuto(crB(e),e.dmg,e.flags,e.left);}

/* a match is over: put it in the day's table or bracket. res {wt, teams, Fs} */
function crRecord(day,nx,res,stopped){const k=EVENT_KINDS[day.kind],idx=nx.idx,F=res.Fs[res.Fs.length-1];
  const winIdx=idx[res.teams.indexOf(res.wt)];
  if(k.format==="league"){const a=idx[0],b=idx[1],draw=!stopped&&res.Fs.length===1&&F.winner==null,w=draw?null:winIdx;
    day.res.push({a,b,w});const sa=SIM.damageShare(F.bots[0].b,F.bots[0].st),sb=SIM.damageShare(F.bots[1].b,F.bots[1].st);
    if(w==null){day.field[a].pts+=1;day.field[b].pts+=1;}else day.field[w].pts+=3;
    day.field[a].diff+=sb-sa;day.field[b].diff+=sa-sb;day.i++;}
  else if(k.format==="bracket"){const p=day.pairs.findIndex(x=>x.indexOf(idx[0])>=0&&x.indexOf(idx[1])>=0);day.won[p]=winIdx;day.lost[winIdx===idx[0]?idx[1]:idx[0]]=day.rd;}
  else day.rank=crRank(F,res.wt,res.teams,stopped);
  if(idx.indexOf(0)>=0){const me=res.teams[idx.indexOf(0)],won=res.wt===me;
    day.fights.push({label:nx.label,vs:crAnd(idx.filter((i,k)=>res.teams[k]!==me).map(i=>day.field[i].name)),won,draw:k.format==="league"&&day.res[day.res.length-1].w==null,
      score:nx.bo>1?`${res.wins[me]||0}–${Object.keys(res.wins).filter(t=>+t!==me).reduce((a,t)=>a+res.wins[t],0)}`:"",how:stopped?"forfeit":F.reason,t:F.endT});
    for(const [kk,i] of idx.entries())if(res.teams[kk]!==me&&day.field[i].rival)crRivalMeet(day.field[i].rival,won);}}
const crAnd=a=>a.length>1?a.slice(0,-1).join(", ")+" and "+a[a.length-1]:a.join("");
/* a rumble or tag team's finishing order by team: the winner, then who's still going, then the least damaged */
function crRank(F,wt,teams,stopped){const T=Array.from(new Set(teams)),sc=t=>{const os=F.bots.filter(o=>o.team===t);return os.reduce((a,o)=>a+(o.out||o.fx.dead?2:0)+SIM.damageShare(o.b,o.st),0)/os.length;};
  return T.sort((a,b)=>(a===wt?-1:b===wt?1:0)||(stopped?(a===0?1:b===0?-1:0):0)||sc(a)-sc(b));}
function crRivalMeet(id,won){const m=S.rivals[id]||(S.rivals[id]={w:0,l:0,run:0});if(won){m.w++;m.run=m.last&&m.last.won?m.run+1:1;}else{m.l++;m.run=0;}
  const c=S.career;m.last={y:c.year,wk:c.week,ev:c.day?crEv(c.day.ev).name:"",won};}
/* play every fight that isn't yours until it's your turn or the day is over */
function crAdvance(day){const k=EVENT_KINDS[day.kind];let guard=0;
  while(!day.done&&guard++<40){
    if(k.format==="league"){const f=day.fx[day.i];if(!f){day.done=true;break;}if(f[0]===0)break;
      const res=crSimMatch(day,f,null,1,false);crRecord(day,{idx:f,bo:1,label:""},res,false);for(const i of f)crCrew(day,i);continue;}
    if(k.format==="bracket"){let open=false;
      for(let p=0;p<day.pairs.length;p++){if(day.won[p]!=null)continue;const pr=day.pairs[p];if(pr.indexOf(0)>=0&&day.lost[0]==null){open=true;continue;}
        const res=crSimMatch(day,pr,null,day.pairs.length===1?3:1,false);crRecord(day,{idx:pr,bo:1,label:""},res,false);for(const i of pr)if(i!==0)crCrew(day,i);}
      if(open)break;
      if(day.pairs.length===1){day.done=true;day.champ=day.won[0];break;}
      const w=day.won;day.pairs=[];for(let i=0;i<w.length;i+=2)day.pairs.push([w[i],w[i+1]]);day.won=day.pairs.map(()=>null);day.rd++;continue;}
    if(day.fights.length||day.rank)day.done=true;break;}
  if(day.done)crFinish(day);}
/* your placing: 1-based, and what it's called */
function crPlace(day){const k=EVENT_KINDS[day.kind];
  if(k.format==="league"){const order=day.field.map((f,i)=>i).sort((a,b)=>day.field[b].pts-day.field[a].pts||day.field[b].diff-day.field[a].diff||a-b);return order.indexOf(0)+1;}
  if(k.format==="bracket"){if(day.champ===0)return 1;const r=day.lost[0];return r===2?2:r===1?3:4;}
  return day.rank?day.rank.indexOf(0)+1:k.size;}
function crPlaceTxt(kind,place){const f=EVENT_KINDS[kind].format;
  if(f==="bracket")return["","won it","runner-up","semi-finalist","out in the quarter-finals"][place]||"";
  if(f==="tag")return place===1?"won it":"lost";
  return["","1st","2nd","3rd","4th"][place]||place+"th";}
/* the day is over: prize, rep, the damage goes home with the bot */
function crFinish(day){const c=S.career,e=crEv(day.ev),k=EVENT_KINDS[day.kind],place=crPlace(day);
  const pi=k.format==="bracket"?Math.min(place-1,3):place-1,prize=crPrize(e,pi),rep=k.rep[Math.min(pi,k.rep.length-1)]||0;
  if(prize>0)crEarn(prize,`${e.name}: ${crPlaceTxt(day.kind,place)}`);c.rep+=rep;
  const b=bBot(day.cls),me=day.field[0];if(bnSig(b.cfg)===bnSig(me.cfg)){b.damage=clone(me.dmg);b.flags=crFlags(me.flags);}
  c.events[day.key]={place,prize,rep};
  c.results.unshift({y:c.year,w:c.week,ev:e.id,name:e.name,cls:day.cls,kind:day.kind,place,prize,rep,fights:day.fights});if(c.results.length>40)c.results.length=40;
  c.last={key:day.key,place,prize,rep};c.entered=null;c.day=null;CR.end={name:e.name,place,prize,rep,kind:day.kind};save();hud();}

/* ---- your fights ---- */
function crQuick(){const c=S.career,day=c.day,nx=crNext(day);if(!nx)return;
  const res=crSimMatch(day,nx.idx,nx.teams,nx.bo,true);crAfterMine(day,nx,res,false,false);
  ftShowSim(res.Fs,res,day,nx);CR.seen=true;const f=day.fights[day.fights.length-1];
  toast(`${f.draw?"Draw":f.won?"Won":"Lost"}: ${f.label} vs ${f.vs}`);}
function crDrive(){const c=S.career,day=c.day,nx=crNext(day);if(!nx)return;const e=crEv(day.ev),T=nx.teams||[0,1];
  ST().buildCls=day.cls;day.live=nx.label;save();showTab("fight");
  ftEvent({arena:crArena(day),bots:nx.idx.map((i,k)=>crSpec(day,i,T[k],false)),seed:crMatchSeed(day,nx.idx,0),seedN:n=>crMatchSeed(day,nx.idx,n),bo:nx.bo,teams:T,
    kit:day.kit,left:nx.idx.map(i=>day.field[i].left||{}),label:nx.label,title:e.name,
    onDone:(B,F)=>{CR.seen=true;delete day.live;const res={wt:B.stopped?T.find(t=>t!==T[0]):crBoutWinner(B.wins,F,Array.from(new Set(T))),wins:B.wins,Fs:FT.rounds.map(r=>r.F),teams:T};
      nx.idx.forEach((i,k)=>{if(B.dmg[k]){day.field[i].dmg=B.dmg[k];day.field[i].flags=crFlags(B.flags[k]||{});}});
      crAfterMine(day,nx,res,true,!!B.stopped);return crBanner(day,nx,res);},
    pit:()=>{const n2=crNext(S.career.day);return n2&&day.kit!=="none"?{dmg:day.field[0].dmg,flags:day.field[0].flags,kit:day.kit,left:day.field[0].left,title:`Pit window · ${n2.label} next`}:null;}});}
/* a driven fight the app closed on (reload, the phone killed it): it counts as a forfeit, so a losing fight can't be
   fought again by reloading. Recorded against an unstarted fight with the bots as they went in. */
function crLiveCheck(){const c=S.career,day=c&&c.day;if(!day||!day.live||(FT.bout&&FT.bout.ev&&!FT.bout.over))return;
  const nx=crNext(day);delete day.live;if(!nx){save();return;}const T=nx.teams||[0,1];
  const F=SIM.newFight({seed:crMatchSeed(day,nx.idx,0),arena:crArena(day),bots:nx.idx.map((i,k)=>crSpec(day,i,T[k],false))});
  const res={wt:T.find(t=>t!==T[0]),wins:{},Fs:[F],teams:T};
  crRecord(day,nx,res,true);for(const i of nx.idx)if(i!==0)crCrew(day,i);crAdvance(day);save();hud();
  toast(`The ${nx.label} was left unfinished: counted as a forfeit`);}
/* after one of your matches: xp, the record, your crew's pit work after a quick sim, then the other fights */
function crAfterMine(day,nx,res,driven,stopped){const c=S.career,me=res.teams[0];
  c.driverXp+=(driven?TIME.xp.drive:TIME.xp.sim)+(res.wt===me&&!stopped?TIME.xp.win:0);
  crRecord(day,nx,res,stopped);
  for(const i of nx.idx)if(i!==0)crCrew(day,i);
  crAdvance(day);
  if(!driven&&c.day&&crNext(c.day))crCrew(c.day,0);   // quick sim: your crew does the pit work before your next fight
  save();hud();}
/* the banner at the bell of an event bout (app/fight.js shows it) */
function crBanner(day,nx,res){const me=res.teams[0],won=res.wt===me,e=crEv(day.ev),k=EVENT_KINDS[day.kind];const last=day.fights[day.fights.length-1]||{};
  const more=S.career.day&&crNext(S.career.day);let s;
  if(CR.end&&CR.end.name===e.name)s=`${e.name}: ${crPlaceTxt(day.kind,CR.end.place)}${CR.end.prize?` · ${fmt$(CR.end.prize)}`:""}.`;
  else s=more?`Next: the ${more.label}.`:"";
  const t=last.how==="forfeit"?"Forfeited":k.format==="rumble"&&CR.end?(CR.end.place===1?"You win the rumble":`You finish ${crPlaceTxt(day.kind,CR.end.place)}`):last.draw?"A draw":won?`You win the ${nx.label}`:`You lose the ${nx.label}`;
  return{t:t+(last.score?" "+last.score:""),s,cls:last.draw?"":won?"ok":"broke",pit:!!(more&&day.kit!=="none"&&Object.keys(day.field[0].left).some(x=>day.field[0].left[x]>0))};}

/* ---- the workshop: repairs ---- */
function crBill(cls){const bot=S.bots[cls];if(!bot||!bot.cfg)return null;const b=SIM.evalBuild(bot.cfg),st=SIM.damageState(b,bot.damage||{}),flags=bot.flags||{};
  const bill=rpBill({b,st,flags});for(const l of bill.lines)l.hours=crR1(l.hours*crCut(CR_KIND_SLOT[l.kind]||l.kind));bill.hours=crR1(bill.lines.reduce((a,l)=>a+l.hours,0));bill.b=b;return bill;}
function crFix(cls,key){const c=S.career;if(c.day){toast("Fix it after the event");return;}const bill=crBill(cls);if(!bill)return;
  const lines=key?bill.lines.filter(l=>l.key===key):bill.lines;if(!lines.length)return;
  const cost=lines.reduce((a,l)=>a+l.cost,0),h=crR1(lines.reduce((a,l)=>a+l.hours,0));
  if(c.money<cost){toast(`Need ${fmt$(cost-c.money)} more`);return;}if(c.hours<h){toast(`That takes ${h} h; you have ${crR1(c.hours)} h this week`);return;}
  const bot=S.bots[cls];bot.flags=bot.flags||{};for(const l of lines)pitApply(bill.b,bot.damage,bot.flags,l.key,l.key==="weapon"?"disc":l.key==="battery"?"battery":"swap");
  bot.flags=crFlags(bot.flags);crPay(cost,`Repairs: ${SIM.CLASSES[cls].name.toLowerCase()}${key?", "+lines[0].name:""}`);c.hours=crR1(c.hours-h);save();hud();crRender();toast(`Fixed · ${fmt$(cost)} · ${h} h`);}

/* ---- Close week, the bank, the season ---- */
function crClose(force){const c=S.career;if(!crOn())return;
  if(c.day&&!force){openSheet("Close the week?",`<p>You're entered in <b>${esc(crEv(c.day.ev).name)}</b> and it isn't over. Closing the week forfeits the rest of it; the damage so far comes home with the bot.</p><div class="row"><button type="button" class="btn pri" data-cr="close-ok">Forfeit and close the week</button></div>`);return;}
  if(c.day){const d=c.day;d.out=true;const b=bBot(d.cls);if(bnSig(b.cfg)===bnSig(d.field[0].cfg)){b.damage=clone(d.field[0].dmg);b.flags=crFlags(d.field[0].flags);}
    c.events[d.key]={place:null,prize:0,rep:0,forfeit:true};c.day=null;c.entered=null;}
  closeSheet();const st=crStage();crPay(st.rent,`Rent: ${st.name.toLowerCase()}`);CR.end=null;c.last=null;
  if(c.money<0&&crBroke())return;
  c.week++;if(c.week>TIME.weeks){crSeasonEnd();}
  c.hours=crR1(Math.min(st.hours*TIME.bankWeeks,c.hours+st.hours));save();hud();crRender();
  const e=crThisWeek();toast(`Week ${c.week}${e?` · ${e.name} this week`:""}`);}
/* rent you can't pay: the one loan, or the end */
function crBroke(){const c=S.career;c.broke++;
  if(!c.loan.taken){c.loan={taken:true,owed:Math.round(TIME.loan*(1+TIME.loanRate))};c.money+=TIME.loan;crLedger(TIME.loan,`Loan from ${WORLD.bank}`);save();hud();
    openSheet("Broke",`<p>The rent bounced. ${esc(ftCap(WORLD.bank))} lends you <b>${fmt$(TIME.loan)}</b>, once. You owe ${fmt$(c.loan.owed)}; half of every prize goes to paying it back.</p><p class="hint">They won't do it twice.</p>`);return false;}
  c.over=true;save();hud();crRender();
  openSheet("The end of the line",`<p>Broke again, and ${esc(WORLD.bank)} doesn't lend twice. The workshop's keys go back to the owner.</p><p>${crSummary()}</p><div class="row"><button type="button" class="btn pri" data-cr="restart">Start a new career</button></div><p class="hint">Your designs stay.</p>`);return true;}
function crSummary(){const c=S.career,wins=c.results.filter(r=>r.place===1).length;return`${c.season+1} season${c.season?"s":""} · ${c.results.length} events · ${wins} won · rep ${c.rep}`;}
function crSeasonEnd(){const c=S.career,a=Math.min(c.act,2),act=TIME.acts[c.act],ch=SEASON_EVENTS.find(e=>e.act===a&&e.kind==="champ"),r=ch&&c.events[c.year+":"+ch.id];
  const best=c.results.filter(x=>x.y===c.year).sort((x,y)=>x.place-y.place||y.prize-x.prize)[0];
  let up=false;if(c.act<2&&((r&&r.place&&r.place<=2)||c.rep>=act.repTo))up=true;else if(c.act===2&&r&&r.place===1)up=true;
  c.seasons.push({y:c.year,act:c.act,rep:c.rep,money:c.money,best:best?`${best.name}: ${crPlaceTxt(best.kind,best.place)}`:null});
  if(up)c.act++;c.year++;c.season++;c.week=1;
  if(c.season>=WORLD.seasons){c.over=true;c.done=true;}
  setTimeout(()=>openSheet(c.done?"Twenty seasons":"A new season",`<p>${c.done?"That's the career: twenty seasons.":`Season ${c.season+1}, ${c.year}.`} ${best?`Best of last season: ${esc(best.name)}, ${crPlaceTxt(best.kind,best.place)}.`:"Nothing entered last season."}</p>
    ${up?`<p class="ok"><b>Up to the ${esc(TIME.acts[c.act].name)} act.</b> ${esc(TIME.acts[c.act].line)}</p>`:c.act===2?`<p class="hint">To move up: win the ${esc(ch.name)}.</p>`:c.act<3?`<p class="hint">To move up: place top two at the ${esc(ch.name)}, or reach rep ${act.repTo} (you have ${c.rep}).</p>`:""}
    ${c.done?`<p>${crSummary()}</p><div class="row"><button type="button" class="btn pri" data-cr="restart">Start a new career</button></div>`:`<p class="hint">Your rivals have been busy over the winter.</p>`}`),200);}

/* ---- the tab ---- */
function crRender(){const el=$("crBody");if(!el)return;crLiveCheck();const c=S.career;
  if(!c){el.innerHTML=`<div class="card"><h3>Start a career</h3><p>Twenty seasons from ${esc(WORLD.home)} to ${esc(WORLD.open)}. You start with <b>${fmt$(TIME.startMoney)}</b>, hand tools and ${WORKSHOP_STAGES[0].hours} workshop hours a week.</p>
    <p class="hint">A fresh start: what you've fitted while sparring isn't kept (it was free). Your saved designs stay, to load and pay for.</p>
    <div class="row"><button type="button" class="btn pri" data-cr="start">Start a career</button></div></div>${crHelpCard()}`;return;}
  if(c.over){el.innerHTML=`<div class="card"><h3>${c.done?"Twenty seasons":"The end of the line"}</h3><p>${crSummary()}</p><div class="row"><button type="button" class="btn pri" data-cr="restart">Start a new career</button></div><p class="hint">Your designs stay.</p></div>${crResultsCard()}`;return;}
  el.innerHTML=crStatusCard()+crEventCard()+crRepairCard()+crCalendarCard()+crRivalsCard()+crResultsCard()+
    `<p class="hint"><button type="button" class="lnk" data-cr="restart-ask">${CR.restartAsk?"Sure? This ends this career (designs stay)":"Start a new career"}</button></p>`;}
function crHelpCard(){return`<div class="card"><h3>How a week works</h3><p>Fit and test your bot, repair it, enter the week's event and fight it, then <b>Close week</b>: the rent comes out and the next week's workshop hours come in.</p>
  <p>Events pay prizes and rep. Tools in the Shop unlock parts and cut build hours. Top two at the championship, or enough rep, moves you up an act at the end of the season.</p></div>`;}
function crStatusCard(){const c=S.career,st=crStage(),act=crAct(),lv=crLevel(),next=TIME.levels.find(l=>l[1]>(c.driverXp||0));
  return`<div class="card crstat"><h3>${esc(act.name)} act · season ${c.season+1}</h3>
    <dl class="crdl"><div><dt>Week</dt><dd class="readout">${c.week} / ${TIME.weeks}</dd></div><div><dt>Money</dt><dd class="readout">${fmt$(c.money)}</dd></div>
      <div><dt>Workshop</dt><dd class="readout">${crR1(c.hours)} h</dd></div><div><dt>Rep</dt><dd class="readout">${c.rep}</dd></div>
      <div><dt>Driver</dt><dd>${lv}<small>${next?` · ${next[1]-c.driverXp} xp to ${next[0]}`:""}</small></dd></div><div><dt>Bank</dt><dd>${c.loan.owed>0?`<span class="worn">owe ${fmt$(c.loan.owed)}</span>`:c.loan.taken?"loan repaid":"no loan"}</dd></div></dl>
    <p class="hint">${esc(ftCap(st.name))}: ${fmt$(st.rent)} rent at Close week, ${st.hours} h a week (up to ${st.hours*TIME.bankWeeks} h saved up).</p>
    <div class="row"><button type="button" class="btn pri" data-cr="close">Close week</button></div></div>`;}
function crEventCard(){const c=S.career;
  if(CR.end&&!c.day)return`<div class="card"><h3>${esc(CR.end.name)}</h3><p class="${CR.end.place===1?"ok":""}">You ${CR.end.place===1?"<b>won it</b>":"finished "+crPlaceTxt(CR.end.kind,CR.end.place)}${CR.end.prize?` · ${fmt$(CR.end.prize)}`:""}${CR.end.rep?` · rep +${CR.end.rep}`:""}.</p>${crFightsHtml(c.results[0]?c.results[0].fights:[])}
    <p class="hint">Damage comes home with the bot: see the workshop below. Close the week when you're done.</p></div>`;
  if(c.day)return crDayCard(c.day);
  const e=crThisWeek();if(!e){const n=crCalendar().find(x=>x.week>c.week);return`<div class="card"><h3>This week</h3><p>No event this week.${n?` Next: <b>${esc(n.name)}</b> in week ${n.week} (${n.week-c.week} week${n.week-c.week>1?"s":""}).`:""} Build, test, repair, then close the week.</p></div>`;}
  const r=c.events[crKey(e)];if(r)return`<div class="card"><h3>${esc(e.name)}</h3><p>${r.forfeit?"Forfeited.":"Done: "+crPlaceTxt(e.kind,r.place)+"."}</p></div>`;
  const why=crCantEnter(e,"none");
  return`<div class="card"><h3>This week: ${esc(e.name)}</h3>${crEvLine(e)}${crRivalsAt(e)}
    ${why?`<p class="worn">${esc(why)}</p>`:""}<div class="row"><button type="button" class="btn pri" data-cr="enter"${why&&!/^Need|takes/.test(why)?" disabled":""}>Enter…</button></div></div>`;}
function crEvLine(e){const k=EVENT_KINDS[e.kind],v=WORLD.venues[e.venue],t=crTravel(e);
  const fmt=k.format==="league"?"four-bot round robin, three fights":k.format==="bracket"?"eight-bot bracket, best-of-three final":k.format==="rumble"?"four-bot rumble":"you and a partner against two";
  return`<p>${esc(SIM.CLASSES[e.cls].name)} · ${esc(k.name.toLowerCase())} at ${esc(v.name)} · ${fmt}.</p>
    <p class="hint">Entry ${fmt$(crEntry(e))} · travel ${fmt$(t.cost)}${t.nights?`, ${t.nights} night${t.nights>1?"s":""} away`:""} · ${t.hours} h of your week · first prize ${fmt$(crPrize(e,0))}.</p>`;}
function crRivalsAt(e){const rs=RIVALS.filter(r=>r.bots[e.cls]);if(!rs.length)return"";return`<p class="hint">Rivals in the class: ${rs.map(r=>esc(r.name)).join(", ")}.</p>`;}
function crEnterOpen(){const c=S.career,e=crThisWeek();if(!e)return;const f=EVENT_KINDS[e.kind].format,noPit=f==="rumble"||f==="tag";
  CR.kit=noPit?"none":CR.kitPick||"basic";const t=crTravel(e);
  const kits=[["none","No kit","free"]].concat(Object.keys(PIT_KITS).map(k=>[k,PIT_KITS[k].name.replace(" kit",""),fmt$(crKitPrice(k,e.cls))]));
  const tot=()=>crEntry(e)+t.cost+crKitPrice(CR.kit,e.cls);
  openSheet("Enter "+e.name,`${crEvLine(e)}${noPit?`<p class="hint">One fight and no pit window, so no pit kit.</p>`:`<div class="field"><span class="lbl">Pit kit</span>${segHtml("crKit","crkit",kits,CR.kit)}<p class="hint" id="crKitLine">${crKitLine(e)}</p></div>`}
    <ul class="bill"><li><span>Entry</span><span>${fmt$(crEntry(e))}</span></li><li><span>Travel</span><span>${fmt$(t.cost)}</span></li><li><span>Pit kit</span><span id="crKitP">${fmt$(crKitPrice(CR.kit,e.cls))}</span></li><li><b>Total</b><b id="crTot">${fmt$(tot())}</b></li></ul>
    <p class="hint">You have ${fmt$(c.money)} and ${crR1(c.hours)} h; the day takes ${t.hours} h. Your fitted ${esc(SIM.CLASSES[e.cls].name.toLowerCase())} goes as it is${crDmgTxt(e.cls)}.</p>
    <p class="worn" id="crWhy"></p><div class="row"><button type="button" class="btn pri" data-cr="enter-ok">Enter</button></div>`);
  const upd=()=>{$("crKitP").textContent=fmt$(crKitPrice(CR.kit,e.cls));$("crTot").textContent=fmt$(tot());if($("crKitLine"))$("crKitLine").textContent=crKitLine(e);const w=crCantEnter(e,CR.kit);$("crWhy").textContent=w||"";document.querySelector('[data-cr="enter-ok"]').disabled=!!w;};
  if($("crKit"))$("crKit").addEventListener("click",ev=>{const b=ev.target.closest("[data-crkit]");if(!b)return;CR.kit=CR.kitPick=b.dataset.crkit;$("crKit").querySelectorAll("button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});upd();});upd();}
function crKitLine(e){return CR.kit==="none"?"No spares: the pit window has nothing to work with.":PIT_KITS[CR.kit].line+" "+Object.keys(PIT_KITS[CR.kit].allow).map(k=>`${PIT_NAMES[k].toLowerCase()} ${PIT_KITS[CR.kit].allow[k]}`).join(" · ");}
function crDmgTxt(cls){const b=S.bots[cls];if(!b||!b.cfg)return"";const bill=crBill(cls);return bill&&bill.lines.length?`, <span class="worn">damage and all (${bill.lines.length} part${bill.lines.length>1?"s":""} still broken)</span>`:"";}
function crEnter(){const c=S.career,e=crThisWeek();if(!e)return;const kit=CR.kit||"none",w=crCantEnter(e,kit);if(w){toast(w);return;}const t=crTravel(e);
  crPay(crEntry(e),`${e.name}: entry`);crPay(t.cost,`${e.name}: travel`);if(kit!=="none")crPay(crKitPrice(kit,e.cls),`${e.name}: ${PIT_KITS[kit].name.toLowerCase()}`);
  c.hours=crR1(c.hours-t.hours);c.entered=crKey(e);c.day=crNewDay(e,kit);crAdvance(c.day);save();hud();closeSheet();crRender();toast(`Entered ${e.name}`);}
function crDayCard(day){const e=crEv(day.ev),k=EVENT_KINDS[day.kind],nx=crNext(day),me=day.field[0],b=crB(me),st=SIM.damageState(b,me.dmg),sh=SIM.damageShare(b,st);
  const opp=nx?nx.idx.filter((i,kk)=>(nx.teams||[0,1])[kk]!==(nx.teams||[0,1])[0]).map(i=>day.field[i]):[];const rv=opp.map(o=>o.rival&&RIVALS.find(r=>r.id===o.rival)).filter(Boolean);
  const partner=k.format==="tag"?day.field[1]:null;
  return`<div class="card crday"><h3>${esc(e.name)} <small>${esc(WORLD.venues[e.venue].name)}</small></h3>
    ${crTable(day)}
    <p>Your bot: damage <span class="${sh>0.5?"broke":sh>0.15?"worn":"ok"}">${Math.round(sh*100)}%</span>${Object.keys(me.flags).length?` · <span class="worn">${crFlagTxt(me.flags)}</span>`:""} · kit: ${day.kit==="none"?"none":Object.keys(me.left).map(x=>`${PIT_NAMES[x].toLowerCase()} ${me.left[x]}`).join(", ")}</p>
    ${crFightsHtml(day.fights)}
    ${nx?`<div class="crnext"><p><b>Next: the ${esc(nx.label)}</b>${nx.bo>1?" (best of three)":""} against ${crAnd(opp.map(o=>`<b>${esc(o.name)}</b>${o.who?` (${esc(o.who)})`:""}`))}${partner?`, with ${esc(partner.name)} as your partner`:""}.</p>
      ${rv.map(r=>`<p class="crtalk">“${esc(crTalk(r))}” <small>${esc(r.name)}</small></p>`).join("")}
      <div class="row"><button type="button" class="btn pri" data-cr="drive">Drive it</button><button type="button" class="btn" data-cr="quick">Quick sim</button></div>
      <p class="hint">Quick sim: the AI drives your bot at your skill (${crLevel()}) and your crew does the pit work. Less driver xp.</p></div>`:`<p class="hint">Waiting on the other fights…</p>`}</div>`;}
function crFlagTxt(f){return[f.bent?"bent disc":"",f.smoke?"battery smoking":"",f.cell?"battery on its last cell":"",f.esc?`${f.esc} speed controller dead`:""].filter(Boolean).join(", ");}
function crFightsHtml(fs){if(!fs||!fs.length)return"";return(CR.seen&&FT.rounds.length?`<p class="hint"><button type="button" class="lnk" data-cr="see">Watch your last fight</button> (results, post-mortem, replay)</p>`:"")+`<ul class="crfights">${fs.map((f,i)=>`<li><span class="${f.draw?"":f.won?"ok":"broke"}">${f.how==="forfeit"?"forfeit":f.draw?"draw":f.won?"won":"lost"}</span> ${esc(ftCap(f.label))} vs ${esc(f.vs)}${f.score?` <span class="readout">${f.score}</span>`:""} <small>${f.how==="ko"?"by knockout":f.how==="pit"?"into the pit":f.how==="forfeit"?"":"on the judges"}</small></li>`).join("")}</ul>`;}
/* the round robin's table, or the bracket so far */
function crTable(day){const k=EVENT_KINDS[day.kind],nm=i=>i===0?"<b>You</b>":esc(day.field[i].name);
  if(k.format==="league"){const order=day.field.map((f,i)=>i).sort((a,b)=>day.field[b].pts-day.field[a].pts||day.field[b].diff-day.field[a].diff||a-b);
    return`<table class="crtab"><thead><tr><th scope="col">Table</th><th scope="col">Played</th><th scope="col">Points</th></tr></thead><tbody>${order.map(i=>`<tr><th scope="row">${nm(i)}</th><td class="readout">${day.res.filter(r=>r.a===i||r.b===i).length}</td><td class="readout">${day.field[i].pts}</td></tr>`).join("")}</tbody></table>`;}
  if(k.format==="bracket"){const rd=["Quarter-finals","Semi-finals","Final"][day.rd]||"";return`<p class="hint">${rd}: ${day.pairs.map((p,i)=>`${nm(p[0])} v ${nm(p[1])}${day.won[i]!=null?` → ${nm(day.won[i])}`:""}`).join(" · ")}</p>`;}
  if(k.format==="tag")return`<p class="hint">You and ${esc(day.field[1].name)} against ${esc(day.field[2].name)} and ${esc(day.field[3].name)}.</p>`;
  return`<p class="hint">In the arena: you, ${day.field.slice(1).map(f=>esc(f.name)).join(", ")}.</p>`;}
function crRepairCard(){const rows=SIM.CLASS_IDS.map(cls=>({cls,bill:crBill(cls)})).filter(x=>x.bill&&x.bill.lines.length);if(!rows.length)return"";
  return`<div class="card"><h3>Workshop: repairs</h3>${rows.map(({cls,bill})=>`<h4>${esc(SIM.CLASSES[cls].name)} <small class="readout">${fmt$(bill.cost)} · ${bill.hours} h</small></h4>
    <ul class="crrep">${bill.lines.map(l=>`<li><span>${esc(ftCap(l.name))} <small class="${l.state==="destroyed"?"broke":"worn"}">${l.state==="destroyed"?(l.key==="chassis"?"rebuild":"re-buy"):Math.round(l.lost*100)+"% gone"}</small></span><span class="readout">${fmt$(l.cost)} · ${l.hours} h</span><button type="button" class="btn sm" data-crfix="${cls}" data-crkey="${esc(l.key)}">Fix</button></li>`).join("")}</ul>
    <div class="row"><button type="button" class="btn" data-crfix="${cls}">Fix all · ${fmt$(bill.cost)}</button></div>`).join("")}
    <p class="hint">A bot goes to its next event with whatever isn't fixed.</p></div>`;}
function crCalendarCard(){const c=S.career,list=crCalendar().filter(e=>e.week>=c.week).slice(0,8);
  return`<div class="card"><h3>Calendar</h3>${list.length?`<ul class="crcal">${list.map(e=>{const r=c.events[crKey(e)],lock=crClassLock(e.cls),fit=S.bots[e.cls]&&S.bots[e.cls].cfg;
    return`<li class="${e.week===c.week?"now":""}"><span class="wk readout">wk ${e.week}</span><span class="nm">${esc(e.name)}<small>${esc(SIM.CLASSES[e.cls].name)} · ${esc(WORLD.venues[e.venue].name)} · entry ${fmt$(crEntry(e))} · first ${fmt$(crPrize(e,0))}${r?` · <b>${r.forfeit?"forfeited":crPlaceTxt(e.kind,r.place)}</b>`:lock?` · <span class="worn">${esc(lock)}</span>`:!fit?` · <span class="worn">nothing fitted</span>`:""}</small></span></li>`;}).join("")}</ul>`:"<p>Nothing left this season. Close the weeks out to the new year.</p>"}</div>`;}
function crRivalsCard(){const c=S.career,cls=TIME.acts[c.act].classes;
  return`<div class="card"><h3>Rivals</h3><ul class="crriv">${RIVALS.map(r=>{const m=S.rivals[r.id]||{w:0,l:0},bc=cls.find(x=>r.bots[x])||Object.keys(r.bots)[0];
    return`<li><b>${esc(r.name)}</b> <small>${esc(WORLD.venues[r.from].name)} · ${esc(r.bots[bc].name)} (${esc(SIM.CLASSES[bc].name.toLowerCase())}, ${esc(SIM.part("weapon",crRivalCfg(r,bc).weapon).name.toLowerCase())})</small><br><span class="hint">${esc(r.line)}</span>
      ${m.w+m.l?`<br><span>You <span class="readout">${m.w}–${m.l}</span> against them${m.last?` · last: ${esc(m.last.ev)}, ${m.last.won?"you won":"they won"}`:""}</span>`:""}</li>`;}).join("")}</ul></div>`;}
function crResultsCard(){const c=S.career;if(!c||!c.results.length)return"";
  return`<div class="card"><h3>Results</h3><ul class="crres">${c.results.slice(0,10).map(r=>`<li><span class="readout">${r.y} wk ${r.w}</span> ${esc(r.name)}: <b class="${r.place===1?"ok":""}">${crPlaceTxt(r.kind,r.place)}</b>${r.prize?` · ${fmt$(r.prize)}`:""}</li>`).join("")}</ul></div>`;}
function crClick(e){const x=e.target.closest("[data-cr],[data-crfix]");if(!x)return;
  if(x.dataset.crfix){crFix(x.dataset.crfix,x.dataset.crkey||null);return;}
  const a=x.dataset.cr;
  if(a==="start"){if(S.career)return;openSheet("Start a career",`<p>You start with ${fmt$(TIME.startMoney)} in ${esc(WORLD.home)}. Bots fitted while sparring are cleared; designs stay.</p><div class="row"><button type="button" class="btn pri" data-cr="start-ok">Start</button></div>`);}
  else if(a==="close")crClose(false);
  else if(a==="enter")crEnterOpen();
  else if(a==="drive")crDrive();
  else if(a==="quick"){crQuick();crRender();}
  else if(a==="see"){const d=S.career.day,r=S.career.results[0];ST().buildCls=d?d.cls:r?r.cls:ST().buildCls;showTab("fight");const el=$("ftResCard");if(el)el.scrollIntoView({block:"start"});}
  else if(a==="restart-ask"){if(CR.restartAsk){CR.restartAsk=false;crRestart();}else{CR.restartAsk=true;crRender();}}}
function crRestart(){S.career=null;closeSheet();crStart();}
/* sheet buttons are outside the tab */
document.addEventListener("click",e=>{const x=e.target.closest&&e.target.closest("[data-cr]");if(!x||!$("sheet").contains(x))return;const a=x.dataset.cr;
  if(a==="start-ok")crStart();else if(a==="enter-ok")crEnter();else if(a==="close-ok")crClose(true);else if(a==="restart")crRestart();});
TAB_RENDER.career=function(){if(!crRender.bound){crRender.bound=true;$("tab-career").addEventListener("click",crClick);}crRender();};
