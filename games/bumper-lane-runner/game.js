// games/bumper-lane-runner/game.js — Canvas engine for Bumper Lane Runner.
// Top-down auto-runner on a 3-lane track. Left bumper hops one lane left,
// right bumper hops one lane right. Coins collect on overlap; static obstacles
// bounce the player back a lane via resolveObstacleHit (never stops, never a
// fail state). rAF loop with update/draw split; DPR-aware canvas; listeners +
// rAF cancelled on pagehide/beforeunload.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import {
  BUMPER_LEFT,
  BUMPER_RIGHT,
  LAYOUT_CHANGE,
} from '../../shared/button-mapping.js';
import { shoulderLabel } from '../../shared/button-mapping.js';
import {
  clamp,
  lerp,
  randomInt,
  playTone,
  playBlip,
} from '../../shared/utils.js';
import { nextLane, resolveObstacleHit, tryCollectCoin } from './lane-logic.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANE_COUNT = 3;
const BASE_LANE_COUNT = 3; // used to validate clamping helpers stay in sync

// World scroll speed (px / second). Gentle for a 7-year-old.
const SCROLL_SPEED = 150;
// Player lane-change animation duration (seconds). Snappy but visible.
const LANE_CHANGE_DURATION = 0.12;
// How far above the bottom the player sprite sits (fraction of canvas height).
const PLAYER_Y_FRACTION = 0.82;
// Player visual radius (px in CSS space).
const PLAYER_R = 22;

// Spawning. Obstacles and coins arrive from the top, in a random lane.
const SPAWN_INTERVAL_MS = 900;
// Distance (px) between the top spawn line and the player's y when checking
// for collisions — actual overlap is pixel-based via the pure helper.
const OBSTACLE_HALF = 30; // half the obstacle block size
const COIN_R = 12; // coin visual radius (also its collision radius)

// Audio: coin = bright blip; obstacle bump = soft low tone (never punitive).
const BUMP_FREQ = 150;
const BUMP_DURATION = 0.12;
const BUMP_GAIN = 0.12;

// Lane stripe colors.
const LANE_COLORS = ['#233056', '#2a3a66', '#233056'];
const LANE_DIVIDER = 'rgba(255,255,255,0.08)';
const PLAYER_COLOR = '#ffd23f';
const PLAYER_STROKE = '#1a1200';
const COIN_COLOR = '#ffd23f';
const COIN_STROKE = '#ff9f1c';
const OBSTACLE_COLOR = '#ff6b6b';
const OBSTACLE_STROKE = '#7a2d2d';

// Soft cap on simultaneous obstacles/coins so a runaway frame never piles up.
const MAX_ENTITIES = 24;

// ---------------------------------------------------------------------------
// DOM + Canvas
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const scoreEl = document.getElementById('score');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');
const chipLeftEl = document.getElementById('chip-left');
const chipRightEl = document.getElementById('chip-right');

const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

// Backing store size (CSS pixels × DPR). Recomputed on resize.
let viewW = 0;
let viewH = 0;

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  // Guard against zero-size (display:none / hidden tab) before drawing.
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  viewW = cssW;
  viewH = cssH;
  // Reset then scale so all drawing happens in CSS pixels.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

