// Real-browser joystick test using Playwright + Chromium with touch emulation.
// Drives both joysticks simultaneously and inspects the game's internal state.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ---------- Tiny static server ----------
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const buf = fs.readFileSync(path.join(root, p));
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'text/plain' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;

// ---------- Helpers ----------
const failures = [];
function ok(msg)   { console.log('✓', msg); }
function fail(msg) { console.error('✗', msg); failures.push(msg); }
function near(a, b, eps = 1) { return Math.abs(a - b) <= eps; }

// ---------- Launch ----------
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 800, height: 480 }, // landscape mobile-ish
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.goto(base);
await page.waitForSelector('#start-btn');

// Instrument: capture touch events on canvas
await page.evaluate(() => {
  window.__touchLog = [];
  const c = document.getElementById('game');
  for (const ev of ['touchstart','touchmove','touchend']) {
    c.addEventListener(ev, (e) => {
      window.__touchLog.push({
        ev, n: e.changedTouches.length,
        cx: e.changedTouches[0]?.clientX,
        cy: e.changedTouches[0]?.clientY,
        target: e.target.id || e.target.tagName,
      });
    }, { capture: true });
  }
  window.__isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
});

await page.tap('#start-btn');
await page.waitForFunction(() => document.getElementById('overlay').classList.contains('hidden'));
const isT = await page.evaluate(() => window.__isTouch);
console.log('  (debug) isTouch in page =', isT);
ok('start overlay hidden after tap');

// Test 1: single touch on the LEFT half should activate move joystick + start moving
// Track all active touches and dispatch native TouchEvents to the canvas.
// CDP touch dispatch was unreliable here; native events from page.evaluate work.
const liveTouches = new Map(); // id -> {x,y}

