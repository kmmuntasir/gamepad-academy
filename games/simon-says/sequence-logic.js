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
