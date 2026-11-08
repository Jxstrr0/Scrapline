/* ---- vis/workshop.js: the workbench (a steel plate on a wooden bench in a dark corner of a machine shop, cold overhead
   light) with the bot the app last passed to setBot (the placeholder until then), orbit and pinch controls, framing, the
   two views ("workshop" and "arena": V.view) and the frame loop. ---- */
function buildShop(){
  const M=V.mats,g=new THREE.Group(),lite=V.tier==="lite";
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),M.floor);floor.rotation.x=-Math.PI/2;floor.position.y=-1.4;g.add(floor);
  const top=new THREE.Mesh(new THREE.BoxGeometry(9,.3,5.5),M.bench);top.position.y=-.15;top.receiveShadow=!lite;g.add(top);
  const plate=new THREE.Mesh(new THREE.BoxGeometry(4.6,.04,3.4),M.plate);plate.position.y=.02;plate.receiveShadow=!lite;g.add(plate);
  return g;
}
function buildLights(){
  const g=new THREE.Group(),lite=V.tier==="lite";
  g.add(new THREE.HemisphereLight(0xb8c4d0,0x1a1816,lite?.8:.45));
  const key=new THREE.DirectionalLight(0xe6eef8,lite?1.1:1.5);key.position.set(-2.5,8,3.5);
  if(!lite){key.castShadow=true;key.shadow.mapSize.set(1024,1024);const c=key.shadow.camera;c.left=c.bottom=-4;c.right=c.top=4;c.near=1;c.far=20;key.shadow.bias=-.0006;key.shadow.radius=3;}
  g.add(key);
  const rim=new THREE.DirectionalLight(0xffd2b8,lite?.3:.45);rim.position.set(5,2.5,-6);g.add(rim);
  return g;
}
/* the workshop's bot: the build passed to setBot, scaled to sit on the plate (a beetle and a heavyweight look the same size) */
function placeBot(){if(V.bot){V.scene.remove(V.bot);if(V.bot.userData.placeholder)V.bot.traverse(o=>{if(o.geometry)o.geometry.dispose();});else disposeClone(V.bot);V.bot=null;}
  if(V.botB){const g=botMesh(V.botB,0,V.paint,V.livery||null),s=2.2/Math.max(g.userData.L,g.userData.W,1e-3);g.scale.setScalar(s);g.rotation.y=Math.PI;g.position.y=0.04;V.bot=g;}
  else V.bot=buildPlaceholderBot();
  V.bot.visible=V.view==="workshop";V.scene.add(V.bot);}
function placeBotClear(){if(!V.bot)return;V.scene.remove(V.bot);if(V.bot.userData.placeholder)V.bot.traverse(o=>{if(o.geometry)o.geometry.dispose();});else disposeClone(V.bot);V.bot=null;}
/* rebuild everything that depends on the tier */
function rebuild(){
  for(const k of ["shop","lights"])if(V[k]){V.scene.remove(V[k]);V[k].traverse(o=>{if(o.geometry&&!o.userData.keep)o.geometry.dispose();});V[k]=null;}   // keep: a cached prop model (vis/props.js)
  const fight=AR.F;arenaClear();placeBotClear();botCacheClear();
  makeMats(V.tier);
  V.shop=buildShop();V.lights=buildLights();
  V.scene.add(V.shop,V.lights);placeBot();propShop();
  if(fight){buildArena(fight);fxInit();}
  showView();
  V.r.shadowMap.enabled=V.tier!=="lite";V.r.shadowMap.type=THREE.PCFSoftShadowMap;
  V.r.setPixelRatio(V.tier==="lite"?1:Math.min(window.devicePixelRatio||1,2));
  if(V.comp){try{V.comp.renderTarget1.dispose();V.comp.renderTarget2.dispose();if(V.bloom&&V.bloom.dispose)V.bloom.dispose();}catch(e){}}   // Ultra's bloom targets
  V.comp=null;V.bloom=null;
  if(V.tier==="ultra"&&window.__scrPost)window.__scrPost(()=>{if(V.tier!=="ultra"||!THREE.EffectComposer||!THREE.RenderPass||!THREE.UnrealBloomPass)return;
    /* the composer's own target asks for a stencil buffer only to get a 24-bit depth buffer: three's default here is 16-bit,
       which let thin layers (the bot's team stripe, the arena kit's hazard stripes) flicker through on Ultra */
    const sz=V.r.getDrawingBufferSize(new THREE.Vector2());
    V.comp=new THREE.EffectComposer(V.r,new THREE.WebGLRenderTarget(sz.x||1,sz.y||1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,stencilBuffer:true}));V.comp.addPass(new THREE.RenderPass(V.scene,V.cam));
    V.bloom=new THREE.UnrealBloomPass(new THREE.Vector2(V.w||1,V.h||1),.3,.4,.85);V.comp.addPass(V.bloom);resize(true);});
  resize(true);
}
function resize(force){
  const c=V.canvas,w=c.clientWidth|0,h=c.clientHeight|0;
  if(!w||!h||(!force&&w===V.w&&h===V.h))return;
  V.w=w;V.h=h;V.r.setSize(w,h,false);V.cam.aspect=w/h;V.cam.updateProjectionMatrix();
  if(V.comp){V.comp.setSize(w,h);V.comp.setPixelRatio&&V.comp.setPixelRatio(V.r.getPixelRatio());}
}
function placeCam(){
  const o=V.orbit,cp=Math.cos(o.pitch);
  V.cam.position.set(o.tx+Math.sin(o.yaw)*cp*o.dist,o.ty+Math.sin(o.pitch)*o.dist,o.tz+Math.cos(o.yaw)*cp*o.dist);
  V.cam.lookAt(o.tx,o.ty,o.tz);
}
/* which scene shows: the workshop (bench, lights, bot) or the arena */
function showView(){const ws=V.view==="workshop"||!AR.g;
  for(const o of [V.shop,V.lights,V.bot])if(o)o.visible=ws;if(AR.g){AR.g.visible=!ws;AR.lights.visible=!ws;}
  V.scene.fog.near=ws?12:40;V.scene.fog.far=ws?28:110;V.cam.near=ws?.1:.3;V.cam.far=ws?100:200;V.cam.fov=ws?36:50;V.cam.updateProjectionMatrix();}
