// games/city-pop-dj/game.js — DOM mixing-desk engine with a Web Audio
// lookahead scheduler. HOLD a face button → that musical track plays; RELEASE
// → mutes. Chord multiple to hear the full song.
//
// Imports the centralized GamepadManager singleton and ONLY listens for
// `gamepad-*` events on `window` — never calls navigator.getGamepads().
// All audio is ORIGINAL, synthesized in Web Audio — no samples, no files.

import { gamepadManager } from '../../shared/gamepad-manager.js';
import { createFaceGlyph, setGlyphLayout, setGlyphActive } from '../../shared/glyph.js';
import { getAudioContext, resumeAudio } from '../../shared/utils.js';
import {
  FACE_BOTTOM,
  FACE_RIGHT,
  FACE_LEFT,
  FACE_TOP,
  FACE_BOTTOM_UP,
  FACE_RIGHT_UP,
  FACE_LEFT_UP,
  FACE_TOP_UP,
  LAYOUT_CHANGE,
  AVAILABILITY,
} from '../../shared/button-mapping.js';
import { trackForPosition, activeTracks, mixGain } from './track-logic.js';

// ---------------------------------------------------------------------------
// Musical constants — ORIGINAL notes only, ~100 BPM city-pop feel.
// ---------------------------------------------------------------------------

const BPM = 100;
const SECONDS_PER_BEAT = 60 / BPM;
const SIXTEENTH = SECONDS_PER_BEAT / 4; // a 16th-note duration

// Scheduler timing.
const LOOKAHEAD_INTERVAL_MS = 25; // how often the timer fires
const SCHEDULE_AHEAD_SECONDS = 0.1; // schedule notes this far ahead of now

// Smooth gain ramps (avoid clicks when gating tracks mid-beat).
const GAIN_RAMP_TAU = 0.04; // setTargetAtTime time-constant
const TRACK_GAIN_PEAK = {
  bass: 0.32,
  drums: 0.5,
  melody: 0.18,
  vocals: 0.16,
};

// Each track loops over N 16th-note steps. All four loops are the same length
// (32 sixteenths = 2 bars of 4/4 at 100 BPM) so they stay in sync.

// Bassline — low sine/triangle arpeggio over a I–V–vi–IV-style groove.
// Frequencies are original, in a comfortable bass register.
const BASS_STEPS = 32;
const BASS_PATTERN = (() => {
  const rest = null;
  // Root notes per bar (Hz).
  const A1 = 55.0;
  const E2 = 82.41;
  const Fs2 = 92.5;
  const D2 = 73.42;
  // 16th grid per bar: root pulse on the beat, octave hops off-beat.
  const bar = (root, oct) => [
    root, rest, oct, rest,
    root, rest, oct, rest,
    root, rest, oct, rest,
    root, rest, oct, rest,
  ];
  return [
    ...bar(A1, A1 * 2),
    ...bar(E2, E2 * 2),
    ...bar(Fs2, Fs2 * 2),
    ...bar(D2, D2 * 2),
  ].map((f, i) => (f == null ? null : ({ freq: f, step: i })));
})();

// Drums — kick on beats, hi-hat on off-beats. Represented as boolean flags.
const DRUM_STEPS = 32;
const DRUM_PATTERN = (() => {
  const kick = new Array(DRUM_STEPS).fill(false);
  const hat = new Array(DRUM_STEPS).fill(false);
  for (let i = 0; i < DRUM_STEPS; i += 1) {
    if (i % 4 === 0) kick[i] = true; // four-on-the-floor
    if (i % 2 === 1) hat[i] = true; // 8th-note off-beat hats
  }
  return { kick, hat };
})();

// Melody — mid sine/square arpeggio an octave up, original pitches.
const MELODY_STEPS = 32;
const MELODY_PATTERN = (() => {
  const rest = null;
  // A gentle ascending/descending pentatonic-flavored cell per bar.
  const cell = (base) => [
    base, rest, base * 1.25, rest,
    base * 1.5, rest, base * 1.25, rest,
    base, rest, base * 1.125, rest,
    base * 1.5, rest, base * 1.25, rest,
  ];
  return [
    ...cell(440.0), // A4-ish
    ...cell(493.88), // B4-ish
    ...cell(440.0),
    ...cell(392.0), // G4-ish
  ].map((f, i) => (f == null ? null : ({ freq: f, step: i })));
})();

