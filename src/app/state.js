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
const VERSION="0.1.44.0";
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
  venues:{                          // km from the Haldis (one way) and nights away: travel costs and workshop hours (TIME);
                                    // arena: the ARENAS id its events fight in (0.1.28.0), else the class's own (the club's two)
    club:{name:"the Haldis Gemeindehalle",what:"club meets in the valley's community hall",km:6,nights:0,arena:null},
    stahl:{name:"Stahlbrück",what:"regional tournaments in the steel-mill city",km:85,nights:1,arena:"stahl"},
    eisenau:{name:"Eisenau",what:"regional tournaments at the river port",km:140,nights:1,arena:"eisenau"},
    grauwald:{name:"Grauwald",what:"regional tournaments in the forest rail town",km:120,nights:1,arena:"grauwald"},
    eisenhalle:{name:"the Eisenhalle",what:"home arena of the televised Scrapline Open",km:210,nights:2,arena:"eisenhalle"}
  },
  startYear:2026,                   // present day; the year advances per season, 20-year career
  seasons:20
};

/* ---- career tables (plan sections 11-12): PR 7's career, PR 8's R&D, team, sponsors, meta, rule changes and kit line ---- */
/* the time model (app/career.js). A season is 52 weeks; you act, then Close week. Each week the workshop stage gives its
   hours (WORKSHOP_STAGES); unused hours carry over up to bankWeeks weeks' worth. An event day takes eventHours, and each
   night away nightHours more; travel costs perKm both ways (x the stage's travel) plus night per night away.
   Going broke (rent you can't pay at Close week) brings the bank's one loan; half of every prize goes to paying it back,
   with loanRate on top. Broke again with the loan used up ends the run.
   Driver skill: xp per fight (drive is a fight you drove, sim a quick sim, win on top). levels are the assist levels
   (ASSISTS) by xp; skill is the AI's skill number when your bot is quick-simmed.
   acts: the classes each act's events are in. You move up an act at the end of a season if you placed top two at that
   act's championship, or your rep reached repTo; out of the Heavyweight act only by winning the Open Final. */
const TIME={weeks:52,bankWeeks:2,eventHours:6,nightHours:4,perKm:0.3,night:45,
  startMoney:2500,loan:1000,loanRate:0.1,loanShare:0.5,
  xp:{drive:3,sim:1,win:2},levels:[["rookie",0],["club",25],["pro",70]],skill:{base:0.5,perXp:0.002,max:0.9},
  acts:[
    {id:"garage", name:"Garage",     classes:["ant","beetle"],  repTo:45, line:"Club meets at the Haldis Gemeindehalle, a tournament or two, and the club championship."},
    {id:"circuit",name:"Circuit",    classes:["hobby","feather"],repTo:160,line:"Regional tournaments in Stahlbrück, Eisenau and Grauwald, rumbles and tag team, and the Regional Final."},
    {id:"heavy",  name:"Heavyweight",classes:["heavy"],          repTo:320,line:"The Scrapline Open at the Eisenhalle, on television."},
    {id:"legacy", name:"Legacy",     classes:["heavy"],          repTo:0,  line:"You've won the Open. Defend it, run the team, and sell your best design as a kit."}]};
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
  club:      {name:"Club meet",   format:"league", size:4,entry:20, prizes:[400,250,150,50],rep:[5,3,1,0], skill:0.45,crewKit:"basic"},
  tournament:{name:"Tournament",  format:"bracket",size:8,entry:60, prizes:[1000,500,250,75],rep:[12,7,3,0],skill:0.6, crewKit:"full"},
  rumble:    {name:"Rumble",      format:"rumble", size:4,entry:40, prizes:[500,200,0,0],   rep:[6,2,0,0], skill:0.55,crewKit:"basic"},
  tag:       {name:"Tag team",    format:"tag",    size:4,entry:50, prizes:[600,0],         rep:[6,0],     skill:0.6, crewKit:"basic"},
  champ:     {name:"Championship",format:"bracket",size:8,entry:100,prizes:[2000,900,400,0],rep:[20,12,5,1],skill:0.7,crewKit:"full"}};
