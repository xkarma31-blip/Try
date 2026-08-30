/**
 * Witch.io — Authoritative Multiplayer Server
 * Node.js WebSocket server for LAN play
 */
const { WebSocketServer } = require("ws");
const http = require("http");

const PORT = parseInt(process.argv[2] || "3000");

// ============================================================
// CONFIG
// ============================================================
const WORLD = { w: 4000, h: 4000 };
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const BROADCAST_MS = 50;
const XP_MAGNET_RANGE = 120;
const SPAWN_RADIUS = 1200;

const ENEMY_TYPES = {
  grunt:  { hp: 25, dmg: 5, spd: 1.6, radius: 14, color: "#7c3aed", xp: 4 },
  ranged: { hp: 18, dmg: 7, spd: 1.2, radius: 12, color: "#ff6b3d", xp: 5, shootCd: 2000 },
  tank:   { hp: 60, dmg: 10, spd: 0.9, radius: 20, color: "#8b6914", xp: 8 },
  swarm:  { hp: 12, dmg: 3, spd: 2.4, radius: 8, color: "#4da6ff", xp: 2 },
  boss:   { hp: 400, dmg: 15, spd: 1.0, radius: 35, color: "#ff4444", xp: 50 },
};

const BOSS_NAMES = ["Void Witch", "Shadow Lord", "Flame Serpent", "Frost Giant", "Stone Golem", "Storm Caller"];
const ENEMY_NAMES = ["Goblin", "Slime", "Imp", "Wisp", "Shade", "Creep", "Blight", "Murk", "Thorn", "Rift", "Dusk", "Ember"];

// ============================================================
// UTILS
// ============================================================
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const escape = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");

// ============================================================
// GAME STATE
// ============================================================
const players = new Map(); // ws -> Player
let enemies = [];
let xpGems = [];
let projectiles = [];
let waveNum = 0;
let waveTimer = 5000;
let bossTimer = 120000;
let nextBossId = 1;
let gameTime = 0;
let lastBroadcast = 0;

class ServerPlayer {
  constructor(ws, id, name, color) {
    this.ws = ws;
    this.id = id;
    this.name = name;
    this.color = color;
    this.x = rand(200, WORLD.w - 200);
    this.y = rand(200, WORLD.h - 200);
    this.hp = 100;
    this.maxHP = 100;
    this.shield = 50;
    this.maxShield = 50;
    this.radius = 22;
    this.alive = true;
    this.inputX = 0;
    this.inputY = 0;
    this.lastAngle = 0;
    this.speed = 3.2;
    this.score = 0;
    this.kills = 0;
    this.respawnAt = 0;
  }
}

// ============================================================
// ENEMY AI
// ============================================================
function findNearestEnemy(x, y, range) {
  let nearest = null, bestDist = range;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = dist({ x, y }, e);
    if (d < bestDist) { bestDist = d; nearest = e; }
  }
  return nearest;
}

function findNearestPlayer(x, y, range) {
  let nearest = null, bestDist = range;
  for (const p of players.values()) {
    if (!p.alive) continue;
    const d = dist({ x, y }, p);
    if (d < bestDist) { bestDist = d; nearest = p; }
  }
  return nearest;
}

function updateEnemyAI(dt) {
  const alive = enemies.filter(e => e.alive);
  for (const e of alive) {
    const target = findNearestPlayer(e.x, e.y, 1500);
    if (!target) continue;

    const a = Math.atan2(target.y - e.y, target.x - e.x);
    const spd = e.spd * (dt / 16);
    e.x += Math.cos(a) * spd;
    e.y += Math.sin(a) * spd;
    e.x = clamp(e.x, e.radius, WORLD.w - e.radius);
    e.y = clamp(e.y, e.radius, WORLD.h - e.radius);
    e.wobble += dt * 0.01;

    // Contact damage
    if (dist(e, target) < e.radius + target.radius) {
      target.hp -= e.dmg * (dt / 500);
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.respawnAt = Date.now() + 2000;
        sendTo(target.ws, { type: "death", killer: e.name });
      }
    }

    // Ranged shooting
    if (e.type === "ranged" && e.shootCd) {
      e.shootTimer = (e.shootTimer || e.shootCd) - dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = e.shootCd;
        const sa = Math.atan2(target.y - e.y, target.x - e.x);
        projectiles.push({
          x: e.x, y: e.y,
          vx: Math.cos(sa) * 4, vy: Math.sin(sa) * 4,
          dmg: e.dmg, radius: 4, life: 1500,
          owner: "enemy", color: e.color,
        });
      }
    }
  }
}

