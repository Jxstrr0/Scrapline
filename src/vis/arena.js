/* ---- vis/arena.js: the arena view. setFight(F) builds the scene from a SCRAP_SIM fight the app passes in (F.arena:
   floor, walls, the pit, wall pushers and floor spinners; F.bots: a mesh per bot from its build) and each frame draws the
   bots where the sim has them. The vis reads F; it never steps it. Units: the scene is in "beetle metres x 4" (AU per sim
   metre is 4 / the class's length scale), so every class fills the screen the same way.
     floor      dark plate with markings painted on (0.1.21.0, arenaDecal): a grid every 30 cm (beetle scale), a border
                line, a centre circle, hatched bands where the wall rams reach, a ring round each floor spinner and a striped
                edge round the pit. Lite bakes them, with a soft pool of light, into the floor's own texture (one texture
                lookup, no lights and no grid lines to draw); Full and Ultra lay them over the photo plate as a see-through
                decal, under a spotlight over the arena. The floor round the arena is darker than the arena (arenaOut).
                0.1.42: on Full and Ultra the plate is its look's baked tile (vis/props.js floorDress) and the grid is not
                painted (the tile has real joints); on every tier the markings are worn (arenaWear: rubbed lines, tyre
                marks, soot, scrapes by the rams, grime at the kerbs; seeded from the arena's id).
     walls      steel kerbs with a glass screen on top; the side nearest the camera has no screen, no top rail and short
                posts (0.1.21.0), so nothing crosses in front of the bots. 0.1.42: a strip of printed boards along the
                screens above the kerb, the venue's name between SCRAPLINE panels (wallBoards; Lite: the far wall only)
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
     camera     (0.1.50) calmer: it only zooms back in once the bots are a good deal closer (CAM), and in a live fight the
                bot you drive (V.run.mark) is always on the screen, clear of the cards and the controls.
     fwd        (0.1.49) a pale arrow on the floor ahead of the bot you drive (V.run.mark), every tier: fwdMark
     marks      (0.1.15.4) over each bot a name tag in its team colour that stays the same size on screen; a hit
                flashes the bot's parts white-hot for a moment (at most four times a second, softer under reduced motion).
                Lite: the same, with a smaller tag texture. (The floor ring under each bot went in 0.1.16.1, Kelbo: it hid
                the contact between the bots.)
   looks      (0.1.28.0) a venue arena names a look (ARENAS[id].look; ARENA_LOOK here): the floor's colour, what is painted on
                it (mill: steel plates and the glow of the slag trough; port: a timber deck, a quay line and bollards;
                shed: rails across the floor and the turntable's spokes) and the colour of every light. Lite gets the same
                colours and paint in its baked floor; nothing extra is drawn, and no light is added on any tier.
   Lite: flat materials, no shadows, no spotlight (the pool of light is painted into the floor). ---- */
/* the venue looks (0.1.28.0): floor (Lite's baked plate: centre, middle, edge), wash (Full and Ultra: a tint laid over the
   photo plate in the decal), and the lights: hemisphere sky and ground, key, rim (colour, strength), spot */
const ARENA_LOOK={
  base:{floor:["#45433d","#35332f","#1f1e1b"],plate:0x343331,sign:"#d8d2c4",wash:null,sky:0xc4ccd6,gnd:0x1a1816,key:0xeef3fa,rim:[0xffd2b8,.35],spot:0xfff1df},
  mill:{floor:["#4a3f36","#372f29","#1e1a17"],plate:0x363330,sign:"#e9a866",wash:"rgba(150,82,34,.2)",sky:0xd6c4b4,gnd:0x1e1712,key:0xfff0dc,rim:[0xff9a50,.55],spot:0xffd7a8},
  port:{floor:["#3d4446","#2f3537","#1a1e20"],plate:0x32302d,sign:"#9cc4e4",wash:"rgba(60,92,122,.2)",sky:0xb8c8da,gnd:0x141a1e,key:0xe6f0ff,rim:[0x9cc4e8,.4],spot:0xe8f2ff},
  shed:{floor:["#43443a","#33352d","#1d1e19"],plate:0x31322e,sign:"#cdd3a0",wash:"rgba(92,100,60,.17)",sky:0xc8d0bc,gnd:0x181a14,key:0xf2f6e4,rim:[0xffd9a0,.4],spot:0xf4f0dc}};
const arenaLook=F=>ARENA_LOOK[F.arena.def&&F.arena.def.look]||ARENA_LOOK.base;
const AR={F:null,g:null,U:4,bots:[],haz:[],kit:null,kitMats:[],floorMat:null,floorTex:[],pitCover:null,pitOpenAt:null,cam:{x:0,z:0,d:9,shake:0},lights:null,hidden:false};
function arenaClear(){fxClear();for(const B of AR.bots){disposeClone(B.mesh);blobDrop(B.blob);}
  if(AR.g){V.scene.remove(AR.g);AR.g.traverse(o=>{if(o.userData.keep)return;if(o.geometry)o.geometry.dispose();if(o.material&&o.userData.own){if(o.material.map)o.material.map.dispose();o.material.dispose();}});}
  if(AR.lights){V.scene.remove(AR.lights);AR.lights.traverse(l=>{if(l.shadow&&l.shadow.map)l.shadow.dispose();});AR.lights=null;}   // the key light's shadow map is a GPU target
  for(const m of AR.kitMats||[])m.dispose();AR.kitMats=[];AR.kit=null;
  if(AR.floorMat){AR.floorMat.dispose();AR.floorMat=null;}for(const t of AR.floorTex)t.dispose();AR.floorTex=[];   // the floor's own material and its tile (the photo plate it starts with is M.arenaFloor's)
  AR.g=null;AR.F=null;AR.bots=[];AR.haz=[];AR.rings=null;AR.pitCover=null;fxClear();}
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
/* the venue's boards (0.1.42): printed panels along the screens above the kerb. One strip, 16 times as long as it is tall:
   the venue's name (in its look's sign colour) between two SCRAPLINE panels, repeated so a wall always ends on a whole
   panel with the name in its middle. Lite: half the pixels and the far wall only. The kit hangs each in a steel frame
   (vis/props.js kitBuild, the piece "board"); the faces are one-sided, so a board never hides the floor from behind */
