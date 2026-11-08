/* ---- vis/arena.js: the arena view. setFight(F) builds the scene from a SCRAP_SIM fight the app passes in (F.arena:
   floor, walls, the pit, wall pushers and floor spinners; F.bots: a mesh per bot from its build) and each frame draws the
   bots where the sim has them. The vis reads F; it never steps it. Units: the scene is in "beetle metres x 4" (AU per sim
   metre is 4 / the class's length scale), so every class fills the screen the same way.
     floor      dark plate with markings painted on (0.1.21.0, arenaDecal): a grid every 30 cm (beetle scale), a border
                line, a centre circle, hatched bands where the wall rams reach, a ring round each floor spinner and a striped
                edge round the pit. Lite bakes them, with a soft pool of light, into the floor's own texture (one texture
                lookup, no lights and no grid lines to draw); Full and Ultra lay them over the photo plate as a see-through
                decal, under a spotlight over the arena. The floor round the arena is darker than the arena (arenaOut).
     walls      steel kerbs with a glass screen on top; the side nearest the camera has no screen, no top rail and short
                posts (0.1.21.0), so nothing crosses in front of the bots
     pit        a black hole under a hatched cover that slides away when it opens
     pusher     a slab in the wall that shoves out and lights amber while it fires
     spinner    a disc in the floor that spins and lights while it fires
     crowd      a cheap canvas texture of heads beyond the walls (Full and Ultra only; Lite gets a plain dark backdrop)
     props      crates and the like beyond the walls (Full and Ultra only, vis/props.js), at the workshop's half scale
     kit        on Full and Ultra the arena kit (models/arena-kit.glb, vis/props.js) swaps in for the coded kerbs, posts,
                hazards and pit rim once it loads, opens a real hole for the pit and adds stands; AR.kit lists what it swaps
   Camera: tilted top-down (about 55 degrees). It frames the box round the bots still in it (0.1.15.4), tight enough that
   they fill the screen, in the band the app leaves clear between its bot cards and the controls (V.run.inset {t, b} in
   CSS px); a pinch or the mouse wheel nudges it (V.run.zoom, a multiplier on the distance). It shakes on hits (fx.js),
   never under reduced motion.
     marks      (0.1.15.4) over each bot a name tag in its team colour that stays the same size on screen; a hit
                flashes the bot's parts white-hot for a moment (at most four times a second, softer under reduced motion).
                Lite: the same, with a smaller tag texture. (The floor ring under each bot went in 0.1.16.1, Kelbo: it hid
                the contact between the bots.)
   Lite: flat materials, no shadows, no spotlight (the pool of light is painted into the floor). ---- */
const AR={F:null,g:null,U:4,bots:[],haz:[],kit:null,kitMats:[],pitCover:null,pitOpenAt:null,cam:{x:0,z:0,d:9,shake:0},lights:null,hidden:false};
function arenaClear(){fxClear();for(const B of AR.bots)disposeClone(B.mesh);
  if(AR.g){V.scene.remove(AR.g);AR.g.traverse(o=>{if(o.userData.keep)return;if(o.geometry)o.geometry.dispose();if(o.material&&o.userData.own){if(o.material.map)o.material.map.dispose();o.material.dispose();}});}
  if(AR.lights){V.scene.remove(AR.lights);AR.lights.traverse(l=>{if(l.shadow&&l.shadow.map)l.shadow.dispose();});AR.lights=null;}   // the key light's shadow map is a GPU target
  for(const m of AR.kitMats||[])m.dispose();AR.kitMats=[];AR.kit=null;
  AR.g=null;AR.F=null;AR.bots=[];AR.haz=[];AR.pitCover=null;fxClear();}
/* the dressing scale: scene units per real metre for everything outside the walls (props, stands, the flat crowd), so they
   agree with each other. Real size (AR.U) where that is small enough, else capped, so a beetle arena (4 units a metre) isn't
   ringed by giants (0.1.21.1; the props used it alone from 0.1.21.0 and the people were drawn at about a third of it) */
