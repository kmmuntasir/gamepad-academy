// tests/sonar-logic.test.js — table-driven unit tests for the PURE logic in
// games/submarine-sonar/sonar-logic.js. No DOM, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import {
  pingRadius,
  revealedByPing,
  nextHeadlightColor,
  markDiscovered,
} from '../games/submarine-sonar/sonar-logic.js';

describe('pingRadius', () => {
  const MAX = 200;
  const DURATION = 1000;

  const table = [
    { name: 'elapsed 0 → 0', input: 0, expected: 0 },
    { name: 'negative elapsed → 0', input: -50, expected: 0 },
    {
      name: 'elapsed at midpoint → easeOut value',
      input: DURATION / 2,
      // t = 0.5 → 1 - (1 - 0.5)^2 = 1 - 0.25 = 0.75 → 150
      expected: MAX * 0.75,
    },
    {
      name: 'elapsed at quarter → easeOut value',
      input: DURATION / 4,
      // t = 0.25 → 1 - (0.75)^2 = 1 - 0.5625 = 0.4375 → 87.5
      expected: MAX * 0.4375,
    },
    { name: 'elapsed == duration → maxRadius', input: DURATION, expected: MAX },
    { name: 'elapsed > duration → maxRadius', input: DURATION + 500, expected: MAX },
    { name: 'elapsed well past duration → maxRadius', input: DURATION * 5, expected: MAX },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(pingRadius(input, MAX, DURATION)).toBe(expected);
    });
  });

  it('is monotonically non-decreasing across the duration', () => {
    let prev = pingRadius(0, MAX, DURATION);
    for (let ms = 50; ms <= DURATION; ms += 50) {
      const r = pingRadius(ms, MAX, DURATION);
      // r >= prev: assert prev is NOT greater than r (prev must be <= r).
      if (prev > r + 1e-9) {
        throw new Error(`radius decreased at ${ms}ms: ${prev} → ${r}`);
      }
      prev = r;
    }
  });

  it('never exceeds maxRadius', () => {
    for (let ms = 0; ms <= DURATION * 2; ms += 100) {
      const r = pingRadius(ms, MAX, DURATION);
      if (r > MAX + 1e-9) {
        throw new Error(`radius ${r} exceeded max ${MAX} at ${ms}ms`);
      }
    }
  });

  it('returns 0 for non-positive maxRadius', () => {
    expect(pingRadius(500, 0, DURATION)).toBe(0);
    expect(pingRadius(500, -10, DURATION)).toBe(0);
  });

  it('returns 0 for non-positive duration', () => {
    expect(pingRadius(500, MAX, 0)).toBe(0);
    expect(pingRadius(500, MAX, -1)).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(pingRadius(NaN, MAX, DURATION)).toBe(0);
    expect(pingRadius(500, Infinity, DURATION)).toBe(0);
    expect(pingRadius(500, MAX, Infinity)).toBe(0);
  });
});

describe('revealedByPing', () => {
  const sub = { x: 100, y: 100 };

  const table = [
    {
      name: 'entity inside radius → revealed',
      entity: { x: 120, y: 100 },
      radius: 50,
      expected: true,
    },
    {
      name: 'entity outside radius → hidden',
      entity: { x: 200, y: 100 },
      radius: 50,
      expected: false,
    },
    {
      name: 'entity exactly on the ring → revealed (boundary inclusive)',
      entity: { x: 100 + 50, y: 100 },
      radius: 50,
      expected: true,
    },
    {
      name: 'entity just past the ring → hidden',
      entity: { x: 100 + 50.001, y: 100 },
      radius: 50,
      expected: false,
    },
    {
      name: 'zero radius → hidden',
      entity: { x: 100, y: 100 },
      radius: 0,
      expected: false,
    },
  ];

  table.forEach(({ name, entity, radius, expected }) => {
    it(name, () => {
      expect(revealedByPing(entity, sub, radius)).toBe(expected);
    });
  });

  it('softens the boundary by the entity radius when present', () => {
    // Entity center 60px away, radius 15 → edge reaches 45px from sub.
    // Ping radius 50 → within (45 <= 50) → revealed.
    const entity = { x: 160, y: 100, r: 15 };
    expect(revealedByPing(entity, sub, 50)).toBe(true);
  });

  it('softens the boundary by half the entity size when present', () => {
    const entity = { x: 165, y: 100, size: 30 }; // half-size 15
    expect(revealedByPing(entity, sub, 50)).toBe(true);
  });

  it('returns false for missing inputs', () => {
    expect(revealedByPing(null, sub, 50)).toBe(false);
    expect(revealedByPing({}, null, 50)).toBe(false);
  });
});

