// games/submarine-sonar/game.js — Canvas engine for the Submarine Sonar game.
// Zero dependencies. All gameplay RULES live in ./sonar-logic.js (pure,
// unit-tested). This file is DOM/Canvas + gamepad wiring only.
//
// Events consumed (registered on window via the shared GamepadManager):
//   - gamepad-stick-left        detail { x, y } → move the submarine
//   - gamepad-stick-click-left  (L3)            → start a sonar ping
//   - gamepad-stick-click-right (R3)            → cycle headlight color
//   - gamepad-layout-change / gamepad-availability → banner / prompt labels
//
// IMPORTANT: a stick CLICK is a discrete press event; it is entirely separate
// from the analog `gamepad-stick-left` tilt events, so clicking never flings
// the sub. The two event streams are not coupled here.

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { clamp, circleCollision, playBlip } from '../../shared/utils.js';
import {
  pingRadius,
  revealedByPing,
  nextHeadlightColor,
  markDiscovered,
} from './sonar-logic.js';
import { stickClickLabel } from '../../shared/button-mapping.js';

// ---------------------------------------------------------------------------
// Constants — no magic numbers inline.
// ---------------------------------------------------------------------------

const HEADLIGHT_COLORS = ['#fff7d6', '#7bf1ff', '#b6ff8c', '#ff9ad1'];
const PING_MAX_RADIUS = 360; // px (CSS space) — generous illumination
const PING_DURATION_MS = 1400; // expand time; entities fade shortly after
const PING_COOLDOWN_MS = 250; // gentle anti-spam (non-blocking)
const LINGER_MS = 1200; // how long an entity stays lit after the ring reaches it
const SUB_RADIUS = 16; // px (CSS space)
const SUB_MAX_SPEED = 260; // px/sec at full stick deflection
const STICK_DEADZONE = 0.18; // ignore tiny noise when integrating movement
const DPAD_SPEED = 200; // px/sec when a dpad/arrow direction is held
const ENTITY_COUNT = 16; // fish + treasure hidden in the dark
const FISH_EMOJIS = ['🐠', '🐟', '🐡', '🦑', '🐢', '🦐'];
const TREASURE_EMOJIS = ['🗝️', '💰', '📦', '🍾'];

const BG_TOP = '#02060f';
const BG_BOTTOM = '#0a1830';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const banner = document.getElementById('banner');
const bannerText = banner.querySelector('.gamepad-banner__text');
const pingPrompt = document.getElementById('ping-prompt');
const colorPrompt = document.getElementById('color-prompt');
const headlightSwatch = document.getElementById('headlight-swatch');
const discoveredCount = document.getElementById('discovered-count');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cssWidth = 0;
let cssHeight = 0;

const sub = {
  x: 0,
  y: 0,
  vx: 0, // current integrated velocity (px/s) — smoothed from stick
  vy: 0,
};

let headlightIndex = 0;

// A sonar ping: { start: timestamp, reached: Set<entityId> }
let activePing = null;
let lastPingStartedAt = -Infinity;

// Entities hidden in the dark. Each: { id, x, y, emoji, size, litUntil, discovered }
const entities = [];

// Ids of creatures discovered (revealed by ping OR overlapped by the sub).
// Deduped per creature — positive-only, zero-stress objective (PRD).
const discovered = new Set();

// Cached last frame timestamp for dt.
let lastTimestamp = 0;
let rafId = null;

// ---------------------------------------------------------------------------
// Setup — entities, initial sub position, canvas sizing
// ---------------------------------------------------------------------------

function spawnEntities() {
  entities.length = 0;
  for (let i = 0; i < ENTITY_COUNT; i++) {
    const isTreasure = Math.random() < 0.3;
    const pool = isTreasure ? TREASURE_EMOJIS : FISH_EMOJIS;
    entities.push({
      id: i,
      x: 0,
      y: 0,
      emoji: pool[Math.floor(Math.random() * pool.length)],
      size: isTreasure ? 34 : 30,
      litUntil: 0,
      discovered: false,
    });
  }
  // Place entities once we know the canvas size; re-place on resize.
  relayoutEntities();
}

function relayoutEntities() {
  if (cssWidth <= 0 || cssHeight <= 0) return;
  const margin = 60;
  for (const e of entities) {
    e.x = margin + Math.random() * (cssWidth - margin * 2);
    e.y = margin + Math.random() * (cssHeight - margin * 2);
  }
}

function centerSub() {
  sub.x = cssWidth / 2;
  sub.y = cssHeight / 2;
  sub.vx = 0;
  sub.vy = 0;
}

