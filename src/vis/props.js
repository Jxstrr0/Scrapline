/* ---- vis/props.js: dressing for Full and Ultra (PR 10). Lite never loads any of it and keeps the coded stand-ins.
     textures   photo textures from textures/ (Poly Haven, CC0; textures/CREDITS.md) on the workshop floor, the bench top, the
                steel plate and the arena floor. Each is tinted so its average matches the coded colour, so the scene keeps the
                Lite palette and only gains grain, wear and seams. A texture that fails to load leaves the plain colour.
     props      small glTF models from models/ (Poly Haven, CC0; models/CREDITS.md), packed by tools/pack-model.py: a set per
                workshop stage (SCRAP_VIS.setStage: corner, unit, shop, hq) and a few beyond the walls of the bigger arenas.
                GLTFLoader comes with the SCR_LIBS addons (window.__scrPost). Each file loads once and is kept (its meshes
                carry userData.keep, so the workshop and arena teardown skip them); a tier change or a new room just drops
                the clones. Anything that lands after its room was replaced is dropped.
     arena kit  models/arena-kit.glb, original work built in Blender from tools/blender-arena-kit.py: kerbs with a steel face,
                screen uprights, corner posts with beacons, striped wall rams, toothed floor spinners, a striped pit edge and
                well, and stands with a crowd. arenaKit swaps it in for the coded pieces vis/arena.js listed in AR.kit, merging
                the many kerb and stand clones into one mesh per material so it costs a few draw calls.
     shells     models/bot-shells.glb, original work built in Blender from tools/blender-bot-shells.py: the body styles' shells
                (wedge lid and cheeks, dome, slab skirts and corner guards, pancake lid, invertible plates, scrap tubes and
                welds). botShells loads it the first time a bot is drawn on Full or Ultra; vis/bot.js shellBody uses it.
     weapons    models/bot-weapons.glb (0.1.22), original work built in Blender from tools/blender-bot-weapons.py: disc, saw,
                drum, uprights, ramp, lifter tines, flipper plate, arm, hammer head, crusher beak and jaw. botWeapons loads
                it alongside the shells; vis/bot.js buildWeapon uses it.
   More Blender models (the stage interiors, the trailer, trophies) drop in the same way: pack the export with
   tools/pack-model.py, add it to PROP_FILES and its placements below, and credit it as original work. ---- */
const PROP_TEX={floor:"textures/garage-floor",ply:"textures/plywood",plate:"textures/metal-plate"};
/* material name -> [texture, repeat u, repeat v, normal strength] */
const PROP_TEX_USE={floor:["floor",14,14,.8],bench:["ply",2,1.25,.5],plate:["plate",2.4,1.8,.6],arenaFloor:["plate",5,5,.6],arenaOut:["floor",14,14,.8]};
const PROP_FILES={vice:"models/bench-vice.glb",toolbox:"models/toolbox.glb",ext:"models/extinguisher.glb",shelf:"models/shelf.glb",
  oil:"models/oil-tin.glb",lube:"models/lube-spray.glb",chest:"models/tool-chest.glb",weld:"models/welding-cart.glb",
  crate:"models/crate.glb",propane:"models/propane-tank.glb",stool:"models/stool.glb",drill:"models/drill-press.glb",
  truck:"models/hand-truck.glb",gen:"models/generator.glb",barrel:"models/barrel.glb",desk:"models/office-desk.glb",
  meter:"models/multimeter.glb",tyre:"models/old-tyre.glb",box:"models/cardboard-box.glb",sign:"models/wet-floor-sign.glb",
  kit:"models/arena-kit.glb",shells:"models/bot-shells.glb",wpns:"models/bot-weapons.glb"};
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
   scene units, the camera at +z). Props are at the dressing scale, AR.D (vis/arena.js: ARENA_PROP_UNITS a metre, or real
   size if smaller), the same as the stands' people, so a heavyweight arena still dwarfs them; at real size a barrel filled a
   third of a beetle arena (0.1.21.0). The test box has none; the ant's tabletop gets bench-top things at real size. */
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
  arenaKit(G);
  propPlace(G,(ARENA_SPOTS[F.arena.id]||[]).map(s=>({key:s[0],x:s[1]*H+s[2],y:0,z:s[3]*H+s[4],turn:s[5],scale:F.arena.id==="tabletop"?AR.U:AR.D})),()=>AR.g===G&&V.tier!=="lite");}
/* a new workshop stage: drop this room's props and dress it for the new one */
function propShopSwap(){const G=V.shop;if(!G)return;for(const o of G.children.filter(c=>c.name.indexOf("prop:")===0))G.remove(o);propShop();}
/* ---- the arena kit ---- */
/* arenas that get stands round three sides (the camera's side stays open); the test box and the tabletop don't */
const KIT_STANDS={clubbox:1,regional:1,eisenhalle:1};
function arenaKit(G){const go=()=>propModel("kit",src=>{if(AR.g===G&&V.tier!=="lite"&&AR.kit)kitBuild(G,src);});
  if(!THREE.GLTFLoader){if(window.__scrPost)window.__scrPost(()=>{if(THREE.GLTFLoader&&AR.g===G)go();});return;}go();}
