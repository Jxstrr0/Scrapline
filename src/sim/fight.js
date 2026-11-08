/* ---- fight.js: the fight, plan section 7a. N bots at a fixed 60 Hz step, deterministic from a seed.
     newFight({bots, arena, seed, rules, fx})   bots: [{cfg, team, name, driver, damage}]. driver {style, skill} is an AI
                                            (sim/ai.js); driver null is the player, who hands in inputs each step.
                                            damage: J already taken per key (S.bots[cls].damage), or nothing for fresh.
                                            flags: {bent, smoke, cell, esc} carries failures in (a best-of-three
                                            round after a pit window that didn't fix them).
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
   A hit from above (hammer, crusher, saw) can come down into an open weapon bay (b.bay, inBay) and skip the top plate.
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
  underGripClass:{feather:0.4,heavy:0.45},   // ... more in these classes (the feather and heavy wedges sat over the balance target: PR 4b, 0.1.12.0)
  underBite:0.5,    // and its own weapon lands this share of its energy ...
  underBiteBy:{vsp:0.9,drum:0.75},   // ... except a vertical disc, which still bites the wedge it's sitting on
  discGuard:{vsp:0.5,drum:0.6},   // a vertical disc or drum spinning above this share of full speed meets a wedge first:
                    // nothing gets under its front, and the disc bites the wedge's lip instead (plan 8e: vertical beats wedge)
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
  slope:{wedge:0.6,flipper:0.2,lifter:0.2},   // a sloped front adds this to the chance a horizontal disc's hit glances off it
  horizontal:{hsp:1,under:1}, // the spinners whose hits a sloped front turns (a vertical bites the edge instead) ...
  lip:{vsp:1.8,drum:1.3},     // ... and a vertical that hits a sloped front catches its lip: this x the energy, no glance
  gyro:{vsp:0.3,drum:0.24},   // a vertical disc at full speed fights turning: this share of the steering is lost, x rpm share ...
  gyroClass:{heavy:1.35},     // ... x this in a class (a heavyweight's disc is a flywheel the size of a manhole cover)
  selfFlip:{vsp:0.01,drum:0.005},   // a full-power hit can throw a vertical spinner onto its back: this chance x the hit's share of full energy
  damageShare:0.4,            // a spinner hit's energy that goes into damage ...
  throwShare:0.15,            // ... and into throwing the target
  recoilShare:0.5,            // the attacker takes this x the throw impulse x the weapon's recoil, the other way
  up:{hsp:0,vsp:0.6,drum:0.5,under:0.3,saw:0},   // share of a spinner's throw that goes upward
  flipDmg:0.15,               // a flipper's arm hit: this x launchJ x bite in damage
  flipFwd:1,                  // m/s forward a flipped bot carries (x sqrt len)
  flipThrow:{ant:1.6,beetle:1.8,hobby:1.8},   // 0.1.17.5: a flipper's own flip throws this much further again (m/s, x sqrt len), in the
                              // classes where flippers fell short: a flip near the pit or a wall can finish the fight
  flipStunS:{ant:0.6,beetle:0.6,hobby:0.5},   // ... and a bot that lands from a flipper's flip has no drive for this long (wheels and
                              // nerve both rattled), so the flipper can follow up
  invertM:[0.08,0.25],        // a flip or throw this high (m, x len) may land the bot upside down, rising to ...
  invertMax:0.85,             // ... this chance at the top of the range
  holdMaxS:10,                // the league's rule: a lift or a pin lets go after this long ...
  releaseS:1.2, releaseThr:0.7,   // ... and a pin (under a wedge or against a wall) is broken by the pinner backing off this long, at this throttle
  liftGrip:0.1,               // a bot held up on a lifter or in a crusher keeps this share of grip
  tipS:0.8, tipM:0.05, tipP:0.75,   // a lifter that holds a bot this long and lifts this high (m, x len) tips it over this often
  crushS:1, crushOpenS:0.6, crushAbsorb:0.5,   // a crusher's bite, opening again, and the share of absorb its point leaves
  hammerShare:0.9,            // share of a hammer blow that goes into damage
  lethal:{ant:1,beetle:1,hobby:1,feather:1,heavy:1.2},   // weapon damage x this in each class (heavies' discs spin up slower and land fewer full hits)
  /* a spinner hit with at least minShare of its full energy can shake the electronics loose (a lead out, an ESC off its
     mount) whatever the armour: this chance per class (failsafe electronics halve it). Plan 8e: single-hit knockouts
     3-8% of fights in the heavier classes, fewer in ant and beetle. */
  shock:{minShare:0.6,p:{ant:0.0005,beetle:0.001,hobby:0.003,feather:0.006,heavy:0.0075}},
  rightS:1.2,                 // seconds to self-right
  hazCtrlS:3,                 // the judges count a shove into a hazard as this many seconds of control for whoever pushed
  flipCtrlS:{ant:2,beetle:2,hobby:2},   // ... and a flip that sends a bot up (0.1.17.5) as this many for the flipper, in the classes
                              // where flippers fell short (feather and heavy flippers were already level)
  /* the judges' bookkeeping: closing at this share of the bot's top speed counts as aggression (away from the enemy at it,
     as retreating); pinned against a wall means slower than pinV x top speed with an enemy on it */
  judge:{closeV:0.2,pinV:0.3,driveV:0.25,
    /* each term is shared as (what a team did + ref) / the total, so a scratch against nothing is a small lead, not the
       whole term: damage in shares of a bot's hp, aggression and control in shares of the round */
    ref:{damage:0.1,aggression:0.1,control:0.05}},
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
  zone:{hsp:{circle:1},vsp:{w:0.7},drum:{w:1},under:{w:0.8},saw:{w:0.4,top:1},flipper:{w:1},lifter:{w:1},
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
/* an arena at the class's scale, turned by k x 90 degrees (k from the seed: sim/arenas.js) */
function arenaOf(a,cls,seed){const M=classMult(cls),L=M.len;let A=typeof a==="string"?ARENAS[a]:a&&typeof a==="object"?a:null;
  if(!A)A={id:"box",name:"Test box",sizeM:FIGHT.arenaM};
  const k=((seed>>>0)>>>4)&3,rot=(x,y)=>{for(let i=0;i<k;i++){const t=x;x=-y;y=t;}return[x,y];};
  const rect=r=>{const p=rot(r[0],r[1]),q=rot(r[2],r[3]);return[Math.min(p[0],q[0])*L,Math.min(p[1],q[1])*L,Math.max(p[0],q[0])*L,Math.max(p[1],q[1])*L];};
  const side=(A.sizeM||FIGHT.arenaM)*L,P=A.pit?(Array.isArray(A.pit)?{rect:A.pit,openS:0}:A.pit):null;
  const haz=(A.hazards||[]).map(h=>{const o=Object.assign({},h);if(h.rect)o.rect=rect(h.rect);if(h.n)o.n=rot(h.n[0],h.n[1]);
    if(h.at){const p=rot(h.at[0],h.at[1]);o.at=[p[0]*L,p[1]*L];}if(h.rM)o.rM=h.rM*L;return o;});
  return{id:A.id||"custom",name:A.name||"Arena",half:side/2,wallE:A.wallE!=null?A.wallE:FIGHT.wallE,
    pit:P?{rect:rect(P.rect),openS:P.openS||0}:null,haz,turn:k,def:A};}
function newBot(spec,i,F){const b=evalBuild(spec.cfg),cfg=b.cfg,M=classMult(b.cls);
  const o={i,team:spec.team!=null?spec.team:i,name:spec.name||b.className,cfg,b,driver:spec.driver||null,M,
    x:0,y:0,h:0,vx:0,vy:0,w:0,z:0,vz:0,zPeak:0,air:false,inverted:false,flipNext:false,
    m:b.massKg,I:Math.max(b.moi,1e-6),poly:b.polygon.map(p=>[p[0]-b.com.x,p[1]-b.com.y]),pw:null,rad:0,
    zone:weaponZone(b),st:damageState(b,spec.damage),flags:Object.assign({esc:null,smoke:false,cell:false,bent:false},carryFlags(spec.flags)),fx:null,
    wp:{om:0,shots:b.weapon.shots||0,recharge:0,phase:0,t:0,held:null,last:{}},
    heat:{d:0,w:0,dDer:false,wDer:false},bat:b.power.batteryWs,flat:false,
    under:null,held:null,righting:0,immobileS:0,out:null,outAt:null,dazed:-1,stunNext:0,
    input:{throttle:0,steer:0,weapon:0,selfRight:0},cmd:[0,0],touch:{},wallT:null,pin:null,release:-1,releaseFrom:-1,airBy:null,invBy:null,
    stats:{dealt:0,taken:0,hits:0,landed:0,failHits:0},jd:{close:0,contact:0,retreat:0,ctrl:0}};
  o.rad=Math.max(...o.poly.map(p=>Math.hypot(p[0],p[1])));
  o.fx=damageEffects(b,o.st,o.flags);
  /* a season's spinner energy cap (rules.capJ, PR 8): the disc's top speed comes down until it stores no more than that */
  const w=b.weapon,cap=F&&F.rules.capJ;
  if(cap>0&&(w.type==="spinner"||w.type==="saw")&&w.storedJ>cap){const k=Math.sqrt(cap/w.storedJ);
    o.b=Object.assign({},b,{weapon:Object.assign({},w,{omega:w.omega*k,rpm:w.rpm*k,tipSpeed:w.tipSpeed*k,storedJ:cap,energyJ:cap,capped:true})});}
  return o;}
/* a bot's minibot (sim/parts.js MINIBOT): dropped off behind it at the bell, on its team, AI-driven at its parent's
   skill (0.5 for the player's). Only when the parent's minibot part isn't destroyed. */
function newMini(F,o){const cls=MINIBOT.cls[o.b.cls];if(!cls||o.cfg.extras.indexOf("minibot")<0)return null;
  if(partStates(o.b,o.st).minibot==="destroyed")return null;
  const sk=o.driver&&o.driver.skill!=null?o.driver.skill:0.5,i=F.bots.length;
  const m=newBot({cfg:Object.assign({},MINIBOT.cfg,{cls}),team:o.team,name:o.name+"'s minibot",driver:Object.assign({},MINIBOT.driver,{skill:sk})},i,F);
  m.mini=true;m.parent=o.i;const d=o.rad+m.rad+0.01*F.M.len;
  m.x=o.x-Math.cos(o.h)*d;m.y=o.y-Math.sin(o.h)*d;m.h=o.h;m.pw=worldPoly(m,m.poly);
  m.ai=aiNew(m,(F.seed^Math.imul(0x85EBCA6B,i+1))>>>0,F);return m;}
/* the bots that count (minibots don't, for knockouts or the judges) */
const mainBots=F=>F.bots.filter(o=>!o.mini);
function newFight(opts){opts=opts||{};const seed=(opts.seed>>>0)||1,specs=(opts.bots||[]).filter(s=>s&&s.cfg);
  if(specs.length<2)throw new Error("newFight needs two bots or more");
  const cls=normCfg(specs[0].cfg).cls,rules=Object.assign({roundS:FIGHT.roundS,koS:FIGHT.koS},opts.rules||{});
  const F={seed,rng:rng(seed),t:0,n:0,dt:1/STEP_HZ,cls,M:classMult(cls),arena:arenaOf(opts.arena,cls,seed),rules,bots:[],
    log:[],over:false,winner:null,reason:null,endT:null,rec:{},play:opts.play||null,fxq:opts.fx?[]:null,
    spec:{arena:opts.arena&&typeof opts.arena==="object"?opts.arena:(opts.arena||"box"),rules:opts.rules||{},
      bots:specs.map(s=>({cfg:normCfg(s.cfg),team:s.team!=null?s.team:null,name:s.name||null,
        driver:s.driver?Object.assign({},s.driver):null,damage:s.damage?Object.assign({},s.damage):null,flags:carryFlags(s.flags)}))}};   // copies: the log is the fight as it started
  F.bots=specs.map((s,i)=>newBot(s,i,F));F.hz=F.arena.haz.map(()=>({ready:0,until:-1,hit:{}}));
  /* start: spread on a ring, facing the middle, a little jitter from the seed */
  const n=F.bots.length,R=F.arena.half*0.6;
  /* the ring is turned so the pit and the floor spinners are as far as they can be from the nearest start (distance to
     the pit's centre, or to a spinner's rim); in a 1v1, both bots equally far */
  const keep=[];if(F.arena.pit){const r=F.arena.pit.rect;keep.push([(r[0]+r[2])/2,(r[1]+r[3])/2,0]);}
  for(const h of F.arena.haz)if(h.type==="spinner")keep.push([h.at[0],h.at[1],h.rM]);
  let off=-Math.PI/2;if(keep.length){let best=-1e9;
    for(let k=0;k<8;k++){const a0=-Math.PI/2+k*Math.PI/4/n;let m=1e9;for(let i=0;i<n;i++){const a=a0+2*Math.PI*i/n;for(const q of keep)m=Math.min(m,Math.hypot(R*Math.cos(a)-q[0],R*Math.sin(a)-q[1])-q[2]);}
      if(m>best+1e-9){best=m;off=a0;}}}
  F.bots.forEach((o,i)=>{const a=off+2*Math.PI*i/n+rRange(F.rng,-0.04,0.04);o.x=R*Math.cos(a);o.y=R*Math.sin(a);
    if(F.arena.pit){const r=F.arena.pit.rect,e=o.rad*1.2;for(let k=0;k<20&&o.x>r[0]-e&&o.x<r[2]+e&&o.y>r[1]-e&&o.y<r[3]+e;k++){o.x*=0.9;o.y*=0.9;}}   // never start over the pit
    o.h=wrapA(a+Math.PI+rRange(F.rng,-0.08,0.08));o.pw=worldPoly(o,o.poly);
    if(o.driver)o.ai=aiNew(o,(seed^Math.imul(0x9E3779B1,i+1))>>>0,F);
    else F.rec[i]={v:[[],[],[]],last:[FIGHT.inputLevels+1,FIGHT.inputLevels+1,0]};});
  /* minibots go on the end, so every main bot keeps its index (and the player is still bot 0) */
  for(const o of F.bots.slice()){const m=newMini(F,o);if(m)F.bots.push(m);}
  return F;}

/* ---- the log ---- */
const r2=v=>Math.round(v*100)/100;
/* where things happened, for a view to flash (newFight({fx:true}) only; the view drains it; never in the log) */
/* the vis's events (only with fx on); a hit or hazard carries what it damaged from damageBot (F.fxHit): keys, the parts it hurt, and d, the share of the bot's health it took */
function fxPush(F,e){if(!F.fxq)return;const h=F.fxHit;F.fxHit=null;if(h&&e.v===h.v){e.keys=h.keys;e.d=h.d;}F.fxq.push(e);if(F.fxq.length>64)F.fxq.shift();}
/* failure flags carried in from an earlier round (a best of three): a bent disc, a smoking battery, a failsafe cell
   keeping a dead battery going, a dead speed-controller side. Only the ones set, or null */
function carryFlags(f){if(!f||typeof f!=="object")return null;const o={};if(f.bent)o.bent=true;if(f.smoke)o.smoke=true;if(f.cell)o.cell=true;
  if(f.esc==="left"||f.esc==="right")o.esc=f.esc;return Object.keys(o).length?o:null;}
function logIt(F,e){e.t=r2(F.t);F.log.push(e);return e;}
/* a hit (or a landing): a small one that destroys nothing is merged into a matching entry from the last half second
   (same kind, attacker, victim and face, and both in the weapon bay or both not), so grinding contact and little
   bounces stay one line. bay:1 marks a hit that came down into the open weapon bay (0.1.15.3); bay:2, into the bay underneath a bot
   upside down */
function logHit(F,k,a,v,face,E,res,bay){const small=E<FIGHT.microJ*F.M.mass&&!(res&&res.parts.some(p=>p.destroyed));
  if(small)for(let i=F.log.length-1,n=0;i>=0&&n<6;i--,n++){const L=F.log[i];if(F.t-L.t>=0.5)break;
    if(L.k===k&&L.a===a&&L.v===v&&L.f===face&&(L.bay||0)===(bay||0)&&!(L.x&&L.x.some(q=>q[2]))){L.E=r2(L.E+E);L.n=(L.n||1)+1;
      if(res){L.p=r2((L.p||0)+(res.plate||0));for(const p of res.parts){const q=L.x&&L.x.find(z=>z[0]===p.key);if(q)q[1]=r2(q[1]+p.dmg);else(L.x=L.x||[]).push([p.key,r2(p.dmg),0]);}}
      return L;}}
  const e={k,a,v,f:face,E:r2(E)};if(bay)e.bay=bay;if(res){e.p=r2(res.plate||0);if(res.plateBroken)e.pb=1;if(res.parts.length)e.x=res.parts.map(p=>[p.key,r2(p.dmg),p.destroyed?1:0]);}
  return logIt(F,e);}

/* ---- damage to a bot, and the failures it sets off ---- */
function fxDiff(F,o,before){const a=before,b=o.fx,n0=F.log.length,L=(k,extra)=>logIt(F,Object.assign({k:"fail",v:o.i,what:k},extra||{}));
  for(const s of ["left","right"])if(!a.sides[s].out&&b.sides[s].out)L("side",{side:s});
  if(a.power===1&&b.power<1&&b.power>0&&o.flags.smoke&&!o.flags.cell)L("smoke");
  if(!a.dead&&b.dead)L("dead",{why:b.dead});
  if(a.motorOk&&!b.motorOk&&b.weaponOk)L("motor");
  if(a.weaponOk&&!b.weaponOk)L("weapon");
  if(a.righter&&!b.righter)L("righter");
  if(!a.flexing&&b.flexing)L("flex");
  return F.log.length-n0;}
/* does a hit from above on bot t come down into its open weapon bay? The bay's share of the top (its share of the
   underside when t is upside down) x DAMAGE.bayMul. Draws from the fight's generator only when there is a share, so a
   bot with no open bay leaves the fight's sequence exactly as it was. Never for a landing (damageBot's caller decides). */
function inBay(F,t){const y=t.b.bay,p=y?(t.inverted?y.belowFrac:y.topFrac)*DAMAGE.bayMul:0;return p>0&&F.rng()<p;}
function damageBot(F,o,face,E,kind,att,opts){opts=opts||{};F.fxHit=null;if(E<=0||o.out==="pit")return null;const before=o.fx;
  const st=o.st,hadBat=st.parts.battery,hadEl=st.parts.electronics,bay=opts.bay&&kind!=="land"&&!opts.below?(o.inverted?2:1):0;   // 2: into the bay underneath, upside down
  const s0=F.fxq&&(kind==="hit"||kind==="haz")?damageShare(o.b,st):-1;   // fx only: the damage number over the bot
  const res=kind==="land"||opts.below?landHit(o.b,st,E,opts.inverted):hitFace(o.b,face,E,st,o.fx.absorbMul*(opts.absorbMul||1),bay);
  if(opts.shock&&st.parts.electronics>0&&F.rng()<opts.shock*(o.b.cfg.electronics==="failsafe"?0.5:1)){st.parts.electronics=0;logIt(F,{k:"fail",v:o.i,what:"shock"});}
  if(res.hit){res.plate=res.hit.plate;res.plateBroken=res.hit.plateBroken;res.through=res.hit.through;}
  if(res.through>0)st.chassis=Math.max(0,st.chassis-res.through);
  if(res.plate==null)res.plate=0;
  const taken=(res.plate||0)+res.parts.reduce((a,p)=>a+p.dmg,0)+(res.through||0);o.stats.taken+=taken;if(att>=0&&F.bots[att]&&!o.mini)F.bots[att].stats.dealt+=taken;   // what's done to a minibot doesn't impress the judges
  /* the rolled parts of a failure */
  if(hadBat>0&&st.parts.battery<hadBat){if(st.parts.battery<=0){if(o.b.cfg.electronics==="failsafe"&&F.rng()<DAMAGE.cellSave){o.flags.cell=true;logIt(F,{k:"fail",v:o.i,what:"cell"});}}
    else if(!o.flags.smoke&&F.rng()<DAMAGE.smokeP)o.flags.smoke=true;}
  const elHp=(o.b.parts.find(p=>p.key==="electronics")||{}).hpJ||0;
  if(hadEl>0&&!o.flags.esc&&st.parts.electronics>0&&st.parts.electronics<elHp*DAMAGE.escSideAt){
    const ep=(o.b.parts.find(p=>p.key==="electronics")||{}).pos||[0,0];o.flags.esc=ep[0]<-1e-6?"left":ep[0]>1e-6?"right":F.rng()<0.5?"left":"right";
    logIt(F,{k:"fail",v:o.i,what:"esc",side:o.flags.esc});}
  o.fx=damageEffects(o.b,st,o.flags);
  if(s0>=0){const keys=res.parts.filter(p=>p.dmg>0).map(p=>p.key);if(res.plate>0&&FACES.includes(face))keys.push("armour_"+face);if(res.through>0)keys.push("chassis");
    F.fxHit={v:o.i,keys,d:damageShare(o.b,st)-s0};}
  const e=logHit(F,kind,kind==="land"?-1:att,o.i,kind==="land"?(opts.inverted?"top":"under"):face,opts.logE!=null?opts.logE:E,res,bay);
  if(kind==="land")e.inv=opts.inverted?1:0;if(!e.x)delete e.x;if(opts.gl)e.gl=1;if(!e.p)delete e.p;if(opts.tag)Object.assign(e,opts.tag);
  let broke=0;for(const p of res.parts)if(p.destroyed){broke++;logIt(F,{k:"fail",v:o.i,what:"part",key:p.key});}
  if(fxDiff(F,o,before)+broke>0)o.stats.failHits++;   // a hit that broke something (lethality: tools/fight-test.js)
  return res;}

/* ---- each step ---- */
function mobile(o){const f=o.fx;return!o.out&&!f.dead&&!o.flat&&!(f.sides.left.out&&f.sides.right.out)&&!(o.inverted&&!o.b.height.drivesInverted);}
function powerOf(o){return o.fx.power*(o.flat?0:1);}
function readInput(F,o,inputs){let u;
  if(o.ai)u=aiThink(F,o);
  else if(F.n%FIGHT.inputTick)return;   // the player's input holds between ticks
  else if(F.play&&F.play[o.i]){const p=F.play[o.i],k=Math.max(0,Math.min(F.n/FIGHT.inputTick|0,p.n-1)),Q=FIGHT.inputLevels,
      at=c=>{const v=p.ch[c]&&p.ch[c][k];return v>=0?v:c<2?Q+1:0;};   // a missing or damaged stream reads as hands off
    u={throttle:clamp1((at(0)-Q-1)/Q),steer:clamp1((at(1)-Q-1)/Q),weapon:at(2)&1,selfRight:(at(2)>>1)&1};}
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
    if(h!=null){const t=F.bots[h];if(!u.weapon||!f.motorOk||f.dead||!(p>0)||t.out||!zoneTouch(o,t)||t.air){t.held=null;wp.held=null;}
      else if((wp.t+=dt)>=FIGHT.holdMaxS){t.held=null;wp.held=null;wp.recharge=2;logIt(F,{k:"drop",a:o.i,v:t.i});}
      else{if(wp.t>=FIGHT.tipS&&w.liftM>=FIGHT.tipM*o.M.len){const flip=F.rng()<FIGHT.tipP;t.held=null;wp.held=null;
        launch(F,t,1.5*Math.sqrt(o.M.len),flip,o);logIt(F,{k:"tip",a:o.i,v:t.i,inv:flip?1:0});}}}
    else if(u.weapon&&f.motorOk&&upright&&!o.air&&!(wp.recharge>0)){for(const t of F.bots)if(t!==o&&t.team!==o.team&&!t.out&&t.held==null&&t.m<=w.canLiftKg&&zoneTouch(o,t)){
      wp.held=t.i;wp.t=0;t.held=o.i;logIt(F,{k:"lift",a:o.i,v:t.i});break;}}
    return u.weapon&&f.motorOk?o.b.power.weaponW*o.b.powerScale*p:0;}
  if(w.type==="hammer"||w.type==="crusher"){const S=w.type==="hammer"?(w.swingS||0.7):FIGHT.crushS/Math.max(o.b.powerScale,0.2),
      O=w.type==="hammer"?S/2:FIGHT.crushOpenS;
    if(wp.phase===0){if(u.weapon&&f.motorOk&&upright&&!o.air){wp.phase=1;wp.t=0;
      if(w.type==="crusher")for(const t of F.bots)if(t!==o&&t.team!==o.team&&!t.out&&t.held==null&&zoneTouch(o,t)){wp.held=t.i;t.held=o.i;break;}}}
    else if(wp.phase===1){wp.t+=dt;if(wp.t>=(w.type==="hammer"?S/2:S)){strike(F,o);wp.phase=2;wp.t=0;if(wp.held!=null){F.bots[wp.held].held=null;wp.held=null;}}}
    else{wp.t+=dt;if(wp.t>=O){wp.phase=0;wp.t=0;}}
    return wp.phase===1?o.b.power.weaponW*o.b.powerScale*p:0;}
  return 0;}