const ARENA_PROP_UNITS=1.6;
/* the flat crowd: heads 0.23 m across on a band CROWD_M tall and CROWD_W wide per repeat (512 x 64 px, a head about 8 px) */
const CROWD_M=1.85,CROWD_W=14.8;
function crowdTex(){const c=document.createElement("canvas");c.width=512;c.height=64;const g=c.getContext("2d");
  g.fillStyle="#141311";g.fillRect(0,0,512,64);let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;   // fixed pattern, no Math.random
  for(let i=0;i<420;i++){const x=r()*512,y=14+r()*46,l=40+r()*60|0;g.fillStyle=`hsl(${r()*360|0},${10+r()*25|0}%,${l*0.4|0}%)`;g.beginPath();g.arc(x,y,3+r()*2,0,7);g.fill();}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.wrapS=THREE.RepeatWrapping;return t;}
function buildArena(F){
  arenaClear();const M=V.mats,lite=V.tier==="lite",U=AR.U=4/F.M.len,D=AR.D=Math.min(U,ARENA_PROP_UNITS),A=F.arena,H=A.half*U,g=new THREE.Group();
  const kit=AR.kit={walls:[],posts:[],crowd:[],pit:null,floor:null,grid:null,H};
  const X=x=>x*U,Z=y=>-y*U;   // sim (x, y) to scene (x, z)
  /* floor and grid */
  const deco=arenaDecal(F,U,H,lite);
  let fl;if(lite){const fm=new THREE.MeshLambertMaterial({map:deco});fl=new THREE.Mesh(new THREE.PlaneGeometry(2*H,2*H),fm);fl.userData.own=true;}   // the markings and the light are the floor's texture
  else fl=new THREE.Mesh(new THREE.PlaneGeometry(2*H,2*H),M.arenaFloor);
  fl.rotation.x=-Math.PI/2;fl.receiveShadow=!lite;g.add(fl);
  let grid=null;if(!lite){const dm=new THREE.MeshLambertMaterial({map:deco,transparent:true,premultipliedAlpha:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});   // Lambert: lit and shadowed, half the cost of a second PBR pass
    grid=new THREE.Mesh(new THREE.PlaneGeometry(2*H,2*H),dm);grid.rotation.x=-Math.PI/2;grid.position.y=0.003;grid.receiveShadow=true;grid.renderOrder=-1;grid.userData.own=true;g.add(grid);}   // before every other see-through thing
  kit.floor=fl;kit.grid=grid;
  /* the outside floor, so the walls don't float: darker than the arena, so the arena reads as the lit square */
  const out=new THREE.Mesh(new THREE.PlaneGeometry(60,60),M.arenaOut);out.rotation.x=-Math.PI/2;out.position.y=-0.01;g.add(out);kit.out=out;
  /* walls: a kerb all round and a glass screen; the camera looks from +z, so that screen is the faint one */
  const kh=0.35,sh=1.1,t=0.15;
  for(const [x,z,w,d,near] of [[0,-H-t/2,2*H+2*t,t,0],[0,H+t/2,2*H+2*t,t,1],[-H-t/2,0,t,2*H,0],[H+t/2,0,t,2*H,0]]){
    const k=new THREE.Mesh(new THREE.BoxGeometry(w,kh,d),M.wall);k.position.set(x,kh/2,z);k.castShadow=!lite;k.receiveShadow=!lite;g.add(k);
    kit.walls.push({k,x,z,len:Math.max(w,d),along:w>d?"x":"z",near});
    if(!near){const s=new THREE.Mesh(new THREE.BoxGeometry(w,sh,d*0.3),M.glass);s.position.set(x,kh+sh/2,z);s.renderOrder=2;g.add(s);}
    if(!near){const rail=new THREE.Mesh(new THREE.BoxGeometry(w,0.05,d),M.wall);rail.position.set(x,kh+sh,z);g.add(rail);}}
  /* posts at the corners carry the hazard lights */
  AR.lamps=[];for(const sx of [-1,1])for(const sz of [-1,1]){const ph=sz>0?kh+0.1:kh+sh+0.2,p=new THREE.Mesh(new THREE.BoxGeometry(0.2,ph,0.2),M.wall);p.position.set(sx*(H+t/2),ph/2,sz*(H+t/2));g.add(p);   // the near posts stop at the kerb
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.12,0.24),M.haz.clone());lamp.userData.own=true;lamp.position.set(sx*(H+t/2),ph+0.06,sz*(H+t/2));g.add(lamp);AR.lamps.push(lamp);kit.posts.push({p,lamp,near:sz>0});}
  /* the crowd: Full and Ultra */
  /* the crowd: Full and Ultra. People standing behind a barrier, heads at real height in the dressing scale; with the stands
     (vis/props.js kitBuild) it moves back and up behind the top row */
  if(!lite){const tex=crowdTex(),w=2*H+6,o=H+3;tex.repeat.set(w/(CROWD_W*D),1);const cm=new THREE.MeshBasicMaterial({map:tex,fog:true});cm.userData={};
    for(const [x,z,ry] of [[0,-o,0],[-o,0,Math.PI/2],[o,0,-Math.PI/2]]){const c=new THREE.Mesh(new THREE.PlaneGeometry(w,CROWD_M*D),cm);c.position.set(x,(0.25+CROWD_M/2)*D,z);c.rotation.y=ry;c.userData.own=true;g.add(c);kit.crowd.push(c);}}
  /* the pit, under a cover until it opens */
  AR.pitCover=null;if(A.pit){const r=A.pit.rect,w=X(r[2])-X(r[0]),d=Z(r[1])-Z(r[3]),cx=X((r[0]+r[2])/2),cz=Z((r[1]+r[3])/2);
    const hole=new THREE.Mesh(new THREE.PlaneGeometry(w,d),M.pit);hole.rotation.x=-Math.PI/2;hole.position.set(cx,0.012,cz);g.add(hole);
    const cov=new THREE.Mesh(new THREE.BoxGeometry(w,0.03,d),M.hatch);cov.position.set(cx,0.03,cz);cov.receiveShadow=!lite;g.add(cov);
    AR.pitCover={m:cov,x0:cx,w};kit.pit={hole,cx,cz,w,d};}   // its striped edge is painted on the floor (arenaDecal)
  /* hazards */
  AR.haz=A.haz.map(h=>{if(h.type==="pusher"){const r=h.rect,w=X(r[2])-X(r[0]),d=Z(r[1])-Z(r[3]);
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,kh*0.9,d),M.haz.clone());m.userData.own=true;m.position.set(X((r[0]+r[2])/2),kh*0.45,Z((r[1]+r[3])/2));m.castShadow=!lite;g.add(m);
      return{h,m,base:m.position.clone(),n:[h.n[0],-h.n[1]],reach:Math.min(w,d)*0.8,w,d,ht:kh*0.9};}
    const R=h.rM*U,m=new THREE.Mesh(new THREE.CylinderGeometry(R,R,0.03,lite?24:40),M.haz.clone());m.userData.own=true;m.position.set(X(h.at[0]),0.016,Z(h.at[1]));g.add(m);
    const bar=new THREE.Mesh(new THREE.BoxGeometry(R*1.8,0.04,R*0.25),M.steel);bar.position.y=0.03;m.add(bar);
    return{h,m,R,bar};});
  /* bots */
  AR.bots=F.bots.map(o=>{const team=o.team!=null?o.team:o.i,mesh=botMesh(o.b,team,o.i===0?V.paint:null,o.livery||null);g.add(mesh);mesh.scale.setScalar(U);
    const B={o,mesh,flipT:-9,shots:o.wp.shots,fall:0,inv:o.inverted?1:0,wheelA:0,armA:0,flash:0,flashT:-1e9};
    if(!o.mini){B.tag=botTag(o.name,team,lite,o.livery);g.add(B.tag);}
    return B;});
  /* lights for the arena: a soft sky, one key light (shadows on Full and Ultra), a warm rim */
  const L=new THREE.Group();L.add(new THREE.HemisphereLight(0xc4ccd6,0x1a1816,lite?.85:.34));
  const key=new THREE.DirectionalLight(0xeef3fa,lite?1.0:1.1);key.position.set(-H*0.6,H*2.2,H*0.9);
  if(!lite){key.castShadow=true;key.shadow.mapSize.set(1024,1024);const c=key.shadow.camera;c.left=c.bottom=-H-1;c.right=c.top=H+1;c.near=1;c.far=H*5;key.shadow.bias=-.0008;key.shadow.radius=2;}
  L.add(key);const rim=new THREE.DirectionalLight(0xffd2b8,.35);rim.position.set(H,H*0.6,-H*1.5);L.add(rim);
  /* Full and Ultra: the rig over the arena, a warm white spot that lights the square and lets the floor round it fall away */
  if(!lite){const sp=new THREE.SpotLight(0xfff1df,1.25,0,Math.atan(1.25/2.6),0.55,0);sp.position.set(0,H*2.6,0);sp.target.position.set(0,0,0);L.add(sp,sp.target);}
  AR.lights=L;AR.g=g;AR.F=F;AR.pitOpenAt=null;
  AR.cam={x:0,z:0,d:H*3,shake:0};
  V.scene.add(g,L);propArena(F);return g;}

