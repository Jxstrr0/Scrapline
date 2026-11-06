/* ---- vis/bot.js: the robot mesh, made from the build (an evalBuild() result the app passes in; the vis only looks up the
   wheel size in SCRAP_SIM's parts table). Everything is code, on every tier:
     chassis   the build's polygon, extruded from the clearance to the chassis height, in the chassis material
     armour    a panel per face, as thick as the plate (drawn at least 2 mm so it reads), in the plate's material
     wheels    one per wheel part, at its place in the layout; tracks as a belt
     weapon    by type: horizontal disc, vertical disc, drum, undercutter, saw on an arm, hammer arm, crusher jaw,
               flipper plate, lifter forks, a wedge's ramp (a pusher has a plain front)
   The mesh is in metres with its origin at the centre of mass (where the sim puts the bot), front along -z; the app's view
   scales it. botDamage() greys out dented parts and hides destroyed ones, from SCRAP_SIM.partStates(). Meshes are cached
   by build hash (a few at a time) and their geometry and materials are disposed when they drop out of the cache. A team
   colour paints the side panels: clay for you, lilac, green and blue for the others. Your bot (the workshop's, and bot 0
   in a fight) also wears your sponsors' colours (SCRAP_VIS.setPaint, PR 8): a panel on each side, a patch on the top. ---- */
const BOT_TEAM=[0xd97757,0xb48ce8,0x4cc38a,0x7fb3e6];
const BOT_CACHE=new Map();   // hash -> group; kept to BOT_CACHE_MAX, oldest first out
const BOT_CACHE_MAX=6;
function botHash(b,team,paint){return JSON.stringify(b.cfg)+"|"+(team||0)+"|"+V.tier+"|"+(paint?(paint.side||"")+(paint.top||""):"");}
/* a sponsor colour ("#rrggbb") as a material, shared and never disposed with a bot (core.js makeMats clears them) */
function spMat(hex){let m=V.spMats[hex];if(!m)m=V.spMats[hex]=V.spMatte(parseInt(String(hex).slice(1),16)||0x888888,.45);return m;}
function disposeTree(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&o.userData.own){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});}
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
  /* chassis: the polygon extruded, a little inset so the armour panels sit on it */
  const sh=new THREE.Shape();b.polygon.forEach((p,i)=>{const q=P(p[0],p[1]);i?sh.lineTo(q[0],-q[1]):sh.moveTo(q[0],-q[1]);});
  const cg=new THREE.ExtrudeGeometry(sh,{depth:bodyH,bevelEnabled:false});cg.rotateX(-Math.PI/2);cg.translate(0,clr,0);
  add(cg,chassisMat(cfg.chassis),0,0,0,"chassis");
  /* armour panels, per face; thickness drawn at least 2 mm (x class) so a plate reads on a phone */
  const A=b.armourMapJ||{},th=f=>A[f]&&A[f].id!=="none"?Math.max(0.002*len,(A[f].thickMm||0)/1000):0;
  const front=P(0,hl),back=P(0,-hl),sloped=["wedge","lifter","flipper"].indexOf(b.weapon.type)>=0;
  if(th("front")&&!sloped)add(new THREE.BoxGeometry(Wd,bodyH*0.92,th("front")),armourMat(A.front.id),front[0],clr+bodyH*0.48,front[1]-th("front")/2,"armour_front");
  if(th("back"))add(new THREE.BoxGeometry(Wd,bodyH*0.92,th("back")),armourMat(A.back.id),back[0],clr+bodyH*0.48,back[1]+th("back")/2,"armour_back");
  for(const s of ["left","right"])if(th(s)){const x=(s==="left"?-hw:hw)-cx,t=th(s);
    add(new THREE.BoxGeometry(t,bodyH*0.92,L*0.96),armourMat(A[s].id),x+(s==="left"?t/2:-t/2),clr+bodyH*0.48,cy,"armour_"+s);}
  if(th("top"))add(new THREE.BoxGeometry(Wd*0.98,th("top"),L*0.98),armourMat(A.top.id),-cx,H+th("top")/2,cy,"armour_top");
  /* team paint: a stripe down the top, so you can tell the bots apart from above */
  const paint=new THREE.Mesh(new THREE.BoxGeometry(Wd*0.28,0.0015*len,L*0.7),M.team[team%BOT_TEAM.length]);paint.position.set(-cx,H+th("top")+0.0008*len,cy+L*0.05);g.add(paint);
  /* sponsors: a panel on each side, a patch at the back of the top plate */
  if(sp&&sp.side)for(const s of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(0.0015*len,bodyH*0.5,L*0.5),spMat(sp.side));
    m.position.set(s*hw-cx+s*0.0009*len,clr+bodyH*0.5,cy);g.add(m);}
  if(sp&&sp.top){const m=new THREE.Mesh(new THREE.BoxGeometry(Wd*0.6,0.0015*len,L*0.18),spMat(sp.top));m.position.set(-cx,H+th("top")+0.0009*len,cy+L*0.36);g.add(m);}
  /* wheels (or tracks), from the layout */
  const wp=(window.SCRAP_SIM&&SCRAP_SIM.part("wheels",cfg.wheels))||{radiusMm:28},wr=Math.min(H*0.55,(wp.radiusMm||28)/1000*len),ww=Math.max(0.006*len,wr*0.55);
  const wheels=b.parts.filter(p=>/^wheel\d/.test(p.key));
  if(wp.tracks){for(const s of [-1,1]){const t=add(new THREE.BoxGeometry(ww,wr*2,L*0.8),M.rubber,s*(hw-ww/2)-cx,wr,cy,s<0?"wheel0":"wheel1");t.userData.wheel=1;}}
  else{const wg=new THREE.CylinderGeometry(wr,wr,ww,seg);wg.rotateZ(Math.PI/2);
    for(const p of wheels){const q=P(p.pos[0],p.pos[1]),x=Math.sign(p.pos[0]||1)*(hw-ww/2-0.001*len);
      const w=add(wg,M.rubber,x-cx,wr,q[1],p.key);w.userData.wheel=1;}}
  /* the weapon */
  buildWeapon(g,b,{P,add,hw,hl,H,clr,bodyH,len,seg,front,th});
  if(!lite)g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  g.userData.H=H;g.userData.L=L;g.userData.W=Wd;g.userData.type=b.weapon.type;g.userData.wid=b.weapon.id;
  return g;}

