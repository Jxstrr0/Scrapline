/* ---- vis/bot.js: the robot mesh, made from the build (an evalBuild() result the app passes in; the vis only looks up the
   wheel size in SCRAP_SIM's parts table). Everything is code, on every tier:
     chassis   the build's polygon, extruded from the clearance to the chassis height, in the chassis material
     armour    a panel per face, as thick as the plate (drawn at least 2 mm so it reads), in the plate's material
     wheels    one per wheel part, at its place in the layout; tracks as a belt
     weapon    by type: horizontal disc, vertical disc, drum, eggbeater, drisk, undercutter, saw on an arm, hammer arm, crusher jaw,
               flipper plate, lifter forks, a wedge's ramp (a pusher has a plain front)
               (on Full and Ultra the Blender pieces from models/bot-weapons.glb, stretched to the same boxes: wpPiece)
     bay       the weapon bay (b.bay, 0.1.15.3): a slot, pocket or well cut out of the chassis, its front plate and the top
               (a notch or hole by polyMinus, the chassis in layers round it), a recess from below for an undercutter, a
               deck where a raised top is cut away for an arm or a flipper; walls under a raised top so it isn't hollow.
               On Full and Ultra the shells have slotted variants for the default layout (shellVariant); a bay they
               don't have falls back to these coded shapes
   The mesh is in metres with its origin at the centre of mass (where the sim puts the bot), front along -z; the app's view
   scales it. On Full and Ultra the materials carry maps (vis/surface.js): buildBot ends by projecting UVs over the whole
   mesh (uvProject, one tile every SURF.tile metres), the wheels become a tyre with a tread round a brushed hub, and the
   Blender shells get their geometry copied per bot so they take the projection too. botDamage() greys out dented parts and hides destroyed ones, from SCRAP_SIM.partStates() (on Full and Ultra the grey is graded by hp lost, with scars and crooked plates: vis/wear.js). Meshes are cached
   by build hash (a few at a time) and their geometry and materials are disposed when they drop out of the cache. A team
   colour paints the side panels: clay for you, lilac, green and blue for the others. Your bot (the workshop's, and bot 0
   in a fight) also wears your sponsors' colours (SCRAP_VIS.setPaint, PR 8): a panel on each side, a patch on the top. ---- */