const botR=o=>0.5*Math.hypot(o.b.widthM,o.b.lengthM);   // the body's half diagonal (o.rad reaches out to the weapon)
/* a name tag over a bot: a sprite with the name on a dark pill and a team-coloured dot (the team's badge with a livery,
   0.1.24); it keeps its size on screen */
function botTag(name,team,lite,liv){const W=lite?192:256,Hh=W/4,c=document.createElement("canvas");c.width=W;c.height=Hh;const x=c.getContext("2d"),k=W/256;
  const fam=getComputedStyle(document.documentElement).getPropertyValue("--font")||"sans-serif";x.font=`600 ${30*k}px ${fam}`;
  let t=String(name||"");while(t.length>3&&x.measureText(t).width>W-64*k)t=t.slice(0,-2).trimEnd()+"…";   // shortened to fit
  const tw=x.measureText(t).width,pw=Math.min(W-4*k,tw+56*k),x0=(W-pw)/2,r=Hh*0.42;
  x.fillStyle="rgba(20,20,19,0.82)";x.beginPath();x.moveTo(x0+r,4*k);x.arcTo(x0+pw,4*k,x0+pw,Hh-4*k,r);x.arcTo(x0+pw,Hh-4*k,x0,Hh-4*k,r);x.arcTo(x0,Hh-4*k,x0,4*k,r);x.arcTo(x0,4*k,x0+pw,4*k,r);x.fill();
  if(liv)badgeDraw(x,liv,x0+21*k,Hh/2,14*k);else{x.fillStyle="#"+BOT_TEAM[team%BOT_TEAM.length].toString(16).padStart(6,"0");x.beginPath();x.arc(x0+22*k,Hh/2,8*k,0,7);x.fill();}
  x.fillStyle="#F2EFE8";x.textBaseline="middle";x.fillText(t,x0+38*k,Hh/2+1*k);
  const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true}));
  sp.center.set(0.5,0);sp.renderOrder=6;sp.userData.own=true;sp.userData.asp=W/Hh;return sp;}
