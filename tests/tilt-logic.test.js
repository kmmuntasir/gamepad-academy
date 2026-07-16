// tests/tilt-logic.test.js — table-driven unit tests for the PURE logic in
// games/butterfly-catcher/tilt-logic.js. No DOM, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import {
  stickMagnitude,
  movementMode,
  butterflyFlees,
  tryCatch,
} from '../games/butterfly-catcher/tilt-logic.js';

describe('stickMagnitude', () => {
  const table = [
    { name: 'zero vector → 0', input: { x: 0, y: 0 }, expected: 0 },
    { name: 'unit axis x → 1', input: { x: 1, y: 0 }, expected: 1 },
    { name: 'unit axis y → 1', input: { x: 0, y: 1 }, expected: 1 },
    { name: 'diagonal clamps to 1 (hypot > 1)', input: { x: 1, y: 1 }, expected: 1 },
    { name: 'beyond-unit x clamps to 1', input: { x: 2, y: 0 }, expected: 1 },
    { name: 'beyond-unit both clamps to 1', input: { x: 5, y: 5 }, expected: 1 },
    { name: 'partial tilt 0.3,0.4 → 0.5', input: { x: 0.3, y: 0.4 }, expected: 0.5 },
    { name: 'negative axes treated symmetrically', input: { x: -0.6, y: -0.8 }, expected: 1 },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(stickMagnitude(input.x, input.y)).toBe(expected);
    });
  });
});

describe('movementMode — documented boundaries', () => {
  // Documented rule (see tilt-logic.js header):
  //   m < 0.4 → 'tiptoe'
  //   m < 0.7 → 'walk'
  //   else    → 'run'
  // i.e. [0, 0.4) tiptoe, [0.4, 0.7) walk, [0.7, 1] run.
  // Exactly 0.4 → walk. Exactly 0.7 → run.
  const table = [
    { name: '0.0 → tiptoe', input: 0.0, expected: 'tiptoe' },
    { name: '0.39 → tiptoe (just under TIPTOE_MAX)', input: 0.39, expected: 'tiptoe' },
    { name: '0.4 → walk (boundary, inclusive lower)', input: 0.4, expected: 'walk' },
    { name: '0.5 → walk (mid)', input: 0.5, expected: 'walk' },
    { name: '0.69 → walk (just under WALK_MAX)', input: 0.69, expected: 'walk' },
    { name: '0.7 → run (boundary, inclusive lower of run)', input: 0.7, expected: 'run' },
    { name: '0.71 → run (just over WALK_MAX)', input: 0.71, expected: 'run' },
    { name: '1.0 → run (full tilt)', input: 1.0, expected: 'run' },
  ];

  table.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(movementMode(input)).toBe(expected);
    });
  });

  it('non-finite magnitude collapses to tiptoe (safest default)', () => {
    expect(movementMode(NaN)).toBe('tiptoe');
    expect(movementMode(Infinity)).toBe('tiptoe'); // not finite → safest default
    expect(movementMode(-Infinity)).toBe('tiptoe');
  });

  it('negative magnitude collapses to tiptoe', () => {
    expect(movementMode(-0.5)).toBe('tiptoe');
  });
});

describe('butterflyFlees', () => {
  const butterfly = { x: 100, y: 100, fleeRadius: 50, catchRadius: 20 };

  const table = [
    {
      name: 'run + within fleeRadius → flees',
      butterfly: { x: 100, y: 100, fleeRadius: 50 },
      player: { x: 130, y: 100 }, // dist 30 <= 50
      mode: 'run',
      expected: true,
    },
    {
      name: 'run + exactly at fleeRadius → flees (inclusive)',
      butterfly: { x: 100, y: 100, fleeRadius: 50 },
      player: { x: 150, y: 100 }, // dist 50 <= 50
      mode: 'run',
      expected: true,
    },
    {
      name: 'run + just outside fleeRadius → does NOT flee',
      butterfly: { x: 100, y: 100, fleeRadius: 50 },
      player: { x: 151, y: 100 }, // dist 51 > 50
      mode: 'run',
      expected: false,
    },
    {
      name: 'run + far → does NOT flee',
      butterfly: { x: 100, y: 100, fleeRadius: 50 },
      player: { x: 400, y: 300 },
      mode: 'run',
      expected: false,
    },
    {
      name: 'tiptoe + within fleeRadius → does NOT flee',
      butterfly: { x: 100, y: 100, fleeRadius: 50 },
      player: { x: 110, y: 100 },
      mode: 'tiptoe',
      expected: false,
    },
    {
      name: 'walk + within fleeRadius → does NOT flee',
      butterfly: { x: 100, y: 100, fleeRadius: 50 },
      player: { x: 110, y: 100 },
      mode: 'walk',
      expected: false,
    },
  ];

  table.forEach(({ name, butterfly: bf, player: pl, mode, expected }) => {
    it(name, () => {
      expect(butterflyFlees(bf, pl, mode)).toBe(expected);
    });
  });

  it('fails soft on missing inputs', () => {
    expect(butterflyFlees(null, { x: 0, y: 0 }, 'run')).toBe(false);
    expect(butterflyFlees(butterfly, null, 'run')).toBe(false);
  });

  void butterfly; // referenced for clarity; table carries its own copies
});

describe('tryCatch', () => {
  const table = [
    {
      name: 'tiptoe + within catchRadius → catches',
      butterfly: { x: 100, y: 100, catchRadius: 20 },
      player: { x: 115, y: 100 }, // dist 15 <= 20
      mode: 'tiptoe',
      expected: true,
    },
    {
      name: 'tiptoe + exactly at catchRadius → catches (inclusive)',
      butterfly: { x: 100, y: 100, catchRadius: 20 },
      player: { x: 120, y: 100 }, // dist 20 <= 20
      mode: 'tiptoe',
      expected: true,
    },
    {
      name: 'tiptoe + just outside catchRadius → does NOT catch',
      butterfly: { x: 100, y: 100, catchRadius: 20 },
      player: { x: 121, y: 100 }, // dist 21 > 20
      mode: 'tiptoe',
      expected: false,
    },
    {
      name: 'tiptoe + far → does NOT catch',
      butterfly: { x: 100, y: 100, catchRadius: 20 },
      player: { x: 300, y: 250 },
      mode: 'tiptoe',
      expected: false,
    },
    {
      name: 'run + within catchRadius → does NOT catch',
      butterfly: { x: 100, y: 100, catchRadius: 20 },
      player: { x: 110, y: 100 },
      mode: 'run',
      expected: false,
    },
    {
      name: 'walk + within catchRadius → does NOT catch',
      butterfly: { x: 100, y: 100, catchRadius: 20 },
      player: { x: 110, y: 100 },
      mode: 'walk',
      expected: false,
    },
  ];

  table.forEach(({ name, butterfly: bf, player: pl, mode, expected }) => {
    it(name, () => {
      expect(tryCatch(bf, pl, mode)).toBe(expected);
    });
  });

  it('fails soft on missing inputs', () => {
    expect(tryCatch(null, { x: 0, y: 0 }, 'tiptoe')).toBe(false);
    expect(tryCatch({ x: 0, y: 0, catchRadius: 10 }, null, 'tiptoe')).toBe(false);
  });
});
