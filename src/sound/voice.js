<script>
/* ===================== Scrapline: the voices (SCRAP_VOICE) =====================
   The commentary pack (0.1.16): Duncan Steiner on the PA (the announcer) and Jess Moser on Radio Velmark (the commentator),
   one ElevenLabs take per line in sounds/voice/, listed in VOICE_LINES (sound/voicelines.js, built from the sheet by
   tools/make-voicelines.js). Voice reads the fight; it never writes to it, and nothing here is in SCRAP_SIM.
     load()            the first time the Fight tab opens (app/fight.js ftRender): fetch the clips, the announcer's core calls
                       first (countdowns, result calls), four at a time, from VOICE_CDN with sounds/voice/ as the fallback. Kept as MP3 bytes and decoded when needed (the last
                       ~20 decoded stay), so a phone holds ~6 MB, not ~60. A clip that fails is skipped. Every tier.
     set(o)            the app's settings: {sound, voice, comm, captions} (Settings: Sound, Voices, Commentary, Captions)
     intro(cues, done) before a fight: the announcer's calls back to back (venue, event, class, names, the countdown);
                       done() when the last ends or skip() is pressed. false (and no wait) when nothing can play: muted, or
                       nothing decoded yet. The app holds the fight until done (the clock reads full and nothing moves).
     begin(F, o)       a fight (or a replay) starts: o {speed, replay, rivals: {bot index: RIVALS id}, kind: "duel" | "rumble" | "tag"}
     tick(F, speed)    after the app's sim steps: new F.log entries and the bots' state become calls (below)
     end(F, o)         the bell: the result calls (see endCues); o {kind, bout: {me, them, over} | null, extra: [cues]}
     seq(cues, o)      calls back to back now (o.queue: after what's playing; o.soon: only if it can start soon) — the pit
                       window, the post-mortem
     say(cue)          one call now
     stop(), skip()    silence (a pause, leaving the tab); skip ends an intro early and calls its done()
     onCap             set by the app: (text, who) for a caption, shown when sound or voices are off (Settings → Captions)
   The director (tick) runs on fight time: a clip of d seconds at replay speed s fills d x s seconds of the fight, the
   commentator speaks at most once every 3 s (of real time), never over the announcer, and the announcer's mid-fight
   calls (the count, the pit opening) wait for the commentator to finish. Pools pick with SCRAP_SIM.rng streams seeded
   from the fight's seed, never Math.random, and skip the last few lines said: the same fight at the same speed says the
   same lines, so two replays match. Captions run off the same calls, so a muted phone gets the same commentary.
   One voice at a time (0.1.56.1): every clip goes through one channel (play), which starts it only when the clip before
   has ended on the audio clock; sequences time each line off the real end of the last; and a sequence started during a
   fight (the replay's opening line) makes the live calls wait for it. tools/voice-test.js plays it all on a fake clock. */
