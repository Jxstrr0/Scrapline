/* ---- vis/props.js: dressing for Full and Ultra (PR 10). Lite never loads any of it and keeps the coded stand-ins.
     textures   photo textures from textures/ (Poly Haven, CC0; textures/CREDITS.md) on the workshop floor, the bench top, the
                steel plate and the arena floor. Each is tinted so its average matches the coded colour, so the scene keeps the
                Lite palette and only gains grain, wear and seams. A texture that fails to load leaves the plain colour.
     props      small glTF models from models/ (Poly Haven, CC0; models/CREDITS.md), packed by tools/pack-model.py: a set per
                workshop stage (SCRAP_VIS.setStage: corner, unit, shop, hq) and a few beyond the walls of the bigger arenas.
                GLTFLoader comes with the SCR_LIBS addons (window.__scrPost). Each file loads once and is kept (its meshes
                carry userData.keep, so the workshop and arena teardown skip them); a tier change or a new room just drops
                the clones. Anything that lands after its room was replaced is dropped.
   Kelbo's Blender models (the stage interiors, the arena shell and hazards, the trailer, trophies) drop in the same way: pack
   the export with tools/pack-model.py, add it to PROP_FILES and its placements below, and credit it as original work. ---- */
const PROP_TEX={floor:"textures/garage-floor",ply:"textures/plywood",plate:"textures/metal-plate"};
/* material name -> [texture, repeat u, repeat v, normal strength] */
const PROP_TEX_USE={floor:["floor",14,14,.8],bench:["ply",2,1.25,.5],plate:["plate",2.4,1.8,.6],arenaFloor:["plate",5,5,.6]};
const PROP_FILES={vice:"models/bench-vice.glb",toolbox:"models/toolbox.glb",ext:"models/extinguisher.glb",shelf:"models/shelf.glb",
  oil:"models/oil-tin.glb",lube:"models/lube-spray.glb",chest:"models/tool-chest.glb",weld:"models/welding-cart.glb",
  crate:"models/crate.glb",propane:"models/propane-tank.glb",stool:"models/stool.glb",drill:"models/drill-press.glb",
  truck:"models/hand-truck.glb",gen:"models/generator.glb",barrel:"models/barrel.glb",desk:"models/office-desk.glb",
  meter:"models/multimeter.glb",tyre:"models/old-tyre.glb",box:"models/cardboard-box.glb",sign:"models/wet-floor-sign.glb"};
/* the workshop: scene units per metre. The coded bench is long and low for the bot on it (9 units by 1.25 high), so the room
   runs at about half real scale (2.4 units a metre: the bench reads as 3.75 m by 0.5 m) and the props stay readable. Per stage
   [key, x, y, z, turn] in scene units; y 0 is the bench top, -1.4 the floor. The camera starts at -x +z, so the room reads
   behind the bench (-z) and to its right (+x). Each stage stays under ~100k triangles. */
const SHOP_UNITS=2.4;
const SHOP_SPOTS={
  corner:[["vice",3.6,0,-1.6,2.6],["oil",-3.7,0,-1.9,.4],["lube",-3.3,0,-2.2,1.2],["shelf",-1.5,-1.4,-4.4,0],["box",-1.5,-1.4,-4.3,.2],
    ["ext",5.4,-1.4,-3.4,-.6],["stool",5.6,-1.4,1.2,.5],["toolbox",1.6,-1.4,-3.9,.15]],
  unit:[["vice",3.6,0,-1.6,2.6],["lube",-3.3,0,-2.2,1.2],["chest",-1.2,-1.4,-4.4,0],["weld",3.4,-1.4,-4.6,-.4],["propane",5.2,-1.4,-4.6,0],
    ["crate",6.2,-1.4,-1.2,.3],["ext",6.4,-1.4,1.2,-1.2],["stool",-5.8,-1.4,-1.4,.9]],
  shop:[["vice",3.6,0,-1.6,2.6],["oil",-3.7,0,-1.9,.4],["chest",-1.2,-1.4,-4.4,0],["drill",3.0,-1.4,-4.8,-.3],["weld",6.4,-1.4,-2.6,-1.3],
    ["truck",-4.8,-1.4,-4.6,.7],["barrel",6.6,-1.4,1.0,0],["crate",6.0,-1.4,2.6,.5],["ext",-6.4,-1.4,-2.2,1.6]],
  hq:[["vice",3.6,0,-1.6,2.6],["meter",-3.5,0,-1.8,.5],["chest",-1.2,-1.4,-4.4,0],["drill",3.0,-1.4,-4.8,-.3],["desk",-5.6,-1.4,-4.4,.2],
    ["stool",-4.4,-1.4,-2.9,.4],["crate",6.2,-1.4,-1.6,.3],["barrel",6.6,-1.4,.6,0],["ext",6.4,-1.4,2.2,-1.2]]};
/* arenas: [key, fx, dx, fz, dz, turn, metres per unit of size] placed at x = fx*H + dx, z = fz*H + dz (H the half size in
   scene units, the camera at +z). Props are real size (AR.U units per sim metre), so a heavyweight arena dwarfs them as it
   should. The test box has none; the ant's tabletop gets bench-top things. */
const ARENA_SPOTS={
  tabletop:[["meter",-.55,0,-1,-.9,.3],["oil",1,.9,-.6,0,.5],["lube",1,.8,-.35,0,1.6]],
  clubbox:[["crate",-.35,0,-1,-1.2,.2],["sign",.45,0,-1,-1.0,-.4],["tyre",1,1.2,.15,0,1.57],["propane",-1,-1.0,-.55,0,0]],
  regional:[["truck",-1,-1.3,-.2,0,1.5],["crate",.3,0,-1,-1.3,0],["barrel",1,1.3,.3,0,0],["crate",-.7,0,-1,-1.3,.6],["ext",1,1.1,-.7,0,-1.2]],
  eisenhalle:[["gen",-.4,0,-1,-1.5,0],["truck",1,1.4,-.3,0,-1.5],["crate",-1,-1.3,.2,0,.4],["barrel",.5,0,-1,-1.4,0],["chest",-1,-1.4,-.6,0,1.57]]};
