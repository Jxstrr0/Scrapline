/* ===================== app/help.js: the tutorial, the bot card, trophy cards =====================
   The tutorial (Kelbo, PR 9: coached, on a loaner). PEW's First Fire pattern: a spotlight on the real control and a card
   that waits for you to use it. Fit the starter wedge, run the impact test, spar one club bot, read the post-mortem.
   It runs on a borrowed beetle: tutStart() snapshots the whole game, clears the career, bots, staff and sponsors, and
   sets TUT_ON so save() writes nothing (state.js); tutStop() puts the snapshot back, keeping this phone's settings.
   Closing the page mid-tutorial loses nothing: storage never saw the loaner. Offered once after the intro; Settings
   runs it again. Loading a slot or restoring a backup ends it first (state.js).
   The bot card (Kelbo, PR 9): the fitted bot (the draft when nothing is fitted) from SCRAP_VIS.shot, a fixed
   three-quarter render off screen, with its name, class, weight against the limit, weapon, speed, weapon energy and its
   career record; where there is no 3D, the top-down sketch (ftSil, app/fight.js). The camera button over the 3D view.
   Trophy cards (Kelbo, PR 9): every event you win (tpAward from crFinish, app/career.js), gold for a championship or a
   move up an act (crSeasonEnd). Kept in S.career.trophies (newest first); the shelf is on the Career tab.
   Both pictures go out through phoSave (PEW's): the share sheet where it takes files, else a download. Last file of the
   app script block. */

/* ---- saving a picture (PEW's phoSave) ---- */
async function phoSave(c,fn,title,share){
  const blob=await new Promise(r=>c.toBlob(r,"image/png"));if(!blob){toast("Couldn't make the picture here");return false;}
  if(share){const file=new File([blob],fn,{type:"image/png"});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title});return true;}catch(e){if(e&&e.name==="AbortError")return false;}}}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),8000);toast("Picture saved");return true;}
const phoSlug=s=>String(s||"bot").toLowerCase().normalize("NFKD").replace(/[^\w]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32)||"bot";

/* ---- drawing the cards (always the dark palette: a picture has no theme) ---- */
const CARD={W:1080,H:1350,pad:64,bg:"#141413",panel:"#1F1E1B",rule:"#34322D",ink:"#F2EFE8",muted:"#ABA79E",clay:"#D97757",lilac:"#B48CE8",
  f:'"Space Grotesk",-apple-system,"Segoe UI",sans-serif',m:'"JetBrains Mono",ui-monospace,Menlo,monospace'};
async function cardFonts(){try{if(document.fonts&&document.fonts.load)await Promise.all([document.fonts.load(`700 64px ${CARD.f}`),document.fonts.load(`500 30px ${CARD.m}`)]);}catch(e){}}
function cardBase(){const c=document.createElement("canvas");c.width=CARD.W;c.height=CARD.H;const g=c.getContext("2d");
  g.fillStyle=CARD.bg;g.fillRect(0,0,CARD.W,CARD.H);g.strokeStyle=CARD.clay;g.lineWidth=4;g.strokeRect(18,18,CARD.W-36,CARD.H-36);
  g.textBaseline="alphabetic";g.fillStyle=CARD.clay;g.font=`700 30px ${CARD.f}`;cardSpaced(g,"SCRAPLINE",CARD.pad,96,6);
  g.fillStyle=CARD.muted;g.font=`500 24px ${CARD.m}`;g.textAlign="center";g.fillText(`© ${new Date().getFullYear()} Kelbo / Longlight Interactive · scrapline.longlight.games`,CARD.W/2,CARD.H-52);g.textAlign="left";
  return{c,g};}
