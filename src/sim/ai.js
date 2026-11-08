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
   Every style keeps itself out of an open pit, backs off when stuck, and self-rights when it needs to. On top of the style
   (0.1.17.2, AI_NAV and AI_SKILL.tactics):
     paths       the way to where it wants to go bends round the pit (open, or opening within AI_NAV.pitSoonS), the floor
                 spinners and the pusher slabs (unless it's shoving the enemy into one), and round the enemy itself when
                 it wants a point on the far side (lining up a push, circling)
     the pit     a bot over the pit's edge drives out towards the open floor, forwards or backwards, whichever end points
                 that way (never reversing into the wall behind a pit); a bot being shoved towards it turns across the
                 shove instead of pushing straight back
     tactics     a skilled driver goes for the side of a bot with a weapon on its front instead of into the weapon, and a
                 spinner that has landed a hit and lost its speed backs off to spin up again (both more often the higher
                 the skill)
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
const AI_SKILL={reactS:[0.45,0.08],aimErr:[0.3,0.03],kp:[1.6,2.8],kd:[0.04,0.12],fireLate:[0.25,0.02],pitLook:[0.2,0.45],tactics:[0.25,1]};
/* the paths' margins, in bot radii: round the pit, a floor hazard, the enemy; the pit counts from this long before it opens.
   flankR: how far to the side of a front weapon a flanking bot aims (radii of both bots); flankA: how square on the enemy
   must be facing it to bother (rad). reSpin: a spinner below this share of its top speed after a hit backs off; resetS how
   long it reverses. pitShove: the pit this close behind (radii) while being shoved turns it across the shove. */
const AI_NAV={pitPad:1.3,hazPad:1.1,botPad:1.2,pitSoonS:2,flankR:1.3,flankA:0.7,reSpin:0.55,resetS:[0.3,0.55],pitShove:2.5};
const aiLerp=(a,s)=>a[0]+(a[1]-a[0])*s;
/* a style for a build: spinners circle up to speed, pushers and lifters work the hazards (or the walls in a bare box),
   hammers wait for the enemy to come to them, flippers and crushers go in */
function autoStyle(b,arena){const A=typeof arena==="string"?ARENAS[arena]:arena&&arena.def?arena.def:arena,
    haz=!!(A&&(A.pit||(A.hazards&&A.hazards.length))),t=b.weapon.type;
  /* 0.1.17.2, from each build's record per style against the auto field in every class: a horizontal disc does best waiting
     for the commit (counter), an undercutter and a wedge by going in (rush, aggressive); the rest of the spinners keep away (a vertical disc or a
     drum on counter is stronger still, but it ran the balance over 65%) */
  if(b.weapon.id==="under")return"rush";
  if(b.weapon.id==="hsp")return"counter";
  if(t==="spinner"||t==="saw")return"keepaway";
  if(t==="wedge")return"aggressive";
  if(t==="none"||t==="lifter"||t==="flipper")return haz?"hazard":"boxrush";
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
/* ---- paths ---- */
/* the part of the segment a->b inside rect r = [x0, y0, x1, y1] (Liang-Barsky): the entry parameter 0..1, or -1 if it misses */
function aiSegRect(ax,ay,bx,by,r){let t0=0,t1=1;const dx=bx-ax,dy=by-ay,p=[-dx,dx,-dy,dy],q=[ax-r[0],r[2]-ax,ay-r[1],r[3]-ay];
  for(let i=0;i<4;i++){if(Math.abs(p[i])<1e-12){if(q[i]<0)return-1;continue;}const u=q[i]/p[i];
    if(p[i]<0){if(u>t1)return-1;if(u>t0)t0=u;}else{if(u<t0)return-1;if(u<t1)t1=u;}}
  return t0;}
/* where the segment a->b first comes within R of (cx, cy): the parameter 0..1, or -1 if it never does */
function aiSegCirc(ax,ay,bx,by,cx,cy,R){const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy;if(L2<1e-12)return-1;
  const u=Math.max(0,Math.min(1,((cx-ax)*dx+(cy-ay)*dy)/L2)),qx=ax+dx*u-cx,qy=ay+dy*u-cy;return qx*qx+qy*qy<R*R?u:-1;}
const aiGrow=(r,e)=>[r[0]-e,r[1]-e,r[2]+e,r[3]+e];
const aiIn=(x,y,r)=>x>r[0]&&x<r[2]&&y>r[1]&&y<r[3];
/* the things in o's way: rects (the pit, pusher slabs) and circles (floor spinners, the enemy), each grown by o's size */
function aiObstacles(F,o,t,m,mode){const L=[],P=F.arena.pit;
  if(P&&F.t>=P.openS-AI_NAV.pitSoonS)L.push({rect:aiGrow(P.rect,o.rad*AI_NAV.pitPad)});
  if(mode!=="drive")for(const h of F.arena.haz){if(h.type==="spinner")L.push({x:h.at[0],y:h.at[1],R:h.rM+o.rad*AI_NAV.hazPad});
    else L.push({rect:aiGrow(h.rect,o.rad*AI_NAV.hazPad*0.5)});}
  if(t&&(mode==="line"||mode==="orbit"))L.push({x:t.x,y:t.y,R:(o.rad+t.rad)*AI_NAV.botPad,bot:1});
  return L;}
/* a waypoint that takes o round the first obstacle between it and (px, py): past the nearest usable corner of a rect, out
   to the side of a circle (the side the straight line passes on). An obstacle o is already inside doesn't count (the pit's
   own escape deals with that), nor one the goal is inside (it's the goal). */
function aiPath(F,o,t,m,px,py,mode){const H=F.arena.half,lim=H-o.rad*1.2,L=aiObstacles(F,o,t,m,mode);let best=null,bu=2;
  for(const ob of L){let u;
    if(ob.rect){if(aiIn(o.x,o.y,ob.rect)||aiIn(px,py,ob.rect))continue;u=aiSegRect(o.x,o.y,px,py,ob.rect);}
    else{const d0=Math.hypot(o.x-ob.x,o.y-ob.y);if(d0<ob.R||Math.hypot(px-ob.x,py-ob.y)<ob.R*0.9)continue;u=aiSegCirc(o.x,o.y,px,py,ob.x,ob.y,ob.R);}
    if(u>=0&&u<bu){bu=u;best=ob;}}
  if(!best)return[px,py];
  if(best.rect){const r=best.rect,e=o.rad*0.35,inner=aiGrow(r,-o.rad*0.05);let w=null,wd=1e9;
    for(const c of [[r[0]-e,r[1]-e],[r[2]+e,r[1]-e],[r[2]+e,r[3]+e],[r[0]-e,r[3]+e]]){if(Math.abs(c[0])>lim||Math.abs(c[1])>lim)continue;
      const seen=aiSegRect(o.x,o.y,c[0],c[1],inner)<0,d=Math.hypot(c[0]-o.x,c[1]-o.y)+Math.hypot(px-c[0],py-c[1])+(seen?0:4*H);
      if(d<wd){wd=d;w=c;}}
    return w||[px,py];}
  const dx=px-o.x,dy=py-o.y,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;let s=(best.x-o.x)*nx+(best.y-o.y)*ny>0?-1:1;   // pass on the side away from it
  if(Math.abs((best.x-o.x)*nx+(best.y-o.y)*ny)<best.R*0.05)s=m.dir||1;
  let wx=best.x+s*nx*best.R*1.15,wy=best.y+s*ny*best.R*1.15;
  if(Math.abs(wx)>lim||Math.abs(wy)>lim){wx=best.x-s*nx*best.R*1.15;wy=best.y-s*ny*best.R*1.15;}   // that side is against the wall: the other
  return[wx,wy];}
/* o, touching t, being shoved towards something it mustn't go into (the pit within AI_NAV.pitShove radii behind it, a
   hazard within half that, the wall within AI_NAV.wallShove when wall is on): the heading across the shove that takes it
   away from that thing, or null */
function aiShove(F,o,t,P){const ux=o.x-t.x,uy=o.y-t.y,ul=Math.hypot(ux,uy)||1,vs=Math.max(o.b.driveSpeed,0.1);
  if((o.vx*ux+o.vy*uy)/ul<0.05*vs)return null;   // not being driven back
  const L=[];if(P)L.push({r:P.rect,k:AI_NAV.pitShove});
  for(const h of F.arena.haz)if(h.type==="spinner")L.push({c:h.at,R:h.rM,k:AI_NAV.pitShove*0.5});else L.push({r:h.rect,k:AI_NAV.pitShove*0.5});
  for(const q of L){let nx,ny,cx,cy;
    if(q.r){const r=q.r;nx=Math.max(r[0],Math.min(r[2],o.x));ny=Math.max(r[1],Math.min(r[3],o.y));cx=(r[0]+r[2])/2;cy=(r[1]+r[3])/2;}
    else{cx=q.c[0];cy=q.c[1];const d=Math.hypot(o.x-cx,o.y-cy)||1;nx=cx+(o.x-cx)/d*q.R;ny=cy+(o.y-cy)/d*q.R;}
    if(Math.hypot(nx-o.x,ny-o.y)>=o.rad*q.k||((nx-o.x)*ux+(ny-o.y)*uy)<=0)continue;
    const s1=(-uy*(o.x-cx)+ux*(o.y-cy))>=0?1:-1;return Math.atan2(ux*s1,-uy*s1);}
  return null;}
/* the way off the pit for a bot whose look-ahead is over it: straight away from the pit's middle, less any part of that
   which runs into a wall within a couple of bot lengths (so along the wall); towards the arena's middle if nothing is left */
function aiPitOut(F,o,r){const cx=(r[0]+r[2])/2,cy=(r[1]+r[3])/2,lim=F.arena.half-o.rad*1.1;let ax=o.x-cx,ay=o.y-cy,l=Math.hypot(ax,ay);
  if(l<1e-6){ax=-cx;ay=-cy;l=Math.hypot(ax,ay)||1;}ax/=l;ay/=l;
  if(Math.abs(o.x+ax*o.rad*2)>lim)ax=0;if(Math.abs(o.y+ay*o.rad*2)>lim)ay=0;   // along the wall rather than into it
  if(Math.abs(ax)+Math.abs(ay)<0.2){ax=-o.x;ay=-o.y;}
  return Math.atan2(ay,ax);}
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
    if(F.t>=(m.tacT||0)){m.tac=m.r()<aiLerp(AI_SKILL.tactics,sk);m.tacT=F.t+2+2*m.r();}   // for the next few seconds, does it play smart (flank, hit and run)?
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
    /* hit and run: a spinner whose hit just cost it most of its speed backs off and circles until it's spun up again */
    if(mode==="commit"&&spinner&&o.fx.motorOk&&m.tac&&o.wp.last[t.i]!=null&&F.t-o.wp.last[t.i]<0.25&&o.wp.om<AI_NAV.reSpin*w.omega&&!(m.back>0)){
      mode="orbit";m.modeT=F.t;m.back=aiLerp(AI_NAV.resetS,m.r());m.backSteer=m.dir*0.5;}
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
  /* flank: going in on a bot that has a weapon on its front and is facing us square on, aim beside it (the side we're
     already on, unless that side is against a wall), straight in once we're close */
  if((S.mode==="rush"||mode==="commit")&&m.tac&&t.zone&&!t.zone.circle&&!hold){const rr=o.rad+t.rad,sq=Math.abs(wrapA(toMe-t.h))<AI_NAV.flankA;
    if(sq&&m.dist>rr*2){const fx=Math.cos(t.h),fy=Math.sin(t.h);let s=((o.x-t.x)*-fy+(o.y-t.y)*fx)>=0?1:-1;const k=rr*AI_NAV.flankR*Math.min(1,(m.dist-rr*2)/(rr*2)+0.5),
        side=sg=>[t.x-fy*sg*k,t.y+fx*sg*k],lim2=H-o.rad*1.5;let q=side(s);if(Math.abs(q[0])>lim2||Math.abs(q[1])>lim2){q=side(-s);}
      px=q[0];py=q[1];mode=mode==="commit"?"commit":"flank";}}
  m.mode=mode;
  const lim=H-o.rad*1.2;px=Math.max(-lim,Math.min(lim,px));py=Math.max(-lim,Math.min(lim,py));
  if(!hold){const q=aiPath(F,o,t,m,px,py,mode);px=q[0];py=q[1];}
  const c=aiSteer(o,m,px,py,sk);out.steer=c.steer;out.throttle=hold?0:mode==="orbit"?Math.max(c.throttle,0.5):c.throttle;
  if(hold){const e=wrapA(Math.atan2(t.y-o.y,t.x-o.x)-o.h);out.steer=clamp1(-2.2*e);out.throttle=Math.abs(e)<0.3?0.15:0;}
  /* sat on an enemy's wedge for half a second: reverse out and come again (a pusher on a pusher keeps shoving) */
  if(o.under&&!(S.mode==="push"&&w.type==="none")){m.underT=(m.underT||0)+F.dt;if(m.underT>0.5&&!(m.back>0)){m.underT=0;m.back=0.35+0.25*m.r();m.backSteer=m.r()<0.5?-0.5:0.5;}}else m.underT=0;
  const P0=F.arena.pit&&F.t>=F.arena.pit.openS-AI_NAV.pitSoonS?F.arena.pit:null;
  /* stuck against a wall (or a stalemate shove): back off and turn */
  const sp=Math.hypot(o.vx,o.vy),touching=o.touch[t.i]!=null&&F.t-o.touch[t.i]<0.1,pushing=S.mode==="push"&&mode==="drive"&&touching;
  /* circling an enemy it's touching, full lock, for a second and a half (two bots chasing each other's tails): break off */
  if(touching&&Math.abs(out.steer)>0.9&&!(m.back>0)){m.spin+=F.dt;if(m.spin>1.5){m.spin=0;m.back=0.4+0.3*m.r();m.backSteer=out.steer>0?-0.4:0.4;}}
  else m.spin=Math.max(0,m.spin-F.dt*0.5);
  if(m.back>0){m.back-=F.dt;out.throttle=-1;out.steer=m.backSteer;}
  else{if(out.throttle>0.5&&sp<0.1*Math.max(o.b.driveSpeed,0.1)&&!pushing)m.stuck+=F.dt*(touching?(t.under&&t.under.by===o.i?0.2:0.4):1);else m.stuck=Math.max(0,m.stuck-F.dt);
    if(m.stuck>(S.stuckS||1.2)){m.stuck=0;m.back=0.45+0.3*m.r();m.backSteer=m.r()<0.5?-0.6:0.6;}}
  /* being shoved towards the pit or a hazard: turn across the shove and drive out of it, rather than pushing straight back */
  if(touching&&m.tac&&!(m.back>0)){const a=aiShove(F,o,t,P0);
    if(a!=null){const ef=wrapA(a-o.h),fwd=Math.abs(ef)<Math.PI/2,err=fwd?ef:wrapA(ef+Math.PI);out.steer=clamp1(-3*err);out.throttle=fwd?1:-1;}}
  /* keep out of an open pit, and off a shut one from AI_NAV.pitSoonS before it opens: look ahead along the way it's going;
     over the edge, drive off it along aiPitOut, by whichever end of the bot points that way */
  const P=P0;if(P){const r=P.rect,la=aiLerp(AI_SKILL.pitLook,sk),fx=Math.cos(o.h),fy=Math.sin(o.h),dir=out.throttle>=0?1:-1,
      qx=o.x+o.vx*la+fx*dir*o.rad*0.8,qy=o.y+o.vy*la+fy*dir*o.rad*0.8,e=o.rad*0.4;
    if(aiIn(qx,qy,aiGrow(r,e))){const away=aiPitOut(F,o,r),ef=wrapA(away-o.h),fwd=Math.abs(ef)<Math.PI/2,err=fwd?ef:wrapA(ef+Math.PI);
      out.steer=clamp1(-2.5*err);out.throttle=(fwd?1:-1)*(Math.abs(err)<0.5?1:Math.abs(err)<1?0.5:0.15);m.back=0;}}
  /* the weapon */
  const late=aiLerp(AI_SKILL.fireLate,sk)*(S.fireMul||1);
  if(w.type==="spinner"||w.type==="saw")out.weapon=1;
  else if(w.type==="flipper"||w.type==="hammer"||w.type==="crusher")out.weapon=m.inZone&&m.zoneT>=0&&F.t-m.zoneT>=late&&
    !(w.type==="flipper"&&t.inverted&&!t.b.height.drivesInverted&&!t.fx.righter)?1:0;   // a flipper leaves a stranded bot upside down
  else if(w.type==="lifter")out.weapon=m.inZone||o.wp.held!=null?1:0;
  return out;}
