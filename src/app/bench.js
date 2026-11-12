/* ===================== app/bench.js: the Bench tab =====================
   Prove the bot before it fights (docs/SCRAPLINE-PLAN.md section 6). The bench tests the FITTED bot of the class on the
   Build tab, not the draft (Kelbo, PR 3): before anything is fitted it offers to fit the draft, and it says when the draft
   has changes that aren't fitted yet. The rig is safe: nothing a test breaks stays broken.
   - Seven tests (SIM.BENCH_TESTS, sim/bench.js): drive and weapon are free and instant; impact, wedge gauge, endurance,
     drop and the test dummy cost workshop hours (charged once the career exists, PR 7; free until then).
   - The bench is run as a session (UI round two, release B, 0.1.59): a strip of chips for the tests that have run, each
     with its headline reading (bnHead: the first sheet row for that test, app/sheet.js); one open card (BN.open, a test
     id) that leads with the reading and how it compares with the calculation; then "Not tested yet", a row per test
     with a checkbox (BN.pick, in memory; the Build sheet's Test buttons set it); and a Run session bar pinned at the
     bottom with the count and the hours. A free test also has a Run button of its own. The test dummy (0.1.38) is three real fights against boxes that don't fight back; Watch plays one back
     in the fight view as a replay (bnWatch; FT.ext.kind "bench").
   - Each test card draws a small canvas readout (a trace or bars) and the measured numbers in words.
   - Which tests have run is kept per class in S.bots[cls].bench = {sig, done:[ids]}; sig is the fitted cfg, so refitting
     or moving a part makes the results stale ("run them again"). Results are worked out again from the cfg (the sim is
     deterministic), never stored.
   - benchMeasured(cls, cfg) hands the results to the Build tab, whose stress report then uses measured numbers (tagged
     "Bench") wherever the draft is the tested bot. */
const BN={anim:{},open:null,pick:[]};
/* why a test is worth running, for the tests the sheet has no row for */
const BN_WHY={drop:"a big flipper throw, landing both ways up",dummy:"three boxes that don't fight back, with a replay"};
const BN_DESC={
  drive:"A short straight and a spin on the spot: top speed, time over the track, pull to one side.",
  weapon:"Spin-up, stored energy and a hit on a fixed anvil; flippers and lifters against test masses; hammers, crushers, spears and rams by their energy; a flame by its reach and the heat it puts into a motor.",
  impact:"A swinging mass hits each face harder and harder until something behind it breaks: when the plate gives and which part dies first.",
  gauge:"Feeler gauges at the edge heights common in this class, slid under your front edge.",
  endurance:"Fight-pace bursts of drive and weapon until the battery is flat: runtime, heat, and when the motors back off.",
  drop:"Dropped from a big flipper throw, landing on its wheels and upside down: what breaks, and whether it can carry on.",
  dummy:"Your bot let loose on three boxes that don't fight back, soft to hard, for 20 seconds each: the hits it lands, the damage they do and what breaks. Watch plays one back."
};
/* a bot's signature: its parts and where they actually sit (autoLayout), so putting a part back where it was, or writing
   down the automatic place, isn't a change */
const bnSigMemo=new Map();
function bnNorm(cfg){const n=SIM.normCfg(cfg);if(n.body==="plain")delete n.body;return n;}   /* a plain body stays out, so 0.1.13 bench results still match */
function bnSig(cfg){const k=JSON.stringify(bnNorm(cfg));let s=bnSigMemo.get(k);
  if(s==null){const n=bnNorm(cfg);n.layout=SIM.autoLayout(n).place;s=JSON.stringify(n);if(bnSigMemo.size>200)bnSigMemo.clear();bnSigMemo.set(k,s);}
  return s;}
let bnCache={sig:"",b:null,res:{}};
function bnBuild(cfg){const sig=bnSig(cfg);if(bnCache.sig!==sig)bnCache={sig,b:bEv(cfg),res:{}};return bnCache;}
function bnResult(cfg,id){const c=bnBuild(cfg);if(!c.res[id])c.res[id]=SIM.runBench(c.b,id);return c.res[id];}
/* the tests that have run on this bot as it is fitted now ([] if none, or if it has changed since) */
function bnDone(bot){const r=bot&&bot.bench;return bot&&bot.cfg&&r&&typeof r==="object"&&Array.isArray(r.done)&&r.sig===bnSig(bot.cfg)?r.done.filter(id=>SIM.BENCH_TESTS.some(t=>t.id===id)):[];}
/* measured results for the Build tab: only when cfg (the draft) is the fitted, tested bot */
function benchMeasured(cls,cfg){const bot=S.bots[cls];if(!bot||!bot.cfg||!cfg||bnSig(bot.cfg)!==bnSig(cfg))return null;
  const done=bnDone(bot);if(!done.length)return null;const m={};for(const id of done)m[id]=bnResult(bot.cfg,id);return m;}
function bnHours(ids){const M=SIM.classMult(bCls());return Math.round(ids.reduce((a,id)=>a+(SIM.BENCH_TESTS.find(t=>t.id===id)||{hours:0}).hours,0)*M.hours*10)/10;}

