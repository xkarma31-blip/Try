(() => {
  "use strict";

  let world = { w: 4000, h: 4000 };
  const FOOD_RADIUS = 6;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const leaderboardList = document.getElementById("leaderboard-list");
  const startScreen = document.getElementById("start-screen");
  const endScreen = document.getElementById("end-screen");
  const nameInput = document.getElementById("name-input");
  const nameInput2 = document.getElementById("name-input-2");
  const play1pBtn = document.getElementById("play-1p");
  const play2pBtn = document.getElementById("play-2p");
  const restartBtn = document.getElementById("restart-btn");
  const endMessageEl = document.getElementById("end-message");

  let view = { w: 0, h: 0, scale: 1 };
  let camera = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0 };
  let running = false;
  let mode = "single";
  let animationId = null;

  let foods = [];
  let blobs = [];
  let players = [];
  let player = null;

  const joy = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };
  const joyOrigin = { p1: null, p2: null };

  const rand = (min, max) => Math.random() * (max - min) + min;
  const randColor = () => `hsl(${Math.floor(rand(0, 360))}, 70%, 60%)`;

  function massToRadius(mass) {
    return Math.max(12, Math.sqrt(mass) * 4);
  }

  class Blob {
    constructor(x, y, mass, color, name, isPlayer = false) {
      this.x = x;
      this.y = y;
      this.mass = mass;
      this.color = color;
      this.name = name;
      this.isPlayer = isPlayer;
      this.alive = true;
      this.input = { x: 0, y: 0 };
      this.vx = 0;
      this.vy = 0;
      this.target = null;
    }

    get radius() {
      return massToRadius(this.mass);
    }

    update() {
      const r = this.radius;
      const baseSpeed = 3.2 * Math.pow(30 / (this.mass + 30), 0.4);
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
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          const sp = Math.min(baseSpeed, dist * 0.08);
          this.vx = (dx / dist) * sp;
          this.vy = (dy / dist) * sp;
        } else {
          this.vx = this.vy = 0;
        }
      }
      this.x += this.vx;
      this.y += this.vy;
      this.x = Math.max(r, Math.min(world.w - r, this.x));
      this.y = Math.max(r, Math.min(world.h - r, this.y));
    }

    think() {
      if (!this.target || Math.random() < 0.02) {
        const angle = rand(0, Math.PI * 2);
        const reach = rand(200, 700);
        this.target = {
          x: Math.max(0, Math.min(world.w, this.x + Math.cos(angle) * reach)),
          y: Math.max(0, Math.min(world.h, this.y + Math.sin(angle) * reach)),
        };
      }
      let threat = null;
      let prey = null;
      let bestPreyDist = Infinity;
      for (const other of blobs) {
        if (other === this) continue;
        const d = Math.hypot(other.x - this.x, other.y - this.y);
        if (d > 600) continue;
        if (other.mass > this.mass * 1.15) {
          if (!threat || d < Math.hypot(threat.x - this.x, threat.y - this.y)) {
            threat = other;
          }
        } else if (this.mass > other.mass * 1.15) {
          if (d < bestPreyDist) {
            prey = other;
            bestPreyDist = d;
          }
        }
      }
      if (threat) {
        const ax = this.x - threat.x;
        const ay = this.y - threat.y;
        const m = Math.hypot(ax, ay) || 1;
        this.target = { x: this.x + (ax / m) * 400, y: this.y + (ay / m) * 400 };
      } else if (prey) {
        this.target = { x: prey.x, y: prey.y };
      }
    }

    draw() {
      const r = this.radius;
      const sx = this.x - camera.x;
      const sy = this.y - camera.y;
      if (this.isPlayer) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(12, r * 0.4)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeText(this.name, sx, sy);
      ctx.fillText(this.name, sx, sy);
    }
  }

  function spawnFood() {
    return {
      x: rand(0, world.w),
      y: rand(0, world.h),
      color: randColor(),
    };
  }

  function init(botCount, foodCount) {
    foods = [];
    for (let i = 0; i < foodCount; i++) foods.push(spawnFood());

    blobs = [];
    const botNames = [
      "Vortex", "Nibbler", "Gloop", "Bubbles", "Chonk", "Spike",
      "Wobble", "Pixel", "Munch", "Doom", "Zoom", "Ghost", "Comet",
      "Tank", "Echo", "Blaze", "Quark", "Tofu",
    ];
    for (let i = 0; i < botCount; i++) {
      blobs.push(
        new Blob(
          rand(0, world.w),
          rand(0, world.h),
          rand(20, 120),
          randColor(),
          botNames[i % botNames.length] + (Math.random() < 0.5 ? "" : Math.floor(rand(1, 99))),
        )
      );
    }
  }

  function addPlayer(name, color) {
    const offset = players.length;
    const px = world.w / 2 + (offset === 1 ? 250 : offset === 2 ? -250 : 0);
    const py = world.h / 2 + (offset === 1 ? 180 : offset === 2 ? -180 : 0);
    const p = new Blob(px, py, 30, color, name || "You", true);
    players.push(p);
    blobs.push(p);
    if (offset === 0) player = p;
    return p;
  }

  function handleCollisions() {
    for (let i = blobs.length - 1; i >= 0; i--) {
      const a = blobs[i];
      for (let j = i - 1; j >= 0; j--) {
        const b = blobs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const rA = a.radius;
        const rB = b.radius;
        if (dist < rA + rB) {
          if (a.mass > b.mass * 1.15) {
            a.mass += b.mass * 0.8;
            const dead = b;
            removeBlob(j);
            onPlayerDeath(dead);
          } else if (b.mass > a.mass * 1.15) {
            b.mass += a.mass * 0.8;
            const dead = a;
            removeBlob(i);
            onPlayerDeath(dead);
            break;
          }
        }
      }
    }
    if (players.length > 1) {
      const aliveHumans = players.filter((p) => p.alive);
      if (aliveHumans.length <= 1) endGame(aliveHumans[0] || null);
    }
  }

  function onPlayerDeath(dead) {
    if (dead.isPlayer) dead.alive = false;
  }

  function removeBlob(index) {
    blobs.splice(index, 1);
  }

  function eatFood() {
    for (let i = blobs.length - 1; i >= 0; i--) {
      const blob = blobs[i];
      const r = blob.radius;
      for (let f = foods.length - 1; f >= 0; f--) {
        const food = foods[f];
        const dx = food.x - blob.x;
        const dy = food.y - blob.y;
        if (dx * dx + dy * dy < r * r) {
          blob.mass += 1;
          foods.splice(f, 1);
          foods.push(spawnFood());
        }
      }
    }
  }

  function updateCamera() {
    if (!players.length) return;
    const alive = players.filter((p) => p.alive);
    const list = alive.length ? alive : players;
    if (list.length === 1) {
      const p = list[0];
      const targetX = p.x - view.w / 2;
      const targetY = p.y - view.h / 2;
      const scale = 1 / Math.pow(p.mass / 30, 0.25);
      const clampedScale = Math.max(0.45, Math.min(1, scale));
      camera.x += (targetX - camera.x) * 0.1;
      camera.y += (targetY - camera.y) * 0.1;
      view.scale += (clampedScale - view.scale) * 0.1;
    } else {
      let cx = 0;
      let cy = 0;
      for (const p of list) {
        cx += p.x;
        cy += p.y;
      }
      cx /= list.length;
      cy /= list.length;
      let maxD = 200;
      for (const p of list) {
        const d = Math.hypot(p.x - cx, p.y - cy) + p.radius;
        if (d > maxD) maxD = d;
      }
      const fit = Math.min(view.w, view.h) / (2 * maxD * 1.3);
      const clampedScale = Math.max(0.25, Math.min(1, fit));
      camera.x += (cx - view.w / 2 - camera.x) * 0.1;
      camera.y += (cy - view.h / 2 - camera.y) * 0.1;
      view.scale += (clampedScale - view.scale) * 0.1;
    }
  }

  function drawGrid() {
    const s = view.scale || 1;
    ctx.save();
    ctx.scale(s, s);
    const offX = -camera.x * s;
    const offY = -camera.y * s;
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
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3 / s;
    ctx.strokeRect(-camera.x, -camera.y, world.w, world.h);
    ctx.restore();
  }

  function drawFood() {
    const s = view.scale || 1;
    ctx.save();
    ctx.scale(s, s);
    ctx.translate(-camera.x, -camera.y);
    for (const food of foods) {
      ctx.beginPath();
      ctx.arc(food.x, food.y, FOOD_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = food.color;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBlobs() {
    const s = view.scale || 1;
    ctx.save();
    ctx.scale(s, s);
    const sorted = [...blobs].sort((a, b) => a.mass - b.mass);
    for (const blob of sorted) blob.draw();
    ctx.restore();
  }

  function drawJoysticks() {
    if (mode !== "local2p") return;
    for (const side of ["p1", "p2"]) {
      const o = joyOrigin[side];
      if (!o) continue;
      const v = joy[side];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 55, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x + v.x * 50, o.y + v.y * 50, 22, 0, Math.PI * 2);
      ctx.fillStyle = side === "p1" ? "rgba(255,211,105,0.8)" : "rgba(255,93,143,0.8)";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function updateLeaderboard() {
    const sorted = [...blobs].sort((a, b) => b.mass - a.mass).slice(0, 10);
    leaderboardList.innerHTML = "";
    sorted.forEach((b) => {
      const li = document.createElement("li");
      if (b.isPlayer) li.classList.add("me");
      li.innerHTML = `<span>${escapeHtml(b.name)}</span><span>${Math.floor(b.mass)}</span>`;
      leaderboardList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function drivePlayerInputs() {
    if (mode === "single") {
      const p = players[0];
      if (p && p.alive) {
        const dx = mouse.x - view.w / 2;
        const dy = mouse.y - view.h / 2;
        const m = Math.hypot(dx, dy);
        p.input = m > 1 ? { x: dx / m, y: dy / m } : { x: 0, y: 0 };
      }
    } else {
      if (players[0] && players[0].alive) players[0].input = { x: joy.p1.x, y: joy.p1.y };
      if (players[1] && players[1].alive) players[1].input = { x: joy.p2.x, y: joy.p2.y };
    }
  }

  function loop() {
    if (!running) return;

    drivePlayerInputs();
    for (const blob of blobs) blob.update();
    eatFood();
    handleCollisions();
    if (!running) return;

    updateCamera();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    drawGrid();
    drawFood();
    drawBlobs();
    drawJoysticks();

    if (mode === "local2p") {
      scoreEl.textContent = players
        .filter((p) => p.alive)
        .map((p) => `${p.name}: ${Math.floor(p.mass)}`)
        .join("    ");
    } else if (player) {
      scoreEl.textContent = `Mass: ${Math.floor(player.mass)}`;
    }
    updateLeaderboard();

    animationId = requestAnimationFrame(loop);
  }

  function startGame(selectedMode) {
    mode = selectedMode;
    if (mode === "local2p") {
      world = { w: 2200, h: 2200 };
      var botCount = 10;
      var foodCount = 350;
    } else {
      world = { w: 4000, h: 4000 };
      var botCount = 18;
      var foodCount = 600;
    }

    players = [];
    player = null;
    init(botCount, foodCount);

    const p1name = (nameInput.value || "Player 1").trim().slice(0, 16) || "Player 1";
    addPlayer(p1name, "#ffd369");
    if (mode === "local2p") {
      const p2name = (nameInput2.value || "Player 2").trim().slice(0, 16) || "Player 2";
      addPlayer(p2name, "#ff5d8f");
      joy.p1 = { x: 0, y: 0 };
      joy.p2 = { x: 0, y: 0 };
    }

    camera = { x: world.w / 2 - view.w / 2, y: world.h / 2 - view.h / 2 };
    view.scale = 1;
    startScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    running = true;
    cancelAnimationFrame(animationId);
    loop();
  }

  function endGame(winner) {
    running = false;
    if (mode === "local2p") {
      endMessageEl.textContent = winner && winner.alive ? `${winner.name} wins!` : "Bots win!";
    } else {
      endMessageEl.textContent = `You reached a mass of ${Math.floor(player ? player.mass : 0)}.`;
    }
    player = null;
    endScreen.classList.remove("hidden");
  }

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = view.w;
    canvas.height = view.h;
    joyOrigin.p1 = { x: 90, y: view.h - 90 };
    joyOrigin.p2 = { x: view.w - 90, y: view.h - 90 };
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function onTouchStart(e) {
    if (mode !== "local2p") {
      if (e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
      }
      e.preventDefault();
      return;
    }
    for (const t of e.changedTouches) {
      const side = t.clientX < view.w / 2 ? "p1" : "p2";
      const o = joyOrigin[side];
      let dx = t.clientX - o.x;
      let dy = t.clientY - o.y;
      const d = Math.hypot(dx, dy);
      const R = 60;
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      joy[side].x = dx / R;
      joy[side].y = dy / R;
    }
    e.preventDefault();
  }

  function onTouchMove(e) {
    if (mode !== "local2p") {
      if (e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
      }
      e.preventDefault();
      return;
    }
    for (const t of e.changedTouches) {
      const side = t.clientX < view.w / 2 ? "p1" : "p2";
      const o = joyOrigin[side];
      let dx = t.clientX - o.x;
      let dy = t.clientY - o.y;
      const d = Math.hypot(dx, dy);
      const R = 60;
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      joy[side].x = dx / R;
      joy[side].y = dy / R;
    }
    e.preventDefault();
  }

  function onTouchEnd(e) {
    if (mode !== "local2p") return;
    for (const t of e.changedTouches) {
      const side = t.clientX < view.w / 2 ? "p1" : "p2";
      joy[side].x = 0;
      joy[side].y = 0;
    }
  }

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("touchcancel", onTouchEnd);

  play1pBtn.addEventListener("click", () => startGame("single"));
  play2pBtn.addEventListener("click", () => startGame("local2p"));
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame("single");
  });
  nameInput2.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame("local2p");
  });
  restartBtn.addEventListener("click", () => {
    endScreen.classList.add("hidden");
    startScreen.classList.remove("hidden");
  });

  resize();
})();
