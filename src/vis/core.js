<script>
/* ===================== Scrapline: 3D (SCRAP_VIS) =====================
   three.js r128. One IIFE spread over vis/core.js, bot.js, arena.js, fx.js, workshop.js and api.js; the public object is
   in api.js. The vis never reads game state and never runs the fight: SCRAP_SIM simulates, the app passes the result in.
   The app calls SCRAP_VIS.setBot(cfg), .setRun({spin}), .setView(name), .setQuality(tier) and reads .fps().
   This file: module state, the renderer, the three graphics tiers and the materials.
     lite   pixel ratio 1, Lambert / Phong materials, no shadows, no post. The phone default; it must always look finished.
     full   device pixel ratio up to 2, PBR steel and aluminium with a generated workshop reflection, soft shadows.
     ultra  as full, plus bloom (on sparks from PR 5; three.js addons loaded on demand, window.__scrPost).
   Full and Ultra also get photo textures and glTF props (vis/props.js, PR 10); Lite never loads them.
   Colours are written as sRGB hex and converted with .convertSRGBToLinear() (the renderer outputs sRGB). */
const SCRAP_VIS=(function(){
"use strict";
const V={r:null,scene:null,cam:null,canvas:null,tier:"lite",w:0,h:0,mats:null,env:null,comp:null,bloom:null,
  bot:null,shop:null,lights:null,run:{spin:1},t0:performance.now(),last:0,ang:0,
  frames:0,fpsAt:performance.now(),fpsObj:{fps:0,at:0},orbit:{yaw:-.7,pitch:.62,dist:7.5,tx:0,ty:.35,tz:0}};
const TAU=Math.PI*2;

function initRenderer(canvas){
  V.canvas=canvas;
  V.r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
  V.r.setClearColor(0x0e0e0d,1);
  V.r.outputEncoding=THREE.sRGBEncoding;
  V.scene=new THREE.Scene();
  V.scene.fog=new THREE.Fog(0x0e0e0d,12,28);
  V.cam=new THREE.PerspectiveCamera(36,1,.1,100);
}
/* a small equirect "workshop" painted on a canvas: cold strip lights and a dark room, so PBR metal has something to reflect (Full / Ultra) */
function shopEnv(){
  const c=document.createElement("canvas");c.width=256;c.height=128;const g=c.getContext("2d");
  const bg=g.createLinearGradient(0,0,0,128);bg.addColorStop(0,"#34363a");bg.addColorStop(.5,"#1a1b1c");bg.addColorStop(1,"#0b0b0b");
  g.fillStyle=bg;g.fillRect(0,0,256,128);
  g.fillStyle="rgba(225,235,245,.95)";for(const x of [30,110,190])g.fillRect(x,14,44,5);   // strip lights on the ceiling
  g.fillStyle="rgba(150,170,190,.3)";g.fillRect(150,34,60,26);                             // a high window
  const tex=new THREE.CanvasTexture(c);tex.mapping=THREE.EquirectangularReflectionMapping;tex.encoding=THREE.sRGBEncoding;
  const pm=new THREE.PMREMGenerator(V.r),rt=pm.fromEquirectangular(tex);pm.dispose();tex.dispose();
  return rt.texture;
}
/* materials per tier: the same names, cheaper shading on Lite */
function makeMats(tier){
  const lite=tier==="lite";
  if(V.mats)for(const k in V.mats)(Array.isArray(V.mats[k])?V.mats[k]:[V.mats[k]]).forEach(m=>m.dispose());
  if(!lite&&!V.env)V.env=shopEnv();
  const C=h=>new THREE.Color(h).convertSRGBToLinear();
  /* Lite has no reflection to darken bare metal, so its Phong base colour runs at 55% with a soft highlight, or polished
     steel under the overhead light reads as white plastic */
  const metal=(color,rough)=>(color=C(color),lite)
    ?new THREE.MeshPhongMaterial({color:color.multiplyScalar(.55),specular:C(0x5a5e64),shininess:Math.round(60*(1-rough))+12})
    :new THREE.MeshStandardMaterial({color,roughness:rough,metalness:1,envMap:V.env,envMapIntensity:1.5});
  const matte=(color,rough)=>(color=C(color),lite)
    ?new THREE.MeshLambertMaterial({color})
    :new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0,envMap:V.env,envMapIntensity:.4});
  V.mats={
    steel:metal(0xb4b9bf,.3),
    disc:metal(0xc9ced4,.3),
    alu:metal(0xd0d4d8,.45),
    ply:matte(0xb08a5a,.85),
    hdpe:matte(0x2b2b2a,.7),
    paint:matte(0xd97757,.5),      // clay: the starter bot wears the studio accent
    rubber:matte(0x1a1a1a,.95),
    bench:matte(0x55493c,.8),
    plate:metal(0x6d7177,.55),
    floor:matte(0x232322,1),
    ti:metal(0x9a9da3,.4),
    arenaFloor:matte(0x2e2d2a,.9),
    wall:matte(0x4a4740,.8),
    glass:new THREE.MeshBasicMaterial({color:C(0x8fa3b5),transparent:true,opacity:.12,depthWrite:false}),
    pit:new THREE.MeshBasicMaterial({color:C(0x050505)}),
    hatch:matte(0x3a352c,.9),
    haz:matte(0x6b5b3c,.6),
    hazOn:new THREE.MeshBasicMaterial({color:C(0xe2a93b)}),
    crowd:new THREE.MeshBasicMaterial({color:0xffffff}),
    blur:new THREE.MeshBasicMaterial({color:C(0xc9ced4),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),
    spark:new THREE.PointsMaterial({color:C(0xffd59a),size:lite?3:4,sizeAttenuation:false,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}),
    smoke:new THREE.MeshBasicMaterial({color:C(0x8a8a86),transparent:true,opacity:.35,depthWrite:false}),
    team:BOT_TEAM.map(h=>matte(h,.5))
  };
  /* sponsor colours (vis/bot.js), made when first asked for, kept per tier */
  if(V.spMats)for(const k in V.spMats)V.spMats[k].dispose();V.spMats={};V.spMatte=matte;
  V.mats.botPlate=V.mats.plate.clone();   // the bot's plate parts stay untextured (the photo texture lands late, after the bot is cloned)
  propDropTex();if(!lite)propDressMats(V.mats);   // photo textures on Full / Ultra (vis/props.js); old ones freed on every tier
  return V.mats;
}