const BOT_TEAM=[0xd97757,0xb48ce8,0x4cc38a,0x7fb3e6];
const BOT_CACHE=new Map();   // hash -> group; kept to BOT_CACHE_MAX, oldest first out
const BOT_CACHE_MAX=6;
function botHash(b,team,paint,liv){return JSON.stringify(b.cfg)+"|"+(team||0)+"|"+V.tier+shellsReady()+"|"+(paint?(paint.side||"")+(paint.top||""):"")+"|"+badgeKey(liv);}
/* a sponsor colour ("#rrggbb") as a material, shared and never disposed with a bot (core.js makeMats clears them) */
function spMat(hex){let m=V.spMats[hex];if(!m)m=V.spMats[hex]=V.spMatte(parseInt(String(hex).slice(1),16)||0x888888,.45);return m;}
function disposeTree(g){g.traverse(o=>{if(o.geometry&&!o.userData.keep)o.geometry.dispose();if(o.material&&o.userData.own){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});}
/* a clone leaving the scene: its geometry belongs to the cached source, only its own (damage-tinted) materials go */
function disposeClone(g){if(g.parent)g.parent.remove(g);g.traverse(o=>{if(o.material&&o.userData.own)o.material.dispose();});}
/* a mesh from the cache, or a new one. The workshop and the arena each get their own clone (same geometry, shared materials) */
function botMesh(b,team,paint,liv){const k=botHash(b,team,paint,liv);let g=BOT_CACHE.get(k);
  if(g){BOT_CACHE.delete(k);BOT_CACHE.set(k,g);}   // most recently used last
  else{g=buildBot(b,team,paint,liv);BOT_CACHE.set(k,g);
    while(BOT_CACHE.size>BOT_CACHE_MAX){const [k0,g0]=BOT_CACHE.entries().next().value;BOT_CACHE.delete(k0);disposeTree(g0);}}   // a clone still on screen re-uploads it
  return cloneBot(g);}
function botCacheClear(){for(const g of BOT_CACHE.values())disposeTree(g);BOT_CACHE.clear();}
/* clone keeps geometry shared; part materials that get tinted by damage are cloned per instance (userData.own) */
function cloneBot(src){const g=src.clone(true);g.userData=Object.assign({},src.userData,{parts:{},spin:null,arm:null,forks:null,flip:null,jaw:null,kick:null,wheels:[],legs:[],trk:[],lamp:null});
  g.traverse(o=>{if(!o.isMesh)return;const u=o.userData;
    if(u.part){o.material=o.material.clone();o.userData={part:u.part,own:true,base:o.material.color.clone()};(g.userData.parts[u.part]||(g.userData.parts[u.part]=[])).push(o);}
    else if(u.role==="blur"){o.material=o.material.clone();o.userData={role:"blur",own:true};g.userData.blur=o;}
    else if(u.role==="lamp"){o.material=o.material.clone();o.userData={role:"lamp",own:true};g.userData.lamp=o;}
    if(u.wheel)g.userData.wheels.push(o);});
  g.traverse(o=>{const r=o.userData.role;if(r==="spin")g.userData.spin=o;else if(r==="arm")g.userData.arm=o;else if(r==="forks")g.userData.forks=o;else if(r==="flip")g.userData.flip=o;else if(r==="jaw")g.userData.jaw=o;else if(r==="kick")g.userData.kick=o;else if(r==="leg")g.userData.legs.push(o);else if(r==="trk")g.userData.trk.push(o);});
  return g;}
function chassisMat(id){const M=V.mats;return id==="ply"?M.ply:id==="hdpe"?M.hdpe:id==="steel"?M.steel:id==="ti"?M.ti:id==="custom"?M.botPlate||M.plate:M.alu;}
function armourMat(id){const M=V.mats;return/^hdpe/.test(id)?M.hdpe:id==="alu"?M.alu:id==="ti"?M.ti:id==="ar500"?M.botPlate||M.plate:M.steel;}

function buildBot(b,team,sp,liv){
  const M=V.mats,g=new THREE.Group(),lite=V.tier==="lite",seg=lite?20:40,cfg=b.cfg,cx=b.com.x,cy=b.com.y;
  const L=b.lengthM,Wd=b.widthM,hw=Wd/2,hl=L/2,len=L/0.27;   // len: rough class scale from the length, for small fixed sizes
  const clr=Math.max(0.001,b.height.clearanceMm/1000),H=Math.max(clr+0.01,b.height.heightMm/1000),bodyH=H-clr;
  const P=(x,y)=>[x-cx,-(y-cy)];   // build coords (m, y forward) to mesh (x, z), origin at the centre of mass
  const add=(geo,mat,x,y,z,part)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(part)m.userData.part=part;g.add(m);return m;};
  const body=cfg.body||"plain",drop=body==="wedge"?bodyH*0.6:0,bh=bodyH-drop,boxTop=clr+bh;   /* bh: the box height under a wedge shell's slope */
  SURF.tile=lite?0:0.09*len;
  const wp=(typeof SCRAP_SIM!=="undefined"&&SCRAP_SIM.part("wheels",cfg.wheels))||{radiusMm:28},   /* SCRAP_SIM is a top-level const, so it is not on window (0.1.41: this lookup never found it, and tracks were drawn as wheels) */
    ws=b.wheelRadiusMm>0&&wp.radiusMm?b.wheelRadiusMm/(wp.radiusMm*len):1,   // the wheel-size dial (0.1.33): evalBuild's radius over the stock one
    wr=body==="cylinder"&&b.wheelRadiusMm>0?b.wheelRadiusMm/1000:Math.min(H*0.55*ws,(wp.radiusMm||28)/1000*len*ws),ww=Math.max(0.006*len,wr*(wp.tracks&&!lite?1.1:0.55));   // a track is twice a tyre's width (Lite keeps its thin box)
  /* (a two-wheel drum's wheels, 0.1.63, are evalBuild's own radius: they stand taller than it) */
  const wheels0=b.parts.filter(p=>/^wheel\d/.test(p.key)),wl=b.wheelbase||{id:"std"};   // evalBuild's wheel layout (vis never reads SCRAP_SIM's tables for it)
  /* 0.1.63, the two-wheel drum: one big wheel a side at the middle. The sim keeps a wheel part per pod; the first on each side carries the drawn wheel */
  const drum=body==="cylinder",wheels=drum?[-1,1].map(s=>{const p=wheels0.find(q=>(q.pos[0]<0?-1:1)===s);return p?Object.assign({},p,{pos:[p.pos[0],0]}):null;}).filter(Boolean):wheels0;
  const D=lite?null:botDetail(),allRound=["shell","ring","melty"].indexOf(b.weapon.id)>=0;   // the Blender detail parts (models/bot-detail.glb, 0.1.41)
  const bolts=[],bolt=(host,n,x,y,z,r,ax)=>{if(D&&host)bolts.push({host,n,x,y,z,r,ax});};   // fasteners, merged into one mesh per plate at the end   /* the surfaces' grain: one tile every 9 cm at beetle scale (vis/surface.js; 0 skips the projection) */
  /* the weapon bay (0.1.15.3): evalBuild's b.bay. A slot, pocket or well is cut out of the chassis, its front plate and
     the top over it; a deck is a flat plate on the box top where a raised top (a wedge lid, a dome, a shell) is cut away
     for an arm or a flipper. span: the opening's height in the box, from its bottom */
  let bay=b.bay&&b.bay.rect&&b.bay.kind!=="none"?b.bay:null,bk=bay?bay.kind:"none",reg=bay?bayRegion(bay,hw,hl,Math.max(Wd,L)*0.06,seg):null;
  let wr0=Math.max(0.01*len,b.weapon.radiusM||0.04),dep=bay?Math.min(bh*0.8,bay.depthM||0):0;
  const span=!reg?null:bk==="slot"?(b.weapon.id==="saw"?[bh-Math.min(bh*0.8,wr0*0.5),bh]:[0,bh]):bk==="pocket"?[0,bh]:bk==="well"?[bh-dep,bh]:bk==="underwell"?[0,dep]:null;
  const ext=(outline,holes,y0,y1,mat,part)=>y1-y0>1e-5?add(shapeGeo(outline,holes,y1-y0,cx,cy,y0),mat,0,0,0,part):null;
  /* chassis: the polygon extruded (in layers round a bay), a little inset so the armour panels sit on it */
  const cm=chassisMat(cfg.chassis),cut=span?polyMinus(b.polygon,reg):null;
  /* wheel wells (0.1.41, every tier: it is a few hundred triangles): the chassis side is notched at each wheel (one long notch for a track) and the side
     plate over it gets an arch, so the wheels show in the bot's side instead of hiding inside the box. Not under a slab's
     skirts or for legs (they stand outside); a wheel whose well would run into the weapon bay stays inside as before */
  const wells=body==="slab"||wl.legs?null:wheelWells({wheels,wr,ww,hw,hl,len,L,tracks:!!wp.tracks,reg:cut?reg:null,poly:b.polygon});
  const NW=o=>wellNotch(o,wells,hw);
  if(cut){ext(NW(b.polygon),null,clr,clr+span[0],cm,"chassis");ext(NW(cut.outline),cut.holes,clr+span[0],clr+span[1],cm,"chassis");ext(NW(b.polygon),null,clr+span[1],boxTop,cm,"chassis");}
  else ext(NW(b.polygon),null,clr,boxTop,cm,"chassis");
  if(span&&!cut){reg=null;dep=0;}   /* a bay the outline can't be cut round (a big moved disc over a corner): draw the bot uncut, the weapon on top */
  /* armour panels, per face; thickness drawn at least 2 mm (x class) so a plate reads on a phone. The front plate parts
     round a bay that opens at the front */
  const A=b.armourMapJ||{},th=f=>A[f]&&A[f].id!=="none"?Math.max(0.002*len,(A[f].thickMm||0)/1000):0;
  const front=P(0,hl),back=P(0,-hl),sloped=["wedge","lifter","flipper","grabber"].indexOf(b.weapon.type)>=0;
  /* a plate's bolts: one near each corner and more along the top and bottom of a long one (dir: -1 a front plate, 1 a back one) */
  const rb=0.0034*len,plateBolts=(m,w,h,t,dir)=>{if(!D||!m||w<rb*5||h<rb*5)return m;const ix=Math.min(w*0.2,rb*2.6),iy=Math.min(h*0.22,rb*2.6),n=Math.max(1,Math.round((w-2*ix)/(0.06*len)));
    for(let i=0;i<=n;i++)for(const sy of [-1,1])bolt(m,"dt_hex",m.position.x-w/2+ix+(w-2*ix)*i/n,m.position.y+sy*(h/2-iy),m.position.z+dir*t/2,rb,dir<0?"-z":"+z");return m;};
  if(th("front")&&!sloped){const t=th("front"),fm=armourMat(A.front.id),ya=bh*0.02,yb=bh*0.94,xa=cut?frontGap(bay,hw,hl):null;
    const piece=(x0,x1,y0,y1)=>{if(x1-x0>1e-4&&y1-y0>1e-4)plateBolts(add(plateGeo(x1-x0,y1-y0,t,lite?0:0.0012*len),fm,(x0+x1)/2-cx,clr+(y0+y1)/2,front[1]-t/2,"armour_front"),x1-x0,y1-y0,t,-1);};
    if(xa){piece(-hw,xa[0],ya,yb);piece(xa[1],hw,ya,yb);piece(xa[0],xa[1],ya,Math.min(yb,span[0]));piece(xa[0],xa[1],Math.max(ya,span[1]),yb);}
    else piece(-hw,hw,ya,yb);}
  if(th("back"))plateBolts(add(plateGeo(Wd,bodyH*0.92,th("back"),lite?0:0.0012*len),armourMat(A.back.id),back[0],clr+bodyH*0.48,back[1]+th("back")/2,"armour_back"),Wd,bodyH*0.92,th("back"),1);
  /* the side plates stand a hair proud of the chassis (their faces used to share its plane and flicker); with wells, each
     is one plate with the wheel arches cut out of its bottom edge and a chamfer along its top */
  const proud=0.0007*len;
  for(const s of ["left","right"])if(th(s)){const sg=s==="left"?-1:1,x=sg*(hw+proud)-cx,t=th(s),W=wells&&wells[s],y0=clr+bh*0.02,y1=clr+bh*0.94,z0=cy-L*0.48,z1=cy+L*0.48;
    if(!W){const m=add(new THREE.BoxGeometry(t,bh*0.92,L*0.96),armourMat(A[s].id),x-sg*t/2,clr+bh*0.48,cy,"armour_"+s);
      if(D&&body!=="slab"){const n=Math.max(1,Math.round(L*0.9/(0.06*len)));for(let i=0;i<=n;i++)for(const sy of [-1,1])bolt(m,"dt_hex",x,m.position.y+sy*(bh*0.46-rb*2.6),z0+L*0.03+L*0.9*i/n,rb,sg<0?"-x":"+x");}
      continue;}
    const ar=wellArch(W,wells,wr,cy,y0,y1),m=add(sidePlateGeo(z0-cy,z1-cy,y0-(y0+y1)/2,y1-(y0+y1)/2,t,sg,z=>ar.h(z+cy)-(y0+y1)/2,ar.cuts.map(c=>[c[0]-cy,c[1]-cy]),lite?0:Math.min(t*0.5,0.0015*len),lite?7:14),armourMat(A[s].id),x,(y0+y1)/2,cy,"armour_"+s);
    if(D){const n=Math.max(1,Math.round(L*0.9/(0.06*len))),yb=y0+rb*2.6,yt=y1-rb*2.6;
      for(let i=0;i<=n;i++){const z=z0+L*0.03+L*0.9*i/n,hz=Math.max(ar.h(z-rb*2),ar.h(z),ar.h(z+rb*2));
        if(hz<yt-rb*2)bolt(m,"dt_hex",x,yt,z,rb,sg<0?"-x":"+x");if(hz<y0+1e-6)bolt(m,"dt_hex",x,yb,z,rb,sg<0?"-x":"+x");}}}
  const topKey=th("top")?"armour_top":"chassis",tt=Math.max(th("top"),0.0015*len),topMat=th("top")?armourMat(A.top.id):chassisMat(cfg.chassis);
  const S0=lite?null:botShells(),sideMat=s=>th(s)?armourMat(A[s].id):chassisMat(cfg.chassis),sideKey=s=>th(s)?"armour_"+s:"chassis";
  /* a shell with a bay needs the slotted variant made for it; a bay the shells don't have (the weapon moved in the layout)
     falls back to the coded shapes, which cut any bay */
  const sv=S0&&SHELL_TOPS[body]?shellVariant(bay,b.weapon,body):null,S=S0&&(!SHELL_TOPS[body]||sv)?S0:null;
  const sk={M,cx,cy,H,clr,bodyH,Wd,L,hw,hl,len,tt:th("top")?tt:0,topKey,topMat,sideMat,sideKey,sv:sv&&sv.top,svb:sv&&sv.bottom};
  const topCut=!!reg&&(bk==="slot"||bk==="pocket"||bk==="well"),raisedCut=!!reg&&(topCut||bk==="deck");   /* a deck cuts only a raised top */
  if(body==="scrap"){const wt=b.weapon.type,wid=b.weapon.id,up=topCut||["hammer","crusher","flipper","grabber","saw"].indexOf(wt)>=0;   /* what the scrap frame has to clear (scrapFrame) */
    sk.fr={none:wid==="shell",noPosts:wid==="ring",gap:topCut?frontGap(bay,hw,hl):null,over:up&&!(bay&&bay.rect[1]<-0.3*L)?1:0,cross:0};}
  const deck=bk==="deck"&&(S&&SHELL_TOPS[body]||(!S&&(body==="wedge"||body==="dome")));
  const bev=lite?0:Math.min(tt*0.4,0.0012*len),extB=(outline,holes,y0,y1,mat,part)=>y1-y0>1e-5?add(shapeGeo(outline,holes,y1-y0,cx,cy,y0,bev),mat,0,0,0,part):null;
  const flat=(w,l,y0,mat,part,c)=>{const p=rectPts(w,l),d=c?polyMinus(p,reg):null;return d?extB(d.outline,d.holes,y0,y0+tt,mat,part):extB(p,null,y0,y0+tt,mat,part);};
  /* a flat top's screws: round its edge, a row every 5 cm at beetle scale, none over an open bay */
  const topBolts=(m,w,l,y)=>{if(!D||!m||allRound)return;const r=0.003*len,ins=r*2.6,put=(px,py)=>{if(reg&&topCut&&rectHitsPoly(px-r*2,py-r*2,px+r*2,py+r*2,reg))return;bolt(m,"dt_bolt",px-cx,y,cy-py,r,"+y");};
    const nx=Math.max(1,Math.round((w-2*ins)/(0.05*len))),ny=Math.max(1,Math.round((l-2*ins)/(0.05*len)));
    for(let i=0;i<=nx;i++)for(const sy of [-1,1])put(-w/2+ins+(w-2*ins)*i/nx,sy*(l/2-ins));
    for(let i=1;i<ny;i++)for(const sx of [-1,1])put(sx*(w/2-ins),-l/2+ins+(l-2*ins)*i/ny);};
  if(S&&SHELL_TOPS[body])shellBody(g,S,body,sk);
  else if(body==="wedge"){   /* wedge shell: the top plate slopes from the back edge down to the front */
    const run=L*0.98,tilt=Math.atan2(drop,run),lp=rectPts(Wd*0.98,Math.hypot(run,drop)),ct=Math.cos(tilt),d=raisedCut?polyMinus(lp,reg.map(p=>[p[0],p[1]/ct])):null;
    const lg=shellGeoLocal(d?d.outline:lp,d?d.holes:null,tt);lg.translate(0,-tt/2,0);const m=add(lg,topMat,-cx,H-drop/2+tt/2,cy,topKey);m.rotation.x=-tilt;
    if(d)sleeve(g,reg,cx,cy,L,p=>H-drop/2-p[1]*Math.tan(tilt),boxTop,p=>Math.abs(p[0])<Wd*0.49&&Math.abs(p[1])<L*0.49,topMat,topKey);
    for(const s of [-1,1]){const sg=new THREE.Shape();sg.moveTo(-run/2,0);sg.lineTo(run/2,0);sg.lineTo(run/2,drop);sg.closePath();   /* side cheeks filling the slope */
      const d=Math.max(th(s<0?"left":"right"),0.002*len),e=new THREE.ExtrudeGeometry(sg,{depth:d,bevelEnabled:false});e.rotateY(-Math.PI/2);
      add(e,th(s<0?"left":"right")?armourMat(A[s<0?"left":"right"].id):chassisMat(cfg.chassis),(s<0?-hw+d:hw)-cx,H-drop,cy,th(s<0?"left":"right")?(s<0?"armour_left":"armour_right"):"chassis");}}
  else if(body==="dome"){   /* dome: a low half-ellipsoid clamshell over the box (round a bay, a height field with the bay cut out) */
    const a=Wd*0.51,c=L*0.5,Hc=H-bodyH*0.3,dh=p=>Hc+bodyH*0.8*Math.sqrt(Math.max(0,1-(p[0]/a)*(p[0]/a)-(p[1]/c)*(p[1]/c)));
    if(raisedCut){add(domeGeo(a,c,dh,reg,cx,cy,lite?18:36),topMat,0,0,0,topKey);sleeve(g,reg,cx,cy,L,dh,H,p=>(p[0]/a)*(p[0]/a)+(p[1]/c)*(p[1]/c)<0.995,topMat,topKey);}
    else{const dg=new THREE.SphereGeometry(0.5,lite?14:28,lite?5:10,0,Math.PI*2,0,Math.PI/2);dg.scale(Wd*1.02,bodyH*1.6,L*1.0);
      add(dg,topMat,-cx,Hc,cy,topKey);}}
  else if(drum){   /* 0.1.63, the two-wheel drum: a barrel over the box between the wheels, its top and both ends one curve that hits glance off */
    const s=bodyH*0.6,Rb=(L*L/4+s*s)/(2*s),ang=2*Math.asin(Math.min(1,L*0.5/Rb)),bw=Math.max(Wd*0.4,Wd-2*(ww+0.003*len)),n=lite?14:32;
    const bg=new THREE.CylinderGeometry(Rb,Rb,bw,n,1,true,Math.PI/2-ang/2,ang);bg.rotateZ(Math.PI/2);add(bg,topMat,-cx,H+s-Rb,cy,topKey);
    const sh=new THREE.Shape();for(let i=0;i<=n;i++){const a=-ang/2+ang*i/n,u=Rb*Math.sin(a),v=Rb*Math.cos(a)-(Rb-s);if(i)sh.lineTo(u,v);else sh.moveTo(u,v);}sh.closePath();
    for(const sg of [-1,1]){const cg=new THREE.ShapeGeometry(sh);cg.rotateY(sg*Math.PI/2);add(cg,topMat,sg*bw/2-cx,H,cy,topKey);}}
  else if(th("top")||body==="invert"){const fw=Wd*(body==="pancake"?1.04:0.98),fl=L*(body==="pancake"?1.02:0.98);topBolts(flat(fw,fl,H,topMat,topKey,topCut),fw,fl,H+tt);}
  if(body==="invert"&&!S)flat(Wd*0.98,L*0.98,clr-tt,topMat,"chassis",!!reg&&bay.openBelow&&(bk==="slot"||bk==="pocket"||bk==="underwell"));   /* the same plate underneath */
  if(deck){const R=bay.rect;add(new THREE.BoxGeometry(R[2]-R[0],tt,R[3]-R[1]),topMat,(R[0]+R[2])/2-cx,boxTop+tt/2,cy-(R[1]+R[3])/2,topKey);}
  if(S&&(body==="slab"||body==="scrap"))shellBody(g,S,body,sk);   /* these keep the flat top above and add to it */
  if(body==="slab"&&!S)for(const sx of [-1,1])for(const sz of [-1,1]){   /* corner guards */
    const c=add(new THREE.BoxGeometry(0.016*len,bodyH*1.02,0.016*len),M.steel,sx*hw-cx,clr+bodyH*0.51,cy+sz*hl,"chassis");c.rotation.y=Math.PI/4;}
  if(body==="scrap"&&!S)scrapFrame(g,null,sk);
  /* team paint: a stripe down the top, so you can tell the bots apart from above; it stops short of an open bay. With a
     livery (0.1.24) the stripe is the team's main colour, two pinstripes beside it the accent, and the badge sits on it */
  let ys0=-0.4*L,ys1=0.3*L;if(body==="dome"){ys0=-0.26*L;ys1=0.16*L;}
  /* 0.1.48.1, the top deck is laid out once so nothing lands on anything else: the sponsor's patch owns the back, the stripe
     stops short of it, the badge stays inside the stripe's length and between the fittings, and under a shell spinner there
     is no paint at all (it used to poke through the shell). On a dome every decal is draped over the curve (drape) */
  const dome=body==="dome",deco=b.weapon.id!=="shell";
  const spz=dome?0.28:S&&(body==="wedge"||body==="pancake")?0.3:0.36,spd=dome?0.16:0.18,spw=dome?0.44:S&&body==="invert"?0.34:0.6;   /* the patch: how far back its middle is, its depth and width (over a shell: clear of the bolts and rails) */
  const spOn=!!(sp&&sp.top&&deco);if(spOn)ys0=Math.max(ys0,-(spz-spd/2)*L+0.02*L);
  if(reg&&(topCut||(raisedCut&&(body==="wedge"||body==="dome"||(S&&SHELL_TOPS[body]))))&&bay.rect[0]<Wd*0.14&&bay.rect[2]>-Wd*0.14)ys1=Math.max(ys0+0.12*L,Math.min(ys1,bay.rect[1]-0.03*L));
  const lid=S&&SHELL_LID[body]!=null?SHELL_LID[body]*bodyH:th("top"),wt=S&&body==="wedge"?0.07*bodyH:tt,wtl=body==="wedge"?Math.atan2(drop,L*0.98):0;
  /* a flat decal: a thin box w wide and l long, its middle at (x, y) in build coords, up above the top (a wedge: on its slope) */
  const slab=(w,l,x,y,mat,up)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.0015*len,l),mat);m.position.set(x-cx,H+lid+up,cy-y);
    if(body==="wedge"){m.position.y=H-drop/2-y*Math.tan(wtl)+wt+up;m.rotation.x=-wtl;}g.add(m);return m;};
  let drape=null;
  if((dome||drum)&&deco){g.updateMatrixWorld(true);const tops=[];g.traverse(o=>{if(o.isMesh&&o.userData.part===topKey)tops.push(o);});
    const rc=new THREE.Raycaster(),dn=new THREE.Vector3(0,-1,0),o3=new THREE.Vector3();
    const hAt=(x,y)=>{o3.set(x-cx,H+bodyH*3,cy-y);rc.set(o3,dn);const h=rc.intersectObjects(tops,false);return h.length?h[0].point.y:H;};
    /* the same decal as a grid laid on the dome: each corner of the grid is dropped onto the shell (turn: the badge, which reads from the front) */
    drape=(w,l,x,y,mat,up,turn)=>{const ge=new THREE.PlaneGeometry(w,l,lite?3:6,lite?4:8);ge.rotateX(-Math.PI/2);if(turn)ge.rotateY(Math.PI);
      const Q=ge.attributes.position;for(let i=0;i<Q.count;i++){const px=Q.getX(i)+x,py=y-Q.getZ(i);Q.setXYZ(i,px-cx,hAt(px,py)+up+0.0006*len,cy-py);}
      ge.computeVertexNormals();const m=new THREE.Mesh(ge,mat);g.add(m);return m;};}
  const decal=drape||slab,yc=(ys0+ys1)/2,e=0.0008*len;
  if(deco){decal(Wd*0.28,ys1-ys0,0,yc,liv?spMat(liv.main):M.team[team%BOT_TEAM.length],e);
    if(liv){const am=spMat(liv.accent);for(const s of [-1,1])decal(Wd*0.035,ys1-ys0,s*Wd*0.18,yc,am,e);
      /* the badge: its halo covers the pinstripes and stops short of the lamp and the link beside it */
      const bs=Math.min(Wd*0.48,L*0.42,ys1-ys0),bm=badgeMat(liv);let bd;
      if(drape)bd=drape(bs,bs,0,yc,bm,e+0.0012*len,true);
      else{bd=new THREE.Mesh(new THREE.PlaneGeometry(bs,bs),bm);bd.position.set(-cx,(body==="wedge"?H-drop/2-yc*Math.tan(wtl)+wt:H+lid)+e+0.0012*len,cy-yc);
        bd.rotation.set(-Math.PI/2-wtl,0,Math.PI);g.add(bd);}   /* the badge reads upright from in front of the bot */
      bd.userData.role="decal";}}   /* a decal keeps its own UVs (the grain projection below used to redo them, which slid the badge off its stripe on Full and Ultra) */
  /* sponsors: a panel on each side, a patch at the back of the top plate */
  /* 0.1.48.1: a side panel goes in the longest stretch of the side clear of the wheel arches (it used to lie across a middle
     wheel on a caster, six or eight wheel bot, and along a track); no stretch long enough, no panel. Lower under a dome's rim */
  if(sp&&sp.side)for(const s of [-1,1]){let a=-0.25*L,e=0.25*L;
    if(wells){const blk=wp.tracks?[[-0.4*L-wr*0.2,0.4*L+wr*0.2]]:wheels.filter(p=>(p.pos[0]<0?-1:1)===s).map(p=>[p.pos[1]-wr*1.22,p.pos[1]+wr*1.22]).sort((u,v)=>u[0]-v[0]);
      let at=-0.46*L,best=null;for(const q of blk.concat([[0.46*L,0.46*L]])){if(q[0]-at>(best?best[1]-best[0]:0))best=[at,q[0]];at=Math.max(at,q[1]);}
      if(!best||best[1]-best[0]<0.16*L)continue;const ln=Math.min(0.5*L,best[1]-best[0]-0.02*L),c=Math.max(best[0]+0.01*L+ln/2,Math.min(best[1]-0.01*L-ln/2,0));a=c-ln/2;e=c+ln/2;}
    const ph=bh*(dome?0.36:0.5),m=new THREE.Mesh(new THREE.BoxGeometry(0.0015*len,ph,e-a),spMat(sp.side));
    m.position.set(s*(hw+(S&&body==="slab"?Wd*0.05:0))-cx+s*0.0009*len,clr+bh*(dome?0.4:0.5),cy-(a+e)/2);g.add(m);
    /* 0.1.54: the sponsor's logo in the middle of the panel, black or white to suit the colour; it faces out on both sides */
    const lm=sp.ids&&sp.ids.side?logoMat("s_"+sp.ids.side,logoInk(sp.side),sp.side):null;
    if(lm){const q=Math.min(ph,e-a)*0.84,lg=new THREE.Mesh(new THREE.PlaneGeometry(q,q),lm);lg.position.set(m.position.x+s*0.0012*len,m.position.y,m.position.z);lg.rotation.y=s*Math.PI/2;lg.userData.role="decal";g.add(lg);}}
  if(spOn){decal(Wd*spw,L*spd,0,-spz*L,spMat(sp.top),0.0009*len);
    /* 0.1.54: the sponsor's logo on the patch, laid like the badge so it reads from in front of the bot */
    const lm=sp.ids&&sp.ids.top?logoMat("s_"+sp.ids.top,logoInk(sp.top),sp.top):null;
    if(lm){const q=Math.min(Wd*spw,L*spd)*0.86,y=-spz*L,up=0.0009*len+0.0012*len;let lg;
      if(drape)lg=drape(q,q,0,y,lm,up,true);
      else{lg=new THREE.Mesh(new THREE.PlaneGeometry(q,q),lm);lg.position.set(-cx,(body==="wedge"?H-drop/2-y*Math.tan(wtl)+wt:H+lid)+up,cy-y);lg.rotation.set(-Math.PI/2-wtl,0,Math.PI);g.add(lg);}
      lg.userData.role="decal";}}
  /* wheels (or tracks), from the layout */
  const Wh=!lite&&!wp.tracks&&wl.id!=="std"&&wl.id!=="six"&&wl.id!=="eight"?botWheels():null;   // the Blender wheel parts (models/bot-wheels.glb)
  const wx=p=>Math.sign(p.pos[0]||1)*(hw-ww/2-0.001*len);
  if(Wh&&wl.id==="mecanum")for(const p of wheels){const q=P(p.pos[0],p.pos[1]);   // Full / Ultra: the Blender mecanum wheel, both pieces turn
    for(const [n,m] of [["wh_mec_hub",M.alu],["wh_mec_rollers",M.rubber]]){const o=shellAdd(g,Wh,n,m,p.key,wx(p)-cx,wr,q[1],ww,wr,wr);if(o)o.traverse(x=>{if(x.isMesh)x.userData.wheel=1;});}}
  else if(wl.legs)botLegs(g,wheels,{P,wr,ww,hw,cx,lite,lh:Math.max(wr*2,clr+bodyH*0.75),Wh:!lite?botOdd():null});   // 0.1.34: shuffler legs where the wheels would be
  else if(wp.tracks&&D)botTracks(g,D,{hw,ww,wr,cx,cy,L,len});   // Full / Ultra: links round two sprockets, and they run (app/arena)
  else if(wp.tracks){for(const s of [-1,1]){const t=add(new THREE.BoxGeometry(ww,wr*2,L*0.8),M.rubber,s*(hw-ww/2)-cx,wr,cy,s<0?"wheel0":"wheel1");t.userData.wheel=1;}}
  else if(lite){const wg=new THREE.CylinderGeometry(wr,wr,ww,seg);wg.rotateZ(Math.PI/2);const hg=new THREE.CylinderGeometry(wr*0.58,wr*0.58,ww*1.05,12);hg.rotateZ(Math.PI/2);
    for(const p of wheels){const q=P(p.pos[0],p.pos[1]),x=Math.sign(p.pos[0]||1)*(hw-ww/2-0.001*len);
      const w=add(wg,M.rubber,x-cx,wr,q[1],p.key);w.userData.wheel=1;if(wells){const h=add(hg,M.alu,x-cx,wr,q[1],p.key);h.userData.wheel=1;}}}   // a hub, now the wheel shows in its arch
  else if(D){   /* Full and Ultra (0.1.41): a Blender tyre for the wheel type (lugs, foam, grooves, a knurled band) on a spoked hub or a solid disc */
    const ty=DETAIL_TYRE[cfg.wheels]||"dt_tyre_block",solid=cfg.wheels==="solid";
    for(const p of wheels){const q=P(p.pos[0],p.pos[1]);
      for(const [n,m] of [[ty,M.rubber],[solid?"dt_hub_disc":"dt_hub_spoke",M.alu]]){const o=shellAdd(g,D,n,m,p.key,wx(p)-cx,wr,q[1],ww,wr,wr);if(o)o.traverse(x=>{if(x.isMesh)x.userData.wheel=1;});}}}
  else{   /* until the kit lands: a tyre (the tread runs round it: the cylinder's own UVs, repeated) on a brushed hub with a face */
    const tg=new THREE.CylinderGeometry(wr,wr,ww,seg,1,true);uvRepeat(tg,Math.max(2,Math.round(2*Math.PI*wr/(SURF.tile*0.5))),1);tg.rotateZ(Math.PI/2);
    const hg=new THREE.CylinderGeometry(wr*0.62,wr*0.62,ww*1.04,seg);hg.rotateZ(Math.PI/2);
    for(const p of wheels){const q=P(p.pos[0],p.pos[1]),x=Math.sign(p.pos[0]||1)*(hw-ww/2-0.001*len);
      const w=add(tg,M.rubber,x-cx,wr,q[1],p.key);w.userData.wheel=1;const h=add(hg,M.alu,x-cx,wr,q[1],p.key);h.userData.wheel=1;}}
  botWheelParts(g,b,wl,Wh,{P,add,wheels,wx,wr,ww,hw,hl,cx,clr,len,seg,lite});
  /* wheel guards (0.1.48.1, every tier): where a wheel stands taller than the top beside it (the low end of a wedge, the
     deck round a dome, big wheels on the dial) it used to poke straight through the plate. Now an arch in the side plate's
     material covers the part that shows, like a mudguard. Not for tracks or legs, under a slab's skirts, in a scrap frame
     (its wheels stand bare between the rails), for swerve pods or under an all-round weapon */
  const guards=[];
  if(!wp.tracks&&!wl.legs&&wl.id!=="swerve"&&body!=="slab"&&body!=="scrap"&&!drum&&!allRound)for(const p of wheels){const q=P(p.pos[0],p.pos[1]),sd=p.pos[0]<0?"left":"right";
    const hs=body==="wedge"?H-drop/2-p.pos[1]*Math.tan(wtl)+wt:body==="dome"?boxTop:H+lid;if(2*wr-hs<0.003*len)continue;
    const R=wr*1.13,ri=wr*1.04,w=ww+0.003*len,a0=Math.asin(Math.max(-0.45,Math.min(0.9,(hs-0.001*len-wr)/R))),a1=Math.PI-a0,sh=new THREE.Shape();
    sh.absarc(0,0,R,a0,a1,false);sh.absarc(0,0,ri,a1,a0,true);sh.closePath();
    const ge=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false,curveSegments:lite?6:14});ge.rotateY(Math.PI/2);ge.translate(-w/2,0,0);
    add(ge,th(sd)?armourMat(A[sd].id):chassisMat(cfg.chassis),wx(p)-cx,wr,q[1],th(sd)?"armour_"+sd:"chassis");
    guards.push([wx(p),p.pos[1],w/2,R]);}
  /* a track the same way: one cover over the top run and round both ends, where the track stands above the top (a wedge's slope) */
  if(wp.tracks&&body!=="slab"&&body!=="scrap"&&!allRound){const zs=Math.max(wr*0.2,0.4*L-wr),hs=body==="wedge"?H-drop/2-zs*Math.tan(wtl)+wt:dome?boxTop:H+lid;
    if(2*wr-hs>=0.003*len)for(const sg of [-1,1]){const sd=sg<0?"left":"right",R=wr*1.13,ri=wr*1.04,w=ww+0.003*len,sh=new THREE.Shape();
      sh.moveTo(zs+R,0);sh.absarc(zs,0,R,0,Math.PI/2,false);sh.absarc(-zs,0,R,Math.PI/2,Math.PI,false);sh.lineTo(-zs-ri,0);sh.absarc(-zs,0,ri,Math.PI,Math.PI/2,true);sh.absarc(zs,0,ri,Math.PI/2,0,true);sh.closePath();
      const ge=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false,curveSegments:lite?5:10});ge.rotateY(Math.PI/2);ge.translate(-w/2,0,0);
      add(ge,th(sd)?armourMat(A[sd].id):chassisMat(cfg.chassis),sg*(hw-ww/2-0.001*len)-cx,wr,cy,th(sd)?"armour_"+sd:"chassis");guards.push([sg*(hw-ww/2),0,w/2,zs+R]);}}
  /* the deck fittings (0.1.41, Full / Ultra): the power light, lit in the team's colour (app/arena puts it out with the bot),
     and the removable link, either side of the stripe behind the middle. On a flat top or a wedge's slope; not on a dome,
     under an all-round weapon or where a bay opens */
  if(D&&!allRound&&body!=="dome"&&!drum){const tl=body==="wedge"?Math.atan2(drop,L*0.98):0,yf=spOn?Math.max(-0.17*L,-(spz-spd/2)*L+0.075*L):-0.17*L,fy=body==="wedge"?H-drop/2-yf*Math.tan(tl)+wt:H+lid,r=0.0075*len;
    const free=x=>!(reg&&raisedCut&&rectHitsPoly(x-r*2.2,yf-r*2.2,x+r*2.2,yf+r*2.2,reg))&&!guards.some(q=>Math.abs(q[0]-x)<q[2]+r*2.2&&Math.abs(q[1]-yf)<q[3]+r*2.2);
    const fit=x=>{const G=new THREE.Group();G.position.set(x-cx,fy,cy-yf);G.rotation.x=-tl;g.add(G);return G;};
    if(free(-0.34*Wd)){const G=fit(-0.34*Wd),col=new THREE.Color(liv?parseInt(String(liv.main).slice(1),16)||0x888888:BOT_TEAM[team%BOT_TEAM.length]).convertSRGBToLinear();
      shellAdd(G,D,"dt_lamp_base",M.steel,null,0,0,0,r,r,r);
      const lm=new THREE.MeshStandardMaterial({color:col.clone().multiplyScalar(0.2),emissive:col,emissiveIntensity:DETAIL_LAMP,roughness:0.25,metalness:0});
      const o=shellAdd(G,D,"dt_lamp_lens",lm,null,0,0,0,r,r,r);if(o)o.traverse(x=>{if(x.isMesh)x.userData={role:"lamp",own:true};});else lm.dispose();}
    if(free(0.34*Wd)){const G=fit(0.34*Wd),w=0.03*len;shellAdd(G,D,"dt_link_base",spMat("#2b2b30"),null,0,0,0,w,w*0.55,w);shellAdd(G,D,"dt_link_key",spMat("#e3c04a"),null,0,0,0,w,w*0.55,w);}}
  boltMeshes(g,D,bolts);
  /* the weapon */
  /* an arm or a flipper lies on its deck; otherwise over the dome's crown or halfway down the wedge's slope */
  buildWeapon(g,b,{P,add,hw,hl,H,clr,bodyH,len,seg,front,th,bh,boxTop,crown:body==="dome"?H+bodyH*0.52:drum?H+bodyH*0.6:H+lid,wellD:bk==="well"||bk==="underwell"?dep:0,
    lift:deck?boxTop+tt-H:body==="dome"?bodyH*0.5:drum?bodyH*0.6:body==="wedge"?-drop/2:th("top")?tt:0});
  buildAttach(g,b,{P,add,Wd,L,hw,hl,clr,bh,bodyH,boxTop,len,seg,front,back,lite});
  if(!lite){g.updateMatrixWorld(true);g.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
    if(o.material!==M.disc&&o.userData.role!=="blur"&&o.userData.role!=="decal")uvProject(o.geometry,o.matrixWorld);});}   /* discs keep their cap UVs (turning marks round the hub); the tyres were done above */
  g.userData.H=H;g.userData.L=L;g.userData.W=Wd;g.userData.type=b.weapon.type;g.userData.wid=b.weapon.id;
  return g;}