// Vocals — soft sustained pad chord (detuned oscillators). Two chords per loop.
const VOCALS_STEPS = 32;
const VOCAL_PATTERN = (() => {
  // Each entry covers STEPS_PER_CHORD 16ths; we just mark chord starts.
  const STEPS_PER_CHORD = 16;
  // Two chord voicings (higher register, soft). Each = [root, third, fifth].
  const chords = [
    [659.25, 783.99, 987.77], // E5 G5 B5
    [587.33, 698.46, 880.0], // D5 F5 A5
  ];
  const starts = new Array(VOCALS_STEPS).fill(null);
  for (let c = 0; c < chords.length; c += 1) {
    starts[c * STEPS_PER_CHORD] = chords[c];
  }
  return starts;
})();

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const padHost = document.getElementById('pad-host');
const bannerEl = document.querySelector('.gamepad-banner');
const bannerText = document.getElementById('banner-text');
const statusEl = document.getElementById('status');
const fullMixEl = document.getElementById('full-mix');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const heldPositions = new Set(); // currently-held face positions
let activeTrackSet = activeTracks(heldPositions); // derived Set of track ids

let glyphNode = null;
const padElementsByPosition = new Map(); // position → pad element
const litPositions = new Set(); // positions whose pad is currently lit

// Audio graph (built lazily on first gesture).
let ctx = null;
let masterGain = null;
// Per-track bus: { input: GainNode (gate), destination: masterGain }.
const trackBuses = {};
let audioReady = false;

// Scheduler bookkeeping. `nextStep` is the absolute 16th-step index to schedule
// next; `nextStepTime` is the ctx-absolute time at which it should sound.
let schedulerTimer = null;
let nextStep = 0;
let nextStepTime = 0.0;
let lastScheduledStepFor = null; // { track, step } to avoid double-triggering

// ---------------------------------------------------------------------------
// Pad construction (DOM mixing desk)
// ---------------------------------------------------------------------------

function buildPads() {
  if (!padHost) return;
  const layout = gamepadManager.getLayout();
  const glyph = createFaceGlyph({ layout, position: null, active: false });
  padHost.replaceChildren(glyph);
  glyphNode = glyph;

  padElementsByPosition.clear();
  glyph.querySelectorAll('.face-glyph__pad').forEach((pad) => {
    pad.classList.add('dj-pad');
    // Tag each pad with its track name for the child.
    const position = pad.dataset.position;
    const track = trackForPosition(position);
    if (track) pad.dataset.track = track;
    padElementsByPosition.set(position, pad);
  });
}

function relabelPads() {
  // Re-apply layout so the lit pad's label updates; non-lit pads stay blank
  // (the glyph helper only relabels the active pad, which is fine here).
  litPositions.forEach((position) => {
    setGlyphActive(glyphNode, null);
    setGlyphActive(glyphNode, position);
  });
}

function setPadLit(position, on) {
  const pad = padElementsByPosition.get(position);
  if (!pad) return;
  if (on) {
    pad.classList.add('dj-pad--lit');
    litPositions.add(position);
    setGlyphActive(glyphNode, position);
  } else {
    pad.classList.remove('dj-pad--lit');
    litPositions.delete(position);
    // If another pad is still lit, keep that one active; else clear.
    const stillLit = Array.from(litPositions);
    setGlyphActive(glyphNode, stillLit.length ? stillLit[stillLit.length - 1] : null);
  }
}

// ---------------------------------------------------------------------------
// Audio graph
// ---------------------------------------------------------------------------

function ensureAudioGraph() {
  if (audioReady) return true;
  const context = getAudioContext();
  if (!context) return false;
  ctx = context;

  try {
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0; // master starts silent; unmuted per-track
    // A gentle master limiter-ish via a WaveShaper is overkill; keep it simple
    // and rely on conservative per-track gains. Route straight to destination.
    masterGain.connect(ctx.destination);

    for (const track of ['bass', 'drums', 'melody', 'vocals']) {
      const input = ctx.createGain();
      input.gain.value = 0.0; // gated until held
      input.connect(masterGain);
      trackBuses[track] = input;
    }
    // Master is always audible (gains sit on the track buses).
    masterGain.gain.value = 1.0;

    audioReady = true;
    return true;
  } catch (error) {
    // Fail soft: never surface audio errors to the child.
    audioReady = false;
    return false;
  }
}