/* ---- running ---- */
function bnRun(ids){const bot=bBot();if(!bot.cfg)return;const h=bnHours(ids),c=crOn()?S.career:null;
  if(c&&h>0){if((c.hours||0)<h){toast(`That takes ${h} h in the workshop; you have ${c.hours||0} h this week`);return;}c.hours-=h;}
  const was=bnDone(bot),done=SIM.BENCH_TESTS.map(t=>t.id).filter(id=>was.indexOf(id)>=0||ids.indexOf(id)>=0);
  bot.bench={sig:bnSig(bot.cfg),done};const now=performance.now();for(const id of ids)BN.anim[id]=now;
  BN.open=ids[0];BN.pick=(BN.pick||[]).filter(id=>ids.indexOf(id)<0);
  save();hud();bnRender();buzz(12);shopSfx("clamp");
  toast(ids.length>1?`${ids.length} tests run${h&&c?` · ${h} h`:""}`:`${SIM.BENCH_TESTS.find(t=>t.id===ids[0]).name} test run${h&&c?` · ${h} h`:""}`);}

/* ---- the words under each canvas ---- */
const bn1=v=>(Math.round(v*10)/10).toLocaleString("en-GB"),bn0=v=>Math.round(v).toLocaleString("en-GB");
const rd=s=>`<b class="readout">${s}</b>`;
function bnPartList(l){return l.map(p=>esc(p.name)).join(", ");}
const BN_TEXT={
  drive:(r,b)=>{const M=SIM.classMult(b.cls),straight=Math.abs(r.driftMm)<4*M.len;
    return[`Top speed ${rd(bn1(r.topSpeed)+" m/s")} <small>(predicted ${bn1(r.predicted)})</small>`,
      r.timeS!=null?`${bn1(r.trackM)} m in ${rd(bn1(r.timeS)+" s")}`:`<span class="broke">Doesn't move</span>`,
      straight?"Runs straight":`Pulls ${r.driftMm<0?"left":"right"} ${rd(bn0(Math.abs(r.driftMm))+" mm")} over the track`,
      r.spinS!=null?`Spins on the spot in ${rd(bn1(r.spinS)+" s")} (${bn0(r.turnDegS)}°/s)`:"Can't spin on the spot",
      `Push ${rd(bn0(r.pushN)+" N")}`];},
  weapon:(r,b)=>{if(r.kind==="spin")return[r.spinUpS!=null?`Full speed ${rd(bn0(r.rpm)+" rpm")} in ${rd(bn1(r.spinUpS)+" s")} <small>(predicted ${isFinite(r.predicted)?bn1(r.predicted):"–"})</small>, 90% in ${bn1(r.t90)} s`:`<span class="broke">Doesn't reach ${bn0(r.rpm)} rpm in a minute</span>${r.t90!=null?`, 90% in ${bn1(r.t90)} s`:""}`,
      `Stores ${rd(bn0(r.storedJ)+" J")}, tip speed ${bn0(r.tipSpeed)} m/s`,
      `Anvil hit: ${rd(bn0(r.hitJ)+" J")} lands, the disc drops to ${bn0(r.rpmAfter)} rpm and is back to 90% in ${bn1(r.recoverS)} s`,
      `Recoil throws you back ${rd(bn0(r.recoilMm)+" mm")}`,
      r.hitMaxJ>r.shearJ?`<span class="broke">A full-speed hit (up to ${bn0(r.hitMaxJ)} J) shears the shaft (above ${bn0(r.shearJ)} J)</span>`:r.hitMaxJ>r.bendJ?`<span class="worn">A full-speed hit (up to ${bn0(r.hitMaxJ)} J) bends it (above ${bn0(r.bendJ)} J)</span>`:`<span class="ok">Disc and shaft take a full-speed hit</span>`];
    if(r.kind==="flip"||r.kind==="lift")return r.rows.map(q=>`${bn1(q.kg)} kg: ${q.lifts?(r.kind==="flip"?`thrown ${rd(bn1(q.heightM)+" m")}`:`lifted ${rd(bn0(q.heightM*1000)+" mm")}`):'<span class="broke">stays down</span>'}`)
      .concat(r.kind==="flip"?[`${r.shots} shots, ${bn1(r.rechargeS)} s to recharge`]:[`Lifts up to ${rd(bn1(r.canLiftKg)+" kg")}`]);
    if(r.kind==="hammer")return[`Strike ${rd(bn0(r.energyJ)+" J")}, ${bn1(r.swingS)} s a swing`,`On the anvil: ${rd(bn0(r.hitJ)+" J")}`];
    if(r.kind==="crush")return[`Crush force ${rd(bn0(r.forceN)+" N")}, ${rd(bn0(r.energyJ)+" J")} a bite`];
    if(r.kind==="stab")return[`Stab ${rd(bn0(r.energyJ)+" J")}, the point out ${rd(bn0(r.strokeM*1000)+" mm")} past the front`,`On the anvil: ${rd(bn0(r.hitJ)+" J")}, half the armour's give taken out by the point`,`${r.shots} shots, ${bn1(r.rechargeS)} s to recharge`];
    if(r.kind==="flame")return[`Flame ${rd(bn0(r.reachM*1000)+" mm")} past the front, ${rd(bn0(r.fuelS)+" s")} of fuel`,`A motor held in it overheats in about ${rd(bn1(r.derateS)+" s")}`,`Burns ${rd(bn1(r.burnJps)+" J")} a second through the armour`];   // 0.1.66
    return[`No powered weapon: rams at ${rd(bn0(r.ramJ)+" J")} at top speed`,`Push ${rd(bn0(r.pushN)+" N")}, front edge ${bn1(r.edgeMm)} mm`];},
  impact:(r,b)=>["front","back","left","right","top"].map(f=>{const x=r.faces[f],w=f===r.weakest;
    return`${w?'<b class="broke">':"<b>"}${FACE_LBL[f]}</b> <small>(${esc(x.armour)})</small>: ${x.plateJ>0?`plate gives at ${rd(bn0(x.plateJ)+" J")}, `:x.hpJ>0?"":"no plate, "}${x.failJ!=null?`${esc(x.failName)} dies at ${rd(bn0(x.failJ)+" J")}`:`nothing breaks up to ${bn0(r.maxJ)} J`}${w?' <span class="broke">· weakest</span>':""}`;}),
  gauge:(r,b)=>{const mm=l=>l.map(q=>bn1(q.mm)).join(", ")+" mm";const u=r.rows.filter(q=>q.under),y=r.rows.filter(q=>q.youUnder),t=r.rows.filter(q=>!q.under&&!q.youUnder);
    return[`Front edge ${rd(bn1(r.edgeMm)+" mm")}`,
      u.length?`<span class="${u.length>r.rows.length/2?"broke":"worn"}">${u.length} of ${r.rows.length} get under you</span> (${mm(u)})`:'<span class="ok">Nothing gets under you</span>',
      y.length?`You get under ${y.length} (${mm(y)})`:"You get under none of them",
      t.length?`Too close to call: ${mm(t)} (edge material and skid plates decide)`:""].filter(Boolean);},
  endurance:(r,b)=>{const der=(s,what)=>s==null?`${what} never backs off`:`<span class="${s<90?"broke":"worn"}">${what} overheats at ${bn0(s)} s</span>`;
    return[r.runtimeS!=null?`Runs ${rd(bn0(r.runtimeS)+" s")} at fight pace <small>(predicted ${isFinite(r.predicted.runtimeS)?bn0(r.predicted.runtimeS):"–"})</small>${r.runtimeS<90?' <span class="broke">· flat before the bell</span>':""}`:`Still going after ${rd(bn0(r.ranS)+" s")}`,
      der(r.driveDerateS,"Drive"),r.hasWeapon?der(r.weaponDerateS,"Weapon motor"):"",
      `Hottest: drive ${bn0(r.peakDrive*100)}%${r.hasWeapon?`, weapon ${bn0(r.peakWeapon*100)}%`:""} of what they can soak`].filter(Boolean);},
  drop:(r,b)=>{const up=r.upright,inv=r.inverted,dead=up.parts.filter(p=>p.destroyed);
    return[`Dropped ${rd(bn1(r.heightM)+" m")}: ${rd(bn0(r.energyJ)+" J")} into the bot${r.skidJ?`, the skid plate takes ${bn0(r.skidJ)} J`:""}`,
      `On its wheels: ${up.canDrive?'<span class="ok">drives away</span>':'<span class="broke">can\'t drive</span>'}${dead.length?` · ${bnPartList(dead)} destroyed`:up.worst&&up.worst.frac>0.01?` · worst: ${esc(up.worst.name)} at ${bn0(up.worst.frac*100)}%`:" · not a scratch"}`,
      `Upside down: ${inv.outcome==="drives"?'<span class="ok">drives away inverted</span>':inv.outcome==="rights"?'<span class="ok">puts itself back</span>':'<span class="broke">stuck: that\'s a knockout</span>'}${inv.parts.some(p=>p.destroyed)?` · ${bnPartList(inv.parts.filter(p=>p.destroyed))} destroyed`:""}`];}
};
BN_TEXT.dummy=(r,b)=>{const any=r.rows.some(q=>q.share>0.005),self=Math.max(...r.rows.map(q=>q.selfShare));
  return r.rows.map(q=>{const bits=[q.hits?`${q.hits} hit${q.hits===1?"":"s"}, biggest ${rd(bn0(q.bigJ)+" J")}`:q.bigJ>0?`no weapon hits, rams up to ${bn0(q.bigJ)} J`:"no hits",
      q.share>0.005?`${rd(bn0(q.share*100)+"%")} damage`:'<span class="worn">nothing gets through</span>'];
    if(q.first)bits.push(`${esc(q.first.name)} destroyed at ${bn1(q.first.t)} s`);
    if(q.outT!=null)bits.push(`<span class="ok">disabled in ${bn1(q.outT)} s</span>`);
    if(q.invT!=null)bits.push(q.stuck?`<span class="ok">on its back at ${bn1(q.invT)} s, and stuck there</span>`:`on its back at ${bn1(q.invT)} s`);
    return`<b>${esc(q.name)}</b> <small>(${esc(q.line)}, ${bn1(q.massKg)} kg)</small>: ${bits.join(" · ")} <button type="button" class="lnk" data-dummy="${q.id}" aria-label="Watch the ${esc(q.name)} test">Watch</button>`;})
    .concat(any?[]:["Your bot doesn't break these: it wins by pushing, flipping and control, which the judges score."])
    .concat(self>0.005?[`<span class="worn">It cost your own bot up to ${bn0(self*100)}% damage (recoil and its own hits)</span>`]:[]);};
