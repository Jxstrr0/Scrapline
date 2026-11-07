/* ---- damage.js: hits on faces (absorb, armour hp, then the most exposed part behind it), landings, part failures and
   their effects, and each part's end state: intact, damaged or destroyed. Plan 7b.
     damageState(b, dmg)        hp left on every plate, part and the chassis: fresh, or after dmg ({key: J taken}, the shape
                                S.bots[cls].damage keeps: part keys, armour_<face>, chassis)
     hitOrder(b, face)          the parts behind a face, most exposed first
     hitFace(b, face, E, st, absorbMul)   one square hit (the bench's impact test and every hit in a fight)
     landHit(b, st, E, inverted)          a landing: on its wheels, into the wheels and drive pods; upside down, the top
     damageEffects(b, st, flags)          what the damage does to the bot: each side's push and grip, power, the weapon,
                                          the self-righter, chassis flex (armour absorbs less), and whether it is dead
     damageTaken(b, st), partStates(b, st)   the fight result: J taken per key, and intact / damaged / destroyed
   The random parts of a failure (which speed controller goes, whether the battery smokes, whether a failsafe holds a
   cell) are rolled by the fight (sim/fight.js) from its seeded generator and handed in as flags. ---- */
const PART_STATES=["intact","damaged","destroyed"];
const DAMAGE={
  passOn:0.7,      // a destroyed part passes this share of what was left of the hit on to the next part behind it
  frontLead:1.1,   // a weapon or bar with no cells (a wedge plate) sits in front of everything behind the front face
  motorAt:0.35,    // a weapon below this share of its hp has a dead motor (it coasts, can't spin up or fire)
  escSideAt:0.5,   // the speed controllers below this share: one side's controller is dead
  smokeP:0.15,     // a hit that damages the battery makes it smoke this often (power drops to smokePower)
  smokePower:0.6,
  cellSave:0.5,    // a destroyed battery with a failsafe ESC keeps one cell going this often ...
  cellPower:0.3,   // ... at this share of power
  flexMul:2,       // chassis flex: armour absorbs 1 - flexMul x the chassis' flex x its share of hp lost ...
  flexMin:0.2,     // ... but never less than this share
  flexAt:0.5,      // a chassis below this share of hp is logged as flexing
  bentMul:0.5,     // a bent disc hits with half its energy ...
  bentPower:0.8,   // ... and spins up on this share of power (it shakes)
  damagedAt:0.999  // a part under this share of its hp is "damaged" (a repair fee); 0 hp is "destroyed" (re-buy)
};
const bodyOf=b=>part("body",b.cfg.body)||PARTS.body[0];
const chassisHp=b=>{const ch=part("chassis",b.cfg.chassis)||PARTS.chassis[0];return ch.hp*bodyOf(b).hpMul*classMult(b.cls).mass;};
/* hp left on every armour plate, part and the chassis: {armour:{face:J}, parts:{key:J}, chassis:J}. dmg (optional) is
   damage carried in from earlier fights, {key: J taken} */
