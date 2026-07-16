// games/wildlife-photographer/game.js — Canvas panoramic forest engine.
// requestAnimationFrame loop with update/draw split. The RIGHT thumbstick pans
// the camera across a wide world; a center reticle glows when it sits over a
// static animal; the RIGHT TRIGGER (>= threshold) OR RIGHT BUMPER snaps a
// photo into a DOM scrapbook. No fail state, no limit.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { createFaceGlyph, setGlyphLayout, setGlyphActive } from '../../shared/glyph.js';
import { clamp, playTone, resumeAudio } from '../../shared/utils.js';
import {
  STICK_RIGHT,
  TRIGGER_RIGHT,
  BUMPER_RIGHT,
  LAYOUT_CHANGE,
  AVAILABILITY,
  triggerLabel,
  shoulderLabel,
} from '../../shared/button-mapping.js';
import {
  panCamera,
  isInReticle,
  addPhoto,
  DEFAULT_PAN_SPEED,
  DEFAULT_RETICLE_RADIUS,
} from './camera-logic.js';

// ---------------------------------------------------------------------------
// Constants — world + camera tuning (CSS px / seconds)
// ---------------------------------------------------------------------------

// World is WIDER than the viewport so panning has somewhere to go. Height is
// also larger than the viewport for vertical pan headroom.
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 900;

// Pan tuning. The pure module scales movement by stick * panSpeed * dt; we feed
// it the live axis each frame.
const PAN_SPEED = DEFAULT_PAN_SPEED;
// dt clamp so a backgrounded tab doesn't tunnel the camera across the world.
const DT_CLAMP = 1 / 30;

// Right-trigger threshold above which a snap registers.
const SNAP_TRIGGER_THRESHOLD = 0.5;
// Cooldown (ms) so one press = one photo (debounce the analog trigger stream
// and the discrete bumper alike).
const SNAP_COOLDOWN_MS = 220;

// Reticle visual + hit radius.
const RETICLE_RADIUS = DEFAULT_RETICLE_RADIUS;

// Keyboard fallback for the RIGHT stick. The manager's KEY_TO_EVENT does not
// emit stick events from keys, so we synthesize the axis from held keys.
// Use IJKL to mirror the right-stick position (right of WASD).
const STICK_KEY_CODES = Object.freeze({
  KeyJ: 'left',
  KeyL: 'right',
  KeyI: 'up',
  KeyK: 'down',
});

// Animals to populate the panorama. Static world coords + emoji + name.
// `id` is the dedupe key so each animal appears in the scrapbook once.
const ANIMAL_DEFS = Object.freeze([
  { id: 'fox', emoji: '🦊', name: 'Fox', x: 240, y: 640 },
  { id: 'deer', emoji: '🦌', name: 'Deer', x: 560, y: 600 },
  { id: 'owl', emoji: '🦉', name: 'Owl', x: 880, y: 360 },
  { id: 'rabbit', emoji: '🐰', name: 'Rabbit', x: 1180, y: 700 },
  { id: 'bear', emoji: '🐻', name: 'Bear', x: 1480, y: 660 },
  { id: 'bird', emoji: '🐦', name: 'Bird', x: 1780, y: 320 },
  { id: 'hedgehog', emoji: '🦔', name: 'Hedgehog', x: 2050, y: 740 },
  { id: 'butterfly', emoji: '🦋', name: 'Butterfly', x: 700, y: 240 },
  { id: 'squirrel', emoji: '🐿️', name: 'Squirrel', x: 1300, y: 420 },
]);

// Visual palette (Canvas fill styles — inline style exception per rules).
const COLOR_SKY_TOP = '#9ed0f0';
const COLOR_SKY_BOTTOM = '#d8efe0';
const COLOR_HILLS_FAR = '#7fb389';
const COLOR_HILLS_NEAR = '#4f9a6b';
const COLOR_TRUNK = '#6b4a2a';
const COLOR_LEAVES = '#2f7a48';
const COLOR_GROUND = '#3c7a4f';
const COLOR_RETICLE = '#ff3b3b';
const COLOR_RETICLE_GLOW = 'rgba(255, 59, 59, 0.35)';
const COLOR_RETICLE_HIT = '#ffd23f';
const COLOR_RETICLE_HIT_GLOW = 'rgba(255, 210, 63, 0.55)';
const COLOR_VIGNETTE = 'rgba(8, 20, 18, 0.18)';

