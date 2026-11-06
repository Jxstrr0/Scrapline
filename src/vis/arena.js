/* ---- vis/arena.js: the arena view. setFight(F) builds the scene from a SCRAP_SIM fight the app passes in (F.arena:
   floor, walls, the pit, wall pushers and floor spinners; F.bots: a mesh per bot from its build) and each frame draws the
   bots where the sim has them. The vis reads F; it never steps it. Units: the scene is in "beetle metres x 4" (AU per sim
   metre is 4 / the class's length scale), so every class fills the screen the same way.
     floor      dark plate with a faint grid every 30 cm (beetle scale)
     walls      steel kerbs with a glass screen on top; the screen nearest the camera is see-through
     pit        a black hole under a hatched cover that slides away when it opens
     pusher     a slab in the wall that shoves out and lights amber while it fires
     spinner    a disc in the floor that spins and lights while it fires
     crowd      a cheap canvas texture of heads beyond the walls (Full and Ultra only; Lite gets a plain dark backdrop)
     props      lights, crates and the like beyond the walls (Full and Ultra only, vis/props.js)
   Camera: tilted top-down (about 55 degrees), following the middle of the bots still in it, pulling back as they spread;
   it shakes on hits (fx.js), never under reduced motion. Lite: flat materials, no shadows. ---- */
const AR={F:null,g:null,U:4,bots:[],haz:[],pitCover:null,pitOpenAt:null,cam:{x:0,z:0,d:9,shake:0},lights:null,hidden:false};
function arenaClear(){fxClear();for(const B of AR.bots)disposeClone(B.mesh);
  if(AR.g){V.scene.remove(AR.g);AR.g.traverse(o=>{if(o.userData.keep)return;if(o.geometry)o.geometry.dispose();if(o.material&&o.userData.own){if(o.material.map)o.material.map.dispose();o.material.dispose();}});}
  if(AR.lights){V.scene.remove(AR.lights);AR.lights.traverse(l=>{if(l.shadow&&l.shadow.map)l.shadow.dispose();});AR.lights=null;}   // the key light's shadow map is a GPU target
  AR.g=null;AR.F=null;AR.bots=[];AR.haz=[];AR.pitCover=null;fxClear();}
function crowdTex(){const c=document.createElement("canvas");c.width=512;c.height=64;const g=c.getContext("2d");
  g.fillStyle="#141311";g.fillRect(0,0,512,64);let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;   // fixed pattern, no Math.random
  for(let i=0;i<420;i++){const x=r()*512,y=14+r()*46,l=40+r()*60|0;g.fillStyle=`hsl(${r()*360|0},${10+r()*25|0}%,${l*0.4|0}%)`;g.beginPath();g.arc(x,y,3+r()*2,0,7);g.fill();}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.wrapS=THREE.RepeatWrapping;return t;}
