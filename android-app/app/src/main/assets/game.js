/**
 * Witch.io — Atelier Arena v3
 * Vampire Survivors auto-fire + Magica.io element combos + Soul Knight dodge + Witch Hat Atelier ink visuals
 * Auto-attack weapons, magnetic XP gems, weapon evolution, element discovery, screen shake, floating damage
 */
(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================
  const C = {
    world: { w: 4000, h: 4000 },
    startHP: 100, startEnergy: 100, energyRegen: 0.15,
    dodgeCooldown: 1500, dodgeDist: 200, dodgeDur: 280, dodgeIFrames: 400,
    shieldMax: 50, shieldRegen: 0.04, shieldDelay: 3000,
    xpBase: 15, xpScale: 1.22,
    xpMagnetRange: 120, xpMagnetSpeed: 8,
    runDuration: 600000,
    waveInterval: 8000, bossInterval: 120000,
    foodCount: { easy: 300, medium: 250, hard: 200 },
    spawnRadius: 900,
    maxWeapons: 6, maxPassives: 6,
    weaponLevelMax: 8,
    colors: {
      fire: "#ff4444", fireGlow: "rgba(255,68,68,0.4)",
      water: "#4da6ff", waterGlow: "rgba(77,166,255,0.4)",
      earth: "#8b6914", earthGlow: "rgba(139,105,20,0.4)",
      shadow: "#9b59b6", shadowGlow: "rgba(155,89,182,0.4)",
      lightning: "#f1c40f", lightningGlow: "rgba(241,196,15,0.4)",
      meteor: "#e67e22", meteorGlow: "rgba(230,126,34,0.4)",
      ice: "#00bcd4", iceGlow: "rgba(0,188,212,0.4)",
      void: "#8e44ad", voidGlow: "rgba(142,68,173,0.4)",
    },
  };

  // ============================================================
  // ELEMENT DEFINITIONS
  // ============================================================
  const ELEMENTS = {
    fire: { name: "Fire", icon: "🔥", color: C.colors.fire, glow: C.colors.fireGlow, desc: "Burns foes over time" },
    water: { name: "Water", icon: "💧", color: C.colors.water, glow: C.colors.waterGlow, desc: "Freezes and slows" },
    earth: { name: "Earth", icon: "🌍", color: C.colors.earth, glow: C.colors.earthGlow, desc: "Heavy hits, stuns" },
    shadow: { name: "Shadow", icon: "🌑", color: C.colors.shadow, glow: C.colors.shadowGlow, desc: "Pierces, drains life" },
    lightning: { name: "Lightning", icon: "⚡", color: C.colors.lightning, glow: C.colors.lightningGlow, desc: "Fire+Water" },
    meteor: { name: "Meteor", icon: "☄️", color: C.colors.meteor, glow: C.colors.meteorGlow, desc: "Fire+Earth" },
    ice: { name: "Ice", icon: "❄️", color: C.colors.ice, glow: C.colors.iceGlow, desc: "Water+Earth" },
    void: { name: "Void", icon: "🕳️", color: C.colors.void, glow: C.colors.voidGlow, desc: "Fire+Shadow" },
  };

  // ============================================================
  // WEAPON DEFINITIONS (auto-fire, level-scaled)
  // ============================================================
  const WEAPON_DEFS = {
    // FIRE weapons
    flameOrbit: {
      name: "Flame Orbit", icon: "🔥", element: "fire",
      desc: "Orbiting flames that burn",
      baseDmg: 8, baseCd: 800, baseArea: 90, baseCount: 2, basePierce: 1,
      projSpeed: 0, orbit: true, dot: { dmg: 2, dur: 2000 },
      evolve: { into: "flameDragon", needsElement: "fire" },
    },
    flameDragon: {
      name: "Flame Dragon", icon: "🐉", element: "fire",
      desc: "Massive fire dragon orbits you",
      baseDmg: 18, baseCd: 600, baseArea: 140, baseCount: 3, basePierce: 99,
      projSpeed: 0, orbit: true, dot: { dmg: 5, dur: 3000 },
      evolved: true,
    },
    // WATER weapons
    tideWave: {
      name: "Tide Wave", icon: "🌊", element: "water",
      desc: "Forward wave that slows",
      baseDmg: 6, baseCd: 1200, baseArea: 120, baseCount: 1, basePierce: 3,
      projSpeed: 5, cone: true, coneAngle: 0.6, slow: { pct: 0.4, dur: 2000 },
      evolve: { into: "tsunami", needsElement: "water" },
    },
    tsunami: {
      name: "Tsunami", icon: "🌊", element: "water",
      desc: "Massive wave that freezes everything",
      baseDmg: 14, baseCd: 900, baseArea: 220, baseCount: 2, basePierce: 99,
      projSpeed: 6, cone: true, coneAngle: 1.2, slow: { pct: 0.7, dur: 3000 },
      evolved: true,
    },
    // EARTH weapons
    stonePillar: {
      name: "Stone Pillar", icon: "🪨", element: "earth",
      desc: "Pillars erupt from ground",
      baseDmg: 12, baseCd: 1500, baseArea: 60, baseCount: 1, basePierce: 1,
      projSpeed: 0, ground: true, stun: { dur: 800 },
      evolve: { into: "earthquake", needsElement: "earth" },
    },
    earthquake: {
      name: "Earthquake", icon: "🌋", element: "earth",
      desc: "Massive AoE stun around you",
      baseDmg: 25, baseCd: 2000, baseArea: 180, baseCount: 1, basePierce: 99,
      projSpeed: 0, ground: true, stun: { dur: 2000 },
      evolved: true,
    },
    // SHADOW weapons
    shadowBolt: {
      name: "Shadow Bolt", icon: "🌑", element: "shadow",
      desc: "Homing bolts that drain life",
      baseDmg: 7, baseCd: 900, baseArea: 40, baseCount: 2, basePierce: 2,
      projSpeed: 4, homing: true, lifesteal: 0.15,
      evolve: { into: "voidRift", needsElement: "shadow" },
    },
    voidRift: {
      name: "Void Rift", icon: "🕳️", element: "shadow",
      desc: "Tearing void that devours",
      baseDmg: 16, baseCd: 700, baseArea: 60, baseCount: 3, basePierce: 99,
      projSpeed: 5, homing: true, lifesteal: 0.25,
      evolved: true,
    },
    // COMBO weapons
    lightningChain: {
      name: "Lightning Chain", icon: "⚡", element: "lightning",
      desc: "Chains between enemies",
      baseDmg: 10, baseCd: 600, baseArea: 200, baseCount: 1, basePierce: 4,
      projSpeed: 12, chain: true, chainCount: 3,
    },
    meteorShower: {
      name: "Meteor Shower", icon: "☄️", element: "meteor",
      desc: "Rains meteors from above",
      baseDmg: 20, baseCd: 2000, baseArea: 80, baseCount: 3, basePierce: 2,
      projSpeed: 0, ground: true, aoe: true,
    },
    iceNova: {
      name: "Ice Nova", icon: "❄️", element: "ice",
      desc: "Freezing explosion around you",
      baseDmg: 8, baseCd: 1800, baseArea: 160, baseCount: 1, basePierce: 99,
      projSpeed: 0, nova: true, slow: { pct: 0.6, dur: 3000 },
    },
    voidStorm: {
      name: "Void Storm", icon: "🕳️", element: "void",
      desc: "Devastating void explosion",
      baseDmg: 30, baseCd: 3000, baseArea: 200, baseCount: 1, basePierce: 99,
      projSpeed: 0, nova: true,
    },
  };

  // ============================================================
  // PASSIVE DEFINITIONS
  // ============================================================
  const PASSIVES = [
    { id: "might", name: "Might", icon: "⚔️", desc: "+15% damage", apply: (p) => { p.dmgMult += 0.15; } },
    { id: "speed", name: "Haste", icon: "👟", desc: "+12% move speed", apply: (p) => { p.spdMult += 0.12; } },
    { id: "armor", name: "Armor", icon: "🛡️", desc: "+20 max HP", apply: (p) => { p.maxHP += 20; p.hp = Math.min(p.hp + 20, p.maxHP); } },
    { id: "magnet", name: "Magnet", icon: "🧲", desc: "+50% XP range", apply: (p) => { p.xpMagnetRange *= 1.5; } },
    { id: "recovery", name: "Recovery", icon: "💚", desc: "+0.2 HP/sec", apply: (p) => { p.regen += 0.2; } },
    { id: "cooldown", name: "Channeling", icon: "⏱️", desc: "-15% cooldowns", apply: (p) => { p.cdMult -= 0.15; } },
    { id: "area", name: "扩展", icon: "🔮", desc: "+20% area", apply: (p) => { p.areaMult += 0.2; } },
    { id: "luck", name: "Luck", icon: "🍀", desc: "+30% rare drops", apply: (p) => { p.luck += 0.3; } },
    { id: "greed", name: "Greed", icon: "💰", desc: "+40% XP gain", apply: (p) => { p.xpMult += 0.4; } },
    { id: "pierce", name: "Piercing", icon: "🎯", desc: "+1 pierce to all", apply: (p) => { p.pierceBonus += 1; } },
  ];

  // ============================================================
  // ENEMY TYPES
  // ============================================================
  const ENEMY_TYPES = {
    grunt: { baseHP: 25, baseDmg: 5, spd: 1.6, radius: 14, color: "#7c3aed", xp: 4 },
    ranged: { baseHP: 18, baseDmg: 7, spd: 1.2, radius: 12, color: "#ff6b3d", xp: 5, shootCd: 2000, shootSpd: 4 },
    tank: { baseHP: 60, baseDmg: 10, spd: 0.9, radius: 20, color: "#8b6914", xp: 8 },
    swarm: { baseHP: 12, baseDmg: 3, spd: 2.4, radius: 8, color: "#4da6ff", xp: 2 },
    boss: { baseHP: 400, baseDmg: 15, spd: 1.0, radius: 35, color: "#ff4444", xp: 50 },
  };

  const BOSS_NAMES = ["Void Witch", "Shadow Lord", "Flame Serpent", "Frost Giant", "Stone Golem", "Storm Caller"];
  const ENEMY_NAMES = ["Goblin", "Slime", "Imp", "Wisp", "Shade", "Creep", "Blight", "Murk", "Thorn", "Rift", "Dusk", "Ember"];

  // ============================================================
  // UTILITY
  // ============================================================
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

  function randName() { return ENEMY_NAMES[randInt(0, ENEMY_NAMES.length - 1)]; }
  function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = randInt(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  // ============================================================
  // CANVAS + DPR
  // ============================================================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let dpr = window.devicePixelRatio || 1;
  const view = { w: 0, h: 0, scale: 1, targetScale: 1, userZoom: 1 };
  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    view.w = window.innerWidth; view.h = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ============================================================
  // STATE
  // ============================================================
  let mode = "single", running = false, paused = false, difficulty = "easy";
  let gameTime = 0, runTimer = 0, waveNum = 0, waveTimer = 0, bossTimer = 0;
  let nextBossId = 1;
  let statKills = 0, statMaxCombo = 0;
  let xp = 0, level = 1, xpToNext = C.xpBase, pendingLevelUps = 0;
  let animationId = 0, lastTime = 0;
  let screenShake = 0;

  const camera = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0 };
  const joy = { active: false, sx: 0, sy: 0, cx: 0, cy: 0, vector: { x: 0, y: 0 } };
  const pointers = new Map();
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

  let world = { ...C.world };
  let player = null;
  let enemies = [];
  let projectiles = [];
  let xpGems = [];
  let particles = [];
  let popups = [];
  let decals = [];
  let enemyProjectiles = [];

  // ============================================================
  // PLAYER
  // ============================================================
  class Player {
    constructor(x, y, name, color) {
      this.x = x; this.y = y; this.name = name; this.color = color;
      this.radius = 22; this.hp = C.startHP; this.maxHP = C.startHP;
      this.energy = C.startEnergy; this.maxEnergy = C.startEnergy;
      this.shield = C.shieldMax; this.maxShield = C.shieldMax;
      this.shieldTimer = 0;
      this.alive = true; this.input = { x: 0, y: 0 };
      this.wobble = 0; this.speed = 3.2;
      this.spdMult = 1; this.dmgMult = 1; this.cdMult = 1; this.areaMult = 1;
      this.pierceBonus = 0; this.regen = 0; this.luck = 0; this.xpMult = 1;
      this.xpMagnetRange = C.xpMagnetRange;
      this.weapons = []; this.passives = [];
      this.elements = {};
      this.iFrameUntil = 0; this.dodgeUntil = 0; this.dodgeCooldownUntil = 0;
      this._lastAngle = 0;
    }
    get speedVal() { return this.speed * this.spdMult; }
    addWeapon(id) {
      if (this.weapons.length >= C.maxWeapons) return false;
      const existing = this.weapons.find(w => w.id === id);
      if (existing) { if (existing.level < C.weaponLevelMax) { existing.level++; return true; } return false; }
      this.weapons.push({ id, level: 1, timer: 0, ...WEAPON_DEFS[id] });
      return true;
    }
    addPassive(id) {
      if (this.passives.length >= C.maxPassives) return false;
      if (this.passives.includes(id)) return false;
      const def = PASSIVES.find(p => p.id === id);
      if (def) { def.apply(this); this.passives.push(id); return true; }
      return false;
    }
    addElement(el) { this.elements[el] = (this.elements[el] || 0) + 1; this.checkCombos(); }
    checkCombos() {
      const e = this.elements;
      if (e.fire && e.water && !this.weapons.find(w => w.id === "lightningChain")) this.addWeapon("lightningChain");
      if (e.fire && e.earth && !this.weapons.find(w => w.id === "meteorShower")) this.addWeapon("meteorShower");
      if (e.water && e.earth && !this.weapons.find(w => w.id === "iceNova")) this.addWeapon("iceNova");
      if (e.fire && e.shadow && !this.weapons.find(w => w.id === "voidStorm")) this.addWeapon("voidStorm");
    }
    heal(amt) { this.hp = Math.min(this.maxHP, this.hp + amt); }
    takeDamage(dmg) {
      if (Date.now() < this.iFrameUntil) return;
      let actual = dmg;
      if (this.shield > 0) { const blocked = Math.min(this.shield, dmg * 0.8); this.shield -= blocked; actual -= blocked; this.shieldTimer = C.shieldDelay; }
      this.hp -= actual;
      screenShake = Math.min(12, screenShake + actual * 0.3);
      addPopup(this.x, this.y - 30, `-${Math.floor(actual)}`, "#ff4444");
      spawnParticles(this.x, this.y, "#ff4444", 6);
      if (this.hp <= 0) { this.hp = 0; this.alive = false; endGame(); }
    }
    update(dt) {
      if (!this.alive) return;
      const spd = this.speedVal * (dt / 16);
      this.x += this.input.x * spd; this.y += this.input.y * spd;
      this.x = clamp(this.x, 30, world.w - 30);
      this.y = clamp(this.y, 30, world.h - 30);
      this.wobble += dt * 0.008;
      if (this.input.x !== 0 || this.input.y !== 0) this._lastAngle = Math.atan2(this.input.y, this.input.x);
      if (this.regen > 0) this.hp = Math.min(this.maxHP, this.hp + this.regen * dt / 1000);
      if (this.shieldTimer > 0) { this.shieldTimer -= dt; } else { this.shield = Math.min(this.maxShield, this.shield + C.shieldRegen * dt / 10); }
      for (const w of this.weapons) { w.timer -= dt; if (w.timer <= 0) { this.fireWeapon(w); w.timer = w.baseCd * this.cdMult * (0.9 + Math.random() * 0.2); } }
    }
    fireWeapon(w) {
      const count = w.baseCount + Math.floor(w.level / 3);
      const dmg = w.baseDmg * (1 + (w.level - 1) * 0.12) * this.dmgMult;
      const area = w.baseArea * this.areaMult * (1 + (w.level - 1) * 0.04);
      const pierce = w.basePierce + this.pierceBonus;
      const ang = this._lastAngle;
      if (w.orbit) {
        for (let i = 0; i < count; i++) {
          const oAng = (Math.PI * 2 / count) * i + gameTime * 0.002;
          projectiles.push({ x: this.x + Math.cos(oAng) * area, y: this.y + Math.sin(oAng) * area, vx: 0, vy: 0, dmg, radius: 8 + w.level, life: 999, pierce, element: w.element, orbit: true, orbitAngle: oAng, orbitArea: area, weapon: w, owner: "player" });
        }
      } else if (w.cone) {
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * w.coneAngle;
          const a = ang + spread;
          projectiles.push({ x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 30, vx: Math.cos(a) * w.projSpeed, vy: Math.sin(a) * w.projSpeed, dmg, radius: 12 + w.level * 2, life: 600, pierce, element: w.element, weapon: w, owner: "player", slow: w.slow });
        }
      } else if (w.ground) {
        for (let i = 0; i < count; i++) {
          const ox = rand(-area * 0.5, area * 0.5), oy = rand(-area * 0.5, area * 0.5);
          projectiles.push({ x: this.x + ox, y: this.y + oy, vx: 0, vy: 0, dmg, radius: 14 + w.level * 2, life: 400, pierce, element: w.element, weapon: w, owner: "player", aoe: true, aoeRadius: area * 0.6 });
        }
      } else if (w.nova) {
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 / count) * i;
          projectiles.push({ x: this.x, y: this.y, vx: Math.cos(a) * (w.projSpeed || 5), vy: Math.sin(a) * (w.projSpeed || 5), dmg, radius: 16 + w.level * 2, life: 500, pierce: 99, element: w.element, weapon: w, owner: "player", nova: true });
        }
      } else if (w.homing) {
        const targets = enemies.filter(e => e.alive).sort((a, b) => dist(this, a) - dist(this, b)).slice(0, count);
        for (const t of targets) {
          const a = Math.atan2(t.y - this.y, t.x - this.x);
          projectiles.push({ x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 20, vx: Math.cos(a) * w.projSpeed, vy: Math.sin(a) * w.projSpeed, dmg, radius: 6 + w.level, life: 1200, pierce, element: w.element, weapon: w, owner: "player", homing: true, homingTarget: t, lifesteal: w.lifesteal || 0 });
        }
      } else if (w.chain) {
        const targets = enemies.filter(e => e.alive).sort((a, b) => dist(this, a) - dist(this, b)).slice(0, 1);
        if (targets.length > 0) {
          const t = targets[0];
          projectiles.push({ x: this.x, y: this.y, vx: 0, vy: 0, dmg, radius: 4, life: 300, pierce: 1, element: w.element, weapon: w, owner: "player", chain: true, chainTarget: t, chainCount: w.chainCount + Math.floor(w.level / 2), chainHits: [] });
        }
      } else {
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 0.3;
          const a = ang + spread;
          projectiles.push({ x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 20, vx: Math.cos(a) * (w.projSpeed || 5), vy: Math.sin(a) * (w.projSpeed || 5), dmg, radius: 6 + w.level, life: 800, pierce, element: w.element, weapon: w, owner: "player" });
        }
      }
    }
  }

  // ============================================================
  // ENEMY
  // ============================================================
  class Enemy {
    constructor(x, y, hp, dmg, spd, color, name, type) {
      this.x = x; this.y = y; this.hp = hp; this.maxHP = hp;
      this.dmg = dmg; this.spd = spd; this.color = color;
      this.name = name; this.type = type;
      this.radius = ENEMY_TYPES[type]?.radius || 14;
      this.alive = true; this.wobble = Math.random() * Math.PI * 2;
      this.xp = ENEMY_TYPES[type]?.xp || 4;
      this.shootTimer = ENEMY_TYPES[type]?.shootCd || 99999;
      this.stunUntil = 0; this.slowUntil = 0; this.slowPct = 0;
      this.burnUntil = 0; this.burnDmg = 0;
    }
    takeDamage(dmg, element) {
      this.hp -= dmg;
      if (element === "fire") { this.burnUntil = Date.now() + 2000; this.burnDmg = dmg * 0.3; }
      if (element === "water" || element === "ice") { this.slowUntil = Date.now() + 2000; this.slowPct = 0.5; }
      if (element === "earth") { this.stunUntil = Date.now() + 600; }
      spawnParticles(this.x, this.y, ELEMENTS[element]?.color || this.color, 4);
      addPopup(this.x, this.y - this.radius - 8, Math.floor(dmg).toString(), ELEMENTS[element]?.color || "#fff");
      screenShake = Math.min(8, screenShake + dmg * 0.15);
      if (this.hp <= 0) { this.alive = false; this.onDeath(); }
    }
    onDeath() {
      statKills++;
      statMaxCombo = Math.max(statMaxCombo, 1);
      for (let i = 0; i < 3; i++) {
        xpGems.push({ x: this.x + rand(-15, 15), y: this.y + rand(-15, 15), value: this.xp * (player?.xpMult || 1), radius: 4 + Math.min(this.xp, 10), color: hsl(270 + this.xp * 3, 70, 60), life: 30000 });
      }
      spawnParticles(this.x, this.y, this.color, 12);
      if (this.type === "boss") { for (let i = 0; i < 8; i++) { xpGems.push({ x: this.x + rand(-30, 30), y: this.y + rand(-30, 30), value: 15 * (player?.xpMult || 1), radius: 8, color: hsl(40, 90, 65), life: 60000 }); } }
    }
    update(dt) {
      if (!this.alive) return;
      const now = Date.now();
      if (now < this.stunUntil) return;
      if (now < this.burnUntil && gameTime % 500 < dt) { this.hp -= this.burnDmg; addPopup(this.x, this.y - this.radius, Math.floor(this.burnDmg).toString(), "#ff6600"); if (this.hp <= 0) { this.alive = false; this.onDeath(); return; } }
      if (player && player.alive) {
        const a = Math.atan2(player.y - this.y, player.x - this.x);
        const spdMult = now < this.slowUntil ? (1 - this.slowPct) : 1;
        this.x += Math.cos(a) * this.spd * spdMult * (dt / 16);
        this.y += Math.sin(a) * this.spd * spdMult * (dt / 16);
        this.wobble += dt * 0.01;
        if (this.type === "ranged") {
          this.shootTimer -= dt;
          if (this.shootTimer <= 0) {
            this.shootTimer = ENEMY_TYPES.ranged.shootCd;
            const sa = Math.atan2(player.y - this.y, player.x - this.x);
            enemyProjectiles.push({ x: this.x, y: this.y, vx: Math.cos(sa) * ENEMY_TYPES.ranged.shootSpd, vy: Math.sin(sa) * ENEMY_TYPES.ranged.shootSpd, dmg: this.dmg, radius: 4, life: 1500, color: this.color });
          }
        }
        if (dist(this, player) < this.radius + player.radius - 4) { player.takeDamage(this.dmg * (dt / 500)); }
      }
    }
  }

  // ============================================================
  // SPAWNING
  // ============================================================
  function spawnWave() {
    waveNum++; waveTimer = C.waveInterval;
    const base = 5 + waveNum * 3;
    const count = Math.min(base, 40);
    const types = ["grunt", "grunt", "grunt", "ranged", "tank", "swarm", "swarm"];
    const hpMult = 1 + waveNum * 0.15;
    const dmgMult = 1 + waveNum * 0.08;
    for (let i = 0; i < count; i++) {
      const t = types[randInt(0, types.length - 1)];
      const def = ENEMY_TYPES[t];
      const hp = def.baseHP * hpMult;
      const dmg = def.baseDmg * dmgMult;
      const ang = rand(0, Math.PI * 2);
      const r = rand(C.spawnRadius * 0.6, C.spawnRadius);
      const ex = clamp(player.x + Math.cos(ang) * r, 50, world.w - 50);
      const ey = clamp(player.y + Math.sin(ang) * r, 50, world.h - 50);
      enemies.push(new Enemy(ex, ey, hp, dmg, def.spd, def.color, randName(), t));
    }
    if (waveNum % 5 === 0) spawnBoss();
  }

  function spawnBoss() {
    bossTimer = C.bossInterval;
    const hpMult = 1 + waveNum * 0.2;
    const dmgMult = 1 + waveNum * 0.1;
    const idx = nextBossId++ % BOSS_NAMES.length;
    const colors = ["#ff4444", "#7c3aed", "#ff6b3d", "#4da6ff", "#8b6914", "#d4b8ff"];
    const ang = rand(0, Math.PI * 2);
    const ex = clamp(player.x + Math.cos(ang) * C.spawnRadius, 100, world.w - 100);
    const ey = clamp(player.y + Math.sin(ang) * C.spawnRadius, 100, world.h - 100);
    enemies.push(new Enemy(ex, ey, ENEMY_TYPES.boss.baseHP * hpMult, ENEMY_TYPES.boss.baseDmg * dmgMult, ENEMY_TYPES.boss.spd, colors[idx], BOSS_NAMES[idx], "boss"));
    screenShake = 10;
    addPopup(player.x, player.y - 50, "⚠️ BOSS!", "#ff4444");
  }

  // ============================================================
  // XP + LEVELING
  // ============================================================
  function gainXP(amt) {
    xp += amt;
    while (xp >= xpToNext && pendingLevelUps < 6) { xp -= xpToNext; level++; xpToNext = Math.floor(C.xpBase + level * 16 + level * level * 1.3); pendingLevelUps++; }
    updateHUD();
    if (pendingLevelUps > 0 && !isDraftOpen()) showDraft();
  }

  function collectXPGems() {
    if (!player || !player.alive) return;
    for (let i = xpGems.length - 1; i >= 0; i--) {
      const g = xpGems[i];
      g.life -= 16; if (g.life <= 0) { xpGems.splice(i, 1); continue; }
      const d = dist(player, g);
      if (d < player.xpMagnetRange) {
        const a = Math.atan2(player.y - g.y, player.x - g.x);
        const pull = Math.min(C.xpMagnetSpeed, (1 - d / player.xpMagnetRange) * 14);
        g.x += Math.cos(a) * pull; g.y += Math.sin(a) * pull;
      }
      if (d < player.radius + g.radius) { gainXP(g.value); xpGems.splice(i, 1); }
    }
  }

  // ============================================================
  // DRAFT (Vampire Survivors style)
  // ============================================================
  function isDraftOpen() { const el = $("levelup-overlay"); return el && !el.classList.contains("hidden"); }

  function buildDraftPool() {
    const pool = [];
    const elemKeys = Object.keys(ELEMENTS).filter(e => ["fire", "water", "earth", "shadow"].includes(e));
    for (const ek of elemKeys) {
      const el = ELEMENTS[ek];
      pool.push({ icon: el.icon, name: el.name, desc: el.desc, tag: "Element", weight: 20, apply: () => { player.addElement(ek); addPopup(player.x, player.y - 40, `${el.icon} ${el.name}`, el.color); } });
    }
    for (const wKey of Object.keys(WEAPON_DEFS)) {
      const w = WEAPON_DEFS[wKey]; if (w.evolved) continue;
      const existing = player.weapons.find(pw => pw.id === wKey);
      if (existing) {
        if (existing.level < C.weaponLevelMax) {
          pool.push({ icon: w.icon, name: `${w.name} Up`, desc: `Level ${existing.level + 1}/${C.weaponLevelMax}`, tag: "Upgrade", weight: 25, apply: () => { existing.level++; } });
        } else if (w.evolve && player.elements[w.evolve.needsElement]) {
          pool.push({ icon: "✨", name: `Evolve ${w.name}`, desc: `→ ${WEAPON_DEFS[w.evolve.into].name}`, tag: "Evolve", weight: 40, apply: () => { const idx = player.weapons.indexOf(existing); player.weapons[idx] = { id: w.evolve.into, level: 1, timer: 0, ...WEAPON_DEFS[w.evolve.into] }; addPopup(player.x, player.y - 50, `✨ EVOLVED!`, "#f1c40f"); screenShake = 15; } });
        }
      } else if (player.weapons.length < C.maxWeapons) {
        pool.push({ icon: w.icon, name: w.name, desc: w.desc, tag: "Weapon", weight: 18, apply: () => { player.addWeapon(wKey); } });
      }
    }
    for (const p of PASSIVES) {
      if (!player.passives.includes(p.id)) {
        pool.push({ icon: p.icon, name: p.name, desc: p.desc, tag: "Passive", weight: 15, apply: () => { player.addPassive(p.id); } });
      }
    }
    pool.push({ icon: "❤️", name: "Heal", desc: "Restore 40% max HP", tag: "Recovery", weight: 12, apply: () => { player.heal(player.maxHP * 0.4); } });
    pool.push({ icon: "⚡", name: "Energy Surge", desc: "Full energy restore + 20 max", tag: "Recovery", weight: 10, apply: () => { player.maxEnergy += 20; player.energy = player.maxEnergy; } });
    return pool;
  }

  function showDraft() {
    const overlay = $("levelup-overlay"), box = $("draft-options");
    if (!overlay || !box) return;
    const pool = buildDraftPool();
    const picks = shuffle([...pool]).slice(0, 3);
    box.innerHTML = "";
    picks.forEach(card => {
      const el = document.createElement("button");
      el.className = "draft-card";
      el.innerHTML = `<div class="draft-icon">${card.icon}</div><div class="draft-meta"><strong>${card.name}</strong><small>${card.desc}</small></div><span class="draft-tag">${card.tag}</span>`;
      el.addEventListener("click", () => {
        card.apply();
        pendingLevelUps = Math.max(0, pendingLevelUps - 1);
        overlay.classList.add("hidden");
        paused = false; lastTime = performance.now(); animationId = requestAnimationFrame(loop);
        addPopup(player.x, player.y - 34, card.name, "#7c5cbf");
        spawnParticles(player.x, player.y, "#d4b8ff", 14);
        updateHUD();
        if (pendingLevelUps > 0) setTimeout(showDraft, 200);
      });
      box.appendChild(el);
    });
    overlay.classList.remove("hidden");
    paused = true;
    cancelAnimationFrame(animationId);
  }

  // ============================================================
  // FOOD / XP MOTES
  // ============================================================
  function spawnFood() {
    return { x: rand(40, world.w - 40), y: rand(40, world.h - 40), color: hsl(rand(250, 320), 60, 65), pulse: 0, value: rand(2, 6) };
  }

  // ============================================================
  // PARTICLES / POPUPS / DECALS
  // ============================================================
  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1.5, 7);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rand(0.03, 0.06), color, size: rand(2, 5) });
    }
  }
  function addPopup(x, y, text, color) { popups.push({ x, y, text, color, life: 1 }); }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life -= p.decay; if (p.life <= 0) particles.splice(i, 1); }
    for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.y -= 0.8; p.life -= 0.02; if (p.life <= 0) popups.splice(i, 1); }
  }

  // ============================================================
  // INPUT
  // ============================================================
  function getPlayerInput() {
    if (joy.active) return joy.vector;
    if (mode === "single" && !isTouch) {
      const dx = mouse.x - view.w / 2, dy = mouse.y - view.h / 2, m = Math.hypot(dx, dy);
      return m > 1 ? { x: dx / m, y: dy / m } : { x: 0, y: 0 };
    }
    return { x: 0, y: 0 };
  }

  function doDodge() {
    if (!player || !player.alive || Date.now() < player.dodgeCooldownUntil) return;
    const inp = getPlayerInput();
    const ang = (inp.x !== 0 || inp.y !== 0) ? Math.atan2(inp.y, inp.x) : player._lastAngle;
    player.x += Math.cos(ang) * C.dodgeDist;
    player.y += Math.sin(ang) * C.dodgeDist;
    player.x = clamp(player.x, 30, world.w - 30);
    player.y = clamp(player.y, 30, world.h - 30);
    player.iFrameUntil = Date.now() + C.dodgeIFrames;
    player.dodgeUntil = Date.now() + C.dodgeDur;
    player.dodgeCooldownUntil = Date.now() + C.dodgeCooldown;
    spawnParticles(player.x, player.y, "#b794f6", 8);
  }

  function toggleShield() {
    if (!player || !player.alive) return;
    if (player.shield > 10) { player.shield = Math.max(0, player.shield - 15); addPopup(player.x, player.y - 30, "🛡️ Block!", "#7c5cbf"); }
  }

  // Keyboard
  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Space") { e.preventDefault(); doDodge(); }
    if (e.code === "KeyE" || e.code === "ShiftLeft") toggleShield();
    if (e.code === "Escape") togglePause();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  function driveInputs() {
    if (!player || !player.alive) return;
    let ix = 0, iy = 0;
    if (!isTouch) {
      if (keys["KeyW"] || keys["ArrowUp"]) iy -= 1;
      if (keys["KeyS"] || keys["ArrowDown"]) iy += 1;
      if (keys["KeyA"] || keys["ArrowLeft"]) ix -= 1;
      if (keys["KeyD"] || keys["ArrowRight"]) ix += 1;
    }
    const m = Math.hypot(ix, iy);
    player.input = m > 0 ? { x: ix / m, y: iy / m } : getPlayerInput();
  }

  // Mouse
  canvas.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener("mousedown", (e) => { if (e.button === 0) mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Pointer (joystick + aim)
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      joy.active = true; joy.sx = e.clientX; joy.sy = e.clientY; joy.cx = e.clientX; joy.cy = e.clientY;
    }
    if (isTouch && e.clientX > view.w / 2) { aim.active = true; aim.x = e.clientX; aim.y = e.clientY; }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (joy.active && pointers.size === 1) { joy.cx = e.clientX; joy.cy = e.clientY; }
    if (aim.active) { aim.x = e.clientX; aim.y = e.clientY; e.preventDefault(); }
  });
  canvas.addEventListener("pointerup", (e) => { pointers.delete(e.pointerId); if (pointers.size === 0) { joy.active = false; aim.active = false; } });
  const aim = { x: 0, y: 0, active: false };

  function aimDir(from) {
    if (aim.active) return Math.atan2(aim.y - view.h / 2, aim.x - view.w / 2);
    if (from.input && Math.hypot(from.input.x, from.input.y) > 0.18) return Math.atan2(from.input.y, from.input.x);
    return from._lastAngle || 0;
  }

  function drawJoystick() {
    if (!joy.active || !isTouch) return;
    const dx = joy.cx - joy.sx, dy = joy.cy - joy.sy, d = Math.hypot(dx, dy);
    const clampD = Math.min(d, 50);
    const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : 0;
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(joy.sx, joy.sy, 50, 0, Math.PI * 2); ctx.fillStyle = "#fffaf0"; ctx.fill(); ctx.strokeStyle = "#2b1d12"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(joy.sx + nx * clampD, joy.sy + ny * clampD, 22, 0, Math.PI * 2); ctx.fillStyle = "#7c5cbf"; ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // CAMERA
  // ============================================================
  function updateCamera() {
    if (!player) return;
    const follow = player;
    const tx = follow.x - view.w / 2, ty = follow.y - view.h / 2;
    camera.x = lerp(camera.x, tx, 0.08);
    camera.y = lerp(camera.y, ty, 0.08);
    view.scale = lerp(view.scale, view.targetScale, 0.04);
  }

  function worldTransform() {
    const sc = view.scale * view.userZoom * dpr;
    const shx = (Math.random() - 0.5) * screenShake, shy = (Math.random() - 0.5) * screenShake;
    ctx.setTransform(sc, 0, 0, sc, (-camera.x + shx) * sc, (-camera.y + shy) * sc);
  }
  function screenTransform() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function visibleW() { return view.w; }
  function visibleH() { return view.h; }
  function inView(x, y, r) { return x + r > camera.x && x - r < camera.x + visibleW() && y + r > camera.y && y - r < camera.y + visibleH(); }

  // ============================================================
  // RENDER
  // ============================================================
  function drawArena() {
    const left = camera.x - 60, top = camera.y - 60, right = camera.x + visibleW() + 60, bottom = camera.y + visibleH() + 60;
    ctx.fillStyle = "#fdf6e3"; ctx.fillRect(left, top, right - left, bottom - top);
    ctx.fillStyle = "rgba(212,184,255,0.06)"; ctx.beginPath(); ctx.ellipse(world.w * 0.3, world.h * 0.3, 500, 400, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(232,184,106,0.05)"; ctx.beginPath(); ctx.ellipse(world.w * 0.7, world.h * 0.7, 550, 380, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(43,29,18,0.04)"; ctx.lineWidth = 1;
    const g = 120;
    ctx.beginPath();
    for (let x = Math.floor(left / g) * g; x <= right; x += g) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    for (let y = Math.floor(top / g) * g; y <= bottom; y += g) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(43,29,18,0.25)"; ctx.lineWidth = 2.5; ctx.strokeRect(0, 0, world.w, world.h);
  }

  function drawFood() {
    for (const f of xpGems) {
      if (!inView(f.x, f.y, f.radius + 5)) continue;
      f.pulse = (f.pulse || 0) + 0.06;
      const ps = 1 + Math.sin(f.pulse) * 0.15;
      ctx.globalAlpha = Math.min(1, f.life / 500);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * ps, 0, Math.PI * 2);
      ctx.fillStyle = f.color; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      if (!inView(p.x, p.y, p.radius + 10)) continue;
      const col = ELEMENTS[p.element]?.color || "#fff";
      const glow = ELEMENTS[p.element]?.glow || "rgba(255,255,255,0.3)";
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = 10;
      ctx.beginPath();
      if (p.nova || p.aoe) { ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); }
      else { ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); }
      ctx.fillStyle = col; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.ellipse(p.x - p.radius * 0.2, p.y - p.radius * 0.2, p.radius * 0.3, p.radius * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawEnemyProjectiles() {
    for (const p of enemyProjectiles) {
      if (!inView(p.x, p.y, p.radius + 5)) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color || "#ff6b3d"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (!e.alive || !inView(e.x, e.y, e.radius + 30)) continue;
      const r = e.radius, wob = Math.sin(e.wobble) * 1.2;
      ctx.save();
      if (Date.now() < e.stunUntil) ctx.globalAlpha = 0.5;
      if (Date.now() < e.slowUntil) { ctx.beginPath(); ctx.arc(e.x, e.y, r + 4, 0, Math.PI * 2); ctx.fillStyle = "rgba(77,166,255,0.18)"; ctx.fill(); }
      if (Date.now() < e.burnUntil) { ctx.beginPath(); ctx.arc(e.x, e.y, r + 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,100,0,0.15)"; ctx.fill(); }

      ctx.beginPath();
      if (e.type === "boss") {
        ctx.moveTo(e.x, e.y - r * 1.2);
        ctx.lineTo(e.x + r, e.y + r * 0.6);
        ctx.lineTo(e.x - r, e.y + r * 0.6);
        ctx.closePath();
        ctx.shadowColor = e.color; ctx.shadowBlur = 20;
      } else if (e.type === "tank") {
        ctx.rect(e.x - r, e.y - r, r * 2, r * 2);
      } else if (e.type === "ranged") {
        for (let i = 0; i < 5; i++) { const a = i * 1.256 - Math.PI / 2; const px = e.x + Math.cos(a) * r, py = e.y + Math.sin(a) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.closePath();
      } else {
        ctx.arc(e.x, e.y, r + wob, 0, Math.PI * 2);
      }
      ctx.fillStyle = e.color; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(43,29,18,0.25)"; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath(); ctx.ellipse(e.x - r * 0.25, e.y - r * 0.3, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();

      if (e.type === "tank") {
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
        ctx.strokeRect(e.x - r * 0.5, e.y - r * 0.5, r, r);
      } else if (e.type === "ranged") {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
      }

      if (e.hp < e.maxHP && e.alive) {
        const bw = r * 1.8, bh = 3.5;
        ctx.fillStyle = "rgba(43,29,18,0.22)"; ctx.fillRect(e.x - bw / 2, e.y - r - 10, bw, bh);
        ctx.fillStyle = e.type === "boss" ? "#ff4444" : "#e8b86a";
        ctx.fillRect(e.x - bw / 2, e.y - r - 10, bw * (e.hp / e.maxHP), bh);
      }

      ctx.fillStyle = "#2b1d12"; ctx.font = `700 ${Math.max(9, r * 0.28)}px system-ui,sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(253,246,227,0.9)";
      ctx.strokeText(e.name, e.x, e.y + r + 12);
      ctx.fillText(e.name, e.x, e.y + r + 12);
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (!player || !player.alive) return;
    const r = player.radius, wob = Math.sin(player.wobble) * 1.4;
    const now = Date.now();
    ctx.save();
    if (now < player.iFrameUntil) ctx.globalAlpha = 0.35;

    if (player.shield > 5) {
      ctx.beginPath(); ctx.arc(player.x, player.y, r + 10, 0, Math.PI * 2);
      const shieldPct = player.shield / player.maxShield;
      ctx.strokeStyle = `rgba(124,92,191,${0.3 + shieldPct * 0.5})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = `rgba(124,92,191,${0.05 + shieldPct * 0.08})`; ctx.fill();
    }

    ctx.beginPath(); ctx.ellipse(player.x, player.y + r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(43,29,18,0.12)"; ctx.fill();
    ctx.beginPath(); ctx.arc(player.x, player.y, r + wob, 0, Math.PI * 2);
    const bodyGrad = ctx.createRadialGradient(player.x - r * 0.2, player.y - r * 0.2, r * 0.1, player.x, player.y, r + wob);
    bodyGrad.addColorStop(0, player.color); bodyGrad.addColorStop(1, "#b794f6");
    ctx.fillStyle = bodyGrad; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(43,29,18,0.15)"; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(player.x - r * 0.26, player.y - r * 0.3, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fill();

    drawWitchHat(player.x, player.y - r * 0.58, r);

    ctx.beginPath(); ctx.moveTo(player.x - r * 0.4, player.y + r * 0.1); ctx.lineTo(player.x, player.y + r * 0.3); ctx.lineTo(player.x + r * 0.4, player.y + r * 0.1);
    ctx.strokeStyle = "rgba(253,246,227,0.9)"; ctx.lineWidth = Math.max(1.2, r * 0.05); ctx.lineJoin = "round"; ctx.stroke();

    if (now < player.dodgeUntil) {
      ctx.beginPath(); ctx.arc(player.x, player.y, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(183,148,246,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.fillStyle = "#2b1d12"; ctx.font = "700 11px system-ui,sans-serif"; ctx.textAlign = "center";
    ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(253,246,227,0.9)";
    ctx.strokeText(player.name, player.x, player.y - r - 14);
    ctx.fillText(player.name, player.x, player.y - r - 14);
    ctx.restore();
  }

  function drawWitchHat(cx, cy, scale) {
    const s = scale * 0.045;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.beginPath(); ctx.ellipse(0, 14, 30, 9, 0, 0, Math.PI * 2); ctx.fillStyle = "#1f140f"; ctx.fill(); ctx.strokeStyle = "rgba(253,246,227,0.2)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(0, -24); ctx.lineTo(16, 12); ctx.closePath();
    ctx.fillStyle = "#2b1d12"; ctx.fill(); ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -24, 4, 4, 0, 0, Math.PI * 2); ctx.fillStyle = "#e8b86a"; ctx.fill();
    ctx.restore();
  }

  function drawParticlesAndPopups() {
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color; ctx.font = "700 14px system-ui,sans-serif"; ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(253,246,227,0.9)"; ctx.lineWidth = 2.5;
      ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawAimLine() {
    if (!player || !player.alive || !isTouch || !aim.active) return;
    const ang = aimDir(player);
    ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = "#7c5cbf"; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(player.x + Math.cos(ang) * (player.radius + 8), player.y + Math.sin(ang) * (player.radius + 8));
    ctx.lineTo(player.x + Math.cos(ang) * 80, player.y + Math.sin(ang) * 80); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // ============================================================
  // HUD UPDATE
  // ============================================================
  function updateHUD() {
    if (!player) return;
    $("level-badge").textContent = `Lv ${level}`;
    $("hp-fill").style.width = (player.hp / player.maxHP * 100) + "%";
    $("mana-fill").style.width = (player.shield / player.maxShield * 100) + "%";
    $("wave-display").textContent = `Wave ${waveNum}`;
    const remain = Math.max(0, Math.floor((C.runDuration - runTimer) / 1000));
    $("timer-display").textContent = `${Math.floor(remain / 60)}:${(remain % 60).toString().padStart(2, "0")}`;
    updateSpellUI();
  }

  function updateSpellUI() {
    if (!player) return;
    const slots = document.querySelectorAll(".spell-slot");
    slots.forEach((slot, idx) => {
      const w = player.weapons[idx];
      if (!w) { slot.style.opacity = "0.25"; slot.querySelector(".spell-icon").textContent = "—"; slot.querySelector(".spell-key").textContent = ""; return; }
      const onCd = w.timer > 0;
      const pct = onCd ? (w.timer / (w.baseCd * player.cdMult) * 100) : 0;
      slot.style.opacity = onCd ? "0.46" : "1";
      slot.style.setProperty("--cd", String(pct));
      slot.querySelector(".spell-icon").textContent = w.icon;
      slot.querySelector(".spell-key").textContent = `${w.level}`;
      slot.style.borderColor = ELEMENTS[w.element]?.color || "#2b1d12";
    });
  }

  function updateLeaderboard() {
    const list = $("leaderboard-list"); if (!list) return;
    const entities = [];
    if (player && player.alive) entities.push({ name: player.name, score: Math.floor(player.hp), me: true });
    for (const e of enemies) { if (e.alive) entities.push({ name: e.name, score: Math.floor(e.hp), me: false }); }
    entities.sort((a, b) => b.score - a.score);
    list.innerHTML = entities.slice(0, 8).map(e => `<li class="${e.me ? "me" : ""}">${e.name} <span>${e.score}</span></li>`).join("");
  }

  function updateMinimap() {
    const mc = $("minimap-canvas"), mctx = mc ? mc.getContext("2d") : null;
    if (!mctx) return;
    const w = mc.width, h = mc.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "rgba(253,246,227,0.92)"; mctx.fillRect(0, 0, w, h);
    const sx = w / world.w, sy = h / world.h;
    mctx.strokeStyle = "rgba(43,29,18,0.18)"; mctx.lineWidth = 1; mctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    for (const e of enemies) { if (!e.alive) continue; mctx.beginPath(); mctx.arc(e.x * sx, e.y * sy, e.type === "boss" ? 3 : 1.5, 0, Math.PI * 2); mctx.fillStyle = e.type === "boss" ? "#ff4444" : "rgba(124,92,191,0.4)"; mctx.fill(); }
    if (player && player.alive) { mctx.beginPath(); mctx.arc(player.x * sx, player.y * sy, 2.5, 0, Math.PI * 2); mctx.fillStyle = "#2b1d12"; mctx.fill(); mctx.strokeStyle = "#fffaf0"; mctx.lineWidth = 1; mctx.stroke(); }
  }

  // ============================================================
  // COLLISION
  // ============================================================
  function handleCollisions() {
    if (!player || !player.alive) return;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = dist(player, e);
      if (d < player.radius + e.radius) {
        const overlap = player.radius + e.radius - d;
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        player.x += Math.cos(a) * overlap * 0.3;
        player.y += Math.sin(a) * overlap * 0.3;
      }
    }
  }

  function tickProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { projectiles.splice(i, 1); continue; }

      if (p.orbit && player && player.alive) {
        p.orbitAngle += 0.05;
        p.x = player.x + Math.cos(p.orbitAngle) * p.orbitArea;
        p.y = player.y + Math.sin(p.orbitAngle) * p.orbitArea;
      } else {
        p.x += p.vx * (dt / 16); p.y += p.vy * (dt / 16);
      }

      if (p.homing && p.homingTarget && p.homingTarget.alive) {
        const a = Math.atan2(p.homingTarget.y - p.y, p.homingTarget.x - p.x);
        p.vx = lerp(p.vx, Math.cos(a) * (p.weapon?.projSpeed || 4), 0.1);
        p.vy = lerp(p.vy, Math.sin(a) * (p.weapon?.projSpeed || 4), 0.1);
      }

      if (p.owner === "player") {
        for (const e of enemies) {
          if (!e.alive) continue;
          if (dist(p, e) < p.radius + e.radius) {
            e.takeDamage(p.dmg, p.element);
            if (p.lifesteal) player.heal(p.dmg * p.lifesteal);
            if (p.slow) { e.slowUntil = Date.now() + p.slow.dur; e.slowPct = p.slow.pct; }
            p.pierce--;
            if (p.pierce <= 0) { projectiles.splice(i, 1); break; }
          }
        }
      }
    }

    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const p = enemyProjectiles[i];
      p.life -= dt; if (p.life <= 0) { enemyProjectiles.splice(i, 1); continue; }
      p.x += p.vx * (dt / 16); p.y += p.vy * (dt / 16);
      if (player && player.alive && dist(p, player) < p.radius + player.radius) {
        player.takeDamage(p.dmg);
        enemyProjectiles.splice(i, 1);
      }
    }
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================
  function loop(ts) {
    if (!running || paused) return;
    const dt = Math.min(32, ts - lastTime); lastTime = ts; gameTime += dt;
    runTimer += dt;

    waveTimer -= dt;
    if (waveTimer <= 0 && player && player.alive) spawnWave();
    if (runTimer >= C.runDuration && !enemies.some(e => e.alive && e.type === "boss")) { winGame(); return; }

    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 0.03);

    driveInputs();
    player.update(dt);
    for (const e of enemies) e.update(dt);
    enemies = enemies.filter(e => e.alive);
    collectXPGems();
    handleCollisions();
    tickProjectiles(dt);
    updateParticles(dt);
    updateCamera();

    screenTransform(); ctx.clearRect(0, 0, view.w * dpr, view.h * dpr);
    worldTransform();
    drawArena();
    drawFood();
    drawAimLine();
    drawEnemies();
    drawProjectiles();
    drawEnemyProjectiles();
    drawPlayer();
    drawParticlesAndPopups();
    drawJoystick();

    screenTransform();
    updateHUD(); updateLeaderboard(); updateMinimap();

    animationId = requestAnimationFrame(loop);
  }

  // ============================================================
  // GAME STATE
  // ============================================================
  function startGame(modeSel) {
    mode = modeSel;
    const fc = C.foodCount[difficulty] || 300;
    world = { ...C.world };
    xpGems = []; for (let i = 0; i < fc; i++) xpGems.push(spawnFood());
    enemies = []; projectiles = []; particles = []; popups = []; decals = []; enemyProjectiles = [];
    player = null; gameTime = 0; runTimer = 0;
    waveNum = 0; waveTimer = 3000; bossTimer = C.bossInterval;
    nextBossId = 1;
    statKills = 0; statMaxCombo = 0;
    xp = 0; level = 1; xpToNext = C.xpBase; pendingLevelUps = 0;

    const n1 = ($("name-input").value || "Witch").trim().slice(0, 16) || "Witch";
    player = new Player(rand(200, world.w - 200), rand(200, world.h - 200), n1, "#d4b8ff");
    player.addElement("fire");
    player.addWeapon("flameOrbit");

    camera.x = world.w / 2 - visibleW() / 2;
    camera.y = world.h / 2 - visibleH() / 2;
    view.scale = 1; view.targetScale = 1; view.userZoom = 1;

    $("start-screen").classList.add("hidden"); $("end-screen").classList.add("hidden");
    $("respawn-overlay").classList.add("hidden"); $("hud").classList.remove("hidden");
    $("pause-menu").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
    if (isTouch) $("mobile-controls").classList.remove("hidden");

    running = true; paused = false; lastTime = performance.now();
    cancelAnimationFrame(animationId); animationId = requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    const m = Math.floor(gameTime / 60000), s = Math.floor((gameTime % 60000) / 1000);
    $("final-score").textContent = `Wave ${waveNum} — ${level} Lv`;
    $("stat-time").textContent = `${m}:${s.toString().padStart(2, "0")}`;
    $("stat-kills").textContent = statKills;
    $("stat-combo").textContent = statMaxCombo;
    $("stat-waves").textContent = waveNum;
    $("end-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
  }

  function winGame() {
    running = false;
    $("final-score").textContent = "VICTORY!";
    $("stat-time").textContent = "10:00";
    $("stat-kills").textContent = statKills;
    $("stat-combo").textContent = statMaxCombo;
    $("stat-waves").textContent = waveNum;
    $("end-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden");
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    $("pause-menu").classList.toggle("hidden", !paused);
    if (!paused) { lastTime = performance.now(); animationId = requestAnimationFrame(loop); }
  }

  // ============================================================
  // DOM BINDINGS
  // ============================================================
  const $ = (id) => document.getElementById(id);

  $("resume-btn")?.addEventListener("click", togglePause);
  $("quit-btn")?.addEventListener("click", () => {
    running = false; cancelAnimationFrame(animationId);
    $("pause-menu").classList.add("hidden"); $("end-screen").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
    $("start-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden");
  });
  $("play-solo")?.addEventListener("click", () => startGame("single"));
  $("play-online")?.addEventListener("click", () => $("online-options")?.classList.toggle("hidden"));
  $("connect-online-btn")?.addEventListener("click", () => {
    const url = ($("server-input")?.value || "ws://127.0.0.1:3000").trim();
    if (window.witchConnect) window.witchConnect(url);
  });
  $("restart-btn")?.addEventListener("click", () => { $("end-screen").classList.add("hidden"); $("start-screen").classList.remove("hidden"); });
  $("dodge-btn")?.addEventListener("pointerdown", (e) => { e.preventDefault(); doDodge(); });
  $("shield-btn")?.addEventListener("pointerdown", (e) => { e.preventDefault(); toggleShield(); });
  $("name-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") startGame("single"); });
  document.querySelectorAll(".diff-btn").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".diff-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); difficulty = b.dataset.diff;
  }));
  document.querySelectorAll(".spell-btn").forEach((btn, idx) => {
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); /* touch spell cast - future */ });
  });

  // Touch: prevent default on game canvas
  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
})();
