/* ===================== app/pit.js: the pit window =====================
   60 real seconds (PIT_S) between rounds of a best of three, and from PR 7 between fights on an event day. The pit kit
   (PIT_KITS, state.js) says which repairs are allowed and how many for the whole event; REPAIR_TIMES says how long each
   takes. One repair at a time, and the clock keeps running while you decide. It pauses while the page is hidden or the
   Fight tab is left. When the clock runs out a repair still going is lost.
     pitItems(b, dmg, flags, left)   what's broken and the repairs on offer: [{key, name, state, frac, opts:[{kind, ok,
                                     why}]}]. dmg is {key: J taken} (damageTaken's shape), flags {bent}, left the kit's
                                     counts still unused.
     pitApply(b, dmg, flags, key, kind)   does it: a swap clears the key's damage (a disc unbends it), a bodge leaves half
                                     its hp
     pitAuto(b, dmg, flags, left)    the other corner's crew: the most useful repairs that fit in PIT_S, in order. Returns
                                     [{key, kind}]. Deterministic, no clock.
     PIT.open({host, b, dmg, flags, kit, left, title, onDone})   the pit panel in the fight overlay. dmg, flags and left
                                     are changed in place; onDone({done:[{key, kind}], lost}) once you're ready or the
                                     clock runs out. PIT.close() takes it down without calling onDone. */
const PIT_NAMES={wheel:"Wheel swap",belt:"New belt",pod:"Drive pod swap",battery:"Battery swap",armour:"Armour panel",bodge:"Bodge",disc:"Spare weapon"};
/* hp of a damage key on a build */
function pitHp(b,key){if(key.indexOf("armour_")===0){const a=b.armourMapJ[key.slice(7)];return a?a.hpJ:0;}
  if(key==="chassis"){const ch=SIM.part("chassis",b.cfg.chassis);return ch?ch.hp*SIM.classMult(b.cls).mass:0;}
  const p=b.parts.find(q=>q.key===key);return p?p.hpJ:0;}
/* the swap that puts a key back to new, or null when only a bodge helps */
function pitSwap(b,key,flags,frac){if(key.indexOf("armour_")===0)return"armour";if(key==="battery")return"battery";
  const p=b.parts.find(q=>q.key===key);if(!p)return null;
  if(p.slot==="wheels")return"wheel";if(p.slot==="drive")return"pod";
  if(p.slot==="weapon")return flags.bent||frac<=0?"disc":"belt";
  return null;}
function pitName(b,key){if(key.indexOf("armour_")===0)return(FT_FACE[key.slice(7)]||key.slice(7))+" armour";
  if(key==="chassis")return"chassis";return SIM.benchPartName(b,key);}
function pitItems(b,dmg,flags,left){const out=[];flags=flags||{};
  const keys=Object.keys(dmg).filter(k=>dmg[k]>0);if(flags.bent&&keys.indexOf("weapon")<0)keys.push("weapon");
  for(const key of keys){const hp=pitHp(b,key);if(!(hp>0))continue;const frac=Math.max(0,1-(dmg[key]||0)/hp);
    const bent=key==="weapon"&&flags.bent;if(frac>=0.999&&!bent)continue;
    const state=frac<=1e-9?"destroyed":"damaged",opts=[];
    if(key!=="chassis"){const sw=pitSwap(b,key,flags,frac);
      if(sw)opts.push({kind:sw,ok:(left[sw]||0)>0,why:(left[sw]||0)>0?"":sw in left?"none left":"not in this kit"});
      if(frac<0.5&&!bent)opts.push({kind:"bodge",ok:(left.bodge||0)>0,why:(left.bodge||0)>0?"":"none left"});}
    out.push({key,name:pitName(b,key),state,frac,bent,opts});}
  /* the worst first: destroyed, then by hp left */
  return out.sort((a,b)=>a.frac-b.frac||(a.key<b.key?-1:1));}
function pitApply(b,dmg,flags,key,kind){const hp=pitHp(b,key);
  if(kind==="bodge")dmg[key]=Math.round(hp*0.5*100)/100;
  else{delete dmg[key];if(kind==="disc")flags.bent=false;}}
/* how much a repair matters to the next round: losing a side or the battery ends fights, the weapon wins them */
function pitValue(b,it,kind){const k=it.key,p=b.parts.find(q=>q.key===k),gain=(kind==="bodge"?0.5:1)-it.frac;
  const w=k==="battery"||k==="electronics"?5:p&&(p.slot==="wheels"||p.slot==="drive")?4:k==="weapon"?3:k.indexOf("armour_")===0?2:1;
  return w*Math.max(gain,it.bent?0.5:0)/REPAIR_TIMES[kind];}
function pitAuto(b,dmg,flags,left){let t=PIT_S;const done=[];
  for(let guard=0;guard<20;guard++){let best=null;
    for(const it of pitItems(b,dmg,flags,left))for(const o of it.opts)if(o.ok&&REPAIR_TIMES[o.kind]<=t){const v=pitValue(b,it,o.kind);if(!best||v>best.v)best={v,key:it.key,kind:o.kind};}
    if(!best||best.v<=0)break;
    pitApply(b,dmg,flags,best.key,best.kind);left[best.kind]--;t-=REPAIR_TIMES[best.kind];done.push({key:best.key,kind:best.kind});}
  return done;}