const BOARD={y:0.62,h:0.42,out:0.05,panel:1.68};
function boardTex(F,lite){const c=document.createElement("canvas"),k=lite?.5:1;c.width=2048*k;c.height=128*k;const g=c.getContext("2d"),LK=arenaLook(F);g.scale(k,k);
  const name=String((F.arena.def&&F.arena.def.name)||"Scrapline").toUpperCase(),font=px=>`700 ${px}px "Space Grotesk",system-ui,sans-serif`;
  const put=(t,cx,w,px,col)=>{g.font=font(px);const m=g.measureText(t).width;if(m>w)g.font=font(Math.floor(px*w/m));g.fillStyle=col;g.textAlign="center";g.textBaseline="middle";g.fillText(t,cx,68);};
  g.fillStyle="#131217";g.fillRect(0,0,2048,128);
  for(const x of [0,1536]){g.fillStyle="#8a3a22";g.fillRect(x+6,10,500,108);g.fillStyle="#b9502f";g.fillRect(x+6,10,500,5);g.fillRect(x+6,113,500,5);put("SCRAPLINE",x+256,430,70,"#f3e9d8");}
  g.fillStyle="#1d1c22";g.fillRect(518,10,1012,108);g.fillStyle=LK.sign;g.globalAlpha=.55;g.fillRect(518,10,1012,4);g.fillRect(518,114,1012,4);g.globalAlpha=1;
  for(const x of [560,1488]){g.save();g.translate(x,64);g.rotate(Math.PI/4);g.fillRect(-11,-11,22,22);g.restore();}   // a lozenge at each end of the name
  put(name,1024,820,74,LK.sign);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.wrapS=THREE.RepeatWrapping;if(!lite&&V.r)t.anisotropy=Math.min(8,V.r.capabilities.getMaxAnisotropy());return t;}
function wallBoards(g,F,H,lite){const tex=boardTex(F,lite),n=Math.max(2,2*Math.round(H/BOARD.panel)),rep=n/4,o=H+0.075-BOARD.out;   // n panels along a wall, an even number; the wall's middle line is 0.075 behind its inner face
  tex.repeat.set(rep,1);tex.offset.set(0.5-rep/2,0);
  const m=new THREE.MeshLambertMaterial(lite?{map:tex}:{map:tex,emissive:0x2a2a2a,emissiveMap:tex});let first=true;
  for(const [x,z,ry] of lite?[[0,-o,0]]:[[0,-o,0],[-o,0,Math.PI/2],[o,0,-Math.PI/2]]){const b=new THREE.Mesh(new THREE.PlaneGeometry(2*H,BOARD.h),m);
    b.position.set(x,BOARD.y,z);b.rotation.y=ry;b.userData.own=first;first=false;b.renderOrder=3;g.add(b);}}
function buildArena(F){
  arenaClear();const M=V.mats,lite=V.tier==="lite",U=AR.U=4/F.M.len,D=AR.D=Math.min(U,ARENA_PROP_UNITS),A=F.arena,H=A.half*U,g=new THREE.Group();
  const kit=AR.kit={walls:[],posts:[],crowd:[],pit:null,floor:null,grid:null,H};
  const X=x=>x*U,Z=y=>-y*U;   // sim (x, y) to scene (x, z)
  /* floor and grid */
  const deco=arenaDecal(F,U,H,lite);
  let fl;if(lite){const fm=new THREE.MeshLambertMaterial({map:deco});fl=new THREE.Mesh(new THREE.PlaneGeometry(2*H,2*H),fm);fl.userData.own=true;}   // the markings and the light are the floor's texture
  else{const fm=AR.floorMat=M.arenaFloor.clone();fl=new THREE.Mesh(new THREE.PlaneGeometry(2*H,2*H),fm);floorDress(fm,A.def&&A.def.look,H,(A.turn||0)%2);}   // its look's baked tile lands on it (vis/props.js)
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
  wallBoards(g,F,H,lite);
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
  AR.haz=A.haz.map(h=>{if(h.type==="flame")return flameMesh(g,h,X,Z,lite);if(h.type==="pusher"){const r=h.rect,w=X(r[2])-X(r[0]),d=Z(r[1])-Z(r[3]);
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,kh*0.9,d),M.haz.clone());m.userData.own=true;m.position.set(X((r[0]+r[2])/2),kh*0.45,Z((r[1]+r[3])/2));m.castShadow=!lite;g.add(m);
      return{h,m,base:m.position.clone(),n:[h.n[0],-h.n[1]],reach:Math.min(w,d)*0.8,w,d,ht:kh*0.9};}
    const R=h.rM*U,m=new THREE.Mesh(new THREE.CylinderGeometry(R,R,0.03,lite?24:40),M.haz.clone());m.userData.own=true;m.position.set(X(h.at[0]),0.016,Z(h.at[1]));g.add(m);
    const bar=new THREE.Mesh(new THREE.BoxGeometry(R*1.8,0.04,R*0.25),M.steel);bar.position.y=0.03;m.add(bar);
    return{h,m,R,bar};});
  AR.rings=drillRings(g,F,X,Z,U,lite);
  /* bots */
  AR.bots=F.bots.map(o=>{const team=o.team!=null?o.team:o.i,mesh=botMesh(o.b,team,o.i===0?V.paint:null,o.livery||null);g.add(mesh);mesh.scale.setScalar(U);
    const B={o,mesh,flipT:-9,shots:o.wp.shots,kickT:-9,kshots:o.kick?o.kick.shots:0,fall:0,inv:o.inverted?1:0,wheelA:0,armA:0,flash:0,flashT:-1e9};
    if(!o.mini){B.tag=botTag(o.name,team,lite,o.livery);g.add(B.tag);}
    B.blob=blobMake(o.b.widthM*U,o.b.lengthM*U);B.blob.position.y=0.008;g.add(B.blob);
    return B;});
  /* lights for the arena: a soft sky, one key light (shadows on Full and Ultra), a warm rim */
  const LK=arenaLook(F),L=new THREE.Group();L.add(new THREE.HemisphereLight(LK.sky,LK.gnd,lite?.85:.24));
  const key=new THREE.DirectionalLight(LK.key,lite?1.0:1.0);key.position.set(-H*0.6,H*2.2,H*0.9);
  if(!lite){key.castShadow=true;key.shadow.mapSize.set(LOOK.shadow[V.tier],LOOK.shadow[V.tier]);const c=key.shadow.camera;c.left=c.bottom=-H-1;c.right=c.top=H+1;c.near=1;c.far=H*5;key.shadow.bias=-.0008;key.shadow.radius=2;}
  L.add(key);const rim=new THREE.DirectionalLight(LK.rim[0],LK.rim[1]);rim.position.set(H,H*0.6,-H*1.5);L.add(rim);
  /* Full and Ultra: the rig over the arena, a warm white spot that lights the square and lets the floor round it fall away */
  if(!lite){const sp=new THREE.SpotLight(LK.spot,1.45,0,Math.atan(1.25/2.6),0.7,0);sp.position.set(0,H*2.6,0);sp.target.position.set(0,0,0);L.add(sp,sp.target);}
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
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true,toneMapped:false}));
  sp.center.set(0.5,0);sp.renderOrder=6;sp.userData.own=true;sp.userData.asp=W/Hh;return sp;}