function buildWeapon(g,b,k){const M=V.mats,w=b.weapon,T=w.type,id=w.id,{P,add,hw,hl,H,clr,bodyH,len,seg,front}=k;
  const mount=w.mountM?P(w.mountM[0],w.mountM[1]):front,r=Math.max(0.01*len,w.radiusM||0.04),mat=M.disc;
  const teeth=(grp,R,n,thick,axis)=>{for(let i=0;i<n;i++){const a=i*2*Math.PI/n,t=new THREE.Mesh(new THREE.BoxGeometry(R*0.32,thick*1.4,R*0.18),M.steel);
    t.position.set(Math.cos(a)*R,0,Math.sin(a)*R);t.rotation.y=-a;grp.add(t);}};
  if(T==="spinner"||T==="saw"){const spin=new THREE.Group();spin.userData.role="spin";
    if(id==="hsp"||id==="under"){const thick=Math.max(0.004*len,r*0.08);
      const d=new THREE.Mesh(new THREE.CylinderGeometry(r,r,thick,seg*2),mat);d.userData.part="weapon";spin.add(d);teeth(spin,r,2,thick);
      spin.position.set(mount[0],id==="under"?clr+thick:clr+bodyH*0.55,mount[1]);spin.userData.axis="y";
      if(id==="hsp")add(new THREE.CylinderGeometry(r*0.15,r*0.15,bodyH*0.5,12),M.steel,mount[0],clr+bodyH*0.3,mount[1]);}
    else{   // vertical disc, drum, saw: spin about the x axis
      const drum=id==="drum",width=drum?Math.min(b.widthM*0.7,Math.max(r*2,b.widthM*0.5)):Math.max(0.005*len,r*0.14);
      const geo=new THREE.CylinderGeometry(r,r,width,drum?seg:seg*2);geo.rotateZ(Math.PI/2);
      const d=new THREE.Mesh(geo,mat);d.userData.part="weapon";spin.add(d);
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
    const reach=Math.max(0.01*len,(w.reachM||0.04)),top=clr+bodyH*0.95,run=reach+0.004*len,slope=Math.atan2(top,run);
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
    f.position.set(front[0],H+0.003*len,front[1]+b.lengthM*0.55);g.add(f);g.add(ramp);return;}
  if(T==="hammer"||T==="crusher"){const arm=new THREE.Group();arm.userData.role="arm";
    const al=T==="hammer"?b.lengthM*0.7:b.lengthM*0.45;
    const beam=new THREE.Mesh(new THREE.BoxGeometry(0.008*len,0.008*len,al),M.alu);beam.position.set(0,0,-al/2);beam.userData.part="weapon";arm.add(beam);
    const head=new THREE.Mesh(T==="hammer"?new THREE.BoxGeometry(0.03*len,0.02*len,0.016*len):new THREE.BoxGeometry(0.012*len,0.025*len,0.03*len),M.steel);
    head.position.set(0,T==="hammer"?-0.008*len:-0.012*len,-al);head.userData.part="weapon";arm.add(head);
    arm.position.set(0,H+0.012*len,T==="hammer"?hl*0.3:front[1]+al*0.6);g.add(arm);
    if(T==="crusher"){const jaw=new THREE.Mesh(new THREE.BoxGeometry(b.widthM*0.4,0.004*len,0.03*len),M.steel);jaw.position.set(front[0],clr+0.003*len,front[1]-0.012*len);g.add(jaw);}
    return;}
  /* a pusher: a plain plate on the front */
  if(!k.th("front"))add(new THREE.BoxGeometry(b.widthM,bodyH*0.7,0.003*len),M.hdpe,front[0],clr+bodyH*0.4,front[1]-0.0015*len);}

/* parts the sim says are damaged go grey, destroyed ones disappear. states: {key: "intact"|"damaged"|"destroyed"} */
function botDamage(g,states){const parts=g.userData.parts||{};
  for(const key in parts){const s=states[key]||"intact";for(const m of parts[key]){m.visible=s!=="destroyed"||key==="chassis";
    if(m.userData.base){m.material.color.copy(m.userData.base);if(s==="damaged")m.material.color.multiplyScalar(0.55);else if(s==="destroyed")m.material.color.multiplyScalar(0.3);}}}}

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
  if(!lite)g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  g.userData={disc,placeholder:true};
  return g;
}