const BN_ARIA={dummy:r=>`Damage to each dummy in ${r.S} seconds: ${r.rows.map(q=>`${q.name} ${bn0(q.share*100)}%`).join(", ")}`,drive:r=>`Speed over time, reaching ${bn1(r.topSpeed)} m/s`,impact:r=>`Energy each face takes before a part breaks; weakest ${r.weakest?FACE_LBL[r.weakest].toLowerCase():"none"}`,
  gauge:r=>`${r.under} of ${r.rows.length} gauges get under the ${bn1(r.edgeMm)} mm edge`,endurance:r=>`Battery and motor heat over ${bn0(r.ranS)} seconds`,
  drop:r=>`Damage from the drop, on its wheels and upside down`,weapon:r=>r.kind==="spin"?`Disc speed over time${r.spinUpS!=null?`, full in ${bn1(r.spinUpS)} s`:", never full"}`:`${r.name} test`};

/* ---- canvas readouts ---- */
const BN_KEY={   // the key under a chart: [colour token, words]
  dummy:r=>[["--lilac",`damage done in ${r.S} s`],["--good","disabled"]],
  impact:()=>[["--lilac","the plate takes it"],["--warn","parts take damage"],["--crit-t","a part dies"]],
  endurance:r=>[["--lilac","battery"],["--warn","drive heat"]].concat(r.hasWeapon?[["--crit-t","weapon heat"]]:[]),
  gauge:()=>[["--crit-t","gets under you"],["--good","you get under"],["--warn","too close"]]};