/* every mesh in objs, baked into G's space and merged per material: positions and normals turned to plain floats (the
   packed files store them quantized, which can't be merged as they are; attrGet in vis/surface.js reads them) */
function kitBake(G,objs,shadow){const by=new Map(),v=new THREE.Vector3(),rd=attrGet;   // attrGet: vis/surface.js
  for(const o of objs){o.updateMatrixWorld(true);o.traverse(m=>{if(!m.isMesh)return;
    const mw=m.matrixWorld,nm=new THREE.Matrix3().getNormalMatrix(mw),g=m.geometry,P=g.attributes.position,N=g.attributes.normal,n=P.count;
    let e=by.get(m.material);if(!e)by.set(m.material,e={p:[],n:[],i:[],at:0});
    for(let i=0;i<n;i++){v.set(rd(P,i,0),rd(P,i,1),rd(P,i,2)).applyMatrix4(mw);e.p.push(v.x,v.y,v.z);
      if(N){v.set(rd(N,i,0),rd(N,i,1),rd(N,i,2)).applyMatrix3(nm).normalize();e.n.push(v.x,v.y,v.z);}else e.n.push(0,1,0);}
    if(g.index)for(let i=0;i<g.index.count;i++)e.i.push(g.index.getX(i)+e.at);else for(let i=0;i<n;i++)e.i.push(i+e.at);
    e.at+=n;});}
  for(const [mat,e] of by){const gg=new THREE.BufferGeometry();gg.setAttribute("position",new THREE.Float32BufferAttribute(e.p,3));
    gg.setAttribute("normal",new THREE.Float32BufferAttribute(e.n,3));gg.setIndex(e.i);gg.computeBoundingSphere();
    const mesh=new THREE.Mesh(gg,mat);mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.name="kit:baked";G.add(mesh);}}
/* a piece of the kit by name; own(mesh) gives that one mesh a material of its own (lamps and glows change colour) */
function kitPiece(src,name){const s=src.getObjectByName(name);return s?s.clone():null;}
function kitOwn(o,name){const m=o.getObjectByName(name);if(!m)return null;let mesh=m;if(!mesh.isMesh)m.traverse(c=>{if(c.isMesh)mesh=c;});
  if(!mesh.isMesh)return null;const mat=mesh.material.clone();mesh.material=mat;AR.kitMats.push(mat);return mat;}
