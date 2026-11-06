<script>
/* ===================== Scrapline: sound (SCRAP_SOUND) =====================
   Web Audio, synthesized; on Full / Ultra a few recorded clangs layer on top. The app calls these; the synth never reads game state.
     unlock()            on the first tap or key (browsers only start audio after a gesture)
     hit(e, kind)        a clang: a noise burst through a band-pass plus three inharmonic partials, louder and lower
                         the harder the hit (e 0..1, already scaled by the app for the class); kind "wall" and "land"
                         are duller, "haz" adds a thump. At most ~14 a second.
     whine(i, w, d)      bot i's motors: w the weapon's share of full speed (a rising saw whine), d the drive's share of
                         top speed (a low hum). Smoothed, so the app can call it a few times a second.
     stop()              fade everything out (a fight ends, the tab is left, Settings turns sound off), then suspend
     samples(on)         the graphics tier says Full or Ultra (app/state.js applyGfx): recorded one-shots from sounds/ (CC0, credited
                         in sounds/CREDITS.md) are fetched and decoded once, after the first tap, and each hit plays one variant over
                         a quieter synth clang. Kinds: hit, big (a hit over 0.6), wall, land, haz, part (a part torn off; recorded
                         only, the synth has no voice for it). Lite never fetches them and sounds exactly as before. A clip that
                         fails to load is skipped and the synth plays alone. */
const SCRAP_SOUND=(function(){
"use strict";
let ctx=null,master=null,noise=null,lastHit=0,hits=0,sleepT=0;const motors=[];
/* recorded one-shots: kind -> clip ids in sounds/ (file id + ".mp3"); buf holds the decoded ones */
const SAMP={on:false,started:false,buf:{},sets:{hit:["hit1","hit2","hit3","hit4"],big:["big1","big2","big3","big4"],wall:["wall1","wall2","wall3"],
  land:["land1","land2","land3"],haz:["haz1","haz2"],part:["part1","part2"]}};
function sampLoad(){if(SAMP.started||!SAMP.on||!ctx||typeof fetch!=="function")return;SAMP.started=true;
  for(const k in SAMP.sets)for(const id of SAMP.sets[k])fetch("sounds/"+id+".mp3").then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status))
    .then(a=>new Promise((res,rej)=>ctx.decodeAudioData(a,res,rej)))   // the callback form: older Safari has no promise from decodeAudioData
    .then(b=>{SAMP.buf[id]=b;}).catch(()=>{});}
/* one variant of a kind at volume v; false when none is decoded yet (the synth then plays at full strength) */
function sampPlay(kind,v,e,t){if(!SAMP.on)return false;const ids=(SAMP.sets[kind]||[]).filter(id=>SAMP.buf[id]);if(!ids.length)return false;
  const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=SAMP.buf[ids[Math.random()*ids.length|0]];
  s.playbackRate.value=(0.92+Math.random()*0.16)*(1.08-0.16*e);g.gain.value=Math.min(1,v*1.25);s.connect(g);g.connect(master);s.start(t);return true;}
/* after stop() the context is suspended (no idle oscillators burning battery); the next hit or whine wakes it */
function awake(){if(!ctx)return false;if(sleepT){clearTimeout(sleepT);sleepT=0;}if(ctx.state==="suspended"){ctx.resume().catch(()=>{});return false;}return ctx.state==="running";}
function unlock(){if(ctx){if(ctx.state==="suspended")ctx.resume().catch(()=>{});return;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  try{ctx=new AC();}catch(e){ctx=null;return;}
  master=ctx.createGain();master.gain.value=0.55;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=6;master.connect(comp);comp.connect(ctx.destination);
  const n=ctx.sampleRate*0.6|0,buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0);let s=22222;
  for(let i=0;i<n;i++){s=(s*16807)%2147483647;d[i]=s/1073741823.5-1;}noise=buf;sampLoad();}
