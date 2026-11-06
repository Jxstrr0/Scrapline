/* ---- sim/build.js: evalBuild(cfg), the one point where grams and millimetres become kg, m, s, J and W. Mass, budget,
   centre of mass, yaw inertia, the chassis polygon, drive speed and turn rate, the height profile (clearance, front edge,
   invertible), weapon energy, armour per face, runtime, heat, cost and build hours. PR 1 (plan 4d). ---- */
const K={};
function evalBuild(cfg){cfg=Object.assign({},DEFAULT_CFG,cfg||{});const c=CLASSES[cfg.cls]||CLASSES.beetle;
  return{cfg,cls:c.id,limitKg:c.limitG/1000,ready:false,note:"The build maths arrive in PR 1."};}
