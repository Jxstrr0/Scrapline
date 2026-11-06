/* ---- ai.js: the AI drivers (plan 7d, 8a). A driver has a style (AI_STYLES) and a skill 0..1 (AI_SKILL: how late it
   reacts, how far its aim wanders, how sharply it steers, how late it fires). It looks at the fight every reaction time
   and acts on what it saw; between looks it steers on that picture. All its chances come from its own seeded generator
   (rng(fight seed ^ bot)), so the same fight plays the same way.
   Each style is a mode plus its numbers:
     rush        drive at the target, weapon on (rush, aggressive, opportunist; opportunist picks the most damaged enemy)
     orbit       circle at a distance until the disc is up to speed, or the enemy turns its weapon away, then close
                 (keep-away, cautious; cautious circles wider, waits longer and backs off when the enemy comes at it)
     counter     face the enemy and wait; strike when it commits (comes at us fast) or when patience runs out
     push        get behind the enemy and drive it into a goal: the nearest wall (box-rush), or a hazard, the open pit
                 first (hazard-pusher)
   Every style keeps itself out of an open pit, backs off when stuck, and self-rights when it needs to.
   driver.style "auto" picks one for the build and the arena (autoStyle).
     aiNew(o, seed, F)    a driver's memory for bot o
     aiThink(F, o)        this step's {throttle, steer, weapon, selfRight}
     autoStyle(b, arena)  a style id for an evalBuild result in an arena (an ARENAS id or arenaOf's object) ---- */
const AI_STYLES={
  rush:{name:"Rush",mode:"rush",lead:0.15},
  keepaway:{name:"Keep-away",mode:"orbit",lead:0.1,orbitR:0.45,orbitTurn:0.9,spunUp:0.9,dangerR:0.3,patienceS:9,commitS:3,flankA:1.1},
  aggressive:{name:"Aggressive",mode:"rush",lead:0.2,fireMul:0.5,stuckS:1.8},
  cautious:{name:"Cautious",mode:"orbit",lead:0.1,orbitR:0.55,orbitTurn:1,spunUp:0.95,dangerR:0.45,patienceS:14,commitS:2,flankA:1.3,flee:1},
  counter:{name:"Counter",mode:"counter",lead:0.1,waitR:0.3,strikeV:0.35,patienceS:6,commitS:2.5},
  boxrush:{name:"Box-rush",mode:"push",lead:0.15,goal:"wall",behind:0.5},
  hazard:{name:"Hazard-pusher",mode:"push",lead:0.15,goal:"hazard",behind:0.5},
  opportunist:{name:"Opportunist",mode:"rush",lead:0.15,pick:"weak"}
};
const AI_STYLE_IDS=Object.keys(AI_STYLES);
/* skill 0 .. skill 1 */
const AI_SKILL={reactS:[0.45,0.08],aimErr:[0.3,0.03],kp:[1.6,2.8],kd:[0.04,0.12],fireLate:[0.25,0.02],pitLook:[0.2,0.45]};
const aiLerp=(a,s)=>a[0]+(a[1]-a[0])*s;
/* a style for a build: spinners circle up to speed, pushers and lifters work the hazards (or the walls in a bare box),
   hammers wait for the enemy to come to them, flippers and crushers go in */
function autoStyle(b,arena){const A=typeof arena==="string"?ARENAS[arena]:arena&&arena.def?arena.def:arena,
    haz=!!(A&&(A.pit||(A.hazards&&A.hazards.length))),t=b.weapon.type;
  if(t==="spinner"||t==="saw")return"keepaway";
  if(t==="none"||t==="wedge"||t==="lifter"||t==="flipper")return haz?"hazard":"boxrush";
  return"aggressive";}
function aiNew(o,seed,F){const d=o.driver||{};let st=d.style;if(!AI_STYLES[st])st=st==="auto"&&F?autoStyle(o.b,F.arena):"rush";
  return{r:rng(seed),style:st,next:0,tx:0,ty:0,tgt:-1,aim:0,dir:0,stuck:0,spin:0,back:0,backSteer:0,mode:"close",modeT:0,zoneT:-1,push:0};}
/* where o should point, and how hard to go: steer toward a world point */
function aiSteer(o,m,px,py,sk){const want=Math.atan2(py-o.y,px-o.x),err=wrapA(want-o.h+m.aim),u=aiLerp(AI_SKILL.kp,sk)*err-aiLerp(AI_SKILL.kd,sk)*o.w;
  const a=Math.abs(err);return{steer:clamp1(-u),throttle:a<0.35?1:a<1.3?Math.cos(a):0,err};}