// ============================================================
// WAVE SPAWNING
// ============================================================
function spawnWave(dt) {
  waveTimer -= dt;
  if (waveTimer <= 0) {
    waveNum++;
    waveTimer = 8000 + waveNum * 500;
    const base = 5 + waveNum * 3;
    const count = Math.min(base, 40);
    const types = ["grunt", "grunt", "grunt", "ranged", "tank", "swarm", "swarm"];
    const hpMult = 1 + waveNum * 0.15;
    const dmgMult = 1 + waveNum * 0.08;

    // Spawn near average player position
    const avgX = [...players.values()].reduce((s, p) => s + p.x, 0) / Math.max(1, players.size) || WORLD.w / 2;
    const avgY = [...players.values()].reduce((s, p) => s + p.y, 0) / Math.max(1, players.size) || WORLD.h / 2;

    for (let i = 0; i < count; i++) {
      const t = types[randInt(0, types.length - 1)];
      const def = ENEMY_TYPES[t];
      const ang = rand(0, Math.PI * 2);
      const r = rand(SPAWN_RADIUS * 0.6, SPAWN_RADIUS);
      const ex = clamp(avgX + Math.cos(ang) * r, 50, WORLD.w - 50);
      const ey = clamp(avgY + Math.sin(ang) * r, 50, WORLD.h - 50);
      enemies.push({
        id: `e${Date.now()}_${i}`,
        x: ex, y: ey,
        hp: def.hp * hpMult, maxHP: def.hp * hpMult,
        dmg: def.dmg * dmgMult,
        spd: def.spd, radius: def.radius,
        color: def.color, name: ENEMY_NAMES[randInt(0, ENEMY_NAMES.length - 1)],
        type: t, xp: def.xp, alive: true,
        wobble: rand(0, Math.PI * 2),
        shootCd: def.shootCd, shootTimer: def.shootCd || 99999,
        stunUntil: 0, slowUntil: 0, slowPct: 0,
        burnUntil: 0, burnDmg: 0,
      });
    }

    // Boss every 5 waves
    if (waveNum % 5 === 0) {
      const hpMult2 = 1 + waveNum * 0.2;
      const dmgMult2 = 1 + waveNum * 0.1;
      const idx = nextBossId++ % BOSS_NAMES.length;
      const colors = ["#ff4444", "#7c3aed", "#ff6b3d", "#4da6ff", "#8b6914", "#d4b8ff"];
      const ang = rand(0, Math.PI * 2);
      const ex = clamp(avgX + Math.cos(ang) * SPAWN_RADIUS, 100, WORLD.w - 100);
      const ey = clamp(avgY + Math.sin(ang) * SPAWN_RADIUS, 100, WORLD.h - 100);
      enemies.push({
        id: `boss_${Date.now()}`,
        x: ex, y: ey,
        hp: ENEMY_TYPES.boss.hp * hpMult2, maxHP: ENEMY_TYPES.boss.hp * hpMult2,
        dmg: ENEMY_TYPES.boss.dmg * dmgMult2,
        spd: ENEMY_TYPES.boss.spd, radius: ENEMY_TYPES.boss.radius,
        color: colors[idx], name: BOSS_NAMES[idx],
        type: "boss", xp: ENEMY_TYPES.boss.xp, alive: true,
        wobble: 0, shootCd: 1500, shootTimer: 1500,
        stunUntil: 0, slowUntil: 0, slowPct: 0,
        burnUntil: 0, burnDmg: 0,
      });
    }
  }
}

