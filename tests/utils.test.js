// tests/utils.test.js — table-driven unit tests for the PURE math helpers in
// shared/utils.js. Audio helpers are intentionally NOT tested here (they touch
// the browser AudioContext and are covered by manual playtesting per the rules).
import { describe, it, expect } from './harness.js';
import {
  clamp,
  lerp,
  randomInt,
  randomFloat,
  pick,
  magnitude,
  distance,
  circleCollision,
  aabbCollision,
} from '../shared/utils.js';

describe('clamp', () => {
  const table = [
    { name: 'inside bounds stays', input: [5, 0, 10], expected: 5 },
    { name: 'at min bound', input: [0, 0, 10], expected: 0 },
    { name: 'at max bound', input: [10, 0, 10], expected: 10 },
    { name: 'below min clamps to min', input: [-3, 0, 10], expected: 0 },
    { name: 'above max clamps to max', input: [42, 0, 10], expected: 10 },
    { name: 'negative min bound', input: [-5, -10, 10], expected: -5 },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(clamp(...input)).toBe(expected);
    });
  });
});

describe('lerp', () => {
  const table = [
    { name: 'at start (t=0)', input: [0, 10, 0], expected: 0 },
    { name: 'at end (t=1)', input: [0, 10, 1], expected: 10 },
    { name: 'at mid (t=0.5)', input: [0, 10, 0.5], expected: 5 },
    { name: 'offset start', input: [2, 6, 0.5], expected: 4 },
    { name: 'decreasing range', input: [10, 0, 0.5], expected: 5 },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(lerp(...input)).toBe(expected);
    });
  });
});

describe('randomInt', () => {
  it('returns an integer within [min, max] inclusive over many runs', () => {
    const MIN = 3;
    const MAX = 7;
    for (let i = 0; i < 200; i += 1) {
      const v = randomInt(MIN, MAX);
      expect(Number.isInteger(v)).toBe(true);
      expect(v >= MIN && v <= MAX).toBe(true);
    }
  });

  it('can hit both bounds over many runs', () => {
    let hitMin = false;
    let hitMax = false;
    for (let i = 0; i < 500; i += 1) {
      const v = randomInt(1, 4);
      if (v === 1) hitMin = true;
      if (v === 4) hitMax = true;
    }
    expect(hitMin && hitMax).toBe(true);
  });

  it('returns the single value when min === max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });
});

describe('randomFloat', () => {
  it('returns a float within [min, max) over many runs', () => {
    const MIN = 1.5;
    const MAX = 2.5;
    for (let i = 0; i < 200; i += 1) {
      const v = randomFloat(MIN, MAX);
      expect(v >= MIN && v < MAX).toBe(true);
    }
  });
});

describe('pick', () => {
  it('returns an element of the array', () => {
    const arr = ['cat', 'dog', 'bird', 'frog'];
    for (let i = 0; i < 50; i += 1) {
      expect(arr.includes(pick(arr))).toBe(true);
    }
  });

  it('can return every element over many runs', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const seen = new Set();
    for (let i = 0; i < 400; i += 1) {
      seen.add(pick(arr));
    }
    expect(seen.size).toBe(arr.length);
  });
});

describe('magnitude', () => {
  it('returns the hypotenuse, clamped to <= 1', () => {
    expect(magnitude(0.6, 0.8)).toBe(1);
    expect(magnitude(3, 4)).toBe(1);
    expect(magnitude(0, 0)).toBe(0);
  });
});

describe('distance', () => {
  it('zero between coincident points', () => {
    expect(distance(5, 5, 5, 5)).toBe(0);
  });

  it('matches a 3-4-5 triangle', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('is symmetric', () => {
    expect(distance(1, 2, 4, 6)).toBe(distance(4, 6, 1, 2));
  });
});

describe('circleCollision', () => {
  it('true when circles overlap', () => {
    const a = { x: 0, y: 0, r: 5 };
    const b = { x: 6, y: 0, r: 5 };
    expect(circleCollision(a, b)).toBe(true);
  });

  it('true when circles just touch at the boundary', () => {
    const a = { x: 0, y: 0, r: 3 };
    const b = { x: 8, y: 0, r: 5 }; // distance 8 === 3 + 5
    expect(circleCollision(a, b)).toBe(true);
  });

  it('false when circles are just apart', () => {
    const a = { x: 0, y: 0, r: 3 };
    const b = { x: 9, y: 0, r: 5 }; // distance 9 > 3 + 5
    expect(circleCollision(a, b)).toBe(false);
  });

  it('true for coincident centers', () => {
    const a = { x: 1, y: 1, r: 2 };
    const b = { x: 1, y: 1, r: 2 };
    expect(circleCollision(a, b)).toBe(true);
  });
});

describe('aabbCollision', () => {
  it('true when boxes overlap', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 5, y: 5, w: 10, h: 10 };
    expect(aabbCollision(a, b)).toBe(true);
  });

  it('false when boxes only share an edge (strict overlap)', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 10, y: 0, w: 10, h: 10 }; // left edge of b touches right edge of a
    expect(aabbCollision(a, b)).toBe(false);
  });

  it('true with a 1-unit overlap along x', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 9, y: 0, w: 10, h: 10 };
    expect(aabbCollision(a, b)).toBe(true);
  });

  it('false when boxes do not overlap', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 20, y: 20, w: 5, h: 5 };
    expect(aabbCollision(a, b)).toBe(false);
  });

  it('false for adjacent-but-gap', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 11, y: 0, w: 5, h: 5 }; // 1-unit gap
    expect(aabbCollision(a, b)).toBe(false);
  });
});