// Apply the current active-track set to the per-track gain gates, with smooth
// ramps so toggling mid-beat doesn't click.
function applyMix() {
  if (!audioReady) return;
  const now = ctx.currentTime;
  for (const track of ['bass', 'drums', 'melody', 'vocals']) {
    const bus = trackBuses[track];
    if (!bus) continue;
    const target = mixGain(track, activeTrackSet) * TRACK_GAIN_PEAK[track];
    try {
      bus.gain.setTargetAtTime(target, now, GAIN_RAMP_TAU);
    } catch (error) {
      // Fallback for very old engines without setTargetAtTime.
      bus.gain.value = target;
    }
  }
}

// ---------------------------------------------------------------------------
// Note synthesis — one scheduler function per track.
// Each receives the absolute ctx time at which its step should sound.
// ---------------------------------------------------------------------------

function scheduleBass(time) {
  const note = BASS_PATTERN[nextStep % BASS_STEPS];
  if (!note) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, time);
    // Short pluck envelope.
    const dur = SIXTEENTH * 1.8;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(1.0, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(trackBuses.bass);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  } catch (error) {
    // Fail soft.
  }
}

function scheduleDrums(time) {
  const step = nextStep % DRUM_STEPS;
  // Kick: sine pitch drop + fast decay.
  if (DRUM_PATTERN.kick[step]) {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
      g.gain.setValueAtTime(1.0, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      osc.connect(g).connect(trackBuses.drums);
      osc.start(time);
      osc.stop(time + 0.2);
    } catch (error) {
      // Fail soft.
    }
  }
  // Hi-hat: short white-noise burst through a high-pass.
  if (DRUM_PATTERN.hat[step]) {
    try {
      const dur = 0.04;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(hp).connect(g).connect(trackBuses.drums);
      src.start(time);
      src.stop(time + dur + 0.02);
    } catch (error) {
      // Fail soft.
    }
  }
}

function scheduleMelody(time) {
  const note = MELODY_PATTERN[nextStep % MELODY_STEPS];
  if (!note) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(note.freq, time);
    const dur = SIXTEENTH * 1.5;
    // Softened square: faster decay, lower peak.
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.6, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(trackBuses.melody);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  } catch (error) {
    // Fail soft.
  }
}

function scheduleVocals(time) {
  const chord = VOCAL_PATTERN[nextStep % VOCALS_STEPS];
  if (!chord) return;
  // Sustain for one chord slot; build three detuned oscillators.
  const dur = SIXTEENTH * 16; // full chord slot
  for (const freq of chord) {
    try {
      // Two slightly detuned oscillators per note for a soft pad feel.
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime(detune, time);
        // Slow swell in and gentle release.
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.3, time + 0.4);
        g.gain.setValueAtTime(0.3, time + dur - 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(g).connect(trackBuses.vocals);
        osc.start(time);
        osc.stop(time + dur + 0.05);
      }
    } catch (error) {
      // Fail soft.
    }
  }
}

const STEP_SCHEDULERS = {
  bass: scheduleBass,
  drums: scheduleDrums,
  melody: scheduleMelody,
  vocals: scheduleVocals,
};

// ---------------------------------------------------------------------------
// Lookahead scheduler
// ---------------------------------------------------------------------------

function schedulerTick() {
  if (!audioReady || !ctx) return;
  const horizon = ctx.currentTime + SCHEDULE_AHEAD_SECONDS;

  // Clamp catch-up: if nextStepTime fell far behind (tab was throttled),
  // jump it forward to slightly ahead of now so we don't fire a burst.
  if (nextStepTime < ctx.currentTime) {
    nextStepTime = ctx.currentTime + 0.02;
  }

  while (nextStepTime < horizon) {
    // Schedule every track's note for this step. Each track's gain gate
    // decides audibility — notes are always scheduled, so toggling a track
    // mid-beat fades it in/out smoothly.
    for (const track of ['bass', 'drums', 'melody', 'vocals']) {
      const fn = STEP_SCHEDULERS[track];
      if (fn) {
        try {
          fn(nextStepTime);
        } catch (error) {
          // Fail soft: a single bad note never stops the loop.
        }
      }
    }
    nextStep = (nextStep + 1) % Math.max(BASS_STEPS, DRUM_STEPS, MELODY_STEPS, VOCALS_STEPS);
    nextStepTime += SIXTEENTH;
  }
}

