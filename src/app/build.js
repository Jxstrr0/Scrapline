/* ===================== app/build.js: the Build tab =====================
   The weight bar (always visible), section rows (Class, Chassis, Armour, Drive & Wheels, Power, Weapon, Weapon material,
   Extras) with PEW-style delta lines, the layout editor on the chassis grid, the side profile strip, the docked summary
   capsule, the stress report, and named designs. Arrives in PR 2 (docs/SCRAPLINE-PLAN.md section 5). PR 1 shows the raw
   evalBuild() result here as text; until then ?sim=1 shows the stub's. */
TAB_RENDER.build=function(){
  if(!/[?&]sim=1(&|$)/.test(location.search))return;
  const o=$("simOut");o.hidden=false;o.textContent=JSON.stringify(SIM.evalBuild(SIM.DEFAULT_CFG),null,2);};
