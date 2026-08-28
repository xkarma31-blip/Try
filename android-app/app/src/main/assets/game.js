/**
 * Witch.io — a magical .io arena game
 * Features: spells, dash, mobile joystick, minimap, combos, difficulty levels
 */
(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================
  const CONFIG = {
    world: { w: 4000, h: 4000 },
    foodRadius: 6,
    startMass: 30,
    botCount: { easy: 12, medium: 18, hard: 25 },
    foodCount: { easy: 400, medium: 600, hard: 800 },
    tickRate: 60,
    spellCooldowns: { surge: 8000, ward: 12000, magnet: 10000, dash: 3000, vanish: 15000, blast: 10000 },
  };

  const SPELLS = {
    surge:  { name: "Surge",  icon: "⚡", cooldown: 8000,  dur: 3000 },
    ward:   { name: "Ward",   icon: "🛡️", cooldown: 12000, dur: 2500 },
    magnet: { name: "Magnet", icon: "🧲", cooldown: 10000, dur: 4000 },
    dash:   { name: "Dash",   icon: "💨", cooldown: 3000,  dur: 200  },
    vanish: { name: "Vanish", icon: "🔮", cooldown: 15000, dur: 3000 },
    blast:  { name: "Blast",  icon: "💣", cooldown: 10000, dur: 0    },
  };

  // ============================================================
  // STATE
  // ============================================================
  let world = { ...CONFIG.world };
  let difficulty = "easy";
  let mode = "single";
  let running = false;
  let paused = false;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let view = { w: 0, h: 0, scale: 1, targetScale: 1 };
  let camera = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, down: false };

  let foods = [];
  let blobs = [];
  let players = [];
  let player = null;
  let effects = [];
  let particles = [];

  const joy = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };
  const joyOrigin = { p1: null, p2: null };

  let combo = 0;
  let comboTimer = 0;
  let gameTime = 0;
  let statEaten = 0;
  let statSpells = 0;
  let statMaxPower = 0;

  let activeSpells = {};
  let spellCooldowns = {};

  let animationId = null;
  let lastTime = 0;

  const net = {
    ws: null, id: null, connected: false,
    blobs: new Map(), foods: [],
    self: null, predicted: { x: 0, y: 0 }, predInit: false, lastSent: 0,
  };

  // ============================================================
  // UTILITIES
  // ============================================================
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randColor = () => `hsl(${Math.floor(rand(240, 320))}, 70%, 60%)`;
  const massToRadius = (mass) => Math.max(14, Math.sqrt(mass) * 5);
  const speedFor = (mass) => 3.6 * Math.pow(30 / (mass + 30), 0.4);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ============================================================
  // SPELL SYSTEM
  // ============================================================
  function castSpell(spellKey) {
    if (!player || !player.alive) return;
    if (spellCooldowns[spellKey] && Date.now() < spellCooldowns[spellKey]) return;
    const spell = SPELLS[spellKey];
    if (!spell) return;

    spellCooldowns[spellKey] = Date.now() + spell.cooldown;
    statSpells++;

    switch (spellKey) {
      case "surge":
        activeSpells.surge = Date.now() + spell.dur;
        break;
      case "ward":
        activeSpells.ward = Date.now() + spell.dur;
        break;
      case "magnet":
        activeSpells.magnet = Date.now() + spell.dur;
        break;
      case "dash":
        performDash();
        break;
      case "vanish":
        activeSpells.vanish = Date.now() + spell.dur;
        break;
      case "blast":
        performBlast();
        break;
    }
    updateSpellUI();
  }

  function performDash() {
    const inp = getPlayerInput();
    const m = Math.hypot(inp.x, inp.y);
    if (m < 0.1) return;
    const dashDist = 200;
    player.x += (inp.x / m) * dashDist;
    player.y += (inp.y / m) * dashDist;
    player.x = clamp(player.x, player.radius, world.w - player.radius);
    player.y = clamp(player.y, player.radius, world.h - player.radius);
    spawnParticles(player.x, player.y, "#d4b8ff", 12);
  }

  function performBlast() {
    const blastRadius = 200;
    const pushForce = 300;
    for (const blob of blobs) {
      if (blob === player || !blob.alive) continue;
      const d = dist(blob, player);
      if (d < blastRadius) {
        const angle = Math.atan2(blob.y - player.y, blob.x - player.x);
        const strength = (1 - d / blastRadius) * pushForce;
        blob.x += Math.cos(angle) * strength;
        blob.y += Math.sin(angle) * strength;
        blob.target = null;
      }
    }
    spawnParticles(player.x, player.y, "#ff6b6b", 20);
  }

  function getSpellSpeedMultiplier() {
    return activeSpells.surge && Date.now() < activeSpells.surge ? 1.8 : 1.0;
  }

  function isShielded() {
    return activeSpells.ward && Date.now() < activeSpells.ward;
  }

  function isInvisible() {
    return activeSpells.vanish && Date.now() < activeSpells.vanish;
  }

  function isMagnetActive() {
    return activeSpells.magnet && Date.now() < activeSpells.magnet;
  }

  // ============================================================
  // PARTICLES & EFFECTS
  // ============================================================
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2, 8);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: rand(0.02, 0.05),
        color,
        size: rand(2, 6),
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    const s = view.scale;
    ctx.save();
    ctx.scale(s, s);
    ctx.translate(-camera.x, -camera.y);
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ============================================================
  // BLOB CLASS
  // ============================================================
  class Blob {
    constructor(x, y, mass, color, name, isPlayer = false) {
      this.x = x; this.y = y;
      this.mass = mass;
      this.color = color;
      this.name = name;
      this.isPlayer = isPlayer;
      this.alive = true;
      this.input = { x: 0, y: 0 };
      this.vx = 0; this.vy = 0;
      this.target = null;
      this.wobble = rand(0, Math.PI * 2);
    }

    get radius() { return massToRadius(this.mass); }

    update() {
      const r = this.radius;
      let baseSpeed = speedFor(this.mass) * getSpellSpeedMultiplier();

      if (this.isPlayer) {
        const inp = this.input || { x: 0, y: 0 };
        const m = Math.hypot(inp.x, inp.y);
        if (m > 0.001) {
          const sp = Math.min(baseSpeed, baseSpeed * Math.min(1, m));
          this.vx = (inp.x / m) * sp;
          this.vy = (inp.y / m) * sp;
        } else {
          this.vx = this.vy = 0;
        }
      } else {
        this.think();
        const tx = this.target ? this.target.x : this.x;
        const ty = this.target ? this.target.y : this.y;
        const dx = tx - this.x, dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          const sp = Math.min(baseSpeed, d * 0.08);
          this.vx = (dx / d) * sp;
          this.vy = (dy / d) * sp;
        } else {
          this.vx = this.vy = 0;
        }
      }

      this.x += this.vx;
      this.y += this.vy;
      this.x = clamp(this.x, r, world.w - r);
      this.y = clamp(this.y, r, world.h - r);
      this.wobble += 0.05;
    }

    think() {
      if (!this.target || Math.random() < 0.02) {
        const angle = rand(0, Math.PI * 2);
        const reach = rand(200, 700);
        this.target = {
          x: clamp(this.x + Math.cos(angle) * reach, 0, world.w),
          y: clamp(this.y + Math.sin(angle) * reach, 0, world.h),
        };
      }

      let threat = null, prey = null, bestPreyDist = Infinity;
      for (const other of blobs) {
        if (other === this || !other.alive) continue;
        const d = dist(this, other);
        if (d > 600) continue;
        if (other.mass > this.mass * 1.15) {
          if (!threat || d < dist(this, threat)) threat = other;
        } else if (this.mass > other.mass * 1.15) {
          if (d < bestPreyDist) { prey = other; bestPreyDist = d; }
        }
      }

      if (threat) {
        const ax = this.x - threat.x, ay = this.y - threat.y;
        const m = Math.hypot(ax, ay) || 1;
        this.target = { x: this.x + (ax / m) * 400, y: this.y + (ay / m) * 400 };
      } else if (prey) {
        this.target = { x: prey.x, y: prey.y };
      }
    }

    draw() {
      const sx = this.x - camera.x;
      const sy = this.y - camera.y;
      const r = this.radius;
      const wobble = Math.sin(this.wobble) * 2;

      // Shield effect
      if (this.isPlayer && isShielded()) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 10, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(100, 200, 255, 0.6)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx, sy, r + 10, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100, 200, 255, 0.1)";
        ctx.fill();
      }

      // Invisibility
      if (this.isPlayer && isInvisible()) {
        ctx.globalAlpha = 0.3;
      }

      // Player glow
      if (this.isPlayer) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(212, 184, 255, 0.8)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Body
      ctx.beginPath();
      ctx.arc(sx, sy, r + wobble, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();

      // Highlight
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.25, 0, Math.PI * 2);
      ctx.fill();

      // Name
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(12, r * 0.35)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(this.name, sx, sy);
      ctx.fillText(this.name, sx, sy);

      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // FOOD
  // ============================================================
  function spawnFood() {
    return { x: rand(0, world.w), y: rand(0, world.h), color: randColor() };
  }

  function drawFood(foodList) {
    const s = view.scale;
    ctx.save();
    ctx.scale(s, s);
    ctx.translate(-camera.x, -camera.y);
    for (const food of foodList) {
      const fx = Array.isArray(food) ? food[0] : food.x;
      const fy = Array.isArray(food) ? food[1] : food.y;
      const fc = Array.isArray(food) ? food[2] : food.color;
      ctx.beginPath();
      ctx.arc(fx, fy, CONFIG.foodRadius, 0, Math.PI * 2);
      ctx.fillStyle = fc;
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================
  // COLLISIONS
  // ============================================================
  function eatFood() {
    for (const blob of blobs) {
      if (!blob.alive) continue;
      for (let f = foods.length - 1; f >= 0; f--) {
        const food = foods[f];
        const d = Math.hypot(blob.x - food.x, blob.y - food.y);
        if (d < blob.radius + CONFIG.foodRadius) {
          let massGain = 1;
          if (blob.isPlayer && isMagnetActive()) massGain = 3;
          blob.mass += massGain;
          foods.splice(f, 1);
          foods.push(spawnFood());
          if (blob.isPlayer) {
            statEaten++;
            comboTimer = 2000;
          }
        }
      }
    }
  }

  function handleCollisions() {
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i], b = blobs[j];
        if (!a.alive || !b.alive) continue;
        const d = dist(a, b);
        const rSum = a.radius + b.radius;
        if (d < rSum) {
          const bigger = a.mass > b.mass ? a : b;
          const smaller = a.mass > b.mass ? b : a;
          if (bigger.mass > smaller.mass * 1.15) {
            if (smaller.isPlayer && isShielded()) continue;
            bigger.mass += smaller.mass * 0.8;
            smaller.alive = false;
            spawnParticles(smaller.x, smaller.y, smaller.color, 15);
            if (bigger.isPlayer) {
              combo++;
              comboTimer = 3000;
              statEaten++;
              showCombo();
            }
            if (smaller.isPlayer) endGame();
          }
        }
      }
    }
  }

  // ============================================================
  // UI UPDATES
  // ============================================================
  function updateHUD() {
    if (mode === "local2p") {
      const alive = players.filter((p) => p.alive);
      document.getElementById("mass-value").textContent = alive
        .map((p) => Math.floor(p.mass))
        .join(" vs ");
    } else if (player) {
      document.getElementById("mass-value").textContent = Math.floor(player.mass);
    }
  }

  function updateSpellUI() {
    const slots = document.querySelectorAll(".spell-slot");
    const keys = Object.keys(SPELLS);
    slots.forEach((slot, i) => {
      const key = keys[i];
      if (!key) return;
      const cd = spellCooldowns[key];
      const onCooldown = cd && Date.now() < cd;
      const active = activeSpells[key] && Date.now() < activeSpells[key];
      slot.style.opacity = onCooldown ? "0.4" : "1";
      if (active) {
        slot.style.borderColor = "#d4b8ff";
        slot.style.boxShadow = "0 0 12px rgba(212,184,255,0.5)";
      } else {
        slot.style.borderColor = "";
        slot.style.boxShadow = "";
      }
    });
  }

  function showCombo() {
    if (combo < 2) return;
    const el = document.getElementById("combo-display");
    document.getElementById("combo-text").textContent = `${combo}x Combo!`;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 1500);
  }

  function updateLeaderboard() {
    const list = document.getElementById("leaderboard-list");
    const sorted = [...blobs].filter(b => b.alive).sort((a, b) => b.mass - a.mass).slice(0, 10);
    list.innerHTML = "";
    sorted.forEach((b) => {
      const li = document.createElement("li");
      if (b.isPlayer) li.classList.add("me");
      li.innerHTML = `<span>${escapeHtml(b.name)}</span><span>${Math.floor(b.mass)}</span>`;
      list.appendChild(li);
    });
  }

  function updateMinimap() {
    const mc = document.getElementById("minimap-canvas");
    const mctx = mc.getContext("2d");
    const w = mc.width, h = mc.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "rgba(20, 10, 40, 0.8)";
    mctx.fillRect(0, 0, w, h);

    const scaleX = w / world.w, scaleY = h / world.h;

    // Food dots
    mctx.fillStyle = "rgba(180, 120, 255, 0.3)";
    for (let i = 0; i < foods.length; i += 5) {
      const f = foods[i];
      mctx.fillRect(f.x * scaleX, f.y * scaleY, 1, 1);
    }

    // Blobs
    for (const b of blobs) {
      if (!b.alive) continue;
      mctx.beginPath();
      mctx.arc(b.x * scaleX, b.y * scaleY, Math.max(2, b.radius * scaleX * 0.5), 0, Math.PI * 2);
      mctx.fillStyle = b.isPlayer ? "#d4b8ff" : b.color;
      mctx.fill();
    }
  }

  // ============================================================
  // CAMERA
  // ============================================================
  function updateCamera() {
    if (!players.length) return;
    const alive = players.filter((p) => p.alive);
    const list = alive.length ? alive : players;
    if (list.length === 1) {
      const p = list[0];
      const targetX = p.x - view.w / 2;
      const targetY = p.y - view.h / 2;
      const scale = 1 / Math.pow(p.mass / 30, 0.25);
      view.targetScale = clamp(scale, 0.45, 1);
      camera.x = lerp(camera.x, targetX, 0.1);
      camera.y = lerp(camera.y, targetY, 0.1);
    } else {
      let cx = 0, cy = 0;
      for (const p of list) { cx += p.x; cy += p.y; }
      cx /= list.length; cy /= list.length;
      let maxD = 200;
      for (const p of list) {
        const d = Math.hypot(p.x - cx, p.y - cy) + p.radius;
        if (d > maxD) maxD = d;
      }
      view.targetScale = clamp(Math.min(view.w, view.h) / (2 * maxD * 1.3), 0.25, 1);
      camera.x = lerp(camera.x, cx - view.w / 2, 0.1);
      camera.y = lerp(camera.y, cy - view.h / 2, 0.1);
    }
    view.scale = lerp(view.scale, view.targetScale, 0.05);
  }

  // ============================================================
  // INPUT
  // ============================================================
  function getPlayerInput() {
    if (mode === "single") {
      const dx = mouse.x - view.w / 2;
      const dy = mouse.y - view.h / 2;
      const m = Math.hypot(dx, dy);
      return m > 1 ? { x: dx / m, y: dy / m } : { x: 0, y: 0 };
    } else if (mode === "local2p") {
      return joy.p1;
    }
    return { x: 0, y: 0 };
  }

  function drivePlayerInputs() {
    if (mode === "single") {
      if (player && player.alive) player.input = getPlayerInput();
    } else if (mode === "local2p") {
      if (players[0] && players[0].alive) players[0].input = joy.p1;
      if (players[1] && players[1].alive) players[1].input = joy.p2;
    }
  }

  // ============================================================
  // RENDERING
  // ============================================================
  function drawGrid() {
    const s = view.scale;
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = "#16213e";
    ctx.fillRect(0, 0, view.w / s + 2, view.h / s + 2);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1 / s;
    const grid = 50;
    const startX = Math.floor(camera.x / grid) * grid;
    const startY = Math.floor(camera.y / grid) * grid;
    ctx.beginPath();
    for (let x = startX; x <= camera.x + view.w / s; x += grid) {
      ctx.moveTo(x - camera.x, 0);
      ctx.lineTo(x - camera.x, world.h);
    }
    for (let y = startY; y <= camera.y + view.h / s; y += grid) {
      ctx.moveTo(0, y - camera.y);
      ctx.lineTo(world.w, y - camera.y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(212, 184, 255, 0.2)";
    ctx.lineWidth = 3 / s;
    ctx.strokeRect(-camera.x, -camera.y, world.w, world.h);
    ctx.restore();
  }

  // ============================================================
  // GAME LOOP
  // ============================================================
  function loop(timestamp) {
    if (!running || paused) return;
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    gameTime += dt;

    // Combo decay
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }

    drivePlayerInputs();
    for (const blob of blobs) blob.update();
    eatFood();
    handleCollisions();
    updateParticles();
    updateCamera();
    updateSpellUI();

    // Draw
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    drawGrid();
    drawFood(foods);
    const sorted = [...blobs].filter(b => b.alive).sort((a, b) => a.mass - b.mass);
    for (const blob of sorted) blob.draw();
    drawParticles();
    updateMinimap();

    if (player) {
      statMaxPower = Math.max(statMaxPower, Math.floor(player.mass));
    }

    updateHUD();
    updateLeaderboard();
    animationId = requestAnimationFrame(loop);
  }

  // ============================================================
  // GAME START/END
  // ============================================================
  function addPlayer(name, color) {
    const p = new Blob(
      rand(200, world.w - 200),
      rand(200, world.h - 200),
      CONFIG.startMass,
      color,
      name,
      true
    );
    players.push(p);
    blobs.push(p);
    if (!player) player = p;
    return p;
  }

  function startGame(selectedMode) {
    mode = selectedMode;
    const counts = CONFIG.botCount[difficulty] || CONFIG.botCount.medium;
    const foodCounts = CONFIG.foodCount[difficulty] || CONFIG.foodCount.medium;

    world = mode === "local2p" ? { w: 2200, h: 2200 } : { ...CONFIG.world };
    foods = [];
    for (let i = 0; i < foodCounts; i++) foods.push(spawnFood());

    blobs = [];
    players = [];
    player = null;
    combo = 0;
    gameTime = 0;
    statEaten = 0;
    statSpells = 0;
    statMaxPower = 0;
    activeSpells = {};
    spellCooldowns = {};

    const botNames = [
      "Vortex", "Nibbler", "Gloop", "Bubbles", "Chonk", "Spike",
      "Wobble", "Pixel", "Munch", "Doom", "Zoom", "Ghost", "Comet",
      "Tank", "Echo", "Blaze", "Quark", "Tofu", "Hex", "Curse",
      "Brew", "Hex", "Grimoire", "Cauldron", "Phantom", "Specter",
    ];
    for (let i = 0; i < counts; i++) {
      blobs.push(new Blob(
        rand(0, world.w), rand(0, world.h),
        rand(20, 120), randColor(), botNames[i % botNames.length]
      ));
    }

    const p1name = (document.getElementById("name-input").value || "Player 1").trim().slice(0, 16) || "Player 1";
    addPlayer(p1name, "#d4b8ff");

    if (mode === "local2p") {
      const p2name = (document.getElementById("name-input-2").value || "Player 2").trim().slice(0, 16) || "Player 2";
      addPlayer(p2name, "#ff5d8f");
    }

    camera = { x: world.w / 2 - view.w / 2, y: world.h / 2 - view.h / 2 };
    view.scale = 1;
    view.targetScale = 1;

    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("end-screen").classList.add("hidden");
    document.getElementById("respawn-overlay").classList.add("hidden");
    document.getElementById("hud").classList.remove("hidden");
    document.getElementById("pause-menu").classList.add("hidden");

    // Show mobile controls on touch devices
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      document.getElementById("mobile-controls").classList.remove("hidden");
    }

    running = true;
    paused = false;
    lastTime = performance.now();
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000);
    document.getElementById("final-score").textContent = Math.floor(player ? player.mass : 0);
    document.getElementById("stat-time").textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    document.getElementById("stat-eaten").textContent = statEaten;
    document.getElementById("stat-spells").textContent = statSpells;
    document.getElementById("stat-max").textContent = statMaxPower;
    document.getElementById("end-screen").classList.remove("hidden");
    document.getElementById("hud").classList.add("hidden");
    document.getElementById("mobile-controls").classList.add("hidden");
  }

  // ============================================================
  // RESIZE
  // ============================================================
  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = view.w;
    canvas.height = view.h;
    joyOrigin.p1 = { x: 90, y: view.h - 90 };
    joyOrigin.p2 = { x: view.w - 90, y: view.h - 90 };
  }

  window.addEventListener("resize", resize);

  // ============================================================
  // INPUT HANDLERS
  // ============================================================
  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  canvas.addEventListener("mousedown", (e) => {
    mouse.down = true;
    if (mode === "local2p") {
      const side = e.clientX < view.w / 2 ? "p1" : "p2";
      const o = joyOrigin[side];
      let dx = e.clientX - o.x, dy = e.clientY - o.y;
      const d = Math.hypot(dx, dy), R = 60;
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      joy[side].x = dx / R;
      joy[side].y = dy / R;
    }
  });

  canvas.addEventListener("mouseup", () => {
    mouse.down = false;
    if (mode === "local2p") {
      joy.p1.x = joy.p1.y = 0;
      joy.p2.x = joy.p2.y = 0;
    }
  });

  // Touch
  function onTouchStart(e) {
    if (mode === "local2p") {
      for (const t of e.changedTouches) {
        const side = t.clientX < view.w / 2 ? "p1" : "p2";
        const o = joyOrigin[side];
        let dx = t.clientX - o.x, dy = t.clientY - o.y;
        const d = Math.hypot(dx, dy), R = 60;
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        joy[side].x = dx / R;
        joy[side].y = dy / R;
      }
    } else {
      if (e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
      }
    }
    e.preventDefault();
  }

  function onTouchMove(e) {
    if (mode === "local2p") {
      for (const t of e.changedTouches) {
        const side = t.clientX < view.w / 2 ? "p1" : "p2";
        const o = joyOrigin[side];
        let dx = t.clientX - o.x, dy = t.clientY - o.y;
        const d = Math.hypot(dx, dy), R = 60;
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        joy[side].x = dx / R;
        joy[side].y = dy / R;
      }
    } else {
      if (e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
      }
    }
    e.preventDefault();
  }

  function onTouchEnd(e) {
    if (mode === "local2p") {
      for (const t of e.changedTouches) {
        const side = t.clientX < view.w / 2 ? "p1" : "p2";
        joy[side].x = joy[side].y = 0;
      }
    }
  }

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("touchcancel", onTouchEnd);

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if (!running) return;
    switch (e.key.toLowerCase()) {
      case "q": castSpell("surge"); break;
      case "e": castSpell("ward"); break;
      case "r": castSpell("magnet"); break;
      case "f": castSpell("blast"); break;
      case " ": castSpell("dash"); break;
      case "v": castSpell("vanish"); break;
      case "escape":
      case "p":
        togglePause();
        break;
    }
  });

  // Spell buttons (mobile)
  document.getElementById("spell-btn-0")?.addEventListener("click", () => castSpell("surge"));
  document.getElementById("spell-btn-1")?.addEventListener("click", () => castSpell("ward"));

  // Joystick (mobile)
  const joystickZone = document.getElementById("joystick-zone");
  if (joystickZone) {
    let joyTouch = null;
    joystickZone.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyTouch = t.identifier;
      updateJoystick(t);
    });
    joystickZone.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouch) updateJoystick(t);
      }
    });
    joystickZone.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouch) {
          joyTouch = null;
          if (mode === "single" && player) {
            player.input = { x: 0, y: 0 };
          }
        }
      }
    });
  }

  function updateJoystick(touch) {
    const o = joyOrigin.p1;
    let dx = touch.clientX - o.x, dy = touch.clientY - o.y;
    const d = Math.hypot(dx, dy), R = 60;
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    const input = { x: dx / R, y: dy / R };
    if (mode === "single" && player) {
      player.input = input;
    } else if (mode === "local2p") {
      joy.p1.x = input.x;
      joy.p1.y = input.y;
    }
  }

  // ============================================================
  // PAUSE
  // ============================================================
  function togglePause() {
    paused = !paused;
    document.getElementById("pause-menu").classList.toggle("hidden", !paused);
    if (!paused) {
      lastTime = performance.now();
      animationId = requestAnimationFrame(loop);
    }
  }

  document.getElementById("resume-btn")?.addEventListener("click", togglePause);
  document.getElementById("quit-btn")?.addEventListener("click", () => {
    running = false;
    paused = false;
    document.getElementById("pause-menu").classList.add("hidden");
    document.getElementById("end-screen").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("hud").classList.add("hidden");
    document.getElementById("mobile-controls").classList.add("hidden");
  });

  // ============================================================
  // BUTTON HANDLERS
  // ============================================================
  document.getElementById("play-solo")?.addEventListener("click", () => startGame("single"));
  document.getElementById("play-duo")?.addEventListener("click", () => startGame("local2p"));
  document.getElementById("play-online")?.addEventListener("click", () => {
    const onlineOpts = document.getElementById("online-options");
    onlineOpts.classList.toggle("hidden");
  });

  document.getElementById("restart-btn")?.addEventListener("click", () => {
    document.getElementById("end-screen").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
  });

  // Difficulty buttons
  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      difficulty = btn.dataset.diff;
    });
  });

  // Enter key to start
  document.getElementById("name-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame("single");
  });
  document.getElementById("name-input-2")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame("local2p");
  });

  // ============================================================
  // INIT
  // ============================================================
  resize();
  updateSpellUI();

  // Auto-join if served by game server
  if (location.protocol.indexOf("http") === 0) {
    const auto = "ws://" + location.host;
    document.getElementById("server-input").value = auto;
    // startOnline(auto); // Uncomment when server is ready
  }
})();