function buildArena(F){
  arenaClear();const M=V.mats,lite=V.tier==="lite",U=AR.U=4/F.M.len,A=F.arena,H=A.half*U,g=new THREE.Group();
  const X=x=>x*U,Z=y=>-y*U;   // sim (x, y) to scene (x, z)
  /* floor and grid */
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*H,2*H),M.arenaFloor);fl.rotation.x=-Math.PI/2;fl.receiveShadow=!lite;g.add(fl);
  const step=0.3*4,pts=[];for(let v=-H+step;v<H-1e-6;v+=step){pts.push(v,0.002,-H,v,0.002,H,-H,0.002,v,H,0.002,v);}
  const gg=new THREE.BufferGeometry();gg.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));
  const gm=new THREE.LineBasicMaterial({color:new THREE.Color(0x3a3833).convertSRGBToLinear()});const grid=new THREE.LineSegments(gg,gm);grid.userData.own=true;g.add(grid);
  /* the outside floor, so the walls don't float */
  const out=new THREE.Mesh(new THREE.PlaneGeometry(60,60),M.floor);out.rotation.x=-Math.PI/2;out.position.y=-0.01;g.add(out);
  /* walls: a kerb all round and a glass screen; the camera looks from +z, so that screen is the faint one */
  const kh=0.35,sh=1.1,t=0.15;
  for(const [x,z,w,d,near] of [[0,-H-t/2,2*H+2*t,t,0],[0,H+t/2,2*H+2*t,t,1],[-H-t/2,0,t,2*H,0],[H+t/2,0,t,2*H,0]]){
    const k=new THREE.Mesh(new THREE.BoxGeometry(w,kh,d),M.wall);k.position.set(x,kh/2,z);k.castShadow=!lite;k.receiveShadow=!lite;g.add(k);
    const s=new THREE.Mesh(new THREE.BoxGeometry(w,sh,d*0.3),near?M.glass:M.glass);s.position.set(x,kh+sh/2,z);s.renderOrder=2;if(!near)g.add(s);
    if(near){const rail=new THREE.Mesh(new THREE.BoxGeometry(w,0.05,d),M.wall);rail.position.set(x,kh+sh,z);g.add(rail);}
    else{const rail=new THREE.Mesh(new THREE.BoxGeometry(w,0.05,d),M.wall);rail.position.set(x,kh+sh,z);g.add(rail);}}
  /* posts at the corners carry the hazard lights */
  AR.lamps=[];for(const sx of [-1,1])for(const sz of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(0.2,kh+sh+0.2,0.2),M.wall);p.position.set(sx*(H+t/2),(kh+sh+0.2)/2,sz*(H+t/2));g.add(p);
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.12,0.24),M.haz.clone());lamp.userData.own=true;lamp.position.set(sx*(H+t/2),kh+sh+0.26,sz*(H+t/2));g.add(lamp);AR.lamps.push(lamp);}
  /* the crowd: Full and Ultra */
  if(!lite){const tex=crowdTex();tex.repeat.set(4,1);const cm=new THREE.MeshBasicMaterial({map:tex,fog:true});cm.userData={};
    for(const [x,z,ry] of [[0,-H-3,0],[-H-3,0,Math.PI/2],[H+3,0,-Math.PI/2]]){const c=new THREE.Mesh(new THREE.PlaneGeometry(2*H+6,2.2),cm);c.position.set(x,1.6,z);c.rotation.y=ry;c.userData.own=true;g.add(c);}}
  /* the pit, under a cover until it opens */
  AR.pitCover=null;if(A.pit){const r=A.pit.rect,w=X(r[2])-X(r[0]),d=Z(r[1])-Z(r[3]),cx=X((r[0]+r[2])/2),cz=Z((r[1]+r[3])/2);
    const hole=new THREE.Mesh(new THREE.PlaneGeometry(w,d),M.pit);hole.rotation.x=-Math.PI/2;hole.position.set(cx,0.012,cz);g.add(hole);
    const rim=new THREE.Mesh(new THREE.PlaneGeometry(w+0.12,d+0.12),M.hazOn);rim.rotation.x=-Math.PI/2;rim.position.set(cx,0.006,cz);g.add(rim);   // an amber edge round the hole
    const cov=new THREE.Mesh(new THREE.BoxGeometry(w,0.03,d),M.hatch);cov.position.set(cx,0.03,cz);cov.receiveShadow=!lite;g.add(cov);
    AR.pitCover={m:cov,x0:cx,w};}
  /* hazards */
  AR.haz=A.haz.map(h=>{if(h.type==="pusher"){const r=h.rect,w=X(r[2])-X(r[0]),d=Z(r[1])-Z(r[3]);
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,kh*0.9,d),M.haz.clone());m.userData.own=true;m.position.set(X((r[0]+r[2])/2),kh*0.45,Z((r[1]+r[3])/2));m.castShadow=!lite;g.add(m);
      return{h,m,base:m.position.clone(),n:[h.n[0],-h.n[1]],reach:Math.min(w,d)*0.8};}
    const R=h.rM*U,m=new THREE.Mesh(new THREE.CylinderGeometry(R,R,0.03,lite?24:40),M.haz.clone());m.userData.own=true;m.position.set(X(h.at[0]),0.016,Z(h.at[1]));g.add(m);
    const bar=new THREE.Mesh(new THREE.BoxGeometry(R*1.8,0.04,R*0.25),M.steel);bar.position.y=0.03;m.add(bar);
    return{h,m};});
  /* bots */
  AR.bots=F.bots.map(o=>{const mesh=botMesh(o.b,o.team!=null?o.team:o.i,o.i===0?V.paint:null);g.add(mesh);mesh.scale.setScalar(U);
    return{o,mesh,flipT:-9,shots:o.wp.shots,fall:0,inv:o.inverted?1:0,wheelA:0,armA:0};});
  /* lights for the arena: a soft sky, one key light (shadows on Full and Ultra), a warm rim */
  const L=new THREE.Group();L.add(new THREE.HemisphereLight(0xc4ccd6,0x1a1816,lite?.85:.5));
  const key=new THREE.DirectionalLight(0xeef3fa,lite?1.0:1.45);key.position.set(-H*0.6,H*2.2,H*0.9);
  if(!lite){key.castShadow=true;key.shadow.mapSize.set(1024,1024);const c=key.shadow.camera;c.left=c.bottom=-H-1;c.right=c.top=H+1;c.near=1;c.far=H*5;key.shadow.bias=-.0008;key.shadow.radius=2;}
  L.add(key);const rim=new THREE.DirectionalLight(0xffd2b8,.35);rim.position.set(H,H*0.6,-H*1.5);L.add(rim);
  AR.lights=L;AR.g=g;AR.F=F;AR.pitOpenAt=null;
  AR.cam={x:0,z:0,d:H*3,shake:0};
  V.scene.add(g,L);propArena(F);return g;}