const SCRAP_VOICE=(function(){
"use strict";
const L=typeof VOICE_LINES!=="undefined"?VOICE_LINES:{},POOL={};
for(const id of Object.keys(L).sort()){const q=L[id].q;(POOL[q]||(POOL[q]=[])).push(id);}
const COOL=3,GAP=0.25;   // seconds between commentator barks; a little air after any line (both in real time)
/* keeping time (0.1.56.1), all in real seconds. INTRO_MAX: the longest the announcer's intro may hold a fight; the calls
   marked optional ({opt: cue}) are left out, a different pick each event day, until it fits (the venue, the event, the
   names and the countdown always play, and so does the once-a-career call for moving up an act, which can run it over). LATE: a live call that would have to wait longer
   than this for the line before it is dropped, not stacked up. PM_WAIT: the post-mortem line is left out when the
   bell's calls would keep it waiting longer than this. */
const INTRO_MAX=24,LATE=0.9,PM_WAIT=12;
/* the announcer's core calls load first */
const CORE=["countdown","end:ko","end:pit","end:judges","reveal","draw","win","lose","name:you","count","pitopen","pitwin","pit10","pitclose","bo3:lead","bo3:trail","bo3:decider","rumble:won","tag:won"];
const O={sound:true,voice:true,comm:true,captions:"muted"};
const P={started:false,bytes:{},buf:new Map(),src:[],queue:[],qT:0,introDone:null,introT:0,tok:0,endAt:0,qBusy:false,qUntil:0};
let D=null;   // the director's fight

/* ---- the player ---- */
function audioOn(){return O.sound!==false&&O.voice!==false;}
/* where the clips come from: Longlight's asset host first (Cloudflare R2, 0.1.17.2), the page's own sounds/voice/ copy as the
   fallback. Per clip, any failure there (no network, a non-OK status, a CORS refusal, bytes that aren't MP3, a decode that
   fails) fetches the local copy instead, and the first failure sends the rest of the visit straight to local, so a blocked
   host never doubles every request. Change VOICE_CDN to move the host ("" = local only). */
const VOICE_CDN="https://assets.longlight.games/scrapline/voice/",VOICE_LOCAL="sounds/voice/";
P.from={};P.cdnDead=!VOICE_CDN;
/* MP3 bytes start with an ID3 tag or a frame sync; an error page from a misbehaving host does not */
function isMp3(a){const b=new Uint8Array(a,0,Math.min(3,a.byteLength));return b.length>=3&&((b[0]===0x49&&b[1]===0x44&&b[2]===0x33)||(b[0]===0xFF&&(b[1]&0xE0)===0xE0));}
function getBytes(url){return fetch(url).then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status)).then(a=>isMp3(a)?a:Promise.reject("not mp3"));}
function fetchLocal(id){return getBytes(VOICE_LOCAL+L[id].f).then(a=>{P.bytes[id]=a;P.from[id]="local";}).catch(()=>{});}
function fetchClip(id){if(P.cdnDead)return fetchLocal(id);
  return getBytes(VOICE_CDN+L[id].f).then(a=>{P.bytes[id]=a;P.from[id]="cdn";},()=>{P.cdnDead=true;return fetchLocal(id);});}
function load(){if(P.started||typeof fetch!=="function"||!Object.keys(L).length)return;P.started=true;
  const ids=Object.keys(L),core=new Set();for(const q of CORE)for(const id of POOL[q]||[])core.add(id);
  const list=[...core].concat(ids.filter(id=>!core.has(id)&&L[id].c==="c"&&!/^pm:/.test(L[id].q)),ids.filter(id=>!core.has(id)&&(L[id].c==="a"||/^pm:/.test(L[id].q))));
  const seen=new Set(),order=list.filter(id=>!seen.has(id)&&seen.add(id));let at=0;
  const next=()=>{if(at>=order.length)return;const id=order[at++];fetchClip(id).then(next);};
  /* the first clip goes alone, so a blocked asset host costs one failed request, not four; then four at a time */
  if(order.length)fetchClip(order[at++]).then(()=>{for(let k=0;k<4;k++)next();});}
/* a decoded clip: cb(AudioBuffer) at once when it's decoded, else after decoding (the callback form of decodeAudioData:
   older Safari returns no promise), or cb(null) */
function decoded(id,cb){const b=P.buf.get(id);if(b){P.buf.delete(id);P.buf.set(id,b);cb(b);return;}
  const io=typeof SCRAP_SOUND!=="undefined"&&SCRAP_SOUND.voiceBus?SCRAP_SOUND.voiceBus():null,raw=P.bytes[id];
  if(!io||!raw){cb(null);return;}
  /* a clip from the asset host that won't decode: drop it, fetch the local copy for next time, and use local from now on */
  const bad=()=>{if(P.from[id]==="cdn"){P.cdnDead=true;delete P.bytes[id];P.from[id]="retry";fetchLocal(id);}cb(null);};
  try{const pr=io.ctx.decodeAudioData(raw.slice(0),buf=>{P.buf.set(id,buf);while(P.buf.size>20)P.buf.delete(P.buf.keys().next().value);cb(buf);},bad);if(pr&&pr.catch)pr.catch(()=>{});}catch(e){bad();}}   // the promise newer browsers also return is caught: the callbacks did the work