// ============================================================
// PROJECTILE TICK
// ============================================================
function tickProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) { projectiles.splice(i, 1); continue; }
    p.x += p.vx * (dt / 16);
    p.y += p.vy * (dt / 16);

    if (p.owner === "player") {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (dist(p, e) < p.radius + e.radius) {
          e.hp -= p.dmg;
          if (e.hp <= 0) {
            e.alive = false;
            // Spawn XP gems
            for (let j = 0; j < 3; j++) {
              xpGems.push({
                x: e.x + rand(-15, 15), y: e.y + rand(-15, 15),
                value: e.xp, radius: 4 + Math.min(e.xp, 10),
                life: 30000, id: `xp_${Date.now()}_${j}`,
              });
            }
            if (e.type === "boss") {
              for (let j = 0; j < 8; j++) {
                xpGems.push({
                  x: e.x + rand(-30, 30), y: e.y + rand(-30, 30),
                  value: 15, radius: 8, life: 60000,
                  id: `xp_b_${Date.now()}_${j}`,
                });
              }
            }
            // Credit kill to owner
            for (const pl of players.values()) {
              if (pl.ws === p.playerWs) { pl.kills++; pl.score += e.xp; break; }
            }
          }
          p.pierce = (p.pierce || 1) - 1;
          if (p.pierce <= 0) { projectiles.splice(i, 1); break; }
        }
      }
    }
  }
}

// ============================================================
// XP GEM COLLECTION
// ============================================================
function collectXPGems(dt) {
  for (let i = xpGems.length - 1; i >= 0; i--) {
    const g = xpGems[i];
    g.life -= dt;
    if (g.life <= 0) { xpGems.splice(i, 1); continue; }

    for (const p of players.values()) {
      if (!p.alive) continue;
      const d = dist(p, g);
      if (d < XP_MAGNET_RANGE) {
        const a = Math.atan2(p.y - g.y, p.x - g.x);
        const pull = Math.min(8, (1 - d / XP_MAGNET_RANGE) * 14);
        g.x += Math.cos(a) * pull;
        g.y += Math.sin(a) * pull;
      }
      if (d < p.radius + g.radius) {
        p.score += g.value;
        xpGems.splice(i, 1);
        break;
      }
    }
  }
}

// ============================================================
// PLAYER INPUT
// ============================================================
function updatePlayers(dt) {
  for (const p of players.values()) {
    if (!p.alive) {
      if (Date.now() >= p.respawnAt) {
        p.x = rand(200, WORLD.w - 200);
        p.y = rand(200, WORLD.h - 200);
        p.hp = 100;
        p.alive = true;
        p.inputX = 0;
        p.inputY = 0;
      }
      continue;
    }
    const spd = p.speed * (dt / 16);
    const m = Math.hypot(p.inputX, p.inputY);
    if (m > 0.001) {
      p.x += (p.inputX / m) * spd;
      p.y += (p.inputY / m) * spd;
      p.lastAngle = Math.atan2(p.inputY, p.inputX);
    }
    p.x = clamp(p.x, 30, WORLD.w - 30);
    p.y = clamp(p.y, 30, WORLD.h - 30);
    // Shield regen
    if (p.shield < p.maxShield) p.shield = Math.min(p.maxShield, p.shield + 0.04 * dt / 10);
  }
}

// ============================================================
// NETWORK
// ============================================================
let nextId = 1;
const PLAYER_COLORS = ["#d4b8ff", "#7cb9ff", "#ffb97c", "#7cffb9", "#ff7cb9", "#7c7cff"];

function sendTo(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const p of players.values()) {
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}

