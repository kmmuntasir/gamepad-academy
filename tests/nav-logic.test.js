// tests/nav-logic.test.js — table-driven unit tests for the PURE logic in
// shared/nav-logic.js. No DOM, no gamepad, no Date.now(), no side effects.
import { describe, it, expect } from './harness.js';
import {
  columnsFor,
  nextIndex,
  stickRepeat,
} from '../shared/nav-logic.js';

describe('columnsFor', () => {
  const MIN = 220;
  const GAP = 16;

  const table = [
    { name: 'container == minCardWidth → 1 column', width: 220, expected: 1 },
    { name: 'just under 2-column breakpoint → 1', width: 455, expected: 1 },
    { name: 'exactly at 2-column breakpoint (456) → 2', width: 456, expected: 2 },
    { name: 'just over 2-column breakpoint → 2', width: 470, expected: 2 },
    { name: '3-column width → 3', width: 692, expected: 3 },
    { name: 'tiny container clamps to 1', width: 50, expected: 1 },
    { name: 'zero container → 1 (never 0)', width: 0, expected: 1 },
  ];

  table.forEach(({ name, width, expected }) => {
    it(name, () => {
      expect(columnsFor(width, MIN, GAP)).toBe(expected);
    });
  });

  it('returns >= 1 across a dense sweep of widths', () => {
    for (let w = 0; w <= 2000; w += 7) {
      expect(columnsFor(w, MIN, GAP) >= 1).toBe(true);
    }
  });

  it('respects a custom minCardWidth and gap', () => {
    // minCardWidth=100, gap=8: breakpoint for 2 cols at (100*2 + 8) = 208.
    expect(columnsFor(207, 100, 8)).toBe(1);
    expect(columnsFor(208, 100, 8)).toBe(2);
  });

  it('zero gap works', () => {
    expect(columnsFor(220, 220, 0)).toBe(1);
    expect(columnsFor(440, 220, 0)).toBe(2);
  });
});

describe('nextIndex', () => {
  // Grid: 3 cols, 6 items. Rows: [0,1,2] and [3,4,5].
  const COLS = 3;
  const TOTAL = 6;

  const grid3x2 = [
    { name: 'up from middle of top row → row below same column', current: 1, direction: 'up', expected: 4 },
    { name: 'up from top row col 0 → wraps to bottom row same column', current: 0, direction: 'up', expected: 3 },
    { name: 'up from top row col 2 → wraps to bottom row same column', current: 2, direction: 'up', expected: 5 },
    { name: 'down from middle of bottom row → wraps to top same column', current: 4, direction: 'down', expected: 1 },
    { name: 'down from bottom row col 0 → wraps to top row same column', current: 3, direction: 'down', expected: 0 },
    { name: 'down from top row → bottom row same column', current: 1, direction: 'down', expected: 4 },
    { name: 'left from middle of row → one less', current: 1, direction: 'left', expected: 0 },
    { name: 'left from row start → wraps to row END', current: 3, direction: 'left', expected: 5 },
    { name: 'left from row start (row 0) → wraps to row END (2)', current: 0, direction: 'left', expected: 2 },
    { name: 'right from middle of row → one more', current: 1, direction: 'right', expected: 2 },
    { name: 'right from row end → wraps to START of next row', current: 2, direction: 'right', expected: 3 },
    { name: 'right from last item overall → wraps to 0', current: 5, direction: 'right', expected: 0 },
  ];

  grid3x2.forEach(({ name, current, direction, expected }) => {
    it(`3x2 grid: ${name}`, () => {
      expect(nextIndex(current, direction, COLS, TOTAL)).toBe(expected);
    });
  });

  it('total === 1 → always 0 (any direction)', () => {
    for (const direction of ['up', 'down', 'left', 'right']) {
      expect(nextIndex(0, direction, 3, 1)).toBe(0);
    }
  });

  it('total === 0 → 0', () => {
    expect(nextIndex(0, 'right', 3, 0)).toBe(0);
  });

  it('cols === 1 is vertical-only (left/right stay or wrap to same cell)', () => {
    // Single column of 3 items: indices 0,1,2 each in their own row.
    expect(nextIndex(1, 'up', 1, 3)).toBe(0);
    expect(nextIndex(0, 'down', 1, 3)).toBe(1);
    expect(nextIndex(2, 'down', 1, 3)).toBe(0); // wrap to top of column
    expect(nextIndex(0, 'up', 1, 3)).toBe(2); // wrap to bottom of column
    // left from row start (each cell IS its row start AND end) → rowEnd = same cell
    expect(nextIndex(1, 'left', 1, 3)).toBe(1);
    // right from row end → nextRowStart = next index, or 0 from last
    expect(nextIndex(0, 'right', 1, 3)).toBe(1);
    expect(nextIndex(2, 'right', 1, 3)).toBe(0);
  });

  it('unknown direction returns current unchanged', () => {
    expect(nextIndex(2, 'diagonal', 3, 6)).toBe(2);
  });

  it('clamps out-of-range current into [0, total-1]', () => {
    expect(nextIndex(-5, 'right', 3, 6)).toBe(1); // treated as 0 → right
    expect(nextIndex(99, 'left', 3, 6)).toBe(4); // treated as 5 → left
  });

  it('handles a ragged last row (total not a multiple of cols)', () => {
    // 3 cols, 7 items: rows [0,1,2],[3,4,5],[6]. Item 6 is alone in row 2.
    expect(nextIndex(6, 'right', 3, 7)).toBe(0); // last item → 0
    expect(nextIndex(6, 'left', 3, 7)).toBe(6); // row start === row end → stays
    expect(nextIndex(5, 'right', 3, 7)).toBe(6); // end of full row → next row start
    expect(nextIndex(6, 'up', 3, 7)).toBe(3); // up from 6 → 6-3=3
  });
});

