/* ===================== app/sheet.js: the bot as a data sheet (UI round two, release A, 0.1.58) =====================
   Build › Sheet shows, row by row, what the build maths predicts (evalBuild) beside what the bench measured (runBench),
   and a button to run the test where there is no reading yet. docs/SCRAPLINE-UI-PLAN.md section 3. Nothing is stored:
   the numbers are worked out from the cfg each time, as the Bench does (app/bench.js).
   - SHEET_ROWS: one entry per row: {id, label, test (a BENCH_TESTS id), when(b) (leave the row out), calc(b), bench(r,b),
     fmt(v), tol, better}. calc and bench return a number, or a string for a row in words. tol is the share the two may
     differ by before the bench cell is marked; better is "hi", "lo" or null (null: the two are shown, never marked,
     because they are two different measurements).
       spin-up     both are the time to full speed, but not by the same route: the sheet has it from stored energy over
                   motor power; the bench runs the motor, whose torque runs out at low rpm and which loses power to the
                   air, so the bench is always slower (1.50 s against 1.32 s on the default bot). The gap is the model,
                   not a fault in the bot, so the row says the gap in words (gap: "lo") and is never marked.
       hit energy  two different things: the energy the disc stores, and what one hit on the anvil delivers (stored x
                   bite). Labelled "stored" and "delivered", never marked.
   - sheetRows(cls, cfg): [{id, label, test, calc, calcText, bench, benchText, state, delta, hours}], state one of
       ok     tested, and within tol (or a row that is never marked)
       off    tested, and worse than the sheet by more than tol
       none   not tested
       stale  tested before the last fit
       draft  cfg is not the fitted bot (the bench only tests what's fitted)
   - sheetNum(cls, id): the best number for one row of the FITTED bot: {v, text, bench} (bench: true when measured), or
     null. The matchup and the post-mortem (releases C and D) read it.
   - shGroups(b): the mass budget in bands, [{id, label, g, sec}], from evalBuild's items; sec is the Build section a tap
     on the band opens. */
const sh2=v=>(Math.round(v*100)/100).toFixed(2),sh1=v=>(Math.round(v*10)/10).toLocaleString("en-GB"),sh0=v=>Math.round(v).toLocaleString("en-GB");
const shSpin=b=>b.weapon.type==="spinner"&&isFinite(b.weapon.spinUpS)&&b.weapon.spinUpS>0;
const SHEET_ROWS=[
  {id:"speed",label:"Top speed",test:"drive",calc:b=>b.driveSpeed,bench:r=>r.topSpeed,fmt:v=>sh2(v)+" m/s",tol:0.05,better:"hi"},
  {id:"push",label:"Push",test:"drive",calc:b=>b.pushN,bench:r=>r.pushN,fmt:v=>sh1(v)+" N",tol:0.05,better:"hi"},
  {id:"turn",label:"Spin on the spot",test:"drive",calc:b=>b.turnRate*180/Math.PI,bench:r=>r.turnDegS,fmt:v=>sh0(v)+" °/s",tol:0.05,better:"hi"},
  {id:"spinup",label:"Spin-up",test:"weapon",when:shSpin,calc:b=>b.weapon.spinUpS,bench:r=>r.kind==="spin"?(r.spinUpS==null?"never reaches full speed":r.spinUpS):null,fmt:v=>sh2(v)+" s",tol:0,better:null,gap:"lo"},
  {id:"flame",label:"Flame reach",test:"weapon",when:b=>b.weapon.type==="flame",calc:b=>b.flame.reachM*1000,bench:r=>r.kind==="flame"?r.reachM*1000:null,fmt:v=>sh0(v)+" mm",tol:0,better:null},   // 0.1.66
  {id:"hit",label:"Hit energy",test:"weapon",when:b=>b.weapon.energyJ>=1&&b.weapon.type!=="flame",calc:b=>b.weapon.energyJ,bench:r=>r.hitJ,fmt:v=>sh0(v)+" J",calcNote:"stored",benchNote:"delivered",tol:0,better:null},
  {id:"runtime",label:"Runtime",test:"endurance",calc:b=>b.runtimeS==null||!isFinite(b.runtimeS)?"no limit":b.runtimeS,bench:r=>r.runtimeS==null||!isFinite(r.runtimeS)?"no limit":r.runtimeS,fmt:v=>sh0(v)+" s",tol:0.05,better:"hi"},
  {id:"weak",label:"Weakest face",test:"impact",calc:b=>FACE_LBL[b.weakestFace],bench:r=>r.weakest?`${FACE_LBL[r.weakest]}, fails at ${sh0(r.faces[r.weakest].failJ)} J`:"nothing failed",tol:0,better:null},
  {id:"edge",label:"Front edge",test:"gauge",calc:b=>b.height.frontEdgeMm,bench:r=>{const u=r.rows.filter(q=>q.under).map(q=>q.mm);return u.length?`gauges to ${Math.max(...u)} mm get under`:"no gauge gets under";},fmt:v=>(Math.round(v*10)/10)+" mm",tol:0,better:null},
  {id:"drop",label:"Drop",test:"drop",calc:()=>null,bench:r=>{const u=r.upright,i=r.inverted,dead=(u.parts||[]).concat(i.parts||[]).filter(p=>p.destroyed);
    return dead.length?`breaks the ${dead[0].name}`:!u.canDrive||!i.canDrive?"can't drive after":i.outcome==="stuck"?"survives, stuck upside down":"survived";},tol:0,better:null}
];
const shText=(row,v,note)=>v==null?"–":typeof v==="string"?v:row.fmt(v)+(note?" "+note:"");
/* the gap in words: "0.18 s slower", "0.3 m/s short" */
function shGap(row,c,m){const d=Math.abs(m-c);return (row.better||row.gap)==="lo"?row.fmt(d)+" slower":row.fmt(d)+" short";}
function sheetRows(cls,cfg){const bot=S.bots[cls],fitted=!!(bot&&bot.cfg),same=fitted&&bnSig(bot.cfg)===bnSig(cfg),b=same?bnBuild(bot.cfg).b:bEv(cfg);
  const done=same?bnDone(bot):[],old=same&&bot.bench&&bot.bench.sig!==bnSig(bot.cfg)&&Array.isArray(bot.bench.done)?bot.bench.done:[];
  return SHEET_ROWS.filter(r=>!r.when||r.when(b)).map(row=>{const c=row.calc(b),t=SIM.BENCH_TESTS.find(x=>x.id===row.test),
      o={id:row.id,label:row.label,test:row.test,testName:t?t.name:row.test,calc:c,calcText:shText(row,c,row.calcNote),bench:null,benchText:"",state:"none",delta:"",hours:bnHours([row.test])};
    if(!same)o.state="draft";
    else if(done.indexOf(row.test)>=0){const m=row.bench(bnResult(bot.cfg,row.test),b);o.bench=m;o.benchText=shText(row,m,row.benchNote);o.state="ok";o.plain=!row.better||typeof m!=="number"||typeof c!=="number";
      if(m==null){o.benchText="tested";}   /* a test that has run but has no number for this row (a flipper has no anvil hit) */
      else if(row.gap&&typeof m==="number"&&typeof c==="number"&&m-c>0.005){o.delta=shGap(row,c,m);}
      else if(row.better&&typeof m==="string"&&typeof c==="number"){o.state="off";}
      else if(!o.plain){const worse=row.better==="lo"?m-c:c-m;if(worse>Math.abs(c)*row.tol+1e-9){o.state="off";o.delta=shGap(row,c,m);}}}
    else if(old.indexOf(row.test)>=0)o.state="stale";
    return o;});}
