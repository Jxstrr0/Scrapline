<script>
/* ===================== Scrapline: app state =====================
   The app script is one top-level script spread over app/state.js … app/help.js (in manifest order); start() runs once the
   whole block has loaded (app/boot.js schedules it through __ldGo).
   This file: VERSION, WORLD (every place name in Velmark), the career tables (filled in by later PRs, named here so every
   PR uses the same names), the S state object and its save shape, save / load / migrate / save slots, theme, graphics tier,
   and the small UI helpers every tab uses ($, fmt$, toast, the sheet).
   localStorage keys (every access wrapped in try/catch): "scr-save" (the current game, settings included) and
   "scr-slot1" .. "scr-slot3" (the save slots). A new key must also go into buMake / buWrite in app/savecode.js and KEYS in
   check-savecode.js; stop and ask before adding one. New fields inside scr-save are fine: bump SAVE_V and migrate. */
const VERSION="0.1.8.0";
const SIM=SCRAP_SIM;
const $=id=>document.getElementById(id);

/* ---- the world (plan section 1): Velmark, an invented alpine country ---- */
const WORLD={
  country:"Velmark",
  region:"the Haldis",              // the northern watchmaking valley where the player starts
  regionCap:"The Haldis",
  home:"a rented corner of a Haldis machine shop",
  bank:"the Haldis Savings Bank",   // lends once when you go broke (PR 7)
  league:"the Scrapline",           // Velmark's robot-combat circuit
  open:"the Scrapline Open",        // its televised heavyweight league
  venues:{                          // km from the Haldis (one way) and nights away: travel costs and workshop hours (TIME)
    club:{name:"the Haldis Gemeindehalle",what:"club meets in the valley's community hall",km:6,nights:0},
    stahl:{name:"Stahlbrück",what:"regional tournaments in the steel-mill city",km:85,nights:1},
    eisenau:{name:"Eisenau",what:"regional tournaments at the river port",km:140,nights:1},
    grauwald:{name:"Grauwald",what:"regional tournaments in the forest rail town",km:120,nights:1},
    eisenhalle:{name:"the Eisenhalle",what:"home arena of the televised Scrapline Open",km:210,nights:2}
  },
  startYear:2026,                   // present day; the year advances per season, 20-year career
  seasons:20
};

/* ---- career tables (plan sections 11-12). PR 7 fills the career's; PR 8 fills RND, STAFF, SPONSORS, META_WAVES. ---- */
/* the time model (app/career.js). A season is 52 weeks; you act, then Close week. Each week the workshop stage gives its
   hours (WORKSHOP_STAGES); unused hours carry over up to bankWeeks weeks' worth. An event day takes eventHours, and each
   night away nightHours more; travel costs perKm both ways (x the stage's travel) plus night per night away.
   Going broke (rent you can't pay at Close week) brings the bank's one loan; half of every prize goes to paying it back,
   with loanRate on top. Broke again with the loan used up ends the run.
   Driver skill: xp per fight (drive is a fight you drove, sim a quick sim, win on top). levels are the assist levels
   (ASSISTS) by xp; skill is the AI's skill number when your bot is quick-simmed.
   acts: the classes each act's events are in. You move up an act at the end of a season if you placed top two at that
   act's championship, or your rep reached repTo. */
const TIME={weeks:52,bankWeeks:2,eventHours:6,nightHours:4,perKm:0.3,night:45,
  startMoney:1500,loan:1000,loanRate:0.1,loanShare:0.5,
  xp:{drive:3,sim:1,win:2},levels:[["rookie",0],["club",25],["pro",70]],skill:{base:0.5,perXp:0.002,max:0.9},
  acts:[
    {id:"garage", name:"Garage",     classes:["ant","beetle"],  repTo:60, line:"Club meets at the Haldis Gemeindehalle, a tournament or two, and the club championship."},
    {id:"circuit",name:"Circuit",    classes:["hobby","feather"],repTo:160,line:"Regional tournaments in Stahlbrück, Eisenau and Grauwald, rumbles and tag team, and the Regional Final."},
    {id:"heavy",  name:"Heavyweight",classes:["heavy"],          repTo:320,line:"The Scrapline Open at the Eisenhalle, on television."},
    {id:"legacy", name:"Legacy",     classes:["heavy"],          repTo:0,  line:"You've won the Open. Defend it; a team, sponsors and a kit line come with PR 8."}]};