// DPR-aware backing resolution; CSS controls display size.
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  cssWidth = Math.max(1, Math.floor(rect.width));
  cssHeight = Math.max(1, Math.floor(rect.height));
  let dpr = 1;
  try {
    dpr = window.devicePixelRatio || 1;
  } catch (error) {
    dpr = 1;
  }
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  // Re-apply the transform after a backing-store resize (it resets).
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------------------
// Input handlers (bound, removed on teardown)
// ---------------------------------------------------------------------------

function onStickLeft(event) {
  const { x, y } = event.detail || {};
  if (typeof x !== 'number' || typeof y !== 'number') return;
  // Target velocity from stick; deadzone zeroes noise. We do NOT set position
  // directly — movement is integrated in update() for smooth gliding.
  const mag = Math.hypot(x, y);
  if (mag < STICK_DEADZONE) {
    sub.vx = 0;
    sub.vy = 0;
    return;
  }
  sub.vx = x * SUB_MAX_SPEED;
  sub.vy = y * SUB_MAX_SPEED;
}

// D-Pad → unit directional velocity. Defensive fallback so navigation works
// even without the synthesized stick events (T1). Tracks held directions to
// allow simultaneous keys (e.g. Up+Right), and zeroes on release of the last
// held direction. Coexists with onStickLeft: whichever fires last wins this
// frame, and any release zeroes the relevant axis.
const heldDpad = { up: false, down: false, left: false, right: false };

function applyDpad() {
  let vx = 0;
  let vy = 0;
  if (heldDpad.left) vx -= 1;
  if (heldDpad.right) vx += 1;
  if (heldDpad.up) vy -= 1;
  if (heldDpad.down) vy += 1;
  sub.vx = vx * DPAD_SPEED;
  sub.vy = vy * DPAD_SPEED;
}

function makeDpadHandler(dir, pressed) {
  return () => {
    heldDpad[dir] = pressed;
    applyDpad();
  };
}

function onStickClickLeft() {
  // L3 → sonar ping. Gentle cooldown; never a fail state — spam is just ignored.
  const now = performance.now();
  if (now - lastPingStartedAt < PING_COOLDOWN_MS) return;
  lastPingStartedAt = now;
  activePing = { start: now, reached: new Set() };
  playPing();
}

function onStickClickRight() {
  // R3 → cycle headlight color (cosmetic only).
  headlightIndex = nextHeadlightColor(headlightIndex, HEADLIGHT_COLORS);
  updateHeadlightSwatch();
  playSwitch();
}

function onLayoutChange() {
  updatePrompts();
}

function onAvailability(event) {
  const detail = event.detail || {};
  if (detail.connected) {
    banner.classList.add('is-connected');
    bannerText.textContent = `Connected: ${detail.id || 'controller'}`;
  } else {
    banner.classList.remove('is-connected');
    bannerText.textContent = 'Waiting for a controller…';
  }
}

function updatePrompts() {
  let layout = 'xbox';
  try {
    layout = gamepadManager.getLayout() || 'xbox';
  } catch (error) {
    layout = 'xbox';
  }
  pingPrompt.textContent = `${stickClickLabel(layout, 'left')} (click left stick)`;
  colorPrompt.textContent = `${stickClickLabel(layout, 'right')} (click right stick)`;
}

function updateHeadlightSwatch() {
  headlightSwatch.style.backgroundColor = HEADLIGHT_COLORS[headlightIndex];
}

function updateDiscoveredHud() {
  if (discoveredCount) {
    discoveredCount.textContent = String(discovered.size);
  }
}

// ---------------------------------------------------------------------------
// Audio (synthesized; fail-soft). No external files.
// ---------------------------------------------------------------------------

let audioContext = null;
function audioCtx() {
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioContext = new Ctor();
  } catch (error) {
    audioContext = null;
  }
  return audioContext;
}

function playPing() {
  const ctxA = audioCtx();
  if (!ctxA) return;
  try {
    if (ctxA.state === 'suspended') ctxA.resume().catch(() => {});
    const now = ctxA.currentTime;
    // Two descending blips — a soft sonar "blip-blip".
    [880, 660].forEach((freq, i) => {
      const t0 = now + i * 0.14;
      const osc = ctxA.createOscillator();
      const g = ctxA.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(g).connect(ctxA.destination);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    });
  } catch (error) {
    // Fail soft.
  }
}