const EVENT_SKILL_ACT=0.08,EVENT_SKILL_MAX=0.92;
/* life after the Open (0.1.39, the Legacy act). The title: whoever won the Scrapline Open Final (final) last. Your legend
   level is how many Opens you've won in a row (up to maxLevel); it makes every Legacy field harder and the Final richer.
   Lose the Final, or don't enter it, and the run and the level go back to nothing. The hall of fame (S.hall) keeps a
   line for every career that ended, up to hallMax. */
const LEGACY={
  final:"h8",         // the SEASON_EVENTS id that carries the title
  maxLevel:5,
  skillStep:0.02,     // every driver in a Legacy field is this much sharper a level...
  skillMax:0.98,      // ...up to this (past EVENT_SKILL_MAX)
  rivalStep:1,        // and every rival's bot is this many steps further on a level
  cls:"heavy",        // the title's class: the champion's own bot in it carries...
  ballast:0.02,       // ...this much less of the weight limit a level (crLimitG, app/team.js): rebuild lighter to defend
  prizeStep:0.2,      // a defended Final pays this much more a level
  repDefend:8,        // and this much extra rep
  names:["Challenger","Champion","Defender","Dynasty","Legend","Immortal"],   // by level
  hallMax:12};
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
  {id:"ottilie",name:"Kayla Rauch",from:"club",skill:0.55,line:"A watchmaker's apprentice. Measures twice, cuts once, gloats three times.",
    bots:{beetle:{name:"Unruh",base:"tb:flipper"},hobby:{name:"Unruh II",base:"tb:flipper"},feather:{name:"Hemmung",base:"tb:flipper"},heavy:{name:"Grande Complication",base:"tb:flipper"}},
    steps:[{wheels:"pu"},{armour:{front:"ar500"}},{extras:["skid"]},{battery:"hd"},{armour:{left:"ar500",right:"ar500"}}],
    talk:{first:"I've seen your bot. Interesting tolerances. By which I mean there aren't any.",won:"Same again? I brought a spare. You'll want two.",
      lost:"Lucky. I've re-timed the flipper since. To the millisecond.",streak:"Fine. You're good. Don't tell anyone I said so."}},
  {id:"rudi",name:"Mitch Gerber",from:"stahl",skill:0.5,line:"Rolls steel by day in Stahlbrück. Believes armour is a personality.",
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
  basic:{name:"Basic kit",price:30, allow:{wheel:2,bodge:2},                                   line:"Spare wheels and a roll of tape."},
  full: {name:"Full kit", price:180,allow:{wheel:4,bodge:3,belt:2,armour:2,battery:1},          line:"Adds belts, armour panels and a spare battery."},
  pro:  {name:"Pro kit",  price:420,allow:{wheel:4,bodge:4,belt:2,armour:4,battery:2,pod:2,disc:1},line:"Adds drive pods and a spare weapon disc."}
};
/* pit-window repairs: seconds and what each does. A swap puts the part back to new; a bodge patches any damaged or
   destroyed part (not the chassis or a bent disc) to half strength. belt: a damaged weapon (not bent); disc: a bent or
   wrecked weapon (pro kit only). A swapped battery stops smoking; a bodged speed controller brings its side back. */
const REPAIR_TIMES={wheel:15,belt:20,pod:35,battery:25,armour:30,bodge:10,disc:30,front:15,tune:10};   // front: a front attachment swapped between rounds (0.1.32); tune: one step of a dial (0.1.33)
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
/* R&D (Shop tab, app/team.js): projects that unlock the parts marked "rnd:<id>" in SIM.PARTS (and "disc", your own disc
   profile on the Build tab). Starting one pays its price (x nothing: R&D is priced for the workshop, not the class);
   then you put workshop hours into it until it has hours. One project at a time. act: the first act it can be started
   in. needs: a tool it needs first. fab: what it unlocks also needs a fabricator on the team to fit (custom work). */
