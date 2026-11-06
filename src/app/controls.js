/* ===================== app/controls.js: driving =====================
   Turns thumbs, keys and gamepads into the sim's per-step input {throttle, steer, weapon, selfRight} (throttle and steer
   -1..1; positive steer turns right). Nothing else drives the player's bot.
     direct     (Settings → Controls) a floating stick wherever the left thumb lands on the left half of the arena, a
                weapon button on the right, and a self-right button above it while you're upside down. Left-handed
                swaps the sides. Spinners: the weapon button switches the disc on and off (on at the bell). Flippers and
                hammers fire on a press; a lifter lifts while it's held.
     tactical   tap the floor to drive there, tap the opponent to attack it, tap your own bot to back off. A small path
                follower turns the order into throttle and steer; attacking fires the weapon when the target is in reach.
     keyboard   W A S D or the arrow keys, space for the weapon, R to self-right (works alongside either scheme)
     gamepad    left stick, A (or the right trigger) for the weapon, Y or B to self-right
   Multi-touch: each control follows its own pointerId with setPointerCapture, so two thumbs never steal each other's input.
   ASSISTS (state.js) by driver skill apply to both schemes: auto-straighten (holds the heading when you aren't steering),
   turn damping (softens the steering, more at speed), and weapon auto-spin (a spinner spins up only when an enemy is
   near, saving battery). Settings → Driving assists turns them off. The player's skill is the rookie's until PR 8's
   drivers. */
const CTL={el:null,on:false,scheme:"direct",left:false,stick:null,wpn:null,wDown:false,wToggle:true,sr:false,keys:{},order:null,steerS:0,
  pads:false,lastPick:0};
function ctlAssist(){return ST().assists===false?ASSISTS.off:ASSISTS[CTL.skill||"rookie"]||ASSISTS.rookie;}
/* build the overlay inside the arena view; the Fight tab calls it when a fight starts with you driving */
function ctlMount(host){ctlUnmount();CTL.scheme=ST().controls==="tactical"?"tactical":"direct";CTL.left=!!ST().leftHanded;
  CTL.stick=null;CTL.wpn=null;CTL.wDown=false;CTL.wToggle=true;CTL.sr=false;CTL.order=null;CTL.steerS=0;CTL.keys={};
  const el=document.createElement("div");el.id="ctl";el.className="ctl "+CTL.scheme+(CTL.left?" lefty":"");
  el.innerHTML=CTL.scheme==="direct"
    ?`<div class="ctlpad" data-c="pad" aria-hidden="true"><i class="ctlbase"></i><i class="ctlknob"></i><span class="ctlhint">Drive</span></div>
      <button type="button" class="ctlbtn ctlwpn" data-c="wpn" aria-label="Weapon"><span>Weapon</span></button>
      <button type="button" class="ctlbtn ctlsr" data-c="sr" aria-label="Self-right" hidden><span>Self-right</span></button>`
    :`<div class="ctltap" data-c="tap" aria-hidden="true"></div><i class="ctlmark" hidden></i>
      <p class="ctlhint2">Tap the floor to drive there · tap them to attack · tap your bot to back off</p>
      <button type="button" class="ctlbtn ctlsr" data-c="sr" aria-label="Self-right" hidden><span>Self-right</span></button>`;
  host.appendChild(el);CTL.el=el;CTL.on=true;
  const pad=el.querySelector("[data-c=pad]"),wpn=el.querySelector("[data-c=wpn]"),sr=el.querySelector("[data-c=sr]"),tap=el.querySelector("[data-c=tap]");
  const cap=(e)=>{try{e.target.setPointerCapture(e.pointerId);}catch(x){}};
  if(pad){pad.addEventListener("pointerdown",e=>{if(CTL.stick)return;e.preventDefault();cap(e);const r=pad.getBoundingClientRect();
      CTL.stick={id:e.pointerId,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,rx:r.left,ry:r.top};ctlDrawStick();});
    pad.addEventListener("pointermove",e=>{const s=CTL.stick;if(!s||s.id!==e.pointerId)return;s.x=e.clientX;s.y=e.clientY;ctlDrawStick();});
    const end=e=>{const s=CTL.stick;if(!s||s.id!==e.pointerId)return;CTL.stick=null;ctlDrawStick();};
    pad.addEventListener("pointerup",end);pad.addEventListener("pointercancel",end);pad.addEventListener("lostpointercapture",end);}
  if(wpn){wpn.addEventListener("pointerdown",e=>{e.preventDefault();cap(e);CTL.wpn=e.pointerId;CTL.wDown=true;CTL.wPress=true;wpn.classList.add("down");});
    const end=e=>{if(CTL.wpn!==e.pointerId)return;CTL.wpn=null;CTL.wDown=false;wpn.classList.remove("down");};
    wpn.addEventListener("pointerup",end);wpn.addEventListener("pointercancel",end);wpn.addEventListener("lostpointercapture",end);
    wpn.addEventListener("click",e=>e.preventDefault());}
  if(sr){sr.addEventListener("pointerdown",e=>{e.preventDefault();cap(e);CTL.sr=true;sr.classList.add("down");});
    const end=()=>{CTL.sr=false;sr.classList.remove("down");};sr.addEventListener("pointerup",end);sr.addEventListener("pointercancel",end);}
  if(tap)tap.addEventListener("pointerdown",e=>{e.preventDefault();ctlTap(e);});}