const FLASH_COL=new THREE.Color(0xfff1d6).convertSRGBToLinear();
/* the floor markings as a canvas texture over the arena square (S px a side, the top row the far wall): a grid every 30 cm
   (beetle scale), a border line, a centre circle, hatched bands where the wall rams reach, a ring round each floor spinner
   and a striped edge round the pit. Lite gets an opaque texture with the plate's colour and a soft pool of light painted
   in; Full and Ultra a see-through decal over the photo plate, with the pit cut out so the kit's real hole shows. */
function arenaDecal(F,U,H,lite){const S=lite?512:1024,c=document.createElement("canvas");c.width=c.height=S;const g=c.getContext("2d"),A=F.arena,k=S/(2*H);
  const px=x=>(x*U+H)*k,py=y=>(-y*U+H)*k,u=v=>v*U*k;   // sim metres to canvas px
  if(lite){const r=g.createRadialGradient(S/2,S/2,S*0.05,S/2,S/2,S*0.72);r.addColorStop(0,"#45433d");r.addColorStop(.6,"#35332f");r.addColorStop(1,"#1f1e1b");g.fillStyle=r;g.fillRect(0,0,S,S);}
  const step=0.3*4*k,lw=Math.max(1,S/512);   // the grid
  g.strokeStyle=lite?"rgba(120,114,100,.32)":"rgba(170,162,145,.22)";g.lineWidth=lw;g.beginPath();
  for(let v=step;v<S-1;v+=step){g.moveTo(v,0);g.lineTo(v,S);g.moveTo(0,v);g.lineTo(S,v);}g.stroke();
  const line=lite?"rgba(226,220,206,.5)":"rgba(226,220,206,.55)";g.strokeStyle=line;   // the border, a little in from the kerb, and the centre circle
  const ins=0.18*4*k;g.lineWidth=lw*3;g.strokeRect(ins,ins,S-2*ins,S-2*ins);
  g.lineWidth=lw*2.5;g.beginPath();g.arc(S/2,S/2,Math.min(S*0.14,u(A.half*0.28)),0,7);g.stroke();
  g.beginPath();g.moveTo(S/2-lw*12,S/2);g.lineTo(S/2+lw*12,S/2);g.moveTo(S/2,S/2-lw*12);g.lineTo(S/2,S/2+lw*12);g.stroke();
  const hatch=(x0,y0,w,h,col,wid)=>{g.save();g.beginPath();g.rect(x0,y0,w,h);g.clip();g.strokeStyle=col;g.lineWidth=wid;g.beginPath();
    for(let t=-h;t<w+h;t+=wid*2.6){g.moveTo(x0+t,y0+h);g.lineTo(x0+t+h,y0);}g.stroke();g.restore();};
  for(const h of A.haz){if(h.type==="pusher"){const r=h.rect,reach=Math.min(r[2]-r[0],r[3]-r[1])*0.8*1.6;   // the band a ram reaches into
      let x0=r[0],x1=r[2],y0=r[1],y1=r[3];if(h.n[0]>0){x0=r[2];x1=r[2]+reach;}else if(h.n[0]<0){x1=r[0];x0=r[0]-reach;}else if(h.n[1]>0){y0=r[3];y1=r[3]+reach;}else{y1=r[1];y0=r[1]-reach;}
      const X0=px(x0),X1=px(x1),Y0=py(y1),Y1=py(y0);hatch(X0,Y0,X1-X0,Y1-Y0,"rgba(226,169,59,.32)",lw*5);g.strokeStyle="rgba(226,169,59,.55)";g.lineWidth=lw*2;g.strokeRect(X0,Y0,X1-X0,Y1-Y0);}
    else{g.strokeStyle="rgba(226,169,59,.6)";g.lineWidth=lw*4;g.setLineDash([lw*10,lw*7]);g.beginPath();g.arc(px(h.at[0]),py(h.at[1]),u(h.rM)*1.35,0,7);g.stroke();g.setLineDash([]);}}
  if(A.pit){const r=A.pit.rect,X0=px(r[0]),X1=px(r[2]),Y0=py(r[3]),Y1=py(r[1]),b=0.06*4*k;   // the pit: striped edge, the hole cut out on Full
    g.save();g.beginPath();g.rect(X0-b,Y0-b,X1-X0+2*b,Y1-Y0+2*b);g.clip();g.fillStyle="#e2a93b";g.fillRect(X0-b,Y0-b,X1-X0+2*b,Y1-Y0+2*b);
    g.strokeStyle="#141311";g.lineWidth=b*0.7;g.beginPath();const D=Y1-Y0+2*b;for(let t=-D;t<X1-X0+2*b+D;t+=b*1.6){g.moveTo(X0-b+t,Y1+b);g.lineTo(X0-b+t+D,Y0-b);}g.stroke();g.restore();
    if(lite){g.fillStyle="#050505";g.fillRect(X0,Y0,X1-X0,Y1-Y0);}else g.clearRect(X0,Y0,X1-X0,Y1-Y0);}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.premultiplyAlpha=!lite;t.anisotropy=lite?1:Math.min(8,V.r.capabilities.getMaxAnisotropy());return t;}