const RND={
  cells:     {name:"High-discharge cells",  price:400, hours:10,act:0,needs:null,       line:"A battery that gives everything at once. Spinners spin up faster."},
  disc:      {name:"Your own disc profile", price:600, hours:14,act:0,needs:null,       fab:true,line:"Design the disc: one to three teeth, a light or heavy rim, and a name. The fabricator cuts it."},
  pneumatics:{name:"Pneumatics upgrade",    price:800, hours:18,act:0,needs:"drillpress",line:"The high-pressure flipper: twenty-four shots, harder, and a faster recharge."},
  crusher:   {name:"Crusher",               price:900, hours:20,act:0,needs:"drillpress",line:"Hydraulic jaws that bite down and hold on."},
  grabber:   {name:"Grabber",               price:700, hours:16,act:0,needs:"drillpress",line:"Jaws that clamp the other bot, lift its front off the floor and carry it to the pit."},
  brushless: {name:"Custom motor winding",  price:700, hours:16,act:0,needs:"lathe",    line:"Brushless drive and its speed controller. Much faster, and hotter."},
  saw:       {name:"Overhead saw",          price:1000,hours:20,act:1,needs:"lathe",    line:"A saw on an arm that grinds through top plates."},
  minibot:   {name:"Minibots",              price:1100,hours:22,act:1,needs:"printer",  line:"A little wedge that rides along and drops off at the bell to shove and distract."},
  titanium:  {name:"Exotic armour",         price:1800,hours:28,act:1,needs:"mill",     line:"Titanium plate, chassis and weapon stock. Light, tough and dear."},
  custom:    {name:"Custom chassis shape",  price:1500,hours:30,act:1,needs:"welder",   fab:true,line:"A low wedge-shaped chassis with the front corners cut away. The fabricator builds it."},
  swerve:    {name:"Swerve drive",          price:1200,hours:24,act:1,needs:"printer",  line:"Wheels that each turn on their own servo: slide sideways and still push."},
  /* 0.1.34, the odd bodies (the shell spinner needs only the lathe, no R&D) */
  ring:      {name:"Ring spinner",          price:900, hours:18,act:0,needs:"welder",   line:"A toothed steel ring spun round the whole bot on rollers. Hits from every side; it bends if you're unlucky."},
  legs:      {name:"Shuffler legs",         price:1000,hours:20,act:0,needs:"drillpress",line:"Cams and feet instead of wheels. Slow, hard to shove, and the rules let a walker weigh 15% more."},
  melty:     {name:"Meltybrain",            price:1500,hours:26,act:1,needs:"printer",  line:"The whole bot spins, and a flickering light and a sensor let you drive it while it does. Big hits lose the sync."}};
const RND_IDS=Object.keys(RND);
/* the team (Shop tab): one person per role, hired from these. salary: euros a season, paid a week at a time at Close
   week (salary / 52). act: from which act they'll talk to you.
   engineer: cut (build and repair hours x (1 - cut), on top of the tools'), and an engineer's note: the impact and drop
             lines of the stress report work out for the draft without the bench
   fabricator: needed to fit custom work (RND fab: the custom chassis, your own disc); cut on those parts' hours
   driver: a fixed skill that drives your quick sims (Kelbo, PR 8: "Drive it" is still you)
   crew: cut on the pit window's repair times (REPAIR_TIMES) */
const STAFF={
  roles:{engineer:"Engineer",fabricator:"Fabricator",driver:"Driver",crew:"Pit crew"},
  people:[
    {id:"liesl", role:"engineer",  name:"Liesl Amrein", salary:2600, act:0,cut:0.15,line:"Retired from the watch factory's tooling office. Draws everything twice, in pencil."},
    {id:"konrad",role:"engineer",  name:"Konrad Fehr",  salary:9000, act:1,cut:0.3, line:"Did ten years on rail bogies in Grauwald. Calls every bot \"the rolling stock\"."},
    {id:"pia",   role:"fabricator",name:"Pia Lötscher", salary:3200, act:0,cut:0.1, line:"Welds the way other people write: neatly, and with opinions."},
    {id:"bruno", role:"fabricator",name:"Bruno Zaugg",  salary:10000,act:1,cut:0.3, line:"Ran the Stahlbrück mill's repair shop. Has never once asked for a drawing."},
    {id:"jonas", role:"driver",    name:"Jonas Ritter", salary:3500, act:0,skill:0.7, line:"Club racer turned robot driver. Smooth, polite, and terrifying near a wall."},
    {id:"vera",  role:"driver",    name:"Vera Hasler",  salary:14000,act:1,skill:0.86,line:"Two-time Regional champion. Reads a fight like a timetable."},
    {id:"emil",  role:"crew",      name:"Emil and Sohn",salary:2200, act:0,cut:0.25,line:"Father and son from the bicycle shop. Wheels off and on before you've said \"wheel\"."},
    {id:"irma",  role:"crew",      name:"Irma's crew",  salary:7000, act:1,cut:0.4, line:"Three people, one toolbox, no wasted moves. Irma times them with a stopwatch."}]};
