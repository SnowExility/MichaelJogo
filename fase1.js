/* ══════════════════════════════════════════════════════════════
   MICHAEL: EM BUSCA DO BIG MAC PERDIDO — fase1.js  (v5)
   ══════════════════════════════════════════════════════════════ */
'use strict';

// ═══ CANVAS ═══
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const CW = 900, CH = 500, GROUND = 400;
const GRAVITY = 0.52;
const JUMP_V  = -10.8;   // reduzido (era -13.5): pulo menor e mais preciso
const SPD     = 4.8;
const MAP_W   = 8600;    // mapa menor (era 14200)
const SAFE    = {x1:3600, x2:5000}; // zona segura (loja no meio)

// ═══ SAVE ═══
const SAVE_KEY = 'michael_bigmac_save_v1';
function loadSave()       { try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');}catch(e){return{};} }
function writeSave(patch) { try{const d=loadSave();Object.assign(d,patch);localStorage.setItem(SAVE_KEY,JSON.stringify(d));}catch(e){} }
function readNuggets()    { return parseInt(loadSave().nuggets||0,10); }
function readPlatform()   { return (loadSave().settings||{}).platform||'pc'; }
function readSettings()   { return loadSave().settings||{}; }
function devSave(patch)   { if(!DEV_NOSAVE) writeSave(patch); }

// ═══ DEV FLAGS ═══
let DEV_GODMODE = false;
let DEV_NOSAVE  = false;

// ═══ STATE ═══
let gState = 'PLAYING';
let sessionNuggets = 0;

// ═══ GAMEPAD ═══
const GP = {
  connected: false, type: 'xbox',
  showIcons: true, DZ: 0.25,
  leftX: 0, leftY: 0, leftY_prev: 0,
  btnA: false, btnA_prev: false,
  btnB: false, btnB_prev: false,
  btnX: false, btnX_prev: false,
  btnStart: false, btnStart_prev: false,
  dUp: false, dUp_prev: false,
  dDown: false, dDown_prev: false,
  dLeft: false, dLeft_prev: false,
  dRight: false, dRight_prev: false,
  lastNavTime: 0,
};

function pollGamepad() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of gamepads) { if (g && g.connected) { gp = g; break; } }
  if (!gp) {
    if (GP.connected) { GP.connected = false; updateGamepadIcons(); }
    return;
  }
  if (!GP.connected) {
    GP.connected = true;
    GP.type = /playstation|dualshock|dualsense/i.test(gp.id) ? 'ps' : 'xbox';
    updateGamepadIcons();
  }

  GP.leftX = Math.abs(gp.axes[0]) > GP.DZ ? gp.axes[0] : 0;
  GP.leftY_prev = GP.leftY;
  GP.leftY = Math.abs(gp.axes[1]) > GP.DZ ? gp.axes[1] : 0;

  GP.btnA_prev = GP.btnA; GP.btnA = gp.buttons[0]?.pressed || false;
  GP.btnB_prev = GP.btnB; GP.btnB = gp.buttons[1]?.pressed || false;
  GP.btnX_prev = GP.btnX; GP.btnX = gp.buttons[2]?.pressed || false;
  GP.btnStart_prev = GP.btnStart;
  GP.btnStart = gp.buttons[9]?.pressed || gp.buttons[8]?.pressed || false;

  GP.dUp_prev    = GP.dUp;    GP.dUp    = gp.buttons[12]?.pressed || false;
  GP.dDown_prev  = GP.dDown;  GP.dDown  = gp.buttons[13]?.pressed || false;
  GP.dLeft_prev  = GP.dLeft;  GP.dLeft  = gp.buttons[14]?.pressed || false;
  GP.dRight_prev = GP.dRight; GP.dRight = gp.buttons[15]?.pressed || false;
}

function applyGamepadInput() {
  if (!GP.connected) return;

  // ── In-game menu navigation ──
  if (gState === 'INGAME_MENU' || gState === 'SHOP' || gState === 'CONFIRM_RESTART') {
    const btnA_edge  = GP.btnA  && !GP.btnA_prev;
    const btnB_edge  = GP.btnX  && !GP.btnX_prev; // B cancel = X on PS
    const upEdge     = GP.dUp   && !GP.dUp_prev;
    const downEdge   = GP.dDown && !GP.dDown_prev;
    const now = Date.now();
    const axisUp   = GP.leftY < -0.4 && GP.leftY_prev >= -0.4;
    const axisDown = GP.leftY >  0.4 && GP.leftY_prev <=  0.4;
    const navUp    = upEdge   || (axisUp   && now - GP.lastNavTime > 200);
    const navDown  = downEdge || (axisDown && now - GP.lastNavTime > 200);
    if (navUp || navDown) GP.lastNavTime = now;

    if (gState === 'SHOP') {
      shopGpNavHandle(navUp, navDown, btnA_edge, btnB_edge || (GP.btnB && !GP.btnB_prev));
    }
    if (gState === 'INGAME_MENU') {
      igmGpNavHandle(navUp, navDown, GP.dLeft && !GP.dLeft_prev, GP.dRight && !GP.dRight_prev, btnA_edge, GP.btnB && !GP.btnB_prev);
    }
    if (gState === 'CONFIRM_RESTART') {
      if (btnA_edge) restartPhase();
      if (GP.btnB && !GP.btnB_prev) closeConfirmRestart();
    }
    return;
  }

  if (gState !== 'PLAYING') return;

  // Movement
  if (GP.leftX < -GP.DZ) { keys.left = true;  keys.right = false; P.facing = -1; }
  else if (GP.leftX > GP.DZ) { keys.right = true; keys.left = false; P.facing = 1; }
  else { keys.left = false; keys.right = false; }

  // Jump (A / Cross) — only on press edge
  if (GP.btnA && !GP.btnA_prev && P.onGround) keys.jump = true;

  // Interact (X / Square) — press edge
  if (GP.btnX && !GP.btnX_prev) keys.interact = true;

  // Start = menu
  if (GP.btnStart && !GP.btnStart_prev) openIngameMenu();
}

function updateGamepadIcons() {
  const el = document.getElementById('gamepad-icons');
  if (!el) return;
  if (!GP.connected || !GP.showIcons) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const jumpEl     = document.getElementById('gpi-jump');
  const interactEl = document.getElementById('gpi-interact');
  if (GP.type === 'ps') {
    jumpEl.textContent = '×';   jumpEl.className = 'gp-icon gp-btn-a';
    interactEl.textContent = '□'; interactEl.className = 'gp-icon gp-btn-x-ps';
  } else {
    jumpEl.textContent = 'A';   jumpEl.className = 'gp-icon gp-btn-a';
    interactEl.textContent = 'X'; interactEl.className = 'gp-icon gp-btn-x-xbox';
  }
  // Inline icon in interact hint
  const inlineEl = document.getElementById('interact-gp-hint');
  if (inlineEl) {
    inlineEl.textContent = GP.type === 'ps' ? '□' : 'X';
    inlineEl.className = `gp-inline-icon ${GP.type === 'ps' ? 'gp-btn-x-ps' : 'gp-btn-x-xbox'}`;
    inlineEl.classList.remove('hidden');
  }
}

// ═══ PLAYER ═══
const P = {
  x:100, y:GROUND-62, w:40, h:62,
  vx:0, vy:0, onGround:false,
  lives:3, maxLives:3,
  invul:false, invulTimer:0, INVUL_DUR:1800,
  potion:null, POTION_DUR:30000,
  item:null,
  facing:1, state:'idle',
  animFrame:0, animTimer:0, ANIM_SPD:110,
  sprites:{},
};
['idle','run0','run1','run2','run3','jump','hurt'].forEach(n=>{
  const img=new Image(); img.src=`assets/sprites/Michael/${n}.png`;
  img.onload=()=>P.sprites[n]=img;
});

// ═══ PARTICLES ═══
const particles=[];
function spawnDeathParticles(ex,ey,type){
  const cols={
    tomato:['#FF2200','#FF6644','#FF4422','#CC1100','#FF8866'],
    lettuce:['#44DD11','#22AA00','#66FF33','#88FF44','#33BB00'],
    carrot:['#FF8800','#FFAA33','#FF6600','#FFCC44','#FF5500'],
  };
  const c=cols[type]||cols.tomato;
  for(let i=0;i<22;i++){
    const a=(i/22)*Math.PI*2+Math.random()*.4;
    const s=2.5+Math.random()*5;
    particles.push({x:ex,y:ey,vx:Math.cos(a)*s*(0.6+Math.random()*.8),vy:Math.sin(a)*s-2-Math.random()*3,
      col:c[Math.floor(Math.random()*c.length)],size:3+Math.random()*5,life:1,decay:.025+Math.random()*.03,
      gravity:.18,type:Math.random()<.4?'star':'square',rot:Math.random()*Math.PI*2,rotSpd:(Math.random()-.5)*.2});
  }
  particles.push({x:ex,y:ey-20,vx:0,vy:-1.2,text:'+2🍗',life:1,decay:.018,isText:true,col:'#FFD700'});
  for(let i=0;i<8;i++) particles.push({
    x:ex+(-20+Math.random()*40),y:ey+(-20+Math.random()*20),
    vx:(Math.random()-.5)*3,vy:-3-Math.random()*4,col:'rgba(255,255,255,0.7)',
    size:6+Math.random()*6,life:.7,decay:.04,gravity:.12,type:'circle'});
}
function updateParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    if(p.isText){p.y+=p.vy;p.life-=p.decay;}
    else{p.x+=p.vx;p.y+=p.vy;p.vy+=p.gravity||0;p.vx*=.97;p.life-=p.decay;if(p.rot!==undefined)p.rot+=p.rotSpd;}
    if(p.life<=0)particles.splice(i,1);
  }
}
function drawParticles(camX){
  particles.forEach(p=>{
    ctx.save();ctx.globalAlpha=Math.max(0,p.life);
    if(p.isText){ctx.font=`bold ${Math.round(10+6*p.life)}px "Press Start 2P",monospace`;ctx.fillStyle=p.col;ctx.textAlign='center';ctx.fillText(p.text,p.x-camX,p.y);}
    else{const sx=p.x-camX,sy=p.y;
      if(p.type==='star'){ctx.translate(sx,sy);ctx.rotate(p.rot);ctx.fillStyle=p.col;drawStar5(ctx,p.size);}
      else if(p.type==='circle'){ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(sx,sy,p.size/2,0,Math.PI*2);ctx.fill();}
      else{ctx.translate(sx,sy);ctx.rotate(p.rot||0);ctx.fillStyle=p.col;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);}
    }
    ctx.restore();
  });
}
function drawStar5(ctx,r){ctx.beginPath();for(let i=0;i<5;i++){const ao=(i*2*Math.PI/5)-Math.PI/2,ai=ao+Math.PI/5;ctx.lineTo(Math.cos(ao)*r,Math.sin(ao)*r);ctx.lineTo(Math.cos(ai)*r*.45,Math.sin(ai)*r*.45);}ctx.closePath();ctx.fill();}

