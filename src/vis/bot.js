/* ---- vis/bot.js: the robot mesh, made from the build (an evalBuild() result the app passes in; the vis only looks up the
   wheel size in SCRAP_SIM's parts table). Everything is code, on every tier:
     chassis   the build's polygon, extruded from the clearance to the chassis height, in the chassis material
     armour    a panel per face, as thick as the plate (drawn at least 2 mm so it reads), in the plate's material
     wheels    one per wheel part, at its place in the layout; tracks as a belt
     weapon    by type: horizontal disc, vertical disc, drum, undercutter, saw on an arm, hammer arm, crusher jaw,
               flipper plate, lifter forks, a wedge's ramp (a pusher has a plain front)
     bay       the weapon bay (b.bay, 0.1.15.3): a slot, pocket or well cut out of the chassis, its front plate and the top
               (a notch or hole by polyMinus, the chassis in layers round it), a recess from below for an undercutter, a
               deck where a raised top is cut away for an arm or a flipper; walls under a raised top so it isn't hollow.
               On Full and Ultra the shells have slotted variants for the default layout (shellVariant); a bay they
               don't have falls back to these coded shapes
   The mesh is in metres with its origin at the centre of mass (where the sim puts the bot), front along -z; the app's view
   scales it. On Full and Ultra the materials carry maps (vis/surface.js): buildBot ends by projecting UVs over the whole
   mesh (uvProject, one tile every SURF.tile metres), the wheels become a tyre with a tread round a brushed hub, and the
   Blender shells get their geometry copied per bot so they take the projection too. botDamage() greys out dented parts and hides destroyed ones, from SCRAP_SIM.partStates(). Meshes are cached
   by build hash (a few at a time) and their geometry and materials are disposed when they drop out of the cache. A team
   colour paints the side panels: clay for you, lilac, green and blue for the others. Your bot (the workshop's, and bot 0
   in a fight) also wears your sponsors' colours (SCRAP_VIS.setPaint, PR 8): a panel on each side, a patch on the top. ---- */
