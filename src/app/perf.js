/* ===================== app/perf.js: graphics tiers and auto-adjust =====================
   Three tiers, lite / full / ultra (settings.gfx; null means the default: Lite on a phone, Full elsewhere).
   Auto-adjust (settings.gfxAuto, on unless false), same rules as PEW: once the scene has settled, watch the frame rate SERVO_VIS
   measures. If it stays under ~27 fps for ~8 s, step ONE tier down (ultra > full > lite) and say so in a toast. It never steps
   up, and a manual tier pick after an auto-drop is respected for the rest of the session.
   Skipped while the page is hidden, for the first ~6 s, for 3 s after a tier or tab change, and whenever the view isn't
   drawing. Automated browsers (navigator.webdriver) are left alone unless PERF.force is set (test hook: PERF.force=12). */
const PERF={T:["lite","full","ultra"],LOW:27,NEED:8000,SETTLE:6000,HOLD:3000,boot:performance.now(),f:null,fAt:0,sAt:0,low:0,tier:null,tab:null,holdTo:0,dropped:false,manual:false,force:null};
function perfReset(hold){PERF.low=0;PERF.sAt=0;if(hold)PERF.holdTo=performance.now()+PERF.HOLD;}
/* the player picked a tier or flipped auto-adjust in Settings */
function perfManual(){PERF.manual=true;perfReset(true);}
function perfPoll(){
  if(!window.SERVO_VIS)return;
  const now=performance.now();
  if(ST().gfxAuto===false||(PERF.dropped&&PERF.manual)||document.hidden||now-PERF.boot<PERF.SETTLE){perfReset(true);return;}
  if(navigator.webdriver&&PERF.force==null)return;
  const tier=gfxTier();if(tier!==PERF.tier){PERF.tier=tier;perfReset(true);}
  if(curTab!==PERF.tab){PERF.tab=curTab;perfReset(true);}
  if(now<PERF.holdTo)return;
  const f=SERVO_VIS.fps();let fps;
  if(PERF.force!=null){fps=PERF.force;if(!PERF.sAt){PERF.sAt=now;return;}}
  else if(f!==PERF.f){PERF.f=f;PERF.fAt=now;fps=f.fps;if(!PERF.sAt){PERF.sAt=now;return;}}
  else{if(now-PERF.fAt>1500)perfReset(false);return;}          // nothing drawn lately: start over
  const el=Math.min(now-PERF.sAt,1000);PERF.sAt=now;
  if(fps>0&&fps<PERF.LOW)PERF.low+=el;else PERF.low=Math.max(0,PERF.low-2*el);
  if(PERF.low<PERF.NEED)return;
  PERF.low=0;const i=PERF.T.indexOf(tier);
  if(i<1)return;   // already Lite: nothing left to give
  const n=PERF.T[i-1];PERF.dropped=true;ST().gfx=n;applyGfx();save();perfReset(true);
  toast(`Graphics lowered to ${n[0].toUpperCase()+n.slice(1)} to keep things smooth. Change it in Settings.`);}
setInterval(perfPoll,500);
/* ?fps=1 shows the frame rate in the corner of the view */
if(/[?&]fps=1(&|$)/.test(location.search))setInterval(()=>{const f=window.SERVO_VIS&&SERVO_VIS.fps();if(f)$("fpsHud").textContent=f.fps+" fps · "+gfxTier();},1000);
