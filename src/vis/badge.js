/* ---- vis/badge.js: team badges (0.1.24), drawn in code with the 2D canvas, so they cost nothing to load and work on
   every tier. A livery is {name, main, accent, shape, emblem, text}: the team's name, two "#rrggbb" colours, a badge
   shape (BADGE_SHAPES), an emblem (BADGE_EMBLEMS, or "none") and up to three letters. badgeDraw paints one into a 2D
   context; badgeCanvas gives a fresh canvas (the app's cards, the name tags); badgeMat the decal on a bot's top (a
   texture per livery, shared, cleared with the materials). No three.js needed for the drawing. ---- */
const BADGE_SHAPES=["shield","round","hex","diamond","gear","square"];
const BADGE_EMBLEMS=["bolt","saw","wrench","hammer","skull","crown","flame","star","claw","ibex","wolf","eagle","bull","scorpion","wasp","shark","rhino","cobra","fist","piston","anvil","none"]   // from "ibex" on: logos from vis/marks.js (0.1.54);
const badgeKey=L=>L?[L.main,L.accent,L.shape,L.emblem,L.text||""].join("|"):"";
/* a badge into context x, centred at (cx, cy), r its half size; halo: a wide accent rim round it (the decal on a bot,
   which sits on a stripe of its own main colour) */