/* a bot sent up: vz, a forward push, and whether it will land upside down */
function launch(F,t,vz,flip,by,att,fwd){t.air=true;t.stunNext=0;t.vz=vz;t.z=Math.max(t.z,0.001);t.zPeak=t.z;t.flipNext=!!flip;t.under=null;t.held=null;
  t.airBy=by?by.i:att!=null?att:null;
  if(by){const f=[Math.cos(by.h),Math.sin(by.h)],v=(FIGHT.flipFwd+(fwd||0))*Math.sqrt(by.M.len);t.vx+=f[0]*v;t.vy+=f[1]*v;t.w+=rRange(F.rng,-6,6);}}
function invertChance(F,hM){const a=FIGHT.invertM[0]*F.M.len,b=FIGHT.invertM[1]*F.M.len;return FIGHT.invertMax*Math.max(0,Math.min(1,(hM-a)/(b-a)));}
function fireFlipper(F,o){const w=o.b.weapon,stroke=part("weapon",o.b.cfg.weapon).strokeMm*o.M.len/1000;let hit=false;
  for(const t of F.bots){if(t===o||t.team===o.team||t.out)continue;const c=zoneTouch(o,t);if(!c)continue;hit=true;
    if(t.m>w.canLiftKg){logIt(F,{k:"flip",a:o.i,v:t.i,h:0,heavy:1});continue;}
    const h=Math.max(0,w.launchJ*K.flipEff/(t.m*K.g)-stroke),flip=F.rng()<invertChance(F,h);if(!o.mini&&!t.mini)o.jd.ctrl+=FIGHT.flipCtrlS[F.cls]||0;
    launch(F,t,Math.sqrt(2*K.g*h),flip,o,null,FIGHT.flipThrow[F.cls]||0);t.stunNext=FIGHT.flipStunS[F.cls]||0;logIt(F,{k:"flip",a:o.i,v:t.i,h:r2(h),inv:flip?1:0});
    damageBot(F,t,faceAt(t,c.px,c.py),w.launchJ*FIGHT.flipDmg*(w.bite||1)*lethalOf(F),"hit",o.i);fxPush(F,{k:"flip",x:c.px,y:c.py,E:w.launchJ,v:t.i});o.stats.hits++;}
  if(!hit)logIt(F,{k:"flip",a:o.i,v:-1});}
