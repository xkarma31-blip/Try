(() => {
  "use strict";

  const WORLD = { w: 4000, h: 4000 };
  const FOOD_COUNT = 600;
  const BOT_COUNT = 18;
  const FOOD_RADIUS = 6;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const leaderboardList = document.getElementById("leaderboard-list");
  const startScreen = document.getElementById("start-screen");
  const endScreen = document.getElementById("end-screen");
  const nameInput = document.getElementById("name-input");
  const playBtn = document.getElementById("play-btn");
  const restartBtn = document.getElementById("restart-btn");
  const finalScoreEl = document.getElementById("final-score");

  let view = { w: 0, h: 0 };
  let camera = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0 };
  let running = false;
  let animationId = null;

  const rand = (min, max) => Math.random() * (max - min) + min;
  const randColor = () =>
    `hsl(${Math.floor(rand(0, 360))}, 70%, 60%)`;

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
      this.vx = 0;
      this.vy = 0;
      this.target = null;
      this.speed = 1;
    }

    get radius() {
      return massToRadius(this.mass);
    }

    update() {
      const r = this.radius;
      const baseSpeed = 3.2 * Math.pow(30 / (this.mass + 30), 0.4);
      let tx, ty;
      if (this.isPlayer) {
        tx = this.x + (mouse.x - view.w / 2);
        ty = this.y + (mouse.y - view.h / 2);
      } else {
        this.think();
        tx = this.target ? this.target.x : this.x;
        ty = this.target ? this.target.y : this.y;
      }
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
      this.x += this.vx;
      this.y += this.vy;
      this.x = Math.max(r, Math.min(WORLD.w - r, this.x));
      this.y = Math.max(r, Math.min(WORLD.h - r, this.y));
    }

    think() {
      if (!this.target || Math.random() < 0.02) {
        const angle = rand(0, Math.PI * 2);
        const reach = rand(200, 700);
        this.target = {
          x: Math.max(0, Math.min(WORLD.w, this.x + Math.cos(angle) * reach)),
          y: Math.max(0, Math.min(WORLD.h, this.y + Math.sin(angle) * reach)),
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
      ctx.beginPath();
      if (this.isPlayer) {
        ctx.arc(this.x - camera.x, this.y - camera.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffd369";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(this.x - camera.x, this.y - camera.y, r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(this.x - camera.x - r * 0.3, this.y - camera.y - r * 0.3, r * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(12, r * 0.4)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeText(this.name, this.x - camera.x, this.y - camera.y);
      ctx.fillText(this.name, this.x - camera.x, this.y - camera.y);
    }
  }

  let foods = [];
  let blobs = [];
  let player = null;

  function spawnFood() {
    return {
      x: rand(0, WORLD.w),
      y: rand(0, WORLD.h),
      color: randColor(),
    };
  }

  function init() {
    foods = [];
    for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood());

    blobs = [];
    const botNames = [
      "Vortex", "Nibbler", "Gloop", "Bubbles", "Chonk", "Spike",
      "Wobble", "Pixel", "Munch", "Doom", "Zoom", "Ghost", "Comet",
      "Tank", "Echo", "Blaze", "Quark", "Tofu",
    ];
    for (let i = 0; i < BOT_COUNT; i++) {
      blobs.push(
        new Blob(
          rand(0, WORLD.w),
          rand(0, WORLD.h),
          rand(20, 120),
          randColor(),
          botNames[i % botNames.length] + (Math.random() < 0.5 ? "" : Math.floor(rand(1, 99))),
        )
      );
    }
  }

  function addPlayer(name) {
    player = new Blob(
      WORLD.w / 2,
      WORLD.h / 2,
      30,
      "#ffd369",
      name || "You",
      true
    );
    blobs.push(player);
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
            removeBlob(j);
            if (b === player) return endGame();
          } else if (b.mass > a.mass * 1.15) {
            b.mass += a.mass * 0.8;
            removeBlob(i);
            if (a === player) return endGame();
            break;
          }
        }
      }
    }
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
    if (!player) return;
    const targetX = player.x - view.w / 2;
    const targetY = player.y - view.h / 2;
    const scale = 1 / Math.pow(player.mass / 30, 0.25);
    const clampedScale = Math.max(0.45, Math.min(1, scale));
    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;
    view.scale = clampedScale;
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
    const startX = Math.floor((camera.x) / grid) * grid;
    const startY = Math.floor((camera.y) / grid) * grid;
    ctx.beginPath();
    for (let x = startX; x <= camera.x + view.w / s; x += grid) {
      ctx.moveTo(x - camera.x, 0);
      ctx.lineTo(x - camera.x, WORLD.h);
    }
    for (let y = startY; y <= camera.y + view.h / s; y += grid) {
      ctx.moveTo(0, y - camera.y);
      ctx.lineTo(WORLD.w, y - camera.y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3 / s;
    ctx.strokeRect(-camera.x, -camera.y, WORLD.w, WORLD.h);
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

  function updateLeaderboard() {
    const sorted = [...blobs].sort((a, b) => b.mass - a.mass).slice(0, 10);
    leaderboardList.innerHTML = "";
    sorted.forEach((b) => {
      const li = document.createElement("li");
      if (b === player) li.classList.add("me");
      li.innerHTML = `<span>${escapeHtml(b.name)}</span><span>${Math.floor(b.mass)}</span>`;
      leaderboardList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function loop() {
    if (!running) return;

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

    if (player) {
      scoreEl.textContent = `Mass: ${Math.floor(player.mass)}`;
    }
    updateLeaderboard();

    animationId = requestAnimationFrame(loop);
  }

  function startGame() {
    const name = (nameInput.value || "You").trim().slice(0, 16);
    init();
    addPlayer(name);
    camera = { x: player.x - view.w / 2, y: player.y - view.h / 2 };
    view.scale = 1;
    startScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    running = true;
    cancelAnimationFrame(animationId);
    loop();
  }

  function endGame() {
    running = false;
    finalScoreEl.textContent = Math.floor(player.mass);
    player = null;
    endScreen.classList.remove("hidden");
  }

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = view.w;
    canvas.height = view.h;
  }

  window.addEventListener("resize", resize);
  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches[0]) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
    e.preventDefault();
  }, { passive: false });

  playBtn.addEventListener("click", startGame);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame();
  });
  restartBtn.addEventListener("click", startGame);

  resize();
})();
