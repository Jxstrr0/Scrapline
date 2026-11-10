/* ---- app/livery.js: teams (0.1.24, Kelbo). Your team has a name, two colours and a badge (a shape, an emblem and up
   to three letters, drawn in code by vis/badge.js); each of your bots has its own name (S.bots[cls].name). Every bot in
   a fight carries a livery {name, main, accent, shape, emblem, text}: it paints the stripe, pinstripes and badge on the
   bot, the badge on its name tag and the colour of its card. Opponents have teams too (OPP_TEAMS), and the test builds a
   regular's name when they fight, so nobody is called "Wedge" any more.
     LIVERY      the palette, the badge parts, the default team and bot names, the length limits
     OPP_TEAMS   every named opponent, rival and test build: [team, main, accent, shape, emblem, letters, bot name]
     lvNorm      a livery from anywhere (a save, a replay code) checked, or null
     lvField     the liveries for a fight's bots, so no two share a main colour
     lvOpen      the Team sheet (from the Build tab's Name & team row)
   The team lives in S.team (inside scr-save, SAVE_V 11); the names never reach the sim's maths. ---- */
const LIVERY={
  cols:[["clay","#D97757","Clay"],["sand","#E8C547","Sand"],["rose","#E87FB4","Rose"],["wine","#8E3B5A","Wine"],["lilac","#B48CE8","Lilac"],["violet","#6A33AD","Violet"],["navy","#2F4A80","Navy"],
    ["sky","#7FB3E6","Sky"],["teal","#3FB8AF","Teal"],["green","#4CC38A","Green"],["forest","#2E6B45","Forest"],["steel","#9AA3AD","Steel"],["bone","#EDEBE6","Bone"],["coal","#2B2B2A","Coal"]],
  shapes:{shield:"Shield",round:"Round",hex:"Hex",diamond:"Diamond",gear:"Gear",square:"Square"},
  emblems:{bolt:"Bolt",saw:"Saw",wrench:"Wrench",hammer:"Hammer",skull:"Skull",crown:"Crown",flame:"Flame",star:"Star",claw:"Claw",ibex:"Ibex",wolf:"Wolf",eagle:"Eagle",bull:"Bull",scorpion:"Scorpion",wasp:"Wasp",shark:"Shark",rhino:"Rhino",cobra:"Cobra",fist:"Fist",piston:"Piston",anvil:"Anvil",none:"None"},
  team:{name:"Eckwerkstatt",main:"#D97757",accent:"#2B2B2A",shape:"shield",emblem:"bolt",text:""},   // "corner workshop": where the career starts
  names:{ant:"Tack",beetle:"Splinter",hobby:"Crowbar",feather:"Anvil",heavy:"Foundry"},
  maxName:24,maxText:3,
  near:70};   // two main colours closer than this (RGB distance) clash in a fight
const LV_C=Object.fromEntries(LIVERY.cols.map(c=>[c[0],c[1]]));
const OPP_TEAMS={
  "op:zahnrad":["Uhrmacherschule Haldis","sky","bone","round","star",""],
  "op:kiesel":["Kieswerk Sutter","steel","coal","hex","hammer",""],
  "op:feierabend":["Mittwochsrunde","sand","coal","square","none","MR"],
  "op:holzwurm":["Sägerei Lenz","forest","sand","shield","saw",""],
  "op:kehrschaufel":["Hauswart Brunner","teal","bone","square","wrench",""],
  "op:schraubstock":["Werkbank Stahlbrück","navy","steel","gear","hammer",""],
  "op:uhrwerk":["Pendel & Co.","wine","sand","round","crown",""],
  "op:faehrmann":["Fährbetrieb Eisenau","sky","navy","diamond","none","FE"],
  "op:prellbock":["Rangierbahnhof Grauwald","sand","coal","hex","bolt",""],
  "op:walzwerk":["Walzstraße 3","steel","wine","square","none","W3"],
  "op:hochofen":["Abstichkolonne","wine","sand","shield","flame",""],
  "op:nachtschicht":["Kohlenkeller Grauwald","violet","lilac","round","skull",""],
  "op:glockenschlag":["Glockengießerei Imhof","sand","wine","shield","crown",""],
  "op:lawine":["Bergwacht Velmark","bone","sky","diamond","claw",""],
  "op:zange":["Zangenwerk Riedel","rose","coal","gear","wrench",""],
  "op:kreisel":["Spielwaren Hefti","rose","sand","round","star",""],
  "op:tausendfuss":["Gartenverein Au","green","coal","hex","claw",""],
  "op:topfdeckel":["Kantine Haldis","steel","clay","round","none","KH"],
  "op:krebsgang":["Fischhalle Eisenau","clay","bone","diamond","claw",""],
  "op:ladebaum":["Stauerei Kai 4","navy","sand","square","none","K4"],
  "op:achtachser":["Schwertransport Stahlbrück","sand","coal","hex","saw",""],
  "op:ringelnatter":["Waldhütte Grauwald","forest","sand","round","none","WG"],
  "op:drehscheibe":["Lokschuppen 2","coal","clay","gear","bolt",""],
  "op:schneepflug":["Winterdienst Stahlbrück","bone","clay","shield","wrench",""],
  "op:schneebesen":["Bäckerei Hug","bone","wine","round","star",""],
  "op:schwungrad":["Hafenwinde Eisenau","sky","coal","gear","bolt",""],
  "op:weichensteller":["Signalbau Ost","teal","sand","diamond","bolt",""],
  "op:lindwurm":["Drachenloch","green","wine","shield","flame",""],
  "op:schrottkran":["Altmetall Velm","steel","sand","gear","claw",""],
  "op:muehlstein":["Mühle Ammann","bone","forest","round","crown",""],
  "rv:ottilie":["Rauch Feinmechanik","lilac","bone","round","star","R"],
  "rv:rudi":["Gerber Walzblech","steel","sand","hex","hammer",""],
  "rv:mira":["Hafenkran Vogt","teal","coal","diamond","saw",""],
  "rv:anselm":["Stellwerk Huber","forest","bone","shield","none","SH"],
  "tb:wedge":["Keilbau Fasel","sand","coal","diamond","none","KF","Türkeil"],
  "tb:lifter":["Lagerhalle 7","sky","sand","square","none","L7","Hubwagen"],
  "tb:flipper":["Sprungfeder","rose","bone","round","bolt","","Katapult"],
  "tb:hsp":["Drehwerk Kunz","teal","coal","gear","saw","","Wirbelwind"],
  "tb:vsp":["Erntehelfer","forest","sand","shield","claw","","Sense"],
  "tb:drum":["Garage Grauwald","wine","bone","hex","flame","","Trommelfeuer"],
  "tb:hammer":["Schmiede Koller","steel","wine","shield","hammer","","Vorschlag"],
  "tb:under":["Tiefgang","navy","sky","diamond","saw","","Sichel"],
  "tb:glass":["Robotik Eisenau","lilac","coal","round","star","","Seifenblase"],
  "tb:brick":["Bauhof Nord","coal","sand","square","none","BN","Ziegelstein"],
  "tb:invert":["Wendeplatz","violet","sand","hex","wrench","","Kehrwoche"],
  "tb:sloppy":["Schrottplatz Moser","steel","sand","square","skull","","Restposten"]};