/* the goal a pusher drives its enemy at: the open pit, else the nearest hazard, else the nearest wall (goal "wall": the wall) */
function aiGoal(F,S,t){const H=F.arena.half;
  if(S.goal==="hazard"){const P=F.arena.pit;if(P&&F.t>=P.openS){const r=P.rect;return[(r[0]+r[2])/2,(r[1]+r[3])/2];}
    let best=null,bd=1e9;for(const h of F.arena.haz){const c=h.at||[(h.rect[0]+h.rect[2])/2,(h.rect[1]+h.rect[3])/2],d=Math.hypot(c[0]-t.x,c[1]-t.y);if(d<bd){bd=d;best=c;}}
    if(best)return best;}
  const dx=H-Math.abs(t.x),dy=H-Math.abs(t.y);return dx<dy?[Math.sign(t.x||1)*H,t.y]:[t.x,Math.sign(t.y||1)*H];}
function aiThink(F,o){const m=o.ai,d=o.driver||{},sk=Math.max(0,Math.min(1,d.skill==null?0.6:d.skill)),S=AI_STYLES[m.style]||AI_STYLES.rush,
    w=o.b.weapon,H=F.arena.half,out={throttle:0,steer:0,weapon:0,selfRight:0};
  const foes=F.bots.filter(t=>t!==o&&t.team!==o.team&&!t.out);if(!foes.length)return out;
  /* a fresh look at the fight */
  if(F.t>=m.next){m.next=F.t+aiLerp(AI_SKILL.reactS,sk)*(0.7+0.6*m.r());
    let t=foes[0],bd=1e9;for(const q of foes){const dd=Math.hypot(q.x-o.x,q.y-o.y);if(dd<bd){bd=dd;t=q;}}
    if(S.pick==="weak"){let ws=damageShare(t.b,t.st)+0.1;for(const q of foes){const sh=damageShare(q.b,q.st);if(sh>ws){ws=sh;t=q;}}}
    m.tgt=t.i;m.tx=t.x+t.vx*S.lead;m.ty=t.y+t.vy*S.lead;m.aim=(2*m.r()-1)*aiLerp(AI_SKILL.aimErr,sk);if(!m.dir)m.dir=m.r()<0.5?-1:1;
    m.dist=Math.hypot(t.x-o.x,t.y-o.y);m.tvx=t.vx;m.tvy=t.vy;m.th=t.h;
    m.tClose=m.dist>1e-6?((o.x-t.x)*t.vx+(o.y-t.y)*t.vy)/m.dist:0;   // how fast it is coming at us
    }
  const t=F.bots[m.tgt]&&!F.bots[m.tgt].out?F.bots[m.tgt]:foes[0];
  /* a trigger weapon's driver watches its reach all the time (a thumb on the button), firing a skill-dependent beat late */
  const z=zoneTouch(o,t);if(z&&m.zoneT<0)m.zoneT=F.t;if(!z)m.zoneT=-1;m.inZone=!!z;
  /* upside down and stuck: self-right if it can (a flipper, lifter or hammer also rights to use its weapon) */
  const needUp=o.inverted&&(!o.b.height.drivesInverted||["flipper","lifter","hammer","crusher"].indexOf(w.type)>=0);
  if(needUp&&o.fx.righter){out.selfRight=1;return out;}
  let px=m.tx,py=m.ty,mode="close",hold=false;
  const toMe=Math.atan2(o.y-t.y,o.x-t.x),facing=Math.abs(wrapA(toMe-t.h))<(S.flankA||1.1);
  if(S.mode==="orbit"){const spinner=w.type==="spinner"||w.type==="saw",ready=spinner?(!o.fx.motorOk||o.wp.om>=S.spunUp*w.omega):false;
    if(m.mode==="commit"&&F.t-m.modeT<S.commitS)mode="commit";
    else if(spinner?ready:(!facing||F.t-m.modeT>S.patienceS)){mode="commit";if(m.mode!=="commit")m.modeT=F.t;}
    else{mode="orbit";if(m.mode==="commit")m.modeT=F.t;}
    if(mode==="commit"&&S.flee&&!ready&&facing&&m.tClose>0.3*Math.max(t.b.driveSpeed,0.1))mode="orbit";
    if(mode==="orbit"){const R=S.orbitR*H,dang=facing&&m.dist<S.dangerR*H*2,a=toMe+m.dir*S.orbitTurn*(dang?1.6:1);
      px=t.x+R*Math.cos(a);py=t.y+R*Math.sin(a);}}
  else if(S.mode==="counter"){
    if(m.mode==="commit"&&F.t-m.modeT<S.commitS)mode="commit";
    else if(m.tClose>S.strikeV*Math.max(t.b.driveSpeed,0.1)&&m.dist<0.8*H||F.t-m.modeT>S.patienceS||m.inZone){mode="commit";if(m.mode!=="commit")m.modeT=F.t;}
    else{mode="wait";if(m.mode==="commit")m.modeT=F.t;}
    if(mode==="wait"){hold=m.dist<S.waitR*H*2;if(!hold){const k=S.waitR*H/Math.max(m.dist,1e-6);px=t.x+(o.x-t.x)*k;py=t.y+(o.y-t.y)*k;}}}
  else if(S.mode==="push"){const g=aiGoal(F,S,t),gx=g[0]-t.x,gy=g[1]-t.y,gl=Math.hypot(gx,gy)||1,ux=gx/gl,uy=gy/gl,
      ax=t.x-o.x,ay=t.y-o.y,al=Math.hypot(ax,ay)||1,lined=(ax*ux+ay*uy)/al;
    if(lined<S.behind&&!(o.touch[t.i]!=null&&F.t-o.touch[t.i]<0.1&&lined>0)){const back=o.rad+t.rad*1.6;px=t.x-ux*back;py=t.y-uy*back;mode="line";}
    else{px=t.x+ux*t.rad;py=t.y+uy*t.rad;mode="drive";}}
  m.mode=mode;
  const lim=H-o.rad*1.2;px=Math.max(-lim,Math.min(lim,px));py=Math.max(-lim,Math.min(lim,py));
  const c=aiSteer(o,m,px,py,sk);out.steer=c.steer;out.throttle=hold?0:mode==="orbit"?Math.max(c.throttle,0.5):c.throttle;
  if(hold){const e=wrapA(Math.atan2(t.y-o.y,t.x-o.x)-o.h);out.steer=clamp1(-2.2*e);out.throttle=Math.abs(e)<0.3?0.15:0;}
  /* sat on an enemy's wedge for half a second: reverse out and come again (a pusher on a pusher keeps shoving) */
  if(o.under&&!(S.mode==="push"&&w.type==="none")){m.underT=(m.underT||0)+F.dt;if(m.underT>0.5&&!(m.back>0)){m.underT=0;m.back=0.35+0.25*m.r();m.backSteer=m.r()<0.5?-0.5:0.5;}}else m.underT=0;
  /* stuck against a wall (or a stalemate shove): back off and turn */
  const sp=Math.hypot(o.vx,o.vy),touching=o.touch[t.i]!=null&&F.t-o.touch[t.i]<0.1,pushing=S.mode==="push"&&mode==="drive"&&touching;
  /* circling an enemy it's touching, full lock, for a second and a half (two bots chasing each other's tails): break off */
  if(touching&&Math.abs(out.steer)>0.9&&!(m.back>0)){m.spin+=F.dt;if(m.spin>1.5){m.spin=0;m.back=0.4+0.3*m.r();m.backSteer=out.steer>0?-0.4:0.4;}}
  else m.spin=Math.max(0,m.spin-F.dt*0.5);
  if(m.back>0){m.back-=F.dt;out.throttle=-1;out.steer=m.backSteer;}
  else{if(out.throttle>0.5&&sp<0.1*Math.max(o.b.driveSpeed,0.1)&&!pushing)m.stuck+=F.dt*(touching?(t.under&&t.under.by===o.i?0.2:0.4):1);else m.stuck=Math.max(0,m.stuck-F.dt);
    if(m.stuck>(S.stuckS||1.2)){m.stuck=0;m.back=0.45+0.3*m.r();m.backSteer=m.r()<0.5?-0.6:0.6;}}
  /* keep out of an open pit, and off a shut one from two seconds before it opens: look ahead along the way it's going */
  const P=F.arena.pit;if(P&&F.t>=P.openS-2){const r=P.rect,la=aiLerp(AI_SKILL.pitLook,sk),fx=Math.cos(o.h),fy=Math.sin(o.h),dir=out.throttle>=0?1:-1,
      qx=o.x+o.vx*la+fx*dir*o.rad*0.8,qy=o.y+o.vy*la+fy*dir*o.rad*0.8,e=o.rad*0.4;
    if(qx>r[0]-e&&qx<r[2]+e&&qy>r[1]-e&&qy<r[3]+e){const cx=(r[0]+r[2])/2,cy=(r[1]+r[3])/2,away=Math.atan2(o.y-cy,o.x-cx),err=wrapA(away-o.h);
      out.steer=clamp1(-2*err);out.throttle=Math.abs(err)<0.6?0.6:-1;m.back=0;}}   // brake hard until it's pointing away
  /* the weapon */
  const late=aiLerp(AI_SKILL.fireLate,sk)*(S.fireMul||1);
  if(w.type==="spinner"||w.type==="saw")out.weapon=1;
  else if(w.type==="flipper"||w.type==="hammer"||w.type==="crusher")out.weapon=m.inZone&&m.zoneT>=0&&F.t-m.zoneT>=late&&
    !(w.type==="flipper"&&t.inverted&&!t.b.height.drivesInverted&&!t.fx.righter)?1:0;   // a flipper leaves a stranded bot upside down
  else if(w.type==="lifter")out.weapon=m.inZone||o.wp.held!=null?1:0;
  return out;}
