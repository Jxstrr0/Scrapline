/* ---- vis/surface.js: the bots' surfaces on Full and Ultra (0.1.17.0). Every material a bot is drawn in gets a tiling set
   of maps made in code when the tier is built (no files; a seeded generator, so it looks the same every time):
     steel    brushed along the panel, a few scratches        alu     finer brushing the other way, brighter
     ti       brushed, with a faint heat tint                 plate   mill scale: dark blotches, pitting, flakes (AR500,
     disc     hardened steel with turning marks round the hub         hardened steel, the custom chassis)
     ply      plywood grain and growth rings                  hdpe    matte plastic with orange peel
     rubber   a tyre tread, blocks and grooves round the wheel paint   clay, team and sponsor colours: clearcoat over orange peel
   Each is a height field (tiling value noise and a few drawn marks) turned into a normal map and a roughness map, and an
   albedo that only varies round a light grey, so material.color keeps the coded colour (scaled by the albedo's mean) and
   the Lite palette holds on average. UVs: a bot's geometry is projected onto the plane its normal faces (uvProject, run
   over the finished mesh by buildBot), so every surface gets the same grain density, one tile every SURF.tile metres
   (0.09 m times the class scale); the Blender shells get it too (their geometry is copied per bot for it). The tyre keeps
   the cylinder's own UVs, scaled so the tread runs round the wheel; a disc keeps its cap UVs, so the turning marks centre
   on the hub. Lite never calls any of this: it keeps the Phong and Lambert materials of vis/core.js. The painted workshop
   reflection every PBR material mirrors (shopEnv) is here too. ---- */
const SURF={tex:[],tile:0,n:256,gen:0};
function surfRng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),a|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
/* adds one layer of tiling value noise (a cx by cy lattice of random values, smoothly interpolated) to the n x n field F */
function noiseAdd(F,n,cx,cy,amp,rnd){const L=new Float32Array(cx*cy);for(let i=0;i<L.length;i++)L[i]=rnd();
  for(let y=0;y<n;y++){const fy=y*cy/n,y0=fy|0,t=fy-y0,ty=t*t*(3-2*t),r0=y0*cx,r1=((y0+1)%cy)*cx;
    for(let x=0;x<n;x++){const fx=x*cx/n,x0=fx|0,s=fx-x0,tx=s*s*(3-2*s),x1=(x0+1)%cx;
      const top=L[r0+x0]+(L[r0+x1]-L[r0+x0])*tx,bot=L[r1+x0]+(L[r1+x1]-L[r1+x0])*tx;F[y*n+x]+=amp*(top+(bot-top)*ty);}}}
/* layered noise, mean .5: the lattice doubles and the amplitude drops by gain each octave. cx small and cy big gives streaks along u */
function fbm(n,cx,cy,oct,rnd,gain){const F=new Float32Array(n*n);let amp=1,sum=0;gain=gain||.5;
  for(let o=0;o<oct;o++){noiseAdd(F,n,Math.min(n,cx),Math.min(n,cy),amp,rnd);sum+=amp;amp*=gain;cx*=2;cy*=2;}
  for(let i=0;i<F.length;i++)F[i]/=sum;return F;}
/* k straight scratches cut into F: about len px long, round the angle a (± spread), soft edged, fading at both ends, wrapping */
function scratches(F,n,k,len,a0,spread,depth,rnd){for(let s=0;s<k;s++){const a=a0+(rnd()-.5)*spread,l=len*(.4+rnd()*.8),x0=rnd()*n,y0=rnd()*n,dx=Math.cos(a),dy=Math.sin(a),d=depth*(.5+rnd());
  for(let t=0;t<l;t++){const x=x0+dx*t,y=y0+dy*t,xi=Math.round(x),yi=Math.round(y),w=Math.sin(Math.PI*t/l);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const f=1-Math.hypot(xi+ox-x,yi+oy-y);if(f>0)F[((yi+oy+n)%n)*n+((xi+ox+n)%n)]-=d*w*f;}}}}