if (canvas) {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Player lane (logical) + animated x fraction for smooth hops.
let playerLane = Math.floor(LANE_COUNT / 2);
// `from`/`to` lane fractions + progress drive the lane-change animation.
let laneFrom = laneFraction(playerLane);
let laneTo = laneFrom;
let laneProgress = 1; // 1 = settled at laneTo
let bumpFlash = 0; // seconds remaining of the playful squash on bump

// Entities (obstacles + coins) scroll downward; `y` is their CSS-pixel y.
// Each obstacle/coin carries its `lane` (logical) so the pure resolver can use it.
const obstacles = [];
const coins = [];

let coinsCollected = 0;
let spawnAccumulator = 0;
let lastTimestamp = 0;
let rafId = null;
let stopped = false;

// ---------------------------------------------------------------------------
// Lane geometry helpers (CSS-pixel space)
// ---------------------------------------------------------------------------

/** Logical lane index → center x fraction (0..1) of that lane. */
function laneFraction(lane) {
  const idx = clamp(lane, 0, LANE_COUNT - 1);
  return (idx + 0.5) / LANE_COUNT;
}

/** Current animated center x (px) of the player. */
function playerX() {
  const t = laneProgress >= 1 ? 1 : laneProgress;
  // Ease the hop a little (easeInOut-ish) so it feels playful, not linear.
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const frac = lerp(laneFrom, laneTo, eased);
  return frac * viewW;
}

/** Current center y (px) of the player. */
function playerY() {
  return viewH * PLAYER_Y_FRACTION;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function maybeSpawn(dtMs) {
  spawnAccumulator += dtMs;
  if (spawnAccumulator < SPAWN_INTERVAL_MS) return;
  spawnAccumulator = 0;

  // Keep the entity list bounded (oldest recycled, never a penalty).
  if (obstacles.length + coins.length >= MAX_ENTITIES) return;

  // 50/50 obstacle or coin; pick a random lane. Occasionally leave a lane open
  // so the player always has a path — never a guaranteed trap.
  const lane = randomInt(0, LANE_COUNT - 1);
  if (Math.random() < 0.5) {
    obstacles.push({ lane, x: 0, y: -OBSTACLE_HALF * 2, collected: false });
  } else {
    coins.push({ lane, x: 0, y: -COIN_R * 2, collected: false, r: COIN_R });
  }
}

function syncEntityX(list) {
  for (const e of list) {
    e.x = laneFraction(e.lane) * viewW;
  }
}

// ---------------------------------------------------------------------------
// Update (pure-ish: mutates state, no drawing)
// ---------------------------------------------------------------------------

function update(dt) {
  if (viewW <= 0 || viewH <= 0) return;

  // Advance the lane-change animation.
  if (laneProgress < 1) {
    laneProgress += dt / LANE_CHANGE_DURATION;
    if (laneProgress >= 1) {
      laneProgress = 1;
      laneFrom = laneTo;
    }
  }

  if (bumpFlash > 0) bumpFlash = Math.max(0, bumpFlash - dt);

  maybeSpawn(dt * 1000);

  const px = playerX();
  const py = playerY();

  // Advance obstacles + resolve bounces. Per spec: a frame that has both a
  // bumper press and a collision resolves the lane first (handled at press
  // time), then collision. The bounce here only fires if the player still
  // occupies the obstacle's lane after any hop animation has settled.
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.y += SCROLL_SPEED * dt;
    if (o.collected) continue;

    // Only check overlap when the obstacle is near the player's y band.
    const dy = Math.abs(o.y - py);
    if (dy > OBSTACLE_HALF + PLAYER_R) continue;

    const dx = Math.abs(o.x - px);
    if (dx > OBSTACLE_HALF + PLAYER_R) continue;

    // Bounce — only when the player is settled into a lane the obstacle
    // occupies. While mid-hop, we let them pass through so the animation
    // never feels like a sticky trap.
    if (laneProgress >= 1 && playerLane === o.lane) {
      const newLane = resolveObstacleHit(playerLane, o, LANE_COUNT);
      if (newLane !== playerLane) {
        startHopTo(newLane);
        bumpFlash = 0.18;
        playTone({
          freq: BUMP_FREQ,
          duration: BUMP_DURATION,
          type: 'sine',
          gain: BUMP_GAIN,
        });
        o.collected = true; // consume the obstacle so it doesn't re-bump
      }
    }
  }

  // Advance coins + collect.
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.y += SCROLL_SPEED * dt;
    if (c.collected) continue;

    const hit = tryCollectCoin({ x: px, y: py, r: PLAYER_R }, c);
    if (hit) {
      c.collected = true;
      coinsCollected += 1;
      renderScore();
      playBlip();
    }
  }

  // Recycle off-screen + consumed entities (keep arrays small, per-frame cheap).
  const recycleBelow = viewH + 64;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    if (obstacles[i].y > recycleBelow || obstacles[i].collected) obstacles.splice(i, 1);
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    if (coins[i].y > recycleBelow || coins[i].collected) coins.splice(i, 1);
  }
}

function startHopTo(newLane) {
  // Begin the next hop from wherever the player currently is (smooth chains).
  laneFrom = playerX() / viewW;
  playerLane = clamp(newLane, 0, LANE_COUNT - 1);
  laneTo = laneFraction(playerLane);
  laneProgress = 0;
}

// ---------------------------------------------------------------------------
// Draw (read-only; never mutates state)
// ---------------------------------------------------------------------------

function drawLanes() {
  const laneW = viewW / LANE_COUNT;
  for (let i = 0; i < LANE_COUNT; i += 1) {
    ctx.fillStyle = LANE_COLORS[i % LANE_COLORS.length];
    ctx.fillRect(i * laneW, 0, laneW, viewH);
  }
  ctx.strokeStyle = LANE_DIVIDER;
  ctx.lineWidth = 2;
  for (let i = 1; i < LANE_COUNT; i += 1) {
    const x = i * laneW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, viewH);
    ctx.stroke();
  }
}