function playSwitch() {
  const ctxA = audioCtx();
  if (!ctxA) return;
  try {
    if (ctxA.state === 'suspended') ctxA.resume().catch(() => {});
    const now = ctxA.currentTime;
    const osc = ctxA.createOscillator();
    const g = ctxA.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.1, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(g).connect(ctxA.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch (error) {
    // Fail soft.
  }
}

// ---------------------------------------------------------------------------
// Update + Draw (split, as required)
// ---------------------------------------------------------------------------

function update(dt) {
  // Integrate position from velocity; clamp to canvas; zero-size guard.
  if (cssWidth > 0 && cssHeight > 0) {
    sub.x = clamp(sub.x + sub.vx * dt, SUB_RADIUS, cssWidth - SUB_RADIUS);
    sub.y = clamp(sub.y + sub.vy * dt, SUB_RADIUS, cssHeight - SUB_RADIUS);
  }

  // Advance the sonar ping and light entities it has reached.
  if (activePing) {
    const elapsed = performance.now() - activePing.start;
    const radius = pingRadius(elapsed, PING_MAX_RADIUS, PING_DURATION_MS);
    if (radius > 0) {
      for (const e of entities) {
        if (activePing.reached.has(e.id)) continue;
        if (revealedByPing({ x: e.x, y: e.y, size: e.size }, sub, radius)) {
          activePing.reached.add(e.id);
          e.litUntil = performance.now() + LINGER_MS;
          // Discovery (positive-only): first ping reveal counts, deduped.
          if (markDiscovered(e, discovered)) {
            updateDiscoveredHud();
            playBlip();
          }
        }
      }
    }
    // Retire the ping once its ring has fully expanded and faded.
    if (elapsed >= PING_DURATION_MS + 200) {
      activePing = null;
    }
  }

  // Sub-overlap discovery: touching a creature also counts (first time only).
  // Overlap uses circle-vs-circle with the entity's half-size as its radius.
  const subCircle = { x: sub.x, y: sub.y, r: SUB_RADIUS };
  for (const e of entities) {
    if (e.discovered) continue;
    const entityCircle = { x: e.x, y: e.y, r: e.size / 2 };
    if (circleCollision(subCircle, entityCircle)) {
      if (markDiscovered(e, discovered)) {
        updateDiscoveredHud();
        playBlip();
      }
    }
  }
}

function draw() {
  if (cssWidth <= 0 || cssHeight <= 0) return;

  // 1. Deep-water background gradient.
  const bg = ctx.createLinearGradient(0, 0, 0, cssHeight);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const now = performance.now();

  // 2. Headlight cone in front of the sub (drawn under entities).
  drawHeadlight(now);

  // 3. Hidden entities — only visible while lit by a ping or in the cone.
  drawEntities(now);

  // 4. Sonar ring (expanding, fading).
  drawSonarRing(now);

  // 5. The submarine itself on top.
  drawSub();
}

function drawHeadlight(now) {
  // Subtle cone in the direction of travel; colored by current headlight.
  const color = HEADLIGHT_COLORS[headlightIndex];
  let dirX = sub.vx;
  let dirY = sub.vy;
  const mag = Math.hypot(dirX, dirY);
  if (mag < 1) {
    // Default to pointing right when stationary.
    dirX = 1;
    dirY = 0;
  } else {
    dirX /= mag;
    dirY /= mag;
  }
  const coneLen = 150;
  const coneHalfAngle = 0.5; // radians

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(
    sub.x,
    sub.y,
    8,
    sub.x + dirX * coneLen * 0.5,
    sub.y + dirY * coneLen * 0.5,
    coneLen,
  );
  grad.addColorStop(0, withAlpha(color, 0.45));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(sub.x, sub.y);
  const a1 = Math.atan2(dirY, dirX) - coneHalfAngle;
  const a2 = Math.atan2(dirY, dirX) + coneHalfAngle;
  ctx.arc(sub.x, sub.y, coneLen, a1, a2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEntities(now) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of entities) {
    const litFor = e.litUntil - now;
    if (litFor <= 0) continue; // still hidden in the dark
    const alpha = clamp(litFor / LINGER_MS, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = `${e.size}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillText(e.emoji, e.x, e.y);
  }
  ctx.restore();
}

function drawSonarRing(now) {
  if (!activePing) return;
  const elapsed = now - activePing.start;
  const radius = pingRadius(elapsed, PING_MAX_RADIUS, PING_DURATION_MS);
  if (radius <= 0) return;
  // Fade the ring out over the duration (and a short tail after).
  const fade = clamp(1 - elapsed / (PING_DURATION_MS + 200), 0, 1);
  ctx.save();
  ctx.strokeStyle = withAlpha('#7bf1ff', 0.55 * fade);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sub.x, sub.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Inner soft glow ring.
  ctx.strokeStyle = withAlpha('#7bf1ff', 0.15 * fade);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(sub.x, sub.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSub() {
  ctx.save();
  ctx.translate(sub.x, sub.y);

  // Hull.
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(0, 0, SUB_RADIUS + 6, SUB_RADIUS - 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tower.
  ctx.fillStyle = '#e0a800';
  ctx.fillRect(-4, -SUB_RADIUS - 4, 8, 6);

  // Porthole.
  ctx.fillStyle = '#02060f';
  ctx.beginPath();
  ctx.arc(SUB_RADIUS - 2, -2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Headlight dot at the front, in the current color.
  ctx.fillStyle = HEADLIGHT_COLORS[headlightIndex];
  ctx.beginPath();
  ctx.arc(SUB_RADIUS + 4, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Convert a #rrggbb hex color + alpha into an rgba() string for canvas.
function withAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function loop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  // Clamp dt to avoid huge jumps after a tab is backgrounded (zero-stress).
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  update(dt);
  draw();

  rafId = requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Lifecycle: wire listeners, size canvas, start loop, tear down on unload
// ---------------------------------------------------------------------------

const handlers = {
  stickLeft: onStickLeft,
  dpadUp: makeDpadHandler('up', true),
  dpadDown: makeDpadHandler('down', true),
  dpadLeft: makeDpadHandler('left', true),
  dpadRight: makeDpadHandler('right', true),
  dpadUpUp: makeDpadHandler('up', false),
  dpadDownUp: makeDpadHandler('down', false),
  dpadLeftUp: makeDpadHandler('left', false),
  dpadRightUp: makeDpadHandler('right', false),
  stickClickLeft: onStickClickLeft,
  stickClickRight: onStickClickRight,
  layoutChange: onLayoutChange,
  availability: onAvailability,
};

function addListeners() {
  window.addEventListener('gamepad-stick-left', handlers.stickLeft);
  window.addEventListener('gamepad-dpad-up', handlers.dpadUp);
  window.addEventListener('gamepad-dpad-down', handlers.dpadDown);
  window.addEventListener('gamepad-dpad-left', handlers.dpadLeft);
  window.addEventListener('gamepad-dpad-right', handlers.dpadRight);
  window.addEventListener('gamepad-dpad-up-up', handlers.dpadUpUp);
  window.addEventListener('gamepad-dpad-down-up', handlers.dpadDownUp);
  window.addEventListener('gamepad-dpad-left-up', handlers.dpadLeftUp);
  window.addEventListener('gamepad-dpad-right-up', handlers.dpadRightUp);
  window.addEventListener('gamepad-stick-click-left', handlers.stickClickLeft);
  window.addEventListener('gamepad-stick-click-right', handlers.stickClickRight);
  window.addEventListener('gamepad-layout-change', handlers.layoutChange);
  window.addEventListener('gamepad-availability', handlers.availability);
}

function removeListeners() {
  window.removeEventListener('gamepad-stick-left', handlers.stickLeft);
  window.removeEventListener('gamepad-dpad-up', handlers.dpadUp);
  window.removeEventListener('gamepad-dpad-down', handlers.dpadDown);
  window.removeEventListener('gamepad-dpad-left', handlers.dpadLeft);
  window.removeEventListener('gamepad-dpad-right', handlers.dpadRight);
  window.removeEventListener('gamepad-dpad-up-up', handlers.dpadUpUp);
  window.removeEventListener('gamepad-dpad-down-up', handlers.dpadDownUp);
  window.removeEventListener('gamepad-dpad-left-up', handlers.dpadLeftUp);
  window.removeEventListener('gamepad-dpad-right-up', handlers.dpadRightUp);
  window.removeEventListener('gamepad-stick-click-left', handlers.stickClickLeft);
  window.removeEventListener('gamepad-stick-click-right', handlers.stickClickRight);
  window.removeEventListener('gamepad-layout-change', handlers.layoutChange);
  window.removeEventListener('gamepad-availability', handlers.availability);
}

function start() {
  resizeCanvas();
  centerSub();
  spawnEntities();
  addListeners();
  updatePrompts();
  updateHeadlightSwatch();
  updateDiscoveredHud();

  // Reflect whatever gamepad state the singleton already knows about.
  if (gamepadManager && gamepadManager.isActive && gamepadManager.isActive()) {
    banner.classList.add('is-connected');
    bannerText.textContent = 'Connected: controller';
  }

  rafId = requestAnimationFrame(loop);
}

function stop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  removeListeners();
}

// Resize handling: keep the sub in bounds and re-scatter entities to fit.
const onResize = () => {
  resizeCanvas();
  if (sub.x === 0 && sub.y === 0) centerSub();
  else {
    sub.x = clamp(sub.x, SUB_RADIUS, cssWidth - SUB_RADIUS);
    sub.y = clamp(sub.y, SUB_RADIUS, cssHeight - SUB_RADIUS);
  }
  relayoutEntities();
};

window.addEventListener('resize', onResize);
window.addEventListener('pagehide', stop);
window.addEventListener('beforeunload', stop);

start();