function lethalOf(F){return FIGHT.lethal[F.cls]||1;}
function strike(F,o){const w=o.b.weapon,isC=w.type==="crusher";
  for(const t of F.bots){if(t===o||t.team===o.team||t.out)continue;const c=zoneTouch(o,t);if(!c)continue;
    let E=w.energyJ*(w.bite||1)*(1+FIGHT.biteJitter*(2*F.rng()-1))*(isC?1:FIGHT.hammerShare)*(o.under?WEDGE_RULES.underBite:1)*lethalOf(F);
    const bay=inBay(F,t),dfl=!bay&&!isC&&!(t.under&&t.under.by===o.i)&&F.rng()<t.b.armourMapJ.top.deflect;if(dfl)E*=FIGHT.glance;   // into the bay: no plate to glance off
    damageBot(F,t,"top",E,"hit",o.i,{absorbMul:isC?FIGHT.crushAbsorb:1,gl:dfl,bay});fxPush(F,{k:"hit",x:c.px,y:c.py,E,v:t.i});o.stats.hits++;o.wp.last[t.i]=F.t;return;}}
/* spinner hits: whenever the disc's zone touches another bot and the disc is up to speed */
function spinnerHits(F,o){const w=o.b.weapon,wp=o.wp;if(!(w.type==="spinner"||w.type==="saw")||!(w.inertia>0)||!o.fx.weaponOk||o.air)return;
  if(o.inverted&&!o.b.height.drivesInverted)return;
  for(const t of F.bots){if(t===o||t.team===o.team||t.out||t.air)continue;const c=zoneTouch(o,t);if(!c)continue;
    const face=o.zone.top?"top":faceAt(t,c.px,c.py);
    if(w.type==="saw"&&wp.om>=0.5*w.omega&&w.sawJps>0){const gb=wp.grBay||(wp.grBay={}),q=gb[t.i];   /* the grind rolls for the bay once a half second, so its log lines merge */
      const bay=q&&F.t-q.t<0.5?q.b:(gb[t.i]={t:F.t,b:inBay(F,t)}).b;damageBot(F,t,"top",w.sawJps*F.dt,"grind",o.i,{bay});}
    if(wp.om<FIGHT.minSpin*w.omega||(wp.last[t.i]!=null&&F.t-wp.last[t.i]<FIGHT.hitGapS))continue;
    const stored=0.5*w.inertia*wp.om*wp.om,full=wp.om>=0.98*w.omega;
    let bite=Math.min(0.98,w.bite*(1+FIGHT.biteJitter*(2*F.rng()-1)))*(o.under?(WEDGE_RULES.underBiteBy[w.id]||WEDGE_RULES.underBite):1);
    const slope=face==="front"&&FIGHT.horizontal[w.id]&&!t.inverted?FIGHT.slope[t.b.weapon.type]||0:0;
    const lip=face==="front"&&!t.inverted&&FIGHT.slope[t.b.weapon.type]&&FIGHT.lip[w.id]||1;
    const bay=face==="top"&&inBay(F,t),dfl=lip===1&&!bay&&!(t.under&&t.under.by===o.i)&&F.rng()<Math.min(0.9,t.b.armourMapJ[face].deflect+slope);if(dfl)bite*=FIGHT.glance;
    const E=stored*Math.min(0.98,bite*lip)*(o.flags.bent?DAMAGE.bentMul:1);wp.om*=Math.sqrt(Math.max(0,1-bite));wp.last[t.i]=F.t;o.stats.hits++;
    const shock=E>=FIGHT.shock.minShare*0.5*w.inertia*w.omega*w.omega?FIGHT.shock.p[F.cls]||0:0;
    damageBot(F,t,face,E*FIGHT.damageShare*lethalOf(F),"hit",o.i,{logE:E,gl:dfl,shock,bay});fxPush(F,{k:"hit",x:c.px,y:c.py,E,v:t.i});
    /* the throw: away from the disc (hsp: round the rim), part of it upward; the attacker takes recoil */
    const J=Math.sqrt(2*t.m*E*FIGHT.throwShare);let dx,dy;
    if(o.zone.circle){const cc=toWorld(o,o.zone.x,o.zone.y),rx=c.px-cc[0],ry=c.py-cc[1],l=Math.hypot(rx,ry)||1;dx=0.3*rx/l-0.7*ry/l;dy=0.3*ry/l+0.7*rx/l;}
    else{dx=Math.cos(o.h);dy=Math.sin(o.h);}
    const l=Math.hypot(dx,dy)||1,up=FIGHT.up[w.id]!=null?FIGHT.up[w.id]:0,jh=J*Math.sqrt(1-up*up);dx/=l;dy/=l;
    impulseAt(t,dx*jh,dy*jh,c.px,c.py);
    if(up>0){const vz=J*up/t.m,hM=vz*vz/(2*K.g);if(hM>=FIGHT.airM*t.M.len)launch(F,t,vz,F.rng()<invertChance(F,hM),null,o.i);}   // a smaller hop is a jolt, not a flight
    const kick=jh*FIGHT.recoilShare*(w.recoil||0);impulseAt(o,-dx*kick,-dy*kick,c.px,c.py);
    /* a vertical spinner can throw itself over on a big hit */
    const sf=FIGHT.selfFlip[w.id];if(sf&&!o.air&&F.rng()<sf*Math.min(1,E/(0.5*w.inertia*w.omega*w.omega))){const h=FIGHT.invertM[0]*o.M.len;
      launch(F,o,Math.sqrt(2*K.g*h),true,null,null);logIt(F,{k:"self",v:o.i,what:"flip"});}
    /* self-damage: a big hit bends the disc; a huge one at full speed shears the shaft */
    if(!o.flags.bent&&E>w.bendJ*(0.85+0.3*F.rng())){o.flags.bent=true;o.fx=damageEffects(o.b,o.st,o.flags);logIt(F,{k:"self",v:o.i,what:"bent",E:r2(E)});}
    if(full&&E>w.shearJ*(0.8+0.4*F.rng())&&o.st.parts.weapon>0){const before=o.fx;o.st.parts.weapon=0;o.fx=damageEffects(o.b,o.st,o.flags);logIt(F,{k:"self",v:o.i,what:"shear",E:r2(E)});fxDiff(F,o,before);}}}