/* the same fight again from another moment (a replay seek: the app re-runs the sim from the start): keep the scene, point
   it at the new F. Only when the arena and the bots are the same; otherwise false and the caller builds afresh. */
function arenaRebind(F){if(!AR.F||!AR.g||AR.F.seed!==F.seed||AR.F.arena.id!==F.arena.id||AR.F.bots.length!==F.bots.length)return false;
  AR.F=F;AR.pitOpenAt=null;AR.bots.forEach((B,i)=>{const o=F.bots[i];B.o=o;B.fall=0;B.inv=o.inverted?1:0;B.shots=o.wp.shots;B.flipT=-9;B.mesh.visible=true;});
  for(const c of FX.chunks){c.m.parent&&c.m.parent.remove(c.m);c.m.material.dispose();}FX.chunks=[];return true;}
/* each frame: put the bots where the sim says, animate weapons, hazards and the pit, move the camera */
function arenaTick(dt,now){const F=AR.F;if(!F||!AR.g)return;const U=AR.U;
  for(const B of AR.bots){const o=B.o,m=B.mesh,u=m.userData;
    /* falling into the pit: sink and fade out over half a second */
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
  AR.haz.forEach((z,i)=>{const s=F.hz[i],on=s&&F.t<s.until;any=any||on;z.m.material.color.copy(on?V.mats.hazOn.color:V.mats.haz.color);
    if(z.h.type==="pusher"){const k=on?Math.min(1,(z.h.activeS-(s.until-F.t))/0.08):0;z.m.position.set(z.base.x+z.n[0]*z.reach*k,z.base.y,z.base.z+z.n[1]*z.reach*k);}
    else if(on)z.m.rotation.y+=dt*18;});
  for(const l of AR.lamps||[])l.material.color.copy(any?V.mats.hazOn.color:V.mats.haz.color);
  /* the pit cover slides off when it opens */
  if(AR.pitCover){const open=F.arena.pit&&F.t>=F.arena.pit.openS;if(open&&AR.pitOpenAt==null)AR.pitOpenAt=now;
    const k=AR.pitOpenAt==null?0:Math.min(1,(now-AR.pitOpenAt)/600);AR.pitCover.m.position.x=AR.pitCover.x0+AR.pitCover.w*1.05*k;AR.pitCover.m.visible=k<1;}
  /* camera: the middle of the bots still in it */
  const live=AR.bots.filter(B=>!B.o.out);let cx=0,cz=0,spread=0;
  if(live.length){for(const B of live){cx+=B.o.x*U;cz+=-B.o.y*U;}cx/=live.length;cz/=live.length;for(const B of live)spread=Math.max(spread,Math.hypot(B.o.x*U-cx,-B.o.y*U-cz));}
  const H=F.arena.half*U,lim=H*0.45;cx=Math.max(-lim,Math.min(lim,cx));cz=Math.max(-lim,Math.min(lim,cz));
  /* frame a span that holds both bots with room to spare (at least 5 units, at most the whole arena), across the narrower
     side of the screen: a tall phone stands further back */
  const span=Math.max(5,Math.min(2*H+1.5,spread*2.2+3.5)),tH=Math.tan(V.cam.fov*Math.PI/360),tW=tH*(V.w&&V.h?V.w/V.h:1);
  const wantD=Math.max(span/2/tW,span*0.85/2/tH),c=AR.cam,k=Math.min(1,dt*3);
  c.x+=(cx-c.x)*k;c.z+=(cz-c.z)*k;c.d+=(wantD-c.d)*k;
  const pitch=0.98,d=c.d;
  let sx=0,sy=0;if(c.shake>0&&!V.run.reduce){sx=(Math.sin(now*0.091)+Math.sin(now*0.137))*c.shake;sy=(Math.cos(now*0.083)+Math.sin(now*0.121))*c.shake;}
  c.shake=Math.max(0,c.shake-dt*c.shake*6-dt*0.01);
  V.cam.position.set(c.x+sx,Math.sin(pitch)*d+sy,c.z+Math.cos(pitch)*d);V.cam.lookAt(c.x+sx*0.5,0,c.z);}

/* a screen point (CSS px in the canvas) to sim metres on the floor, or null (tactical controls) */
function arenaPick(px,py){if(!AR.F||!V.w)return null;const v=new THREE.Vector3(px/V.w*2-1,-(py/V.h)*2+1,0.5).unproject(V.cam),o=V.cam.position;
  const dir=v.sub(o).normalize();if(dir.y>=-1e-4)return null;const t=-o.y/dir.y,x=o.x+dir.x*t,z=o.z+dir.z*t;return{x:x/AR.U,y:-z/AR.U};}