/* sponsors (Career tab): an offer comes after a podium (top two) when your rep has reached minRep. Each wants its colour
   on the bot (a paint slot: "side" paints the side panels, "top" a patch on the top plate) and a placing target for the
   season. Signing pays the season's money at once (less for the weeks already gone, at least a quarter); at the end of
   the season they renew and pay again if you hit the target, and drop you if you didn't. Two sponsors at most, one per
   slot. target: {top: n podiums (top two)} | {win: n wins} | {champ: place at your act's championship or better} |
   {rep: rep gained this season}. */
const SPONSORS=[
  {id:"zahnrad",  name:"Zahnrad Bräm",      colour:"#3A7BD5",slot:"side",pay:500,  minRep:4,  target:{top:2},  line:"Gear cutters in the Haldis. Want to see their blue on a podium, twice."},
  {id:"kaffee",   name:"Kaffee Alpenrot",   colour:"#C8423B",slot:"top", pay:350,  minRep:4,  target:{rep:10}, line:"A roastery in the valley. They'd like people to hear your name. Ten rep's worth."},
  {id:"seilbahn", name:"Seilbahn Haldis",   colour:"#2FA36B",slot:"side",pay:1200, minRep:30, target:{win:1},  line:"The cable car company. One win a season and their green rides on your bot."},
  {id:"eisenwerk",name:"Stahlbrück Eisenwerk",colour:"#8A8F98",slot:"top",pay:2500,minRep:60, target:{champ:2},line:"The steel mill. Top two at the championship, or they'll find someone tougher."},
  {id:"funk",     name:"Radio Velmark",     colour:"#E2B93B",slot:"side",pay:6000, minRep:150,target:{top:4},  line:"The national broadcaster. Four podiums a season keeps you on the evening sports."},
  {id:"bahn",     name:"Velmark Bahn",      colour:"#7B4FC9",slot:"top", pay:15000,minRep:300,target:{win:3},  line:"The railways. Three wins a season, on time."}];
const SPONSOR_MAX=2;
/* the meta (app/team.js crMeta): which builds the other entrants favour, season by season, round and round. favour:
   weapon ids that come first when an event's field is drawn (the rest still turn up). */
const META_WAVES=[
  {id:"spinner",name:"The spinner era",     favour:["vsp","hsp","drum","shell","ring","melty"],line:"Everyone's running discs. Armour your front and fear the first hit."},
  {id:"wedge",  name:"The wedge era",       favour:["wedge","none","lifter"], line:"Low, fast and pointy. Get under them, or get a skid plate."},
  {id:"under",  name:"The undercutter era", favour:["under","hsp","drum","saw"],line:"Discs at wheel height. Mind your wheels and your sides."},
  {id:"armour", name:"The armour era",      favour:["none","hammer","crusher","flipper","grabber"],line:"Heavy plate everywhere. Bring something that goes over the top or round the back."}];
/* rule changes (app/team.js crRules): each comes in at the start of its season (the career's season index, 0 = the
   first), is announced a season ahead, and stays. capJ: a spinner energy cap (J at beetle scale, x the class's mass
   multiplier; the disc's top speed comes down to fit, sim/fight.js); hazard: an extra hazard in one arena; limit: a class's
   weight limit in grams; koS: the knockout count. */