function clamp01(v){return v<0?0:v>1?1:v;}
function smooth(a,b,v){const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);}
/* the height field as a tangent-space normal map (OpenGL: green up), slopes scaled by k */
function normalPix(F,n,k){const out=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,
    dx=(F[y*n+(x+1)%n]-F[y*n+(x-1+n)%n])*k,dy=(F[((y+1)%n)*n+x]-F[((y-1+n)%n)*n+x])*k,l=Math.hypot(dx,dy,1);
    out[i*4]=128-127*dx/l;out[i*4+1]=128-127*dy/l;out[i*4+2]=128+127/l;out[i*4+3]=255;}return out;}
/* grey (roughness: three reads the green channel) and colour maps from a function of the pixel index */
function greyPix(n,fn){const out=new Uint8Array(n*n*4);for(let i=0;i<n*n;i++){const v=Math.round(clamp01(fn(i))*255);out[i*4]=out[i*4+1]=out[i*4+2]=v;out[i*4+3]=255;}return out;}
function rgbPix(n,fn){const out=new Uint8Array(n*n*4),c=[0,0,0];let sum=0;for(let i=0;i<n*n;i++){fn(i,c);for(let k=0;k<3;k++){const v=clamp01(c[k]);out[i*4+k]=Math.round(v*255);sum+=v;}out[i*4+3]=255;}
  out.avg=sum/(n*n*3);return out;}
/* every surface's maps as n x n pixels: {alb, nor, rough, ns (normal strength), avg (the albedo's mean, sRGB)}. Pure
   (no THREE, no DOM): it runs in a worker, and tools can run it in node. About half a second of work in all */