const BOT_TEAM=[0xd97757,0xb48ce8,0x4cc38a,0x7fb3e6];
const BOT_CACHE=new Map();   // hash -> group; kept to BOT_CACHE_MAX, oldest first out
const BOT_CACHE_MAX=6;
function botHash(b,team,paint){return JSON.stringify(b.cfg)+"|"+(team||0)+"|"+V.tier+(shellsReady()?"s":"")+"|"+(paint?(paint.side||"")+(paint.top||""):"");}
/* a sponsor colour ("#rrggbb") as a material, shared and never disposed with a bot (core.js makeMats clears them) */
function spMat(hex){let m=V.spMats[hex];if(!m)m=V.spMats[hex]=V.spMatte(parseInt(String(hex).slice(1),16)||0x888888,.45);return m;}
function disposeTree(g){g.traverse(o=>{if(o.geometry&&!o.userData.keep)o.geometry.dispose();if(o.material&&o.userData.own){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});}
/* a clone leaving the scene: its geometry belongs to the cached source, only its own (damage-tinted) materials go */
function disposeClone(g){if(g.parent)g.parent.remove(g);g.traverse(o=>{if(o.material&&o.userData.own)o.material.dispose();});}
/* a mesh from the cache, or a new one. The workshop and the arena each get their own clone (same geometry, shared materials) */
function botMesh(b,team,paint){const k=botHash(b,team,paint);let g=BOT_CACHE.get(k);
  if(g){BOT_CACHE.delete(k);BOT_CACHE.set(k,g);}   // most recently used last
  else{g=buildBot(b,team,paint);BOT_CACHE.set(k,g);
    while(BOT_CACHE.size>BOT_CACHE_MAX){const [k0,g0]=BOT_CACHE.entries().next().value;BOT_CACHE.delete(k0);disposeTree(g0);}}   // a clone still on screen re-uploads it
  return cloneBot(g);}
function botCacheClear(){for(const g of BOT_CACHE.values())disposeTree(g);BOT_CACHE.clear();}
/* clone keeps geometry shared; part materials that get tinted by damage are cloned per instance (userData.own) */
function cloneBot(src){const g=src.clone(true);g.userData=Object.assign({},src.userData,{parts:{},spin:null,arm:null,forks:null,wheels:[]});
  g.traverse(o=>{if(!o.isMesh)return;const u=o.userData;
    if(u.part){o.material=o.material.clone();o.userData={part:u.part,own:true,base:o.material.color.clone()};(g.userData.parts[u.part]||(g.userData.parts[u.part]=[])).push(o);}
    else if(u.role==="blur"){o.material=o.material.clone();o.userData={role:"blur",own:true};g.userData.blur=o;}
    if(u.wheel)g.userData.wheels.push(o);});
  g.traverse(o=>{const r=o.userData.role;if(r==="spin")g.userData.spin=o;else if(r==="arm")g.userData.arm=o;else if(r==="forks")g.userData.forks=o;else if(r==="flip")g.userData.flip=o;});
  return g;}
function chassisMat(id){const M=V.mats;return id==="ply"?M.ply:id==="hdpe"?M.hdpe:id==="steel"?M.steel:id==="ti"?M.ti:id==="custom"?M.botPlate||M.plate:M.alu;}
function armourMat(id){const M=V.mats;return/^hdpe/.test(id)?M.hdpe:id==="alu"?M.alu:id==="ti"?M.ti:id==="ar500"?M.botPlate||M.plate:M.steel;}

function buildBot(b,team,sp){
  const M=V.mats,g=new THREE.Group(),lite=V.tier==="lite",seg=lite?20:40,cfg=b.cfg,cx=b.com.x,cy=b.com.y;
  const L=b.lengthM,Wd=b.widthM,hw=Wd/2,hl=L/2,len=L/0.27;   // len: rough class scale from the length, for small fixed sizes
  const clr=Math.max(0.001,b.height.clearanceMm/1000),H=Math.max(clr+0.01,b.height.heightMm/1000),bodyH=H-clr;
  const P=(x,y)=>[x-cx,-(y-cy)];   // build coords (m, y forward) to mesh (x, z), origin at the centre of mass
  const add=(geo,mat,x,y,z,part)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(part)m.userData.part=part;g.add(m);return m;};
  const body=cfg.body||"plain",drop=body==="wedge"?bodyH*0.6:0,bh=bodyH-drop,boxTop=clr+bh;   /* bh: the box height under a wedge shell's slope */
  SURF.tile=lite?0:0.09*len;   /* the surfaces' grain: one tile every 9 cm at beetle scale (vis/surface.js; 0 skips the projection) */
  /* the weapon bay (0.1.15.3): evalBuild's b.bay. A slot, pocket or well is cut out of the chassis, its front plate and
     the top over it; a deck is a flat plate on the box top where a raised top (a wedge lid, a dome, a shell) is cut away
     for an arm or a flipper. span: the opening's height in the box, from its bottom */
  let bay=b.bay&&b.bay.rect&&b.bay.kind!=="none"?b.bay:null,bk=bay?bay.kind:"none",reg=bay?bayRegion(bay,hw,hl,Math.max(Wd,L)*0.06,seg):null;
  let wr0=Math.max(0.01*len,b.weapon.radiusM||0.04),dep=bay?Math.min(bh*0.8,bay.depthM||0):0;
  const span=!reg?null:bk==="slot"?(b.weapon.id==="saw"?[bh-Math.min(bh*0.8,wr0*0.5),bh]:[0,bh]):bk==="pocket"?[0,bh]:bk==="well"?[bh-dep,bh]:bk==="underwell"?[0,dep]:null;
  const ext=(outline,holes,y0,y1,mat,part)=>y1-y0>1e-5?add(shapeGeo(outline,holes,y1-y0,cx,cy,y0),mat,0,0,0,part):null;
  /* chassis: the polygon extruded (in layers round a bay), a little inset so the armour panels sit on it */
  const cm=chassisMat(cfg.chassis),cut=span?polyMinus(b.polygon,reg):null;
  if(cut){ext(b.polygon,null,clr,clr+span[0],cm,"chassis");ext(cut.outline,cut.holes,clr+span[0],clr+span[1],cm,"chassis");ext(b.polygon,null,clr+span[1],boxTop,cm,"chassis");}
  else ext(b.polygon,null,clr,boxTop,cm,"chassis");
  if(span&&!cut){reg=null;dep=0;}   /* a bay the outline can't be cut round (a big moved disc over a corner): draw the bot uncut, the weapon on top */
  /* armour panels, per face; thickness drawn at least 2 mm (x class) so a plate reads on a phone. The front plate parts
     round a bay that opens at the front */
  const A=b.armourMapJ||{},th=f=>A[f]&&A[f].id!=="none"?Math.max(0.002*len,(A[f].thickMm||0)/1000):0;
  const front=P(0,hl),back=P(0,-hl),sloped=["wedge","lifter","flipper"].indexOf(b.weapon.type)>=0;
  if(th("front")&&!sloped){const t=th("front"),fm=armourMat(A.front.id),ya=bh*0.02,yb=bh*0.94,xa=cut?frontGap(bay,hw,hl):null;
    const piece=(x0,x1,y0,y1)=>{if(x1-x0>1e-4&&y1-y0>1e-4)add(new THREE.BoxGeometry(x1-x0,y1-y0,t),fm,(x0+x1)/2-cx,clr+(y0+y1)/2,front[1]-t/2,"armour_front");};
    if(xa){piece(-hw,xa[0],ya,yb);piece(xa[1],hw,ya,yb);piece(xa[0],xa[1],ya,Math.min(yb,span[0]));piece(xa[0],xa[1],Math.max(ya,span[1]),yb);}
    else piece(-hw,hw,ya,yb);}
  if(th("back"))add(new THREE.BoxGeometry(Wd,bodyH*0.92,th("back")),armourMat(A.back.id),back[0],clr+bodyH*0.48,back[1]+th("back")/2,"armour_back");
  for(const s of ["left","right"])if(th(s)){const x=(s==="left"?-hw:hw)-cx,t=th(s);
    add(new THREE.BoxGeometry(t,bh*0.92,L*0.96),armourMat(A[s].id),x+(s==="left"?t/2:-t/2),clr+bh*0.48,cy,"armour_"+s);}
  const topKey=th("top")?"armour_top":"chassis",tt=Math.max(th("top"),0.0015*len),topMat=th("top")?armourMat(A.top.id):chassisMat(cfg.chassis);
  const S0=lite?null:botShells(),sideMat=s=>th(s)?armourMat(A[s].id):chassisMat(cfg.chassis),sideKey=s=>th(s)?"armour_"+s:"chassis";
  /* a shell with a bay needs the slotted variant made for it; a bay the shells don't have (the weapon moved in the layout)
     falls back to the coded shapes, which cut any bay */
  const sv=S0&&SHELL_TOPS[body]?shellVariant(bay,b.weapon,body):null,S=S0&&(!SHELL_TOPS[body]||sv)?S0:null;
  const sk={M,cx,cy,H,clr,bodyH,Wd,L,hw,hl,len,tt:th("top")?tt:0,topKey,topMat,sideMat,sideKey,sv:sv&&sv.top,svb:sv&&sv.bottom};
  const topCut=!!reg&&(bk==="slot"||bk==="pocket"||bk==="well"),raisedCut=!!reg&&(topCut||bk==="deck");   /* a deck cuts only a raised top */
  const deck=bk==="deck"&&(S&&SHELL_TOPS[body]||(!S&&(body==="wedge"||body==="dome")));
  const flat=(w,l,y0,mat,part,c)=>{const p=rectPts(w,l),d=c?polyMinus(p,reg):null;return d?ext(d.outline,d.holes,y0,y0+tt,mat,part):ext(p,null,y0,y0+tt,mat,part);};
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
  else if(th("top")||body==="invert")flat(Wd*(body==="pancake"?1.04:0.98),L*(body==="pancake"?1.02:0.98),H,topMat,topKey,topCut);
  if(body==="invert"&&!S)flat(Wd*0.98,L*0.98,clr-tt,topMat,"chassis",!!reg&&bay.openBelow&&(bk==="slot"||bk==="pocket"||bk==="underwell"));   /* the same plate underneath */
  if(deck){const R=bay.rect;add(new THREE.BoxGeometry(R[2]-R[0],tt,R[3]-R[1]),topMat,(R[0]+R[2])/2-cx,boxTop+tt/2,cy-(R[1]+R[3])/2,topKey);}
  if(S&&(body==="slab"||body==="scrap"))shellBody(g,S,body,sk);   /* these keep the flat top above and add to it */
  if(body==="slab"&&!S)for(const sx of [-1,1])for(const sz of [-1,1]){   /* corner guards */
    const c=add(new THREE.BoxGeometry(0.016*len,bodyH*1.02,0.016*len),M.steel,sx*hw-cx,clr+bodyH*0.51,cy+sz*hl,"chassis");c.rotation.y=Math.PI/4;}
  if(body==="scrap"&&!S){   /* scrap frame: bare tubes along the top edges and up the corners */
    const r=0.0035*len,tg=new THREE.CylinderGeometry(r,r,L*0.98,lite?5:8),pg=new THREE.CylinderGeometry(r,r,bodyH,lite?5:8),cg2=new THREE.CylinderGeometry(r,r,Wd*0.98,lite?5:8);
    for(const sx of [-1,1]){const t=add(tg,M.steel,sx*(hw+r)-cx,H+tt+r,cy,"chassis");t.rotation.x=Math.PI/2;
      for(const sz of [-1,1])add(pg,M.steel,sx*(hw+r)-cx,clr+bodyH/2,cy+sz*(hl+r),"chassis");}
    for(const sz of [-1,1]){const t=add(cg2,M.steel,-cx,H+tt+r,cy+sz*(hl+r),"chassis");t.rotation.z=Math.PI/2;}}
  /* team paint: a stripe down the top, so you can tell the bots apart from above; it stops short of an open bay */
  let ys0=-0.4*L,ys1=0.3*L;if(body==="dome"){ys0=-0.26*L;ys1=0.16*L;}
  if(reg&&(topCut||(raisedCut&&(body==="wedge"||body==="dome"||(S&&SHELL_TOPS[body]))))&&bay.rect[0]<Wd*0.14&&bay.rect[2]>-Wd*0.14)ys1=Math.max(ys0+0.12*L,Math.min(ys1,bay.rect[1]-0.03*L));
  const yc=(ys0+ys1)/2,paint=new THREE.Mesh(new THREE.BoxGeometry(Wd*0.28,0.0015*len,ys1-ys0),M.team[team%BOT_TEAM.length]);const lid=S&&SHELL_LID[body]!=null?SHELL_LID[body]*bodyH:th("top"),wt=S&&body==="wedge"?0.07*bodyH:tt;paint.position.set(-cx,H+lid+0.0008*len,cy-yc);if(body==="wedge"){const tl=Math.atan2(drop,L*0.98);paint.position.y=H-drop/2-yc*Math.tan(tl)+wt+0.0008*len;paint.rotation.x=-tl;}else if(body==="dome")paint.position.y=H+bodyH*0.5;g.add(paint);
  /* sponsors: a panel on each side, a patch at the back of the top plate */
  if(sp&&sp.side)for(const s of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(0.0015*len,bh*0.5,L*0.5),spMat(sp.side));
    m.position.set(s*(hw+(S&&body==="slab"?Wd*0.05:0))-cx+s*0.0009*len,clr+bh*0.5,cy);g.add(m);}
  if(sp&&sp.top){const sw=S&&body==="invert"?0.34:0.6,pz=S&&(body==="wedge"||body==="pancake")?0.3:0.36;   /* over a shell: between the invertible's rails, clear of the bolts */
    const m=new THREE.Mesh(new THREE.BoxGeometry(Wd*sw,0.0015*len,L*0.18),spMat(sp.top));
    m.position.set(-cx,(body==="dome"?H+bodyH*0.27:S&&body==="wedge"?H-drop*(0.5-pz)+wt:H-drop*0.13+lid)+0.0009*len,cy+L*pz);if(body==="wedge")m.rotation.x=-Math.atan2(drop,L*0.98);g.add(m);}
  /* wheels (or tracks), from the layout */
  const wp=(window.SCRAP_SIM&&SCRAP_SIM.part("wheels",cfg.wheels))||{radiusMm:28},wr=Math.min(H*0.55,(wp.radiusMm||28)/1000*len),ww=Math.max(0.006*len,wr*0.55);
  const wheels=b.parts.filter(p=>/^wheel\d/.test(p.key));
  if(wp.tracks){for(const s of [-1,1]){const t=add(new THREE.BoxGeometry(ww,wr*2,L*0.8),M.rubber,s*(hw-ww/2)-cx,wr,cy,s<0?"wheel0":"wheel1");t.userData.wheel=1;}}
  else if(lite){const wg=new THREE.CylinderGeometry(wr,wr,ww,seg);wg.rotateZ(Math.PI/2);
    for(const p of wheels){const q=P(p.pos[0],p.pos[1]),x=Math.sign(p.pos[0]||1)*(hw-ww/2-0.001*len);
      const w=add(wg,M.rubber,x-cx,wr,q[1],p.key);w.userData.wheel=1;}}
  else{   /* Full and Ultra: a tyre (the tread runs round it: the cylinder's own UVs, repeated) on a brushed hub with a face */
    const tg=new THREE.CylinderGeometry(wr,wr,ww,seg,1,true);uvRepeat(tg,Math.max(2,Math.round(2*Math.PI*wr/(SURF.tile*0.5))),1);tg.rotateZ(Math.PI/2);
    const hg=new THREE.CylinderGeometry(wr*0.62,wr*0.62,ww*1.04,seg);hg.rotateZ(Math.PI/2);
    for(const p of wheels){const q=P(p.pos[0],p.pos[1]),x=Math.sign(p.pos[0]||1)*(hw-ww/2-0.001*len);
      const w=add(tg,M.rubber,x-cx,wr,q[1],p.key);w.userData.wheel=1;const h=add(hg,M.alu,x-cx,wr,q[1],p.key);h.userData.wheel=1;}}
  /* the weapon */
  /* an arm or a flipper lies on its deck; otherwise over the dome's crown or halfway down the wedge's slope */
  buildWeapon(g,b,{P,add,hw,hl,H,clr,bodyH,len,seg,front,th,bh,boxTop,wellD:bk==="well"||bk==="underwell"?dep:0,
    lift:deck?boxTop+tt-H:body==="dome"?bodyH*0.5:body==="wedge"?-drop/2:th("top")?tt:0});
  if(!lite){g.updateMatrixWorld(true);g.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
    if(o.material!==M.disc&&o.userData.role!=="blur")uvProject(o.geometry,o.matrixWorld);});}   /* discs keep their cap UVs (turning marks round the hub); the tyres were done above */
  g.userData.H=H;g.userData.L=L;g.userData.W=Wd;g.userData.type=b.weapon.type;g.userData.wid=b.weapon.id;
  return g;}

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
  o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.traverse(m=>{if(m.isMesh){m.material=mat;const ge=m.geometry.clone();ge.userData={};m.geometry=ge;if(part)m.userData.part=part;}});g.add(o);return o;}
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
  else if(body==="scrap"){   /* the frame: rails along the top edges, posts up the corners, a cross brace over the top, welds at the joints */
    const r=0.0035*len,yT=H+tt+r,up=new THREE.Vector3(0,1,0);
    const tube=(x0,y0,z0,x1,y1,z1)=>{const d=new THREE.Vector3(x1-x0,y1-y0,z1-z0),l=d.length(),o=shellAdd(g,S,"scrap_tube",M.steel,"chassis",(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,r,l,r);
      if(o)o.quaternion.setFromUnitVectors(up,d.normalize());};
    const X=[-(hw+r)-cx,(hw+r)-cx],Z=[cy-(hl+r),cy+(hl+r)];
    for(const x of X){tube(x,yT,Z[0],x,yT,Z[1]);for(const z of Z)tube(x,clr,z,x,yT,z);}
    for(const z of Z)tube(X[0],yT,z,X[1],yT,z);
    tube(X[0],yT+r,Z[0],X[1],yT+r,Z[1]);tube(X[1],yT+r*1.2,Z[0],X[0],yT+r*1.2,Z[1]);
    for(const x of X)for(const z of Z)shellAdd(g,S,"scrap_weld",M.steel,"chassis",x,yT,z,r*1.7,r*1.7,r*1.7);
    shellAdd(g,S,"scrap_weld",M.steel,"chassis",-cx,yT+r*1.1,cy,r*1.5,r*1.2,r*1.5);}}

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
function shapeGeo(outline,holes,depth,ox,oy,y0){const V2=p=>new THREE.Vector2(p[0]-ox,p[1]-oy);
  const area=q=>q.reduce((s,p,i)=>{const n=q[(i+1)%q.length];return s+p[0]*n[1]-n[0]*p[1];},0),wind=(q,ccw)=>(area(q)>0)===ccw?q:q.slice().reverse();
  const sh=new THREE.Shape(wind(outline,true).map(V2));   /* the outline one way round and its holes the other, as three.js wants */
  for(const h of holes||[])sh.holes.push(new THREE.Path(wind(h,false).map(V2)));
  const e=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:false,curveSegments:1});e.rotateX(-Math.PI/2);if(y0)e.translate(0,y0,0);return e;}
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
  const v=bay.kind==="deck"?{hammer:"hammer",flipper:"flip",lifter:"lift",crusher:"crush"}[w.type]:{slot:"slot",pocket:"pocket",well:"well",underwell:"under"}[bay.kind];
  if(!v||!SHELL_BAYS[v])return null;const R=u.rect,hwU=(R[2]-R[0])/2;
  if(Math.abs(R[0]+R[2])>0.01||Math.abs(R[1]+0.5)>0.01)return null;
  const set=SHELL_BAYS[v].findIndex(q=>Math.abs(q[0]-hwU)<0.025&&Math.abs(q[1]-R[3])<0.025);if(set<0)return null;
  const sfx=v+"_"+(set?"B":"A"),S=botShells(),has=n=>!!(S&&S.getObjectByName(SHELL_PIECE[body]+"__"+n));
  const r=v==="under"?{top:null,bottom:body==="invert"?sfx:null}:{top:sfx,bottom:body==="invert"&&bay.openBelow&&(v==="slot"||v==="pocket")?sfx:null};
  return(r.top&&!has(r.top))||(r.bottom&&!has(r.bottom))?null:r;}

