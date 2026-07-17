// games/animal-spawner/game.js — DOM sandbox engine for Animal Spawner.
// Event-driven (no rAF loop): spawns animals on face-button presses and
// cycles the play-area background on D-Pad presses. Zero fail states.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { mountGameShell } from '../../shared/game-shell.js';
import { createFaceGlyph, setGlyphLayout } from '../../shared/glyph.js';
import { playTone } from '../../shared/utils.js';
import {
  FACE_BOTTOM,
  FACE_RIGHT,
  FACE_LEFT,
  FACE_TOP,
  DPAD_UP,
  DPAD_DOWN,
  DPAD_LEFT,
  DPAD_RIGHT,
  LAYOUT_CHANGE,
} from '../../shared/button-mapping.js';
import { animalForPosition, nextBackgroundColor } from './spawn-logic.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Child-friendly background palette cycled by the D-Pad.
const BACKGROUND_PALETTE = [
  '#4ecdc4', // teal
  '#ffd23f', // warm yellow
  '#7bed9f', // soft green
  '#ff9ff3', // pink
  '#a29bfe', // lavender
  '#ffa502', // orange
];

// One blip pitch per animal position (4 distinct, pleasant pitches in Hz).
const PITCH_BY_POSITION = {
  bottom: 523.25, // C5 — Cat
  right: 659.25, // E5 — Dog
  left: 783.99, // G5 — Bird
  top: 1046.5, // C6 — Frog
};

const BLIP_DURATION = 0.09;
const BLIP_GAIN = 0.2;

// Soft cap on simultaneous emoji to avoid runaway DOM. Oldest is recycled
// (never a penalty — just keeps the page light under heavy mashing).
const MAX_EMOJI = 60;
// Emoji live this long before they begin to fade and are removed.
const EMOJI_LIFETIME_MS = 6000;

// Face-button positions this game spawns for.
const SPAWN_POSITIONS = ['bottom', 'right', 'left', 'top'];

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const playArea = document.getElementById('play-area');
const promptHost = document.getElementById('prompt-glyph');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');

if (!playArea || !promptHost) {
  // Fail soft: nothing to mount onto. Don't throw to the child.
}

// ---------------------------------------------------------------------------
// Game shell — retro theme, persistent controller overlay, Start-button pause
// menu (Resume/Restart/Home/Settings), settings panel, and gamepad banner.
// This game is fully event-driven (no rAF loop), so gameplay handlers below
// guard on isPaused() to block spawning while the menu is open.
// ---------------------------------------------------------------------------

const gameShell = mountGameShell({
  bannerEl,
  bannerTextEl: bannerText,
  homeUrl: '../../index.html',
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let backgroundIndex = 0;
let emojiCount = 0;

// ---------------------------------------------------------------------------
// Glyph prompt — renders the bottom face button for the current layout,
// re-labeling on layout change. Shows all four pads; only 'bottom' is active
// as the "primary" prompt, but every face button spawns something.
// ---------------------------------------------------------------------------

function buildPrompt() {
  if (!promptHost) return null;
  promptHost.replaceChildren(
    createFaceGlyph({
      layout: gamepadManager.getLayout(),
      position: 'bottom',
      active: true,
    }),
  );
  return promptHost.querySelector('.face-glyph');
}

let glyphNode = buildPrompt();

// ---------------------------------------------------------------------------
// Background color
// ---------------------------------------------------------------------------

function applyBackground() {
  if (!playArea) return;
  playArea.style.backgroundColor = BACKGROUND_PALETTE[backgroundIndex];
}

applyBackground();

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function recycleOldest() {
  if (!playArea) return;
  const oldest = playArea.querySelector('.spawned');
  if (oldest) {
    oldest.remove();
    emojiCount -= 1;
  }
}

function spawnAnimal(position) {
  if (!playArea) return;
  const animal = animalForPosition(position);
  if (!animal) return;

  // Cap concurrent emoji by recycling the oldest (no penalty).
  while (emojiCount >= MAX_EMOJI) {
    recycleOldest();
  }

  const el = document.createElement('div');
  el.className = 'spawned';
  el.textContent = animal.emoji;
  el.setAttribute('aria-label', animal.label);

  // Jittered position within the play area (percentages keep it responsive).
  const leftPct = 10 + Math.random() * 80;
  const topPct = 10 + Math.random() * 80;
  el.style.left = `${leftPct}%`;
  el.style.top = `${topPct}%`;

  playArea.appendChild(el);
  emojiCount += 1;

  // Schedule a gentle fade-out + removal well after the pop-in completes.
  setTimeout(() => {
    if (el.isConnected) {
      el.classList.add('is-fading');
      el.remove();
      emojiCount -= 1;
    }
  }, EMOJI_LIFETIME_MS);

  // Pitched blip for this animal.
  const freq = PITCH_BY_POSITION[position] || 660;
  playTone({ freq, duration: BLIP_DURATION, type: 'triangle', gain: BLIP_GAIN });
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
    : 'No controller — use the keyboard (WASD = face, Arrows = D-Pad).';
}

syncBanner();

// ---------------------------------------------------------------------------
// Event handlers (bound so they can be removed on unload)
// ---------------------------------------------------------------------------

function onFaceBottom() {
  if (gameShell.isPaused()) return;
  spawnAnimal('bottom');
}
function onFaceRight() {
  if (gameShell.isPaused()) return;
  spawnAnimal('right');
}
function onFaceLeft() {
  if (gameShell.isPaused()) return;
  spawnAnimal('left');
}
function onFaceTop() {
  if (gameShell.isPaused()) return;
  spawnAnimal('top');
}

function onDpad(direction) {
  if (gameShell.isPaused()) return;
  backgroundIndex = nextBackgroundColor(direction, BACKGROUND_PALETTE, backgroundIndex);
  applyBackground();
}

function onDpadUp() { onDpad('up'); }
function onDpadDown() { onDpad('down'); }
function onDpadLeft() { onDpad('left'); }
function onDpadRight() { onDpad('right'); }

function onLayoutChange() {
  if (glyphNode) setGlyphLayout(glyphNode, gamepadManager.getLayout());
  syncBanner();
}

function onAvailability() {
  syncBanner();
}

// ---------------------------------------------------------------------------
// Register only the events this game needs.
// ---------------------------------------------------------------------------

const LISTENERS = [
  [FACE_BOTTOM, onFaceBottom],
  [FACE_RIGHT, onFaceRight],
  [FACE_LEFT, onFaceLeft],
  [FACE_TOP, onFaceTop],
  [DPAD_UP, onDpadUp],
  [DPAD_DOWN, onDpadDown],
  [DPAD_LEFT, onDpadLeft],
  [DPAD_RIGHT, onDpadRight],
  [LAYOUT_CHANGE, onLayoutChange],
  ['gamepad-availability', onAvailability],
];

LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));

// ---------------------------------------------------------------------------
// Teardown — remove every gamepad-* listener this game added.
// ---------------------------------------------------------------------------

function cleanup() {
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  try {
    gameShell.destroy();
  } catch (error) {
    // Fail soft — teardown must never throw.
  }
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

// Silence unused-export lint for the positional list (kept for clarity).
void SPAWN_POSITIONS;