const bnCol=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||"#888";
function bnFrame(g,w,h,o){const L=14,R=10,T=10,B=20,X=x=>L+(w-L-R)*x/o.xmax,Y=y=>h-B-(h-T-B)*y/o.ymax;
  g.strokeStyle=bnCol("--rule");g.lineWidth=1;g.beginPath();g.moveTo(L,T);g.lineTo(L,h-B);g.lineTo(w-R,h-B);g.stroke();
  g.fillStyle=bnCol("--muted");g.font="10px "+(bnCol("--mono")||"monospace");g.textBaseline="middle";g.textAlign="right";
  g.textAlign="left";g.textBaseline="top";g.fillText(o.ytop,L+4,T);g.textAlign="right";g.fillText("0",L-3,h-B-10);
  g.fillText(o.xr,w-R,h-B+4);g.textAlign="left";if(o.xl!=="")g.fillText(o.xl||"0",L,h-B+4);
  return{X,Y,L,R,T,B};}
function bnLine(g,F,pts,p,col,wd){const n=Math.max(2,Math.ceil(pts.length*p));g.strokeStyle=col;g.lineWidth=wd||2;g.lineJoin="round";g.beginPath();
  pts.slice(0,n).forEach((q,i)=>i?g.lineTo(F.X(q[0]),F.Y(q[1])):g.moveTo(F.X(q[0]),F.Y(q[1])));g.stroke();}
function bnHline(g,F,y,col,label,w,left){g.save();g.setLineDash([4,4]);g.strokeStyle=col;g.lineWidth=1;g.beginPath();g.moveTo(F.L,F.Y(y));g.lineTo(w-F.R,F.Y(y));g.stroke();g.restore();
  if(label){g.fillStyle=col;g.textAlign=left?"left":"right";g.textBaseline="bottom";g.fillText(label,left?F.L+4:w-F.R,F.Y(y)-2);}}
function bnVline(g,F,x,col,label,h){g.save();g.setLineDash([4,4]);g.strokeStyle=col;g.lineWidth=1;g.beginPath();g.moveTo(F.X(x),F.T);g.lineTo(F.X(x),h-F.B);g.stroke();g.restore();
  if(label){g.fillStyle=col;g.textAlign="right";g.textBaseline="bottom";g.fillText(label,F.X(x)-4,h-F.B-3);}}
function bnBars(g,w,h,p,rows,max){   // rows: [{label, parts:[{v, col}], mark, markCol, bold}] horizontal, log or linear done by the caller (0..1)
  const L=46,R=10,rh=(h-8)/rows.length;g.font="11px "+bnCol("--font");g.textBaseline="middle";
  rows.forEach((r,i)=>{const y=4+i*rh,bh=Math.min(14,rh*0.6),yc=y+rh/2;g.fillStyle=r.bold?bnCol("--crit-t"):bnCol("--muted");g.textAlign="left";g.fillText(r.label,0,yc);
    g.fillStyle=bnCol("--card2");g.fillRect(L,yc-bh/2,w-L-R,bh);let x0=0;
    for(const s of r.parts){const x1=Math.min(1,s.v)*p;if(x1>x0){g.fillStyle=s.col;g.fillRect(L+(w-L-R)*x0,yc-bh/2,(w-L-R)*(x1-x0),bh);x0=x1;}}
    if(r.mark!=null&&p>=1){g.fillStyle=r.markCol||bnCol("--crit-t");g.fillRect(L+(w-L-R)*Math.min(1,r.mark)-1.5,yc-bh/2-3,3,bh+6);}});}
