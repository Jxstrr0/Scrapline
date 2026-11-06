/* ---- vis/fx.js: hit feedback in the arena. The app passes the sim's fx events in (SCRAP_VIS.fx([...]), from F.fxq) plus
   a "part" event when a part is destroyed; energies are divided by the class's mass multiplier, so a beetle and a
   heavyweight hit of the same weight look alike.
     sparks   one pool of points (Lite 90, Full and Ultra 260); a hit throws 4 + energy-scaled sparks, white-hot to amber,
              falling under gravity. On Ultra they are bright enough for the bloom to catch.
     parts    a destroyed part's mesh is copied and flung off, spinning, then fades (at most 6 in the air)
     smoke    a bot whose battery smokes trails grey puffs (Lite: fewer, larger)
     shake    the camera shakes in proportion to the hit (none under reduced motion: arena.js)
   Particles use no Math.random either: a small seeded generator, so a replay looks the same. ---- */
const FX={pts:null,n:0,pos:null,vel:null,life:null,chunks:[],puffs:[],seed:12345,smokeT:0};
const fxR=()=>(FX.seed=(FX.seed*16807)%2147483647)/2147483647;
function fxInit(){fxClear();const lite=V.tier==="lite",n=FX.n=lite?90:260;
  FX.pos=new Float32Array(n*3);FX.vel=new Float32Array(n*3);FX.life=new Float32Array(n);
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(FX.pos,3));
  const col=new Float32Array(n*3);g.setAttribute("color",new THREE.BufferAttribute(col,3));
  const m=V.mats.spark.clone();m.vertexColors=true;m.userData={};
  FX.pts=new THREE.Points(g,m);FX.pts.frustumCulled=false;FX.pts.userData.own=true;FX.pts.renderOrder=3;
  for(let i=0;i<n;i++)FX.pos[i*3+1]=-99;
  if(AR.g)AR.g.add(FX.pts);}
function fxClear(){for(const c of FX.chunks){if(c.m.parent)c.m.parent.remove(c.m);c.m.material.dispose();}for(const p of FX.puffs){p.m.parent&&p.m.parent.remove(p.m);p.m.geometry.dispose();}
  FX.chunks=[];FX.puffs=[];if(FX.pts){FX.pts.geometry.dispose();FX.pts.material.dispose();if(FX.pts.parent)FX.pts.parent.remove(FX.pts);FX.pts=null;}}
let fxNext=0;
function fxSpark(x,y,z,n,speed){if(!FX.pts)return;const col=FX.pts.geometry.attributes.color.array;
  for(let k=0;k<n;k++){const i=fxNext;fxNext=(fxNext+1)%FX.n;const a=fxR()*Math.PI*2,up=0.3+fxR()*0.9,s=speed*(0.4+fxR());
    FX.pos[i*3]=x;FX.pos[i*3+1]=y;FX.pos[i*3+2]=z;FX.vel[i*3]=Math.cos(a)*s;FX.vel[i*3+1]=up*s;FX.vel[i*3+2]=Math.sin(a)*s;FX.life[i]=0.25+fxR()*0.45;
    const hot=fxR();col[i*3]=1;col[i*3+1]=0.65+0.35*hot;col[i*3+2]=0.25+0.6*hot*hot;}
  FX.pts.geometry.attributes.color.needsUpdate=true;}
/* events in sim coordinates: {k, x, y, E, v}; part: {k:"part", v, key} */
function fxEvents(list){if(!AR.F||!AR.g)return;const F=AR.F,U=AR.U,mm=Math.max(F.M.mass,1e-6);
  for(const e of list){
    if(e.k==="part"){fxChunk(e.v,e.key);continue;}
    const En=(e.E||0)/mm,x=e.x*U,z=-e.y*U,big=e.k==="hit"||e.k==="flip"||e.k==="haz";
    if(e.k==="land"&&En<4)continue;
    const n=Math.min(big?40:14,Math.round((big?4:1)+En*(big?0.35:0.12)));if(n>0)fxSpark(x,big?0.25:0.08,z,n,1.5+Math.min(5,Math.sqrt(En)*0.5));
    AR.cam.shake=Math.min(0.45,AR.cam.shake+Math.min(0.3,En*(big?0.004:0.0015)));}}