const PROPS={img:{},imgWait:{},models:{},texList:[],gen:0};
/* ---- textures ---- */
function propImg(name,cb){const c=PROPS.img[name];if(c){cb(c);return;}
  if(PROPS.imgWait[name]){PROPS.imgWait[name].push(cb);return;}PROPS.imgWait[name]=[cb];
  const out={diff:null,nor:null,avg:null};let n=0;const done=()=>{if(++n<2)return;const w=PROPS.imgWait[name];delete PROPS.imgWait[name];if(!out.diff)return;PROPS.img[name]=out;w.forEach(f=>f(out));};
  const L=new THREE.ImageLoader();
  L.load(PROP_TEX[name]+"_diff.jpg",im=>{out.diff=im;try{const c=document.createElement("canvas");c.width=c.height=8;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(im,0,0,8,8);
      const d=g.getImageData(0,0,8,8).data;let r=0,gg=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];}
      out.avg=new THREE.Color(r/64/255,gg/64/255,b/64/255).convertSRGBToLinear();}catch(e){out.avg=null;}done();},undefined,()=>done());
  L.load(PROP_TEX[name]+"_nor.jpg",im=>{out.nor=im;done();},undefined,()=>done());}
/* called by makeMats on Full and Ultra with the new materials */
function propDropTex(){for(const t of PROPS.texList)t.dispose();PROPS.texList=[];}
function propDressMats(M){
  if(!window.THREE||!THREE.ImageLoader)return;
  for(const k in PROP_TEX_USE){const [name,ru,rv,ns]=PROP_TEX_USE[k],m=M[k];if(!m)continue;const want=m.color.clone();
    propImg(name,im=>{if(V.mats!==M)return;
      const mk=(img,srgb)=>{const t=new THREE.Texture(img);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(ru,rv);t.anisotropy=Math.min(4,V.r.capabilities.getMaxAnisotropy());
        if(srgb)t.encoding=THREE.sRGBEncoding;t.needsUpdate=true;PROPS.texList.push(t);return t;};
      m.map=mk(im.diff,true);if(im.nor&&m.normalScale){m.normalMap=mk(im.nor,false);m.normalScale.set(ns,ns);}
      if(im.avg)m.color.setRGB(want.r/Math.max(im.avg.r,.02),want.g/Math.max(im.avg.g,.02),want.b/Math.max(im.avg.b,.02));   // keep the coded colour on average
      m.needsUpdate=true;});}}
/* ---- models ---- */
function propModel(key,cb){const c=PROPS.models[key];if(c&&c.scene){cb(c.scene);return;}if(c){c.wait.push(cb);return;}
  const e=PROPS.models[key]={wait:[cb]};
  new THREE.GLTFLoader().load(PROP_FILES[key],g=>{g.scene.userData.lift=-Math.min(0,new THREE.Box3().setFromObject(g.scene).min.y);   // stand it on y 0
    g.scene.traverse(o=>{if(!o.isMesh)return;o.userData.keep=true;
      if(o.material){o.material.envMap=V.env;o.material.envMapIntensity=.6;}});
    e.scene=g.scene;const w=e.wait;e.wait=null;w.forEach(f=>f(g.scene));},
    undefined,err=>{if(typeof console!=="undefined")console.warn("model "+key,err&&err.message);delete PROPS.models[key];});}   // tried again with the next room
/* clones of the models in spots into group G, for as long as ok() says G is still the room on screen */
function propPlace(G,spots,ok){if(!spots||!spots.length)return;
  if(!THREE.GLTFLoader){if(window.__scrPost)window.__scrPost(()=>{if(THREE.GLTFLoader&&ok())propPlace(G,spots,ok);});return;}
  const sh=V.tier!=="lite";
  for(const s of spots)propModel(s.key,src=>{if(!ok())return;const o=src.clone();o.scale.setScalar(s.scale);o.position.set(s.x,s.y+(s.hang?0:src.userData.lift*s.scale),s.z);o.rotation.y=s.turn;o.name="prop:"+s.key;
    o.traverse(m=>{if(m.isMesh){m.castShadow=sh;m.receiveShadow=sh;}});G.add(o);});}
function propShop(){if(V.tier==="lite"||!V.shop)return;const G=V.shop,stage=V.stage||"corner",gen=++PROPS.gen;   // a newer dressing of the room drops this one's late arrivals
  propPlace(G,(SHOP_SPOTS[stage]||SHOP_SPOTS.corner).map(s=>({key:s[0],x:s[1],y:s[2],z:s[3],turn:s[4],scale:SHOP_UNITS,hang:s[0]==="vice"})),()=>V.shop===G&&PROPS.gen===gen&&V.tier!=="lite"&&(V.stage||"corner")===stage);}
function propArena(F){if(V.tier==="lite"||!AR.g)return;const G=AR.g,H=F.arena.half*AR.U;
  propPlace(G,(ARENA_SPOTS[F.arena.id]||[]).map(s=>({key:s[0],x:s[1]*H+s[2],y:0,z:s[3]*H+s[4],turn:s[5],scale:AR.U})),()=>AR.g===G&&V.tier!=="lite");}
/* a new workshop stage: drop this room's props and dress it for the new one */
function propShopSwap(){const G=V.shop;if(!G)return;for(const o of G.children.filter(c=>c.name.indexOf("prop:")===0))G.remove(o);propShop();}
