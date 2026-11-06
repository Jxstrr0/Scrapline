/* ---- fight.js: the fight, plan section 7a. N bots at a fixed 60 Hz step, deterministic from a seed.
     newFight({bots, arena, seed, rules, fx})   bots: [{cfg, team, name, driver, damage}]. driver {style, skill} is an AI
                                            (sim/ai.js); driver null is the player, who hands in inputs each step.
                                            damage: J already taken per key (S.bots[cls].damage), or nothing for fresh.
                                            fx: keep F.fxq, where hits and landings happened, for a view to flash.
     stepFight(F, inputs)                   one step. inputs: {botIndex: {throttle, steer, weapon, selfRight}} for the
                                            player bots (throttle and steer -1..1, weapon and selfRight 0 or 1)
     runFight(opts)                         newFight, then step to the end (AI against AI, or a replay): the result
     replayFight(log)                       the same fight again from its log: seed + builds + the player's inputs
     fightResult(F)                         {over, winner (team or null), reason, timeS, bots:[...], log}
   Every bot is a 2D rigid body (evalBuild's outline, mass, yaw inertia) with a cheap height axis (z, vz, inverted) for
   lifts, flips and landings. Drive is tank steering: each side's wheels push F0/2 x (command - wheel speed / v0), capped
   by grip, less per wheel or pod lost. Bots collide as convex polygons with impulses; a weapon hits when its working
   zone touches another bot (spinners, flippers, lifters, hammers, crushers), and WEDGE_RULES decides who gets under whom.
   Damage goes through sim/damage.js; every hit, failure, flip and landing goes in the fight log, which is also the
   replay (the player's inputs are stored one byte per axis, run-length coded; AI inputs come back from the seed).
   Coordinates: the arena is a square centred on the origin; a bot's heading h points its front along (cos h, sin h),
   and its own frame has +x right and +y forward, like evalBuild's. ---- */
const STEP_HZ=60;
/* WEDGE_RULES: who gets under whom. When a bot's front touches another bot, it gets under if its front edge is lower than
   the edge it meets (the other's front edge, or its ground clearance on any other face) by more than tolMm (beetle scale,
   x edge in other classes; the bench's wedge gauge reads it too). Front to front within tolMm is a tie: a skid plate wins
   it, then the harder edge. The bot that is under loses grip and push, its weapon bites less, and hits from the bot
   under it skip its armour's deflect. */
const WEDGE_RULES={
  tolMm:0.3,
  underGrip:0.2,    // the lifted bot keeps this share of its grip
  underBite:0.5,    // and its own weapon lands this share of its energy
  holdS:0.25,       // it stays lifted this long after the contact ends
  liftMm:12         // how high it rides up the wedge (beetle scale, x len), for the views
};
/* FIGHT: the fight's tuning numbers (beetle scale where it says so; tools/fight-test.js is where they get tuned) */
const FIGHT={
  roundS:90, koS:10,          // a round, and how long a bot may be immobile before it is counted out
  arenaM:2.4,                 // the side of the plain test box (beetle scale, x len) when no arena is given
  restitution:0.25, contactMu:0.3, wallE:0.35,
  scrub:0.6,                  // a skid-steer's tyres scrub against turning: x grip x weight x half the track
  latGrip:1,                  // tyres resist sliding sideways: x grip x g
  deadDrag:3,                 // a bot with no drive rolls this x harder (motors and gearboxes back-driven)
  maxSpin:40,                 // rad/s: yaw rate cap after a big hit
  /* weapons */
  hitGapS:0.25,               // a weapon can't hit the same bot twice within this
  minSpin:0.25,               // a spinner below this share of top rpm doesn't bite
  spinDrag:0.03,              // with the weapon off, the disc slows with this share of its motor's torque
  biteJitter:0.2,             // each hit's bite varies by up to this share
  glance:0.3,                 // a deflected hit lands this share of its energy (and takes that share off the disc)
  damageShare:0.65,           // a spinner hit's energy that goes into damage ...
  throwShare:0.35,            // ... and into throwing the target
  recoilShare:0.5,            // the attacker takes this x the throw impulse x the weapon's recoil, the other way
  up:{hsp:0,vsp:0.6,drum:0.5,under:0.3,saw:0},   // share of a spinner's throw that goes upward
  flipDmg:0.15,               // a flipper's arm hit: this x launchJ x bite in damage
  flipFwd:1,                  // m/s forward a flipped bot carries (x sqrt len)
  invertM:[0.08,0.25],        // a flip or throw this high (m, x len) may land the bot upside down, rising to ...
  invertMax:0.85,             // ... this chance at the top of the range
  liftGrip:0.1,               // a bot held up on a lifter or in a crusher keeps this share of grip
  tipS:0.8, tipM:0.05, tipP:0.75,   // a lifter that holds a bot this long and lifts this high (m, x len) tips it over this often
  crushS:1, crushOpenS:0.6, crushAbsorb:0.5,   // a crusher's bite, opening again, and the share of absorb its point leaves
  hammerShare:0.9,            // share of a hammer blow that goes into damage
  rightS:1.2,                 // seconds to self-right
  ramShare:0.3, ramMinJ:0.5,  // collisions (bots and walls): this share of the energy lost is damage, above ramMinJ (x mass)
  airM:0.03,                  // a spinner's throw that lifts a bot less than this (m, x len) is a jolt, not a flight
  microJ:1,                   // log entries under this (J, x mass) are merged into the last one
  logMaxB:20000,              // a round's log, inputs included, stays under this many bytes
  inputTick:2,                // the player's inputs are read every 2nd step (30 Hz) ...
  inputLevels:31,             // ... each stick axis to -31..31 (one byte) ...
  inputHyst:2,                // ... and the recorded value follows only once the stick has moved 2 levels (full and centre always count)
  /* weapon working zones, in the bot's frame: circle (around the disc), or a box ahead of the front face, w x the weapon's
     footprint width (full: the chassis width), reach x the bot's length (or the weapon's own reachM); top: it hits the
     top of what it lands on */
  zone:{hsp:{circle:1},vsp:{w:0.4},drum:{w:1},under:{w:1},saw:{w:0.4,top:1},flipper:{w:1},lifter:{w:1},
    hammer:{w:0.7,reach:0.3,top:1},crusher:{w:1,reach:0.25,top:1}}
};
const clamp1=v=>v<-1?-1:v>1?1:v;
const wrapA=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};