function sheetNum(cls,id){const bot=S.bots[cls];if(!bot||!bot.cfg)return null;const r=sheetRows(cls,bot.cfg).find(x=>x.id===id);if(!r)return null;
  const m=r.state==="ok"||r.state==="off";return m?{v:r.bench,text:r.benchText,bench:true}:{v:r.calc,text:r.calcText,bench:false};}
/* the mass budget in bands */
const SH_GROUPS=[["chassis","Chassis","chassis",["chassis","body"]],["armour","Armour","armour",["armour"]],["weapon","Weapon","weapon",["weapon","weaponMaterial","front","back"]],
  ["drive","Drive","drive",["drive","wheels","wheelbase"]],["battery","Battery","power",["battery"]],["electronics","ESC","power",["electronics"]],["extras","Extras","extras",null]];
function shGroups(b){const known={};for(const g of SH_GROUPS)if(g[3])for(const s of g[3])known[s]=g[0];
  const sum={};for(const it of b.items){const k=known[it.slot]||"extras";sum[k]=(sum[k]||0)+it.g;}
  return SH_GROUPS.filter(g=>sum[g[0]]>0.5).map(g=>({id:g[0],label:g[1],sec:g[2],g:sum[g[0]]}));}
/* the sheet as a table (the Bench cell says the same thing in a tick, a word or a button, never by colour alone) */
function sheetHtml(cls,cfg){const rows=sheetRows(cls,cfg);
  const cell=r=>{const h=r.hours?r.hours+" h":"free";
    if(r.state==="draft")return'<span class="shdim">Fit first</span>';
    if(r.state==="none")return`<button type="button" class="btn sm shtest" data-shtest="${r.test}" aria-label="Run the ${esc(r.testName.toLowerCase())}: ${h}">Test · ${h}</button>`;
    if(r.state==="stale")return`<button type="button" class="btn sm shtest" data-shtest="${r.test}" aria-label="Run the ${esc(r.testName.toLowerCase())} again: ${h}">Run again · ${h}</button>`;
    if(r.state==="off")return`<span class="worn">${esc(r.benchText)}</span>${r.delta?`<small class="worn">${esc(r.delta)}</small>`:""}`;
    return`<span>${esc(r.benchText)}</span>${r.plain&&r.delta?`<small class="shdim">${esc(r.delta)}</small>`:""}${r.plain?"":'<span class="shtick" role="img" aria-label="matches the sheet">✓</span>'}`;};
  return`<table class="sheet"><caption>Calculated and bench numbers</caption><thead><tr><td></td><th scope="col">Calc</th><th scope="col">Bench</th></tr></thead><tbody>${
    rows.map(r=>`<tr><th scope="row">${r.label}</th><td class="mono">${esc(r.calcText)}</td><td class="mono shb ${r.state}">${cell(r)}</td></tr>`).join("")}</tbody></table>`;}
