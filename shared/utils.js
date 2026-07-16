// shared/utils.js — shared math + audio helpers.
// Math functions are PURE and allocation-free (unit-tested in tests/utils.test.js).
// Audio helpers are lazy, fail-soft, and NEVER throw (browser autoplay policy).

// ---------------------------------------------------------------------------
// Math (pure, unit-tested)
// ---------------------------------------------------------------------------

/**
 * Clamp `v` to the closed range [min, max].
 * Allocation-free; no ordering assumption on min/max handled implicitly by Math.
 */
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Linear interpolation: a + (b - a) * t. t outside [0,1] extrapolates.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Inclusive random integer in [min, max]. Assumes min <= max.
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random float in [min, max).
 */
export function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Pick a random element from a non-empty array. Returns undefined for [].
 */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Vector magnitude clamped to <= 1 (useful for normalizing stick input).
 */
export function magnitude(x, y) {
  return Math.min(1, Math.hypot(x, y));
}

/**
 * Euclidean distance between two points.
 */
export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Circle-vs-circle collision. Inputs are objects with { x, y, r }.
 * Touching exactly (distance === r1 + r2) counts as a collision.
 */
export function circleCollision(a, b) {
  return distance(a.x, a.y, b.x, b.y) <= a.r + b.r;
}

/**
 * Axis-aligned bounding box overlap. Inputs are objects with { x, y, w, h }
 * where (x, y) is the top-left corner. Edge-touching counts as overlap.
 */
export function aabbCollision(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ---------------------------------------------------------------------------
// Audio (NOT unit-tested; lazy singleton, fail-soft)
// ---------------------------------------------------------------------------

// Singleton AudioContext, created on first use (not at import time).
let audioContext = null;

/**
 * Returns the singleton AudioContext, creating it on first call.
 * Falls back to the webkit-prefixed constructor for older Safari.
 */
export function getAudioContext() {
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

/**
 * Resume the AudioContext if it was suspended by the browser autoplay policy.
 * Always resolves silently — never throws.
 */
export async function resumeAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch (error) {
    // Fail soft: autoplay-policy or missing context must not surface to the child.
  }
}

/**
 * Play a synthesized tone. Never throws.
 *
 * @param {Object} opts
 * @param {number} opts.freq     Oscillator frequency in Hz (default 440).
 * @param {number} opts.duration Length in seconds (default 0.2).
 * @param {OscillatorType} opts.type  Oscillator waveform (default 'sine').
 * @param {number} opts.gain     Peak gain 0.0–1.0 (default 0.2).
 */
export function playTone({
  freq = 440,
  duration = 0.2,
  type = 'sine',
  gain = 0.2,
} = {}) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Resume first to satisfy the autoplay policy on suspended contexts.
    if (ctx.state === 'suspended') {
      // Fire-and-forget; resume() returns a Promise we don't need to await here.
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    // Simple attack/decay envelope: 10ms ramp up, hold, 60ms ramp out.
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.setValueAtTime(gain, now + Math.max(0, duration - 0.06));
    g.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch (error) {
    // Fail soft: never surface audio errors to the child.
  }
}

/**
 * Short, pleasant one-shot blip (used for spawn/eat feedback).
 */
export function playBlip() {
  playTone({ freq: 660, duration: 0.08, type: 'triangle', gain: 0.2 });
}