function buildWeapon(g,b,k){const M=V.mats,w=b.weapon,T=w.type,id=w.id,{P,add,hw,hl,H,clr,bodyH,len,seg,front,bh,lift}=k;
  const mount=w.mountM?P(w.mountM[0],w.mountM[1]):front,r=Math.max(0.01*len,w.radiusM||0.04),mat=M.disc;
  const teeth=(grp,R,n,thick,axis)=>{for(let i=0;i<n;i++){const a=i*2*Math.PI/n,t=new THREE.Mesh(new THREE.BoxGeometry(R*0.32,thick*1.4,R*0.18),M.steel);
    t.position.set(Math.cos(a)*R,0,Math.sin(a)*R);t.rotation.y=-a;grp.add(t);}};
  if(T==="spinner"||T==="saw"){const spin=new THREE.Group();spin.userData.role="spin";
    if(id==="hsp"||id==="under"){const thick=Math.max(0.004*len,r*0.08);
      const d=new THREE.Mesh(new THREE.CylinderGeometry(r,r,thick,seg*2),mat);d.userData.part="weapon";spin.add(d);teeth(spin,r,2,thick);
      const wd=k.wellD||0,dy=id==="under"?(wd?clr+Math.max(thick*0.6,wd*0.45):clr+thick):wd?k.boxTop-wd+thick*0.5+0.0015*len:clr+bodyH*0.55;
      spin.position.set(mount[0],dy,mount[1]);spin.userData.axis="y";
      if(wd){const y0=id==="under"?dy:k.boxTop-wd,y1=id==="under"?clr+wd:dy;   /* the hub, from the well's floor (the recess's roof) to the disc */
        if(y1>y0)add(new THREE.CylinderGeometry(r*0.15,r*0.15,y1-y0,12),M.steel,mount[0],(y0+y1)/2,mount[1]);}
      else if(id==="hsp")add(new THREE.CylinderGeometry(r*0.15,r*0.15,bodyH*0.5,12),M.steel,mount[0],clr+bodyH*0.3,mount[1]);}
    else{   // vertical disc, drum, saw: spin about the x axis
      const drum=id==="drum",width=drum?Math.min(b.widthM*0.7,Math.max(r*2,b.widthM*0.5)):Math.max(0.005*len,r*0.14);
      const geo=new THREE.CylinderGeometry(r,r,width,drum?seg:seg*2);geo.rotateZ(Math.PI/2);
      const d=new THREE.Mesh(geo,drum&&V.tier!=="lite"?M.steel:mat);d.userData.part="weapon";spin.add(d);
      if(drum){for(let i=0;i<2;i++){const t=new THREE.Mesh(new THREE.BoxGeometry(width*0.9,r*0.25,r*0.25),M.steel);t.position.set(0,i?-r:r,0);spin.add(t);}}
      else{for(let i=0;i<2;i++){const t=new THREE.Mesh(new THREE.BoxGeometry(width*1.3,r*0.3,r*0.2),M.steel);t.position.set(0,i?-r:r,0);spin.add(t);}}
      const cyH=id==="saw"?H+r*0.6:r+Math.max(0.001,(b.height.frontEdgeMm||2)/1000);
      spin.position.set(mount[0],cyH,mount[1]);spin.userData.axis="x";
      /* the uprights that hold it */
      for(const s of [-1,1])add(new THREE.BoxGeometry(0.004*len,id==="saw"?r*1.2:r*1.2,r*0.8),M.steel,mount[0]+s*(width/2+0.003*len),id==="saw"?H+r*0.3:cyH,mount[1]+r*0.25);}
    g.add(spin);
    /* a blur disc that shows when it's up to speed (opacity set per frame) */
    const blur=new THREE.Mesh(spin.userData.axis==="y"?new THREE.CircleGeometry(r*1.05,seg):new THREE.CircleGeometry(r*1.05,seg),M.blur.clone());
    blur.userData.role="blur";blur.userData.own=true;   // its own material copy: freed with the cached source
    if(spin.userData.axis==="y")blur.rotation.x=-Math.PI/2;else blur.rotation.y=Math.PI/2;
    blur.position.copy(spin.position);blur.position.y+=spin.userData.axis==="y"?r*0.05:0;g.add(blur);
    return;}
  if(T==="wedge"||T==="lifter"||T==="flipper"){
    /* a ramp from the front edge to the floor ahead of the bot */
    const reach=Math.max(0.01*len,(w.reachM||0.04)),top=clr+bh*0.95,run=reach+0.004*len,slope=Math.atan2(top,run);
    const ramp=new THREE.Mesh(new THREE.BoxGeometry(b.widthM,0.003*len,Math.hypot(top,run)),T==="wedge"?M.steel:M.alu);
    ramp.position.set(front[0],top/2,front[1]-run/2);ramp.rotation.x=-slope;ramp.userData.part="weapon";
    if(T==="wedge"){g.add(ramp);return;}
    if(T==="lifter"){const f=new THREE.Group();f.userData.role="forks";
      for(const s of [-1,1]){const fk=new THREE.Mesh(new THREE.BoxGeometry(0.006*len,0.004*len,reach+bodyH),M.steel);fk.position.set(s*b.widthM*0.25,0,-(reach+bodyH)/2);fk.userData.part="weapon";f.add(fk);}
      f.position.set(front[0],clr+0.002*len,front[1]+bodyH*0.3);g.add(f);
      ramp.scale.set(1,1,0.4);ramp.position.set(front[0],top*0.8,front[1]-run*0.2);g.add(ramp);return;}
    /* flipper: the ramp is the plate, hinged at the top front, swinging up when it fires */
    const f=new THREE.Group();f.userData.role="flip";const plate=new THREE.Mesh(new THREE.BoxGeometry(b.widthM*0.9,0.003*len,b.lengthM*0.55),M.alu);
    plate.position.set(0,0,-b.lengthM*0.275);plate.userData.part="weapon";f.add(plate);   // hinged at the back, the tip at the front edge
    f.position.set(front[0],H+lift+0.003*len,front[1]+b.lengthM*0.55);g.add(f);g.add(ramp);return;}
  if(T==="hammer"||T==="crusher"){const arm=new THREE.Group();arm.userData.role="arm";
    const al=T==="hammer"?b.lengthM*0.7:b.lengthM*0.45;
    const beam=new THREE.Mesh(new THREE.BoxGeometry(0.008*len,0.008*len,al),M.alu);beam.position.set(0,0,-al/2);beam.userData.part="weapon";arm.add(beam);
    const head=new THREE.Mesh(T==="hammer"?new THREE.BoxGeometry(0.03*len,0.02*len,0.016*len):new THREE.BoxGeometry(0.012*len,0.025*len,0.03*len),M.steel);
    head.position.set(0,T==="hammer"?-0.008*len:-0.012*len,-al);head.userData.part="weapon";arm.add(head);
    arm.position.set(0,H+lift+0.012*len,T==="hammer"?hl*0.3:front[1]+al*0.6);g.add(arm);
    if(T==="crusher"){const jaw=new THREE.Mesh(new THREE.BoxGeometry(b.widthM*0.4,0.004*len,0.03*len),M.steel);jaw.position.set(front[0],clr+0.003*len,front[1]-0.012*len);g.add(jaw);}
    return;}
  /* a pusher: a plain plate on the front */
  if(!k.th("front"))add(new THREE.BoxGeometry(b.widthM,bodyH*0.7,0.003*len),M.hdpe,front[0],clr+bodyH*0.4,front[1]-0.0015*len);}

/* parts the sim says are damaged go grey, destroyed ones disappear. states: {key: "intact"|"damaged"|"destroyed"} */
function botDamage(g,states){const parts=g.userData.parts||{};
  for(const key in parts){const s=states[key]||"intact";for(const m of parts[key]){m.visible=s!=="destroyed"||key==="chassis";
    if(m.userData.base){m.userData.dmul=s==="damaged"?0.55:s==="destroyed"?0.3:1;m.material.color.copy(m.userData.base).multiplyScalar(m.userData.dmul);}}}}   // dmul: the hit flash (arena.js) lerps from here

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
