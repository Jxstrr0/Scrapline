/* ===================== app/school.js: THE DRIVING SCHOOL (0.1.47.0) =====================
   The Fight tab's School page (Kelbo: drills with medals). Eight short drills from SIM.DRILLS (sim/school.js), each a
   round in the real fight sim in the school's own beetleweight, painted in your team's colours: the same bot for
   everyone, so a medal is driving and not parts. Free in both modes; nothing costs and nothing carries over.
   S.school (inside scr-save, SAVE_V 16) keeps {<drill id>: {m, best, n}}: the best medal (0 none, 1 bronze, 2 silver,
   3 gold), the best score and the tries. A stopped drill doesn't count.
     scCard()      the page             scStart(id)   drive a drill        scRecord(F)   a finished drill
     scDemo(id)    the instructor (SIM.drillAuto) drives it, played back as a replay; it scores nothing
     scNote(F)     the line under the clock           scClock(F)           the clock's own text
     scResult(F)   the bell's banner */
const SC_MEDAL=["No medal","Bronze","Silver","Gold"],SC_COL=["","#C0834F","#B8BEC6","#E2B43B"];
const scState=()=>{if(!buObjS(S.school))S.school={};return S.school;};
const scRec=id=>{const r=scState()[id];return buObjS(r)?{m:Math.max(0,Math.min(3,r.m|0)),best:typeof r.best==="number"&&isFinite(r.best)?r.best:null,n:r.n|0}:{m:0,best:null,n:0};};
function scFmt(d,v){if(v==null)return"no score";return d.kind==="hit"?`${Math.round(v)} J`:`${(+v).toFixed(d.kind==="hold"?1:2)} s`;}
const scChip=m=>m?`<span class="medal" style="--mc:${SC_COL[m]}"><i aria-hidden="true"></i>${SC_MEDAL[m]}</span>`:`<span class="medal none">No medal yet</span>`;
function scTargets(d){return[3,2,1].map(m=>`${SC_MEDAL[m]} <span class="readout">${scFmt(d,d.medals[3-m])}</span>`).join(" · ")+(d.kind==="time"?" or less":" or more");}
function scMe(){return{name:"School bot",livery:lvMine()};}
function scBusy(){if(FT.on)return true;if(FT.bout&&!FT.bout.over){toast("Finish the bout first");return true;}return false;}
function scStart(id){const sp=SIM.drillSpec(id,scMe());if(!sp||scBusy())return;lvField(sp.bots);sp.fx=true;
  FT.you=true;FT.sig="school";FT.rounds=[];FT.rv=0;FT.rp=null;FT.bout=null;FT.ext={kind:"school",id};FT.open="sc:"+id;
  ftGo(SIM.newFight(sp));}
function scRecord(F){const D=F.drill;if(!D||F.reason==="stopped"||!FT.ext||FT.ext.demo)return;const d=SIM.DRILLS.find(q=>q.id===D.id),st=scState(),r=scRec(D.id);
  const nb=D.score!=null&&D.medal>0&&(r.best==null||(d.kind==="time"?D.score<r.best:D.score>r.best));
  st[D.id]={m:Math.max(r.m,D.medal),best:nb?D.score:r.best,n:r.n+1};FT.ext.res={score:D.score,medal:D.medal,newBest:nb,up:D.medal>r.m};save();}
/* the instructor's run: the sim with drillAuto on the stick, then the same fight again from its log as a replay */
function scDemo(id){const sp=SIM.drillSpec(id,{name:"The instructor",livery:lvMine()});if(!sp||scBusy())return;lvField(sp.bots);
  const F=SIM.newFight(sp);let k=0;while(!F.over&&k++<60*120)SIM.stepFight(F,{0:SIM.drillAuto(F)});
  const log=SIM.fightResult(F).log;if(log.noReplay){toast("The demonstration wouldn't play back");return;}
  F.recorded=true;FT.rounds=[{F,log}];FT.rv=0;FT.bout=null;FT.rp=null;FT.ext={kind:"school",id,demo:true};FT.sig="school";FT.open="sc:"+id;
  ftReplay(0);}
