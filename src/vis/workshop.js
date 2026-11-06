/* ---- vis/workshop.js: the workbench (a steel plate on a wooden bench in a dark corner of a machine shop, cold overhead
   light), orbit and pinch controls, framing, and the frame loop that spins the placeholder bot's disc. ---- */
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
/* rebuild everything that depends on the tier */
function rebuild(){
  for(const k of ["bot","shop","lights"])if(V[k]){V.scene.remove(V[k]);V[k].traverse(o=>{if(o.geometry)o.geometry.dispose();});V[k]=null;}
  makeMats(V.tier);
  V.shop=buildShop();V.lights=buildLights();V.bot=buildPlaceholderBot();
  V.scene.add(V.shop,V.lights,V.bot);
  V.r.shadowMap.enabled=V.tier!=="lite";V.r.shadowMap.type=THREE.PCFSoftShadowMap;
  V.r.setPixelRatio(V.tier==="lite"?1:Math.min(window.devicePixelRatio||1,2));
  V.comp=null;V.bloom=null;
  if(V.tier==="ultra"&&window.__scrPost)window.__scrPost(ok=>{if(!ok||V.tier!=="ultra")return;
    V.comp=new THREE.EffectComposer(V.r);V.comp.addPass(new THREE.RenderPass(V.scene,V.cam));
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
/* one finger turns, two fingers pinch to zoom, the mouse wheel zooms. Each finger is tracked by pointerId. */
function bindOrbit(el){
  const P=new Map();let pinch0=0,dist0=0;
  el.addEventListener("pointerdown",e=>{el.setPointerCapture&&el.setPointerCapture(e.pointerId);P.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(P.size===2){const [a,b]=[...P.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);dist0=V.orbit.dist;}});
  el.addEventListener("pointermove",e=>{const p=P.get(e.pointerId);if(!p)return;
    if(P.size===1){V.orbit.yaw-=(e.clientX-p.x)*.008;V.orbit.pitch=Math.max(.15,Math.min(1.4,V.orbit.pitch+(e.clientY-p.y)*.006));}
    p.x=e.clientX;p.y=e.clientY;
    if(P.size===2&&pinch0){const [a,b]=[...P.values()],d=Math.hypot(a.x-b.x,a.y-b.y);V.orbit.dist=Math.max(3.5,Math.min(14,dist0*pinch0/Math.max(d,1)));}});
  const up=e=>{P.delete(e.pointerId);if(P.size<2)pinch0=0;};
  el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up);
  el.addEventListener("wheel",e=>{e.preventDefault();V.orbit.dist=Math.max(3.5,Math.min(14,V.orbit.dist*(1+Math.sign(e.deltaY)*.08)));},{passive:false});
}
/* Lite renders at most 30 frames a second (plan section 16); Full and Ultra follow the display */
function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||!V.r)return;
  if(V.tier==="lite"&&now-V.last<30){return;}
  const dt=Math.min(.1,(now-(V.last||now))/1000);V.last=now;
  resize(false);
  const u=V.bot&&V.bot.userData;
  if(u&&u.disc){V.ang+=dt*TAU*1.6*(V.run.spin||0);u.disc.rotation.y=V.ang;}   // a slow idle spin: the real rpm comes with the sim
  fxTick(dt);
  placeCam();
  if(V.comp)V.comp.render();else V.r.render(V.scene,V.cam);
  V.frames++;
  if(now-V.fpsAt>=1000){V.fpsObj={fps:Math.round(V.frames*1000/(now-V.fpsAt)),at:now};V.frames=0;V.fpsAt=now;}
}
