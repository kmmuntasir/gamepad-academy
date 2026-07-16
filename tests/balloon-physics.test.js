// tests/balloon-physics.test.js — table-driven unit tests for the PURE logic
// in games/hot-air-balloon/balloon-physics.js. No DOM, no gamepad, no side
// effects.
import { describe, it, expect } from './harness.js';
import {
  verticalVelocity,
  collectStar,
  cloudBounce,
} from '../games/hot-air-balloon/balloon-physics.js';

// Shared physics constants keep the tables readable.
const GRAVITY = 220;
const MAX_THRUST = 520;
const DT = 1 / 60; // one 60fps frame

describe('verticalVelocity', () => {
  // Sign convention reminder (from the module docs):
  //   NEGATIVE vy = upward (rising), POSITIVE vy = downward (falling).

  it('value 0 (released) → pure gravity: vy increases (more downward)', () => {
    const next = verticalVelocity(0, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy: 0, dt: DT });
    // vy' = 0 + (220 - 0) * (1/60) ≈ +3.667 → falling
    expect(next).toBe(GRAVITY * DT);
    expect(next > 0).toBe(true);
  });

  it('value 1.0 (max thrust) → thrust > gravity: vy decreases (rises)', () => {
    const next = verticalVelocity(1, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy: 0, dt: DT });
    // vy' = 0 + (220 - 520) * (1/60) = -300/60 = -5 → rising
    expect(next).toBe((GRAVITY - MAX_THRUST) * DT);
    expect(next < 0).toBe(true);
  });

  it('value 0.5 (partial) → thrust = 260 > gravity 220: still rises, but gently', () => {
    const next = verticalVelocity(0.5, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy: 0, dt: DT });
    // thrust = 0.5 * 520 = 260; vy' = (220 - 260) * (1/60) = -40/60 ≈ -0.667
    const expected = (GRAVITY - 0.5 * MAX_THRUST) * DT;
    expect(next).toBe(expected);
    expect(next < 0).toBe(true);
  });

  it('hover point: thrust == gravity → vy unchanged', () => {
    // maxThrust/2 must equal gravity for an exact hover at value=0.5.
    const hoverMaxThrust = GRAVITY * 2; // so 0.5 * maxThrust = gravity
    const next = verticalVelocity(0.5, {
      gravity: GRAVITY,
      maxThrust: hoverMaxThrust,
      vy: -10,
      dt: DT,
    });
    expect(next).toBe(-10); // unchanged
  });

  it('accumulates over two frames (released: pure gravity twice)', () => {
    let vy = 0;
    vy = verticalVelocity(0, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy, dt: DT });
    vy = verticalVelocity(0, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy, dt: DT });
    expect(vy).toBe(2 * GRAVITY * DT);
  });

  it('clamps value > 1 to 1 (max thrust)', () => {
    const next = verticalVelocity(1.7, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy: 0, dt: DT });
    expect(next).toBe((GRAVITY - MAX_THRUST) * DT);
  });

  it('clamps value < 0 to 0 (pure gravity)', () => {
    const next = verticalVelocity(-0.4, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy: 0, dt: DT });
    expect(next).toBe(GRAVITY * DT);
  });

  it('treats NaN value as 0 (fail-soft, no inversion)', () => {
    const next = verticalVelocity(NaN, { gravity: GRAVITY, maxThrust: MAX_THRUST, vy: 5, dt: DT });
    expect(next).toBe(5 + GRAVITY * DT);
  });
});

describe('collectStar', () => {
  const balloon = { x: 100, y: 100, r: 30 };

  const table = [
    { name: 'centers overlap → collect', star: { x: 100, y: 100, r: 10 }, expected: true },
    { name: 'edge touch counts (dist == r1 + r2)', star: { x: 140, y: 100, r: 10 }, expected: true },
    { name: 'just past edge → miss', star: { x: 142, y: 100, r: 10 }, expected: false },
    { name: 'far away → miss', star: { x: 300, y: 300, r: 10 }, expected: false },
  ];

  table.forEach(({ name, star, expected }) => {
    it(name, () => {
      expect(collectStar(balloon, star)).toBe(expected);
    });
  });

  it('returns false for missing balloon', () => {
    expect(collectStar(null, { x: 0, y: 0, r: 5 })).toBe(false);
  });

  it('returns false for missing star', () => {
    expect(collectStar(balloon, null)).toBe(false);
  });
});

describe('cloudBounce', () => {
  it('returns the documented nudge shape {x, y, vy}', () => {
    const balloon = { x: 100, y: 100, r: 30 };
    const cloud = { x: 100, y: 130, r: 30 }; // overlapping below the balloon
    const nudge = cloudBounce(balloon, cloud);
    expect(typeof nudge.x === 'number').toBe(true);
    expect(typeof nudge.y === 'number').toBe(true);
    expect(typeof nudge.vy === 'number').toBe(true);
  });

  it('default upward vy bump is -40 (px/s; negative = up per sign convention)', () => {
    const balloon = { x: 100, y: 100, r: 30 };
    const cloud = { x: 100, y: 130, r: 30 };
    const nudge = cloudBounce(balloon, cloud);
    expect(nudge.vy).toBe(-40);
  });

  it('pushes the balloon away from the cloud center (overlap → outward x/y)', () => {
    // Cloud to the LEFT of balloon; nudge.x should be positive (push right).
    const balloon = { x: 120, y: 100, r: 30 };
    const cloud = { x: 90, y: 100, r: 30 }; // overlap: dist 30 < r1+r2 60
    const nudge = cloudBounce(balloon, cloud);
    expect(nudge.x > 0).toBe(true);
  });

  it('non-overlapping pair → zero position nudge (still the upward bump)', () => {
    const balloon = { x: 0, y: 0, r: 10 };
    const cloud = { x: 500, y: 500, r: 10 };
    const nudge = cloudBounce(balloon, cloud);
    expect(nudge.x).toBe(0);
    expect(nudge.y).toBe(0);
    expect(nudge.vy).toBe(-40);
  });

  it('is deterministic: identical inputs produce identical nudges', () => {
    const balloon = { x: 80, y: 90, r: 28 };
    const cloud = { x: 110, y: 80, r: 40 };
    const a = cloudBounce(balloon, cloud);
    const b = cloudBounce(balloon, cloud);
    expect(a).toEqual(b);
  });

  it('honors a custom bumpVy', () => {
    const balloon = { x: 0, y: 0, r: 5 };
    const cloud = { x: 6, y: 0, r: 5 };
    const nudge = cloudBounce(balloon, cloud, { bumpVy: -80 });
    expect(nudge.vy).toBe(-80);
  });
});
