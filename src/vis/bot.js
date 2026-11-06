/* ---- vis/bot.js: the robot mesh. For now a stand-in: a plywood box with clay side panels, four rubber wheels and a
   steel horizontal spinner disc with two teeth. PR 5 makes it parametric from the build (chassis polygon and grid, armour
   per face, wheels, weapon by type, dents and missing parts from the damage state), cached by build hash and disposed. ---- */
function buildPlaceholderBot(){
  const M=V.mats,g=new THREE.Group(),lite=V.tier==="lite",seg=lite?24:48;
  /* chassis: plywood top and bottom, clay side panels, a darker HDPE front */
  const W=1.6,L=2.0,H=.42,Y=.32;
  const ply=new THREE.Mesh(new THREE.BoxGeometry(W,.05,L),M.ply);ply.position.y=Y+H/2;g.add(ply);
  const base=new THREE.Mesh(new THREE.BoxGeometry(W,.05,L),M.ply);base.position.y=Y-H/2;g.add(base);
  for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.08,H,L),M.paint);p.position.set(s*(W/2-.04),Y,0);g.add(p);}
  const back=new THREE.Mesh(new THREE.BoxGeometry(W,H,.08),M.hdpe);back.position.set(0,Y,-L/2+.04);g.add(back);
  const front=new THREE.Mesh(new THREE.BoxGeometry(W,H,.1),M.hdpe);front.position.set(0,Y,L/2-.05);g.add(front);
  /* wheels, set into the sides */
  const wg=new THREE.CylinderGeometry(.24,.24,.14,seg);
  for(const s of [-1,1])for(const z of [-.55,.55]){const w=new THREE.Mesh(wg,M.rubber);w.rotation.z=Math.PI/2;w.position.set(s*(W/2+.08),.24,z);g.add(w);}
  /* the weapon: a horizontal disc on a short mast at the front, two teeth on the rim */
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.2,12),M.steel);mast.position.set(0,Y+H/2+.1,L/2-.25);g.add(mast);
  const disc=new THREE.Group();
  const plate=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.05,seg*2),M.disc);disc.add(plate);
  const tooth=new THREE.BoxGeometry(.22,.07,.12);
  for(const a of [0,Math.PI]){const t=new THREE.Mesh(tooth,M.steel);t.position.set(Math.cos(a)*.62,0,Math.sin(a)*.62);t.rotation.y=-a;disc.add(t);}
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.09,16),M.alu);disc.add(hub);
  disc.position.set(0,Y+H/2+.21,L/2-.25);g.add(disc);
  if(!lite)g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  g.userData={disc};
  return g;
}
