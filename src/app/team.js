/* ===================== app/team.js: R&D, team, sponsors, meta, rule changes, kit line =====================
   Plan section 12, in the career only (sparring stays free practice with everything open).
   R&D (RND): one project at a time. Starting one pays its price; then you put workshop hours into it from the Shop tab
     until it has its hours. A finished project goes into S.unlocks.rnd and unlocks the parts marked "rnd:<id>" (and your
     own disc profile, "disc", on the Build tab). Custom work (RND fab) also needs a fabricator on the team to fit.
   The team (STAFF): one person per role, hired from STAFF.people (S.staff [{id, y, w}]); salaries a season, paid a week
     at a time at Close week. Engineer: build and repair hours, and the stress report works out the impact and drop lines
     for the draft. Fabricator: custom work. Driver: drives your quick sims at a fixed skill. Pit crew: faster pit repairs.
   Sponsors (SPONSORS): offers after a podium (c.offers [{id, y}]), signed into S.sponsors [{id, y, w}]: their colour on
     the bot (SCRAP_VIS.setPaint) and a placing target for the season; renewed or dropped at the end of it (tmSeasonEnd).
   The meta (META_WAVES) orders who turns up at events, season by season; the rule changes (RULES_BY_SEASON) pile up:
     an energy cap, an extra hazard, a weight limit, a shorter count. crFightRules(cls, venue) hands career fights their arena
     and rules.
   The kit line (KIT_LINE, the Legacy act): one design published as a kit (c.kit); at the end of each season it fights the
     class's test builds and earns by its win rate and your rep. */
const TM={};   // UI state only, never saved
const tmPerson=id=>STAFF.people.find(p=>p.id===id)||null;
/* who's on the team in a role (career only), or null */
function tmHas(role){if(!crOn())return null;for(const s of S.staff){const p=tmPerson(s.id);if(p&&p.role===role)return p;}return null;}
const tmFirst=n=>String(n).split(" ")[0];
/* the career's PR 8 fields, there even on a career that somehow lacks them */
function tmC(){const c=S.career;if(!c.rnd||typeof c.rnd!=="object")c.rnd={cur:null,put:{}};if(!c.rnd.put)c.rnd.put={};if(!Array.isArray(c.offers))c.offers=[];if(c.kit===undefined)c.kit=null;return c;}

/* ---- R&D ---- */
const tmRndDone=id=>!crOn()||!!S.unlocks.rnd[id];
/* why it can't be started, or null */
function tmRndWhy(id){const R=RND[id],c=tmC();if(S.unlocks.rnd[id])return"done";
  if(c.act<R.act)return`opens in the ${TIME.acts[R.act].name} act`;
  if(R.needs&&!S.unlocks.tools[R.needs])return`needs a ${TOOLS[R.needs].name.toLowerCase()}`;
  if(c.rnd.cur&&c.rnd.cur!==id)return"one project at a time";
  return null;}
function tmRndStart(id){const R=RND[id],c=tmC();if(c.rnd.cur||tmRndWhy(id))return;if(c.money<R.price){toast(`Need ${fmt$(R.price-c.money)} more`);return;}
  crPay(R.price,`R&D: ${R.name.toLowerCase()}`);c.rnd.cur=id;c.rnd.put[id]=c.rnd.put[id]||0;save();hud();toast(`R&D started: ${R.name}`);}
/* put hours from this week into the project */
function tmRndWork(h){const c=tmC(),id=c.rnd.cur;if(!id)return;const R=RND[id],left=crR1(R.hours-(c.rnd.put[id]||0)),put=crR1(Math.min(h,left,c.hours));
  if(put<=0){toast(c.hours<=0?"No workshop hours left this week":"Nothing left to do");return;}
  c.hours=crR1(c.hours-put);c.rnd.put[id]=crR1((c.rnd.put[id]||0)+put);
  if(c.rnd.put[id]>=R.hours-1e-9){S.unlocks.rnd[id]=true;c.rnd.cur=null;delete c.rnd.put[id];save();hud();
    openSheet("R&D done",`<p><b>${esc(R.name)}</b> is ready.</p><p>${esc(R.line)}</p><p class="hint">${esc(tmRndUnlocks(id))}${R.fab&&!tmHas("fabricator")?" Fitting it needs a fabricator on the team (Shop tab → Team).":""}</p>`);buzz([10,30,10]);return;}
  save();hud();toast(`${put} h into ${R.name.toLowerCase()} · ${crR1(R.hours-c.rnd.put[id])} h to go`);}