/* lamps and hazards: amber while they fire, and glowing on Full and Ultra (Lite keeps the plain colour change) */
function hazLit(m,on){m.color.copy(on?V.mats.hazOn.color:V.mats.haz.color);if(m.emissive&&V.tier!=="lite")m.emissive.copy(V.mats.hazOn.color).multiplyScalar(on?.7:0);}
/* the same fight again from another moment (a replay seek: the app re-runs the sim from the start): keep the scene, point
   it at the new F. Only when the arena and the bots are the same; otherwise false and the caller builds afresh. */
function arenaRebind(F){if(!AR.F||!AR.g||AR.F.seed!==F.seed||AR.F.arena.id!==F.arena.id||AR.F.bots.length!==F.bots.length)return false;
  AR.F=F;AR.pitOpenAt=null;AR.bots.forEach((B,i)=>{const o=F.bots[i];B.o=o;B.fall=0;B.inv=o.inverted?1:0;B.shots=o.wp.shots;B.flipT=-9;B.mesh.visible=true;wearClear(B);});
  for(const c of FX.chunks){c.m.parent&&c.m.parent.remove(c.m);c.m.material.dispose();}FX.chunks=[];
  for(const n of FX.nums)fxNumDrop(n);FX.nums=[];return true;}
/* each frame: put the bots where the sim says, animate weapons, hazards and the pit, move the camera */
function arenaTick(dt,now){const F=AR.F;if(!F||!AR.g)return;const U=AR.U;
  for(const B of AR.bots){const o=B.o,m=B.mesh,u=m.userData;
    /* falling into the pit: sink and fade out over half a second */
    botMarks(B,dt);
    if(o.out==="pit"){B.fall=Math.min(1,B.fall+dt*2);m.position.y=-B.fall*3;m.visible=B.fall<1;continue;}
    B.inv+=((o.inverted?1:0)-B.inv)*Math.min(1,dt*10);   // roll over smoothly when the sim flips it
    m.position.set(o.x*U,(o.z||0)*U+B.inv*(u.H||0.05)*U,-o.y*U);
    m.rotation.set(0,o.h-Math.PI/2,0);m.rotateZ(B.inv*Math.PI);
    if(o.held!=null)m.rotateX(0.35);else if(o.under)m.rotateX(0.12);
    /* wheels turn with speed */
    const sp=(Math.cos(o.h)*o.vx+Math.sin(o.h)*o.vy);B.wheelA-=sp*dt/(0.028*o.M.len);for(const w of u.wheels)if(w.geometry.type==="CylinderGeometry")w.rotation.x=B.wheelA;
    /* the weapon */
    const W=o.b.weapon;
    if(u.spin){const r=Math.min(o.wp.om,45);u.spin.rotation[u.spin.userData.axis]+=r*dt*(u.spin.userData.axis==="x"?-1:1);
      if(u.blur)u.blur.material.opacity=o.fx&&o.fx.weaponOk===false?0:0.45*Math.min(1,o.wp.om/(W.omega||1));
      u.spin.visible=!(o.fx&&o.fx.weaponOk===false&&o.st.parts.weapon<=0);}
    if(u.flip){if(o.wp.shots<B.shots)B.flipT=now;B.shots=o.wp.shots;const k=Math.max(0,1-(now-B.flipT)/350);u.flip.rotation.x=1.1*Math.sin(Math.min(1,k*1.4)*Math.PI/2);}
    if(u.forks){const want=o.wp.held!=null?0.45:0;u.forks.rotation.x+=(want-u.forks.rotation.x)*Math.min(1,dt*8);}
    if(u.arm){const ph=o.wp.phase,S=W.swingS||0.7,t=o.wp.t||0;let a=0.9;
      if(ph===1)a=0.9-1.25*Math.min(1,t/(W.type==="hammer"?S/2:S));else if(ph===2)a=-0.35+1.25*Math.min(1,t/0.5);
      if(W.type==="crusher")a=a*0.4;u.arm.rotation.x=a;}}
  /* hazards: lit while they fire; a pusher shoves out, a floor spinner spins */
  let any=false;
  AR.haz.forEach((z,i)=>{const s=F.hz[i],on=s&&F.t<s.until;any=any||on;hazLit(z.m.material,on);if(z.glow)hazLit(z.glow,on);
    if(z.h.type==="pusher"){const k=on?Math.min(1,(z.h.activeS-(s.until-F.t))/0.08):0;z.m.position.set(z.base.x+z.n[0]*z.reach*k,z.base.y,z.base.z+z.n[1]*z.reach*k);}
    else if(on)z.m.rotation.y+=dt*18;});
  for(const l of AR.lamps||[])hazLit(l.material,any);
  /* the pit cover slides off when it opens */
  if(AR.pitCover){const open=F.arena.pit&&F.t>=F.arena.pit.openS;if(open&&AR.pitOpenAt==null)AR.pitOpenAt=now;
    const k=AR.pitOpenAt==null?0:Math.min(1,(now-AR.pitOpenAt)/600);AR.pitCover.m.position.x=AR.pitCover.x0+AR.pitCover.w*1.05*k;AR.pitCover.m.visible=k<1;}
  /* camera: frame the box round the bots still in it (minibots don't count), in the band the HUD leaves clear */
  let live=AR.bots.filter(B=>!B.o.out&&!B.o.mini);if(!live.length)live=AR.bots.filter(B=>!B.o.out);
  const H=F.arena.half*U,pitch=0.98,sp=Math.sin(pitch),c=AR.cam;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,rM=0.3;
  for(const B of live){const x=B.o.x*U,z=-B.o.y*U,r=botR(B.o)*U*1.25;rM=Math.max(rM,r);x0=Math.min(x0,x-r);x1=Math.max(x1,x+r);z0=Math.min(z0,z-r);z1=Math.max(z1,z+r);}
  if(!live.length){x0=z0=-H;x1=z1=H;}
  const pad=rM*1.1,minS=Math.max(2.2,rM*4.6),maxS=2*H+1.5,spX=Math.max(minS,Math.min(maxS,x1-x0+2*pad)),spZ=Math.max(minS*0.8,Math.min(maxS,z1-z0+2*pad));
  const lim=H*0.95;let cx=Math.max(-lim,Math.min(lim,(x0+x1)/2)),cz=Math.max(-lim,Math.min(lim,(z0+z1)/2));
  const vh=V.h||1,vw=V.w||1,ins=V.run.inset||{},it=Math.max(0,ins.t||0),ib=Math.max(0,ins.b||0),fh=Math.max(0.4,(vh-it-ib)/vh);
  const tH=Math.tan(V.cam.fov*Math.PI/360),tW=tH*vw/vh,zoom=Math.max(0.5,Math.min(2,V.run.zoom||1));
  const wantD=Math.max(spX/2/tW,spZ*1.15*sp/2/(tH*fh))*zoom;   // 1.15: the near side looks bigger in perspective
  const kd=Math.min(1,dt*(wantD>c.d?4:1.6)),k=Math.min(1,dt*4);   // pull out quickly when they split, close in gently
  c.d+=(wantD-c.d)*kd;
  cz-=((it-ib)/vh)*c.d*tH/sp;   // aim past the middle so the bots sit in the clear band, not under the cards
  c.x+=(cx-c.x)*k;c.z+=(cz-c.z)*k;
  const d=c.d;
  let sx=0,sy=0;if(c.shake>0&&!V.run.reduce){sx=(Math.sin(now*0.091)+Math.sin(now*0.137))*c.shake;sy=(Math.cos(now*0.083)+Math.sin(now*0.121))*c.shake;}
  c.shake=Math.max(0,c.shake-dt*c.shake*6-dt*0.01);
  /* name tags keep their size on screen: 22 CSS px tall (18 in a rumble of more than two) */
  const tagPx=AR.bots.filter(B=>B.tag).length>2?18:22,tagS=tagPx/vh*2*tH;for(const B of AR.bots)if(B.tag)B.tag.scale.set(tagS*B.tag.userData.asp,tagS,1);
  V.cam.position.set(c.x+sx,Math.sin(pitch)*d+sy,c.z+Math.cos(pitch)*d);V.cam.lookAt(c.x+sx*0.5,0,c.z);}