const BN_PLOT={
  dummy:(g,w,h,p,r)=>{const mx=Math.max(0.25,...r.rows.map(q=>q.share))*1.1,lab={ply:"Ply",alu:"Alu",steel:"Brick"};
    bnBars(g,w,h,p,r.rows.map(q=>({label:lab[q.id]||q.id,parts:[{v:Math.max(q.share>0?0.01:0,q.share/mx),col:bnCol("--lilac")}],mark:q.outT!=null?q.share/mx:null,markCol:bnCol("--good")})),1);},
  drive:(g,w,h,p,r)=>{const tr=r.trace,xm=tr.length?tr[tr.length-1][0]:1,ym=Math.max(r.predicted,r.topSpeed,0.1)*1.15,F=bnFrame(g,w,h,{xmax:xm||1,ymax:ym,ytop:bn1(ym)+" m/s",xr:bn1(xm)+" s"});
    bnHline(g,F,r.predicted,bnCol("--dim"),"predicted",w);bnLine(g,F,tr.map(q=>[q[0],q[1]]),p,bnCol("--lilac"));},
  weapon:(g,w,h,p,r)=>{
    if(r.kind==="spin"){const tr=r.trace,xm=tr[tr.length-1][0]||1,F=bnFrame(g,w,h,{xmax:xm,ymax:1.1,ytop:bn0(r.rpm*1.1/1000)+"k rpm",xr:bn1(xm)+" s"});
      bnHline(g,F,0.9,bnCol("--dim"),"90%",w);if(isFinite(r.predicted)&&r.predicted>0&&r.predicted<xm)bnVline(g,F,r.predicted,bnCol("--muted"),"calc",h);
      bnLine(g,F,tr,p,bnCol("--lilac"));return;}
    if(r.kind==="flip"&&r.trace.length){const tr=r.trace,xm=tr[tr.length-1][0]||1,ym=Math.max(...tr.map(q=>q[1]),0.05)*1.15,F=bnFrame(g,w,h,{xmax:xm,ymax:ym,ytop:bn1(ym)+" m",xr:bn1(xm)+" s",xl:`a ${bn1(r.rows[2].kg)} kg bot`});
      bnLine(g,F,tr,p,bnCol("--lilac"));return;}
    if(r.kind==="flip"||r.kind==="lift"){const mx=Math.max(...r.rows.map(q=>q.heightM),0.01);
      bnBars(g,w,h,p,r.rows.map(q=>({label:bn1(q.kg)+" kg",parts:[{v:q.heightM/mx,col:bnCol("--lilac")}],mark:q.lifts?null:0.02})),1);return;}
    const M=SIM.classMult(bCls()),ref=SIM.BENCH.threatJ*M.mass,mx=Math.max(r.hitJ,ref)*1.2;
    bnBars(g,w,h,p,[{label:"yours",parts:[{v:r.hitJ/mx,col:bnCol("--lilac")}]},{label:"spinner",parts:[{v:ref/mx,col:bnCol("--dim")}]}],1);},
  impact:(g,w,h,p,r)=>{const M=SIM.classMult(bCls()),lo=SIM.BENCH.impactStartJ*M.mass,lg=v=>v<=0?0:Math.max(0,Math.log(v/lo)/Math.log(r.maxJ/lo));
    bnBars(g,w,h,p,["front","back","left","right","top"].map(f=>{const x=r.faces[f];
      return{label:FACE_LBL[f],bold:f===r.weakest,parts:[{v:lg(x.plateJ||0),col:bnCol("--lilac")},{v:x.failJ!=null?lg(x.failJ):1,col:bnCol("--warn")}],mark:x.failJ!=null?lg(x.failJ):null};}),1);},
  gauge:(g,w,h,p,r)=>{const ym=Math.max(r.edgeMm,...r.rows.map(q=>q.mm))*1.25,F=bnFrame(g,w,h,{xmax:r.rows.length,ymax:ym,ytop:bn1(ym)+" mm",xr:"",xl:""}),bw=(F.X(1)-F.X(0))*0.55;
    r.rows.forEach((q,i)=>{const x=F.X(i+0.5),y0=F.Y(0),y1=F.Y(q.mm*p);g.fillStyle=q.under?bnCol("--crit-t"):q.youUnder?bnCol("--good"):bnCol("--warn");g.fillRect(x-bw/2,y1,bw,y0-y1);
      g.fillStyle=bnCol("--muted");g.textAlign="center";g.textBaseline="top";g.fillText(bn1(q.mm),x,h-F.B+4);});
    bnHline(g,F,r.edgeMm,bnCol("--ink"),"your edge",w,true);},
  endurance:(g,w,h,p,r)=>{const tr=r.trace,xm=r.ranS||1,F=bnFrame(g,w,h,{xmax:xm,ymax:1.15,ytop:"100%",xr:bn0(xm)+" s"});
    bnHline(g,F,1,bnCol("--dim"),"derates",w);bnLine(g,F,tr.map(q=>[q[0],q[1]]),p,bnCol("--lilac"));bnLine(g,F,tr.map(q=>[q[0],Math.min(1.15,q[2])]),p,bnCol("--warn"),1.5);
    if(r.hasWeapon)bnLine(g,F,tr.map(q=>[q[0],Math.min(1.15,q[3])]),p,bnCol("--crit-t"),1.5);},
  drop:(g,w,h,p,r)=>{const worst=l=>l.reduce((a,q)=>Math.max(a,q.frac!=null?q.frac:q.destroyed?1:0),0),b=bnBuild(bBot().cfg).b;
    const invFrac=r.inverted.parts.length?Math.max(...r.inverted.parts.map(q=>{const pp=b.parts.find(x=>x.key===q.key);return pp?q.dmg/pp.hpJ:0;})):0;
    const col=f=>f>=1?bnCol("--crit-t"):f>0.3?bnCol("--warn"):bnCol("--good");
    bnBars(g,w,h,p,[{label:"wheels",parts:[{v:Math.max(0.01,worst(r.upright.parts)),col:col(worst(r.upright.parts))}]},{label:"inverted",parts:[{v:Math.max(0.01,invFrac),col:col(invFrac)}]}],1);}
};
function bnPlots(){const bot=bBot();if(!bot.cfg)return;
  for(const cv of document.querySelectorAll("#bnBody canvas[data-plot]")){const id=cv.dataset.plot,r=bnResult(bot.cfg,id),t0=BN.anim[id];delete BN.anim[id];
    const dpr=Math.min(2,window.devicePixelRatio||1),w=cv.clientWidth||300,h=cv.clientHeight||120;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);
    const g=cv.getContext("2d");if(!g)continue;g.setTransform(dpr,0,0,dpr,0,0);
    const draw=p=>{g.clearRect(0,0,w,h);try{BN_PLOT[id](g,w,h,p,r);}catch(e){}};
    if(t0&&!reduced()){const go=now=>{const p=Math.min(1,Math.max(0,(now-t0)/700));draw(p);if(p<1&&cv.isConnected)requestAnimationFrame(go);};requestAnimationFrame(go);}else draw(1);}}

