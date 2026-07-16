// games/color-match-feeder/game.js — Canvas engine for Color-Match Feeder.
// A static monster sits in the center. Food drifts in from a random edge,
// each carrying a positional face-button prompt rendered via createFaceGlyph.
// Press the matching face button when the food is near the monster to eat it.
// Wrong button or out-of-zone press = no-op (no penalty). Food that drifts
// past is silently recycled.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { playBlip } from '../../shared/utils.js';
import {
  FACE_BOTTOM,
  FACE_RIGHT,
  FACE_LEFT,
  FACE_TOP,
  LAYOUT_CHANGE,
  AVAILABILITY,
} from '../../shared/button-mapping.js';
import {
  createFood,
  isInEatZone,
  positionMatchesPrompt,
  updateFood,
} from './feeder-logic.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Eat zone: how close (CSS px) food must be to the monster to be eatable.
const EAT_RADIUS = 90;
// Monster + food visual radii (CSS px).
const MONSTER_RADIUS = 46;
const FOOD_RADIUS = 26;

// Spawn cadence: a new food appears every ~1.6s, jittered (forgiving pace).
const SPAWN_INTERVAL_MS = 1600;
const SPAWN_JITTER_MS = 500;
// Despawn margin: food that travels this far past the monster (and isn't
// eaten) is recycled so the canvas never fills up.
const DESPAWN_PAST_MONSTER = 140;
// Cap on simultaneously in-flight food (safety; never a penalty).
const MAX_FOOD = 12;

// Munch burst lifetime (ms) for the eat animation.
const MUNCH_MS = 360;

// Friendly "Yum!" count is the only feedback — no score pressure.
// (Kept in DOM text, not the canvas.)

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');
const yumEl = document.getElementById('yum-count');

// ---------------------------------------------------------------------------
// Canvas sizing — CSS size drives layout; backing store accounts for DPR.
// ---------------------------------------------------------------------------

let cssWidth = 0;
let cssHeight = 0;

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cssWidth = Math.max(1, Math.floor(rect.width));
  cssHeight = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  // Reset transform then scale so drawing code uses CSS pixels.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------------------
// State (separate from drawing)
// ---------------------------------------------------------------------------

const monster = { x: 0, y: 0 };

/** @type {{position:string,x:number,y:number,speed:number,eaten:boolean,spawnEdge:string,eatenAt:number}[]} */
let foods = [];
let munchPulses = []; // { x, y, startedAt }
let yumCount = 0;

let rafId = null;
let lastTimestamp = 0;
let nextSpawnAt = 0;
let running = false;

// ---------------------------------------------------------------------------
// Layout management
// ---------------------------------------------------------------------------

let currentLayout = gamepadManager.getLayout();

