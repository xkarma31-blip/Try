// Smoke test: load the game in JSDOM, polyfill canvas, run ~120 frames,
// drive some input, level-up, and assert no exceptions and basic invariants.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gameSrc = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

// Strip external script + link tags so JSDOM doesn't try to fetch them,
// then inject game.js inline so it runs synchronously under runScripts: 'dangerously'.
const stripped = html
  .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
  .replace(/<script[^>]*src=["'][^"']*game\.js["'][^>]*><\/script>/gi, '')
  + `\n<script>${gameSrc}</script>`;

const errors = [];
let rafCb = null;

const dom = new JSDOM(stripped, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(window) {
    // Canvas 2D context stub — pretend rendering succeeds, ignore output
    const ctxStub = new Proxy({}, {
      get(_t, k) {
        if (k === 'canvas') return null;
        if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
        if (k === 'measureText') return () => ({ width: 10 });
        return typeof k === 'string' ? () => {} : undefined;
      },
      set() { return true; },
    });
    window.HTMLCanvasElement.prototype.getContext = function () { return ctxStub; };
    window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
    };

    // Non-touch path
    Object.defineProperty(window, 'ontouchstart', { value: undefined, configurable: true });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });

    // Manual rAF
    window.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
    window.cancelAnimationFrame = () => {};
  },
});
const { window } = dom;

window.addEventListener('error', (e) => errors.push(`window.error: ${e.message}`));
dom.virtualConsole.on('jsdomError', (e) => errors.push(`jsdomError: ${e.message}`));

function tick(ms = 16) {
  const cb = rafCb;
  rafCb = null;
  if (cb) cb(window.performance.now());
}

function fail(msg) { console.error('✗', msg); process.exitCode = 1; }
function ok(msg)   { console.log('✓', msg); }

// 1) Initial paused state — overlay visible
const overlay = window.document.getElementById('overlay');
if (!overlay || overlay.classList.contains('hidden')) fail('start overlay should be visible initially');
else ok('start overlay visible');

// 2) Click Start
window.document.getElementById('start-btn').click();
if (overlay.classList.contains('hidden')) ok('start overlay hidden after Start clicked');
else fail('start overlay still visible after Start');

// 3) Run ~120 frames simulating WASD movement
window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyW' }));
window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyD' }));
for (let i = 0; i < 120; i++) tick(16);
window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyW' }));
window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyD' }));

// 4) Theme toggle should switch values
const before = window.document.body.dataset.theme;
window.document.getElementById('theme-toggle').click();
const after = window.document.body.dataset.theme;
if (before !== after) ok(`theme toggle: ${before} → ${after}`);
else fail('theme did not toggle');

// 5) HUD updated
const lvl = window.document.getElementById('level').textContent;
const kills = window.document.getElementById('kills').textContent;
const hpText = window.document.getElementById('hp-text').textContent;
if (lvl && kills && hpText) ok(`HUD populated: lvl=${lvl} kills=${kills} hp=${hpText}`);
else fail('HUD missing values');

// 6) No exceptions surfaced
if (errors.length === 0) ok('no runtime errors during 120 frames');
else { fail(`captured ${errors.length} error(s):`); errors.forEach(e => console.error('  ' + e)); }

// 7) Fullscreen button exists (validates new UI was added)
const fsBtn = window.document.getElementById('fullscreen-btn');
if (fsBtn) ok('fullscreen button present');
else fail('fullscreen button missing from index.html');

console.log(process.exitCode ? '\nFAILED' : '\nSmoke test passed.');