function surfFields(n){
  const R=surfRng(7),S={},U=i=>(i%n)/n,Vv=i=>((i/n)|0)/n;
  const brushed=(alongU,k,scratch)=>{const F=alongU?fbm(n,2,48,2,R):fbm(n,48,2,2,R),G=fbm(n,64,64,2,R);
    for(let i=0;i<F.length;i++)F[i]=F[i]*.8+G[i]*.2;scratches(F,n,k,n*.5,alongU?0:Math.PI/2,.6,scratch,R);return F;};
  const set=(key,F,ns,rough,alb)=>{const a=rgbPix(n,alb);S[key]={alb:a,nor:normalPix(F,n,ns),rough:greyPix(n,rough),ns:1,avg:a.avg};};
  /* steel: brushed along u, scratched. Troughs and scratches are rougher, crests shinier */
  { const F=brushed(true,18,.1);set("steel",F,1.2,i=>.32+(.5-F[i])*.15,(i,c)=>{c[0]=c[1]=c[2]=.86+(F[i]-.5)*.06;}); }
  /* aluminium: a finer brush the other way, brighter, few scratches */
  { const F=brushed(false,6,.06);set("alu",F,1,i=>.45+(.5-F[i])*.12,(i,c)=>{c[0]=c[1]=c[2]=.88+(F[i]-.5)*.05;}); }
  /* titanium: brushed, with slow warm and blue heat-tint patches */
  { const F=brushed(true,5,.06),T=fbm(n,3,3,2,R);set("ti",F,1,i=>.42+(.5-F[i])*.12,(i,c)=>{const g=.86+(F[i]-.5)*.1,t=T[i]-.5;c[0]=g*(1+t*.1);c[1]=g*(1+t*.03);c[2]=g*(1-t*.1);}); }
  /* plate (AR500, hardened steel, the custom chassis): mill scale, dark blotches with flaking edges, pitted all over */
  { const B=fbm(n,5,5,5,R,.55),P=fbm(n,128,128,1,R),F=new Float32Array(n*n);for(let i=0;i<F.length;i++)F[i]=B[i]*.3+P[i]*.08+smooth(.54,.58,B[i])*.05;
    set("plate",F,4,i=>.45+(B[i]-.5)*.8+(P[i]-.5)*.2,(i,c)=>{c[0]=c[1]=c[2]=.84+(B[i]-.5)*.36+(P[i]-.5)*.06;}); }
  /* disc: turning marks in rings round the centre of the tile (the hub, on a cylinder cap), fine grain over them */
  { const W=fbm(n,8,8,2,R),G=fbm(n,64,64,2,R),F=new Float32Array(n*n),Mk=new Float32Array(n*n);
    for(let i=0;i<F.length;i++){const r=Math.hypot(U(i)-.5,Vv(i)-.5)*2;Mk[i]=.5+.5*Math.sin(r*Math.PI*2*22+(W[i]-.5)*4);F[i]=Mk[i]*.1+G[i]*.1;}
    set("disc",F,1.5,i=>.3+(Mk[i]-.5)*.1+(G[i]-.5)*.06,(i,c)=>{c[0]=c[1]=c[2]=.86+(Mk[i]-.5)*.04+(G[i]-.5)*.03;}); }
  /* plywood: grain along u, growth rings wandering across it (darker, a little rougher) */
  { const Gr=fbm(n,3,48,4,R,.55),Wb=fbm(n,4,4,2,R),F=new Float32Array(n*n),Rg=new Float32Array(n*n);
    for(let i=0;i<F.length;i++){const b=Math.sin(Math.PI*2*(Vv(i)*5+(Wb[i]-.5)*.6));Rg[i]=smooth(.2,.7,b);F[i]=Gr[i]*.5+Rg[i]*.03;}
    set("ply",F,6,i=>.78+Rg[i]*.08+(Gr[i]-.5)*.2,(i,c)=>{const g=.9+(Gr[i]-.5)*.3-Rg[i]*.14;c[0]=g;c[1]=g*.97;c[2]=g*.92;}); }
  /* HDPE: orange peel, a faint speckle */
  { const P=fbm(n,48,48,3,R),F=new Float32Array(n*n);for(let i=0;i<F.length;i++)F[i]=P[i]*.06;
    set("hdpe",F,3,i=>.58+(P[i]-.5)*.12,(i,c)=>{c[0]=c[1]=c[2]=.86+(P[i]-.5)*.03;}); }
  /* rubber: a tread. Four blocks round the tile (u), a groove down the middle (v), soft edges, grooves a touch lighter and rougher */
  { const N=fbm(n,32,32,3,R),F=new Float32Array(n*n),Bk=new Float32Array(n*n);
    for(let i=0;i<F.length;i++){const u=(U(i)*4)%1,v=Vv(i),gu=Math.min(smooth(.05,.11,u),smooth(.05,.11,1-u)),gv=Math.min(smooth(.08,.14,v),smooth(.08,.14,1-v))*(1-(1-Math.min(smooth(.01,.07,Math.abs(v-.5)),1)));
      Bk[i]=gu*gv;F[i]=Bk[i]*.5+N[i]*.08;}
    set("rubber",F,4,i=>.95-Bk[i]*.09+(N[i]-.5)*.1,(i,c)=>{c[0]=c[1]=c[2]=.86+(1-Bk[i])*.08+(N[i]-.5)*.05;}); }
  /* paint: orange peel under a clearcoat (the materials add the coat) */
  { const P=fbm(n,64,64,2,R),F=new Float32Array(n*n);for(let i=0;i<F.length;i++)F[i]=P[i]*.03;
    set("paint",F,4,i=>.38+(P[i]-.5)*.12,(i,c)=>{c[0]=c[1]=c[2]=.86+(P[i]-.5)*.02;}); }
  return S;}
/* the sets the materials are made from, one per key, empty until the fields land: surfStart runs surfFields in a worker
   (the main thread has the loading bar and the first frames to draw; a browser without blob workers does it in a
   timeout) and surfLand turns each into textures and puts them on every material made from the set, on the cached
   bots, the workshop's bot and the bots in a fight. A tier change in between drops the late result (SURF.gen) */
/* Lite: drop the maps and forget a result still on its way */
function surfDrop(){for(const t of SURF.tex)t.dispose();SURF.tex=[];++SURF.gen;}
const SURF_KEYS=["steel","alu","ti","plate","disc","ply","hdpe","rubber","paint"];
function surfMaps(){for(const t of SURF.tex)t.dispose();SURF.tex=[];const gen=++SURF.gen,out={};
  for(const k of SURF_KEYS)out[k]={key:k,map:null,nor:null,rough:null,ns:1,avg:1};
  surfStart(F=>{if(SURF.gen!==gen)return;for(const k in F)surfLand(out[k],F[k]);});
  return out;}
