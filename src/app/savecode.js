/* ===================== app/savecode.js: SAVE CODES, Back up / Restore =====================
   One code holds everything this game keeps in the browser, so a player can move to another phone or browser, or keep a
   copy somewhere safe. All of it lives in localStorage on this device; nothing is ever sent anywhere.
     save    the current game ("srv-save"), taken live with snapshot(). Settings (theme, graphics, sound) ride in it, under save.settings.
     slots   the 3 save slots ("srv-slot1" .. "srv-slot3"), null for an empty one
   Code = "SRV1:" + body + a 6-character checksum. body = that object as JSON -> UTF-8 bytes -> LZW (9..16-bit codes) ->
   base64url (A-Z a-z 0-9 - _ only), so it survives notes apps, email and chat. Same shape as PEW's PEW1: codes.
   Restore checks everything before it writes anything: checksum, unpack, JSON, the shape of every save and a trial
   hydrate() of each one. Then buWrite() writes all four keys and puts the old values back if any write fails, so a bad
   paste can never leave a half-restored game. The next version of this format is SRV2:.
   A new localStorage key must be added to buMake and buWrite (and to check-savecode.js), or backups won't carry it.
   UI: Shop tab -> Saves, and Settings -> Saves (buttons call buBackupOpen / buRestoreOpen; the two file buttons carry
   data-bu="file" / data-bu="load" and are picked up by one click listener at the bottom of this file).
   Save safety (bottom of this file): backup files, asking the browser to keep our storage, and the backup reminder.
   The last backup time is S.lastBackup (milliseconds), a field inside the srv-save object, so no new key.
   Tests: `node check-savecode.js` in the repo root. */
const BU_V=1,BU_PREFIX="SRV"+BU_V+":";
const BU_B64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",BU_MAXCODES=65536;
const BU_KEY="srv-save";
const BU_MSG={
  empty:"Paste a backup code into the box first.",
  damaged:"That code is damaged or cut off. Copy the whole code again, from SRV1: right to the end, and paste it here.",
  newer:"That code was made by a newer version of the game. Reload the page to update, then try again.",
  other:"That's a save code from a different game. Servo backup codes start with \"SRV1:\".",
  notcode:"That doesn't look like a save code. Backup codes start with \"SRV1:\".",
  bad:"That code opened, but the save inside doesn't look right, so nothing was changed.",
  store:"This browser wouldn't let the game save (storage may be full or blocked), so nothing was changed."
};
const buFail=k=>{const e=new Error(BU_MSG[k]);e.bu=k;return e;};   // an error with a message that's fine to show the player

/* ---- packing: bytes <-> base64url text ---- */
function buBits(n){let b=1;while(n>=2){n>>>=1;b++;}return b;}   // how many bits it takes to write n
/* LZW over bytes. Bits go MSB-first into 6-bit base64url characters and the tail is zero-padded. A code's width is the
   bit length of the largest code the reader could see next, so both sides always agree on it. */
function buZip(bytes){
  const out=[];let acc=0,nacc=0;
  const put=(v,w)=>{for(let i=w-1;i>=0;i--){acc=acc<<1|(v>>>i&1);if(++nacc===6){out.push(BU_B64[acc]);acc=0;nacc=0;}}};
  if(!bytes.length)return"";
  const dict=new Map();let next=256,cur=bytes[0];
  for(let i=1;i<bytes.length;i++){
    const key=cur*256+bytes[i],hit=dict.get(key);
    if(hit!==undefined){cur=hit;continue;}
    put(cur,buBits(next-1));
    if(next<BU_MAXCODES)dict.set(key,next++);
    cur=bytes[i];}
  put(cur,buBits(next-1));
  if(nacc)out.push(BU_B64[acc<<(6-nacc)]);
  return out.join("");}