/* ---- the detail kit (0.1.41, Full / Ultra; models/bot-detail.glb, tools/blender-bot-detail.py; botDetail in vis/props.js
   loads it for every bot). Tyres and hubs go on as whole pieces (shellAdd); bolts and track links are many small copies of
   one piece, so they are merged into one mesh per plate or track section (detailMerge). Lite keeps the coded shapes. ---- */
const DETAIL_TYRE={foam:"dt_tyre_foam",rubber:"dt_tyre_block",pu:"dt_tyre_pu",solid:"dt_tyre_solid"},DETAIL_LAMP=1.5,DT_GEO={};
/* a piece's triangles as plain floats in its own unit (the file's are quantized under a child node's scale) */
function detailGeo(D,name){const key=D.uuid+name;if(DT_GEO[key])return DT_GEO[key];const s=D.getObjectByName(name);if(!s)return null;
  s.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(s.matrixWorld).invert(),out=[],v=new THREE.Vector3();
  s.traverse(m=>{if(!m.isMesh)return;const P=m.geometry.attributes.position,I=m.geometry.index,mx=new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld),n=I?I.count:P.count;
    for(let i=0;i<n;i++){const j=I?I.getX(i):i;v.set(attrGet(P,j,0),attrGet(P,j,1),attrGet(P,j,2)).applyMatrix4(mx);out.push(v.x,v.y,v.z);}});
  return DT_GEO[key]=new Float32Array(out);}
