<script>
/* ===================== Servo: app state =====================
   The app script is one top-level script spread over app/state.js … app/help.js (in manifest order); start() runs once the
   whole block has loaded (app/boot.js schedules it through __ldGo).
   This file: VERSION, WORLD (every place name in Velmark), the career tables (filled in by later PRs, named here so every
   PR uses the same names), the S state object and its save shape, save / load / migrate / save slots, theme, graphics tier,
   and the small UI helpers every tab uses ($, fmt$, toast, the sheet).
   localStorage keys (every access wrapped in try/catch): "srv-save" (the current game, settings included) and
   "srv-slot1" .. "srv-slot3" (the save slots). A new key must also go into buMake / buWrite in app/savecode.js and KEYS in
   check-savecode.js; stop and ask before adding one. New fields inside srv-save are fine: bump SAVE_V and migrate. */
const VERSION="0.1.0.0";
const SIM=SERVO_SIM;
const $=id=>document.getElementById(id);

/* ---- the world (plan section 1): Velmark, the invented alpine country from Escapement ---- */
const WORLD={
  country:"Velmark",
  region:"the Haldis",              // the northern watchmaking valley where the player starts
  regionCap:"The Haldis",
  home:"a rented corner of a Haldis machine shop",
  bank:"the Haldis Savings Bank",   // lends once when you go broke (PR 7)
  league:"the Scrapline",           // Velmark's robot-combat circuit
  open:"the Scrapline Open",        // its televised heavyweight league
  venues:{                          // travel distances and costs arrive with the calendar in PR 7
    club:{name:"the Haldis Gemeindehalle",what:"club meets in the valley's community hall"},
    stahl:{name:"Stahlbrück",what:"regional tournaments in the steel-mill city"},
    eisenau:{name:"Eisenau",what:"regional tournaments at the river port"},
    grauwald:{name:"Grauwald",what:"regional tournaments in the forest rail town"},
    eisenhalle:{name:"the Eisenhalle",what:"home arena of the televised Scrapline Open"}
  },
  startYear:2026,                   // present day; the year advances per season, 20-year career
  seasons:20
};

/* ---- career tables (plan sections 10-12). Empty until the PR that fills them; keep these names. ---- */
const TIME={};              // weeks a season, hoursPerWeek (PR 7)
const WORKSHOP_STAGES=[];   // rented corner -> own unit -> shop -> team HQ (PR 7)
const TOOLS={};             // hand tools, 3D printer, bandsaw, drill press, welder, mill, lathe, CNC, press brake (PR 7)
const SEASON_EVENTS=[];     // club meets, tournaments, rumbles, tag team, championship (PR 7)
const REPAIR_COST={},REPAIR_HOURS={};   // after-fight repair bills (PR 7)
const PIT_KITS={};          // basic, full, pro (PR 6)
const REPAIR_TIMES={};      // pit-window repair seconds (PR 6)
const ASSISTS={};           // auto-straighten, turn damping, weapon auto-spin by driver skill (PR 5)
const RIVALS=[];            // named builders who remember fights (PR 7)
const RND={};               // R&D projects (PR 8)
const STAFF={};             // engineer, fabricator, driver, pit crew (PR 8)
const SPONSORS=[];          // paint and a placing target (PR 8)
const META_WAVES=[],RULES_BY_SEASON=[];   // the opponent field and rule changes by season (PR 8)

/* ---- state: the srv-save shape (plan section 15). settings belong to this phone and survive loading a slot. ---- */
const SAVE_V=1;
function freshSettings(){return{seen:false,theme:"dark",gfx:null,gfxAuto:true,reduce:null,sound:true,tab:"build"};}
function freshState(){return{v:SAVE_V,settings:freshSettings(),
  career:null,                    // {year, week, act, money, loan, hours, driverXp, rep, events, results} from PR 7
  bots:{},                        // {<classId>: {cfg, damage}}: one fitted bot per class (PR 2)
  designs:{},                     // {<classId>: [{name, cfg}]}: blueprints (PR 2)
  unlocks:{tools:{},rnd:{}},
  staff:[],sponsors:[],rivals:{}, // PR 7 / PR 8
  lastFight:null,                 // the latest fight log, for replay (PR 6)
  lastBackup:0};}