/* a destroyed part flies off: a copy of its mesh in a world-space chunk */
function fxChunk(i,key){const B=AR.bots[i];if(!B)return;const ms=(B.mesh.userData.parts||{})[key];if(!ms||!ms.length)return;
  if(FX.chunks.length>=6){const c=FX.chunks.shift();c.m.parent&&c.m.parent.remove(c.m);c.m.material.dispose();}
  const src=ms[0],m=src.clone();m.material=src.material.clone();m.material.transparent=true;m.userData={own:true};
  B.mesh.updateMatrixWorld(true);src.getWorldPosition(m.position);src.getWorldQuaternion(m.quaternion);m.scale.setScalar(AR.U);
  AR.g.add(m);const a=fxR()*Math.PI*2;FX.chunks.push({m,v:[Math.cos(a)*2.5,3+fxR()*2,Math.sin(a)*2.5],w:[fxR()*12-6,fxR()*12-6,fxR()*12-6],t:0});
  fxSpark(m.position.x,m.position.y,m.position.z,12,3);}
function fxTick(dt){if(!FX.pts&&!FX.chunks.length)return;const g=-9;
  if(FX.pts){for(let i=0;i<FX.n;i++){if(FX.life[i]<=0)continue;FX.life[i]-=dt;const j=i*3;
      FX.vel[j+1]+=g*dt;FX.pos[j]+=FX.vel[j]*dt;FX.pos[j+1]+=FX.vel[j+1]*dt;FX.pos[j+2]+=FX.vel[j+2]*dt;
      if(FX.pos[j+1]<0.01){FX.pos[j+1]=0.01;FX.vel[j+1]*=-0.3;FX.vel[j]*=0.6;FX.vel[j+2]*=0.6;}
      if(FX.life[i]<=0)FX.pos[j+1]=-99;}
    FX.pts.geometry.attributes.position.needsUpdate=true;}
  for(const c of FX.chunks){c.t+=dt;c.v[1]+=g*dt;c.m.position.x+=c.v[0]*dt;c.m.position.y+=c.v[1]*dt;c.m.position.z+=c.v[2]*dt;
    if(c.m.position.y<0.05){c.m.position.y=0.05;c.v[1]*=-0.35;c.v[0]*=0.6;c.v[2]*=0.6;c.w=c.w.map(x=>x*0.6);}
    c.m.rotation.x+=c.w[0]*dt;c.m.rotation.y+=c.w[1]*dt;c.m.rotation.z+=c.w[2]*dt;if(c.t>2)c.m.material.opacity=Math.max(0,1-(c.t-2));}
  FX.chunks=FX.chunks.filter(c=>{if(c.t>3){c.m.parent&&c.m.parent.remove(c.m);c.m.material.dispose();return false;}return true;});
  /* smoke from a bot whose battery is smoking */
  FX.smokeT-=dt;if(AR.F&&FX.smokeT<=0){const lite=V.tier==="lite";FX.smokeT=lite?0.35:0.15;
    for(const B of AR.bots)if(B.o.flags&&B.o.flags.smoke&&!B.o.out&&FX.puffs.length<(lite?8:24)){const r=(lite?0.25:0.16)*(0.8+fxR()*0.5),m=new THREE.Mesh(new THREE.SphereGeometry(r,6,4),V.mats.smoke);
      m.position.set(B.mesh.position.x,B.mesh.position.y+0.4,B.mesh.position.z);AR.g.add(m);FX.puffs.push({m,t:0});}}
  for(const p of FX.puffs){p.t+=dt;p.m.position.y+=dt*0.8;p.m.scale.setScalar(1+p.t*1.5);}
  FX.puffs=FX.puffs.filter(p=>{if(p.t>1.6){p.m.parent&&p.m.parent.remove(p.m);p.m.geometry.dispose();return false;}return true;});}