function drawObstacle(o) {
  // Soft, rounded block. Never reads as "spikes" — playful, not punitive.
  const size = OBSTACLE_HALF * 2;
  const r = 10;
  ctx.save();
  ctx.fillStyle = OBSTACLE_COLOR;
  ctx.strokeStyle = OBSTACLE_STROKE;
  ctx.lineWidth = 3;
  roundRect(ctx, o.x - OBSTACLE_HALF, o.y - OBSTACLE_HALF, size, size, r);
  ctx.fill();
  ctx.stroke();
  // Friendly eyes so it reads as a "soft block", not a hazard.
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(o.x - 9, o.y - 4, 4, 0, Math.PI * 2);
  ctx.arc(o.x + 9, o.y - 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = OBSTACLE_STROKE;
  ctx.beginPath();
  ctx.arc(o.x - 9, o.y - 3, 1.6, 0, Math.PI * 2);
  ctx.arc(o.x + 9, o.y - 3, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCoin(c) {
  ctx.save();
  ctx.fillStyle = COIN_COLOR;
  ctx.strokeStyle = COIN_STROKE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c.x, c.y, COIN_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Inner glint.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(c.x - 3, c.y - 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const px = playerX();
  const py = playerY();
  // Playful squash on bump: stretch horizontally while bumpFlash > 0.
  const squash = bumpFlash > 0 ? 1 + 0.18 * (bumpFlash / 0.18) : 1;
  const stretch = bumpFlash > 0 ? 1 - 0.10 * (bumpFlash / 0.18) : 1;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(squash, stretch);
  ctx.fillStyle = PLAYER_COLOR;
  ctx.strokeStyle = PLAYER_STROKE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Two friendly eyes so the runner reads as a character.
  ctx.fillStyle = PLAYER_STROKE;
  ctx.beginPath();
  ctx.arc(-7, -4, 3, 0, Math.PI * 2);
  ctx.arc(7, -4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  if (!ctx || viewW <= 0 || viewH <= 0) return;
  ctx.clearRect(0, 0, viewW, viewH);
  drawLanes();
  // Sync entity x to current view width before drawing (resize-safe).
  syncEntityX(obstacles);
  syncEntityX(coins);
  obstacles.forEach(drawObstacle);
  coins.forEach(drawCoin);
  drawPlayer();
}

/** Rounded-rect path helper (no fill/stroke; caller decides). */
function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// ---------------------------------------------------------------------------
// Main loop (rAF; dt in seconds, clamped to avoid tunneling on lag spikes)
// ---------------------------------------------------------------------------

function loop(timestamp) {
  if (stopped) return;
  if (lastTimestamp === 0) lastTimestamp = timestamp;
  // Clamp dt so a tab-throttle/lag spike doesn't tunnel entities through the
  // player. 1/30s max step keeps movement sane.
  const dt = Math.min(1 / 30, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  update(dt);
  draw();

  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (rafId != null || stopped) return;
  lastTimestamp = 0;
  rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ---------------------------------------------------------------------------
// UI: score + banner + shoulder chips (layout-correct, never hardcoded labels)
// ---------------------------------------------------------------------------

function renderScore() {
  if (scoreEl) scoreEl.textContent = `Coins: ${coinsCollected}`;
}

function syncBanner() {
  if (!bannerEl || !bannerText) return;
  const connected = gamepadManager.isActive();
  bannerEl.classList.toggle('is-connected', connected);
  bannerText.textContent = connected
    ? `Controller connected — layout: ${gamepadManager.getLayout()}`
    : 'No controller — use the keyboard (Q = left bumper, E = right bumper).';
}

function renderChips() {
  const layout = gamepadManager.getLayout();
  const left = shoulderLabel(layout, 'left');
  const right = shoulderLabel(layout, 'right');
  if (chipLeftEl) chipLeftEl.textContent = left;
  if (chipRightEl) chipRightEl.textContent = right;
}

// ---------------------------------------------------------------------------
// Event handlers (bound so they can be removed on unload)
// ---------------------------------------------------------------------------

function hop(direction) {
  // Per spec: lane resolves first, then collision in a later update step.
  const target = nextLane(playerLane, direction, LANE_COUNT);
  startHopTo(target);
}

function onBumperLeft() { hop('left'); }
function onBumperRight() { hop('right'); }

function onLayoutChange() {
  renderChips();
  syncBanner();
}

function onAvailability() {
  syncBanner();
}

const LISTENERS = [
  [BUMPER_LEFT, onBumperLeft],
  [BUMPER_RIGHT, onBumperRight],
  [LAYOUT_CHANGE, onLayoutChange],
  ['gamepad-availability', onAvailability],
];

LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));

// ---------------------------------------------------------------------------
// Teardown — remove listeners, cancel rAF. Idempotent.
// ---------------------------------------------------------------------------

function cleanup() {
  if (stopped) return;
  stopped = true;
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  window.removeEventListener('resize', resizeCanvas);
  stopLoop();
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// `BASE_LANE_COUNT` documents the clamping contract shared with lane-logic.js.
void BASE_LANE_COUNT;

renderScore();
renderChips();
syncBanner();
// Place the player's first frame on the freshly sized canvas.
syncEntityX(obstacles);
syncEntityX(coins);
startLoop();