function surfStart(cb){const n=SURF.n;
  try{const code=[surfRng,noiseAdd,fbm,scratches,clamp01,smooth,normalPix,greyPix,rgbPix,surfFields].map(f=>f.toString()).join("\n")+
      "\nonmessage=e=>{const F=surfFields(e.data),T=[];for(const k in F){const f=F[k];F[k]={alb:f.alb,nor:f.nor,rough:f.rough,ns:f.ns,avg:f.avg};T.push(f.alb.buffer,f.nor.buffer,f.rough.buffer);}postMessage(F,T);};";
    const url=URL.createObjectURL(new Blob([code],{type:"text/javascript"})),w=new Worker(url);
    w.onmessage=e=>{URL.revokeObjectURL(url);w.terminate();cb(e.data);};
    w.onerror=()=>{URL.revokeObjectURL(url);w.terminate();setTimeout(()=>cb(surfFields(n)),0);};
    w.postMessage(n);}
  catch(e){setTimeout(()=>cb(surfFields(n)),0);}}
function surfLand(set,f){const n=SURF.n,an=Math.min(4,V.r.capabilities.getMaxAnisotropy());
  const tex=(px,srgb)=>{const t=new THREE.DataTexture(px,n,n,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
    t.generateMipmaps=true;t.anisotropy=an;if(srgb)t.encoding=THREE.sRGBEncoding;t.needsUpdate=true;SURF.tex.push(t);return t;};
  set.map=tex(f.alb,true);set.nor=tex(f.nor,false);set.rough=tex(f.rough,false);set.ns=f.ns;set.avg=Math.pow(f.avg,2.2);
  /* every material made from this set, wherever it is by now */
  const seen=new Set(),fix=o=>{if(!o)return;o.traverse(m=>{if(!m.isMesh||!m.material)return;for(const mat of Array.isArray(m.material)?m.material:[m.material]){
    if(mat.userData.surf!==set.key||seen.has(mat))continue;seen.add(mat);surfDress(mat,set);if(m.userData.base){m.userData.base.copy(mat.color);mat.color.multiplyScalar(m.userData.dmul||1);}}});};
  for(const k in V.mats)for(const mat of Array.isArray(V.mats[k])?V.mats[k]:[V.mats[k]])if(mat.userData.surf===set.key&&!seen.has(mat)){seen.add(mat);surfDress(mat,set);}
  for(const k in V.spMats)if(V.spMats[k].userData.surf===set.key){seen.add(V.spMats[k]);surfDress(V.spMats[k],set);}
  for(const g of BOT_CACHE.values())fix(g);fix(V.bot);for(const B of AR.bots)fix(B.mesh);}
/* a bot material from a set (its maps go on when they land): colour x albedo keeps the coded colour on average; paint
   gets a clearcoat */
function surfMat(set,color,metal,paint){const o={color,roughness:1,metalness:metal,envMap:V.env,envMapIntensity:metal?1.2:paint?.7:.45};
  const m=paint?new THREE.MeshPhysicalMaterial(Object.assign(o,{clearcoat:.8,clearcoatRoughness:.2})):new THREE.MeshStandardMaterial(o);
  m.userData.surf=set.key;m.userData.col=[color.r,color.g,color.b];m.roughness=metal?.35:paint?.4:.7;   // flat values until the maps land
  if(set.map)surfDress(m,set);return m;}
function surfDress(m,set){m.map=set.map;m.normalMap=set.nor;m.normalScale=new THREE.Vector2(set.ns,set.ns);m.roughnessMap=set.rough;m.roughness=1;
  if(m.isMeshPhysicalMaterial){m.clearcoatNormalMap=set.nor;m.clearcoatNormalScale=new THREE.Vector2(set.ns*.5,set.ns*.5);}
  const c=m.userData.col;m.color.setRGB(c[0],c[1],c[2]).multiplyScalar(1/Math.max(.05,set.avg));m.needsUpdate=true;}
/* one component of a buffer attribute as a float, whatever it is stored as (the packed models keep positions as 16-bit and
   normals as 8-bit, normalized) */
function attrGet(A,i,c){const arr=A.isInterleavedBufferAttribute?A.data.array:A.array,x=c===0?A.getX(i):c===1?A.getY(i):A.getZ(i);
  if(!A.normalized)return x;const k=arr instanceof Int16Array?32767:arr instanceof Int8Array?127:arr instanceof Uint16Array?65535:arr instanceof Uint8Array?255:1;return Math.max(-1,x/k);}
/* UVs for geo from where its points are (through matrix m, in the bot's metres): each point maps onto the plane its normal
   faces most, one tile per SURF.tile metres, so grain runs at one density over the whole bot. Done once per geometry
   (userData.uvp), so a geometry shared by several meshes keeps the first mesh's projection: the texture tiles, so only its
   phase would differ */
function uvProject(geo,m){const P=geo.attributes.position,N=geo.attributes.normal,tile=SURF.tile;if(!P||!N||!tile||geo.userData.uvp)return;geo.userData.uvp=1;
  const nm=new THREE.Matrix3().getNormalMatrix(m),v=new THREE.Vector3(),w=new THREE.Vector3(),uv=new Float32Array(P.count*2);
  for(let i=0;i<P.count;i++){v.set(attrGet(P,i,0),attrGet(P,i,1),attrGet(P,i,2)).applyMatrix4(m);w.set(attrGet(N,i,0),attrGet(N,i,1),attrGet(N,i,2)).applyMatrix3(nm);
    const ax=Math.abs(w.x),ay=Math.abs(w.y),az=Math.abs(w.z);
    if(ax>=ay&&ax>=az){uv[i*2]=v.z/tile;uv[i*2+1]=v.y/tile;}else if(ay>=az){uv[i*2]=v.x/tile;uv[i*2+1]=v.z/tile;}else{uv[i*2]=v.x/tile;uv[i*2+1]=v.y/tile;}}
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));}
/* the cylinder's own UVs (u round, v along), repeated ru times round and rv along */
function uvRepeat(geo,ru,rv){const A=geo.attributes.uv;if(!A)return;for(let i=0;i<A.count;i++)A.setXY(i,A.getX(i)*ru,A.getY(i)*rv);A.needsUpdate=true;geo.userData.uvp=1;}
/* a small equirect "workshop" painted on a canvas, so the PBR metals have something to mirror (Full / Ultra): a dark room,
   a lighter band at the horizon that reads as walls in a reflection, cold strip lights with their glow on the ceiling and
   their pool on the floor, a high window and a warm lamp low on one side */