function tmRndUnlocks(id){if(id==="disc")return"The Build tab's weapon row gets a Disc profile for any spinner.";const out=[];
  for(const slot in SIM.PARTS)for(const p of SIM.PARTS[slot])if(p.unlock==="rnd:"+id&&out.indexOf(p.name)<0)out.push(p.name);
  return out.length?"Unlocks: "+out.join(", ")+".":"";}

/* ---- the team ---- */
function tmHireWhy(p){const c=tmC();if(S.staff.some(s=>s.id===p.id))return"hired";if(c.act<p.act)return`talks to you in the ${TIME.acts[p.act].name} act`;return null;}
const tmWeek=p=>Math.round(p.salary/TIME.weeks);
function tmHire(id){const p=tmPerson(id),c=tmC();if(!p||tmHireWhy(p))return;if(c.money<tmWeek(p)){toast(`Not enough for ${p.name}'s first week (${fmt$(tmWeek(p))})`);return;}const cur=tmHas(p.role);
  if(cur)S.staff=S.staff.filter(s=>s.id!==cur.id);
  S.staff.push({id,y:c.year,w:c.week});crPay(tmWeek(p),`Wages: ${p.name} (first week)`);save();hud();toast(`${p.name} hired · ${fmt$(tmWeek(p))} a week, the first now`);}
function tmFire(id){const p=tmPerson(id);S.staff=S.staff.filter(s=>s.id!==id);save();if(p)toast(`${p.name} has gone`);}
/* Close week: the week's wages (not for someone hired this week: they were paid on hiring) */
function tmWages(){if(!crOn())return;const c=S.career;for(const s of S.staff){const p=tmPerson(s.id);if(p&&!(s.y===c.year&&s.w===c.week))crPay(tmWeek(p),`Wages: ${p.name}`);}}
const tmEngCut=()=>{const e=tmHas("engineer");return e?e.cut:0;};
/* a part that is custom work: the fabricator fits it */
function tmFab(slot,id){const p=SIM.part(slot,id);if(!p||!p.unlock)return false;const k=p.unlock.split(":");return k[0]==="rnd"&&!!(RND[k[1]]&&RND[k[1]].fab);}
const tmFabCut=()=>{const f=tmHas("fabricator");return f?f.cut:0;};
/* the pit window's repair seconds, less the pit crew's cut */
function tmPitS(kind){const c=tmHas("crew");return Math.round(REPAIR_TIMES[kind]*(c?1-c.cut:1));}
/* the skill your quick sims drive at: the hired driver's, else yours */
function tmDriver(){return tmHas("driver");}

/* ---- the meta and the rulebook ---- */
const crMeta=season=>META_WAVES[((season||0)%META_WAVES.length+META_WAVES.length)%META_WAVES.length];
/* the rules in force in a season: every change up to it */
function crRules(season){const r={capJ:0,koS:0,limit:{},hazards:{},list:[]};
  for(const x of RULES_BY_SEASON){if(x.season>season)continue;r.list.push(x);if(x.capJ)r.capJ=x.capJ;if(x.koS)r.koS=x.koS;if(x.limit)Object.assign(r.limit,x.limit);
    if(x.hazard)(r.hazards[x.hazard.arena]||(r.hazards[x.hazard.arena]=[])).push(x.hazard.h);}
  return r;}
const tmSeason=()=>crOn()?S.career.season:-1;
/* the class's weight limit this season (grams) */
function crLimitG(cls){const base=SIM.CLASSES[cls].limitG;if(!crOn())return base;const g=crRules(tmSeason()).limit[cls]||base,L=cls===LEGACY.cls?crLegend():0;
  return L?Math.round(g*(1-LEGACY.ballast*L)):g;}   // the champion's ballast (0.1.39): yours only, opponents build to the class limit