const FLASH_COL=new THREE.Color(0xfff1d6).convertSRGBToLinear();
/* the floor markings as a canvas texture over the arena square (S px a side, the top row the far wall): a grid every 30 cm
   (beetle scale), a border line, a centre circle, hatched bands where the wall rams reach, a ring round each floor spinner
   and a striped edge round the pit. Lite gets an opaque texture with the plate's colour and a soft pool of light painted
   in; Full and Ultra a see-through decal over the photo plate, with the pit cut out so the kit's real hole shows. */
function arenaDecal(F,U,H,lite){const S=lite?512:1024,c=document.createElement("canvas");c.width=c.height=S;const g=c.getContext("2d"),A=F.arena,k=S/(2*H);
  const px=x=>(x*U+H)*k,py=y=>(-y*U+H)*k,u=v=>v*U*k;   // sim metres to canvas px
  const LK=arenaLook(F),lk=A.def&&A.def.look;
  if(lite){const r=g.createRadialGradient(S/2,S/2,S*0.05,S/2,S/2,S*0.72);r.addColorStop(0,LK.floor[0]);r.addColorStop(.6,LK.floor[1]);r.addColorStop(1,LK.floor[2]);g.fillStyle=r;g.fillRect(0,0,S,S);}

  if(lk)arenaPaint(g,lk,A,S,k,px,py,u,lite);   // the venue's own floor (under the markings)
  const step=0.3*4*k,lw=Math.max(1,S/512);   // the grid: Lite only (0.1.42: Full and Ultra have real seams in the floor's tile)
  if(lite){g.strokeStyle="rgba(120,114,100,.32)";g.lineWidth=lw;g.beginPath();
    for(let v=step;v<S-1;v+=step){g.moveTo(v,0);g.lineTo(v,S);g.moveTo(0,v);g.lineTo(S,v);}g.stroke();}
  const line=lite?"rgba(226,220,206,.5)":"rgba(226,220,206,.55)";g.strokeStyle=line;   // the border, a little in from the kerb, and the centre circle
  const ins=0.18*4*k;g.lineWidth=lw*3;g.strokeRect(ins,ins,S-2*ins,S-2*ins);
  g.lineWidth=lw*2.5;g.beginPath();g.arc(S/2,S/2,Math.min(S*0.14,u(A.half*0.28)),0,7);g.stroke();
  g.beginPath();g.moveTo(S/2-lw*12,S/2);g.lineTo(S/2+lw*12,S/2);g.moveTo(S/2,S/2-lw*12);g.lineTo(S/2,S/2+lw*12);g.stroke();
  const hatch=(x0,y0,w,h,col,wid)=>{g.save();g.beginPath();g.rect(x0,y0,w,h);g.clip();g.strokeStyle=col;g.lineWidth=wid;g.beginPath();
    for(let t=-h;t<w+h;t+=wid*2.6){g.moveTo(x0+t,y0+h);g.lineTo(x0+t+h,y0);}g.stroke();g.restore();};
  for(const h of A.haz){if(h.type==="pusher"){const r=h.rect,reach=Math.min(r[2]-r[0],r[3]-r[1])*0.8*1.6;   // the band a ram reaches into
      let x0=r[0],x1=r[2],y0=r[1],y1=r[3];if(h.n[0]>0){x0=r[2];x1=r[2]+reach;}else if(h.n[0]<0){x1=r[0];x0=r[0]-reach;}else if(h.n[1]>0){y0=r[3];y1=r[3]+reach;}else{y1=r[1];y0=r[1]-reach;}
      const X0=px(x0),X1=px(x1),Y0=py(y1),Y1=py(y0);hatch(X0,Y0,X1-X0,Y1-Y0,"rgba(226,169,59,.32)",lw*5);g.strokeStyle="rgba(226,169,59,.55)";g.lineWidth=lw*2;g.strokeRect(X0,Y0,X1-X0,Y1-Y0);}
    else if(h.type==="flame"){const r=h.rect,X0=px(r[0]),X1=px(r[2]),Y0=py(r[3]),Y1=py(r[1]),W=X1-X0,Hh=Y1-Y0,m=lw*9;   // a flame grate: a scorched patch, a dashed keep-off box, the bars
      const sc=g.createRadialGradient((X0+X1)/2,(Y0+Y1)/2,Math.min(W,Hh)*0.3,(X0+X1)/2,(Y0+Y1)/2,Math.max(W,Hh)*0.85);sc.addColorStop(0,"rgba(12,11,10,.55)");sc.addColorStop(1,"rgba(12,11,10,0)");g.fillStyle=sc;g.fillRect(X0-W*0.5,Y0-Hh,W*2,Hh*3);
      g.fillStyle="rgba(10,10,10,.8)";g.fillRect(X0,Y0,W,Hh);g.strokeStyle="rgba(150,152,150,.55)";g.lineWidth=lw*2;const nb=9,alongX=W>=Hh;
      g.beginPath();for(let i=1;i<nb;i++){if(alongX){const x=X0+W*i/nb;g.moveTo(x,Y0);g.lineTo(x,Y1);}else{const y=Y0+Hh*i/nb;g.moveTo(X0,y);g.lineTo(X1,y);}}g.stroke();g.strokeRect(X0,Y0,W,Hh);
      g.strokeStyle="rgba(226,169,59,.6)";g.lineWidth=lw*3;g.setLineDash([lw*10,lw*7]);g.strokeRect(X0-m,Y0-m,W+2*m,Hh+2*m);g.setLineDash([]);}
    else{g.strokeStyle="rgba(226,169,59,.6)";g.lineWidth=lw*4;g.setLineDash([lw*10,lw*7]);g.beginPath();g.arc(px(h.at[0]),py(h.at[1]),u(h.rM)*1.35,0,7);g.stroke();g.setLineDash([]);}}
  arenaWear(g,S,k,F,LK,lite);   // 0.1.42: a floor that has been fought on (before the pit, whose edge is kept fresh)
  if(A.pit){const r=A.pit.rect,X0=px(r[0]),X1=px(r[2]),Y0=py(r[3]),Y1=py(r[1]),b=0.06*4*k;   // the pit: striped edge, the hole cut out on Full
    g.save();g.beginPath();g.rect(X0-b,Y0-b,X1-X0+2*b,Y1-Y0+2*b);g.clip();g.fillStyle="#e2a93b";g.fillRect(X0-b,Y0-b,X1-X0+2*b,Y1-Y0+2*b);
    g.strokeStyle="#141311";g.lineWidth=b*0.7;g.beginPath();const D=Y1-Y0+2*b;for(let t=-D;t<X1-X0+2*b+D;t+=b*1.6){g.moveTo(X0-b+t,Y1+b);g.lineTo(X0-b+t+D,Y0-b);}g.stroke();g.restore();
    if(lite){g.fillStyle="#050505";g.fillRect(X0,Y0,X1-X0,Y1-Y0);}else g.clearRect(X0,Y0,X1-X0,Y1-Y0);}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.premultiplyAlpha=!lite;t.anisotropy=lite?1:Math.min(8,V.r.capabilities.getMaxAnisotropy());return t;}