/* a livery from anywhere, checked: null if it isn't one */
function lvNorm(o){if(!o||typeof o!=="object")return null;const hex=v=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
  if(!hex(o.main)||!hex(o.accent)||!LIVERY.shapes[o.shape]||!LIVERY.emblems[o.emblem])return null;
  return{name:String(o.name||"").trim().slice(0,LIVERY.maxName),main:o.main.toUpperCase(),accent:o.accent.toUpperCase(),shape:o.shape,emblem:o.emblem,text:lvText(o.text)};}
const lvText=t=>String(t||"").toUpperCase().replace(/[^A-Z0-9ÄÖÜ&]/g,"").slice(0,LIVERY.maxText);
/* your team's livery (S.team, put right if it isn't one) */
function lvMine(){const t=lvNorm(S.team)||Object.assign({},LIVERY.team);if(!t.name)t.name=LIVERY.team.name;return t;}
/* your bot's name in a class */
function lvBotName(cls){const b=S.bots[cls],n=b&&typeof b.name==="string"?b.name.trim():"";return n||LIVERY.names[cls]||"Bot";}
/* an opponent's team, from its id: "op:", "rv:" or "tb:" plus the id, or a bare opponent or test build id */
function lvOppRow(id){id=String(id||"");if(OPP_TEAMS[id])return OPP_TEAMS[id];for(const p of ["op:","tb:","rv:"])if(OPP_TEAMS[p+id])return OPP_TEAMS[p+id];return null;}
function lvOpp(id){const r=lvOppRow(id);if(!r)return null;return{name:r[0],main:LV_C[r[1]],accent:LV_C[r[2]],shape:r[3],emblem:r[4],text:r[5]};}
/* a test build's regular's name when it fights (its archetype name otherwise) */
function lvOppName(id,fallback){const r=lvOppRow(id);return r&&r[6]?r[6]:fallback;}
/* the liveries for a fight's bot specs, in place: none for a bot that has none, and no two main colours alike (a later bot
   swaps to its accent, or takes the first palette colour clear of everyone) */
function lvField(bots){const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),d=(a,b)=>{const x=rgb(a),y=rgb(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);};
  const used=[];for(const s of bots){const L=s.livery;if(!L)continue;const far=c=>used.every(u=>d(u,c)>=LIVERY.near);
    if(!far(L.main)){if(far(L.accent))s.livery=Object.assign({},L,{main:L.accent,accent:L.main});
      else{const c=LIVERY.cols.find(c=>far(c[1])&&d(c[1],L.accent)>=LIVERY.near);if(c)s.livery=Object.assign({},L,{main:c[1]});}}
    used.push(s.livery.main);}
  return bots;}