/* the workshop (Shop tab): price to move in, rent a week, workshop hours a week, the heaviest class it can build, and
   travel (x travel costs: the shop has a van, the HQ a trailer) */
const WORKSHOP_STAGES=[
  {id:"corner",name:"A rented corner",price:0,    rent:15, hours:16,maxCls:"feather",  travel:1,   line:"A bench and a shelf in a Haldis watch-parts machine shop. The owner lets you use the vice."},
  {id:"unit",  name:"Your own unit",  price:4000, rent:60, hours:22,maxCls:"feather",travel:1,   line:"A lock-up on the industrial estate with a roller door and three-phase power."},
  {id:"shop",  name:"A proper shop",  price:15000,rent:160,hours:30,maxCls:"heavy",  travel:0.85,line:"Room for a heavyweight, a gantry crane and a van."},
  {id:"hq",    name:"Team HQ",        price:60000,rent:400,hours:40,maxCls:"heavy",  travel:0.6, line:"A unit with an office, a test box of your own and a trailer for the travel."}];
/* tools (Shop tab): parts with unlock "tool:<id>" need it (app/build.js refuses to fit them without), and each cuts the
   build and repair hours of the slots it names (cut: slot -> share; "all" for every slot). Cuts multiply, down to half.
   stage: the workshop stage it needs room for. */
const TOOLS={
  hand:      {name:"Hand tools",  price:0,   stage:"corner",cut:{},                               line:"Files, drivers, a hacksaw and the vice. Everyone starts here."},
  printer:   {name:"3D printer",  price:350, stage:"corner",cut:{wheels:0.15,electronics:0.1},    line:"Polyurethane tyres, cooling ducts and mounts overnight."},
  bandsaw:   {name:"Bandsaw",     price:450, stage:"corner",cut:{chassis:0.1,armour:0.1},         line:"Cuts aluminium plate. Aluminium chassis and armour."},
  drillpress:{name:"Drill press", price:500, stage:"corner",cut:{drive:0.1,armour:0.05,weapon:0.05},line:"Straight holes in hard steel. Steel armour, gearboxes, the pneumatic flipper."},
  welder:    {name:"Welder",      price:900, stage:"corner",cut:{chassis:0.15},                   line:"Steel chassis, AR500 plate and anti-spinner bars."},
  mill:      {name:"Mill",        price:2400,stage:"unit",  cut:{weapon:0.15,weaponMaterial:0.2}, line:"S7 tool steel discs and tracks. Needs your own unit."},
  lathe:     {name:"Lathe",       price:1800,stage:"unit",  cut:{weapon:0.15,drive:0.1},          line:"Turns hubs, shafts and drums. Weapons and drive go in faster."},
  press:     {name:"Press brake", price:3500,stage:"unit",  cut:{chassis:0.2,armour:0.15},        line:"Folds plate in one go. Chassis and armour go in faster."},
  cnc:       {name:"CNC router",  price:6500,stage:"shop",  cut:{all:0.15},                       line:"Cuts anything from a drawing while you sleep. Needs a proper shop."}};
const TOOL_IDS=Object.keys(TOOLS);
/* event kinds: format (league: a round robin; bracket: single elimination with a best-of-three final; rumble: one
   free-for-all; tag: you and a partner against two), the field size, entry fee and prizes by placing (x the class's
   prizeScale; a bracket's are 1st, 2nd, the semi-finals, the rest), rep by placing, the other drivers' skill (+ skillAct
   per act), the pit kit the other crews bring */