describe('nextHeadlightColor', () => {
  const palette = ['white', 'cyan', 'gold', 'magenta']; // length 4

  const table = [
    { name: 'advances 0 → 1', input: 0, expected: 1 },
    { name: 'advances 1 → 2', input: 1, expected: 2 },
    { name: 'advances 2 → 3', input: 2, expected: 3 },
    { name: 'wraps last (3) → first (0)', input: 3, expected: 0 },
    { name: 'wraps from negative current', input: -1, expected: 0 },
    { name: 'normalizes out-of-range current', input: 5, expected: 2 },
    { name: 'normalizes very large current', input: 99, expected: 0 },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(nextHeadlightColor(input, palette)).toBe(expected);
    });
  });

  it('returns 0 for an empty palette', () => {
    expect(nextHeadlightColor(2, [])).toBe(0);
  });

  it('returns 0 for a non-array palette', () => {
    expect(nextHeadlightColor(2, null)).toBe(0);
    expect(nextHeadlightColor(2, 'cyan')).toBe(0);
  });

  it('always returns 0 for a single-color palette', () => {
    expect(nextHeadlightColor(0, ['white'])).toBe(0);
    expect(nextHeadlightColor(5, ['white'])).toBe(0);
  });

  it('returns 0 for a non-finite current', () => {
    expect(nextHeadlightColor(NaN, palette)).toBe(0);
  });
});

describe('markDiscovered', () => {
  it('marks a fresh entity as discovered and returns true', () => {
    const set = new Set();
    const entity = { id: 3, discovered: false };
    expect(markDiscovered(entity, set)).toBe(true);
    expect(entity.discovered).toBe(true);
    expect(set.has(3)).toBe(true);
    expect(set.size).toBe(1);
  });

  it('does not double-count an already-discovered entity', () => {
    const set = new Set([3]);
    const entity = { id: 3, discovered: true };
    expect(markDiscovered(entity, set)).toBe(false);
    expect(set.size).toBe(1);
  });

  it('dedupes across ping-reveal then overlap (same set)', () => {
    const set = new Set();
    const entity = { id: 7, discovered: false };
    // First encounter (say, a ping reveal).
    expect(markDiscovered(entity, set)).toBe(true);
    // Second encounter (say, a sub overlap) is a silent no-op.
    expect(markDiscovered(entity, set)).toBe(false);
    expect(set.size).toBe(1);
  });

  const badInputs = [
    { name: 'null entity', entity: null },
    { name: 'undefined entity', entity: undefined },
    { name: 'entity missing id', entity: { discovered: false } },
    { name: 'entity with non-numeric id', entity: { id: 'x' } },
    { name: 'entity with NaN id', entity: { id: NaN } },
  ];
  badInputs.forEach(({ name, entity }) => {
    it(`returns false and does not mutate for ${name}`, () => {
      const set = new Set();
      expect(markDiscovered(entity, set)).toBe(false);
      expect(set.size).toBe(0);
    });
  });

  it('returns false when discoveredSet is missing', () => {
    expect(markDiscovered({ id: 1, discovered: false }, null)).toBe(false);
    expect(markDiscovered({ id: 1, discovered: false }, undefined)).toBe(false);
  });

  it('accumulates distinct creatures in the same set', () => {
    const set = new Set();
    expect(markDiscovered({ id: 1, discovered: false }, set)).toBe(true);
    expect(markDiscovered({ id: 2, discovered: false }, set)).toBe(true);
    expect(markDiscovered({ id: 3, discovered: false }, set)).toBe(true);
    expect(set.size).toBe(3);
  });

  it('handles negative and fractional ids as valid distinct ids', () => {
    const set = new Set();
    expect(markDiscovered({ id: -1, discovered: false }, set)).toBe(true);
    expect(markDiscovered({ id: -1, discovered: false }, set)).toBe(false);
    expect(set.size).toBe(1);
  });
});
