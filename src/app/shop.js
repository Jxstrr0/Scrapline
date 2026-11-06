/* ===================== app/shop.js: the Shop tab =====================
   The career's spending outside the bot (plan section 11): the workshop (WORKSHOP_STAGES: move up for its price; rent
   and hours a week change), tools (TOOLS: unlock parts and cut build and repair hours), R&D and the team (app/team.js
   tmRndCard, tmTeamCard; PR 8), the pit kits' prices by class
   (bought when you enter an event, Career tab), and the books (S.career.ledger, the last 60 lines).
   Saves: the three save slots ("scr-slot1".."scr-slot3": save the current game into one, or load one; loading keeps this
   phone's settings, loadSlot in app/state.js), then the Saves card (backup codes and files; its buttons are wired in
   app/savecode.js by their data-bu attribute). */
const SH={ask:null};   // which slot button is waiting for "Sure?"
function shRender(){const el=$("shBody");if(!el)return;const c=crOn()?S.career:null;
  el.innerHTML=(c?shWorkshop(c)+shTools(c)+tmRndCard()+tmTeamCard()+shKits(c)+shBooks(c):`<div class="card"><h3>Tools and workshop</h3><p>Start a career (Career tab) to buy tools, move workshops and keep the books. Sparring needs none of it.</p></div>`)+shSlots();}
function shWorkshop(c){const cur=crStage(),i=WORKSHOP_STAGES.indexOf(cur);
  return`<div class="card"><h3>Workshop</h3><ul class="shlist">${WORKSHOP_STAGES.map((w,k)=>`<li class="${k===i?"on":""}"><span class="nm"><b>${esc(ftCap(w.name))}</b><small>${esc(w.line)}</small>
    <small>${w.hours} h a week · rent ${fmt$(w.rent)} a week · up to ${esc(SIM.CLASSES[w.maxCls].name.toLowerCase())}${w.travel<1?` · travel ${Math.round((1-w.travel)*100)}% cheaper`:""}</small></span>
    ${k===i?'<span class="tag">yours</span>':k>i?`<button type="button" class="btn sm" data-shstage="${w.id}"${k===i+1?"":" disabled"}>${SH.ask==="st:"+w.id?"Sure? ":""}${fmt$(w.price)}</button>`:""}</li>`).join("")}</ul>
    <p class="hint">Moving takes the next one up; the old place is gone. Rent comes out at Close week.</p></div>`;}
function shToolNeeds(t){const T=TOOLS[t],st=WORKSHOP_STAGES.findIndex(w=>w.id===T.stage);return st>WORKSHOP_STAGES.indexOf(crStage())?`needs ${WORKSHOP_STAGES[st].name.toLowerCase()}`:null;}
function shUnlocks(t){const out=[];for(const slot in SIM.PARTS)for(const p of SIM.PARTS[slot])if(p.unlock==="tool:"+t)out.push(p.name.toLowerCase());return out;}
function shTools(c){return`<div class="card"><h3>Tools</h3><ul class="shlist">${TOOL_IDS.map(t=>{const T=TOOLS[t],has=!!S.unlocks.tools[t],need=has?null:shToolNeeds(t),un=shUnlocks(t);
    const cut=Object.keys(T.cut).map(k=>`${k==="all"?"everything":k==="weaponMaterial"?"weapon stock":k} −${Math.round(T.cut[k]*100)}%`).join(", ");
    return`<li class="${has?"on":""}"><span class="nm"><b>${esc(T.name)}</b><small>${esc(T.line)}</small>${un.length||cut?`<small>${un.length?"Unlocks "+esc(un.join(", "))+". ":""}${cut?"Hours: "+esc(cut)+".":""}</small>`:""}</span>
      ${has?'<span class="tag">owned</span>':need?`<span class="tag lock">${esc(need)}</span>`:`<button type="button" class="btn sm" data-shtool="${t}">${SH.ask==="tl:"+t?"Sure? ":""}${fmt$(T.price)}</button>`}</li>`;}).join("")}</ul>
    <p class="hint">Hour cuts multiply, down to half the hours.</p></div>`;}