const EVENT_KINDS={
  club:      {name:"Club meet",   format:"league", size:4,entry:20, prizes:[300,150,75,0],  rep:[5,3,1,0], skill:0.45,crewKit:"basic"},
  tournament:{name:"Tournament",  format:"bracket",size:8,entry:60, prizes:[900,450,200,0], rep:[12,7,3,0],skill:0.6, crewKit:"full"},
  rumble:    {name:"Rumble",      format:"rumble", size:4,entry:40, prizes:[500,200,0,0],   rep:[6,2,0,0], skill:0.55,crewKit:"basic"},
  tag:       {name:"Tag team",    format:"tag",    size:4,entry:50, prizes:[600,0],         rep:[6,0],     skill:0.6, crewKit:"basic"},
  champ:     {name:"Championship",format:"bracket",size:8,entry:100,prizes:[2000,900,400,0],rep:[20,12,5,1],skill:0.7,crewKit:"full"}};
const EVENT_SKILL_ACT=0.08,EVENT_SKILL_MAX=0.92;
/* the season's calendar, the same every season (the year changes). act: the act whose calendar it's on (you see your
   act's and the one before's). venue: a WORLD.venues key. One event a week at most. */
const SEASON_EVENTS=[
  {id:"g1", act:0,week:3, kind:"club",      cls:"beetle", venue:"club",      name:"Beetle club meet"},
  {id:"g2", act:0,week:8, kind:"club",      cls:"ant",    venue:"club",      name:"Ant club meet"},
  {id:"g3", act:0,week:12,kind:"club",      cls:"beetle", venue:"club",      name:"Beetle club meet"},
  {id:"g4", act:0,week:17,kind:"tournament",cls:"beetle", venue:"club",      name:"Haldis Spring Cup"},
  {id:"g5", act:0,week:22,kind:"club",      cls:"beetle", venue:"club",      name:"Beetle club meet"},
  {id:"g6", act:0,week:27,kind:"rumble",    cls:"beetle", venue:"club",      name:"Rumble night"},
  {id:"g7", act:0,week:31,kind:"club",      cls:"ant",    venue:"club",      name:"Ant club meet"},
  {id:"g8", act:0,week:36,kind:"tournament",cls:"beetle", venue:"stahl",     name:"Stahlbrück Beetle Cup"},
  {id:"g9", act:0,week:41,kind:"club",      cls:"beetle", venue:"club",      name:"Beetle club meet"},
  {id:"g10",act:0,week:47,kind:"champ",     cls:"beetle", venue:"club",      name:"Haldis Club Championship"},
  {id:"c1", act:1,week:5, kind:"tournament",cls:"hobby",  venue:"stahl",     name:"Stahlbrück Hobby Open"},
  {id:"c2", act:1,week:10,kind:"tournament",cls:"feather",venue:"eisenau",   name:"Eisenau Feather Cup"},
  {id:"c3", act:1,week:15,kind:"rumble",    cls:"hobby",  venue:"grauwald",  name:"Grauwald Rumble"},
  {id:"c4", act:1,week:20,kind:"tag",       cls:"feather",venue:"eisenau",   name:"Eisenau Tag Team"},
  {id:"c5", act:1,week:25,kind:"tournament",cls:"hobby",  venue:"grauwald",  name:"Grauwald Hobby Cup"},
  {id:"c6", act:1,week:30,kind:"tournament",cls:"feather",venue:"stahl",     name:"Stahlbrück Feather Open"},
  {id:"c7", act:1,week:35,kind:"rumble",    cls:"feather",venue:"eisenau",   name:"Eisenau Rumble"},
  {id:"c8", act:1,week:40,kind:"tournament",cls:"hobby",  venue:"eisenau",   name:"Eisenau Hobby Cup"},
  {id:"c9", act:1,week:46,kind:"champ",     cls:"feather",venue:"stahl",     name:"Regional Final"},
  {id:"h1", act:2,week:6, kind:"tournament",cls:"heavy",  venue:"eisenhalle",name:"Scrapline Open, round 1"},
  {id:"h2", act:2,week:14,kind:"tournament",cls:"heavy",  venue:"eisenhalle",name:"Scrapline Open, round 2"},
  {id:"h3", act:2,week:18,kind:"rumble",    cls:"heavy",  venue:"eisenhalle",name:"Open Rumble"},
  {id:"h4", act:2,week:23,kind:"tournament",cls:"heavy",  venue:"eisenhalle",name:"Scrapline Open, round 3"},
  {id:"h5", act:2,week:28,kind:"tag",       cls:"heavy",  venue:"eisenhalle",name:"Open Tag Team"},
  {id:"h6", act:2,week:33,kind:"tournament",cls:"heavy",  venue:"eisenhalle",name:"Scrapline Open, round 4"},
  {id:"h7", act:2,week:39,kind:"tournament",cls:"heavy",  venue:"eisenhalle",name:"Scrapline Open, round 5"},
  {id:"h8", act:2,week:48,kind:"champ",     cls:"heavy",  venue:"eisenhalle",name:"Scrapline Open Final"}];
