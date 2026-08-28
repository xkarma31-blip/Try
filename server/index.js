// Blobz.io — authoritative multiplayer game server.
// Simulates the world (players + bots + food) on a fixed tick and broadcasts
// snapshots over WebSocket. Also serves the static client over HTTP so a single
// `node server/index.js` is enough for friends to play (open the URL in any
// browser, or point the Android app at it).

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import bonjour from "bonjour";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // repo root (where index.html lives)
const PORT = Number(process.env.PORT) || 3000;

const WORLD = { w: 4000, h: 4000 };
const FOOD_COUNT = 500;
const BOT_COUNT = 18;
const FOOD_RADIUS = 6;
const TICK_MS = 1000 / 30;
const RESPAWN_MS = 2000;

const rand = (min, max) => Math.random() * (max - min) + min;
const randColor = () => `hsl(${Math.floor(rand(0, 360))}, 70%, 60%)`;
const massToRadius = (mass) => Math.max(12, Math.sqrt(mass) * 4);
const speedFor = (mass) => 3.2 * Math.pow(30 / (mass + 30), 0.4);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let foods = [];
let bots = [];
const players = new Map(); // id -> player
let nextId = 1;

function spawnFood() {
  return { x: rand(0, WORLD.w), y: rand(0, WORLD.h), color: randColor() };
}

const BOT_NAMES = [
  "Vortex", "Nibbler", "Gloop", "Bubbles", "Chonk", "Spike",
  "Wobble", "Pixel", "Munch", "Doom", "Zoom", "Ghost", "Comet",
  "Tank", "Echo", "Blaze", "Quark", "Tofu",
];

function initBots() {
  bots = [];
  for (let i = 0; i < BOT_COUNT; i++) {
    bots.push({
      _i: i,
      x: rand(0, WORLD.w),
      y: rand(0, WORLD.h),
      mass: rand(20, 120),
      color: randColor(),
      name: BOT_NAMES[i % BOT_NAMES.length] + (Math.random() < 0.5 ? "" : Math.floor(rand(1, 99))),
      isPlayer: false,
      alive: true,
      target: null,
    });
  }
}

function initFood() {
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood());
}

function aliveBlobs() {
  const arr = [];
  for (const p of players.values()) if (p.alive) arr.push(p);
  for (const b of bots) if (b.alive) arr.push(b);
  return arr;
}

function botThink(bot) {
  if (!bot.target || Math.random() < 0.02) {
    const angle = rand(0, Math.PI * 2);
    const reach = rand(200, 700);
    bot.target = {
      x: clamp(bot.x + Math.cos(angle) * reach, 0, WORLD.w),
      y: clamp(bot.y + Math.sin(angle) * reach, 0, WORLD.h),
    };
  }
  const list = aliveBlobs();
  let threat = null;
  let prey = null;
  let bestPreyDist = Infinity;
  for (const other of list) {
    if (other === bot) continue;
    const d = Math.hypot(other.x - bot.x, other.y - bot.y);
    if (d > 600) continue;
    if (other.mass > bot.mass * 1.15) {
      if (!threat || d < Math.hypot(threat.x - bot.x, threat.y - bot.y)) threat = other;
    } else if (bot.mass > other.mass * 1.15) {
      if (d < bestPreyDist) {
        prey = other;
        bestPreyDist = d;
      }
    }
  }
  if (threat) {
    const ax = bot.x - threat.x;
    const ay = bot.y - threat.y;
    const m = Math.hypot(ax, ay) || 1;
    bot.target = { x: bot.x + (ax / m) * 400, y: bot.y + (ay / m) * 400 };
  } else if (prey) {
    bot.target = { x: prey.x, y: prey.y };
  }
}

function moveBlob(b, dx, dy) {
  const r = massToRadius(b.mass);
  const dist = Math.hypot(dx, dy);
  if (dist > 1) {
    const sp = Math.min(speedFor(b.mass), dist * 0.08);
    b.x += (dx / dist) * sp;
    b.y += (dy / dist) * sp;
  }
  b.x = clamp(b.x, r, WORLD.w - r);
  b.y = clamp(b.y, r, WORLD.h - r);
}