/* one geometry from many placed copies: items [{n: piece, m: Matrix4}], flat shaded */
function detailMerge(D,items){let n=0;const src=items.map(it=>{const a=detailGeo(D,it.n);n+=a?a.length:0;return a;}),pos=new Float32Array(n),v=new THREE.Vector3();let o=0;
  items.forEach((it,k)=>{const a=src[k];if(!a)return;const flip=it.m.determinant()<0;
    for(let i=0;i<a.length;i+=9)for(let c=0;c<3;c++){const j=i+(flip?2-c:c)*3;v.set(a[j],a[j+1],a[j+2]).applyMatrix4(it.m);pos[o++]=v.x;pos[o++]=v.y;pos[o++]=v.z;}});
  const ge=new THREE.BufferGeometry();ge.setAttribute("position",new THREE.BufferAttribute(pos,3));ge.computeVertexNormals();return ge;}
/* the bolts buildBot collected, one steel mesh per plate: it sits at its plate's own origin and carries its part key, so
   it greys, tilts and goes with the plate (vis/wear.js turns each mesh about its origin) */
function boltMeshes(g,D,bolts){if(!D||!bolts.length)return;const by=new Map(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  const AX={"+y":[0,1,0],"-y":[0,-1,0],"+x":[1,0,0],"-x":[-1,0,0],"+z":[0,0,1],"-z":[0,0,-1]};
  for(const b of bolts){const h=b.host,a=AX[b.ax]||AX["+y"];q.setFromUnitVectors(up,new THREE.Vector3(a[0],a[1],a[2]));
    const m=new THREE.Matrix4().compose(new THREE.Vector3(b.x-h.position.x,b.y-h.position.y,b.z-h.position.z),q.clone(),new THREE.Vector3(b.r,b.r,b.r));
    (by.get(h)||by.set(h,[]).get(h)).push({n:b.n,m});}
  for(const [h,items] of by){const m=new THREE.Mesh(detailMerge(D,items),V.mats.steel);m.position.copy(h.position);if(h.userData.part)m.userData.part=h.userData.part;g.add(m);}}
/* a plate w x h, t thick along z, with a chamfer c round both faces (0: a plain box) */
function plateGeo(w,h,t,c){if(!(c>0)||t<c*2.2||w<c*4||h<c*4)return new THREE.BoxGeometry(w,h,t);
  const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.closePath();
  const e=new THREE.ExtrudeGeometry(s,{depth:t-2*c,bevelEnabled:true,bevelThickness:c,bevelSize:c,bevelOffset:-c,bevelSegments:1,curveSegments:1});e.translate(0,0,-t/2+c);return e;}
function rectHitsPoly(x0,y0,x1,y1,poly){const R=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  if(poly.some(p=>p[0]>x0&&p[0]<x1&&p[1]>y0&&p[1]<y1)||R.some(p=>inPoly(p,poly)))return true;
  for(let i=0;i<4;i++)for(let j=0;j<poly.length;j++)if(segX(R[i],R[(i+1)%4],poly[j],poly[(j+1)%poly.length])!=null)return true;return false;}
/* the wheel wells: per side, [{y0, y1 (build coords along the bot), ax: [axle y...], track}], d deep and g clear of the tyre.
   Wheels close together share a well; a well keeps clear of the body's ends and is dropped where it would meet the bay */
function wheelWells(k){const {wheels,wr,ww,hw,hl,len,L,tracks,reg,poly}=k,g=Math.max(0.0035*len,wr*0.14),d=ww+0.004*len,out={d,g,left:[],right:[]};
  const side=poly.filter(p=>Math.abs(Math.abs(p[0])-hw)<1e-6).map(p=>p[1]),lim=[Math.min.apply(null,side)+0.012*len,Math.max.apply(null,side)-0.012*len];
  for(const s of [-1,1]){const ax=tracks?[-(0.4*L-wr),0.4*L-wr]:wheels.filter(p=>Math.sign(p.pos[0]||1)===s).map(p=>p.pos[1]).sort((a,b)=>a-b),list=[];
    if(tracks)list.push({y0:ax[0]-wr-g,y1:ax[1]+wr+g,ax,track:1});
    else for(const y of ax){const last=list[list.length-1];if(last&&y-wr-g<last.y1+0.012*len){last.y1=y+wr+g;last.ax.push(y);}else list.push({y0:y-wr-g,y1:y+wr+g,ax:[y]});}
    for(const w of list){w.y0=Math.max(lim[0],w.y0);w.y1=Math.min(lim[1],w.y1);if(w.y1-w.y0<wr)continue;
      const xa=s<0?-hw-0.01*len:hw-d-0.006*len,xb=s<0?-hw+d+0.006*len:hw+0.01*len;
      if(reg&&rectHitsPoly(xa,w.y0-0.006*len,xb,w.y1+0.006*len,reg))continue;
      out[s<0?"left":"right"].push(w);}}
  return out.left.length||out.right.length?out:null;}
/* an outline with the wells notched into its edges on the body's sides */
function wellNotch(outline,W,hw){if(!W)return outline;const out=[],n=outline.length;
  for(let i=0;i<n;i++){const a=outline[i],b=outline[(i+1)%n];out.push(a);
    for(const s of [-1,1]){const x=s*hw;if(Math.abs(a[0]-x)>1e-6||Math.abs(b[0]-x)>1e-6)continue;
      const lo=Math.min(a[1],b[1]),hi=Math.max(a[1],b[1]),dir=b[1]>a[1]?1:-1;
      for(const w of (s<0?W.left:W.right).filter(w=>w.y0>lo+1e-5&&w.y1<hi-1e-5).sort((p,q)=>dir*(p.y0-q.y0))){
        const ya=dir>0?w.y0:w.y1,yb=dir>0?w.y1:w.y0;out.push([x,ya],[x-s*W.d,ya],[x-s*W.d,yb],[x,yb]);}}}
  return out;}
/* the arch over a side's wells, in mesh z: h(z) the opening's height there (-Infinity where the plate runs to its bottom
   edge) and cuts, the [z0, z1] spans to sample finely. Round over each wheel; a track's is flat between its end wheels */
function wellArch(list,W,wr,cy,y0,y1){const R=wr+W.g,min=(y1-y0)*0.06,cuts=[];
  for(const w of list){if(w.track)cuts.push([cy-w.ax[1]-R,cy-w.ax[1]],[cy-w.ax[1],cy-w.ax[0]],[cy-w.ax[0],cy-w.ax[0]+R]);else for(const a of w.ax)cuts.push([cy-a-R,cy-a+R]);}
  const h=z=>{let v=-Infinity;for(const w of list){const y=cy-z;if(y<w.y0||y>w.y1)continue;
      if(w.track&&y>=w.ax[0]&&y<=w.ax[1])v=Math.max(v,wr+R);
      for(const a of w.ax){const dz=Math.abs(y-a);if(dz<R)v=Math.max(v,wr+Math.sqrt(R*R-dz*dz));}}
    return v>y1-min?y1:v;};
  return{h,cuts:cuts.map(c=>[Math.max(c[0],-1e9),c[1]])};}
/* a side plate: z0..z1 long, y0..y1 high, its outer face at x 0 and t thick inward (sg: -1 the left side, 1 the right),
   its bottom edge following arch(z) where that is higher, and a chamfer c along the top outer edge. Built as strips
   between sample points, so an arch that reaches the top simply parts the plate */
function sidePlateGeo(z0,z1,y0,y1,t,sg,arch,cuts,c,steps){const e=(z1-z0)*1e-4,zs=[z0,z1],pos=[],xi=-sg*t;
  for(const [a,b] of cuts){zs.push(a-e,b+e);for(let i=0;i<=steps;i++)zs.push(a+(b-a)*i/steps);}
  const Z=zs.filter(z=>z>=z0&&z<=z1).sort((a,b)=>a-b).filter((z,i,A)=>!i||z-A[i-1]>e*0.5),yb=z=>Math.min(y1,Math.max(y0,arch(z)));
  /* a quad, wound so it faces n */
  const quad=(p,q,r,s,n)=>{const ux=q[0]-p[0],uy=q[1]-p[1],uz=q[2]-p[2],vx=s[0]-p[0],vy=s[1]-p[1],vz=s[2]-p[2];
    const d=(uy*vz-uz*vy)*n[0]+(uz*vx-ux*vz)*n[1]+(ux*vy-uy*vx)*n[2];if(d>=0)pos.push(...p,...q,...r,...p,...r,...s);else pos.push(...p,...r,...q,...p,...s,...r);};
  const open=i=>yb(Z[i])>=y1-1e-7&&yb(Z[i+1])>=y1-1e-7;
  for(let i=0;i<Z.length-1;i++){if(open(i))continue;const za=Z[i],zb=Z[i+1],ba=yb(za),bb=yb(zb),yc=y1-c,oa=Math.min(ba,yc),ob=Math.min(bb,yc);
    quad([0,oa,za],[0,ob,zb],[0,yc,zb],[0,yc,za],[sg,0,0]);                                   // the outer face
    if(c>0)quad([0,yc,za],[0,yc,zb],[-sg*c,y1,zb],[-sg*c,y1,za],[sg,1,0]);                    // the chamfer
    quad([-sg*c,y1,za],[-sg*c,y1,zb],[xi,y1,zb],[xi,y1,za],[0,1,0]);                          // the top edge
    quad([xi,ba,za],[xi,bb,zb],[xi,y1,zb],[xi,y1,za],[-sg,0,0]);                              // the inner face
    quad([0,ba,za],[0,bb,zb],[xi,bb,zb],[xi,ba,za],[0,-(zb-za),bb-ba]);                       // the bottom edge (the arch's soffit)
    if(i===0||open(i-1))quad([0,ba,za],[xi,ba,za],[xi,y1,za],[0,y1,za],[0,0,-1]);             // the ends
    if(i===Z.length-2||open(i+1))quad([0,bb,zb],[xi,bb,zb],[xi,y1,zb],[0,y1,zb],[0,0,1]);}
  const ge=new THREE.BufferGeometry();ge.setAttribute("position",new THREE.BufferAttribute(new Float32Array(pos),3));ge.computeVertexNormals();return ge;}
/* tracks: links round a sprocket at each end and road wheels between. Each side's belt is four merged sections that move a
   link's pitch and snap back (the two runs slide, the two ends turn), so the belt runs with the bot (app/arena reads
   userData.tk: kind, p the pitch or the angle between links, z0 a run's rest place, r a wheel's radius) */
function botTracks(g,D,k){const M=V.mats,{hw,ww,wr,cx,cy,L,len}=k,lt=wr*0.2,ri=wr-lt,zs=Math.max(wr*0.2,0.4*L-wr),p0=wr*0.42;
  const nA=Math.max(5,Math.round(Math.PI*(ri+lt*0.5)/p0)),nR=Math.max(1,Math.round(2*zs/p0)),pR=2*zs/nR,pA=Math.PI/nA,X=new THREE.Vector3(1,0,0);
  const T=(rx,y,z,sz)=>new THREE.Matrix4().compose(new THREE.Vector3(0,y,z),new THREE.Quaternion().setFromAxisAngle(X,rx),new THREE.Vector3(ww,lt,sz));
  for(const s of [-1,1]){const x=s*(hw-ww/2-0.001*len)-cx,key=s<0?"wheel0":"wheel1";
    const sec=(tk,items,y,z)=>{const G=new THREE.Group();G.userData.role="trk";tk.z0=z;G.userData.tk=tk;G.position.set(x,y,z);
      const m=new THREE.Mesh(detailMerge(D,items),M.rubber);m.userData.part=key;G.add(m);g.add(G);};
    const run=[];for(let i=0;i<nR;i++)run.push(-zs+(i+0.5)*pR);
    sec({kind:"top",p:pR},run.map(z=>({n:"dt_trk_link",m:T(0,0,z,pR)})),wr+ri,cy);
    sec({kind:"bot",p:pR},run.map(z=>({n:"dt_trk_link",m:T(Math.PI,0,z,pR)})),wr-ri,cy);
    for(const e of [-1,1]){const items=[];   // the front end (-z) turns the top run down; the back end brings the bottom run up
      for(let i=0;i<nA;i++){const th=(i+0.5)*pA+(e>0?Math.PI:0),m=new THREE.Matrix4().makeRotationX(-th).multiply(T(0,ri,0,ri*pA*1.05));items.push({n:"dt_trk_link",m});}
      sec({kind:"arc",p:pA,pr:pR},items,wr,cy+e*zs);}
    const wheel=(z,r,y)=>{const G=new THREE.Group();G.userData.role="trk";G.userData.tk={kind:"spr",r};G.position.set(x,y,z);shellAdd(G,D,"dt_trk_wheel",M.alu,key,0,0,0,ww*0.86,r,r);g.add(G);};
    wheel(cy-zs,ri,wr);wheel(cy+zs,ri,wr);
    const nM=Math.max(0,Math.min(3,Math.floor(2*zs/(ri*1.5))-1)),rm=ri*0.5;for(let i=1;i<=nM;i++)wheel(cy-zs+2*zs*i/(nM+1),rm,wr-ri+rm);}}

/* ---- shuffler legs (0.1.34, wheelbase legs): at each wheel's place a cam on the axle, a strut and a flat foot, in a
   group (role "leg") that app/arena lifts and swings in turn as the bot walks (B.wheelA). Full / Ultra: the Blender
   leg (models/bot-odd.glb, tools/blender-bot-odd.py) where it is loaded ---- */
function botLegs(g,wheels,k){const M=V.mats,{P,ww,cx,lite,Wh}=k;
  wheels.forEach((p,i)=>{const q=P(p.pos[0],p.pos[1]),x=Math.sign(p.pos[0]||1)*(k.hw+ww*0.8)-cx,G=new THREE.Group();G.userData.role="leg";
    G.userData.ph=(i%2?Math.PI:0)+(p.pos[0]<0?Math.PI:0);G.position.set(x,0,q[1]);g.add(G);
    const put=(geo,mat,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(0,y,z||0);m.userData.part=p.key;G.add(m);return m;};
    if(Wh&&shellAdd(G,Wh,"odd_leg",M.alu,p.key,0,0,0,ww,k.lh,k.lh))return;
    const h=k.lh,f=h*0.6;
    put(new THREE.BoxGeometry(ww*1.6,h*0.08,f*1.4),M.rubber,h*0.04);                          // the foot
    put(new THREE.BoxGeometry(ww*0.5,h*0.85,ww*0.5),M.alu,h*0.47);                            // the strut
    const cam=new THREE.CylinderGeometry(h*0.2,h*0.2,ww*0.9,lite?10:20);cam.rotateZ(Math.PI/2);put(cam,M.steel,h*0.82,h*0.06);});}

/* ---- the wheel layouts' extra parts (0.1.31, PARTS.wheelbase): Lite draws them in code, Full and Ultra use the Blender
   pieces (models/bot-wheels.glb, tools/blender-bot-wheels.py) once loaded.
     mecanum  Lite: angled roller bars on each tyre, children of it so they turn with it (Full / Ultra: the whole Blender
              wheel in place of the tyre, drawn by buildBot)
     swerve   a fork and a turntable over each wheel
     caster   a small wheel (it turns) at the back, under a swivel fork that reaches up to the chassis ---- */
function botWheelParts(g,b,wl,Wh,k){const M=V.mats,{P,add,wheels,wx,wr,ww,cx,clr,len,seg,lite}=k;
  if(wl.id==="mecanum"&&!Wh){const n=lite?6:8,rg=new THREE.BoxGeometry(ww*1.05,wr*0.14,wr*0.32);
    for(const m of g.children.slice()){if(!m.userData.wheel||m.material!==M.rubber||!/^wheel/.test(m.userData.part||""))continue;
      for(let i=0;i<n;i++){const a=2*Math.PI*i/n,r=new THREE.Mesh(rg,M.alu);r.position.set(0,Math.cos(a)*wr*1.02,Math.sin(a)*wr*1.02);
        r.rotation.set(a,0,0);r.rotateY(Math.PI/4*(m.position.x<0?1:-1));r.userData.part=m.userData.part;m.add(r);}}}
  if(wl.id==="swerve")for(const p of wheels){const q=P(p.pos[0],p.pos[1]),x=wx(p)-cx;
    if(Wh&&shellAdd(g,Wh,"wh_swerve",M.alu,p.key,x,wr,q[1],ww/0.8,wr,wr))continue;
    const lg=new THREE.BoxGeometry(ww*0.12,wr*1.3,wr*0.6);
    for(const s of [-1,1])add(lg,M.alu,x+s*ww*0.68,wr*1.5-wr*0.95,q[1],p.key);
    add(new THREE.BoxGeometry(ww*1.5,wr*0.12,wr*0.9),M.alu,x,wr*2.24,q[1],p.key);
    add(new THREE.CylinderGeometry(wr*0.5,wr*0.5,wr*0.12,lite?12:24),M.steel,x,wr*2.36,q[1],p.key);}
  const c=b.parts.find(p=>p.caster);if(!c)return;
  const cr=Math.max(wr*0.35,Math.min(wr*0.7,clr/1.68)),q=P(0,c.pos[1]),cw=cr*0.62;
  const wg=new THREE.CylinderGeometry(cr,cr,cw,lite?14:seg);wg.rotateZ(Math.PI/2);const w=add(wg,M.rubber,-cx,cr,q[1],"caster");w.userData.wheel=1;
  const sy=Math.max(1,clr/(1.68*cr));   // stretched up to the chassis when it rides high
  if(Wh&&shellAdd(g,Wh,"wh_caster",M.steel,"caster",-cx,cr,q[1],cr,cr*sy,cr))return;
  const lg=new THREE.BoxGeometry(cr*0.1,cr*1.4*sy,cr*0.4);for(const s of [-1,1])add(lg,M.steel,-cx+s*cr*0.41,cr+cr*0.6*sy,q[1]-cr*0.2,"caster");
  add(new THREE.BoxGeometry(cr*1.1,cr*0.1,cr*1.1),M.steel,-cx,cr+cr*1.64*sy,q[1]-cr*0.35,"caster");}

/* ---- Full and Ultra: the Blender shells (models/bot-shells.glb, tools/blender-bot-shells.py; loaded by botShells in
   vis/props.js) in place of the coded body shapes above. Each piece is modelled in a unit body (x the width, z the length,
   front at -z, y in chassis heights from the top of the box) and stretched to this bot; the game's materials go on, and
   each piece carries the part key of the face it covers, so damage greys it as it does the coded shape. Lite never loads
   them; until they arrive (or if they fail) the coded shapes stand in. ---- */
const SHELL_TOPS={wedge:1,dome:1,pancake:1,invert:1};   // bodies whose shell is the top (the rest add to the flat top)
/* how far a shell's lid stands above the box top, in chassis heights, for the stripe and the sponsor patch */
const SHELL_LID={pancake:.12,invert:.09};   // the wedge lid's plate is .07 thick over its slope
const SHELL_VAR={wedge_top:1,wedge_bolts:1,dome_shell:1,dome_bolts:1,pancake_lid:1,pancake_bolts:1,invert_plate:1,invert_bolts:1};   // pieces with slotted variants
function shellAdd(g,S,name,mat,part,x,y,z,sx,sy,sz){const s=S.getObjectByName(name);if(!s)return null;const o=s.clone();
  /* each piece's geometry is copied for this bot, so uvProject can give it this bot's UVs (the shared file's stays as loaded;
     the copy gets its own userData, since r128's clone shares it and uvProject marks it done there) */
  o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.traverse(m=>{if(m.isMesh){m.material=mat;const ge=m.geometry.clone();ge.userData={};m.geometry=ge;if(part)m.userData.part=part;
    /* the copy's positions as plain floats: r128's raycast and bounds read a quantized attribute's raw integers (vis/wear.js
       casts at the bot to place a scar) */
    const P=ge.attributes.position;if(P&&P.normalized){const f=new Float32Array(P.count*3);for(let i=0;i<P.count;i++){f[i*3]=attrGet(P,i,0);f[i*3+1]=attrGet(P,i,1);f[i*3+2]=attrGet(P,i,2);}
      ge.setAttribute("position",new THREE.BufferAttribute(f,3));ge.computeBoundingSphere();ge.computeBoundingBox();}}});g.add(o);return o;}
function shellBody(g,S,body,k){const {M,cx,cy,H,clr,bodyH,Wd,L,hw,hl,len,tt,topKey,topMat,sideMat,sideKey}=k;
  const vn=(n,v)=>v&&SHELL_VAR[n]?n+"__"+v:n;   // a slotted piece for a weapon bay (shellVariant)
  const U=(name,mat,part)=>shellAdd(g,S,vn(name,k.sv),mat,part,-cx,H,cy,Wd,bodyH,L);   // a piece over the whole body
  if(body==="wedge"){U("wedge_top",topMat,topKey);U("wedge_bolts",M.steel,topKey);
    U("wedge_cheek_l",sideMat("left"),sideKey("left"));U("wedge_cheek_r",sideMat("right"),sideKey("right"));}
  else if(body==="dome"){U("dome_shell",topMat,topKey);U("dome_bolts",M.steel,topKey);}
  else if(body==="pancake"){U("pancake_lid",topMat,topKey);U("pancake_bolts",M.steel,topKey);}
  else if(body==="invert"){U("invert_plate",topMat,topKey);U("invert_bolts",M.steel,topKey);   /* and the same plate mirrored underneath */
    const dn=-Math.min(bodyH,clr*0.8/0.14);   // no deeper than most of the clearance, so it never shows through the floor
    shellAdd(g,S,vn("invert_plate",k.svb),topMat,"chassis",-cx,clr,cy,Wd,dn,L);shellAdd(g,S,vn("invert_bolts",k.svb),M.steel,"chassis",-cx,clr,cy,Wd,dn,L);}
  else if(body==="slab"){for(const s of ["left","right"]){const n=s==="left"?"l":"r";U("slab_skirt_"+n,sideMat(s),sideKey(s));U("slab_bolts_"+n,M.steel,sideKey(s));}
    const gs=0.024*len;for(const mx of [-1,1])for(const mz of [-1,1])shellAdd(g,S,"slab_guard",M.steel,"chassis",mx*hw-cx,clr,cy+mz*hl,mx*gs,bodyH,mz*gs);}
  else if(body==="scrap")scrapFrame(g,S,k);}
/* ---- the scrap frame (0.1.48.1: one frame for every tier, and it makes room): tubes along the top edges, posts up the
   corners, welds at the joints and a brace over the top. Full and Ultra use the Blender tube and weld, Lite plain
   cylinders. k.fr says what is in the way: gap, the stretch of the front rail a weapon's bay opens through (the rail stops
   either side of it); over, something works above the deck (an arm, a flipper's plate, a disc standing in its slot), so the
   X brace gives way to one bar across the back; none, a shell spinner covers the lot; noPosts, a ring runs round the corners ---- */
function scrapFrame(g,S,k){const {M,cx,cy,H,clr,hw,hl,len,tt,L}=k,fr=k.fr||{};if(fr.none)return;
  const r=0.0035*len,yT=H+tt+r,up=new THREE.Vector3(0,1,0),cg=S?null:new THREE.CylinderGeometry(1,1,1,5);
  const tube=(x0,y0,z0,x1,y1,z1)=>{const d=new THREE.Vector3(x1-x0,y1-y0,z1-z0),l=d.length();if(l<r*2)return;
    let o=S?shellAdd(g,S,"scrap_tube",M.steel,"chassis",(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,r,l,r):null;
    if(!o){o=new THREE.Mesh(cg||new THREE.CylinderGeometry(1,1,1,5),M.steel);o.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);o.scale.set(r,l,r);o.userData.part="chassis";g.add(o);}
    o.quaternion.setFromUnitVectors(up,d.normalize());};
  const weld=(x,y,z,a,b)=>{if(S)shellAdd(g,S,"scrap_weld",M.steel,"chassis",x,y,z,r*a,r*b,r*a);};
  const X=[-(hw+r)-cx,(hw+r)-cx],Z=[cy-(hl+r),cy+(hl+r)];   /* Z[0] is the front edge (mesh z runs backwards) */
  for(const x of X){tube(x,yT,Z[0],x,yT,Z[1]);if(!fr.noPosts)for(const z of Z)tube(x,clr,z,x,yT,z);}
  tube(X[0],yT,Z[1],X[1],yT,Z[1]);
  if(fr.gap){const m=r*3,a=fr.gap[0]-m-cx,b=fr.gap[1]+m-cx;   /* the front rail, either side of the bay, each end closed with a weld */
    if(a>X[0]+r*4){tube(X[0],yT,Z[0],a,yT,Z[0]);weld(a,yT,Z[0],1.3,1.3);}if(b<X[1]-r*4){tube(b,yT,Z[0],X[1],yT,Z[0]);weld(b,yT,Z[0],1.3,1.3);}}
  else tube(X[0],yT,Z[0],X[1],yT,Z[0]);
  if(fr.over){const z=cy+L*0.36;tube(X[0],yT,z,X[1],yT,z);for(const x of X)weld(x,yT,z,1.5,1.5);}   /* one bar across the back, clear of the weapon */
  else if(S||fr.cross){tube(X[0],yT+r,Z[0],X[1],yT+r,Z[1]);tube(X[1],yT+r*1.2,Z[0],X[0],yT+r*1.2,Z[1]);weld(-cx,yT+r*1.1,cy,1.5,1.2);}
  for(const x of X)for(const z of Z)weld(x,yT,z,1.7,1.7);}


/* ---- weapon bays (0.1.15.3, Kelbo: real bays). Polygons are in build coords (m, +y forward) like b.polygon. ---- */
/* the bay's outline as a polygon, its edges on the body's outline pushed out by e so a cut there opens cleanly */
function bayRegion(bay,hw,hl,e,seg){if(bay.circle){const c=bay.circle,n=Math.max(24,seg);
    return Array.from({length:n},(_,i)=>{const a=-i*2*Math.PI/n;return[c.x+Math.cos(a)*c.r,c.y+Math.sin(a)*c.r];});}
  let [x0,y0,x1,y1]=bay.rect;const at=(v,w)=>Math.abs(v-w)<1e-6;
  if(at(x0,-hw))x0-=e;if(at(x1,hw))x1+=e;if(at(y0,-hl))y0-=e;if(at(y1,hl))y1+=e;
  return[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];}
/* where the bay meets the front edge: [x0, x1], or null */
function frontGap(bay,hw,hl){let r=null;if(bay.circle){const c=bay.circle,d=hl-c.y;if(c.r>d){const h=Math.sqrt(c.r*c.r-d*d);r=[c.x-h,c.x+h];}}
  else if(bay.rect[3]>=hl-1e-6)r=[bay.rect[0],bay.rect[2]];
  return r?[Math.max(-hw,r[0]),Math.min(hw,r[1])]:null;}
function rectPts(w,l){return[[-w/2,-l/2],[w/2,-l/2],[w/2,l/2],[-w/2,l/2]];}
function inPoly(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function segX(a,b,c,d){const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-14)return null;
  const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den,u=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den;return t>=0&&t<1&&u>=0&&u<1?t:null;}
function nearOnPoly(p,poly){let best=null,bd=1e9;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),q=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
  if(d<bd){bd=d;best=q;}}return best;}
