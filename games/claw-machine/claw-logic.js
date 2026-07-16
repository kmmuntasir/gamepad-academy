// games/claw-machine/claw-logic.js — PURE claw movement + grab logic.
// Zero dependencies. No DOM, no Canvas, no gamepad, no side effects.
// Unit-tested in tests/claw-logic.test.js.
//
// The claw lives on a discrete 2D grid. `pos` is in grid cells: { x, y }
// where x is the column (0..cols-1) and y is the row (0..rows-1). y=0 is the
// TOP row (the claw's home rail).

// D-Pad direction → cell delta. 'up' decreases y (toward the top rail);
// 'down' increases y; 'left' decreases x; 'right' increases x.
const DIRECTION_DELTA = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Move the claw one cell in `direction`, clamped within `gridBounds`.
 *
 * @param {{x: number, y: number}} pos        current cell position
 * @param {string} direction                  'up' | 'down' | 'left' | 'right'
 * @param {{cols: number, rows: number}} gridBounds grid dimensions (cols, rows ≥ 1)
 * @returns {{x: number, y: number}} the new clamped cell position
 *          (or a copy of `pos` for an unknown direction / missing bounds)
 */
export function moveClaw(pos, direction, gridBounds) {
  const safe = sanitizePos(pos);
  const bounds = sanitizeBounds(gridBounds);
  const delta = DIRECTION_DELTA[direction];
  // Unknown direction or invalid bounds → no movement.
  if (!delta) return { x: safe.x, y: safe.y };

  const maxX = Math.max(0, bounds.cols - 1);
  const maxY = Math.max(0, bounds.rows - 1);
  const nx = clampInt(safe.x + delta.dx, 0, maxX);
  const ny = clampInt(safe.y + delta.dy, 0, maxY);
  return { x: nx, y: ny };
}

/**
 * Return the prize located exactly at `pos`, or null if none.
 * A prize matches when its integer {x, y} equals `pos`'s {x, y}.
 *
 * @param {{x: number, y: number}} pos
 * @param {Array<{x: number, y: number, ...}>} prizes
 * @returns {({x: number, y: number} & object)|null} the first matching prize, or null
 */
export function grabAt(pos, prizes) {
  if (!pos || !Array.isArray(prizes) || prizes.length === 0) return null;
  const { x, y } = pos;
  for (const prize of prizes) {
    if (!prize) continue;
    if (prize.x === x && prize.y === y) return prize;
  }
  return null;
}

/**
 * The claw's start position: top-center cell of the grid.
 * x = floor(cols / 2), y = 0 (the top rail).
 *
 * @param {{cols: number, rows: number}} gridBounds
 * @returns {{x: number, y: number}}
 */
export function resetClaw(gridBounds) {
  const bounds = sanitizeBounds(gridBounds);
  const maxX = Math.max(0, bounds.cols - 1);
  const x = clampInt(Math.floor(bounds.cols / 2), 0, maxX);
  return { x, y: 0 };
}

// ---------------------------------------------------------------------------
// Internal helpers (pure, not exported)
// ---------------------------------------------------------------------------

function sanitizePos(pos) {
  const x = Number.isFinite(pos?.x) ? pos.x : 0;
  const y = Number.isFinite(pos?.y) ? pos.y : 0;
  return { x, y };
}

function sanitizeBounds(gridBounds) {
  const cols = Number.isFinite(gridBounds?.cols) && gridBounds.cols >= 1
    ? Math.floor(gridBounds.cols)
    : 1;
  const rows = Number.isFinite(gridBounds?.rows) && gridBounds.rows >= 1
    ? Math.floor(gridBounds.rows)
    : 1;
  return { cols, rows };
}

function clampInt(v, min, max) {
  const n = Math.floor(v);
  return Math.min(max, Math.max(min, n));
}