/* a career fight's arena (an ARENAS id, or a copy with the season's extra hazards) and its rules for newFight. The arena
   is the venue's (WORLD.venues[v].arena, 0.1.28.0) where it has one, else the class's own */
const crArenaId=(cls,venue)=>{const v=venue&&WORLD.venues[venue];return v&&v.arena&&SIM.ARENAS[v.arena]?v.arena:SIM.CLASSES[cls].arenaId;};
function crFightRules(cls,venue){const id=crArenaId(cls,venue);if(!crOn())return{arena:id,rules:undefined};const R=crRules(tmSeason()),rules={};
  if(R.capJ)rules.capJ=Math.round(R.capJ*SIM.classMult(cls).mass*10)/10;if(R.koS)rules.koS=R.koS;
  const extra=R.hazards[id],arena=extra?Object.assign({},SIM.ARENAS[id],{hazards:SIM.ARENAS[id].hazards.concat(extra)}):id;
  return{arena,rules:Object.keys(rules).length?rules:undefined};}
/* order a shuffled pool: the season's favoured weapons first (a stable sort keeps the shuffle inside each group) */
function crMetaOrder(pool,season){const fav=crMeta(season).favour;return pool.map((x,i)=>({x,i,f:fav.indexOf(SIM.normCfg(x.cfg).weapon)>=0?0:1})).sort((a,b)=>a.f-b.f||a.i-b.i).map(q=>q.x);}

/* ---- sponsors ---- */
const tmSp=id=>SPONSORS.find(s=>s.id===id)||null;
function tmTargetTxt(t){return t.top?`${t.top} podium${t.top>1?"s":""} (top two) this season`:t.win?`${t.win} win${t.win>1?"s":""} this season`:t.champ?`top ${t.champ} at the championship`:t.rep?`${t.rep} rep this season`:"";}
/* how a signed sponsor's target stands: {have, need, met, txt}. Only results since signing count. */
function tmProgress(s){const sp=tmSp(s.id),c=S.career,t=sp.target,since=r=>r.y===c.year&&(s.seq!=null?(r.seq||0)>s.seq:(s.y<c.year||r.w>s.w));const R=c.results.filter(since);
  if(t.top){const n=R.filter(r=>r.place&&r.place<=2).length;return{have:n,need:t.top,met:n>=t.top,txt:`${n} of ${t.top}`};}
  if(t.win){const n=R.filter(r=>r.place===1).length;return{have:n,need:t.win,met:n>=t.win,txt:`${n} of ${t.win}`};}
  if(t.champ){const a=Math.min(c.act,2),ch=SEASON_EVENTS.find(e=>e.act===a&&e.kind==="champ"),r=ch&&R.find(x=>x.ev===ch.id);const p=r&&r.place;return{have:p||0,need:t.champ,met:!!p&&p<=t.champ,txt:p?`placed ${p}`:"not fought yet"};}
  if(t.rep){const base=s.y===c.year&&s.rep!=null?s.rep:(c.repY0!=null?c.repY0:0),n=c.rep-base;return{have:n,need:t.rep,met:n>=t.rep,txt:`${Math.max(0,n)} of ${t.rep}`};}
  return{have:0,need:0,met:true,txt:""};}
/* after an event day: a podium may bring an offer from a sponsor whose rep bar you've passed and who isn't yours */
function tmAfterEvent(day,place){const c=tmC();if(!place||place>2)return null;
  const busy=new Set(S.sponsors.map(s=>s.id).concat(c.offers.map(o=>o.id)).concat((c.declined||[]).filter(d=>d.y===c.year).map(d=>d.id)));
  const can=SPONSORS.filter(s=>s.minRep<=c.rep&&!busy.has(s.id));if(!can.length)return null;
  const R=SIM.rng((c.seed^crHash(day.key+"/sponsor"))>>>0),sp=can.sort((a,b)=>b.minRep-a.minRep).slice(0,2)[Math.floor(R()*Math.min(2,can.length))];
  c.offers.push({id:sp.id,y:c.year});return sp;}