/* ---- geometry: convex polygons as [[x,y]..] ---- */
function polyCentre(P){let x=0,y=0;for(const p of P){x+=p[0];y+=p[1];}return[x/P.length,y/P.length];}
/* separating axes: null, or {nx, ny, depth} with the normal pointing from A to B */
function sat(A,B){let best=1e9,nx=0,ny=0;
  for(const P of [A,B])for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length];let ax=p[1]-q[1],ay=q[0]-p[0];const l=Math.hypot(ax,ay);if(l<1e-12)continue;ax/=l;ay/=l;
    let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;for(const v of A){const d=v[0]*ax+v[1]*ay;if(d<a0)a0=d;if(d>a1)a1=d;}for(const v of B){const d=v[0]*ax+v[1]*ay;if(d<b0)b0=d;if(d>b1)b1=d;}
    const o=Math.min(a1-b0,b1-a0);if(o<=0)return null;if(o<best){best=o;nx=ax;ny=ay;}}
  const ca=polyCentre(A),cb=polyCentre(B);if((cb[0]-ca[0])*nx+(cb[1]-ca[1])*ny<0){nx=-nx;ny=-ny;}
  return{nx,ny,depth:best};}
function inPoly(P,x,y){let s=0;for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length],c=(q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]);
  if(Math.abs(c)<1e-12)continue;const g=c>0?1:-1;if(!s)s=g;else if(g!==s)return false;}return true;}
function closestOnPoly(P,x,y){let bx=P[0][0],by=P[0][1],bd=1e18;
  for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length],dx=q[0]-p[0],dy=q[1]-p[1],l=dx*dx+dy*dy;let t=l>0?((x-p[0])*dx+(y-p[1])*dy)/l:0;t=t<0?0:t>1?1:t;
    const cx=p[0]+t*dx,cy=p[1]+t*dy,d=(cx-x)*(cx-x)+(cy-y)*(cy-y);if(d<bd){bd=d;bx=cx;by=cy;}}
  return[bx,by,Math.sqrt(bd)];}
/* a contact point for two overlapping polygons: the corners of each inside the other, else B's deepest corner */
function contactPoint(A,B,n){let x=0,y=0,k=0;for(const v of B)if(inPoly(A,v[0],v[1])){x+=v[0];y+=v[1];k++;}for(const v of A)if(inPoly(B,v[0],v[1])){x+=v[0];y+=v[1];k++;}
  if(k)return[x/k,y/k];let best=null,bd=1e9;for(const v of B){const d=v[0]*n.nx+v[1]*n.ny;if(d<bd){bd=d;best=v;}}return[best[0],best[1]];}

/* ---- a bot's frame ---- */
function toWorld(o,lx,ly){const c=Math.cos(o.h),s=Math.sin(o.h);return[o.x+lx*s+ly*c,o.y-lx*c+ly*s];}
function toLocal(o,wx,wy){const c=Math.cos(o.h),s=Math.sin(o.h),dx=wx-o.x,dy=wy-o.y;return[dx*s-dy*c,dx*c+dy*s];}
function worldPoly(o,P){const c=Math.cos(o.h),s=Math.sin(o.h);return P.map(p=>[o.x+p[0]*s+p[1]*c,o.y-p[0]*c+p[1]*s]);}
/* which face of bot o a world point is on (chassis frame, so an off-centre COM doesn't tilt it); upside down, left and
   right swap */
function faceAt(o,wx,wy){const l=toLocal(o,wx,wy);let x=(l[0]+o.b.com.x)/(o.b.widthM/2),y=(l[1]+o.b.com.y)/(o.b.lengthM/2);if(o.inverted)x=-x;
  return Math.abs(x)>Math.abs(y)?(x<0?"left":"right"):(y>0?"front":"back");}
function impulseAt(o,jx,jy,px,py){if(!(o.m>0))return;o.vx+=jx/o.m;o.vy+=jy/o.m;o.w+=((px-o.x)*jy-(py-o.y)*jx)/o.I;
  if(o.w>FIGHT.maxSpin)o.w=FIGHT.maxSpin;else if(o.w<-FIGHT.maxSpin)o.w=-FIGHT.maxSpin;}

/* ---- the working zone of a bot's weapon, in its frame around the COM: {circle, x, y, r} or {x0, x1, y0, y1}, plus top ---- */
function weaponZone(b){const w=b.weapon,Z=FIGHT.zone[w.id]||FIGHT.zone[w.type];if(!Z||w.type==="none"||w.type==="wedge")return null;
  const cx=b.com.x,cy=b.com.y,hl=b.lengthM/2,mx=w.mountM?w.mountM[0]:0;
  if(Z.circle)return{circle:true,x:mx-cx,y:(w.mountM?w.mountM[1]:hl)-cy,r:w.radiusM||0.05,top:false};
  const f=footprints(b.cfg).find(q=>q.key==="weapon"),ww=f?f.w*CLASSES[b.cls].cellMm/1000:b.widthM;
  const width=Z.full?b.widthM:ww*Z.w,reach=Z.reach!=null?Z.reach*b.lengthM:(w.reachM||0.04),back=0.02*b.lengthM;
  return{circle:false,x0:mx-width/2-cx,x1:mx+width/2-cx,y0:hl-back-cy,y1:hl+reach-cy,top:!!Z.top};}
/* does bot o's weapon zone touch bot t? null, or {px, py} (the point on t it meets) */
function zoneTouch(o,t){const Z=o.zone;if(!Z||o.air||t.air||t.out==="pit")return null;const P=t.pw;
  if(Z.circle){const c=toWorld(o,Z.x,Z.y),q=closestOnPoly(P,c[0],c[1]);if(q[2]<=Z.r||inPoly(P,c[0],c[1]))return{px:q[0],py:q[1]};return null;}
  const R=worldPoly(o,[[Z.x0,Z.y1],[Z.x1,Z.y1],[Z.x1,Z.y0],[Z.x0,Z.y0]]);if(!sat(R,P))return null;
  const c=toWorld(o,(Z.x0+Z.x1)/2,(Z.y0+Z.y1)/2),q=closestOnPoly(P,c[0],c[1]);return{px:q[0],py:q[1]};}

/* ---- setting up ---- */
function arenaOf(a,cls){const M=classMult(cls);let A=typeof a==="string"?ARENAS[a]:a&&typeof a==="object"?a:null;
  if(!A)A={id:"box",name:"Test box",sizeM:FIGHT.arenaM};
  const side=(A.sizeM||FIGHT.arenaM)*M.len;
  return{id:A.id||"custom",name:A.name||"Arena",half:side/2,wallE:A.wallE!=null?A.wallE:FIGHT.wallE,pit:A.pit?A.pit.map(v=>v*M.len):null,def:A};}