function buUnzip(str){
  let pos=0;const total=str.length*6,out=[];
  const read=w=>{let v=0;for(let i=0;i<w;i++,pos++){const d=BU_B64.indexOf(str[pos/6|0]);if(d<0)throw buFail("damaged");v=v*2+(d>>(5-pos%6)&1);}return v;};
  if(total<8)return out;
  const prefix=[],suffix=[],first=[];for(let i=0;i<256;i++){prefix.push(-1);suffix.push(i);first.push(i);}
  let size=256;
  const emit=code=>{const at=out.length;while(code>=0){out.push(suffix[code]);code=prefix[code];}   // the bytes come out backwards
    for(let a=at,b=out.length-1;a<b;a++,b--){const t=out[a];out[a]=out[b];out[b]=t;}};
  let prev=read(8);emit(prev);
  for(;;){
    const w=buBits(Math.min(size,BU_MAXCODES-1));
    if(total-pos<w)break;   // what's left is padding
    const code=read(w);let fb;
    if(code<size)fb=first[code];
    else if(code===size)fb=first[prev];   // the code being defined right now (the classic LZW "KwKwK" case)
    else throw buFail("damaged");
    if(size<BU_MAXCODES){prefix.push(prev);suffix.push(fb);first.push(first[prev]);size++;}
    emit(code);prev=code;}
  return out;}
/* FNV-1a of the body, as 6 base64url characters: a missing, extra or changed character almost surely won't match */
function buSum(body){let h=2166136261;for(let i=0;i<body.length;i++){h^=body.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  let s="";for(let i=0;i<6;i++){s+=BU_B64[h&63];h=Math.floor(h/64);}return s;}

/* ---- making a code ---- */
function buStored(k){try{const j=localStorage.getItem(k);if(!j)return null;const o=JSON.parse(j);return o&&typeof o==="object"&&!Array.isArray(o)?o:null;}catch(e){return null;}}
function buMake(){const slots=[];for(let i=1;i<=SLOTS;i++)slots.push(buStored(slotKey(i)));
  return{v:BU_V,at:Date.now(),ver:VERSION,save:snapshot(),slots};}
function buCode(d){const body=buZip(new TextEncoder().encode(JSON.stringify(d||buMake())));return BU_PREFIX+body+buSum(body);}

/* ---- checking a save before anything is written ---- */
const buObj=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
const buNum=v=>typeof v==="number"&&isFinite(v);
function buSaveOk(o){
  if(!buObj(o)||!buNum(o.v)||!buObj(o.settings)||!buObj(o.bots))return false;
  for(const k of ["designs","unlocks","rivals"])if(k in o&&o[k]!=null&&!buObj(o[k]))return false;
  for(const k of ["staff","sponsors"])if(k in o&&o[k]!=null&&!Array.isArray(o[k]))return false;
  if("career" in o&&o.career!=null){const c=o.career;if(!buObj(c))return false;
    for(const k of ["events","results"])if(k in c&&!Array.isArray(c[k]))return false;
    for(const k of ["rep"])if(k in c&&!buObj(c[k]))return false;
    for(const k of ["money","year","week","hours","loan","driverXp"])if(k in c&&!buNum(c[k]))return false;}
  return buTry(o);}
/* load a copy the way the game would (hydrate), then put the running game back exactly as it was */
function buTry(o){const keep=S;let ok=false;
  try{ok=hydrate(JSON.parse(JSON.stringify(o)))===true;}catch(e){ok=false;}
  finally{S=keep;}
  return ok;}
function buFullOk(d){return buObj(d)&&d.v===BU_V&&buSaveOk(d.save)&&Array.isArray(d.slots)&&d.slots.length<=SLOTS
  &&d.slots.every(o=>o===null||buSaveOk(o));}

/* ---- reading a code: {kind:"full",data}. Spaces, line breaks and text around the code are fine.
   Throws buFail(...) with a message for the player. ---- */
function buRead(text){
  const s=String(text==null?"":text).replace(/[\s​-‍⁠﻿]+/g,"");
  if(!s)throw buFail("empty");
  const m=/SRV(\d+):/.exec(s);
  if(!m){
    if(/(^|[^A-Za-z0-9])[A-Za-z]{2,8}\d+:[A-Za-z0-9_-]/.test(s))throw buFail("other");   // e.g. PEW1:... from another game
    throw buFail("notcode");}
  const n=+m[1];
  if(n!==BU_V)throw buFail(n>BU_V?"newer":"notcode");
  const c=s.slice(m.index+m[0].length).replace(/[^A-Za-z0-9_-].*$/,"");   // drop quotes or punctuation pasted after it
  if(c.length<7)throw buFail("damaged");
  const body=c.slice(0,-6);
  if(buSum(body)!==c.slice(-6))throw buFail("damaged");
  let d;try{d=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(buUnzip(body))));}catch(e){throw buFail("damaged");}
  if(!buFullOk(d))throw buFail("bad");
  return{kind:"full",data:d};}