/* backing off after the pin limit: drive straight away from the bot it pinned, forwards or backwards, whichever face
   is nearer to away (a pin made with the rear drives off forwards; side-on it slides off along its heading) */
function releaseInput(F,o){const v=F.bots[o.releaseFrom];if(!v)return{throttle:-FIGHT.releaseThr,steer:0,weapon:0,selfRight:0};
  const c=Math.cos(o.h)*(o.x-v.x)+Math.sin(o.h)*(o.y-v.y);return{throttle:(c<0?-1:1)*FIGHT.releaseThr,steer:0,weapon:0,selfRight:0};}
function stepDrive(F,o){const dt=F.dt,b=o.b,d=b.drive,f=o.fx,g=K.g,u=o.release>F.t?releaseInput(F,o):o.input;let draw=0;
  const fw=[Math.cos(o.h),Math.sin(o.h)],rt=[Math.sin(o.h),-Math.cos(o.h)];
  if(o.air){o.cmd=[0,0];return 0;}
  const go=mobile(o)&&!o.righting&&!(o.dazed>F.t),p=powerOf(o)*(o.heat.dDer?BENCH.derate:1);
  const gripMul=o.held!=null?FIGHT.liftGrip:o.under?(WEDGE_RULES.underGripClass[F.cls]||WEDGE_RULES.underGrip):1;
  const vF=o.vx*fw[0]+o.vy*fw[1],half=b.trackM/2||b.widthM/2,v0=d.v0*Math.sqrt(Math.max(p,0.01)),N=o.m*g;
  let cL=go?clamp1(u.throttle+u.steer):0,cR=go?clamp1(u.throttle-u.steer):0;
  o.cmd=[cL,cR];let FL=0,FR=0;
  const sL=o.inverted?f.sides.right:f.sides.left,sR=o.inverted?f.sides.left:f.sides.right;   // upside down, the chassis's left wheels are on the right
  for(const s of [0,1]){const sd=s?sR:sL,cmd=s?cR:cL,vs=vF+(s?1:-1)*o.w*half;
    if(sd.out||!go)continue;
    let Fs=d.f0/2*p*sd.push*(cmd-(v0>0?vs/v0:0));const T=b.grip*N/2*sd.grip*gripMul;Fs=Fs>T?T:Fs<-T?-T:Fs;
    if(s)FR=Fs;else FL=Fs;draw+=b.power.driveW*b.powerScale*p*Math.abs(cmd)/2;}
  /* rolling resistance (harder with dead motors), never past a standstill */
  const crr=K.crr*N*(go?1:FIGHT.deadDrag)*gripMul,Fr=Math.abs(vF)*o.m/dt<crr?-vF*o.m/dt:-Math.sign(vF)*crr;
  const aF=(FL+FR+Fr)/o.m;o.vx+=fw[0]*aF*dt;o.vy+=fw[1]*aF*dt;
  /* tyres don't slide sideways easily */
  const vL=o.vx*rt[0]+o.vy*rt[1],lat=Math.min(Math.abs(vL),FIGHT.latGrip*b.grip*g*gripMul*dt);o.vx-=rt[0]*Math.sign(vL)*lat;o.vy-=rt[1]*Math.sign(vL)*lat;
  /* yaw: the two sides' difference, less the scrub of turning a skid-steer */
  const gy=FIGHT.gyro[b.weapon.id]&&b.weapon.omega>0?1-Math.min(0.9,FIGHT.gyro[b.weapon.id]*(FIGHT.gyroClass[F.cls]||1))*Math.min(1,o.wp.om/b.weapon.omega):1;
  o.w+=(FR-FL)*half/o.I*dt*gy;const scrub=FIGHT.scrub*b.grip*N*half*gripMul/o.I*dt;o.w=Math.abs(o.w)<=scrub?0:o.w-Math.sign(o.w)*scrub;
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
    if(Elost>FIGHT.ramMinJ*F.M.mass){const foe=A.team!==B.team;   // a knock from a teammate still hurts but earns nothing with the judges
      damageBot(F,A,fa,Elost,"ram",foe?B.i:-1);damageBot(F,B,fb,Elost,"ram",foe?A.i:-1);fxPush(F,{k:"ram",x:px,y:py,E:Elost});}}}