function newBot(spec,i,F){const b=evalBuild(spec.cfg),cfg=b.cfg,M=classMult(b.cls);
  const o={i,team:spec.team!=null?spec.team:i,name:spec.name||b.className,cfg,b,driver:spec.driver||null,M,
    x:0,y:0,h:0,vx:0,vy:0,w:0,z:0,vz:0,zPeak:0,air:false,inverted:false,flipNext:false,
    m:b.massKg,I:Math.max(b.moi,1e-6),poly:b.polygon.map(p=>[p[0]-b.com.x,p[1]-b.com.y]),pw:null,rad:0,
    zone:weaponZone(b),st:damageState(b,spec.damage),flags:{esc:null,smoke:false,cell:false,bent:false},fx:null,
    wp:{om:0,shots:b.weapon.shots||0,recharge:0,phase:0,t:0,held:null,last:{}},
    heat:{d:0,w:0,dDer:false,wDer:false},bat:b.power.batteryWs,flat:false,
    under:null,held:null,righting:0,immobileS:0,out:null,outAt:null,
    input:{throttle:0,steer:0,weapon:0,selfRight:0},cmd:[0,0],touch:{},stats:{dealt:0,taken:0,hits:0,landed:0}};
  o.rad=Math.max(...o.poly.map(p=>Math.hypot(p[0],p[1])));
  o.fx=damageEffects(b,o.st,o.flags);
  return o;}
function newFight(opts){opts=opts||{};const seed=(opts.seed>>>0)||1,specs=(opts.bots||[]).filter(s=>s&&s.cfg);
  if(specs.length<2)throw new Error("newFight needs two bots or more");
  const cls=normCfg(specs[0].cfg).cls,rules=Object.assign({roundS:FIGHT.roundS,koS:FIGHT.koS},opts.rules||{});
  const F={seed,rng:rng(seed),t:0,n:0,dt:1/STEP_HZ,cls,M:classMult(cls),arena:arenaOf(opts.arena,cls),rules,bots:[],
    log:[],over:false,winner:null,reason:null,endT:null,rec:{},play:opts.play||null,fxq:opts.fx?[]:null,
    spec:{arena:opts.arena&&typeof opts.arena==="object"?opts.arena:(opts.arena||"box"),rules:opts.rules||{},
      bots:specs.map(s=>({cfg:normCfg(s.cfg),team:s.team!=null?s.team:null,name:s.name||null,driver:s.driver||null,damage:s.damage||null}))}};
  F.bots=specs.map((s,i)=>newBot(s,i,F));
  /* start: spread on a ring, facing the middle, a little jitter from the seed */
  const n=F.bots.length,R=F.arena.half*0.6;
  F.bots.forEach((o,i)=>{const a=-Math.PI/2+2*Math.PI*i/n+rRange(F.rng,-0.04,0.04);o.x=R*Math.cos(a);o.y=R*Math.sin(a);
    o.h=wrapA(a+Math.PI+rRange(F.rng,-0.08,0.08));o.pw=worldPoly(o,o.poly);
    if(o.driver)o.ai=aiNew(o,(seed^Math.imul(0x9E3779B1,i+1))>>>0);
    else F.rec[i]={v:[[],[],[]],last:[FIGHT.inputLevels+1,FIGHT.inputLevels+1,0]};});
  return F;}

/* ---- the log ---- */
const r2=v=>Math.round(v*100)/100;
/* where things happened, for a view to flash (newFight({fx:true}) only; the view drains it; never in the log) */
function fxPush(F,e){if(!F.fxq)return;F.fxq.push(e);if(F.fxq.length>64)F.fxq.shift();}
function logIt(F,e){e.t=r2(F.t);F.log.push(e);return e;}
/* a hit: merged into the last entry when it is small and the same pair, face and kind within half a second */
/* a hit (or a landing): a small one that destroys nothing is merged into a matching entry from the last half second
   (same kind, attacker, victim and face), so grinding contact and little bounces stay one line */
function logHit(F,k,a,v,face,E,res){const small=E<FIGHT.microJ*F.M.mass&&!(res&&res.parts.some(p=>p.destroyed));
  if(small)for(let i=F.log.length-1,n=0;i>=0&&n<6;i--,n++){const L=F.log[i];if(F.t-L.t>=0.5)break;
    if(L.k===k&&L.a===a&&L.v===v&&L.f===face&&!(L.x&&L.x.some(q=>q[2]))){L.E=r2(L.E+E);L.n=(L.n||1)+1;
      if(res){L.p=r2((L.p||0)+(res.plate||0));for(const p of res.parts){const q=L.x&&L.x.find(z=>z[0]===p.key);if(q)q[1]=r2(q[1]+p.dmg);else(L.x=L.x||[]).push([p.key,r2(p.dmg),0]);}}
      return L;}}
  const e={k,a,v,f:face,E:r2(E)};if(res){e.p=r2(res.plate||0);if(res.plateBroken)e.pb=1;if(res.parts.length)e.x=res.parts.map(p=>[p.key,r2(p.dmg),p.destroyed?1:0]);}
  return logIt(F,e);}

/* ---- damage to a bot, and the failures it sets off ---- */
function fxDiff(F,o,before){const a=before,b=o.fx,L=(k,extra)=>logIt(F,Object.assign({k:"fail",v:o.i,what:k},extra||{}));
  for(const s of ["left","right"])if(!a.sides[s].out&&b.sides[s].out)L("side",{side:s});
  if(a.power===1&&b.power<1&&b.power>0&&o.flags.smoke&&!o.flags.cell)L("smoke");
  if(!a.dead&&b.dead)L("dead",{why:b.dead});
  if(a.motorOk&&!b.motorOk&&b.weaponOk)L("motor");
  if(a.weaponOk&&!b.weaponOk)L("weapon");
  if(a.righter&&!b.righter)L("righter");
  if(!a.flexing&&b.flexing)L("flex");}
function damageBot(F,o,face,E,kind,att,opts){opts=opts||{};if(E<=0||o.out==="pit")return null;const before=o.fx;
  const st=o.st,hadBat=st.parts.battery,hadEl=st.parts.electronics;
  const res=kind==="land"?landHit(o.b,st,E,opts.inverted):hitFace(o.b,face,E,st,o.fx.absorbMul*(opts.absorbMul||1));
  if(res.hit){res.plate=res.hit.plate;res.plateBroken=res.hit.plateBroken;res.through=res.hit.through;}
  if(res.through>0)st.chassis=Math.max(0,st.chassis-res.through);
  if(res.plate==null)res.plate=0;
  const taken=(res.plate||0)+res.parts.reduce((a,p)=>a+p.dmg,0)+(res.through||0);o.stats.taken+=taken;if(att>=0&&F.bots[att])F.bots[att].stats.dealt+=taken;
  /* the rolled parts of a failure */
  if(hadBat>0&&st.parts.battery<hadBat){if(st.parts.battery<=0){if(o.b.cfg.electronics==="failsafe"&&F.rng()<DAMAGE.cellSave){o.flags.cell=true;logIt(F,{k:"fail",v:o.i,what:"cell"});}}
    else if(!o.flags.smoke&&F.rng()<DAMAGE.smokeP)o.flags.smoke=true;}
  const elHp=(o.b.parts.find(p=>p.key==="electronics")||{}).hpJ||0;
  if(hadEl>0&&!o.flags.esc&&st.parts.electronics>0&&st.parts.electronics<elHp*DAMAGE.escSideAt){
    const ep=(o.b.parts.find(p=>p.key==="electronics")||{}).pos||[0,0];o.flags.esc=ep[0]<-1e-6?"left":ep[0]>1e-6?"right":F.rng()<0.5?"left":"right";
    logIt(F,{k:"fail",v:o.i,what:"esc",side:o.flags.esc});}
  o.fx=damageEffects(o.b,st,o.flags);
  const e=logHit(F,kind,kind==="land"?-1:att,o.i,kind==="land"?(opts.inverted?"top":"under"):face,opts.logE!=null?opts.logE:E,res);
  if(kind==="land")e.inv=opts.inverted?1:0;if(!e.x)delete e.x;if(opts.gl)e.gl=1;if(!e.p)delete e.p;
  for(const p of res.parts)if(p.destroyed)logIt(F,{k:"fail",v:o.i,what:"part",key:p.key});
  fxDiff(F,o,before);
  return res;}