/* ---- writing a checked backup: all four keys, or none of them ---- */
function buWrite(d){
  const keys=[[BU_KEY,d.save]];for(let i=1;i<=SLOTS;i++)keys.push([slotKey(i),d.slots[i-1]||null]);
  const old=[];
  try{for(const [k] of keys)old.push([k,localStorage.getItem(k)]);}catch(e){return false;}
  try{for(const [k,v] of keys){if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}return true;}
  catch(e){   // put the old values back: clear all four first, so a full storage has room for what fitted before
    try{for(const [k] of old)localStorage.removeItem(k);for(const [k,v] of old)if(v!=null)localStorage.setItem(k,v);}catch(_){}
    return false;}}

/* ---- the two sheets ---- */
function buSelect(ta){try{ta.select();ta.setSelectionRange(0,ta.value.length);}catch(e){}}
async function buCopy(ta){
  try{await navigator.clipboard.writeText(ta.value);buMarked();toast("Copied. Paste it somewhere safe.");return;}catch(e){}   // no clipboard access: select it instead
  ta.focus();buSelect(ta);let ok=false;try{ok=document.execCommand("copy");}catch(e){}
  if(ok)buMarked();
  toast(ok?"Copied. Paste it somewhere safe.":"Code selected. Long-press it and tap Copy.");}
function buBackupOpen(){let code="";try{code=buCode();}catch(e){}
  if(!code){toast("Couldn't make a backup code on this device");return;}
  openSheet("Back up",`<p class="hint" style="margin-top:0">This code is your whole game: the current game, all 3 save slots and your settings. Keep it in your notes, then paste it into <b>Restore</b> on any phone or browser.</p>
<textarea class="code" id="codeOut" readonly spellcheck="false" aria-label="Your backup code"></textarea>
<p class="hint">${code.length.toLocaleString("en-GB")} characters, starting with ${BU_PREFIX}</p>
<div class="row"><button class="btn pri" id="copyCode">Copy code</button></div>`);
  const ta=$("codeOut");ta.value=code;ta.addEventListener("focus",()=>buSelect(ta));
  $("copyCode").addEventListener("click",()=>buCopy(ta));}
function buRestoreOpen(){
  openSheet("Restore",`<p class="hint" style="margin-top:0">Paste a backup code (it starts with ${BU_PREFIX}). Restoring replaces your current game and all 3 save slots on this device.</p>
<textarea class="code" id="codeIn" placeholder="${BU_PREFIX}…" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-label="Backup code to restore" aria-describedby="codeErr"></textarea>
<p class="hint buerr" id="codeErr" role="alert"></p>
<div class="row"><button class="btn pri" id="doImport">Restore</button></div>`);
  const ta=$("codeIn"),err=$("codeErr");
  ta.addEventListener("input",()=>{err.textContent="";});
  $("doImport").addEventListener("click",()=>buRestore(ta.value,err));
  if(window.matchMedia&&matchMedia("(hover:hover) and (pointer:fine)").matches)ta.focus({preventScroll:true});}   // no surprise keyboard on phones