function edgeOf(o,face){return face==="front"?o.b.height.frontEdgeMm:o.b.height.clearanceMm;}
function wedgeRule(F,A,B,fa,fb){const tol=WEDGE_RULES.tolMm*F.M.edge,hold=WEDGE_RULES.holdS;
  const guard=(Y,fy)=>{const g=fy==="front"&&WEDGE_RULES.discGuard[Y.b.weapon.id];return!!g&&Y.b.weapon.omega>0&&Y.wp.om>=g*Y.b.weapon.omega;};
  const can=(X,Y,fy)=>!(X.inverted&&!X.b.height.drivesInverted)&&!guard(Y,fy);
  const under=(X,Y,fy)=>can(X,Y,fy)&&edgeOf(X,"front")<edgeOf(Y,fy)-tol;
  let win=null;
  if(fa==="front"&&under(A,B,fb))win=[A,B];else if(fb==="front"&&under(B,A,fa))win=[B,A];
  else if(fa==="front"&&fb==="front"&&Math.abs(edgeOf(A,"front")-edgeOf(B,"front"))<=tol){
    const sc=o=>(o.cfg.extras.indexOf("skid")>=0?2:0)+(["wedge","lifter","flipper"].indexOf(o.b.weapon.type)>=0?part("weaponMaterial",o.cfg.weaponMaterial).hp/1000:part("chassis",o.cfg.chassis).hp/1000);
    const a=sc(A),b=sc(B);if(Math.abs(a-b)>1e-9)win=a>b?[A,B]:[B,A];if(win&&!can(win[0],win[1],"front"))win=null;}
  if(!win||win[0].team===win[1].team)return;const[X,Y]=win;
  const seen=Y.underLog||(Y.underLog={});if(!(seen[X.i]>F.t-1.5))logIt(F,{k:"under",a:X.i,v:Y.i});seen[X.i]=F.t;   // one line per spell under
  Y.under={by:X.i,until:F.t+hold};if(X.under&&X.under.by===Y.i)X.under=null;}