function damageState(b,dmg){const st={armour:{},parts:{},chassis:chassisHp(b)};
  for(const f of FACES)st.armour[f]=b.armourMapJ[f].hpJ;
  for(const p of b.parts)st.parts[p.key]=p.hpJ;
  if(dmg&&typeof dmg==="object")for(const k in dmg){const v=+dmg[k];if(!(v>0))continue;
    if(k.indexOf("armour_")===0&&k.slice(7) in st.armour)st.armour[k.slice(7)]=Math.max(0,st.armour[k.slice(7)]-v);
    else if(k==="chassis")st.chassis=Math.max(0,st.chassis-v);
    else if(k in st.parts)st.parts[k]=Math.max(0,st.parts[k]-v);}
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
   (x absorbMul, chassis flex) eats energy first, the rest damages the plate; once the plate is gone the rest reaches the
   most exposed part behind it, and a part that is destroyed passes DAMAGE.passOn of what is left on to the next. st
   (damageState) is changed in place; leave it out for a fresh bot. Returns {face, E, absorbed, plate, plateBroken,
   parts:[{key, slot, dmg, left, destroyed}], through} (through: what nothing stopped, into the chassis; the fight
   takes it off st.chassis). */
function hitFace(b,face,E,st,absorbMul){st=st||damageState(b);const A=b.armourMapJ[face];
  const out={face,E,absorbed:0,plate:0,plateBroken:false,parts:[],through:0};let rest=E;
  if(st.armour[face]>0){const ab=Math.min(rest,A.absorbJ*(absorbMul==null?1:absorbMul));rest-=ab;out.absorbed=ab;
    const d=Math.min(rest,st.armour[face]);st.armour[face]-=d;rest-=d;out.plate=d;
    if(st.armour[face]<=1e-9){st.armour[face]=0;out.plateBroken=rest>0||d>0;}}
  if(rest>1e-9)for(const h of hitOrder(b,face)){const left=st.parts[h.key];if(!(left>0))continue;
    const d=Math.min(rest,left);st.parts[h.key]=left-d;rest-=d;const dead=st.parts[h.key]<=1e-9;if(dead)st.parts[h.key]=0;
    out.parts.push({key:h.key,slot:h.slot,dmg:d,left:st.parts[h.key],destroyed:dead});
    if(!dead||rest<=1e-9){rest=dead?rest:0;break;}rest*=DAMAGE.passOn;}
  out.through=rest>1e-9?rest:0;
  return out;}
/* a landing of E joules (the drop test's maths: m g h x BENCH.dropShare). On its wheels it goes through the unarmoured
   underside (after a skid plate's absorb) into the wheels and drive pods still there, shared by mass; upside down it is a
   hit on the top. Returns {skid, parts:[{key, slot, dmg, left, destroyed}], hit (upside down: hitFace's result)} */
function landHit(b,st,E,inverted){const M=classMult(b.cls);
  if(inverted){const hit=hitFace(b,"top",E,st);return{skid:0,parts:hit.parts,hit};}
  const skid=b.cfg.extras.indexOf("skid")>=0?part("extras","skid").underAbsorbJ*M.mass:0,out={skid:Math.min(E,skid),parts:[],hit:null};
  const rest=Math.max(0,E-skid),ins=b.parts.filter(p=>p.hpJ>0&&(p.slot==="wheels"||p.slot==="drive")&&st.parts[p.key]>0),tot=ins.reduce((a,p)=>a+p.massKg,0)||1;
  for(const p of ins){const d=Math.min(rest*p.massKg/tot,st.parts[p.key]);if(d<=0)continue;st.parts[p.key]-=d;
    const dead=st.parts[p.key]<=1e-9;if(dead)st.parts[p.key]=0;out.parts.push({key:p.key,slot:p.slot,dmg:d,left:st.parts[p.key],destroyed:dead});}
  return out;}
/* what the damage does. flags (rolled by the fight): {esc:"left"|"right"|null (the dead controller), smoke, cell (a
   failsafe kept a cell), bent}. Returns {sides:{left:{push, grip, out}, right:{..}}, power, dead (a reason or null),
   weaponOk, motorOk, bent, righter, absorbMul, flexing} */
function damageEffects(b,st,flags){flags=flags||{};const alive=k=>!(k in st.parts)||st.parts[k]>0,frac=k=>{const p=b.parts.find(q=>q.key===k);return p&&p.hpJ>0?st.parts[k]/p.hpJ:1;};
  const sides={};
  for(const s of ["left","right"]){const on=p=>(p.pos[0]<0)===(s==="left");
    const pods=b.parts.filter(p=>p.slot==="drive"&&on(p)),wh=b.parts.filter(p=>p.slot==="wheels"&&on(p));
    const push=pods.length?pods.filter(p=>alive(p.key)).length/pods.length:0,grip=wh.length?wh.filter(p=>alive(p.key)).length/wh.length:0;
    sides[s]={push,grip,out:!push||!grip||flags.esc===s};}
  const hasBat=b.parts.some(p=>p.key==="battery"),batDead=hasBat&&!alive("battery");
  let power=batDead?(flags.cell?DAMAGE.cellPower:0):flags.smoke?DAMAGE.smokePower:1,dead=null;
  if(batDead&&!flags.cell)dead="battery";
  else if(b.parts.some(p=>p.key==="electronics")&&!alive("electronics"))dead="electronics";
  else if(st.chassis<=0)dead="chassis";
  const hasW=b.weapon.type!=="none",wf=hasW?frac("weapon"):0,weaponOk=hasW&&wf>0,motorOk=weaponOk&&wf>=DAMAGE.motorAt;
  const sr=b.cfg.extras.indexOf("selfright")>=0&&alive("selfright"),wr=!!part("weapon",b.cfg.weapon).selfRights&&motorOk;
  const ch=part("chassis",b.cfg.chassis)||PARTS.chassis[0],cf=Math.max(0,st.chassis)/Math.max(chassisHp(b),1e-9);
  const absorbMul=Math.max(DAMAGE.flexMin,1-DAMAGE.flexMul*(ch.flex+bodyOf(b).flexAdd)*(1-cf));
  return{sides,power,dead,weaponOk,motorOk,bent:!!flags.bent,righter:sr||wr,righterBy:sr?"selfright":wr?"weapon":null,absorbMul,flexing:cf<DAMAGE.flexAt};}
/* J taken per key (only the keys that took any): part keys, armour_<face>, chassis. This is S.bots[cls].damage's shape. */
function damageTaken(b,st){const out={},r=v=>Math.round(v*100)/100;
  for(const f of FACES){const d=b.armourMapJ[f].hpJ-st.armour[f];if(d>1e-6)out["armour_"+f]=r(d);}
  for(const p of b.parts){const d=p.hpJ-st.parts[p.key];if(d>1e-6)out[p.key]=r(d);}
  const dc=chassisHp(b)-st.chassis;if(dc>1e-6)out.chassis=r(dc);
  return out;}
/* every plate (that exists), part and the chassis: "intact", "damaged" (hp left: a repair fee) or "destroyed" (re-buy) */
function partStates(b,st){const out={},s=(left,hp)=>left<=1e-9?"destroyed":left<hp*DAMAGE.damagedAt?"damaged":"intact";
  for(const f of FACES)if(b.armourMapJ[f].hpJ>0)out["armour_"+f]=s(st.armour[f],b.armourMapJ[f].hpJ);
  for(const p of b.parts)if(p.hpJ>0)out[p.key]=s(st.parts[p.key],p.hpJ);
  out.chassis=s(st.chassis,chassisHp(b));
  return out;}
/* share of all the bot's hp (plates, parts, chassis) that is gone: the time-up decision's damage term */
function damageShare(b,st){let hp=chassisHp(b),left=Math.max(0,st.chassis);
  for(const f of FACES){hp+=b.armourMapJ[f].hpJ;left+=Math.max(0,st.armour[f]);}
  for(const p of b.parts){hp+=p.hpJ;left+=Math.max(0,st.parts[p.key]);}
  return hp>0?1-left/hp:0;}