/* a convex outline minus a bay: {outline, holes}. A bay inside it is a hole; one that crosses its edge once (in and out
   again) is a notch, its own edges that lie inside the outline taking the place of the outline's edge there. null if the
   two cross in some other way (then nothing is cut) */
function polyMinus(poly,reg){const pts=[];
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];pts.push({p:a});const xs=[];
    for(let j=0;j<reg.length;j++){const t=segX(a,b,reg[j],reg[(j+1)%reg.length]);if(t!=null)xs.push({t,j});}
    xs.sort((m,n)=>m.t-n.t);for(const x of xs)pts.push({p:[a[0]+(b[0]-a[0])*x.t,a[1]+(b[1]-a[1])*x.t],j:x.j});}
  const X=[];pts.forEach((q,i)=>{if(q.j!=null)X.push(i);});
  if(!X.length)return reg.every(p=>inPoly(p,poly))?{outline:poly,holes:[reg]}:poly.every(p=>!inPoly(p,reg))?{outline:poly,holes:[]}:null;
  if(X.length!==2)return null;const n=pts.length,mid=(i)=>{const a=pts[i].p,b=pts[(i+1)%n].p;return[(a[0]+b[0])/2,(a[1]+b[1])/2];};
  const ent=inPoly(mid(X[0]),reg)?X[0]:X[1],ex=ent===X[0]?X[1]:X[0],out=[];
  for(let i=ex;;i=(i+1)%n){out.push(pts[i].p);if(i===ent)break;}   /* the outline from where it leaves the bay round to where it enters */
  const m=reg.length,je=pts[ent].j,jx=pts[ex].j,fw=[],bw=[];   /* then the bay's own edge back, whichever way runs inside */
  for(let j=(je+1)%m;;j=(j+1)%m){if(j===(jx+1)%m)break;fw.push(reg[j]);if(fw.length>m)break;}
  for(let j=je;;j=(j-1+m)%m){if(j===jx)break;bw.push(reg[j]);if(bw.length>m)break;}
  const ok=a=>a.length<=m&&a.every(p=>inPoly(p,poly));return{outline:out.concat(ok(fw)?fw:ok(bw)?bw:[]),holes:[]};}