function walls(F,o){const H=F.arena.half;
  for(const ax of [0,1])for(const sg of [-1,1]){let pen=0,pt=null;for(const v of o.pw){const p=v[ax]*sg-H;if(p>pen){pen=p;pt=v;}}
    if(!pt)continue;o.wallT=F.t;if(ax)o.y-=sg*pen;else o.x-=sg*pen;o.pw=worldPoly(o,o.poly);
    const nx=ax?0:-sg,ny=ax?-sg:0,r=[pt[0]-o.x,pt[1]-o.y],v=[o.vx-o.w*r[1],o.vy+o.w*r[0]],vn=v[0]*nx+v[1]*ny;
    if(vn<0){const cn=r[0]*ny-r[1]*nx,km=1/o.m+cn*cn/o.I,j=-(1+F.arena.wallE)*vn/km;impulseAt(o,nx*j,ny*j,pt[0],pt[1]);
      const tx=-ny,ty=nx,vt=v[0]*tx+v[1]*ty,ct=r[0]*ty-r[1]*tx,kt=1/o.m+ct*ct/o.I;let jt=-vt/kt;const lim=FIGHT.contactMu*j;jt=jt>lim?lim:jt<-lim?-lim:jt;impulseAt(o,tx*jt,ty*jt,pt[0],pt[1]);
      const E=0.5/km*vn*vn*(1-F.arena.wallE*F.arena.wallE)*FIGHT.ramShare;if(E>FIGHT.ramMinJ*F.M.mass&&!o.air){damageBot(F,o,faceAt(o,pt[0],pt[1]),E,"wall",-1);fxPush(F,{k:"wall",x:pt[0],y:pt[1],E});}}}}
/* the pit (from PR 4b's arenas): a bot whose centre is over it on the ground falls in */
function pitOpen(F){const P=F.arena.pit;return!!P&&F.t>=P.openS;}
function pitCheck(F,o){if(!pitOpen(F)||o.air||o.out)return;const P=F.arena.pit.rect;if(o.x>P[0]&&o.x<P[2]&&o.y>P[1]&&o.y<P[3])outBot(F,o,"pit");}
/* hazards (sim/arenas.js): a bot on the ground in the zone triggers it; while it is active it hits each bot in the zone once */
function inHaz(h,o){if(h.type==="spinner")return Math.hypot(o.x-h.at[0],o.y-h.at[1])<h.rM+o.rad*0.3;
  const r=h.rect;return o.pw.some(v=>v[0]>r[0]&&v[0]<r[2]&&v[1]>r[1]&&v[1]<r[3]);}
function stepHazards(F){const H=F.arena.haz;
  for(let i=0;i<H.length;i++){const h=H[i],s=F.hz[i];if(F.t<(h.startS||0))continue;
    if(F.t>=s.until&&F.t>=s.ready&&F.bots.some(o=>!o.out&&!o.air&&inHaz(h,o))){s.until=F.t+h.activeS;s.ready=F.t+h.periodS;s.hit={};}
    if(F.t>=s.until)continue;
    for(const o of F.bots)if(!o.out&&!o.air&&!s.hit[o.i]&&inHaz(h,o)){s.hit[o.i]=1;hazHit(F,h,i,o);}}}
/* the enemy that shoved o into a hazard: the last one touching it within a second */
function hazBy(F,o){let best=null,bt=-1;for(const k in o.touch){const t=F.bots[k];if(t&&t.team!==o.team&&!t.out&&F.t-o.touch[k]<1&&o.touch[k]>bt){bt=o.touch[k];best=t;}}return best;}
function hazHit(F,h,i,o){const sq=Math.sqrt(F.M.len),E=h.J*F.M.mass,by=hazBy(F,o),tag={h:i,what:h.type};let nx,ny;
  if(h.type==="pusher"){nx=h.n[0];ny=h.n[1];damageBot(F,o,faceAt(o,o.x-nx*o.rad,o.y-ny*o.rad),E,"haz",-1,{tag});}
  else{const a=F.rng()*2*Math.PI;nx=Math.cos(a);ny=Math.sin(a);damageBot(F,o,"under",E,"haz",-1,{below:1,inverted:o.inverted,tag});
    o.w=Math.max(-FIGHT.maxSpin,Math.min(FIGHT.maxSpin,o.w+(F.rng()<0.5?-1:1)*h.spinRad));}
  o.vx+=nx*h.kickMs*sq;o.vy+=ny*h.kickMs*sq;
  if(h.vzMs>0){const vz=h.vzMs*sq,hM=vz*vz/(2*K.g);if(hM>=FIGHT.airM*o.M.len)launch(F,o,vz,F.rng()<invertChance(F,hM),null,by?by.i:null);}
  if(by&&!o.mini&&!by.mini)by.jd.ctrl+=FIGHT.hazCtrlS;fxPush(F,{k:"haz",x:o.x,y:o.y,E,v:o.i});}