/* the pay for signing now: the season's money, less the weeks gone (at least a quarter) */
function tmSignPay(sp){const c=S.career;return Math.round(sp.pay*Math.max(0.25,(TIME.weeks-c.week+1)/TIME.weeks));}
/* a sponsor you dropped or swapped out won't offer again this season */
function tmGone(id){const c=S.career;(c.declined||(c.declined=[])).push({id,y:c.year});if(c.declined.length>12)c.declined.shift();}
function tmSign(id){const sp=tmSp(id),c=tmC();if(!sp)return;const clash=S.sponsors.find(s=>(tmSp(s.id)||{}).slot===sp.slot);
  if(S.sponsors.length>=SPONSOR_MAX&&!clash){toast("Two sponsors already");return;}
  if(clash){S.sponsors=S.sponsors.filter(s=>s!==clash);tmGone(clash.id);crLedger(0,`${tmSp(clash.id).name} dropped for ${sp.name}`);}
  c.offers=c.offers.filter(o=>o.id!==id);S.sponsors.push({id,y:c.year,w:c.week,rep:c.rep,seq:c.seq||0});crEarn(tmSignPay(sp),`Sponsor: ${sp.name}`);
  save();hud();tmPaint();toast(`${sp.name} signed`);buzz([10,30,10]);}
function tmDecline(id){const c=tmC();c.offers=c.offers.filter(o=>o.id!==id);tmGone(id);save();}
function tmDrop(id){S.sponsors=S.sponsors.filter(s=>s.id!==id);if(crOn())tmGone(id);save();tmPaint();}
/* the sponsors' colours for your bot (vis/bot.js): {side, top} */
function tmPaintCols(){const o={};if(!crOn())return o;for(const s of S.sponsors){const sp=tmSp(s.id);if(sp)o[sp.slot]=sp.colour;}return o;}
function tmPaint(){if(window.SCRAP_VIS&&SCRAP_VIS.setPaint)SCRAP_VIS.setPaint(tmPaintCols());visStage();}

/* ---- the kit line ---- */
const tmKitOpen=()=>crOn()&&S.career.act>=KIT_LINE.act;
/* the kit against the class's test builds (Sloppy budget aside): its win rate 0..1 */
function tmKitRate(cfg){const cls=cfg.cls,fr=crFightRules(cls);let w=0,n=0;
  for(const t of SIM.TEST_BUILDS){if(t.id==="sloppy")continue;for(let k=0;k<KIT_LINE.seeds;k++){const seed=(crHash(JSON.stringify(cfg)+t.id)+k*7919)>>>0;
    const r=SIM.runFight({seed,arena:fr.arena,rules:fr.rules,bots:[{cfg,driver:{style:"auto",skill:KIT_LINE.skill}},{cfg:Object.assign({},t.cfg,{cls}),driver:{style:"auto",skill:KIT_LINE.skill}}]});
    n++;if(r.winner===0)w++;else if(r.winner==null)w+=0.5;}}
  return n?w/n:0;}
const tmKitPay=(cls,rate)=>Math.round(KIT_LINE.base*SIM.CLASSES[cls].prizeScale*rate*(1+S.career.rep/KIT_LINE.repRef));
function tmKitPublish(name,cfg){const c=tmC();if(!tmKitOpen())return;if(c.kit&&c.kit.y===c.year){toast("One kit change a season");return;}
  const rate=tmKitRate(cfg);c.kit={name:String(name).slice(0,40),cfg:clone(cfg),cls:cfg.cls,y:c.year,rate,earned:0};save();
  toast(`${c.kit.name} is on sale · wins ${Math.round(rate*100)}% in testing`);}