function startScheduler() {
  if (schedulerTimer != null) return;
  if (!ensureAudioGraph()) return;
  // Initialize the scheduling cursor relative to the (possibly just-resumed)
  // ctx.currentTime. When ctx is suspended, currentTime is frozen — that's
  // fine; we'll catch up correctly once it resumes.
  nextStep = 0;
  nextStepTime = ctx.currentTime + 0.05;
  schedulerTimer = window.setInterval(schedulerTick, LOOKAHEAD_INTERVAL_MS);
}

function stopScheduler() {
  if (schedulerTimer != null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  // Close any live oscillators we can: closing the whole context is the
  // simplest reliable teardown, and a fresh one is created on return if the
  // child navigates back. (getAudioContext memoizes, so reset below.)
  try {
    if (ctx && ctx.state !== 'closed') {
      ctx.close();
    }
  } catch (error) {
    // Fail soft.
  }
  ctx = null;
  masterGain = null;
  for (const k of Object.keys(trackBuses)) delete trackBuses[k];
  audioReady = false;
}

// ---------------------------------------------------------------------------
// Hold / release handling
// ---------------------------------------------------------------------------

function recomputeActive() {
  activeTrackSet = activeTracks(heldPositions);
  applyMix();
  renderStatus();
}

function holdPosition(position) {
  // First gesture resumes the AudioContext; the manager already resumes on
  // input, but we also try here to be robust.
  try {
    const context = getAudioContext();
    if (context && context.state === 'suspended') {
      context.resume().catch(() => {});
    }
  } catch (error) {
    // Fail soft.
  }

  if (!ensureAudioGraph()) return;
  startScheduler();

  heldPositions.add(position);
  setPadLit(position, true);
  recomputeActive();
}

function releasePosition(position) {
  heldPositions.delete(position);
  setPadLit(position, false);
  recomputeActive();
}

// ---------------------------------------------------------------------------
// Status / full-mix celebration
// ---------------------------------------------------------------------------

function renderStatus() {
  if (statusEl) {
    const n = activeTrackSet.size;
    if (n === 0) {
      statusEl.textContent = 'Hold a face button to start a track.';
    } else if (n === 4) {
      statusEl.textContent = 'Full mix! All four tracks playing.';
    } else {
      statusEl.textContent = `${n} track${n === 1 ? '' : 's'} playing.`;
    }
  }
  if (fullMixEl) {
    fullMixEl.classList.toggle('is-full', activeTrackSet.size === 4);
  }
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
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

function onFaceBottom() { holdPosition('bottom'); }
function onFaceRight() { holdPosition('right'); }
function onFaceLeft() { holdPosition('left'); }
function onFaceTop() { holdPosition('top'); }
function onFaceBottomUp() { releasePosition('bottom'); }
function onFaceRightUp() { releasePosition('right'); }
function onFaceLeftUp() { releasePosition('left'); }
function onFaceTopUp() { releasePosition('top'); }

function onLayoutChange() {
  if (glyphNode) {
    // Re-seed the glyph's stored layout and relabel lit pads.
    setGlyphLayout(glyphNode, gamepadManager.getLayout());
    relabelPads();
  }
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
  [FACE_BOTTOM_UP, onFaceBottomUp],
  [FACE_RIGHT_UP, onFaceRightUp],
  [FACE_LEFT_UP, onFaceLeftUp],
  [FACE_TOP_UP, onFaceTopUp],
  [LAYOUT_CHANGE, onLayoutChange],
  [AVAILABILITY, onAvailability],
];

LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));

// ---------------------------------------------------------------------------
// Teardown — stop scheduler, close audio, remove listeners.
// ---------------------------------------------------------------------------

function cleanup() {
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  stopScheduler();
  heldPositions.clear();
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

buildPads();
syncBanner();
renderStatus();
setStatus('Hold a face button to start a track.');
