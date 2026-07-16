// tests/feeder-logic.test.js — table-driven unit tests for the PURE logic in
// games/color-match-feeder/feeder-logic.js. No DOM, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import {
  createFood,
  isInEatZone,
  positionMatchesPrompt,
  updateFood,
} from '../games/color-match-feeder/feeder-logic.js';

const VALID_POSITIONS = ['bottom', 'right', 'left', 'top'];

// A small deterministic RNG builder: returns a function that yields the
// provided sequence of numbers in order, then repeats the last value.
function rngFrom(sequence) {
  let i = 0;
  return () => {
    if (i < sequence.length) return sequence[i++];
    return sequence[sequence.length - 1];
  };
}

describe('createFood', () => {
  const table = [
    {
      name: 'rand=0.0 → first position (bottom), top edge, min speed',
      rand: [0.0, 0.0, 0.0],
      expectPosition: 'bottom',
    },
    {
      name: 'rand=0.25 → second position (right)',
      rand: [0.25, 0.5, 0.5],
      expectPosition: 'right',
    },
    {
      name: 'rand=0.5 → third position (left)',
      rand: [0.5, 0.5, 0.5],
      expectPosition: 'left',
    },
    {
      name: 'rand=0.99 → fourth position (top)',
      rand: [0.99, 0.5, 0.5],
      expectPosition: 'top',
    },
  ];

  table.forEach(({ name, rand, expectPosition }) => {
    it(name, () => {
      const food = createFood({ width: 800, height: 600, rand: rngFrom(rand) });
      expect(food.position).toBe(expectPosition);
    });
  });

  it('always returns a valid positional face button', () => {
    for (let i = 0; i < 50; i++) {
      const food = createFood({ width: 800, height: 600 });
      expect(VALID_POSITIONS.includes(food.position)).toBe(true);
    }
  });

  it('returns all required fields with correct types', () => {
    const food = createFood({ width: 400, height: 300, rand: rngFrom([0.4, 0.4, 0.4]) });
    expect(typeof food.x).toBe('number');
    expect(typeof food.y).toBe('number');
    expect(typeof food.speed).toBe('number');
    expect(food.eaten).toBe(false);
  });

  it('starts off-screen (past an edge)', () => {
    // rand sequence: position=top(0), edge=left(2), x fraction, y fraction, speed
    // Force the LEFT edge by making the second draw land in bucket 2.
    const food = createFood({ width: 400, height: 300, rand: rngFrom([0.1, 0.6, 0.5, 0.5, 0.5]) });
    expect(food.x < 0).toBe(true);
  });

  it('speed stays within [45, 85]', () => {
    for (let r = 0; r <= 1; r += 0.1) {
      const food = createFood({ width: 800, height: 600, rand: rngFrom([0.1, 0.1, 0.1, 0.1, r]) });
      expect(food.speed >= 45).toBe(true);
      expect(food.speed <= 85).toBe(true);
    }
  });

  it('returns a fresh object each call (no shared mutation)', () => {
    const rand = rngFrom([0.1, 0.1, 0.1, 0.1, 0.5]);
    const a = createFood({ width: 800, height: 600, rand });
    const b = createFood({ width: 800, height: 600, rand: rngFrom([0.1, 0.1, 0.1, 0.1, 0.5]) });
    expect(a).toEqual(b);
    expect(a === b).toBe(false);
  });
});

describe('isInEatZone', () => {
  const monster = { x: 400, y: 300 };
  const radius = 90;

  const table = [
    {
      name: 'food at monster center → in zone',
      food: { x: 400, y: 300 },
      expected: true,
    },
    {
      name: 'food just inside radius → in zone',
      food: { x: 400 + 50, y: 300 },
      expected: true,
    },
    {
      name: 'food exactly on radius → in zone (inclusive)',
      food: { x: 400 + 90, y: 300 },
      expected: true,
    },
    {
      name: 'food just outside radius → out of zone',
      food: { x: 400 + 91, y: 300 },
      expected: false,
    },
    {
      name: 'food far away → out of zone',
      food: { x: 0, y: 0 },
      expected: false,
    },
    {
      name: 'diagonal within radius → in zone',
      food: { x: 400 + 60, y: 300 + 60 },
      expected: true, // ~84.85 < 90
    },
  ];

  table.forEach(({ name, food, expected }) => {
    it(name, () => {
      expect(isInEatZone(food, monster, radius)).toBe(expected);
    });
  });

  it('returns false for missing food', () => {
    expect(isInEatZone(null, monster, radius)).toBe(false);
  });

  it('returns false for missing monster', () => {
    expect(isInEatZone({ x: 0, y: 0 }, null, radius)).toBe(false);
  });
});