/* wear over the whole floor (0.1.42), drawn once into the markings' canvas, so it costs nothing per frame on any tier and
   does not repeat the way the floor's tile does: the painted lines rubbed through in strokes and specks, pairs of tyre
   marks in arcs, soot in patches and round each floor spinner, bright scrapes where the rams push, and grime along the
   kerbs. From a seed made of the arena's id, so an arena is worn the same way every time. Lite paints the rubbing in the
   floor's colour (its canvas is the floor itself); Full and Ultra cut it out of the see-through markings. */
function arenaWear(g,S,k,F,LK,lite){const A=F.arena,lw=S/512;let q=7;for(const c of String(A.id||"arena"))q=(q*31+c.charCodeAt(0))%2147483647;q=q||7;const r=()=>(q=(q*16807)%2147483647)/2147483647;
  g.save();g.lineCap="round";
  /* the paint, rubbed through */
  if(lite)g.strokeStyle=g.fillStyle=LK.floor[1];else g.globalCompositeOperation="destination-out";
  for(let i=0;i<150;i++){const x=r()*S,y=r()*S,a=r()*6.283,l=S*(0.01+r()*0.05);g.globalAlpha=lite?0.25+r()*0.3:0.3+r()*0.5;g.lineWidth=lw*(1.5+r()*5);if(!lite)g.strokeStyle="#000";
    g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a)*l*0.5+(r()-.5)*l*0.4,y+Math.sin(a)*l*0.5+(r()-.5)*l*0.4,x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
  if(!lite)g.fillStyle="#000";for(let i=0;i<(lite?260:700);i++){g.globalAlpha=0.3+r()*0.6;g.beginPath();g.arc(r()*S,r()*S,lw*(0.5+r()*1.6),0,7);g.fill();}
  g.globalCompositeOperation="source-over";
  /* tyre marks: two short arcs a track apart, each through a spot of its own on the floor with a turn of its own (arcs
     that shared a middle read as rings) */
  const tw=0.7*k;g.strokeStyle="#0a0a0a";g.lineWidth=Math.max(1,0.11*k);
  for(let i=0;i<(lite?10:22);i++){const px=S*(0.08+r()*0.84),py=S*(0.08+r()*0.84),R=S*(0.04+r()*0.22),a0=r()*6.283,da=Math.min(1.3,S*(0.05+r()*0.13)/R);
    const cx=px-Math.cos(a0)*R,cy=py-Math.sin(a0)*R;g.globalAlpha=0.06+r()*0.1;
    for(const o of [0,tw]){g.beginPath();g.arc(cx,cy,R+o,a0-da/2,a0+da/2);g.stroke();}}
  /* soot: patches, and a ring round each floor spinner */
  const soot=(x,y,R,al)=>{const gr=g.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,"rgba(8,7,6,"+al+")");gr.addColorStop(1,"rgba(8,7,6,0)");g.fillStyle=gr;g.fillRect(x-R,y-R,2*R,2*R);};
  g.globalAlpha=1;for(let i=0;i<(lite?6:12);i++)soot(r()*S,r()*S,S*(0.03+r()*0.07),0.1+r()*0.16);
  for(const h of A.haz){if(h.type==="spinner"){const x=(h.at[0]*AR.U+A.half*AR.U)*k,y=(-h.at[1]*AR.U+A.half*AR.U)*k,R=h.rM*AR.U*k;
      const gr=g.createRadialGradient(x,y,R*0.9,x,y,R*1.9);gr.addColorStop(0,"rgba(8,7,6,.34)");gr.addColorStop(1,"rgba(8,7,6,0)");g.fillStyle=gr;g.fillRect(x-R*2,y-R*2,R*4,R*4);}
    else if(h.type==="pusher"){   // scrapes the way the ram shoves
      const rc=h.rect,X=v=>(v*AR.U+A.half*AR.U)*k,Y=v=>(-v*AR.U+A.half*AR.U)*k,reach=Math.min(rc[2]-rc[0],rc[3]-rc[1])*1.6*AR.U*k,nx=h.n[0],ny=-h.n[1];
      g.strokeStyle=lite?"rgba(150,146,136,.5)":"rgba(206,204,196,.5)";g.lineWidth=Math.max(1,lw);
      for(let i=0;i<26;i++){const t=r(),x0=nx?X(nx>0?rc[2]:rc[0]):X(rc[0]+(rc[2]-rc[0])*t),y0=ny?Y(ny<0?rc[3]:rc[1]):Y(rc[1]+(rc[3]-rc[1])*t),l=reach*(0.3+r()*0.9),o=r()*reach*0.4;
        g.globalAlpha=0.15+r()*0.3;g.beginPath();g.moveTo(x0+nx*o,y0+ny*o);g.lineTo(x0+nx*(o+l),y0+ny*(o+l));g.stroke();}g.globalAlpha=1;}}
  /* grime along the kerbs */
  const e=S*0.075,al=lite?0.16:0.34;for(const [x0,y0,x1,y1,w,h] of [[0,0,e,0,e,S],[S,0,S-e,0,-e,S],[0,0,0,e,S,e],[0,S,0,S-e,S,-e]]){const gr=g.createLinearGradient(x0,y0,x1,y1);
    gr.addColorStop(0,"rgba(9,8,7,"+al+")");gr.addColorStop(1,"rgba(9,8,7,0)");g.fillStyle=gr;g.fillRect(Math.min(x0,x0+w),Math.min(y0,y0+h),Math.abs(w),Math.abs(h));}
  g.restore();}
/* a venue's floor paint (0.1.28.0), under the common markings: canvas g, S px a side, px/py/u sim metres to px (k px a
   scene unit). Drawn once into the floor's texture, so it costs nothing per frame on any tier. */