function scWhy(F){const D=F.drill;return D.why==="pit"?"In the pit":D.why==="ko"?"Counted out":D.why==="time"&&D.kind==="time"?"Out of time":"";}
function scResult(F){const D=F.drill,d=SIM.DRILLS.find(q=>q.id===D.id),x=FT.ext&&FT.ext.res,demo=FT.ext&&FT.ext.demo;
  if(D.kind==="time"&&!D.pass)return{t:scWhy(F)||"Not finished",s:`${d.name}: ring ${Math.min(D.k+1,D.n)} of ${D.n}. Bronze is ${scFmt(d,d.medals[2])}.`,cls:"broke"};
  const pen=D.pen>0.05?` (${D.pen.toFixed(1)} s of it on the lit grate)`:"";
  return{t:demo?`The instructor: ${scFmt(d,D.score)}`:D.medal?`${SC_MEDAL[D.medal]} medal`:"No medal",
    s:`${d.name}: ${scFmt(d,D.score)}${pen}${x&&x.newBest?" · your best":""}${D.medal<3?` · ${SC_MEDAL[D.medal+1]} is ${scFmt(d,d.medals[2-D.medal])}`:""}`,cls:D.medal?"ok":""};}
function scClock(F){const D=F.drill;return D.kind==="time"?(D.t0==null?"0.0":(F.t-D.t0+D.pen).toFixed(1)):ftT(Math.max(0,F.rules.roundS-F.t));}
function scNote(F){const D=F.drill,d=SIM.DRILLS.find(q=>q.id===D.id);
  if(D.kind==="hold")return`In the ring ${D.hold.toFixed(1)} s`;
  if(D.kind==="hit")return`Best hit ${Math.round(D.big)} J`;
  const me=F.bots[0];if(me.inverted&&!me.b.height.drivesInverted)return"Upside down: self-right";
  if(D.t0==null)return"The clock starts when you move";
  const s=D.steps[D.k];return s&&s.pit?"Box in the pit":`Ring ${Math.min(D.k+1,D.n)} of ${D.n}${D.pen>0.05?` · +${D.pen.toFixed(1)} s grate`:""}`;}
function scCard(){const L=SIM.DRILLS,recs=L.map(d=>scRec(d.id)),got=recs.filter(r=>r.m>0).length,gold=recs.filter(r=>r.m===3).length,ex=FT.ext&&FT.ext.kind==="school"&&!FT.ext.demo&&ftShown()?FT.ext:null;
  let h=`<div class="card"><h3>Driving school</h3><p>Eight short drills in the school's own beetleweight, the same bot for everyone, so a medal is driving and not parts. Free, in either mode.</p>
    <p class="hint"><span class="readout">${got}</span> of ${L.length} drills with a medal${gold?` · <span class="readout">${gold}</span> gold`:""}</p></div>`;
  L.forEach((d,i)=>{const r=recs[i],o=FT.open==="sc:"+d.id,res=ex&&ex.id===d.id&&ex.res?ex.res:null,F=res?ftShown():null;
    h+=`<div class="acc${o?" open":""}" data-ftrow="sc:${d.id}"><button type="button" class="acch" aria-expanded="${o}"><span class="t">${esc(d.name)}</span><span class="sum">${scChip(r.m)}</span><span class="chev"></span></button><div class="accb">
      ${res&&F&&F.drill?`<p class="ftres ${res.medal?"ok":""}" role="status" id="ftResCard">${esc(scResult(F).t)} · <span class="readout">${esc(scFmt(d,res.score))}</span>${res.newBest?" · your best":""}</p>`:""}
      <p>${esc(d.line)}</p><p class="hint">${esc(d.tip)}</p>
      <p class="hint">${scTargets(d)}</p>
      <p class="hint">${r.n?`Your best: <span class="readout">${esc(scFmt(d,r.best))}</span> · ${r.n} ${r.n===1?"try":"tries"}`:"Not driven yet."}</p>
      <div class="row"><button type="button" class="btn pri" data-sc="go" data-id="${d.id}">Drive it</button><button type="button" class="btn" data-sc="demo" data-id="${d.id}">Watch the instructor</button>${res&&F?'<button type="button" class="btn" data-ft="replay">Replay</button>':""}</div></div></div>`;});
  return h;}
if(typeof document!=="undefined")document.addEventListener("click",e=>{const t=e.target;if(!t.closest)return;const x=t.closest("[data-sc]");if(!x)return;
  if(x.dataset.sc==="go")scStart(x.dataset.id);else if(x.dataset.sc==="demo")scDemo(x.dataset.id);});