function cardSpaced(g,s,x,y,sp){for(const ch of s){g.fillText(ch,x,y);x+=g.measureText(ch).width+sp;}}
/* text shrunk until it fits w */
function cardFit(g,s,x,y,w,px,weight,font){let p=px;do{g.font=`${weight} ${p}px ${font||CARD.f}`;p-=2;}while(g.measureText(s).width>w&&p>18);g.fillText(s,x,y);}
function cardRound(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
/* a picture into the sheet: an <img> of the canvas */
function cardImg(c,alt){return`<img class="cardimg" src="${c.toDataURL("image/png")}" alt="${esc(alt)}">`;}

/* ---- the bot card ---- */
const BC={name:null,canvas:null};
function bcCfg(){const bot=bBot();return bot.cfg||bot.draft;}
function bcDefaultName(cfg){const L=bDesigns().filter(d=>d&&d.cfg&&SIM.sameParts(Object.assign({},d.cfg,{cls:cfg.cls}),cfg));
  if(L.length)return L[0].name;if(cfg.disc&&cfg.disc.name)return cfg.disc.name;return"My "+SIM.CLASSES[cfg.cls].name.toLowerCase();}
function bcRecord(cls){const c=S.career;if(!c||!Array.isArray(c.results))return"Not raced yet";const R=c.results.filter(r=>r.cls===cls);if(!R.length)return"Not raced yet";
  const w=R.filter(r=>r.place===1).length;return`${R.length} event${R.length===1?"":"s"} · ${w} won`;}
async function bcDraw(name){await cardFonts();const cfg=bcCfg(),b=bEv(cfg),{c,g}=cardBase(),P=CARD.pad,fitted=!!bBot().cfg;
  g.fillStyle=CARD.muted;g.font=`600 26px ${CARD.f}`;g.textAlign="right";g.fillText(b.className.toUpperCase()+(fitted?"":" · DRAFT"),CARD.W-P,96);g.textAlign="left";
  /* the picture */
  const px=P,py=130,pw=CARD.W-2*P,ph=600;g.save();cardRound(g,px,py,pw,ph,22);g.clip();g.fillStyle="#0E0E0D";g.fillRect(px,py,pw,ph);
  let shot=null;if(window.SCRAP_VIS&&ftGL()){try{SCRAP_VIS.setBot(b);shot=SCRAP_VIS.shot(pw,ph);}catch(e){shot=null;}visBot();}
  if(shot)g.drawImage(shot,px,py,pw,ph);
  else{g.strokeStyle="#ffffff10";g.lineWidth=2;for(let x=px;x<px+pw;x+=50){g.beginPath();g.moveTo(x,py);g.lineTo(x,py+ph);g.stroke();}for(let y=py;y<py+ph;y+=50){g.beginPath();g.moveTo(px,y);g.lineTo(px+pw,y);g.stroke();}
    const S2=560,cv=document.createElement("canvas");cv.width=cv.height=S2;ftSil(cv,{b},{},S2);g.drawImage(cv,px+(pw-S2)/2,py+(ph-S2)/2);}
  g.restore();
  /* the name and the weapon */
  const wp=SIM.part("weapon",cfg.weapon),wn=cfg.weapon==="none"?"No weapon":wp?wp.name:cfg.weapon;
  g.fillStyle=CARD.ink;cardFit(g,name,P,py+ph+96,CARD.W-2*P,72,700);
  g.fillStyle=CARD.lilac;cardFit(g,wn+(cfg.disc&&cfg.disc.name?` · “${cfg.disc.name}” disc`:""),P,py+ph+146,CARD.W-2*P,34,500);
  /* the numbers, two columns of three */
  const cells=[["Weight",`${fmtG(b.totalG)} of ${fmtG(b.limitG)}`],["Top speed",`${b.driveSpeed.toFixed(1)} m/s`],["Weapon",b.weapon&&b.weapon.energyJ?`${Math.round(b.weapon.energyJ)} J`:"none"],
    ["Weakest side",FACE_LBL[b.weakestFace]||"—"],["Runs for",isFinite(b.runtimeS)?`${Math.floor(b.runtimeS/60)} min ${Math.round(b.runtimeS%60)} s`:"all fight"],["Record",bcRecord(cfg.cls)]];
  const cw=(CARD.W-2*P-40)/2,y0=py+ph+196;g.strokeStyle=CARD.rule;g.lineWidth=2;g.beginPath();g.moveTo(P,y0);g.lineTo(CARD.W-P,y0);g.stroke();
  cells.forEach(([k,v],i)=>{const x=P+(i%2)*(cw+40),y=y0+58+Math.floor(i/2)*92;g.fillStyle=CARD.muted;g.font=`500 24px ${CARD.f}`;g.fillText(k.toUpperCase(),x,y);
    g.fillStyle=CARD.ink;cardFit(g,v,x,y+42,cw,34,500,CARD.m);});
  return c;}
async function bcOpen(){if(FT.on)return;const cfg=bcCfg();if(BC.name==null||BC.cls!==cfg.cls){BC.name=bcDefaultName(cfg);BC.cls=cfg.cls;}
  openSheet("Bot card",`<div id="bcPic" class="cardpic"><p class="hint">Drawing the card…</p></div>
    <div class="dname"><input id="bcName" maxlength="28" value="${esc(BC.name)}" aria-label="Bot name on the card" autocomplete="off"><button type="button" class="btn sm" data-bc="redraw">Rename</button></div>
    <div class="row"><button type="button" class="btn pri" data-bc="share">Share</button><button type="button" class="btn" data-bc="save">Save picture</button></div>
    <p class="hint">${bBot().cfg?"Your fitted bot":"Nothing is fitted in this class yet, so this is the draft"}. The name is only on the card.</p>`);
  await bcPaint();}
async function bcPaint(){BC.canvas=await bcDraw(BC.name);const el=$("bcPic");if(el)el.innerHTML=cardImg(BC.canvas,`Bot card for ${BC.name}`);}
async function bcClick(a){const inp=$("bcName");if(inp){const n=inp.value.trim().slice(0,28);if(n&&n!==BC.name){BC.name=n;await bcPaint();}}
  if(a==="redraw")return;if(!BC.canvas)return;await phoSave(BC.canvas,`scrapline-${phoSlug(BC.name)}.png`,`${BC.name} · Scrapline`,a==="share");}

/* ---- trophy cards ---- */
const TP_MAX=80;
function tpAward(k,e,cls){const c=S.career;if(!c)return;if(!Array.isArray(c.trophies))c.trophies=[];const bot=cls?S.bots[cls]:null,wp=bot&&bot.cfg?SIM.part("weapon",bot.cfg.weapon):null;
  c.trophies.unshift({k,ev:e.id,name:e.name,cls:cls||null,y:c.year,w:c.week,act:c.act,venue:e.venue||null,wpn:wp&&bot.cfg.weapon!=="none"?wp.name:null});
  if(c.trophies.length>TP_MAX)c.trophies.length=TP_MAX;setTimeout(()=>toast(k==="promo"?"A gold trophy for the shelf":`Trophy: ${e.name}`),2800);}
const tpGold=t=>t.k!=="win";
const tpCup=gold=>`<svg viewBox="0 0 24 24" class="tpcup ${gold?"gold":""}" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7M10 17h4v3h-4z"/></svg>`;
function tpWhat(t){return t.k==="promo"?"Promotion":t.k==="defend"?"Title defended":t.k==="title"?"Champions":"Winners";}
function tpShelf(){const c=S.career;if(!c)return"";const T=Array.isArray(c.trophies)?c.trophies:[];
  if(!T.length)return emptyHtml("cup","Nothing on the shelf yet","Win an event and its trophy goes here. Championships and moving up an act are gold.",[["This week","career/week"]]);
  return`<div class="card"><h3>Trophy shelf</h3>${T.length?`<div class="tpshelf">${T.map((t,i)=>`<button type="button" class="tp${tpGold(t)?" gold":""}" data-tp="${i}">${tpCup(tpGold(t))}<span>${esc(t.name)}</span><small>${t.y}${t.cls?" · "+esc(SIM.CLASSES[t.cls].name.replace("weight","")):""}</small></button>`).join("")}</div><p class="hint">Tap one for its card.</p>`
    :""}</div>`;}
async function tpDraw(t){await cardFonts();const{c,g}=cardBase(),P=CARD.pad,gold=tpGold(t),cx=CARD.W/2;
  g.fillStyle=CARD.muted;g.font=`600 26px ${CARD.f}`;g.textAlign="right";g.fillText(tpWhat(t).toUpperCase(),CARD.W-P,96);g.textAlign="center";
  /* the cup: a bowl, two handles, a stem and a plinth, in gold or steel */
  const top=210,gr=g.createLinearGradient(cx-200,0,cx+200,0);
  if(gold){gr.addColorStop(0,"#8C6A22");gr.addColorStop(.35,"#F2D27A");gr.addColorStop(.6,"#C9A040");gr.addColorStop(1,"#7A5A1C");}
  else{gr.addColorStop(0,"#6E737A");gr.addColorStop(.35,"#E3E6EA");gr.addColorStop(.6,"#A9AEB5");gr.addColorStop(1,"#5E636A");}
  g.fillStyle=gr;g.strokeStyle=gr;g.lineWidth=26;g.lineCap="round";
  g.beginPath();g.arc(cx-190,top+120,70,Math.PI*0.5,Math.PI*1.5);g.stroke();g.beginPath();g.arc(cx+190,top+120,70,-Math.PI*0.5,Math.PI*0.5);g.stroke();
  g.beginPath();g.moveTo(cx-200,top);g.lineTo(cx+200,top);g.bezierCurveTo(cx+200,top+260,cx+90,top+330,cx+30,top+350);g.lineTo(cx-30,top+350);g.bezierCurveTo(cx-90,top+330,cx-200,top+260,cx-200,top);g.fill();
  g.fillRect(cx-26,top+340,52,110);g.fillRect(cx-110,top+440,220,34);
  g.fillStyle="#2A2925";g.fillRect(cx-170,top+474,340,96);g.fillStyle=gr;g.fillRect(cx-120,top+500,240,44);
  g.fillStyle="#141413";g.font=`700 26px ${CARD.m}`;g.fillText(String(t.y),cx,top+532);
  /* the words */
  g.fillStyle=CARD.ink;cardFit(g,t.name,cx,890,CARD.W-2*P,66,700);   // centred: textAlign is still "center"
  const ven=t.venue&&WORLD.venues[t.venue]?WORLD.venues[t.venue].name:null,act=TIME.acts[t.act]?TIME.acts[t.act].name:"";
  g.fillStyle=CARD.lilac;cardFit(g,t.k==="promo"?`The end of the ${t.y} season`:`${ven?ven.replace(/^the /,"The ")+" · ":""}${t.y}, week ${t.w}`,cx,950,CARD.W-2*P,34,500);
  g.fillStyle=CARD.muted;
  cardFit(g,t.k==="promo"?`Into the ${act} act`:`${t.cls?SIM.CLASSES[t.cls].name:""}${t.wpn?" · with a "+t.wpn.toLowerCase():""}`,cx,1010,CARD.W-2*P,30,500);
  if(t.k!=="promo")cardFit(g,`${act} act · ${t.k==="title"?"champions":"winners"}`,cx,1060,CARD.W-2*P,30,500);
  g.textAlign="left";return c;}
const TPC={canvas:null,t:null};
async function tpOpen(i){const c=S.career,t=c&&c.trophies&&c.trophies[i];if(!t)return;TPC.t=t;TPC.canvas=null;
  openSheet(t.name,`<div id="tpPic" class="cardpic"><p class="hint">Drawing the card…</p></div>
    <div class="row"><button type="button" class="btn pri" data-tpc="share">Share</button><button type="button" class="btn" data-tpc="save">Save picture</button></div>`);
  TPC.canvas=await tpDraw(t);const el=$("tpPic");if(el&&TPC.t===t)el.innerHTML=cardImg(TPC.canvas,`Trophy card: ${t.name}, ${t.y}`);}
document.addEventListener("click",e=>{let x;
  if((x=e.target.closest("[data-tp]"))){tpOpen(+x.dataset.tp);return;}
  if((x=e.target.closest("[data-tpc]"))&&TPC.canvas){const t=TPC.t;phoSave(TPC.canvas,`scrapline-trophy-${phoSlug(t.name)}-${t.y}.png`,`${t.name} · Scrapline`,x.dataset.tpc==="share");return;}
  if((x=e.target.closest("[data-bc]"))){bcClick(x.dataset.bc);return;}
  if((x=e.target.closest("[data-tut]"))){const a=x.dataset.tut;closeSheet();if(a==="go")tutStart();else{ST().tutDone=true;save();}}});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target&&e.target.id==="bcName"){e.preventDefault();bcClick("redraw");}});
