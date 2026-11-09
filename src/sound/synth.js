<script>
/* ===================== Scrapline: sound (SCRAP_SOUND) =====================
   Web Audio, synthesized; on Full / Ultra a few recorded clangs layer on top; Kelbo's ElevenLabs effects and crowd beds
   (sounds/sfx/) play over it, some on every tier. The app calls these; the synth never reads game state.
     unlock()            on the first tap or key (browsers only start audio after a gesture)
     hit(e, kind)        a clang: a noise burst through a band-pass plus three inharmonic partials, louder and lower
                         the harder the hit (e 0..1, already scaled by the app for the class); kind "wall" and "land"
                         are duller, "haz" adds a thump. At most ~14 a second.
     whine(i, w, d)      bot i's motors: w the weapon's share of full speed (a rising saw whine), d the drive's share of
                         top speed (a low hum). Smoothed, so the app can call it a few times a second.
     stop()              fade everything out (a fight ends, the tab is left, Settings turns sound off), then suspend
     voiceBus()          for SCRAP_VOICE (sound/voice.js): {ctx, out}, out a gain straight to the speakers (the voices skip the
                         clangs' compressor), waking a suspended context; null before the first tap
     talk(until)         a voice line plays until ctx time `until`: the clangs and motors duck under it, and stop() won't
                         suspend the context before it ends (the result call outlives the fight)
     samples(on)         the graphics tier says Full or Ultra (app/state.js applyGfx): recorded one-shots from sounds/ (CC0, credited
                         in sounds/CREDITS.md) are fetched and decoded once, after the first tap, and each hit plays one variant over
                         a quieter synth clang. Kinds: hit, big (a hit over 0.6), wall, land, haz, part (a part torn off; recorded
                         only, the synth has no voice for it). Lite never fetches them and sounds exactly as before. A clip that
                         fails to load is skipped and the synth plays alone.
     sfx(id, v)          one ElevenLabs effect from sounds/sfx/ (0.1.17.1; Kelbo's, credited in sounds/CREDITS.md) at volume v (0..1);
                         returns false when it isn't decoded yet or the tier doesn't play it. Every tier: the crowd's cheer, ooh,
                         groan, clap; the bell, the pit opening; the workshop's ratchet, drill, clamp, charger. Full / Ultra only
                         (with samples(on), like the clangs): spin-ups (spin_h, spin_v, spin_drum, spin_saw, spin_under), flip,
                         fliphp, hammer, lifter, crush, the material layers (ply, hdpe, ti, ar, tyre), scrape, snap, bend, partoff,
                         thud, land, pusher, floorspin, selfright, powerdown, smoke, and the wheel layouts' (0.1.31): mecanum
                         (rollers whirring into a slide), swerve (the pods snapping round), caster (the caster flipping
                         round as the bot changes direction), and 0.1.32's grab (the grabber's jaws clamping on) and kick
                         (the back-up flipper). The workshop four load on the first tap;
                         the rest when prep() is called; a clip still loading is skipped.
     prep()              the Fight tab opened: fetch the fight's effects (the Full / Ultra ones only on those tiers)
     crowd(id)           the crowd bed under a fight, looped: "club", "reg", "big" or null (fades out). The same id again is a
                         no-op, so the app can call it every overlay update; stop() fades it, the next call brings it back.
                         Each bed is fetched the first time it's asked for. */
const SCRAP_SOUND=(function(){
"use strict";
let ctx=null,master=null,noise=null,lastHit=0,hits=0,sleepT=0,vbus=null,vUntil=0;const motors=[];
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
/* the ElevenLabs pack (sounds/sfx/): id -> variants (1: "<id>.mp3", n: "<id>1.mp3" .. "<id>n.mp3"); ALL plays on every
   tier, FULL only with samples(on); BEDS are the looped crowds. buf holds decoded files, got the ones asked for. */
const FX={buf:{},got:{},last:{},until:0,resting:false,want:false,   // want: prep() was asked for before the first tap

  ALL:{cheer:2,ooh:2,groan:2,clap:2,bell:1,pitopen:1,ratchet:1,drill:1,clamp:1,charger:1,dial:2},   // dial: a tuning dial clicks a step (0.1.33)
  FULL:{spin_h:1,spin_v:1,spin_drum:1,spin_saw:1,spin_under:1,flip:2,fliphp:1,hammer:2,lifter:1,crush:1,ply:2,hdpe:1,ti:1,ar:1,tyre:2,
    scrape:2,snap:2,bend:2,partoff:2,thud:1,land:2,pusher:1,floorspin:1,selfright:1,powerdown:1,smoke:1,
    mecanum:2,swerve:2,caster:2,grab:2,kick:2},
  BEDS:{club:"crowd_club",reg:"crowd_reg",big:"crowd_big"},WORK:["ratchet","drill","clamp","charger"]};
const fxFiles=(id,n)=>n>1?Array.from({length:n},(_,i)=>id+(i+1)):[id];
function fxGet(f){if(FX.got[f]||!ctx||typeof fetch!=="function")return;FX.got[f]=1;   // got: 1 asked for, -1 failed (only prep() asks again)
  fetch("sounds/sfx/"+f+".mp3").then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status))
    .then(a=>new Promise((res,rej)=>ctx.decodeAudioData(a,res,rej))).then(b=>{FX.buf[f]=b;}).catch(()=>{FX.got[f]=-1;});}
