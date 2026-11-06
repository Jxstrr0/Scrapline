/* ---- damage.js: hits on faces (absorb, armour hp, then the most exposed part behind it), part failures and their
   effects, self-damage to discs and shafts, and each part's end state: intact, damaged or destroyed. Plan 7b.
   PR 3 brings the first half, which the bench's impact and drop tests use: damageState(b) (every plate's and part's hp
   left, fresh), hitOrder(b, face) (the parts behind a face, most exposed first) and hitFace(b, face, E, st). PR 4a adds
   glancing hits, failure effects and self-damage on top. ---- */
const PART_STATES=["intact","damaged","destroyed"];
const DAMAGE={
  passOn:0.7,      // a destroyed part passes this share of what was left of the hit on to the next part behind it
  frontLead:1.1    // a weapon or bar with no cells (a wedge plate) sits in front of everything behind the front face
};
/* hp left on every armour plate and part, as fitted: {armour:{face:J}, parts:{key:J}} */
function damageState(b){const st={armour:{},parts:{}};
  for(const f of FACES)st.armour[f]=b.armourMapJ[f].hpJ;
  for(const p of b.parts)st.parts[p.key]=p.hpJ;
  return st;}
/* the parts a hit on this face reaches once the plate is gone, most exposed first. A part's score is 1 / (1 + d)^2, d its
   distance in footprint cells from that face; the wheels on a side score their own exposure (they stand proud, but a pod
   right on the edge is hit first); from the top, every part scores its exposure. */
function hitOrder(b,face){const c=CLASSES[b.cls],fp=c.fp,out=[];
  for(const p of b.parts){if(!(p.hpJ>0))continue;let s=null;
    if(p.slot==="wheels"){if((face==="left"&&p.pos[0]<0)||(face==="right"&&p.pos[0]>0))s=p.exposure;}
    else if(!p.cells.length){if(face==="front"&&(p.slot==="weapon"||p.key==="bar"))s=DAMAGE.frontLead+(p.key==="bar"?0.01:0);}
    else if(face==="top")s=p.exposure;
    else{let d=1e9;for(const q of p.cells){const v=face==="front"?q[1]:face==="back"?c.gridH-1-q[1]:face==="left"?q[0]:c.gridW-1-q[0];if(v<d)d=v;}
      d=Math.floor(d/fp);s=1/((1+d)*(1+d));}
    if(s!=null)out.push({key:p.key,slot:p.slot,score:s,exposure:p.exposure});}
  return out.sort((a,b)=>b.score-a.score||b.exposure-a.exposure||(a.key<b.key?-1:1));}
/* one square hit of E joules on a face (no glancing: the plate's deflect is the fight's business). The plate's absorb
   eats energy first, the rest damages the plate; once the plate is gone the rest reaches the most exposed part behind it,
   and a part that is destroyed passes DAMAGE.passOn of what is left on to the next. st (damageState) is changed in
   place; leave it out for a fresh bot. Returns {face, E, absorbed, plate, plateBroken, parts:[{key, slot, dmg, left,
   destroyed}], through} (through: what nothing stopped, into the chassis). */
function hitFace(b,face,E,st){st=st||damageState(b);const A=b.armourMapJ[face];
  const out={face,E,absorbed:0,plate:0,plateBroken:false,parts:[],through:0};let rest=E;
  if(st.armour[face]>0){const ab=Math.min(rest,A.absorbJ);rest-=ab;out.absorbed=ab;
    const d=Math.min(rest,st.armour[face]);st.armour[face]-=d;rest-=d;out.plate=d;
    if(st.armour[face]<=1e-9){st.armour[face]=0;out.plateBroken=rest>0||d>0;}}
  if(rest>1e-9)for(const h of hitOrder(b,face)){const left=st.parts[h.key];if(!(left>0))continue;
    const d=Math.min(rest,left);st.parts[h.key]=left-d;rest-=d;const dead=st.parts[h.key]<=1e-9;if(dead)st.parts[h.key]=0;
    out.parts.push({key:h.key,slot:h.slot,dmg:d,left:st.parts[h.key],destroyed:dead});
    if(!dead||rest<=1e-9){rest=dead?rest:0;break;}rest*=DAMAGE.passOn;}
  out.through=rest>1e-9?rest:0;
  return out;}
