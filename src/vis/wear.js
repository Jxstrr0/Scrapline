/* ---- vis/wear.js: visible damage on Full and Ultra (0.1.23). Lite keeps botDamage's three steps (grey when damaged, gone
   when destroyed) and none of this.
     scars    a hit leaves a mark where it landed: a sooty scorch with bright gouges across it, a small decal laid on the
              surface the hit struck (found by casting a ray down at the bot from over the side the hit came from), sized by the hit's energy and
              turned to a seeded angle. It belongs to the part it landed on and goes when that part is destroyed. At most
              WEAR.scars per bot, oldest first out; a replay seek clears them (they come back as the hits replay)
     wear     each part darkens and dulls with the share of its hp that is gone (o.st against its fresh hp), instead of
              jumping to grey at the first scratch, so a bot looks as beaten as it is; a repaired part comes back clean
     askew    an armour plate past WEAR.tiltAt of its hp lost is knocked off true, up to WEAR.tilt radians, its direction
              seeded by the part, so a battered plate hangs crooked before it falls off
     bent     a bent disc, drum or saw (the sim's flags.bent) wobbles as it spins (half as much under reduced motion)
   All of it comes from the fight object (the vis reads it, never steps it), so a replay shows the same wear. ---- */
const WEAR={scars:{full:18,ultra:30},minE:2.5,size:[0.15,0.32],dark:0.55,dull:0.35,tiltAt:0.35,tilt:0.07,wobble:0.09,every:0.25};
const WR={mats:null,geo:null,ray:null};
/* four scar textures, drawn once with a fixed seed: soot, a burnt rim, and a few bright gouges running one way */
function wearMats(){if(WR.mats)return WR.mats;let s=97;const r=()=>(s=(s*16807)%2147483647)/2147483647;WR.mats=[];
  for(let i=0;i<4;i++){const N=128,c=document.createElement("canvas");c.width=c.height=N;const x=c.getContext("2d");
    for(let k=0;k<5;k++){const cx=N/2+(r()-0.5)*26,cy=N/2+(r()-0.5)*26,R=N*(0.2+r()*0.22),gr=x.createRadialGradient(cx,cy,0,cx,cy,R);
      gr.addColorStop(0,"rgba(16,12,10,0.85)");gr.addColorStop(0.45,"rgba(52,36,26,0.55)");gr.addColorStop(0.75,"rgba(96,84,74,0.16)");gr.addColorStop(1,"rgba(96,84,74,0)");x.fillStyle=gr;x.fillRect(0,0,N,N);}
    const a=(r()-0.5)*0.5,n=3+Math.floor(r()*4);x.lineCap="round";
    for(let k=0;k<n;k++){const off=(r()-0.5)*N*0.42,L=N*(0.22+r()*0.3),cx=N/2-Math.sin(a)*off,cy=N/2+Math.cos(a)*off,dx=Math.cos(a)*L/2,dy=Math.sin(a)*L/2,w=1.5+r()*3.5;
      x.strokeStyle="rgba(10,8,8,0.7)";x.lineWidth=w+2.5;x.beginPath();x.moveTo(cx-dx,cy-dy);x.lineTo(cx+dx,cy+dy);x.stroke();
      x.strokeStyle="rgba(232,230,224,0.92)";x.lineWidth=w;x.beginPath();x.moveTo(cx-dx,cy-dy);x.lineTo(cx+dx*0.85,cy+dy*0.85);x.stroke();}
    const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;
    WR.mats.push(new THREE.MeshStandardMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,roughness:0.8,metalness:0.35}));}
  WR.geo=new THREE.PlaneGeometry(1,1);WR.ray=new THREE.Raycaster();return WR.mats;}
/* the part a scar on mesh o belongs to ("chassis" for a stripe or a bolt that carries none), or null when o is no place
   for one: the spinning weapon and its blur, a wheel, another scar, or anything hidden */
function wearSurface(o,root){if(!o.isMesh||o.userData.scar)return null;let k=null;
  for(let p=o;p&&p!==root;p=p.parent){if(!p.visible||p.userData.role)return null;if(!k&&p.userData.part)k=p.userData.part;}
  k=k||"chassis";return /^wheel/.test(k)?null:k;}
