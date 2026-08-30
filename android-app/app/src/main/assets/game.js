/**
 * Witch.io v5 — "Seal & Storm"
 * Atelier witch arena: seal-casting + wand aiming + atelier terrain + ink juice
 * Refs: Arrow.io (aim+release), Magica.io (element discovery), Soul Knight (dodge+cover), VS (build), Witch Hat Atelier (ink seals)
 */
(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================
  const C = {
    world: { w: 4000, h: 4000 },
    startHP: 100, startShield: 50,
    dodgeCooldown: 1300, dodgeDist: 180, dodgeIFrames: 380,
    shieldRegen: 0.05, shieldDelay: 2000,
    xpBase: 8, xpScale: 1.18,
    xpMagnetRange: 130, xpMagnetSpeed: 9,
    maxWeapons: 6, maxPassives: 6, weaponLevelMax: 8,
    spawnRadius: 1100,
    colors: {
      fire: "#e8533a", fireGlow: "rgba(232,83,58,0.35)",
      water: "#3a9ad9", waterGlow: "rgba(58,154,217,0.35)",
      earth: "#8a6b2e", earthGlow: "rgba(138,107,46,0.35)",
      shadow: "#7a4fb5", shadowGlow: "rgba(122,79,181,0.35)",
      lightning: "#d4a017", lightningGlow: "rgba(212,160,23,0.35)",
      meteor: "#c45a1a", meteorGlow: "rgba(196,90,26,0.35)",
      ice: "#2eb8c7", iceGlow: "rgba(46,184,199,0.35)",
      void: "#6e3fa0", voidGlow: "rgba(110,63,160,0.35)",
    },
  };

  const ELEMENTS = {
    fire:  { name: "Fire",  icon: "🔥", color: C.colors.fire,  glow: C.colors.fireGlow,  seal: "tri" },
    water: { name: "Water", icon: "💧", color: C.colors.water, glow: C.colors.waterGlow, seal: "wave" },
    earth: { name: "Earth", icon: "⬢", color: C.colors.earth, glow: C.colors.earthGlow, seal: "hex" },
    shadow:{ name: "Shadow",icon: "🌑", color: C.colors.shadow,glow: C.colors.shadowGlow,seal: "eye" },
    lightning:{name:"Lightning",icon:"⚡",color:C.colors.lightning,glow:C.colors.lightningGlow,seal:"bolt"},
    meteor: { name:"Meteor", icon:"☄️", color:C.colors.meteor, glow:C.colors.meteorGlow, seal:"star"},
    ice:    { name:"Ice",   icon:"❄️", color:C.colors.ice,   glow:C.colors.iceGlow,   seal:"snow"},
    void:   { name:"Void",  icon:"◉", color:C.colors.void,  glow:C.colors.voidGlow,  seal:"void"},
  };

  // Weapon defs — each has a distinct SHAPE and cast feel
  const WEAPON_DEFS = {
    ember: {
      name:"Ember", icon:"🔥", element:"fire",
      baseDmg:10, baseCd:700, baseCount:1, basePierce:1, projSpeed:7, projRadius:7,
      shape:"bolt", trail:true,
      evolve:{ into:"inferno", needsElement:"fire" },
    },
    inferno: {
      name:"Inferno", icon:"🔥", element:"fire",
      baseDmg:22, baseCd:550, baseCount:2, basePierce:3, projSpeed:8, projRadius:10,
      shape:"bolt", trail:true, burn:true, evolved:true,
    },
    tide: {
      name:"Tide", icon:"💧", element:"water",
      baseDmg:7, baseCd:900, baseCount:1, basePierce:4, projSpeed:6, projRadius:10,
      shape:"wave", wide:true, slow:{ pct:0.4, dur:1800 },
      evolve:{ into:"tsunami", needsElement:"water" },
    },
    tsunami: {
      name:"Tsunami", icon:"🌊", element:"water",
      baseDmg:16, baseCd:750, baseCount:1, basePierce:99, projSpeed:7, projRadius:18,
      shape:"wave", wide:true, slow:{ pct:0.6, dur:2500 }, evolved:true,
    },
    pillar: {
      name:"Pillar", icon:"⬢", element:"earth",
      baseDmg:14, baseCd:1200, baseCount:1, basePierce:1, projSpeed:0, projRadius:16,
      shape:"pillar", ground:true, stun:{ dur:700 },
      evolve:{ into:"quake", needsElement:"earth" },
    },
    quake: {
      name:"Quake", icon:"⬢", element:"earth",
      baseDmg:28, baseCd:1600, baseCount:1, basePierce:99, projSpeed:0, projRadius:28,
      shape:"pillar", ground:true, stun:{ dur:1400 }, evolved:true,
    },
    shade: {
      name:"Shade Bolt", icon:"🌑", element:"shadow",
      baseDmg:8, baseCd:650, baseCount:2, basePierce:2, projSpeed:6, projRadius:6,
      shape:"shard", homing:0.08, lifesteal:0.12,
      evolve:{ into:"voidRift", needsElement:"shadow" },
    },
    voidRift: {
      name:"Void Rift", icon:"◉", element:"shadow",
      baseDmg:18, baseCd:500, baseCount:3, basePierce:99, projSpeed:7, projRadius:8,
      shape:"shard", homing:0.12, lifesteal:0.2, evolved:true,
    },
    // Combo weapons
    spark: {
      name:"Spark Chain", icon:"⚡", element:"lightning",
      baseDmg:9, baseCd:450, baseCount:1, basePierce:5, projSpeed:14, projRadius:5,
      shape:"chain", chainCount:3,
    },
    comet: {
      name:"Comet", icon:"☄️", element:"meteor",
      baseDmg:20, baseCd:1400, baseCount:2, basePierce:2, projSpeed:0, projRadius:18,
      shape:"comet", ground:true,
    },
    frost: {
      name:"Frost Sigil", icon:"❄️", element:"ice",
      baseDmg:11, baseCd:1100, baseCount:1, basePierce:99, projSpeed:0, projRadius:22,
      shape:"nova", slow:{ pct:0.55, dur:2200 },
    },
    abyss: {
      name:"Abyss", icon:"◉", element:"void",
      baseDmg:32, baseCd:2200, baseCount:1, basePierce:99, projSpeed:0, projRadius:26,
      shape:"nova",
    },
  };

  const PASSIVES = [
    { id:"might", name:"Might", icon:"⚔️", desc:"+15% damage", apply:(p)=>{p.dmgMult+=0.15;} },
    { id:"haste", name:"Haste", icon:"👟", desc:"+12% speed", apply:(p)=>{p.spdMult+=0.12;} },
    { id:"armor", name:"Warding", icon:"🛡️", desc:"+22 HP", apply:(p)=>{p.maxHP+=22;p.hp=Math.min(p.hp+22,p.maxHP);} },
    { id:"magnet", name:"Attraction", icon:"🧲", desc:"+50% pickup range", apply:(p)=>{p.xpMagnetRange*=1.5;} },
    { id:"mending", name:"Mending", icon:"💚", desc:"+0.3 HP/s", apply:(p)=>{p.regen+=0.3;} },
    { id:"focus", name:"Focus", icon:"⏱️", desc:"-12% cooldowns", apply:(p)=>{p.cdMult-=0.12;} },
    { id:"reach", name:"Reach", icon:"🔮", desc:"+22% area", apply:(p)=>{p.areaMult+=0.22;} },
    { id:"fortune", name:"Fortune", icon:"🍀", desc:"Better draft odds", apply:(p)=>{p.luck+=0.3;} },
    { id:"greed", name:"Greed", icon:"💰", desc:"+40% XP", apply:(p)=>{p.xpMult+=0.4;} },
    { id:"pierce", name:"Piercing", icon:"🎯", desc:"+1 pierce", apply:(p)=>{p.pierceBonus+=1;} },
  ];

  const ENEMY_TYPES = {
    wisp:   { hp:18, dmg:4, spd:1.8, radius:11, color:"#8b7abf", xp:4, behavior:"swarm" },
    thorn:  { hp:32, dmg:6, spd:1.3, radius:15, color:"#6a9a3a", xp:5, behavior:"chase" },
    lancer: { hp:22, dmg:8, spd:1.1, radius:12, color:"#c45a3a", xp:5, behavior:"shooter", shootCd:1800 },
    bulwark:{ hp:70, dmg:10, spd:0.85, radius:20, color:"#8a6b2e", xp:8, behavior:"tank" },
    specter:{ hp:14, dmg:5, spd:2.6, radius:9, color:"#4a9ad9", xp:3, behavior:"dart" },
    boss:   { hp:450, dmg:14, spd:0.95, radius:36, color:"#c0392b", xp:55, behavior:"boss" },
  };
  const ENEMY_NAMES = ["Wisp","Thorn","Lancer","Bulwark","Specter","Gloom","Murk","Ember","Rift","Dusk"];
  const BOSS_NAMES = ["Atelier Guardian","Ink Sovereign","Seal Breaker","Void Matron","Golem Prime"];

  // ============================================================
  // UTILS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const rand = (a,b) => a + Math.random()*(b-a);
  const randInt = (a,b) => Math.floor(rand(a,b+1));
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const lerp = (a,b,t) => a+(b-a)*t;
  const hsl = (h,s,l) => `hsl(${h},${s}%,${l}%)`;

  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=randInt(0,i); [a[i],a[j]]=[a[j],a[i]];} return a; }

  // ============================================================
  // TERRAIN — atelier pillars / shelves / rugs
  // ============================================================
  let terrain = [];
  function buildTerrain() {
    terrain = [];
    // Stone pillars
    for(let i=0;i<14;i++){
      terrain.push({ x: rand(300, world.w-300), y: rand(300, world.h-300), w: 52, h: 52, type:"pillar", color:"#c9b896" });
    }
    // Bookshelves (long)
    for(let i=0;i<10;i++){
      const horiz = Math.random()<0.5;
      terrain.push({ x: rand(200, world.w-200), y: rand(200, world.h-200), w: horiz?110:32, h: horiz?32:110, type:"shelf", color:"#6b4c2a" });
    }
    // Rugs (no collision, visual only)
    for(let i=0;i<8;i++){
      terrain.push({ x: rand(200, world.w-200), y: rand(200, world.h-200), w: rand(120,200), h: rand(90,160), type:"rug", color: `hsl(${rand(10,30)},${rand(20,35)}%,${rand(78,88)}%)` });
    }
  }
  function isBlocked(x,y,r){
    for(const t of terrain){ if(t.type==="rug") continue;
      if(x+r > t.x - t.w/2 && x-r < t.x + t.w/2 && y+r > t.y - t.h/2 && y-r < t.y + t.h/2) return true;
    }
    return false;
  }

  // ============================================================
  // CANVAS
  // ============================================================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let dpr = window.devicePixelRatio||1;
  const view = { w:0, h:0, scale:1 };
  function resize(){
    dpr = window.devicePixelRatio||1;
    canvas.width = innerWidth*dpr; canvas.height = innerHeight*dpr;
    canvas.style.width = innerWidth+"px"; canvas.style.height = innerHeight+"px";
    view.w = innerWidth; view.h = innerHeight;
  }
  addEventListener("resize", resize); resize();

  // ============================================================
  // STATE
  // ============================================================
  let mode="single", running=false, paused=false, difficulty="easy";
  let gameTime=0, runTimer=0, waveNum=0, waveTimer=0;
  let xp=0, level=1, xpToNext=C.xpBase, pendingLevelUps=0;
  let statKills=0, statDamage=0;
  let animId=0, lastTime=0, screenShake=0, hitFreeze=0;

  const camera={ x:0, y:0 };
  const mouse={ x: -1, y: -1 }; // -1 = not yet moved, triggers auto-aim
  const joy={ active:false, sx:0, sy:0, cx:0, cy:0, vector:{x:0,y:0} };
  const aim={ x:0, y:0, active:false, angle:0 };
  const pointers=new Map();
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints>0;

  let world={...C.world};
  let player=null;
  let otherPlayers=new Map();
  let enemies=[], projectiles=[], xpGems=[], particles=[], popups=[], seals=[], enemyProjectiles=[];

  // ============================================================
  // SEAL EFFECTS — ink magic circles that flash on cast
  // ============================================================
  function spawnSeal(x, y, element, radius){
    const col = ELEMENTS[element]?.color || "#7c5cbf";
    seals.push({ x, y, element, color: col, radius: radius||26, life:1, maxLife:1 });
  }
  function updateSeals(dt){
    for(let i=seals.length-1;i>=0;i--){
      seals[i].life -= dt/280;
      if(seals[i].life<=0) seals.splice(i,1);
    }
  }
  function drawSeal(s){
    const t = 1 - s.life; // 0→1
    const r = s.radius * (1 + t*0.35);
    const alpha = s.life * 0.85;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Outer ring
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI*2); ctx.stroke();
    // Inner ring
    ctx.globalAlpha = alpha*0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, r*0.62, 0, Math.PI*2); ctx.stroke();
    // Glyph — element-specific
    ctx.globalAlpha = alpha*0.7; ctx.strokeStyle = s.color; ctx.lineWidth = 1.2;
    const ir = r*0.38;
    if(s.element==="fire"){
      ctx.beginPath();
      for(let i=0;i<3;i++){ const a=i*2.094-1.57; ctx.moveTo(s.x+Math.cos(a)*ir, s.y+Math.sin(a)*ir); ctx.lineTo(s.x, s.y); }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, ir*0.22, 0, Math.PI*2); ctx.fillStyle=s.color; ctx.fill();
    } else if(s.element==="water"){
      ctx.beginPath();
      for(let k=0;k<3;k++){ const y0=s.y-8+k*8; ctx.moveTo(s.x-ir*0.7, y0); for(let x=-ir*0.7;x<=ir*0.7;x+=4){ ctx.lineTo(s.x+x, y0+Math.sin(x*0.3)*3); } }
      ctx.stroke();
    } else if(s.element==="earth"){
      ctx.beginPath();
      for(let i=0;i<6;i++){ const a=i*1.047; const px=s.x+Math.cos(a)*ir, py=s.y+Math.sin(a)*ir; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI*2); ctx.fillStyle=s.color; ctx.fill();
    } else if(s.element==="shadow"){
      ctx.beginPath(); ctx.arc(s.x, s.y, ir*0.55, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI*2); ctx.fillStyle=s.color; ctx.fill();
      ctx.fillStyle=s.color; ctx.font=`${Math.round(ir*0.5)}px serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("✦", s.x, s.y);
    } else {
      // generic: 4-point star
      ctx.beginPath();
      for(let i=0;i<4;i++){ const a=i*1.57; ctx.moveTo(s.x, s.y); ctx.lineTo(s.x+Math.cos(a)*ir, s.y+Math.sin(a)*ir); }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI*2); ctx.fillStyle=s.color; ctx.fill();
    }
    // Corner ticks
    ctx.globalAlpha = alpha*0.6; ctx.lineWidth=1;
    for(let i=0;i<4;i++){
      const a=i*1.57+0.785; const ox=Math.cos(a)*r, oy=Math.sin(a)*r;
      ctx.beginPath(); ctx.moveTo(s.x+ox*0.85, s.y+oy*0.85); ctx.lineTo(s.x+ox, s.y+oy); ctx.stroke();
    }
    ctx.restore();
  }

  // ============================================================
  // MULTIPLAYER
  // ============================================================
  let ws=null, myId=null;
  function connectWS(url){
    if(ws) try{ws.close();}catch(_){}
    mode="online";
    ws=new WebSocket(url);
    ws.onopen=()=>{
      ws.send(JSON.stringify({type:"join", name: ($("name-input")?.value||"Witch").slice(0,16)}));
      const el=$("server-status"); if(el){el.textContent="● Connected"; el.style.color="#4a9a3a";}
    };
    ws.onmessage=(e)=>{
      try{
        const m=JSON.parse(e.data);
        if(m.type==="welcome"){ myId=m.id; world=m.world; if(player){player.name=m.name; player.color=m.color;} }
        else if(m.type==="state"){ handleServerState(m); }
      }catch(_){}
    };
    ws.onclose=()=>{ const el=$("server-status"); if(el){el.textContent="○ Disconnected"; el.style.color="#c45a3a";} };
    ws.onerror=()=>{ const el=$("server-status"); if(el){el.textContent="✕ Failed"; el.style.color="#c0392b";} };
  }
  function handleServerState(msg){
    gameTime=msg.t; waveNum=msg.wave;
    otherPlayers.clear();
    for(const pd of msg.players){
      if(pd.id===myId && player && pd.alive){
        const d=Math.hypot(pd.x-player.x, pd.y-player.y);
        if(d>5){ player.x=lerp(player.x,pd.x,0.18); player.y=lerp(player.y,pd.y,0.18); }
        continue;
      }
      if(pd.id!==myId) otherPlayers.set(pd.id, pd);
    }
  }
  function sendInput(){
    if(!ws||ws.readyState!==1||!player) return;
    ws.send(JSON.stringify({type:"input", x:player.input.x, y:player.input.y, angle: player._aimAngle}));
  }

  // ============================================================
  // PLAYER
  // ============================================================
  class Player{
    constructor(x,y,name,color){
      this.x=x; this.y=y; this.name=name; this.color=color;
      this.radius=20; this.hp=C.startHP; this.maxHP=C.startHP;
      this.shield=C.startShield; this.maxShield=C.startShield; this.shieldTimer=0;
      this.alive=true; this.input={x:0,y:0}; this._aimAngle=0; this._lastMoveAngle=0;
      this.wobble=0; this.speed=3.4;
      this.spdMult=1; this.dmgMult=1; this.cdMult=1; this.areaMult=1;
      this.pierceBonus=0; this.regen=0; this.luck=0; this.xpMult=1;
      this.xpMagnetRange=C.xpMagnetRange;
      this.weapons=[]; this.passives=[]; this.elements={};
      this.iFrameUntil=0; this.dodgeUntil=0; this.dodgeCdUntil=0;
      this.wandLen=22; this.castFlashUntil=0;
      this.score=0;
    }
    get speedVal(){ return this.speed*this.spdMult; }
    addWeapon(id){
      const ex=this.weapons.find(w=>w.id===id);
      if(ex){ if(ex.level<C.weaponLevelMax){ex.level++; return true;} return false; }
      if(this.weapons.length>=C.maxWeapons) return false;
      this.weapons.push({ id, level:1, timer:0, ...WEAPON_DEFS[id] });
      return true;
    }
    addPassive(id){
      if(this.passives.includes(id)) return false;
      if(this.passives.length>=C.maxPassives) return false;
      const d=PASSIVES.find(p=>p.id===id); if(!d) return false;
      d.apply(this); this.passives.push(id); return true;
    }
    addElement(el){
      this.elements[el]=(this.elements[el]||0)+1;
      this.checkCombos();
    }
    checkCombos(){
      const e=this.elements;
      if(e.fire&&e.water&&!this.weapons.find(w=>w.id==="spark")) this.addWeapon("spark");
      if(e.fire&&e.earth&&!this.weapons.find(w=>w.id==="comet")) this.addWeapon("comet");
      if(e.water&&e.earth&&!this.weapons.find(w=>w.id==="frost")) this.addWeapon("frost");
      if(e.fire&&e.shadow&&!this.weapons.find(w=>w.id==="abyss")) this.addWeapon("abyss");
    }
    heal(a){ this.hp=Math.min(this.maxHP, this.hp+a); }
    takeDamage(dmg){
      if(Date.now()<this.iFrameUntil) return;
      let actual=dmg;
      if(this.shield>0){ const blocked=Math.min(this.shield, dmg*0.75); this.shield-=blocked; actual-=blocked; this.shieldTimer=C.shieldDelay; }
      this.hp-=actual;
      screenShake=Math.min(14, screenShake+actual*0.4);
      hitFreeze=Math.min(60, hitFreeze+8);
      addPopup(this.x, this.y-28, `-${Math.floor(actual)}`, "#e8533a");
      spawnInk(this.x, this.y, "#e8533a", 7);
      if(this.hp<=0){ this.hp=0; this.alive=false; endGame(); }
    }
    update(dt){
      if(!this.alive) return;
      const spd=this.speedVal*(dt/16);
      let nx=this.x+this.input.x*spd, ny=this.y+this.input.y*spd;
      nx=clamp(nx,28,world.w-28); ny=clamp(ny,28,world.h-28);
      if(!isBlocked(nx, ny, this.radius)){ this.x=nx; this.y=ny; }
      else if(!isBlocked(nx, this.y, this.radius)) this.x=nx;
      else if(!isBlocked(this.x, ny, this.radius)) this.y=ny;

      this.wobble+=dt*0.008;
      if(Math.hypot(this.input.x,this.input.y)>0.05) this._lastMoveAngle=Math.atan2(this.input.y,this.input.x);

      // Aim: mouse overrides, otherwise auto-aim nearest enemy
      if(isTouch && aim.active){
        this._aimAngle=Math.atan2(aim.y - view.h/2, aim.x - view.w/2);
      } else if(!isTouch && mouse.x >= 0){
        // mouse has moved — aim at cursor
        const mx=mouse.x - view.w/2, my=mouse.y - view.h/2;
        if(Math.hypot(mx,my)>8) this._aimAngle=Math.atan2(my, mx);
        else {
          const near=enemies.filter(e=>e.alive).sort((a,b)=>dist(this,a)-dist(this,b))[0];
          if(near) this._aimAngle=Math.atan2(near.y-this.y, near.x-this.x);
        }
      } else {
        const near=enemies.filter(e=>e.alive).sort((a,b)=>dist(this,a)-dist(this,b))[0];
        if(near) this._aimAngle=Math.atan2(near.y-this.y, near.x-this.x);
        else this._aimAngle=this._lastMoveAngle;
      }

      if(this.regen>0) this.hp=Math.min(this.maxHP, this.hp+this.regen*dt/1000);
      if(this.shieldTimer>0) this.shieldTimer-=dt;
      else this.shield=Math.min(this.maxShield, this.shield+C.shieldRegen*dt/10);

      for(const w of this.weapons){
        w.timer-=dt;
        if(w.timer<=0){ this.castWeapon(w); w.timer=w.baseCd*this.cdMult*(0.88+Math.random()*0.24); }
      }
    }
    castWeapon(w){
      const cnt=w.baseCount+Math.floor(w.level/3);
      const dmg=w.baseDmg*(1+(w.level-1)*0.13)*this.dmgMult;
      const rad=(w.projRadius||8)*(1+(w.level-1)*0.04)*this.areaMult;
      const pierce=w.basePierce+this.pierceBonus;
      const ang=this._aimAngle;
      const wx=this.x+Math.cos(ang)*this.wandLen, wy=this.y+Math.sin(ang)*this.wandLen;

      // Seal flash at wand tip
      spawnSeal(wx, wy, w.element, 22 + w.level*1.2);
      this.castFlashUntil=Date.now()+90;

      if(w.shape==="pillar" || w.shape==="comet"){
        // Ground-targeted around player or aimed point
        for(let i=0;i<cnt;i++){
          const ox=rand(-110,110), oy=rand(-110,110);
          const tx=clamp(wx+ox, 40, world.w-40), ty=clamp(wy+oy, 40, world.h-40);
          spawnSeal(tx, ty, w.element, rad*0.9);
          setTimeout(()=>{ projectiles.push({ x:tx, y:ty, vx:0, vy:0, dmg, radius:rad, life:420, pierce, element:w.element, owner:"player", aoe:true, aoeRadius:rad*0.85, stun:w.stun }); }, 160);
          spawnInk(tx, ty, ELEMENTS[w.element].color, 4);
        }
      } else if(w.shape==="nova"){
        spawnSeal(this.x, this.y, w.element, rad*1.1);
        for(let i=0;i<cnt;i++){
          const a=rand(0,Math.PI*2);
          projectiles.push({ x:this.x, y:this.y, vx:Math.cos(a)*(w.projSpeed||5), vy:Math.sin(a)*(w.projSpeed||5), dmg: dmg/cnt*1.2, radius:rad*0.6, life:480, pierce:99, element:w.element, owner:"player", nova:true, slow:w.slow });
        }
        // Ring expand
        projectiles.push({ x:this.x, y:this.y, vx:0, vy:0, dmg:dmg*0.5, radius:rad, life:320, pierce:99, element:w.element, owner:"player", ring:true, expandSpeed: rad/320*16 });
      } else if(w.shape==="chain"){
        const tgt=enemies.filter(e=>e.alive).sort((a,b)=>dist(this,a)-dist(this,b))[0];
        if(tgt) projectiles.push({ x:wx, y:wy, vx:0, vy:0, dmg, radius:5, life:280, pierce:1, element:w.element, owner:"player", chain:true, chainTarget:tgt, chainCount:(w.chainCount||3)+Math.floor(w.level/2), chainHits:[] });
      } else {
        // Bolt / wave / shard
        for(let i=0;i<cnt;i++){
          const spread=(cnt>1)? (i-(cnt-1)/2)*0.32 : 0;
          const a=ang+spread;
          const px=wx+Math.cos(a)*6, py=wy+Math.sin(a)*6;
          const p={ x:px, y:py, vx:Math.cos(a)*(w.projSpeed||7), vy:Math.sin(a)*(w.projSpeed||7), dmg, radius:rad, life: w.shape==="shard"?1100:780, pierce, element:w.element, owner:"player" };
          if(w.shape==="wave"){ p.wide=true; p.slow=w.slow; }
          if(w.shape==="shard"){ p.homing=w.homing||0.08; p.homingTarget=enemies.filter(e=>e.alive).sort((a,b)=>dist(this,a)-dist(this,b))[i]||null; p.lifesteal=w.lifesteal||0; }
          if(w.trail) p.trail=true;
          projectiles.push(p);
        }
      }
    }
  }

  // ============================================================
  // ENEMY
  // ============================================================
  class Enemy{
    constructor(x,y,hp,dmg,spd,color,name,type){
      this.x=x; this.y=y; this.hp=hp; this.maxHP=hp; this.dmg=dmg; this.spd=spd;
      this.color=color; this.name=name; this.type=type;
      this.radius=ENEMY_TYPES[type]?.radius||12;
      this.alive=true; this.wobble=Math.random()*Math.PI*2;
      this.xp=ENEMY_TYPES[type]?.xp||3;
      this.behavior=ENEMY_TYPES[type]?.behavior||"chase";
      this.shootTimer=ENEMY_TYPES[type]?.shootCd||99999;
      this.stunUntil=0; this.slowUntil=0; this.slowPct=0;
      this.flashUntil=0;
    }
    takeDamage(dmg, element){
      this.hp-=dmg; this.flashUntil=Date.now()+90;
      if(element==="water"||element==="ice") { this.slowUntil=Date.now()+1600; this.slowPct=0.45; }
      if(element==="earth") this.stunUntil=Date.now()+500;
      spawnInk(this.x, this.y, ELEMENTS[element]?.color||this.color, 4);
      addPopup(this.x, this.y-this.radius-8, String(Math.floor(dmg)), ELEMENTS[element]?.color||"#fff");
      screenShake=Math.min(7, screenShake+dmg*0.1);
      if(this.hp<=0){ this.alive=false; this.onDeath(); }
    }
    onDeath(){
      statKills++;
      for(let i=0;i<3;i++) xpGems.push({ x:this.x+rand(-14,14), y:this.y+rand(-14,14), value:this.xp*(player?.xpMult||1), radius:4+Math.min(this.xp,8), color:hsl(268+this.xp*4,72,62), life:30000, pulse:0, type:"ink" });
      spawnInk(this.x, this.y, this.color, 10);
      if(this.type==="boss"){
        for(let i=0;i<10;i++) xpGems.push({ x:this.x+rand(-28,28), y:this.y+rand(-28,28), value:12*(player?.xpMult||1), radius:7, color:"hsl(38,92%,64%)", life:60000, pulse:0, type:"ink" });
        screenShake=14; hitFreeze=40;
      }
    }
    update(dt){
      if(!this.alive) return;
      const now=Date.now();
      if(now<this.stunUntil) return;
      if(!player||!player.alive) return;
      const spdMult = now<this.slowUntil ? (1-this.slowPct) : 1;
      let ax=0, ay=0;
      if(this.behavior==="swarm"||this.behavior==="chase"||this.behavior==="tank"||this.behavior==="boss"){
        const a=Math.atan2(player.y-this.y, player.x-this.x);
        // Tank: occasional charge
        let spd=this.spd*spdMult;
        if(this.behavior==="tank" && Math.random()<0.008){ spd*=3.5; }
        ax=Math.cos(a)*spd*(dt/16); ay=Math.sin(a)*spd*(dt/16);
      } else if(this.behavior==="dart"){
        const a=Math.atan2(player.y-this.y, player.x-this.x);
        // dart: dash then pause
        if(now%1200<700){ ax=Math.cos(a)*this.spd*spdMult*(dt/16); ay=Math.sin(a)*this.spd*spdMult*(dt/16); }
      } else if(this.behavior==="shooter"){
        // keep distance
        const d=dist(this, player);
        if(d<180){ const a=Math.atan2(this.y-player.y, this.x-player.x); ax=Math.cos(a)*this.spd*0.6*(dt/16); ay=Math.sin(a)*this.spd*0.6*(dt/16); }
        else if(d>300){ const a=Math.atan2(player.y-this.y, player.x-this.x); ax=Math.cos(a)*this.spd*0.5*(dt/16); ay=Math.sin(a)*this.spd*0.5*(dt/16); }
        this.shootTimer-=dt;
        if(this.shootTimer<=0){
          this.shootTimer=ENEMY_TYPES.lancer.shootCd;
          const sa=Math.atan2(player.y-this.y, player.x-this.x);
          enemyProjectiles.push({ x:this.x, y:this.y, vx:Math.cos(sa)*4.2, vy:Math.sin(sa)*4.2, dmg:this.dmg, radius:5, life:1400, color:this.color });
        }
      }
      let nx=this.x+ax, ny=this.y+ay;
      nx=clamp(nx, this.radius, world.w-this.radius);
      ny=clamp(ny, this.radius, world.h-this.radius);
      if(!isBlocked(nx, ny, this.radius)){ this.x=nx; this.y=ny; }
      else if(!isBlocked(nx, this.y, this.radius)) this.x=nx;
      else if(!isBlocked(this.x, ny, this.radius)) this.y=ny;
      this.wobble+=dt*0.01;
      if(dist(this, player) < this.radius+player.radius-3) player.takeDamage(this.dmg*(dt/420));
    }
  }

  // ============================================================
  // SPAWNING
  // ============================================================
  function spawnWave(){
    waveNum++; waveTimer = 7000 + Math.min(waveNum*200, 4000);
    let count, pool;
    if(waveNum===1){ count=10; pool=["wisp","wisp","wisp","specter","thorn"]; }
    else { count=Math.min(6+waveNum*3, 42); pool=["wisp","wisp","thorn","lancer","specter","bulwark"]; }
    if(waveNum>4) pool.push("bulwark");
    if(waveNum>7) pool.push("lancer","specter");
    const hpMult=1+waveNum*0.14, dmgMult=1+waveNum*0.07;
    for(let i=0;i<count;i++){
      const t=pool[randInt(0,pool.length-1)];
      const def=ENEMY_TYPES[t];
      const ang=rand(0,Math.PI*2), r=rand(C.spawnRadius*0.55, C.spawnRadius);
      let ex=clamp(player.x+Math.cos(ang)*r, 50, world.w-50);
      let ey=clamp(player.y+Math.sin(ang)*r, 50, world.h-50);
      // nudge off terrain
      let tries=0; while(isBlocked(ex,ey,def.radius+4) && tries<8){ ex+=rand(-40,40); ey+=rand(-40,40); tries++; }
      enemies.push(new Enemy(ex,ey, def.hp*hpMult, def.dmg*dmgMult, def.spd, def.color, ENEMY_NAMES[randInt(0,ENEMY_NAMES.length-1)], t));
    }
    if(waveNum%5===0) spawnBoss();
  }
  function spawnBoss(){
    const hpMult=1+waveNum*0.18, dmgMult=1+waveNum*0.09;
    const idx=randInt(0,BOSS_NAMES.length-1);
    const cols=["#c0392b","#7a4fb5","#c45a3a","#3a9ad9","#8a6b2e"];
    const ang=rand(0,Math.PI*2);
    let ex=clamp(player.x+Math.cos(ang)*C.spawnRadius, 100, world.w-100);
    let ey=clamp(player.y+Math.sin(ang)*C.spawnRadius, 100, world.h-100);
    enemies.push(new Enemy(ex,ey, ENEMY_TYPES.boss.hp*hpMult, ENEMY_TYPES.boss.dmg*dmgMult, ENEMY_TYPES.boss.spd, cols[idx], BOSS_NAMES[idx], "boss"));
    screenShake=16; addPopup(player.x, player.y-52, "⚠️ "+BOSS_NAMES[idx]+" ⚠️", "#c0392b");
  }

  // ============================================================
  // XP + LEVELING
  // ============================================================
  function gainXP(amt){
    xp+=amt;
    while(xp>=xpToNext && pendingLevelUps<5){ xp-=xpToNext; level++; xpToNext=Math.floor(C.xpBase+level*14+level*level*1.1); pendingLevelUps++; }
    updateHUD();
    if(pendingLevelUps>0 && !isDraftOpen()) showDraft();
  }
  function collectGems(){
    if(!player||!player.alive) return;
    for(let i=xpGems.length-1;i>=0;i--){
      const g=xpGems[i]; g.life-=16; if(g.life<=0){xpGems.splice(i,1); continue;}
      const d=dist(player,g);
      if(d < player.xpMagnetRange){
        const a=Math.atan2(player.y-g.y, player.x-g.x);
        const pull=Math.min(C.xpMagnetSpeed, (1-d/player.xpMagnetRange)*13);
        const nx=g.x+Math.cos(a)*pull, ny=g.y+Math.sin(a)*pull;
        if(!isBlocked(nx,ny,2)){ g.x=nx; g.y=ny; }
      }
      if(d < player.radius+g.radius){ gainXP(g.value); spawnInk(g.x,g.y,g.color,3); xpGems.splice(i,1); }
    }
  }

  // ============================================================
  // DRAFT — seal discovery
  // ============================================================
  function isDraftOpen(){ const el=$("levelup-overlay"); return el && !el.classList.contains("hidden"); }
  function buildDraftPool(){
    const pool=[];
    for(const ek of ["fire","water","earth","shadow"]){
      const el=ELEMENTS[ek];
      pool.push({ icon:el.icon, name:el.name, desc: el.name+" seal — new casting", tag:"Seal", color:el.color, apply:()=>{ player.addElement(ek); addPopup(player.x,player.y-38, `${el.icon} ${el.name}`, el.color); spawnSeal(player.x, player.y-10, ek, 32); }});
    }
    for(const wKey of Object.keys(WEAPON_DEFS)){
      const w=WEAPON_DEFS[wKey]; if(w.evolved) continue;
      const ex=player.weapons.find(pw=>pw.id===wKey);
      if(ex){
        if(ex.level<C.weaponLevelMax) pool.push({ icon:w.icon, name:`${w.name} ✦`, desc:`Lv ${ex.level+1}/${C.weaponLevelMax}`, tag:"Refine", color:ELEMENTS[w.element].color, apply:()=>{ex.level++;} });
        else if(w.evolve && player.elements[w.evolve.needsElement]) pool.push({ icon:"✦", name:`Evolve: ${WEAPON_DEFS[w.evolve.into].name}`, desc:`${w.name} → ${WEAPON_DEFS[w.evolve.into].name}`, tag:"Transmute", color:"#d4a017", apply:()=>{ const idx=player.weapons.indexOf(ex); player.weapons[idx]={id:w.evolve.into, level:1, timer:0, ...WEAPON_DEFS[w.evolve.into]}; addPopup(player.x,player.y-48,"✦ TRANSMUTED ✦","#d4a017"); screenShake=16; hitFreeze=30; }});
      } else if(player.weapons.length<C.maxWeapons){
        pool.push({ icon:w.icon, name:w.name, desc: WEAPON_DEFS[wKey].element? `${ELEMENTS[WEAPON_DEFS[wKey].element].name} · ${w.shape}` : w.shape, tag:"Spell", color:ELEMENTS[w.element]?.color||"#7c5cbf", apply:()=>{player.addWeapon(wKey);} });
      }
    }
    for(const p of PASSIVES){
      if(!player.passives.includes(p.id)) pool.push({ icon:p.icon, name:p.name, desc:p.desc, tag:"Charm", color:"#6b5a4a", apply:()=>{player.addPassive(p.id);} });
    }
    pool.push({ icon:"❤", name:"Mend", desc:"Restore 45% HP", tag:"Mend", color:"#4a9a3a", apply:()=>{player.heal(player.maxHP*0.45);} });
    return pool;
  }
  function showDraft(){
    const overlay=$("levelup-overlay"), box=$("draft-options");
    if(!overlay||!box) return;
    const pool=buildDraftPool();
    const picks=shuffle([...pool]).slice(0,3);
    box.innerHTML="";
    picks.forEach(card=>{
      const el=document.createElement("button");
      el.className="draft-card";
      el.style.borderColor=card.color;
      el.innerHTML=`<div class="draft-icon" style="background:${card.color}18; border-color:${card.color}40">${card.icon}</div><div class="draft-meta"><strong>${card.name}</strong><small>${card.desc}</small></div><span class="draft-tag" style="background:${card.color}">${card.tag}</span>`;
      el.addEventListener("click",()=>{
        card.apply();
        pendingLevelUps=Math.max(0,pendingLevelUps-1);
        overlay.classList.add("hidden");
        paused=false; lastTime=performance.now(); animId=requestAnimationFrame(loop);
        spawnInk(player.x, player.y, card.color, 12);
        updateHUD();
        if(pendingLevelUps>0) setTimeout(showDraft, 200);
      });
      box.appendChild(el);
    });
    overlay.classList.remove("hidden");
    paused=true; cancelAnimationFrame(animId);
  }

  // ============================================================
  // PARTICLES — ink splatter
  // ============================================================
  function spawnInk(x,y,color,n){
    for(let i=0;i<n;i++){
      const a=rand(0,Math.PI*2), sp=rand(1.2,6.5);
      particles.push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:1, decay:rand(0.032,0.07), color, size:rand(1.8,4.2), type:"ink" });
    }
  }
  function addPopup(x,y,text,color){ popups.push({x,y,text,color,life:1}); }
  function updateParticles(dt){
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.965; p.vy*=0.965; p.vy+=0.08; p.life-=p.decay; if(p.life<=0) particles.splice(i,1);
    }
    for(let i=popups.length-1;i>=0;i--){ const p=popups[i]; p.y-=0.7; p.life-=0.021; if(p.life<=0) popups.splice(i,1); }
  }

  // ============================================================
  // INPUT
  // ============================================================
  function doDodge(){
    if(!player||!player.alive||Date.now()<player.dodgeCdUntil) return;
    const ang = (Math.hypot(player.input.x, player.input.y)>0.05) ? Math.atan2(player.input.y,player.input.x) : player._aimAngle;
    let nx=player.x+Math.cos(ang)*C.dodgeDist, ny=player.y+Math.sin(ang)*C.dodgeDist;
    nx=clamp(nx,28,world.w-28); ny=clamp(ny,28,world.h-28);
    if(!isBlocked(nx,ny,player.radius)){ player.x=nx; player.y=ny; }
    player.iFrameUntil=Date.now()+C.dodgeIFrames;
    player.dodgeUntil=Date.now()+220;
    player.dodgeCdUntil=Date.now()+C.dodgeCooldown;
    spawnInk(player.x, player.y, "#b794f6", 8);
    spawnSeal(player.x, player.y, "shadow", 18);
  }
  function doShield(){
    if(!player||!player.alive) return;
    if(player.shield>12){ player.shield=Math.max(0,player.shield-16); addPopup(player.x,player.y-26,"◆ Ward ◆","#7c5cbf"); spawnSeal(player.x,player.y,"shadow",20); }
  }

  const keys={};
  addEventListener("keydown",(e)=>{
    keys[e.code]=true;
    if(e.code==="Space"){ e.preventDefault(); doDodge(); }
    if(e.code==="KeyE"||e.code==="ShiftLeft") doShield();
    if(e.code==="Escape") togglePause();
  });
  addEventListener("keyup",(e)=>{ keys[e.code]=false; });

  function driveInputs(){
    if(!player||!player.alive) return;
    let ix=0, iy=0;
    if(!isTouch){
      if(keys["KeyW"]||keys["ArrowUp"]) iy-=1;
      if(keys["KeyS"]||keys["ArrowDown"]) iy+=1;
      if(keys["KeyA"]||keys["ArrowLeft"]) ix-=1;
      if(keys["KeyD"]||keys["ArrowRight"]) ix+=1;
    }
    const m=Math.hypot(ix,iy);
    player.input = m>0 ? {x:ix/m, y:iy/m} : (joy.active ? joy.vector : {x:0,y:0});
    sendInput();
  }

  canvas.addEventListener("mousemove",(e)=>{ mouse.x=e.clientX; mouse.y=e.clientY; });
  canvas.addEventListener("mousedown",(e)=>{ if(e.button===0){ mouse.x=e.clientX; mouse.y=e.clientY; }});
  canvas.addEventListener("contextmenu",(e)=>e.preventDefault());

  // Joystick (DOM)
  const joyBase=$("joystick-base"), joyThumb=$("joystick-thumb"), joyZone=$("joystick-zone");
  let joyPid=null;
  if(joyZone){
    joyZone.addEventListener("pointerdown",(e)=>{
      e.preventDefault(); joyPid=e.pointerId;
      joy.active=true; joy.sx=e.clientX; joy.sy=e.clientY; joy.cx=e.clientX; joy.cy=e.clientY;
      if(joyBase){ joyBase.classList.add("active"); joyBase.style.left=e.clientX+"px"; joyBase.style.top=e.clientY+"px"; }
    });
  }
  addEventListener("pointermove",(e)=>{
    if(e.pointerId===joyPid){
      joy.cx=e.clientX; joy.cy=e.clientY;
      const dx=joy.cx-joy.sx, dy=joy.cy-joy.sy, d=Math.hypot(dx,dy), maxR=50;
      const c=Math.min(d,maxR), nx=d>0?dx/d:0, ny=d>0?dy/d:0;
      joy.vector={x:nx*c/maxR, y:ny*c/maxR};
      if(joyThumb) joyThumb.style.transform=`translate(${nx*c}px,${ny*c}px)`;
      e.preventDefault();
    }
    // aim tracking for touch right side
    if(isTouch && e.clientX > view.w*0.5){
      aim.active=true; aim.x=e.clientX; aim.y=e.clientY;
      aim.angle=Math.atan2(aim.y - view.h/2, aim.x - view.w/2);
    }
  });
  addEventListener("pointerup",(e)=>{
    if(e.pointerId===joyPid){ joyPid=null; joy.active=false; joy.vector={x:0,y:0}; if(joyBase) joyBase.classList.remove("active"); if(joyThumb) joyThumb.style.transform="translate(0,0)"; }
  });
  // Desktop: track aim even without joystick
  canvas.addEventListener("pointermove",(e)=>{
    if(!isTouch){ aim.x=e.clientX; aim.y=e.clientY; aim.angle=Math.atan2(aim.y-view.h/2, aim.x-view.w/2); }
  });

  // ============================================================
  // CAMERA
  // ============================================================
  function updateCamera(){
    if(!player) return;
    camera.x=lerp(camera.x, player.x-view.w/2, 0.09);
    camera.y=lerp(camera.y, player.y-view.h/2, 0.09);
  }
  function worldTransform(){
    const shx=(Math.random()-0.5)*screenShake, shy=(Math.random()-0.5)*screenShake;
    ctx.setTransform(dpr,0,0,dpr, (-camera.x+shx)*dpr, (-camera.y+shy)*dpr);
  }
  function screenTransform(){ ctx.setTransform(dpr,0,0,dpr,0,0); }
  function inView(x,y,r){ return x+r>camera.x && x-r<camera.x+view.w && y+r>camera.y && y-r<camera.y+view.h; }

  // ============================================================
  // RENDER
  // ============================================================
  function drawArena(){
    const L=camera.x-80, T=camera.y-80, R=camera.x+view.w+80, B=camera.y+view.h+80;
    // Parchment
    ctx.fillStyle="#fdf6e3"; ctx.fillRect(L,T,R-L,B-T);
    // Wood plank lines
    ctx.strokeStyle="rgba(107,76,42,0.07)"; ctx.lineWidth=1;
    ctx.beginPath();
    for(let y=Math.floor(T/48)*48; y<=B; y+=48){ ctx.moveTo(L,y); ctx.lineTo(R,y); }
    ctx.stroke();
    // Ink washes
    ctx.fillStyle="rgba(122,79,181,0.05)"; ctx.beginPath(); ctx.ellipse(world.w*0.28, world.h*0.32, 520, 380, 0.12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(196,90,26,0.04)"; ctx.beginPath(); ctx.ellipse(world.w*0.72, world.h*0.68, 580, 360, -0.14, 0, Math.PI*2); ctx.fill();
    // Grid faint
    ctx.strokeStyle="rgba(43,29,18,0.035)"; ctx.lineWidth=1;
    const g=120; ctx.beginPath();
    for(let x=Math.floor(L/g)*g;x<=R;x+=g){ctx.moveTo(x,T);ctx.lineTo(x,B);}
    for(let y=Math.floor(T/g)*g;y<=B;y+=g){ctx.moveTo(L,y);ctx.lineTo(R,y);}
    ctx.stroke();
    // Terrain
    for(const t of terrain){
      if(t.x+t.w/2 < L || t.x-t.w/2 > R || t.y+t.h/2 < T || t.y-t.h/2 > B) continue;
      if(t.type==="rug"){
        ctx.fillStyle=t.color; ctx.globalAlpha=0.9;
        ctx.fillRect(t.x-t.w/2, t.y-t.h/2, t.w, t.h);
        ctx.strokeStyle="rgba(107,76,42,0.15)"; ctx.lineWidth=1; ctx.strokeRect(t.x-t.w/2, t.y-t.h/2, t.w, t.h);
        // rug pattern
        ctx.strokeStyle="rgba(107,76,42,0.06)"; ctx.lineWidth=0.7;
        ctx.strokeRect(t.x-t.w/2+6, t.y-t.h/2+6, t.w-12, t.h-12);
        ctx.globalAlpha=1;
      } else if(t.type==="pillar"){
        // shadow
        ctx.fillStyle="rgba(43,29,18,0.10)"; ctx.beginPath(); ctx.ellipse(t.x+3, t.y+3, t.w*0.55, t.h*0.42, 0, 0, Math.PI*2); ctx.fill();
        // stone
        ctx.fillStyle="#d6c7a8"; ctx.fillRect(t.x-t.w/2, t.y-t.h/2, t.w, t.h);
        ctx.fillStyle="#c9b896"; ctx.fillRect(t.x-t.w/2+4, t.y-t.h/2+4, t.w-8, t.h-8);
        ctx.strokeStyle="rgba(43,29,18,0.18)"; ctx.lineWidth=1.2; ctx.strokeRect(t.x-t.w/2, t.y-t.h/2, t.w, t.h);
        // top highlight
        ctx.fillStyle="rgba(255,255,255,0.18)"; ctx.fillRect(t.x-t.w/2+4, t.y-t.h/2+4, t.w-8, 6);
        // rune on pillar
        ctx.fillStyle="rgba(122,79,181,0.18)"; ctx.beginPath(); ctx.arc(t.x, t.y, 7, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(122,79,181,0.28)"; ctx.lineWidth=0.8; ctx.stroke();
      } else if(t.type==="shelf"){
        ctx.fillStyle="#6b4c2a"; ctx.fillRect(t.x-t.w/2, t.y-t.h/2, t.w, t.h);
        ctx.fillStyle="#8a6b3a"; ctx.fillRect(t.x-t.w/2+3, t.y-t.h/2+3, t.w-6, t.h-6);
        ctx.strokeStyle="rgba(43,29,18,0.22)"; ctx.lineWidth=1; ctx.strokeRect(t.x-t.w/2, t.y-t.h/2, t.w, t.h);
        // books
        const n=Math.floor(t.w/9);
        for(let i=0;i<n;i++){
          ctx.fillStyle=`hsl(${rand(10,35)},${rand(40,65)}%,${rand(42,58)}%)`;
          if(t.w>t.h) ctx.fillRect(t.x-t.w/2+6+i*9, t.y-t.h/2+6, 7, t.h-12);
          else ctx.fillRect(t.x-t.w/2+6, t.y-t.h/2+6+i*9, t.w-12, 7);
        }
      }
    }
    // World border — ornate
    ctx.strokeStyle="rgba(43,29,18,0.22)"; ctx.lineWidth=2.5; ctx.strokeRect(0,0,world.w,world.h);
    ctx.strokeStyle="rgba(201,168,106,0.35)"; ctx.lineWidth=1; ctx.strokeRect(3,3,world.w-6,world.h-6);
    // Corner ornaments
    const cs=18;
    [[0,0],[world.w,0],[0,world.h],[world.w,world.h]].forEach(([cx,cy])=>{
      ctx.fillStyle="rgba(201,168,106,0.5)"; ctx.beginPath(); ctx.arc(cx,cy,cs,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#2b1d12"; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle="#fdf6e3"; ctx.font="10px serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("✦",cx,cy);
    });
  }

  function drawGems(){
    for(const g of xpGems){
      if(!inView(g.x,g.y,g.radius+6)) continue;
      g.pulse=(g.pulse||0)+0.07;
      const s=1+Math.sin(g.pulse)*0.12;
      const a=Math.min(1, g.life/400);
      ctx.globalAlpha=a;
      // ink bottle shape: small vial
      const r=g.radius*s;
      // glow
      ctx.fillStyle=g.color+"55"; ctx.beginPath(); ctx.arc(g.x,g.y,r+3,0,Math.PI*2); ctx.fill();
      // bottle
      ctx.fillStyle=g.color; ctx.beginPath();
      ctx.roundRect(g.x-r*0.55, g.y-r*0.3, r*1.1, r*1.15, 2); ctx.fill();
      // cap
      ctx.fillStyle="#2b1d12"; ctx.fillRect(g.x-r*0.35, g.y-r*0.55, r*0.7, r*0.32);
      // highlight
      ctx.fillStyle="rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(g.x-r*0.15, g.y-r*0.05, r*0.22, r*0.3, -0.3, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }
  }

  function drawProjectiles(){
    for(const p of projectiles){
      if(!inView(p.x,p.y,p.radius+12)) continue;
      const col=ELEMENTS[p.element]?.color||p.color||"#fff";
      const glow=ELEMENTS[p.element]?.glow||"rgba(255,255,255,0.25)";
      ctx.save();
      if(p.ring){
        const prog=1 - p.life/320; const rr=p.radius*(1+prog*1.8);
        ctx.globalAlpha=(1-prog)*0.55; ctx.strokeStyle=col; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,Math.PI*2); ctx.stroke();
        ctx.restore(); continue;
      }
      ctx.shadowColor=glow; ctx.shadowBlur=12;
      ctx.fillStyle=col;
      if(p.wide){
        // water wave: elongated
        ctx.beginPath(); ctx.ellipse(p.x,p.y,p.radius*1.4,p.radius*0.55, Math.atan2(p.vy,p.vx), 0, Math.PI*2); ctx.fill();
      } else if(p.aoe || p.shape==="pillar"){
        ctx.beginPath(); ctx.arc(p.x,p.y,p.radius,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0; ctx.strokeStyle="rgba(255,255,255,0.5)"; ctx.lineWidth=1.2; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x,p.y,p.radius,0,Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur=0;
      // highlight
      ctx.fillStyle="rgba(255,255,255,0.32)";
      ctx.beginPath(); ctx.ellipse(p.x-p.radius*0.18, p.y-p.radius*0.18, p.radius*0.28, p.radius*0.18, -0.5, 0, Math.PI*2); ctx.fill();
      // trail
      if(p.trail){
        ctx.globalAlpha=0.18; ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(p.x-p.vx*1.2, p.y-p.vy*1.2, p.radius*0.55, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawEnemyProjectiles(){
    for(const p of enemyProjectiles){
      if(!inView(p.x,p.y,p.radius+6)) continue;
      ctx.fillStyle=p.color||"#e8533a"; ctx.beginPath(); ctx.arc(p.x,p.y,p.radius,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.lineWidth=1; ctx.stroke();
    }
  }

  function drawEnemies(){
    for(const e of enemies){
      if(!e.alive||!inView(e.x,e.y,e.radius+32)) continue;
      const r=e.radius;
      const flashing=Date.now()<e.flashUntil;
      const slowed=Date.now()<e.slowUntil;
      const stunned=Date.now()<e.stunUntil;
      ctx.save();
      if(stunned) ctx.globalAlpha=0.45;
      // status rings
      if(slowed){ ctx.fillStyle="rgba(58,154,217,0.18)"; ctx.beginPath(); ctx.arc(e.x,e.y,r+5,0,Math.PI*2); ctx.fill(); }
      // shadow
      ctx.fillStyle="rgba(43,29,18,0.11)"; ctx.beginPath(); ctx.ellipse(e.x+2, e.y+r*0.7, r*0.75, r*0.28, 0, 0, Math.PI*2); ctx.fill();

      // Body by type
      if(e.type==="boss"){
        const wob=Math.sin(e.wobble)*1.5;
        ctx.fillStyle=flashing?"#fff":e.color;
        ctx.shadowColor=e.color; ctx.shadowBlur=18;
        // cloak shape
        ctx.beginPath();
        ctx.moveTo(e.x, e.y-r*1.25+wob);
        ctx.lineTo(e.x+r*0.9, e.y+r*0.65);
        ctx.lineTo(e.x, e.y+r*0.45);
        ctx.lineTo(e.x-r*0.9, e.y+r*0.65);
        ctx.closePath(); ctx.fill(); ctx.shadowBlur=0;
        ctx.strokeStyle="rgba(43,29,18,0.25)"; ctx.lineWidth=1.5; ctx.stroke();
        // eyes
        ctx.fillStyle="#fdf6e3"; ctx.beginPath(); ctx.arc(e.x-r*0.22, e.y-r*0.25, 5, 0, Math.PI*2); ctx.arc(e.x+r*0.22, e.y-r*0.25, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle="#c0392b"; ctx.beginPath(); ctx.arc(e.x-r*0.22, e.y-r*0.25, 2.5, 0, Math.PI*2); ctx.arc(e.x+r*0.22, e.y-r*0.25, 2.5, 0, Math.PI*2); ctx.fill();
      } else if(e.type==="bulwark"){
        ctx.fillStyle=flashing?"#fff":e.color;
        ctx.fillRect(e.x-r, e.y-r, r*2, r*2);
        ctx.strokeStyle="rgba(43,29,18,0.28)"; ctx.lineWidth=1.5; ctx.strokeRect(e.x-r, e.y-r, r*2, r*2);
        // rivets
        ctx.fillStyle="rgba(255,255,255,0.22)"; ctx.fillRect(e.x-r+3, e.y-r+3, 4, 4); ctx.fillRect(e.x+r-7, e.y-r+3, 4, 4);
        ctx.fillRect(e.x-r+3, e.y+r-7, 4, 4); ctx.fillRect(e.x+r-7, e.y+r-7, 4, 4);
      } else if(e.type==="lancer"){
        const a=Math.atan2(player?player.y-e.y:0, player?player.x-e.x:0);
        ctx.translate(e.x,e.y); ctx.rotate(a);
        ctx.fillStyle=flashing?"#fff":e.color;
        ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(-r*0.6, -r*0.65); ctx.lineTo(-r*0.3,0); ctx.lineTo(-r*0.6,r*0.65); ctx.closePath(); ctx.fill();
        ctx.strokeStyle="rgba(43,29,18,0.25)"; ctx.lineWidth=1.2; ctx.stroke();
        ctx.setTransform(dpr,0,0,dpr, (-camera.x)*dpr, (-camera.y)*dpr);
        ctx.save();
      } else if(e.type==="thorn"){
        // spiky
        ctx.fillStyle=flashing?"#fff":e.color;
        ctx.beginPath();
        for(let i=0;i<8;i++){ const ang=i*0.785-0.39, rr=i%2===0?r:r*0.62; const px=e.x+Math.cos(ang)*rr, py=e.y+Math.sin(ang)*rr; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle="rgba(43,29,18,0.22)"; ctx.lineWidth=1.2; ctx.stroke();
        ctx.fillStyle=flashing?"#fff":e.color; ctx.beginPath(); ctx.arc(e.x,e.y,r*0.42,0,Math.PI*2); ctx.fill();
      } else {
        // wisp / specter: soft circle
        const wob=Math.sin(e.wobble)*1.1;
        ctx.fillStyle=flashing?"#fff":e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, r+wob, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(43,29,18,0.18)"; ctx.lineWidth=1.2; ctx.stroke();
        // inner glow
        ctx.fillStyle="rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(e.x,e.y,r*0.45,0,Math.PI*2); ctx.fill();
      }
      // highlight
      if(!flashing && e.type!=="boss"){
        ctx.fillStyle="rgba(255,255,255,0.22)";
        ctx.beginPath(); ctx.ellipse(e.x-r*0.22, e.y-r*0.28, r*0.26, r*0.16, -0.5, 0, Math.PI*2); ctx.fill();
      }
      // HP bar
      if(e.hp<e.maxHP){
        const bw=r*1.9, bh=3.5;
        ctx.fillStyle="rgba(43,29,18,0.22)"; ctx.fillRect(e.x-bw/2, e.y-r-11, bw, bh);
        ctx.fillStyle=e.type==="boss"?"#e8533a":"#d4a017"; ctx.fillRect(e.x-bw/2, e.y-r-11, bw*(e.hp/e.maxHP), bh);
      }
      // name
      ctx.fillStyle="#2b1d12"; ctx.font=`700 ${Math.max(8, r*0.30)}px system-ui,sans-serif`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.lineWidth=2.8; ctx.strokeStyle="rgba(253,246,227,0.92)";
      const label=e.type==="boss" ? `◆ ${e.name} ◆` : e.name;
      ctx.strokeText(label, e.x, e.y+r+13); ctx.fillText(label, e.x, e.y+r+13);
      ctx.restore();
    }
  }

  function drawWitch(x, y, r, color, name, aimAngle, wobble, isFlash, isIFrame){
    ctx.save();
    if(isIFrame) ctx.globalAlpha=0.32;
    // shadow
    ctx.fillStyle="rgba(43,29,18,0.13)"; ctx.beginPath(); ctx.ellipse(x, y+r*0.88, r*0.92, r*0.32, 0, 0, Math.PI*2); ctx.fill();
    // robe — tapered
    const robeGrad=ctx.createLinearGradient(x-r*0.6, y, x+r*0.6, y);
    robeGrad.addColorStop(0, "#3d2b5a"); robeGrad.addColorStop(0.5, color); robeGrad.addColorStop(1, "#2a1d3a");
    ctx.fillStyle=robeGrad;
    ctx.beginPath();
    ctx.moveTo(x-r*0.55, y+r*0.72); ctx.lineTo(x-r*0.32, y-r*0.05);
    ctx.lineTo(x+r*0.32, y-r*0.05); ctx.lineTo(x+r*0.55, y+r*0.72);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(201,168,106,0.35)"; ctx.lineWidth=1; ctx.stroke();
    // body orb
    ctx.beginPath(); ctx.arc(x, y, r+wobble, 0, Math.PI*2);
    const g=ctx.createRadialGradient(x-r*0.2, y-r*0.2, r*0.1, x, y, r+wobble);
    g.addColorStop(0, color); g.addColorStop(1, "#b794f6");
    ctx.fillStyle=g; ctx.fill();
    ctx.strokeStyle="rgba(43,29,18,0.14)"; ctx.lineWidth=1.2; ctx.stroke();
    // highlight
    ctx.fillStyle="rgba(255,255,255,0.32)"; ctx.beginPath(); ctx.ellipse(x-r*0.24, y-r*0.28, r*0.26, r*0.16, -0.5, 0, Math.PI*2); ctx.fill();
    // wand
    const wx=x+Math.cos(aimAngle)*r*0.85, wy=y+Math.sin(aimAngle)*r*0.85;
    const tipX=x+Math.cos(aimAngle)*(r+14), tipY=y+Math.sin(aimAngle)*(r+14);
    ctx.strokeStyle="#4a3728"; ctx.lineWidth=3; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.fillStyle=isFlash?"#fff":ELEMENTS[player?.weapons[0]?.element]?.color||"#d4a017";
    ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=isFlash?14:6;
    ctx.beginPath(); ctx.arc(tipX, tipY, isFlash?5:3.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // hat
    drawHat(x, y-r*0.58, r);
    // face — simple
    ctx.fillStyle="#2b1d12"; ctx.beginPath(); ctx.arc(x-3.5, y+2, 1.6, 0, Math.PI*2); ctx.arc(x+3.5, y+2, 1.6, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(253,246,227,0.85)"; ctx.lineWidth=1; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x-4, y+6); ctx.quadraticCurveTo(x, y+8, x+4, y+6); ctx.stroke();
    // name
    ctx.fillStyle="#2b1d12"; ctx.font="700 11px system-ui,sans-serif"; ctx.textAlign="center";
    ctx.lineWidth=2.8; ctx.strokeStyle="rgba(253,246,227,0.92)";
    ctx.strokeText(name, x, y-r-16); ctx.fillText(name, x, y-r-16);
    ctx.restore();
  }
  function drawHat(cx, cy, scale){
    const s=scale*0.048;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(s,s);
    // brim shadow
    ctx.fillStyle="rgba(43,29,18,0.15)"; ctx.beginPath(); ctx.ellipse(2,16,30,9,0,0,Math.PI*2); ctx.fill();
    // brim
    ctx.fillStyle="#1a120e"; ctx.beginPath(); ctx.ellipse(0,14,30,9,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(201,168,106,0.5)"; ctx.lineWidth=1; ctx.stroke();
    // band
    ctx.fillStyle="#c9a86a"; ctx.fillRect(-16,10,32,4);
    ctx.fillStyle="#8a6b2e"; ctx.fillRect(-3,8,6,8);
    // cone
    ctx.fillStyle="#1f140f"; ctx.beginPath(); ctx.moveTo(-16,12); ctx.lineTo(0,-26); ctx.lineTo(16,12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#c9a86a"; ctx.lineWidth=1; ctx.stroke();
    // tip star
    ctx.fillStyle="#e8c86a"; ctx.beginPath(); ctx.arc(0,-26,3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(-0.8,-27,1,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawOtherPlayers(){
    for(const [,op] of otherPlayers){
      if(!op.alive||!inView(op.x,op.y,28)) continue;
      const wob=Math.sin(gameTime*0.008)*1.2;
      drawWitch(op.x, op.y, 19, op.color, op.name, op.angle||0, wob, false, false);
      // hp bar for others
      const bw=38, bh=4;
      ctx.fillStyle="rgba(43,29,18,0.22)"; ctx.fillRect(op.x-bw/2, op.y-34, bw, bh);
      ctx.fillStyle="#7c5cbf"; ctx.fillRect(op.x-bw/2, op.y-34, bw*(op.hp/op.maxHP), bh);
    }
  }
  function drawPlayer(){
    if(!player||!player.alive) return;
    const wob=Math.sin(player.wobble)*1.3;
    const flashing=Date.now()<player.castFlashUntil;
    const iframe=Date.now()<player.iFrameUntil;
    drawWitch(player.x, player.y, player.radius, player.color, player.name, player._aimAngle, wob, flashing, iframe);
    if(player.shield>5){
      const pct=player.shield/player.maxShield;
      ctx.beginPath(); ctx.arc(player.x, player.y, player.radius+11, 0, Math.PI*2);
      ctx.strokeStyle=`rgba(122,79,181,${0.25+pct*0.45})`; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle=`rgba(122,79,181,${0.04+pct*0.07})`; ctx.fill();
    }
    if(Date.now()<player.dodgeUntil){
      ctx.beginPath(); ctx.arc(player.x, player.y, player.radius+9, 0, Math.PI*2);
      ctx.strokeStyle="rgba(183,148,246,0.55)"; ctx.lineWidth=2; ctx.setLineDash([5,5]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function drawSealsAndParticles(){
    for(const s of seals) drawSeal(s);
    for(const p of particles){
      ctx.globalAlpha=p.life*0.9;
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
    for(const p of popups){
      ctx.globalAlpha=p.life;
      ctx.fillStyle=p.color; ctx.font="700 13px system-ui,sans-serif"; ctx.textAlign="center";
      ctx.lineWidth=2.8; ctx.strokeStyle="rgba(253,246,227,0.92)";
      ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha=1;
  }

  // ============================================================
  // HUD
  // ============================================================
  function updateHUD(){
    if(!player) return;
    $("level-badge").textContent=`Lv ${level}`;
    $("hp-fill").style.width=(player.hp/player.maxHP*100)+"%";
    $("mana-fill").style.width=(player.shield/player.maxShield*100)+"%";
    $("wave-display").textContent=`Wave ${waveNum}`;
    const rem=Math.max(0,Math.floor((600000-runTimer)/1000));
    $("timer-display").textContent=`${Math.floor(rem/60)}:${String(rem%60).padStart(2,"0")}`;
    const slots=document.querySelectorAll(".spell-slot");
    slots.forEach((slot,idx)=>{
      const w=player.weapons[idx];
      if(!w){ slot.style.opacity="0.22"; slot.querySelector(".spell-icon").textContent="—"; slot.querySelector(".spell-key").textContent=""; slot.style.borderColor="#2b1d12"; return; }
      const pct=w.timer>0 ? (w.timer/(w.baseCd*player.cdMult)*100) : 0;
      slot.style.opacity=w.timer>0?"0.42":"1";
      slot.style.setProperty("--cd", String(pct));
      slot.querySelector(".spell-icon").textContent=w.icon;
      slot.querySelector(".spell-key").textContent=String(w.level);
      slot.style.borderColor=ELEMENTS[w.element]?.color||"#2b1d12";
    });
  }
  function updateLeaderboard(){
    const list=$("leaderboard-list"); if(!list) return;
    const ents=[];
    if(player&&player.alive) ents.push({name:player.name, score:Math.floor(player.hp), me:true});
    for(const [,op] of otherPlayers) if(op.alive) ents.push({name:op.name, score:op.hp, me:false});
    ents.sort((a,b)=>b.score-a.score);
    list.innerHTML=ents.slice(0,8).map(e=>`<li class="${e.me?"me":""}">${e.name} <span>${e.score}</span></li>`).join("");
  }
  function updateMinimap(){
    const mc=$("minimap-canvas"), mctx=mc?mc.getContext("2d"):null; if(!mctx) return;
    const w=mc.width, h=mc.height;
    mctx.clearRect(0,0,w,h); mctx.fillStyle="rgba(253,246,227,0.94)"; mctx.fillRect(0,0,w,h);
    const sx=w/world.w, sy=h/world.h;
    mctx.strokeStyle="rgba(43,29,18,0.14)"; mctx.lineWidth=1; mctx.strokeRect(0.5,0.5,w-1,h-1);
    // terrain on minimap
    for(const t of terrain){ if(t.type==="rug") continue; mctx.fillStyle=t.type==="pillar"?"rgba(107,76,42,0.35)":"rgba(107,76,42,0.5)"; mctx.fillRect(t.x*sx-t.w*sx/2, t.y*sy-t.h*sy/2, t.w*sx, t.h*sy); }
    for(const e of enemies){ if(!e.alive) continue; mctx.beginPath(); mctx.arc(e.x*sx,e.y*sy,e.type==="boss"?3.5:1.6,0,Math.PI*2); mctx.fillStyle=e.type==="boss"?"#c0392b":"rgba(122,79,181,0.45)"; mctx.fill(); }
    for(const [,op] of otherPlayers){ if(!op.alive) continue; mctx.beginPath(); mctx.arc(op.x*sx,op.y*sy,2.6,0,Math.PI*2); mctx.fillStyle=op.color; mctx.fill(); }
    if(player&&player.alive){ mctx.beginPath(); mctx.arc(player.x*sx,player.y*sy,2.8,0,Math.PI*2); mctx.fillStyle="#2b1d12"; mctx.fill(); mctx.strokeStyle="#fffaf0"; mctx.lineWidth=1; mctx.stroke(); }
    // camera rect
    mctx.strokeStyle="rgba(201,168,106,0.5)"; mctx.lineWidth=0.7;
    mctx.strokeRect(camera.x*sx, camera.y*sy, view.w*sx, view.h*sy);
  }

  // ============================================================
  // COLLISION + PROJECTILES
  // ============================================================
  function tickProjectiles(dt){
    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i]; p.life-=dt; if(p.life<=0){ projectiles.splice(i,1); continue; }
      if(p.ring){
        // expanding ring already handled in draw, just tick life
      } else if(p.chain){
        // lightning chain: jump between enemies
        if(p.chainTarget && p.chainTarget.alive && dist(p, p.chainTarget) < 14){
          p.chainTarget.takeDamage(p.dmg, p.element);
          p.chainHits.push(p.chainTarget);
          // find next
          p.chainCount--;
          if(p.chainCount<=0){ projectiles.splice(i,1); continue; }
          const next=enemies.filter(e=>e.alive && !p.chainHits.includes(e)).sort((a,b)=>dist(p.chainTarget,a)-dist(p.chainTarget,b))[0];
          if(next){ p.chainTarget=next; p.x=p.chainTarget.x; p.y=p.chainTarget.y; }
          else { projectiles.splice(i,1); continue; }
        } else if(p.chainTarget){
          // move towards target
          const a=Math.atan2(p.chainTarget.y-p.y, p.chainTarget.x-p.x);
          p.x+=Math.cos(a)*14*(dt/16); p.y+=Math.sin(a)*14*(dt/16);
        }
        continue;
      } else {
        p.x+=p.vx*(dt/16); p.y+=p.vy*(dt/16);
        if(p.homingTarget && p.homingTarget.alive){
          const a=Math.atan2(p.homingTarget.y-p.y, p.homingTarget.x-p.x);
          p.vx=lerp(p.vx, Math.cos(a)*(p.homingTarget?6:4), p.homing||0.08);
          p.vy=lerp(p.vy, Math.sin(a)*(p.homingTarget?6:4), p.homing||0.08);
        }
      }
      if(p.owner==="player"){
        for(const e of enemies){
          if(!e.alive) continue;
          const hitDist = p.ring ? p.radius*(1+(1-p.life/320)*1.8)+e.radius : p.radius+e.radius;
          if(dist(p,e) < hitDist){
            e.takeDamage(p.dmg, p.element);
            if(p.lifesteal) player.heal(p.dmg*p.lifesteal);
            if(p.slow){ e.slowUntil=Date.now()+p.slow.dur; e.slowPct=p.slow.pct; }
            if(p.stun){ e.stunUntil=Date.now()+p.stun.dur; }
            if(!p.ring){ p.pierce--; if(p.pierce<=0){ spawnInk(p.x,p.y,ELEMENTS[p.element].color,5); projectiles.splice(i,1); break; } }
          }
        }
      }
    }
    for(let i=enemyProjectiles.length-1;i>=0;i--){
      const p=enemyProjectiles[i]; p.life-=dt; if(p.life<=0){enemyProjectiles.splice(i,1); continue;}
      p.x+=p.vx*(dt/16); p.y+=p.vy*(dt/16);
      if(player&&player.alive&&dist(p,player)<p.radius+player.radius){ player.takeDamage(p.dmg); spawnInk(p.x,p.y,p.color,4); enemyProjectiles.splice(i,1); }
    }
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================
  function loop(ts){
    if(!running||paused) return;
    if(hitFreeze>0){ hitFreeze-=16; requestAnimationFrame(loop); return; }
    const dt=Math.min(32, ts-lastTime); lastTime=ts; gameTime+=dt; runTimer+=dt;
    if(mode==="single"){ waveTimer-=dt; if(waveTimer<=0 && player&&player.alive) spawnWave(); }
    if(screenShake>0) screenShake=Math.max(0, screenShake-dt*0.038);
    driveInputs();
    if(mode==="single"){
      player?.update(dt);
      for(const e of enemies) e.update(dt);
      enemies=enemies.filter(e=>e.alive);
      collectGems();
      tickProjectiles(dt);
    }
    updateParticles(dt); updateSeals(dt); updateCamera();
    // render
    screenTransform(); ctx.clearRect(0,0,view.w*dpr,view.h*dpr);
    worldTransform();
    drawArena(); drawGems(); drawEnemies(); drawOtherPlayers();
    drawProjectiles(); drawEnemyProjectiles(); drawPlayer();
    drawSealsAndParticles();
    screenTransform();
    updateHUD(); updateLeaderboard(); updateMinimap();
    animId=requestAnimationFrame(loop);
  }

  // ============================================================
  // GAME STATE
  // ============================================================
  function startGame(modeSel){
    mode=modeSel;
    world={...C.world}; buildTerrain();
    xpGems=[]; enemies=[]; projectiles=[]; particles=[]; popups=[]; seals=[]; enemyProjectiles=[];
    otherPlayers.clear();
    player=null; gameTime=0; runTimer=0; waveNum=0; waveTimer=2600; statKills=0; statDamage=0;
    xp=0; level=1; xpToNext=C.xpBase; pendingLevelUps=0;
    // find clear spawn
    let sx, sy, tries=0;
    do{ sx=rand(400, world.w-400); sy=rand(400, world.h-400); tries++; } while(isBlocked(sx,sy,28) && tries<20);
    const n1=($("name-input")?.value||"Witch").trim().slice(0,16)||"Witch";
    player=new Player(sx, sy, n1, "#c9a8ff");
    player.addElement("fire"); player.addWeapon("ember");
    camera.x=world.w/2-view.w/2; camera.y=world.h/2-view.h/2;
    $("start-screen")?.classList.add("hidden"); $("end-screen")?.classList.add("hidden");
    $("hud")?.classList.remove("hidden"); $("pause-menu")?.classList.add("hidden");
    $("levelup-overlay")?.classList.add("hidden");
    if(isTouch) $("mobile-controls")?.classList.remove("hidden");
    running=true; paused=false; lastTime=performance.now();
    cancelAnimationFrame(animId); animId=requestAnimationFrame(loop);
  }
  function endGame(){
    running=false;
    const m=Math.floor(gameTime/60000), s=Math.floor((gameTime%60000)/1000);
    $("final-score").textContent=`Wave ${waveNum} · Lv ${level}`;
    $("stat-time").textContent=`${m}:${String(s).padStart(2,"0")}`;
    $("stat-kills").textContent=String(statKills);
    $("stat-combo").textContent=String(level);
    $("stat-waves").textContent=String(waveNum);
    $("end-screen")?.classList.remove("hidden");
    $("hud")?.classList.add("hidden"); $("mobile-controls")?.classList.add("hidden");
    $("levelup-overlay")?.classList.add("hidden");
  }
  function togglePause(){
    if(!running) return;
    paused=!paused;
    $("pause-menu")?.classList.toggle("hidden", !paused);
    if(!paused){ lastTime=performance.now(); animId=requestAnimationFrame(loop); }
  }

  // ============================================================
  // BINDINGS
  // ============================================================
  $("resume-btn")?.addEventListener("click", togglePause);
  $("quit-btn")?.addEventListener("click",()=>{
    running=false; cancelAnimationFrame(animId);
    if(ws) try{ws.close();}catch(_){}
    ws=null;
    $("pause-menu")?.classList.add("hidden"); $("end-screen")?.classList.add("hidden");
    $("levelup-overlay")?.classList.add("hidden"); $("start-screen")?.classList.remove("hidden");
    $("hud")?.classList.add("hidden"); $("mobile-controls")?.classList.add("hidden");
  });
  $("play-solo")?.addEventListener("click",()=> startGame("single"));
  $("play-online")?.addEventListener("click",()=>{
    const raw=($("server-input")?.value||"").trim();
    const url=raw || `ws://${location.hostname||"127.0.0.1"}:3000`;
    $("conn-status").textContent="Connecting…";
    startGame("online"); connectWS(url);
  });
  $("restart-btn")?.addEventListener("click",()=>{ $("end-screen")?.classList.add("hidden"); $("start-screen")?.classList.remove("hidden"); });
  $("dodge-btn")?.addEventListener("pointerdown",(e)=>{ e.preventDefault(); doDodge(); });
  $("shield-btn")?.addEventListener("pointerdown",(e)=>{ e.preventDefault(); doShield(); });
  $("name-input")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") $("play-solo")?.click(); });
  document.querySelectorAll(".diff-btn").forEach(b=> b.addEventListener("click",()=>{
    document.querySelectorAll(".diff-btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); difficulty=b.dataset.diff;
  }));
  canvas.addEventListener("touchstart",(e)=>e.preventDefault(),{passive:false});
  canvas.addEventListener("touchmove",(e)=>e.preventDefault(),{passive:false});
})();