function arenaPaint(g,lk,A,S,k,px,py,u,lite){const lw=Math.max(1,S/512),m=0.3*4*k/0.3;   // m: px per beetle metre
  if(lk==="mill"){   // steel plates, 60 cm, rivets at the corners; the slag trough glows
    if(lite){const p=0.6*m;g.strokeStyle="rgba(16,12,10,.55)";g.lineWidth=lw*2.5;g.beginPath();   // Full and Ultra: the welded plates are the floor's tile
      for(let v=p;v<S-1;v+=p){g.moveTo(v,0);g.lineTo(v,S);g.moveTo(0,v);g.lineTo(S,v);}g.stroke();
      g.fillStyle="rgba(150,140,128,.35)";for(let x=p;x<S;x+=p)for(let y=p;y<S;y+=p)for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){g.beginPath();g.arc(x+dx*lw*6,y+dy*lw*6,lw*1.6,0,7);g.fill();}}
    if(A.pit){const r=A.pit.rect,X0=px(r[0]),X1=px(r[2]),Y0=py(r[3]),Y1=py(r[1]),cx=(X0+X1)/2,cy=(Y0+Y1)/2,R=Math.max(X1-X0,Y1-Y0)*0.9;
      const gr=g.createRadialGradient(cx,cy,0,cx,cy,R);gr.addColorStop(0,"rgba(255,120,40,.32)");gr.addColorStop(1,"rgba(255,120,40,0)");g.fillStyle=gr;g.fillRect(cx-R,cy-R,2*R,2*R);}}
  else if(lk==="port"){   // a timber deck: 15 cm planks with staggered butt joints, a yellow quay line, bollards in the corners
    const turn=(A.turn||0)%2,p=0.15*m,j=1.2*m;
    if(lite){g.strokeStyle="rgba(14,16,18,.5)";g.lineWidth=lw*1.5;g.beginPath();   // Full and Ultra: the planks are the floor's tile
      for(let v=p,i=0;v<S-1;v+=p,i++){if(turn){g.moveTo(v,0);g.lineTo(v,S);}else{g.moveTo(0,v);g.lineTo(S,v);}
        for(let w=(i%3)*j/3;w<S;w+=j){if(turn){g.moveTo(v-p,w);g.lineTo(v,w);}else{g.moveTo(w,v-p);g.lineTo(w,v);}}}g.stroke();}
    const q=0.32*m;g.strokeStyle="rgba(226,190,60,.5)";g.lineWidth=lw*4;g.setLineDash([lw*18,lw*10]);g.strokeRect(q,q,S-2*q,S-2*q);g.setLineDash([]);
    const b=0.09*m,o=0.3*m;g.fillStyle="rgba(20,22,24,.75)";g.strokeStyle="rgba(226,190,60,.55)";g.lineWidth=lw*2;
    for(const [x,y] of [[o,o],[S-o,o],[o,S-o],[S-o,S-o]]){g.beginPath();g.arc(x,y,b,0,7);g.fill();g.stroke();}}
  else if(lk==="shed"){   // two rails through the turntable, on sleepers; the turntable's spokes
    const turn=(A.turn||0)%2,c=S/2,gauge=0.16*m,sl=0.26*m,sw=0.05*m;
    g.fillStyle=lite?"rgba(40,32,24,.6)":"rgba(40,32,24,.5)";for(let v=sl/2;v<S;v+=sl){if(turn)g.fillRect(c-gauge*0.85,v-sw/2,gauge*1.7,sw);else g.fillRect(v-sw/2,c-gauge*0.85,sw,gauge*1.7);}
    g.strokeStyle=lite?"rgba(170,172,168,.55)":"rgba(190,192,188,.5)";g.lineWidth=lw*3;g.beginPath();
    for(const s of [-1,1]){const o=c+s*gauge/2;if(turn){g.moveTo(o,0);g.lineTo(o,S);}else{g.moveTo(0,o);g.lineTo(S,o);}}g.stroke();
    const tt=A.haz.find(h=>h.type==="spinner");if(tt){const x=px(tt.at[0]),y=py(tt.at[1]),R=u(tt.rM);g.fillStyle=lite?"rgba(20,20,18,.45)":"rgba(20,20,18,.35)";g.beginPath();g.arc(x,y,R*1.12,0,7);g.fill();
      g.strokeStyle="rgba(190,192,188,.35)";g.lineWidth=lw*2;g.beginPath();for(let i=0;i<12;i++){const a=i*Math.PI/6;g.moveTo(x+Math.cos(a)*R*0.2,y+Math.sin(a)*R*0.2);g.lineTo(x+Math.cos(a)*R,y+Math.sin(a)*R);}g.stroke();}}}
/* a flame grate (0.1.37): a dark plate in the floor (its bars are painted on the floor by arenaDecal; Full and Ultra put
   the kit's grate in it) and its flames, cones that stand up and flicker while it burns and sit low as a pilot light
   before. Lite: three plain cones, no blending. Full and Ultra: seven, two layers, additive. Nothing here casts a light. */
/* a driving-school drill's rings (0.1.47, sim/school.js F.drill): flat rings on the floor on every tier. The one you're on
   is clay, the ones to come are faint, the ones done are gone; a hold drill's ring is lilac and stays. */
function drillRings(g,F,X,Z,U,lite){const D=F.drill;if(!D)return null;const out=[],C=x=>new THREE.Color(x).convertSRGBToLinear();
  const mk=(x,y,r,col)=>{const m=new THREE.Mesh(new THREE.RingGeometry(r*U*0.8,r*U,lite?20:40),new THREE.MeshBasicMaterial({color:C(col),transparent:true,opacity:0.9,depthWrite:false,fog:false}));
    m.userData.own=true;m.rotation.x=-Math.PI/2;m.position.set(X(x),0.022,Z(y));m.renderOrder=2;g.add(m);return m;};
  D.steps.forEach((s,i)=>{if(s.go)out.push({i,m:mk(s.go[0],s.go[1],s.r,0xD97757),st:-1});});
  if(D.zone)out.push({zone:true,m:mk(D.zone[0],D.zone[1],D.zone[2],0xB48CE8)});
  return out;}
function drillRingsTick(F){const D=F.drill;if(!D||!AR.rings)return;
  for(const q of AR.rings){if(q.zone)continue;const st=q.i<D.k?0:q.i===D.k?2:1;if(q.st===st)continue;q.st=st;q.m.visible=st>0;q.m.material.opacity=st===2?0.95:0.28;}}
