// Blob.io — a minimal agar-style .io game
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const massEl = document.getElementById('mass');
  const finalScoreEl = document.getElementById('final-score');
  const overlay = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const themeToggle = document.getElementById('theme-toggle');

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    themeToggle.textContent = theme === 'dark' ? '🌙 Dark' : '☀️ Light';
    localStorage.setItem('blobio-theme', theme);
  }
  applyTheme(localStorage.getItem('blobio-theme') || 'dark');
  themeToggle.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  // ---------- World ----------
  const WORLD = { w: 4000, h: 4000 };
  const FOOD_COUNT = 250;
  const BOT_COUNT = 14;
  const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; }
  function radiusFromMass(m) { return Math.sqrt(m) * 3; }

  let player, bots, food, running = false, score = 0;
  const mouse = { x: 0, y: 0 };
  let boosting = false;

  function spawnFood(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), mass: rand(1, 3), color: pick(COLORS) });
    }
    return arr;
  }

  function spawnBot() {
    return {
      x: rand(0, WORLD.w),
      y: rand(0, WORLD.h),
      vx: 0, vy: 0,
      mass: rand(15, 80),
      color: pick(COLORS),
      name: 'Bot' + Math.floor(Math.random() * 1000),
      target: null,
      retargetIn: 0,
    };
  }

  function init() {
    player = { x: WORLD.w / 2, y: WORLD.h / 2, mass: 20, color: '#58a6ff', name: 'You' };
    bots = [];
    for (let i = 0; i < BOT_COUNT; i++) bots.push(spawnBot());
    food = spawnFood(FOOD_COUNT);
    score = 0;
    running = true;
    gameoverEl.classList.add('hidden');
    overlay.classList.add('hidden');
  }

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Input ----------
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { boosting = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') boosting = false;
  });

  // ---------- Game logic ----------
  function updatePlayer(dt) {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const targetX = mouse.x - viewW / 2;
    const targetY = mouse.y - viewH / 2;
    const len = Math.hypot(targetX, targetY) || 1;
    const speed = (3 / Math.sqrt(player.mass / 20)) * (boosting && player.mass > 25 ? 2.2 : 1);
    if (boosting && player.mass > 25) player.mass -= 0.08 * dt * 60;
    player.x += (targetX / len) * speed * dt * 60;
    player.y += (targetY / len) * speed * dt * 60;
    player.x = Math.max(0, Math.min(WORLD.w, player.x));
    player.y = Math.max(0, Math.min(WORLD.h, player.y));
  }

  function updateBots(dt) {
    for (const bot of bots) {
      bot.retargetIn -= dt;
      const br = radiusFromMass(bot.mass);

      // Threat avoidance
      let threat = null;
      if (bot.mass < player.mass * 0.9 && dist2(bot, player) < 90000) threat = player;
      for (const other of bots) {
        if (other === bot) continue;
        if (other.mass > bot.mass * 1.1 && dist2(bot, other) < 90000) {
          if (!threat || dist2(bot, other) < dist2(bot, threat)) threat = other;
        }
      }

      if (threat) {
        const dx = bot.x - threat.x, dy = bot.y - threat.y;
        const len = Math.hypot(dx, dy) || 1;
        bot.target = { x: bot.x + (dx/len) * 400, y: bot.y + (dy/len) * 400 };
      } else if (bot.retargetIn <= 0 || !bot.target) {
        // Hunt: pick something smaller (food or smaller bot) nearby, else random
        let best = null, bestD = Infinity;
        if (bot.mass > player.mass * 1.15 && dist2(bot, player) < 250000) {
          best = player; bestD = dist2(bot, player);
        }
        for (const other of bots) {
          if (other === bot) continue;
          if (other.mass < bot.mass * 0.85) {
            const d = dist2(bot, other);
            if (d < bestD && d < 250000) { best = other; bestD = d; }
          }
        }
        if (!best) {
          for (let i = 0; i < 30; i++) {
            const f = food[Math.floor(Math.random() * food.length)];
            if (!f) continue;
            const d = dist2(bot, f);
            if (d < bestD) { best = f; bestD = d; }
          }
        }
        bot.target = best ? { x: best.x, y: best.y } : { x: rand(0, WORLD.w), y: rand(0, WORLD.h) };
        bot.retargetIn = rand(1, 3);
      }

      const dx = bot.target.x - bot.x, dy = bot.target.y - bot.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = 2.6 / Math.sqrt(bot.mass / 20);
      bot.x += (dx / len) * speed * dt * 60;
      bot.y += (dy / len) * speed * dt * 60;
      bot.x = Math.max(0, Math.min(WORLD.w, bot.x));
      bot.y = Math.max(0, Math.min(WORLD.h, bot.y));
    }
  }

  function handleCollisions() {
    const pr = radiusFromMass(player.mass);

    // Player eats food
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      if (dist2(player, f) < pr * pr) {
        player.mass += f.mass;
        score += Math.ceil(f.mass);
        food.splice(i, 1);
      }
    }

    // Bots eat food
    for (const bot of bots) {
      const br = radiusFromMass(bot.mass);
      for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        if (dist2(bot, f) < br * br) {
          bot.mass += f.mass;
          food.splice(i, 1);
        }
      }
    }

    // Player vs bots
    for (let i = bots.length - 1; i >= 0; i--) {
      const bot = bots[i];
      const br = radiusFromMass(bot.mass);
      const d2 = dist2(player, bot);
      if (player.mass > bot.mass * 1.15 && d2 < pr * pr * 0.8) {
        player.mass += bot.mass * 0.8;
        score += Math.floor(bot.mass);
        bots.splice(i, 1);
      } else if (bot.mass > player.mass * 1.15 && d2 < br * br * 0.8) {
        gameOver();
        return;
      }
    }

    // Bot vs bot
    for (let i = bots.length - 1; i >= 0; i--) {
      const a = bots[i];
      if (!a) continue;
      const ar = radiusFromMass(a.mass);
      for (let j = i - 1; j >= 0; j--) {
        const b = bots[j];
        if (!b) continue;
        const d2 = dist2(a, b);
        if (a.mass > b.mass * 1.15 && d2 < ar * ar * 0.8) {
          a.mass += b.mass * 0.8;
          bots.splice(j, 1);
          i--;
        } else if (b.mass > a.mass * 1.15) {
          const br = radiusFromMass(b.mass);
          if (d2 < br * br * 0.8) {
            b.mass += a.mass * 0.8;
            bots.splice(i, 1);
            break;
          }
        }
      }
    }

    // Maintain population
    while (food.length < FOOD_COUNT) {
      food.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), mass: rand(1, 3), color: pick(COLORS) });
    }
    while (bots.length < BOT_COUNT) bots.push(spawnBot());
  }

  function gameOver() {
    running = false;
    finalScoreEl.textContent = score;
    gameoverEl.classList.remove('hidden');
  }

  // ---------- Render ----------
  function draw() {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const camX = player.x - viewW / 2;
    const camY = player.y - viewH / 2;

    ctx.fillStyle = cssVar('--bg');
    ctx.fillRect(0, 0, viewW, viewH);

    // Grid
    ctx.strokeStyle = cssVar('--grid');
    ctx.lineWidth = 1;
    const step = 50;
    const startX = -((camX) % step);
    const startY = -((camY) % step);
    ctx.beginPath();
    for (let x = startX; x < viewW; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, viewH);
    }
    for (let y = startY; y < viewH; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(viewW, y);
    }
    ctx.stroke();

    // World border
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 2;
    ctx.strokeRect(-camX, -camY, WORLD.w, WORLD.h);

    // Food
    for (const f of food) {
      const sx = f.x - camX, sy = f.y - camY;
      if (sx < -10 || sx > viewW + 10 || sy < -10 || sy > viewH + 10) continue;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(sx, sy, radiusFromMass(f.mass), 0, Math.PI * 2);
      ctx.fill();
    }

    // Bots + player drawn sorted by mass (small under big)
    const everyone = [...bots, player].sort((a, b) => a.mass - b.mass);
    for (const e of everyone) {
      const sx = e.x - camX, sy = e.y - camY;
      const r = radiusFromMass(e.mass);
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (r > 14) {
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(10, r / 2.5)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.name, sx, sy);
      }
    }

    // Minimap
    const mmSize = 130;
    const mmX = viewW - mmSize - 16;
    const mmY = viewH - mmSize - 30;
    ctx.fillStyle = cssVar('--panel');
    ctx.globalAlpha = 0.85;
    ctx.fillRect(mmX, mmY, mmSize, mmSize);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--panel-border');
    ctx.strokeRect(mmX, mmY, mmSize, mmSize);
    for (const bot of bots) {
      ctx.fillStyle = bot.color;
      ctx.fillRect(mmX + (bot.x / WORLD.w) * mmSize - 1, mmY + (bot.y / WORLD.h) * mmSize - 1, 2, 2);
    }
    ctx.fillStyle = cssVar('--accent');
    ctx.fillRect(mmX + (player.x / WORLD.w) * mmSize - 2, mmY + (player.y / WORLD.h) * mmSize - 2, 4, 4);
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running) {
      updatePlayer(dt);
      updateBots(dt);
      handleCollisions();
      scoreEl.textContent = score;
      massEl.textContent = Math.floor(player.mass);
    }
    if (player) draw();
    requestAnimationFrame(frame);
  }

  // ---------- Buttons ----------
  startBtn.addEventListener('click', init);
  restartBtn.addEventListener('click', init);

  // Show a paused world behind menu
  player = { x: WORLD.w / 2, y: WORLD.h / 2, mass: 20, color: '#58a6ff', name: 'You' };
  bots = [];
  for (let i = 0; i < BOT_COUNT; i++) bots.push(spawnBot());
  food = spawnFood(FOOD_COUNT);
  requestAnimationFrame(frame);
})();
