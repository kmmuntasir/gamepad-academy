// games/claw-machine/game.js — Canvas engine for The Claw Machine.
// Teaches DISCRETE D-Pad grid navigation. The claw moves one cell per D-Pad
// press; the Bottom face button drops the claw to grab a prize.
//
// THUMBSTICKS ARE DELIBERATELY DISABLED: this game registers NO gamepad-stick-*
// listeners. Movement is rigid, one-square D-Pad stepping only.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { createFaceGlyph, setGlyphLayout } from '../../shared/glyph.js';
import { playTone, playBlip } from '../../shared/utils.js';
import {
  DPAD_UP,
  DPAD_DOWN,
  DPAD_LEFT,
  DPAD_RIGHT,
  FACE_BOTTOM,
  LAYOUT_CHANGE,
} from '../../shared/button-mapping.js';
import { moveClaw, grabAt, resetClaw } from './claw-logic.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Grid dimensions (in cells). Top row (y=0) is the claw's home rail and holds
// no prizes — prizes live in rows 1..rows-1.
const GRID_COLS = 5;
const GRID_ROWS = 4;
const GRID_BOUNDS = { cols: GRID_COLS, rows: GRID_ROWS };

// Internal backing resolution of the canvas (CSS scales it to fit).
// Chosen for crisp rendering at typical sizes on hi-DPI displays via DPR.
const CANVAS_CSS_WIDTH = 720;
const CANVAS_CSS_HEIGHT = 620;
const TOP_BAR_HEIGHT = 64; // rail where the claw trolley lives, above the grid
const TRAY_HEIGHT = 60; // collected-prizes tray strip below the grid

// Animation durations for the drop → grab → rise cycle, in milliseconds.
const DROP_MS = 420;
const RISE_MS = 420;
const CELEBRATE_MS = 500;

// Claw phases.
const PHASE_IDLE = 'idle'; // claw parked above its cell, ready to move/drop
const PHASE_DROPPING = 'dropping';
const PHASE_RISING = 'rising';
const PHASE_CELEBRATE = 'celebrate';

// Toy emojis used to populate the grid. Purely cosmetic.
const PRIZE_EMOJIS = ['🧸', '🚗', '🦄', '🎲', 'robot', '⭐', '🐙', '🎁'];

// Audio — soft mechanical blip on each move; happy chime on a successful grab.
const MOVE_FREQ = 220;
const MOVE_DURATION = 0.05;
const MOVE_GAIN = 0.05;
const EMPTY_TONE_FREQ = 160;
const GRAB_FREQ = 720;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.getElementById('claw-canvas');
const ctx = canvas.getContext('2d');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');
const promptHost = document.getElementById('prompt-glyph');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Claw logical cell position + animated pixel offset (for drop/lift).
let claw = {
  pos: resetClaw(GRID_BOUNDS),
  phase: PHASE_IDLE,
  // Timestamp the current phase began (ms), used to drive animations.
  phaseStart: 0,
  // Prize currently held in the claw (for the rise + drop-into-tray visual).
  held: null,
};

// Prizes currently on the grid (excluding the top rail y=0).
let prizes = [];

// Prizes collected into the tray (visual accumulation).
let collected = [];

// Layout cache for glyph rendering.
let glyphNode = null;

// Render loop handle for teardown.
let rafId = null;

// ---------------------------------------------------------------------------
// Canvas sizing — DPR-aware, zero-size guarded.
// ---------------------------------------------------------------------------

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const w = CANVAS_CSS_WIDTH;
  const h = CANVAS_CSS_HEIGHT;
  // Guard zero/negative sizes.
  if (w <= 0 || h <= 0) return;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------------------
// Grid geometry (pixel helpers)
// ---------------------------------------------------------------------------

function gridPixelBounds() {
  const w = CANVAS_CSS_WIDTH;
  const h = CANVAS_CSS_HEIGHT;
  const gridTop = TOP_BAR_HEIGHT;
  const gridBottom = h - TRAY_HEIGHT;
  const gridHeight = Math.max(1, gridBottom - gridTop);
  return {
    left: 0,
    top: gridTop,
    width: w,
    height: gridHeight,
    cellW: w / GRID_COLS,
    cellH: gridHeight / GRID_ROWS,
  };
}