/* ---- the end of a season: sponsors renew or go, the kit pays. Lines for the season sheet. ---- */
function tmSeasonEnd(){const c=tmC(),lines=[];
  for(const s of S.sponsors.slice()){const sp=tmSp(s.id);if(!sp){S.sponsors=S.sponsors.filter(x=>x!==s);continue;}const p=tmProgress(s);
    if(p.met){crEarn(sp.pay,`Sponsor renewed: ${sp.name}`);s.y=c.year+1;s.w=1;s.rep=null;lines.push(`<span class="ok">${esc(sp.name)} renews</span>: target met (${esc(p.txt)}). ${fmt$(sp.pay)} for next season.`);}
    else{S.sponsors=S.sponsors.filter(x=>x!==s);lines.push(`<span class="worn">${esc(sp.name)} drops you</span>: ${esc(tmTargetTxt(sp.target))}, you got ${esc(p.txt)}.`);}}
  c.offers=[];
  if(c.kit&&tmKitOpen()){const rate=tmKitRate(c.kit.cfg),pay=tmKitPay(c.kit.cls,rate);c.kit.rate=rate;c.kit.earned+=pay;if(pay>0)crEarn(pay,`Kit sales: ${c.kit.name}`);
    lines.push(`Kit line: <b>${esc(c.kit.name)}</b> won ${Math.round(rate*100)}% in testing and sold ${fmt$(pay)} worth.`);}
  const R=crRules(c.season+1),next=RULES_BY_SEASON.filter(x=>x.season===c.season+1),soon=RULES_BY_SEASON.filter(x=>x.season===c.season+2);
  if(next.length)lines.push(`New rules this season: ${next.map(x=>`<b>${esc(x.name)}</b>`).join(", ")}. ${next.map(x=>esc(x.line)).join(" ")}`);
  if(soon.length)lines.push(`<span class="hint">Announced for next season: ${soon.map(x=>esc(x.name.toLowerCase())).join(", ")}.</span>`);
  lines.push(`The meta: <b>${esc(crMeta(c.season+1).name.toLowerCase())}</b>. ${esc(crMeta(c.season+1).line)}`);
  void R;tmPaint();return lines;}

/* ---- cards ---- */
/* Shop tab: R&D */
function tmRndCard(){const c=tmC(),cur=c.rnd.cur;let h=`<div class="card"><h3>R&amp;D</h3>`;
  if(cur){const R=RND[cur],put=c.rnd.put[cur]||0,left=crR1(R.hours-put);
    h+=`<div class="tmcur"><p><b>${esc(R.name)}</b> <span class="readout">${crR1(put)} / ${R.hours} h</span></p><div class="tmbar" role="progressbar" aria-label="${esc(R.name)} progress" aria-valuemin="0" aria-valuemax="${R.hours}" aria-valuenow="${crR1(put)}"><i style="width:${Math.round(put/R.hours*100)}%"></i></div>
      <div class="row"><button type="button" class="btn sm" data-tm="work" data-h="4"${c.hours<=0?" disabled":""}>Put in 4 h</button><button type="button" class="btn sm" data-tm="work" data-h="${left}"${c.hours<=0?" disabled":""}>Put in ${crR1(Math.min(left,c.hours))} h</button></div>
      <p class="hint">${crR1(c.hours)} h left this week. ${left} h to go.</p></div>`;}
  h+=`<ul class="shlist">${RND_IDS.map(id=>{const R=RND[id],why=tmRndWhy(id),done=why==="done",on=cur===id;
    return`<li class="${done?"on":""}"><span class="nm"><b>${esc(R.name)}</b><small>${esc(R.line)}</small><small>${fmt$(R.price)} · ${R.hours} h${R.needs?` · needs a ${esc(TOOLS[R.needs].name.toLowerCase())}`:""}${R.fab?" · fitted by a fabricator":""}</small></span>
      ${done?'<span class="tag">done</span>':on?'<span class="tag">on it</span>':why?`<span class="tag lock">${esc(why)}</span>`:`<button type="button" class="btn sm" data-tm="rnd" data-id="${id}">${TM.ask==="rnd:"+id?"Sure? ":""}${fmt$(R.price)}</button>`}</li>`;}).join("")}</ul>
    <p class="hint">One project at a time: pay to start it, then put workshop hours in.</p></div>`;
  return h;}
