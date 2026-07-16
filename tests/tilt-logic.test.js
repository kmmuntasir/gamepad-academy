// tests/tilt-logic.test.js — table-driven unit tests for the PURE logic in
// games/butterfly-catcher/tilt-logic.js. No DOM, no gamepad, no side effects.
import { describe, it, expect } from './harness.js';
import {
  stickMagnitude,
  movementMode,
  butterflyFlees,
  tryCatch,
  easeOutCubic,
  pickFlightTarget,
  advanceFlight,
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

describe('easeOutCubic', () => {
  it('easeOutCubic(0) === 0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('easeOutCubic(1) === 1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('is monotonic non-decreasing across [0,1]', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = easeOutCubic(i / 20);
      expect(v >= prev).toBe(true);
      prev = v;
    }
  });

  it('clamps below 0 to 0 and above 1 to 1', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('midpoint 0.5 is between 0 and 1', () => {
    const v = easeOutCubic(0.5);
    expect(v > 0).toBe(true);
    expect(v < 1).toBe(true);
  });

  it('returns 0 for non-finite input', () => {
    expect(easeOutCubic(NaN)).toBe(0);
  });
});

describe('pickFlightTarget', () => {
  const viewW = 800;
  const viewH = 600;
  const minDist = 150;

  it('returns a point inside the view bounds', () => {
    const butterfly = { x: 100, y: 100 };
    for (let i = 0; i < 20; i++) {
      const t = pickFlightTarget(butterfly, viewW, viewH, minDist);
      expect(t.x >= 0).toBe(true);
      expect(t.x <= viewW).toBe(true);
      expect(t.y >= 0).toBe(true);
      expect(t.y <= viewH).toBe(true);
    }
  });

  it('picks a target at least minDist from the butterfly origin', () => {
    const butterfly = { x: 400, y: 300 };
    for (let i = 0; i < 20; i++) {
      const t = pickFlightTarget(butterfly, viewW, viewH, minDist);
      const d = Math.hypot(t.x - butterfly.x, t.y - butterfly.y);
      expect(d >= minDist).toBe(true);
    }
  });

  it('avoids landing on top of the player when one is provided', () => {
    const butterfly = { x: 400, y: 300 };
    const player = { x: 760, y: 560 };
    for (let i = 0; i < 20; i++) {
      const t = pickFlightTarget(butterfly, viewW, viewH, minDist, player);
      const dPlayer = Math.hypot(t.x - player.x, t.y - player.y);
      expect(dPlayer >= minDist).toBe(true);
    }
  });

  it('fails soft when the view is degenerate (still returns finite coords)', () => {
    const t = pickFlightTarget({ x: 5, y: 5 }, 0, 0, minDist);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);
  });

  it('fails soft on missing butterfly', () => {
    const t = pickFlightTarget(null, viewW, viewH, minDist);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);
  });
});

describe('advanceFlight', () => {
  const baseButterfly = {
    x: 0,
    y: 0,
    flyStartX: 0,
    flyStartY: 0,
    targetX: 100,
    targetY: 0,
    flyT: 0,
    flyDurationMs: 1000,
  };

  it('advances flyT by dtMs / flyDurationMs', () => {
    const step = advanceFlight({ ...baseButterfly }, 250);
    // 250 / 1000 = 0.25
    expect(step.flyT === 0.25).toBe(true);
    expect(step.done).toBe(false);
  });

  it('marks done and clamps flyT to 1 once dt exceeds duration', () => {
    const step = advanceFlight({ ...baseButterfly }, 1500);
    expect(step.flyT === 1).toBe(true);
    expect(step.done).toBe(true);
  });

  it('snaps to the target when done', () => {
    const step = advanceFlight({ ...baseButterfly }, 2000);
    expect(step.x === 100).toBe(true);
    expect(step.y === 0).toBe(true);
  });

  it('interpolates start → target (midpoint is partway across)', () => {
    // With linear interpolation at flyT 0.5 → x=50, but eased so the position
    // is closer to target. Just assert it's strictly between 0 and 100.
    const step = advanceFlight({ ...baseButterfly, flyDurationMs: 1000 }, 500);
    expect(step.x > 0).toBe(true);
    expect(step.x < 100).toBe(true);
    expect(step.done).toBe(false);
  });

  it('does not move backwards', () => {
    // dtMs of 0 should not advance.
    const step = advanceFlight({ ...baseButterfly, flyT: 0.3 }, 0);
    expect(step.flyT === 0.3).toBe(true);
    expect(step.done).toBe(false);
  });

  it('handles non-finite dtMs without advancing', () => {
    const step = advanceFlight({ ...baseButterfly, flyT: 0.2 }, NaN);
    expect(step.flyT === 0.2).toBe(true);
  });

  it('resumes from an existing flyT rather than restarting', () => {
    const step = advanceFlight({ ...baseButterfly, flyT: 0.5 }, 250);
    expect(step.flyT === 0.75).toBe(true);
  });
});