function flameMesh(g,h,X,Z,lite){const r=h.rect,w=X(r[2])-X(r[0]),d=Z(r[1])-Z(r[3]),cx=X((r[0]+r[2])/2),cz=Z((r[1]+r[3])/2);
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.012,d),V.mats.haz.clone());m.userData.own=true;m.position.set(cx,0.008,cz);g.add(m);
  const long=w>=d,L=Math.max(w,d),T=Math.min(w,d),n=lite?3:4,fl=[],C=x=>new THREE.Color(x).convertSRGBToLinear();
  const mk=(col,op)=>{const mt=new THREE.MeshBasicMaterial({color:C(col),transparent:true,opacity:lite?0.6:op,depthWrite:false,fog:false});if(!lite)mt.blending=THREE.AdditiveBlending;return mt;};   // Lite: three plain see-through cones (a bot in the fire still shows), no additive blend
  const outer=mk(0xff7a1a,0.55),inner=lite?null:mk(0xffd66b,0.7),geo=new THREE.ConeGeometry(1,1,lite?6:10,1,true);geo.translate(0,0.5,0);
  for(let i=0;i<n;i++){const u=(i+0.5)/n-0.5,c=new THREE.Mesh(geo,outer);c.userData.own=true;c.position.set(long?u*L*0.9:0,0.02,long?0:u*L*0.9);c.visible=false;m.add(c);fl.push({c,R:T*(lite?0.34:0.4),H:T*(lite?1.5:2),k:i*1.7});
    if(inner){const c2=new THREE.Mesh(geo,inner);c2.userData.own=true;c2.position.copy(c.position);c2.visible=false;m.add(c2);fl.push({c:c2,R:T*0.24,H:T*1.3,k:i*2.3+1});}}
  return{h,m,w,d,fl,flameMats:[outer,inner]};}
function flameTick(z,ph,now){const t=now/1000;for(const f of z.fl){if(!ph){f.c.visible=false;continue;}const s=ph===2?1:0.14,fk=ph===2?0.78+0.22*Math.sin(t*23+f.k)+0.1*Math.sin(t*41+f.k*3):0.9+0.1*Math.sin(t*9+f.k);
    f.c.visible=true;f.c.scale.set(f.R*(ph===2?1:0.5),f.H*s*fk,f.R*(ph===2?1:0.5));}}
/* lamps and hazards: amber while they fire, and glowing on Full and Ultra (Lite keeps the plain colour change) */
function hazLit(m,on){m.color.copy(on?V.mats.hazOn.color:V.mats.haz.color);if(m.emissive&&V.tier!=="lite")m.emissive.copy(V.mats.hazOn.color).multiplyScalar(on?.7:0);}
/* the same fight again from another moment (a replay seek: the app re-runs the sim from the start): keep the scene, point
   it at the new F. Only when the arena and the bots are the same; otherwise false and the caller builds afresh. */
function arenaRebind(F){if(!AR.F||!AR.g||AR.F.seed!==F.seed||AR.F.arena.id!==F.arena.id||AR.F.bots.length!==F.bots.length)return false;
  AR.F=F;AR.pitOpenAt=null;AR.bots.forEach((B,i)=>{const o=F.bots[i];B.o=o;B.fall=0;B.inv=o.inverted?1:0;B.shots=o.wp.shots;B.flipT=-9;B.kshots=o.kick?o.kick.shots:0;B.kickT=-9;B.mesh.visible=true;wearClear(B);});
  for(const c of FX.chunks){c.m.parent&&c.m.parent.remove(c.m);c.m.material.dispose();}FX.chunks=[];
  for(const n of FX.nums)fxNumDrop(n);FX.nums=[];markClear();return true;}
/* each frame: put the bots where the sim says, animate weapons, hazards and the pit, move the camera */
/* the fight camera's feel (0.1.50): near, how much of the near side's narrowing the zoom allows for; band, how much closer
   the bots must be before it zooms back in; out and inn, how fast it pulls out and closes in (per second); edge, the
   margin (a share of the half screen) the bot you drive is kept inside */
