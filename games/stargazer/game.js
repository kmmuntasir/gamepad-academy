// games/stargazer/game.js — Canvas night-sky engine for The Stargazer.
// requestAnimationFrame loop with update/draw split. The left thumbstick moves
// a glowing cursor; hovering a faded dot reveals its face-button prompt;
// pressing the matching positional face button ignites a bright star; ignited
// stars connect into a constellation in ignition order.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().
// Zero fail states: wrong presses are no-ops; igniting all dots is a purely
// visual celebration.

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { createFaceGlyph, setGlyphLayout, setGlyphActive } from '../../shared/glyph.js';
import { clamp, pick, playTone } from '../../shared/utils.js';
import {
  FACE_BOTTOM,
  FACE_RIGHT,
  FACE_LEFT,
  FACE_TOP,
  STICK_LEFT,
  LAYOUT_CHANGE,
} from '../../shared/button-mapping.js';
import { findHoveredDot, promptForDot, connectDots } from './constellation-logic.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Map a positional face event name → its position string (for matching).
const FACE_EVENT_TO_POSITION = {
  [FACE_BOTTOM]: 'bottom',
  [FACE_RIGHT]: 'right',
  [FACE_LEFT]: 'left',
  [FACE_TOP]: 'top',
};

// How many faded dots to scatter across the sky.
const DOT_COUNT = 8;

// Cursor tuning.
const CURSOR_SPEED = 320; // px per second at full stick deflection
const CURSOR_RADIUS = 26; // hit radius for hover detection
const CURSOR_DRAW_RADIUS = 12; // visual size of the glowing cursor

// Dot tuning.
const DOT_RADIUS = 5; // visual radius of a faded dot
const STAR_RADIUS = 8; // visual radius of an ignited star
const HOVER_RADIUS = CURSOR_RADIUS; // passed to findHoveredDot

// Tuning for the emulated-stick held-key movement (keyboard fallback).
// The real gamepad emits live axis values each frame; the keyboard has no
// such "hold" event, so we track held arrow keys and synthesize an axis.
const STICK_KEY_CODES = Object.freeze({
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
});

// Audio: a soft sparkle for ignition + a slightly higher chime for an edge.
const IGNITE_FREQ = 880;
const IGNITE_DURATION = 0.18;
const IGNITE_GAIN = 0.18;
const EDGE_FREQ = 1174.66; // D6
const EDGE_DURATION = 0.12;
const EDGE_GAIN = 0.12;

