// tests/sequence-logic.test.js — table-driven unit tests for the PURE logic
// in games/simon-says/sequence-logic.js. No DOM, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import { FACE_POSITIONS } from '../shared/button-mapping.js';
import {
  extendSequence,
  expectedAt,
  isCorrect,
  toneForPosition,
} from '../games/simon-says/sequence-logic.js';

describe('extendSequence', () => {
  it('adds exactly one element to an empty sequence', () => {
    const before = [];
    const after = extendSequence(before);
    expect(after.length).toBe(1);
  });

  it('adds exactly one element to a non-empty sequence', () => {
    const before = ['bottom', 'top'];
    const after = extendSequence(before);
    expect(after.length).toBe(3);
  });

  it('appends a valid face position', () => {
    const after = extendSequence([]);
    expect(FACE_POSITIONS.includes(after[0])).toBe(true);
  });

  it('appends a valid face position for every appended element', () => {
    let seq = [];
    for (let i = 0; i < 20; i += 1) {
      seq = extendSequence(seq);
    }
    const allValid = seq.every((p) => FACE_POSITIONS.includes(p));
    expect(allValid).toBe(true);
    expect(seq.length).toBe(20);
  });

  it('does not mutate the input array', () => {
    const before = ['left', 'right'];
    const snapshot = [...before];
    extendSequence(before);
    expect(before).toEqual(snapshot);
    expect(before.length).toBe(2);
  });

  it('preserves the existing elements in order', () => {
    const before = ['top', 'bottom', 'left'];
    const after = extendSequence(before);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('treats a non-array input as an empty sequence', () => {
    const after = extendSequence(null);
    expect(after.length).toBe(1);
    expect(FACE_POSITIONS.includes(after[0])).toBe(true);
  });
});

describe('expectedAt', () => {
  const seq = ['bottom', 'top', 'right', 'left'];

  const table = [
    { name: 'first step', input: 0, expected: 'bottom' },
    { name: 'middle step', input: 1, expected: 'top' },
    { name: 'last step', input: 3, expected: 'left' },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(expectedAt(seq, input)).toBe(expected);
    });
  });

  it('returns null for a negative step', () => {
    expect(expectedAt(seq, -1)).toBe(null);
  });

  it('returns null for a step equal to length', () => {
    expect(expectedAt(seq, seq.length)).toBe(null);
  });

  it('returns null for a step past the end', () => {
    expect(expectedAt(seq, 99)).toBe(null);
  });

  it('returns null for a non-integer step', () => {
    expect(expectedAt(seq, 1.5)).toBe(null);
  });

  it('returns null for a non-array sequence', () => {
    expect(expectedAt(null, 0)).toBe(null);
  });

  it('returns null for an empty sequence', () => {
    expect(expectedAt([], 0)).toBe(null);
  });
});

describe('isCorrect', () => {
  const seq = ['bottom', 'top', 'right'];

  it('returns true when the position matches the step', () => {
    expect(isCorrect(seq, 0, 'bottom')).toBe(true);
  });

  it('returns true for a matching middle step', () => {
    expect(isCorrect(seq, 1, 'top')).toBe(true);
  });

  it('returns true for a matching last step', () => {
    expect(isCorrect(seq, 2, 'right')).toBe(true);
  });

  it('returns false when the position mismatches the step', () => {
    expect(isCorrect(seq, 0, 'top')).toBe(false);
  });

  it('returns false for a mismatching middle step', () => {
    expect(isCorrect(seq, 1, 'left')).toBe(false);
  });

  it('returns false when the step is out of range', () => {
    expect(isCorrect(seq, 5, 'bottom')).toBe(false);
  });

  it('returns false for a negative step', () => {
    expect(isCorrect(seq, -1, 'bottom')).toBe(false);
  });

  it('returns false for a non-array sequence', () => {
    expect(isCorrect(undefined, 0, 'bottom')).toBe(false);
  });
});

describe('toneForPosition', () => {
  it('returns the C4 frequency for bottom', () => {
    expect(toneForPosition('bottom')).toBe(261.63);
  });

  it('returns the E4 frequency for right', () => {
    expect(toneForPosition('right')).toBe(329.63);
  });

  it('returns the G4 frequency for left', () => {
    expect(toneForPosition('left')).toBe(392.0);
  });

  it('returns the C5 frequency for top', () => {
    expect(toneForPosition('top')).toBe(523.25);
  });

  it('returns four distinct frequencies', () => {
    const freqs = FACE_POSITIONS.map((p) => toneForPosition(p));
    expect(new Set(freqs).size).toBe(4);
  });

  it('returns null for an unknown position', () => {
    expect(toneForPosition('middle')).toBe(null);
  });

  it('returns null for undefined', () => {
    expect(toneForPosition(undefined)).toBe(null);
  });
});
