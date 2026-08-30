/**
 * Witch.io — Atelier Arena v2
 * Soul Knight twin-stick + Magica.io element combos + Vampire Survivors progression + Witch Hat Atelier visuals
 * Elements: Fire, Water, Earth, Shadow — combine for ultimate spells
 * Dodge roll (i-frames), shield block, mana system, enemy waves, boss fights
 */
(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================
  const CFG = {
    world: { w: 3600, h: 3600 },
    tickRate: 60,
    startHP: 100,
    startMana: 80,
    manaRegen: 0.018,
    manaRegenRate: 0.4,
    dodgeCooldown: 2000,
    dodgeDist: 180,
    dodgeDur: 300,
    shieldBreakDur: 4000,
    shieldBlockPct: 0.82,
    xpBase: 20,
    xpScale: 1.18,
    xpMoteValue: 5,
    runDuration: 240000,
    bossInterval: 60000,
    waveInterval: 5000,
    maxSpells: 6,
    maxPassives: 4,
    collabLevel: 7,
    foodCount: { easy: 300, medium: 440, hard: 600 },
    botCount: { easy: 10, medium: 16, hard: 22 },
  };

  const ELEMENTS = {
    fire:   { name: "Fire",   icon: "🔥", color: "#ff6b3d", colorLight: "#ffb088", baseDmg: 8,  baseCd: 600,  desc: "Burns foes over time" },
    water:  { name: "Water",  icon: "💧", color: "#4da6ff", colorLight: "#a8d4ff", baseDmg: 6,  baseCd: 520,  desc: "Freezes and slows" },
    earth:  { name: "Earth",  icon: "🌍", color: "#8b6914", colorLight: "#d4b06a", baseDmg: 12, baseCd: 900,  desc: "Heavy impact, stuns" },
    shadow: { name: "Shadow", icon: "🌑", color: "#7c3aed", colorLight: "#b794f6", baseDmg: 10, baseCd: 750,  desc: "Pierces, life drain" },
  };

  const COMBOS = {
    "fire+fire+fire":     { name: "Supernova",       icon: "💥", desc: "AoE explosion, massive burn", type: "ultimate" },
    "water+water+water":  { name: "Tsunami",         icon: "🌊", desc: "Wave kills on contact", type: "ultimate" },
    "earth+earth+earth":  { name: "Stone Ram",       icon: "🪨", desc: "Transform + charge attack", type: "ultimate" },
    "shadow+shadow+shadow":{ name: "Void Nova",      icon: "🕳️", desc: "Screen-clearing darkness", type: "ultimate" },
    "fire+water":         { name: "Lightning Ball",  icon: "⚡", desc: "Homing + stun", type: "dual" },
    "fire+earth":         { name: "Meteor",          icon: "☄️", desc: "Heavy impact + burn", type: "dual" },
    "water+earth":        { name: "Ice Lance",       icon: "🧊", desc: "Piercing + freeze", type: "dual" },
    "fire+shadow":        { name: "Soul Fire",       icon: "👻", desc: "Piercing + DOT", type: "dual" },
    "water+shadow":       { name: "Frost Nova",      icon: "❄️", desc: "AoE slow + damage", type: "dual" },
    "earth+shadow":       { name: "Death Spike",     icon: "💀", desc: "Ground trap", type: "dual" },
    "fire+water+earth":   { name: "Elemental Storm", icon: "🌪️", desc: "Triple-element devastation", type: "tri" },
    "fire+water+shadow":  { name: "Tempest",         icon: "⛈️", desc: "Homing lightning storm", type: "tri" },
    "fire+earth+shadow":  { name: "Magma Eruption",  icon: "🌋", desc: "Ground lava waves", type: "tri" },
    "water+earth+shadow": { name: "Abyssal Wave",    icon: "🌊", desc: "Pulls + drowns foes", type: "tri" },
  };

  const PASSIVES = {
    speedUp:     { name: "Fleet Feet",    icon: "👟", desc: "+12% move speed", apply: (p) => { p.moveSpeed *= 1.12; } },
    healthUp:    { name: "Vigor",         icon: "❤️", desc: "+25 max HP, heal full", apply: (p) => { p.maxHP += 25; p.hp = p.maxHP; } },
    manaUp:      { name: "Mana Spring",   icon: "💧", desc: "+30 max mana, +regen", apply: (p) => { p.maxMana += 30; p.mana = p.maxMana; p.manaRegen += 0.15; } },
    critChance:  { name: "Precision",     icon: "🎯", desc: "+15% crit chance", apply: (p) => { p.critChance += 0.15; } },
    damageUp:    { name: "Arcane Power",  icon: "⚔️", desc: "+18% spell damage", apply: (p) => { p.dmgMult *= 1.18; } },
    cooldownRed: { name: "Haste",         icon: "⏳", desc: "-12% cooldowns", apply: (p) => { p.cdMult *= 0.88; } },
    lifeSteal:   { name: "Siphon",        icon: "🧛", desc: "+8% life steal", apply: (p) => { p.lifeSteal += 0.08; } },
    armorUp:     { name: "Iron Mantle",   icon: "🛡️", desc: "+10% damage reduction", apply: (p) => { p.armor += 0.10; } },
    doubleXP:    { name: "Scholar",       icon: "📖", desc: "+40% XP gain", apply: (p) => { p.xpMult *= 1.40; } },
    magnetRange: { name: "Attractor",     icon: "🧲", desc: "+50% pickup range", apply: (p) => { p.pickupRange *= 1.5; } },
    regenUp:     { name: "Rejuvenate",    icon: "🌿", desc: "+0.3 HP/s regen", apply: (p) => { p.regen += 0.3; } },
    dodgePower:  { name: "Shadow Step",   icon: "💨", desc: "+30% dodge distance, -0.5s CD", apply: (p) => { p.dodgeDist *= 1.3; p.dodgeCd -= 500; } },
  };

  // ============================================================
  // STATE
  // ============================================================
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  let world = { ...CFG.world };
  let difficulty = "easy";
  let mode = "single";
  let running = false, paused = false;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  let view = { w: 0, h: 0, scale: 1, targetScale: 1, userZoom: 1 };
  let camera = { x: 0, y: 0 };
  let shake = 0;

  let enemies = [];
  let projectiles = [];
  let foods = [];
  let particles = [];
  let popups = [];
  let decals = [];
  let traps = [];
  let player = null;
  let gameTime = 0;
  let waveNum = 0;
  let waveTimer = 0;
  let bossTimer = 0;
  let nextBossId = 1;
  let runTimer = 0;
  let difficultyMult = 1;

  let xp = 0, level = 1, xpToNext = CFG.xpBase;
  let pendingLevelUps = 0;
  let statKills = 0, statDmgDealt = 0, statSpells = 0, statMaxCombo = 0;
  let combo = 0, comboTimer = 0;

  let animationId = null, lastTime = 0;
  const joy = { active: false, id: null, ox: 0, oy: 0, maxR: 70, dead: 12, vector: { x: 0, y: 0 } };
  const aim = { x: 0, y: 0, active: false };
  const pointers = new Map();
  const net = { ws: null, id: null, connected: false, byId: new Map(), foods: [], world: null, lastSent: 0, self: null };

  // ============================================================
  // UTIL
  // ============================================================
  const rand = (a, b) => Math.random() * (b - a) + a;
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const randColor = () => `hsl(${randInt(250, 320)}, 70%, 62%)`;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const $ = (id) => document.getElementById(id);
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function aimDir(from) {
    if (aim.active) return Math.atan2(aim.y - view.h / 2, aim.x - view.w / 2);
    if (from.input && Math.hypot(from.input.x, from.input.y) > 0.18) return Math.atan2(from.input.y, from.input.x);
    if (enemies.length > 0) {
      let best = null, bd = 600;
      for (const e of enemies) { if (!e.alive) continue; const d = dist(from, e); if (d < bd) { best = e; bd = d; } }
      if (best) return Math.atan2(best.y - from.y, best.x - from.x);
    }
    return from._lastAngle || 0;
  }

  function elemSortKey(elems) {
    return [...elems].sort().join("+");
  }

  function findCombo(elems) {
    const key = elemSortKey(elems);
    return COMBOS[key] || null;
  }

  // ============================================================
  // PLAYER
  // ============================================================
  class Player {
    constructor(x, y, name, color, isP2 = false) {
      this.x = x; this.y = y;
      this.name = name; this.color = color;
      this.isPlayer = true; this.isP2 = isP2;
      this.alive = true;
      this.radius = 22;
      this.input = { x: 0, y: 0 };
      this._lastAngle = rand(0, Math.PI * 2);
      this.wobble = rand(0, Math.PI * 2);

      this.hp = CFG.startHP; this.maxHP = CFG.startHP;
      this.mana = CFG.startMana; this.maxMana = CFG.startMana;
      this.manaRegen = CFG.manaRegen;
      this.moveSpeed = 3.8;
      this.dmgMult = 1; this.cdMult = 1; this.armor = 0;
      this.critChance = 0.10; this.lifeSteal = 0; this.xpMult = 1;
      this.pickupRange = 110; this.regen = 0;

      this.dodgeCd = CFG.dodgeCooldown; this.dodgeDist = CFG.dodgeDist;
      this.dodgeUntil = 0; this.dodgeAng = 0;
      this.shieldActive = false; this.shieldHp = 0; this.shieldMaxHp = 60;
      this.iFrameUntil = 0;
      this.shootCd = 0;

      this.elements = []; this.spells = []; this.passives = [];
      this.comboWeapon = null;
    }

    get mass() { return this.hp; }
    get alive() { return this._alive; }
    set alive(v) { this._alive = v; }

    addElement(elem) {
      this.elements.push(elem);
      this.comboWeapon = findCombo(this.elements);
      if (this.spells.length < CFG.maxSpells) {
        const existing = this.spells.find(s => s.elem === elem && s.level < CFG.collabLevel);
        if (existing) { existing.level++; existing.dmg = ELEMENTS[elem].baseDmg * (1 + existing.level * 0.22); }
        else this.spells.push({ elem, level: 1, dmg: ELEMENTS[elem].baseDmg, cd: ELEMENTS[elem].baseCd, timer: 0, kind: "spell" });
      } else {
        const weakest = this.spells.reduce((a, b) => a.level < b.level ? a : b);
        if (weakest.level < CFG.collabLevel) { weakest.level++; weakest.dmg = ELEMENTS[weakest.elem].baseDmg * (1 + weakest.level * 0.22); }
      }
    }

    addPassive(id) {
      if (this.passives.length >= CFG.maxPassives) return;
      if (this.passives.includes(id)) return;
      this.passives.push(id);
      PASSIVES[id].apply(this);
    }

    takeDamage(dmg, source) {
      if (!this.alive || Date.now() < this.iFrameUntil) return 0;
      if (this.shieldActive && this.shieldHp > 0) {
        const blocked = dmg * CFG.shieldBlockPct;
        this.shieldHp -= blocked;
        if (this.shieldHp <= 0) { this.shieldActive = false; this.shieldHp = 0; }
        dmg -= blocked;
      }
      dmg *= (1 - this.armor);
      dmg = Math.max(1, dmg);
      this.hp -= dmg;
      spawnParticles(this.x, this.y, "#ff4444", 6);
      addPopup(this.x, this.y - this.radius - 10, `-${Math.floor(dmg)}`, "#ff4444");
      if (this.hp <= 0) { this.hp = 0; this.alive = false; diePlayer(); }
      return dmg;
    }

    heal(amt) { this.hp = Math.min(this.maxHP, this.hp + amt); }

    update(dt) {
      if (!this.alive) return;
      const now = Date.now();
      this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * (dt / 16));
      this.hp = Math.min(this.maxHP, this.hp + this.regen * (dt / 1000));
      this.wobble += 0.05;

      if (now < this.dodgeUntil) {
        const progress = 1 - (this.dodgeUntil - now) / CFG.dodgeDur;
        const speed = this.dodgeDist / CFG.dodgeDur * 16;
        this.x += Math.cos(this.dodgeAng) * speed;
        this.y += Math.sin(this.dodgeAng) * speed;
      } else {
        const inp = this.input || { x: 0, y: 0 };
        const m = Math.hypot(inp.x, inp.y);
        if (m > 0.001) {
          const sp = Math.min(this.moveSpeed, this.moveSpeed * Math.min(1, m));
          this.x += (inp.x / m) * sp;
          this.y += (inp.y / m) * sp;
          if (m > 0.2) this._lastAngle = Math.atan2(inp.y, inp.x);
        }
      }
      this.x = clamp(this.x, this.radius, world.w - this.radius);
      this.y = clamp(this.y, this.radius, world.h - this.radius);

      for (const s of this.spells) { s.timer = Math.max(0, s.timer - dt); }
      this.shootCd = Math.max(0, this.shootCd - dt);

      if (this.comboWeapon && this.shootCd <= 0) {
        let best = null, bd = 520;
        for (const e of enemies) { if (!e.alive) continue; const d = dist(this, e); if (d < bd) { best = e; bd = d; } }
        if (best) {
          const ang = Math.atan2(best.y - this.y, best.x - this.x);
          fireComboProjectile(this, ang);
          this.shootCd = 280;
        }
      }
    }
  }

  // ============================================================
  // ENEMY
  // ============================================================
  class Enemy {
    constructor(x, y, hp, dmg, speed, color, name, type = "grunt") {
      this.x = x; this.y = y;
      this.hp = hp; this.maxHP = hp;
      this.dmg = dmg; this.speed = speed;
      this.color = color; this.name = name;
      this.type = type;
      this.alive = true; this.isPlayer = false;
      this.radius = type === "boss" ? 36 : (type === "tank" ? 20 : (type === "swarm" ? 12 : 16));
      this.target = null; this.shotCd = rand(400, 1200);
      this._lastAngle = rand(0, Math.PI * 2);
      this.wobble = rand(0, Math.PI * 2);
      this.input = { x: 0, y: 0 };
      this._burnUntil = 0; this._burnDmg = 0;
      this._freezeUntil = 0;
      this._stunUntil = 0;
      this.xpValue = type === "boss" ? 200 : (type === "tank" ? 25 : (type === "ranged" ? 15 : 10));
    }

    update(dt) {
      if (!this.alive) return;
      const now = Date.now();
      if (now < this._stunUntil) return;
      const spd = now < this._freezeUntil ? this.speed * 0.35 : this.speed;
      this.wobble += 0.04;

      this.think(dt);
      const tx = this.target ? this.target.x : this.x;
      const ty = this.target ? this.target.y : this.y;
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      if (d > 1) { this.x += (dx / d) * spd; this.y += (dy / d) * spd; if (d > 4) this._lastAngle = Math.atan2(dy, dx); }
      this.x = clamp(this.x, this.radius, world.w - this.radius);
      this.y = clamp(this.y, this.radius, world.h - this.radius);

      if (this.type !== "swarm") {
        this.shotCd -= dt;
        if (this.shotCd <= 0 && this.alive) {
          let best = null, bd = 440;
          if (player && player.alive) { const d2 = dist(this, player); if (d2 < bd) { best = player; bd = d2; } }
          if (best) {
            const a = Math.atan2(best.y - this.y, best.x - this.x) + rand(-0.12, 0.12);
            const projSpd = this.type === "ranged" ? 7 : 5.5;
            fireEnemyProjectile(this, a, projSpd, this.dmg, this.color);
            this.shotCd = this.type === "ranged" ? rand(1200, 2200) : rand(1600, 2800);
          } else this.shotCd = rand(600, 1200);
        }
      }
    }

    think() {
      if (Math.random() < 0.02) {
        const a = rand(0, Math.PI * 2), r = rand(120, 400);
        this.target = { x: clamp(this.x + Math.cos(a) * r, 0, world.w), y: clamp(this.y + Math.sin(a) * r, 0, world.h) };
      }
      if (player && player.alive) {
        const d = dist(this, player);
        if (this.type === "boss" || this.type === "tank") { this.target = { x: player.x, y: player.y }; }
        else if (d < 320 && this.type !== "ranged") {
          const a = Math.atan2(this.y - player.y, this.x - player.x);
          this.target = { x: clamp(this.x + Math.cos(a) * 180, 0, world.w), y: clamp(this.y + Math.sin(a) * 180, 0, world.h) };
        } else { this.target = { x: player.x, y: player.y }; }
      }
    }

    takeDamage(dmg) {
      if (!this.alive) return;
      this.hp -= dmg;
      spawnParticles(this.x, this.y, this.color, 4);
      addPopup(this.x, this.y - this.radius - 8, `-${Math.floor(dmg)}`, "#fff");
      if (this.hp <= 0) { this.alive = false; killEnemy(this); }
    }

    draw() {
      const r = this.radius, wob = Math.sin(this.wobble) * 1.2;
      ctx.save();
      if (this._stunUntil > Date.now()) ctx.globalAlpha = 0.5;
      if (this._freezeUntil > Date.now()) { ctx.beginPath(); ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2); ctx.fillStyle = "rgba(77,166,255,0.18)"; ctx.fill(); }

      ctx.beginPath();
      if (this.type === "boss") {
        ctx.moveTo(this.x, this.y - r * 1.2);
        ctx.lineTo(this.x + r, this.y + r * 0.6);
        ctx.lineTo(this.x - r, this.y + r * 0.6);
        ctx.closePath();
      } else if (this.type === "tank") {
        ctx.rect(this.x - r, this.y - r, r * 2, r * 2);
      } else if (this.type === "ranged") {
        for (let i = 0; i < 5; i++) { const a = i * 1.256 - Math.PI / 2; const px = this.x + Math.cos(a) * r, py = this.y + Math.sin(a) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.closePath();
      } else {
        ctx.arc(this.x, this.y, r + wob, 0, Math.PI * 2);
      }
      if (this.type === "boss") { ctx.shadowColor = this.color; ctx.shadowBlur = 18; }
      ctx.fillStyle = this.color; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(43,29,18,0.25)"; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath(); ctx.ellipse(this.x - r * 0.25, this.y - r * 0.3, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();

      if (this.type === "tank") {
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
        ctx.strokeRect(this.x - r * 0.5, this.y - r * 0.5, r, r);
      } else if (this.type === "ranged") {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
      } else if (this.type === "swarm") {
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        for (let i = 0; i < 3; i++) { const a = i * 2.094; ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * r * 0.35, this.y + Math.sin(a) * r * 0.35, 2, 0, Math.PI * 2); ctx.fill(); }
      }

      if (this.hp < this.maxHP && this.alive) {
        const bw = r * 1.8, bh = 3.5;
        ctx.fillStyle = "rgba(43,29,18,0.22)"; ctx.fillRect(this.x - bw / 2, this.y - r - 10, bw, bh);
        ctx.fillStyle = this.type === "boss" ? "#ff4444" : "#e8b86a";
        ctx.fillRect(this.x - bw / 2, this.y - r - 10, bw * (this.hp / this.maxHP), bh);
      }

      ctx.fillStyle = "#2b1d12"; ctx.font = `700 ${Math.max(9, r * 0.28)}px system-ui,sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(253,246,227,0.9)";
      ctx.strokeText(this.name, this.x, this.y + r + 12);
      ctx.fillText(this.name, this.x, this.y + r + 12);
      ctx.restore();
    }
  }

  // ============================================================
  // SPELLS / ELEMENTS
  // ============================================================
  function castSpell(spellIdx) {
    if (!player || !player.alive) return;
    const sp = player.spells[spellIdx];
    if (!sp || sp.timer > 0) return;
    const cd = sp.cd * player.cdMult;
    sp.timer = cd;
    statSpells++;

    const ang = aimDir(player);
    player._lastAngle = ang;
    const elem = ELEMENTS[sp.elem];
    const dmg = sp.dmg * player.dmgMult;

    switch (sp.elem) {
      case "fire": {
        const n = 2 + Math.min(sp.level, 4);
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 0.18;
          fireProjectile(player, ang + off, 9.5, dmg, elem.color, { kind: "fire", life: 55, pierce: 0, elem: "fire" });
        }
        spawnSigil(player.x, player.y, 0.55, elem.color);
        shake = Math.max(shake, 5);
        break;
      }
      case "water": {
        const n = 1 + Math.min(sp.level, 3);
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 0.14;
          fireProjectile(player, ang + off, 10.5, dmg, elem.color, { kind: "water", life: 48, pierce: 1, elem: "water", slow: 0.4, slowDur: 1800 });
        }
        spawnSigil(player.x, player.y, 0.5, elem.color);
        shake = Math.max(shake, 4);
        break;
      }
      case "earth": {
        const n = 1 + Math.floor(sp.level / 2);
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 0.22;
          fireProjectile(player, ang + off, 7.5, dmg * 1.3, elem.color, { kind: "earth", life: 40, pierce: 0, elem: "earth", r: 8, stun: 500 + sp.level * 80 });
        }
        spawnSigil(player.x, player.y, 0.6, elem.color);
        shake = Math.max(shake, 7);
        break;
      }
      case "shadow": {
        const n = 1 + Math.floor(sp.level / 2);
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 0.12;
          fireProjectile(player, ang + off, 11, dmg, elem.color, { kind: "shadow", life: 52, pierce: 1 + Math.floor(sp.level / 3), elem: "shadow", lifesteal: 0.08 + sp.level * 0.01 });
        }
        spawnSigil(player.x, player.y, 0.45, elem.color);
        shake = Math.max(shake, 3);
        break;
      }
    }
    updateSpellUI();
  }

  function fireComboProjectile(owner, ang) {
    const combo = owner.comboWeapon;
    if (!combo) return;
    const dmg = 14 * owner.dmgMult;
    const colors = { fire: "#ff6b3d", water: "#4da6ff", earth: "#8b6914", shadow: "#7c3aed" };
    const elems = [...new Set(owner.elements)];
    const col = elems.length === 1 ? colors[elems[0]] : "#d4b8ff";
    fireProjectile(owner, ang, 10, dmg, col, { kind: "combo", life: 60, pierce: 2, elem: elems[0] || "fire", r: 6 });
  }

  function doDodge() {
    if (!player || !player.alive) return;
    const now = Date.now();
    if (now < player.dodgeUntil || now < player.iFrameUntil) return;
    const ang = aimDir(player);
    player.dodgeAng = ang;
    player.dodgeUntil = now + CFG.dodgeDur;
    player.iFrameUntil = now + CFG.dodgeDur + 50;
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const ix = lerp(player.x, player.x + Math.cos(ang) * player.dodgeDist, t);
      const iy = lerp(player.y, player.y + Math.sin(ang) * player.dodgeDist, t);
      decals.push({ x: ix, y: iy, r: 14 + rand(0, 8), life: 1, color: "rgba(43,29,18,0.14)" });
    }
    spawnParticles(player.x, player.y, "#b794f6", 10);
    shake = Math.max(shake, 4);
  }

  function toggleShield() {
    if (!player || !player.alive) return;
    player.shieldActive = !player.shieldActive;
    if (player.shieldActive) { player.shieldHp = player.shieldMaxHp; spawnSigil(player.x, player.y, 0.7, "#7c5cbf"); }
  }

  // ============================================================
  // PROJECTILES
  // ============================================================
  function fireProjectile(owner, ang, speed, dmg, color, opts = {}) {
    const r = opts.r || 5;
    const vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
    const sx = owner.x + Math.cos(ang) * (owner.radius + r + 2);
    const sy = owner.y + Math.sin(ang) * (owner.radius + r + 2);
    projectiles.push({ x: sx, y: sy, vx, vy, r, dmg, color, owner, life: opts.life || 60, pierce: opts.pierce || 0, kind: opts.kind || "bolt", elem: opts.elem || "", trail: [], slow: opts.slow || 0, slowDur: opts.slowDur || 0, stun: opts.stun || 0, lifesteal: opts.lifesteal || 0, isEnemy: opts.isEnemy || false });
  }

  function fireEnemyProjectile(owner, ang, speed, dmg, color) {
    fireProjectile(owner, ang, speed, dmg, color, { kind: "enemy", life: 65, pierce: 0, isEnemy: true });
  }

  function tickProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      p.trail.push({ x: p.x, y: p.y, life: 1 });
      if (p.trail.length > 5) p.trail.shift();
      for (const t of p.trail) t.life -= 0.2;
      p.trail = p.trail.filter(t => t.life > 0);
      if (p.life <= 0 || p.x < -40 || p.x > world.w + 40 || p.y < -40 || p.y > world.h + 40) { projectiles.splice(i, 1); continue; }

      if (p.isEnemy) {
        if (player && player.alive && dist(p, player) < player.radius + p.r) {
          const dealt = player.takeDamage(p.dmg);
          spawnParticles(p.x, p.y, p.color, 6);
          projectiles.splice(i, 1);
        }
      } else {
        for (const e of enemies) {
          if (!e.alive) continue;
          if (dist(p, e) < e.radius + p.r) {
            let dmg = p.dmg;
            const isCrit = Math.random() < (player ? player.critChance : 0.1);
            if (isCrit) dmg *= 1.8;
            e.takeDamage(dmg);
            statDmgDealt += dmg;
            if (p.slow > 0) e._freezeUntil = Date.now() + p.slowDur;
            if (p.stun > 0) e._stunUntil = Date.now() + p.stun;
            if (p.kind === "fire" || p.kind === "combo") { e._burnUntil = Date.now() + 1400; e._burnDmg = 1.2; }
            if (p.lifesteal > 0 && player) player.heal(dmg * p.lifesteal);
            if (isCrit) addPopup(e.x, e.y - e.radius - 8, "CRIT!", "#ffd700");
            spawnParticles(p.x, p.y, p.color, 5);
            if (p.pierce > 0) p.pierce--; else { projectiles.splice(i, 1); }
            break;
          }
        }
      }
    }
    for (const e of enemies) {
      if (e._burnUntil > 0 && Date.now() < e._burnUntil) {
        if (Math.random() < 0.1) { e.takeDamage(e._burnDmg); spawnParticles(e.x + rand(-6, 6), e.y + rand(-6, 6), "#ff6b3d", 1); }
      } else e._burnUntil = 0;
    }
  }

  // ============================================================
  // FOOD / XP
  // ============================================================
  function spawnFood() {
    const kind = Math.random() < 0.15 ? "mana" : (Math.random() < 0.10 ? "heal" : "xp");
    const colors = { xp: randColor(), mana: "#4da6ff", heal: "#ff6b6b" };
    return { x: rand(40, world.w - 40), y: rand(40, world.h - 40), color: colors[kind], kind, pulse: rand(0, Math.PI * 2), value: kind === "xp" ? CFG.xpMoteValue : (kind === "mana" ? 15 : 20) };
  }

  function eatFood() {
    if (!player || !player.alive) return;
    for (let f = foods.length - 1; f >= 0; f--) {
      const food = foods[f];
      const d = dist(player, food);
      if (d < player.pickupRange) {
        const a = Math.atan2(player.y - food.y, player.x - food.x);
        const pull = Math.min(8, (1 - d / player.pickupRange) * 12);
        food.x += Math.cos(a) * pull; food.y += Math.sin(a) * pull;
      }
      if (d < player.radius + 14) {
        if (food.kind === "xp") gainXP(food.value * player.xpMult);
        else if (food.kind === "mana") player.mana = Math.min(player.maxMana, player.mana + food.value);
        else if (food.kind === "heal") player.heal(food.value);
        spawnParticles(food.x, food.y, food.color, 5);
        foods.splice(f, 1); foods.push(spawnFood());
      }
    }
  }

  function gainXP(amt) {
    xp += amt;
    while (xp >= xpToNext && pendingLevelUps < 6) {
      xp -= xpToNext; level++;
      xpToNext = Math.floor(CFG.xpBase + level * 14 + level * level * 1.1);
      pendingLevelUps++;
    }
    updateHUD();
    if (pendingLevelUps > 0 && !isDraftOpen()) showDraft();
  }

  function isDraftOpen() { const el = $("levelup-overlay"); return el && !el.classList.contains("hidden"); }

  // ============================================================
  // KILL / COMBO
  // ============================================================
  function killEnemy(e) {
    spawnParticles(e.x, e.y, e.color, 16);
    shake = Math.max(shake, e.type === "boss" ? 16 : 6);
    decals.push({ x: e.x, y: e.y, r: e.radius * 0.8, life: 1, color: "rgba(43,29,18,0.12)" });
    statKills++;
    combo++; comboTimer = 3000;
    statMaxCombo = Math.max(statMaxCombo, combo);
    if (combo >= 3) showCombo();
    const bounty = Math.floor(e.xpValue * (1 + combo * 0.05));
    gainXP(bounty);
    addPopup(e.x, e.y, `+${bounty}xp`, "#e8b86a");
    if (player && player.alive) {
      const stolen = Math.floor(e.maxHP * player.lifeSteal * 0.5);
      if (stolen > 0) player.heal(stolen);
    }
    for (let k = 0; k < 2; k++) foods.push({ x: e.x + rand(-20, 20), y: e.y + rand(-20, 20), color: randColor(), kind: "xp", pulse: 0, value: 6 });
    if (e.type === "boss") {
      for (let k = 0; k < 6; k++) foods.push({ x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), color: "#4da6ff", kind: "mana", pulse: 0, value: 20 });
      for (let k = 0; k < 3; k++) foods.push({ x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), color: "#ff6b6b", kind: "heal", pulse: 0, value: 25 });
    }
  }

  function diePlayer() {
    if (!player) return;
    spawnParticles(player.x, player.y, player.color, 30);
    shake = Math.max(shake, 14);
    decals.push({ x: player.x, y: player.y, r: player.radius, life: 1, color: "rgba(124,92,191,0.2)" });
    setTimeout(() => endGame(), 600);
  }

  // ============================================================
  // ENEMY WAVES
  // ============================================================
  function spawnWave() {
    waveNum++;
    waveTimer = CFG.waveInterval;
    const base = 4 + waveNum * 2;
    const count = Math.min(base, 30);
    const types = ["grunt", "grunt", "grunt", "ranged", "tank", "swarm"];
    const names = ["Goblin", "Slime", "Imp", "Wisp", "Shade", "Creep", "Blight", "Murk", "Thorn", "Rift"];
    for (let i = 0; i < count; i++) {
      const t = types[randInt(0, types.length - 1)];
      const hpMult = 1 + waveNum * 0.12;
      const hp = (t === "tank" ? 60 : t === "boss" ? 400 : t === "swarm" ? 15 : 30) * hpMult;
      const dmg = (t === "tank" ? 10 : t === "ranged" ? 7 : 5) * (1 + waveNum * 0.05);
      const spd = t === "swarm" ? 3.2 : (t === "tank" ? 1.2 : 2.0);
      const colors = { grunt: "#7c3aed", ranged: "#ff6b3d", tank: "#8b6914", swarm: "#4da6ff" };
      const ang = rand(0, Math.PI * 2);
      const r = rand(world.w * 0.35, world.w * 0.5);
      const ex = clamp(world.w / 2 + Math.cos(ang) * r, 50, world.w - 50);
      const ey = clamp(world.h / 2 + Math.sin(ang) * r, 50, world.h - 50);
      enemies.push(new Enemy(ex, ey, hp, dmg, spd, colors[t], names[randInt(0, names.length - 1)], t));
    }
    if (waveNum % 5 === 0) spawnBoss();
  }

  function spawnBoss() {
    bossTimer = CFG.bossInterval;
    const hpMult = 1 + waveNum * 0.15;
    const hp = 350 * hpMult;
    const dmg = 18 * (1 + waveNum * 0.06);
    const names = ["Void Witch", "Shadow Lord", "Flame Serpent", "Frost Giant", "Stone Golem", "StormCaller"];
    const colors = ["#ff4444", "#7c3aed", "#ff6b3d", "#4da6ff", "#8b6914", "#d4b8ff"];
    const idx = nextBossId++ % names.length;
    const ang = rand(0, Math.PI * 2);
    const ex = world.w / 2 + Math.cos(ang) * world.w * 0.4;
    const ey = world.h / 2 + Math.sin(ang) * world.h * 0.4;
    enemies.push(new Enemy(clamp(ex, 100, world.w - 100), clamp(ey, 100, world.h - 100), hp, dmg, 1.8, colors[idx], names[idx], "boss"));
  }

  // ============================================================
  // PARTICLES / POPUPS / DECALS / SIGILS
  // ============================================================
  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1.5, 8);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rand(0.025, 0.055), color, size: rand(2, 5.5) });
    }
  }

  function addPopup(x, y, text, color) { popups.push({ x, y, text, color, life: 1 }); }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life -= p.decay; if (p.life <= 0) particles.splice(i, 1); }
    for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.y -= 0.6; p.life -= 0.018; if (p.life <= 0) popups.splice(i, 1); }
    for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i]; d.life -= 0.006; if (d.life <= 0) decals.splice(i, 1); }
  }

  function spawnSigil(x, y, alpha, color) { decals.push({ x, y, r: 38, life: 1, color: color || "rgba(124,92,191,0.18)", sigil: true, rot: Math.random() * Math.PI }); }

  // ============================================================
  // DRAFT (Vampire Survivors / Holocure style)
  // ============================================================
  function showDraft() {
    const overlay = $("levelup-overlay"), box = $("draft-options");
    if (!overlay || !box) return;
    const pool = buildDraftPool();
    box.innerHTML = "";
    pool.forEach(card => {
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

  function buildDraftPool() {
    const pool = [];
    const elemKeys = Object.keys(ELEMENTS);
    for (const ek of elemKeys) {
      pool.push({
        icon: ELEMENTS[ek].icon, name: ELEMENTS[ek].name, desc: ELEMENTS[ek].desc, tag: "Element",
        apply: () => { if (player) player.addElement(ek); }
      });
    }
    const passiveKeys = Object.keys(PASSIVES);
    const shuffledPassives = passiveKeys.sort(() => Math.random() - 0.5).slice(0, 3);
    for (const pk of shuffledPassives) {
      const pa = PASSIVES[pk];
      pool.push({
        icon: pa.icon, name: pa.name, desc: pa.desc, tag: "Passive",
        apply: () => { if (player) player.addPassive(pk); }
      });
    }
    pool.push({ icon: "❤️", name: "Heal", desc: "Restore 35% max HP", tag: "Recovery", apply: () => { if (player) player.heal(player.maxHP * 0.35); } });
    pool.push({ icon: "💧", name: "Mana Surge", desc: "Restore full mana", tag: "Recovery", apply: () => { if (player) player.mana = player.maxMana; } });
    return pool.sort(() => Math.random() - 0.5).slice(0, 3);
  }

  // ============================================================
  // UI
  // ============================================================
  function updateHUD() {
    if (!player) return;
    $("level-badge").textContent = `Lv ${level}`;
    $("hp-fill").style.width = (player.hp / player.maxHP * 100) + "%";
    $("mana-fill").style.width = (player.mana / player.maxMana * 100) + "%";
    $("wave-display").textContent = `Wave ${waveNum}`;
    const elapsed = Math.floor(gameTime / 1000);
    const remain = Math.max(0, Math.floor((CFG.runDuration - gameTime) / 1000));
    $("timer-display").textContent = `${Math.floor(remain / 60)}:${(remain % 60).toString().padStart(2, "0")}`;
    updateSpellUI();
  }

  function updateSpellUI() {
    if (!player) return;
    const slots = document.querySelectorAll(".spell-slot");
    slots.forEach((slot, idx) => {
      const sp = player.spells[idx];
      if (!sp) { slot.style.opacity = "0.25"; slot.querySelector(".spell-icon").textContent = "—"; slot.querySelector(".spell-key").textContent = ""; return; }
      const onCd = sp.timer > 0;
      const pct = onCd ? (sp.timer / (sp.cd * player.cdMult) * 100) : 0;
      slot.style.opacity = onCd ? "0.46" : "1";
      slot.style.setProperty("--cd", String(pct));
      slot.querySelector(".spell-icon").textContent = ELEMENTS[sp.elem].icon;
      slot.querySelector(".spell-key").textContent = `${sp.level}`;
      slot.style.borderColor = ELEMENTS[sp.elem].color;
    });
    if (player.comboWeapon) {
      $("combo-weapon").textContent = player.comboWeapon.name;
      $("combo-weapon-icon").textContent = player.comboWeapon.icon;
      $("combo-weapon").parentElement.classList.remove("hidden");
    }
  }

  function showCombo() {
    const el = $("combo-display");
    $("combo-text").textContent = `${combo}x Combo!`;
    el.classList.remove("hidden"); clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => el.classList.add("hidden"), 1200);
  }

  function updateLeaderboard() {
    const list = $("leaderboard-list"); if (!list) return;
    const sorted = [...enemies].filter(e => e.alive).sort((a, b) => b.hp - a.hp).slice(0, 8);
    list.innerHTML = "";
    if (player && player.alive) {
      const li = document.createElement("li"); li.classList.add("me");
      li.innerHTML = `<span>${esc(player.name)}</span><span>${Math.floor(player.hp)}</span>`;
      list.appendChild(li);
    }
    sorted.forEach(e => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${esc(e.name)}</span><span>${Math.floor(e.hp)}</span>`;
      list.appendChild(li);
    });
  }

  function updateMinimap() {
    const mc = $("minimap-canvas"), mctx = mc ? mc.getContext("2d") : null;
    if (!mc || !mctx) return;
    const w = mc.width, h = mc.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "rgba(253,246,227,0.96)"; mctx.fillRect(0, 0, w, h);
    mctx.strokeStyle = "rgba(43,29,18,0.18)"; mctx.lineWidth = 1; mctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    const sx = w / world.w, sy = h / world.h;
    mctx.fillStyle = "rgba(124,92,191,0.18)";
    for (let i = 0; i < foods.length; i += 8) { const f = foods[i]; mctx.fillRect(f.x * sx, f.y * sy, 1, 1); }
    for (const e of enemies) { if (!e.alive) continue; mctx.beginPath(); mctx.arc(e.x * sx, e.y * sy, Math.max(1.5, e.radius * sx * 0.35), 0, Math.PI * 2); mctx.fillStyle = e.type === "boss" ? "#ff4444" : e.color; mctx.fill(); }
    if (player && player.alive) { mctx.beginPath(); mctx.arc(player.x * sx, player.y * sy, 2.5, 0, Math.PI * 2); mctx.fillStyle = "#2b1d12"; mctx.fill(); mctx.strokeStyle = "#fffaf0"; mctx.lineWidth = 1; mctx.stroke(); }
  }

  // ============================================================
  // CAMERA
  // ============================================================
  function visibleW() { return view.w / (view.scale * view.userZoom); }
  function visibleH() { return view.h / (view.scale * view.userZoom); }

  function updateCamera() {
    const follow = player && player.alive ? player : null;
    if (!follow) return;
    view.targetScale = clamp(1 / Math.pow(Math.max(22, follow.hp) / 30, 0.18), 0.52, 1.05);
    const tx = follow.x - visibleW() / 2, ty = follow.y - visibleH() / 2;
    camera.x = lerp(camera.x, tx, 0.1);
    camera.y = lerp(camera.y, ty, 0.1);
    view.scale = lerp(view.scale, view.targetScale, 0.04);
  }

  function worldTransform() {
    const sc = view.scale * view.userZoom * dpr;
    const shx = (Math.random() - 0.5) * shake, shy = (Math.random() - 0.5) * shake;
    ctx.setTransform(sc, 0, 0, sc, (-camera.x + shx) * sc, (-camera.y + shy) * sc);
  }

  function screenTransform() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

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

  const mouse = { x: 0, y: 0 };

  function driveInputs() {
    if (!player || !player.alive) return;
    player.input = getPlayerInput();
  }

  // ============================================================
  // RENDER
  // ============================================================
  function inView(x, y, r) { return x + r > camera.x && x - r < camera.x + visibleW() && y + r > camera.y && y - r < camera.y + visibleH(); }

  function drawAtelierGrid() {
    const sx = view.scale * view.userZoom;
    const left = camera.x - 60, top = camera.y - 60, right = camera.x + visibleW() + 60, bottom = camera.y + visibleH() + 60;
    ctx.fillStyle = "#fdf6e3"; ctx.fillRect(left, top, right - left, bottom - top);
    ctx.fillStyle = "rgba(212,184,255,0.06)"; ctx.beginPath(); ctx.ellipse(world.w * 0.28, world.h * 0.32, 480, 360, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(232,184,106,0.05)"; ctx.beginPath(); ctx.ellipse(world.w * 0.72, world.h * 0.70, 560, 400, -0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(138,180,160,0.05)"; ctx.beginPath(); ctx.ellipse(world.w * 0.62, world.h * 0.22, 420, 300, 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(43,29,18,0.05)"; ctx.lineWidth = 1 / sx;
    const g = 120;
    ctx.beginPath();
    for (let x = Math.floor(left / g) * g; x <= right; x += g) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    for (let y = Math.floor(top / g) * g; y <= bottom; y += g) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(43,29,18,0.35)"; ctx.lineWidth = 2.5 / sx; ctx.strokeRect(0, 0, world.w, world.h);
  }

  function drawPlayer() {
    if (!player || !player.alive) return;
    const r = player.radius, wob = Math.sin(player.wobble) * 1.4;
    const now = Date.now();
    ctx.save();
    if (now < player.iFrameUntil) ctx.globalAlpha = 0.35;

    if (player.shieldActive && player.shieldHp > 0) {
      ctx.beginPath(); ctx.arc(player.x, player.y, r + 12, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(124,92,191,0.85)"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "rgba(124,92,191,0.1)"; ctx.fill();
      for (let i = 0; i < 3; i++) { const a = gameTime * 0.0015 + i * 2.09; const rx = player.x + Math.cos(a) * (r + 12), ry = player.y + Math.sin(a) * (r + 12); ctx.beginPath(); ctx.arc(rx, ry, 2.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(124,92,191,0.85)"; ctx.fill(); }
    }

    ctx.beginPath(); ctx.ellipse(player.x, player.y + r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(43,29,18,0.12)"; ctx.fill();
    ctx.beginPath(); ctx.arc(player.x, player.y, r + wob, 0, Math.PI * 2);
    const bodyGrad = ctx.createRadialGradient(player.x - r * 0.2, player.y - r * 0.2, r * 0.1, player.x, player.y, r + wob);
    bodyGrad.addColorStop(0, player.color); bodyGrad.addColorStop(1, adjustColor(player.color, -20));
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

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawWitchHat(cx, cy, r) {
    const h = r * 1.1, brimW = r * 1.5, brimH = r * 0.26;
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.22, brimW, brimH, 0, 0, Math.PI * 2); ctx.fillStyle = "#1f140f"; ctx.fill(); ctx.strokeStyle = "rgba(253,246,227,0.2)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - brimW * 0.4, cy + h * 0.22);
    ctx.quadraticCurveTo(cx - r * 0.16, cy - h * 0.52, cx + r * 0.06, cy - h * 0.58);
    ctx.quadraticCurveTo(cx + r * 0.3, cy - h * 0.16, cx + brimW * 0.4, cy + h * 0.22);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - brimW, cy - h * 0.6, cx + brimW, cy);
    g.addColorStop(0, "#2b1d12"); g.addColorStop(1, "#3d281c"); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "#c9a86a"; ctx.fillRect(cx - brimW * 0.36, cy + h * 0.02, brimW * 0.72, Math.max(2, r * 0.09));
    ctx.fillStyle = "#fff6d6"; ctx.beginPath();
    const bx = cx, by = cy + h * 0.065, s = r * 0.09;
    for (let i = 0; i < 5; i++) { const a = i * 1.256 - Math.PI / 2; const rx = Math.cos(a) * s, ry = Math.sin(a) * s; i === 0 ? ctx.moveTo(bx + rx, by + ry) : ctx.lineTo(bx + rx, by + ry); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#c9a86a"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + r * 0.06, cy - h * 0.58, r * 0.07, 0, Math.PI * 2); ctx.fillStyle = "#1f140f"; ctx.fill();
  }

  function adjustColor(hex, amount) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = clamp(((num >> 16) & 0xff) + amount, 0, 255);
    const g = clamp(((num >> 8) & 0xff) + amount, 0, 255);
    const b = clamp((num & 0xff) + amount, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function drawSigilCircle(x, y, rad, rot, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = color || "rgba(43,29,18,0.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, rad * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) { const a = i * 1.047; ctx.beginPath(); ctx.moveTo(Math.cos(a) * rad * 0.6, Math.sin(a) * rad * 0.6); ctx.lineTo(Math.cos(a) * rad * 0.7, Math.sin(a) * rad * 0.7); ctx.stroke(); }
    ctx.restore();
  }

  function drawFoodList() {
    const t = performance.now() * 0.0015;
    for (const f of foods) {
      if (!inView(f.x, f.y, 16)) continue;
      const pulse = Math.sin(t * 1.9 + f.pulse) * 1.2;
      const colors = { xp: f.color, mana: "#4da6ff", heal: "#ff6b6b" };
      ctx.beginPath(); ctx.arc(f.x, f.y, 6 + pulse * 0.3, 0, Math.PI * 2);
      const glow = f.kind === "xp" ? "rgba(212,184,255,0.18)" : (f.kind === "mana" ? "rgba(77,166,255,0.2)" : "rgba(255,107,107,0.2)");
      ctx.fillStyle = glow; ctx.fill();
      ctx.beginPath(); ctx.arc(f.x, f.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = colors[f.kind]; ctx.fill();
      ctx.strokeStyle = "rgba(43,29,18,0.15)"; ctx.lineWidth = 0.8; ctx.stroke();
      if (f.kind !== "xp") { ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.beginPath(); ctx.arc(f.x - 1, f.y - 1.2, 1, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      if (!inView(p.x, p.y, 20)) continue;
      for (const tr of p.trail) { ctx.globalAlpha = tr.life * 0.2; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(tr.x, tr.y, p.r * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(p.x - 1, p.y - 1, p.r * 0.2, p.x, p.y, p.r);
      g.addColorStop(0, "#fffaf0"); g.addColorStop(1, p.color);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "rgba(43,29,18,0.2)"; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawDecals() {
    for (const d of decals) {
      ctx.globalAlpha = d.life * 0.85;
      if (d.sigil) { drawSigilCircle(d.x, d.y, d.r, d.rot + gameTime * 0.0005, d.color); }
      else { ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of particles) { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "800 14px system-ui,sans-serif";
    for (const p of popups) { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.strokeStyle = "rgba(253,246,227,0.9)"; ctx.lineWidth = 2.5; ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1;
  }

  function drawJoystick() {
    if (!joy.active) return;
    screenTransform();
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, joy.maxR, 0, Math.PI * 2); ctx.fillStyle = "rgba(253,246,227,0.65)"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "#2b1d12"; ctx.stroke();
    const kx = joy.ox + joy.vector.x * joy.maxR, ky = joy.oy + joy.vector.y * joy.maxR;
    ctx.beginPath(); ctx.arc(kx, ky, 24, 0, Math.PI * 2); ctx.fillStyle = "#fffaf0"; ctx.fill(); ctx.strokeStyle = "#2b1d12"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#2b1d12"; ctx.font = "13px system-ui"; ctx.textAlign = "center"; ctx.fillText("✦", kx, ky + 5);
    worldTransform();
  }

  function drawAimLine() {
    if (!player || !player.alive || !aim.active) return;
    const ang = aimDir(player);
    ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = "#7c5cbf"; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(player.x + Math.cos(ang) * (player.radius + 8), player.y + Math.sin(ang) * (player.radius + 8));
    ctx.lineTo(player.x + Math.cos(ang) * 80, player.y + Math.sin(ang) * 80); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================
  function loop(ts) {
    if (!running || paused) return;
    const dt = Math.min(32, ts - lastTime); lastTime = ts; gameTime += dt;
    runTimer += dt;
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
    if (shake > 0) shake = Math.max(0, shake - dt * 0.025);

    waveTimer -= dt;
    if (waveTimer <= 0) spawnWave();

    if (runTimer >= CFG.runDuration && !enemies.some(e => e.alive && e.type === "boss")) { winGame(); return; }

    driveInputs();
    player.update(dt);
    for (const e of enemies) e.update(dt);
    eatFood();
    handleCollisions();
    tickProjectiles(dt);
    updateParticles(dt);
    if (player && player.alive) {
      if (gameTime % 200 < dt) decals.push({ x: player.x, y: player.y, r: 6, life: 0.6, color: "rgba(43,29,18,0.06)" });
    }
    updateCamera();
    updateSpellUI();

    screenTransform(); ctx.clearRect(0, 0, view.w, view.h);
    worldTransform();
    drawAtelierGrid();
    drawDecals();
    drawFoodList();
    drawAimLine();
    for (const e of enemies) { if (e.alive && inView(e.x, e.y, e.radius + 30)) e.draw(); }
    drawPlayer();
    drawProjectiles();
    drawParticles(); drawPopups();
    drawJoystick();

    updateHUD(); updateLeaderboard(); updateMinimap();

    animationId = requestAnimationFrame(loop);
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
        const dmg = e.dmg * 0.5;
        player.takeDamage(dmg);
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        const push = (player.radius + e.radius - d) * 0.5;
        player.x += Math.cos(a) * push; player.y += Math.sin(a) * push;
      }
    }
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i], b = enemies[j];
        if (!a.alive || !b.alive) continue;
        const d = dist(a, b);
        if (d < a.radius + b.radius) {
          const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
          const ax = a.x - midx, ay = a.y - midy, m = Math.hypot(ax, ay) || 1;
          const push = (a.radius + b.radius - d) * 0.3 + 0.3;
          a.x += (ax / m) * push; a.y += (ay / m) * push;
          b.x -= (ax / m) * push; b.y -= (ay / m) * push;
        }
      }
    }
  }

  // ============================================================
  // START / END
  // ============================================================
  function startGame(selMode) {
    mode = selMode;
    const fc = CFG.foodCount[difficulty] || 440;
    world = { ...CFG.world };
    foods = []; for (let i = 0; i < fc; i++) foods.push(spawnFood());
    enemies = []; projectiles = []; particles = []; popups = []; decals = []; traps = [];
    player = null; gameTime = 0; runTimer = 0;
    waveNum = 0; waveTimer = 2000; bossTimer = CFG.bossInterval;
    nextBossId = 1; combo = 0; comboTimer = 0;
    statKills = 0; statDmgDealt = 0; statSpells = 0; statMaxCombo = 0;
    xp = 0; level = 1; xpToNext = CFG.xpBase; pendingLevelUps = 0;

    const n1 = ($("name-input").value || "Witch").trim().slice(0, 16) || "Witch";
    player = new Player(rand(200, world.w - 200), rand(200, world.h - 200), n1, "#d4b8ff");
    player.addElement("fire");

    camera = { x: world.w / 2 - visibleW() / 2, y: world.h / 2 - visibleH() / 2 };
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
    $("final-score").textContent = Math.floor(player ? player.hp : 0);
    $("stat-time").textContent = `${m}:${s.toString().padStart(2, "0")}`;
    $("stat-kills").textContent = statKills;
    $("stat-combo").textContent = statMaxCombo;
    $("stat-waves").textContent = waveNum;
    $("end-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
  }

  function winGame() {
    running = false;
    $("final-score").textContent = "VICTORY!";
    $("stat-time").textContent = "20:00";
    $("stat-kills").textContent = statKills;
    $("stat-combo").textContent = statMaxCombo;
    $("stat-waves").textContent = waveNum;
    $("end-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden");
  }

  // ============================================================
  // NET
  // ============================================================
  function witchConnect(url) {
    try {
      mode = "net";
      net.ws = new WebSocket(url);
      net.ws.onopen = () => {
        net.connected = true;
        const name = ($("name-input").value || "Witch").trim().slice(0, 16) || "Witch";
        net.ws.send(JSON.stringify({ type: "join", name, color: "#d4b8ff" }));
      };
      net.ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "welcome") {
          net.id = msg.id; world = { w: msg.world.w, h: msg.world.h };
          $("start-screen").classList.add("hidden"); $("hud").classList.remove("hidden");
          if (isTouch) $("mobile-controls").classList.remove("hidden");
          camera = { x: world.w / 2 - visibleW() / 2, y: world.h / 2 - visibleH() / 2 };
          running = true; paused = false; lastTime = performance.now();
          cancelAnimationFrame(animationId); animationId = requestAnimationFrame(loop);
        } else if (msg.type === "state") {
          world = { w: msg.world.w, h: msg.world.h };
          const seen = new Set();
          for (const b of (msg.blobs || [])) {
            seen.add(b.id);
            let blob = net.byId.get(b.id);
            if (!blob) { blob = new Player(b.x, b.y, b.n, b.c); blob._netId = b.id; net.byId.set(b.id, blob); }
            blob.x = b.x; blob.y = b.y; blob.hp = b.m; blob.color = b.c; blob.name = b.n; blob.alive = b.a === 1; blob.isPlayer = b.id === net.id;
          }
          for (const id of [...net.byId.keys()]) if (!seen.has(id)) net.byId.delete(id);
          enemies = [...net.byId.values()].filter(b => !b.isPlayer);
          player = net.byId.get(net.id) || null;
        }
      };
      net.ws.onclose = () => { net.connected = false; if (mode === "net") { running = false; } };
    } catch (e) { console.error("Connect failed:", e); }
  }

  function sendNetInput() {
    if (!net.ws || net.ws.readyState !== 1 || !player) return;
    const now = Date.now(); if (now - net.lastSent < 50) return; net.lastSent = now;
    const inp = getPlayerInput();
    net.ws.send(JSON.stringify({ type: "input", x: +inp.x.toFixed(3), y: +inp.y.toFixed(3) }));
  }

  window.witchConnect = witchConnect;

  // ============================================================
  // RESIZE
  // ============================================================
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.w = window.innerWidth; view.h = window.innerHeight;
    canvas.style.width = view.w + "px"; canvas.style.height = view.h + "px";
    canvas.width = Math.floor(view.w * dpr); canvas.height = Math.floor(view.h * dpr);
    joy.maxR = clamp(Math.min(view.w, view.h) * 0.16, 56, 90); joy.dead = joy.maxR * 0.18;
  }
  window.addEventListener("resize", resize);

  // ============================================================
  // POINTER (joystick + aim)
  // ============================================================
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "net" && (!player || !player.alive)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const isRight = e.clientX >= view.w * 0.5;
    if (isRight && isTouch) {
      aim.active = true; aim.x = e.clientX; aim.y = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch {} e.preventDefault();
    } else if (!isRight && !joy.active) {
      joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.vector.x = 0; joy.vector.y = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch {} e.preventDefault();
    } else if (!isTouch) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      aim.active = true; aim.x = e.clientX; aim.y = e.clientY;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (joy.active && e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d < joy.dead) { joy.vector.x = 0; joy.vector.y = 0; return; }
      const norm = (Math.min(d, joy.maxR) - joy.dead) / (joy.maxR - joy.dead);
      const curve = norm * norm;
      joy.vector.x = (dx / (d || 1)) * curve; joy.vector.y = (dy / (d || 1)) * curve;
      e.preventDefault(); return;
    }
    if (aim.active) { aim.x = e.clientX; aim.y = e.clientY; e.preventDefault(); return; }
    if (!isTouch) { mouse.x = e.clientX; mouse.y = e.clientY; }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (joy.active && e.pointerId === joy.id) { joy.active = false; joy.id = null; joy.vector.x = 0; joy.vector.y = 0; if (player) player.input = { x: 0, y: 0 }; }
    if (aim.active && pointers.size === 0) aim.active = false;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.style.touchAction = "none";

  // ============================================================
  // KEYBOARD
  // ============================================================
  document.addEventListener("keydown", (e) => {
    if (!running) return;
    if (isDraftOpen()) return;
    switch (e.key.toLowerCase()) {
      case "1": castSpell(0); break;
      case "2": castSpell(1); break;
      case "3": castSpell(2); break;
      case "4": castSpell(3); break;
      case "5": castSpell(4); break;
      case "6": castSpell(5); break;
      case " ": doDodge(); e.preventDefault(); break;
      case "e": case "shift": toggleShield(); break;
      case "escape": case "p": togglePause(); break;
    }
  });

  function togglePause() {
    if (isDraftOpen()) return;
    paused = !paused;
    $("pause-menu").classList.toggle("hidden", !paused);
    if (!paused) { lastTime = performance.now(); animationId = requestAnimationFrame(loop); }
  }

  $("resume-btn")?.addEventListener("click", togglePause);
  $("quit-btn")?.addEventListener("click", () => {
    running = false; paused = false;
    if (net.ws) try { net.ws.close(); } catch {}
    $("pause-menu").classList.add("hidden"); $("end-screen").classList.add("hidden"); $("levelup-overlay").classList.add("hidden");
    $("start-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden");
  });
  $("play-solo")?.addEventListener("click", () => startGame("single"));
  $("play-online")?.addEventListener("click", () => $("online-options").classList.toggle("hidden"));
  $("connect-online-btn")?.addEventListener("click", () => {
    const url = ($("server-input").value || "ws://127.0.0.1:3000").trim();
    witchConnect(url);
  });
  $("restart-btn")?.addEventListener("click", () => {
    $("end-screen").classList.add("hidden"); $("start-screen").classList.remove("hidden");
  });
  document.querySelectorAll(".diff-btn").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".diff-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); difficulty = b.dataset.diff;
  }));
  $("name-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") startGame("single"); });

  $("dodge-btn")?.addEventListener("pointerdown", (e) => { e.preventDefault(); doDodge(); });
  $("shield-btn")?.addEventListener("pointerdown", (e) => { e.preventDefault(); toggleShield(); });

  document.querySelectorAll(".spell-btn").forEach((btn, idx) => {
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); if (isDraftOpen()) return; castSpell(idx); });
  });

  resize(); updateHUD();
})();