/* an outline (minus holes) extruded straight up by depth, in mesh coords: x - ox, -(y - oy), from height y0 */
function shapeGeo(outline,holes,depth,ox,oy,y0,bev){const V2=p=>new THREE.Vector2(p[0]-ox,p[1]-oy);
  const area=q=>q.reduce((s,p,i)=>{const n=q[(i+1)%q.length];return s+p[0]*n[1]-n[0]*p[1];},0),wind=(q,ccw)=>(area(q)>0)===ccw?q:q.slice().reverse();
  const sh=new THREE.Shape(wind(outline,true).map(V2));   /* the outline one way round and its holes the other, as three.js wants */
  for(const h of holes||[])sh.holes.push(new THREE.Path(wind(h,false).map(V2)));
  /* bev: a chamfer of that size round the top and bottom edges, inside the outline (the plate keeps its size) */
  const e=bev>0&&depth>bev*2.2?new THREE.ExtrudeGeometry(sh,{depth:depth-2*bev,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelOffset:-bev,bevelSegments:1,curveSegments:1})
    :new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:false,curveSegments:1});if(bev>0&&depth>bev*2.2)e.translate(0,0,bev);
  e.rotateX(-Math.PI/2);if(y0)e.translate(0,y0,0);return e;}
function shellGeoLocal(outline,holes,depth){return shapeGeo(outline,holes,depth,0,0,0);}
/* the bay's walls under a raised top (a wedge lid, a dome), from the floor up to the top's height there, so you can't see
   into the hollow under it: both faces, so the shared materials stay single-sided */
function sleeve(g,reg,cx,cy,L,top,floor,inside,mat,part){const pos=[],n=reg.length,V3=(p,y)=>[p[0]-cx,y,cy-p[1]];
  for(let i=0;i<n;i++){const a=reg[i],c=reg[(i+1)%n],k=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/(L/16)));
    for(let j=0;j<k;j++){const p=[a[0]+(c[0]-a[0])*j/k,a[1]+(c[1]-a[1])*j/k],q=[a[0]+(c[0]-a[0])*(j+1)/k,a[1]+(c[1]-a[1])*(j+1)/k];
      if(!inside([(p[0]+q[0])/2,(p[1]+q[1])/2]))continue;const tp=top(p),tq=top(q);if(tp<=floor&&tq<=floor)continue;
      const p0=V3(p,floor),q0=V3(q,floor),p1=V3(p,Math.max(floor,tp)),q1=V3(q,Math.max(floor,tq));
      pos.push(...p0,...q0,...q1,...p0,...q1,...p1,...p0,...q1,...q0,...p0,...p1,...q1);}}
  if(!pos.length)return null;const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,mat);if(part)m.userData.part=part;g.add(m);return m;}
/* the dome as a height field over its ellipse (semi-axes a, c) with the bay cut out: a grid whose points outside the
   ellipse or inside the bay are pulled onto the nearest edge, so the cut is clean at any grid size */
function domeGeo(a,c,h,reg,cx,cy,n){const pos=[],out=[],idx=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){let p=[-a+2*a*i/n,-c+2*c*j/n],o=false;const r=Math.hypot(p[0]/a,p[1]/c);
    if(r>1){p=[p[0]/r,p[1]/r];o=true;}if(inPoly(p,reg)){p=nearOnPoly(p,reg);o=true;}
    pos.push(p[0]-cx,h(p),cy-p[1]);out.push(o);}
  const P2=k=>[pos[k*3]+cx,cy-pos[k*3+2]];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const v00=j*(n+1)+i,v10=v00+1,v01=v00+n+1,v11=v01+1;
    for(const t of [[v00,v10,v11],[v00,v11,v01]]){if(out[t[0]]&&out[t[1]]&&out[t[2]])continue;
      const A=P2(t[0]),B=P2(t[1]),C=P2(t[2]),m=[(A[0]+B[0]+C[0])/3,(A[1]+B[1]+C[1])/3];if(inPoly(m,reg))continue;idx.push(t[0],t[1],t[2]);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();return geo;}
/* the slotted shell made for this bay (tools/blender-bot-shells.py: <piece>__<variant>_<A|B>, A cut for ant, beetle
   and heavy proportions, B for hobby and feather). Each is matched on the bay's unit-body rect [half width, back edge],
   so a weapon moved off its default place in the layout finds none. Returns {top, bottom} suffixes (null: the plain
   piece), or null when the shells have no piece for this bay */
const SHELL_BAYS={slot:[[.058,-.139],[.058,-.194]],pocket:[[.267,-.289],[.267,-.317]],well:[[.442,-.039],[.442,-.094]],under:[[.353,-.181],[.353,-.209]],
  hammer:[[.25,.187],[.167,.187]],flip:[[.47,.08],[.47,.08]],lift:[[.25,-.167],[.167,-.278]],crush:[[.25,0],[.167,-.167]]};
const SHELL_PIECE={wedge:"wedge_top",dome:"dome_shell",pancake:"pancake_lid",invert:"invert_plate"};
function shellVariant(bay,w,body){if(!bay)return{top:null,bottom:null};const u=bay.u;if(!u||!u.rect)return null;
  const v=bay.kind==="deck"?{hammer:"hammer",flipper:"flip",lifter:"lift",grabber:"lift",crusher:"crush"}[w.type]:{slot:"slot",pocket:"pocket",well:"well",underwell:"under"}[bay.kind];
  if(!v||!SHELL_BAYS[v])return null;const R=u.rect,hwU=(R[2]-R[0])/2;
  if(Math.abs(R[0]+R[2])>0.01||Math.abs(R[1]+0.5)>0.01)return null;
  const set=SHELL_BAYS[v].findIndex(q=>Math.abs(q[0]-hwU)<0.025&&Math.abs(q[1]-R[3])<0.025);if(set<0)return null;
  const sfx=v+"_"+(set?"B":"A"),S=botShells(),has=n=>!!(S&&S.getObjectByName(SHELL_PIECE[body]+"__"+n));
  const r=v==="under"?{top:null,bottom:body==="invert"?sfx:null}:{top:sfx,bottom:body==="invert"&&bay.openBelow&&(v==="slot"||v==="pocket")?sfx:null};
  return(r.top&&!has(r.top))||(r.bottom&&!has(r.bottom))?null:r;}