/* a bot's tag and hit flash, each frame */
function botMarks(B,dt){const o=B.o,U=AR.U,m=B.mesh,gone=!!o.out;wearTick(B,dt);
  if(B.tag){B.tag.visible=!gone;if(!gone)B.tag.position.set(o.x*U,((o.z||0)+(m.userData.H||0.05)*1.3)*U+0.3,-o.y*U);}
  if(B.flash>0||B.flashOn){B.flash=Math.max(0,B.flash-dt*6);B.flashOn=B.flash>0;const parts=m.userData.parts||{};
    const ks=B.flashKeys;
    for(const key in parts){const on=B.flash>0&&(!ks||ks.includes(key));for(const p of parts[key]){const u=p.userData;if(!u.base)continue;p.material.color.copy(u.base).multiplyScalar(u.dmul||1);if(on)p.material.color.lerp(FLASH_COL,B.flash*0.7);}}}}
/* a screen point (CSS px in the canvas) to sim metres on the floor, or null (tactical controls) */
function arenaPick(px,py){if(!AR.F||!V.w)return null;const v=new THREE.Vector3(px/V.w*2-1,-(py/V.h)*2+1,0.5).unproject(V.cam),o=V.cam.position;
  const dir=v.sub(o).normalize();if(dir.y>=-1e-4)return null;const t=-o.y/dir.y,x=o.x+dir.x*t,z=o.z+dir.z*t;return{x:x/AR.U,y:-z/AR.U};}