$("cardOpen").addEventListener("click",bcOpen);

/* ---- the tutorial ---- */
const TUT={bak:null,ft:null,cls:null,i:-1,timer:0,shown:-1,scrolled:-1};
const tutWedge=()=>Object.assign({},SIM.TEST_BUILDS.find(t=>t.id==="wedge").cfg,{cls:"beetle"});
const tutIsWedge=cfg=>!!cfg&&cfg.cls==="beetle"&&SIM.sameParts(SIM.normCfg(cfg),SIM.normCfg(tutWedge()));
const TUT_OPP="feierabend";
/* each step: the tab it lives on, the control it points at (sel), its words, and done() (it moves on by itself when that
   turns true) or a Next button (n) */
const TUT_STEPS=[
  {tab:"build",t:"A loaner beetle",x:()=>"This is a borrowed beetleweight with nothing fitted yet. Nothing you do in the next few minutes touches your own workshop: it all goes back at the end.",n:"Start"},
  {tab:"build",open:"designs",sel:'[data-load="t:wedge"]',t:"Load the starter wedge",x:()=>"Under Designs, the Starting points are proven builds. Load the Wedge into your draft: a steel box with a hardened front plate and a lot of push.",done:()=>tutIsWedge(draft())||tutIsWedge(bBot().cfg)},
  {tab:"build",sel:'#fitBar [data-act="fit"]',t:"Fit it",x:()=>"A draft is only a plan until it's fitted. Tap Fit, then Fit again on the bill. In a career this is where you pay.",done:()=>tutIsWedge(bBot().cfg)},
  {tab:"bench",sel:'[data-test="impact"] [data-run]',t:"Run the impact test",x:()=>"The bench hits each side of the bot with a test spinner and measures what gets through. Run the impact test.",done:()=>bnDone(bBot("beetle")).indexOf("impact")>=0},
  {tab:"bench",sel:'[data-test="impact"]',t:"Read it",x:()=>"Each side shows how much it soaked up before something behind it broke. The weakest side is where a good opponent aims. A wedge's front is its strong side: keep it pointed at them.",n:"Next"},
  {tab:"fight",pre:tutFightPrep,sel:'[data-ft="go"]',t:"Spar a club bot",x:()=>`${SIM.OPPONENTS.find(o=>o.id===TUT_OPP).name} is a careful club bot. Tap Fight and drive: ${ST().controls==="tactical"?"tap the floor to go there, tap them to attack":"the stick steers from the bot's seat, so up drives toward its front"}. The wedge has no weapon, so shove them into the wall and keep your front on them. Ninety seconds.`,done:()=>FT.rounds.length>0&&!FT.on},
  {tab:"fight",sel:"#rpCard",t:"Read the post-mortem",x:()=>"Every fight ends with this: the hits on a timeline, the damage map, the chain of causes, and one change to try. In a career, the repair bill under it is real money.",n:"Next"},
  {t:"That's the loop",x:()=>"Build it, prove it on the bench, fight, read why, build better. The loaner goes back now and your workshop is as you left it. The Career tab starts the real thing; Settings has this tutorial again.",n:"Back to my workshop",last:true}];