// Visual palette (Canvas fill styles — inline style exception per rules).
const COLOR_CURSOR = '#ffd23f';
const COLOR_CURSOR_HALO = 'rgba(255, 210, 63, 0.35)';
const COLOR_DOT_FAINT = 'rgba(174, 184, 216, 0.35)';
const COLOR_DOT_HOVER = 'rgba(174, 184, 216, 0.85)';
const COLOR_STAR = '#fff4c2';
const COLOR_STAR_GLOW = 'rgba(255, 244, 194, 0.55)';
const COLOR_LINE = 'rgba(123, 237, 159, 0.7)';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.getElementById('star-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const promptHost = document.getElementById('prompt-glyph');
const promptLabel = document.getElementById('prompt-label');
const statusEl = document.getElementById('star-status');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');

// ---------------------------------------------------------------------------
// State (separate from drawing)
// ---------------------------------------------------------------------------

// Backing-resolution pixels per CSS pixel (set in resize()).
let dpr = 1;
// CSS-pixel size of the canvas drawing surface.
let viewW = 0;
let viewH = 0;

const cursor = { x: 0, y: 0 };

// Each dot: { x, y, requiredPosition, ignited } where x/y are in CSS px.
let dots = [];
// Ignited dots in ignition order (used for connectDots + celebration).
const ignited = [];

// The dot currently under the cursor (recomputed each frame), or null.
let hoveredDot = null;

// Live stick axis (from gamepad-stick-left) OR synthesized from held keys.
let stickX = 0;
let stickY = 0;
// Held stick-direction keys for the keyboard fallback.
const heldStickKeys = new Set();

// One persistent glyph reused across frames; active pad updated on hover.
let glyphNode = null;
let glyphIdle = true; // true when no pad is currently highlighted

// rAF handle for teardown.
let rafId = null;
// Last timestamp (ms) for dt computation; null until first frame.
let lastTs = null;

// ---------------------------------------------------------------------------
// Sizing — DPR-aware backing store; zero-size guard.
// ---------------------------------------------------------------------------

function resize() {
  if (!canvas || !ctx) return;
  dpr = window.devicePixelRatio || 1;
  viewW = Math.max(1, canvas.clientWidth);
  viewH = Math.max(1, canvas.clientHeight);
  canvas.width = Math.max(1, Math.floor(viewW * dpr));
  canvas.height = Math.max(1, Math.floor(viewH * dpr));
  // Reset the transform so scaling doesn't compound on each resize.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Re-clamp the cursor into the new bounds so it never escapes.
  cursor.x = clamp(cursor.x, 0, viewW);
  cursor.y = clamp(cursor.y, 0, viewH);
}

// ---------------------------------------------------------------------------
// World setup — scatter dots with a required face position each.
// ---------------------------------------------------------------------------

function buildDots() {
  dots = [];
  if (viewW < 2 || viewH < 2) return; // wait for a real size
  const positions = ['bottom', 'right', 'left', 'top'];
  const margin = 40;
  // Deterministic-ish spread: keep dots well separated so hover is unambiguous.
  const placed = [];
  let attempts = 0;
  while (dots.length < DOT_COUNT && attempts < DOT_COUNT * 40) {
    attempts += 1;
    const x = margin + Math.random() * (viewW - margin * 2);
    const y = margin + Math.random() * (viewH - margin * 2);
    const tooClose = placed.some((p) => Math.hypot(p.x - x, p.y - y) < HOVER_RADIUS * 2);
    if (tooClose) continue;
    placed.push({ x, y });
    dots.push({
      x,
      y,
      requiredPosition: pick(positions),
      ignited: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Glyph prompt — built once, active pad updated by setGlyphActive on hover.
// ---------------------------------------------------------------------------

function buildPrompt() {
  if (!promptHost) return;
  glyphNode = createFaceGlyph({
    layout: gamepadManager.getLayout(),
    position: null,
    active: false,
  });
  promptHost.replaceChildren(glyphNode);
  setGlyphActive(glyphNode, null);
}

function showIdlePrompt() {
  if (!glyphNode) return;
  setGlyphActive(glyphNode, null);
  glyphIdle = true;
  if (promptLabel) {
    promptLabel.textContent = 'Explore the sky…';
    promptLabel.classList.add('is-idle');
  }
}

function showDotPrompt(dot) {
  if (!glyphNode) return;
  setGlyphActive(glyphNode, promptForDot(dot));
  glyphIdle = false;
  if (promptLabel) {
    promptLabel.textContent = 'Press the highlighted button';
    promptLabel.classList.remove('is-idle');
  }
}

// ---------------------------------------------------------------------------
// Ignition + status
// ---------------------------------------------------------------------------

function igniteDot(dot) {
  if (!dot || dot.ignited) return false;
  dot.ignited = true;
  ignited.push(dot);
  playTone({ freq: IGNITE_FREQ, duration: IGNITE_DURATION, type: 'triangle', gain: IGNITE_GAIN });
  // Each new edge (ignited.length >= 2) gets a soft connection chime.
  if (ignited.length >= 2) {
    playTone({ freq: EDGE_FREQ, duration: EDGE_DURATION, type: 'sine', gain: EDGE_GAIN });
  }
  renderStatus();
  return true;
}

function renderStatus() {
  if (!statusEl) return;
  const total = dots.length;
  const lit = ignited.length;
  const done = total > 0 && lit === total;
  const label = done ? 'Constellation complete!' : 'Stars ignited:';
  if (done) {
    statusEl.innerHTML = `<strong>${label}</strong>`;
  } else {
    statusEl.innerHTML = `${label} <strong>${lit}</strong> / ${total}`;
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
    : 'No controller — use the keyboard (Arrows = move, WASD = face).';
}

// ---------------------------------------------------------------------------
// Update / Draw
// ---------------------------------------------------------------------------

function update(dt) {
  // Move the cursor by the live (or synthesized) stick axis.
  cursor.x = clamp(cursor.x + stickX * CURSOR_SPEED * dt, 0, viewW);
  cursor.y = clamp(cursor.y + stickY * CURSOR_SPEED * dt, 0, viewH);

  // Recompute hover over un-ignited dots only (ignited stars stay bright).
  const candidates = dots.filter((d) => !d.ignited);
  hoveredDot = findHoveredDot(cursor, candidates, HOVER_RADIUS);

  // Sync the on-screen prompt.
  if (hoveredDot) {
    showDotPrompt(hoveredDot);
  } else if (!glyphIdle) {
    showIdlePrompt();
  }
}

function drawDot(d, isHovered) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.arc(d.x, d.y, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = isHovered ? COLOR_DOT_HOVER : COLOR_DOT_FAINT;
  ctx.fill();
}

function drawStar(d) {
  if (!ctx) return;
  // Soft glow halo.
  ctx.beginPath();
  ctx.arc(d.x, d.y, STAR_RADIUS * 2.4, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_STAR_GLOW;
  ctx.fill();
  // Bright core.
  ctx.beginPath();
  ctx.arc(d.x, d.y, STAR_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_STAR;
  ctx.fill();
}

function drawEdges() {
  if (!ctx || ignited.length < 2) return;
  const edges = connectDots(ignited);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR_LINE;
  ctx.beginPath();
  for (const { a, b } of edges) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function drawCursor() {
  if (!ctx) return;
  // Outer halo.
  ctx.beginPath();
  ctx.arc(cursor.x, cursor.y, CURSOR_DRAW_RADIUS * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_CURSOR_HALO;
  ctx.fill();
  // Core.
  ctx.beginPath();
  ctx.arc(cursor.x, cursor.y, CURSOR_DRAW_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_CURSOR;
  ctx.fill();
}

function draw() {
  if (!ctx) return;
  // Zero-size guard: clear only when we have a backing store.
  if (viewW < 2 || viewH < 2) return;

  ctx.clearRect(0, 0, viewW, viewH);

  // Faded dots first (so stars/edges render above them).
  for (const d of dots) {
    if (d.ignited) continue;
    drawDot(d, d === hoveredDot);
  }

  // Constellation lines.
  drawEdges();

  // Ignited stars on top of the lines.
  for (const d of dots) {
    if (d.ignited) drawStar(d);
  }

  // Cursor last so it is always visible above everything.
  drawCursor();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function loop(ts) {
  if (lastTs == null) lastTs = ts;
  // Clamp dt to avoid huge jumps after a tab is backgrounded (zero-stress).
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  update(dt);
  draw();
  rafId = requestAnimationFrame(loop);
}

function start() {
  if (rafId != null) return;
  lastTs = null;
  rafId = requestAnimationFrame(loop);
}

function stop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ---------------------------------------------------------------------------
// Event handlers (bound so they can be removed on unload)
// ---------------------------------------------------------------------------

function onStickLeft(event) {
  const detail = event.detail || {};
  stickX = Number(detail.x) || 0;
  stickY = Number(detail.y) || 0;
}

function onFacePress(position) {
  // No hovered dot → no-op (never a penalty).
  if (!hoveredDot) return;
  const required = promptForDot(hoveredDot);
  if (position !== required) return; // wrong button → ignore
  igniteDot(hoveredDot);
  // Hover is consumed; recompute next frame via update().
}

function onFaceBottom() { onFacePress('bottom'); }
function onFaceRight() { onFacePress('right'); }
function onFaceLeft() { onFacePress('left'); }
function onFaceTop() { onFacePress('top'); }

function onLayoutChange() {
  if (glyphNode) setGlyphLayout(glyphNode, gamepadManager.getLayout());
  syncBanner();
}

function onAvailability() {
  syncBanner();
}

// Keyboard fallback for the stick: track held arrows and synthesize an axis.
// The manager's KEY_TO_EVENT emits dpad events from arrows (not stick), so we
// also listen for the raw keydown/keyup to drive continuous cursor movement.
function onKeyDown(event) {
  const dir = STICK_KEY_CODES[event.code];
  if (!dir) return;
  event.preventDefault();
  heldStickKeys.add(dir);
  recomputeStickFromKeys();
}

function onKeyUp(event) {
  const dir = STICK_KEY_CODES[event.code];
  if (!dir) return;
  heldStickKeys.delete(dir);
  recomputeStickFromKeys();
}

function recomputeStickFromKeys() {
  let x = 0;
  let y = 0;
  if (heldStickKeys.has('left')) x -= 1;
  if (heldStickKeys.has('right')) x += 1;
  if (heldStickKeys.has('up')) y -= 1;
  if (heldStickKeys.has('down')) y += 1;
  // Normalize the diagonal so keyboard moves at the same speed as full-tilt.
  const mag = Math.hypot(x, y);
  if (mag > 1) {
    x /= mag;
    y /= mag;
  }
  // Only override the live gamepad axis when keys are actually held; once
  // released, fall back to whatever the gamepad is reporting.
  if (heldStickKeys.size > 0) {
    stickX = x;
    stickY = y;
  } else {
    stickX = 0;
    stickY = 0;
  }
}

const LISTENERS = [
  [STICK_LEFT, onStickLeft],
  [FACE_BOTTOM, onFaceBottom],
  [FACE_RIGHT, onFaceRight],
  [FACE_LEFT, onFaceLeft],
  [FACE_TOP, onFaceTop],
  [LAYOUT_CHANGE, onLayoutChange],
  ['gamepad-availability', onAvailability],
];

const KEY_HANDLERS = [
  ['keydown', onKeyDown],
  ['keyup', onKeyUp],
];

function registerListeners() {
  LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));
  KEY_HANDLERS.forEach(([name, handler]) => window.addEventListener(name, handler));
  window.addEventListener('resize', resize);
}

// ---------------------------------------------------------------------------
// Teardown — cancel rAF and remove every listener this game added.
// ---------------------------------------------------------------------------

function cleanup() {
  stop();
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  KEY_HANDLERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  window.removeEventListener('resize', resize);
  window.removeEventListener('pagehide', cleanup);
  window.removeEventListener('beforeunload', cleanup);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  if (!canvas || !ctx) return; // fail soft: nothing to mount onto
  resize();
  // Center the cursor initially.
  cursor.x = viewW / 2;
  cursor.y = viewH / 2;
  buildDots();
  buildPrompt();
  syncBanner();
  renderStatus();
  registerListeners();
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);
  start();
}

boot();