const CAM={near:0.85,band:0.14,out:4,inn:1.1,edge:0.07};
function arenaTick(dt,now){const F=AR.F;if(!F||!AR.g)return;const U=AR.U;
  for(const B of AR.bots){const o=B.o,m=B.mesh,u=m.userData;
    /* falling into the pit: sink and fade out over half a second */
    botMarks(B,dt);fwdMark(B);
    if(o.out==="pit"){B.fall=Math.min(1,B.fall+dt*2);m.position.y=-B.fall*3;m.visible=B.fall<1;if(B.blob)B.blob.visible=false;continue;}
    B.inv+=((o.inverted?1:0)-B.inv)*Math.min(1,dt*10);   // roll over smoothly when the sim flips it
    m.position.set(o.x*U,(o.z||0)*U+B.inv*(u.H||0.05)*U,-o.y*U);
    /* a meltybrain (0.1.34) turns as a whole, at its weapon's speed (capped like a disc's); o.h stays its heading */
    if(u.melty&&!(o.fx&&o.fx.weaponOk===false))B.meltA=((B.meltA||0)+Math.min(o.wp.om,45)*dt)%(2*Math.PI);
    m.rotation.set(0,o.h-Math.PI/2+(u.melty?B.meltA||0:0),0);m.rotateZ(B.inv*Math.PI);
    if(B.blob){const bl=B.blob,up=(o.z||0)*U;bl.visible=m.visible;bl.position.x=m.position.x;bl.position.z=m.position.z;bl.rotation.y=o.h-Math.PI/2;bl.material.opacity=bl.userData.op/(1+up*2.5);}   // fainter the higher the bot is thrown
    if(o.held!=null)m.rotateX(0.35);else if(o.under)m.rotateX(0.12);
    /* wheels turn with speed */
    const sp=(Math.cos(o.h)*o.vx+Math.sin(o.h)*o.vy);B.wheelA-=sp*dt/(0.028*o.M.len);for(const w of u.wheels)if(w.geometry.type!=="BoxGeometry")w.rotation.x=B.wheelA;   // not tracks (a box); the Blender mecanum pieces turn too
    /* tracks (0.1.41, Full / Ultra): the belt's sections move one link and snap back, the sprockets turn at the belt's speed */
    if(u.trk&&u.trk.length){const d=-B.wheelA*0.028*o.M.len;for(const G of u.trk){const t=G.userData.tk;
      if(t.kind==="spr"){G.rotation.x=-d/t.r;continue;}const pr=t.kind==="arc"?t.pr:t.p,f0=d/pr,f=f0-Math.floor(f0);
      if(t.kind==="arc")G.rotation.x=-f*t.p;else G.position.z=t.z0+(t.kind==="top"?-1:1)*f*t.p;}}
    if(u.lamp)u.lamp.material.emissiveIntensity=o.out?0:DETAIL_LAMP;   // the power light goes out with the bot
    /* shuffler legs (0.1.34): each foot lifts and swings in turn, at the walking pace (turning on the spot walks too) */
    if(u.legs&&u.legs.length){B.legA=(B.legA||0)+(Math.abs(sp)/(0.028*o.M.len)+Math.abs(o.w||0)*2)*dt*0.5;
      for(const L of u.legs){const s=Math.sin(B.legA+L.userData.ph),H=u.H||0.05;L.position.y=Math.max(0,s)*H*0.18;L.rotation.x=Math.cos(B.legA+L.userData.ph)*0.25;}}
    /* the weapon */
    const W=o.b.weapon;
    if(u.spin){const r=Math.min(o.wp.om,45);u.spin.rotation[u.spin.userData.axis]+=r*dt*(u.spin.userData.axis==="x"?-1:1);
      if(u.blur)u.blur.material.opacity=o.fx&&o.fx.weaponOk===false?0:0.45*Math.min(1,o.wp.om/(W.omega||1));
      u.spin.visible=!(o.fx&&o.fx.weaponOk===false&&o.st.parts.weapon<=0);}
    if(u.flip){if(o.wp.shots<B.shots)B.flipT=now;B.shots=o.wp.shots;const k=Math.max(0,1-(now-B.flipT)/350);u.flip.rotation.x=1.1*Math.sin(Math.min(1,k*1.4)*Math.PI/2);}
    if(u.spear){if(o.wp.shots<B.shots)B.stabT=now;B.shots=o.wp.shots;   // 0.1.64: the spear shoots out the stroke and draws back
      const t=now-(B.stabT||-1e9),k=t<60?t/60:Math.max(0,1-(t-60)/260);u.spear.position.z=u.spear.userData.z0-u.spear.userData.stroke*k;}
    if(u.flame){const on=!!(o.fl&&o.fl.on&&!o.out);u.flame.visible=on;   // 0.1.66: the flame shows while it burns and flickers
      if(on&&!V.run.reduce){const f=Math.sin(now/1000*23+o.i*1.7)*0.5+Math.sin(now/1000*37)*0.5;u.flame.scale.set(1+0.08*f,1+0.08*f,0.85+0.15*f);}}
    /* 0.1.65: a clamp and lift's forks and jaw rise with what they hold, to the height the sim has it at */
    const hb=W.clamp&&o.wp.held!=null?F.bots[o.wp.held]:null,hz=hb&&!hb.air?hb.z||0:0;
    if(u.forks){const want=o.wp.held!=null?(W.clamp?Math.atan2(hz,u.forks.userData.len||0.1):0.45):0;u.forks.rotation.x+=(want-u.forks.rotation.x)*Math.min(1,dt*8);}
    if(u.jaw){const want=o.wp.grab?0.05+(W.clamp?Math.atan2(hz,u.jaw.userData.len||0.1):0):0.35;u.jaw.rotation.x+=(want-u.jaw.rotation.x)*Math.min(1,dt*12);}   // the grabber's jaw shuts on a bot it holds
    if(u.kick&&o.kick){if(o.kick.shots<B.kshots)B.kickT=now;B.kshots=o.kick.shots;   // the back-up flipper's plate kicks up when it fires
      const k=Math.max(0,1-(now-B.kickT)/350),r=u.kick.userData.rest||0;u.kick.rotation.x=r-(r+1.0)*Math.sin(Math.min(1,k*1.4)*Math.PI/2);}
    if(u.arm){const ph=o.wp.phase,S=W.swingS||0.7,t=o.wp.t||0;let a=0.9;
      if(ph===1)a=0.9-1.25*Math.min(1,t/(W.type==="hammer"?S/2:S));else if(ph===2)a=-0.35+1.25*Math.min(1,t/0.5);
      if(W.type==="crusher")a=a*0.4;u.arm.rotation.x=a;}}
  /* hazards: lit while they fire; a pusher shoves out, a floor spinner spins, a flame grate shows its pilot and then burns */
  let any=false;
  AR.haz.forEach((z,i)=>{const s=F.hz[i];if(z.fl){const ph=s?s.ph|0:0;any=any||ph===2;hazLit(z.m.material,ph>0);if(z.glow)hazLit(z.glow,ph>0);flameTick(z,ph,now);return;}
    const on=s&&F.t<s.until;any=any||on;hazLit(z.m.material,on);if(z.glow)hazLit(z.glow,on);
    if(z.h.type==="pusher"){const k=on?Math.min(1,(z.h.activeS-(s.until-F.t))/0.08):0;z.m.position.set(z.base.x+z.n[0]*z.reach*k,z.base.y,z.base.z+z.n[1]*z.reach*k);}
    else if(on)z.m.rotation.y+=dt*18;});
  for(const l of AR.lamps||[])hazLit(l.material,any);
  drillRingsTick(F);
  /* the pit cover slides off when it opens */
  if(AR.pitCover){const open=F.arena.pit&&F.t>=F.arena.pit.openS;if(open&&AR.pitOpenAt==null)AR.pitOpenAt=now;
    const k=AR.pitOpenAt==null?0:Math.min(1,(now-AR.pitOpenAt)/600);AR.pitCover.m.position.x=AR.pitCover.x0+AR.pitCover.w*1.05*k;AR.pitCover.m.visible=k<1;}
  /* camera: frame the box round the bots still in it (minibots don't count), in the band the HUD leaves clear */
  let live=AR.bots.filter(B=>!B.o.out&&!B.o.mini);if(!live.length)live=AR.bots.filter(B=>!B.o.out);
  const H=F.arena.half*U,pitch=0.98,sp=Math.sin(pitch),c=AR.cam;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,rM=0.3;
  for(const B of live){const x=B.o.x*U,z=-B.o.y*U,r=botR(B.o)*U*1.25;rM=Math.max(rM,r);x0=Math.min(x0,x-r);x1=Math.max(x1,x+r);z0=Math.min(z0,z-r);z1=Math.max(z1,z+r);}
  /* a drill (0.1.47): the ring you're on, the one after it and the hold ring are in the frame too, so you can see where to go */
  if(F.drill&&live.length){const D=F.drill,inc=(px,py,r)=>{const x=px*U,z=-py*U,q=r*U;x0=Math.min(x0,x-q);x1=Math.max(x1,x+q);z0=Math.min(z0,z-q);z1=Math.max(z1,z+q);};
    for(let i=D.k;i<D.k+2&&i<D.steps.length;i++){const q=D.steps[i];if(q.go)inc(q.go[0],q.go[1],q.r);}if(D.zone)inc(D.zone[0],D.zone[1],D.zone[2]);
    if(D.steps[D.k]&&D.steps[D.k].pit&&F.arena.pit){const r=F.arena.pit.rect;inc((r[0]+r[2])/2,(r[1]+r[3])/2,(r[2]-r[0])/2);}}
  if(!live.length){x0=z0=-H;x1=z1=H;}
  const pad=rM*1.1,minS=Math.max(2.2,rM*4.6),maxS=2*H+1.5,spX=Math.max(minS,Math.min(maxS,x1-x0+2*pad)),spZ=Math.max(minS*0.8,Math.min(maxS,z1-z0+2*pad));
  const lim=H*0.95;let cx=Math.max(-lim,Math.min(lim,(x0+x1)/2)),cz=Math.max(-lim,Math.min(lim,(z0+z1)/2));
  const vh=V.h||1,vw=V.w||1,ins=V.run.inset||{},it=Math.max(0,ins.t||0),ib=Math.max(0,ins.b||0),fh=Math.max(0.4,(vh-it-ib)/vh);
  const tH=Math.tan(V.cam.fov*Math.PI/360),tW=tH*vw/vh,zoom=Math.max(0.5,Math.min(2,V.run.zoom||1));
  const cp=Math.cos(pitch),wantD=Math.max(spX/2/tW+cp*spZ/2*CAM.near,spZ*1.15*sp/2/(tH*fh))*zoom;   // 1.15: the near side looks bigger in perspective; cp*spZ/2: and it is narrower, so a wide box needs more room (0.1.50)
  /* a calmer zoom (0.1.50): the distance it settles on follows the bots out at once, but only comes back in when they
     are a good deal closer (CAM.band), so it stops breathing in and out with every shove */
  if(!(c.wd>0)||wantD>c.wd||wantD<c.wd*(1-CAM.band))c.wd=wantD;
  const kd=Math.min(1,dt*(c.wd>c.d?CAM.out:CAM.inn)),k=Math.min(1,dt*4);   // pull out quickly when they split, close in gently
  c.d+=(c.wd-c.d)*kd;
  cz-=((it-ib)/vh)*c.d*tH/sp;   // aim past the middle so the bots sit in the clear band, not under the cards
  c.x+=(cx-c.x)*k;c.z+=(cz-c.z)*k;
  /* the bot you drive is never off the screen (0.1.50; V.run.mark, live fights only): if the smoothed frame would cut it
     off at a side, or put it under the cards or the controls, the frame moves over by just that much, this frame.
     A point dz toward the camera from the aim sits at depth d-cp*dz, so the view is narrower there. */
  {const me=V.run.mark!=null?AR.bots.find(B=>B.o.i===V.run.mark&&!B.o.out):null;
    if(me){const mx=me.o.x*U,mz=-me.o.y*U,r=botR(me.o)*U*1.25,m=CAM.edge,D=c.d;
      const dzAt=y=>-y*D*tH/(sp-y*cp*tH),yT=1-2*it/vh-m,yB=-1+2*ib/vh+m;   // how far from the aim a screen height (-1..1) is on the floor
      if(yT>yB){const lo=dzAt(yT)+r,hi=dzAt(yB)-r;if(lo<hi){const dz=mz-c.z;if(dz<lo)c.z=mz-lo;else if(dz>hi)c.z=mz-hi;}}
      const half=Math.max(0.05,(D-cp*(mz-c.z))*tW*(1-m)-r),dx=mx-c.x;if(dx>half)c.x=mx-half;else if(dx<-half)c.x=mx+half;}}
  const d=c.d;
  let sx=0,sy=0;if(c.shake>0&&!V.run.reduce){sx=(Math.sin(now*0.091)+Math.sin(now*0.137))*c.shake;sy=(Math.cos(now*0.083)+Math.sin(now*0.121))*c.shake;}
  c.shake=Math.max(0,c.shake-dt*c.shake*6-dt*0.01);
  /* name tags keep their size on screen: 22 CSS px tall (18 in a rumble of more than two) */
  const tagPx=AR.bots.filter(B=>B.tag).length>2?18:22,tagS=tagPx/vh*2*tH;for(const B of AR.bots)if(B.tag)B.tag.scale.set(tagS*B.tag.userData.asp,tagS,1);
  V.cam.position.set(c.x+sx,Math.sin(pitch)*d+sy,c.z+Math.cos(pitch)*d);V.cam.lookAt(c.x+sx*0.5,0,c.z);}