/* the judges' bookkeeping, each step (JUDGE_WEIGHTS, sim/arenas.js) */
function stepJudge(F){const dt=F.dt,G=FIGHT.judge;
  for(const o of F.bots){if(o.out||o.mini)continue;let t=null,bd=1e9;   // minibots neither score nor are scored against
    for(const q of F.bots)if(q.team!==o.team&&!q.out&&!q.mini){const d=Math.hypot(q.x-o.x,q.y-o.y);if(d<bd){bd=d;t=q;}}
    if(!t)continue;const J=o.jd,vs=Math.max(o.b.driveSpeed||0,0.1),touching=o.touch[t.i]!=null&&F.t-o.touch[t.i]<0.1,
      vt=bd>1e-6?((t.x-o.x)*o.vx+(t.y-o.y)*o.vy)/bd:0,mob=mobile(o)&&!o.air;
    if(touching)J.contact+=dt;else if(mob&&vt>G.closeV*vs)J.close+=dt;else if(mob&&vt<-G.closeV*vs)J.retreat+=dt;
    /* o held, under, upside down (and stuck that way) or pinned: whoever is doing it gets the time (a wedge only while it's
       driving the bot about: sat still underneath is not control) */
    const pinBy=o.held!=null?null:o.under?F.bots[o.under.by]:
      !o.inverted&&touching&&o.wallT!=null&&F.t-o.wallT<0.1&&Math.hypot(o.vx,o.vy)<G.pinV*vs?t:null;
    let by=null;
    if(o.held!=null)by=F.bots[o.held];
    else if(o.under){const u=pinBy;if(u&&Math.hypot(u.vx,u.vy)>G.driveV*Math.max(u.b.driveSpeed||0,0.1))by=u;}
    else if(o.inverted&&!o.b.height.drivesInverted)by=o.invBy!=null?F.bots[o.invBy]:t;
    else by=pinBy;
    if(by&&by.team!==o.team&&!by.out&&!by.mini)by.jd.ctrl+=dt;
    /* the pin rule: under a wedge or pinned for holdMaxS in one spell (gaps under 0.3 s don't break it), the pinner backs off */
    if(pinBy&&pinBy.team!==o.team&&!pinBy.out){if(!(o.pin&&o.pin.by===pinBy.i&&F.t-o.pin.last<0.3))o.pin={by:pinBy.i,t0:F.t,last:F.t};
      o.pin.last=F.t;if(F.t-o.pin.t0>=FIGHT.holdMaxS){pinBy.release=F.t+FIGHT.releaseS;pinBy.releaseFrom=o.i;o.pin=null;o.under=null;logIt(F,{k:"release",a:pinBy.i,v:o.i});}}}}
/* a bot is out (knocked out or in the pit): any hold it is part of ends, whichever end of it the bot was on */
function outBot(F,o,why,quiet){o.out=why;o.outAt=F.t;
  if(o.wp.held!=null){const t=F.bots[o.wp.held];if(t&&t.held===o.i)t.held=null;o.wp.held=null;}
  if(o.held!=null){const a=F.bots[o.held];if(a&&a.wp.held===o.i)a.wp.held=null;o.held=null;}
  if(!quiet)logIt(F,{k:why,v:o.i});
  if(!o.mini)for(const m of F.bots)if(m.mini&&m.parent===o.i&&!m.out)outBot(F,m,"parent",true);}   // a minibot stops with its parent

function stepFight(F,inputs){if(F.over)return F;const dt=F.dt;
  for(const o of F.bots)if(!o.out)readInput(F,o,inputs);else o.input={throttle:0,steer:0,weapon:0,selfRight:0};
  for(const o of F.bots){if(o.out==="pit")continue;
    /* a knocked-out bot still rolls to a stop (its drive is dead, so it draws nothing) but no longer heats or drains */
    const wW=o.out?0:stepWeapon(F,o),dW=stepDrive(F,o);if(!o.out)stepHeat(F,o,dW,wW);
    /* self-righting */
    if(o.inverted&&!o.air&&!o.out){if(o.righting>0){o.righting-=dt;if(o.righting<=0){o.righting=0;o.inverted=false;o.invBy=null;logIt(F,{k:"right",v:o.i});}}
      else if(o.input.selfRight&&o.fx.righter&&!o.fx.dead&&!o.flat){const by=o.fx.righterBy;
        if(by==="weapon"&&o.b.weapon.type==="flipper"){if(o.wp.shots>0&&o.wp.recharge<=0){o.wp.shots--;o.wp.recharge=o.b.weapon.rechargeS||1;o.righting=0.3;}}
        else o.righting=FIGHT.rightS;}}
    else o.righting=0;
    /* the height axis */
    if(o.air){o.vz-=K.g*dt;o.z+=o.vz*dt;if(o.z>o.zPeak)o.zPeak=o.z;
      if(o.z<=0&&o.vz<0){o.z=0;o.vz=0;o.air=false;if(o.stunNext){o.dazed=F.t+o.stunNext;o.stunNext=0;}if(o.flipNext){o.inverted=!o.inverted;o.flipNext=false;o.invBy=o.inverted?o.airBy:null;logIt(F,{k:"inv",v:o.i,inv:o.inverted?1:0});}
        damageBot(F,o,"top",o.m*K.g*o.zPeak*BENCH.dropShare,"land",-1,{inverted:o.inverted});fxPush(F,{k:"land",x:o.x,y:o.y,E:o.m*K.g*o.zPeak,v:o.i});o.stats.landed++;o.zPeak=0;}}
    else o.z=o.under?WEDGE_RULES.liftMm*o.M.len/1000:o.held!=null?((F.bots[o.held].b.weapon.liftM)||0.02)*0.5:0;
    if(o.under&&F.t>o.under.until)o.under=null;
    o.x+=o.vx*dt;o.y+=o.vy*dt;o.h=wrapA(o.h+o.w*dt);o.pw=worldPoly(o,o.poly);}
  for(const o of F.bots)if(!o.out)spinnerHits(F,o);
  for(let i=0;i<F.bots.length;i++)for(let j=i+1;j<F.bots.length;j++){const A=F.bots[i],B=F.bots[j];collide(F,A,B);A.pw=worldPoly(A,A.poly);B.pw=worldPoly(B,B.poly);}
  for(const o of F.bots)if(o.out!=="pit"){walls(F,o);pitCheck(F,o);}
  if(F.arena.pit&&F.arena.pit.openS>0&&!F.pitLogged&&pitOpen(F)){F.pitLogged=true;logIt(F,{k:"pitopen"});}
  if(F.arena.haz.length)stepHazards(F);
  stepJudge(F);
  /* knockouts: immobile for koS seconds. Upside down and unable to right counts; being knocked about doesn't stop the
     count (an immobile bot thrown by a spinner is still immobile); getting mobile again (righted) does */
  for(const o of F.bots){if(o.out)continue;const still=!mobile(o)&&!(o.righting>0&&o.fx.righter);
    o.immobileS=still?o.immobileS+dt:0;if(o.immobileS>=F.rules.koS)outBot(F,o,"ko");}
  F.t+=dt;F.n++;
  const teams=[...new Set(mainBots(F).filter(o=>!o.out).map(o=>o.team))];
  if(teams.length<=1){F.over=true;F.endT=F.t;F.winner=teams.length?teams[0]:null;
    const last=mainBots(F).filter(o=>o.out).sort((a,b)=>b.outAt-a.outAt)[0];F.reason=teams.length?(last?last.out:"ko"):"draw";}
  else if(F.t>=F.rules.roundS-1e-9){F.over=true;F.endT=F.t;judgeFight(F);}
  if(F.over){const e=logIt(F,{k:"end",w:F.winner,why:F.reason});if(F.judge)e.j=F.judge.scores;}
  return F;}
