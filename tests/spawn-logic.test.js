// tests/spawn-logic.test.js — table-driven unit tests for the PURE logic in
// games/animal-spawner/spawn-logic.js. No DOM, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import { animalForPosition, nextBackgroundColor } from '../games/animal-spawner/spawn-logic.js';

describe('animalForPosition', () => {
  const table = [
    { name: 'bottom → Cat', input: 'bottom', expected: { emoji: '🐱', label: 'Cat', position: 'bottom' } },
    { name: 'right → Dog', input: 'right', expected: { emoji: '🐶', label: 'Dog', position: 'right' } },
    { name: 'left → Bird', input: 'left', expected: { emoji: '🐦', label: 'Bird', position: 'left' } },
    { name: 'top → Frog', input: 'top', expected: { emoji: '🐸', label: 'Frog', position: 'top' } },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(animalForPosition(input)).toEqual(expected);
    });
  });

  it('returns null for an unknown position', () => {
    expect(animalForPosition('middle')).toBe(null);
  });

  it('returns null for undefined', () => {
    expect(animalForPosition(undefined)).toBe(null);
  });

  it('returns a fresh object each call (no shared mutation)', () => {
    const a = animalForPosition('bottom');
    const b = animalForPosition('bottom');
    expect(a).toEqual(b);
    expect(a === b).toBe(false);
    a.emoji = 'x';
    expect(animalForPosition('bottom').emoji).toBe('🐱');
  });
});

describe('nextBackgroundColor', () => {
  const palette = ['red', 'green', 'blue']; // length 3

  const table = [
    { name: 'up advances (+1)', input: { direction: 'up', palette, currentIndex: 0 }, expected: 1 },
    { name: 'right advances (+1)', input: { direction: 'right', palette, currentIndex: 1 }, expected: 2 },
    { name: 'down retreats (-1)', input: { direction: 'down', palette, currentIndex: 2 }, expected: 1 },
    { name: 'left retreats (-1)', input: { direction: 'left', palette, currentIndex: 1 }, expected: 0 },
    { name: 'up wraps from last to first', input: { direction: 'up', palette, currentIndex: 2 }, expected: 0 },
    { name: 'right wraps from last to first', input: { direction: 'right', palette, currentIndex: 2 }, expected: 0 },
    { name: 'down wraps from first to last', input: { direction: 'down', palette, currentIndex: 0 }, expected: 2 },
    { name: 'left wraps from first to last', input: { direction: 'left', palette, currentIndex: 0 }, expected: 2 },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(
        nextBackgroundColor(input.direction, input.palette, input.currentIndex),
      ).toBe(expected);
    });
  });

  it('returns current index for an empty palette', () => {
    expect(nextBackgroundColor('up', [], 5)).toBe(5);
  });

  it('returns current index for a non-array palette', () => {
    expect(nextBackgroundColor('up', null, 2)).toBe(2);
  });

  it('returns current index for an unknown direction', () => {
    expect(nextBackgroundColor('sideways', palette, 1)).toBe(1);
  });

  it('normalizes an out-of-range current index via wraparound', () => {
    // 5 mod 3 = 2; up (+1) → 0
    expect(nextBackgroundColor('up', palette, 5)).toBe(0);
  });
});