function buWhat(o){const c=o.career;return c?`Career, ${c.year||WORLD.startYear} week ${c.week||1}, ${fmt$(c.money||0)}`:"No career started yet";}
function buAsk(d){const when=buNum(d.at)?new Date(d.at).toLocaleString("en-GB",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"";
  const n=d.slots.filter(Boolean).length;
  return `Restore this backup?\n\n${when?"Made "+when+"\n":""}${buWhat(d.save)}\n${n} of ${SLOTS} save slots used\n\nIt replaces your current game and all ${SLOTS} save slots on this device.`;}
function buRestore(text,err){
  const say=k=>{err.textContent=BU_MSG[k]||BU_MSG.damaged;err.scrollIntoView&&err.scrollIntoView({block:"nearest"});};
  err.textContent="";
  let r;try{r=buRead(text);}catch(e){say(e&&e.bu||"damaged");return;}
  if(!confirm(buAsk(r.data)))return;
  r.data.save.lastBackup=Date.now();   // restoring means a copy of this game exists: no reminder for a while
  if(!buWrite(r.data)){say("store");return;}
  closeSheet();applyLoaded(r.data.save,"Backup restored");buPersist();}

/* ===================== save safety =====================
   Every Kelbo game shares the jxstrr0.github.io origin, so one storage quota: if the phone runs low, the browser may
   clear the whole origin, and every game's saves with it. Three things make that less likely to hurt:
   1. buPersist() asks the browser to keep our storage (navigator.storage.persist). Once per page load, and only once the
      player has something worth keeping (a save write with progress, a backup or a restore), because Firefox shows a
      prompt for it. Chrome and Safari decide quietly. buStoreLine() fills the "Storage: ..." line in both Saves spots.
   2. Backup files: the same SRV1: code, as servo-backup-YYYY-MM-DD.txt. Shared through the share sheet where files
      can be shared (iPhone: Save to Files, also from the Home Screen app), else downloaded. Loading a file puts its text
      into the Restore sheet and runs the same checks and the same confirm as a pasted code.
   3. buRemind(): with progress and no backup yet (or none for 14 days), one quiet bar per visit, at a calm moment (after
      start-up or on a tab switch, never over a sheet or the intro). Later PRs: skip it while a fight or a pit window is running.
   Nothing here touches anything outside srv-. */
const BU_REMIND_DAYS=14,BU_FILE_MAX=16e6;
function buFileName(d){d=d||new Date();const p=n=>String(n).padStart(2,"0");
  return `servo-backup-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}.txt`;}   // local date
/* something worth keeping: a career started, a bot fitted, a design saved, or a save slot used */
function buHasProgress(){if(S&&(S.career||Object.keys(S.bots||{}).length||Object.keys(S.designs||{}).length))return true;
  for(let i=1;i<=SLOTS;i++){try{if(localStorage.getItem(slotKey(i))!=null)return true;}catch(e){}}return false;}
let buAsked=false;
async function buPersist(){if(buAsked)return;buAsked=true;
  try{const st=navigator.storage;if(!st||!st.persist||!st.persisted)return;if(!(await st.persisted()))await st.persist();}catch(e){}
  buStoreLine();}
function buSaved(){if(!buAsked&&buHasProgress())buPersist();}   // save() calls this after each good write
async function buStoreLine(){const els=document.querySelectorAll("[data-bu-store]");if(!els.length)return;
  let on=null;try{const st=navigator.storage;if(st&&st.persisted)on=await st.persisted();}catch(e){on=null;}
  els.forEach(el=>{el.hidden=on===null;
    el.textContent=on?"Storage: kept safe on this device.":"Storage: your browser may clear saves if the phone runs low. Keep a backup file.";});}
function buMarked(){S.lastBackup=Date.now();save();buPersist();buBarHide();}   // a backup was made: copied code or saved file
async function buSaveFile(){let code="";try{code=buCode();}catch(e){}
  if(!code){toast("Couldn't make a backup code on this device");return;}
  const name=buFileName(),text=code+"\n";
  try{const f=new File([text],name,{type:"text/plain"});
    if(navigator.canShare&&navigator.share&&navigator.canShare({files:[f]})){
      try{await navigator.share({files:[f]});buMarked();toast("Backup file saved.");}
      catch(e){if(!e||e.name!=="AbortError")buDownload(text,name);}   // cancelled: not saved, say nothing
      return;}}catch(e){}
  buDownload(text,name);}
function buDownload(text,name){
  try{const url=URL.createObjectURL(new Blob([text],{type:"text/plain"})),a=document.createElement("a");
    a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);buMarked();toast("Backup file saved: "+name);}
  catch(e){toast("Couldn't save a file here. Use Back up and copy the code instead.");}}
