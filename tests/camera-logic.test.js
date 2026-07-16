// tests/camera-logic.test.js — table-driven unit tests for the PURE logic in
// games/wildlife-photographer/camera-logic.js. No DOM, no Canvas, no gamepad.
import { describe, it, expect } from './harness.js';
import {
  panCamera,
  isInReticle,
  addPhoto,
} from '../games/wildlife-photographer/camera-logic.js';

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