function buildWeapon(g,b,k){const M=V.mats,w=b.weapon,T=w.type,id=w.id,{P,add,hw,hl,H,clr,bodyH,len,seg,front,bh,lift}=k;
  const r=Math.max(0.01*len,w.radiusM||0.04),mat=M.disc;
  const mount=w.mountM?P(w.mountM[0],id==="drisk"?Math.max(w.mountM[1],hl-r*0.65):w.mountM[1]):front;   // the drisk sits forward (as its bay, sim/build.js bayOf)
  /* Full and Ultra: a Blender piece (models/bot-weapons.glb, wpPiece) where one is loaded, else null and the coded box */
  const Wp=V.tier!=="lite"?botWeapons():null,pc=(par,name,m,x,y,z,sx,sy,sz,part)=>Wp?wpPiece(par,Wp,name,m,part,x,y,z,sx,sy,sz):null;
  const teeth=(grp,R,n,thick,axis)=>{for(let i=0;i<n;i++){const a=i*2*Math.PI/n,t=new THREE.Mesh(new THREE.BoxGeometry(R*0.32,thick*1.4,R*0.18),M.steel);
    t.position.set(Math.cos(a)*R,0,Math.sin(a)*R);t.rotation.y=-a;grp.add(t);}};
  /* 0.1.48, the Tooth count dial: nT teeth on a disc or a drum (two is stock, and the Blender tooth pieces are a pair, so
     any other count is drawn in code on every tier). barsX: nT bars round the x axis, for a drum, a drisk or a vertical disc */
  const nT=w.teeth||2,stockT=nT===2;
  const barsX=(grp,R,n,wx,ty,tz,m)=>{for(let i=0;i<n;i++){const a=i*2*Math.PI/n,t=new THREE.Mesh(new THREE.BoxGeometry(wx,ty,tz),m||M.steel);
    t.position.set(0,Math.cos(a)*R,Math.sin(a)*R);t.rotation.x=a;t.userData.part="weapon";grp.add(t);}};
  if(T==="spinner"||T==="saw"){const spin=new THREE.Group();spin.userData.role="spin";
    /* 0.1.63, the thwackbot tail: a boom off the back with a steel head on the end. The whole bot spins about its centre of
       mass (app/arena turns the mesh, as for a meltybrain), so the "spin" is only the blur round it */
    if(w.thwack){const y=clr+bodyH*0.45,bt=Math.max(0.004*len,bodyH*0.16),bwd=Math.max(0.006*len,0.03*len),y0=-hl,y1=-hl-(w.boomM||0.1*len),hr=0.022*len;
      const bm=P(0,(y0+y1)/2),hd=P(0,y1+hr*0.4),c=P(w.mountM[0],w.mountM[1]);
      add(new THREE.BoxGeometry(bwd*1.8,bodyH*0.5,0.012*len),M.steel,bm[0],y,P(0,y0)[1],"weapon");   /* the bracket on the back face */
      add(new THREE.BoxGeometry(bwd,bt,y0-y1),M.alu,bm[0],y,bm[1],"weapon");   /* the boom */
      const hg=new THREE.CylinderGeometry(hr,hr,Math.max(bt*2.6,bodyH*0.7),V.tier==="lite"?10:18);add(hg,mat,hd[0],y,hd[1],"weapon");   /* the head */
      for(const sx of [-1,1])add(new THREE.BoxGeometry(hr*0.9,bt*1.4,hr*0.5),M.steel,hd[0]+sx*hr*1.15,y,hd[1],"weapon");   /* a tooth each side */
      g.add(spin);spin.position.set(c[0],y,c[1]);g.userData.melty=true;
      const blur=new THREE.Mesh(new THREE.CircleGeometry(r,seg),M.blur.clone());blur.userData.role="blur";blur.userData.own=true;blur.rotation.x=-Math.PI/2;
      blur.position.set(c[0],y+bt,c[1]);g.add(blur);
      return;}
    /* 0.1.34, the odd ones: all round the bot, at its middle. Full / Ultra: the Blender pieces (models/bot-odd.glb) */
    if(w.allRound){const Od=V.tier!=="lite"?botOdd():null,c=P(0,0),op=(name,m,y,sx,sy,sz)=>Od?shellAdd(spin,Od,name,m,"weapon",0,y,0,sx,sy,sz):null;
      if(id==="shell"){   /* a dome over the whole body, from just off the floor to above the lid, with two teeth on its rim */
        /* a lathe profile: a short wall, then a cone up to a flat crown, sized so the box's corners stay inside it */
        const y0=clr*0.6,R=r*1.08,h1=(H-y0)*1.05+0.003*len,hh=Math.max(h1+0.35*(H-y0),(k.crown||H)-y0+0.004*len);   /* the crown clears a dome under it (0.1.48.1: the dome used to show through) */
        if(!op("odd_shell",mat,0,R,hh,R)){const pr=[[0,0],[R,0],[R,h1],[R*0.6,hh],[0,hh]].map(q=>new THREE.Vector2(q[0],q[1]));
          const d=new THREE.Mesh(new THREE.LatheGeometry(pr,seg),mat);d.userData.part="weapon";spin.add(d);
          teeth(spin,R,2,Math.max(0.004*len,h1*0.5));}
        spin.position.set(c[0],y0,c[1]);spin.userData.topY=y0+hh;}
      else if(id==="ring"){   /* a toothed ring round the body at half its height, on four rollers */
        const tube=Math.max(0.003*len,r*0.08),y=clr+bodyH*0.45;
        if(!op("odd_ring",mat,0,r,r,r)){const d=new THREE.Mesh(new THREE.TorusGeometry(r,tube,6,seg*2),mat);d.rotation.x=Math.PI/2;d.userData.part="weapon";spin.add(d);teeth(spin,r,3,tube*2);}
        spin.position.set(c[0],y,c[1]);
        for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,rr=Math.min(r-tube,Math.hypot(hw,hl)*0.98);
          add(new THREE.CylinderGeometry(tube*1.6,tube*1.6,tube*3,10),M.steel,c[0]+Math.cos(a)*rr,y,c[1]+Math.sin(a)*rr);}}
      else{   /* the meltybrain: the whole bot spins (app/arena turns the mesh), so the "spin" is only its blur; one tooth on a corner */
        spin.position.set(c[0],clr+bodyH*0.5,c[1]);
        const tl=Math.max(0.01*len,r*0.32),tx=hw*0.95,tz=-hl*0.95,a=Math.atan2(tz,tx);
        const t=op("odd_tooth",M.steel,0,tl,Math.max(0.004*len,bodyH*0.5),tl*0.6);
        if(t){t.position.set(c[0]+tx,clr+bodyH*0.3,c[1]+tz);t.rotation.y=-a;g.add(t);}
        else{const b2=new THREE.Mesh(new THREE.BoxGeometry(tl,Math.max(0.004*len,bodyH*0.5),tl*0.6),M.steel);b2.position.set(c[0]+tx,clr+bodyH*0.3,c[1]+tz);b2.rotation.y=-a;b2.userData.part="weapon";g.add(b2);}
}
      g.add(spin);g.userData.melty=!!w.melty;
      const blur=new THREE.Mesh(new THREE.CircleGeometry(r*1.05,seg),M.blur.clone());blur.userData.role="blur";blur.userData.own=true;blur.rotation.x=-Math.PI/2;
      blur.position.set(c[0],id==="shell"?spin.userData.topY+0.002*len:spin.position.y+0.001*len,c[1]);g.add(blur);
      return;}
    if(id==="hsp"||id==="under"){const thick=Math.max(0.004*len,r*0.08);
      if(!wpDisc(spin,pc,"wp_disc",mat,r,thick,M,!stockT)){const d=new THREE.Mesh(new THREE.CylinderGeometry(r,r,thick,seg*2),mat);d.userData.part="weapon";spin.add(d);teeth(spin,r,nT,thick);}
      else if(!stockT)teeth(spin,r,nT,thick);
      const wd=k.wellD||0,dy=id==="under"?(wd?clr+Math.max(thick*0.6,wd*0.45):clr+thick):wd?k.boxTop-wd+thick*0.5+0.0015*len:clr+bodyH*0.55;
      spin.position.set(mount[0],dy,mount[1]);spin.userData.axis="y";
      if(wd){const y0=id==="under"?dy:k.boxTop-wd,y1=id==="under"?clr+wd:dy;   /* the hub, from the well's floor (the recess's roof) to the disc */
        if(y1>y0)add(new THREE.CylinderGeometry(r*0.15,r*0.15,y1-y0,12),M.steel,mount[0],(y0+y1)/2,mount[1]);}
      else if(id==="hsp")add(new THREE.CylinderGeometry(r*0.15,r*0.15,bodyH*0.5,12),M.steel,mount[0],clr+bodyH*0.3,mount[1]);}
    else{   // vertical disc, drum, saw: spin about the x axis
      /* 0.1.46: the eggbeater is as wide as a drum (an open frame: two bars between two cheeks); the drisk is a disc 0.9 of its radius thick */
      const drum=id==="drum",beater=id==="beater",drisk=id==="drisk",width=drum||beater?Math.min(b.widthM*0.7,Math.max(r*2,b.widthM*0.5)):drisk?r*0.9:Math.max(0.005*len,r*0.14);
      /* the pieces: a drum lies along x as modelled; a disc or saw is modelled flat, so it goes in a group turned onto its side */
      const side=new THREE.Group();side.rotation.z=Math.PI/2;
      const done=drum?!!pc(spin,"wp_drum",M.steel,0,0,0,width,r,r,"weapon")&&(stockT?pc(spin,"wp_drum_teeth",M.steel,0,0,0,width,r,r,"weapon"):barsX(spin,r*1.08,nT,width*0.8,r*0.34,r*0.26),true)
        :beater?stockT&&!!pc(spin,"wp_beater",mat,0,0,0,width,r,r,"weapon")   /* the frame is one piece with two bars: another count is the coded frame below */
        :drisk?!!pc(spin,"wp_drisk",mat,0,0,0,width,r,r,"weapon")&&(stockT?pc(spin,"wp_drisk_teeth",M.steel,0,0,0,width,r,r,"weapon"):barsX(spin,r*0.9,nT,width*1.04,r*0.26,r*0.3),true)
        :id==="saw"?!!pc(side,"wp_saw",mat,0,0,0,r,width,r,"weapon")&&(pc(side,"wp_disc_hub",M.steel,0,0,0,r*0.7,width,r*0.7,"weapon"),true)
        :wpDisc(side,pc,"wp_disc",mat,r,width,M,!stockT)&&(stockT||teeth(side,r,nT,width),true);
      if(done){if(side.children.length)spin.add(side);wpDiscUV(spin,mat);}
      else if(beater&&stockT){const bar=r*0.24;for(const s of [-1,1]){   /* coded (Lite): the two bars and the two cheeks of the frame */
        const t=new THREE.Mesh(new THREE.BoxGeometry(width,bar,bar*1.3),mat);t.position.set(0,s*(r-bar/2),0);t.userData.part="weapon";spin.add(t);
        const e=new THREE.Mesh(new THREE.BoxGeometry(bar*0.6,r*2,bar*1.6),mat);e.position.set(s*(width/2-bar*0.3),0,0);e.userData.part="weapon";spin.add(e);}}
      else if(beater){const bar=r*0.24;barsX(spin,r-bar/2,nT,width,bar,bar*1.3,mat);   /* 0.1.48: a bar for each tooth between two round cheeks */
        for(const s of [-1,1]){const ge=new THREE.CylinderGeometry(r*0.92,r*0.92,bar*0.6,seg);ge.rotateZ(Math.PI/2);const e=new THREE.Mesh(ge,mat);e.position.set(s*(width/2-bar*0.3),0,0);e.userData.part="weapon";spin.add(e);}}
      else{const geo=new THREE.CylinderGeometry(drisk?r*0.88:r,drisk?r*0.88:r,width,drum?seg:seg*2);geo.rotateZ(Math.PI/2);
      const d=new THREE.Mesh(geo,drum&&V.tier!=="lite"?M.steel:mat);d.userData.part="weapon";spin.add(d);
      if(drum)barsX(spin,r,nT,width*0.9,r*0.25,r*0.25);
      else barsX(spin,r,nT,width*1.3,r*0.3,r*0.2);}
      const cyH=id==="saw"?H+r*0.6:r+Math.max(0.001,(b.height.frontEdgeMm||2)/1000);
      spin.position.set(mount[0],cyH,mount[1]);spin.userData.axis="x";
      /* the uprights that hold it */
      for(const s of [-1,1]){const x=mount[0]+s*(width/2+0.003*len);   /* the piece's bearing boss is at the axle, so the saw's arm (axle above the plate's middle) keeps the box */
        if(id==="saw"||!pc(g,"wp_upright",M.steel,x,cyH,mount[1]+r*0.25,0.004*len,r*1.2,r*0.8))add(new THREE.BoxGeometry(0.004*len,r*1.2,r*0.8),M.steel,x,id==="saw"?H+r*0.3:cyH,mount[1]+r*0.25);}}
    g.add(spin);
    /* a blur disc that shows when it's up to speed (opacity set per frame) */
    const blur=new THREE.Mesh(spin.userData.axis==="y"?new THREE.CircleGeometry(r*1.05,seg):new THREE.CircleGeometry(r*1.05,seg),M.blur.clone());
    blur.userData.role="blur";blur.userData.own=true;   // its own material copy: freed with the cached source
    if(spin.userData.axis==="y")blur.rotation.x=-Math.PI/2;else blur.rotation.y=Math.PI/2;
    blur.position.copy(spin.position);blur.position.y+=spin.userData.axis==="y"?r*0.05:0;g.add(blur);
    return;}
  if(T==="wedge"||T==="lifter"||T==="flipper"||T==="grabber"){
    /* a ramp from the front edge to the floor ahead of the bot */
    const reach=Math.max(0.01*len,(w.reachM||0.04)),top=clr+bh*0.95,run=reach+0.004*len,slope=Math.atan2(top,run),rl=Math.hypot(top,run),rm=T==="wedge"?M.steel:M.alu;
    const ramp=pc(g,"wp_ramp",rm,front[0],top/2,front[1]-run/2,b.widthM,0.003*len,rl,"weapon")||new THREE.Mesh(new THREE.BoxGeometry(b.widthM,0.003*len,rl),rm);
    ramp.position.set(front[0],top/2,front[1]-run/2);ramp.rotation.x=-slope;ramp.userData.part=ramp.isMesh?"weapon":undefined;
    if(T==="wedge"){g.add(ramp);return;}
    if(T==="lifter"||T==="grabber"){const f=new THREE.Group();f.userData.role="forks";
      for(const s of [-1,1]){const fl=reach+bodyH;if(!pc(f,"wp_fork",M.steel,s*b.widthM*0.25,0,-fl/2,0.006*len,0.004*len,fl,"weapon")){
        const fk=new THREE.Mesh(new THREE.BoxGeometry(0.006*len,0.004*len,fl),M.steel);fk.position.set(s*b.widthM*0.25,0,-fl/2);fk.userData.part="weapon";f.add(fk);}}
      f.position.set(front[0],clr+0.002*len,front[1]+bodyH*0.3);g.add(f);
      ramp.scale.z*=0.4;ramp.position.set(front[0],top*0.8,front[1]-run*0.2);g.add(ramp);
      if(T==="grabber")grabJaw(g,b,k,pc,reach);
      return;}
    /* flipper: the ramp is the plate, hinged at the top front, swinging up when it fires */
    const f=new THREE.Group();f.userData.role="flip";const pl=b.lengthM*0.55;
    if(!pc(f,"wp_flip",M.alu,0,0,0,b.widthM*0.9,pl,pl,"weapon")){const plate=new THREE.Mesh(new THREE.BoxGeometry(b.widthM*0.9,0.003*len,pl),M.alu);
      plate.position.set(0,0,-pl/2);plate.userData.part="weapon";f.add(plate);}   // hinged at the back, the tip at the front edge
    f.position.set(front[0],H+lift+0.003*len,front[1]+b.lengthM*0.55);g.add(f);g.add(ramp);return;}
  if(T==="hammer"||T==="crusher"){const arm=new THREE.Group();arm.userData.role="arm";
    const al=T==="hammer"?b.lengthM*0.7:b.lengthM*0.45;
    if(!pc(arm,"wp_beam",M.alu,0,0,0,0.008*len,0.008*len,al,"weapon")){const beam=new THREE.Mesh(new THREE.BoxGeometry(0.008*len,0.008*len,al),M.alu);beam.position.set(0,0,-al/2);beam.userData.part="weapon";arm.add(beam);}
    const hd=T==="hammer"?[0.03*len,0.02*len,0.016*len]:[0.012*len,0.025*len,0.03*len],hy=T==="hammer"?-0.008*len:-0.012*len;
    if(!pc(arm,T==="hammer"?"wp_hammer_head":"wp_beak",M.steel,0,hy,-al,hd[0],hd[1],hd[2],"weapon")){
      const head=new THREE.Mesh(new THREE.BoxGeometry(hd[0],hd[1],hd[2]),M.steel);head.position.set(0,hy,-al);head.userData.part="weapon";arm.add(head);}
    arm.position.set(0,H+lift+0.012*len,T==="hammer"?hl*0.3:front[1]+al*0.6);g.add(arm);
    if(T==="crusher"&&!pc(g,"wp_jaw",M.steel,front[0],clr+0.003*len,front[1]-0.012*len,b.widthM*0.4,0.004*len,0.03*len)){
      const jaw=new THREE.Mesh(new THREE.BoxGeometry(b.widthM*0.4,0.004*len,0.03*len),M.steel);jaw.position.set(front[0],clr+0.003*len,front[1]-0.012*len);g.add(jaw);}
    return;}
  /* a pusher: a plain plate on the front */
  if(!k.th("front"))add(new THREE.BoxGeometry(b.widthM,bodyH*0.7,0.003*len),M.hdpe,front[0],clr+bodyH*0.4,front[1]-0.0015*len);}

/* ---- the grabber's top jaw (0.1.32): hinged over the front of the deck, its toothed tip reaching down past the forks.
   arena.js swings it: open while it hunts, shut on a bot it holds (o.wp.grab). Full and Ultra: gr_jaw from
   models/bot-attach.glb; Lite: two side arms and a tip bar in code ---- */
