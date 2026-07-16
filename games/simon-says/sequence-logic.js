// games/simon-says/sequence-logic.js — PURE sequence memory logic.
// Zero dependencies. No DOM, no gamepad, no side effects. Unit-tested in
// tests/sequence-logic.test.js.

import { FACE_POSITIONS } from '../../shared/button-mapping.js';

// Face-position → tone frequency (Hz). Four distinct pitches spanning a
// pleasant major arpeggio (C major: C4, E4, G4, C5). Each pad has its own
// recognizable pitch so the sequence is audible, not just visual.
const TONES = {
  bottom: 261.63, // C4
  right: 329.63, // E4
  left: 392.0, // G4
  top: 523.25, // C5
};

/**
 * Return a NEW array = `seq` with one random face position appended.
 * Does NOT mutate the input array.
 *
 * @param {string[]} seq - current sequence of face positions
 * @returns {string[]} a fresh array one element longer
 */
export function extendSequence(seq) {
  const base = Array.isArray(seq) ? seq : [];
  const next = FACE_POSITIONS[Math.floor(Math.random() * FACE_POSITIONS.length)];
  return [...base, next];
}

/**
 * Build a NEW randomized sequence of exactly `length` face positions.
 * Each call produces a fresh random sequence (used to re-shuffle every
 * successful repeat so the player can't just memorize one fixed pattern).
 *
 * @param {number} length - desired sequence length (clamped to >= 0)
 * @returns {string[]} fresh array of face-position strings
 */
export function buildSequence(length) {
  const count = Number.isInteger(length) && length > 0 ? length : 0;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const pos = FACE_POSITIONS[Math.floor(Math.random() * FACE_POSITIONS.length)];
    out.push(pos);
  }
  return out;
}

/**
 * Advance the round-progress model after a successful repeat.
 *
 * Holds `length` steady for `repeatsPerLevel` successful repeats; on the
 * repeat that hits the threshold, bumps `length` by `lengthStep`, resets
 * `repeatsDone` to 0, and signals `advanced = true`.
 *
 * @param {{ length: number, repeatsDone: number }} progress
 * @param {{ repeatsPerLevel?: number, lengthStep?: number }} [opts]
 * @returns {{ length: number, repeatsDone: number, advanced: boolean }}
 */
export function nextRound(progress, opts = {}) {
  const repeatsPerLevel = opts.repeatsPerLevel ?? 10;
  const lengthStep = opts.lengthStep ?? 1;
  const base = Number.isInteger(progress?.length) && progress.length >= 0
    ? progress.length
    : 0;
  const done = Number.isInteger(progress?.repeatsDone) && progress.repeatsDone >= 0
    ? progress.repeatsDone
    : 0;

  const nextDone = done + 1;
  if (nextDone >= repeatsPerLevel) {
    return { length: base + lengthStep, repeatsDone: 0, advanced: true };
  }
  return { length: base, repeatsDone: nextDone, advanced: false };
}

/**
 * Return the position expected at `step` in `seq`, or null if out of range.
 *
 * @param {string[]} seq
 * @param {number} step - zero-based index
 * @returns {string|null}
 */
export function expectedAt(seq, step) {
  if (!Array.isArray(seq)) return null;
  if (!Number.isInteger(step) || step < 0 || step >= seq.length) return null;
  return seq[step];
}

/**
 * True when `position` is the correct face position for `step` in `seq`.
 *
 * @param {string[]} seq
 * @param {number} step
 * @param {string} position - the face position the player pressed
 * @returns {boolean}
 */
export function isCorrect(seq, step, position) {
  return expectedAt(seq, step) === position;
}

/**
 * Return the tone frequency for a face position, or null if unknown.
 *
 * @param {string} position
 * @returns {number|null}
 */
export function toneForPosition(position) {
  const freq = TONES[position];
  return typeof freq === 'number' ? freq : null;
}