function tutFightPrep(){FT.sub="spar";FT.open=null;FT.opp=TUT_OPP;FT.mode="duel";FT.style="you";FT.arena="auto";FT.F=null;FT.rounds=[];FT.bout=null;}   // a spar from earlier steps doesn't count
function tutStart(){if(TUT_ON||FT.on)return;closeSheet();
  TUT.bak=snapshot();TUT.cls=ST().buildCls;TUT.ft={opp:FT.opp,mode:FT.mode,style:FT.style,arena:FT.arena,speed:FT.speed};TUT_ON=true;
  S.career=null;S.bots={};S.parked={};S.mode="sandbox";S.staff=[];S.sponsors=[];S.lastFight=null;ST().buildCls="beetle";
  B.open={designs:true};B.sel=null;B.delKey=null;FT.F=null;FT.rounds=[];FT.bout=null;if(typeof crReset==="function")crReset();
  hud();tmPaint();tutCoach();tutGo(0);
  TUT.timer=setInterval(tutTick,300);}
/* end it: the snapshot comes back, with this phone's settings as they are now */
function tutStop(){if(!TUT_ON)return;clearInterval(TUT.timer);TUT.timer=0;const keep=ST();
  S=TUT.bak;S.settings=keep;ST().tutDone=true;if(TUT.cls)ST().buildCls=TUT.cls;TUT.bak=null;TUT_ON=false;TUT.i=-1;
  Object.assign(FT,TUT.ft||{});FT.F=null;FT.rounds=[];FT.bout=null;B.open={stress:true};B.sel=null;B.delKey=null;if(typeof crReset==="function")crReset();
  const el=$("coach");if(el)el.hidden=true;document.documentElement.classList.remove("tut");
  if(sheetOn())closeSheet();save();applyAll();showTab("build");}