const PIT={on:false,kit:null};
PIT.open=function(o){PIT.close();Object.assign(PIT,{on:true,o,kit:o.kit,t:PIT_S,job:null,done:[],last:performance.now(),raf:0});
  const el=document.createElement("div");el.className="fpit";el.id="fPit";el.setAttribute("role","dialog");el.setAttribute("aria-labelledby","fPitT");
  el.innerHTML=`<div class="fpithd"><b id="fPitT">${esc(o.title||"Pit window")}</b><span class="fpitclock readout" id="fPitClock" role="timer" aria-label="Pit clock">1:00</span></div>
    <p class="fpitkit"><b>${esc(PIT_KITS[o.kit].name)}</b> · <span id="fPitLeft"></span></p>
    <div class="fpitjob" id="fPitJob" hidden><span id="fPitJobT"></span><span class="ftbar"><i id="fPitJobBar"></i></span></div>
    <div class="fpitbody"><canvas class="fpitsil" id="fPitSil" width="88" height="88" aria-hidden="true"></canvas><ul class="fpitlist" id="fPitList"></ul></div>
    <div class="row"><button type="button" class="btn pri" data-pit="ready">Ready</button></div>`;
  o.host.appendChild(el);o.host.classList.add("pitting");el.addEventListener("click",pitClick);PIT.el=el;pitRender();
  const f=el.querySelector("[data-pit=ready]");if(f)f.focus({preventScroll:true});
  PIT.raf=requestAnimationFrame(pitFrame);};
PIT.close=function(){if(PIT.raf)cancelAnimationFrame(PIT.raf);PIT.raf=0;if(PIT.el){if(PIT.el.parentNode)PIT.el.parentNode.classList.remove("pitting");PIT.el.remove();}PIT.el=null;PIT.on=false;};
function pitEnd(lost){const o=PIT.o,done=PIT.done;PIT.close();if(o&&o.onDone)o.onDone({done,lost:lost||null});}
function pitFrame(now){PIT.raf=0;if(!PIT.on)return;const dt=Math.min(0.25,Math.max(0,(now-PIT.last)/1000));PIT.last=now;
  if(!document.hidden&&curTab==="fight"){PIT.t-=dt;
    const j=PIT.job;if(j){j.left-=dt;if(j.left<=0&&PIT.t>=0){const o=PIT.o;pitApply(o.b,o.dmg,o.flags,j.key,j.kind);PIT.done.push({key:j.key,kind:j.kind});PIT.job=null;buzz(15);pitRender();}}
    if(PIT.t<=0){pitEnd(PIT.job?PIT.job:null);return;}}
  pitTick();PIT.raf=requestAnimationFrame(pitFrame);}
function pitTick(){const c=$("fPitClock");if(c){const s=Math.max(0,Math.ceil(PIT.t)),txt=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;if(c.textContent!==txt)c.textContent=txt;c.classList.toggle("lo",PIT.t<10);}
  const j=PIT.job,box=$("fPitJob");if(box){box.hidden=!j;if(j){$("fPitJobT").textContent=`${PIT_NAMES[j.kind]}: ${j.name} · ${Math.ceil(j.left)} s`;$("fPitJobBar").style.width=Math.round((1-j.left/j.total)*100)+"%";}}}
function pitRender(){const o=PIT.o,L=$("fPitList");if(!L)return;const items=pitItems(o.b,o.dmg,o.flags,o.left),busy=!!PIT.job;
  const allow=PIT_KITS[o.kit].allow;$("fPitLeft").textContent=Object.keys(allow).map(k=>`${PIT_NAMES[k].toLowerCase()} ${o.left[k]||0}`).join(" · ");
  L.innerHTML=items.length?items.map(it=>`<li><span class="nm">${esc(ftCap(it.name))} <small class="${it.state==="destroyed"?"broke":"worn"}">${it.bent?"bent":it.state==="destroyed"?"destroyed":Math.round(it.frac*100)+"%"}</small></span>
      <span class="fpitopts">${it.opts.length?it.opts.map(p=>`<button type="button" class="btn sm${p.ok?"":" off"}" data-pitkey="${esc(it.key)}" data-pitkind="${p.kind}"${p.ok&&!busy?"":" disabled"} title="${p.why||""}">${PIT_NAMES[p.kind]} <small>${REPAIR_TIMES[p.kind]} s${p.why?" · "+p.why:""}</small></button>`).join(""):`<small class="hint">${it.key==="chassis"?"can't be fixed in the pit":"nothing in the kit for this"}</small>`}</span></li>`).join("")
    :`<li><span class="nm ok">Nothing to fix.</span></li>`;
  ftSil($("fPitSil"),{b:o.b},pitStates(o),88);}
function pitStates(o){const st=SIM.damageState(o.b,o.dmg),s=SIM.partStates(o.b,st);if(o.flags.bent&&s.weapon==="intact")s.weapon="damaged";return s;}
function pitClick(e){const x=e.target.closest("[data-pit],[data-pitkey]");if(!x||!PIT.on)return;
  if(x.dataset.pit==="ready"){pitEnd(PIT.job);return;}
  if(PIT.job)return;const o=PIT.o,kind=x.dataset.pitkind,key=x.dataset.pitkey;if(!(o.left[kind]>0))return;
  o.left[kind]--;PIT.job={key,kind,name:pitName(o.b,key),left:REPAIR_TIMES[kind],total:REPAIR_TIMES[kind]};buzz(8);pitRender();pitTick();}