function simulate() {
  const now = Date.now();

  // Players
  for (const p of players.values()) {
    if (!p.alive) {
      if (now >= p.respawnAt) {
        p.x = rand(0, WORLD.w);
        p.y = rand(0, WORLD.h);
        p.mass = 30;
        p.input = { x: 0, y: 0 };
        p.alive = true;
      }
      continue;
    }
    if (p.mass > p.best) p.best = Math.floor(p.mass);
    const inp = p.input || { x: 0, y: 0 };
    const m = Math.hypot(inp.x, inp.y);
    if (m > 0.001) {
      const sp = Math.min(speedFor(p.mass), speedFor(p.mass) * Math.min(1, m));
      p.x += (inp.x / m) * sp;
      p.y += (inp.y / m) * sp;
    }
    const r = massToRadius(p.mass);
    p.x = clamp(p.x, r, WORLD.w - r);
    p.y = clamp(p.y, r, WORLD.h - r);
  }

  // Bots
  for (const bot of bots) {
    if (!bot.alive) continue;
    botThink(bot);
    if (bot.target) moveBlob(bot, bot.target.x - bot.x, bot.target.y - bot.y);
  }

  // Eat food
  for (const b of aliveBlobs()) {
    const r = massToRadius(b.mass);
    const r2 = r * r;
    for (let f = foods.length - 1; f >= 0; f--) {
      const food = foods[f];
      const dx = food.x - b.x;
      const dy = food.y - b.y;
      if (dx * dx + dy * dy < r2) {
        b.mass += 1;
        foods[f] = spawnFood();
      }
    }
  }

  // Collisions (eat or be eaten)
  const all = aliveBlobs();
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const rA = massToRadius(a.mass);
      const rB = massToRadius(b.mass);
      if (dist < rA + rB) {
        let eater, eaten;
        if (a.mass > b.mass * 1.15) {
          eater = a; eaten = b;
        } else if (b.mass > a.mass * 1.15) {
          eater = b; eaten = a;
        } else {
          continue;
        }
        eater.mass += eaten.mass * 0.8;
        if (eaten.isPlayer) {
          eaten.alive = false;
          eaten.respawnAt = Date.now() + RESPAWN_MS;
        } else {
          // respawn bot elsewhere to keep population stable
          eaten.x = rand(0, WORLD.w);
          eaten.y = rand(0, WORLD.h);
          eaten.mass = rand(20, 120);
          eaten.target = null;
        }
      }
    }
  }
}

function buildSnapshot() {
  const blobs = [];
  for (const p of players.values()) {
    blobs.push({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), m: Math.round(p.mass), c: p.color, n: p.name, p: 1, a: p.alive ? 1 : 0 });
  }
  for (const bot of bots) {
    blobs.push({ id: "b" + bot._i, x: Math.round(bot.x), y: Math.round(bot.y), m: Math.round(bot.mass), c: bot.color, n: bot.name, p: 0, a: 1 });
  }
  return {
    type: "state",
    t: Date.now(),
    world: WORLD,
    foods: foods.map((f) => [Math.round(f.x), Math.round(f.y), f.color]),
    blobs,
  };
}

let lastBroadcast = 0;
function tick() {
  simulate();
  const now = Date.now();
  if (now - lastBroadcast >= 1000 / 20) {
    lastBroadcast = now;
    const snap = JSON.stringify(buildSnapshot());
    for (const p of players.values()) {
      if (p.ws.readyState === p.ws.OPEN) p.ws.send(snap);
    }
  }
}

// ---------- HTTP static server ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

// ---------- WebSocket server ----------
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  let player = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      const id = nextId++;
      player = {
        id,
        ws,
        name: String(msg.name || "Player").slice(0, 16) || "Player",
        color: typeof msg.color === "string" && msg.color ? msg.color : randColor(),
        x: rand(0, WORLD.w),
        y: rand(0, WORLD.h),
        mass: 30,
        input: { x: 0, y: 0 },
        alive: true,
        respawnAt: 0,
        best: 30,
        isPlayer: true,
      };
      players.set(id, player);
      ws.send(
        JSON.stringify({
          type: "welcome",
          id,
          world: WORLD,
          color: player.color,
          name: player.name,
        })
      );
    } else if (msg.type === "input" && player) {
      player.input = {
        x: clamp(Number(msg.x) || 0, -1, 1),
        y: clamp(Number(msg.y) || 0, -1, 1),
      };
    }
  });

  ws.on("close", () => {
    if (player) players.delete(player.id);
  });
  ws.on("error", () => {
    if (player) players.delete(player.id);
  });
});

initFood();
initBots();
setInterval(tick, TICK_MS);

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

// Advertise on the local network via mDNS so the Android app (and any
// mDNS-aware client) can auto-discover the host with zero configuration.
let mdns;
try {
  mdns = bonjour();
  mdns.publish({ name: "Blobz.io", type: "blobz", protocol: "tcp", port: PORT });
} catch (e) {
  console.warn("mDNS advertise unavailable (continuing without LAN discovery):", e.message);
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Blobz.io server running (no internet required — LAN only):`);
  const ips = lanAddresses();
  console.log(`  On this device:  http://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`  On the WiFi/LAN: http://${ip}:${PORT}`);
  }
  console.log(`  Tell friends to open the WiFi/LAN URL, or use the Android app (auto-discovers).`);
});

function shutdown() {
  try {
    mdns && mdns.unpublishAll();
    mdns && mdns.destroy();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