/* time up: the judges (JUDGE_WEIGHTS, sim/arenas.js). Among the teams still in it, each term is shared in proportion to
   what each did plus FIGHT.judge.ref (evenly when nobody did any), x 100 x its weight, so the scores add up to 100. A
   draw only when the totals are within half a point. */
function hpTotal(b){return Object.values(b.armourMapJ).reduce((a,f)=>a+(f.hpJ||0),0)+b.parts.reduce((a,p)=>a+(p.hpJ||0),0)+chassisHp(b);}
/* v rounded to whole tenths that add up to exactly want tenths (largest remainder; ties to the earlier team) */
function tenths(v,want){const f=v.map(x=>Math.floor(x*10+1e-9)),left=want-f.reduce((a,x)=>a+x,0);
  const ord=v.map((x,i)=>i).sort((a,b)=>(v[b]*10-f[b])-(v[a]*10-f[a])||a-b);for(let k=0;k<left&&k<ord.length;k++)f[ord[k]]++;return f;}
function judgeFight(F){const W=JUDGE_WEIGHTS,R=FIGHT.judge.ref,raw={},B=mainBots(F),hp=B.reduce((a,o)=>a+hpTotal(o.b),0)/B.length,T=Math.max(F.t,1);
  for(const o of B){const s=raw[o.team]||(raw[o.team]={damage:0,aggression:0,control:0});
    s.damage+=o.stats.dealt/hp;s.aggression+=Math.max(0,o.jd.close+o.jd.contact-o.jd.retreat)/T;s.control+=o.jd.ctrl/T;}
  const ks=Object.keys(raw).filter(k=>B.some(o=>String(o.team)===k&&!o.out)),sc={},tot={};
  for(const k of ks){sc[k]={damage:0,aggression:0,control:0,total:0};tot[k]=0;}
  for(const term of ["damage","aggression","control"]){const sum=ks.reduce((a,k)=>a+raw[k][term]+R[term],0);
    const v=ks.map(k=>100*W[term]*(raw[k][term]+R[term])/sum),t=tenths(v,Math.round(1000*W[term]));
    ks.forEach((k,i)=>{sc[k][term]=t[i]/10;tot[k]+=v[i];});}
  for(const k of ks)sc[k].total=Math.round((sc[k].damage+sc[k].aggression+sc[k].control)*10)/10;   // the rows the table shows, so it adds up
  const order=ks.slice().sort((a,b)=>tot[b]-tot[a]);F.judge={scores:sc,raw};
  if(order.length>1&&tot[order[0]]-tot[order[1]]<0.5){F.winner=null;F.reason="draw";}
  else{F.winner=B.find(o=>String(o.team)===order[0]).team;F.reason="judges";}}

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
     and the player's inputs (the replay) are never dropped, unless the inputs alone can't fit beside the entries that
     are kept (only a stick shaken flat out every tick gets there): then the story stays and the replay goes. */
  const tier=e=>{switch(e.k){case"hit":case"ram":case"wall":case"grind":return e.x?3:0;case"land":return e.x&&e.x.some(p=>p[2])?9:1;
    case"under":case"lift":case"drop":case"tip":case"right":case"heat":case"inv":case"flip":return 2;default:return 9;}};
  let sz=JSON.stringify(L).length;
  if(sz>FIGHT.logMaxB&&JSON.stringify(Object.assign({},L,{entries:L.entries.filter(e=>tier(e)===9),trimmed:L.entries.length})).length>FIGHT.logMaxB-64){
    L.inputs={};L.noReplay=1;sz=JSON.stringify(L).length;}
  if(sz>FIGHT.logMaxB){const small=L.entries.map((e,i)=>({e,i,t:tier(e)})).filter(q=>q.t<9).sort((a,b)=>a.t-b.t||(a.e.E||0)-(b.e.E||0));
    const drop=new Set(),cap=FIGHT.logMaxB-64,all=L.entries;let k=0;   // estimate down to a margin, then measure
    for(;k<small.length&&sz>cap;k++){drop.add(small[k].i);sz-=JSON.stringify(small[k].e).length+1;}
    L.trimmed=0;L.entries=all.filter((e,i)=>!drop.has(i));L.trimmed=drop.size;
    while(JSON.stringify(L).length>FIGHT.logMaxB&&k<small.length){drop.add(small[k++].i);L.entries=all.filter((e,i)=>!drop.has(i));L.trimmed=drop.size;}}
  return L;}
function fightResult(F){return{over:F.over,winner:F.winner,reason:F.reason,timeS:r2(F.endT!=null?F.endT:F.t),judge:F.judge||null,
  bots:F.bots.map(o=>({i:o.i,name:o.name,team:o.team,mini:!!o.mini,out:o.out,inverted:o.inverted,damage:damageTaken(o.b,o.st),states:resStates(o),
    flags:Object.assign({},o.flags),
    share:r2(damageShare(o.b,o.st)),stats:{dealt:r2(o.stats.dealt),taken:r2(o.stats.taken),hits:o.stats.hits,landed:o.stats.landed,failHits:o.stats.failHits},
    judge:{close:r2(o.jd.close),contact:r2(o.jd.contact),retreat:r2(o.jd.retreat),control:r2(o.jd.ctrl)},style:o.ai?o.ai.style:null})),
  log:fightLog(F)};}
/* part states; a bent disc has its hp but still needs the pit */
function resStates(o){const s=partStates(o.b,o.st);if(o.flags.bent&&s.weapon==="intact")s.weapon="damaged";return s;}
function runFight(opts){const F=newFight(opts),cap=Math.ceil(F.rules.roundS*STEP_HZ)+2;let k=0;
  while(!F.over&&k++<cap)stepFight(F,opts&&opts.inputs?opts.inputs(F):null);
  return fightResult(F);}
/* the same fight from its log: seed, builds, arena, rules and the player's recorded inputs */
function replayFight(log){if(!log||log.noReplay)return null;const play={};for(const i in log.inputs||{})play[i]=unpackInputs(log.inputs[i]);
  const r=runFight({seed:log.seed,arena:log.arena,rules:log.rules,bots:log.bots.map(b=>Object.assign({},b,{team:b.team})),play});
  r.log.inputs=JSON.parse(JSON.stringify(log.inputs||{}));   // the replay's log replays too
  return r;}