describe('positionMatchesPrompt', () => {
  const table = [
    { name: 'bottom matches bottom', position: 'bottom', prompt: 'bottom', expected: true },
    { name: 'right matches right', position: 'right', prompt: 'right', expected: true },
    { name: 'left matches left', position: 'left', prompt: 'left', expected: true },
    { name: 'top matches top', position: 'top', prompt: 'top', expected: true },
    { name: 'bottom ≠ right', position: 'bottom', prompt: 'right', expected: false },
    { name: 'left ≠ top', position: 'left', prompt: 'top', expected: false },
    { name: 'right ≠ left', position: 'right', prompt: 'left', expected: false },
    { name: 'top ≠ bottom', position: 'top', prompt: 'bottom', expected: false },
  ];

  table.forEach(({ name, position, prompt, expected }) => {
    it(name, () => {
      expect(positionMatchesPrompt(position, prompt)).toBe(expected);
    });
  });
});

describe('updateFood', () => {
  const monster = { x: 400, y: 300 };

  it('advances food toward the monster by speed * dt', () => {
    const food = { position: 'bottom', x: 400, y: 0, speed: 50, eaten: false };
    const dt = 2; // 100 px of travel
    const next = updateFood(food, monster, dt);
    // Started 300px directly above; moved 100px down → y = 100, x unchanged.
    expect(Math.round(next.x)).toBe(400);
    expect(Math.round(next.y)).toBe(100);
  });

  it('preserves all non-position fields', () => {
    const food = { position: 'left', x: 0, y: 300, speed: 60, eaten: false };
    const next = updateFood(food, monster, 1);
    expect(next.position).toBe('left');
    expect(next.speed).toBe(60);
    expect(next.eaten).toBe(false);
  });

  it('moves diagonally toward the monster', () => {
    const food = { position: 'top', x: 0, y: 0, speed: 100, eaten: false };
    // Distance from (0,0) to (400,300) = 500. dt=1 → travel 100 → 20% of the way.
    const next = updateFood(food, monster, 1);
    expect(Math.round(next.x)).toBe(80); // 20% of 400
    expect(Math.round(next.y)).toBe(60); // 20% of 300
  });

  it('does not overshoot past the monster', () => {
    const food = { position: 'bottom', x: 400, y: 0, speed: 1000, eaten: false };
    const next = updateFood(food, monster, 1);
    expect(next.x).toBe(400);
    expect(next.y).toBe(300);
  });

  it('handles travel larger than remaining distance (clamps to monster)', () => {
    const food = { position: 'right', x: 390, y: 300, speed: 100, eaten: false };
    const next = updateFood(food, monster, 1); // 100px travel, only 10px to go
    expect(next.x).toBe(400);
    expect(next.y).toBe(300);
  });

  it('negative dt is treated as zero (no backward motion)', () => {
    const food = { position: 'bottom', x: 400, y: 0, speed: 50, eaten: false };
    const next = updateFood(food, monster, -1);
    expect(next.x).toBe(400);
    expect(next.y).toBe(0);
  });

  it('does not mutate the input food', () => {
    const food = { position: 'bottom', x: 400, y: 0, speed: 50, eaten: false };
    updateFood(food, monster, 1);
    expect(food.x).toBe(400);
    expect(food.y).toBe(0);
  });

  it('returns the input for missing monster', () => {
    const food = { position: 'bottom', x: 400, y: 0, speed: 50, eaten: false };
    const next = updateFood(food, null, 1);
    expect(next).toBe(food);
  });
});
