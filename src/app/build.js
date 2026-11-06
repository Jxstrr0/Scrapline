/* ===================== app/build.js: the Build tab =====================
   PR 2 brings the builder here: the weight bar (always visible), section rows (Class, Chassis, Armour, Drive & Wheels,
   Power, Weapon, Weapon material, Extras) with PEW-style delta lines, the layout editor, the side profile strip, the docked
   summary capsule, the stress report, and named designs (docs/SCRAPLINE-PLAN.md section 5).
   Now (PR 1): the build maths shown raw. Pick a class and one of the sim's TEST_BUILDS (or DEFAULT_CFG) and read what
   evalBuild() makes of it: the key numbers, the stress report, and the whole result object. Nothing here is saved.
   ?sim=1 opens the raw result straight away. */
const BX={cls:"beetle",build:"default"};
const BX_SEV={bad:["broke","Bad"],warn:["worn","Weak"],info:["info","Note"],good:["ok","Good"]};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtG=g=>g>=10000?(g/1000).toLocaleString("en-GB",{maximumFractionDigits:1})+" kg":Math.round(g).toLocaleString("en-GB")+" g";
const fmtS=s=>s==null||!isFinite(s)?"never":Math.round(s)+" s";
const FACE_LBL={front:"front",back:"rear",left:"left side",right:"right side",top:"top"};

function bxBuilds(){return[{id:"default",name:"Starter (DEFAULT_CFG)",cfg:SIM.DEFAULT_CFG}].concat(SIM.TEST_BUILDS);}
function bxCfg(){const t=bxBuilds().find(t=>t.id===BX.build)||bxBuilds()[0];return Object.assign({},t.cfg,{cls:BX.cls});}

function bxRender(){
  const b=SIM.evalBuild(bxCfg()),w=b.weapon,h=b.height;
  $("bxCls").querySelectorAll("button").forEach(x=>{const on=x.dataset.cls===BX.cls;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});
  const pct=100*b.totalG/b.limitG;
  let wpn="none";
  if(w.type==="spinner"||w.type==="saw")wpn=`<span class="readout">${Math.round(w.storedJ).toLocaleString("en-GB")} J</span> · ${Math.round(w.rpm).toLocaleString("en-GB")} rpm · spin-up <span class="readout">${w.spinUpS.toFixed(1)} s</span>`;
  else if(w.type==="flipper")wpn=`<span class="readout">${Math.round(w.launchJ)} J</span> · ${w.shots} shots · lifts ${w.canLiftKg.toFixed(1)} kg`;
  else if(w.type==="lifter")wpn=`lifts ${w.canLiftKg.toFixed(1)} kg`;
  else if(w.type==="hammer"||w.type==="crusher")wpn=`<span class="readout">${Math.round(w.energyJ)} J</span>`;
  else if(w.type==="wedge")wpn="wedge";
  const rows=[
    ["Weight",`${fmtG(b.totalG)} of ${fmtG(b.limitG)} <span class="${pct>100?"broke":pct<95?"worn":"ok"}">(${pct.toFixed(1)}%)</span>`],
    ["Top speed",`${b.driveSpeed.toFixed(1)} m/s`],
    ["Turn rate",`${Math.round(b.turnRate*180/Math.PI)}°/s`],
    ["Push",`${b.pushN.toFixed(b.pushN<100?1:0)} N`],
    ["Weapon",wpn],
    ["Front edge",`${h.frontEdgeMm.toFixed(1)} mm`],
    ["Clearance",`${h.clearanceMm.toFixed(1)} mm`],
    ["Upside down",h.drivesInverted?"drives":h.selfRight?"self-rights":'<span class="broke">stuck</span>'],
    ["Runtime",`<span class="readout">${fmtS(b.runtimeS)}</span>`],
    ["Overheats",`<span class="readout">${fmtS(b.heat.fightDerateS)}</span>`],
    ["Weakest face",FACE_LBL[b.weakestFace]],
    ["Centre of mass",`${Math.round(b.com.x*1000)} mm, ${Math.round(b.com.y*1000)} mm`],
    ["Cost",fmt$(b.cost)],
    ["Workshop hours",`${b.buildHours} h`]];
  $("bxKv").innerHTML=rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join("");
  $("bxStress").innerHTML=b.stress.length?b.stress.map(s=>{const v=BX_SEV[s.sev]||BX_SEV.info;return`<li><span class="sev ${v[0]}">${v[1]}</span><span>${esc(s.text)}</span></li>`;}).join(""):"<li>Nothing to report.</li>";
  if($("bxRaw").open)$("simOut").textContent=JSON.stringify(b,(k,v)=>typeof v==="number"?Math.round(v*1000)/1000:v,1);}

TAB_RENDER.build=function(){
  if(!$("bxCls").firstChild){
    $("bxCls").innerHTML=SIM.CLASS_IDS.map(id=>{const c=SIM.CLASSES[id];return`<button type="button" data-cls="${id}">${c.name.replace("weight","")}<small>${fmtG(c.limitG)}</small></button>`;}).join("");
    $("bxBuild").innerHTML=bxBuilds().map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("");
    $("bxCls").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;BX.cls=x.dataset.cls;bxRender();});
    $("bxBuild").addEventListener("change",e=>{BX.build=e.target.value;bxRender();});
    $("bxRaw").addEventListener("toggle",bxRender);
    if(/[?&]sim=1(&|$)/.test(location.search))$("bxRaw").open=true;}
  $("bxBuild").value=BX.build;bxRender();};