/* Shop tab: the team */
function tmTeamCard(){const c=tmC(),wk=S.staff.reduce((a,s)=>{const p=tmPerson(s.id);return a+(p?tmWeek(p):0);},0);
  return`<div class="card"><h3>Team</h3>${Object.keys(STAFF.roles).map(role=>{const ppl=STAFF.people.filter(p=>p.role===role),cur=tmHas(role);
    return`<h4>${esc(STAFF.roles[role])}</h4><ul class="shlist">${ppl.map(p=>{const hired=cur&&cur.id===p.id,why=hired?null:tmHireWhy(p);
      return`<li class="${hired?"on":""}"><span class="nm"><b>${esc(p.name)}</b><small>${esc(p.line)}</small><small>${esc(tmStaffWhat(p))} · ${fmt$(p.salary)} a season (${fmt$(tmWeek(p))} a week)</small></span>
        ${hired?`<button type="button" class="btn sm ghost" data-tm="fire" data-id="${p.id}">${TM.ask==="fire:"+p.id?"Sure?":"Let go"}</button>`:why?`<span class="tag lock">${esc(why)}</span>`:`<button type="button" class="btn sm" data-tm="hire" data-id="${p.id}">${TM.ask==="hire:"+p.id?"Sure?":cur?"Swap in":"Hire"}</button>`}</li>`;}).join("")}</ul>`;}).join("")}
    <p class="hint">${wk?`Wages ${fmt$(wk)} a week, at Close week.`:"Nobody yet. Wages come out at Close week."}</p></div>`;}
function tmStaffWhat(p){if(p.role==="engineer")return`build and repair hours −${Math.round(p.cut*100)}%, impact and drop worked out on paper`;
  if(p.role==="fabricator")return`fits custom work, its hours −${Math.round(p.cut*100)}%`;
  if(p.role==="driver")return`drives your quick sims at skill ${Math.round(p.skill*100)}`;
  return`pit repairs ${Math.round(p.cut*100)}% faster`;}
/* Career tab: sponsors */
function tmSponsorCard(){const c=tmC();const mine=S.sponsors.map(s=>({s,sp:tmSp(s.id)})).filter(x=>x.sp),offers=c.offers.map(o=>tmSp(o.id)).filter(Boolean);
  if(!mine.length&&!offers.length)return`<div class="card"><h3>Sponsors</h3><p>No sponsors yet. A podium (top two) once you have some rep brings offers: money for their colour on your bot and a target for the season.</p></div>`;
  return`<div class="card"><h3>Sponsors</h3>${mine.length?`<ul class="tmsp">${mine.map(({s,sp})=>{const p=tmProgress(s);
      return`<li><span class="sw" style="background:${sp.colour}" aria-hidden="true"></span><span class="nm"><b>${esc(sp.name)}</b> <small>${sp.slot==="side"?"side panels":"top plate"} · ${fmt$(sp.pay)} a season</small><br><small>Target: ${esc(tmTargetTxt(sp.target))} · <span class="${p.met?"ok":"worn"}">${esc(p.txt)}</span></small></span><button type="button" class="btn sm ghost" data-tm="drop" data-id="${sp.id}">${TM.ask==="drop:"+sp.id?"Sure?":"Drop"}</button></li>`;}).join("")}</ul>`:""}
    ${offers.length?`<h4>Offers</h4><ul class="tmsp">${offers.map(sp=>{const clash=S.sponsors.find(s=>(tmSp(s.id)||{}).slot===sp.slot);
      return`<li><span class="sw" style="background:${sp.colour}" aria-hidden="true"></span><span class="nm"><b>${esc(sp.name)}</b><br><small>${esc(sp.line)}</small><br><small>${fmt$(tmSignPay(sp))} now, ${fmt$(sp.pay)} a season after · ${sp.slot==="side"?"side panels":"top plate"} · target: ${esc(tmTargetTxt(sp.target))}${clash?` · <span class="worn">replaces ${esc(tmSp(clash.id).name)}</span>`:""}</small></span>
        <span class="tmbtns"><button type="button" class="btn sm" data-tm="sign" data-id="${sp.id}">Sign</button><button type="button" class="btn sm ghost" data-tm="decline" data-id="${sp.id}">No</button></span></li>`;}).join("")}</ul><p class="hint">Offers lapse at the end of the season.</p>`:""}
    <p class="hint">Hit the target and they renew at the end of the season; miss it and they go.</p></div>`;}
