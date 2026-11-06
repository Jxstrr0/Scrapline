/* ---- ai.js: the AI drivers. Plan 7d (PR 4a): rush (drive at the nearest enemy, weapon on) and keep-away (circle at a
   distance until the disc is up to speed, or until the enemy turns its weapon away, then close). PR 4b adds the rest of
   AI_STYLES (aggressive, cautious, counter, box-rush, hazard-pusher, opportunist).
   A driver has a style and a skill 0..1 (AI_SKILL: how late it reacts, how far its aim wanders, how sharply it steers).
   It looks at the fight every reaction time and acts on what it saw; between looks it steers on that picture. All its
   chances come from its own seeded generator (rng(fight seed ^ bot)), so the same fight plays the same way.
     aiNew(o, seed)    a driver's memory for bot o
     aiThink(F, o)     this step's {throttle, steer, weapon, selfRight} ---- */
const AI_STYLES={
  rush:{name:"Rush",lead:0.15,closeAt:0},
  keepaway:{name:"Keep-away",lead:0.1,orbitR:0.45,orbitTurn:0.9,spunUp:0.9,dangerR:0.3,patienceS:9,commitS:3,flankA:1.1}
};
/* skill 0 .. skill 1 */
const AI_SKILL={reactS:[0.45,0.08],aimErr:[0.3,0.03],kp:[1.6,2.8],kd:[0.04,0.12],fireLate:[0.25,0.02]};
const aiLerp=(a,s)=>a[0]+(a[1]-a[0])*s;
function aiNew(o,seed){return{r:rng(seed),next:0,tx:0,ty:0,tgt:-1,aim:0,dir:0,stuck:0,back:0,backSteer:0,mode:"close",modeT:0,zoneT:-1,push:0};}
/* where o should point, and how hard to go: steer toward a world point */
function aiSteer(o,m,px,py,sk){const want=Math.atan2(py-o.y,px-o.x),err=wrapA(want-o.h+m.aim),u=aiLerp(AI_SKILL.kp,sk)*err-aiLerp(AI_SKILL.kd,sk)*o.w;
  const a=Math.abs(err);return{steer:clamp1(-u),throttle:a<0.35?1:a<1.3?Math.cos(a):0,err};}
function aiThink(F,o){const m=o.ai,d=o.driver||{},sk=Math.max(0,Math.min(1,d.skill==null?0.6:d.skill)),S=AI_STYLES[d.style]||AI_STYLES.rush,
    w=o.b.weapon,H=F.arena.half,out={throttle:0,steer:0,weapon:0,selfRight:0};
  const foes=F.bots.filter(t=>t!==o&&t.team!==o.team&&!t.out);if(!foes.length)return out;
  /* a fresh look at the fight */
  if(F.t>=m.next){m.next=F.t+aiLerp(AI_SKILL.reactS,sk)*(0.7+0.6*m.r());
    let t=foes[0],bd=1e9;for(const q of foes){const dd=Math.hypot(q.x-o.x,q.y-o.y);if(dd<bd){bd=dd;t=q;}}
    m.tgt=t.i;m.tx=t.x+t.vx*S.lead;m.ty=t.y+t.vy*S.lead;m.aim=(2*m.r()-1)*aiLerp(AI_SKILL.aimErr,sk);if(!m.dir)m.dir=m.r()<0.5?-1:1;
    m.dist=bd;m.tvx=t.vx;m.tvy=t.vy;m.th=t.h;
    const z=zoneTouch(o,t);if(z&&m.zoneT<0)m.zoneT=F.t;if(!z)m.zoneT=-1;m.inZone=!!z;}
  const t=F.bots[m.tgt]||foes[0];
  /* upside down and stuck: self-right if it can (a flipper, lifter or hammer also rights to use its weapon) */
  const needUp=o.inverted&&(!o.b.height.drivesInverted||["flipper","lifter","hammer","crusher"].indexOf(w.type)>=0);
  if(needUp&&o.fx.righter){out.selfRight=1;return out;}
  /* keep-away: circle until ready, then close; flee when the enemy comes at us facing us */
  let px=m.tx,py=m.ty,mode="close";
  if(S.orbitR){const spinner=w.type==="spinner"||w.type==="saw",ready=spinner?(!o.fx.motorOk||o.wp.om>=S.spunUp*w.omega):false;
    const toMe=Math.atan2(o.y-t.y,o.x-t.x),facing=Math.abs(wrapA(toMe-t.h))<S.flankA;
    if(m.mode==="commit"&&F.t-m.modeT<S.commitS)mode="commit";
    else if(spinner?ready:(!facing||F.t-m.modeT>S.patienceS)){mode="commit";if(m.mode!=="commit")m.modeT=F.t;}
    else{mode="orbit";if(m.mode==="commit")m.modeT=F.t;}
    if(mode==="orbit"){const R=S.orbitR*H,dang=facing&&m.dist<S.dangerR*H*2,a=toMe+m.dir*S.orbitTurn*(dang?1.6:1);
      px=t.x+R*Math.cos(a);py=t.y+R*Math.sin(a);const lim=H-o.rad*1.5;px=Math.max(-lim,Math.min(lim,px));py=Math.max(-lim,Math.min(lim,py));}
    m.mode=mode;}
  const c=aiSteer(o,m,px,py,sk);out.steer=c.steer;out.throttle=c.throttle;
  /* stuck against a wall (or a stalemate shove): back off and turn */
  const sp=Math.hypot(o.vx,o.vy),touching=o.touch[t.i]!=null&&F.t-o.touch[t.i]<0.1;
  if(m.back>0){m.back-=F.dt;out.throttle=-1;out.steer=m.backSteer;}
  else{if(out.throttle>0.5&&sp<0.1*Math.max(o.b.driveSpeed,0.1))m.stuck+=F.dt*(touching?(t.under&&t.under.by===o.i?0.2:0.4):1);else m.stuck=Math.max(0,m.stuck-F.dt);
    if(m.stuck>1.2){m.stuck=0;m.back=0.45+0.3*m.r();m.backSteer=m.r()<0.5?-0.6:0.6;}}
  /* the weapon */
  const late=aiLerp(AI_SKILL.fireLate,sk);
  if(w.type==="spinner"||w.type==="saw")out.weapon=1;
  else if(w.type==="flipper"||w.type==="hammer"||w.type==="crusher")out.weapon=m.inZone&&m.zoneT>=0&&F.t-m.zoneT>=late?1:0;
  else if(w.type==="lifter")out.weapon=m.inZone||o.wp.held!=null?1:0;
  if(mode==="orbit")out.throttle=Math.max(out.throttle,0.5);
  return out;}