/* ---- the tab ---- */
/* a test's headline: the first sheet row for it (its reading, and how that sits against the calculation), or a short
   reading of its own where the sheet has no row (a flipper's weapon test, the test dummy) */
function bnHead(id,r,rows){const row=rows.find(x=>x.test===id&&(x.state==="ok"||x.state==="off")&&x.bench!=null);
  if(row){const d=row.delta,calc=row.calc!=null;
    return{text:row.benchText,off:row.state==="off",tick:row.state==="ok"&&!row.plain,
      cmp:d?`${d} ${/slower$/.test(d)?"than":"of"} calc (${row.calcText})`:!calc?"":row.plain?`sheet: ${row.calcText}`:"matches the calculation"};}
  if(id==="dummy")return{text:bn0(Math.max(...r.rows.map(q=>q.share))*100)+"% damage",cmp:"the most it did to one dummy"};
  if(id==="weapon"){if(r.kind==="flip"){const q=r.rows.filter(x=>x.lifts).pop();return{text:q?bn1(q.heightM)+" m throw":"stays down",cmp:q?`a ${bn1(q.kg)} kg bot`:""};}
    if(r.kind==="lift")return{text:bn1(r.canLiftKg)+" kg",cmp:"the most it lifts"};
    if(r.kind==="crush")return{text:bn0(r.forceN)+" N",cmp:"crush force"};
    if(r.kind==="flame")return{text:bn0(r.reachM*1000)+" mm flame",cmp:bn0(r.fuelS)+" s of fuel"};
    return{text:bn0(r.hitJ||0)+" J",cmp:r.kind==="ram"?"a ram at top speed":"on the anvil"};}
  return{text:"tested",cmp:""};}
/* why run it: what the sheet has for that test, waiting to be proved */
function bnWhy(id,rows,b){const row=rows.find(x=>x.test===id);
  if(id==="impact")return`${FACE_LBL[b.weakestFace].toLowerCase()} armour weakest on the sheet`;
  if(row&&row.calc!=null)return`${row.label.toLowerCase()}, ${row.calcText} on the sheet`;
  return BN_WHY[id]||"";}
function bnBar(bot,todo,career){const pick=BN.pick.filter(id=>todo.indexOf(id)>=0),h=bnHours(pick),n=pick.length,short=career&&h>(career.hours||0);
  return`<div class="fitbar gobar bngo"${n?"":" hidden"}><span class="ft"><b>${n?`${n} test${n===1?"":"s"} picked`:"No tests picked"}</b>${n?(short?`${h} h needed · you have ${career.hours||0} h this week`:h?`${h} h on the bench${career?"":" · free until the career"}`:"free"):"Tick the tests to run"}</span><button type="button" class="btn pri" data-bn="session"${n&&!short?"":" disabled"}>Run session</button></div>`;}