function grabJaw(g,b,k,pc,reach){const M=V.mats,{hl,H,clr,bodyH,len,front,lift}=k,A=V.tier!=="lite"?botAttach():null;
  const j=new THREE.Group();j.userData.role="jaw";const jw=b.widthM*0.7,jh=Math.max(0.01*len,H+lift-clr)*0.95,jl=reach+bodyH*0.9;
  if(!(A&&shellAdd(j,A,"gr_jaw",M.alu,"weapon",0,-jh*0.4,-jl*0.4,jw,jh,jl))){const t=0.004*len;
    for(const s of [-1,1]){const a=new THREE.Mesh(new THREE.BoxGeometry(t,t,jl),M.alu);a.position.set(s*jw*0.4,0,-jl/2);a.userData.part="weapon";j.add(a);}
    const tip=new THREE.Mesh(new THREE.BoxGeometry(jw,jh*0.7,t*1.2),M.steel);tip.position.set(0,-jh*0.35,-jl);tip.userData.part="weapon";j.add(tip);}
  j.position.set(front[0],H+lift+0.003*len,front[1]+bodyH*0.3);j.rotation.x=0.35;g.add(j);}

/* ---- the swappable front and the back slot (0.1.32, b.front and b.back). Each piece is drawn in its own box, ahead of
   the front edge or behind the back one, with the part key "front" or "back" so damage greys it. Full and Ultra use the
   Blender pieces (models/bot-attach.glb, tools/blender-bot-attach.py) stretched to the same box; Lite draws them in code:
     wedgelets  two small ramps at the front corners           forks      four tines low on the floor
     plow       a ramp the whole width, taller                 spike      a cone pointing forwards
     rearwedge  a ramp the whole width, facing back            rearspike  two cones pointing back
     kicker     a plate hinged at the top of the back, sloping down behind; arena.js swings it up when it fires ---- */
let ATT_WEDGE=null;   // a unit ramp (tip low at -z, tall at +z), shared by every bot and never disposed
function attWedge(){if(!ATT_WEDGE){const s=new THREE.Shape();s.moveTo(-0.5,-0.5);s.lineTo(0.5,-0.5);s.lineTo(0.5,0.5);s.closePath();
  const e=new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false});e.rotateY(-Math.PI/2);e.translate(0.5,0,0);ATT_WEDGE=e;}return ATT_WEDGE;}
function buildAttach(g,b,k){const M=V.mats,{Wd,L,hw,clr,bh,boxTop,len,front,back,lite}=k,fr=b.front||{id:"none"},bk=b.back||{id:"none"};
  if(fr.id==="none"&&bk.id==="none")return;
  const A=lite?null:botAttach();
  /* one piece: the Blender one in its box when loaded, else the coded mesh (geo a unit-box geometry), scaled to the box */
  const piece=(par,name,geo,mat,part,x,y,z,sx,sy,sz,flipZ)=>{if(A&&shellAdd(par,A,name,mat,part,x,y,z,sx,sy,sz))return;
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);if(flipZ)m.rotation.y=Math.PI;m.userData.part=part;if(geo===ATT_WEDGE)m.userData.keep=1;par.add(m);};
  const cone=back=>{const c=new THREE.ConeGeometry(0.5,1,lite?10:20);c.rotateX(back?Math.PI/2:-Math.PI/2);return c;};
  const fz=front[1],bz=back[1],W=attWedge();
  /* 0.1.48.1, a front makes room for the weapon: where a spinner's disc, a drum or a crusher's jaw comes out of the front, the
     attachment parts round it (kh: half the width the weapon needs, about its mount) and is drawn in single pieces
     (at_wedgelet, at_tine, a plow or a spike per side) in the room left either side. spans: null when nothing is in the way */
  const wpn=b.weapon,wR=wpn.radiusM||0,mx=wpn.mountM?wpn.mountM[0]:0,my=wpn.mountM?wpn.mountM[1]:L/2;let kh=0;
  if(wpn.id==="hsp"||wpn.id==="under"){const dd=L/2-my;kh=wR>dd?Math.sqrt(wR*wR-dd*dd):0;}
  else if(wpn.id==="drum"||wpn.id==="beater")kh=Math.min(Wd*0.7,Math.max(wR*2,Wd*0.5))/2+0.008*len;
  else if(wpn.id==="drisk")kh=wR*0.45+0.008*len;
  else if(wpn.id==="vsp")kh=Math.max(0.005*len,wR*0.14)/2+0.008*len;
  else if(wpn.type==="crusher")kh=Wd*0.2;
  const spans=kh&&fr.id!=="none"?[[-hw,Math.min(hw,mx-kh-0.006*len)],[Math.max(-hw,mx+kh+0.006*len),hw]].filter(q=>q[1]-q[0]>Wd*0.07):null;
  if(fr.id==="wedgelets"){const d=L*0.12,h=clr+bh*0.45,w=Wd*0.3;
    if(spans)for(const q of spans){const ww=Math.min(w,q[1]-q[0]),xc=q[0]<=-hw+1e-6?-hw+ww/2:hw-ww/2;piece(g,"at_wedgelet",W,M.steel,"front",front[0]+xc,h/2,fz-d/2,ww,h,d);}
    else if(!(A&&shellAdd(g,A,"at_wedgelets",M.steel,"front",front[0],h/2,fz-d/2,Wd,h,d)))
      for(const s of [-1,1])piece(g,"",W,M.steel,"front",front[0]+s*(hw-w/2),h/2,fz-d/2,w,h,d);}
  else if(fr.id==="forks"){const d=L*0.18,h=clr+bh*0.35,tw=A?Wd*0.13:Wd*0.08;
    if(spans)for(const q of spans){const a=Math.max(q[0],-Wd*0.45),e=Math.min(q[1],Wd*0.45),n=e-a>=Wd*0.2?2:1;if(e-a<tw*0.6)continue;
      for(let i=0;i<n;i++)piece(g,"at_tine",W,M.steel,"front",front[0]+a+(e-a)*(i+0.5)/n,h/2,fz-d/2,Math.min(tw,(e-a)/n),h,d);}
    else if(!(A&&shellAdd(g,A,"at_forks",M.steel,"front",front[0],h/2,fz-d/2,Wd*0.9,h,d)))
      for(const x of [-0.375,-0.125,0.125,0.375])piece(g,"",W,M.steel,"front",front[0]+x*Wd*0.9,h/2,fz-d/2,Wd*0.08,h,d);}
  else if(fr.id==="plow"){const d=L*0.13,h=clr+bh*0.7;
    if(spans)for(const q of spans){const a=q[0]<=-hw+1e-6?-Wd*0.52:q[0],e=q[1]>=hw-1e-6?Wd*0.52:q[1];piece(g,"at_plow",W,M.steel,"front",front[0]+(a+e)/2,h/2,fz-d/2,e-a,h,d);}
    else piece(g,"at_plow",W,M.steel,"front",front[0],h/2,fz-d/2,Wd*1.04,h,d);}
  else if(fr.id==="spike"){const d=L*0.2,s=Math.min(Wd*0.22,bh*0.5);
    if(spans)for(const q of spans){const s2=Math.min(s,(q[1]-q[0])*0.85),d2=d*(0.6+0.4*s2/s);piece(g,"at_spike",cone(false),M.steel,"front",front[0]+(q[0]+q[1])/2,clr+bh*0.5,fz-d2/2,s2,s2,d2);}
    else piece(g,"at_spike",cone(false),M.steel,"front",front[0],clr+bh*0.5,fz-d/2,s,s,d);}
  if(bk.id==="rearwedge"){const d=L*0.12,h=clr+bh*0.6;piece(g,"at_rearwedge",W,M.steel,"back",back[0],h/2,bz+d/2,Wd,h,d,true);}
  else if(bk.id==="rearspike"){const d=L*0.15,s=Math.min(Wd*0.18,bh*0.4);
    if(!(A&&shellAdd(g,A,"at_rearspike",M.steel,"back",back[0],clr+bh*0.5,bz+d/2,Wd*0.6,s,d))){const c=cone(true);
      for(const x of [-0.3,0.3])piece(g,"",c,M.steel,"back",back[0]+x*Wd*0.6,clr+bh*0.5,bz+d/2,s,s,d);}}
  else if(bk.id==="kicker"){   /* hinged at the top back edge; the plate runs back and down to the floor (rotation.x > 0 lowers its tip) */
    const reach=Math.max(0.01*len,(bk.kick&&bk.kick.reachM)||0.04),hy=boxTop,pl=Math.hypot(hy,reach+0.004*len),t=0.004*len,kp=new THREE.Group();kp.userData.role="kick";
    piece(kp,"at_kick",new THREE.BoxGeometry(1,1,1),M.alu,"back",0,0,pl/2,Wd*0.9,t*2,pl);
    kp.position.set(back[0],hy,bz);kp.userData.rest=Math.atan2(hy,reach+0.004*len);kp.rotation.x=kp.userData.rest;g.add(kp);}}

/* ---- Full and Ultra: the weapon parts (models/bot-weapons.glb, tools/blender-bot-weapons.py; loaded by botWeapons in
   vis/props.js). Each piece is modelled in its own unit box (the script's header gives each one's axes) and stretched to
   the coded box it replaces, so the sim's sizes still rule; its geometry is copied per bot like a shell's. ---- */
function wpPiece(par,W,name,mat,part,x,y,z,sx,sy,sz){return shellAdd(par,W,name,mat,part,x,y,z,sx,sy,sz);}
/* a disc with its teeth, hub and hub bolts, radius r and thickness t, into group par; false when the pieces aren't there */
function wpDisc(par,pc,name,mat,r,t,M,noTeeth){if(!pc(par,name,mat,0,0,0,r,t,r,"weapon"))return false;
  if(!noTeeth)pc(par,"wp_disc_teeth",M.steel,0,0,0,r,t,r,"weapon");   /* the pair of teeth; another count (0.1.48) is drawn by the caller */pc(par,"wp_disc_hub",M.steel,0,0,0,r,t,r);pc(par,"wp_disc_bolts",M.steel,0,0,0,r,t,r);
  wpDiscUV(par,mat);return true;}
/* the disc material's turned rings want the cylinder cap's UVs (centre at 0.5, 0.5, the rim at the edge): made here from
   each point's place in the unit disc (the quantized mesh's own offset and scale undone), as the bot's uvProject skips them */
function wpDiscUV(par,mat){par.traverse(o=>{if(!o.isMesh||o.material!==mat||o.geometry.userData.duv)return;const ge=o.geometry,P=ge.attributes.position,n=P.count,uv=new Float32Array(n*2);
  for(let i=0;i<n;i++){const x=o.position.x+o.scale.x*attrGet(P,i,0),z=o.position.z+o.scale.z*attrGet(P,i,2);uv[i*2]=0.5+x/2;uv[i*2+1]=0.5-z/2;}
  ge.setAttribute("uv",new THREE.BufferAttribute(uv,2));ge.userData.duv=1;});}

/* parts the sim says are damaged go grey, destroyed ones disappear. states: {key: "intact"|"damaged"|"destroyed"} */
function botDamage(g,states){const parts=g.userData.parts||{},graded=V.tier!=="lite"&&g.userData.wear;   /* Full / Ultra: graded by hp lost (vis/wear.js) */
  for(const key in parts){const s=states[key]||"intact";for(const m of parts[key]){m.visible=s!=="destroyed"||key==="chassis";
    if(m.userData.base){m.userData.dmul=s==="destroyed"?0.3:graded?(m.userData.dmul===0.3?1:m.userData.dmul||1):s==="damaged"?0.55:1;m.material.color.copy(m.userData.base).multiplyScalar(m.userData.dmul);}}}
  if(graded){wearApply(g);wearHide(g,states);}}   // dmul: the hit flash (arena.js) lerps from here

/* the workshop's bot. Until a build is passed in, the placeholder (a plywood box with clay sides and a horizontal disc) */
function buildPlaceholderBot(){
  const M=V.mats,g=new THREE.Group(),lite=V.tier==="lite",seg=lite?24:48;
  const W=1.6,L=2.0,H=.42,Y=.32;
  const ply=new THREE.Mesh(new THREE.BoxGeometry(W,.05,L),M.ply);ply.position.y=Y+H/2;g.add(ply);
  const base=new THREE.Mesh(new THREE.BoxGeometry(W,.05,L),M.ply);base.position.y=Y-H/2;g.add(base);
  for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.08,H,L),M.paint);p.position.set(s*(W/2-.04),Y,0);g.add(p);}
  const back=new THREE.Mesh(new THREE.BoxGeometry(W,H,.08),M.hdpe);back.position.set(0,Y,-L/2+.04);g.add(back);
  const front=new THREE.Mesh(new THREE.BoxGeometry(W,H,.1),M.hdpe);front.position.set(0,Y,L/2-.05);g.add(front);
  const wg=new THREE.CylinderGeometry(.24,.24,.14,seg);
  for(const s of [-1,1])for(const z of [-.55,.55]){const w=new THREE.Mesh(wg,M.rubber);w.rotation.z=Math.PI/2;w.position.set(s*(W/2+.08),.24,z);g.add(w);}
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.2,12),M.steel);mast.position.set(0,Y+H/2+.1,L/2-.25);g.add(mast);
  const disc=new THREE.Group();
  const plate=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.05,seg*2),M.disc);disc.add(plate);
  const tooth=new THREE.BoxGeometry(.22,.07,.12);
  for(const a of [0,Math.PI]){const t=new THREE.Mesh(tooth,M.steel);t.position.set(Math.cos(a)*.62,0,Math.sin(a)*.62);t.rotation.y=-a;disc.add(t);}
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.09,16),M.alu);disc.add(hub);
  disc.position.set(0,Y+H/2+.21,L/2-.25);g.add(disc);
  if(!lite){SURF.tile=0.09*2.2/0.27*0.6;g.updateMatrixWorld(true);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material!==M.disc)uvProject(o.geometry,o.matrixWorld);}});}   /* its grain at about the bots' density (it is drawn at 2.2 units a bot) */
  g.userData={disc,placeholder:true};
  return g;
}