/* rivals: builders who turn up at your events in their classes, remember every fight (S.rivals) and say so in one line.
   bots: per class, a starting build ("op:<OPPONENTS id>" or "tb:<TEST_BUILDS id>") and steps: upgrades taken one a
   season, and one more for every two times you beat them (a step that won't fit the weight limit is skipped). skill:
   their driving, + 0.03 a step. talk: before a fight, by how the last one went. */
const RIVALS=[
  {id:"ottilie",name:"Ottilie Brandt",from:"club",skill:0.55,line:"A watchmaker's apprentice. Measures twice, cuts once, gloats three times.",
    bots:{beetle:{name:"Unruh",base:"tb:flipper"},hobby:{name:"Unruh II",base:"tb:flipper"},feather:{name:"Hemmung",base:"tb:flipper"},heavy:{name:"Grande Complication",base:"tb:flipper"}},
    steps:[{wheels:"pu"},{armour:{front:"ar500"}},{extras:["skid"]},{battery:"hd"},{armour:{left:"ar500",right:"ar500"}}],
    talk:{first:"I've seen your bot. Interesting tolerances. By which I mean there aren't any.",won:"Same again? I brought a spare. You'll want two.",
      lost:"Lucky. I've re-timed the flipper since. To the millisecond.",streak:"Fine. You're good. Don't tell anyone I said so."}},
  {id:"rudi",name:"Rudi Kessler",from:"stahl",skill:0.5,line:"Rolls steel by day in Stahlbrück. Believes armour is a personality.",
    bots:{beetle:{name:"Amboss",base:"tb:brick"},hobby:{name:"Amboss II",base:"tb:brick"},feather:{name:"Walzblock",base:"tb:brick"},heavy:{name:"Hochofen Nord",base:"tb:brick"}},
    steps:[{armour:{top:"steel"}},{wheels:"tracks"},{armour:{back:"ar500"}},{drive:"gearbox"},{electronics:"failsafe"}],
    talk:{first:"Spinner? Wedge? Doesn't matter. It all bounces off.",won:"Told you. It all bounces off.",
      lost:"Something got through. I've welded over it.",streak:"I'm adding another plate. And another."}},
  {id:"mira",name:"Mira Vogt",from:"eisenau",skill:0.6,line:"Eisenau docks crane driver. Only builds spinners. Only ever will.",
    bots:{beetle:{name:"Strudel",base:"tb:vsp"},hobby:{name:"Strudel II",base:"tb:vsp"},feather:{name:"Kielwasser",base:"tb:drum"},heavy:{name:"Sturmflut",base:"tb:vsp"}},
    steps:[{weaponMaterial:"s7"},{battery:"hd"},{armour:{front:"ar500"}},{electronics:"cooling"},{wheels:"pu"}],
    talk:{first:"Don't worry, the first hit is the only one you'll feel.",won:"Bring more plate next time. Or a bucket.",
      lost:"My disc was off balance. It won't be.",streak:"Okay. Okay. I'm going bigger."}},
  {id:"anselm",name:"Anselm Huber",from:"grauwald",skill:0.5,line:"Grauwald rail yard signalman. Hammers, mostly. Very patient.",
    bots:{ant:{name:"Kleinbahn",base:"tb:hammer"},beetle:{name:"Weiche",base:"tb:hammer"},hobby:{name:"Rangierlok",base:"tb:hammer"},feather:{name:"Stellwerk",base:"tb:hammer"},heavy:{name:"Güterzug",base:"tb:hammer"}},
    steps:[{armour:{top:"ar500"}},{wheels:"pu"},{extras:["selfright"]},{electronics:"failsafe"},{drive:"gearbox"}],
    talk:{first:"I'll wait. The hammer comes down when it comes down.",won:"On time, as always.",
      lost:"Delays happen. The timetable gets revised.",streak:"Right. I'm re-signalling the whole thing."}}];
