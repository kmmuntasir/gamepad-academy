// games/simon-says/game.js — DOM memory game engine for Simon Says / Copycat.
// Event-driven (no rAF loop): plays a growing face-button sequence with tones,
// then listens for face-button presses and compares against the sequence via
// the PURE helpers in sequence-logic.js. Wrong presses are ignored (no
// penalty). Sequence grows by one per successfully echoed round.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { createFaceGlyph, setGlyphLayout, setGlyphActive } from '../../shared/glyph.js';
import { playTone } from '../../shared/utils.js';
import {
  FACE_BOTTOM,
  FACE_RIGHT,
  FACE_LEFT,
  FACE_TOP,
  LAYOUT_CHANGE,
} from '../../shared/button-mapping.js';
import {
  extendSequence,
  isCorrect,
  toneForPosition,
} from './sequence-logic.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Phase identifiers for the simple state machine.
const PHASE_PLAY = 'play'; // game is demonstrating the sequence
const PHASE_INPUT = 'input'; // player is echoing the sequence

// Playback tempo. Each highlighted pad shows for this long; a gap of equal
// length separates pads so the rhythm is clear and unhurried.
const PAD_ON_MS = 450;
const PAD_GAP_MS = 250;
// Pause before replaying the sequence after a successful round (celebration).
const REPLAY_DELAY_MS = 900;
// Pause before the very first playback.
const START_DELAY_MS = 600;

// A soft, neutral tick for ignored (wrong) presses. Never punitive.
const NEUTRAL_FREQ = 180;
const NEUTRAL_DURATION = 0.08;
const NEUTRAL_GAIN = 0.08;

const TONE_DURATION = 0.3;
const TONE_GAIN = 0.2;

const FACE_POSITIONS = ['bottom', 'right', 'left', 'top'];

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const padHost = document.getElementById('pad-host');
const levelEl = document.getElementById('level');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');
const statusEl = document.getElementById('status');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let sequence = [];
let glyphNode = null;
const padElementsByPosition = new Map();

// 'play' | 'input'
let phase = PHASE_PLAY;
// Index of the next expected press during the input phase.
let inputStep = 0;
// Tracking handle for the currently running scheduled timeout so teardown
// can cancel a mid-flight playback. `-1` means nothing scheduled.
let pendingTimeout = -1;
// Bumped each time a playback chain starts; if a stale timeout fires after a
// newer chain has begun, it aborts harmlessly.
let playbackGeneration = 0;

// ---------------------------------------------------------------------------
// Glyph / pad construction
// ---------------------------------------------------------------------------

function buildPads() {
  if (!padHost) return;
  const layout = gamepadManager.getLayout();
  const glyph = createFaceGlyph({ layout, position: null, active: false });
  padHost.replaceChildren(glyph);
  glyphNode = glyph;

  // The glyph's pads are small (30px) — enlarge them into tappable pads by
  // adding the game-local `pad` class defined in index.html <style>.
  padElementsByPosition.clear();
  glyph.querySelectorAll('.face-glyph__pad').forEach((pad) => {
    pad.classList.add('pad');
    padElementsByPosition.set(pad.dataset.position, pad);
  });
}

function highlightPad(position, on) {
  const pad = padElementsByPosition.get(position);
  if (!pad) return;
  if (on) {
    pad.classList.add('pad--lit');
    setGlyphActive(glyphNode, position);
  } else {
    pad.classList.remove('pad--lit');
    setGlyphActive(glyphNode, null);
  }
}

function playPadTone(position) {
  const freq = toneForPosition(position);
  if (freq == null) return;
  playTone({ freq, duration: TONE_DURATION, type: 'sine', gain: TONE_GAIN });
}

function playNeutralTone() {
  playTone({
    freq: NEUTRAL_FREQ,
    duration: NEUTRAL_DURATION,
    type: 'sine',
    gain: NEUTRAL_GAIN,
  });
}

// ---------------------------------------------------------------------------
// Status text + level
// ---------------------------------------------------------------------------

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function renderLevel() {
  if (levelEl) levelEl.textContent = `Level ${sequence.length}`;
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

function startNewRound() {
  phase = PHASE_PLAY;
  inputStep = 0;
  renderLevel();
  setStatus('Watch the pattern…');
  schedulePlayback(START_DELAY_MS);
}

function schedulePlayback(delayMs) {
  cancelPending();
  playbackGeneration += 1;
  const myGen = playbackGeneration;
  pendingTimeout = window.setTimeout(() => {
    pendingTimeout = -1;
    runPlayback(myGen);
  }, delayMs);
}

function runPlayback(gen) {
  if (gen !== playbackGeneration) return; // stale
  let i = 0;

  const showNext = () => {
    if (gen !== playbackGeneration) return; // stale
    if (i >= sequence.length) {
      beginInputPhase();
      return;
    }
    const position = sequence[i];
    highlightPad(position, true);
    playPadTone(position);
    i += 1;

    pendingTimeout = window.setTimeout(() => {
      pendingTimeout = -1;
      if (gen !== playbackGeneration) return; // stale
      highlightPad(position, false);
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = -1;
        showNext();
      }, PAD_GAP_MS);
    }, PAD_ON_MS);
  };

  showNext();
}

function beginInputPhase() {
  phase = PHASE_INPUT;
  inputStep = 0;
  setStatus('Your turn — echo the pattern!');
}

function handlePlayerPress(position) {
  if (phase !== PHASE_INPUT) return; // ignore presses during playback

  if (isCorrect(sequence, inputStep, position)) {
    // Briefly light the pad + play its tone so the press feels acknowledged.
    highlightPad(position, true);
    playPadTone(position);
    cancelPending();
    pendingTimeout = window.setTimeout(() => {
      pendingTimeout = -1;
      highlightPad(position, false);
    }, PAD_ON_MS);

    inputStep += 1;
    if (inputStep >= sequence.length) {
      // Round cleared — celebrate briefly, then grow + replay.
      phase = PHASE_PLAY;
      setStatus('Nice! Get ready…');
      cancelPending();
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = -1;
        sequence = extendSequence(sequence);
        startNewRound();
      }, REPLAY_DELAY_MS);
    }
  } else {
    // Wrong press — no penalty. Soft neutral sound; keep waiting.
    playNeutralTone();
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

function onFaceBottom() { handlePlayerPress('bottom'); }
function onFaceRight() { handlePlayerPress('right'); }
function onFaceLeft() { handlePlayerPress('left'); }
function onFaceTop() { handlePlayerPress('top'); }

function onLayoutChange() {
  if (glyphNode) setGlyphLayout(glyphNode, gamepadManager.getLayout());
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
  ['gamepad-availability', onAvailability],
];

LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));

// ---------------------------------------------------------------------------
// Teardown — remove listeners and cancel any pending timers.
// ---------------------------------------------------------------------------

function cancelPending() {
  if (pendingTimeout !== -1) {
    clearTimeout(pendingTimeout);
    pendingTimeout = -1;
  }
}

function cleanup() {
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  // Invalidate any in-flight playback chain so a late timeout is a no-op.
  playbackGeneration += 1;
  cancelPending();
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

buildPads();
syncBanner();
sequence = extendSequence(sequence); // start with a single step
startNewRound();