async function touch(type, changes) {
  // `type`: 'touchStart' | 'touchMove' | 'touchEnd'
  // `changes`: [{x, y, id}, ...] — points that *changed* this event
  for (const c of changes) {
    if (type === 'touchEnd') liveTouches.delete(c.id);
    else liveTouches.set(c.id, { x: c.x, y: c.y });
  }
  const all = [...liveTouches.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
  const changed = changes.map(c => ({ id: c.id, x: c.x, y: c.y }));
  await page.evaluate(
    ({ type, all, changed }) => {
      const target = document.getElementById('game');
      const rect = target.getBoundingClientRect();
      const mk = (t) => new Touch({
        identifier: t.id,
        target,
        clientX: t.x,
        clientY: t.y,
        pageX: t.x,
        pageY: t.y,
        screenX: t.x,
        screenY: t.y,
        radiusX: 4, radiusY: 4, force: 1,
      });
      const touches = (type === 'touchEnd' ? all : all).map(mk);
      const changedTouches = changed.map(mk);
      const eventType = { touchStart: 'touchstart', touchMove: 'touchmove', touchEnd: 'touchend' }[type];
      const evt = new TouchEvent(eventType, {
        cancelable: true, bubbles: true,
        touches, targetTouches: touches, changedTouches,
      });
      target.dispatchEvent(evt);
    },
    { type, all, changed }
  );
}

async function readState() {
  return await page.evaluate(() => {
    // Expose minimum diagnostics
    const joyM = document.getElementById('joystick-move');
    const joyA = document.getElementById('joystick-aim');
    return {
      moveActive: joyM.classList.contains('active'),
      aimActive: joyA.classList.contains('active'),
      moveRect: joyM.classList.contains('active') ? joyM.getBoundingClientRect().toJSON() : null,
      aimRect:  joyA.classList.contains('active') ? joyA.getBoundingClientRect().toJSON() : null,
      moveStickTransform: joyM.querySelector('.joystick-stick').style.transform,
      aimStickTransform:  joyA.querySelector('.joystick-stick').style.transform,
    };
  });
}

// === Test A: left-half touch activates move joystick ===
const leftStart = { x: 120, y: 380 };
await touch('touchStart', [{ x: leftStart.x, y: leftStart.y, id: 1 }]);
await page.waitForTimeout(80);
const log1 = await page.evaluate(() => window.__touchLog.slice());
console.log('  (debug) touch log after left touchStart:', JSON.stringify(log1));
let s = await readState();
if (s.moveActive) ok('move joystick activates on left-half touch'); else fail('move joystick did NOT activate');
if (!s.aimActive) ok('aim joystick stays inactive while only move is down'); else fail('aim joystick activated unexpectedly');

// Move the touch — expect player position to change
const pPosBefore = await page.evaluate(() => window.__pp = { x: 0, y: 0 });
await page.evaluate(() => {
  // Try to read player position via a debug hook we add to window
});

// Drive a drag northeast for ~30 frames
const startX = leftStart.x, startY = leftStart.y;
const samples = [];
for (let i = 1; i <= 30; i++) {
  await touch('touchMove', [{ x: startX + i * 2, y: startY - i * 2, id: 1 }]);
  if (i % 6 === 0) {
    samples.push(await page.evaluate(() => {
      const t = document.querySelector('#joystick-move .joystick-stick').style.transform;
      return t;
    }));
  }
  await page.waitForTimeout(16);
}
const lastTransform = samples[samples.length - 1] || '';
if (lastTransform && lastTransform.includes('translate')) ok(`move stick visual updated: ${lastTransform}`);
else fail(`move stick visual NOT updated: ${lastTransform}`);

// === Test B: while move is down, add a SECOND touch on right half (aim) ===
const rightStart = { x: 680, y: 380 };
await touch('touchStart', [{ x: rightStart.x, y: rightStart.y, id: 2 }]);
await page.waitForTimeout(80);
s = await readState();
if (s.moveActive) ok('move joystick still active when aim is added');
else fail('move joystick deactivated when adding aim (BUG: second touch likely lost)');
if (s.aimActive) ok('aim joystick activated on second simultaneous touch');
else fail('aim joystick did NOT activate (BUG: this is the dual-joystick failure)');

// Drag aim southwest
for (let i = 1; i <= 20; i++) {
  await touch('touchMove', [{ x: rightStart.x - i * 2, y: rightStart.y + i * 2, id: 2 }]);
  await page.waitForTimeout(16);
}
s = await readState();
if (s.aimStickTransform && s.aimStickTransform.includes('translate'))
  ok(`aim stick visual updated: ${s.aimStickTransform}`);
else fail(`aim stick visual NOT updated: ${s.aimStickTransform}`);

// === Test C: release one finger, the other stays ===
await touch('touchEnd', [{ x: rightStart.x - 40, y: rightStart.y + 40, id: 2 }]);
await page.waitForTimeout(60);
s = await readState();
if (s.moveActive && !s.aimActive)
  ok('releasing aim leaves move still active');
else fail(`after releasing aim: moveActive=${s.moveActive} aimActive=${s.aimActive}`);

await touch('touchEnd', [{ x: leftStart.x + 60, y: leftStart.y - 60, id: 1 }]);
await page.waitForTimeout(60);
s = await readState();
if (!s.moveActive && !s.aimActive) ok('both joysticks hidden after all touches released');
else fail('joysticks did not deactivate after release');

// === Test E: regression — joystick elements must NOT swallow touches ===
// Activate move joystick on the left, then dispatch the aim touch targeted at
// whatever the topmost element is at the aim coordinate (would have been the
// move-joystick element if pointer-events:none weren't set).
await touch('touchStart', [{ x: 120, y: 380, id: 10 }]);
await page.waitForTimeout(60);

const aimTopId = await page.evaluate(({x, y}) => {
  const el = document.elementFromPoint(x, y);
  return el ? (el.id || el.tagName) : null;
}, { x: 680, y: 380 });
if (aimTopId === 'game') ok(`right-half top element is canvas (pointer-events:none works): ${aimTopId}`);
else fail(`right-half top element is ${aimTopId} — joystick is still intercepting touches`);

// Realistic dispatch: target whatever elementFromPoint returns.
async function realisticTouch(type, changes) {
  for (const c of changes) {
    if (type === 'touchEnd') liveTouches.delete(c.id);
    else liveTouches.set(c.id, { x: c.x, y: c.y });
  }
  const all = [...liveTouches.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
  const changed = changes.map(c => ({ id: c.id, x: c.x, y: c.y }));
  await page.evaluate(
    ({ type, all, changed, primaryX, primaryY }) => {
      const target = document.elementFromPoint(primaryX, primaryY) || document.body;
      const mk = (t) => new Touch({
        identifier: t.id, target, clientX: t.x, clientY: t.y,
        pageX: t.x, pageY: t.y, screenX: t.x, screenY: t.y,
        radiusX: 4, radiusY: 4, force: 1,
      });
      const touches = all.map(mk);
      const changedTouches = changed.map(mk);
      const eventType = { touchStart: 'touchstart', touchMove: 'touchmove', touchEnd: 'touchend' }[type];
      target.dispatchEvent(new TouchEvent(eventType, {
        cancelable: true, bubbles: true,
        touches, targetTouches: touches, changedTouches,
      }));
    },
    { type, all, changed, primaryX: changed[0].x, primaryY: changed[0].y }
  );
}

await realisticTouch('touchStart', [{ x: 680, y: 380, id: 11 }]);
await page.waitForTimeout(80);
s = await readState();
if (s.aimActive) ok('realistic dispatch: aim activates (touches reach canvas)');
else fail('realistic dispatch: aim did NOT activate (touches still intercepted)');

await touch('touchEnd', [{ x: 680, y: 380, id: 11 }]);
await touch('touchEnd', [{ x: 120, y: 380, id: 10 }]);
await page.waitForTimeout(50);

// === Test F: player actually moves in the direction of the joystick ===
// Expose player position via a debug hook (small patch that's harmless to ship).
const hasDebug = await page.evaluate(() => typeof window.__witchio !== 'undefined');
if (!hasDebug) {
  // Inject a tiny shim using the prior approach won't work since IIFE is closed.
  // Instead, infer movement by sampling DOM-visible state: kills/level (player moves into enemies).
  // Simpler: sample the canvas's rendering by tracking how far the camera-relative
  // player drawing offset changes — but we don't expose that. So we use a heuristic:
  // hold the move joystick for ~1s and check that *something* in the game state
  // changed (HP can decrease from contact, kills can go up).
  const before = await page.evaluate(() => ({
    kills: parseInt(document.getElementById('kills').textContent, 10),
    hp: document.getElementById('hp-text').textContent,
  }));
  await touch('touchStart', [{ x: 120, y: 380, id: 20 }]);
  // Drag northeast for 1s — should move player & eventually score kills (auto-fire)
  for (let i = 0; i < 60; i++) {
    await touch('touchMove', [{ x: 120 + i, y: 380 - i, id: 20 }]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', [{ x: 120 + 60, y: 380 - 60, id: 20 }]);
  const after = await page.evaluate(() => ({
    kills: parseInt(document.getElementById('kills').textContent, 10),
    hp: document.getElementById('hp-text').textContent,
  }));
  if (after.kills > before.kills || after.hp !== before.hp)
    ok(`game state advanced under sustained input: kills ${before.kills}→${after.kills}, hp ${before.hp}→${after.hp}`);
  else
    fail(`game state did NOT change under 1s of move input — player likely not moving / not firing`);
}

// === Test D: page-level errors ===
if (pageErrors.length === 0) ok('no console errors during interaction');
else { fail(`page errors: ${pageErrors.length}`); pageErrors.forEach(e => console.error('  ' + e)); }

await browser.close();
server.close();

console.log(failures.length ? `\nFAILED (${failures.length})` : '\nAll joystick checks passed.');
process.exit(failures.length ? 1 : 0);
