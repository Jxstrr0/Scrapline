/* ===================== app/debugview.js: the 2D fight view =====================
   A plain top-down canvas of a SCRAP_SIM fight (plan 7e): the arena outline, each bot's outline with a heading line, its
   weapon's working zone (a spinner's glows with its speed), hit flashes sized by energy, a shadow and a lift when a bot
   is in the air, and markers for under (on a wedge), lifted, upside down and out. It only reads the fight; the Fight tab
   (app/fight.js) steps it. It stays in the game as the replay thumbnail and an emergency Lite fallback.
   Like the 3D view, it is dark in both themes.
     DEBUGVIEW.draw(canvas, F, flashes, now)   flashes: [{x, y, E, t0, k}] (from F.fxq), now: performance.now() ms */
const DV_COL={floor:"#1A1917",grid:"#262421",wall:"#6B665D",text:"#E8E5DE",dim:"#9B978E",zone:"#E2A93B",hit:"#FFE3A6",land:"#9B978E",
  bots:["#D97757","#B48CE8","#4CC38A","#7FB3E6"]};
const DEBUGVIEW={
  draw(cv,F,flashes,now){if(!cv||!F)return;const dpr=Math.min(window.devicePixelRatio||1,2),w=cv.clientWidth|0;if(!w)return;
    if(cv.width!==Math.round(w*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(w*dpr);}
    const g=cv.getContext("2d"),W=cv.width,H=F.arena.half,pad=10*dpr,s=(W-2*pad)/(2*H),X=x=>W/2+x*s,Y=y=>W/2-y*s,red=reduced();
    g.setTransform(1,0,0,1,0,0);g.fillStyle=DV_COL.floor;g.fillRect(0,0,W,W);
    /* floor grid every ~30 cm at beetle scale, walls */
    const step=0.3*F.M.len;g.strokeStyle=DV_COL.grid;g.lineWidth=1;g.beginPath();
    for(let v=-H+step;v<H-1e-6;v+=step){g.moveTo(X(v),Y(-H));g.lineTo(X(v),Y(H));g.moveTo(X(-H),Y(v));g.lineTo(X(H),Y(v));}g.stroke();
    if(F.arena.pit){const p=F.arena.pit;g.fillStyle="#050505";g.fillRect(X(p[0]),Y(p[3]),(p[2]-p[0])*s,(p[3]-p[1])*s);}
    g.strokeStyle=DV_COL.wall;g.lineWidth=3*dpr;g.strokeRect(X(-H),Y(H),2*H*s,2*H*s);
    const font=px=>`${px*dpr}px "JetBrains Mono",ui-monospace,monospace`;
    for(const o of F.bots){if(o.out==="pit")continue;const col=DV_COL.bots[o.i%DV_COL.bots.length],lift=o.z*s*0.6,grow=1+Math.min(o.z,1)*0.35;
      const at=(lx,ly)=>{const p=toW(o,lx*grow,ly*grow);return[X(p[0]),Y(p[1])-lift];};
      /* shadow in the air */
      if(o.z>0.005){g.fillStyle="rgba(0,0,0,.45)";g.beginPath();o.poly.forEach((p,k)=>{const q=toW(o,p[0],p[1]);k?g.lineTo(X(q[0]),Y(q[1])):g.moveTo(X(q[0]),Y(q[1]));});g.closePath();g.fill();}
      /* body: darker as it takes damage */
      const sh=Math.min(0.85,SIM.damageShare(o.b,o.st));g.globalAlpha=o.out?0.45:1;
      g.beginPath();o.poly.forEach((p,k)=>{const q=at(p[0],p[1]);k?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);});g.closePath();
      g.fillStyle=mixDark(col,0.35+sh*0.5);g.fill();g.lineWidth=2*dpr;g.strokeStyle=col;g.setLineDash(o.inverted?[4*dpr,3*dpr]:[]);g.stroke();g.setLineDash([]);
      /* heading line */
      const c0=at(0,0),c1=at(0,o.b.lengthM*0.5-o.b.com.y);g.beginPath();g.moveTo(c0[0],c0[1]);g.lineTo(c1[0],c1[1]);g.strokeStyle=col;g.lineWidth=1.5*dpr;g.stroke();
      /* the weapon's working zone */
      const Z=o.zone,wp=o.b.weapon;if(Z&&o.fx.weaponOk){let a=0.35;
        if(wp.type==="spinner"||wp.type==="saw")a=0.15+0.75*(o.wp.om/(wp.omega||1));
        else if(o.wp.phase===1||(wp.type==="flipper"&&o.wp.recharge>(wp.rechargeS||1)-0.15)||o.wp.held!=null)a=0.95;
        g.strokeStyle=DV_COL.zone;g.globalAlpha=(o.out?0.3:1)*a;g.lineWidth=1.5*dpr;g.beginPath();
        if(Z.circle){const c=at(Z.x,Z.y);g.arc(c[0],c[1],Z.r*s*grow,0,Math.PI*2);}
        else{const q=[at(Z.x0,Z.y1),at(Z.x1,Z.y1),at(Z.x1,Z.y0),at(Z.x0,Z.y0)];g.moveTo(q[0][0],q[0][1]);for(let k=1;k<4;k++)g.lineTo(q[k][0],q[k][1]);g.closePath();}
        g.stroke();g.globalAlpha=1;}
      g.globalAlpha=1;
      /* markers */
      const tags=[];if(o.out)tags.push(o.out==="ko"?"OUT":"PIT");else{if(o.inverted)tags.push("INV");if(o.under)tags.push("UNDER");if(o.held!=null)tags.push("LIFTED");if(o.righting>0)tags.push("RIGHTING");}
      g.font=font(10);g.textAlign="center";g.fillStyle=DV_COL.text;const lbl=o.name+(tags.length?" · "+tags.join(" "):""),tw=g.measureText(lbl).width/2+3*dpr;
      let ty=c0[1]-o.rad*s*grow-6*dpr;if(ty<24*dpr)ty=c0[1]+o.rad*s*grow+14*dpr;   // under the bot when it is near the top wall
      g.fillText(lbl,Math.max(tw,Math.min(W-tw,c0[0])),ty);}
    /* hit flashes: radius from the energy (per kg of bot, so every class reads the same), fading */
    for(const f of flashes){const age=(now-f.t0)/1000,life=red?0.5:0.45;if(age>life)continue;const k=age/life,E=Math.max(0,f.E)/Math.max(F.M.mass*1.5,1e-6);
      const r=(4+Math.sqrt(E)*2.2)*dpr*(red?1:0.6+0.8*k);g.globalAlpha=red?0.8:1-k;g.beginPath();g.arc(X(f.x),Y(f.y),r,0,Math.PI*2);
      g.strokeStyle=f.k==="land"||f.k==="wall"||f.k==="ram"?DV_COL.land:DV_COL.hit;g.lineWidth=(f.k==="hit"?2.5:1.5)*dpr;g.stroke();g.globalAlpha=1;}
    /* clock */
    g.font=font(12);g.textAlign="right";g.fillStyle=DV_COL.dim;g.fillText(fmtClock(F),W-pad-4*dpr,W-pad-6*dpr);}
};
function toW(o,lx,ly){const c=Math.cos(o.h),s=Math.sin(o.h);return[o.x+lx*s+ly*c,o.y-lx*c+ly*s];}
function mixDark(hex,t){const n=parseInt(hex.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255,m=v=>Math.round(v*(1-t)+0x1A*t);return`rgb(${m(r)},${m(g)},${m(b)})`;}
function fmtClock(F){const left=Math.max(0,Math.ceil(F.rules.roundS-F.t-1e-6));return`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,"0")}`;}