function hit(e,kind){if(kind==="part"&&!SAMP.on)return;if(!awake())return;const t=ctx.currentTime;
  if(t-lastHit<0.07){if(++hits>3)return;}else hits=0;lastHit=t;
  e=Math.max(0.03,Math.min(1,e||0));const dull=kind==="wall"||kind==="land",vol=0.12+0.6*e;
  const rec=sampPlay(kind==="hit"||kind==="flip"||!SAMP.sets[kind]?(e>0.6?"big":"hit"):kind,vol,e,t);
  if(kind==="part")return;
  const sv=rec?0.45:1;   // under a recording the synth only adds body
  const src=ctx.createBufferSource();src.buffer=noise;src.playbackRate.value=0.8+Math.random()*0.4;   // the synth isn't part of the sim: Math.random is fine here
  const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=dull?600:1800-900*e;bp.Q.value=dull?0.7:1.4;
  const g=ctx.createGain();g.gain.setValueAtTime(vol*sv,t);g.gain.exponentialRampToValueAtTime(0.0008,t+(dull?0.12:0.08+0.2*e));
  src.connect(bp);bp.connect(g);g.connect(master);src.start(t);src.stop(t+0.4);
  if(!dull){const base=380+500*(1-e);for(const [m,a] of [[1,1],[2.76,0.5],[5.4,0.25]]){const o=ctx.createOscillator(),og=ctx.createGain();o.type="sine";o.frequency.value=base*m;
      og.gain.setValueAtTime(vol*0.35*a*sv,t);og.gain.exponentialRampToValueAtTime(0.0005,t+0.15+0.5*e/m);o.connect(og);og.connect(master);o.start(t);o.stop(t+0.8);}}
  if(kind==="haz"||e>0.6){const o=ctx.createOscillator(),og=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(40,t+0.2);
    og.gain.setValueAtTime(vol*0.8,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.25);o.connect(og);og.connect(master);o.start(t);o.stop(t+0.3);}}
function motor(i){if(motors[i])return motors[i];const w=ctx.createOscillator(),wf=ctx.createBiquadFilter(),wg=ctx.createGain(),d=ctx.createOscillator(),dg=ctx.createGain();
  w.type="sawtooth";wf.type="lowpass";wf.frequency.value=2400;w.connect(wf);wf.connect(wg);wg.connect(master);wg.gain.value=0;
  d.type="triangle";d.connect(dg);dg.connect(master);dg.gain.value=0;w.start();d.start();
  return motors[i]={w,wf,wg,d,dg};}
function whine(i,ws,ds){if(!awake())return;const m=motor(i),t=ctx.currentTime,k=i===0?1:0.6;
  ws=Math.max(0,Math.min(1,ws||0));ds=Math.max(0,Math.min(1,ds||0));
  m.w.frequency.setTargetAtTime(90+ws*820+i*23,t,0.15);m.wg.gain.setTargetAtTime(ws>0.02?0.035*k*(0.3+0.7*ws):0,t,0.12);
  m.d.frequency.setTargetAtTime(55+ds*90+i*7,t,0.1);m.dg.gain.setTargetAtTime(ds>0.05?0.05*k*ds:0,t,0.1);}
function stop(){if(!ctx)return;const t=ctx.currentTime;for(const m of motors)if(m){m.wg.gain.setTargetAtTime(0,t,0.08);m.dg.gain.setTargetAtTime(0,t,0.08);}
  if(sleepT)clearTimeout(sleepT);sleepT=setTimeout(()=>{sleepT=0;if(ctx&&ctx.state==="running")ctx.suspend().catch(()=>{});},600);}
const gesture=()=>unlock();
for(const ev of ["pointerdown","touchend","click","keydown"])window.addEventListener(ev,gesture,{passive:true});
function samples(on){SAMP.on=!!on;sampLoad();}
return{get ready(){return!!ctx&&ctx.state==="running";},get loaded(){return Object.keys(SAMP.buf).length;},unlock,hit,whine,stop,samples};
})();
</script>