// Audio: shutter on snap + a higher confirm blip when a NEW animal is captured.
const SHUTTER_FREQ = 1320;
const SHUTTER_DURATION = 0.06;
const SHUTTER_GAIN = 0.18;
const NEW_PHOTO_FREQ = 880;
const NEW_PHOTO_DURATION = 0.14;
const NEW_PHOTO_GAIN = 0.2;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.getElementById('photo-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');
const triggerLabelEl = document.getElementById('trigger-label');
const bumperLabelEl = document.getElementById('bumper-label');
const scrapbookListEl = document.getElementById('scrapbook-list');
const scrapbookCountEl = document.getElementById('scrapbook-count');
const promptHost = document.getElementById('prompt-glyph');
const promptLabel = document.getElementById('prompt-label');

// ---------------------------------------------------------------------------
// State (separate from drawing)
// ---------------------------------------------------------------------------

// Backing-resolution pixels per CSS pixel (set in resize()).
let dpr = 1;
// CSS-pixel size of the canvas drawing surface (the viewport into the world).
let viewW = 0;
let viewH = 0;

// Camera offset = world-coord of the viewport's top-left corner.
const offset = { x: 0, y: 0 };

// Snapshot of animals in WORLD space. Static (they never move).
const animals = ANIMAL_DEFS.map((a) => ({ ...a, captured: false }));

// The animal currently under the reticle (recomputed each frame), or null.
let aimedAnimal = null;

// Live right-stick axis (from gamepad-stick-right) OR synthesized from keys.
let stickX = 0;
let stickY = 0;
const heldStickKeys = new Set();

// Scrapbook state (array of animal snapshots). Drives the DOM aside.
let scrapbook = [];

// Debounce: the timestamp (ms) after which a new snap is allowed.
let nextSnapAt = 0;

// rAF handle for teardown.
let rafId = null;
// Last timestamp (ms) for dt computation; null until first frame.
let lastTs = null;

// One persistent glyph reused across frames (not strictly needed — we render
// a textual layout-correct label instead — but kept consistent with siblings).
let glyphNode = null;

// ---------------------------------------------------------------------------
// Bounds — the camera can pan so the viewport never leaves the world.
// Derived from WORLD_* and the current viewport size.
// ---------------------------------------------------------------------------

function currentBounds() {
  // The camera offset's max is world-size minus viewport-size, so the viewport
  // stops flush with the world edge. If the viewport is larger than the world
  // (small window), max < min → we clamp to the world origin instead.
  const maxX = Math.max(0, WORLD_WIDTH - viewW);
  const maxY = Math.max(0, WORLD_HEIGHT - viewH);
  return { minX: 0, maxX, minY: 0, maxY };
}

// ---------------------------------------------------------------------------
// Canvas sizing — DPR-aware backing store; zero-size guard.
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

  // Re-clamp the camera into the new bounds so the world edge never shows
  // empty space beyond the panorama.
  const b = currentBounds();
  offset.x = clamp(offset.x, b.minX, b.maxX);
  offset.y = clamp(offset.y, b.minY, b.maxY);
}

// ---------------------------------------------------------------------------
// Glyph prompt — built once, layout-correct. For this game the prompt is
// informational ("snap"), not a per-target face button; we keep the glyph in
// the markup slot for consistency but render text labels for trigger/bumper.
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

// ---------------------------------------------------------------------------
// Scrapbook DOM — render the captured animals as an emoji thumbnail strip.
// ---------------------------------------------------------------------------

function renderScrapbook() {
  if (!scrapbookListEl) return;
  // Build the list from the scrapbook array. Captured animals show their emoji;
  // uncaptured animals render as a faint silhouette placeholder so the strip
  // is a goal-list, not an empty void.
  const items = ANIMAL_DEFS.map((def) => {
    const captured = scrapbook.some((s) => s.id === def.id);
    const cls = captured
      ? 'scrapbook__thumb is-captured'
      : 'scrapbook__thumb';
    const face = captured ? def.emoji : '❔';
    const label = captured ? def.name : '???';
    return `<li class="${cls}" title="${label}"><span class="scrapbook__emoji">${face}</span></li>`;
  });
  scrapbookListEl.innerHTML = items.join('');
  if (scrapbookCountEl) {
    scrapbookCountEl.textContent = String(scrapbook.length);
  }
}