/* a hit on bot B (fx event e in sim metres, En its energy over the class mass): a scar where it landed */
function wearScar(B,e,En){if(V.tier==="lite"||En<WEAR.minE||B.o.out)return;wearMats();const m=B.mesh,u=m.userData,U=AR.U;
  m.updateMatrixWorld(true);const c=new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);c.y+=(u.H||0.05)*0.5*U;
  const h=new THREE.Vector3(e.x*U,c.y,-e.y*U).sub(c);h.y=0;if(h.lengthSq()<1e-8)h.set(0,0,-1).applyQuaternion(m.quaternion);h.normalize();
  /* the ray comes down at the bot from above the side that was hit, aimed a quarter of the way in at mid height: it finds
     the top near the struck edge (the face the camera sees most), or the side or a slope when those stand in the way */
  const S=Math.max(u.L||0.3,u.W||0.3)*U,o=c.clone().addScaledVector(h,S*1.1);o.y+=S*1.6;const t=c.clone().addScaledVector(h,S*0.25);
  const dir=t.sub(o),far=dir.length()*1.3;dir.normalize();WR.ray.set(o,dir);WR.ray.far=far;
  let hit=null,part=null;for(const i of WR.ray.intersectObject(m,true)){if(!i.face)continue;part=wearSurface(i.object,m);if(part){hit=i;break;}}if(!hit)return;
  /* the face's normal into the bot's own frame, through the normal matrix (shell pieces are scaled unevenly and some are
     mirrored), turned to face the ray so the scar is never laid on the inside of a surface */
  const nw=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();if(nw.dot(dir)>0)nw.negate();
  const n=nw.applyQuaternion(m.quaternion.clone().invert()).normalize(),p=m.worldToLocal(hit.point.clone()),Lm=u.L||0.3;
  const sc=new THREE.Mesh(WR.geo,WR.mats[Math.floor(fxR()*4)]);sc.userData={scar:true,keep:true,part};
  sc.position.copy(p).addScaledVector(n,Lm*0.002);sc.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);sc.rotateZ(fxR()*Math.PI*2);
  sc.scale.setScalar(Lm*(WEAR.size[0]+Math.min(WEAR.size[1]-WEAR.size[0],En*0.004)));sc.renderOrder=2;m.add(sc);
  const list=u.scars||(u.scars=[]),max=WEAR.scars[V.tier]||18;list.push(sc);while(list.length>max){const d=list.shift();d.parent&&d.parent.remove(d);}}
function wearClear(B){const u=B.mesh.userData;for(const d of u.scars||[])d.parent&&d.parent.remove(d);u.scars=[];u.wear=null;B.wearT=0;}
/* scars on a destroyed part go with it (botDamage) */
function wearHide(g,states){for(const d of g.userData.scars||[]){const k=d.userData.part;d.visible=k==="chassis"||states[k]!=="destroyed";}}
/* each frame on Full and Ultra: the parts' wear from the sim's state a few times a second, and a bent weapon's wobble */
function wearTick(B,dt){if(V.tier==="lite")return;const o=B.o,m=B.mesh,u=m.userData;
  if(u.spin){const a=o.flags&&o.flags.bent?WEAR.wobble*(V.run.reduce?0.5:1):0,sp=u.spin,ax=sp.userData.axis,t=sp.rotation[ax];
    if(ax==="y"){sp.rotation.x=a*Math.sin(t);sp.rotation.z=a*Math.cos(t);}else{sp.rotation.y=a*Math.sin(t);sp.rotation.z=a*Math.cos(t);}}
  B.wearT=(B.wearT||0)-dt;if(B.wearT>0||!o.st)return;B.wearT=WEAR.every;
  const f=B.fresh||(B.fresh=window.SCRAP_SIM?SCRAP_SIM.damageState(o.b):null);if(!f)return;
  const lost=(left,hp)=>hp>0?Math.max(0,Math.min(1,1-left/hp)):0,w={chassis:lost(o.st.chassis,f.chassis)};
  for(const k in f.armour)w["armour_"+k]=lost(o.st.armour[k],f.armour[k]);for(const k in f.parts)w[k]=lost(o.st.parts[k],f.parts[k]);
  u.wear=w;wearApply(m);}
/* the wear onto the part meshes: darker and duller with hp lost (the hit flash lerps from dmul), armour knocked askew */
function wearApply(g){const u=g.userData,w=u.wear,parts=u.parts||{};if(!w)return;
  for(const key in parts){const x=w[key]||0;for(const p of parts[key]){const d=p.userData;if(!d.base)continue;
    if(d.dmul!==0.3)d.dmul=1-WEAR.dark*Math.pow(x,0.7);p.material.color.copy(d.base).multiplyScalar(d.dmul);
    if(d.rough0==null&&p.material.roughness!=null){d.rough0=p.material.roughness;d.metal0=p.material.metalness;}
    if(d.rough0!=null){p.material.roughness=Math.min(1,d.rough0+WEAR.dull*x);p.material.metalness=d.metal0*(1-0.4*x);}
    if(key.indexOf("armour_")===0){if(!d.r0)d.r0=p.rotation.clone();let hs=0;for(let i=0;i<key.length;i++)hs=(hs*31+key.charCodeAt(i))&1023;
      const k=Math.max(0,(x-WEAR.tiltAt)/(1-WEAR.tiltAt))*WEAR.tilt,an=hs/1024*Math.PI*2;
      p.rotation.set(d.r0.x+Math.cos(an)*k,d.r0.y,d.r0.z+Math.sin(an)*k);}}}}
