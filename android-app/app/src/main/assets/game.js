/**
 * Witch.io — a magical .io arena game (mobile-first)
 * - Authoritative-sim for Solo / Local Duel
 * - Real-time net mode over the in-app GameServer (LAN / Wi-Fi Direct)
 * - Floating virtual joystick (Pointer Events), 6-spell mobile bar,
 *   DPR-crisp canvas, camera zoom, screen shake, eat popups.
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
  };

  const SPELLS = {
    surge:  { name: "Surge",  icon: "⚡", cooldown: 8000,  dur: 3000 },
    ward:   { name: "Ward",   icon: "🛡️", cooldown: 12000, dur: 2500 },
    magnet: { name: "Magnet", icon: "🧲", cooldown: 10000, dur: 4000 },
    dash:   { name: "Dash",   icon: "💨", cooldown: 3000,  dur: 200  },
    vanish: { name: "Vanish", icon: "🔮", cooldown: 15000, dur: 3000 },
    blast:  { name: "Blast",  icon: "💣", cooldown: 10000, dur: 0    },
  };
  const SPELL_ORDER = ["surge", "ward", "magnet", "dash", "vanish", "blast"];

  // ============================================================
  // STATE
  // ============================================================
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  let world = { ...CONFIG.world };
  let difficulty = "easy";
  let mode = "single";
  let running = false;
  let paused = false;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  let view = { w: 0, h: 0, scale: 1, targetScale: 1, userZoom: 1 };
  let camera = { x: 0, y: 0 };
  let shake = 0;
  const mouse = { x: 0, y: 0 };

  let foods = [];
  let blobs = [];
  let players = [];
  let player = null;
  let particles = [];
  let popups = [];
  let trails = [];

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

  // ---- Floating joystick (Pointer Events) ----
  const joy = {
    active: false, id: null, ox: 0, oy: 0, x: 0, y: 0,
    maxR: 70, dead: 12,
    vector: { x: 0, y: 0 },
  };
  // pointers for pinch-zoom
  const pointers = new Map();

  // ---- Net mode ----
  const net = {
    ws: null, id: null, connected: false,
    byId: new Map(), foods: [], world: null,
    lastSent: 0, self: null,
  };

  // ============================================================
  // UTILITIES
  // ============================================================
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randColor = () => `hsl(${Math.floor(rand(250, 320))}, 70%, 62%)`;
  const massToRadius = (mass) => Math.max(14, Math.sqrt(mass) * 5);
  const speedFor = (mass) => 3.6 * Math.pow(30 / (mass + 30), 0.4);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ============================================================
  // SPELLS
  // ============================================================
  function castSpell(key) {
    if (!player || !player.alive) return;
    if (spellCooldowns[key] && Date.now() < spellCooldowns[key]) return;
    const sp = SPELLS[key];
    if (!sp) return;
    spellCooldowns[key] = Date.now() + sp.cooldown;
    statSpells++;
    switch (key) {
      case "surge": activeSpells.surge = Date.now() + sp.dur; break;
      case "ward": activeSpells.ward = Date.now() + sp.dur; break;
      case "magnet": activeSpells.magnet = Date.now() + sp.dur; break;
      case "vanish": activeSpells.vanish = Date.now() + sp.dur; break;
      case "dash": performDash(); break;
      case "blast": performBlast(); break;
    }
    updateSpellUI();
  }

  function performDash() {
    const inp = getPlayerInput();
    const m = Math.hypot(inp.x, inp.y);
    if (m < 0.1) return;
    const d = 220;
    player.x = clamp(player.x + (inp.x / m) * d, player.radius, world.w - player.radius);
    player.y = clamp(player.y + (inp.y / m) * d, player.radius, world.h - player.radius);
    spawnParticles(player.x, player.y, "#d4b8ff", 16);
    shake = Math.max(shake, 6);
  }

  function performBlast() {
    const R = 220, F = 320;
    for (const b of blobs) {
      if (b === player || !b.alive) continue;
      const d = dist(b, player);
      if (d < R) {
        const a = Math.atan2(b.y - player.y, b.x - player.x);
        const s = (1 - d / R) * F;
        if (mode !== "net") {
          b.x = clamp(b.x + Math.cos(a) * s, b.radius, world.w - b.radius);
          b.y = clamp(b.y + Math.sin(a) * s, b.radius, world.h - b.radius);
        } else { b.netKickX = (b.netKickX || 0) + Math.cos(a) * s; b.netKickY = (b.netKickY || 0) + Math.sin(a) * s; }
        b.target = null;
      }
    }
    spawnParticles(player.x, player.y, "#ff6b6b", 26);
    shake = Math.max(shake, 12);
  }

  const spellSpeed = () => (activeSpells.surge && Date.now() < activeSpells.surge ? 1.8 : 1.0);
  const isShielded = () => !!(activeSpells.ward && Date.now() < activeSpells.ward);
  const isInvisible = () => !!(activeSpells.vanish && Date.now() < activeSpells.vanish);
  const isMagnet = () => !!(activeSpells.magnet && Date.now() < activeSpells.magnet);

  // ============================================================
  // PARTICLES / POPUPS
  // ============================================================
  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(2, 9);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rand(0.02, 0.05), color, size: rand(2, 6) });
    }
  }
  function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1 });
  }
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]; p.y -= 0.6; p.life -= 0.02;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }

  // ============================================================
  // BLOB
  // ============================================================
  class Blob {
    constructor(x, y, mass, color, name, isPlayer = false) {
      this.x = x; this.y = y; this.mass = mass; this.color = color; this.name = name;
      this.isPlayer = isPlayer; this.alive = true; this.input = { x: 0, y: 0 };
      this.vx = 0; this.vy = 0; this.target = null; this.wobble = rand(0, Math.PI * 2);
      this.netKickX = 0; this.netKickY = 0;
    }
    get radius() { return massToRadius(this.mass); }
    update() {
      const r = this.radius;
      let base = speedFor(this.mass) * spellSpeed();
      if (this.isPlayer) {
        const inp = this.input || { x: 0, y: 0 };
        const m = Math.hypot(inp.x, inp.y);
        if (m > 0.001) { const sp = Math.min(base, base * Math.min(1, m)); this.vx = (inp.x / m) * sp; this.vy = (inp.y / m) * sp; }
        else this.vx = this.vy = 0;
      } else { this.think(); const tx = this.target ? this.target.x : this.x, ty = this.target ? this.target.y : this.y;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d > 1) { const sp = Math.min(base, d * 0.08); this.vx = (dx / d) * sp; this.vy = (dy / d) * sp; } else this.vx = this.vy = 0;
      }
      this.x += this.vx; this.y += this.vy;
      this.x = clamp(this.x, r, world.w - r); this.y = clamp(this.y, r, world.h - r);
      this.wobble += 0.05;
    }
    think() {
      if (!this.target || Math.random() < 0.02) {
        const a = rand(0, Math.PI * 2), reach = rand(200, 700);
        this.target = { x: clamp(this.x + Math.cos(a) * reach, 0, world.w), y: clamp(this.y + Math.sin(a) * reach, 0, world.h) };
      }
      let threat = null, prey = null, bd = Infinity;
      for (const o of blobs) {
        if (o === this || !o.alive) continue;
        const d = dist(this, o); if (d > 600) continue;
        if (o.mass > this.mass * 1.15) { if (!threat || d < dist(this, threat)) threat = o; }
        else if (this.mass > o.mass * 1.15) { if (d < bd) { prey = o; bd = d; } }
      }
      if (threat) { const ax = this.x - threat.x, ay = this.y - threat.y, m = Math.hypot(ax, ay) || 1; this.target = { x: this.x + (ax / m) * 400, y: this.y + (ay / m) * 400 }; }
      else if (prey) this.target = { x: prey.x, y: prey.y };
    }
    draw() {
      const r = this.radius, wob = Math.sin(this.wobble) * 2;
      if (this.isPlayer && isShielded()) {
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 12, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(120,210,255,0.7)"; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 12, 0, Math.PI * 2); ctx.fillStyle = "rgba(120,210,255,0.12)"; ctx.fill();
      }
      if (this.isPlayer && isInvisible()) ctx.globalAlpha = 0.3;
      if (this.isPlayer) {
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(212,184,255,0.9)"; ctx.lineWidth = 3; ctx.stroke();
      }
      // body with soft glow
      ctx.beginPath(); ctx.arc(this.x, this.y, r + wob, 0, Math.PI * 2);
      ctx.fillStyle = this.color; ctx.fill();
      ctx.beginPath(); ctx.arc(this.x - r * 0.3, this.y - r * 0.3, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fill();
      if (this.alive) {
        ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(12, r * 0.34)}px Segoe UI, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.strokeText(this.name, this.x, this.y); ctx.fillText(this.name, this.x, this.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // FOOD
  // ============================================================
  function spawnFood() { return { x: rand(0, world.w), y: rand(0, world.h), color: randColor() }; }

  // ============================================================
  // COLLISIONS (local sim only)
  // ============================================================
  function eatFood() {
    for (const b of blobs) {
      if (!b.alive) continue;
      const rr = (b.radius + CONFIG.foodRadius) ** 2;
      for (let f = foods.length - 1; f >= 0; f--) {
        const food = foods[f];
        const dx = b.x - food.x, dy = b.y - food.y;
        if (dx * dx + dy * dy < rr) {
          let g = 1; if (b.isPlayer && isMagnet()) g = 3;
          b.mass += g; foods.splice(f, 1); foods.push(spawnFood());
          if (b.isPlayer) { statEaten++; comboTimer = 2000; addPopup(b.x, b.y - b.radius, `+${g}`, "#d4b8ff"); }
        }
      }
    }
  }
  function handleCollisions() {
    for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
      const a = blobs[i], b = blobs[j];
      if (!a.alive || !b.alive) continue;
      if (dist(a, b) < a.radius + b.radius) {
        const big = a.mass > b.mass ? a : b, small = a.mass > b.mass ? b : a;
        if (big.mass > small.mass * 1.15) {
          if (small.isPlayer && isShielded()) continue;
          big.mass += small.mass * 0.8; small.alive = false;
          spawnParticles(small.x, small.y, small.color, 16); shake = Math.max(shake, 5);
          if (big.isPlayer) { combo++; comboTimer = 3000; statEaten++; showCombo(); }
          if (small.isPlayer) endGame();
        }
      }
    }
  }

  // ============================================================
  // UI
  // ============================================================
  function updateHUD() {
    if (player) $("mass-value").textContent = Math.floor(player.mass);
  }
  function updateSpellUI() {
    SPELL_ORDER.forEach((key, i) => {
      const slot = document.querySelector(`.spell-slot[data-key="${key}"]`);
      if (!slot) return;
      const cd = spellCooldowns[key], onCd = cd && Date.now() < cd;
      const active = activeSpells[key] && Date.now() < activeSpells[key];
      const remain = onCd ? (cd - Date.now()) : 0;
      slot.style.opacity = onCd ? "0.45" : "1";
      slot.style.setProperty("--cd", onCd ? `${remain / SPELLS[key].cooldown * 100}` : "0");
      slot.classList.toggle("active", !!active);
    });
  }
  function showCombo() {
    if (combo < 2) return;
    const el = $("combo-display");
    $("combo-text").textContent = `${combo}x Combo!`;
    el.classList.remove("hidden"); clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => el.classList.add("hidden"), 1400);
  }
  function updateLeaderboard() {
    const list = $("leaderboard-list");
    const sorted = [...blobs].filter(b => b.alive).sort((a, b) => b.mass - a.mass).slice(0, 10);
    list.innerHTML = "";
    sorted.forEach(b => {
      const li = document.createElement("li");
      if (b.isPlayer) li.classList.add("me");
      li.innerHTML = `<span>${escapeHtml(b.name)}</span><span>${Math.floor(b.mass)}</span>`;
      list.appendChild(li);
    });
  }
  function updateMinimap() {
    const mc = $("minimap-canvas"), mctx = mc.getContext("2d");
    const w = mc.width, h = mc.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "rgba(20,10,40,0.85)"; mctx.fillRect(0, 0, w, h);
    const sx = w / world.w, sy = h / world.h;
    mctx.fillStyle = "rgba(180,120,255,0.3)";
    for (let i = 0; i < foods.length; i += 6) { const f = foods[i]; mctx.fillRect(f.x * sx, f.y * sy, 1, 1); }
    for (const b of blobs) { if (!b.alive) continue; mctx.beginPath(); mctx.arc(b.x * sx, b.y * sy, Math.max(2, b.radius * sx * 0.5), 0, Math.PI * 2); mctx.fillStyle = b.isPlayer ? "#d4b8ff" : b.color; mctx.fill(); }
  }

  // ============================================================
  // CAMERA + TRANSFORM
  // ============================================================
  function visibleW() { return view.w / (view.scale * view.userZoom); }
  function visibleH() { return view.h / (view.scale * view.userZoom); }
  function updateCamera() {
    const follow = player && player.alive ? player : (blobs.find(b => b.isPlayer) || null);
    if (!follow) return;
    const sc = view.scale * view.userZoom;
    view.targetScale = clamp(1 / Math.pow(follow.mass / 30, 0.25), 0.45, 1);
    const tx = follow.x - visibleW() / 2, ty = follow.y - visibleH() / 2;
    camera.x = lerp(camera.x, tx, 0.12);
    camera.y = lerp(camera.y, ty, 0.12);
    view.scale = lerp(view.scale, view.targetScale, 0.05);
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
  function driveInputs() {
    if (mode === "single") { if (player && player.alive) player.input = getPlayerInput(); }
    else if (mode === "local2p") {
      if (players[0] && players[0].alive) players[0].input = joy.p1 || { x: 0, y: 0 };
      if (players[1] && players[1].alive) players[1].input = joy.p2 || { x: 0, y: 0 };
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  function drawGrid() {
    const sx = view.scale * view.userZoom;
    const left = camera.x - 40, top = camera.y - 40, right = camera.x + visibleW() + 40, bottom = camera.y + visibleH() + 40;
    ctx.fillStyle = "#0c0c1e"; ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = "rgba(180,120,255,0.06)"; ctx.lineWidth = 1 / sx;
    const g = 60;
    ctx.beginPath();
    for (let x = Math.floor(left / g) * g; x <= right; x += g) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    for (let y = Math.floor(top / g) * g; y <= bottom; y += g) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(212,184,255,0.22)"; ctx.lineWidth = 4 / sx;
    ctx.strokeRect(0, 0, world.w, world.h);
  }
  function inView(x, y, r) {
    return x + r > camera.x && x - r < camera.x + visibleW() && y + r > camera.y && y - r < camera.y + visibleH();
  }
  function drawFoodList(list) {
    for (const f of list) {
      const fx = f[0] !== undefined ? f[0] : f.x, fy = f[1] !== undefined ? f[1] : f.y, fc = f[2] !== undefined ? f[2] : f.color;
      if (!inView(fx, fy, 20)) continue;
      ctx.beginPath(); ctx.arc(fx, fy, CONFIG.foodRadius, 0, Math.PI * 2); ctx.fillStyle = fc; ctx.fill();
    }
  }
  function drawParticlesList() {
    for (const p of particles) { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawPopups() {
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 18px Segoe UI, sans-serif";
    for (const p of popups) { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1;
  }
  function drawJoystick() {
    if (!joy.active) return;
    screenTransform();
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, joy.maxR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180,120,255,0.10)"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(212,184,255,0.5)"; ctx.stroke();
    const kx = joy.ox + joy.vector.x * joy.maxR, ky = joy.oy + joy.vector.y * joy.maxR;
    ctx.beginPath(); ctx.arc(kx, ky, 28, 0, Math.PI * 2); ctx.fillStyle = "rgba(212,184,255,0.55)"; ctx.fill();
  }

  function loop(ts) {
    if (!running || paused) return;
    const dt = ts - lastTime; lastTime = ts; gameTime += dt;
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
    if (shake > 0) shake = Math.max(0, shake - dt * 0.02);

    if (mode === "net") {
      // server-authoritative: just send input + render
      sendNetInput();
    } else {
      driveInputs();
      for (const b of blobs) b.update();
      eatFood(); handleCollisions();
    }
    updateParticles();
    if (player && player.alive) {
      trails.push({ x: player.x, y: player.y, life: 1 });
      if (trails.length > 14) trails.shift();
    }
    for (const t of trails) t.life -= 0.06;
    trails = trails.filter(t => t.life > 0);
    updateCamera();
    updateSpellUI();

    screenTransform();
    ctx.clearRect(0, 0, view.w, view.h);
    worldTransform();
    drawGrid();
    drawFoodList(foods);
    // player trail
    if (trails.length > 1) {
      ctx.strokeStyle = "rgba(212,184,255,0.18)"; ctx.lineWidth = player ? player.radius * 0.8 : 20; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(trails[0].x, trails[0].y);
      for (const t of trails) ctx.lineTo(t.x, t.y); ctx.stroke();
    }
    const sorted = [...blobs].filter(b => b.alive).sort((a, b) => a.mass - b.mass);
    for (const b of sorted) if (inView(b.x, b.y, b.radius + 30)) b.draw();
    drawParticlesList(); drawPopups();
    drawJoystick();

    if (player) statMaxPower = Math.max(statMaxPower, Math.floor(player.mass));
    updateHUD(); updateLeaderboard();

    if (mode === "net" && net.self) {
      if (!net.self.alive) $("respawn-overlay").classList.remove("hidden");
      else $("respawn-overlay").classList.add("hidden");
    }
    animationId = requestAnimationFrame(loop);
  }

  // ============================================================
  // START / END
  // ============================================================
  function addPlayer(name, color) {
    const p = new Blob(rand(200, world.w - 200), rand(200, world.h - 200), CONFIG.startMass, color, name, true);
    players.push(p); blobs.push(p); if (!player) player = p; return p;
  }
  function startGame(selMode) {
    mode = selMode;
    const bc = CONFIG.botCount[difficulty] || 18, fc = CONFIG.foodCount[difficulty] || 600;
    world = selMode === "local2p" ? { w: 2200, h: 2200 } : { ...CONFIG.world };
    foods = []; for (let i = 0; i < fc; i++) foods.push(spawnFood());
    blobs = []; players = []; player = null; combo = 0; gameTime = 0;
    statEaten = statSpells = statMaxPower = 0; activeSpells = {}; spellCooldowns = {}; particles = []; popups = []; trails = [];
    const names = ["Vortex","Nibbler","Gloop","Bubbles","Chonk","Spike","Wobble","Pixel","Munch","Doom","Zoom","Ghost","Comet","Tank","Echo","Blaze","Quark","Tofu","Hex","Curse","Brew","Grimoire","Cauldron","Phantom","Specter","Rune","Cackle","Moonpetal"];
    for (let i = 0; i < bc; i++) blobs.push(new Blob(rand(0, world.w), rand(0, world.h), rand(20, 120), randColor(), names[i % names.length]));
    const n1 = ($("name-input").value || "Witch").trim().slice(0, 16) || "Witch";
    addPlayer(n1, "#d4b8ff");
    if (selMode === "local2p") addPlayer(($("name-input-2").value || "Warlock").trim().slice(0, 16) || "Warlock", "#ff5d8f");
    camera = { x: world.w / 2 - visibleW() / 2, y: world.h / 2 - visibleH() / 2 };
    view.scale = 1; view.targetScale = 1; view.userZoom = 1;
    $("start-screen").classList.add("hidden"); $("end-screen").classList.add("hidden");
    $("respawn-overlay").classList.add("hidden"); $("hud").classList.remove("hidden"); $("pause-menu").classList.add("hidden");
    if (isTouch) $("mobile-controls").classList.remove("hidden");
    running = true; paused = false; lastTime = performance.now();
    cancelAnimationFrame(animationId); animationId = requestAnimationFrame(loop);
  }
  function endGame() {
    running = false;
    const m = Math.floor(gameTime / 60000), s = Math.floor((gameTime % 60000) / 1000);
    $("final-score").textContent = Math.floor(player ? player.mass : 0);
    $("stat-time").textContent = `${m}:${s.toString().padStart(2, "0")}`;
    $("stat-eaten").textContent = statEaten; $("stat-spells").textContent = statSpells; $("stat-max").textContent = statMaxPower;
    $("end-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden");
  }

  // ============================================================
  // NET MODE (in-app GameServer)
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
          $("start-screen").classList.add("hidden"); $("end-screen").classList.add("hidden");
          $("hud").classList.remove("hidden");
          if (isTouch) $("mobile-controls").classList.remove("hidden");
          camera = { x: world.w / 2 - visibleW() / 2, y: world.h / 2 - visibleH() / 2 };
          running = true; paused = false; lastTime = performance.now();
          cancelAnimationFrame(animationId); animationId = requestAnimationFrame(loop);
        } else if (msg.type === "state") {
          world = { w: msg.world.w, h: msg.world.h };
          net.foods = msg.foods || [];
          for (const fb of net.foods) { /* normalize */ }
          const seen = new Set();
          for (const b of (msg.blobs || [])) {
            seen.add(b.id);
            let blob = net.byId.get(b.id);
            if (!blob) { blob = new Blob(b.x, b.y, b.m, b.c, b.n, b.id === net.id); net.byId.set(b.id, blob); }
            blob.x = b.x; blob.y = b.y; blob.mass = b.m; blob.color = b.c; blob.name = b.n; blob.alive = b.a === 1; blob.isPlayer = b.id === net.id;
          }
          for (const id of [...net.byId.keys()]) if (!seen.has(id)) net.byId.delete(id);
          blobs = [...net.byId.values()];
          foods = net.foods.map(f => Array.isArray(f) ? { x: f[0], y: f[1], color: f[2] } : f);
          player = net.self = net.byId.get(net.id) || null;
        }
      };
      net.ws.onclose = () => {
        net.connected = false;
        if (mode === "net") { running = false; $("conn-status").textContent = "Disconnected."; }
      };
    } catch (e) { $("conn-status").textContent = "Connect failed: " + e.message; }
  }
  function sendNetInput() {
    if (!net.ws || net.ws.readyState !== 1 || !player) return;
    const now = Date.now();
    if (now - net.lastSent < 50) return;
    net.lastSent = now;
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
    joy.maxR = clamp(Math.min(view.w, view.h) * 0.16, 56, 90);
    joy.dead = joy.maxR * 0.18;
  }
  window.addEventListener("resize", resize);

  // ============================================================
  // POINTER INPUT (joystick + pinch)
  // ============================================================
  function setJoyFromPointer(t) {
    let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d < joy.dead) { joy.vector.x = 0; joy.vector.y = 0; return; }
    const mag = Math.min(d, joy.maxR);
    const norm = (d - joy.dead) / (joy.maxR - joy.dead);
    const curve = norm * norm; // quadratic response for fine control
    const ux = dx / (d || 1), uy = dy / (d || 1);
    joy.vector.x = ux * curve; joy.vector.y = uy * curve;
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "net" && (!player || !player.alive)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) return; // pinch, not joystick
    if (e.clientX < view.w * 0.5 && !joy.active) {
      joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
      joy.vector.x = 0; joy.vector.y = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    } else if (mode === "single" && !isTouch) {
      mouse.x = e.clientX; mouse.y = e.clientY;
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (joy.active && e.pointerId === joy.id) { setJoyFromPointer(e); e.preventDefault(); return; }
    if (pointers.size === 2) { // pinch zoom
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchLast > 0) view.userZoom = clamp(view.userZoom * (d / pinchLast), 0.6, 1.8);
      pinchLast = d; return;
    }
    if (mode === "single" && !isTouch && !joy.active) { mouse.x = e.clientX; mouse.y = e.clientY; }
  });
  let pinchLast = 0;
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchLast = 0;
    if (joy.active && e.pointerId === joy.id) {
      joy.active = false; joy.id = null; joy.vector.x = 0; joy.vector.y = 0;
      if (mode === "single" && player) player.input = { x: 0, y: 0 };
    }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", endPointer);
  canvas.style.touchAction = "none";

  // ============================================================
  // KEYBOARD
  // ============================================================
  document.addEventListener("keydown", (e) => {
    if (!running) return;
    if (mode === "net" && (!player || !player.alive)) return;
    switch (e.key.toLowerCase()) {
      case "q": castSpell("surge"); break;
      case "e": castSpell("ward"); break;
      case "r": castSpell("magnet"); break;
      case "f": castSpell("blast"); break;
      case " ": castSpell("dash"); break;
      case "v": castSpell("vanish"); break;
      case "escape": case "p": togglePause(); break;
    }
  });

  // Spells bar (mobile)
  SPELL_ORDER.forEach((key) => {
    const btn = document.querySelector(`.spell-btn[data-key="${key}"]`);
    if (btn) btn.addEventListener("pointerdown", (e) => { e.preventDefault(); castSpell(key); });
  });

  function togglePause() {
    paused = !paused;
    $("pause-menu").classList.toggle("hidden", !paused);
    if (!paused) { lastTime = performance.now(); animationId = requestAnimationFrame(loop); }
  }
  $("resume-btn")?.addEventListener("click", togglePause);
  $("quit-btn")?.addEventListener("click", () => {
    running = false; paused = false;
    if (net.ws) try { net.ws.close(); } catch {}
    $("pause-menu").classList.add("hidden"); $("end-screen").classList.add("hidden");
    $("start-screen").classList.remove("hidden"); $("hud").classList.add("hidden"); $("mobile-controls").classList.add("hidden");
  });

  // Buttons
  $("play-solo")?.addEventListener("click", () => startGame("single"));
  $("play-duo")?.addEventListener("click", () => startGame("local2p"));
  $("play-online")?.addEventListener("click", () => $("online-options").classList.toggle("hidden"));
  $("connect-online-btn")?.addEventListener("click", () => {
    const url = ($("server-input").value || "ws://127.0.0.1:3000").trim();
    witchConnect(url);
  });
  $("restart-btn")?.addEventListener("click", () => {
    $("end-screen").classList.add("hidden"); $("start-screen").classList.remove("hidden");
  });
  document.querySelectorAll(".diff-btn").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".diff-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); difficulty = b.dataset.diff;
  }));
  $("name-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") startGame("single"); });
  $("name-input-2")?.addEventListener("keydown", (e) => { if (e.key === "Enter") startGame("local2p"); });

  // ============================================================
  // INIT
  // ============================================================
  resize();
  updateSpellUI();
})();