/* ---- each step ---- */
function mobile(o){const f=o.fx;return!o.out&&!f.dead&&!o.flat&&!(f.sides.left.out&&f.sides.right.out)&&!(o.inverted&&!o.b.height.drivesInverted);}
function powerOf(o){return o.fx.power*(o.flat?0:1);}
function readInput(F,o,inputs){let u;
  if(o.ai)u=aiThink(F,o);
  else if(F.n%FIGHT.inputTick)return;   // the player's input holds between ticks
  else if(F.play&&F.play[o.i]){const p=F.play[o.i],k=Math.min(F.n/FIGHT.inputTick|0,p.n-1),Q=FIGHT.inputLevels;
    u={throttle:(p.ch[0][k]-Q-1)/Q,steer:(p.ch[1][k]-Q-1)/Q,weapon:p.ch[2][k]&1,selfRight:(p.ch[2][k]>>1)&1};}
  else{const raw=(inputs&&inputs[o.i])||{},rec=F.rec[o.i],Q=FIGHT.inputLevels,q=v=>{v=+v||0;return Math.round(clamp1(v)*Q)+Q+1;};
    let qt=q(raw.throttle),qs=q(raw.steer);const fl=(raw.weapon?1:0)|(raw.selfRight?2:0);
    const h=(v,l)=>(Math.abs(v-l)<FIGHT.inputHyst&&v!==1&&v!==2*Q+1&&v!==Q+1)?l:v;qt=h(qt,rec.last[0]);qs=h(qs,rec.last[1]);
    rec.last=[qt,qs,fl];for(let c=0;c<3;c++)rec.v[c].push(rec.last[c]);
    u={throttle:(qt-Q-1)/Q,steer:(qs-Q-1)/Q,weapon:fl&1,selfRight:(fl>>1)&1};}
  o.input=u;}

function stepWeapon(F,o){const w=o.b.weapon,u=o.input,dt=F.dt,f=o.fx,p=powerOf(o)*(o.heat.wDer?BENCH.derate:1),wp=o.wp;
  if(wp.recharge>0)wp.recharge-=dt;
  const upright=!o.inverted||(o.b.height.drivesInverted&&(w.type==="spinner"||w.type==="saw"));
  if(w.type==="spinner"||w.type==="saw"){if(!(w.inertia>0))return 0;const wm=w.omega,P=w.spinPowerW*p*(f.motorOk?1:0)*(o.flags.bent?DAMAGE.bentPower:1);
    const tau0=BENCH.spinTorque*w.spinPowerW/wm,c=BENCH.windage*w.spinPowerW/(wm*wm*wm);let tq=-c*wp.om*wp.om,draw=0;
    if(u.weapon&&P>0){tq+=Math.min(tau0*p,wp.om>0?P/wp.om:tau0*p);draw=o.b.power.weaponW*o.b.powerScale*p*(wp.om<0.98*wm?1:BENCH.windage*3);}
    else tq-=FIGHT.spinDrag*tau0;
    wp.om=Math.max(0,Math.min(wm,wp.om+tq/w.inertia*dt));return draw;}
  if(w.type==="flipper"){if(u.weapon&&f.motorOk&&wp.shots>0&&wp.recharge<=0&&!o.air&&upright){wp.shots--;wp.recharge=w.rechargeS||1;fireFlipper(F,o);}return 0;}
  if(w.type==="lifter"){const h=wp.held;
    if(h){const t=F.bots[h];if(!u.weapon||!f.motorOk||!zoneTouch(o,t)||t.air){t.held=null;wp.held=null;}
      else{wp.t+=dt;if(wp.t>=FIGHT.tipS&&w.liftM>=FIGHT.tipM*o.M.len){const flip=F.rng()<FIGHT.tipP;t.held=null;wp.held=null;
        launch(F,t,1.5*Math.sqrt(o.M.len),flip,o);logIt(F,{k:"tip",a:o.i,v:t.i,inv:flip?1:0});}}}
    else if(u.weapon&&f.motorOk&&upright&&!o.air){for(const t of F.bots)if(t!==o&&t.team!==o.team&&!t.out&&!t.held&&t.m<=w.canLiftKg&&zoneTouch(o,t)){
      wp.held=t.i;wp.t=0;t.held=o.i;logIt(F,{k:"lift",a:o.i,v:t.i});break;}}
    return u.weapon&&f.motorOk?o.b.power.weaponW*o.b.powerScale*p:0;}
  if(w.type==="hammer"||w.type==="crusher"){const S=w.type==="hammer"?(w.swingS||0.7):FIGHT.crushS/Math.max(o.b.powerScale,0.2),
      O=w.type==="hammer"?S/2:FIGHT.crushOpenS;
    if(wp.phase===0){if(u.weapon&&f.motorOk&&upright&&!o.air){wp.phase=1;wp.t=0;
      if(w.type==="crusher")for(const t of F.bots)if(t!==o&&t.team!==o.team&&!t.out&&!t.held&&zoneTouch(o,t)){wp.held=t.i;t.held=o.i;break;}}}
    else if(wp.phase===1){wp.t+=dt;if(wp.t>=(w.type==="hammer"?S/2:S)){strike(F,o);wp.phase=2;wp.t=0;if(wp.held!=null){F.bots[wp.held].held=null;wp.held=null;}}}
    else{wp.t+=dt;if(wp.t>=O){wp.phase=0;wp.t=0;}}
    return wp.phase===1?o.b.power.weaponW*o.b.powerScale*p:0;}
  return 0;}