let buInput=null;
function buLoadFile(){
  if(!buInput){buInput=document.createElement("input");buInput.type="file";buInput.accept=".txt,text/plain";buInput.hidden=true;
    buInput.addEventListener("change",()=>{const f=buInput.files&&buInput.files[0];buInput.value="";if(!f)return;
      if(f.size>BU_FILE_MAX){buRestoreFile("");return;}
      const r=new FileReader();r.onload=()=>buRestoreFile(String(r.result||""));r.onerror=()=>buRestoreFile("");r.readAsText(f);});
    document.body.appendChild(buInput);}
  buInput.click();}
/* the file's text goes through the Restore sheet: same checks, same errors, same confirm as a pasted code */
function buRestoreFile(text){buRestoreOpen();const ta=$("codeIn"),err=$("codeErr");text=String(text).trim();ta.value=text;
  if(!text){err.textContent=BU_MSG.notcode;return;}
  buRestore(text,err);}
/* the reminder bar (same look as the "New version ready" bar) */
let buBar=null,buReminded=false;
function buBarHide(){if(buBar)buBar.classList.remove("on");}
function buRemind(){
  if(buReminded||$("boot")||sheetOn()||!$("intro").hidden||!buHasProgress())return;
  const pb=$("pwaBar");if(pb&&pb.classList.contains("on"))return;   // not now: the next calm moment tries again
  const last=buNum(S.lastBackup)?S.lastBackup:0,days=last?Math.floor((Date.now()-last)/864e5):Infinity;
  if(days<BU_REMIND_DAYS)return;
  buReminded=true;
  if(!buBar){buBar=document.createElement("div");buBar.id="buBar";buBar.setAttribute("role","status");
    buBar.innerHTML='<span id="buBarMsg"></span><button type="button" class="btn sm pri" id="buBarGo">Saves</button><button type="button" class="pwalater" id="buBarLater" aria-label="Dismiss until next visit">Later</button>';
    ($("app")||document.body).appendChild(buBar);
    $("buBarLater").addEventListener("click",buBarHide);
    $("buBarGo").addEventListener("click",()=>{buBarHide();showTab("shop");
      const c=$("savesCard");if(c)c.scrollIntoView({block:"center",behavior:reduced()?"auto":"smooth"});});}
  $("buBarMsg").textContent=last?`Last backup ${days} days ago.`:"No backup of this game yet.";
  buBar.classList.add("on");}
if(typeof document!=="undefined"){   // (check-savecode.js loads this file in node, with no page)
  document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-bu]");if(!b)return;
    if(b.dataset.bu==="file")buSaveFile();else if(b.dataset.bu==="load")buLoadFile();});
  $("tabs").addEventListener("click",()=>setTimeout(buRemind,700));
  window.addEventListener("load",()=>setTimeout(buRemind,4000));
  buStoreLine();}