function cap(id){const x=L[id];if(!x||O.captions==="off"||audioOn()||!P.onCap)return;P.onCap(x.t,x.c);}
/* play one line; false when it can't (muted, not loaded yet). The caption shows instead when muted.
   There is one voice channel: a clip never starts before the one ahead of it has ended (P.endAt, on the audio clock), so
   two lines can't be heard at once however late a decode lands or however the replay speed changes mid-line. A queued
   line (at 0) waits its turn; a live call (at null) waits up to LATE seconds and is dropped past that, the moment gone.
   done(seconds until this clip ends, 0 when it didn't play) is for the queue, which times the next line off it. */
function play(id,at,done){const x=L[id],no=()=>{if(done)done(0);};if(!x)return false;if(x.c==="c"&&O.comm===false)return false;
  if(!audioOn()){cap(id);return false;}
  const t0=typeof performance!=="undefined"?performance.now():0,tok=P.tok;
  decoded(id,buf=>{if(!buf||tok!==P.tok)return no();   // tok: a stop (pause, skip, a newer sequence) since this was asked for
    const late=(typeof performance!=="undefined"?performance.now():0)-t0;
    const io=SCRAP_SOUND.voiceBus();if(!io)return no();const now=io.ctx.currentTime,free=Math.max(now,P.endAt);
    if(at==null&&(late>600||free-now>LATE))return no();   // a late decode, or the line before still has a while to run
    const s=io.ctx.createBufferSource(),g=io.ctx.createGain();s.buffer=buf;
    g.gain.value=x.c==="a"?1:0.92;s.connect(g);g.connect(io.out);const when=Math.max(free,at||0);s.start(when);P.endAt=when+buf.duration;
    SCRAP_SOUND.talk(P.endAt);P.src.push(s);s.onended=()=>{const i=P.src.indexOf(s);if(i>=0)P.src.splice(i,1);};
    if(done)done(P.endAt-now);});
  return true;}
function stopAll(){for(const s of P.src)try{s.stop();}catch(e){}P.src=[];P.queue=[];P.introTok=null;P.tok++;P.endAt=0;P.qBusy=false;P.qUntil=0;if(P.qTimer){clearTimeout(P.qTimer);P.qTimer=0;}}

/* ---- picks: a seeded stream per fight, skipping the last few lines said ---- */
function pickFrom(R,recent,cues){for(const q of cues){const ids=POOL[q];if(!ids||!ids.length)continue;
    const fresh=ids.filter(id=>recent.indexOf(id)<0);if(!fresh.length&&q!==cues[cues.length-1])continue;   // a narrow line just said: fall back to the wider pool
    const from=fresh.length?fresh:ids,id=from[Math.floor(R()*from.length)%from.length];recent.push(id);if(recent.length>6)recent.shift();return id;}
  return null;}
const RNG=s=>typeof SCRAP_SIM!=="undefined"?SCRAP_SIM.rng(s>>>0):(()=>{let a=s>>>0;return()=>((a=(a*16807)%2147483647)/2147483647);})();
let SQ={R:RNG(0x5EC0),recent:[]};   // sequences (intros, results, the pit): reseeded per fight

/* ---- sequences: lines back to back, in real time ---- */
/* cues -> line ids. A cue is a name, a list of names (the first with a line wins), or {opt: either} for a call that may
   be left out ({opt, alt}: with a short call that stands in for it, a rival's name for the rival's introduction). With
   max (seconds), optional calls are kept only while the whole sequence fits: they are tried in a seeded-shuffled order,
   so which ones are heard changes from one event day to the next and every line gets its turn. */