/* a bot sent up: vz, a forward push, and whether it will land upside down */
function launch(F,t,vz,flip,by){t.air=true;t.vz=vz;t.z=Math.max(t.z,0.001);t.zPeak=t.z;t.flipNext=!!flip;t.under=null;t.held=null;
  if(by){const f=[Math.cos(by.h),Math.sin(by.h)],v=FIGHT.flipFwd*Math.sqrt(by.M.len);t.vx+=f[0]*v;t.vy+=f[1]*v;t.w+=rRange(F.rng,-6,6);}}
function invertChance(F,hM){const a=FIGHT.invertM[0]*F.M.len,b=FIGHT.invertM[1]*F.M.len;return FIGHT.invertMax*Math.max(0,Math.min(1,(hM-a)/(b-a)));}
function fireFlipper(F,o){const w=o.b.weapon,stroke=part("weapon",o.b.cfg.weapon).strokeMm*o.M.len/1000;let hit=false;
  for(const t of F.bots){if(t===o||t.team===o.team||t.out)continue;const c=zoneTouch(o,t);if(!c)continue;hit=true;
    if(t.m>w.canLiftKg){logIt(F,{k:"flip",a:o.i,v:t.i,h:0,heavy:1});continue;}
    const h=Math.max(0,w.launchJ*K.flipEff/(t.m*K.g)-stroke),flip=F.rng()<invertChance(F,h);
    launch(F,t,Math.sqrt(2*K.g*h),flip,o);logIt(F,{k:"flip",a:o.i,v:t.i,h:r2(h),inv:flip?1:0});fxPush(F,{k:"flip",x:c.px,y:c.py,E:w.launchJ,v:t.i});
    damageBot(F,t,faceAt(t,c.px,c.py),w.launchJ*FIGHT.flipDmg*(w.bite||1),"hit",o.i);o.stats.hits++;}
  if(!hit)logIt(F,{k:"flip",a:o.i,v:-1});}
function strike(F,o){const w=o.b.weapon,isC=w.type==="crusher";
  for(const t of F.bots){if(t===o||t.team===o.team||t.out)continue;const c=zoneTouch(o,t);if(!c)continue;
    let E=w.energyJ*(w.bite||1)*(1+FIGHT.biteJitter*(2*F.rng()-1))*(isC?1:FIGHT.hammerShare)*(o.under?WEDGE_RULES.underBite:1);
    const dfl=!isC&&!(t.under&&t.under.by===o.i)&&F.rng()<t.b.armourMapJ.top.deflect;if(dfl)E*=FIGHT.glance;
    damageBot(F,t,"top",E,"hit",o.i,{absorbMul:isC?FIGHT.crushAbsorb:1,gl:dfl});fxPush(F,{k:"hit",x:c.px,y:c.py,E,v:t.i});o.stats.hits++;o.wp.last[t.i]=F.t;return;}}
/* spinner hits: whenever the disc's zone touches another bot and the disc is up to speed */
function spinnerHits(F,o){const w=o.b.weapon,wp=o.wp;if(!(w.type==="spinner"||w.type==="saw")||!(w.inertia>0)||!o.fx.weaponOk||o.air)return;
  if(o.inverted&&!o.b.height.drivesInverted)return;
  for(const t of F.bots){if(t===o||t.team===o.team||t.out||t.air)continue;const c=zoneTouch(o,t);if(!c)continue;
    const face=o.zone.top?"top":faceAt(t,c.px,c.py);
    if(w.type==="saw"&&wp.om>=0.5*w.omega&&w.sawJps>0)damageBot(F,t,"top",w.sawJps*F.dt,"grind",o.i);
    if(wp.om<FIGHT.minSpin*w.omega||(wp.last[t.i]!=null&&F.t-wp.last[t.i]<FIGHT.hitGapS))continue;
    const stored=0.5*w.inertia*wp.om*wp.om,full=wp.om>=0.98*w.omega;
    let bite=Math.min(0.98,w.bite*(1+FIGHT.biteJitter*(2*F.rng()-1)))*(o.under?WEDGE_RULES.underBite:1);
    const dfl=!(t.under&&t.under.by===o.i)&&F.rng()<t.b.armourMapJ[face].deflect;if(dfl)bite*=FIGHT.glance;
    const E=stored*bite*(o.flags.bent?DAMAGE.bentMul:1);wp.om*=Math.sqrt(Math.max(0,1-bite));wp.last[t.i]=F.t;o.stats.hits++;
    damageBot(F,t,face,E*FIGHT.damageShare,"hit",o.i,{logE:E,gl:dfl});fxPush(F,{k:"hit",x:c.px,y:c.py,E,v:t.i});
    /* the throw: away from the disc (hsp: round the rim), part of it upward; the attacker takes recoil */
    const J=Math.sqrt(2*t.m*E*FIGHT.throwShare);let dx,dy;
    if(o.zone.circle){const cc=toWorld(o,o.zone.x,o.zone.y),rx=c.px-cc[0],ry=c.py-cc[1],l=Math.hypot(rx,ry)||1;dx=0.3*rx/l-0.7*ry/l;dy=0.3*ry/l+0.7*rx/l;}
    else{dx=Math.cos(o.h);dy=Math.sin(o.h);}
    const l=Math.hypot(dx,dy)||1,up=FIGHT.up[w.id]!=null?FIGHT.up[w.id]:0,jh=J*Math.sqrt(1-up*up);dx/=l;dy/=l;
    impulseAt(t,dx*jh,dy*jh,c.px,c.py);
    if(up>0){const vz=J*up/t.m,hM=vz*vz/(2*K.g);if(hM>=FIGHT.airM*t.M.len)launch(F,t,vz,F.rng()<invertChance(F,hM),null);}   // a smaller hop is a jolt, not a flight
    const kick=jh*FIGHT.recoilShare*(w.recoil||0);impulseAt(o,-dx*kick,-dy*kick,c.px,c.py);
    /* self-damage: a big hit bends the disc; a huge one at full speed shears the shaft */
    if(!o.flags.bent&&E>w.bendJ*(0.85+0.3*F.rng())){o.flags.bent=true;o.fx=damageEffects(o.b,o.st,o.flags);logIt(F,{k:"self",v:o.i,what:"bent",E:r2(E)});}
    if(full&&E>w.shearJ*(0.8+0.4*F.rng())&&o.st.parts.weapon>0){const before=o.fx;o.st.parts.weapon=0;o.fx=damageEffects(o.b,o.st,o.flags);logIt(F,{k:"self",v:o.i,what:"shear",E:r2(E)});fxDiff(F,o,before);}}}