const RULES_BY_SEASON=[
  {season:1,id:"cap",   name:"Spinner energy cap",  capJ:150,line:"Discs may store no more than 150 J at beetle scale (more in the bigger classes). A bigger disc just spins slower."},
  {season:2,id:"haz",   name:"Floor spinner at the club box",hazard:{arena:"clubbox",h:{type:"spinner",at:[-0.4,0.6],rM:0.15,kickMs:1.5,J:8,vzMs:1,spinRad:12,activeS:0.25,periodS:5,startS:0}},line:"The Gemeindehalle's box gets a floor spinner."},
  {season:3,id:"limit", name:"Heavier beetles",     limit:{beetle:1600},line:"The beetleweight limit goes up to 1.6 kg. Your bot can carry another 100 g."},
  {season:5,id:"ko",    name:"A shorter count",     koS:8,line:"Knockouts are counted to eight seconds, not ten."}];
/* the kit line (Legacy act, Kelbo PR 8): publish one design as a kit. At the end of each season it fights the class's
   test builds in the sim (seeds fights each, at skill); income = base x the class's prizeScale x its win rate x (1 + rep /
   repRef). You can change the kit once a season. */
const KIT_LINE={act:3,base:400,repRef:200,seeds:1,skill:0.6};   // one seed a test build: eleven fights, under a second on a desktop (run on the main thread)

/* ---- state: the scr-save shape (plan section 15). settings belong to this phone and survive loading a slot. ---- */
const SAVE_V=15;
function freshSettings(){return{seen:false,theme:"dark",gfx:null,gfxAuto:true,reduce:null,sound:true,tab:"build",buildCls:"beetle",controls:"direct",leftHanded:false,assists:true,effects:"full",tutDone:false,voice:true,comm:true,captions:"muted",dev:false};}   // effects, tutDone: PR 9; voice, comm (commentary), captions ("muted": only when sound or voices are off, or "off"): 0.1.16; dev (Dev mode, Settings): 0.1.30
function freshTeam(){return{name:"Eckwerkstatt",main:"#D97757",accent:"#2B2B2A",shape:"shield",emblem:"bolt",text:""};}   // the same as LIVERY.team
function freshState(){return{v:SAVE_V,settings:freshSettings(),
  mode:"sandbox",                  // "career" or "sandbox" (0.1.18.0): which garage S.bots is; picked on the home screen and in Settings (setMode, app/career.js)
  parked:{},                      // the other mode's garage, the same shape as bots, swapped in by setMode (0.1.18.0)
  career:null,                    // null until Start career (PR 7); then crFresh()'s shape (app/career.js): {seed, year, week, season, act, money, loan, hours, driverXp, rep, stage, events, entered, day, results, ledger, broke, over, rnd: {cur, put}, offers, kit, trophies, fw, actSaid} (rnd, offers, kit: PR 8; trophies: PR 9, app/help.js; fw, actSaid: 0.1.16, the announcer's first-win and new-act calls)
  bots:{},                        // {<classId>: {cfg, damage, flags, draft, bench, name}}: (name: what you call it, 0.1.24) the fitted bot per class (cfg null until first fitted), the damage it carries (J per key) and failures (flags: bent, smoke, cell, esc; PR 7), the Build tab's unfitted edits, and which bench tests have run on it ({sig, done}, PR 3)
  team:freshTeam(),               // your team (0.1.24, app/livery.js): {name, main, accent, shape, emblem, text}; each bot's own name is bots[cls].name
  designs:{},                     // {<classId>: [{name, cfg}]}: blueprints (PR 2)
  unlocks:{tools:{},rnd:{}},       // tools: {<TOOLS id>: true} owned in the career (PR 7); rnd: {<RND id>: true} researched (PR 8)
  staff:[],sponsors:[],rivals:{}, // rivals: {<RIVALS id>: {w, l, beat, last}} what each remembers (PR 7); staff: [{id, y, w}] hired (STAFF.people id, when); sponsors: [{id, y, w}] signed (SPONSORS id, when; PR 8)
  lastFight:null,                 // the latest fight log, for replay (PR 6)
  reel:{m:{},cur:[],last:[],best:[],sb:[],lastY:null,n:0},   // the highlight reel (0.1.27.0, app/reel.js): moments by id, this season's five, last season's reel (and its year), the career's best three, the Sandbox's five
  daily:{last:null,streak:0,top:0,best:null,tries:0},   // the daily challenge (0.1.20.0, app/daily.js): last day fought ("YYYY-MM-DD"), days in a row, longest run, today's best {score, txt, bring}, today's tries
  hall:[],                        // the hall of fame (0.1.39, app/career.js crHallAdd): a line per career that ended: {team, y0, y1, seasons, events, wins, titles: [years], best, rep, act, end}
  lastBackup:0};}