describe('stickRepeat', () => {
  const INTERVAL = 160;

  it('first call (lastFireAt null) fires and adopts now as nextLast', () => {
    const r = stickRepeat(1000, null, INTERVAL);
    expect(r.fire).toBe(true);
    expect(r.nextLast).toBe(1000);
  });

  it('first call (lastFireAt undefined) fires', () => {
    const r = stickRepeat(1000, undefined, INTERVAL);
    expect(r.fire).toBe(true);
    expect(r.nextLast).toBe(1000);
  });

  it('first call (lastFireAt NaN) fires', () => {
    const r = stickRepeat(1000, NaN, INTERVAL);
    expect(r.fire).toBe(true);
    expect(r.nextLast).toBe(1000);
  });

  it('under interval does NOT fire and preserves lastFireAt', () => {
    const r = stickRepeat(200, 100, INTERVAL); // elapsed 100 < 160
    expect(r.fire).toBe(false);
    expect(r.nextLast).toBe(100);
  });

  it('exactly at interval fires', () => {
    const r = stickRepeat(260, 100, INTERVAL); // elapsed 160 === 160
    expect(r.fire).toBe(true);
    expect(r.nextLast).toBe(260);
  });

  it('above interval fires', () => {
    const r = stickRepeat(500, 100, INTERVAL); // elapsed 400 > 160
    expect(r.fire).toBe(true);
    expect(r.nextLast).toBe(500);
  });

  // Table-driven: nextLast becomes now ONLY when firing.
  const nextLastTable = [
    { name: 'null last, fires → now', now: 100, last: null, expectedFire: true, expectedNextLast: 100 },
    { name: 'under interval, no fire → last preserved', now: 150, last: 100, expectedFire: false, expectedNextLast: 100 },
    { name: 'at interval, fires → now', now: 260, last: 100, expectedFire: true, expectedNextLast: 260 },
    { name: 'over interval, fires → now', now: 400, last: 100, expectedFire: true, expectedNextLast: 400 },
  ];
  nextLastTable.forEach(({ name, now, last, expectedFire, expectedNextLast }) => {
    it(name, () => {
      const r = stickRepeat(now, last, INTERVAL);
      expect(r.fire).toBe(expectedFire);
      expect(r.nextLast).toBe(expectedNextLast);
    });
  });

  it('non-finite now does not fire and keeps prior lastFireAt', () => {
    const r = stickRepeat(NaN, 100, INTERVAL);
    expect(r.fire).toBe(false);
    expect(r.nextLast).toBe(100);
  });

  it('non-finite now with no prior last → nextLast 0', () => {
    const r = stickRepeat(NaN, null, INTERVAL);
    expect(r.fire).toBe(false);
    expect(r.nextLast).toBe(0);
  });

  it('non-positive interval falls back to default (still fires on first call)', () => {
    // First call always fires regardless of interval (Infinity elapsed).
    expect(stickRepeat(10, null, 0).fire).toBe(true);
    expect(stickRepeat(10, null, -5).fire).toBe(true);
    expect(stickRepeat(10, null, NaN).fire).toBe(true);
  });
});