function stepDrive(F,o){const dt=F.dt,b=o.b,d=b.drive,f=o.fx,g=K.g,u=o.input;let draw=0;
  const fw=[Math.cos(o.h),Math.sin(o.h)],rt=[Math.sin(o.h),-Math.cos(o.h)];
  if(o.air){o.cmd=[0,0];return 0;}
  const go=mobile(o)&&!o.righting,p=powerOf(o)*(o.heat.dDer?BENCH.derate:1);
  const gripMul=o.held!=null?FIGHT.liftGrip:o.under?WEDGE_RULES.underGrip:1;
  const vF=o.vx*fw[0]+o.vy*fw[1],half=b.trackM/2||b.widthM/2,v0=d.v0*Math.sqrt(Math.max(p,0.01)),N=o.m*g;
  let cL=go?clamp1(u.throttle+u.steer):0,cR=go?clamp1(u.throttle-u.steer):0;
  o.cmd=[cL,cR];let FL=0,FR=0;
  for(const s of [0,1]){const sd=s?f.sides.right:f.sides.left,cmd=s?cR:cL,vs=vF+(s?1:-1)*o.w*half;
    if(sd.out||!go)continue;
    let Fs=d.f0/2*p*sd.push*(cmd-(v0>0?vs/v0:0));const T=b.grip*N/2*sd.grip*gripMul;Fs=Fs>T?T:Fs<-T?-T:Fs;
    if(s)FR=Fs;else FL=Fs;draw+=b.power.driveW*b.powerScale*p*Math.abs(cmd)/2;}
  /* rolling resistance (harder with dead motors), never past a standstill */
  const crr=K.crr*N*(go?1:FIGHT.deadDrag)*gripMul,Fr=Math.abs(vF)*o.m/dt<crr?-vF*o.m/dt:-Math.sign(vF)*crr;
  const aF=(FL+FR+Fr)/o.m;o.vx+=fw[0]*aF*dt;o.vy+=fw[1]*aF*dt;
  /* tyres don't slide sideways easily */
  const vL=o.vx*rt[0]+o.vy*rt[1],lat=Math.min(Math.abs(vL),FIGHT.latGrip*b.grip*g*gripMul*dt);o.vx-=rt[0]*Math.sign(vL)*lat;o.vy-=rt[1]*Math.sign(vL)*lat;
  /* yaw: the two sides' difference, less the scrub of turning a skid-steer */
  o.w+=(FR-FL)*half/o.I*dt;const scrub=FIGHT.scrub*b.grip*N*half*gripMul/o.I*dt;o.w=Math.abs(o.w)<=scrub?0:o.w-Math.sign(o.w)*scrub;
  return draw;}

function stepHeat(F,o,driveW,weaponW){const h=o.b.heat,q=o.heat,dt=F.dt,full=o.b.power;
  q.d=Math.max(0,q.d+(h.drive.rateW*(full.driveW>0?driveW/(full.driveW*o.b.powerScale):0)-h.drive.coolW)*dt);
  if(!q.dDer&&q.d>=h.drive.budgetJ){q.dDer=true;logIt(F,{k:"heat",v:o.i,what:"drive"});}else if(q.dDer&&q.d<=BENCH.recoverAt*h.drive.budgetJ)q.dDer=false;
  if(h.weapon){q.w=Math.max(0,q.w+(h.weapon.rateW*(full.weaponW>0?weaponW/(full.weaponW*o.b.powerScale):0)-h.weapon.coolW)*dt);
    if(!q.wDer&&q.w>=h.weapon.budgetJ){q.wDer=true;logIt(F,{k:"heat",v:o.i,what:"weapon"});}else if(q.wDer&&q.w<=BENCH.recoverAt*h.weapon.budgetJ)q.wDer=false;}
  o.bat-=(driveW+weaponW+full.idleW)*dt;if(o.bat<=0&&!o.flat){o.bat=0;o.flat=true;logIt(F,{k:"fail",v:o.i,what:"flat"});}}

/* bots touching: push apart, bounce, rub; the wedge rule; small damage from hard knocks */
function collide(F,A,B){if(A.air||B.air||A.out==="pit"||B.out==="pit")return;
  const dx=B.x-A.x,dy=B.y-A.y;if(dx*dx+dy*dy>(A.rad+B.rad)*(A.rad+B.rad))return;
  const n=sat(A.pw,B.pw);if(!n)return;const cp=contactPoint(A.pw,B.pw,n),px=cp[0],py=cp[1];
  A.touch[B.i]=F.t;B.touch[A.i]=F.t;
  const ima=1/A.m,imb=1/B.m,corr=Math.max(0,n.depth-0.0005)*0.8/(ima+imb);
  A.x-=n.nx*corr*ima;A.y-=n.ny*corr*ima;B.x+=n.nx*corr*imb;B.y+=n.ny*corr*imb;
  const ra=[px-A.x,py-A.y],rb=[px-B.x,py-B.y];
  const va=[A.vx-A.w*ra[1],A.vy+A.w*ra[0]],vb=[B.vx-B.w*rb[1],B.vy+B.w*rb[0]],vr=[vb[0]-va[0],vb[1]-va[1]],vn=vr[0]*n.nx+vr[1]*n.ny;
  const fa=faceAt(A,px,py),fb=faceAt(B,px,py);
  wedgeRule(F,A,B,fa,fb);
  if(vn<0){const ca=ra[0]*n.ny-ra[1]*n.nx,cb=rb[0]*n.ny-rb[1]*n.nx,km=ima+imb+ca*ca/A.I+cb*cb/B.I;
    const jn=-(1+FIGHT.restitution)*vn/km;impulseAt(A,-n.nx*jn,-n.ny*jn,px,py);impulseAt(B,n.nx*jn,n.ny*jn,px,py);
    const tx=-n.ny,ty=n.nx,vt=vr[0]*tx+vr[1]*ty,ta=ra[0]*ty-ra[1]*tx,tb=rb[0]*ty-rb[1]*tx,kt=ima+imb+ta*ta/A.I+tb*tb/B.I;
    let jt=-vt/kt;const lim=FIGHT.contactMu*jn;jt=jt>lim?lim:jt<-lim?-lim:jt;impulseAt(A,-tx*jt,-ty*jt,px,py);impulseAt(B,tx*jt,ty*jt,px,py);
    const mu=1/(ima+imb),Elost=0.5*mu*vn*vn*(1-FIGHT.restitution*FIGHT.restitution)*FIGHT.ramShare;
    if(Elost>FIGHT.ramMinJ*F.M.mass){damageBot(F,A,fa,Elost,"ram",B.i);damageBot(F,B,fb,Elost,"ram",A.i);fxPush(F,{k:"ram",x:px,y:py,E:Elost});}}}