function buildState() {
  const plArr = [];
  for (const p of players.values()) {
    plArr.push({
      id: p.id, x: Math.round(p.x), y: Math.round(p.y),
      hp: Math.round(p.hp), maxHP: p.maxHP,
      shield: Math.round(p.shield), maxShield: p.maxShield,
      name: p.name, color: p.color,
      alive: p.alive ? 1 : 0, score: Math.floor(p.score),
      kills: p.kills, angle: +p.lastAngle.toFixed(2),
    });
  }
  const eArr = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    eArr.push({
      id: e.id, x: Math.round(e.x), y: Math.round(e.y),
      hp: Math.round(e.hp), maxHP: Math.round(e.maxHP),
      color: e.color, name: e.name, type: e.type,
      radius: e.radius, alive: 1,
    });
  }
  const pArr = projectiles.map(p => ({
    x: Math.round(p.x), y: Math.round(p.y),
    vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
    r: p.radius, color: p.color || "#fff",
    life: p.life, dmg: Math.round(p.dmg),
  }));
  const xpArr = xpGems.map(g => ({
    x: Math.round(g.x), y: Math.round(g.y),
    r: g.radius, v: g.value, life: g.life,
  }));
  return { type: "state", t: gameTime, wave: waveNum, players: plArr, enemies: eArr, projectiles: pArr, xp: xpArr };
}

// ============================================================
// MAIN LOOP
// ============================================================
let lastTick = Date.now();
function tick() {
  const now = Date.now();
  const dt = Math.min(50, now - lastTick);
  lastTick = now;
  gameTime += dt;

  updatePlayers(dt);
  updateEnemyAI(dt);
  spawnWave(dt);
  tickProjectiles(dt);
  collectXPGems(dt);

  // Clean dead enemies
  enemies = enemies.filter(e => e.alive);

  // Broadcast
  if (now - lastBroadcast >= BROADCAST_MS) {
    lastBroadcast = now;
    broadcast(buildState());
  }
}

// ============================================================
// SERVER
// ============================================================
const fs = require("fs");
const path = require("path");
const ASSETS_DIR = path.join(__dirname, "android-app", "app", "src", "main", "assets");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".json": "application/json" };

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(path.join(ASSETS_DIR, "index.html")).pipe(res);
  } else if (req.url === "/game.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    fs.createReadStream(path.join(ASSETS_DIR, "game.js")).pipe(res);
  } else if (req.url === "/style.css") {
    res.writeHead(200, { "Content-Type": "text/css" });
    fs.createReadStream(path.join(ASSETS_DIR, "style.css")).pipe(res);
  } else {
    const ext = path.extname(req.url);
    const fp = path.join(ASSETS_DIR, req.url);
    if (fs.existsSync(fp)) {
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(fp).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`Witch.io server — ${players.size} players online`);
    }
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const id = nextId++;
  const name = `Witch${id}`;
  const color = PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length];
  const player = new ServerPlayer(ws, id, name, color);
  players.set(ws, player);

  sendTo(ws, {
    type: "welcome",
    id: player.id,
    name: player.name,
    color: player.color,
    world: WORLD,
  });

  console.log(`[+] Player ${name} joined (${players.size} online)`);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case "join": {
          player.name = (msg.name || name).slice(0, 16);
          player.color = msg.color || color;
          break;
        }
        case "input": {
          player.inputX = clamp(msg.x || 0, -1, 1);
          player.inputY = clamp(msg.y || 0, -1, 1);
          if (msg.angle !== undefined) player.lastAngle = msg.angle;
          break;
        }
        case "fire": {
          // Client-authoritative projectiles (simpler, less lag)
          if (!player.alive) break;
          projectiles.push({
            x: player.x, y: player.y,
            vx: Math.cos(player.lastAngle) * (msg.spd || 5),
            vy: Math.sin(player.lastAngle) * (msg.spd || 5),
            dmg: msg.dmg || 8, radius: msg.r || 6,
            life: msg.life || 800, pierce: msg.pierce || 1,
            color: msg.color || player.color,
            owner: "player", playerWs: ws,
          });
          break;
        }
        case "ping": {
          sendTo(ws, { type: "pong", t: Date.now() });
          break;
        }
      }
    } catch (_) {}
  });

  ws.on("close", () => {
    players.delete(ws);
    console.log(`[-] Player ${player.name} left (${players.size} online)`);
  });
});

setInterval(tick, TICK_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🔮 Witch.io server running on port ${PORT}`);
  console.log(`   Other players can join: ws://<your-ip>:${PORT}\n`);
  // Show LAN IP
  const os = require("os");
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`   Your LAN IP: ws://${net.address}:${PORT}`);
      }
    }
  }
  console.log("");
});