function seqIds(cues,max){const got=[],one=q=>pickFrom(SQ.R,SQ.recent,Array.isArray(q)?q:[q]);let tot=0;
  for(const c of cues){const opt=!!(c&&c.opt),id=one(opt?c.opt:c);if(!id)continue;const g={id,opt,alt:opt&&c.alt&&max!=null?one(c.alt):null};got.push(g);
    tot+=opt?(g.alt?L[g.alt].d+GAP:0):L[id].d+GAP;}
  const opts=got.filter(g=>g.opt);
  if(max!=null){for(let i=opts.length-1;i>0;i--){const j=Math.floor(SQ.R()*(i+1))%(i+1),t=opts[i];opts[i]=opts[j];opts[j]=t;}
    for(const g of opts){const d=L[g.id].d-(g.alt?L[g.alt].d:-GAP);if(tot+d<=max){tot+=d;g.opt=false;}else if(g.alt){g.id=g.alt;g.opt=false;}}}
  return got.filter(g=>max==null||!g.opt).map(g=>g.id);}
/* how long a queued line takes: its clip and a little air; muted, the time its caption gets; nothing when it can't play */
const canHear=id=>!(L[id].c==="c"&&O.comm===false)&&audioOn()&&!!(P.bytes[id]||P.buf.has(id));
const secsOf=id=>L[id].c==="c"&&O.comm===false?0:audioOn()?(canHear(id)?L[id].d+GAP:0):Math.min(1.5,L[id].d*0.5);
const clock=()=>typeof performance!=="undefined"?performance.now():0;
/* the next line starts when the one before has really ended: the clip reports its own end once it is decoded and
   scheduled (the timer set first is only a backstop, in case a decode never answers) */
function runQueue(){P.qTimer=0;const id=P.queue.shift();if(!id){P.qBusy=false;P.qUntil=0;if(P.introDone){const d=P.introDone;P.introDone=null;d();}return;}
  const x=L[id];P.qBusy=true;
  if(canHear(id)){const tok=P.tok;P.qTimer=setTimeout(runQueue,(x.d+GAP+1.5)*1000);
    play(id,0,secs=>{if(tok!==P.tok)return;clearTimeout(P.qTimer);P.qTimer=setTimeout(runQueue,secs>0?(secs+GAP)*1000:0);});}
  else{if(!(x.c==="c"&&O.comm===false))cap(id);P.qTimer=setTimeout(runQueue,secsOf(id)*1000);}}
/* o.queue: after what's playing (else it cuts in); o.soon: only if it can start within PM_WAIT seconds; o.max: see seqIds.
   During a fight the director is told how long the sequence runs, so the live calls wait for it. */
function seq(cues,o){o=o||{};const ids=seqIds(cues,o.max);if(!ids.length)return 0;
  if(!o.queue){const d=P.introDone;P.introDone=null;stopAll();if(d)d();}
  else if(o.soon&&P.qBusy&&P.qUntil-clock()>PM_WAIT*1000)return 0;
  const secs=ids.reduce((a,id)=>a+secsOf(id),0);P.qUntil=Math.max(P.qUntil,clock())+secs*1000;
  if(D&&D.F&&!D.F.over)D.annUntil=Math.max(D.annUntil,D.F.t+(P.qUntil-clock())/1000*D.speed);
  P.queue.push(...ids);if(!P.qBusy)runQueue();return ids.reduce((a,id)=>a+L[id].d+GAP,0);}