function shopEnv(){
  const W=512,H=256,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");
  const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#2a2c30");bg.addColorStop(.4,"#3c3e43");bg.addColorStop(.52,"#585b61");bg.addColorStop(.62,"#44464a");bg.addColorStop(.72,"#1c1c1b");bg.addColorStop(1,"#0a0a09");
  g.fillStyle=bg;g.fillRect(0,0,W,H);
  for(const x of [40,170,300,430]){const gl=g.createRadialGradient(x+40,30,4,x+40,30,70);gl.addColorStop(0,"rgba(200,215,235,.55)");gl.addColorStop(1,"rgba(200,215,235,0)");g.fillStyle=gl;g.fillRect(x-40,0,160,110);
    g.fillStyle="rgba(235,242,250,1)";g.fillRect(x,26,80,8);
    const fl=g.createRadialGradient(x+40,H-10,4,x+40,H-10,60);fl.addColorStop(0,"rgba(120,130,145,.35)");fl.addColorStop(1,"rgba(120,130,145,0)");g.fillStyle=fl;g.fillRect(x-30,H-70,140,70);}
  g.fillStyle="rgba(165,185,210,.55)";g.fillRect(360,74,70,44);g.fillStyle="#2a2c30";g.fillRect(393,74,4,44);g.fillRect(360,94,70,3);   // the window and its bars
  const lamp=g.createRadialGradient(90,138,2,90,138,40);lamp.addColorStop(0,"rgba(255,200,140,.9)");lamp.addColorStop(.2,"rgba(255,170,100,.45)");lamp.addColorStop(1,"rgba(255,170,100,0)");g.fillStyle=lamp;g.fillRect(40,98,100,80);
  const tex=new THREE.CanvasTexture(c);tex.mapping=THREE.EquirectangularReflectionMapping;tex.encoding=THREE.sRGBEncoding;
  const pm=new THREE.PMREMGenerator(V.r),rt=pm.fromEquirectangular(tex);pm.dispose();tex.dispose();
  return rt.texture;
}
