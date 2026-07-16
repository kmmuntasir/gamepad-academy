// games/hot-air-balloon/game.js — Canvas side-scrolling balloon engine.
// The right trigger's analog pressure (0..1) controls the burner: full press
// = max thrust = fast rise; partial = hover/gentle rise; release = gravity =
// slow descent. Stars float by to collect; clouds gently nudge (never stop).
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import {
  TRIGGER_RIGHT,
  LAYOUT_CHANGE,
  AVAILABILITY,
  triggerLabel,
} from '../../shared/button-mapping.js';
import { clamp, lerp, playTone, resumeAudio } from '../../shared/utils.js';
import { verticalVelocity, collectStar, cloudBounce } from './balloon-physics.js';

// ---------------------------------------------------------------------------
// Constants — physics + world tuning (all in screen px / seconds)
// ---------------------------------------------------------------------------

const GRAVITY = 220;          // px/s^2 downward (positive pulls vy positive)
const MAX_THRUST = 520;       // px/s^2 upward at value=1.0 (> gravity → rises)
const MAX_VY = 360;           // terminal vertical speed (px/s) — either sign
const DT_CLAMP = 1 / 30;      // clamp dt to avoid tunneling on lag spikes
const TRIGGER_DEADZONE = 0.04; // below this, treat trigger as released

// Horizontal auto-scroll: world drifts leftward past the balloon.
const SCROLL_SPEED = 90;      // px/s

// Balloon geometry (drawn as an ellipse-ish envelope + basket).
const BALLOON_R = 34;         // collision radius (matches the drawn envelope)
const BALLOON_X_RATIO = 0.28; // balloon sits at 28% of canvas width

// Stars (collectibles).
const STAR_R = 14;
const STAR_COUNT = 6;         // concurrent stars on the conveyor
const STAR_SPAWN_X_RATIO = 1.15; // spawn just off the right edge
const STAR_TONE_FREQ = 880;

// Clouds (gentle nudge obstacles, never a penalty).
const CLOUD_COUNT = 3;
const CLOUD_R = 46;
const CLOUD_SPAWN_X_RATIO = 1.25;

// Flame rendering.
const FLAME_MAX_H = 56;       // flame height at value=1.0 (px)
const FLAME_W = 26;

// Audio.
const STAR_TONE_DURATION = 0.12;
const STAR_TONE_GAIN = 0.22;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');
const triggerLabelEl = document.getElementById('trigger-label');
const scoreEl = document.getElementById('score');

// ---------------------------------------------------------------------------
// Canvas sizing — CSS sets the displayed size; backing store tracks DPR.
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
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------------------------------------------------------------------------
// State — kept separate from drawing.
// ---------------------------------------------------------------------------

const balloon = {
  x: 0,
  y: 0,
  r: BALLOON_R,
  vy: 0,           // px/s; negative = up
};

const stars = [];   // each: { x, y, r, collected }
const clouds = [];  // each: { x, y, r, vyDrift }

let triggerValue = 0;   // 0..1, current right-trigger pressure (burner)
let score = 0;
let lastTimestamp = 0;
let rafId = null;

function balloonTargetX() {
  return cssWidth * BALLOON_X_RATIO;
}

function resetWorld() {
  balloon.x = balloonTargetX();
  balloon.y = cssHeight * 0.5;
  balloon.vy = 0;
  stars.length = 0;
  clouds.length = 0;
  score = 0;
  if (scoreEl) scoreEl.textContent = '0';
  for (let i = 0; i < STAR_COUNT; i += 1) spawnStar(true);
  for (let i = 0; i < CLOUD_COUNT; i += 1) spawnCloud(true);
}

function spawnStar(anywhere) {
  const x = anywhere
    ? Math.random() * cssWidth
    : cssWidth * STAR_SPAWN_X_RATIO;
  // Varied altitudes to encourage modulation (spec).
  const y = STAR_R + Math.random() * (cssHeight - STAR_R * 2);
  stars.push({ x, y, r: STAR_R, collected: false });
}

function spawnCloud(anywhere) {
  const x = anywhere
    ? Math.random() * cssWidth
    : cssWidth * CLOUD_SPAWN_X_RATIO;
  const y = CLOUD_R + Math.random() * (cssHeight - CLOUD_R * 2);
  clouds.push({
    x,
    y,
    r: CLOUD_R,
    vyDrift: lerp(-12, 12, Math.random()), // gentle vertical drift
  });
}

resetWorld();

// ---------------------------------------------------------------------------
// Per-frame update — pure state mutation, no drawing.
// ---------------------------------------------------------------------------