/* the forward arrow (0.1.49): a pale chevron on the floor just ahead of the bot the app names (V.run.mark: the bot you
   are driving, or null), so which end is the front is never a guess. One flat two-triangle mesh, the same on every
   tier; it fades as the bot leaves the floor and goes with the bot when it's out */
function fwdMark(B){const o=B.o,U=AR.U,on=V.run.mark===o.i&&!o.out&&!!AR.g;
  if(!on){if(B.fwd)B.fwd.visible=false;return;}
  if(!B.fwd){const w=botR(o)*0.3*U,geo=new THREE.BufferGeometry();   // tip, left, notch; tip, notch, right (it points down -z, the bot's forward)
    geo.setAttribute("position",new THREE.Float32BufferAttribute([0,0,-w*1.15, -w,0,0, 0,0,-w*0.45, 0,0,-w*1.15, 0,0,-w*0.45, w,0,0],3));
    B.fwd=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:new THREE.Color(0xFAF9F5).convertSRGBToLinear(),transparent:true,opacity:0.55,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
    B.fwd.userData.own=true;B.fwd.raycast=()=>{};AR.g.add(B.fwd);}
  const d=Math.max(o.rad||0,botR(o))*1.1*U,up=(o.z||0)*U,m=B.fwd;
  m.visible=true;m.position.set(o.x*U+Math.cos(o.h)*d,0.012,-o.y*U-Math.sin(o.h)*d);m.rotation.y=o.h-Math.PI/2;m.material.opacity=0.55/(1+up*2.5);}
/* a bot's tag and hit flash, each frame */
function botMarks(B,dt){const o=B.o,U=AR.U,m=B.mesh,gone=!!o.out;wearTick(B,dt);
  if(B.tag){B.tag.visible=!gone;if(!gone)B.tag.position.set(o.x*U,((o.z||0)+(m.userData.H||0.05)*1.3)*U+0.3,-o.y*U);}
  if(B.flash>0||B.flashOn){B.flash=Math.max(0,B.flash-dt*6);B.flashOn=B.flash>0;const parts=m.userData.parts||{};
    const ks=B.flashKeys;
    for(const key in parts){const on=B.flash>0&&(!ks||ks.includes(key));for(const p of parts[key]){const u=p.userData;if(!u.base)continue;p.material.color.copy(u.base).multiplyScalar(u.dmul||1);if(on)p.material.color.lerp(FLASH_COL,B.flash*0.7);}}}}
/* a screen point (CSS px in the canvas) to sim metres on the floor, or null (tactical controls) */
function arenaPick(px,py){if(!AR.F||!V.w)return null;const v=new THREE.Vector3(px/V.w*2-1,-(py/V.h)*2+1,0.5).unproject(V.cam),o=V.cam.position;
  const dir=v.sub(o).normalize();if(dir.y>=-1e-4)return null;const t=-o.y/dir.y,x=o.x+dir.x*t,z=o.z+dir.z*t;return{x:x/AR.U,y:-z/AR.U};}
