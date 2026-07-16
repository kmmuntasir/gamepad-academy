// tests/claw-logic.test.js — table-driven unit tests for the PURE logic in
// games/claw-machine/claw-logic.js. No DOM, no Canvas, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import { moveClaw, grabAt, resetClaw } from '../games/claw-machine/claw-logic.js';

describe('moveClaw', () => {
  const bounds = { cols: 5, rows: 4 };

  const table = [
    { name: 'up decrements y', input: { pos: { x: 2, y: 2 }, direction: 'up' }, expected: { x: 2, y: 1 } },
    { name: 'down increments y', input: { pos: { x: 2, y: 1 }, direction: 'down' }, expected: { x: 2, y: 2 } },
    { name: 'left decrements x', input: { pos: { x: 2, y: 2 }, direction: 'left' }, expected: { x: 1, y: 2 } },
    { name: 'right increments x', input: { pos: { x: 2, y: 2 }, direction: 'right' }, expected: { x: 3, y: 2 } },
    // Edge clamping — all four edges.
    { name: 'up at top edge clamps to 0', input: { pos: { x: 2, y: 0 }, direction: 'up' }, expected: { x: 2, y: 0 } },
    { name: 'down at bottom edge clamps to rows-1', input: { pos: { x: 2, y: 3 }, direction: 'down' }, expected: { x: 2, y: 3 } },
    { name: 'left at left edge clamps to 0', input: { pos: { x: 0, y: 2 }, direction: 'left' }, expected: { x: 0, y: 2 } },
    { name: 'right at right edge clamps to cols-1', input: { pos: { x: 4, y: 2 }, direction: 'right' }, expected: { x: 4, y: 2 } },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(moveClaw(input.pos, input.direction, bounds)).toEqual(expected);
    });
  });

  it('returns a new object (does not mutate input pos)', () => {
    const pos = { x: 1, y: 1 };
    const next = moveClaw(pos, 'up', bounds);
    expect(next).toEqual({ x: 1, y: 0 });
    expect(pos).toEqual({ x: 1, y: 1 }); // unchanged
    expect(next === pos).toBe(false);
  });

  it('returns the same cell for an unknown direction', () => {
    expect(moveClaw({ x: 2, y: 2 }, 'sideways', bounds)).toEqual({ x: 2, y: 2 });
  });

  it('clamps within a 1x1 grid in every direction', () => {
    expect(moveClaw({ x: 0, y: 0 }, 'up', { cols: 1, rows: 1 })).toEqual({ x: 0, y: 0 });
    expect(moveClaw({ x: 0, y: 0 }, 'down', { cols: 1, rows: 1 })).toEqual({ x: 0, y: 0 });
    expect(moveClaw({ x: 0, y: 0 }, 'left', { cols: 1, rows: 1 })).toEqual({ x: 0, y: 0 });
    expect(moveClaw({ x: 0, y: 0 }, 'right', { cols: 1, rows: 1 })).toEqual({ x: 0, y: 0 });
  });

  it('clamps an out-of-range pos back into bounds on move', () => {
    expect(moveClaw({ x: 99, y: 99 }, 'up', bounds)).toEqual({ x: 4, y: 3 });
  });
});

describe('grabAt', () => {
  const prizes = [
    { x: 0, y: 1, emoji: '🧸' },
    { x: 2, y: 2, emoji: '🚗' },
    { x: 4, y: 3, emoji: '🦄' },
  ];

  it('returns the prize matching the given cell', () => {
    expect(grabAt({ x: 2, y: 2 }, prizes)).toEqual({ x: 2, y: 2, emoji: '🚗' });
  });

  it('returns the prize at the first cell', () => {
    expect(grabAt({ x: 0, y: 1 }, prizes)).toEqual({ x: 0, y: 1, emoji: '🧸' });
  });

  it('returns null when no prize is at the cell (miss)', () => {
    expect(grabAt({ x: 1, y: 1 }, prizes)).toBe(null);
  });

  it('returns null for an empty prize array', () => {
    expect(grabAt({ x: 0, y: 0 }, [])).toBe(null);
  });

  it('returns null when prizes is not an array', () => {
    expect(grabAt({ x: 0, y: 0 }, null)).toBe(null);
  });

  it('returns null when pos is null', () => {
    expect(grabAt(null, prizes)).toBe(null);
  });

  it('returns the first match when two prizes share a cell', () => {
    const dup = [
      { x: 1, y: 1, emoji: '🧸' },
      { x: 1, y: 1, emoji: '🚗' },
    ];
    expect(grabAt({ x: 1, y: 1 }, dup)).toEqual({ x: 1, y: 1, emoji: '🧸' });
  });
});

describe('resetClaw', () => {
  it('returns top-center for an odd column count', () => {
    expect(resetClaw({ cols: 5, rows: 4 })).toEqual({ x: 2, y: 0 });
  });

  it('returns top-center for an even column count', () => {
    // floor(4/2) = 2 → cell index 2 (the third of four columns)
    expect(resetClaw({ cols: 4, rows: 4 })).toEqual({ x: 2, y: 0 });
  });

  it('returns {0,0} for a 1x1 grid', () => {
    expect(resetClaw({ cols: 1, rows: 1 })).toEqual({ x: 0, y: 0 });
  });

  it('always has y = 0 (top rail)', () => {
    expect(resetClaw({ cols: 6, rows: 9 }).y).toBe(0);
  });

  it('x never exceeds cols-1', () => {
    const bounds = { cols: 3, rows: 3 };
    const pos = resetClaw(bounds);
    expect(pos.x).toBeLessThan(bounds.cols);
    expect(pos.x >= 0).toBe(true);
  });
});