// ---------------------------------------------------------------------------
// Snap — add the currently-aimed animal to the scrapbook (debounced, no penalty).
// ---------------------------------------------------------------------------

function trySnap() {
  const now = performance.now();
  if (now < nextSnapAt) return; // debounce: one press = one photo
  nextSnapAt = now + SNAP_COOLDOWN_MS;

  // Shutter fires regardless (encouraging feedback even on empty sky).
  playTone({
    freq: SHUTTER_FREQ,
    duration: SHUTTER_DURATION,
    type: 'square',
    gain: SHUTTER_GAIN,
  });

  // No animal under the reticle → no-op (zero-stress: no penalty, no message).
  if (!aimedAnimal) return;

  const before = scrapbook.length;
  scrapbook = addPhoto(scrapbook, aimedAnimal, { dedupeKey: 'id' });
  if (scrapbook.length > before) {
    // Brand-new capture → confirm blip + mark the animal.
    aimedAnimal.captured = true;
    playTone({
      freq: NEW_PHOTO_FREQ,
      duration: NEW_PHOTO_DURATION,
      type: 'triangle',
      gain: NEW_PHOTO_GAIN,
    });
  }
  renderScrapbook();
}

// ---------------------------------------------------------------------------
// Banner + layout-correct labels (RT / R2 / ZR and RB / R1 / R)
// ---------------------------------------------------------------------------

function syncBanner() {
  if (!bannerEl || !bannerText) return;
  const connected = gamepadManager.isActive();
  bannerEl.classList.toggle('is-connected', connected);
  bannerText.textContent = connected
    ? `Controller connected — layout: ${gamepadManager.getLayout()}`
    : 'No controller — use IJKL to aim, Space / E to snap.';
}

function updateLabels() {
  const layout = gamepadManager.getLayout();
  if (triggerLabelEl) {
    triggerLabelEl.textContent = triggerLabel(layout, 'right');
  }
  if (bumperLabelEl) {
    bumperLabelEl.textContent = shoulderLabel(layout, 'right');
  }
}

// ---------------------------------------------------------------------------
// Update / Draw
// ---------------------------------------------------------------------------

function update(dt) {
  // Pan the camera via the pure module. Clamp dt so a stalled tab can't fling.
  const b = currentBounds();
  const next = panCamera(
    { x: stickX, y: stickY },
    offset,
    b,
    { panSpeed: PAN_SPEED, dt },
  );
  offset.x = next.x;
  offset.y = next.y;

  // Recompute the aimed animal: first (by definition order) animal currently
  // under the center reticle. isInReticle handles the screen-space conversion.
  aimedAnimal = null;
  for (let i = 0; i < animals.length; i += 1) {
    const a = animals[i];
    const onScreen =
      a.x - offset.x > -RETICLE_RADIUS &&
      a.x - offset.x < viewW + RETICLE_RADIUS &&
      a.y - offset.y > -RETICLE_RADIUS &&
      a.y - offset.y < viewH + RETICLE_RADIUS;
    if (!onScreen) continue;
    if (isInReticle(a, offset, RETICLE_RADIUS, { w: viewW, h: viewH })) {
      aimedAnimal = a;
      break;
    }
  }

  // Sync the on-screen prompt text.
  if (promptLabel) {
    promptLabel.textContent = aimedAnimal
      ? `Aimed at: ${aimedAnimal.name} — snap it!`
      : 'Pan the right stick to find animals…';
  }
}

function drawSky() {
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, COLOR_SKY_TOP);
  g.addColorStop(1, COLOR_SKY_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
}

// World-space helpers convert to screen by subtracting the camera offset.
function worldToScreenX(wx) {
  return wx - offset.x;
}
function worldToScreenY(wy) {
  return wy - offset.y;
}