function ctlUnmount(){if(CTL.el&&CTL.el.parentNode)CTL.el.parentNode.removeChild(CTL.el);CTL.el=null;CTL.on=false;CTL.stick=null;CTL.keys={};}
/* the stick: knob offset from where the thumb landed, at most 56 px */
const CTL_R=56;
function ctlStickVec(){const s=CTL.stick;if(!s)return null;let dx=s.x-s.x0,dy=s.y-s.y0;const d=Math.hypot(dx,dy);if(d>CTL_R){dx*=CTL_R/d;dy*=CTL_R/d;}
  const dead=0.12,f=v=>Math.abs(v)<dead?0:(v-Math.sign(v)*dead)/(1-dead);return{x:f(dx/CTL_R),y:f(-dy/CTL_R),dx,dy};}
function ctlDrawStick(){if(!CTL.el)return;const base=CTL.el.querySelector(".ctlbase"),knob=CTL.el.querySelector(".ctlknob"),hint=CTL.el.querySelector(".ctlhint");if(!base)return;
  const s=CTL.stick;if(!s){base.style.opacity=knob.style.opacity=base.style.left=base.style.top=knob.style.left=knob.style.top="";if(hint)hint.hidden=false;return;}
  const v=ctlStickVec(),x=s.x0-s.rx,y=s.y0-s.ry;base.style.opacity=knob.style.opacity="1";if(hint)hint.hidden=true;
  base.style.left=x+"px";base.style.top=y+"px";knob.style.left=(x+v.dx)+"px";knob.style.top=(y+v.dy)+"px";}
/* tactical: what did the tap land on? */
function ctlTap(e){const F=FT.F;if(!F)return;const r=CTL.el.getBoundingClientRect(),p=SCRAP_VIS.pick(e.clientX-r.left,e.clientY-r.top);if(!p)return;
  const me=F.bots[0];let hit=null,best=1e9;
  for(const o of F.bots){if(o.out)continue;const d=Math.hypot(o.x-p.x,o.y-p.y);if(d<o.rad*1.6+0.03*F.M.len&&d<best){best=d;hit=o;}}
  if(hit===me)CTL.order={k:"back",t:F.t+0.8};else if(hit&&hit.team!==me.team)CTL.order={k:"attack",v:hit.i};else CTL.order={k:"go",x:p.x,y:p.y};
  const m=CTL.el.querySelector(".ctlmark");if(m){m.hidden=false;m.className="ctlmark "+CTL.order.k;m.style.left=(e.clientX-r.left)+"px";m.style.top=(e.clientY-r.top)+"px";
    clearTimeout(ctlTap.t);ctlTap.t=setTimeout(()=>{m.hidden=true;},700);}
  buzz(6);}
/* keyboard: held keys (the Fight tab only listens while a fight is live) */
const CTL_KEYS={KeyW:"up",ArrowUp:"up",KeyS:"down",ArrowDown:"down",KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right",Space:"wpn",KeyR:"sr"};
document.addEventListener("keydown",e=>{if(!CTL.on)return;const k=CTL_KEYS[e.code];if(!k||e.target.closest("input,textarea,select"))return;e.preventDefault();
  if(k==="wpn"&&!CTL.keys.wpn)CTL.wPress=true;CTL.keys[k]=true;});
document.addEventListener("keyup",e=>{const k=CTL_KEYS[e.code];if(k)CTL.keys[k]=false;});
window.addEventListener("blur",()=>{CTL.keys={};});
function ctlPad(){if(!navigator.getGamepads)return null;let gp=null;try{for(const g of navigator.getGamepads())if(g&&g.connected){gp=g;break;}}catch(e){return null;}
  if(!gp)return null;const ax=v=>Math.abs(v)<0.15?0:v,b=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed);
  return{x:ax(gp.axes[0]||0),y:-ax(gp.axes[1]||0),wpn:b(0)||b(7),sr:b(3)||b(1)};}

