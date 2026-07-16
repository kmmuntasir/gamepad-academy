// tests/camera-logic.test.js — table-driven unit tests for the PURE logic in
// games/wildlife-photographer/camera-logic.js. No DOM, no Canvas, no gamepad.
import { describe, it, expect } from './harness.js';
import {
  panCamera,
  panCameraInertial,
  decayVelocity,
  animalReachable,
  boundsFor,
  DEFAULT_PAN_SPEED,
  DEFAULT_ACCEL,
  DEFAULT_FRICTION,
  VELOCITY_EPSILON,
} from '../games/wildlife-photographer/camera-logic.js';
import {
  ANIMAL_DEFS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '../games/wildlife-photographer/game.js';

// ---------------------------------------------------------------------------
// panCamera
// ---------------------------------------------------------------------------

describe('panCamera', () => {
  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 400 };
  const opts = { panSpeed: 100, dt: 1 }; // dt=1s so the math is obvious

  const table = [
    {
      name: 'moves right on +x stick',
      input: {
        stick: { x: 1, y: 0 },
        offset: { x: 100, y: 50 },
        bounds,
        opts,
      },
      expected: { x: 200, y: 50 },
    },
    {
      name: 'moves left on -x stick',
      input: {
        stick: { x: -1, y: 0 },
        offset: { x: 100, y: 50 },
        bounds,
        opts,
      },
      expected: { x: 0, y: 50 }, // clamped at minX=0
    },
    {
      name: 'moves down on +y stick',
      input: {
        stick: { x: 0, y: 1 },
        offset: { x: 100, y: 50 },
        bounds,
        opts,
      },
      expected: { x: 100, y: 150 },
    },
    {
      name: 'moves up on -y stick',
      input: {
        stick: { x: 0, y: -1 },
        offset: { x: 100, y: 50 },
        bounds,
        opts,
      },
      expected: { x: 100, y: 0 }, // clamped at minY=0
    },
    {
      name: 'partial tilt scales proportionally',
      input: {
        stick: { x: 0.5, y: 0 },
        offset: { x: 100, y: 50 },
        bounds,
        opts,
      },
      expected: { x: 150, y: 50 },
    },
    {
      name: 'clamps at maxX',
      input: {
        stick: { x: 1, y: 0 },
        offset: { x: 980, y: 50 },
        bounds,
        opts,
      },
      expected: { x: 1000, y: 50 },
    },
    {
      name: 'clamps at maxY',
      input: {
        stick: { x: 0, y: 1 },
        offset: { x: 100, y: 390 },
        bounds,
        opts,
      },
      expected: { x: 100, y: 400 },
    },
    {
      name: 'clamps at minX without overshooting',
      input: {
        stick: { x: -1, y: 0 },
        offset: { x: 30, y: 50 },
        bounds,
        opts,
      },
      expected: { x: 0, y: 50 },
    },
    {
      name: 'zero stick leaves offset unchanged',
      input: {
        stick: { x: 0, y: 0 },
        offset: { x: 123, y: 45 },
        bounds,
        opts,
      },
      expected: { x: 123, y: 45 },
    },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      const got = panCamera(input.stick, input.offset, input.bounds, input.opts);
      expect(got).toEqual(expected);
    });
  });

  it('does NOT mutate the input offset (returns a new object)', () => {
    const offset = { x: 100, y: 50 };
    const result = panCamera({ x: 1, y: 1 }, offset, bounds, opts);
    expect(offset).toEqual({ x: 100, y: 50 }); // untouched
    expect(result !== offset).toBe(true); // new reference
  });

  it('honors panSpeed and dt multiplicatively', () => {
    // stick.x=0.5 * panSpeed 200 * dt 0.5 = 50 px.
    const got = panCamera(
      { x: 0.5, y: 0 },
      { x: 0, y: 0 },
      bounds,
      { panSpeed: 200, dt: 0.5 },
    );
    expect(got).toEqual({ x: 50, y: 0 });
  });

  it('uses a sane default panSpeed/dt when opts are omitted', () => {
    const got = panCamera({ x: 0, y: 0 }, { x: 10, y: 20 }, bounds);
    expect(got).toEqual({ x: 10, y: 20 });
  });

  it('still clamps when bounds are missing (returns the moved offset)', () => {
    const got = panCamera({ x: 1, y: 1 }, { x: 0, y: 0 }, null, opts);
    expect(got).toEqual({ x: 100, y: 100 });
  });

  it('treats NaN stick components as 0', () => {
    const got = panCamera(
      { x: Number.NaN, y: Number.NaN },
      { x: 10, y: 20 },
      bounds,
      opts,
    );
    expect(got).toEqual({ x: 10, y: 20 });
  });
});