function drawHills() {
  if (!ctx) return;
  // Far rolling hills (parallax-lite: anchored in world space).
  ctx.fillStyle = COLOR_HILLS_FAR;
  ctx.beginPath();
  const farY = 480;
  ctx.moveTo(worldToScreenX(0), worldToScreenY(farY));
  // A handful of arcs across the world width.
  const step = 240;
  for (let wx = 0; wx <= WORLD_WIDTH; wx += step) {
    ctx.quadraticCurveTo(
      worldToScreenX(wx + step / 2),
      worldToScreenY(farY - 60),
      worldToScreenX(wx + step),
      worldToScreenY(farY),
    );
  }
  ctx.lineTo(worldToScreenX(WORLD_WIDTH), worldToScreenY(WORLD_HEIGHT));
  ctx.lineTo(worldToScreenX(0), worldToScreenY(WORLD_HEIGHT));
  ctx.closePath();
  ctx.fill();

  // Near hills, lower and darker.
  ctx.fillStyle = COLOR_HILLS_NEAR;
  ctx.beginPath();
  const nearY = 620;
  ctx.moveTo(worldToScreenX(0), worldToScreenY(nearY));
  for (let wx = 0; wx <= WORLD_WIDTH; wx += step) {
    ctx.quadraticCurveTo(
      worldToScreenX(wx + step / 2),
      worldToScreenY(nearY - 50),
      worldToScreenX(wx + step),
      worldToScreenY(nearY),
    );
  }
  ctx.lineTo(worldToScreenX(WORLD_WIDTH), worldToScreenY(WORLD_HEIGHT));
  ctx.lineTo(worldToScreenX(0), worldToScreenY(WORLD_HEIGHT));
  ctx.closePath();
  ctx.fill();
}

function drawGround() {
  if (!ctx) return;
  ctx.fillStyle = COLOR_GROUND;
  ctx.fillRect(
    worldToScreenX(0),
    worldToScreenY(760),
    WORLD_WIDTH,
    WORLD_HEIGHT - 760,
  );
}

