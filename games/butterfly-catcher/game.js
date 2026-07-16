// games/butterfly-catcher/game.js — Canvas engine for Butterfly Catcher.
// Teaches left-stick tilt MAGNITUDE: tiptoe to catch, run to scare.
// rAF loop with update/draw split, DPR-aware sizing, zero-size guard,
// and full teardown (cancelAnimationFrame + removeEventListener) on unload.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import {
  STICK_LEFT,
  LAYOUT_CHANGE,
  AVAILABILITY,
} from '../../shared/button-mapping.js';
import { clamp, playTone } from '../../shared/utils.js';
import {
  movementMode,
  butterflyFlees,
  tryCatch,
} from './tilt-logic.js';

// ---------------------------------------------------------------------------
// Constants — no magic numbers in the hot loop.
// ---------------------------------------------------------------------------

// Player speed (CSS pixels per second) by movement mode.
const SPEED_BY_MODE = {
  tiptoe: 60, // slow sneak
  walk: 150, // intermediate
  run: 300, // fast — but scary
};

// Butterfly behavior radii (CSS px).
const FLEE_RADIUS = 90; // run within this scares them
const CATCH_RADIUS = 46; // tiptoe within this catches them
const REST_RADIUS = 14; // resting butterfly idle wander

// Butterfly counts and respawn.
const BUTTERFLY_TARGET = 5; // minimum kept on screen
const FLEE_DURATION_MS = 1100; // how long a fleeing butterfly stays "gone"
const RESPAWN_DELAY_MS = 700; // delay before a new butterfly appears

// Player visual.
const PLAYER_RADIUS = 22;

// Butterflies drawn as colored emoji for a child-friendly look.
const BUTTERFLY_EMOJIS = ['🦋', '🦋', '🦋', '🌸', '🐝'];

// Stick coupling: we keep last-seen stick vector so movement persists between
// events (the manager emits continuously while tilted, and stops — i.e. emits
// nothing — inside the deadzone, which means "stand still").
const STICK_DECAY = 0; // stick vector is held until changed; 0 = no decay

// Audio: footsteps scaled by mode + a shutter on catch.
const FOOTSTEP_FREQ = { tiptoe: 240, walk: 200, run: 170 };
const FOOTSTEP_INTERVAL_MS = { tiptoe: 420, walk: 320, run: 200 };
const CATCH_FREQ = 880;
const CATCH_DURATION = 0.12;
const FLEE_FREQ = 300;

// ---------------------------------------------------------------------------
// DOM + Canvas
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const modeBadge = document.getElementById('mode-badge');
const catchCountEl = document.getElementById('catch-count');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');

if (!canvas || !ctx) {
  // Fail soft: nothing to render onto. Do not throw to the child.
}

// Backing store size, updated on resize. CSS pixels are the game's
// coordinate system; ctx is scaled by DPR so we can draw in CSS px.
let viewW = 0;
let viewH = 0;
let dpr = 1;

function resize() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  viewW = Math.max(1, Math.floor(rect.width));
  viewH = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  facing: 1, // +1 right, -1 left (for sprite mirroring cues)
  mode: 'tiptoe',
  stepPhase: 0, // for walk/run bob
};

// Butterflies: { id, x, y, color, emoji, state: 'rest'|'flee', fleeUntil, bob }
/** @type {Array<{id:number,x:number,y:number,emoji:string,state:'rest'|'flee',fleeUntil:number,bob:number}>} */
const butterflies = [];
let nextButterflyId = 1;

let stickX = 0;
let stickY = 0;
let lastStickTime = 0;

let catchCount = 0;
let lastFootstepAt = 0;

// ---------------------------------------------------------------------------
// Spawning helpers (pure-ish; mutate the butterflies array)
// ---------------------------------------------------------------------------

function randomRestPosition() {
  const margin = 60;
  return {
    x: margin + Math.random() * Math.max(1, viewW - margin * 2),
    y: margin + Math.random() * Math.max(1, viewH - margin * 2),
  };
}

function spawnButterfly() {
  const pos = randomRestPosition();
  butterflies.push({
    id: nextButterflyId++,
    x: pos.x,
    y: pos.y,
    emoji: '🦋',
    state: 'rest',
    fleeUntil: 0,
    bob: Math.random() * Math.PI * 2,
  });
}