function say(cue){return seq([cue],{queue:true});}
/* before a fight: hold only when at least one of the calls is decoded and can be heard. Trimmed to INTRO_MAX. */
function introIds(cues){return seqIds(cues,INTRO_MAX);}
function intro(cues,done){stopAll();P.introDone=null;const ids=introIds(cues).filter(id=>audioOn()&&P.bytes[id]&&!(L[id].c==="c"&&O.comm===false));
  if(!ids.length||!(typeof SCRAP_SOUND!=="undefined"&&SCRAP_SOUND.voiceBus&&SCRAP_SOUND.voiceBus()))return false;
  P.introDone=done;const tok={};P.introTok=tok;   // set now, so Skip, Pause or a newer intro cancels a start still waiting on decodes
  let n=ids.length,go=false;const start=()=>{if(go||P.introTok!==tok||P.introDone!==done)return;go=true;P.queue=ids.slice();P.qUntil=clock()+ids.reduce((a,id)=>a+L[id].d+GAP,0)*1000;runQueue();};
  for(const id of ids)decoded(id,()=>{if(--n<=0)start();});setTimeout(start,1200);   // decode first (a smooth countdown), but never wait long
  return true;}
function skip(){const d=P.introDone;P.introDone=null;stopAll();if(d)d();}
function stop(){skip();}

/* ---- the director: the live calls ---- */
const N=v=>v==null?null:v;
function begin(F,o){o=o||{};SQ={R:RNG((F.seed^0x5EC0)>>>0),recent:[]};
  D={F,R:RNG((F.seed^0x701CE)>>>0),recent:[],n:0,annUntil:0,commUntil:0,lastBark:-99,speed:o.speed||1,kind:o.kind||"duel",rivals:o.rivals||{},
    still:{},stillBark:{},finalSaid:false,startSaid:false,half:false,late:false,help:false,dealt:{},run:{a:-1,n:0,t:0},lead:null,behind:false,pend:null,replay:!!o.replay};
  if(o.replay)D.lastBark=0;}
/* a seek in a replay: carry on from here without calling what's already happened */
function seek(F){if(!D)return;D.F=F;D.n=F.log.length;D.annUntil=D.commUntil=F.t;D.lastBark=F.t;D.pend=null;}
const mainOf=F=>F.bots.filter(o=>!o.mini);
function liveCands(F,e,mm){const out=[],En=(e.E||0)/mm,a=e.a!=null?F.bots[e.a]:null,v=e.v!=null&&e.v>=0?F.bots[e.v]:null;
  const C=(pri,...cues)=>out.push({who:"c",pri,cues});
  switch(e.k){
    case"hit":case"grind":if(e.gl){if(En>=15)C(3,"c:gl");break;}
      if(e.pb&&e.k==="hit")C(6,"c:fail:armour","c:hit");
      else if(En>=40){const wh=(e.x||[]).some(p=>/^wheel/.test(p[0]));C(6,...(wh?["c:hit:wheels"]:(e.f==="left"||e.f==="right")&&D.R()<0.5?["c:hit:side"]:[]),"c:hit");}break;
    case"ram":case"wall":if(En>=30)C(3,e.k==="wall"?"c:ram:wall":"c:ram","c:ram");break;
    case"under":C(4,...(a&&a.mini?["c:mini:under"]:[]),"c:under");break;
    case"lift":C(4,"c:lift");break;
    case"drop":case"release":C(4,"c:release");break;
    case"flip":if(e.v>=0)C(e.heavy?5:7,e.heavy?"c:heavy":"c:flip");break;
    case"tip":if(e.inv)C(6,"c:flip");break;
    case"self":if(e.what==="flip")C(8,"c:self");else if(e.what==="shear")C(8,"c:fail:weapon");break;
    case"inv":C(e.inv?6:5,e.inv?"c:inv":"c:right");break;
    case"right":C(5,"c:right");break;
    case"heat":C(3,e.what==="drive"?"c:heat:drive":"c:heat:weapon");break;
    case"haz":if(e.what==="flame"){if(e.n)C(5,"c:haz");}else C(5,e.what==="pusher"?"c:haz:pusher":"c:haz:spinner","c:haz");break;
    case"pitopen":out.push({who:"a",pri:7,cues:["pitopen"],alt:["c:pitopen"]});break;
    case"pit":if(!F.over)C(8,"c:pit");break;
    case"fail":switch(e.what){
      case"shock":C(9,"c:fail:shock");break;case"esc":C(8,"c:fail:esc");break;case"flat":C(7,"c:fail:flat");break;case"cell":C(7,"c:fail:cell");break;
      case"weapon":C(8,"c:fail:weapon");break;
      case"part":if(e.key&&/^wheel/.test(e.key))C(7,"c:fail:wheel");else if(e.key==="weapon")C(8,"c:fail:weapon");break;}break;}
  /* momentum: the hits each side lands */
  if((e.k==="hit"||e.k==="grind")&&a&&v&&a.team!==v.team&&!e.gl){D.dealt[a.team]=(D.dealt[a.team]||0)+(e.E||0);
    if(En>=25){if(D.run.a===a.team&&e.t-D.run.t<15)D.run.n++;else D.run={a:a.team,n:1,t:e.t};D.run.t=e.t;if(D.run.n===3)C(6,"c:swing:run");}}
  return out;}