/* Career tab: the season (meta and rules) */
function tmSeasonCard(){const c=S.career,m=crMeta(c.season),R=crRules(c.season),soon=RULES_BY_SEASON.filter(x=>x.season===c.season+1);
  return`<div class="card"><h3>The season</h3><p><b>${esc(m.name)}.</b> ${esc(m.line)}</p>
    ${R.list.length?`<p class="hint">Rules in force: ${R.list.map(x=>esc(x.name.toLowerCase())).join(", ")}.</p>`:""}
    ${soon.length?`<p class="hint">Next season: ${soon.map(x=>`<b>${esc(x.name)}</b>. ${esc(x.line)}`).join(" ")}</p>`:""}</div>`;}
/* Career tab: the kit line (Legacy act) */
function tmKitCard(){if(!tmKitOpen())return"";const c=tmC(),k=c.kit,opts=[];
  for(const cls of SIM.CLASS_IDS){const b=S.bots[cls];if(b&&b.cfg)opts.push({v:"fit:"+cls,t:`Your fitted ${SIM.CLASSES[cls].name.toLowerCase()}`});
    (S.designs[cls]||[]).forEach((d,i)=>opts.push({v:`d:${cls}:${i}`,t:`${d.name} (${SIM.CLASSES[cls].name.toLowerCase()})`}));}
  const can=!k||k.y!==c.year;
  return`<div class="card"><h3>Kit line</h3>${k?`<p><b>${esc(k.name)}</b> (${esc(SIM.CLASSES[k.cls].name.toLowerCase())}) is on sale: it wins ${Math.round(k.rate*100)}% in testing. Sales so far ${fmt$(k.earned)}.</p>`:"<p>Publish one of your designs as a kit. It earns at the end of each season, by how it does against the test builds and by your rep.</p>"}
    ${can&&opts.length?`<div class="field"><label class="lbl" for="tmKitSel">Design</label><select id="tmKitSel">${opts.map(o=>`<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("")}</select></div>
      <div class="field"><label class="lbl" for="tmKitName">Kit name</label><input id="tmKitName" maxlength="40" value="${esc(k?k.name:"Haldis Special")}"></div>
      <div class="row"><button type="button" class="btn" data-tm="kit">${k?"Replace the kit":"Publish"}</button></div><p class="hint">Testing it takes a moment. One change a season.</p>`:can?"<p class=\"hint\">Fit a bot or save a design first.</p>":"<p class=\"hint\">You can change the kit next season.</p>"}</div>`;}

/* ---- clicks (Shop and Career tabs; data-tm) ---- */
function tmSure(k){if(TM.ask===k){TM.ask=null;return true;}TM.ask=k;tmRedraw();return false;}
function tmRedraw(){if(curTab==="shop")shRender();else if(curTab==="career")crRender();}
function tmClick(e){const x=e.target.closest&&e.target.closest("[data-tm]");if(!x||!crOn())return false;const a=x.dataset.tm,id=x.dataset.id;
  if(a==="rnd"){if(!tmSure("rnd:"+id))return true;tmRndStart(id);}
  else if(a==="work")tmRndWork(+x.dataset.h||0);
  else if(a==="hire"){if(!tmSure("hire:"+id))return true;tmHire(id);}
  else if(a==="fire"){if(!tmSure("fire:"+id))return true;tmFire(id);}
  else if(a==="sign")tmSign(id);
  else if(a==="decline")tmDecline(id);
  else if(a==="drop"){if(!tmSure("drop:"+id))return true;tmDrop(id);}
  else if(a==="kit"){const v=($("tmKitSel")||{}).value||"",nm=(($("tmKitName")||{}).value||"").trim()||"Haldis Special",k=v.split(":");let cfg=null;
    if(k[0]==="fit"&&S.bots[k[1]])cfg=S.bots[k[1]].cfg;else if(k[0]==="d"&&S.designs[k[1]]&&S.designs[k[1]][+k[2]])cfg=Object.assign({},S.designs[k[1]][+k[2]].cfg,{cls:k[1]});
    if(cfg)tmKitPublish(nm,SIM.normCfg(cfg));}
  TM.ask=null;tmRedraw();return true;}
