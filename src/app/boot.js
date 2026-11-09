/* ===================== app/boot.js: tabs, Settings, intro, start-up =====================
   showTab(t) switches the five tabs (Build, Bench, Fight, Shop, Career) and remembers the last one in S.settings.tab.
   openSettings() fills the bottom sheet: graphics tier, auto-adjust, theme, motion, effects (PR 9), controls (direct /
   tactical), hand, assists, sound, voices, commentary and captions (0.1.16), the tutorial again (PR 9), saves, Dev mode (0.1.30: +€1,000 and Unlock all), install, version.
   start() runs once the whole app script has loaded (scheduled through __ldGo at the bottom of this file): it loads
   the save, starts the 3D view, draws the tabs and lifts the loading splash. */
const TABS=["build","bench","fight","shop","career"];
const TAB_RENDER={};   // tab name -> render function; each tab file adds its own (app/build.js, bench.js, fight.js, shop.js, career.js)
let curTab="build";
const tabScroll={};
function showTab(t){
  if(!TABS.includes(t))t="build";
  tabScroll[curTab]=$("panel").scrollTop;curTab=t;ST().tab=t;
  document.documentElement.setAttribute("data-tab",t);
  document.querySelectorAll("#tabs button").forEach(b=>{const on=b.dataset.tab===t;b.classList.toggle("on",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  document.querySelectorAll(".tabpage").forEach(p=>p.classList.toggle("on",p.id==="tab-"+t));
  if(t!=="fight"&&typeof SCRAP_VOICE!=="undefined")SCRAP_VOICE.stop();   // the voices belong to the Fight tab
  if(TAB_RENDER[t])TAB_RENDER[t]();
  visBot();
  $("panel").scrollTop=tabScroll[t]||0;
  save();}
$("tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(b)showTab(b.dataset.tab);});

/* ---- Settings ---- */
function segHtml(id,attr,opts,cur){return `<div class="seg" id="${id}" role="group">${opts.map(([v,l,s])=>`<button type="button" data-${attr}="${v}" class="${String(v)===String(cur)?"on":""}" aria-pressed="${String(v)===String(cur)}">${l}${s?`<small>${s}</small>`:""}</button>`).join("")}</div>`;}
function openSettings(){
  const ap=PWA.canInstall(),tip=PWA.iosTip();
  openSheet("Settings",`
<div class="field"><span class="lbl">Mode</span>${segHtml("modeSeg","mode",[["career","Career",S.career&&!S.career.over?"week "+S.career.week:"twenty seasons"],["sandbox","Sandbox","every part, free"]],S.mode==="career"?"career":"sandbox")}
<p class="hint">Each mode keeps its own garage. Saved designs are shared, so a build proven in the Sandbox loads in the career.</p></div>
<div class="field"><span class="lbl">Graphics</span>${segHtml("gfxSeg","gfx",[["lite","Lite","phones"],["full","Full","shadows"],["ultra","Ultra","bloom"]],gfxTier())}
<p class="hint">Lite is the phone default and always looks finished. Full and Ultra add shadows, metal reflections and glow on sparks.</p></div>
<div class="field"><span class="lbl">Auto-adjust graphics</span>${segHtml("gfxAutoSeg","gauto",[["1","On","lowers it if it stutters"],["0","Off"]],ST().gfxAuto===false?"0":"1")}</div>
<div class="field"><span class="lbl">Theme</span>${segHtml("themeSeg","theme",[["dark","Dark","night shift"],["light","Light","daylight"],["auto","Auto","follow phone"]],ST().theme||"dark")}</div>
<div class="field"><span class="lbl">Motion</span>${segHtml("reduceSeg","reduce",[["auto","Auto","follow phone"],["1","Reduced"],["0","Full"]],ST().reduce==null?"auto":ST().reduce?"1":"0")}</div>
<div class="field"><span class="lbl">Effects</span>${segHtml("fxSeg","fxl",[["full","Full","sparks, smoke, flying parts"],["reduced","Reduced","a few sparks"]],fxLow()?"reduced":"full")}
<p class="hint">Reduced keeps the fight readable with less going on: a few sparks, light smoke, no parts flying off, small steady hit rings in the 2D view. Motion covers camera shake and movement in the menus.</p></div>
<div class="field"><span class="lbl">Controls</span>${segHtml("ctlSeg","ctl",[["direct","Direct","stick and button"],["tactical","Tactical","tap where to go"]],ST().controls==="tactical"?"tactical":"direct")}
<p class="hint">Direct: a stick under your left thumb, the weapon under your right. Tactical: tap the floor to drive there, tap the opponent to attack, tap your bot to back off. Keyboard (W A S D, space, R) and gamepads work with either.</p></div>
<div class="field"><span class="lbl">Hand</span>${segHtml("handSeg","hand",[["0","Right-handed","weapon on the right"],["1","Left-handed","weapon on the left"]],ST().leftHanded?"1":"0")}</div>
<div class="field"><span class="lbl">Driving assists</span>${segHtml("asSeg","assist",[["1","On",crLevel()],["0","Off"]],ST().assists===false?"0":"1")}
<p class="hint">Holds your heading when you aren't steering, softens the steering at speed, and spins a disc up only when they're near.</p></div>
<div class="field"><span class="lbl">Sound</span>${segHtml("sndSeg","snd",[["1","On"],["0","Off"]],ST().sound===false?"0":"1")}</div>
<div class="field"><span class="lbl">Voices</span>${segHtml("vocSeg","voc",[["1","On","announcer and commentator"],["0","Off"]],ST().voice===false?"0":"1")}</div>
<div class="field"><span class="lbl">Commentary</span>${segHtml("comSeg","com",[["1","On","Jess Moser on the radio"],["0","Off","announcer only"]],ST().comm===false?"0":"1")}</div>
<div class="field"><span class="lbl">Captions</span>${segHtml("capSeg","capt",[["muted","When muted","sound or voices off"],["off","Off"]],ST().captions==="off"?"off":"muted")}
<p class="hint">The calls as text at the bottom of a fight, when you can't hear them.</p></div>
<div class="field"><span class="lbl">Tutorial</span><div class="row"><button class="btn" id="tutAgain"${TUT_ON?" disabled":""}>Run the tutorial</button></div><p class="hint">A coached first fight on a loaner bot. Your workshop is put back as it was at the end.</p></div>
<div class="field"><span class="lbl">Saves</span><div class="row"><button class="btn" data-bu="backup">Back up</button><button class="btn" data-bu="restore">Restore</button></div>
<div class="row"><button class="btn" data-bu="file">Save backup file</button><button class="btn" data-bu="load">Load backup file</button></div><p class="hint" data-bk-store hidden></p></div>
<div class="field"><span class="lbl">Dev mode</span>${segHtml("devSeg","dev",[["0","Off"],["1","On","testing buttons"]],ST().dev?"1":"0")}
<div id="devBox"${ST().dev?"":" hidden"}><div class="row"><button class="btn" id="devCash">+${fmt$(DEV_CASH)}</button><button class="btn" id="devAll">Unlock all</button></div>
<p class="hint">For testing a career. +${fmt$(DEV_CASH)} goes straight into the tin; Unlock all gives every tool, every R&amp;D project and the team HQ (its rent is ${fmt$(WORKSHOP_STAGES[WORKSHOP_STAGES.length-1].rent)} a week). Your act stays where it is, and custom work still needs a fabricator.</p></div></div>
${ap||tip?`<div class="field"><span class="lbl">App</span>${ap?`<div class="row"><button class="btn" id="pwaInstall">Install app</button></div><p class="hint">Adds Scrapline to your home screen. It works offline once installed.</p>`:`<p class="hint" style="margin-top:0">On iPhone or iPad: tap Share, then <b>Add to Home Screen</b>. It works offline once installed.</p>`}</div>`:""}
<p class="hint">Scrapline ${VERSION} · © ${new Date().getFullYear()} Kelbo / Longlight Interactive</p>`);
  const pick=(id,attr,fn)=>$(id).addEventListener("click",e=>{const b=e.target.closest(`[data-${attr}]`);if(!b)return;
    fn(b.dataset[attr]);$(id).querySelectorAll("button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});save();});
  $("modeSeg").addEventListener("click",e=>{const b=e.target.closest("[data-mode]");if(!b)return;if(setMode(b.dataset.mode))closeSheet();});
  pick("gfxSeg","gfx",v=>{ST().gfx=v;perfManual();applyGfx();});
  pick("gfxAutoSeg","gauto",v=>{ST().gfxAuto=v==="1";PERF.dropped=PERF.manual=false;perfReset(true);});
  pick("themeSeg","theme",v=>{ST().theme=v;applyTheme();});
  pick("reduceSeg","reduce",v=>{ST().reduce=v==="auto"?null:v==="1";applyReduce();});
  pick("fxSeg","fxl",v=>{ST().effects=v==="reduced"?"reduced":"full";applyReduce();});
  pick("ctlSeg","ctl",v=>{ST().controls=v;});
  pick("handSeg","hand",v=>{ST().leftHanded=v==="1";});
  pick("asSeg","assist",v=>{ST().assists=v==="1";});
  pick("sndSeg","snd",v=>{ST().sound=v==="1";if(v!=="1")SCRAP_SOUND.stop();applyVoice();ftVoiceLoad();});
  pick("vocSeg","voc",v=>{ST().voice=v==="1";applyVoice();ftVoiceLoad();});
  pick("comSeg","com",v=>{ST().comm=v==="1";applyVoice();});
  pick("capSeg","capt",v=>{ST().captions=v==="off"?"off":"muted";applyVoice();});
  pick("devSeg","dev",v=>{ST().dev=v==="1";$("devBox").hidden=!ST().dev;});
  $("devCash").addEventListener("click",devCash);$("devAll").addEventListener("click",devUnlockAll);
  buStoreLine();
  $("tutAgain").addEventListener("click",()=>{closeSheet();tutStart();});
  if($("pwaInstall"))$("pwaInstall").addEventListener("click",()=>{PWA.install();closeSheet();});
}
/* Dev mode (Kelbo, 0.1.30): a switch in Settings (ST().dev, kept on this phone) that shows two testing buttons for a career.
   Unlock all owns every tool and R&D project and moves into the last workshop stage; the act stays (Kelbo's pick), and a
   fabricator is a hire, not an unlock */
const DEV_CASH=1000;
function devCareer(){if(TUT_ON){toast("Not during the tutorial");return null;}const c=S.mode==="career"?S.career:null;
  if(!c||c.over){toast(S.mode!=="career"?"Switch to Career mode first (Mode, above)":"Start a career first (Career tab)");return null;}return c;}
function devRedraw(){save();hud();if(["build","shop","career"].includes(curTab)&&TAB_RENDER[curTab])TAB_RENDER[curTab]();}   // not the Fight tab: a bout may be on
function devCash(){const c=devCareer();if(!c)return;c.money+=DEV_CASH;crLedger(DEV_CASH,"Dev mode");devRedraw();toast(`+${fmt$(DEV_CASH)} · ${fmt$(c.money)}`);}
function devUnlockAll(){const c=devCareer();if(!c)return;for(const t of TOOL_IDS)S.unlocks.tools[t]=true;for(const r of RND_IDS)S.unlocks.rnd[r]=true;
  const r=tmC().rnd;r.cur=null;c.stage=WORKSHOP_STAGES[WORKSHOP_STAGES.length-1].id;devRedraw();toast("Every tool, every R&D project and the team HQ");}
$("setOpen").addEventListener("click",openSettings);
$("sheetClose").addEventListener("click",closeSheet);
$("scrim").addEventListener("click",closeSheet);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&sheetOn()){closeSheet();e.preventDefault();}});

/* ---- intro (first visit only) ---- */
/* the home screen (0.1.18.0, PEW's way): the first visit picks Career or Sandbox; after that it's Settings → Mode */
$("intro").addEventListener("click",e=>{const b=e.target.closest("[data-mode]");if(!b)return;
  ST().seen=true;document.documentElement.classList.remove("home");$("intro").hidden=true;
  setMode(b.dataset.mode,true);if(b.dataset.mode==="career"&&!S.career)showTab("career");save();
  $("tabs").querySelector("button.on").focus({preventScroll:true});setTimeout(tutOffer,250);});   // tutOffer: app/help.js

/* ---- start-up ---- */
function start(){
  loadSaved();
  applyAll();   // sets the tier before the 3D view builds, so it builds once
  try{SCRAP_VIS.init($("gl"));}catch(e){$("tag").textContent="3D view unavailable on this device";}
  $("verLbl").textContent="v"+VERSION;
  $("intro").hidden=!!ST().seen;document.documentElement.classList.toggle("home",!ST().seen);
  showTab(ST().tab||"build");
  buStoreLine();
  __ldDone();}
__ldGo(start);