// ═══ AMBIENTS (fireflies + leaves) ═══
const ambients=[];
function initAmbients(){
  for(let i=0;i<40;i++) ambients.push({type:Math.random()<.55?'firefly':'leaf',x:Math.random()*MAP_W,y:50+Math.random()*(GROUND-80),vx:(Math.random()-.5)*.5,phase:Math.random()*Math.PI*2,size:2+Math.random()*3,col:Math.random()<.5?'#FFFF88':'#88FFAA'});
}
function drawAmbients(camX){
  const t=Date.now();
  ambients.forEach(a=>{
    const sx=((a.x-camX*.75)%(MAP_W*1.5)+MAP_W*1.5)%(MAP_W*1.5);
    if(sx<-20||sx>CW+20)return;
    ctx.save();
    if(a.type==='firefly'){const g=.3+.7*Math.abs(Math.sin(t*.002+a.phase));ctx.globalAlpha=g;ctx.fillStyle=a.col;ctx.beginPath();ctx.arc(sx,a.y,a.size*.6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=g*.3;ctx.beginPath();ctx.arc(sx,a.y,a.size*2,0,Math.PI*2);ctx.fill();}
    else{ctx.globalAlpha=.35+.25*Math.sin(t*.001+a.phase);ctx.fillStyle='#4A8A20';ctx.translate(sx,a.y+Math.sin(t*.0015+a.phase)*8);ctx.rotate(Math.sin(t*.002+a.phase)*.4);ctx.beginPath();ctx.ellipse(0,0,a.size*2,a.size,.1,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    a.x+=a.vx*.5; a.y+=Math.sin(t*.001+a.phase)*.15;
    if(a.x<0)a.x=MAP_W; if(a.x>MAP_W)a.x=0;
  });
}

// ═══ CLOUDS ═══
let clouds=[];
function initClouds(){
  clouds=[];
  [{spd:.04,y:40,n:7},{spd:.10,y:85,n:9},{spd:.18,y:135,n:8}].forEach(c=>{
    for(let i=0;i<c.n;i++) clouds.push({x:Math.random()*(MAP_W*1.4),y:c.y+(Math.random()-.5)*30,w:80+Math.random()*130,spd:c.spd,alpha:.5+Math.random()*.35});
  });
}
function drawClouds(camX){
  const span=MAP_W*1.4;
  clouds.forEach(cl=>{
    let sx=(cl.x-camX*cl.spd)%span;
    while(sx<-cl.w-20)sx+=span;if(sx>CW+20)return;
    ctx.save();ctx.globalAlpha=cl.alpha;drawCloudShape(sx,cl.y,cl.w);ctx.restore();
  });
}
function drawCloudShape(x,y,w){
  const h=w*.38;
  ctx.fillStyle='rgba(255,255,255,0.92)';
  ctx.beginPath();ctx.ellipse(x+w*.5,y+h*.6,w*.45,h*.55,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(x+w*.2,y+h*.75,w*.22,h*.4,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(x+w*.78,y+h*.75,w*.2,h*.38,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(x+w*.5,y+h*.35,w*.3,h*.42,0,0,Math.PI*2);ctx.fill();
  ctx.fillRect(x+w*.12,y+h*.85,w*.76,h*.2);
  ctx.fillStyle='rgba(180,210,255,0.28)';ctx.fillRect(x+w*.12,y+h*.9,w*.76,h*.15);
}

// ═══ BACKGROUND (mais árvores, troncos marrons) ═══
const BG_LAYERS=[];
function initBG(){
  // Densas — muitas árvores no fundo
  const cfgs=[
    {spd:.05,n:90, hmin:60, hmax:120,col:'#0A2008',wmin:20,wmax:40},
    {spd:.10,n:120,hmin:80, hmax:155,col:'#0E2A0E',wmin:26,wmax:52},
    {spd:.18,n:150,hmin:100,hmax:200,col:'#123212',wmin:32,wmax:64},
    {spd:.32,n:170,hmin:130,hmax:255,col:'#163A16',wmin:40,wmax:82},
    {spd:.55,n:190,hmin:155,hmax:310,col:'#1A4218',wmin:50,wmax:102},
    {spd:.65,n:140,hmin:170,hmax:330,col:'#1F4C1F',wmin:54,wmax:110},
  ];
  const span=MAP_W*1.3;
  cfgs.forEach(c=>{
    const trees=Array.from({length:c.n},()=>({x:Math.random()*span,h:c.hmin+Math.random()*(c.hmax-c.hmin),w:c.wmin+Math.random()*(c.wmax-c.wmin)})).sort((a,b)=>a.x-b.x);
    BG_LAYERS.push({...c,trees});
  });
}
function drawBG(camX){
  const t=Date.now();
  // Blue sky
  const sky=ctx.createLinearGradient(0,0,0,GROUND);
  sky.addColorStop(0,'#1875C8');sky.addColorStop(.45,'#4AAEE8');sky.addColorStop(.72,'#7DCCF0');sky.addColorStop(1,'#A8E8A8');
  ctx.fillStyle=sky;ctx.fillRect(0,0,CW,GROUND);
  // Sun
  const sunX=CW*.78,sunY=GROUND*.16;
  ctx.save();ctx.globalAlpha=.2;const sg=ctx.createRadialGradient(sunX,sunY,8,sunX,sunY,90);sg.addColorStop(0,'#FFFFA0');sg.addColorStop(1,'rgba(255,255,100,0)');ctx.fillStyle=sg;ctx.fillRect(sunX-90,sunY-90,180,180);ctx.restore();
  ctx.fillStyle='#FFFFA0';ctx.beginPath();ctx.arc(sunX,sunY,22,0,Math.PI*2);ctx.fill();
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2+t*.0005;ctx.save();ctx.translate(sunX,sunY);ctx.rotate(a);ctx.fillStyle='rgba(255,230,60,0.45)';ctx.fillRect(-1.5,26,3,12+Math.sin(t*.003+i)*4);ctx.restore();}
  drawClouds(camX);
  BG_LAYERS.forEach(layer=>{
    const span=MAP_W*1.3;
    const offset=(camX*layer.spd)%span;
    layer.trees.forEach(tr=>{let tx=tr.x-offset;while(tx<-tr.w)tx+=span;if(tx>CW+tr.w)return;drawBGTree(tx,tr.w,tr.h,layer.col);});
  });
  // Horizon mist
  const mist=ctx.createLinearGradient(0,GROUND-50,0,GROUND);
  mist.addColorStop(0,'rgba(160,220,180,0)');mist.addColorStop(1,'rgba(160,220,180,0.22)');
  ctx.fillStyle=mist;ctx.fillRect(0,GROUND-50,CW,50);
}

function drawBGTree(x,w,h,col){
  const tw=w*.16,th=h*.28;
  // TRONCO MARROM (não verde)
  const trunkGrad=ctx.createLinearGradient(x-tw/2,0,x+tw/2,0);
  trunkGrad.addColorStop(0,'#3A1A00');trunkGrad.addColorStop(.4,'#6B3010');trunkGrad.addColorStop(1,'#3A1A00');
  ctx.fillStyle=trunkGrad;
  ctx.fillRect(x-tw/2,GROUND-th,tw,th);
  // Small bark lines
  ctx.strokeStyle='rgba(30,10,0,0.4)';ctx.lineWidth=.8;
  for(let i=0;i<3;i++){const ly=GROUND-th+th*.2+i*(th*.25);ctx.beginPath();ctx.moveTo(x-tw/2+1,ly);ctx.lineTo(x+tw/2-1,ly);ctx.stroke();}
  // Canopy layers
  ctx.fillStyle=col;
  ctx.beginPath();ctx.moveTo(x,GROUND-h);ctx.lineTo(x-w/2,GROUND-th);ctx.lineTo(x+w/2,GROUND-th);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(x,GROUND-h*.82);ctx.lineTo(x-w*.42,GROUND-h*.38);ctx.lineTo(x+w*.42,GROUND-h*.38);ctx.closePath();ctx.fill();
  ctx.fillStyle=lighten(col,7);
  ctx.beginPath();ctx.moveTo(x,GROUND-h*.95);ctx.lineTo(x-w*.28,GROUND-h*.6);ctx.lineTo(x+w*.28,GROUND-h*.6);ctx.closePath();ctx.fill();
}
function darken(hex,amt){return adjustHex(hex,-amt);}
function lighten(hex,amt){return adjustHex(hex,+amt);}
function adjustHex(hex,amt){try{let r=parseInt(hex.slice(1,3),16)+amt,g=parseInt(hex.slice(3,5),16)+amt,b=parseInt(hex.slice(5,7),16)+amt;return `rgb(${cl(r)},${cl(g)},${cl(b)})`;}catch{return hex;}}
function cl(v){return Math.max(0,Math.min(255,v));}

// ═══ GROUND LAYOUT (mapa menor, mais plataformas verticais) ═══
const HOLES=[
  {x:550,  w:90},
  {x:1080, w:100},
  {x:1600, w:80},
  {x:2400, w:110},
  {x:5200, w:120},
  {x:5850, w:100},
  {x:6500, w:140},
  {x:7200, w:100},
];

// Layout vertical: subida de escada, descida, seção difícil
const PLATFORMS=[
  // ─ Seção 1: primeiros saltos (300-1600)
  {x:600,   y:GROUND-90,  w:130, h:18},
  {x:780,   y:GROUND-155, w:110, h:18},  // sobe
  {x:960,   y:GROUND-220, w:110, h:18},  // sobe mais
  {x:1150,  y:GROUND-155, w:120, h:18},  // desce
  {x:1350,  y:GROUND-90,  w:130, h:18},  // desce
  // ─ Seção 2: plataformas médias (1700-2500)
  {x:1750,  y:GROUND-115, w:100, h:18},
  {x:1940,  y:GROUND-185, w:100, h:18},
  {x:2150,  y:GROUND-245, w:105, h:18},  // pico
  {x:2360,  y:GROUND-185, w:100, h:18},
  // ─ Safe zone ~3600-5000 (vazio, só chão)
  // ─ Seção 3: pós-safe, escalada difícil (5300-7500)
  {x:5300,  y:GROUND-100, w:120, h:18},
  {x:5500,  y:GROUND-170, w:105, h:18},
  {x:5700,  y:GROUND-240, w:100, h:18},  // alto
  {x:5950,  y:GROUND-170, w:105, h:18},
  {x:6150,  y:GROUND-100, w:115, h:18},
  {x:6400,  y:GROUND-155, w:100, h:18},
  {x:6620,  y:GROUND-220, w:100, h:18},  // alto
  {x:6860,  y:GROUND-155, w:105, h:18},
  {x:7050,  y:GROUND-90,  w:120, h:18},
  {x:7300,  y:GROUND-140, w:110, h:18},
  {x:7550,  y:GROUND-200, w:100, h:18},
];

function buildGroundSegs(){let s=[{x:0,ex:MAP_W}];HOLES.forEach(h=>{s=s.flatMap(seg=>{if(h.x>=seg.ex||h.x+h.w<=seg.x)return[seg];const o=[];if(h.x>seg.x)o.push({x:seg.x,ex:h.x});if(h.x+h.w<seg.ex)o.push({x:h.x+h.w,ex:seg.ex});return o;});});return s;}
const GROUND_SEGS=buildGroundSegs();

function drawGround(camX){
  const vis0=camX,vis1=camX+CW;

  // ─── Ground segments ───
  GROUND_SEGS.forEach(seg=>{
    if(seg.ex<vis0||seg.x>vis1)return;
    const sx=Math.max(seg.x,vis0)-camX,ex=Math.min(seg.ex,vis1)-camX,gw=ex-sx;
    if(gw<=0)return;

    // Soil layers: grass on top → dark brown earth
    const soil=ctx.createLinearGradient(0,GROUND,0,CH);
    soil.addColorStop(0,   '#5C8C1A'); // top — green transition
    soil.addColorStop(.04, '#8B5E2A'); // brown topsoil
    soil.addColorStop(.14, '#6B3E1A'); // mid brown
    soil.addColorStop(.35, '#4A2A0A'); // dark brown
    soil.addColorStop(1,   '#2A1400'); // deep dark
    ctx.fillStyle=soil; ctx.fillRect(sx,GROUND,gw,CH-GROUND);

    // Stone/root veins in the soil
    ctx.fillStyle='rgba(30,14,4,.35)';
    for(let i=Math.floor(sx/30);i<(sx+gw)/30+1;i++){
      const rx=(i*30)-sx%30; const ry=GROUND+8+((i*7)%22);
      ctx.fillRect(rx,ry,20,3);
    }

    // Grass layers
    ctx.fillStyle='#6AD430'; ctx.fillRect(sx,GROUND,    gw,7);
    ctx.fillStyle='#50B820'; ctx.fillRect(sx,GROUND+7,  gw,4);
    ctx.fillStyle='#3A9010'; ctx.fillRect(sx,GROUND+11, gw,3);
    ctx.fillStyle='#8B5E2A'; ctx.fillRect(sx,GROUND+14, gw,4); // dirt line under grass

    // Grass tufts (top surface)
    ctx.fillStyle='#7AE840';
    for(let i=0;i<gw;i+=18){
      ctx.fillRect(sx+i,  GROUND-4,3,6);
      ctx.fillRect(sx+i+7,GROUND-3,2,5);
      ctx.fillRect(sx+i+13,GROUND-2,3,4);
    }
  });

  // ─── Platforms ───
  PLATFORMS.forEach(pl=>{
    const sx=pl.x-camX;
    if(sx>CW||sx+pl.w<0)return;
    // Shadow
    ctx.fillStyle='rgba(0,0,0,.28)'; ctx.fillRect(sx+4,pl.y+4,pl.w,pl.h);
    // Soil
    const pg=ctx.createLinearGradient(0,pl.y,0,pl.y+pl.h);
    pg.addColorStop(0,'#58B822');pg.addColorStop(.25,'#7B4A18');pg.addColorStop(1,'#4A2A0A');
    ctx.fillStyle=pg; ctx.fillRect(sx,pl.y,pl.w,pl.h);
    // Grass strip
    ctx.fillStyle='#6AD430'; ctx.fillRect(sx,pl.y,pl.w,6);
    // Dirt edge
    ctx.fillStyle='#8B5E2A'; ctx.fillRect(sx,pl.y+6,pl.w,3);
    // Support post (brown wood)
    const tw=8,postH=GROUND-(pl.y+pl.h);
    if(postH>0){
      const postG=ctx.createLinearGradient(sx+pl.w/2-tw/2,0,sx+pl.w/2+tw/2,0);
      postG.addColorStop(0,'#3A1A00');postG.addColorStop(.5,'#6B3010');postG.addColorStop(1,'#3A1A00');
      ctx.fillStyle=postG;
      ctx.fillRect(sx+pl.w/2-tw/2,pl.y+pl.h,tw,postH);
      // Bark lines
      ctx.strokeStyle='rgba(20,8,0,.4)';ctx.lineWidth=1;
      for(let i=1;i<3;i++){const ly=pl.y+pl.h+postH*(i*.33);ctx.beginPath();ctx.moveTo(sx+pl.w/2-tw/2,ly);ctx.lineTo(sx+pl.w/2+tw/2,ly);ctx.stroke();}
    }
    // Grass tufts on platform
    ctx.fillStyle='#7AE840';
    for(let i=0;i<pl.w;i+=16){ctx.fillRect(sx+i+2,pl.y-2,2,4);}
  });

  // ─── Holes (buracos) ───
  HOLES.forEach(h=>{
    const sx=h.x-camX;
    if(sx>CW||sx+h.w<0)return;

    // Abyss depth gradient
    const hg=ctx.createLinearGradient(0,GROUND,0,CH);
    hg.addColorStop(0,  '#1A0800'); // top of abyss — dark brown
    hg.addColorStop(.15,'#0C0400');
    hg.addColorStop(1,  '#000');
    ctx.fillStyle=hg; ctx.fillRect(sx,GROUND,h.w,CH-GROUND);

    // Glow bottom of hole (hot lava glow? nah, deep earth glow)
    const glow=ctx.createRadialGradient(sx+h.w/2,CH,5,sx+h.w/2,CH,h.w*.7);
    glow.addColorStop(0,'rgba(80,20,0,.5)'); glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow; ctx.fillRect(sx,GROUND,h.w,CH-GROUND);

    // Jagged rocky left edge
    ctx.fillStyle='#5C3010';
    ctx.beginPath();
    ctx.moveTo(sx,GROUND);
    for(let y=GROUND;y<GROUND+80;y+=10){
      ctx.lineTo(sx-(3+Math.sin(y*.35)*5),y);
    }
    ctx.lineTo(sx,GROUND+80);
    ctx.closePath(); ctx.fill();

    // Jagged rocky right edge
    ctx.fillStyle='#4A2408';
    ctx.beginPath();
    ctx.moveTo(sx+h.w,GROUND);
    for(let y=GROUND;y<GROUND+80;y+=10){
      ctx.lineTo(sx+h.w+(3+Math.sin(y*.42+1)*5),y);
    }
    ctx.lineTo(sx+h.w,GROUND+80);
    ctx.closePath(); ctx.fill();

    // Dirt crumble on edges
    ctx.fillStyle='#8B5E2A';
    ctx.fillRect(sx-3,GROUND,4,8); ctx.fillRect(sx-1,GROUND+8,3,5);
    ctx.fillRect(sx+h.w-1,GROUND,4,8); ctx.fillRect(sx+h.w-2,GROUND+8,3,5);

    // Darkness shadow cast inward
    const shadowL=ctx.createLinearGradient(sx,0,sx+28,0);
    shadowL.addColorStop(0,'rgba(0,0,0,.7)'); shadowL.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=shadowL; ctx.fillRect(sx,GROUND,28,CH-GROUND);

    const shadowR=ctx.createLinearGradient(sx+h.w,0,sx+h.w-28,0);
    shadowR.addColorStop(0,'rgba(0,0,0,.7)'); shadowR.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=shadowR; ctx.fillRect(sx+h.w-28,GROUND,28,CH-GROUND);

    // Small rocks at edge
    [[sx-5,GROUND-2,6,4],[sx+2,GROUND-1,4,3],[sx+h.w,GROUND-2,5,4],[sx+h.w-6,GROUND-1,4,3]].forEach(([rx,ry,rw,rh])=>{
      ctx.fillStyle='#8B6030';ctx.fillRect(rx,ry,rw,rh);
    });
  });
}

// ═══ ENEMIES (posições ajustadas para mapa menor) ═══
const ENEMY_DEFS=[
  // Antes da safe zone
  {t:'tomato', x:400,  p:140},
  {t:'lettuce',x:620,  by:GROUND-150},
  {t:'carrot', x:870},
  {t:'tomato', x:1200, p:160},
  {t:'lettuce',x:1480, by:GROUND-140},
  {t:'carrot', x:1700},
  {t:'tomato', x:1950, p:180},
  {t:'lettuce',x:2200, by:GROUND-155},
  {t:'carrot', x:2450},
  {t:'tomato', x:2700, p:160},
  {t:'lettuce',x:2950, by:GROUND-130},
  {t:'carrot', x:3200},
  {t:'tomato', x:3400, p:140},
  // Pós safe zone
  {t:'tomato', x:5050, p:140},
  {t:'lettuce',x:5280, by:GROUND-145},
  {t:'carrot', x:5480},
  {t:'tomato', x:5720, p:160},
  {t:'lettuce',x:5960, by:GROUND-120},
  {t:'carrot', x:6200},
  {t:'tomato', x:6440, p:180},
  {t:'lettuce',x:6680, by:GROUND-140},
  {t:'carrot', x:6920},
  {t:'tomato', x:7150, p:160},
  {t:'lettuce',x:7380, by:GROUND-130},
  {t:'carrot', x:7620},
  {t:'tomato', x:7850, p:150},
  {t:'lettuce',x:8050, by:GROUND-125},
];

let enemies=[];
function spawnEnemies(){
  enemies=ENEMY_DEFS.filter(d=>d.x<SAFE.x1||d.x>SAFE.x2).map(d=>{
    const e={type:d.t,alive:true,hitTimer:0,animFrame:0};
    if(d.t==='tomato') Object.assign(e,{x:d.x,y:GROUND-50,w:44,h:50,originX:d.x,patrolDist:d.p||150,vx:1.4,dir:1});
    else if(d.t==='lettuce') Object.assign(e,{x:d.x,baseY:d.by||GROUND-140,y:d.by||GROUND-140,w:48,h:44,phase:Math.random()*Math.PI*2,vx:-1.2});
    else if(d.t==='carrot') Object.assign(e,{x:d.x,y:GROUND-55,w:40,h:55,charging:false,chargeVx:0,chargeLeft:0,dir:-1,originX:d.x,chargeSpeed:3.5});
    return e;
  });
}

// Loja no centro da safe zone
const SHOP={x:4200, y:GROUND-92, w:160, h:92, interactR:130};
const PEDESTAL={x:8300, y:GROUND-75, w:90, h:75, collected:false, interactR:120};

// ─── Helper: checks if a ground X position is over a hole ───
function isWorldXOverHole(worldX) {
  return HOLES.some(h => worldX > h.x - 4 && worldX < h.x + h.w + 4);
}
function isEnemyOverHole(e) {
  // Check both feet
  return isWorldXOverHole(e.x + 4) || isWorldXOverHole(e.x + e.w - 4);
}

// ─── NUGGETS scattered across map ───
const NUGGET_DEFS = [
  // Pre-safe zone
  {x:220, y:GROUND-30}, {x:490, y:GROUND-30}, {x:660, y:GROUND-105},
  {x:800, y:GROUND-175},{x:990, y:GROUND-240},{x:1050,y:GROUND-30},
  {x:1260,y:GROUND-30}, {x:1400,y:GROUND-120},{x:1530,y:GROUND-175},
  {x:1680,y:GROUND-30}, {x:1780,y:GROUND-130},{x:1900,y:GROUND-200},
  {x:2060,y:GROUND-255},{x:2200,y:GROUND-30}, {x:2360,y:GROUND-200},
  {x:2550,y:GROUND-30}, {x:2780,y:GROUND-30}, {x:2900,y:GROUND-145},
  {x:3100,y:GROUND-30}, {x:3350,y:GROUND-30},
  // Post-safe zone
  {x:5120,y:GROUND-30}, {x:5350,y:GROUND-110},{x:5580,y:GROUND-180},
  {x:5750,y:GROUND-250},{x:5900,y:GROUND-30}, {x:6050,y:GROUND-110},
  {x:6250,y:GROUND-30}, {x:6500,y:GROUND-165},{x:6700,y:GROUND-230},
  {x:6900,y:GROUND-30}, {x:7100,y:GROUND-150},{x:7350,y:GROUND-30},
  {x:7600,y:GROUND-210},{x:7800,y:GROUND-30}, {x:8100,y:GROUND-30},
];

let mapNuggets = [];
function spawnMapNuggets() {
  mapNuggets = NUGGET_DEFS.map((d,i) => ({
    id: i, x: d.x, y: d.y, collected: false,
    phase: Math.random() * Math.PI * 2,
    size: 14,
  }));
}

function drawMapNuggets(camX) {
  const t = Date.now();
  mapNuggets.forEach(n => {
    if (n.collected) return;
    const sx = n.x - camX;
    if (sx < -30 || sx > CW + 30) return;
    const bob = Math.sin(t * .004 + n.phase) * 3;
    const sy = n.y + bob;
    ctx.save();
    // Glow
    ctx.globalAlpha = .3 + .15 * Math.abs(Math.sin(t * .004 + n.phase));
    const rg = ctx.createRadialGradient(sx, sy, 2, sx, sy, 18);
    rg.addColorStop(0, '#FF9900'); rg.addColorStop(1, 'rgba(255,153,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(sx - 18, sy - 18, 36, 36);
    ctx.restore();
    // Body
    ctx.save();
    ctx.fillStyle = '#FF9900';
    ctx.strokeStyle = '#CC5500';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(sx, sy, n.size*.72, n.size*.58, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Shine
    ctx.fillStyle = 'rgba(255,230,100,.5)';
    ctx.beginPath(); ctx.ellipse(sx - 3, sy - 3, n.size*.28, n.size*.18, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Center label
    ctx.fillStyle = '#7A2200';
    ctx.font = `bold ${Math.round(n.size * .7)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', sx, sy);
    ctx.restore();
  });
}

function checkNuggetCollision() {
  mapNuggets.forEach(n => {
    if (n.collected) return;
    const dist = Math.hypot(P.x + P.w/2 - n.x, P.y + P.h/2 - n.y);
    if (dist < 24) {
      n.collected = true;
      sessionNuggets += 1;
      updateHUDNuggets();
      sfxNugget();
      // Pop particle
      particles.push({x:n.x, y:n.y-14, vx:0, vy:-1.1, text:'+1🍗', life:1, decay:.022, isText:true, col:'#FF9900'});
    }
  });
}

// ═══ ENEMY DRAWING ═══
function drawEnemy(e,camX){
  if(!e.alive)return;
  const sx=e.x-camX;
  if(sx<-80||sx>CW+80)return;
  if(e.hitTimer>0){ctx.save();ctx.globalAlpha=.55;ctx.fillStyle='#FFF';ctx.fillRect(sx,e.y,e.w,e.h);ctx.restore();return;}
  if(e.type==='tomato')drawTomato(e,sx);
  else if(e.type==='lettuce')drawLettuce(e,sx);
  else if(e.type==='carrot')drawCarrot(e,sx);
}

function drawTomato(e,sx){
  const t=Date.now(),cy=e.y+e.h/2,cx=sx+e.w/2,lo=Math.sin(t*.012)*5;
  ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(cx,e.y+e.h,14,5,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.fillStyle='#CC1100';ctx.fillRect(cx-14,e.y+e.h-12,10,14+lo);ctx.fillRect(cx+4,e.y+e.h-12,10,14-lo);
  ctx.fillStyle='#EE1100';ctx.beginPath();ctx.ellipse(cx,cy-4,20,22,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,120,100,.4)';ctx.beginPath();ctx.ellipse(cx-6,cy-12,7,9,-0.4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#338820';ctx.beginPath();ctx.moveTo(cx,cy-24);ctx.lineTo(cx-12,cy-18);ctx.lineTo(cx-8,cy-14);ctx.lineTo(cx,cy-20);ctx.lineTo(cx+8,cy-14);ctx.lineTo(cx+12,cy-18);ctx.closePath();ctx.fill();
  const eyY=cy-8;
  ctx.fillStyle='#FFF';ctx.fillRect(cx-13,eyY-4,10,8);ctx.fillRect(cx+3,eyY-4,10,8);
  ctx.fillStyle='#1A0000';ctx.fillRect(cx-10,eyY-2,5,5);ctx.fillRect(cx+5,eyY-2,5,5);
  ctx.strokeStyle='#1A0000';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(cx-14,eyY-7);ctx.lineTo(cx-3,eyY-4);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+14,eyY-7);ctx.lineTo(cx+3,eyY-4);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx-6,eyY+8);ctx.quadraticCurveTo(cx,eyY+5,cx+6,eyY+8);ctx.stroke();
}
function drawLettuce(e,sx){
  const t=Date.now(),cx=sx+e.w/2,cy=e.y+e.h/2,wf=Math.sin(t*.016)*8;
  ctx.save();ctx.globalAlpha=.7;ctx.fillStyle='rgba(80,190,60,.7)';
  ctx.save();ctx.translate(cx-20,cy);ctx.rotate(-0.3+wf*.015);ctx.beginPath();ctx.ellipse(0,0,22,10,-0.3,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.translate(cx+20,cy);ctx.rotate(0.3-wf*.015);ctx.beginPath();ctx.ellipse(0,0,22,10,0.3,0,Math.PI*2);ctx.fill();ctx.restore();ctx.restore();
  ctx.fillStyle='#44BB22';ctx.beginPath();ctx.ellipse(cx,cy,20,18,0,0,Math.PI*2);ctx.fill();
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;ctx.fillStyle='#66CC44';ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*18,cy+Math.sin(a)*16,7,5,a,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#338810';ctx.beginPath();ctx.ellipse(cx,cy,12,11,0,0,Math.PI*2);ctx.fill();
  const eyY=cy-4;
  ctx.fillStyle='#FFF';ctx.fillRect(cx-11,eyY-3,8,7);ctx.fillRect(cx+3,eyY-3,8,7);
  ctx.fillStyle='#0A1A00';ctx.fillRect(cx-9,eyY-1,4,4);ctx.fillRect(cx+5,eyY-1,4,4);
  ctx.strokeStyle='#0A1A00';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(cx-12,eyY-6);ctx.lineTo(cx-3,eyY-3);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+12,eyY-6);ctx.lineTo(cx+2,eyY-3);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx-5,eyY+7);ctx.quadraticCurveTo(cx,eyY+4,cx+5,eyY+7);ctx.stroke();
}
function drawCarrot(e,sx){
  const cx=sx+e.w/2,cy=e.y+e.h/2;
  ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(cx,e.y+e.h,12,5,0,0,Math.PI*2);ctx.fill();ctx.restore();
  if(e.charging){ctx.save();ctx.globalAlpha=.32+.18*Math.abs(Math.sin(Date.now()*.012));ctx.fillStyle='#FF4400';ctx.beginPath();ctx.ellipse(cx,e.y+e.h/2,e.w*.75,e.h*.65,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  ctx.fillStyle='#FF8800';ctx.beginPath();ctx.moveTo(cx,e.y+e.h);ctx.lineTo(cx-16,e.y+10);ctx.lineTo(cx+16,e.y+10);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#CC5500';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(cx-10,e.y+28);ctx.lineTo(cx+10,e.y+28);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx-7,e.y+42);ctx.lineTo(cx+7,e.y+42);ctx.stroke();
  ctx.fillStyle='#44AA20';ctx.save();ctx.translate(cx,e.y+10);
  for(let i=-1;i<=1;i++){ctx.save();ctx.rotate(i*.4);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-5,-20);ctx.lineTo(5,-20);ctx.closePath();ctx.fill();ctx.restore();}
  ctx.restore();
  const faceY=e.y+28;
  ctx.fillStyle='#FFF';ctx.fillRect(cx-10,faceY-4,7,7);ctx.fillRect(cx+3,faceY-4,7,7);
  ctx.fillStyle='#1A0800';ctx.fillRect(cx-8,faceY-2,4,4);ctx.fillRect(cx+5,faceY-2,4,4);
  ctx.strokeStyle='#1A0800';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(cx-12,faceY-8);ctx.lineTo(cx-3,faceY-4);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+12,faceY-8);ctx.lineTo(cx+2,faceY-4);ctx.stroke();
  ctx.lineWidth=2;
  if(e.charging){ctx.fillStyle='#331100';ctx.beginPath();ctx.ellipse(cx,faceY+6,5,6,0,0,Math.PI*2);ctx.fill();}
  else{ctx.beginPath();ctx.moveTo(cx-5,faceY+5);ctx.quadraticCurveTo(cx,faceY+2,cx+5,faceY+5);ctx.stroke();}
}

// ═══ SHOP WORLD ═══
function drawShopWorld(camX){
  const sx=SHOP.x-camX;if(sx<-200||sx>CW+200)return;
  const sy=SHOP.y;
  ctx.fillStyle='#5C2E00';ctx.fillRect(sx,sy,SHOP.w,SHOP.h);
  ctx.fillStyle='#7A3D0A';for(let i=0;i<6;i++)ctx.fillRect(sx,sy+i*16,SHOP.w,3);
  ctx.fillStyle='#4A1E00';ctx.fillRect(sx,sy+SHOP.h-18,SHOP.w,18);
  ctx.fillStyle='#8B5010';ctx.fillRect(sx,sy+SHOP.h-20,SHOP.w,5);
  const cg=ctx.createLinearGradient(sx,sy-36,sx,sy);cg.addColorStop(0,'#DD3300');cg.addColorStop(1,'#FF5500');
  ctx.fillStyle=cg;ctx.beginPath();ctx.moveTo(sx-12,sy);ctx.lineTo(sx+SHOP.w+12,sy);ctx.lineTo(sx+SHOP.w+4,sy-32);ctx.lineTo(sx-4,sy-32);ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.18)';for(let i=0;i<5;i++)ctx.fillRect(sx+14+i*28,sy-32,12,32);
  ctx.fillStyle='#F5E6C8';ctx.fillRect(sx+14,sy+8,SHOP.w-28,26);
  ctx.strokeStyle='#8B4513';ctx.lineWidth=2;ctx.strokeRect(sx+14,sy+8,SHOP.w-28,26);
  ctx.fillStyle='#331100';ctx.font='7px "Press Start 2P",monospace';ctx.textAlign='center';
  ctx.fillText('FEIRA DO',sx+SHOP.w/2,sy+20);ctx.fillText('RHYAN',sx+SHOP.w/2,sy+30);
  ctx.textAlign='left';ctx.font='20px sans-serif';ctx.fillText('🧑‍🌾',sx+SHOP.w/2-14,sy+SHOP.h-8);
  const dist=Math.abs((P.x+P.w/2)-(SHOP.x+SHOP.w/2));
  if(dist<SHOP.interactR){ctx.save();ctx.globalAlpha=.13+.07*Math.sin(Date.now()*.005);ctx.fillStyle='#FFDD00';ctx.fillRect(sx-4,sy-38,SHOP.w+8,SHOP.h+42);ctx.restore();}
}

// ═══ PEDESTAL ═══
function drawPedestal(camX){
  const sx=PEDESTAL.x-camX;if(sx<-120||sx>CW+120||PEDESTAL.collected)return;
  const sy=PEDESTAL.y,cx2=sx+PEDESTAL.w/2,t=Date.now();
  const sg=ctx.createLinearGradient(sx,sy,sx+PEDESTAL.w,sy);sg.addColorStop(0,'#666');sg.addColorStop(.5,'#999');sg.addColorStop(1,'#666');
  ctx.fillStyle=sg;ctx.fillRect(sx,sy,PEDESTAL.w,PEDESTAL.h);
  ctx.strokeStyle='#555';ctx.lineWidth=1;for(let row=0;row<4;row++)for(let col=0;col<3;col++)ctx.strokeRect(sx+col*30+4,sy+row*18+4,26,14);
  ctx.fillStyle='#AAA';ctx.fillRect(sx-6,sy-6,PEDESTAL.w+12,10);
  ctx.fillStyle='#777';ctx.fillRect(sx-8,sy+PEDESTAL.h-8,PEDESTAL.w+16,10);
  ctx.save();ctx.globalAlpha=.18+.12*Math.sin(t*.004);const rg2=ctx.createRadialGradient(cx2,sy-20,5,cx2,sy-20,60);rg2.addColorStop(0,'#FFD700');rg2.addColorStop(1,'rgba(255,215,0,0)');ctx.fillStyle=rg2;ctx.fillRect(sx-60,sy-80,PEDESTAL.w+120,100);ctx.restore();
  const floatY=sy-42+Math.sin(t*.003)*6;
  ctx.font=`${32+Math.sin(t*.004)*2}px sans-serif`;ctx.textAlign='center';ctx.fillText('🍞',cx2,floatY);ctx.textAlign='left';
  for(let i=0;i<5;i++){const sa=(t*.002+i*(Math.PI*2/5))%(Math.PI*2);ctx.save();ctx.globalAlpha=.7*(0.5+0.5*Math.sin(t*.006+i));ctx.fillStyle='#FFD700';ctx.fillRect(cx2+Math.cos(sa)*35-2,floatY-10+Math.sin(sa)*20-2,4,4);ctx.restore();}
  const pd=Math.abs((P.x+P.w/2)-(PEDESTAL.x+PEDESTAL.w/2));
  if(pd<PEDESTAL.interactR){ctx.save();ctx.globalAlpha=.18;ctx.fillStyle='#FFD700';ctx.fillRect(sx-10,sy-60,PEDESTAL.w+20,PEDESTAL.h+70);ctx.restore();}
}

// ═══ PLAYER ═══
function drawPlayer(camX){
  const sx=P.x-camX,sy=P.y;
  if(P.invul&&!P.potion&&Math.floor(Date.now()/75)%2===1)return;
  ctx.save();ctx.translate(sx+P.w/2,sy+P.h/2);if(P.facing===-1)ctx.scale(-1,1);
  const spKey=P.state==='run'?`run${P.animFrame%4}`:P.state;
  if(P.sprites[spKey])ctx.drawImage(P.sprites[spKey],-P.w/2,-P.h/2,P.w,P.h);
  else drawMichaelProc();
  ctx.restore();
  if(P.potion){ctx.save();ctx.globalAlpha=.22+.12*Math.sin(Date.now()*.008);const rg3=ctx.createRadialGradient(sx+P.w/2,sy+P.h/2,10,sx+P.w/2,sy+P.h/2,46);rg3.addColorStop(0,'#88CCFF');rg3.addColorStop(1,'rgba(136,204,255,0)');ctx.fillStyle=rg3;ctx.fillRect(sx-12,sy-12,P.w+24,P.h+24);ctx.restore();}
  if(DEV_GODMODE){ctx.save();ctx.globalAlpha=.3+.15*Math.sin(Date.now()*.005);ctx.strokeStyle='#FFD700';ctx.lineWidth=3;ctx.beginPath();ctx.arc(sx+P.w/2,sy-4,20,0,Math.PI*2);ctx.stroke();ctx.restore();}
}

function drawMichaelProc(){
  const t=Date.now(),hw=P.w/2,hh=P.h/2;
  const run=P.state==='run',jump=P.state==='jump',hurt=P.state==='hurt';
  const ls=run?Math.sin(t*.015)*12:0,as=run?Math.sin(t*.015+Math.PI)*10:0;
  const ib=P.state==='idle'?Math.sin(t*.003)*1.5:0;
  ctx.save();ctx.globalAlpha=.28;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(0,hh+2,16,5,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.fillStyle='#2244AA';
  ctx.save();ctx.translate(-7,hh*.35+ib);ctx.rotate((ls-(jump?8:0))*Math.PI/180);ctx.fillRect(-5,0,11,24);ctx.fillStyle='#221100';ctx.fillRect(-6,22,14,8);ctx.restore();
  ctx.fillStyle='#2244AA';
  ctx.save();ctx.translate(7,hh*.35+ib);ctx.rotate((-ls+(jump?8:0))*Math.PI/180);ctx.fillRect(-5,0,11,24);ctx.fillStyle='#221100';ctx.fillRect(-6,22,14,8);ctx.restore();
  ctx.fillStyle=hurt?'#FF4400':'#E85500';ctx.fillRect(-12,-hh*.35+ib,24,hh*.75);
  ctx.fillStyle='rgba(255,255,255,.15)';ctx.fillRect(2,-hh*.22+ib,8,7);
  ctx.fillStyle='#FFAA66';
  ctx.save();ctx.translate(-14,-hh*.2+ib);ctx.rotate((as-(jump?-25:0))*Math.PI/180);ctx.fillRect(-5,0,10,22);ctx.restore();
  ctx.save();ctx.translate(14,-hh*.2+ib);ctx.rotate((-as+(jump?-25:0))*Math.PI/180);ctx.fillRect(-5,0,10,22);ctx.restore();
  const headY=-hh*.72+ib;
  ctx.fillStyle='#FFAA66';ctx.fillRect(-5,headY+22,10,8);ctx.beginPath();ctx.ellipse(0,headY+10,14,16,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#3A1A00';ctx.beginPath();ctx.ellipse(0,headY-2,14,10,0,0,Math.PI);ctx.fill();ctx.fillRect(-14,headY-2,28,5);
  const eyeY=headY+8;
  ctx.fillStyle='#FFF';ctx.fillRect(-9,eyeY-4,7,7);ctx.fillRect(2,eyeY-4,7,7);
  ctx.fillStyle='#1A0A00';ctx.fillRect(-7,eyeY-2,4,4);ctx.fillRect(4,eyeY-2,4,4);
  if(hurt){ctx.strokeStyle='#CC0000';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-9,eyeY-4);ctx.lineTo(-2,eyeY+3);ctx.stroke();ctx.beginPath();ctx.moveTo(-2,eyeY-4);ctx.lineTo(-9,eyeY+3);ctx.stroke();ctx.beginPath();ctx.moveTo(2,eyeY-4);ctx.lineTo(9,eyeY+3);ctx.stroke();ctx.beginPath();ctx.moveTo(9,eyeY-4);ctx.lineTo(2,eyeY+3);ctx.stroke();}
  ctx.strokeStyle='#662200';ctx.lineWidth=1.5;ctx.beginPath();
  if(P.state==='idle')ctx.arc(0,eyeY+6,5,.1,Math.PI-.1);
  else if(run){ctx.moveTo(-4,eyeY+7);ctx.lineTo(4,eyeY+7);}
  else if(jump)ctx.arc(0,eyeY+5,4,.4,Math.PI*1.6,true);
  ctx.stroke();
}

// ═══ PHYSICS ═══
function isOnSolid(px,py,pw){return!HOLES.some(h=>px+pw-6>h.x+6&&px+6<h.x+h.w-6);}
function platformAbove(px,py,pw){
  for(const pl of PLATFORMS){
    if(px+pw-4>pl.x&&px+4<pl.x+pl.w&&py+P.h>=pl.y&&py+P.h<=pl.y+pl.h+14&&P.vy>=0)return pl.y;
  }
  return null;
}

function updatePhysics(dt){
  if(gState!=='PLAYING')return;
  if(keys.left){P.vx=-SPD;P.facing=-1;P.state='run';}
  else if(keys.right){P.vx=SPD;P.facing=1;P.state='run';}
  else{P.vx*=.75;if(Math.abs(P.vx)<.2)P.vx=0;}
  if(!keys.left&&!keys.right)P.state=P.onGround?'idle':'jump';
  if(keys.jump&&P.onGround){P.vy=JUMP_V;P.onGround=false;P.state='jump';keys.jump=false;}
  P.vy+=GRAVITY;if(P.vy>18)P.vy=18;
  P.x+=P.vx;P.y+=P.vy;
  if(P.x<0){P.x=0;P.vx=0;}if(P.x+P.w>MAP_W){P.x=MAP_W-P.w;P.vx=0;}
  P.onGround=false;
  const platY=platformAbove(P.x,P.y,P.w);
  if(platY!==null){P.y=platY-P.h;P.vy=0;P.onGround=true;}
  if(P.y+P.h>=GROUND){
    if(isOnSolid(P.x,P.y,P.w)){P.y=GROUND-P.h;P.vy=0;P.onGround=true;}
    else if(P.y>GROUND+150)takeDamage(true);
  }
  if(!P.onGround)P.state='jump';
  else if(Math.abs(P.vx)>.5)P.state='run';
  else P.state='idle';
  P.animTimer+=dt;if(P.animTimer>P.ANIM_SPD){P.animFrame=(P.animFrame+1)%4;P.animTimer=0;}
  if(P.invul){P.invulTimer-=dt;if(P.invulTimer<=0){P.invul=false;P.invulTimer=0;}}
  if(P.potion){P.potion.timeLeft-=dt;if(P.potion.timeLeft<=0){P.potion=null;updateInvulBar(0);}else updateInvulBar(P.potion.timeLeft/P.POTION_DUR);}
  const prog=Math.min(1,Math.max(0,(P.x-100)/(PEDESTAL.x-200)));
  document.getElementById('hud-progress-fill').style.width=(prog*100)+'%';
}

function takeDamage(instant=false){
  if(DEV_GODMODE||P.potion||P.invul)return;
  P.lives--;P.state='hurt';updateHUDLives();
  const flash=document.getElementById('damage-flash');
  flash.classList.remove('flash-active');void flash.offsetWidth;flash.classList.add('flash-active');
  if(P.lives<=0){triggerGameOver();return;}
  if(instant){P.x=100;P.y=GROUND-P.h-2;P.vx=0;P.vy=0;}
  P.invul=true;P.invulTimer=P.INVUL_DUR;
}

// ═══ ENEMY AI ═══
function updateEnemies(dt){
  if(gState!=='PLAYING')return;
  enemies.forEach(e=>{
    if(!e.alive)return;
    if(e.hitTimer>0)e.hitTimer-=dt;
    const eCx=e.x+e.w/2,pCx=P.x+P.w/2;
    if(e.type==='tomato'){
      // Check if next step is over a hole → reverse
      const nextX = e.x + e.vx;
      const footCheck = e.vx > 0 ? nextX + e.w : nextX;
      if (isWorldXOverHole(footCheck)) {
        e.vx *= -1;
        // Also clamp patrol to not go over hole
        e.originX = e.x;
      }
      e.x+=e.vx;
      if(e.x<e.originX-e.patrolDist||e.x>e.originX+e.patrolDist)e.vx*=-1;
      // If enemy somehow fell into hole, kill it
      if(isEnemyOverHole(e)){
        e.y += GRAVITY * 2;
        if(e.y > CH + 20){ e.alive = false; return; }
      } else {
        e.y=GROUND-e.h;
      }
      e.dir=pCx>eCx?1:-1;
    }else if(e.type==='lettuce'){
      e.phase+=.002*dt;e.y=e.baseY+Math.sin(e.phase)*28;
      e.x+=e.vx*(dt/16);
      if(e.x<0)e.vx=Math.abs(e.vx);if(e.x>MAP_W-e.w)e.vx=-Math.abs(e.vx);
      e.dir=pCx>eCx?1:-1;
    }else if(e.type==='carrot'){
      if(!e.charging){
        const dist=Math.abs(pCx-eCx);
        if(dist<220&&dist>40){e.charging=true;e.chargeVx=(pCx>eCx?1:-1)*e.chargeSpeed;e.chargeLeft=240;e.dir=e.chargeVx>0?1:-1;}
      }else{
        // Check for hole while charging
        const nextCX = e.x + e.chargeVx;
        const chkFoot = e.chargeVx > 0 ? nextCX + e.w : nextCX;
        if (isWorldXOverHole(chkFoot)) {
          // Carrot falls into hole
          e.y += GRAVITY * 3;
          if(e.y > CH + 20){ e.alive = false; return; }
        } else {
          e.x+=e.chargeVx;
        }
        e.chargeLeft-=Math.abs(e.chargeVx);
        if(e.chargeLeft<=0){e.charging=false;e.chargeVx=0;}
        if(e.x<0||e.x+e.w>MAP_W){e.charging=false;e.chargeVx=0;}
      }
      if(!isEnemyOverHole(e)) e.y=GROUND-e.h;
    }
    // ─── HITBOX: STOMP vs DAMAGE ───
    if(rectsOverlap(P,e)){
      const pBottom=P.y+P.h;
      const eTop=e.y;
      // CENOURA: zona de pisar mais generosa (topo 30% do sprite, não 16px fixo)
      const stompZone = e.type==='carrot' ? e.h*0.30 : 18;
      if(P.vy>0.5 && pBottom < eTop+stompZone && e.type!=='lettuce'){
        killEnemy(e);P.vy=JUMP_V*.55;
      }else if(!P.invul&&!P.potion){
        takeDamage();P.vx=(P.x<eCx?-5:5);P.vy=-5;
      }
    }
  });
}

function killEnemy(e){
  e.alive=false;sessionNuggets+=2;updateHUDNuggets();
  spawnDeathParticles(e.x+e.w/2,e.y+e.h/2,e.type);
}

function rectsOverlap(a,b){
  return a.x+6<b.x+b.w-6&&a.x+a.w-6>b.x+6&&a.y+8<b.y+b.h-6&&a.y+a.h-4>b.y+8;
}

// ═══ INPUT ═══
const keys={left:false,right:false,jump:false,interact:false,useItem:false};
function setupInput(){
  const K={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'jump',w:'jump',W:'jump',' ':'jump',e:'interact',E:'interact',q:'useItem',Q:'useItem'};
  document.addEventListener('keydown',ev=>{
    if(K[ev.key]){if(K[ev.key]==='jump'&&P.onGround)keys.jump=true;else keys[K[ev.key]]=true;}
    if(ev.key==='Escape'){ev.preventDefault();openIngameMenu();}
    // Reset gamepad input source indicator
    if(K[ev.key]) GP.connected && updateGamepadIcons();
  });
  document.addEventListener('keyup',ev=>{if(K[ev.key]&&K[ev.key]!=='jump')keys[K[ev.key]]=false;});
  [['mb-left','left'],['mb-right','right'],['mb-jump','jump'],['mb-interact','interact'],['mb-item','useItem']].forEach(([id,key])=>{
    const btn=document.getElementById(id);if(!btn)return;
    const dn=e=>{e.preventDefault();if(key==='jump'&&P.onGround)keys.jump=true;else keys[key]=true;btn.classList.add('pressed');};
    const up=e=>{e.preventDefault();if(key!=='jump')keys[key]=false;btn.classList.remove('pressed');};
    btn.addEventListener('touchstart',dn,{passive:false});btn.addEventListener('touchend',up,{passive:false});
    btn.addEventListener('mousedown',dn);btn.addEventListener('mouseup',up);
  });
}

// ═══ INTERACT ═══
let interactTarget=null;
function checkInteractables(){
  const pCx=P.x+P.w/2;
  const ds=Math.abs(pCx-(SHOP.x+SHOP.w/2));
  const dp=Math.abs(pCx-(PEDESTAL.x+PEDESTAL.w/2));
  const hint=document.getElementById('interact-hint');
  const hIcon=document.getElementById('interact-icon'),hText=document.getElementById('interact-text');
  const gpHint=document.getElementById('interact-gp-hint');
  if(ds<SHOP.interactR&&gState==='PLAYING'){
    hint.classList.remove('hidden');hIcon.textContent='🏪';
    hText.textContent=GP.connected?'Entrar na Feira do Rhyan':'[E] Feira do Rhyan';
    if(GP.connected&&gpHint){gpHint.classList.remove('hidden');}
    interactTarget='shop';
  }else if(!PEDESTAL.collected&&dp<PEDESTAL.interactR&&gState==='PLAYING'){
    hint.classList.remove('hidden');hIcon.textContent='🍞';
    hText.textContent=GP.connected?'Pegar o Pão!':'[E] Pegar o Pão!';
    if(GP.connected&&gpHint){gpHint.classList.remove('hidden');}
    interactTarget='pedestal';
  }else{hint.classList.add('hidden');if(gpHint)gpHint.classList.add('hidden');interactTarget=null;}
  if(keys.interact&&interactTarget){
    keys.interact=false;
    if(interactTarget==='shop')openShop();
    if(interactTarget==='pedestal'&&!PEDESTAL.collected)collectBread();
  }
}

// ═══ BAG ═══
function toggleBag(){
  const pop=document.getElementById('bag-popup');
  if(pop.classList.contains('hidden')){pop.classList.remove('hidden');renderBagUI();gState='BAG';}
  else{pop.classList.add('hidden');if(gState==='BAG')gState='PLAYING';}
}
function renderBagUI(){
  const inner=document.getElementById('bag-slot-inner-0');
  if(P.item==='potion'){inner.textContent='⚡';inner.classList.add('has-item');}
  else{inner.textContent='—';inner.classList.remove('has-item');}
  document.getElementById('bag-item-dot').classList.toggle('hidden',!P.item);
}
function useBagItem(slot){
  if(slot===0&&P.item==='potion'){
    P.potion={timeLeft:P.POTION_DUR};P.item=null;updateInventoryUI();
    document.getElementById('invul-bar-wrap').classList.remove('hidden');toggleBag();
  }
}

// ═══ ITEM USE ═══
function checkItemUse(){
  if(keys.useItem&&P.item){
    keys.useItem=false;
    if(P.item==='potion'){P.potion={timeLeft:P.POTION_DUR};P.item=null;updateInventoryUI();document.getElementById('invul-bar-wrap').classList.remove('hidden');}
  }
}

// ═══ HUD ═══
function updateHUDLives(){[1,2,3].forEach(i=>{document.getElementById(`heart${i}`).classList.toggle('lost',i>P.lives);});}
function updateHUDNuggets(){document.getElementById('hud-nuggets').textContent=(readNuggets()+sessionNuggets).toLocaleString('pt-BR');}
function updateInventoryUI(){document.getElementById('bag-item-dot').classList.toggle('hidden',!P.item);renderBagUI();}
function updateInvulBar(ratio){
  document.getElementById('invul-fill').style.width=(ratio*100)+'%';
  document.getElementById('invul-timer').textContent=Math.ceil(ratio*P.POTION_DUR/1000)+'s';
  if(ratio<=0)document.getElementById('invul-bar-wrap').classList.add('hidden');
}

// ═══ SHOP ═══
let shopFocusIdx = 0;
function openShop(){
  gState='SHOP'; shopFocusIdx = 0;
  document.getElementById('shop-overlay').classList.remove('hidden');
  document.getElementById('shop-nugget-display').textContent=(readNuggets()+sessionNuggets).toLocaleString('pt-BR');
  document.getElementById('shop-msg').textContent='';
  updateShopFocus();
}
function closeShop(){gState='PLAYING';document.getElementById('shop-overlay').classList.add('hidden');}

function updateShopFocus() {
  const items = document.querySelectorAll('.shop-item');
  const closeBtn = document.getElementById('shop-close');
  const allFocusable = [...items, closeBtn];
  allFocusable.forEach((el, i) => el.classList.toggle('gp-focused-item', i === shopFocusIdx));
}

function shopGpNavHandle(up, down, pressA, pressB) {
  if (gState !== 'SHOP') return;
  const items = document.querySelectorAll('.shop-item');
  const count = items.length + 1; // +1 for close button
  if (up)   { shopFocusIdx = (shopFocusIdx - 1 + count) % count; updateShopFocus(); }
  if (down) { shopFocusIdx = (shopFocusIdx + 1) % count;         updateShopFocus(); }
  if (pressA) {
    if (shopFocusIdx < items.length) {
      const btn = items[shopFocusIdx]?.querySelector('.shop-buy-btn');
      if (btn) btn.click();
    } else {
      closeShop();
    }
  }
  if (pressB) closeShop();
}

// ── In-game menu gamepad nav ──
let igmFocusIdx = 0;
let igmActiveTab = 'game';
const IGM_TAB_ORDER = ['game','audio','codes'];

function igmGpNavHandle(up, down, left, right, pressA, pressB) {
  if (gState !== 'INGAME_MENU') return;
  if (pressB) { closeIngameMenu(); return; }

  // Tab navigation with D-pad left/right
  if (left || right) {
    const tabIdx = IGM_TAB_ORDER.indexOf(igmActiveTab);
    const newIdx = left
      ? Math.max(0, tabIdx - 1)
      : Math.min(IGM_TAB_ORDER.length - 1, tabIdx + 1);
    if (newIdx !== tabIdx) {
      igmActiveTab = IGM_TAB_ORDER[newIdx];
      igmTab(igmActiveTab);
      igmFocusIdx = 0;
      updateIGMFocus();
    }
    return;
  }

  // Item navigation within tab
  const panel = document.querySelector('.igm-panel:not(.hidden)');
  if (!panel) return;
  const focusables = Array.from(panel.querySelectorAll('.igm-action-btn, .igm-toggle, input[type="range"]'));
  if (!focusables.length) return;

  if (up)   igmFocusIdx = Math.max(0, igmFocusIdx - 1);
  if (down) igmFocusIdx = Math.min(focusables.length - 1, igmFocusIdx + 1);
  updateIGMFocus();

  if (pressA) {
    const el = focusables[igmFocusIdx];
    if (!el) return;
    if (el.tagName === 'BUTTON') el.click();
    else if (el.type === 'range') {
      // increment range by 10
      el.value = Math.min(100, parseInt(el.value) + 10);
      el.dispatchEvent(new Event('input'));
    }
  }
}

function updateIGMFocus() {
  const panel = document.querySelector('.igm-panel:not(.hidden)');
  if (!panel) return;
  const focusables = Array.from(panel.querySelectorAll('.igm-action-btn, .igm-toggle, input[type="range"]'));
  focusables.forEach((el, i) => el.classList.toggle('gp-focused-item', i === igmFocusIdx));
}
function buyItem(type){
  const total=readNuggets()+sessionNuggets;const msg=document.getElementById('shop-msg');
  if(type==='life'){
    if(P.lives>=P.maxLives){msg.className='msg-err';msg.textContent='Vida já está cheia!';return;}
    if(total<30){msg.className='msg-err';msg.textContent='Nuggets insuficientes! (30🍗)';return;}
    sessionNuggets-=30;if(sessionNuggets<0){writeSave({nuggets:Math.max(0,readNuggets()+sessionNuggets)});sessionNuggets=0;}
    P.lives=Math.min(P.lives+1,P.maxLives);updateHUDLives();updateHUDNuggets();
    document.getElementById('shop-nugget-display').textContent=(readNuggets()+sessionNuggets).toLocaleString('pt-BR');
    msg.className='msg-ok';msg.textContent='❤ Vida recuperada!';sfxBuy();
  }else if(type==='potion'){
    if(P.item==='potion'){msg.className='msg-err';msg.textContent='Você já tem uma poção!';return;}
    if(total<20){msg.className='msg-err';msg.textContent='Nuggets insuficientes! (20🍗)';return;}
    sessionNuggets-=20;if(sessionNuggets<0){writeSave({nuggets:Math.max(0,readNuggets()+sessionNuggets)});sessionNuggets=0;}
    P.item='potion';updateInventoryUI();updateHUDNuggets();
    document.getElementById('shop-nugget-display').textContent=(readNuggets()+sessionNuggets).toLocaleString('pt-BR');
    msg.className='msg-ok';msg.textContent='⚡ Poção na mochila! [Q] para usar';sfxBuy();
  }
}

// ═══ IN-GAME MENU ═══
function openIngameMenu(){
  if(gState==='CUTSCENE')return;
  gState='INGAME_MENU';
  document.getElementById('bag-popup').classList.add('hidden');
  document.getElementById('ingame-menu').classList.remove('hidden');
  igmTab('game');
  const s=readSettings();
  const mv=document.getElementById('igm-vol-music');if(mv){mv.value=s.musicVol||80;document.getElementById('igm-vol-music-val').textContent=s.musicVol||80;}
  const sv=document.getElementById('igm-vol-sfx');if(sv){sv.value=s.sfxVol||80;document.getElementById('igm-vol-sfx-val').textContent=s.sfxVol||80;}
  const mb=document.getElementById('igm-btn-mute');if(mb){mb.textContent=s.mute?'ON':'OFF';mb.classList.toggle('on',!!s.mute);}
  document.getElementById('dev-god-status').classList.toggle('hidden',!DEV_GODMODE);
  document.getElementById('dev-nosave-status').classList.toggle('hidden',!DEV_NOSAVE);
  document.getElementById('god-badge').classList.toggle('hidden',!DEV_GODMODE);
}
function closeIngameMenu(){gState='PLAYING';document.getElementById('ingame-menu').classList.add('hidden');document.getElementById('igm-code-result').textContent='';}
function igmTab(id){
  document.querySelectorAll('.igm-tab').forEach(b=>b.classList.toggle('active',b.getAttribute('onclick').includes("'"+id+"'")));
  document.querySelectorAll('.igm-panel').forEach(p=>p.classList.add('hidden'));
  const panel=document.getElementById('igm-tab-'+id);if(panel)panel.classList.remove('hidden');
}
function igmUpdateAudio(key,val){const s=loadSave();const settings=s.settings||{};settings[key]=parseInt(val,10);devSave({settings});}
function igmToggleMute(){const s=loadSave();const st=s.settings||{};st.mute=!st.mute;devSave({settings:st});const btn=document.getElementById('igm-btn-mute');btn.textContent=st.mute?'ON':'OFF';btn.classList.toggle('on',st.mute);}

// ═══ CÓDIGOS (renomeados) ═══
const IGM_CODES={
  // Nuggets
  BIGMAC:      {reward:50,  msg:'+50🍗 O clássico chegou!',            type:'nuggets'},
  HAMBURGUER:  {reward:20,  msg:'+20🍗 Honra ao protagonista!',         type:'nuggets'},
  FOGONABRASA: {reward:100, msg:'+100🍗 Código do amigo cruel!',        type:'nuggets'},
  GORDAOQUERO: {reward:30,  msg:'+30🍗 Sem julgamentos aqui!',          type:'nuggets'},
  SEMPATROCINIO:{reward:75, msg:'+75🍗 Obrigado por jogar!',            type:'nuggets'},
  LENDARIO:    {reward:200, msg:'+200🍗 Código lendário resgatado!',    type:'nuggets'},
  // Dev
  GODMODE:     {type:'dev_god'},
  NOSAVE:      {type:'dev_nosave'},
  DEVRESETALL: {type:'dev_reset'},
};

function igmRedeemCode(){
  const input=document.getElementById('igm-code-input');
  const result=document.getElementById('igm-code-result');
  const code=input.value.trim().toUpperCase();
  if(!code){result.style.color='#FF4444';result.textContent='⚠ Digite um código!';return;}
  if(code==='GODMODE'){
    DEV_GODMODE=!DEV_GODMODE;result.style.color='#FFD700';
    result.textContent=`⚡ IMORTALIDADE: ${DEV_GODMODE?'ATIVADA':'DESATIVADA'}`;
    document.getElementById('dev-god-status').classList.toggle('hidden',!DEV_GODMODE);
    document.getElementById('god-badge').classList.toggle('hidden',!DEV_GODMODE);
    input.value='';return;
  }
  if(code==='NOSAVE'){
    DEV_NOSAVE=!DEV_NOSAVE;result.style.color='#FFD700';
    result.textContent=`💾 AUTOSAVE: ${DEV_NOSAVE?'DESATIVADO':'ATIVADO'}`;
    document.getElementById('dev-nosave-status').classList.toggle('hidden',!DEV_NOSAVE);
    input.value='';return;
  }
  if(code==='DEVRESETALL'){
    try{localStorage.removeItem(SAVE_KEY);}catch(e){}
    result.style.color='#FF4444';result.textContent='🔧 Progresso resetado! Recarregue a página.';
    input.value='';return;
  }
  const save=loadSave();const redeemed=save.redeemed||[];
  if(redeemed.includes(code)){result.style.color='#FFD700';result.textContent='🔁 Código já resgatado!';return;}
  const promo=IGM_CODES[code];
  if(!promo||promo.type!=='nuggets'){result.style.color='#FF4444';result.textContent='✕ Código inválido!';return;}
  redeemed.push(code);sessionNuggets+=promo.reward;updateHUDNuggets();
  devSave({redeemed,nuggets:readNuggets()});
  result.style.color='#44FF88';result.textContent='✔ '+promo.msg;input.value='';
}

// ═══ CONFIRM RESTART ═══
function confirmRestart(){document.getElementById('ingame-menu').classList.add('hidden');document.getElementById('confirm-restart').classList.remove('hidden');gState='CONFIRM_RESTART';}
function closeConfirmRestart(){document.getElementById('confirm-restart').classList.add('hidden');document.getElementById('ingame-menu').classList.remove('hidden');gState='INGAME_MENU';}

// ═══ COLLECT BREAD ═══
function collectBread(){PEDESTAL.collected=true;document.getElementById('interact-hint').classList.add('hidden');gState='CUTSCENE';setTimeout(()=>startCutscene(),300);}

// ═══ CUTSCENE ═══
const CUTSCENE_IMGS=['assets/images/cutscene/fase1/scene1.svg','assets/images/cutscene/fase1/scene2.svg','assets/images/cutscene/fase1/scene3.svg','assets/images/cutscene/fase1/scene4.svg','assets/images/cutscene/fase1/scene5.svg'];
let cutscenePage=0;
function startCutscene(){cutscenePage=0;document.getElementById('cutscene-overlay').classList.remove('hidden');renderCutscene();}
function renderCutscene(){
  document.getElementById('cutscene-img').src=CUTSCENE_IMGS[cutscenePage];
  const dots=document.getElementById('cutscene-dots');
  dots.innerHTML=CUTSCENE_IMGS.map((_,i)=>`<div class="cdot${i===cutscenePage?' active':''}"></div>`).join('');
  document.getElementById('cutscene-prev').disabled=cutscenePage===0;
  document.getElementById('cutscene-next').textContent=cutscenePage<CUTSCENE_IMGS.length-1?'AVANÇAR ▶':'FINALIZAR ✔';
}
function cutsceneNext(){if(cutscenePage<CUTSCENE_IMGS.length-1){cutscenePage++;renderCutscene();}else finishPhase();}
function cutscenePrev(){if(cutscenePage>0){cutscenePage--;renderCutscene();}}

// ═══ FINISH ═══
function finishPhase(){
  const base=loadSave();
  const ingredients=base.ingredients||[];
  if(!ingredients.includes('bun_bottom'))ingredients.push('bun_bottom');
  devSave({nuggets:(base.nuggets||0)+sessionNuggets+50,currentPhase:2,ingredients,fase1complete:true});
  window.location.href='index.html?completed=fase1';
}

// ═══ PAUSE / GAMEOVER / MENU ═══
function triggerGameOver(){gState='GAMEOVER';document.getElementById('gameover-overlay').classList.remove('hidden');}
function restartPhase(){window.location.reload();}
function goToMenu(){devSave({nuggets:readNuggets()+sessionNuggets});window.location.href='index.html';}

// ═══ CAMERA ═══
let camX=0;
function updateCamera(){const target=P.x-CW/2+P.w/2;camX+=(target-camX)*.12;camX=Math.max(0,Math.min(MAP_W-CW,camX));}

// ═══ MOBILE ═══
function setupMobile(){document.getElementById('mobile-controls').classList.toggle('hidden',readPlatform()!=='mobile');}

// ═══ MAIN LOOP ═══
let lastTS=0;
function loop(ts){
  requestAnimationFrame(loop);
  const dt=Math.min(ts-lastTS,50);lastTS=ts;
  pollGamepad();
  applyGamepadInput(); // Always run — handles menus, shop, playing

  if(gState==='PLAYING'||gState==='BAG'){
    if(gState==='PLAYING'){
      updatePhysics(dt);
      updateEnemies(dt);
      checkInteractables();
      checkItemUse();
      checkNuggetCollision();
    }
    updateParticles();
    updateCamera();
  }

  ctx.clearRect(0,0,CW,CH);
  drawBG(camX);
  drawGround(camX);
  drawAmbients(camX);
  drawMapNuggets(camX);
  drawShopWorld(camX);
  drawPedestal(camX);
  enemies.forEach(e=>drawEnemy(e,camX));
  drawParticles(camX);
  drawPlayer(camX);
  const vig=ctx.createRadialGradient(CW/2,CH/2,CW*.25,CW/2,CH/2,CW*.8);
  vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(0,0,0,.42)');
  ctx.fillStyle=vig;ctx.fillRect(0,0,CW,CH);
}

// ═══ INIT ═══
function init(){
  sessionNuggets=0;
  updateHUDLives();updateHUDNuggets();updateInventoryUI();
  initBG();initClouds();initAmbients();
  spawnEnemies();
  spawnMapNuggets();
  setupInput();setupMobile();
  const s=readSettings();
  GP.showIcons = s.showGamepadIcons !== false;
  document.getElementById('igm-code-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')igmRedeemCode();});
  document.addEventListener('keydown',e=>{
    const cs=document.getElementById('cutscene-overlay');
    if(!cs||cs.classList.contains('hidden'))return;
    if(e.key==='ArrowRight')cutsceneNext();
    if(e.key==='ArrowLeft')cutscenePrev();
  });
  requestAnimationFrame(ts=>{lastTS=ts;requestAnimationFrame(loop);});
}
window.addEventListener('DOMContentLoaded',init);

// ──────────────────────────────────────────────────────────────
// SOM DE BOTÃO (fase1 — mesmos tons 8-bit, usa sfxVol do save)
// ──────────────────────────────────────────────────────────────
let f1AudioCtx = null;
function f1GetAudio() {
  if (!f1AudioCtx) try { f1AudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
  return f1AudioCtx;
}
function f1IsMuted() { return !!(readSettings().mute); }
function f1Vol()     { return ((readSettings().sfxVol ?? 80) / 100) * 0.9; }

function sfxClick() {
  if (f1IsMuted()) return;
  const ac = f1GetAudio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(520, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(260, ac.currentTime + 0.08);
  g.gain.setValueAtTime(f1Vol() * 0.18, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
  o.start(); o.stop(ac.currentTime + 0.12);
}
function sfxHover() {
  if (f1IsMuted()) return;
  const ac = f1GetAudio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = 'square'; o.frequency.value = 380;
  g.gain.setValueAtTime(f1Vol() * 0.07, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
  o.start(); o.stop(ac.currentTime + 0.07);
}
function sfxBack() {
  if (f1IsMuted()) return;
  const ac = f1GetAudio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(260, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(130, ac.currentTime + 0.1);
  g.gain.setValueAtTime(f1Vol() * 0.15, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  o.start(); o.stop(ac.currentTime + 0.14);
}
function sfxBuy() {
  if (f1IsMuted()) return;
  const ac = f1GetAudio(); if (!ac) return;
  // Happy jingle: C-E-G
  [261.63, 329.63, 392].forEach((freq, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'square'; o.frequency.value = freq;
    const t = ac.currentTime + i * 0.09;
    g.gain.setValueAtTime(f1Vol() * 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.start(t); o.stop(t + 0.14);
  });
}
function sfxNugget() {
  if (f1IsMuted()) return;
  const ac = f1GetAudio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(660, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(880, ac.currentTime + 0.06);
  g.gain.setValueAtTime(f1Vol() * 0.15, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
  o.start(); o.stop(ac.currentTime + 0.11);
}

function hookF1Sounds() {
  document.querySelectorAll('.shop-buy-btn,.igm-action-btn,.igm-redeem-btn,.igm-tab,.go-btn,.confirm-yes,.bag-use-btn,.hud-menu-btn,.hud-bag-btn,#cutscene-prev,#cutscene-next').forEach(btn => {
    if (btn.dataset.sh) return; btn.dataset.sh = '1';
    btn.addEventListener('mouseenter', () => sfxHover());
    btn.addEventListener('click',      () => sfxClick());
  });
  document.querySelectorAll('#shop-close,.igm-close,.confirm-no,.go-btn-sec').forEach(btn => {
    if (btn.dataset.bh) return; btn.dataset.bh = '1';
    btn.addEventListener('click', () => sfxBack());
  });
}
window.addEventListener('load', hookF1Sounds);
document.addEventListener('click', () => setTimeout(hookF1Sounds, 40), {once: false, passive: true});