function cellCenter(x, y) {
  const g = gridPixelBounds();
  return {
    cx: g.left + (x + 0.5) * g.cellW,
    cy: g.top + (y + 0.5) * g.cellH,
  };
}

// Claw trolley rides along the top rail. Its x follows the current column.
function trolleyX() {
  const { cx } = cellCenter(claw.pos.x, 0);
  return cx;
}

// Y of the claw's parked (raised) position — just below the top bar.
function railY() {
  return TOP_BAR_HEIGHT + 18;
}

// Y of the claw's fully-dropped position — at the center of the target row.
function dropTargetY() {
  // Drop to the row of the claw's current cell (so dropping on the top rail
  // barely moves it; dropping on a lower row plunges all the way down).
  const { cy } = cellCenter(claw.pos.x, claw.pos.y);
  return cy;
}

// Current animated claw Y based on phase + progress.
function clawY(now) {
  const start = railY();
  const end = dropTargetY();
  switch (claw.phase) {
    case PHASE_DROPPING: {
      const t = easeInOut(progress(now, DROP_MS));
      return start + (end - start) * t;
    }
    case PHASE_RISING: {
      const t = easeInOut(1 - progress(now, RISE_MS));
      return start + (end - start) * t;
    }
    case PHASE_CELEBRATE:
    case PHASE_IDLE:
    default:
      return start;
  }
}

// Claw "openness" — 0 closed, 1 open. Open while idle/dropping, closes to grab
// at the bottom of the drop, stays closed on the rise.
function clawOpenAmount(now) {
  switch (claw.phase) {
    case PHASE_DROPPING: {
      const t = progress(now, DROP_MS);
      // Open on the way down, snap shut at the very bottom.
      return t < 0.85 ? 1 : 0;
    }
    case PHASE_RISING:
      return claw.held ? 0 : 1;
    case PHASE_CELEBRATE:
      return 0;
    case PHASE_IDLE:
    default:
      return 1;
  }
}

function progress(now, duration) {
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - claw.phaseStart) / duration));
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---------------------------------------------------------------------------
// Prizes
// ---------------------------------------------------------------------------

function randomPrizeEmoji() {
  return PRIZE_EMOJIS[Math.floor(Math.random() * PRIZE_EMOJIS.length)];
}

// Populate any empty (non-top-rail) cells with a prize, leaving roughly
// PRIZE_FILL of the grid filled. Called once at boot and after each grab.
function refillPrizes() {
  const fillCount = Math.max(0, Math.floor((GRID_COLS * (GRID_ROWS - 1)) * 0.7));
  const occupied = new Set(prizes.map((p) => `${p.x},${p.y}`));
  const candidates = [];
  for (let y = 1; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) candidates.push({ x, y });
    }
  }
  // Shuffle (Fisher-Yates) for a scattered look.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  while (prizes.length < fillCount && candidates.length > 0) {
    const cell = candidates.pop();
    prizes.push({ x: cell.x, y: cell.y, emoji: randomPrizeEmoji() });
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function draw(now) {
  if (!ctx) return;
  const w = CANVAS_CSS_WIDTH;
  const h = CANVAS_CSS_HEIGHT;
  if (w <= 0 || h <= 0) return;

  // Background — cabinet interior.
  ctx.fillStyle = '#1e2640';
  ctx.fillRect(0, 0, w, h);

  drawGrid();
  drawPrizes(now);
  drawClaw(now);
  drawTray();
}

function drawGrid() {
  const g = gridPixelBounds();
  // Subtle cell grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = g.left + c * g.cellW;
    ctx.moveTo(x, g.top);
    ctx.lineTo(x, g.top + g.height);
  }
  for (let r = 0; r <= GRID_ROWS; r++) {
    const y = g.top + r * g.cellH;
    ctx.moveTo(g.left, y);
    ctx.lineTo(g.left + g.width, y);
  }
  ctx.stroke();

  // Highlight the cell the claw is currently over.
  const { cx, cy } = cellCenter(claw.pos.x, claw.pos.y);
  ctx.fillStyle = 'rgba(255,210,63,0.12)';
  ctx.fillRect(
    cx - g.cellW / 2,
    cy - g.cellH / 2,
    g.cellW,
    g.cellH,
  );

  // Top rail line.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, TOP_BAR_HEIGHT);
  ctx.lineTo(g.width, TOP_BAR_HEIGHT);
  ctx.stroke();
}

