// tests/constellation-logic.test.js — table-driven unit tests for the PURE
// logic in games/stargazer/constellation-logic.js. No DOM, no Canvas, no
// gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import {
  findHoveredDot,
  promptForDot,
  connectDots,
  isComplete,
  stepCursorVelocity,
  celebrationAlpha,
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

// ---------------------------------------------------------------------------
// isComplete
// ---------------------------------------------------------------------------

describe('isComplete', () => {
  it('returns true when every dot is ignited', () => {
    const dots = [{ x: 0 }, { x: 1 }, { x: 2 }];
    const ignited = [{ x: 0 }, { x: 1 }, { x: 2 }];
    expect(isComplete(ignited, dots)).toBe(true);
  });

  it('returns false when only some dots are ignited', () => {
    const dots = [{ x: 0 }, { x: 1 }, { x: 2 }];
    const ignited = [{ x: 0 }];
    expect(isComplete(ignited, dots)).toBe(false);
  });

  it('returns false when nothing is ignited', () => {
    const dots = [{ x: 0 }, { x: 1 }];
    expect(isComplete([], dots)).toBe(false);
  });

  it('returns false when there are no dots', () => {
    expect(isComplete([], [])).toBe(false);
  });

  it('returns false for null inputs', () => {
    expect(isComplete(null, null)).toBe(false);
  });

  it('returns true when lit exceeds total (defensive overcount)', () => {
    const dots = [{ x: 0 }];
    const ignited = [{ x: 0 }, { x: 1 }];
    expect(isComplete(ignited, dots)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stepCursorVelocity
// ---------------------------------------------------------------------------

describe('stepCursorVelocity', () => {
  it('decays velocity toward 0 when target is 0', () => {
    const out = stepCursorVelocity({ vx: 100, vy: 100 }, { tvx: 0, tvy: 0 }, { decel: 6, dt: 0.1 });
    expect(out.vx < 100).toBe(true);
    expect(out.vy < 100).toBe(true);
    expect(out.vx > 0).toBe(true); // not instant freeze — still gliding
    expect(out.vy > 0).toBe(true);
  });

  it('asymptotically approaches zero but never overshoots', () => {
    let v = { vx: 100, vy: 0 };
    for (let i = 0; i < 60; i++) {
      v = stepCursorVelocity(v, { tvx: 0, tvy: 0 }, { decel: 6, dt: 1 / 60 });
    }
    expect(v.vx < 1).toBe(true);
    expect(v.vx >= 0).toBe(true);
  });

  it('approaches a non-zero target', () => {
    let v = { vx: 0, vy: 0 };
    for (let i = 0; i < 30; i++) {
      v = stepCursorVelocity(v, { tvx: 200, tvy: 0 }, { decel: 6, dt: 1 / 60 });
    }
    expect(v.vx > 150).toBe(true);
    expect(v.vx <= 200).toBe(true);
  });

  it('is frame-rate independent: two 0.5-dt steps ≈ one 1.0-dt step', () => {
    const opts = { decel: 6, dt: 0.1 };
    const one = stepCursorVelocity({ vx: 0, vy: 0 }, { tvx: 100, tvy: 0 }, opts);
    const halfOptsA = { decel: 6, dt: 0.05 };
    const step1 = stepCursorVelocity({ vx: 0, vy: 0 }, { tvx: 100, tvy: 0 }, halfOptsA);
    const two = stepCursorVelocity(step1, { tvx: 100, tvy: 0 }, halfOptsA);
    expect(Math.abs(one.vx - two.vx) < 0.5).toBe(true);
    expect(Math.abs(one.vy - two.vy) < 0.5).toBe(true);
  });

  it('handles missing inputs safely (no NaN, no throw)', () => {
    const out = stepCursorVelocity({}, {}, {});
    expect(Number.isFinite(out.vx)).toBe(true);
    expect(Number.isFinite(out.vy)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// celebrationAlpha
// ---------------------------------------------------------------------------

describe('celebrationAlpha', () => {
  it('returns 0 before the window starts', () => {
    expect(celebrationAlpha(-100, 3000)).toBe(0);
  });

  it('returns 0 after the window ends', () => {
    expect(celebrationAlpha(4000, 3000)).toBe(0);
  });

  it('returns a value within [0, 1] inside the window', () => {
    for (let t = 0; t <= 3000; t += 100) {
      const a = celebrationAlpha(t, 3000);
      expect(a >= 0).toBe(true);
      expect(a <= 1).toBe(true);
    }
  });

  it('peaks near the midpoint of the window', () => {
    const dur = 3000;
    const mid = celebrationAlpha(dur / 2, dur);
    const early = celebrationAlpha(dur * 0.1, dur);
    const late = celebrationAlpha(dur * 0.9, dur);
    expect(mid > early).toBe(true);
    expect(mid > late).toBe(true);
  });

  it('returns 0 at exactly t=0 and t=duration', () => {
    expect(celebrationAlpha(0, 3000)).toBe(0);
    // At t=duration, sin(π) ≈ 1.2e-16 — effectively 0.
    expect(Math.abs(celebrationAlpha(3000, 3000)) < 1e-9).toBe(true);
  });
});