let S=freshState();
const ST=()=>S.settings;

const buObjS=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
/* bring an older save up to SAVE_V. Each step takes a save at version n and returns it at n+1; add one per bump. */
const MIGRATE={
  1:o=>{if(o.settings&&typeof o.settings==="object"&&!o.settings.buildCls)o.settings.buildCls="beetle";return o;},   // 0.1.2.0: the Build tab remembers its class
  2:o=>o,   // 0.1.3.0: bots[cls].bench {sig, done} (which bench tests have run on the fitted bot) is optional; nothing to fill
  3:o=>{const s=o.settings;if(s&&typeof s==="object"){if(s.controls!=="tactical")s.controls="direct";s.leftHanded=!!s.leftHanded;if(s.assists!==false)s.assists=true;}return o;},   // 0.1.6.0: control scheme, handedness, assists
  4:o=>{o.career=null;return o;},   // 0.1.8.0: the career (PR 7). Nothing could have one before, so it starts empty; bots[cls].flags is optional
  5:o=>{const c=o.career;if(c&&typeof c==="object"){c.rnd={cur:null,put:{}};c.offers=[];c.kit=null;}   // 0.1.9.0: R&D, sponsor offers, the kit line (PR 8)
    if(!Array.isArray(o.staff))o.staff=[];if(!Array.isArray(o.sponsors))o.sponsors=[];return o;},
  6:o=>{const s=o.settings,c=o.career;if(s&&typeof s==="object"){if(s.effects!=="reduced")s.effects="full";s.tutDone=!!s.seen;}   // 0.1.10.0: Effects, the tutorial (offered only to a new player), trophies (PR 9)
    if(c&&typeof c==="object"&&!Array.isArray(c.trophies))c.trophies=[];return o;},
  7:o=>{const s=o.settings,c=o.career;if(s&&typeof s==="object"){s.voice=s.voice!==false;s.comm=s.comm!==false;if(s.captions!=="off")s.captions="muted";}   // 0.1.16.0: the voices (sound/voice.js)
    if(c&&typeof c==="object"){c.fw=Array.isArray(c.results)&&c.results.some(r=>r&&Array.isArray(r.fights)&&r.fights.some(f=>f&&f.won));c.actSaid=c.act|0;}return o;},   // fw: a fight already won at an event (the announcer won't call a first win); actSaid: the act he last welcomed you to
  8:o=>{o.mode=o.career&&typeof o.career==="object"?"career":"sandbox";o.parked={};return o;},   // 0.1.18.0: modes. A save with a career stays in it (its bots are the career's garage); one without was sparring, so its bots become the Sandbox's
  9:o=>{o.daily={last:null,streak:0,top:0,best:null,tries:0};return o;},   // 0.1.20.0: the daily challenge starts empty
  10:o=>{o.team=freshTeam();return o;},   // 0.1.24.0: teams. Everyone starts as the Eckwerkstatt in clay; bots[cls].name is optional (a default per class)
  11:o=>{const d=o.career&&typeof o.career==="object"?o.career.day:null;if(d&&typeof d==="object"&&Array.isArray(d.pairs)&&Array.isArray(d.won)){d.hist=[];d.how=d.won.map(()=>null);d.sc=d.won.map(()=>"");}return o;},   // 0.1.26.0: the bracket screen keeps a tournament day's rounds (day.hist, how, sc); a day already under way has none of the earlier rounds
  12:o=>{o.reel={m:{},cur:[],last:[],best:[],sb:[],lastY:null,n:0};return o;},   // 0.1.27.0: the highlight reel starts empty
  13:o=>{if(o.settings&&typeof o.settings==="object")o.settings.dev=o.settings.dev===true;return o;},   // 0.1.30.0: Dev mode (Settings) starts off
  14:o=>{o.hall=[];return o;}   // 0.1.39.0: the hall of fame starts empty; the title and legend level are worked out from career.events (crTitle), so nothing else to add
};
function migrate(o){let v=typeof o.v==="number"?o.v:1;while(v<SAVE_V){if(!MIGRATE[v])return null;o=MIGRATE[v](o);v++;o.v=v;}return o;}
/* the tutorial (app/help.js) runs on a loaner: nothing it does is written to storage */
let TUT_ON=false;
function save(){if(TUT_ON)return;try{localStorage.setItem("scr-save",JSON.stringify(S));}catch(e){return;}buSaved();}   // buSaved: app/savecode.js (asks the browser to keep our storage)
function snapshot(){return JSON.parse(JSON.stringify(S));}
/* load a save object into S. false (and S untouched) if it isn't one of ours, or comes from a newer version */
function hydrate(o){if(!buObjS(o)||typeof o.v!=="number"||o.v>SAVE_V||!buObjS(o.settings)||!buObjS(o.bots))return false;
  o=migrate(JSON.parse(JSON.stringify(o)));if(!o)return false;
  const n=freshState();Object.assign(n,o);
  n.settings=Object.assign(freshSettings(),o.settings);
  n.unlocks=Object.assign({tools:{},rnd:{}},buObjS(o.unlocks)?o.unlocks:{});
  for(const k of ["designs","rivals","parked"])if(!buObjS(n[k]))n[k]={};
  if(n.mode!=="career")n.mode="sandbox";
  if(!buObjS(n.daily))n.daily={last:null,streak:0,top:0,best:null,tries:0};
  if(!buObjS(n.reel)||!buObjS(n.reel.m))n.reel={m:{},cur:[],last:[],best:[],sb:[],lastY:null,n:0};   // the lists are checked where they're used (rlState)
  if(!buObjS(n.team))n.team=freshTeam();   // checked in full where it's used (lvMine)
  for(const k of ["staff","sponsors","hall"])if(!Array.isArray(n[k]))n[k]=[];
  S=n;return true;}
