<script>
/* ===================== Scrapline: 3D (SCRAP_VIS) =====================
   three.js r128. One IIFE spread over vis/core.js, bot.js, arena.js, fx.js, workshop.js and api.js; the public object is
   in api.js. The vis never reads game state and never runs the fight: SCRAP_SIM simulates, the app passes the result in.
   The app calls SCRAP_VIS.setBot(cfg), .setRun({spin}), .setView(name), .setQuality(tier) and reads .fps().
   This file: module state, the renderer, the three graphics tiers and the materials.
     lite   pixel ratio 1, Lambert / Phong materials, no shadows, no post. The phone default; it must always look finished.
     full   device pixel ratio up to 2, PBR materials with a generated workshop reflection (vis/surface.js: the bots' brushed
            steel, mill scale, plywood grain, tread and clearcoat paint are maps made in code), soft shadows.
     ultra  as full, plus bloom (on sparks from PR 5; three.js addons loaded on demand, window.__scrPost).
   Full and Ultra also get photo textures and glTF props (vis/props.js, PR 10); Lite never loads them.
   Colours are written as sRGB hex and converted with .convertSRGBToLinear() (the renderer outputs sRGB). */
const SCRAP_VIS=(function(){
"use strict";
const V={r:null,scene:null,cam:null,canvas:null,tier:"lite",w:0,h:0,mats:null,env:null,comp:null,bloom:null,
  bot:null,shop:null,lights:null,run:{spin:1},t0:performance.now(),last:0,ang:0,
  frames:0,fpsAt:performance.now(),fpsObj:{fps:0,at:0},orbit:{yaw:-.7,pitch:.62,dist:7.5,tx:0,ty:.35,tz:0}};
const TAU=Math.PI*2;
/* the look (0.1.40), Full and Ultra only: filmic tone mapping (bright metal rolls off, it doesn't clip to white), how
   strongly each kind of material reflects the room (vis/surface.js envApply), the shadow map sizes and Ultra's final
   grade. Lite has none of it: no tone mapping, no reflections, a painted blob for a shadow */
const LOOK={exposure:1.05,env:{metal:0.85,bot:0.8,paint:0.4,matte:0.2,soft:0.2,prop:0.35,room:0.13,floor:0.1},shadow:{full:1536,ultra:2048},
  blob:{lite:.5,full:.3,grow:1.9},bloom:[.34,.45,.82],vignette:.3,msaa:4};
/* a contact shadow (0.1.40): a soft dark patch under a bot, on every tier. Lite's only shadow; on Full and Ultra it
   sits under the cast shadow and ties the bot to the floor. One small texture, drawn once */
const BLOB={tex:null,geo:null};
function blobMake(w,l){const lite=V.tier==="lite";
  if(!BLOB.tex){const c=document.createElement("canvas");c.width=c.height=64;const g=c.getContext("2d");
    g.shadowColor="#000";g.shadowBlur=11;g.fillStyle="#000";for(let i=0;i<2;i++)g.fillRect(19,19,26,26);
    BLOB.tex=new THREE.CanvasTexture(c);BLOB.geo=new THREE.PlaneGeometry(1,1);BLOB.geo.rotateX(-Math.PI/2);}
  const m=new THREE.Mesh(BLOB.geo,new THREE.MeshBasicMaterial({map:BLOB.tex,color:0x000000,transparent:true,opacity:lite?LOOK.blob.lite:LOOK.blob.full,
    depthWrite:false,toneMapped:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  m.userData.keep=true;m.userData.op=m.material.opacity;m.scale.set(w*LOOK.blob.grow,1,l*LOOK.blob.grow);m.raycast=()=>{};return m;}
function blobDrop(m){if(!m)return;if(m.parent)m.parent.remove(m);m.material.dispose();}

/* the tone curve: Khronos' PBR Neutral without its toe, put in where three.js r128 leaves room for a custom one. Colours up to about 0.76
   pass through untouched, so team paint and the palette stay exactly as written; only what is brighter is eased towards
   white (ACES would wash every bright colour out). False if this three.js has no such slot: the caller falls back */
function toneCurve(){const C=THREE.ShaderChunk,at="vec3 CustomToneMapping( vec3 color ) { return color; }";
  if(V.tone!=null)return V.tone;if(!C||!C.tonemapping_pars_fragment||C.tonemapping_pars_fragment.indexOf(at)<0)return V.tone=false;
  C.tonemapping_pars_fragment=C.tonemapping_pars_fragment.replace(at,`vec3 CustomToneMapping( vec3 color ) {
    color *= toneMappingExposure;
    float peak = max( color.r, max( color.g, color.b ) );
    if ( peak < 0.76 ) return color;
    float d = 0.24;
    float newPeak = 1.0 - d * d / ( peak + d - 0.76 );
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / ( 0.15 * ( peak - newPeak ) + 1.0 );
    return mix( color, vec3( newPeak ), g );
  }`);return V.tone=true;}
function initRenderer(canvas){
  V.canvas=canvas;
  V.r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
  V.r.setClearColor(0x0e0e0d,1);
  V.r.outputEncoding=THREE.sRGBEncoding;
  V.scene=new THREE.Scene();
  V.scene.fog=new THREE.Fog(0x0e0e0d,12,28);
  V.cam=new THREE.PerspectiveCamera(36,1,.1,100);
}
/* materials per tier: the same names, cheaper shading on Lite. The bot's materials (bot) come from vis/surface.js on
   Full and Ultra, with their maps, and are Lite's plain metal and matte there */
function makeMats(tier){
  const lite=tier==="lite";
  if(V.mats)for(const k in V.mats)(Array.isArray(V.mats[k])?V.mats[k]:[V.mats[k]]).forEach(m=>m.dispose());
  if(lite)surfDrop();   // vis/surface.js: frees Full's maps and drops a worker result still on its way
  const C=h=>new THREE.Color(h).convertSRGBToLinear(),S=lite?null:surfMaps();
  /* Lite has no reflection to darken bare metal, so its Phong base colour runs at 55% with a soft highlight, or polished
     steel under the overhead light reads as white plastic */
  const metal=(color,rough)=>(color=C(color),lite)
    ?new THREE.MeshPhongMaterial({color:color.multiplyScalar(.55),specular:C(0x5a5e64),shininess:Math.round(60*(1-rough))+12})
    :new THREE.MeshStandardMaterial({color,roughness:rough,metalness:1,envMapIntensity:LOOK.env.metal});
  const matte=(color,rough,env)=>(color=C(color),lite)
    ?new THREE.MeshLambertMaterial({color})
    :new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0,envMapIntensity:env==null?LOOK.env.matte:env});
  const bot=(key,color,rough,isMetal)=>lite?(isMetal?metal(color,rough):matte(color,rough)):surfMat(S[key],C(color),isMetal?1:0,key==="paint");
  V.mats={
    steel:bot("steel",0xb4b9bf,.3,1),
    disc:bot("disc",0xc9ced4,.3,1),
    alu:bot("alu",0xd0d4d8,.45,1),
    ply:bot("ply",0xb08a5a,.85),
    hdpe:bot("hdpe",0x2b2b2a,.7),
    paint:bot("paint",0xd97757,.5),      // clay: the starter bot wears the studio accent
    rubber:bot("rubber",0x1a1a1a,.95),
    bench:matte(0x55493c,.8,LOOK.env.room),
    plate:metal(0x6d7177,.55),
    floor:matte(0x232322,1,LOOK.env.room),
    ti:bot("ti",0x9a9da3,.4,1),
    arenaFloor:matte(0x2e2d2a,.9,LOOK.env.floor),
    arenaOut:matte(0x141413,1,LOOK.env.floor*.4),         // the floor round the arena: darker, so the arena reads as the lit square
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
    team:BOT_TEAM.map(h=>lite?matte(h,.5):surfMat(S.paint,C(h),0,true))
  };
  /* sponsor colours (vis/bot.js), made when first asked for, kept per tier: paint, like the team stripe */
  if(V.spMats)for(const k in V.spMats)V.spMats[k].dispose();V.spMats={};if(V.badgeMats)for(const k in V.badgeMats){V.badgeMats[k].map.dispose();V.badgeMats[k].dispose();}V.badgeMats={};V.spMatte=lite?matte:(h)=>surfMat(S.paint,C(h),0,true);
  V.mats.botPlate=lite?V.mats.plate.clone():bot("plate",0x6d7177,.55,1);   // the bot's AR500 and hardened plates: mill scale, not the bench plate's photo texture
  propDropTex();if(!lite)propDressMats(V.mats);   // photo textures on Full / Ultra (vis/props.js); old ones freed on every tier
  return V.mats;
}