function bnRender(){const el=$("bnBody");if(!el)return;const bot=bBot(),cls=bCls(),c=SIM.CLASSES[cls],career=crOn()?S.career:null;
  const chips=`<div class="seg bncls" role="group" aria-label="Weight class">${SIM.CLASS_IDS.map(id=>`<button type="button" data-bncls="${id}" class="${id===cls?"on":""}"${id===cls?' aria-pressed="true"':' aria-pressed="false"'}>${SIM.CLASSES[id].name.replace("weight","")}</button>`).join("")}</div>`;
  if(!bot.cfg){el.innerHTML=chips+`<div class="card empty"><svg viewBox="0 0 24 24" aria-hidden="true">${EMPTY_ICON.tools}</svg><h3>Nothing fitted in the ${c.name} yet</h3><p>The bench tests the bot you've fitted, not the draft on the Build tab. Fit the draft first.</p>
    <div class="row"><button type="button" class="btn pri" data-bn="fit">Fit the draft</button><button type="button" class="btn" data-bn="build">Open Build</button></div></div>`;return;}
  const b=bnBuild(bot.cfg).b,done=bnDone(bot),stale=bot.bench&&bot.bench.sig&&bot.bench.sig!==bnSig(bot.cfg),wp=SIM.part("weapon",bot.cfg.weapon);
  const drafted=!(bot.draft&&bnSig(bot.draft)===bnSig(bot.cfg)),N=SIM.BENCH_TESTS.length;
  const todo=SIM.BENCH_TESTS.map(t=>t.id).filter(id=>done.indexOf(id)<0),rows=sheetRows(cls,bot.cfg),tut=typeof TUT_ON!=="undefined"&&TUT_ON;
  BN.pick=(BN.pick||[]).filter(id=>todo.indexOf(id)>=0);if(done.indexOf(BN.open)<0)BN.open=done.length?done[done.length-1]:null;
  let html=chips+`<div class="card bnbot"><h3>${esc(lvBotName(cls))} · ${esc(c.name)}</h3><p>${fmtG(b.totalG)} of ${fmtG(b.limitG)} · ${esc(wp?wp.name:"")} · <b>${done.length} of ${N} tested</b></p>
    ${drafted?'<p class="hint">Your draft on the Build tab has changes that aren\'t fitted. The bench tests what\'s fitted. <button type="button" class="lnk" data-bn="build">Open Build</button></p>':""}
    ${stale&&!done.length?'<p class="hint worn">The bot has changed since its last tests. Run them again.</p>':""}
    <p class="hint">Drive and weapon tests are free. ${career?`You have ${career.hours||0} h in the workshop this week.`:"The others take workshop hours, charged once the career starts."}</p></div>`;
  /* what the tests add up to goes above them once one has been run (0.1.44): the answer first, the working under it */
  const m=benchMeasured(cls,bot.cfg),st=SIM.stressReport(b,m||{});
  const says=`<div class="card"><h3>What the bench says</h3>${m?"":'<p class="hint">Run a test and its measured numbers replace the predictions, here and in the Build tab\'s stress report.</p>'}
    <ul class="stress">${st.length?st.map(x=>{const v=SEV_LBL[x.sev]||SEV_LBL.info;return`<li><span class="sev ${v[0]}">${v[1]}</span><span>${esc(x.text)}${x.measured?' <span class="bntag">Bench</span>':""}</span></li>`;}).join(""):"<li>Nothing to report.</li>"}</ul></div>`;
  if(m)html+=says;
  /* the tested strip: a chip a test, with its headline reading */
  if(done.length){html+=`<div class="bnstrip" role="group" aria-label="Tests run">${done.map(id=>{const t=SIM.BENCH_TESTS.find(x=>x.id===id),hd=bnHead(id,bnResult(bot.cfg,id),rows),on=id===BN.open;
      return`<button type="button" class="bnchip${on?" on":""}" data-bnopen="${id}" aria-pressed="${on}"><b>${t.name}</b><span class="${hd.off?"worn":"readout"}">${esc(hd.text)}</span>${hd.tick?'<span class="shtick" role="img" aria-label="matches the sheet">✓</span>':""}</button>`;}).join("")}</div>`;
    /* the one open card: the reading first, then the plot and the detail */
    const t=SIM.BENCH_TESTS.find(x=>x.id===BN.open),r=bnResult(bot.cfg,t.id),hd=bnHead(t.id,r,rows),h=bnHours([t.id]);
    html+=`<div class="card bn" data-test="${t.id}"><div class="bnh"><h3>${t.name}</h3><span class="cost">${h?h+" h":"free"}</span><button type="button" class="btn sm ghost" data-run="${t.id}">Again</button></div>
      <p class="bnlead${hd.text.length>10?" words":""}"><b class="${hd.off?"worn":"readout"}">${esc(hd.text)}</b>${hd.cmp?`<span>${esc(hd.cmp)}</span>`:""}</p>
      <canvas class="plot" data-plot="${t.id}" role="img" aria-label="${esc(BN_ARIA[t.id](r))}"></canvas>${BN_KEY[t.id]?`<p class="bnkey">${BN_KEY[t.id](r).map(k=>`<span><i style="background:var(${k[0]})"></i>${k[1]}</span>`).join("")}</p>`:""}<ul class="bnk">${BN_TEXT[t.id](r,b).map(s=>`<li>${s}</li>`).join("")}</ul></div>`;}
  /* not tested yet: tick what to run; a free test can also be run on its own */
  if(todo.length){const all=todo.every(id=>BN.pick.indexOf(id)>=0);
    html+=`<div class="card bntodo"><div class="bnh"><h3>${done.length?"Not tested yet":"Pick what to test"}</h3><button type="button" class="lnk" data-bn="${all?"none":"all"}">${all?"Clear":"Pick all"}</button></div><ul class="bnrows">${todo.map(id=>{const t=SIM.BENCH_TESTS.find(x=>x.id===id),h=bnHours([id]),why=bnWhy(id,rows,b),free=!h;
      return`<li class="bnrow" data-test="${id}"><label><input type="checkbox" data-bnpick="${id}"${BN.pick.indexOf(id)>=0?" checked":""}><span class="nm">${t.name}${why?`<small>${esc(why)}</small>`:""}</span></label><span class="cost">${h?h+" h":"free"}</span>${free||tut?`<button type="button" class="btn sm" data-run="${id}" aria-label="Run the ${esc(t.name.toLowerCase())} now">Run</button>`:""}</li>`;}).join("")}</ul></div>`;}
  if(!m)html+=says;
  if(todo.length)html+=bnBar(bot,todo,career);
  el.innerHTML=html;bnPlots();}