function prep(){FX.want=true;if(!ctx)return;for(const f in FX.got)if(FX.got[f]<0)FX.got[f]=0;/* a failed file: try once more */for(const id in FX.ALL)fxFiles(id,FX.ALL[id]).forEach(fxGet);
  if(SAMP.on)for(const id in FX.FULL)fxFiles(id,FX.FULL[id]).forEach(fxGet);}
/* after stop(), a stinger (the bell, the cheer) may still be ringing: the nap waits for it as it waits for a voice */
function fxDoze(){if(!FX.resting||!ctx)return;if(sleepT)clearTimeout(sleepT);sleepT=setTimeout(nap,600);}
function sfx(id,v){if(!ctx)return false;const n=FX.ALL[id]||(SAMP.on&&FX.FULL[id]);if(!n)return false;
  if(ctx.state==="suspended")ctx.resume().catch(()=>{});   // a sleeping context wakes for it (the bell of a rematch, the workshop); start(0) plays it as soon as it runs
  const t=ctx.currentTime;if(t-(FX.last[id]||-1)<0.06)return false;
  const fs=fxFiles(id,n).filter(f=>FX.buf[f]);if(!fs.length){fxFiles(id,n).forEach(fxGet);return false;}
  FX.last[id]=t;const b=FX.buf[fs[Math.random()*fs.length|0]],s=ctx.createBufferSource(),g=ctx.createGain();
  s.buffer=b;s.playbackRate.value=0.96+Math.random()*0.08;g.gain.value=Math.max(0,Math.min(1,v==null?0.8:v));
  s.connect(g);g.connect(master);s.start(ctx.state==="running"?t:0);FX.until=Math.max(FX.until,t+b.duration/s.playbackRate.value);fxDoze();return true;}
const BED={id:null,src:null,g:null};
function crowd(id){if(!ctx)return;if(id&&!FX.BEDS[id])id=null;if(id===BED.id&&(BED.src||!id))return;
  const t=ctx.currentTime;if(BED.src){const s=BED.src,g=BED.g;g.gain.cancelScheduledValues(t);g.gain.setTargetAtTime(0,t,0.4);setTimeout(()=>{try{s.stop();}catch(e){}},2500);BED.src=BED.g=null;}
  BED.id=id;if(!id)return;const f=FX.BEDS[id];if(!FX.buf[f]){fxGet(f);BED.id=null;return;}   // not decoded yet: the next call tries again
  if(ctx.state!=="running"){BED.id=null;return;}
  const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=FX.buf[f];s.loop=true;g.gain.setValueAtTime(0,t);g.gain.setTargetAtTime(0.2,t,0.6);
  s.connect(g);g.connect(master);s.start(t,Math.random()*s.buffer.duration);BED.src=s;BED.g=g;}
/* after stop() the context is suspended (no idle oscillators burning battery); the next hit or whine wakes it */
function awake(){if(!ctx)return false;FX.resting=false;if(sleepT){clearTimeout(sleepT);sleepT=0;}if(ctx.state==="suspended"){ctx.resume().catch(()=>{});return false;}return ctx.state==="running";}
function unlock(){if(ctx){if(ctx.state==="suspended")ctx.resume().catch(()=>{});return;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  try{ctx=new AC();}catch(e){ctx=null;return;}
  master=ctx.createGain();master.gain.value=0.55;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=6;master.connect(comp);comp.connect(ctx.destination);
  const n=ctx.sampleRate*0.6|0,buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0);let s=22222;
  for(let i=0;i<n;i++){s=(s*16807)%2147483647;d[i]=s/1073741823.5-1;}noise=buf;sampLoad();FX.WORK.forEach(fxGet);if(FX.want)prep();}
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
function nap(){sleepT=0;if(!ctx||ctx.state!=="running")return;const w=Math.max(vUntil,FX.until)-ctx.currentTime;   // a voice or a stinger still going: wait for it
  if(w>0){sleepT=setTimeout(nap,w*1000+300);return;}ctx.suspend().catch(()=>{});}
function stop(){if(!ctx)return;const t=ctx.currentTime;for(const m of motors)if(m){m.wg.gain.setTargetAtTime(0,t,0.08);m.dg.gain.setTargetAtTime(0,t,0.08);}
  crowd(null);FX.resting=true;if(sleepT)clearTimeout(sleepT);sleepT=setTimeout(nap,600);}
function voiceBus(){if(!ctx)return null;if(ctx.state==="suspended")ctx.resume().catch(()=>{});
  if(!vbus){vbus=ctx.createGain();vbus.gain.value=0.9;vbus.connect(ctx.destination);}return{ctx,out:vbus};}
function talk(until){if(!ctx)return;const t=ctx.currentTime;vUntil=Math.max(vUntil,until);
  master.gain.cancelScheduledValues(t);master.gain.setTargetAtTime(0.32,t,0.04);master.gain.setTargetAtTime(0.55,vUntil,0.25);}
const gesture=()=>unlock();
for(const ev of ["pointerdown","touchend","click","keydown"])window.addEventListener(ev,gesture,{passive:true});
function samples(on){SAMP.on=!!on;sampLoad();if(on&&FX.want)prep();}
return{get ready(){return!!ctx&&ctx.state==="running";},get loaded(){return Object.keys(SAMP.buf).length;},unlock,hit,whine,stop,samples,voiceBus,talk,sfx,prep,crowd};
})();
</script>