/* one finger turns, two fingers pinch to zoom, the mouse wheel zooms. Each finger is tracked by pointerId. Workshop only:
   in the arena the fingers drive (app/controls.js). */
function bindOrbit(el){
  const P=new Map();let pinch0=0,dist0=0;
  el.addEventListener("pointerdown",e=>{if(V.view!=="workshop")return;el.setPointerCapture&&el.setPointerCapture(e.pointerId);P.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(P.size===2){const [a,b]=[...P.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);dist0=V.orbit.dist;}});
  el.addEventListener("pointermove",e=>{const p=P.get(e.pointerId);if(!p)return;
    if(P.size===1){V.orbit.yaw-=(e.clientX-p.x)*.008;V.orbit.pitch=Math.max(.15,Math.min(1.4,V.orbit.pitch+(e.clientY-p.y)*.006));}
    p.x=e.clientX;p.y=e.clientY;
    if(P.size===2&&pinch0){const [a,b]=[...P.values()],d=Math.hypot(a.x-b.x,a.y-b.y);V.orbit.dist=Math.max(3.5,Math.min(14,dist0*pinch0/Math.max(d,1)));}});
  const up=e=>{P.delete(e.pointerId);if(P.size<2)pinch0=0;};
  el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up);
  el.addEventListener("wheel",e=>{if(V.view!=="workshop")return;e.preventDefault();V.orbit.dist=Math.max(3.5,Math.min(14,V.orbit.dist*(1+Math.sign(e.deltaY)*.08)));},{passive:false});
}
/* the bot card's picture (app/help.js): the workshop's bot from a fixed three-quarter view, rendered off screen into a
   w x h canvas (2x supersampled, then scaled down), so the screen never flickers. No bloom; shadows as the tier has them.
   null when there is no renderer. */
function shotBot(w,h){if(!V.r||!V.bot)return null;const ss=2,W=w*ss,H=h*ss,mx=V.r.capabilities.maxTextureSize||4096;if(W>mx||H>mx)return null;
  const vis=[V.shop,V.lights,V.bot].map(o=>o&&o.visible),ag=AR.g&&AR.g.visible,al=AR.lights&&AR.lights.visible;
  for(const o of [V.shop,V.lights,V.bot])if(o)o.visible=true;if(AR.g){AR.g.visible=false;AR.lights.visible=false;}
  const cam=new THREE.PerspectiveCamera(30,w/h,.1,100),yaw=-.75,pitch=.42,dist=6.4,cp=Math.cos(pitch);
  cam.position.set(Math.sin(yaw)*cp*dist,.3+Math.sin(pitch)*dist,Math.cos(yaw)*cp*dist);cam.lookAt(0,.3,0);
  const fn=V.scene.fog.near,ff=V.scene.fog.far;V.scene.fog.near=12;V.scene.fog.far=28;
  const rt=new THREE.WebGLRenderTarget(W,H,{depthBuffer:true});rt.texture.encoding=THREE.sRGBEncoding;
  let out=null;
  try{V.r.setRenderTarget(rt);V.r.render(V.scene,cam);const px=new Uint8Array(W*H*4);V.r.readRenderTargetPixels(rt,0,0,W,H,px);
    const big=document.createElement("canvas");big.width=W;big.height=H;const bg=big.getContext("2d"),img=bg.createImageData(W,H),row=W*4;
    for(let y=0;y<H;y++)img.data.set(px.subarray((H-1-y)*row,(H-y)*row),y*row);   // the GPU's rows run bottom up
    bg.putImageData(img,0,0);out=document.createElement("canvas");out.width=w;out.height=h;const g=out.getContext("2d");g.imageSmoothingQuality="high";g.drawImage(big,0,0,w,h);}
  catch(e){out=null;}
  finally{V.r.setRenderTarget(null);rt.dispose();V.scene.fog.near=fn;V.scene.fog.far=ff;
    [V.shop,V.lights,V.bot].forEach((o,i)=>{if(o)o.visible=vis[i];});if(AR.g){AR.g.visible=ag;AR.lights.visible=al;}}
  return out;}
/* Lite renders at most 30 frames a second (plan section 16); Full and Ultra follow the display */
function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||!V.r)return;
  if(V.tier==="lite"&&now-V.last<30){return;}
  const dt=Math.min(.1,(now-(V.last||now))/1000);V.last=now;
  resize(false);
  if(V.view==="arena"&&AR.g){arenaTick(dt,now);fxTick(dt);}
  else{const u=V.bot&&V.bot.userData;V.ang+=dt*TAU*1.6*(V.run.spin||0);   // a slow idle spin on the bench
    if(u&&u.disc)u.disc.rotation.y=V.ang;else if(u&&u.spin)u.spin.rotation[u.spin.userData.axis]=V.ang;
    placeCam();}
  if(V.comp)V.comp.render();else V.r.render(V.scene,V.cam);
  V.frames++;
  if(now-V.fpsAt>=1000){V.fpsObj={fps:Math.round(V.frames*1000/(now-V.fpsAt)),at:now};V.frames=0;V.fpsAt=now;}
}