/* after-fight repair bills (app/report.js; charged from PR 7). A damaged part costs a fee of its price x (minShare + the
   share of its hp lost x (maxShare - minShare)); a destroyed one is re-bought at full price. The chassis is never
   re-bought: a broken chassis costs rebuildShare of its price. Hours: each repair kind's workshop hours (x the class's
   hoursScale); a damaged part takes 0.2 + 0.6 x the share of its hp lost of that. A plate, a wheel, a drive pod is priced as its share of the set. */
const REPAIR_COST={minShare:0.1,maxShare:0.6,rebuildShare:0.8};
const REPAIR_HOURS={wheel:0.5,pod:1.5,armour:1,battery:0.5,electronics:1,weapon:2,extras:0.5,chassis:4};
/* the pit window (app/pit.js): 60 real seconds, one repair at a time, the clock keeps running while you decide. A kit
   (bought before each event from PR 7; free to pick when sparring) says which repairs you may do and how many, for the
   whole event. price x the class's prizeScale. */
const PIT_KITS={
  basic:{name:"Basic kit",price:60, allow:{wheel:2,bodge:2},                                   line:"Spare wheels and a roll of tape."},
  full: {name:"Full kit", price:180,allow:{wheel:4,bodge:3,belt:2,armour:2,battery:1},          line:"Adds belts, armour panels and a spare battery."},
  pro:  {name:"Pro kit",  price:420,allow:{wheel:4,bodge:4,belt:2,armour:4,battery:2,pod:2,disc:1},line:"Adds drive pods and a spare weapon disc."}
};
/* pit-window repairs: seconds and what each does. A swap puts the part back to new; a bodge patches any damaged or
   destroyed part (not the chassis or a bent disc) to half strength. belt: a damaged weapon (not bent); disc: a bent or
   wrecked weapon (pro kit only). A swapped battery stops smoking; a bodged speed controller brings its side back. */
const REPAIR_TIMES={wheel:15,belt:20,pod:35,battery:25,armour:30,bodge:10,disc:30};
const PIT_S=60;
/* driving assists by driver skill (app/controls.js): straighten holds the heading when you aren't steering (x the spin
   rate), turnDamp softens and smooths the steering (more at speed), autoSpin spins a disc up only when an enemy is near.
   Everyone drives as a rookie until PR 8's drivers; Settings → Driving assists picks "off". */