/* play a test dummy run back in the fight view: the same fight again from its spec (the sim is deterministic), as a replay */
function bnWatch(id){const bot=bBot();if(!bot.cfg||FT.on)return;if(FT.bout&&!FT.bout.over){toast("Finish the bout on the Fight tab first");return;}const c=bnBuild(bot.cfg),row=bnResult(bot.cfg,"dummy").rows.find(q=>q.id===id),d=SIM.BENCH_DUMMIES.find(q=>q.id===id);if(!row||!d)return;
  const sp=SIM.benchDummySpec(c.b,d);sp.bots[0].name=lvBotName(c.b.cls);sp.bots[0].livery=lvMine();lvField(sp.bots);
  const log={seed:sp.seed,arena:sp.arena,rules:sp.rules,steps:row.steps,bots:sp.bots,inputs:{}};let F;
  try{F=ftRpFight(log,row.steps);}catch(e){toast("That test wouldn't play back");return;}
  F.recorded=true;FT.rounds=[{F,log}];FT.rv=0;FT.bout=null;FT.rp=null;FT.ext={kind:"bench",dummy:d.name};FT.sig=bnSig(bot.cfg);
  showTab("fight");ftReplay(0);}
function bnClick(e){const t=e.target;let x;
  if((x=t.closest("[data-dummy]"))){bnWatch(x.dataset.dummy);return;}
  if((x=t.closest("[data-run]"))){bnRun([x.dataset.run]);bnToCard();return;}
  if((x=t.closest("[data-bnopen]"))){BN.open=x.dataset.bnopen;bnRender();return;}
  if((x=t.closest("[data-bnpick]"))){const id=x.dataset.bnpick,i=BN.pick.indexOf(id);if(x.checked&&i<0)BN.pick.push(id);else if(!x.checked&&i>=0)BN.pick.splice(i,1);
    const bar=document.querySelector("#bnBody .bngo"),bot=bBot();   /* only the bar changes: the list keeps its place and the box its focus */
    if(bar&&bot.cfg){const d=bnDone(bot),todo=SIM.BENCH_TESTS.map(q=>q.id).filter(q=>d.indexOf(q)<0);bar.outerHTML=bnBar(bot,todo,crOn()?S.career:null);
      const l=document.querySelector('#bnBody [data-bn="all"],#bnBody [data-bn="none"]');if(l){const all=todo.every(q=>BN.pick.indexOf(q)>=0);l.dataset.bn=all?"none":"all";l.textContent=all?"Clear":"Pick all";}}
    return;}
  if((x=t.closest("[data-bncls]"))){ST().buildCls=x.dataset.bncls;B.sel=null;B.delKey=null;BN.pick=[];BN.open=null;save();bnRender();return;}
  if((x=t.closest("[data-bn]"))){const a=x.dataset.bn,bot=bBot();
    if(a==="all"||a==="none"){const d=bnDone(bot);BN.pick=a==="all"?SIM.BENCH_TESTS.map(q=>q.id).filter(q=>d.indexOf(q)<0):[];bnRender();return;}
    if(a==="session"){const d=bnDone(bot),ids=SIM.BENCH_TESTS.map(q=>q.id).filter(q=>BN.pick.indexOf(q)>=0&&d.indexOf(q)<0);if(ids.length){bnRun(ids);bnToCard();}return;}
    if(a==="build")showTab("build");else if(a==="fit"){const r=bEval();if(!r.valid){toast(r.totalG>r.limitG?"The draft is over the limit: fix it on the Build tab":"The draft can't be fitted: see the Build tab");return;}bFitOpen();}}}
/* after a run, bring the open card into view (it sits above the list the button was in) */
function bnToCard(){const c=document.querySelector("#bnBody .bnstrip");if(c)c.scrollIntoView({block:"start",behavior:"auto"});}
TAB_RENDER.bench=function(){
  if(!bnRender.bound){bnRender.bound=true;$("tab-bench").addEventListener("click",bnClick);
    let rt=0;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(curTab==="bench")bnPlots();},200);});}
  bnRender();};