/* this step's input for bot o in fight F */
function ctlRead(F,o){const out={throttle:0,steer:0,weapon:0,selfRight:0};if(!CTL.on||!o)return out;
  const A=ctlAssist(),W=o.b.weapon,spinner=W.type==="spinner"||W.type==="saw",foe=ctlFoe(F,o),near=foe&&Math.hypot(foe.x-o.x,foe.y-o.y)<(o.rad+foe.rad)*4;
  let thr=0,st=0,wpn=false,sr=CTL.sr,steering=false;
  const v=ctlStickVec(),K=CTL.keys,gp=ctlPad();
  if(v){thr=v.y;st=v.x;steering=Math.abs(v.x)>0;}
  if(K.up||K.down||K.left||K.right){thr=(K.up?1:0)-(K.down?1:0);st=(K.right?1:0)-(K.left?1:0);steering=st!==0;}
  if(gp){if(gp.x||gp.y){thr=gp.y;st=gp.x;steering=!!gp.x;}if(gp.wpn&&!CTL.gpW)CTL.wPress=true;CTL.gpW=gp.wpn;sr=sr||gp.sr||K.sr;}else sr=sr||K.sr;
  const held=CTL.wDown||K.wpn||(gp&&gp.wpn);
  if(CTL.scheme==="tactical"&&CTL.order){const t=ctlTactical(F,o,CTL.order);if(t){if(!(v||K.up||K.down||K.left||K.right||(gp&&(gp.x||gp.y)))){thr=t.throttle;st=t.steer;steering=true;}if(t.weapon)wpn=true;}}
  /* the weapon */
  if(spinner){if(CTL.wPress)CTL.wToggle=!CTL.wToggle;wpn=CTL.wToggle&&(!A.autoSpin||near||CTL.order&&CTL.order.k==="attack");}
  else if(W.type==="lifter")wpn=wpn||held;
  else wpn=wpn||CTL.wPress||held&&W.type!=="flipper";
  CTL.wPress=false;
  /* assists: soften the steering at speed, smooth it, and hold the heading while you're not steering */
  st*=1-A.turnDamp*Math.min(1,Math.abs(thr));
  CTL.steerS+=(st-CTL.steerS)*(1-A.turnDamp*0.6);st=CTL.steerS;
  if(!steering&&Math.abs(thr)>0.2&&A.straighten>0)st=Math.max(-1,Math.min(1,st+A.straighten*o.w*0.25));
  out.throttle=Math.max(-1,Math.min(1,thr));out.steer=Math.max(-1,Math.min(1,st));out.weapon=wpn?1:0;out.selfRight=sr?1:0;
  /* the self-right button shows only when it's needed */
  const srb=CTL.el&&CTL.el.querySelector("[data-c=sr]");if(srb){const need=o.inverted&&!o.b.height.drivesInverted;if(srb.hidden===need)srb.hidden=!need;}
  return out;}
function ctlFoe(F,o){let best=null,bd=1e9;for(const t of F.bots)if(t.team!==o.team&&!t.out){const d=Math.hypot(t.x-o.x,t.y-o.y);if(d<bd){bd=d;best=t;}}return best;}
/* tactical orders to throttle and steer: point at the target, go when roughly facing it */
function ctlTactical(F,o,ord){let tx,ty,wpn=false;
  if(ord.k==="back"){if(F.t>ord.t){CTL.order=null;return null;}return{throttle:-1,steer:0,weapon:0};}
  if(ord.k==="attack"){const t=F.bots[ord.v];if(!t||t.out){CTL.order=null;return null;}tx=t.x;ty=t.y;
    const W=o.b.weapon;wpn=W.type==="spinner"||W.type==="saw"?true:!!SIM.zoneTouch(o,t);}
  else{tx=ord.x;ty=ord.y;if(Math.hypot(tx-o.x,ty-o.y)<o.rad*0.8){CTL.order=null;return null;}}
  const err=SIM_wrap(Math.atan2(ty-o.y,tx-o.x)-o.h),a=Math.abs(err);
  return{steer:Math.max(-1,Math.min(1,-2.2*err)),throttle:a<0.4?1:a<1.3?Math.cos(a):0,weapon:wpn};}
const SIM_wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
const CONTROLS={read:ctlRead,mount:ctlMount,unmount:ctlUnmount};