let S=freshState();
const ST=()=>S.settings;

const buObjS=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
/* bring an older save up to SAVE_V. Each step takes a save at version n and returns it at n+1; add one per bump. */
const MIGRATE={};
function migrate(o){let v=typeof o.v==="number"?o.v:1;while(v<SAVE_V){if(!MIGRATE[v])return null;o=MIGRATE[v](o);v++;o.v=v;}return o;}
function save(){try{localStorage.setItem("srv-save",JSON.stringify(S));}catch(e){return;}buSaved();}   // buSaved: app/savecode.js (asks the browser to keep our storage)
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
function loadSaved(){try{const j=localStorage.getItem("srv-save");if(j&&hydrate(JSON.parse(j)))return true;}catch(e){}S=freshState();return false;}
const SLOTS=3,slotKey=i=>"srv-slot"+i;
/* a restored game: take it, store it, redraw everything */
function applyLoaded(o,msg){if(!hydrate(o)){toast("That save didn't read right.");return;}save();applyAll();showTab(ST().tab||"build");toast(msg);}
/* loading a save slot keeps this phone's settings (plan section 15) */
function loadSlot(o,msg){const keep=ST();if(!hydrate(o)){toast("That save didn't read right.");return;}S.settings=keep;save();applyAll();showTab(keep.tab||"build");toast(msg);}

/* ---- settings that change the page ---- */
const mqLight=window.matchMedia?matchMedia("(prefers-color-scheme: light)"):null;
const mqReduce=window.matchMedia?matchMedia("(prefers-reduced-motion: reduce)"):null;
function applyTheme(){const t=ST().theme||"dark",eff=t==="auto"?(mqLight&&mqLight.matches?"light":"dark"):t;
  document.documentElement.setAttribute("data-theme",eff);
  const m=document.querySelector("meta[name=theme-color]");if(m)m.content=eff==="light"?"#FAF9F5":"#141413";}
function reduced(){const r=ST().reduce;return r==null?!!(mqReduce&&mqReduce.matches):!!r;}
function applyReduce(){document.documentElement.classList.toggle("reduce",reduced());}
const isPhone=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
function gfxTier(){return ST().gfx||(isPhone()?"lite":"full");}
function applyGfx(){const q=gfxTier();if(window.SERVO_VIS)SERVO_VIS.setQuality(q);document.documentElement.dataset.gfx=q;}
function applyAll(){applyTheme();applyReduce();applyGfx();hud();}
if(mqLight&&mqLight.addEventListener)mqLight.addEventListener("change",()=>{if(ST().theme==="auto")applyTheme();});
if(mqReduce&&mqReduce.addEventListener)mqReduce.addEventListener("change",applyReduce);

/* ---- formatting ---- */
const fmt$=n=>(n<0?"−":"")+"Th "+Math.round(Math.abs(n)).toLocaleString("en-GB");   // Velmark thaler (100 pfennig), copied from Escapement
const fmtN=(n,d)=>Number(n).toFixed(d||0);

/* ---- the header over the 3D view ---- */
function hud(){const c=S.career;
  $("weekLbl").textContent=c?`${WORLD.regionCap} · ${c.year||WORLD.startYear} · week ${c.week||1}`:`${WORLD.regionCap} · ${WORLD.country}`;
  $("cashLbl").textContent=c?fmt$(c.money||0):"";$("repLbl").textContent="";}

/* ---- toast ---- */
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),2600);}

/* ---- the bottom sheet (Settings, Back up, Restore …) ---- */
let sheetBack=null;
function openSheet(title,html){sheetBack=document.activeElement;$("sheetTitle").textContent=title;$("sheetBody").innerHTML=html;
  $("sheet").classList.add("on");$("scrim").classList.add("on");$("sheetBody").scrollTop=0;$("sheetClose").focus({preventScroll:true});}
function closeSheet(){$("sheet").classList.remove("on");$("scrim").classList.remove("on");if(sheetBack&&sheetBack.focus)sheetBack.focus({preventScroll:true});sheetBack=null;}
const sheetOn=()=>$("sheet").classList.contains("on");
