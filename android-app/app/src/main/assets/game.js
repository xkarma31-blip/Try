/**
 * Witch.io — Atelier Arena (upgrade)
 * Soul Knight auto-aim + Magica.io element combos + Vampire Survivors drafting + Witch Hat Atelier craft
 * - Projectile combat (wand + 6 sigils) instead of pure agar eat
 * - XP motes + level draft (VS / Holocure)
 * - Hat + sigil circles + parchment wash + ink particles
 * - Solo / Local Duel (2 joysticks) / Net (movement-only, projectiles local)
 */
(() => {
  "use strict";
  // ============================================================
  // CONFIG
  // ============================================================
  const CONFIG = {
    world: { w: 4000, h: 4000 },
    foodRadius: 7,
    startMass: 30,
    botCount: { easy: 12, medium: 18, hard: 25 },
    foodCount: { easy: 380, medium: 560, hard: 760 },
    tickRate: 60,
  };
  const SPELLS = {
    surge:  { name: "Ember Volley", icon: "⚡", cooldown: 4200,  dur: 0,   desc:"3 embers + burn" },
    ward:   { name: "Aegis Sigil",  icon: "🛡️", cooldown: 9000,  dur: 2800, desc:"Blocks shots" },
    magnet: { name: "Tide Vortex",  icon: "🧲", cooldown: 10000, dur: 3800, desc:"Pull + collect" },
    dash:   { name: "Ink Dash",     icon: "💨", cooldown: 2600,  dur: 220,  desc:"i-frame dash" },
    vanish: { name: "Veil Ink",     icon: "🔮", cooldown: 13000, dur: 2600, desc:"Vanish + decoy" },
    blast:  { name: "Terra Quake",  icon: "💣", cooldown: 8200,  dur: 0,   desc:"8 shards + knock" },
  };
  const SPELL_ORDER = ["surge","ward","magnet","dash","vanish","blast"];

  // ============================================================
  // STATE
  // ============================================================
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  let world = { ...CONFIG.world };
  let difficulty = "easy";
  let mode = "single";
  let running = false, paused = false;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  let view = { w:0,h:0, scale:1, targetScale:1, userZoom:1 };
  let camera = { x:0,y:0 };
  let shake = 0;
  const mouse = { x:0,y:0 };

  let foods = [];
  let blobs = [];
  let players = [];
  let player = null;
  let particles = [];
  let popups = [];
  let trails = [];
  let projectiles = []; // {x,y,vx,vy, r, dmg, color, owner, life, pierce, kind}
  let decals = []; // ink splats on ground {x,y,r, life}

  // VS-style progression
  let xp = 0, level = 1, xpToNext = 30;
  let emberCount = 3, shardCount = 8, vortexRadius = 210;
  let moveBonus = 0, haste = 1; // haste <1 = faster cooldowns
  let wandTimer = 0;
  let iFrameUntil = 0;
  let pendingLevelUps = 0;

  let combo=0, comboTimer=0, gameTime=0, statEaten=0, statSpells=0, statMaxPower=0;
  let activeSpells = {}, spellCooldowns = {};
  let animationId=null, lastTime=0;

  const joy = { active:false, id:null, ox:0, oy:0, x:0, y:0, maxR:70, dead:12, vector:{x:0,y:0} };
  const joy2= { active:false, id:null, ox:0, oy:0, x:0, y:0, maxR:70, dead:12, vector:{x:0,y:0} };
  const pointers = new Map();
  const net = { ws:null, id:null, connected:false, byId:new Map(), foods:[], world:null, lastSent:0, self:null };

  // ============================================================
  // UTIL
  // ============================================================
  const rand=(a,b)=>Math.random()*(b-a)+a;
  const randColor=()=>`hsl(${Math.floor(rand(250,320))}, 70%, 62%)`;
  const massToRadius=(m)=>Math.max(14, Math.sqrt(m)*5);
  const speedFor=(m)=> (3.6 + moveBonus) * Math.pow(30/(m+30),0.38);
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const lerp=(a,b,t)=>a+(b-a)*t;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const $=(id)=>document.getElementById(id);
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
  function aimDir(from){
    // prefer movement input, else nearest foe within 520
    const inp = from.input || {x:0,y:0};
    if(Math.hypot(inp.x,inp.y)>0.18) return Math.atan2(inp.y,inp.x);
    let best=null, bd=520;
    for(const b of blobs){ if(b===from||!b.alive) continue; const d=dist(from,b); if(d<bd){best=b; bd=d;}}
    if(best) return Math.atan2(best.y-from.y, best.x-from.x);
    return from._lastAngle || 0;
  }

  // ============================================================
  // SPELLS (projectile version)
  // ============================================================
  function castSpell(key){
    if(!player||!player.alive) return;
    if(Date.now() < (spellCooldowns[key]||0)) return;
    const sp=SPELLS[key]; if(!sp) return;
    const baseCd = sp.cooldown * haste;
    spellCooldowns[key]=Date.now()+baseCd;
    statSpells++;
    switch(key){
      case "surge": doSurge(player); break;
      case "ward": activeSpells.ward=Date.now()+sp.dur; spawnSigil(player.x,player.y,0.95); shake=Math.max(shake,4); spawnParticles(player.x,player.y,"#ffd66e",14); break;
      case "magnet": activeSpells.magnet=Date.now()+sp.dur; spawnParticles(player.x,player.y,"#8ab4a0",16); break;
      case "dash": doDash(player); break;
      case "vanish": activeSpells.vanish=Date.now()+sp.dur; spawnParticles(player.x,player.y,"#b8a0ff",18); addPopup(player.x,player.y-30,"veil","#d4b8ff"); break;
      case "blast": doBlast(player); break;
    }
    updateSpellUI();
  }
  function doSurge(owner){
    const ang = aimDir(owner);
    owner._lastAngle = ang;
    const spread = 0.22;
    for(let i=0;i<emberCount;i++){
      const off = (i - (emberCount-1)/2)*spread;
      fireProjectile(owner, ang+off, 9.2, 14, "#ff8a3d", {kind:"ember", life:62, pierce:0});
    }
    spawnSigil(owner.x,owner.y,0.55);
    shake=Math.max(shake,5);
  }
  function doDash(owner){
    const ang = aimDir(owner);
    owner._lastAngle=ang;
    const d=240;
    const nx=clamp(owner.x+Math.cos(ang)*d, owner.radius, world.w-owner.radius);
    const ny=clamp(owner.y+Math.sin(ang)*d, owner.radius, world.h-owner.radius);
    // ink trail damaging
    for(let t=0;t<5;t++){
      const ix=lerp(owner.x,nx,t/5), iy=lerp(owner.y,ny,t/5);
      decals.push({x:ix,y:iy,r:22+Math.random()*10, life:1, color:"rgba(43,29,18,0.16)"});
      spawnParticles(ix,iy,"#2b1d12",2);
    }
    owner.x=nx; owner.y=ny;
    iFrameUntil = Date.now()+260;
    activeSpells.dash=Date.now()+220;
    spawnParticles(owner.x,owner.y,"#d4b8ff",16);
    shake=Math.max(shake,6);
  }
  function doBlast(owner){
    const cx=owner.x, cy=owner.y;
    // knock + shards
    for(const b of blobs){ if(b===owner||!b.alive) continue; const d=dist(b,owner); if(d<240){ const a=Math.atan2(b.y-cy,b.x-cx); const s=(1-d/240)*260; b.x=clamp(b.x+Math.cos(a)*s,b.radius,world.w-b.radius); b.y=clamp(b.y+Math.sin(a)*s,b.radius,world.h-b.radius); b.target=null; } }
    const ang0 = aimDir(owner);
    for(let i=0;i<shardCount;i++){
      const a = ang0 + (i/shardCount)*Math.PI*2;
      fireProjectile(owner, a, 10.5, 18, "#c9a86a", {kind:"shard", life:48, pierce:1, r:7});
    }
    spawnParticles(cx,cy,"#e8b86a",26);
    shake=Math.max(shake,12);
    // ground crack decal
    decals.push({x:cx,y:cy,r:72,life:1,color:"rgba(201,168,106,0.18)"});
  }
  function fireProjectile(owner, ang, speed, dmg, color, opts={}){
    const r=opts.r||5.5;
    const vx=Math.cos(ang)*speed, vy=Math.sin(ang)*speed;
    // spawn just outside owner radius
    const sx=owner.x+Math.cos(ang)*(owner.radius+r+2), sy=owner.y+Math.sin(ang)*(owner.radius+r+2);
    projectiles.push({ x:sx,y:sy, vx,vy, r, dmg, color, owner, life:opts.life||70, pierce:opts.pierce||0, kind:opts.kind||"bolt", trail:[] });
  }
  function spawnSigil(x,y,alpha){ decals.push({x,y,r:42,life:1,color:`rgba(124,92,191,${0.18*alpha})`, sigil:true, rot:Math.random()*Math.PI}); }

  const isShielded=()=>!!(activeSpells.ward && Date.now()<activeSpells.ward);
  const isInvisible=()=>!!(activeSpells.vanish && Date.now()<activeSpells.vanish);
  const isMagnetActive=()=>!!(activeSpells.magnet && Date.now()<activeSpells.magnet);

  // ============================================================
  // PARTICLES / POPUPS / DECALS
  // ============================================================
  function spawnParticles(x,y,color,n){
    for(let i=0;i<n;i++){ const a=rand(0,Math.PI*2), sp=rand(1.8,8.5); particles.push({x,y,vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:1, decay:rand(0.022,0.055), color, size:rand(2.2,6.2)}); }
  }
  function addPopup(x,y,text,color){ popups.push({x,y,text,color,life:1}); }
  function updateParticles(dt){
    for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.96; p.vy*=0.96; p.life-=p.decay; if(p.life<=0) particles.splice(i,1); }
    for(let i=popups.length-1;i>=0;i--){ const p=popups[i]; p.y-=0.7; p.life-=0.018; if(p.life<=0) popups.splice(i,1); }
    for(let i=decals.length-1;i>=0;i--){ const d=decals[i]; d.life-=0.008; if(d.life<=0) decals.splice(i,1); }
  }

  // ============================================================
  // BLOB (witch)
  // ============================================================
  class Blob {
    constructor(x,y,mass,color,name,isPlayer=false){
      this.x=x; this.y=y; this.mass=mass; this.color=color; this.name=name;
      this.isPlayer=isPlayer; this.alive=true; this.input={x:0,y:0};
      this.vx=0; this.vy=0; this.target=null; this.wobble=rand(0,Math.PI*2);
      this._lastAngle=rand(0,Math.PI*2);
      this.shotCd=rand(300,900);
      this.hpScale=mass; // mirror mass as HP for shooter
    }
    get radius(){ return massToRadius(this.mass); }
    update(dt){
      const r=this.radius;
      let base=speedFor(this.mass);
      // magnet pull for player
      if(this.isPlayer && isMagnetActive()){
        // foods pulled in eatFood, here we also gently pull nearby blobs inward? subtle
      }
      if(this.isPlayer){
        const inp=this.input||{x:0,y:0};
        const m=Math.hypot(inp.x,inp.y);
        if(m>0.001){ const sp=Math.min(base, base*Math.min(1,m)); this.vx=(inp.x/m)*sp; this.vy=(inp.y/m)*sp; if(m>0.2) this._lastAngle=Math.atan2(inp.y,inp.x); }
        else this.vx=this.vy=0;
      } else {
        this.think(dt);
        const tx=this.target?this.target.x:this.x, ty=this.target?this.target.y:this.y;
        const dx=tx-this.x, dy=ty-this.y, d=Math.hypot(dx,dy);
        if(d>1){ const sp=Math.min(base, d*0.08); this.vx=(dx/d)*sp; this.vy=(dy/d)*sp; if(d>6) this._lastAngle=Math.atan2(dy,dx); } else this.vx=this.vy=0;
        // bot shooting
        this.shotCd-=dt;
        if(this.shotCd<=0 && this.alive){
          // find target within 520
          let best=null, bd=520;
          for(const o of blobs){ if(o===this||!o.alive) continue; const d2=dist(this,o); if(d2<bd){best=o; bd=d2;}}
          if(best){ const a=Math.atan2(best.y-this.y,best.x-this.x); fireProjectile(this, a+rand(-0.14,0.14), 8.2, 7, this.color, {life:62}); this.shotCd=rand(1100,1900); }
          else this.shotCd=rand(700,1100);
        }
      }
      this.x+=this.vx; this.y+=this.vy;
      this.x=clamp(this.x,r,world.w-r); this.y=clamp(this.y,r,world.h-r);
      this.wobble+=0.05;
    }
    think(dt){
      if(!this.target || Math.random()<0.018){
        const a=rand(0,Math.PI*2), reach=rand(220,720);
        this.target={x:clamp(this.x+Math.cos(a)*reach,0,world.w), y:clamp(this.y+Math.sin(a)*reach,0,world.h)};
      }
      let threat=null, prey=null, bd=Infinity;
      for(const o of blobs){
        if(o===this||!o.alive) continue;
        const d=dist(this,o); if(d>620) continue;
        if(o.mass > this.mass*1.18){ if(!threat || d<dist(this,threat)) threat=o; }
        else if(this.mass > o.mass*1.1){ if(d<bd){prey=o; bd=d;}}
      }
      if(threat){ const ax=this.x-threat.x, ay=this.y-threat.y, m=Math.hypot(ax,ay)||1; this.target={x:this.x+(ax/m)*420, y:this.y+(ay/m)*420}; }
      else if(prey) this.target={x:prey.x, y:prey.y};
      // strafe a bit when near prey to feel kiting
      if(prey && Math.random()<0.06){
        const a=Math.atan2(prey.y-this.y, prey.x-this.x)+ (Math.random()<0.5? 0.9 : -0.9);
        this.target={x:clamp(prey.x+Math.cos(a)*160,0,world.w), y:clamp(prey.y+Math.sin(a)*160,0,world.h)};
      }
    }
    draw(){
      const r=this.radius, wob=Math.sin(this.wobble)*1.4;
      // sigil under feet (atelier circle)
      const sigilAlpha = this.isPlayer ? 0.22 : 0.10;
      ctx.save();
      ctx.globalAlpha = sigilAlpha;
      drawSigilCircle(this.x, this.y, r+18, this.wobble*0.6);
      ctx.restore();
      if(this.isPlayer && isShielded()){
        ctx.beginPath(); ctx.arc(this.x,this.y,r+14,0,Math.PI*2);
        ctx.strokeStyle="rgba(124,92,191,0.9)"; ctx.lineWidth=3; ctx.stroke();
        ctx.beginPath(); ctx.arc(this.x,this.y,r+14,0,Math.PI*2); ctx.fillStyle="rgba(124,92,191,0.13)"; ctx.fill();
        // orbiting runes
        for(let i=0;i<3;i++){ const a=gameTime*0.0015 + i*2.09; const rx=this.x+Math.cos(a)*(r+14), ry=this.y+Math.sin(a)*(r+14); ctx.beginPath(); ctx.arc(rx,ry,3,0,Math.PI*2); ctx.fillStyle="rgba(124,92,191,0.9)"; ctx.fill(); }
      }
      if(this.isPlayer && isInvisible()) ctx.globalAlpha=0.28;
      // brim shadow
      ctx.beginPath(); ctx.ellipse(this.x, this.y+r*0.9, r*0.95, r*0.38, 0, 0, Math.PI*2);
      ctx.fillStyle="rgba(43,29,18,0.14)"; ctx.fill();
      // body
      ctx.beginPath(); ctx.arc(this.x,this.y, r+wob, 0, Math.PI*2);
      ctx.fillStyle=this.color; ctx.fill();
      ctx.lineWidth=1.2; ctx.strokeStyle="rgba(43,29,18,0.18)"; ctx.stroke();
      // highlight
      ctx.beginPath(); ctx.ellipse(this.x - r*0.28, this.y - r*0.32, r*0.30, r*0.20, -0.6, 0, Math.PI*2);
      ctx.fillStyle="rgba(255,255,255,0.38)"; ctx.fill();
      // witch hat (atelier)
      drawWitchHat(this.x, this.y - r*0.62, r);
      // coat collar
      ctx.beginPath(); ctx.moveTo(this.x - r*0.42, this.y + r*0.12); ctx.lineTo(this.x, this.y + r*0.32); ctx.lineTo(this.x + r*0.42, this.y + r*0.12);
      ctx.strokeStyle="rgba(253,246,227,0.95)"; ctx.lineWidth=Math.max(1.2, r*0.06); ctx.lineJoin="round"; ctx.stroke();
      // HP bar (shooter health)
      if(this.alive){
        const hpPct = clamp(this.mass / Math.max(22, this.hpScale||this.mass), 0, 1);
        const bw = r*1.6, bh=4;
        ctx.fillStyle="rgba(43,29,18,0.22)"; ctx.fillRect(this.x - bw/2, this.y - r - 14, bw, bh);
        ctx.fillStyle= this.isPlayer ? "#7c5cbf" : "#e8b86a"; ctx.fillRect(this.x - bw/2, this.y - r - 14, bw*hpPct, bh);
        ctx.strokeStyle="rgba(43,29,18,0.35)"; ctx.lineWidth=1; ctx.strokeRect(this.x - bw/2, this.y - r - 14, bw, bh);
      }
      if(this.alive){
        ctx.fillStyle="#2b1d12"; ctx.font=`700 ${Math.max(11, r*0.30)}px 'Crimson Pro', serif`;
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.lineWidth=3; ctx.strokeStyle="rgba(253,246,227,0.95)";
        ctx.strokeText(this.name, this.x, this.y + r + 16); ctx.fillText(this.name, this.x, this.y + r + 16);
      }
      ctx.globalAlpha=1;
    }
  }

  function drawWitchHat(cx, cy, r){
    const h = r*1.15, brimW = r*1.55, brimH = r*0.28;
    // brim (ellipse)
    ctx.beginPath(); ctx.ellipse(cx, cy + h*0.22, brimW, brimH, 0, 0, Math.PI*2);
    ctx.fillStyle="#1f140f"; ctx.fill();
    ctx.strokeStyle="rgba(253,246,227,0.22)"; ctx.lineWidth=1; ctx.stroke();
    // cone
    ctx.beginPath();
    ctx.moveTo(cx - brimW*0.42, cy + h*0.22);
    ctx.quadraticCurveTo(cx - r*0.18, cy - h*0.55, cx + r*0.08, cy - h*0.62);
    ctx.quadraticCurveTo(cx + r*0.32, cy - h*0.18, cx + brimW*0.42, cy + h*0.22);
    ctx.closePath();
    const g=ctx.createLinearGradient(cx-brimW, cy-h*0.6, cx+brimW, cy);
    g.addColorStop(0,"#2b1d12"); g.addColorStop(1,"#3d281c");
    ctx.fillStyle=g; ctx.fill();
    // band
    ctx.fillStyle="#c9a86a"; ctx.fillRect(cx - brimW*0.38, cy + h*0.02, brimW*0.76, Math.max(2, r*0.10));
    // buckle (little star)
    ctx.fillStyle="#fff6d6"; ctx.beginPath();
    const bx=cx, by=cy + h*0.07, s=r*0.10;
    for(let i=0;i<5;i++){ const a=i*1.256 - Math.PI/2; const rx=Math.cos(a)*s, ry=Math.sin(a)*s; if(i===0) ctx.moveTo(bx+rx,by+ry); else ctx.lineTo(bx+rx,by+ry); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle="#c9a86a"; ctx.lineWidth=1; ctx.stroke();
    // tip droop little
    ctx.beginPath(); ctx.arc(cx + r*0.08, cy - h*0.62, r*0.08, 0, Math.PI*2); ctx.fillStyle="#1f140f"; ctx.fill();
  }
  function drawSigilCircle(x,y,rad, rot){
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot);
    ctx.strokeStyle="rgba(43,29,18,0.22)"; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.arc(0,0,rad,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,rad*0.82,0,Math.PI*2); ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
    // inner runes
    for(let i=0;i<6;i++){ const a=i*1.047; ctx.beginPath(); ctx.moveTo(Math.cos(a)*rad*0.62, Math.sin(a)*rad*0.62); ctx.lineTo(Math.cos(a)*rad*0.72, Math.sin(a)*rad*0.72); ctx.stroke(); }
    // floral corners
    ctx.fillStyle="rgba(124,92,191,0.28)";
    for(let i=0;i<4;i++){ const a=i*1.57 + 0.78; ctx.beginPath(); ctx.arc(Math.cos(a)*rad*0.92, Math.sin(a)*rad*0.92, 2.2,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }

  // ============================================================
  // FOOD / XP MOTES (atelier: mana orbs, ink)
  // ============================================================
  function spawnFood(){
    const kind = Math.random()<0.12 ? "ink" : (Math.random()<0.22 ? "crystal" : "mote");
    const base = kind==="ink" ? "#2b1d12" : (kind==="crystal" ? "#8ab4a0" : randColor());
    return { x:rand(0,world.w), y:rand(0,world.h), color:base, kind, pulse:rand(0,Math.PI*2), xp: kind==="ink"?18: kind==="crystal"?12:6 };
  }
  function eatFood(){
    for(const b of blobs){
      if(!b.alive) continue;
      const magR = b.isPlayer && isMagnetActive() ? vortexRadius : 0;
      const rr = (b.radius + CONFIG.foodRadius+6) **2;
      for(let f=foods.length-1; f>=0; f--){
        const food=foods[f];
        // magnet vacuum
        if(magR>0 && b.isPlayer){
          const d=dist(b,food);
          if(d < magR){ const a=Math.atan2(b.y-food.y, b.x-food.x); food.x += Math.cos(a)* Math.min(9, (1-d/magR)*14); food.y += Math.sin(a)* Math.min(9, (1-d/magR)*14); }
        }
        const dx=b.x-food.x, dy=b.y-food.y;
        if(dx*dx+dy*dy < rr){
          b.mass += (food.kind==="ink"? 3.2 : food.kind==="crystal"? 1.8 : 1);
          if(b.isPlayer){ gainXP(food.xp); addPopup(b.x, b.y - b.radius, `+${food.xp}xp`, "#7c5cbf"); if(food.kind!=="mote") spawnParticles(food.x,food.y, food.color, 10); }
          foods.splice(f,1); foods.push(spawnFood());
        }
      }
    }
  }
  function gainXP(amt){
    xp += amt; statEaten++;
    while(xp >= xpToNext && pendingLevelUps < 6){
      xp -= xpToNext; level++; xpToNext = Math.floor(30 + level*14 + level*level*1.1);
      pendingLevelUps++; // queue draft
    }
    updateHUD();
    if(pendingLevelUps>0 && !isDraftOpen()) showDraft();
  }
  function isDraftOpen(){ const el=$("levelup-overlay"); return el && !el.classList.contains("hidden"); }

  // ============================================================
  // PROJECTILES + COMBAT (shooter)
  // ============================================================
  function tickProjectiles(dt){
    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];
      p.x+=p.vx; p.y+=p.vy; p.life--;
      p.trail.push({x:p.x,y:p.y, life:1});
      if(p.trail.length>6) p.trail.shift();
      for(const t of p.trail) t.life-=0.18;
      p.trail = p.trail.filter(t=>t.life>0);
      if(p.life<=0 || p.x< -40 || p.x> world.w+40 || p.y< -40 || p.y> world.h+40){ projectiles.splice(i,1); continue; }
      // collide with blobs
      for(const b of blobs){
        if(!b.alive || b===p.owner) continue;
        if(b.isPlayer && b===player && Date.now()<iFrameUntil) continue;
        if(b.isPlayer && b===player && isShielded()){
          // ward blocks: consume projectile near player
          if(dist(p,b) < b.radius + p.r + 2){
            // reflect one? just block
            spawnParticles(p.x,p.y,"#7c5cbf",10);
            if(p.pierce>0) p.pierce--; else { projectiles.splice(i,1); }
            shake=Math.max(shake,3);
            break;
          }
          continue;
        }
        if(dist(p,b) < b.radius + p.r){
          // hit
          const dmg = p.dmg * (p.kind==="ember" && p.owner && p.owner.isPlayer ? 1 : 1);
          b.mass = Math.max(10, b.mass - dmg*0.9);
          b.hpScale = Math.max(b.hpScale, b.mass + dmg);
          spawnParticles(p.x,p.y, p.color, 7);
          if(p.kind==="ember"){ // burn tick
            b._burnUntil = Date.now()+1600; b._burnDmg = 1.2;
          }
          addPopup(b.x, b.y - b.radius, `-${Math.floor(dmg)}`, p.color);
          if(p.pierce>0) p.pierce--; else { projectiles.splice(i,1); }
          // kill check
          if(b.mass <= 16){
            b.alive=false; spawnParticles(b.x,b.y,b.color,18); shake=Math.max(shake,6);
            decals.push({x:b.x,y:b.y,r:b.radius*0.9,life:1,color:"rgba(43,29,18,0.13)"});
            if(p.owner && p.owner.isPlayer){
              combo++; comboTimer=3200; showCombo();
              const bounty = Math.floor(42 + b.mass*0.6);
              gainXP(bounty); addPopup(b.x,b.y, `+${bounty}xp`, "#e8b86a");
              p.owner.mass += Math.min(14, b.mass*0.22);
              // drop ink
              for(let k=0;k<2;k++) foods.push({x:b.x+rand(-22,22), y:b.y+rand(-22,22), color:randColor(), kind:"mote", pulse:0, xp:8});
            }
            if(b.isPlayer) endGame();
          }
          break;
        }
      }
    }
    // burn DOT
    for(const b of blobs){ if(b._burnUntil && Date.now()<b._burnUntil){ if(Math.random()<0.12){ b.mass=Math.max(12,b.mass - (b._burnDmg||1)); spawnParticles(b.x+rand(-8,8), b.y+rand(-8,8), "#ff8a3d", 1); if(b.mass<=16 && b.alive){ b.alive=false; spawnParticles(b.x,b.y,b.color,14); if(b.isPlayer) endGame(); } } } else b._burnUntil=0; }
  }
  function tickWand(dt){
    if(!player || !player.alive) return;
    wandTimer -= dt;
    if(wandTimer>0) return;
    // rate scales with haste and level
    const rate = 680 * haste - Math.min(220, level*14);
    wandTimer = Math.max(180, rate);
    // auto fire 1 missile toward nearest
    let best=null, bd=560;
    for(const b of blobs){ if(b===player||!b.alive) continue; const d=dist(player,b); if(d<bd){best=b; bd=d;}}
    if(!best) return;
    const ang=Math.atan2(best.y-player.y, best.x-player.x) + rand(-0.08,0.08);
    fireProjectile(player, ang, 11.2, 11, "#d4b8ff", {life:54, kind:"wand"});
  }

  // ============================================================
  // COLLISION (touch eat kept but softened)
  // ============================================================
  function handleCollisions(){
    for(let i=0;i<blobs.length;i++) for(let j=i+1;j<blobs.length;j++){
      const a=blobs[i], b=blobs[j];
      if(!a.alive||!b.alive) continue;
      if(dist(a,b) < a.radius + b.radius){
        const big=a.mass>b.mass?a:b, small=a.mass>b.mass?b:a;
        if(big.mass > small.mass*1.22){
          if(small.isPlayer && ((small===player && isShielded()) || Date.now()<iFrameUntil)) continue;
          if(small.isPlayer && small===player && isInvisible() && Math.random()<0.55) continue; // veil dodge chance
          big.mass += small.mass*0.45; small.alive=false;
          spawnParticles(small.x,small.y,small.color,16); shake=Math.max(shake,5);
          decals.push({x:small.x,y:small.y,r:small.radius,life:1,color:"rgba(43,29,18,0.10)"});
          if(big.isPlayer){ combo++; comboTimer=3000; showCombo(); gainXP(Math.floor(34+small.mass*0.55)); addPopup(big.x,big.y - big.radius, `+${Math.floor(small.mass*0.45)}`, "#2b1d12"); }
          if(small.isPlayer) endGame();
        } else {
          // soft push apart instead of eat
          const midx=(a.x+b.x)/2, midy=(a.y+b.y)/2;
          const ax=a.x-midx, ay=a.y-midy, m=Math.hypot(ax,ay)||1;
          const push= (a.radius+b.radius - dist(a,b))*0.5 + 0.6;
          a.x+= (ax/m)*push; a.y+=(ay/m)*push; b.x-=(ax/m)*push; b.y-=(ay/m)*push;
        }
      }
    }
  }

  // ============================================================
  // UI
  // ============================================================
  function updateHUD(){
    if(player) $("mass-value").textContent=Math.floor(player.mass);
    if($("level-badge")) $("level-badge").textContent=`Lv ${level}`;
    if($("xp-fill")){
      const pct = clamp(xp / xpToNext, 0, 1)*100;
      $("xp-fill").style.width = pct+"%";
    }
  }
  function updateSpellUI(){
    SPELL_ORDER.forEach(key=>{
      const slot=document.querySelector(`.spell-slot[data-key="${key}"]`);
      const btn=document.querySelector(`.spell-btn[data-key="${key}"]`);
      if(!slot && !btn) return;
      const cd=spellCooldowns[key], onCd=cd && Date.now()<cd;
      const active=activeSpells[key] && Date.now()<activeSpells[key];
      const remain=onCd? (cd-Date.now()):0;
      const pct= onCd ? (remain / (SPELLS[key].cooldown*haste) *100) : 0;
      if(slot){ slot.style.opacity=onCd?"0.46":"1"; slot.style.setProperty("--cd", String(pct)); slot.classList.toggle("active", !!active); }
      if(btn){ btn.classList.toggle("on-cd", !!onCd); btn.style.setProperty("--cd", String(pct)); }
    });
  }
  function showCombo(){
    if(combo<2) return;
    const el=$("combo-display");
    $("combo-text").textContent=`${combo}x Combo!`;
    el.classList.remove("hidden"); clearTimeout(showCombo._t);
    showCombo._t=setTimeout(()=>el.classList.add("hidden"), 1400);
  }
  function updateLeaderboard(){
    const list=$("leaderboard-list"); if(!list) return;
    const sorted=[...blobs].filter(b=>b.alive).sort((a,b)=>b.mass-a.mass).slice(0,10);
    list.innerHTML="";
    sorted.forEach(b=>{
      const li=document.createElement("li");
      if(b.isPlayer) li.classList.add("me");
      li.innerHTML=`<span>${escapeHtml(b.name)}</span><span>${Math.floor(b.mass)}</span>`;
      list.appendChild(li);
    });
  }
  function updateMinimap(){
    const mc=$("minimap-canvas"), mctx=mc.getContext("2d"); if(!mc||!mctx) return;
    const w=mc.width, h=mc.height;
    mctx.clearRect(0,0,w,h);
    mctx.fillStyle="rgba(253,246,227,0.96)"; mctx.fillRect(0,0,w,h);
    // parchment border
    mctx.strokeStyle="rgba(43,29,18,0.18)"; mctx.lineWidth=1; mctx.strokeRect(0.5,0.5,w-1,h-1);
    const sx=w/world.w, sy=h/world.h;
    // foods as faint dots
    mctx.fillStyle="rgba(124,92,191,0.22)";
    for(let i=0;i<foods.length;i+=7){ const f=foods[i]; mctx.fillRect(f.x*sx, f.y*sy, 1,1); }
    // projectiles as tiny amber
    mctx.fillStyle="rgba(232,184,106,0.9)";
    for(const p of projectiles) mctx.fillRect(p.x*sx, p.y*sy, 1.4,1.4);
    for(const b of blobs){ if(!b.alive) continue; mctx.beginPath(); mctx.arc(b.x*sx, b.y*sy, Math.max(1.8, b.radius*sx*0.45),0,Math.PI*2); mctx.fillStyle=b.isPlayer?"#2b1d12":b.color; mctx.fill(); if(b.isPlayer){ mctx.strokeStyle="#fffaf0"; mctx.lineWidth=1; mctx.stroke(); } }
  }

  // Draft (VS)
  const DRAFT_POOL=[
    {id:"ember", icon:"🔥", name:"Ember Mastery", desc:"+1 ember per Volley, +6% burn", tag:"Offense", apply:()=>{ emberCount=Math.min(7, emberCount+1); }},
    {id:"shard", icon:"🪨", name:"Terra Heart", desc:`+2 shards, +12 max HP`, tag:"Terra", apply:()=>{ shardCount+=2; if(player) player.mass+=12; player.hpScale+=12; }},
    {id:"vortex", icon:"🌊", name:"Tide Amplifier", desc:"+32% vortex radius & pull", tag:"Control", apply:()=>{ vortexRadius*=1.32; }},
    {id:"fleet", icon:"🍃", name:"Wind Cloak", desc:"+9% move speed (stacks)", tag:"Mobility", apply:()=>{ moveBonus+=0.34; }},
    {id:"vigor", icon:"🌿", name:"Atelier Ink", desc:"Heal 22 + max HP +10", tag:"Vigor", apply:()=>{ if(player){ player.mass=Math.min(player.mass+22, player.hpScale+18); player.hpScale+=10; } }},
    {id:"haste", icon:"⏳", name:"Quick Sigil", desc:"-10% cooldowns (sigils)", tag:"Haste", apply:()=>{ haste=Math.max(0.55, haste*0.90); }},
    {id:"ward2", icon:"✨", name:"Sigil Etching", desc:"Aegis duration +0.9s", tag:"Ward", apply:()=>{ SPELLS.ward.dur+=900; }},
    {id:"magnet2", icon:"🧲", name:"Ink Well", desc:"+14 XP motes on next level", tag:"Greed", apply:()=>{ for(let i=0;i<14;i++) foods.push({x:player.x+rand(-80,80), y:player.y+rand(-80,80), color:randColor(), kind:"mote", pulse:0, xp:6}); }},
  ];
  function showDraft(){
    const overlay=$("levelup-overlay"), box=$("draft-options");
    if(!overlay||!box) return;
    // pick 3 random
    const pool=[...DRAFT_POOL].sort(()=>Math.random()-0.5).slice(0,3);
    box.innerHTML="";
    pool.forEach(card=>{
      const el=document.createElement("button");
      el.className="draft-card";
      el.innerHTML=`<div class="draft-icon">${card.icon}</div><div class="draft-meta"><strong>${card.name}</strong><small>${card.desc}</small></div><span class="draft-tag">${card.tag}</span>`;
      el.addEventListener("click", ()=>{
        card.apply();
        pendingLevelUps=Math.max(0, pendingLevelUps-1);
        overlay.classList.add("hidden");
        paused=false; lastTime=performance.now(); animationId=requestAnimationFrame(loop);
        addPopup(player.x, player.y-34, card.name, "#7c5cbf");
        spawnParticles(player.x, player.y, "#d4b8ff", 16);
        updateHUD();
        if(pendingLevelUps>0) setTimeout(showDraft, 260);
      });
      box.appendChild(el);
    });
    overlay.classList.remove("hidden");
    paused=true;
    cancelAnimationFrame(animationId);
  }

  // ============================================================
  // CAMERA
  // ============================================================
  function visibleW(){ return view.w/(view.scale*view.userZoom); }
  function visibleH(){ return view.h/(view.scale*view.userZoom); }
  function updateCamera(){
    const follow=player && player.alive ? player : (blobs.find(b=>b.isPlayer)||null);
    if(!follow) return;
    const sc=view.scale*view.userZoom;
    view.targetScale=clamp(1/Math.pow(Math.max(22,follow.mass)/30,0.23), 0.48, 1.08);
    const tx=follow.x - visibleW()/2, ty=follow.y - visibleH()/2;
    camera.x=lerp(camera.x, tx, 0.11);
    camera.y=lerp(camera.y, ty, 0.11);
    view.scale=lerp(view.scale, view.targetScale, 0.05);
  }
  function worldTransform(){
    const sc=view.scale*view.userZoom*dpr;
    const shx=(Math.random()-0.5)*shake, shy=(Math.random()-0.5)*shake;
    ctx.setTransform(sc,0,0,sc, (-camera.x+shx)*sc, (-camera.y+shy)*sc);
  }
  function screenTransform(){ ctx.setTransform(dpr,0,0,dpr,0,0); }

  // ============================================================
  // INPUT
  // ============================================================
  function getPlayerInput(){
    if(joy.active) return joy.vector;
    if(mode==="single" && !isTouch){
      const dx=mouse.x - view.w/2, dy=mouse.y - view.h/2, m=Math.hypot(dx,dy);
      return m>1?{x:dx/m,y:dy/m}:{x:0,y:0};
    }
    return {x:0,y:0};
  }
  function driveInputs(){
    if(mode==="single"){ if(player&&player.alive) player.input=getPlayerInput(); }
    else if(mode==="local2p"){
      if(players[0]&&players[0].alive) players[0].input = joy.active?joy.vector:{x:0,y:0};
      if(players[1]&&players[1].alive) players[1].input = joy2.active?joy2.vector:{x:0,y:0};
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  function drawAtelierGrid(){
    const sx=view.scale*view.userZoom;
    const left=camera.x-60, top=camera.y-60, right=camera.x+visibleW()+60, bottom=camera.y+visibleH()+60;
    // parchment wash
    ctx.fillStyle="#fdf6e3"; ctx.fillRect(left,top,right-left,bottom-top);
    // subtle watercolor blots (procedural)
    ctx.fillStyle="rgba(212,184,255,0.07)"; ctx.beginPath(); ctx.ellipse(world.w*0.28, world.h*0.32, 520, 380, 0.12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(232,184,106,0.06)"; ctx.beginPath(); ctx.ellipse(world.w*0.72, world.h*0.70, 620, 440, -0.18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(138,180,160,0.06)"; ctx.beginPath(); ctx.ellipse(world.w*0.62, world.h*0.22, 460, 320, 0.22, 0, Math.PI*2); ctx.fill();
    // ink grid
    ctx.strokeStyle="rgba(43,29,18,0.06)"; ctx.lineWidth=1/sx;
    const g=120;
    ctx.beginPath();
    for(let x=Math.floor(left/g)*g; x<=right; x+=g){ ctx.moveTo(x,top); ctx.lineTo(x,bottom); }
    for(let y=Math.floor(top/g)*g; y<=bottom; y+=g){ ctx.moveTo(left,y); ctx.lineTo(right,y); }
    ctx.stroke();
    // fine 60 grid lighter
    ctx.strokeStyle="rgba(43,29,18,0.03)"; ctx.lineWidth=1/sx;
    const g2=60;
    ctx.beginPath();
    for(let x=Math.floor(left/g2)*g2; x<=right; x+=g2){ ctx.moveTo(x,top); ctx.lineTo(x,bottom); }
    for(let y=Math.floor(top/g2)*g2; y<=bottom; y+=g2){ ctx.moveTo(left,y); ctx.lineTo(right,y); }
    ctx.stroke();
    // world border — ink frame with corner sigils
    ctx.strokeStyle="#2b1d12"; ctx.lineWidth=3/sx; ctx.strokeRect(0,0,world.w,world.h);
    ctx.strokeStyle="rgba(43,29,18,0.14)"; ctx.lineWidth=10/sx; ctx.strokeRect(-5, -5, world.w+10, world.h+10);
    const corners=[[0,0],[world.w,0],[0,world.h],[world.w,world.h]];
    for(const [cx,cy] of corners){
      ctx.save(); ctx.translate(cx,cy);
      ctx.strokeStyle="rgba(124,92,191,0.22)"; ctx.lineWidth=1.2/sx;
      ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle="rgba(201,168,106,0.9)"; ctx.beginPath(); ctx.arc(0,0,2.2,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
  function inView(x,y,r){ return x+r>camera.x && x-r<camera.x+visibleW() && y+r>camera.y && y-r<camera.y+visibleH(); }
  function drawFoodList(list){
    const t=performance.now()*0.0015;
    for(const f of list){
      const fx=f[0]!==undefined?f[0]:f.x, fy=f[1]!==undefined?f[1]:f.y, fc=f[2]!==undefined?f[2]:f.color;
      if(!inView(fx,fy,20)) continue;
      const pulse = Math.sin(t*1.9 + (f.pulse||0))*1.2;
      // outer glow
      ctx.beginPath(); ctx.arc(fx,fy, CONFIG.foodRadius+3+pulse*0.4, 0, Math.PI*2);
      ctx.fillStyle= f.kind==="ink" ? "rgba(43,29,18,0.14)" : (f.kind==="crystal" ? "rgba(138,180,160,0.22)" : "rgba(212,184,255,0.18)");
      ctx.fill();
      ctx.beginPath(); ctx.arc(fx,fy, CONFIG.foodRadius + (f.kind==="ink"?1:0), 0, Math.PI*2);
      ctx.fillStyle=fc; ctx.fill();
      ctx.strokeStyle="rgba(43,29,18,0.18)"; ctx.lineWidth=1; ctx.stroke();
      if(f.kind==="crystal"){
        ctx.fillStyle="rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(fx-1.5,fy-1.5,1.4,0,Math.PI*2); ctx.fill();
      }
      if(f.kind==="ink"){
        // little bottle highlight
        ctx.fillStyle="rgba(255,255,255,0.22)"; ctx.fillRect(fx-2, fy-4, 1.2, 3);
      }
    }
  }
  function drawProjectiles(){
    for(const p of projectiles){
      if(!inView(p.x,p.y, 24)) continue;
      // trail
      for(const tr of p.trail){ ctx.globalAlpha=tr.life*0.22; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(tr.x,tr.y, p.r*0.55,0,Math.PI*2); ctx.fill(); }
      ctx.globalAlpha=1;
      // core
      ctx.beginPath(); ctx.arc(p.x,p.y, p.r, 0, Math.PI*2);
      const g=ctx.createRadialGradient(p.x-1,p.y-1, p.r*0.2, p.x,p.y, p.r);
      g.addColorStop(0,"#fffaf0"); g.addColorStop(1,p.color);
      ctx.fillStyle=g; ctx.fill();
      ctx.strokeStyle="rgba(43,29,18,0.22)"; ctx.lineWidth=1; ctx.stroke();
      if(p.kind==="shard"){
        ctx.fillStyle="rgba(43,29,18,0.18)"; ctx.beginPath(); ctx.moveTo(p.x, p.y-p.r); ctx.lineTo(p.x+p.r*0.6,p.y+p.r*0.5); ctx.lineTo(p.x-p.r*0.6,p.y+p.r*0.5); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha=1;
  }
  function drawDecals(){
    for(const d of decals){
      ctx.globalAlpha=d.life*0.9;
      if(d.sigil){
        drawSigilCircle(d.x,d.y,d.r, d.rot + gameTime*0.0006);
      } else {
        ctx.fillStyle=d.color; ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(43,29,18,0.10)"; ctx.lineWidth=1; ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
  }
  function drawParticlesList(){
    for(const p of particles){ ctx.globalAlpha=p.life; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1;
  }
  function drawPopups(){
    ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font="800 16px system-ui, sans-serif";
    for(const p of popups){ ctx.globalAlpha=p.life; ctx.fillStyle=p.color; ctx.strokeStyle="rgba(253,246,227,0.9)"; ctx.lineWidth=3; ctx.strokeText(p.text,p.x,p.y); ctx.fillText(p.text,p.x,p.y); }
    ctx.globalAlpha=1;
  }
  function drawJoystick(){
    if(!joy.active && !joy2.active) return;
    screenTransform();
    if(joy.active){
      ctx.beginPath(); ctx.arc(joy.ox,joy.oy,joy.maxR,0,Math.PI*2); ctx.fillStyle="rgba(253,246,227,0.72)"; ctx.fill();
      ctx.lineWidth=1.5; ctx.strokeStyle="#2b1d12"; ctx.stroke();
      ctx.beginPath(); ctx.arc(joy.ox,joy.oy,joy.maxR*0.22,0,Math.PI*2); ctx.strokeStyle="rgba(43,29,18,0.18)"; ctx.stroke();
      const kx=joy.ox+joy.vector.x*joy.maxR, ky=joy.oy+joy.vector.y*joy.maxR;
      ctx.beginPath(); ctx.arc(kx,ky,26,0,Math.PI*2); ctx.fillStyle="#fffaf0"; ctx.fill(); ctx.strokeStyle="#2b1d12"; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle="#2b1d12"; ctx.font="14px system-ui"; ctx.textAlign="center"; ctx.fillText("✦", kx, ky+5);
    }
    if(joy2.active){
      ctx.beginPath(); ctx.arc(joy2.ox,joy2.oy,joy2.maxR,0,Math.PI*2); ctx.fillStyle="rgba(255,224,232,0.72)"; ctx.fill();
      ctx.lineWidth=1.5; ctx.strokeStyle="#2b1d12"; ctx.stroke();
      const kx=joy2.ox+joy2.vector.x*joy2.maxR, ky=joy2.oy+joy2.vector.y*joy2.maxR;
      ctx.beginPath(); ctx.arc(kx,ky,26,0,Math.PI*2); ctx.fillStyle="#fff0f4"; ctx.fill(); ctx.strokeStyle="#2b1d12"; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle="#c94a6a"; ctx.font="14px system-ui"; ctx.textAlign="center"; ctx.fillText("❋", kx, ky+5);
    }
  }

  function loop(ts){
    if(!running||paused) return;
    const dt = Math.min(32, ts - lastTime); lastTime=ts; gameTime+=dt;
    if(comboTimer>0){ comboTimer-=dt; if(comboTimer<=0) combo=0; }
    if(shake>0) shake=Math.max(0, shake - dt*0.02);

    if(mode==="net"){
      sendNetInput();
      // still tick projectiles locally for juice (non-authoritative)
      tickProjectiles(dt);
      tickWand(dt);
    } else {
      driveInputs();
      for(const b of blobs) b.update(dt);
      eatFood(); handleCollisions();
      tickProjectiles(dt);
      tickWand(dt);
    }
    updateParticles(dt);
    if(player&&player.alive){
      trails.push({x:player.x,y:player.y,life:1});
      if(trails.length>14) trails.shift();
    }
    for(const t of trails) t.life-=0.06;
    trails=trails.filter(t=>t.life>0);
    updateCamera();
    updateSpellUI();

    screenTransform(); ctx.clearRect(0,0,view.w,view.h);
    worldTransform();
    drawAtelierGrid();
    drawDecals();
    drawFoodList(foods);
    if(trails.length>1){
      ctx.strokeStyle="rgba(124,92,191,0.14)"; ctx.lineWidth= player? player.radius*0.72:18; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(trails[0].x,trails[0].y);
      for(const t of trails) ctx.lineTo(t.x,t.y); ctx.stroke();
    }
    const sorted=[...blobs].filter(b=>b.alive).sort((a,b)=>a.mass-b.mass);
    for(const b of sorted) if(inView(b.x,b.y,b.radius+40)) b.draw();
    drawProjectiles();
    drawParticlesList(); drawPopups();
    drawJoystick();

    if(player) statMaxPower=Math.max(statMaxPower, Math.floor(player.mass));
    updateHUD(); updateLeaderboard(); updateMinimap();

    if(mode==="net" && net.self){
      if(!net.self.alive) $("respawn-overlay").classList.remove("hidden");
      else $("respawn-overlay").classList.add("hidden");
    }
    animationId=requestAnimationFrame(loop);
  }

  // ============================================================
  // START / END
  // ============================================================
  function addPlayer(name,color){
    const p=new Blob(rand(220,world.w-220), rand(220,world.h-220), CONFIG.startMass, color, name, true);
    players.push(p); blobs.push(p); if(!player) player=p; return p;
  }
  function startGame(selMode){
    mode=selMode;
    let bc=CONFIG.botCount[difficulty]||18, fc=CONFIG.foodCount[difficulty]||560;
    world= selMode==="local2p" ? {w:2600,h:2600} : {...CONFIG.world};
    if(selMode==="local2p"){ bc=Math.max(8, Math.floor(bc*0.62)); fc=Math.floor(fc*0.62); }
    foods=[]; for(let i=0;i<fc;i++) foods.push(spawnFood());
    blobs=[]; players=[]; player=null; combo=0; gameTime=0;
    statEaten=statSpells=statMaxPower=0; activeSpells={}; spellCooldowns={}; particles=[]; popups=[]; trails=[]; projectiles=[]; decals=[];
    xp=0; level=1; xpToNext=30; emberCount=3; shardCount=8; vortexRadius=210; moveBonus=0; haste=1; wandTimer=0; pendingLevelUps=0; iFrameUntil=0;
    const names=["Vortex","Nibbler","Gloop","Bubbles","Chonk","Spike","Wobble","Pixel","Munch","Doom","Zoom","Ghost","Comet","Tank","Echo","Blaze","Quark","Tofu","Hex","Curse","Brew","Grimoire","Cauldron","Phantom","Specter","Rune","Cackle","Moonpetal","Silksong","Isadora","Lace","Needle","Atelier"];
    for(let i=0;i<bc;i++) blobs.push(new Blob(rand(0,world.w), rand(0,world.h), rand(20,110), randColor(), names[i%names.length]));
    const n1=($("name-input").value||"Witch").trim().slice(0,16)||"Witch";
    addPlayer(n1, "#d4b8ff");
    if(selMode==="local2p") addPlayer(($("name-input-2").value||"Warlock").trim().slice(0,16)||"Warlock", "#ff8ab0");
    camera={x:world.w/2 - visibleW()/2, y:world.h/2 - visibleH()/2};
    view.scale=1; view.targetScale=1; view.userZoom=1;
    $("start-screen").classList.add("hidden"); $("end-screen").classList.add("hidden");
    $("respawn-overlay").classList.add("hidden"); $("hud").classList.remove("hidden"); $("pause-menu").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
    if(isTouch) $("mobile-controls").classList.remove("hidden");
    running=true; paused=false; lastTime=performance.now();
    cancelAnimationFrame(animationId); animationId=requestAnimationFrame(loop);
  }
  function endGame(){
    running=false;
    const m=Math.floor(gameTime/60000), s=Math.floor((gameTime%60000)/1000);
    $("final-score").textContent=Math.floor(player?player.mass:0);
    $("stat-time").textContent=`${m}:${s.toString().padStart(2,"0")}`;
    $("stat-eaten").textContent=statEaten; $("stat-spells").textContent=statSpells; $("stat-max").textContent=statMaxPower;
    $("end-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
  }

  // ============================================================
  // NET (hosted GameServer)
  // ============================================================
  function witchConnect(url){
    try{
      mode="net";
      net.ws=new WebSocket(url);
      net.ws.onopen=()=>{
        net.connected=true;
        const name=($("name-input").value||"Witch").trim().slice(0,16)||"Witch";
        net.ws.send(JSON.stringify({type:"join", name, color:"#d4b8ff"}));
      };
      net.ws.onmessage=(ev)=>{
        let msg; try{msg=JSON.parse(ev.data);}catch{return;}
        if(msg.type==="welcome"){
          net.id=msg.id; world={w:msg.world.w, h:msg.world.h};
          $("start-screen").classList.add("hidden"); $("end-screen").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
          $("hud").classList.remove("hidden");
          if(isTouch) $("mobile-controls").classList.remove("hidden");
          camera={x:world.w/2 - visibleW()/2, y:world.h/2 - visibleH()/2};
          running=true; paused=false; lastTime=performance.now();
          cancelAnimationFrame(animationId); animationId=requestAnimationFrame(loop);
        } else if(msg.type==="state"){
          world={w:msg.world.w, h:msg.world.h};
          net.foods=msg.foods||[];
          const seen=new Set();
          for(const b of (msg.blobs||[])){
            seen.add(b.id);
            let blob=net.byId.get(b.id);
            if(!blob){ blob=new Blob(b.x,b.y,b.m,b.c,b.n,b.id===net.id); net.byId.set(b.id, blob); }
            blob.x=b.x; blob.y=b.y; blob.mass=b.m; blob.color=b.c; blob.name=b.n; blob.alive=b.a===1; blob.isPlayer=b.id===net.id;
            blob.hpScale=Math.max(blob.hpScale||b.m, b.m);
          }
          for(const id of [...net.byId.keys()]) if(!seen.has(id)) net.byId.delete(id);
          blobs=[...net.byId.values()];
          foods=net.foods.map(f=>Array.isArray(f)?{x:f[0],y:f[1],color:f[2], kind:"mote", pulse:0, xp:6}:f);
          player=net.self=net.byId.get(net.id)||null;
        }
      };
      net.ws.onclose=()=>{ net.connected=false; if(mode==="net"){ running=false; const el=$("conn-status"); if(el) el.textContent="Disconnected."; } };
    }catch(e){ const el=$("conn-status"); if(el) el.textContent="Connect failed: "+e.message; }
  }
  function sendNetInput(){
    if(!net.ws||net.ws.readyState!==1||!player) return;
    const now=Date.now(); if(now - net.lastSent < 50) return; net.lastSent=now;
    const inp=getPlayerInput();
    net.ws.send(JSON.stringify({type:"input", x:+inp.x.toFixed(3), y:+inp.y.toFixed(3)}));
  }
  window.witchConnect=witchConnect;

  // ============================================================
  // RESIZE
  // ============================================================
  function resize(){
    dpr=Math.min(window.devicePixelRatio||1, 2.5);
    view.w=window.innerWidth; view.h=window.innerHeight;
    canvas.style.width=view.w+"px"; canvas.style.height=view.h+"px";
    canvas.width=Math.floor(view.w*dpr); canvas.height=Math.floor(view.h*dpr);
    joy.maxR=clamp(Math.min(view.w,view.h)*0.16,56,90); joy.dead=joy.maxR*0.18;
    joy2.maxR=joy.maxR; joy2.dead=joy.dead;
  }
  window.addEventListener("resize", resize);

  // ============================================================
  // POINTER (joystick + pinch)
  // ============================================================
  function setJoyFromPointer(t){
    let dx=t.clientX - joy.ox, dy=t.clientY - joy.oy;
    const d=Math.hypot(dx,dy);
    if(d < joy.dead){ joy.vector.x=0; joy.vector.y=0; return; }
    const norm=(Math.min(d,joy.maxR)-joy.dead)/(joy.maxR-joy.dead);
    const curve=norm*norm;
    const ux=dx/(d||1), uy=dy/(d||1);
    joy.vector.x=ux*curve; joy.vector.y=uy*curve;
  }
  function setJoy2FromPointer(e){
    const dx=e.clientX - joy2.ox, dy=e.clientY - joy2.oy;
    const d=Math.hypot(dx,dy), norm=Math.min(d,joy2.maxR)/joy2.maxR;
    if(norm*joy2.maxR < joy2.dead){ joy2.vector.x=0; joy2.vector.y=0; return; }
    const curve=norm*norm;
    const ux=dx/(d||1), uy=dy/(d||1);
    joy2.vector.x=ux*curve; joy2.vector.y=uy*curve;
  }
  canvas.addEventListener("pointerdown", (e)=>{
    if(mode==="net" && (!player||!player.alive)) return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2) return;
    const isRight=e.clientX >= view.w*0.5;
    const is2P=mode==="local2p";
    if(isRight && is2P && !joy2.active){
      joy2.active=true; joy2.id=e.pointerId; joy2.ox=e.clientX; joy2.oy=e.clientY; joy2.vector.x=0; joy2.vector.y=0;
      try{canvas.setPointerCapture(e.pointerId);}catch{} e.preventDefault();
    } else if(!isRight && !joy.active){
      joy.active=true; joy.id=e.pointerId; joy.ox=e.clientX; joy.oy=e.clientY; joy.vector.x=0; joy.vector.y=0;
      try{canvas.setPointerCapture(e.pointerId);}catch{} e.preventDefault();
    } else if(mode==="single" && !isTouch){
      mouse.x=e.clientX; mouse.y=e.clientY;
    }
  });
  canvas.addEventListener("pointermove",(e)=>{
    if(pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(joy.active && e.pointerId===joy.id){ setJoyFromPointer(e); e.preventDefault(); return; }
    if(joy2.active && e.pointerId===joy2.id){ setJoy2FromPointer(e); e.preventDefault(); return; }
    if(pointers.size===2){
      const pts=[...pointers.values()];
      const d=Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      if(pinchLast>0) view.userZoom=clamp(view.userZoom*(d/pinchLast),0.6,1.8);
      pinchLast=d; return;
    }
    if(mode==="single" && !isTouch && !joy.active){ mouse.x=e.clientX; mouse.y=e.clientY; }
  });
  let pinchLast=0;
  function endPointer(e){
    pointers.delete(e.pointerId);
    if(pointers.size<2) pinchLast=0;
    if(joy.active && e.pointerId===joy.id){ joy.active=false; joy.id=null; joy.vector.x=0; joy.vector.y=0; if(mode==="single"&&player) player.input={x:0,y:0}; }
    if(joy2.active && e.pointerId===joy2.id){ joy2.active=false; joy2.id=null; joy2.vector.x=0; joy2.vector.y=0; }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", endPointer);
  canvas.style.touchAction="none";

  // ============================================================
  // KEYBOARD
  // ============================================================
  document.addEventListener("keydown",(e)=>{
    if(!running) return;
    if(isDraftOpen()) return;
    if(mode==="net" && (!player||!player.alive)) return;
    switch(e.key.toLowerCase()){
      case "q": castSpell("surge"); break;
      case "e": castSpell("ward"); break;
      case "r": castSpell("magnet"); break;
      case "f": castSpell("blast"); break;
      case " ": castSpell("dash"); e.preventDefault(); break;
      case "v": castSpell("vanish"); break;
      case "escape": case "p": togglePause(); break;
    }
  });
  SPELL_ORDER.forEach(key=>{
    const btn=document.querySelector(`.spell-btn[data-key="${key}"]`);
    if(btn) btn.addEventListener("pointerdown",(e)=>{ e.preventDefault(); if(isDraftOpen()) return; castSpell(key); });
  });
  function togglePause(){
    if(isDraftOpen()) return;
    paused=!paused;
    $("pause-menu").classList.toggle("hidden", !paused);
    if(!paused){ lastTime=performance.now(); animationId=requestAnimationFrame(loop); }
  }
  $("resume-btn")?.addEventListener("click", togglePause);
  $("quit-btn")?.addEventListener("click", ()=>{
    running=false; paused=false;
    if(net.ws) try{net.ws.close();}catch{}
    $("pause-menu").classList.add("hidden"); $("end-screen").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
    $("start-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden");
  });
  $("play-solo")?.addEventListener("click", ()=>startGame("single"));
  $("play-duo")?.addEventListener("click", ()=>startGame("local2p"));
  $("play-online")?.addEventListener("click", ()=>$("online-options").classList.toggle("hidden"));
  $("connect-online-btn")?.addEventListener("click", ()=>{
    const url=($("server-input").value||"ws://127.0.0.1:3000").trim();
    witchConnect(url);
  });
  $("restart-btn")?.addEventListener("click", ()=>{
    $("end-screen").classList.add("hidden"); $("start-screen").classList.remove("hidden");
  });
  document.querySelectorAll(".diff-btn").forEach(b=>b.addEventListener("click", ()=>{
    document.querySelectorAll(".diff-btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); difficulty=b.dataset.diff;
  }));
  $("name-input")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") startGame("single"); });
  $("name-input-2")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") startGame("local2p"); });

  resize(); updateSpellUI(); updateHUD();
})();