function layoutKey() {
  return gamepadManager.getLayout() || 'xbox';
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function scheduleNextSpawn(now) {
  nextSpawnAt = now + SPAWN_INTERVAL_MS + (Math.random() * SPAWN_JITTER_MS);
}

// Detect which canvas edge a freshly-spawned food entered from, based on its
// initial off-canvas position (feeder-logic.js places the origin ~EDGE_MARGIN
// past one of the four edges). Used by the despawn check so food is only
// recycled after it has crossed PAST the monster to the opposite edge.
function detectSpawnEdge(food) {
  if (food.y < 0) return 'top';
  if (food.y > cssHeight) return 'bottom';
  if (food.x < 0) return 'left';
  return 'right';
}

function spawnFood(now) {
  if (!cssWidth || !cssHeight) return;
  if (foods.length >= MAX_FOOD) {
    scheduleNextSpawn(now);
    return;
  }
  const base = createFood({ width: cssWidth, height: cssHeight });
  foods.push({
    ...base,
    spawnEdge: detectSpawnEdge(base),
    eatenAt: 0,
  });
  scheduleNextSpawn(now);
}

// ---------------------------------------------------------------------------
// Eating
// ---------------------------------------------------------------------------

function tryEat(position) {
  if (!running) return;
  // Among matching foods currently in the eat zone, eat the nearest to the
  // monster (spec: two same-position foods in the zone → eat the nearest).
  let bestIndex = -1;
  let bestDist = Infinity;
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    if (f.eaten) continue;
    if (!positionMatchesPrompt(f.position, position)) continue;
    if (!isInEatZone(f, monster, EAT_RADIUS)) continue;
    const d = Math.hypot(f.x - monster.x, f.y - monster.y);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return; // wrong button or out of zone → no-op

  const f = foods[bestIndex];
  f.eaten = true;
  f.eatenAt = performance.now();
  munchPulses.push({ x: f.x, y: f.y, startedAt: f.eatenAt });
  yumCount += 1;
  if (yumEl) yumEl.textContent = String(yumCount);
  playBlip();
}

// ---------------------------------------------------------------------------
// Update (pure-ish state mutation; no drawing)
// ---------------------------------------------------------------------------

function update(dt, now) {
  // Center the monster whenever the canvas has a real size.
  monster.x = cssWidth / 2;
  monster.y = cssHeight / 2;

  if (now >= nextSpawnAt) {
    spawnFood(now);
  }

  const keep = [];
  for (const f of foods) {
    if (f.eaten) {
      // Eaten foods linger briefly for the munch animation, then are removed.
      if (now - f.eatenAt < MUNCH_MS) keep.push(f);
      continue;
    }

    const next = updateFood(f, monster, dt);
    f.x = next.x;
    f.y = next.y;

    // Recycle food that has crossed PAST the monster to the opposite edge.
    // Side-aware: only cull when the food is off-canvas on the edge OPPOSITE
    // its spawnEdge — i.e. it actually traveled across the play field. This
    // avoids the prior bug where every food was culled on the spawn frame
    // because its distance to the centered monster already exceeded the
    // despawn threshold while it sat just off its entry edge.
    const overshoot = Math.hypot(f.x - monster.x, f.y - monster.y);
    const offOpposite =
      (f.spawnEdge === 'top' && f.y > cssHeight + FOOD_RADIUS) ||
      (f.spawnEdge === 'bottom' && f.y < -FOOD_RADIUS) ||
      (f.spawnEdge === 'left' && f.x > cssWidth + FOOD_RADIUS) ||
      (f.spawnEdge === 'right' && f.x < -FOOD_RADIUS);
    if (offOpposite && overshoot > EAT_RADIUS + DESPAWN_PAST_MONSTER) {
      continue; // drop it — crossed past the monster to the far side
    }
    keep.push(f);
  }
  foods = keep;

  // Cull expired munch pulses.
  munchPulses = munchPulses.filter((p) => now - p.startedAt < MUNCH_MS);
}

// ---------------------------------------------------------------------------
// Drawing (never mutates state)
// ---------------------------------------------------------------------------

function drawBackground() {
  if (!cssWidth || !cssHeight) return;
  // Soft radial gradient backdrop (deep, calming).
  const g = ctx.createRadialGradient(
    monster.x, monster.y, 10,
    monster.x, monster.y, Math.max(cssWidth, cssHeight) * 0.75,
  );
  g.addColorStop(0, '#2a3457');
  g.addColorStop(1, '#0f1424');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // Eat zone ring (subtle, inviting).
  ctx.beginPath();
  ctx.arc(monster.x, monster.y, EAT_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(78, 205, 196, 0.35)';
  ctx.setLineDash([8, 10]);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMonster(now) {
  const idle = Math.sin(now / 380) * 3; // gentle bob
  const cy = monster.y + idle;

  // Body.
  ctx.beginPath();
  ctx.arc(monster.x, cy, MONSTER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1a1200';
  ctx.stroke();

  // Eyes.
  const eyeDx = 14;
  const eyeDy = -8;
  ctx.fillStyle = '#1a1200';
  ctx.beginPath();
  ctx.arc(monster.x - eyeDx, cy + eyeDy, 6, 0, Math.PI * 2);
  ctx.arc(monster.x + eyeDx, cy + eyeDy, 6, 0, Math.PI * 2);
  ctx.fill();

  // Smile.
  ctx.beginPath();
  ctx.arc(monster.x, cy + 6, 16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1a1200';
  ctx.stroke();
}

function drawFood(f, now) {
  // Eaten foods shrink + fade as the munch plays.
  let scale = 1;
  let alpha = 1;
  if (f.eaten) {
    const t = Math.min(1, (now - f.eatenAt) / MUNCH_MS);
    scale = 1 + t * 0.6;
    alpha = 1 - t;
  }

  // Render the cookie + prompt badge directly to the canvas (no DOM glyph).
  // The layout-correct single-letter label is computed from the current
  // detected layout so it always matches the physical pad.
  const label = positionLetter(f.position);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(f.x, f.y);
  ctx.scale(scale, scale);

  // Cookie body.
  ctx.beginPath();
  ctx.arc(0, 0, FOOD_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#c97b2b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5c3a14';
  ctx.stroke();

  // Chocolate chips.
  ctx.fillStyle = '#3a230c';
  [[-9, -6], [8, -4], [-3, 9], [10, 8]].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Prompt badge: a colored disc with the layout-correct letter.
  ctx.beginPath();
  ctx.arc(0, -FOOD_RADIUS - 12, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#4ecdc4';
  ctx.fill();
  ctx.fillStyle = '#0f1424';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, -FOOD_RADIUS - 12);

  ctx.restore();
}

function drawMunchPulses(now) {
  munchPulses.forEach((p) => {
    const t = (now - p.startedAt) / MUNCH_MS;
    if (t < 0 || t > 1) return;
    const r = 10 + t * 50;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(123, 237, 159, ${1 - t})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  });
}

function draw(now) {
  if (!cssWidth || !cssHeight) return; // zero-size guard
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  drawBackground();
  drawMunchPulses(now);
  foods.forEach((f) => drawFood(f, now));
  drawMonster(now);
}

// Layout-correct single-letter glyph for the on-canvas prompt badge.
// Uses the current detected layout so the letter matches the physical pad.
const LETTERS_BY_LAYOUT = {
  xbox: { bottom: 'A', right: 'B', left: 'X', top: 'Y' },
  playstation: { bottom: '✕', right: '○', left: '□', top: '△' },
  switch: { bottom: 'B', right: 'A', left: 'Y', top: 'X' },
};

function positionLetter(position) {
  const table = LETTERS_BY_LAYOUT[currentLayout] || LETTERS_BY_LAYOUT.xbox;
  return table[position] || position[0].toUpperCase();
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

function loop(timestamp) {
  if (!running) return;
  if (!lastTimestamp) lastTimestamp = timestamp;
  // Clamp dt to avoid huge jumps after a tab is foregrounded.
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  update(dt, timestamp);
  draw(timestamp);

  rafId = requestAnimationFrame(loop);
}

function start() {
  if (running) return;
  running = true;
  lastTimestamp = 0;
  nextSpawnAt = performance.now() + 400; // small grace before first food
  rafId = requestAnimationFrame(loop);
}

function stop() {
  running = false;
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ---------------------------------------------------------------------------
// Banner — non-blocking gamepad connection hint
// ---------------------------------------------------------------------------

function syncBanner() {
  if (!bannerEl || !bannerText) return;
  const connected = gamepadManager.isActive();
  bannerEl.classList.toggle('is-connected', connected);
  bannerText.textContent = connected
    ? `Controller connected — layout: ${gamepadManager.getLayout()}`
    : 'No controller — use the keyboard (WASD = face buttons).';
}

// ---------------------------------------------------------------------------
// Event handlers (bound so they can be removed on unload)
// ---------------------------------------------------------------------------

function onFaceBottom() { tryEat('bottom'); }
function onFaceRight() { tryEat('right'); }
function onFaceLeft() { tryEat('left'); }
function onFaceTop() { tryEat('top'); }

function onLayoutChange() {
  currentLayout = layoutKey();
  syncBanner();
}

function onAvailability() {
  syncBanner();
}

const LISTENERS = [
  [FACE_BOTTOM, onFaceBottom],
  [FACE_RIGHT, onFaceRight],
  [FACE_LEFT, onFaceLeft],
  [FACE_TOP, onFaceTop],
  [LAYOUT_CHANGE, onLayoutChange],
  [AVAILABILITY, onAvailability],
];

LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------

if (typeof ResizeObserver !== 'undefined' && canvas) {
  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(canvas);
} else if (canvas) {
  window.addEventListener('resize', resizeCanvas);
}

// ---------------------------------------------------------------------------
// Teardown — cancel rAF and remove every listener this game added.
// ---------------------------------------------------------------------------

function cleanup() {
  stop();
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (canvas) {
  resizeCanvas();
  currentLayout = layoutKey();
  syncBanner();
  start();
}