function loadSaved(){try{const j=localStorage.getItem("scr-save");if(j&&hydrate(JSON.parse(j)))return true;}catch(e){}S=freshState();return false;}
const SLOTS=3,slotKey=i=>"scr-slot"+i;
/* a restored game: take it, store it, redraw everything */
function applyLoaded(o,msg){if(TUT_ON)tutStop();if(!hydrate(o)){toast("That save didn't read right.");return;}if(typeof crReset==="function")crReset();save();applyAll();showTab(ST().tab||"build");toast(msg);}
/* loading a save slot keeps this phone's settings (plan section 15) */
function loadSlot(o,msg){if(TUT_ON)tutStop();const keep=ST();if(!hydrate(o)){toast("That save didn't read right.");return;}if(typeof crReset==="function")crReset();S.settings=keep;save();applyAll();showTab(keep.tab||"build");toast(msg);}

/* ---- settings that change the page ---- */
const mqLight=window.matchMedia?matchMedia("(prefers-color-scheme: light)"):null;
const mqReduce=window.matchMedia?matchMedia("(prefers-reduced-motion: reduce)"):null;
function applyTheme(){const t=ST().theme||"dark",eff=t==="auto"?(mqLight&&mqLight.matches?"light":"dark"):t;
  document.documentElement.setAttribute("data-theme",eff);
  const m=document.querySelector("meta[name=theme-color]");if(m)m.content=eff==="light"?"#FAF9F5":"#141413";
  try{if(curTab==="bench")bnPlots();}catch(e){}}   // canvases read the palette when drawn (curTab and bnPlots: boot.js, bench.js)   // canvases read the palette when drawn