function tick(F,speed){if(!D||D.F!==F)return;const t=F.t,s=speed||D.speed||1,mm=Math.max(F.M.mass,1e-6),cands=[];D.speed=s;
  for(;D.n<F.log.length;D.n++)cands.push(...liveCands(F,F.log[D.n],mm));
  if(F.over){D.pend=null;return;}
  const M=mainOf(F),alive=M.filter(o=>!o.out);
  /* the count: once per bot per 15 s; Jess wonders aloud at 5 s */
  for(const o of M){if(o.out)continue;if(o.immobileS>=1&&!(D.still[o.i]>t-15)){D.still[o.i]=t;cands.push({who:"a",pri:8,cues:["count"]});}
    if(o.immobileS>=5&&!(D.stillBark[o.i]>t-15)){D.stillBark[o.i]=t;cands.push({who:"c",pri:4,cues:["c:still"]});}}
  if(!D.startSaid&&t>=2.5&&!D.replay){D.startSaid=true;const mini=F.bots.some(o=>o.mini);
    cands.push({who:"c",pri:2,cues:mini?["c:mini"]:D.kind==="rumble"?["c:rumble"]:D.kind==="tag"?["c:tag"]:["c:start"]});}
  if(!D.finalSaid&&F.rules.roundS-t<=10&&alive.length>1){D.finalSaid=true;cands.push({who:"c",pri:5,cues:["c:final"]});}
  if(D.kind==="rumble"){if(!D.half&&M.length>=4&&M.length-alive.length===2){D.half=true;cands.push({who:"c",pri:6,cues:["c:rumble:half"]});}
    if(!D.late&&t>=45){D.late=true;cands.push({who:"c",pri:2,cues:["c:rumble:late","c:rumble"]});}}
  if(D.kind==="tag"&&!D.help){const me=F.bots[0],mate=M.find(o=>o!==me&&o.team===me.team);if(mate&&(mate.out||mate.immobileS>=2)){D.help=true;cands.push({who:"c",pri:5,cues:["c:tag:help","c:tag"]});}}
  /* a swing: the side that was well behind on damage dealt takes the lead, after the first 20 s */
  const tm=Object.keys(D.dealt);if(tm.length>=2&&t>20){const top=tm.sort((x,y)=>D.dealt[y]-D.dealt[x]),lead=top[0],r=D.dealt[top[0]]/Math.max(1,D.dealt[top[1]]);
    if(D.lead!=null&&lead!==D.lead&&D.behind){D.behind=false;cands.push({who:"c",pri:5,cues:["c:swing"]});}
    if(r>1.6)D.behind=true;D.lead=lead;}
  /* the announcer first (a call waits up to 2 s for the commentator to finish), then one bark */
  let ann=null,com=null;for(const c of cands){if(c.who==="a"){if(!ann||c.pri>ann.pri)ann=c;}else if(!com||c.pri>com.pri)com=c;}
  if(ann&&(!D.pend||ann.pri>=D.pend.pri))D.pend=Object.assign({at:t},ann);
  const comOn=O.comm!==false;
  if(D.pend){if(t-D.pend.at>2*s){if(D.pend.alt&&!com)com={who:"c",pri:D.pend.pri,cues:D.pend.alt};D.pend=null;}
    else if(t>=D.annUntil&&(!comOn||t>=D.commUntil)){const id=pickFrom(D.R,D.recent,D.pend.cues);D.pend=null;if(id){play(id);D.annUntil=t+(L[id].d+GAP)*s;return;}}}
  if(com&&t>=D.annUntil&&t>=D.commUntil&&t-D.lastBark>=COOL*s&&!D.pend){const id=pickFrom(D.R,D.recent,com.cues);if(id){play(id);D.lastBark=t;if(comOn)D.commUntil=t+(L[id].d+GAP)*s;}}}

