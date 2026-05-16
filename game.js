// Witches.io — top-down witch arena. Inspired by arrow.io + magica.io.
(() => {
  'use strict';

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const levelEl = document.getElementById('level');
  const killsEl = document.getElementById('kills');
  const hpFill = document.getElementById('hp-fill');
  const hpText = document.getElementById('hp-text');
  const xpFill = document.getElementById('xp-fill');
  const overlay = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');
  const levelupEl = document.getElementById('levelup');
  const upgradeChoicesEl = document.getElementById('upgrade-choices');
  const finalLevelEl = document.getElementById('final-level');
  const finalKillsEl = document.getElementById('final-kills');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const joyMove = document.getElementById('joystick-move');
  const joyAim = document.getElementById('joystick-aim');

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
    localStorage.setItem('witchio-theme', theme);
  }
  applyTheme(localStorage.getItem('witchio-theme') || 'dark');
  themeToggle.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  // ---------- Touch detection ----------
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('is-touch');

  // ---------- World ----------
  const WORLD = { w: 3000, h: 3000 };
  const WITCH_EMOJI = ['🧙‍♀️', '🧙‍♂️', '🧙', '🧛‍♀️', '🧟‍♀️', '👻', '🦇'];
  const DECOR_EMOJI = ['🌲', '🍄', '🪦', '🕸️', '🌑'];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function now() { return performance.now(); }

  // ---------- State ----------
  let player, enemies, projectiles, particles, decor, running = false, paused = false;
  let kills = 0;
  let spawnTimer = 0;
  let waveLevel = 1;
  const keys = {};
  const camera = { x: 0, y: 0 };

  // ---------- Player factory ----------
  function newPlayer() {
    return {
      x: WORLD.w / 2,
      y: WORLD.h / 2,
      r: 22,
      emoji: '🧙‍♀️',
      hp: 100,
      maxHp: 100,
      speed: 230,            // px per second
      level: 1,
      xp: 0,
      xpToNext: 8,
      // Spell stats
      damage: 12,
      fireRate: 1.8,         // shots / sec (auto)
      projectileSpeed: 520,
      projectileLife: 1.0,
      projectiles: 1,        // # per cast
      spread: 0.18,          // radians between bullets when multishot
      pierce: 0,
      regen: 0,              // hp/sec
      element: 'arcane',
      // internal
      fireCd: 0,
      facing: 0,             // last aim direction (radians)
      iframes: 0,
    };
  }

  function newEnemy(lvl) {
    const stats = {
      basic:  { emoji: '🧟‍♀️', hp: 22 + lvl*6,  speed: 95 + lvl*3, dmg: 8,  xp: 3, r: 20, color: '#86efac' },
      fast:   { emoji: '🦇',   hp: 14 + lvl*4,  speed: 165 + lvl*4, dmg: 6,  xp: 4, r: 16, color: '#fb923c' },
      caster: { emoji: '🧙‍♂️', hp: 30 + lvl*7,  speed: 70 + lvl*2, dmg: 12, xp: 6, r: 22, color: '#f472b6', shoots: true },
      tank:   { emoji: '🧛‍♀️', hp: 70 + lvl*15, speed: 60 + lvl*2, dmg: 16, xp: 10, r: 28, color: '#a78bfa' },
      ghost:  { emoji: '👻',   hp: 18 + lvl*5,  speed: 120 + lvl*3, dmg: 9,  xp: 5, r: 18, color: '#e0e7ff' },
    };
    const roll = Math.random();
    let kind;
    if (lvl >= 5 && roll < 0.12) kind = 'tank';
    else if (lvl >= 2 && roll < 0.30) kind = 'caster';
    else if (roll < 0.55) kind = 'fast';
    else if (roll < 0.75) kind = 'ghost';
    else kind = 'basic';
    const s = stats[kind];

    // spawn off-screen relative to player
    const ang = Math.random() * Math.PI * 2;
    const dist = 700 + Math.random() * 400;
    return {
      x: clamp(player.x + Math.cos(ang) * dist, 60, WORLD.w - 60),
      y: clamp(player.y + Math.sin(ang) * dist, 60, WORLD.h - 60),
      r: s.r,
      hp: s.hp,
      maxHp: s.hp,
      speed: s.speed,
      dmg: s.dmg,
      xp: s.xp,
      color: s.color,
      emoji: s.emoji,
      kind,
      shoots: !!s.shoots,
      fireCd: rand(1, 2.5),
      hitFlash: 0,
    };
  }

  // ---------- Init / reset ----------
  function init() {
    player = newPlayer();
    enemies = [];
    projectiles = [];
    particles = [];
    decor = [];
    kills = 0;
    waveLevel = 1;
    spawnTimer = 0;
    paused = false;
    running = true;

    // scatter decor
    for (let i = 0; i < 120; i++) {
      decor.push({
        x: rand(0, WORLD.w),
        y: rand(0, WORLD.h),
        emoji: pick(DECOR_EMOJI),
        size: rand(18, 36),
        rot: rand(-0.2, 0.2),
      });
    }
    // initial enemies
    for (let i = 0; i < 6; i++) enemies.push(newEnemy(1));

    overlay.classList.add('hidden');
    gameoverEl.classList.add('hidden');
    levelupEl.classList.add('hidden');
    updateHud();
  }

  function gameOver() {
    running = false;
    finalLevelEl.textContent = player.level;
    finalKillsEl.textContent = kills;
    gameoverEl.classList.remove('hidden');
  }

  // ---------- Resize ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Input ----------
  const mouse = { x: window.innerWidth/2, y: window.innerHeight/2, down: false, used: false };

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.used = true;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  canvas.addEventListener('mouseup', () => { mouse.down = false; });

  // ---- Virtual joysticks (multitouch) ----
  const touchState = {
    move: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 },
    aim:  { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 },
  };

  function joyCenter(joy) {
    const r = joy.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: r.width / 2 };
  }
  function setStick(joy, dx, dy) {
    const stick = joy.querySelector('.joystick-stick');
    const max = joy.getBoundingClientRect().width / 2 - 28;
    const mag = Math.hypot(dx, dy);
    const clamped = mag > max ? max / mag : 1;
    stick.style.transform = `translate(calc(-50% + ${dx*clamped}px), calc(-50% + ${dy*clamped}px))`;
  }
  function resetStick(joy) {
    joy.querySelector('.joystick-stick').style.transform = 'translate(-50%, -50%)';
  }

  function handleTouchStart(e) {
    for (const t of e.changedTouches) {
      const half = window.innerWidth / 2;
      const which = t.clientX < half ? 'move' : 'aim';
      const joy = which === 'move' ? joyMove : joyAim;
      if (touchState[which].active) continue;
      // Position joystick where finger landed
      const size = 130;
      const bottom = 30;
      joy.style.left = which === 'move' ? `${t.clientX - size/2}px` : 'auto';
      joy.style.right = which === 'aim' ? `${window.innerWidth - t.clientX - size/2}px` : 'auto';
      joy.style.bottom = `${window.innerHeight - t.clientY - size/2}px`;
      joy.classList.add('active');
      const c = joyCenter(joy);
      touchState[which].active = true;
      touchState[which].id = t.identifier;
      touchState[which].ox = c.x;
      touchState[which].oy = c.y;
      touchState[which].dx = 0;
      touchState[which].dy = 0;
      touchState[which].mag = 0;
    }
    e.preventDefault();
  }
  function handleTouchMove(e) {
    for (const t of e.changedTouches) {
      for (const k of ['move','aim']) {
        const s = touchState[k];
        if (s.active && s.id === t.identifier) {
          s.dx = t.clientX - s.ox;
          s.dy = t.clientY - s.oy;
          s.mag = Math.hypot(s.dx, s.dy);
          setStick(k === 'move' ? joyMove : joyAim, s.dx, s.dy);
        }
      }
    }
    e.preventDefault();
  }
  function handleTouchEnd(e) {
    for (const t of e.changedTouches) {
      for (const k of ['move','aim']) {
        const s = touchState[k];
        if (s.active && s.id === t.identifier) {
          s.active = false;
          s.id = null;
          s.dx = 0; s.dy = 0; s.mag = 0;
          const joy = k === 'move' ? joyMove : joyAim;
          resetStick(joy);
          joy.classList.remove('active');
        }
      }
    }
    e.preventDefault();
  }

  if (isTouch) {
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  }

  // ---------- Game logic ----------
  function nearestEnemy() {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      const d = dist2(player, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function castSpell(angle) {
    const n = player.projectiles;
    for (let i = 0; i < n; i++) {
      const a = angle + (i - (n - 1) / 2) * player.spread;
      projectiles.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(a) * player.projectileSpeed,
        vy: Math.sin(a) * player.projectileSpeed,
        life: player.projectileLife,
        damage: player.damage,
        pierce: player.pierce,
        friendly: true,
        r: 8,
        element: player.element,
      });
    }
    spawnParticles(player.x, player.y, 4, '#c084fc', 80, 0.25);
  }

  function spawnEnemyProjectile(e, target) {
    const dx = target.x - e.x, dy = target.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 280;
    projectiles.push({
      x: e.x, y: e.y,
      vx: (dx/len) * speed,
      vy: (dy/len) * speed,
      life: 2.2,
      damage: e.dmg,
      pierce: 0,
      friendly: false,
      r: 7,
      element: 'curse',
    });
  }

  function spawnParticles(x, y, n, color, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(speed*0.4, speed);
      particles.push({
        x, y,
        vx: Math.cos(a)*s,
        vy: Math.sin(a)*s,
        life: rand(life*0.5, life),
        maxLife: life,
        color,
        r: rand(2, 4),
      });
    }
  }

  function updatePlayer(dt) {
    // ---- Movement ----
    let mx = 0, my = 0;
    if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) my += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    if (touchState.move.active && touchState.move.mag > 8) {
      const mag = touchState.move.mag;
      mx += touchState.move.dx / Math.max(mag, 40);
      my += touchState.move.dy / Math.max(mag, 40);
    }
    const mLen = Math.hypot(mx, my);
    if (mLen > 0) {
      mx /= mLen; my /= mLen;
      player.x += mx * player.speed * dt;
      player.y += my * player.speed * dt;
    }
    player.x = clamp(player.x, player.r, WORLD.w - player.r);
    player.y = clamp(player.y, player.r, WORLD.h - player.r);

    // ---- Aim & cast ----
    let aimAngle = null;
    if (touchState.aim.active && touchState.aim.mag > 14) {
      aimAngle = Math.atan2(touchState.aim.dy, touchState.aim.dx);
    } else if (!isTouch && mouse.used) {
      // mouse: aim relative to screen center (player is centered)
      const dx = mouse.x - window.innerWidth/2;
      const dy = mouse.y - window.innerHeight/2;
      if (Math.hypot(dx, dy) > 12) aimAngle = Math.atan2(dy, dx);
    }
    if (aimAngle === null) {
      // auto: nearest enemy
      const e = nearestEnemy();
      if (e) aimAngle = Math.atan2(e.y - player.y, e.x - player.x);
    }
    if (aimAngle !== null) player.facing = aimAngle;

    player.fireCd -= dt;
    if (player.fireCd <= 0 && aimAngle !== null) {
      castSpell(aimAngle);
      player.fireCd = 1 / player.fireRate;
    }

    // ---- Regen / iframes ----
    if (player.regen > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    }
    player.iframes = Math.max(0, player.iframes - dt);
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      if (e.shoots && d < 500) {
        // keep at range
        const desired = 320;
        const sign = d > desired ? 1 : -0.6;
        e.x += (dx / d) * e.speed * sign * dt;
        e.y += (dy / d) * e.speed * sign * dt;
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          spawnEnemyProjectile(e, player);
          e.fireCd = rand(1.6, 2.4);
        }
      } else {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
      }
      e.x = clamp(e.x, e.r, WORLD.w - e.r);
      e.y = clamp(e.y, e.r, WORLD.h - e.r);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
    }
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > WORLD.w || p.y > WORLD.h) {
        projectiles.splice(i, 1);
        continue;
      }

      if (p.friendly) {
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          const dx = e.x - p.x, dy = e.y - p.y;
          if (dx*dx + dy*dy < (e.r + p.r) * (e.r + p.r)) {
            e.hp -= p.damage;
            e.hitFlash = 0.08;
            spawnParticles(p.x, p.y, 5, e.color, 120, 0.35);
            if (e.hp <= 0) killEnemy(j);
            if (p.pierce > 0) {
              p.pierce--;
            } else {
              projectiles.splice(i, 1);
              break;
            }
          }
        }
      } else {
        const dx = player.x - p.x, dy = player.y - p.y;
        if (dx*dx + dy*dy < (player.r + p.r) * (player.r + p.r) && player.iframes <= 0) {
          player.hp -= p.damage;
          player.iframes = 0.25;
          spawnParticles(p.x, p.y, 8, '#f87171', 140, 0.4);
          projectiles.splice(i, 1);
          if (player.hp <= 0) { gameOver(); return; }
        }
      }
    }
  }

  function handleEnemyMelee() {
    for (const e of enemies) {
      const d2 = dist2(player, e);
      const rr = (e.r + player.r) * (e.r + player.r);
      if (d2 < rr && player.iframes <= 0) {
        player.hp -= e.dmg;
        player.iframes = 0.45;
        // pushback
        const dx = player.x - e.x, dy = player.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        player.x += (dx/len) * 18;
        player.y += (dy/len) * 18;
        spawnParticles(player.x, player.y, 10, '#f87171', 160, 0.45);
        if (player.hp <= 0) { gameOver(); return; }
      }
    }
  }

  function killEnemy(idx) {
    const e = enemies[idx];
    spawnParticles(e.x, e.y, 18, e.color, 200, 0.55);
    kills++;
    gainXp(e.xp);
    enemies.splice(idx, 1);
  }

  function gainXp(amount) {
    player.xp += amount;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level++;
      player.xpToNext = Math.floor(player.xpToNext * 1.45 + 2);
      offerUpgrades();
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
  }

  function spawnWave(dt) {
    spawnTimer -= dt;
    const target = Math.min(8 + player.level * 3, 60);
    if (enemies.length < target && spawnTimer <= 0) {
      enemies.push(newEnemy(player.level));
      spawnTimer = clamp(1.4 - player.level * 0.06, 0.25, 1.4);
    }
  }

  // ---------- Upgrades ----------
  const UPGRADES = [
    { id: 'dmg',   icon: '💥', name: 'Hexed Edge',     desc: '+25% spell damage',
      apply: p => p.damage = Math.ceil(p.damage * 1.25) },
    { id: 'rate',  icon: '⚡', name: 'Quickened Tongue', desc: '+22% cast rate',
      apply: p => p.fireRate *= 1.22 },
    { id: 'multi', icon: '🔱', name: 'Forked Spell',    desc: '+1 projectile per cast',
      apply: p => p.projectiles += 1 },
    { id: 'speed', icon: '🌀', name: 'Spectral Step',   desc: '+15% move speed',
      apply: p => p.speed *= 1.15 },
    { id: 'pspeed',icon: '🏹', name: 'Swift Bolt',      desc: '+25% projectile speed & range',
      apply: p => { p.projectileSpeed *= 1.25; p.projectileLife *= 1.15; } },
    { id: 'pierce',icon: '💀', name: 'Soul Pierce',     desc: '+1 pierce',
      apply: p => p.pierce += 1 },
    { id: 'hp',    icon: '❤️', name: 'Witchy Vigor',    desc: '+25 max HP & full heal',
      apply: p => { p.maxHp += 25; p.hp = p.maxHp; } },
    { id: 'regen', icon: '🌿', name: 'Mossblood',       desc: '+1 HP / sec regen',
      apply: p => p.regen += 1 },
    { id: 'spread',icon: '🌟', name: 'Tighter Weave',   desc: 'Tighter multishot spread',
      apply: p => p.spread = Math.max(0.05, p.spread * 0.7) },
  ];

  function offerUpgrades() {
    paused = true;
    const pool = [...UPGRADES];
    const picks = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    upgradeChoicesEl.innerHTML = '';
    for (const u of picks) {
      const btn = document.createElement('button');
      btn.className = 'upgrade-card';
      btn.innerHTML = `
        <div class="upgrade-icon">${u.icon}</div>
        <div class="upgrade-text">
          <div class="upgrade-name">${u.name}</div>
          <div class="upgrade-desc">${u.desc}</div>
        </div>`;
      btn.addEventListener('click', () => {
        u.apply(player);
        levelupEl.classList.add('hidden');
        paused = false;
      });
      upgradeChoicesEl.appendChild(btn);
    }
    levelupEl.classList.remove('hidden');
  }

  // ---------- HUD ----------
  function updateHud() {
    levelEl.textContent = player.level;
    killsEl.textContent = kills;
    const hpPct = clamp(player.hp / player.maxHp, 0, 1) * 100;
    hpFill.style.width = hpPct + '%';
    hpText.textContent = `${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`;
    xpFill.style.width = (player.xp / player.xpToNext * 100) + '%';
  }

  // ---------- Render ----------
  function draw() {
    const vw = window.innerWidth, vh = window.innerHeight;
    camera.x = player.x - vw / 2;
    camera.y = player.y - vh / 2;

    // background
    ctx.fillStyle = cssVar('--bg');
    ctx.fillRect(0, 0, vw, vh);

    // vignette / fog (dark only)
    if (document.body.dataset.theme === 'dark') {
      const g = ctx.createRadialGradient(vw/2, vh/2, 80, vw/2, vh/2, Math.max(vw, vh)*0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }

    // grid (subtle)
    ctx.strokeStyle = cssVar('--grid');
    ctx.lineWidth = 1;
    const step = 64;
    const sx = -((camera.x) % step);
    const sy = -((camera.y) % step);
    ctx.beginPath();
    for (let x = sx; x < vw; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, vh); }
    for (let y = sy; y < vh; y += step) { ctx.moveTo(0, y); ctx.lineTo(vw, y); }
    ctx.stroke();

    // world border
    ctx.strokeStyle = cssVar('--accent');
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.strokeRect(-camera.x, -camera.y, WORLD.w, WORLD.h);
    ctx.globalAlpha = 1;

    // decor
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of decor) {
      const px = d.x - camera.x, py = d.y - camera.y;
      if (px < -40 || px > vw+40 || py < -40 || py > vh+40) continue;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.rot);
      ctx.globalAlpha = 0.55;
      ctx.font = `${d.size}px serif`;
      ctx.fillText(d.emoji, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // particles (under)
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camera.x, p.y - camera.y, p.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // enemies
    for (const e of enemies) {
      const px = e.x - camera.x, py = e.y - camera.y;
      if (px < -60 || px > vw+60 || py < -60 || py > vh+60) continue;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(px, py + e.r*0.7, e.r*0.8, e.r*0.3, 0, 0, Math.PI*2);
      ctx.fill();

      // body glow
      ctx.fillStyle = e.color;
      ctx.globalAlpha = e.hitFlash > 0 ? 1 : 0.25;
      ctx.beginPath();
      ctx.arc(px, py, e.r + 4, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // emoji body
      ctx.font = `${e.r * 1.8}px serif`;
      ctx.fillText(e.emoji, px, py);

      // hp bar
      if (e.hp < e.maxHp) {
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - w/2, py - e.r - 12, w, 4);
        ctx.fillStyle = e.color;
        ctx.fillRect(px - w/2, py - e.r - 12, w * (e.hp / e.maxHp), 4);
      }
    }

    // projectiles
    for (const p of projectiles) {
      const px = p.x - camera.x, py = p.y - camera.y;
      ctx.fillStyle = p.friendly ? '#c084fc' : '#f87171';
      ctx.shadowColor = p.friendly ? '#c084fc' : '#f87171';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // inner core
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, py, p.r * 0.4, 0, Math.PI*2);
      ctx.fill();
    }

    // player
    {
      const px = player.x - camera.x, py = player.y - camera.y;

      // aura
      ctx.fillStyle = cssVar('--accent');
      ctx.globalAlpha = 0.20 + 0.10 * Math.sin(now() / 220);
      ctx.beginPath();
      ctx.arc(px, py, player.r + 10, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(px, py + player.r*0.7, player.r*0.8, player.r*0.3, 0, 0, Math.PI*2);
      ctx.fill();

      // iframe flicker
      ctx.globalAlpha = player.iframes > 0 ? (0.5 + 0.5*Math.sin(now()/40)) : 1;
      ctx.font = `${player.r * 1.9}px serif`;
      ctx.fillText(player.emoji, px, py);

      // tiny aim indicator
      const ax = px + Math.cos(player.facing) * (player.r + 12);
      const ay = py + Math.sin(player.facing) * (player.r + 12);
      ctx.fillStyle = cssVar('--accent');
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // minimap (corner)
    const mmS = 110;
    const mmX = vw - mmS - 14;
    const mmY = vh - mmS - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(mmX, mmY, mmS, mmS);
    ctx.strokeStyle = cssVar('--panel-border');
    ctx.strokeRect(mmX, mmY, mmS, mmS);
    for (const e of enemies) {
      ctx.fillStyle = e.color;
      ctx.fillRect(mmX + (e.x / WORLD.w) * mmS - 1, mmY + (e.y / WORLD.h) * mmS - 1, 2, 2);
    }
    ctx.fillStyle = cssVar('--accent');
    ctx.fillRect(mmX + (player.x / WORLD.w) * mmS - 3, mmY + (player.y / WORLD.h) * mmS - 3, 5, 5);
  }

  // ---------- Loop ----------
  let last = now();
  function frame() {
    const t = now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    if (running && !paused) {
      updatePlayer(dt);
      updateEnemies(dt);
      updateProjectiles(dt);
      handleEnemyMelee();
      updateParticles(dt);
      spawnWave(dt);
      updateHud();
    }
    if (player) draw();
    requestAnimationFrame(frame);
  }

  // ---------- Buttons ----------
  startBtn.addEventListener('click', init);
  restartBtn.addEventListener('click', init);

  // demo state before start
  player = newPlayer();
  enemies = [];
  projectiles = [];
  particles = [];
  decor = [];
  for (let i = 0; i < 60; i++) {
    decor.push({
      x: rand(0, WORLD.w),
      y: rand(0, WORLD.h),
      emoji: pick(DECOR_EMOJI),
      size: rand(18, 36),
      rot: rand(-0.2, 0.2),
    });
  }
  for (let i = 0; i < 4; i++) enemies.push(newEnemy(1));

  requestAnimationFrame(frame);
})();