/* a badge as an <img> (cached data URL); a plain dot where the 3D code didn't load */
const LV_IMG=new Map();
function lvBadge(L,px,cls){if(!L)return"";const k=badgeKeyApp(L)+"|"+px;let u=LV_IMG.get(k);
  if(u==null){try{u=window.SCRAP_VIS&&SCRAP_VIS.badge?SCRAP_VIS.badge(L,px*2).toDataURL():"";}catch(e){u="";}LV_IMG.set(k,u);if(LV_IMG.size>120)LV_IMG.delete(LV_IMG.keys().next().value);}
  return u?`<img class="lvb${cls?" "+cls:""}" src="${u}" width="${px}" height="${px}" alt="">`:`<span class="lvb lvdot${cls?" "+cls:""}" style="background:${L.main};width:${px*0.6}px;height:${px*0.6}px"></span>`;}
const badgeKeyApp=L=>[L.main,L.accent,L.shape,L.emblem,L.text||""].join("|");
/* the workshop's bot wears your team */
function lvVis(){if(window.SCRAP_VIS&&SCRAP_VIS.setLivery)SCRAP_VIS.setLivery(lvMine());}

/* ---- the Team sheet ---- */
function lvSheetHtml(){const t=lvMine(),sw=(which)=>`<div class="lvsw" role="group" aria-label="${which==="main"?"Main colour":"Accent colour"}">${LIVERY.cols.map(c=>{const on=t[which]===c[1];
      return`<button type="button" data-lvc="${which}" data-v="${c[1]}" class="${on?"on":""}" aria-pressed="${on}" aria-label="${c[2]}" title="${c[2]}" style="--sw:${c[1]}"></button>`;}).join("")}</div>`,
    pick=(attr,map)=>`<div class="lvpk" role="group">${Object.keys(map).map(k=>{const on=t[attr]===k,L=Object.assign({},t,{[attr]:k});
      return`<button type="button" data-lvp="${attr}" data-v="${k}" class="${on?"on":""}" aria-pressed="${on}">${lvBadge(L,34)}<small>${map[k]}</small></button>`;}).join("")}</div>`;
  return`<div class="lvhead" id="lvHead">${lvBadge(t,72)}<div><b id="lvHName">${esc(t.name)}</b><small>Your team, on every bot you field</small></div></div>
    <div class="field"><label class="lbl" for="lvName">Team name</label><input id="lvName" type="text" maxlength="${LIVERY.maxName}" autocomplete="off" value="${esc(t.name)}"></div>
    <div class="field"><span class="lbl">Main colour <small>the stripe down the top and your card</small></span>${sw("main")}</div>
    <div class="field"><span class="lbl">Accent colour <small>pinstripes and the emblem</small></span>${sw("accent")}</div>
    <div class="field"><span class="lbl">Badge shape</span>${pick("shape",LIVERY.shapes)}</div>
    <div class="field"><span class="lbl">Emblem</span>${pick("emblem",LIVERY.emblems)}</div>
    <div class="field"><label class="lbl" for="lvText">Letters <small>up to ${LIVERY.maxText}, on the badge</small></label><input id="lvText" type="text" maxlength="${LIVERY.maxText}" autocomplete="off" autocapitalize="characters" value="${esc(t.text)}"></div>
    <p class="hint">Opponents bring their own colours. If theirs is too close to yours, they switch to their second colour.</p>`;}
function lvSet(k,v){const t=lvMine();t[k]=v;S.team=lvNorm(t)||t;save();lvVis();}
function lvRedraw(){const b=$("sheetBody"),y=b.scrollTop;b.innerHTML=lvSheetHtml();b.scrollTop=y;lvBind();if(typeof curTab!=="undefined"&&curTab==="build"&&typeof bRender==="function")bRender();}
function lvBind(){const b=$("sheetBody");
  b.querySelectorAll("[data-lvc],[data-lvp]").forEach(x=>x.addEventListener("click",()=>{lvSet(x.dataset.lvc||x.dataset.lvp,x.dataset.v);lvRedraw();
    const f=$("sheetBody").querySelector(`[data-${x.dataset.lvc?"lvc":"lvp"}="${x.dataset.lvc||x.dataset.lvp}"][data-v="${x.dataset.v}"]`);if(f)f.focus({preventScroll:true});}));
  const nm=$("lvName"),tx=$("lvText");
  nm.addEventListener("input",()=>{const v=nm.value.trim()||LIVERY.team.name;$("lvHName").textContent=v;});
  nm.addEventListener("change",()=>{lvSet("name",nm.value.trim()||LIVERY.team.name);if(curTab==="build")bRender();});
  tx.addEventListener("input",()=>{const v=lvText(tx.value);if(tx.value!==v)tx.value=v;lvSet("text",v);const h=$("lvHead").querySelector(".lvb");if(h)h.outerHTML=lvBadge(lvMine(),72);
    b.querySelectorAll("[data-lvp]").forEach(x=>{const L=Object.assign({},lvMine(),{[x.dataset.lvp]:x.dataset.v}),i=x.querySelector(".lvb");if(i)i.outerHTML=lvBadge(L,34);});});
  tx.addEventListener("change",()=>{if(curTab==="build")bRender();});}
function lvOpen(){openSheet("Your team",lvSheetHtml());lvBind();}
