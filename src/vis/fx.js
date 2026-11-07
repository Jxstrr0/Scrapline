/* ---- vis/fx.js: hit feedback in the arena. The app passes the sim's fx events in (SCRAP_VIS.fx([...]), from F.fxq) plus
   a "part" event when a part is destroyed; energies are divided by the class's mass multiplier, so a beetle and a
   heavyweight hit of the same weight look alike.
     sparks   one pool of points (Lite 90, Full and Ultra 260); a hit throws 4 + energy-scaled sparks, white-hot to amber,
              falling under gravity. On Ultra they are bright enough for the bloom to catch.
     parts    a destroyed part's mesh is copied and flung off, spinning, then fades (at most 6 in the air)
     smoke    a bot whose battery smokes trails grey puffs (Lite: fewer, larger)
     shake    the camera shakes in proportion to the hit (none under reduced motion: arena.js)
     flash    the parts a hit damaged flash white-hot (the whole bot when none of them is drawn; arena.js botMarks)
     numbers  a hit or hazard floats the share of the bot's health it took ("-4%") up from its name tag, for a second
              (Lite: a smaller canvas, three at a time; reduced motion: it fades where it is instead of rising)
   Settings → Effects: Reduced (V.run.fxLow): a quarter of the sparks, no flying parts, at most three puffs of smoke
   (the numbers stay: they are information, not decoration).
   Particles use no Math.random either: a small seeded generator, so a replay looks the same. ---- */
const FX={pts:null,n:0,pos:null,vel:null,life:null,chunks:[],puffs:[],nums:[],seed:12345,smokeT:0};
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
  for(const n of FX.nums)fxNumDrop(n);
  FX.chunks=[];FX.puffs=[];FX.nums=[];if(FX.pts){FX.pts.geometry.dispose();FX.pts.material.dispose();if(FX.pts.parent)FX.pts.parent.remove(FX.pts);FX.pts=null;}}
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
    let n=Math.min(big?40:14,Math.round((big?4:1)+En*(big?0.35:0.12)));if(V.run.fxLow)n=Math.min(6,Math.ceil(n/4));if(n>0)fxSpark(x,big?0.25:0.08,z,n,1.5+Math.min(5,Math.sqrt(En)*0.5));
    AR.cam.shake=Math.min(0.45,AR.cam.shake+Math.min(0.3,En*(big?0.004:0.0015)));
    /* the bot that took it flashes (0.1.15.4): at most four times a second, three under reduced motion and softer */
    const B=big&&e.v!=null?AR.bots[e.v]:null,now=performance.now(),gap=V.run.reduce?330:250;
    if(B&&now-B.flashT>=gap){B.flashT=now;B.flash=Math.min(1,0.45+En/50)*(V.run.reduce?0.6:1);B.flashOn=true;
      const ps=B.mesh.userData.parts||{};B.flashKeys=e.keys&&e.keys.some(k=>ps[k])?e.keys:null;}
    if(B&&e.d>=0.005)fxNum(B,e.d);}}
/* a damage number: a sprite that keeps its size on screen (like the name tags), above the bot */
function fxNum(B,d){const lite=V.tier==="lite",max=lite?3:6;while(FX.nums.length>=max)fxNumDrop(FX.nums.shift());
  const W=lite?96:128,Hh=W/2,c=document.createElement("canvas");c.width=W;c.height=Hh;const x=c.getContext("2d"),k=W/128;
  const fam=FX.font||(FX.font=getComputedStyle(document.documentElement).getPropertyValue("--font")||"sans-serif"),t="\u2212"+Math.max(1,Math.round(d*100))+"%";
  x.font=`700 ${40*k}px ${fam}`;x.textAlign="center";x.textBaseline="middle";x.lineJoin="round";
  x.lineWidth=8*k;x.strokeStyle="rgba(20,20,19,0.9)";x.strokeText(t,W/2,Hh/2+2*k);
  x.fillStyle=d>=0.08?"#FF8F93":"#F2EFE8";x.fillText(t,W/2,Hh/2+2*k);   // a big bite in a light cool red (damage colours never go clay)
  const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true}));
  const side=FX.nums.filter(n=>n.B===B).length%2?0.85:0.15;   // two at once on one bot sit side by side
  sp.center.set(side,-1.1);sp.renderOrder=7;sp.userData.own=true;sp.userData.asp=W/Hh;AR.g.add(sp);FX.nums.push({sp,B,t:0});fxNumPlace(FX.nums[FX.nums.length-1]);}
function fxNumDrop(n){n.sp.parent&&n.sp.parent.remove(n.sp);n.sp.material.map.dispose();n.sp.material.dispose();}
function fxNumPlace(n){const B=n.B,U=AR.U,o=B.o,tH=Math.tan(V.cam.fov*Math.PI/360),s=(V.tier==="lite"?22:24)/(V.h||1)*2*tH;
  if(B.tag)n.sp.position.copy(B.tag.position);else n.sp.position.set(o.x*U,((o.z||0)+(B.mesh.userData.H||0.05)*1.3)*U+0.3,-o.y*U);
  n.sp.scale.set(s*n.sp.userData.asp,s,1);n.sp.center.y=-1.1-(V.run.reduce?0:n.t*1.6);n.sp.material.opacity=n.t<0.6?1:Math.max(0,1-(n.t-0.6)/0.4);}
/* a destroyed part flies off: a copy of its mesh in a world-space chunk */
function fxChunk(i,key){const B=AR.bots[i];if(!B||V.run.fxLow)return;const ms=(B.mesh.userData.parts||{})[key];if(!ms||!ms.length)return;
  if(FX.chunks.length>=6){const c=FX.chunks.shift();c.m.parent&&c.m.parent.remove(c.m);c.m.material.dispose();}
  const src=ms[0],m=src.clone();m.material=src.material.clone();m.material.transparent=true;m.userData={own:true};
  B.mesh.updateMatrixWorld(true);src.matrixWorld.decompose(m.position,m.quaternion,m.scale);   // its world size: a Blender shell is stretched to the bot
  AR.g.add(m);const a=fxR()*Math.PI*2;FX.chunks.push({m,v:[Math.cos(a)*2.5,3+fxR()*2,Math.sin(a)*2.5],w:[fxR()*12-6,fxR()*12-6,fxR()*12-6],t:0});
  fxSpark(m.position.x,m.position.y,m.position.z,12,3);}
function fxTick(dt){if(!FX.pts&&!FX.chunks.length&&!FX.nums.length)return;const g=-9;
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
    for(const B of AR.bots)if(B.o.flags&&B.o.flags.smoke&&!B.o.out&&FX.puffs.length<(V.run.fxLow?3:lite?8:24)){const r=(lite?0.25:0.16)*(0.8+fxR()*0.5),m=new THREE.Mesh(new THREE.SphereGeometry(r,6,4),V.mats.smoke);
      m.position.set(B.mesh.position.x,B.mesh.position.y+0.4,B.mesh.position.z);AR.g.add(m);FX.puffs.push({m,t:0});}}
  for(const p of FX.puffs){p.t+=dt;p.m.position.y+=dt*0.8;p.m.scale.setScalar(1+p.t*1.5);}
  FX.puffs=FX.puffs.filter(p=>{if(p.t>1.6){p.m.parent&&p.m.parent.remove(p.m);p.m.geometry.dispose();return false;}return true;});
  for(const n of FX.nums){n.t+=dt;fxNumPlace(n);}
  FX.nums=FX.nums.filter(n=>{if(n.t>=1||n.B.o.out){fxNumDrop(n);return false;}return true;});}
