// tests/constellation-logic.test.js — table-driven unit tests for the PURE
// logic in games/stargazer/constellation-logic.js. No DOM, no Canvas, no
// gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import {
  findHoveredDot,
  promptForDot,
  connectDots,
} from '../games/stargazer/constellation-logic.js';

// ---------------------------------------------------------------------------
// findHoveredDot
// ---------------------------------------------------------------------------

describe('findHoveredDot', () => {
  const cursor = { x: 100, y: 100 };

  const table = [
    {
      name: 'returns null when no dot is within radius',
      input: { cursor, dots: [{ x: 0, y: 0 }], radius: 10 },
      expected: null,
    },
    {
      name: 'returns the dot when exactly on it (distance 0)',
      input: { cursor, dots: [{ x: 100, y: 100 }], radius: 5 },
      expected: { x: 100, y: 100 },
    },
    {
      name: 'returns the dot when just inside the radius',
      input: { cursor, dots: [{ x: 100, y: 100 }], radius: 1 },
      expected: { x: 100, y: 100 },
    },
    {
      name: 'returns null when just outside the radius',
      input: { cursor, dots: [{ x: 105, y: 100 }], radius: 4 },
      expected: null,
    },
    {
      name: 'returns null at distance === radius + 1',
      input: { cursor, dots: [{ x: 111, y: 100 }], radius: 10 },
      expected: null,
    },
    {
      name: 'hits at distance === radius (boundary inclusive)',
      input: { cursor, dots: [{ x: 110, y: 100 }], radius: 10 },
      expected: { x: 110, y: 100 },
    },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(findHoveredDot(input.cursor, input.dots, input.radius)).toEqual(expected);
    });
  });

  it('picks the FIRST of multiple dots within radius (array-order precedence)', () => {
    const dots = [
      { x: 100, y: 100, id: 'a' }, // exact hit, first
      { x: 101, y: 100, id: 'b' }, // closer-by-array-position second but also in radius
    ];
    const hit = findHoveredDot(cursor, dots, 10);
    expect(hit && hit.id).toBe('a');
  });

  it('picks the first in-range dot even if a later one is geometrically nearer', () => {
    const dots = [
      { x: 108, y: 100, id: 'far-but-first' }, // distance 8
      { x: 101, y: 100, id: 'near-but-second' }, // distance 1
    ];
    const hit = findHoveredDot(cursor, dots, 10);
    expect(hit && hit.id).toBe('far-but-first');
  });

  it('handles a 2D offset (diagonal) correctly', () => {
    // distance from (100,100) to (103,104) = 5 exactly → inside radius 5.
    const hit = findHoveredDot(cursor, [{ x: 103, y: 104 }], 5);
    expect(hit).toEqual({ x: 103, y: 104 });
  });

  it('returns null for an empty dot list', () => {
    expect(findHoveredDot(cursor, [], 50)).toBe(null);
  });

  it('returns null when cursor is null', () => {
    expect(findHoveredDot(null, [{ x: 0, y: 0 }], 50)).toBe(null);
  });

  it('returns null when dots is null', () => {
    expect(findHoveredDot(cursor, null, 50)).toBe(null);
  });

  it('returns null when radius is null', () => {
    expect(findHoveredDot(cursor, [{ x: 100, y: 100 }], null)).toBe(null);
  });

  it('skips sparse holes (undefined entries) in the dot array', () => {
    const dots = [, , { x: 100, y: 100, id: 'c' }];
    const hit = findHoveredDot(cursor, dots, 5);
    expect(hit && hit.id).toBe('c');
  });
});

// ---------------------------------------------------------------------------
// promptForDot
// ---------------------------------------------------------------------------

describe('promptForDot', () => {
  const table = [
    { name: 'bottom', input: { requiredPosition: 'bottom' }, expected: 'bottom' },
    { name: 'right', input: { requiredPosition: 'right' }, expected: 'right' },
    { name: 'left', input: { requiredPosition: 'left' }, expected: 'left' },
    { name: 'top', input: { requiredPosition: 'top' }, expected: 'top' },
  ];

  table.forEach(({ name, input, expected }) => {
    it(`returns the stored requiredPosition (${name})`, () => {
      expect(promptForDot(input)).toBe(expected);
    });
  });

  it('returns the default position when requiredPosition is missing', () => {
    expect(promptForDot({ x: 1, y: 2 })).toBe('bottom');
  });

  it('returns the default position for an empty dot', () => {
    expect(promptForDot({})).toBe('bottom');
  });

  it('returns the default position when the dot is null', () => {
    expect(promptForDot(null)).toBe('bottom');
  });

  it('returns the default position for an unknown requiredPosition', () => {
    expect(promptForDot({ requiredPosition: 'middle' })).toBe('bottom');
  });

  it('does not mutate the dot', () => {
    const dot = { requiredPosition: 'top', x: 5, y: 5 };
    promptForDot(dot);
    expect(dot).toEqual({ requiredPosition: 'top', x: 5, y: 5 });
  });
});

// ---------------------------------------------------------------------------
// connectDots
// ---------------------------------------------------------------------------

describe('connectDots', () => {
  const A = { x: 0, y: 0, id: 'a' };
  const B = { x: 1, y: 1, id: 'b' };
  const C = { x: 2, y: 2, id: 'c' };
  const D = { x: 3, y: 3, id: 'd' };

  it('returns no edges when nothing is ignited', () => {
    expect(connectDots([])).toEqual([]);
  });

  it('returns no edges when one dot is ignited', () => {
    expect(connectDots([A])).toEqual([]);
  });

  it('returns one edge for two ignited dots', () => {
    expect(connectDots([A, B])).toEqual([{ a: A, b: B }]);
  });

  it('returns N-1 edges in ignition order for N dots', () => {
    const edges = connectDots([A, B, C, D]);
    expect(edges).toEqual([
      { a: A, b: B },
      { a: B, b: C },
      { a: C, b: D },
    ]);
    expect(edges.length).toBe(3);
  });

  it('edges reference the SAME dot objects (no clones)', () => {
    const edges = connectDots([A, B]);
    expect(edges[0].a === A).toBe(true);
    expect(edges[0].b === B).toBe(true);
  });

  it('returns [] for null ignited list', () => {
    expect(connectDots(null)).toEqual([]);
  });

  it('returns [] for undefined ignited list', () => {
    expect(connectDots(undefined)).toEqual([]);
  });

  it('is order-sensitive: same dots, different order → different edges', () => {
    expect(connectDots([A, B, C])).toEqual([
      { a: A, b: B },
      { a: B, b: C },
    ]);
    expect(connectDots([C, B, A])).toEqual([
      { a: C, b: B },
      { a: B, b: A },
    ]);
  });
});