/* ---- the bell ---- */
function nameCue(F,i){const o=F.bots[i];if(!o)return null;if(o.i===0)return"name:you";const rv=D&&D.rivals[i];if(rv&&POOL["name:rv:"+rv])return"name:rv:"+rv;
  return POOL["name:"+o.name]?"name:"+o.name:"name:tag";}
function endCues(F,o){o=o||{};const kind=o.kind||(D&&D.kind)||"duel",me=F.bots[0],won=F.winner!=null&&F.winner===me.team,why=F.reason,out=[];
  if(why==="stopped")return out;
  if(why==="judges"){out.push("end:judges");const sc=F.judge&&F.judge.scores,ks=sc?Object.keys(sc):[];
    if(ks.length===2){const [x,y]=ks,ag=sc[x].aggression>sc[y].aggression?x:y,dm=sc[x].damage>sc[y].damage?x:y,ct=sc[x].control>sc[y].control?x:y,ctrlBig=Math.abs(sc[x].control-sc[y].control)>=8;
      out.push(ag!==dm?["c:judges:split","c:judges"]:ctrlBig&&ct===String(F.winner)?["c:judges:control","c:judges"]:["c:judges"]);}
    out.push("reveal");const wi=F.bots.findIndex(b=>!b.mini&&b.team===F.winner);const nc=nameCue(F,wi);if(nc)out.push(nc);}
  else if(why==="draw"){if(F.judge)out.push("draw");}
  else if(kind==="rumble"&&F.winner!=null)out.push("rumble:won");
  else if(kind==="tag"&&F.winner!=null)out.push("tag:won");
  else out.push(why==="pit"?"end:pit":"end:ko");
  if(why!=="judges"&&why!=="draw"&&F.winner!=null&&kind==="duel")out.push(won?"win":"lose");
  const B=o.bout;if(B&&!B.over&&B.me+B.them===1)out.push(B.me?"bo3:lead":"bo3:trail");
  for(const x of o.extra||[])out.push(x);
  if(B&&B.over){if(B.me!==B.them)out.push(B.me>B.them?"c:win":"c:lose");}   // a best of three: the bout's result, and nothing for a drawn bout
  else if(F.winner!=null&&!B)out.push(won?"c:win":"c:lose");
  return out;}
function end(F,o){if(D)D.pend=null;const cues=endCues(F,o);return cues.length?seq(cues):0;}

return{load,set(o){Object.assign(O,o||{});if(!audioOn()){for(const s of P.src)try{s.stop();}catch(e){}P.src=[];P.endAt=0;}},intro,skip,stop,begin,seek,tick,end,endCues,seq,say,
  get onCap(){return P.onCap;},set onCap(f){P.onCap=f;},
  get loaded(){return Object.keys(P.bytes).length;},get sources(){const n={cdn:0,local:0};for(const id in P.bytes)n[P.from[id]==='cdn'?'cdn':'local']++;return n;},get total(){return Object.keys(L).length;},pool:q=>(POOL[q]||[]).slice(),
  introIds,INTRO_MAX,LATE,PM_WAIT,GAP,
  _d:()=>D,_pick:(cues)=>D?pickFrom(D.R,D.recent,cues):null};
})();
</script>