function update(dt) {
  // Burner physics: trigger value → vy via the pure module.
  balloon.vy = verticalVelocity(triggerValue, {
    gravity: GRAVITY,
    maxThrust: MAX_THRUST,
    vy: balloon.vy,
    dt,
  });
  // Terminal velocity clamp.
  balloon.vy = clamp(balloon.vy, -MAX_VY, MAX_VY);

  // Integrate vertical.
  balloon.y += balloon.vy * dt;

  // Clamp altitude to canvas (gentle bump at top/bottom — zero the vy there).
  const minY = balloon.r;
  const maxY = cssHeight - balloon.r;
  if (balloon.y < minY) {
    balloon.y = minY;
    balloon.vy = Math.max(0, balloon.vy);
  } else if (balloon.y > maxY) {
    balloon.y = maxY;
    balloon.vy = Math.min(0, balloon.vy);
  }
  // Keep balloon anchored to its horizontal slot (canvas may have resized).
  balloon.x = balloonTargetX();

  // World scroll: stars + clouds drift leftward; recycle off the left edge.
  const drift = SCROLL_SPEED * dt;

  for (let i = 0; i < stars.length; i += 1) {
    const s = stars[i];
    s.x -= drift;
    if (!s.collected && collectStar(balloon, s)) {
      s.collected = true;
      score += 1;
      if (scoreEl) scoreEl.textContent = String(score);
      playTone({
        freq: STAR_TONE_FREQ,
        duration: STAR_TONE_DURATION,
        type: 'triangle',
        gain: STAR_TONE_GAIN,
      });
    }
  }
  // Recycle collected / off-screen stars.
  for (let i = stars.length - 1; i >= 0; i -= 1) {
    const s = stars[i];
    if (s.collected || s.x < -s.r) {
      stars.splice(i, 1);
      spawnStar(false);
    }
  }

  for (let i = 0; i < clouds.length; i += 1) {
    const c = clouds[i];
    c.x -= drift;
    c.y += c.vyDrift * dt;
    // Keep clouds within vertical bounds; reverse drift softly at edges.
    if (c.y < c.r) {
      c.y = c.r;
      c.vyDrift = Math.abs(c.vyDrift);
    } else if (c.y > cssHeight - c.r) {
      c.y = cssHeight - c.r;
      c.vyDrift = -Math.abs(c.vyDrift);
    }

    // Gentle cloud bounce — apply nudge, never stop the balloon.
    if (collectStar(balloon, c)) {
      const nudge = cloudBounce(balloon, c);
      balloon.x += nudge.x;
      balloon.y += nudge.y;
      balloon.vy += nudge.vy;
    }
  }
  // Recycle off-screen clouds.
  for (let i = clouds.length - 1; i >= 0; i -= 1) {
    if (clouds[i].x < -clouds[i].r) {
      clouds.splice(i, 1);
      spawnCloud(false);
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing — never mutates state.
// ---------------------------------------------------------------------------

function drawSky() {
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, cssHeight);
  g.addColorStop(0, '#1b2a4a');
  g.addColorStop(0.55, '#3a6ea5');
  g.addColorStop(1, '#9ec6e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
}

function drawCloud(c) {
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  // Cluster of circles to read as a fluffy cloud.
  const puffs = [
    [-CLOUD_R * 0.5, 0, CLOUD_R * 0.6],
    [0, -CLOUD_R * 0.3, CLOUD_R * 0.7],
    [CLOUD_R * 0.5, 0, CLOUD_R * 0.6],
    [0, CLOUD_R * 0.2, CLOUD_R * 0.65],
  ];
  for (const [dx, dy, rr] of puffs) {
    ctx.beginPath();
    ctx.arc(c.x + dx, c.y + dy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStar(s) {
  if (!ctx || s.collected) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#fff7c2';
  ctx.lineWidth = 2;
  // Simple 5-point star path.
  const spikes = 5;
  const outer = s.r;
  const inner = s.r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFlame(value, x, topY) {
  if (!ctx || value <= 0.01) return;
  // Flame height + width scale with trigger pressure.
  const h = FLAME_MAX_H * value;
  const w = FLAME_W * (0.5 + 0.5 * value);
  ctx.save();
  // Outer orange flame.
  ctx.fillStyle = `rgba(255, 150, 40, ${0.5 + 0.4 * value})`;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, topY);
  ctx.quadraticCurveTo(x - w / 2, topY + h * 0.6, x, topY + h);
  ctx.quadraticCurveTo(x + w / 2, topY + h * 0.6, x + w / 2, topY);
  ctx.closePath();
  ctx.fill();
  // Inner yellow core.
  ctx.fillStyle = `rgba(255, 230, 110, ${0.6 + 0.3 * value})`;
  ctx.beginPath();
  ctx.moveTo(x - w / 4, topY);
  ctx.quadraticCurveTo(x - w / 4, topY + h * 0.4, x, topY + h * 0.75);
  ctx.quadraticCurveTo(x + w / 4, topY + h * 0.4, x + w / 4, topY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBalloon() {
  if (!ctx) return;
  const { x, y, r } = balloon;
  // Basket hangs below the envelope.
  const basketW = r * 0.9;
  const basketH = r * 0.55;
  const basketY = y + r + 10;
  const burnerTopY = y + r; // flame emerges from the basket rim

  // Flame first (behind basket so the rim hides the base).
  drawFlame(triggerValue, x, burnerTopY + basketH * 0.2);

  // Rope connectors.
  ctx.save();
  ctx.strokeStyle = '#6b5a3e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - basketW / 2, basketY);
  ctx.lineTo(x - r * 0.5, y + r * 0.4);
  ctx.moveTo(x + basketW / 2, basketY);
  ctx.lineTo(x + r * 0.5, y + r * 0.4);
  ctx.stroke();
  ctx.restore();

  // Basket.
  ctx.save();
  ctx.fillStyle = '#a47148';
  ctx.fillRect(x - basketW / 2, basketY, basketW, basketH);
  ctx.strokeStyle = '#6b4a22';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - basketW / 2, basketY, basketW, basketH);
  ctx.restore();

  // Envelope (the balloon itself).
  ctx.save();
  const grd = ctx.createRadialGradient(
    x - r * 0.3, y - r * 0.3, r * 0.2,
    x, y, r,
  );
  grd.addColorStop(0, '#ff8fa3');
  grd.addColorStop(1, '#e23e57');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // Highlight stripe.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y, r * 0.18, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  if (!ctx) return;
  // Zero-size guard: never draw into an unsized backing store.
  if (cssWidth < 2 || cssHeight < 2) return;
  drawSky();
  clouds.forEach(drawCloud);
  stars.forEach(drawStar);
  drawBalloon();
}

// ---------------------------------------------------------------------------
// Game loop — update/draw split, dt in seconds, clamped.
// ---------------------------------------------------------------------------

function loop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  let dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  // Clamp dt to avoid tunneling on lag spikes / tab-throttling.
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  if (dt > DT_CLAMP) dt = DT_CLAMP;

  update(dt);
  draw();
  rafId = requestAnimationFrame(loop);
}

function start() {
  if (rafId != null) return;
  lastTimestamp = 0;
  rafId = requestAnimationFrame(loop);
}

function stop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

start();

// ---------------------------------------------------------------------------
// Banner + trigger label (layout-correct: RT / R2 / ZR)
// ---------------------------------------------------------------------------

function syncBanner() {
  if (!bannerEl || !bannerText) return;
  const connected = gamepadManager.isActive();
  bannerEl.classList.toggle('is-connected', connected);
  bannerText.textContent = connected
    ? `Controller connected — layout: ${gamepadManager.getLayout()}`
    : 'No controller — hold Space to fire the burner.';
}

function updateTriggerLabel() {
  if (!triggerLabelEl) return;
  triggerLabelEl.textContent = triggerLabel(gamepadManager.getLayout(), 'right');
}

syncBanner();
updateTriggerLabel();

// ---------------------------------------------------------------------------
// Event handlers (bound so they can be removed on unload)
// ---------------------------------------------------------------------------

function onTriggerRight(event) {
  const detail = event && event.detail ? event.detail : {};
  const v = Number(detail.value);
  triggerValue = Number.isFinite(v) ? clamp(v, 0, 1) : 0;
  // When the manager stops emitting (release below deadzone), we keep the
  // last emitted value but clamp tiny noise to zero.
  if (triggerValue < TRIGGER_DEADZONE) triggerValue = 0;
}

function onLayoutChange() {
  updateTriggerLabel();
  syncBanner();
}

function onAvailability() {
  syncBanner();
}

// Resume the AudioContext on first interaction (browser autoplay policy).
function onFirstGesture() {
  try {
    resumeAudio();
  } catch (error) {
    // Fail soft.
  }
}

const LISTENERS = [
  [TRIGGER_RIGHT, onTriggerRight],
  [LAYOUT_CHANGE, onLayoutChange],
  [AVAILABILITY, onAvailability],
];

LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));
window.addEventListener('pointerdown', onFirstGesture, { once: true });
window.addEventListener('keydown', onFirstGesture, { once: true });

// ---------------------------------------------------------------------------
// Teardown — remove every listener this game added, cancel rAF.
// ---------------------------------------------------------------------------

function cleanup() {
  stop();
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  window.removeEventListener('pointerdown', onFirstGesture);
  window.removeEventListener('keydown', onFirstGesture);
  window.removeEventListener('resize', resizeCanvas);
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);