function edgeOf(o,face){return face==="front"?o.b.height.frontEdgeMm:o.b.height.clearanceMm;}
function wedgeRule(F,A,B,fa,fb){const tol=WEDGE_RULES.tolMm*F.M.edge,hold=WEDGE_RULES.holdS;
  const under=(X,Y,fy)=>{if(X.inverted&&!X.b.height.drivesInverted)return false;return edgeOf(X,"front")<edgeOf(Y,fy)-tol;};
  let win=null;
  if(fa==="front"&&under(A,B,fb))win=[A,B];else if(fb==="front"&&under(B,A,fa))win=[B,A];
  else if(fa==="front"&&fb==="front"&&Math.abs(edgeOf(A,"front")-edgeOf(B,"front"))<=tol){
    const sc=o=>(o.cfg.extras.indexOf("skid")>=0?2:0)+(["wedge","lifter","flipper"].indexOf(o.b.weapon.type)>=0?part("weaponMaterial",o.cfg.weaponMaterial).hp/1000:part("chassis",o.cfg.chassis).hp/1000);
    const a=sc(A),b=sc(B);if(Math.abs(a-b)>1e-9)win=a>b?[A,B]:[B,A];}
  if(!win||win[0].team===win[1].team)return;const[X,Y]=win;
  const seen=Y.underLog||(Y.underLog={});if(!(seen[X.i]>F.t-1.5))logIt(F,{k:"under",a:X.i,v:Y.i});seen[X.i]=F.t;   // one line per spell under
  Y.under={by:X.i,until:F.t+hold};if(X.under&&X.under.by===Y.i)X.under=null;}
function walls(F,o){const H=F.arena.half;
  for(const ax of [0,1])for(const sg of [-1,1]){let pen=0,pt=null;for(const v of o.pw){const p=v[ax]*sg-H;if(p>pen){pen=p;pt=v;}}
    if(!pt)continue;if(ax)o.y-=sg*pen;else o.x-=sg*pen;o.pw=worldPoly(o,o.poly);
    const nx=ax?0:-sg,ny=ax?-sg:0,r=[pt[0]-o.x,pt[1]-o.y],v=[o.vx-o.w*r[1],o.vy+o.w*r[0]],vn=v[0]*nx+v[1]*ny;
    if(vn<0){const cn=r[0]*ny-r[1]*nx,km=1/o.m+cn*cn/o.I,j=-(1+F.arena.wallE)*vn/km;impulseAt(o,nx*j,ny*j,pt[0],pt[1]);
      const tx=-ny,ty=nx,vt=v[0]*tx+v[1]*ty,ct=r[0]*ty-r[1]*tx,kt=1/o.m+ct*ct/o.I;let jt=-vt/kt;const lim=FIGHT.contactMu*j;jt=jt>lim?lim:jt<-lim?-lim:jt;impulseAt(o,tx*jt,ty*jt,pt[0],pt[1]);
      const E=0.5/km*vn*vn*(1-F.arena.wallE*F.arena.wallE)*FIGHT.ramShare;if(E>FIGHT.ramMinJ*F.M.mass&&!o.air){damageBot(F,o,faceAt(o,pt[0],pt[1]),E,"wall",-1);fxPush(F,{k:"wall",x:pt[0],y:pt[1],E});}}}}
/* the pit (from PR 4b's arenas): a bot whose centre is over it on the ground falls in */
function pitCheck(F,o){const P=F.arena.pit;if(!P||o.air||o.out)return;if(o.x>P[0]&&o.x<P[2]&&o.y>P[1]&&o.y<P[3]){o.out="pit";o.outAt=F.t;logIt(F,{k:"pit",v:o.i});}}

function stepFight(F,inputs){if(F.over)return F;const dt=F.dt;
  for(const o of F.bots)if(!o.out)readInput(F,o,inputs);else o.input={throttle:0,steer:0,weapon:0,selfRight:0};
  for(const o of F.bots){if(o.out==="pit")continue;
    const wW=o.out?0:stepWeapon(F,o),dW=o.out?0:stepDrive(F,o);stepHeat(F,o,dW,wW);
    /* self-righting */
    if(o.inverted&&!o.air&&!o.out){if(o.righting>0){o.righting-=dt;if(o.righting<=0){o.righting=0;o.inverted=false;logIt(F,{k:"right",v:o.i});}}
      else if(o.input.selfRight&&o.fx.righter&&!o.fx.dead&&!o.flat){const by=o.fx.righterBy;
        if(by==="weapon"&&o.b.weapon.type==="flipper"){if(o.wp.shots>0&&o.wp.recharge<=0){o.wp.shots--;o.wp.recharge=o.b.weapon.rechargeS||1;o.righting=0.3;}}
        else o.righting=FIGHT.rightS;}}
    else o.righting=0;
    /* the height axis */
    if(o.air){o.vz-=K.g*dt;o.z+=o.vz*dt;if(o.z>o.zPeak)o.zPeak=o.z;
      if(o.z<=0&&o.vz<0){o.z=0;o.vz=0;o.air=false;if(o.flipNext){o.inverted=!o.inverted;o.flipNext=false;logIt(F,{k:"inv",v:o.i,inv:o.inverted?1:0});}
        damageBot(F,o,"top",o.m*K.g*o.zPeak*BENCH.dropShare,"land",-1,{inverted:o.inverted});fxPush(F,{k:"land",x:o.x,y:o.y,E:o.m*K.g*o.zPeak,v:o.i});o.stats.landed++;o.zPeak=0;}}
    else o.z=o.under?WEDGE_RULES.liftMm*o.M.len/1000:o.held!=null?((F.bots[o.held].b.weapon.liftM)||0.02)*0.5:0;
    if(o.under&&F.t>o.under.until)o.under=null;
    o.x+=o.vx*dt;o.y+=o.vy*dt;o.h=wrapA(o.h+o.w*dt);o.pw=worldPoly(o,o.poly);}
  for(const o of F.bots)if(!o.out)spinnerHits(F,o);
  for(let i=0;i<F.bots.length;i++)for(let j=i+1;j<F.bots.length;j++){const A=F.bots[i],B=F.bots[j];collide(F,A,B);A.pw=worldPoly(A,A.poly);B.pw=worldPoly(B,B.poly);}
  for(const o of F.bots)if(o.out!=="pit"){walls(F,o);pitCheck(F,o);}
  /* knockouts: immobile for koS seconds. Upside down and unable to right counts; being knocked about doesn't stop the
     count (an immobile bot thrown by a spinner is still immobile); getting mobile again (righted) does */
  for(const o of F.bots){if(o.out)continue;const still=!mobile(o)&&!(o.righting>0&&o.fx.righter);
    o.immobileS=still?o.immobileS+dt:0;if(o.immobileS>=F.rules.koS){o.out="ko";o.outAt=F.t;logIt(F,{k:"ko",v:o.i});}}
  F.t+=dt;F.n++;
  const teams=[...new Set(F.bots.filter(o=>!o.out).map(o=>o.team))];
  if(teams.length<=1){F.over=true;F.endT=F.t;F.winner=teams.length?teams[0]:null;
    const last=F.bots.filter(o=>o.out).sort((a,b)=>b.outAt-a.outAt)[0];F.reason=teams.length?(last?last.out:"ko"):"draw";}
  else if(F.t>=F.rules.roundS-1e-9){F.over=true;F.endT=F.t;judgeFight(F);}
  if(F.over)logIt(F,{k:"end",w:F.winner,why:F.reason});
  return F;}