function badgeDraw(x,L,cx,cy,r,halo){x.save();x.translate(cx,cy);x.scale(r,r);x.lineJoin="round";x.lineCap="round";
  const P=pts=>{x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();};
  const ring=(n,ro,ri,a0)=>{const o=[];for(let i=0;i<n*(ri==null?1:2);i++){const rr=ri==null||i%2===0?ro:ri,a=a0+i*Math.PI*2/(n*(ri==null?1:2));o.push([Math.cos(a)*rr,Math.sin(a)*rr]);}return o;};
  /* the shape */
  const shape=()=>{const s=L.shape;
    if(s==="round"){x.beginPath();x.arc(0,0,0.9,0,7);}
    else if(s==="hex")P(ring(6,0.93,null,-Math.PI/2));
    else if(s==="diamond")P(ring(4,0.96,null,-Math.PI/2));
    else if(s==="gear"){const o=[];for(let i=0;i<40;i++){const a=i*Math.PI*2/40-Math.PI/2,t=(i%4)<2?0.95:0.79;o.push([Math.cos(a)*t,Math.sin(a)*t]);}P(o);}
    else if(s==="square"){const q=0.84,c=0.2;x.beginPath();x.moveTo(-q+c,-q);x.arcTo(q,-q,q,q,c);x.arcTo(q,q,-q,q,c);x.arcTo(-q,q,-q,-q,c);x.arcTo(-q,-q,q,-q,c);x.closePath();}
    else{x.beginPath();x.moveTo(-0.8,-0.86);x.lineTo(0.8,-0.86);x.lineTo(0.8,0.02);x.quadraticCurveTo(0.78,0.66,0,0.96);x.quadraticCurveTo(-0.78,0.66,-0.8,0.02);x.closePath();}};
  if(halo){x.save();x.scale(1.2,1.2);shape();x.fillStyle=L.accent;x.fill();x.strokeStyle="rgba(10,10,10,0.6)";x.lineWidth=0.08;x.stroke();x.restore();}
  shape();x.strokeStyle="rgba(10,10,10,0.6)";x.lineWidth=0.2;x.stroke();   // a dark edge, so a pale badge shows on a pale bot
  x.fillStyle=L.main;x.fill();x.strokeStyle=L.accent;x.lineWidth=0.1;x.stroke();
  shape();x.clip();
  /* the emblem, in the accent colour with a dark outline; holes are cut in the main colour */
  const txt=String(L.text||"").slice(0,3),em=L.emblem&&L.emblem!=="none"?L.emblem:null;
  if(em){x.save();if(txt){x.translate(0,-0.17);x.scale(0.72,0.72);}
    const ink=()=>{x.fillStyle=L.accent;x.strokeStyle="rgba(10,10,10,0.55)";x.lineWidth=0.07;x.stroke();x.fill();},
      hole=f=>{x.fillStyle=L.main;f();x.fill();};
    if(em==="bolt"){P([[0.14,-0.62],[-0.32,0.08],[-0.03,0.08],[-0.15,0.62],[0.33,-0.1],[0.04,-0.1]]);ink();}
    else if(em==="saw"){P(ring(14,0.56,0.42,0));ink();hole(()=>{x.beginPath();x.arc(0,0,0.13,0,7);});}
    else if(em==="wrench"){x.save();x.rotate(-Math.PI/4);x.beginPath();x.rect(-0.08,-0.2,0.16,0.78);x.moveTo(0.27,-0.36);x.arc(0,-0.36,0.27,0,7);ink();
      hole(()=>{x.beginPath();x.rect(-0.1,-0.7,0.2,0.32);});x.restore();}
    else if(em==="hammer"){x.beginPath();x.rect(-0.07,-0.16,0.14,0.76);x.rect(-0.44,-0.56,0.88,0.36);ink();}
    else if(em==="skull"){x.beginPath();x.arc(0,-0.1,0.44,0,7);x.rect(-0.25,0.18,0.5,0.3);ink();
      hole(()=>{x.beginPath();x.arc(-0.17,-0.07,0.12,0,7);x.arc(0.17,-0.07,0.12,0,7);});hole(()=>P([[0,0.07],[-0.06,0.18],[0.06,0.18]]));
      hole(()=>{x.beginPath();x.rect(-0.12,0.34,0.05,0.14);x.rect(0.07,0.34,0.05,0.14);});}
    else if(em==="crown"){P([[-0.52,0.36],[-0.52,-0.28],[-0.26,0.04],[0,-0.48],[0.26,0.04],[0.52,-0.28],[0.52,0.36]]);ink();}
    else if(em==="flame"){x.beginPath();x.moveTo(0.02,-0.64);x.bezierCurveTo(0.36,-0.26,0.5,0.06,0.42,0.28);x.bezierCurveTo(0.36,0.52,0.18,0.62,0,0.62);
      x.bezierCurveTo(-0.2,0.62,-0.4,0.5,-0.44,0.26);x.bezierCurveTo(-0.48,0.02,-0.3,-0.12,-0.16,-0.34);x.bezierCurveTo(-0.1,-0.12,0.02,-0.08,0.02,-0.64);x.closePath();ink();
      hole(()=>{x.beginPath();x.moveTo(0,0.04);x.bezierCurveTo(0.16,0.2,0.18,0.36,0.1,0.46);x.bezierCurveTo(0.02,0.52,-0.14,0.5,-0.16,0.38);x.bezierCurveTo(-0.18,0.24,-0.06,0.16,0,0.04);x.closePath();});}
    else if(em==="star"){P(ring(5,0.6,0.25,-Math.PI/2));ink();}
    else if(em==="claw"){for(const dx of [-0.3,0,0.3]){x.beginPath();x.moveTo(dx+0.2,-0.56);x.quadraticCurveTo(dx+0.18,0.1,dx-0.2,0.56);
      x.strokeStyle="rgba(10,10,10,0.55)";x.lineWidth=0.24;x.stroke();x.strokeStyle=L.accent;x.lineWidth=0.14;x.stroke();}}
    else if(LOGOS["t_"+em])logoDraw(x,"t_"+em,0,0,0.62,L.accent,"rgba(10,10,10,0.55)",0.06);   /* 0.1.54: a drawn logo, in the accent colour */
    x.restore();}
  if(txt){const big=!em,fs=big?(txt.length>2?0.62:txt.length>1?0.78:1.0):0.34;
    x.save();x.translate(0,big?0.04:0.5);x.scale(1/r,1/r);   /* text in real pixels: canvases round tiny font sizes */
    x.font=`700 ${Math.max(4,fs*r).toFixed(1)}px "Space Grotesk", sans-serif`;x.textAlign="center";x.textBaseline="middle";
    const w=x.measureText(txt).width/r,k=Math.min(1,(big?1.4:1.1)/Math.max(w,0.01));x.scale(k,1);
    x.lineWidth=0.08*r;x.strokeStyle="rgba(10,10,10,0.55)";x.strokeText(txt,0,0);x.fillStyle=L.accent;x.fillText(txt,0,0);x.restore();}
  x.restore();}
/* a fresh canvas with the badge on it, px square (transparent round it) */
function badgeCanvas(L,px,halo){const c=document.createElement("canvas");c.width=c.height=px;if(L)badgeDraw(c.getContext("2d"),L,px/2,px/2,px*(halo?0.39:0.47),halo);return c;}
/* the badge as a decal material: cut out on its alpha, lit like the paint; one per livery and tier, cleared with the materials */
function badgeMat(L){const k=badgeKey(L);let m=V.badgeMats[k];if(m)return m;
  const t=new THREE.CanvasTexture(badgeCanvas(L,V.tier==="lite"?64:128,true));t.encoding=THREE.sRGBEncoding;t.anisotropy=V.tier==="lite"?1:4;
  m=V.badgeMats[k]=V.tier==="lite"?new THREE.MeshLambertMaterial({map:t,alphaTest:0.5}):new THREE.MeshStandardMaterial({map:t,alphaTest:0.5,roughness:0.45,metalness:0});return m;}