function shKits(c){const cls=TIME.acts[c.act].classes.concat(c.act>0?TIME.acts[c.act-1].classes:[]).filter((x,i,a)=>a.indexOf(x)===i);
  return`<div class="card"><h3>Pit kits</h3><p>Bought for each event when you enter it: they decide what the 60 s pit window can fix.</p>
    <table class="shkits"><thead><tr><th></th>${cls.map(x=>`<th scope="col">${esc(SIM.CLASSES[x].name.replace("weight",""))}</th>`).join("")}</tr></thead><tbody>
    ${Object.keys(PIT_KITS).map(k=>`<tr><th scope="row">${esc(PIT_KITS[k].name)}<small>${Object.keys(PIT_KITS[k].allow).map(a=>`${PIT_NAMES[a].toLowerCase()} ${PIT_KITS[k].allow[a]}`).join(", ")}</small></th>${cls.map(x=>`<td class="readout">${fmt$(crKitPrice(k,x))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;}
function shBooks(c){const L=c.ledger.slice(0,20);
  return`<div class="card"><h3>The books</h3>${L.length?`<table class="shbooks"><tbody>${L.map(l=>`<tr><td class="readout">wk ${l.w}</td><td>${esc(l.what)}</td><td class="readout ${l.amt<0?"":"ok"}">${l.amt<0?"−":"+"}${fmt$(Math.abs(l.amt)).replace("−","")}</td></tr>`).join("")}</tbody></table>`:"<p>Nothing yet.</p>"}
    <p class="hint">${fmt$(c.money)} in the tin${c.loan.owed>0?`, ${fmt$(c.loan.owed)} owed to ${esc(WORLD.bank)}`:""}.</p></div>`;}
function shSlots(){let h="";for(let i=1;i<=SLOTS;i++){const o=buStored(slotKey(i));
    h+=`<li><span class="nm"><b>Slot ${i}</b><small>${o?esc(buWhat(o)):"Empty"}</small></span><button type="button" class="btn sm" data-shsave="${i}">${SH.ask==="sv:"+i?"Sure?":"Save here"}</button>${o?`<button type="button" class="btn sm ghost" data-shload="${i}">${SH.ask==="ld:"+i?"Sure?":"Load"}</button>`:""}</li>`;}
  return`<div class="card"><h3>Save slots</h3><p>Keep up to three games on this phone. Saving here copies the game you're playing; loading one replaces it (your settings stay).</p><ul class="shlist">${h}</ul></div>`;}
/* a second tap within the card confirms */
function shSure(k){if(SH.ask===k){SH.ask=null;return true;}SH.ask=k;shRender();return false;}
function shClick(e){if(tmClick(e))return;const x=e.target.closest("[data-shstage],[data-shtool],[data-shsave],[data-shload]");if(!x)return;const c=S.career;
  if(x.dataset.shstage){const w=WORKSHOP_STAGES.find(s=>s.id===x.dataset.shstage);if(!crOn()||!w)return;
    if(c.money<w.price){toast(`Need ${fmt$(w.price-c.money)} more`);return;}if(!shSure("st:"+w.id))return;
    crPay(w.price,`Moved into ${w.name.toLowerCase()}`);c.stage=w.id;save();hud();shRender();toast(`Moved: ${w.name.toLowerCase()}`);buzz([10,30,10]);return;}
  if(x.dataset.shtool){const t=x.dataset.shtool,T=TOOLS[t];if(!crOn()||S.unlocks.tools[t]||shToolNeeds(t))return;
    if(c.money<T.price){toast(`Need ${fmt$(T.price-c.money)} more`);return;}if(!shSure("tl:"+t))return;
    crPay(T.price,`Bought: ${T.name.toLowerCase()}`);S.unlocks.tools[t]=true;save();hud();shRender();toast(`${T.name} bought`);buzz([10,30,10]);return;}
  if(x.dataset.shsave){const i=+x.dataset.shsave;if(TUT_ON){toast("Not during the tutorial: this bot is a loaner");return;}if(!shSure("sv:"+i))return;
    try{localStorage.setItem(slotKey(i),JSON.stringify(S));}catch(err){toast("Couldn't save: storage is full");shRender();return;}shRender();toast(`Saved in slot ${i}`);return;}
  if(x.dataset.shload){const i=+x.dataset.shload,o=buStored(slotKey(i));if(!o)return;if(!shSure("ld:"+i))return;
    loadSlot(o,`Slot ${i} loaded`);}}
TAB_RENDER.shop=function(){if(!shRender.bound){shRender.bound=true;$("tab-shop").addEventListener("click",shClick);}SH.ask=null;TM.ask=null;shRender();};