const ASSISTS={
  rookie:{straighten:0.6,turnDamp:0.45,autoSpin:true},
  club:  {straighten:0.35,turnDamp:0.3,autoSpin:true},
  pro:   {straighten:0.15,turnDamp:0.15,autoSpin:false},
  off:   {straighten:0,turnDamp:0,autoSpin:false}
};
const RND={};               // R&D projects (PR 8)
const STAFF={};             // engineer, fabricator, driver, pit crew (PR 8)
const SPONSORS=[];          // paint and a placing target (PR 8)
const META_WAVES=[],RULES_BY_SEASON=[];   // the opponent field and rule changes by season (PR 8)

/* ---- state: the scr-save shape (plan section 15). settings belong to this phone and survive loading a slot. ---- */
const SAVE_V=5;
function freshSettings(){return{seen:false,theme:"dark",gfx:null,gfxAuto:true,reduce:null,sound:true,tab:"build",buildCls:"beetle",controls:"direct",leftHanded:false,assists:true};}
function freshState(){return{v:SAVE_V,settings:freshSettings(),
  career:null,                    // null until Start career (PR 7); then crFresh()'s shape (app/career.js): {seed, year, week, season, act, money, loan, hours, driverXp, rep, stage, events, entered, day, results, ledger, broke, over}
  bots:{},                        // {<classId>: {cfg, damage, flags, draft, bench}}: the fitted bot per class (cfg null until first fitted), the damage it carries (J per key) and failures (flags: bent, smoke, cell, esc; PR 7), the Build tab's unfitted edits, and which bench tests have run on it ({sig, done}, PR 3)
  designs:{},                     // {<classId>: [{name, cfg}]}: blueprints (PR 2)
  unlocks:{tools:{},rnd:{}},       // tools: {<TOOLS id>: true} owned in the career (PR 7); rnd: PR 8
  staff:[],sponsors:[],rivals:{}, // rivals: {<RIVALS id>: {w, l, beat, last}} what each remembers (PR 7); staff and sponsors PR 8
  lastFight:null,                 // the latest fight log, for replay (PR 6)
  lastBackup:0};}
let S=freshState();
const ST=()=>S.settings;

const buObjS=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
/* bring an older save up to SAVE_V. Each step takes a save at version n and returns it at n+1; add one per bump. */
const MIGRATE={
  1:o=>{if(o.settings&&typeof o.settings==="object"&&!o.settings.buildCls)o.settings.buildCls="beetle";return o;},   // 0.1.2.0: the Build tab remembers its class
  2:o=>o,   // 0.1.3.0: bots[cls].bench {sig, done} (which bench tests have run on the fitted bot) is optional; nothing to fill
  3:o=>{const s=o.settings;if(s&&typeof s==="object"){if(s.controls!=="tactical")s.controls="direct";s.leftHanded=!!s.leftHanded;if(s.assists!==false)s.assists=true;}return o;},   // 0.1.6.0: control scheme, handedness, assists
  4:o=>{o.career=null;return o;}   // 0.1.8.0: the career (PR 7). Nothing could have one before, so it starts empty; bots[cls].flags is optional
};
function migrate(o){let v=typeof o.v==="number"?o.v:1;while(v<SAVE_V){if(!MIGRATE[v])return null;o=MIGRATE[v](o);v++;o.v=v;}return o;}
function save(){try{localStorage.setItem("scr-save",JSON.stringify(S));}catch(e){return;}buSaved();}   // buSaved: app/savecode.js (asks the browser to keep our storage)
function snapshot(){return JSON.parse(JSON.stringify(S));}
/* load a save object into S. false (and S untouched) if it isn't one of ours, or comes from a newer version */
function hydrate(o){if(!buObjS(o)||typeof o.v!=="number"||o.v>SAVE_V||!buObjS(o.settings)||!buObjS(o.bots))return false;
  o=migrate(JSON.parse(JSON.stringify(o)));if(!o)return false;
  const n=freshState();Object.assign(n,o);
  n.settings=Object.assign(freshSettings(),o.settings);
  n.unlocks=Object.assign({tools:{},rnd:{}},buObjS(o.unlocks)?o.unlocks:{});
  for(const k of ["designs","rivals"])if(!buObjS(n[k]))n[k]={};
  for(const k of ["staff","sponsors"])if(!Array.isArray(n[k]))n[k]=[];
  S=n;return true;}