function tutCoach(){if($("coach"))return;const el=document.createElement("div");el.id="coach";el.hidden=true;
  el.innerHTML=`<div id="coachSpot"></div><div id="coachBox" role="dialog" aria-labelledby="coachT" aria-live="polite"><div class="step" id="coachStep"></div><h3 id="coachT"></h3><p id="coachX"></p>
    <div class="row"><button type="button" class="btn sm ghost" id="coachSkip">Leave the tutorial</button><button type="button" class="btn sm pri" id="coachNext">Next</button></div></div>`;
  $("app").appendChild(el);
  $("coachNext").addEventListener("click",()=>{const st=TUT_STEPS[TUT.i];if(!st)return;if(st.last)tutStop();else tutGo(TUT.i+1);});
  $("coachSkip").addEventListener("click",()=>{tutStop();toast("Tutorial closed. Your workshop is back.");});
  $("panel").addEventListener("scroll",()=>{if(TUT_ON)tutPlace();},{passive:true});
  window.addEventListener("resize",()=>{if(TUT_ON)tutPlace();});}
function tutGo(i){TUT.i=i;const st=TUT_STEPS[i];if(!st){tutStop();return;}
  if(st.pre)st.pre();if(st.open&&!B.open[st.open]){B.open={[st.open]:true};}
  if(st.tab&&curTab!==st.tab)showTab(st.tab);else if(st.tab&&TAB_RENDER[st.tab])TAB_RENDER[st.tab]();
  document.documentElement.classList.add("tut");$("coach").hidden=false;
  $("coachStep").textContent=`Tutorial · ${Math.min(i+1,TUT_STEPS.length)} of ${TUT_STEPS.length}`;$("coachT").textContent=st.t;$("coachX").textContent=st.x();
  const nx=$("coachNext");nx.hidden=!st.n;nx.textContent=st.n||"";$("coachSkip").hidden=!!st.last;
  TUT.scrolled=-1;tutPlace();}