function kitBuild(G,src){const K=AR.kit,H=K.H,M=V.mats;if(!kitPiece(src,"kerb"))return;
  /* walls: kerb units along each wall, screen uprights on the three far ones; the coded kerbs hide */
  const walls=[],kh=0.35;
  for(const W of K.walls){const n=Math.max(1,Math.round(W.len/1.1)),seg=W.len/n;W.k.visible=false;
    /* turn each unit so its steel face (+z) looks into the arena */
    const ry=W.along==="x"?(W.z<0?0:Math.PI):(W.x<0?Math.PI/2:-Math.PI/2),ax=W.along==="x"?[1,0]:[0,1];
    for(let i=0;i<n;i++){const off=-W.len/2+seg*(i+.5);
      for(const nm of W.near?["kerb"]:["kerb","frame"]){const o=kitPiece(src,nm);o.position.set(W.x+ax[0]*off,0,W.z+ax[1]*off);o.rotation.y=ry;o.scale.set(seg,1,1);walls.push(o);}}}
  kitBake(G,walls,true);
  /* corner posts with their beacons */
  const lamps=[];for(const P of K.posts){if(P.near){lamps.push({material:P.lamp.material});continue;}   // the near posts stay short and coded
    P.p.visible=P.lamp.visible=false;const o=kitPiece(src,"post");o.position.set(P.p.position.x,0,P.p.position.z);
    const lm=kitOwn(o,"post_lamp");o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});G.add(o);if(lm)lamps.push({material:lm});}
  if(lamps.length)AR.lamps=lamps;
  /* hazards: the coded slab or disc stays as the moving thing the tick animates, drawn by the kit piece inside it */
  for(const z of AR.haz){const isP=z.h.type==="pusher",o=kitPiece(src,isP?"pusher":"spinner");if(!o)continue;
    z.m.material.visible=false;if(z.bar)z.bar.visible=false;
    if(isP){const [nx,nz]=z.n,alongX=Math.abs(nx)>=Math.abs(nz);o.rotation.y=Math.atan2(-nz,nx);
      o.scale.set(alongX?z.w:z.d,z.ht,(alongX?z.d:z.w)/3);o.position.y=-z.ht/2;z.glow=kitOwn(o,"pusher_glow");}
    else{o.scale.set(z.R,1,z.R);o.position.y=-0.016;z.glow=kitOwn(o,"spinner_glow");}
    o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});z.m.add(o);}
  /* the pit: a real hole in the floor with a well under it, so a bot that drops in is seen to fall; a striped edge round it */
  if(K.pit){const p=K.pit,x0=p.cx-p.w/2,x1=p.cx+p.w/2,z0=p.cz-p.d/2,z1=p.cz+p.d/2;
    /* a square plane (half size h) with the pit cut out, as up to four strips round it (in the plane's own x, y, which the
       mesh turns flat: y is -z), UVs 0..1 like the PlaneGeometry it replaces so the texture repeat holds. Strips, not a
       Shape with a hole: every pit touches a wall, and a hole edge a hair outside the square broke the triangulation */
    const holed=h=>{const c=v=>Math.max(-h,Math.min(h,v)),hx0=c(x0),hx1=c(x1),hy0=c(-z1),hy1=c(-z0),P=[],UV=[],I=[];
      const quad=(a0,b0,a1,b1)=>{if(a1-a0<1e-6||b1-b0<1e-6)return;const n=P.length/3;
        for(const [x,y] of [[a0,b0],[a1,b0],[a1,b1],[a0,b1]]){P.push(x,y,0);UV.push((x+h)/(2*h),(y+h)/(2*h));}I.push(n,n+1,n+2,n,n+2,n+3);};
      quad(-h,-h,h,hy0);quad(-h,hy1,h,h);quad(-h,hy0,hx0,hy1);quad(hx1,hy0,h,hy1);
      const fg=new THREE.BufferGeometry();fg.setAttribute("position",new THREE.Float32BufferAttribute(P,3));fg.setAttribute("uv",new THREE.Float32BufferAttribute(UV,2));
      fg.setAttribute("normal",new THREE.Float32BufferAttribute(P.map((v,i)=>i%3===2?1:0),3));fg.setIndex(I);return fg;};
    for(const [m,h] of [[K.floor,H],[K.out,30]]){m.geometry.dispose();m.geometry=holed(h);}   // the arena floor and the room floor under it
    p.hole.visible=false;   // the decal (K.grid) already has the pit cut out
    const well=kitPiece(src,"pitwell");if(well){well.position.set(p.cx,0,p.cz);well.scale.set(p.w,4,p.d);G.add(well);}
    const edges=[];for(const [x,z,len,ry] of [[p.cx,z0-.05,p.w+.2,0],[p.cx,z1+.05,p.w+.2,0],[x0-.05,p.cz,p.d,Math.PI/2],[x1+.05,p.cz,p.d,Math.PI/2]]){
      const o=kitPiece(src,"pitedge");o.position.set(x,0,z);o.rotation.y=ry;o.scale.set(len,1,1);edges.push(o);}
    kitBake(G,edges,false);}
  /* stands round the back and the sides, behind the props. The piece is in metres, so it is scaled by the dressing scale
     (AR.D) like the props and blocks tile every 4 m of it; the flat crowd moves back behind the top row, as the seats beyond */
  if(KIT_STANDS[AR.F.arena.id]){const st=[],D=AR.D,off=H+2.05,bw=4*D,deep=3.3*D,top=1.8*D;
    for(const [ax,az,ry] of [[0,-1,0],[-1,0,Math.PI/2],[1,0,-Math.PI/2]]){const n=Math.ceil((2*H+1)/bw);
      for(let i=0;i<n;i++){const a=(i-(n-1)/2)*bw,o=kitPiece(src,"stands");if(!o)break;
        o.position.set(ax?ax*off:a,0,az?az*off:a);o.rotation.y=ry;o.scale.setScalar(D);st.push(o);}}
    kitBake(G,st,false);
    const o2=off+deep;for(const c of K.crowd){c.position.y=top+(0.4+CROWD_M/2)*D;   // above the back wall (top row + 0.3 m)
      if(Math.abs(c.position.z)>Math.abs(c.position.x))c.position.z=Math.sign(c.position.z)*o2;else c.position.x=Math.sign(c.position.x)*o2;}}}
/* ---- the body shells and the weapon parts ---- */
/* a bot model's loaded scene on Full and Ultra ("shells": models/bot-shells.glb, "wpns": models/bot-weapons.glb), or null
   (and the load starts): when it lands, the workshop's bot is drawn again with it (a bot already in a fight keeps its
   coded shape). Two tries a visit each, then the coded shapes */
function shellsReady(){const r=k=>{const c=PROPS.models[k];return !!(c&&c.scene);};return V.tier!=="lite"?(r("shells")?"s":"")+(r("wpns")?"w":""):"";}
function botModel(key){if(V.tier==="lite")return null;const c=PROPS.models[key];if(c&&c.scene)return c.scene;
  const ask=PROPS.ask||(PROPS.ask={}),tries=PROPS.tries||(PROPS.tries={});if(c||ask[key]||(tries[key]||0)>=2)return null;
  const go=()=>{ask[key]=false;tries[key]=(tries[key]||0)+1;propModel(key,()=>{if(V.tier!=="lite"&&V.botB&&V.mats)placeBot();});};
  if(THREE.GLTFLoader)go();else if(window.__scrPost){ask[key]=true;window.__scrPost(()=>{if(THREE.GLTFLoader&&V.tier!=="lite")go();else ask[key]=false;});}
  return null;}
function botShells(){return botModel("shells");}
function botWeapons(){return botModel("wpns");}