function loadSaved(){try{const j=localStorage.getItem("scr-save");if(j&&hydrate(JSON.parse(j)))return true;}catch(e){}S=freshState();return false;}
const SLOTS=3,slotKey=i=>"scr-slot"+i;
/* a restored game: take it, store it, redraw everything */
function applyLoaded(o,msg){if(!hydrate(o)){toast("That save didn't read right.");return;}save();applyAll();showTab(ST().tab||"build");toast(msg);}
/* loading a save slot keeps this phone's settings (plan section 15) */
function loadSlot(o,msg){const keep=ST();if(!hydrate(o)){toast("That save didn't read right.");return;}S.settings=keep;save();applyAll();showTab(keep.tab||"build");toast(msg);}

/* ---- settings that change the page ---- */
const mqLight=window.matchMedia?matchMedia("(prefers-color-scheme: light)"):null;
const mqReduce=window.matchMedia?matchMedia("(prefers-reduced-motion: reduce)"):null;
function applyTheme(){const t=ST().theme||"dark",eff=t==="auto"?(mqLight&&mqLight.matches?"light":"dark"):t;
  document.documentElement.setAttribute("data-theme",eff);
  const m=document.querySelector("meta[name=theme-color]");if(m)m.content=eff==="light"?"#FAF9F5":"#141413";
  try{if(curTab==="bench")bnPlots();}catch(e){}}   // canvases read the palette when drawn (curTab and bnPlots: boot.js, bench.js)   // canvases read the palette when drawn
function reduced(){const r=ST().reduce;return r==null?!!(mqReduce&&mqReduce.matches):!!r;}
function applyReduce(){document.documentElement.classList.toggle("reduce",reduced());}
const isPhone=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
function gfxTier(){return ST().gfx||(isPhone()?"lite":"full");}
function applyGfx(){const q=gfxTier();if(window.SCRAP_VIS)SCRAP_VIS.setQuality(q);document.documentElement.dataset.gfx=q;}
function applyAll(){applyTheme();applyReduce();applyGfx();hud();}
if(mqLight&&mqLight.addEventListener)mqLight.addEventListener("change",()=>{if(ST().theme==="auto")applyTheme();});
if(mqReduce&&mqReduce.addEventListener)mqReduce.addEventListener("change",applyReduce);

/* ---- formatting ---- */
const fmt$=n=>(n<0?"−":"")+"Th "+Math.round(Math.abs(n)).toLocaleString("en-GB");   // Velmark thaler, 100 pfennig: Th 4,850
const fmtN=(n,d)=>Number(n).toFixed(d||0);

/* ---- the header over the 3D view ---- */
function hud(){const c=S.career;
  $("weekLbl").textContent=c?`${WORLD.regionCap} · ${c.year||WORLD.startYear} · week ${c.week||1}`:`${WORLD.regionCap} · ${WORLD.country}`;
  $("cashLbl").textContent=c?fmt$(c.money||0):"";$("repLbl").textContent=c?`rep ${c.rep||0}`:"";}

/* ---- toast ---- */
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),2600);}

/* ---- the bottom sheet (Settings, Back up, Restore …) ---- */
let sheetBack=null;
function openSheet(title,html){sheetBack=document.activeElement;$("sheetTitle").textContent=title;$("sheetBody").innerHTML=html;
  $("sheet").classList.add("on");$("scrim").classList.add("on");$("sheetBody").scrollTop=0;$("sheetClose").focus({preventScroll:true});}
function closeSheet(){$("sheet").classList.remove("on");$("scrim").classList.remove("on");if(sheetBack&&sheetBack.focus)sheetBack.focus({preventScroll:true});sheetBack=null;}
const sheetOn=()=>$("sheet").classList.contains("on");