// A deterministic tree at world (wx, wy). Drawn as a brown trunk + green canopy.
function drawTree(wx, wy) {
  if (!ctx) return;
  const sx = worldToScreenX(wx);
  const sy = worldToScreenY(wy);
  // Cull off-screen trees.
  if (sx < -80 || sx > viewW + 80) return;
  ctx.fillStyle = COLOR_TRUNK;
  ctx.fillRect(sx - 8, sy, 16, 60);
  ctx.fillStyle = COLOR_LEAVES;
  ctx.beginPath();
  ctx.arc(sx, sy - 10, 38, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrees() {
  // A sprinkling of trees across the world at fixed positions (no per-frame RNG).
  const trees = [
    [120, 760], [400, 770], [720, 760], [1040, 770], [1360, 760],
    [1620, 770], [1900, 760], [2200, 770], [260, 740], [940, 740],
    [1240, 740], [1580, 740], [1860, 740], [2140, 740],
  ];
  for (const [wx, wy] of trees) drawTree(wx, wy);
}

function drawAnimal(a) {
  if (!ctx) return;
  const sx = worldToScreenX(a.x);
  const sy = worldToScreenY(a.y);
  // Cull animals off-screen.
  if (sx < -40 || sx > viewW + 40) return;
  if (sy < -40 || sy > viewH + 40) return;

  const isAimed = a === aimedAnimal;

  // Glow when the reticle is on this animal.
  if (isAimed) {
    ctx.beginPath();
    ctx.arc(sx, sy, RETICLE_RADIUS * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_RETICLE_HIT_GLOW;
    ctx.fill();
  }

  ctx.font = '40px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(a.emoji, sx, sy);

  // Name label under aimed animal.
  if (isAimed) {
    ctx.font = '600 14px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(a.name, sx, sy + 36);
  }
}

function drawReticle() {
  if (!ctx) return;
  // Reticle sits at the viewport center.
  const cx = viewW / 2;
  const cy = viewH / 2;
  const hit = !!aimedAnimal;

  // Outer glow.
  ctx.beginPath();
  ctx.arc(cx, cy, RETICLE_RADIUS * 1.4, 0, Math.PI * 2);
  ctx.fillStyle = hit ? COLOR_RETICLE_HIT_GLOW : COLOR_RETICLE_GLOW;
  ctx.fill();

  // Ring.
  ctx.lineWidth = 3;
  ctx.strokeStyle = hit ? COLOR_RETICLE_HIT : COLOR_RETICLE;
  ctx.beginPath();
  ctx.arc(cx, cy, RETICLE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair ticks.
  ctx.beginPath();
  ctx.moveTo(cx - RETICLE_RADIUS - 8, cy);
  ctx.lineTo(cx - RETICLE_RADIUS + 6, cy);
  ctx.moveTo(cx + RETICLE_RADIUS - 6, cy);
  ctx.lineTo(cx + RETICLE_RADIUS + 8, cy);
  ctx.moveTo(cx, cy - RETICLE_RADIUS - 8);
  ctx.lineTo(cx, cy - RETICLE_RADIUS + 6);
  ctx.moveTo(cx, cy + RETICLE_RADIUS - 6);
  ctx.lineTo(cx, cy + RETICLE_RADIUS + 8);
  ctx.stroke();
}

function drawVignette() {
  if (!ctx) return;
  // Subtle dark frame so the center reticle reads clearly.
  const g = ctx.createRadialGradient(
    viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.3,
    viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, COLOR_VIGNETTE);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
}

function draw() {
  if (!ctx) return;
  // Zero-size guard.
  if (viewW < 2 || viewH < 2) return;

  ctx.clearRect(0, 0, viewW, viewH);

  drawSky();
  drawHills();
  drawGround();
  drawTrees();

  // Animals above the trees, below the reticle.
  for (const a of animals) drawAnimal(a);

  drawVignette();
  drawReticle();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function loop(ts) {
  if (lastTs == null) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  if (dt > DT_CLAMP) dt = DT_CLAMP;
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

function onStickRight(event) {
  const detail = event.detail || {};
  stickX = Number(detail.x) || 0;
  stickY = Number(detail.y) || 0;
}

function onTriggerRight(event) {
  const detail = (event && event.detail) || {};
  const v = Number(detail.value) || 0;
  if (v >= SNAP_TRIGGER_THRESHOLD) trySnap();
}

function onBumperRight() {
  trySnap();
}

function onLayoutChange() {
  if (glyphNode) setGlyphLayout(glyphNode, gamepadManager.getLayout());
  updateLabels();
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
    // Fail soft: never surface audio errors to the child.
  }
}

// Keyboard fallback for the right stick: track held IJKL and synthesize an axis.
function onKeyDown(event) {
  const dir = STICK_KEY_CODES[event.code];
  if (dir) {
    event.preventDefault();
    heldStickKeys.add(dir);
    recomputeStickFromKeys();
    return;
  }
  // Space / KeyE also snap (they map to trigger-right / bumper-right via the
  // manager, but we also accept them here so a single key works either way).
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
  // Normalize the diagonal so keyboard matches full-tilt speed.
  const mag = Math.hypot(x, y);
  if (mag > 1) {
    x /= mag;
    y /= mag;
  }
  // Only override the live gamepad axis while keys are held; once released,
  // fall back to whatever the gamepad reports (or zero).
  if (heldStickKeys.size > 0) {
    stickX = x;
    stickY = y;
  } else {
    stickX = 0;
    stickY = 0;
  }
}

const LISTENERS = [
  [STICK_RIGHT, onStickRight],
  [TRIGGER_RIGHT, onTriggerRight],
  [BUMPER_RIGHT, onBumperRight],
  [LAYOUT_CHANGE, onLayoutChange],
  [AVAILABILITY, onAvailability],
];

const KEY_HANDLERS = [
  ['keydown', onKeyDown],
  ['keyup', onKeyUp],
];

function registerListeners() {
  LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));
  KEY_HANDLERS.forEach(([name, handler]) => window.addEventListener(name, handler));
  window.addEventListener('resize', resize);
  window.addEventListener('pointerdown', onFirstGesture, { once: true });
  window.addEventListener('keydown', onFirstGesture, { once: true });
}

// ---------------------------------------------------------------------------
// Teardown — cancel rAF and remove every listener this game added.
// ---------------------------------------------------------------------------

function cleanup() {
  stop();
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  KEY_HANDLERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  window.removeEventListener('resize', resize);
  window.removeEventListener('pointerdown', onFirstGesture);
  window.removeEventListener('keydown', onFirstGesture);
  window.removeEventListener('pagehide', cleanup);
  window.removeEventListener('beforeunload', cleanup);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  if (!canvas || !ctx) return; // fail soft: nothing to mount onto
  resize();
  // Start the camera looking at the left end of the panorama, vertically centered.
  const b = currentBounds();
  offset.x = b.minX;
  offset.y = clamp(WORLD_HEIGHT / 2 - viewH / 2, b.minY, b.maxY);
  buildPrompt();
  updateLabels();
  syncBanner();
  renderScrapbook();
  registerListeners();
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);
  start();
}

boot();