function ensureButterflies(now) {
  // Count only resting (present) butterflies toward the on-screen minimum.
  const present = butterflies.filter((b) => b.state === 'rest').length;
  if (present < BUTTERFLY_TARGET) {
    spawnButterfly();
  }
  // Reap butterflies whose flee timer expired — respawn a fresh one shortly.
  for (let i = butterflies.length - 1; i >= 0; i--) {
    const b = butterflies[i];
    if (b.state === 'flee' && now >= b.fleeUntil) {
      butterflies.splice(i, 1);
      // Schedule a replacement (non-blocking; never a penalty).
      setTimeout(spawnButterfly, RESPAWN_DELAY_MS);
    }
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

function update(dt, now) {
  // Magnitude → mode (pure logic module).
  const mag = Math.min(1, Math.hypot(stickX, stickY));
  player.mode = movementMode(mag);

  // If the stick hasn't reported in a while, treat it as released (still).
  // The manager emits nothing inside the deadzone, so we zero the vector when
  // no event has arrived for two frames worth of time.
  if (now - lastStickTime > 60) {
    stickX = 0;
    stickY = 0;
  }

  // Normalize direction so speed is independent of magnitude (the magnitude
  // already chose the mode; direction just steers). Avoid div-by-zero.
  const dirMag = Math.hypot(stickX, stickY);
  let dirX = 0;
  let dirY = 0;
  if (dirMag > 0.0001) {
    dirX = stickX / dirMag;
    dirY = stickY / dirMag;
  }

  const speed = SPEED_BY_MODE[player.mode];
  player.vx = dirX * speed;
  player.vy = dirY * speed;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  if (dirX !== 0) player.facing = dirX < 0 ? -1 : 1;

  // Clamp to view; keep the player fully on the field.
  player.x = clamp(player.x, PLAYER_RADIUS, Math.max(PLAYER_RADIUS, viewW - PLAYER_RADIUS));
  player.y = clamp(player.y, PLAYER_RADIUS, Math.max(PLAYER_RADIUS, viewH - PLAYER_RADIUS));

  // Walk/run bob phase.
  if (player.mode !== 'tiptoe' && (Math.abs(player.vx) + Math.abs(player.vy)) > 1) {
    player.stepPhase += dt * (player.mode === 'run' ? 16 : 9);
  }

  // Footstep audio, scaled by mode.
  if (mag > 0.05 && now - lastFootstepAt > FOOTSTEP_INTERVAL_MS[player.mode]) {
    lastFootstepAt = now;
    playTone({
      freq: FOOTSTEP_FREQ[player.mode],
      duration: 0.05,
      type: 'sine',
      gain: player.mode === 'run' ? 0.08 : 0.04,
    });
  }

  // Resolve butterfly interactions.
  for (const b of butterflies) {
    if (b.state !== 'rest') continue;
    // Decorate radii so the pure functions can read them.
    const withRadii = { x: b.x, y: b.y, fleeRadius: FLEE_RADIUS, catchRadius: CATCH_RADIUS };

    if (butterflyFlees(withRadii, player, player.mode)) {
      b.state = 'flee';
      b.fleeUntil = now + FLEE_DURATION_MS;
      playTone({ freq: FLEE_FREQ, duration: 0.12, type: 'triangle', gain: 0.08 });
      continue;
    }
    if (tryCatch(withRadii, player, player.mode)) {
      b.state = 'flee'; // remove from play; reaped + respawned below
      b.fleeUntil = now; // reap immediately
      catchCount += 1;
      if (catchCountEl) catchCountEl.textContent = String(catchCount);
      playTone({ freq: CATCH_FREQ, duration: CATCH_DURATION, type: 'sine', gain: 0.18 });
      // Sparkle on top of the catch.
      setTimeout(() => {
        playTone({ freq: CATCH_FREQ * 1.5, duration: 0.08, type: 'sine', gain: 0.1 });
      }, 90);
    }
  }

  // Reap + maintain minimum count.
  ensureButterflies(now);

  // Idle bob for resting butterflies.
  for (const b of butterflies) {
    b.bob += dt * 3;
  }

  // UI: mode badge.
  if (modeBadge) {
    modeBadge.dataset.mode = player.mode;
    modeBadge.textContent = player.mode.toUpperCase();
  }

  // Stick coupling note: STICK_DECAY kept at 0; no-op to avoid unused warning.
  void STICK_DECAY;
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

function drawField() {
  if (!ctx) return;
  // Grassy gradient background.
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, '#9be15d');
  g.addColorStop(1, '#5fb84e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  // A few soft grass tufts for texture (deterministic via index math).
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 24; i++) {
    const x = (i * 97.13) % viewW;
    const y = (i * 53.71) % viewH;
    ctx.beginPath();
    ctx.ellipse(x, y, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawButterflies(now) {
  if (!ctx) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = 30;
  ctx.font = `${size}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

  for (const b of butterflies) {
    if (b.state === 'flee') continue; // gone from view while fleeing
    const bobY = Math.sin(b.bob) * REST_RADIUS * 0.25;
    ctx.globalAlpha = 0.95;
    ctx.fillText(b.emoji, b.x, b.y + bobY);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  void now;
}

function drawPlayer(now) {
  if (!ctx) return;
  const bob = Math.sin(player.stepPhase) * (player.mode === 'run' ? 4 : 2);
  const x = player.x;
  const y = player.y - bob;

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + PLAYER_RADIUS - 2, PLAYER_RADIUS * 0.9, PLAYER_RADIUS * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dust puffs on run.
  if (player.mode === 'run') {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) {
      const phase = (player.stepPhase + i * 1.2) % 3;
      const r = 3 + phase * 4;
      ctx.globalAlpha = 0.4 * (1 - phase / 3);
      ctx.beginPath();
      ctx.arc(x - player.facing * (10 + i * 8), player.y + PLAYER_RADIUS - 4, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Body (child-friendly blob).
  ctx.fillStyle = player.mode === 'run' ? '#ff6b6b' : player.mode === 'walk' ? '#ffd23f' : '#4ecdc4';
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (two dots) facing the direction of travel.
  ctx.fillStyle = '#1a1200';
  const eyeOffsetX = player.facing * 6;
  ctx.beginPath();
  ctx.arc(x + eyeOffsetX - 4, y - 4, 3, 0, Math.PI * 2);
  ctx.arc(x + eyeOffsetX + 4, y - 4, 3, 0, Math.PI * 2);
  ctx.fill();

  void now;
}

function draw() {
  if (!ctx) return;
  // Zero-size guard: if the canvas hasn't been sized yet, skip.
  if (viewW < 2 || viewH < 2) return;
  ctx.clearRect(0, 0, viewW, viewH);
  drawField();
  drawButterflies(performance.now());
  drawPlayer(performance.now());
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let rafId = null;
let lastTimestamp = 0;

function loop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  // Clamp dt to avoid huge jumps after tab-throttling; cap at 1/20s.
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;
  update(dt, timestamp);
  draw();
  rafId = requestAnimationFrame(loop);
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
    : 'No controller — use the keyboard (WASD / Arrows = left stick).';
}

// ---------------------------------------------------------------------------
// Event handlers (bound so they can be removed on unload)
// ---------------------------------------------------------------------------

function onStickLeft(event) {
  const { x, y } = event.detail || {};
  if (typeof x !== 'number' || typeof y !== 'number') return;
  stickX = x;
  stickY = y;
  lastStickTime = performance.now();
}

function onLayoutChange() {
  syncBanner();
}

function onAvailability() {
  syncBanner();
}

const LISTENERS = [
  [STICK_LEFT, onStickLeft],
  [LAYOUT_CHANGE, onLayoutChange],
  [AVAILABILITY, onAvailability],
];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function init() {
  if (!canvas || !ctx) return;
  resize();
  // Center the player.
  player.x = viewW / 2;
  player.y = viewH / 2;
  // Seed butterflies.
  for (let i = 0; i < BUTTERFLY_TARGET; i++) spawnButterfly();
  syncBanner();
  LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));
  rafId = requestAnimationFrame(loop);
}

function cleanup() {
  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = null;
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

init();