/* the control the step points at, when it's on screen */
function tutTarget(){const st=TUT_STEPS[TUT.i];if(!st||!st.sel)return null;const el=document.querySelector(st.sel);if(!el||!el.getClientRects().length)return null;return el;}
function tutTick(){if(!TUT_ON)return;const st=TUT_STEPS[TUT.i];if(!st)return;
  if(st.done&&st.done()){tutGo(TUT.i+1);return;}
  tutPlace();}
function tutPlace(){const st=TUT_STEPS[TUT.i],spot=$("coachSpot"),box=$("coachBox");if(!st||!spot)return;
  {const pr=$("panel").getBoundingClientRect();box.style.left=(pr.left+pr.width/2)+"px";box.style.width=Math.min(528,pr.width-24)+"px";}   // over the panel: on a phone on its side that's the right-hand column
  $("coach").style.visibility=sheetOn()||FT.on?"hidden":"";
  const off=st.tab&&curTab!==st.tab,tx=off?`This step is on the ${st.tab[0].toUpperCase()+st.tab.slice(1)} tab.`:st.x();if($("coachX").textContent!==tx)$("coachX").textContent=tx;
  const el=off?null:tutTarget();
  if(el&&TUT.scrolled!==TUT.i&&$("panel").contains(el)){TUT.scrolled=TUT.i;const pr=$("panel").getBoundingClientRect(),r=el.getBoundingClientRect();
    if(r.top<pr.top+20||r.bottom>pr.bottom-20)$("panel").scrollTop+=(r.top-pr.top)-pr.height*0.3;}
  const H=window.innerHeight;let r=el?el.getBoundingClientRect():null;
  if(r&&$("panel").contains(el)){const pr=$("panel").getBoundingClientRect(),t=Math.max(r.top,pr.top),b=Math.min(r.bottom,pr.bottom,$("tabs").getBoundingClientRect().top-4);r=b-t>12?{left:r.left,right:r.right,top:t,bottom:b}:null;}
  if(r){spot.style.display="";spot.style.left=(r.left-6)+"px";spot.style.top=(r.top-6)+"px";spot.style.width=(r.right-r.left+12)+"px";spot.style.height=(r.bottom-r.top+12)+"px";
    const bh=box.offsetHeight||160;if(r.bottom+16+bh<H-8){box.style.top=(r.bottom+16)+"px";box.style.bottom="auto";}else{box.style.top="auto";box.style.bottom=Math.max(8,H-r.top+16)+"px";}}
  else{spot.style.display="none";box.style.top="auto";box.style.bottom="calc(var(--tabh) + 16px + env(safe-area-inset-bottom,0px))";}}
/* after the intro, once: the offer */
function tutOffer(){if(ST().tutDone||TUT_ON)return;
  openSheet("Your first fight",`<p>A coached first fight, about five minutes: fit a starter wedge, test it on the bench, spar a club bot and read why it went the way it did.</p>
    <p class="hint">It runs on a loaner bot, so it changes nothing in your workshop. Not now costs nothing: Settings has it again any time.</p>
    <div class="row"><button type="button" class="btn pri" data-tut="go">Show me</button><button type="button" class="btn" data-tut="skip">Not now</button></div>`);}
</script>