function reduced(){const r=ST().reduce;return r==null?!!(mqReduce&&mqReduce.matches):!!r;}
function applyReduce(){document.documentElement.classList.toggle("reduce",reduced());if(window.SCRAP_VIS)SCRAP_VIS.setRun({reduce:reduced(),fxLow:fxLow()});}
/* Settings → Effects: Reduced: fewer sparks, no flying parts, light smoke, small steady hit rings in the 2D view (Kelbo, PR 9) */
const fxLow=()=>ST().effects==="reduced";
const isPhone=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
function gfxTier(){return ST().gfx||(isPhone()?"lite":"full");}
function applyGfx(){const q=gfxTier();if(window.SCRAP_VIS)SCRAP_VIS.setQuality(q);document.documentElement.dataset.gfx=q;
  if(typeof SCRAP_SOUND!=="undefined"&&SCRAP_SOUND.samples)SCRAP_SOUND.samples(q!=="lite");}   // recorded clangs on Full / Ultra (sound/synth.js)
/* a workshop sound from the effects pack (the ratchet when a bot is fitted, the clamp on the bench, the drill for a repair,
   the charger at Close week), when Sound is on; every tier */
function shopSfx(id){if(ST().sound!==false&&typeof SCRAP_SOUND!=="undefined"&&SCRAP_SOUND.sfx)SCRAP_SOUND.sfx(id,0.6);}
/* the voices (sound/voice.js) follow Sound, Voices, Commentary and Captions */
function applyVoice(){if(typeof SCRAP_VOICE==="undefined")return;const s=ST();SCRAP_VOICE.set({sound:s.sound!==false,voice:s.voice!==false,comm:s.comm!==false,captions:s.captions==="off"?"off":"muted"});}
function applyAll(){applyTheme();applyReduce();applyGfx();applyVoice();hud();if(typeof tmPaint==="function")tmPaint();}
if(mqLight&&mqLight.addEventListener)mqLight.addEventListener("change",()=>{if(ST().theme==="auto")applyTheme();});
if(mqReduce&&mqReduce.addEventListener)mqReduce.addEventListener("change",applyReduce);

/* ---- formatting ---- */
const fmt$=n=>(n<0?"−":"")+"€"+Math.round(Math.abs(n)).toLocaleString("en-GB");   // euros, whole amounts: €4,850
const fmtN=(n,d)=>Number(n).toFixed(d||0);

/* ---- the header over the 3D view ---- */
function hud(){const c=S.mode==="career"?S.career:null;
  $("weekLbl").textContent=TUT_ON?`Tutorial · loaner bot`:S.mode!=="career"?`Sandbox · ${WORLD.regionCap}`:c?`${WORLD.regionCap} · ${c.year||WORLD.startYear} · week ${c.week||1}`:`${WORLD.regionCap} · ${WORLD.country}`;   // the tutorial runs on a loaner in the sandbox: say "Tutorial", not "Sandbox", or a new player thinks they picked the wrong mode
  $("cashLbl").textContent=c?fmt$(c.money||0):"";$("repLbl").textContent=c?`rep ${c.rep||0}`:"";}

/* ---- toast ---- */
/* toast.hold (0.1.29): while a simmed fight plays back, news it would spoil (a trophy, a sponsor) waits for the bell */
function toastHold(on){toast.hold=on;if(on)return;const q=toast.q||[];toast.q=[];q.forEach((m,i)=>setTimeout(()=>toast(m),i*2800));}
function toast(msg){if(toast.hold){(toast.q=toast.q||[]).push(msg);return;}const t=$("toast");t.textContent=msg;t.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),2600);}

/* ---- the bottom sheet (Settings, Back up, Restore …) ---- */
let sheetBack=null;
function openSheet(title,html){sheetBack=document.activeElement;$("sheetTitle").textContent=title;$("sheetBody").innerHTML=html;
  $("sheet").classList.add("on");$("scrim").classList.add("on");$("sheetBody").scrollTop=0;$("sheetClose").focus({preventScroll:true});}
function closeSheet(){$("sheet").classList.remove("on");$("scrim").classList.remove("on");if(sheetBack&&sheetBack.focus)sheetBack.focus({preventScroll:true});sheetBack=null;}
const sheetOn=()=>$("sheet").classList.contains("on");