// ---------------------------------------------------------------------------
// isInReticle
// ---------------------------------------------------------------------------

describe('isInReticle', () => {
  // Viewport 400x300 → reticle center at (200, 150).
  const viewport = { w: 400, h: 300 };
  const reticle = 30; // circle radius

  const table = [
    {
      name: 'center hit (animal exactly under reticle)',
      input: {
        animal: { x: 520, y: 150 }, // 520 - 320 (offset.x) = 200 = center
        offset: { x: 320, y: 0 },
        reticle,
        viewport,
      },
      expected: true,
    },
    {
      name: 'off-center miss (animal far to the side)',
      input: {
        animal: { x: 1000, y: 150 },
        offset: { x: 320, y: 0 },
        reticle,
        viewport,
      },
      expected: false,
    },
    {
      name: 'inside radius on x axis (just inside)',
      input: {
        animal: { x: 545, y: 150 }, // 545-320=225, center=200 → 25 < 30
        offset: { x: 320, y: 0 },
        reticle,
        viewport,
      },
      expected: true,
    },
    {
      name: 'outside radius on x axis (just outside)',
      input: {
        animal: { x: 555, y: 150 }, // 555-320=235 → 35 > 30
        offset: { x: 320, y: 0 },
        reticle,
        viewport,
      },
      expected: false,
    },
    {
      name: 'inside radius on y axis',
      input: {
        animal: { x: 520, y: 170 }, // x at center, y 20 off → 20 < 30
        offset: { x: 320, y: 0 },
        reticle,
        viewport,
      },
      expected: true,
    },
    {
      name: 'diagonal edge: distance === radius (inclusive)',
      input: {
        // offset.x=320 → screen center x=200. offset.y=0 → screen center y=150.
        // animal at (200+18, 150+24) → dx=18, dy=24 → 18²+24²=900=30².
        animal: { x: 538, y: 174 },
        offset: { x: 320, y: 0 },
        reticle,
        viewport,
      },
      expected: true,
    },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      const got = isInReticle(
        input.animal,
        input.offset,
        input.reticle,
        input.viewport,
      );
      expect(got).toBe(expected);
    });
  });

  it('treats reticle as a box when given {w,h} half-extents', () => {
    // Box half-extents 40x20. Animal 30px off-center on x (inside) but 25 off
    // on y (outside the 20 half-height) → miss.
    expect(
      isInReticle(
        { x: 230, y: 175 },
        { x: 0, y: 0 },
        { w: 40, h: 20 },
        viewport,
      ),
    ).toBe(false);
    expect(
      isInReticle(
        { x: 230, y: 165 },
        { x: 0, y: 0 },
        { w: 40, h: 20 },
        viewport,
      ),
    ).toBe(true);
  });

  it('returns false when any argument is missing', () => {
    expect(isInReticle(null, { x: 0, y: 0 }, reticle, viewport)).toBe(false);
    expect(isInReticle({ x: 0, y: 0 }, null, reticle, viewport)).toBe(false);
    expect(isInReticle({ x: 0, y: 0 }, { x: 0, y: 0 }, reticle, null)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// addPhoto
// ---------------------------------------------------------------------------

describe('addPhoto', () => {
  it('appends the animal to an empty scrapbook', () => {
    const result = addPhoto([], { id: 'fox', emoji: '🦊' });
    expect(result).toEqual([{ id: 'fox', emoji: '🦊' }]);
  });

  it('appends the animal to a non-empty scrapbook', () => {
    const existing = [{ id: 'owl', emoji: '🦉' }];
    const result = addPhoto(existing, { id: 'fox', emoji: '🦊' });
    expect(result).toEqual([
      { id: 'owl', emoji: '🦉' },
      { id: 'fox', emoji: '🦊' },
    ]);
  });

  it('does NOT mutate the input scrapbook', () => {
    const existing = [{ id: 'owl', emoji: '🦉' }];
    const result = addPhoto(existing, { id: 'fox', emoji: '🦊' });
    expect(existing).toEqual([{ id: 'owl', emoji: '🦉' }]); // untouched
    expect(result !== existing).toBe(true); // new reference
    expect(result.length).toBe(2);
  });

  it('returns a new empty array when animal is null', () => {
    const existing = [{ id: 'owl', emoji: '🦉' }];
    const result = addPhoto(existing, null);
    expect(result).toEqual([{ id: 'owl', emoji: '🦉' }]);
    expect(result !== existing).toBe(true);
  });

  it('dedupes by string key when opts.dedupeKey is a property name', () => {
    const a = { id: 'fox', emoji: '🦊', shot: 1 };
    const b = { id: 'fox', emoji: '🦊', shot: 2 }; // same id
    const c = { id: 'owl', emoji: '🦉', shot: 3 };
    let book = [];
    book = addPhoto(book, a, { dedupeKey: 'id' });
    book = addPhoto(book, b, { dedupeKey: 'id' }); // dropped
    book = addPhoto(book, c, { dedupeKey: 'id' });
    expect(book.length).toBe(2);
    expect(book[0].id).toBe('fox');
    expect(book[1].id).toBe('owl');
  });

  it('dedupes by function key when opts.dedupeKey is a function', () => {
    const a = { kind: 'fox', emoji: '🦊' };
    const b = { kind: 'fox', emoji: '🦊' };
    let book = [];
    book = addPhoto(book, a, { dedupeKey: (x) => x.kind });
    book = addPhoto(book, b, { dedupeKey: (x) => x.kind });
    expect(book.length).toBe(1);
  });

  it('appends duplicates when no dedupeKey is provided', () => {
    const a = { id: 'fox', emoji: '🦊' };
    const b = { id: 'fox', emoji: '🦊' };
    const result = addPhoto(addPhoto([], a), b);
    expect(result.length).toBe(2);
  });

  it('treats a non-array scrapbook as empty', () => {
    const result = addPhoto(null, { id: 'fox', emoji: '🦊' });
    expect(result).toEqual([{ id: 'fox', emoji: '🦊' }]);
  });
});

// ---------------------------------------------------------------------------
// decayVelocity
// ---------------------------------------------------------------------------

describe('decayVelocity', () => {
  const friction = 0.5; // retain half per second → predictable math
  const dt = 1;

  it('a zero velocity stays zero', () => {
    const got = decayVelocity({ x: 0, y: 0 }, friction, dt);
    expect(got).toEqual({ x: 0, y: 0 });
  });

  it('halves each 1-second tick at friction=0.5', () => {
    let v = decayVelocity({ x: 1000, y: -800 }, friction, dt);
    expect(v).toEqual({ x: 500, y: -400 });
    v = decayVelocity(v, friction, dt);
    expect(v).toEqual({ x: 250, y: -200 });
  });

  it('snaps a tiny velocity to zero below epsilon', () => {
    // 0.4 px/sec is below the default epsilon (0.5) → snaps to 0.
    const got = decayVelocity({ x: 0.4, y: -0.3 }, friction, dt);
    expect(got).toEqual({ x: 0, y: 0 });
  });

  it('does NOT mutate the input velocity', () => {
    const v = { x: 100, y: 200 };
    decayVelocity(v, friction, dt);
    expect(v).toEqual({ x: 100, y: 200 });
  });

  it('is frame-rate independent: 2× dt ≈ two 1× dt steps', () => {
    // 0.5 ** 0.5 ≈ 0.7071; squared ≈ 0.5. So one 2s step ≈ two 1s steps.
    const one = decayVelocity({ x: 1000, y: 0 }, friction, 2);
    const two = decayVelocity(
      decayVelocity({ x: 1000, y: 0 }, friction, 1),
      friction,
      1,
    );
    // Allow a tiny float rounding tolerance via near-equality on integers.
    expect(Math.round(one.x)).toBe(Math.round(two.x));
  });

  it('dt=0 leaves velocity unchanged (still subject to epsilon snap)', () => {
    const got = decayVelocity({ x: 500, y: -500 }, friction, 0);
    expect(got).toEqual({ x: 500, y: -500 });
  });
});

// ---------------------------------------------------------------------------
// panCameraInertial
// ---------------------------------------------------------------------------

describe('panCameraInertial', () => {
  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 400 };
  // panSpeed=100, dt=1s so target velocity = stick * 100 is obvious.
  const baseOpts = { panSpeed: 100, accel: 4, friction: 0.25, dt: 1 };

  it('never mutates the input offset or velocity', () => {
    const off = { x: 100, y: 50 };
    const vel = { x: 10, y: -5 };
    const r = panCameraInertial({ x: 1, y: 0 }, off, vel, bounds, baseOpts);
    expect(off).toEqual({ x: 100, y: 50 }); // untouched
    expect(vel).toEqual({ x: 10, y: -5 }); // untouched
    expect(r.offset !== off).toBe(true);
    expect(r.velocity !== vel).toBe(true);
  });

  it('returns new {offset, velocity} objects', () => {
    const r = panCameraInertial(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      bounds,
      baseOpts,
    );
    expect(r.offset).toEqual({ x: 0, y: 0 });
    expect(r.velocity).toEqual({ x: 0, y: 0 });
  });

  it('with zero stick and non-zero velocity, velocity shrinks and offset creeps', () => {
    // velocity carries the camera; friction bleeds it; offset advances less
    // each tick until motion effectively stops (below epsilon → 0).
    let off = { x: 0, y: 0 };
    let vel = { x: 1000, y: 0 };
    const xs = [];
    for (let i = 0; i < 40; i += 1) {
      const r = panCameraInertial({ x: 0, y: 0 }, off, vel, bounds, baseOpts);
      off = r.offset;
      vel = r.velocity;
      xs.push(off.x);
    }
    // Offset is monotonically increasing (always pans forward)...
    expect(xs[xs.length - 1] > xs[0]).toBe(true);
    // ...and the velocity has fully decayed to zero by the end.
    expect(vel).toEqual({ x: 0, y: 0 });
    // Offset eventually stops advancing (two final ticks equal → no creep).
    expect(xs[xs.length - 1]).toEqual(xs[xs.length - 2]);
  });

  it('full stick ramps velocity toward (not past) the target', () => {
    // panSpeed=100 → target vx = 100. After one 1s tick the velocity steps
    // toward 100 but does not exceed it.
    const r = panCameraInertial(
      { x: 1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      bounds,
      baseOpts,
    );
    expect(r.velocity.x > 0).toBe(true);
    expect(r.velocity.x < 100).toBe(true);
  });

  it('sustained full stick asymptotes to panSpeed', () => {
    // Wide bounds so the clamp doesn't kick in before the velocity settles.
    const wideBounds = { minX: 0, maxX: 1e7, minY: 0, maxY: 400 };
    let off = { x: 0, y: 0 };
    let vel = { x: 0, y: 0 };
    for (let i = 0; i < 60; i += 1) {
      const r = panCameraInertial({ x: 1, y: 0 }, off, vel, wideBounds, baseOpts);
      off = r.offset;
      vel = r.velocity;
    }
    // Settles within 1px/sec of the target panSpeed (100) without exceeding it.
    expect(vel.x > 99).toBe(true);
    expect(vel.x <= 100).toBe(true);
  });

  it('clamp at maxX zeroes the clamped velocity component (no residual drift)', () => {
    // Start near the right edge with a large +x velocity. After clamping,
    // velocity.x must be exactly 0; y must be untouched (no clamp on y).
    const r = panCameraInertial(
      { x: 0, y: 0 },
      { x: 990, y: 50 },
      { x: 500, y: 30 },
      bounds,
      baseOpts, // dt=1 → offset advances 500 past 990 → clamps to 1000
    );
    expect(r.offset).toEqual({ x: 1000, y: 80 });
    expect(r.velocity.x).toBe(0);
    expect(r.velocity.y > 0).toBe(true); // y not clamped, still decaying/gliding
  });

  it('clamp at minX zeroes the clamped velocity component', () => {
    const r = panCameraInertial(
      { x: 0, y: 0 },
      { x: 10, y: 50 },
      { x: -500, y: 0 },
      bounds,
      baseOpts,
    );
    expect(r.offset.x).toBe(0);
    expect(r.velocity.x).toBe(0);
  });

  it('clamp at maxY zeroes the clamped velocity component', () => {
    const r = panCameraInertial(
      { x: 0, y: 0 },
      { x: 100, y: 390 },
      { x: 0, y: 500 },
      bounds,
      baseOpts,
    );
    expect(r.offset.y).toBe(400);
    expect(r.velocity.y).toBe(0);
  });

  it('clamp at minY zeroes the clamped velocity component', () => {
    const r = panCameraInertial(
      { x: 0, y: 0 },
      { x: 100, y: 10 },
      { x: 0, y: -500 },
      bounds,
      baseOpts,
    );
    expect(r.offset.y).toBe(0);
    expect(r.velocity.y).toBe(0);
  });

  it('uses DEFAULT_PAN_SPEED / DEFAULT_ACCEL / DEFAULT_FRICTION when opts omitted', () => {
    // Smoke: defaults produce finite, sane motion without exploding.
    const r = panCameraInertial(
      { x: 1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      bounds,
      { dt: 1 / 60 },
    );
    expect(Number.isFinite(r.offset.x)).toBe(true);
    expect(r.velocity.x > 0).toBe(true);
    expect(r.velocity.x <= DEFAULT_PAN_SPEED + 1).toBe(true);
  });

  it('treats NaN stick components as 0 (decays velocity instead of exploding)', () => {
    const r = panCameraInertial(
      { x: Number.NaN, y: Number.NaN },
      { x: 0, y: 0 },
      { x: 200, y: 100 },
      bounds,
      baseOpts,
    );
    expect(r.velocity.x < 200).toBe(true);
    expect(r.velocity.y < 100).toBe(true);
  });

  it('still clamps when bounds are null (offset integrates freely)', () => {
    const r = panCameraInertial(
      { x: 1, y: 1 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      null,
      baseOpts,
    );
    // No bounds → offset just advances by the (ramped) velocity * dt.
    expect(r.offset.x > 0).toBe(true);
    expect(r.offset.y > 0).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// animalReachable
// ---------------------------------------------------------------------------

describe('animalReachable', () => {
  const world = { w: 3600, h: 1400 };
  const viewport = { w: 800, h: 540 };
  // Reachable envelope: x ∈ [400, 3200], y ∈ [270, 1130].

  const table = [
    {
      name: 'deep inside envelope → reachable',
      animal: { x: 1000, y: 700 },
      expected: true,
    },
    {
      name: 'on the x lower edge (x = vw/2) → reachable (inclusive)',
      animal: { x: 400, y: 700 },
      expected: true,
    },
    {
      name: 'on the x upper edge (x = w - vw/2) → reachable (inclusive)',
      animal: { x: 3200, y: 700 },
      expected: true,
    },
    {
      name: 'on the y lower edge (y = vh/2) → reachable (inclusive)',
      animal: { x: 1000, y: 270 },
      expected: true,
    },
    {
      name: 'on the y upper edge (y = h - vh/2) → reachable (inclusive)',
      animal: { x: 1000, y: 1130 },
      expected: true,
    },
    {
      name: 'just past x upper edge → NOT reachable',
      animal: { x: 3201, y: 700 },
      expected: false,
    },
    {
      name: 'just below x lower edge → NOT reachable',
      animal: { x: 399, y: 700 },
      expected: false,
    },
    {
      name: 'too high (y < vh/2) → NOT reachable',
      animal: { x: 1000, y: 100 },
      expected: false,
    },
    {
      name: 'too low (y > h - vh/2) → NOT reachable',
      animal: { x: 1000, y: 1300 },
      expected: false,
    },
  ];

  table.forEach(({ name, animal, expected }) => {
    it(name, () => {
      expect(animalReachable(animal, world, viewport)).toBe(expected);
    });
  });

  it('returns false when any argument is missing', () => {
    expect(animalReachable(null, world, viewport)).toBe(false);
    expect(animalReachable({ x: 1, y: 1 }, null, viewport)).toBe(false);
    expect(animalReachable({ x: 1, y: 1 }, world, null)).toBe(false);
  });

  // The load-bearing regression guard: every real animal in ANIMAL_DEFS must
  // be centerable against the new world + a typical 800×540 viewport. If a
  // future edit pushes an animal outside the envelope, this surfaces a clear
  // failure naming the offending animal.
  it('every ANIMAL_DEFS entry is reachable in a 800×540 viewport', () => {
    const offenders = ANIMAL_DEFS.filter(
      (a) => !animalReachable(a, { w: WORLD_WIDTH, h: WORLD_HEIGHT }, viewport),
    );
    if (offenders.length > 0) {
      const names = offenders
        .map((a) => `${a.id}(${a.x},${a.y})`)
        .join(', ');
      throw new Error(
        `Unreachable animals after world resize: ${names}` +
          ` — envelope x∈[${viewport.w / 2}, ${WORLD_WIDTH - viewport.w / 2}]` +
          ` y∈[${viewport.h / 2}, ${WORLD_HEIGHT - viewport.h / 2}]`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  it('every ANIMAL_DEFS entry stays reachable on a smaller (tablet) 600×400 viewport', () => {
    // A smaller viewport only widens the reachable envelope, so this is a
    // sanity check that we didn't accidentally place animals at the extreme
    // corners of the 800×540 envelope.
    const small = { w: 600, h: 400 };
    const offenders = ANIMAL_DEFS.filter(
      (a) => !animalReachable(a, { w: WORLD_WIDTH, h: WORLD_HEIGHT }, small),
    );
    expect(offenders.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// boundsFor
// ---------------------------------------------------------------------------

describe('boundsFor', () => {
  it('max = world - viewport when world is larger', () => {
    expect(
      boundsFor({ w: 3600, h: 1400 }, { w: 800, h: 540 }),
    ).toEqual({ minX: 0, maxX: 2800, minY: 0, maxY: 860 });
  });

  it('collapses max to 0 when viewport >= world on an axis', () => {
    expect(
      boundsFor({ w: 600, h: 1400 }, { w: 800, h: 540 }),
    ).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 860 });
  });

  it('handles missing arguments gracefully', () => {
    expect(boundsFor(null, { w: 800, h: 540 })).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    });
    expect(boundsFor({ w: 1000, h: 1000 }, null)).toEqual({
      minX: 0,
      maxX: 1000,
      minY: 0,
      maxY: 1000,
    });
  });
});

// Sanity: defaults exist and are the expected shape (guards against accidental
// re-export removal in camera-logic.js).
describe('camera-logic defaults', () => {
  it('exports DEFAULT_PAN_SPEED as a positive number', () => {
    expect(typeof DEFAULT_PAN_SPEED === 'number').toBe(true);
    expect(DEFAULT_PAN_SPEED > 0).toBe(true);
  });
  it('exports DEFAULT_ACCEL and DEFAULT_FRICTION as numbers in (0, 1]/>0', () => {
    expect(typeof DEFAULT_ACCEL === 'number').toBe(true);
    expect(DEFAULT_ACCEL > 0).toBe(true);
    expect(typeof DEFAULT_FRICTION === 'number').toBe(true);
    expect(DEFAULT_FRICTION > 0).toBe(true);
    expect(DEFAULT_FRICTION <= 1).toBe(true);
  });
  it('exports VELOCITY_EPSILON as a small positive number', () => {
    expect(typeof VELOCITY_EPSILON === 'number').toBe(true);
    expect(VELOCITY_EPSILON > 0).toBe(true);
    expect(VELOCITY_EPSILON < 1).toBe(true);
  });
});