function drawPrizes(now) {
  const g = gridPixelBounds();
  const fontSize = Math.floor(Math.min(g.cellW, g.cellH) * 0.55);
  ctx.font = `${fontSize}px system-ui, "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const prize of prizes) {
    // Skip a prize being held in the claw (it draws with the claw).
    if (claw.held && claw.held === prize) continue;
    const { cx, cy } = cellCenter(prize.x, prize.y);
    drawEmoji(prize.emoji, cx, cy, fontSize);
  }
  // If the claw is holding a prize, draw it under the claw.
  if (claw.held) {
    const cy = clawY(now) + 26;
    drawEmoji(claw.held.emoji, trolleyX(), cy, fontSize);
  }
}

function drawEmoji(emoji, cx, cy, fontSize) {
  if (emoji === 'robot') {
    // SVG-style shape drawn directly: a friendly little robot head.
    drawRobotFace(cx, cy, fontSize);
    return;
  }
  ctx.fillText(emoji, cx, cy);
}

function drawRobotFace(cx, cy, size) {
  const s = size * 0.5;
  ctx.save();
  // Head.
  ctx.fillStyle = '#4ecdc4';
  ctx.strokeStyle = '#0f1424';
  ctx.lineWidth = 2;
  roundedRect(cx - s, cy - s * 0.8, s * 2, s * 1.6, 8);
  ctx.fill();
  ctx.stroke();
  // Eyes.
  ctx.fillStyle = '#0f1424';
  ctx.beginPath();
  ctx.arc(cx - s * 0.45, cy - s * 0.2, s * 0.18, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.45, cy - s * 0.2, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
  // Mouth.
  ctx.strokeStyle = '#0f1424';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy + s * 0.45);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.45);
  ctx.stroke();
  // Antenna.
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.8);
  ctx.lineTo(cx, cy - s * 1.2);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(cx, cy - s * 1.25, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawClaw(now) {
  const x = trolleyX();
  const y = clawY(now);
  const open = clawOpenAmount(now);

  // Trolley on the rail.
  ctx.fillStyle = '#aeb8d8';
  ctx.fillRect(x - 22, TOP_BAR_HEIGHT - 14, 44, 14);
  // Cable.
  ctx.strokeStyle = '#aeb8d8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, TOP_BAR_HEIGHT);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Claw head: a small housing + two prongs that open/close.
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();

  // Prongs.
  const spread = 6 + open * 14;
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 4);
  ctx.lineTo(x - spread, y + 22);
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + spread, y + 22);
  ctx.stroke();
}

function drawTray() {
  const w = CANVAS_CSS_WIDTH;
  const h = CANVAS_CSS_HEIGHT;
  const top = h - TRAY_HEIGHT;
  // Tray background.
  ctx.fillStyle = '#2a3457';
  ctx.fillRect(0, top, w, TRAY_HEIGHT);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(w, top);
  ctx.stroke();

  // Tray label + collected emojis.
  ctx.fillStyle = '#aeb8d8';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Collected: ${collected.length}`, 12, top + TRAY_HEIGHT / 2);

  // Render up to a handful of collected emojis to the right of the label.
  const fontSize = 28;
  ctx.font = `${fontSize}px system-ui, "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  const startX = 140;
  const slot = 34;
  const showCount = Math.min(collected.length, Math.floor((w - startX - 12) / slot));
  for (let i = 0; i < showCount; i++) {
    const emoji = collected[collected.length - showCount + i];
    drawEmoji(emoji, startX + i * slot + slot / 2, top + TRAY_HEIGHT / 2, fontSize);
  }
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

function handleMove(direction) {
  if (claw.phase !== PHASE_IDLE) return; // ignore moves mid-drop
  const next = moveClaw(claw.pos, direction, GRID_BOUNDS);
  if (next.x === claw.pos.x && next.y === claw.pos.y) return; // no change (edge)
  claw.pos = next;
  playTone({
    freq: MOVE_FREQ,
    duration: MOVE_DURATION,
    type: 'square',
    gain: MOVE_GAIN,
  });
}

function handleDrop() {
  if (claw.phase !== PHASE_IDLE) return;
  claw.phase = PHASE_DROPPING;
  claw.phaseStart = performance.now();
  claw.held = null;
}

// Drives phase transitions each frame.
function tick(now) {
  if (claw.phase === PHASE_DROPPING) {
    if (now - claw.phaseStart >= DROP_MS) {
      // Reached the bottom — try to grab.
      const prize = grabAt(claw.pos, prizes);
      if (prize) {
        claw.held = prize;
        prizes = prizes.filter((p) => p !== prize);
        // Happy chime.
        playBlip();
        playTone({ freq: GRAB_FREQ, duration: 0.16, type: 'triangle', gain: 0.18 });
      } else {
        // Empty drop — soft neutral tone, no penalty.
        playTone({ freq: EMPTY_TONE_FREQ, duration: 0.1, type: 'sine', gain: 0.08 });
      }
      claw.phase = PHASE_RISING;
      claw.phaseStart = now;
    }
  } else if (claw.phase === PHASE_RISING) {
    if (now - claw.phaseStart >= RISE_MS) {
      // Reached the top. If holding, deposit into the tray + celebrate.
      if (claw.held) {
        collected.push(claw.held.emoji);
        claw.held = null;
        claw.phase = PHASE_CELEBRATE;
        claw.phaseStart = now;
        // Top up the grid so the tray keeps filling (never runs out).
        refillPrizes();
      } else {
        claw.phase = PHASE_IDLE;
      }
    }
  } else if (claw.phase === PHASE_CELEBRATE) {
    if (now - claw.phaseStart >= CELEBRATE_MS) {
      claw.phase = PHASE_IDLE;
    }
  }
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function loop(now) {
  tick(now);
  draw(now);
  rafId = requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Glyph / prompt rendering
// ---------------------------------------------------------------------------

function buildGlyph() {
  if (!promptHost) return;
  const layout = gamepadManager.getLayout();
  const node = createFaceGlyph({ layout, position: 'bottom', active: true });
  promptHost.replaceChildren(node);
  glyphNode = node;
}

function syncGlyphLayout() {
  const layout = gamepadManager.getLayout();
  if (glyphNode) setGlyphLayout(glyphNode, layout);
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function syncBanner() {
  if (!bannerEl || !bannerText) return;
  const connected = gamepadManager.isActive();
  bannerEl.classList.toggle('is-connected', connected);
  bannerText.textContent = connected
    ? `Controller connected — layout: ${gamepadManager.getLayout()}`
    : 'No controller — use the keyboard (Arrows = D-Pad, S = Drop).';
}

// ---------------------------------------------------------------------------
// Event handlers (bound so they can be removed on unload)
// ---------------------------------------------------------------------------

function onDpadUp() { handleMove('up'); }
function onDpadDown() { handleMove('down'); }
function onDpadLeft() { handleMove('left'); }
function onDpadRight() { handleMove('right'); }
function onFaceBottom() { handleDrop(); }
function onLayoutChange() { syncGlyphLayout(); syncBanner(); }
function onAvailability() { syncBanner(); }

// NOTE: gamepad-stick-* events are intentionally NOT registered here —
// thumbsticks are disabled for this game by design.
const LISTENERS = [
  [DPAD_UP, onDpadUp],
  [DPAD_DOWN, onDpadDown],
  [DPAD_LEFT, onDpadLeft],
  [DPAD_RIGHT, onDpadRight],
  [FACE_BOTTOM, onFaceBottom],
  [LAYOUT_CHANGE, onLayoutChange],
  ['gamepad-availability', onAvailability],
];

LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

function cleanup() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

resizeCanvas();
refillPrizes();
buildGlyph();
syncBanner();
rafId = requestAnimationFrame(loop);