/* time up. First pass (PR 4a): the team that has lost the smaller share of its hp wins, a draw within 1%. PR 4b
   replaces this with the judges (JUDGE_WEIGHTS: damage, aggression, control). */
function judgeFight(F){const sc={};for(const o of F.bots){sc[o.team]=(sc[o.team]||0)+damageShare(o.b,o.st)/F.bots.filter(q=>q.team===o.team).length;}
  const ks=Object.keys(sc).sort((a,b)=>sc[a]-sc[b]);F.judge=sc;
  if(ks.length>1&&sc[ks[1]]-sc[ks[0]]<0.01){F.winner=null;F.reason="draw";}else{F.winner=F.bots.find(o=>String(o.team)===ks[0]).team;F.reason="time";}}

/* ---- the player's inputs, packed: three channels (throttle, steer, buttons), one value per input tick (30 Hz). Each
   channel is a list of tokens: a byte with the top bit set is a small step, value += ((b >> 3) & 15) - 7, held for
   (b & 7) + 1 ticks; any other byte starts a literal: its low 6 bits are run - 1 (bit 6: more run bytes follow, as a
   varint), then the value byte. The lot goes into one base64url string. A stick that never rests costs about a byte a
   tick per axis; one that does, almost nothing. ---- */
const B64C="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function b64e(by){let s="";for(let i=0;i<by.length;i+=3){const a=by[i],b=by[i+1],c=by[i+2],n=(a<<16)|((b||0)<<8)|(c||0);
  s+=B64C[n>>18&63]+B64C[n>>12&63]+(i+1<by.length?B64C[n>>6&63]:"")+(i+2<by.length?B64C[n&63]:"");}return s;}
function b64d(s){const o=[];let n=0,bits=0;for(const ch of s){const v=B64C.indexOf(ch);if(v<0)continue;n=((n<<6)|v)&0xFFFFFF;bits+=6;if(bits>=8){bits-=8;o.push((n>>bits)&255);}}return o;}
function packInputs(rec){const by=[];
  for(const vals of rec.v){let prev=null,i=0;
    while(i<vals.length){const v=vals[i];let run=1;while(i+run<vals.length&&vals[i+run]===v)run++;
      const d=prev==null?99:v-prev;
      if(d>=-7&&d<=7&&run<=8){by.push(0x80|((d+7)<<3)|(run-1));}
      else{let r=run-1;by.push((r&63)|(r>63?64:0));r>>>=6;while(r>0){by.push((r&127)|(r>127?128:0));r>>>=7;}by.push(v);}
      prev=v;i+=run;}}
  return{n:rec.v[0].length,d:b64e(by)};}
function unpackInputs(p){const by=b64d(p.d),n=p.n;let i=0;const ch=[];
  for(let c=0;c<3;c++){const arr=new Uint8Array(Math.max(n,1));let k=0,v=c<2?FIGHT.inputLevels+1:0;
    while(k<n&&i<by.length){const b=by[i++];let run;
      if(b&128){v+=((b>>3)&15)-7;run=(b&7)+1;}
      else{run=b&63;if(b&64){let sh=6,x;do{x=by[i++];run|=(x&127)<<sh;sh+=7;}while(x&128&&i<by.length);}run++;v=by[i++];}
      for(let q=0;q<run&&k<n;q++)arr[k++]=v;}
    while(k<arr.length)arr[k++]=v;ch.push(arr);}
  return{n,ch};}

/* ---- the result and the log ---- */
function fightLog(F){const L={v:1,seed:F.seed,cls:F.cls,arena:F.spec.arena,rules:F.spec.rules,steps:F.n,bots:F.spec.bots,
    entries:F.log,inputs:{}};
  for(const i in F.rec)L.inputs[i]=packInputs(F.rec[i]);
  /* stay under the cap. Dropped first: hits that broke nothing, then small landings, then the repeatable moments (under,
     flips, lifts, self-rights, overheating), then hits that damaged parts, smallest first. Failures, knockouts, the end
     and the player's inputs (the replay) are never dropped. */
  let sz=JSON.stringify(L).length;
  const tier=e=>{switch(e.k){case"hit":case"ram":case"wall":case"grind":return e.x?3:0;case"land":return e.x&&e.x.some(p=>p[2])?9:1;
    case"under":case"lift":case"tip":case"right":case"heat":case"inv":case"flip":return 2;default:return 9;}};
  if(sz>FIGHT.logMaxB){const small=L.entries.map((e,i)=>({e,i,t:tier(e)})).filter(q=>q.t<9).sort((a,b)=>a.t-b.t||(a.e.E||0)-(b.e.E||0));
    const drop=new Set(),cap=FIGHT.logMaxB-64,all=L.entries;let k=0;   // estimate down to a margin, then measure
    for(;k<small.length&&sz>cap;k++){drop.add(small[k].i);sz-=JSON.stringify(small[k].e).length+1;}
    L.trimmed=0;L.entries=all.filter((e,i)=>!drop.has(i));L.trimmed=drop.size;
    while(JSON.stringify(L).length>FIGHT.logMaxB&&k<small.length){drop.add(small[k++].i);L.entries=all.filter((e,i)=>!drop.has(i));L.trimmed=drop.size;}}
  return L;}
function fightResult(F){return{over:F.over,winner:F.winner,reason:F.reason,timeS:r2(F.endT!=null?F.endT:F.t),judge:F.judge||null,
  bots:F.bots.map(o=>({i:o.i,name:o.name,team:o.team,out:o.out,inverted:o.inverted,damage:damageTaken(o.b,o.st),states:partStates(o.b,o.st),
    share:r2(damageShare(o.b,o.st)),stats:{dealt:r2(o.stats.dealt),taken:r2(o.stats.taken),hits:o.stats.hits,landed:o.stats.landed}})),
  log:fightLog(F)};}
function runFight(opts){const F=newFight(opts),cap=Math.ceil(F.rules.roundS*STEP_HZ)+2;let k=0;
  while(!F.over&&k++<cap)stepFight(F,opts&&opts.inputs?opts.inputs(F):null);
  return fightResult(F);}
/* the same fight from its log: seed, builds, arena, rules and the player's recorded inputs */
function replayFight(log){const play={};for(const i in log.inputs||{})play[i]=unpackInputs(log.inputs[i]);
  return runFight({seed:log.seed,arena:log.arena,rules:log.rules,bots:log.bots.map(b=>Object.assign({},b,{team:b.team})),play});}
