/*
 * nav-logic.js — console-style menu navigation math (PURE functions)
 *
 * No DOM, no gamepad, no I/O, no Date.now(). All inputs are passed in so the
 * functions are unit-testable in the in-browser harness without a UI.
 *
 * Consumed by the homepage grid navigator (and reusable by any card-list/
 * tile-menu that needs D-pad/stick-driven movement with wrap).
 */

// Default minimum card width for the homepage grid (matches the `minmax(220px, 1fr)`
// rule in shared/styles.css). Callers may pass a different minCardWidth.
const MIN_CARD_WIDTH = 220;

// Default stick-repeat interval: how often a held direction re-fires navigation.
// Tuned to feel responsive without skipping cards. Callers may override.
const STICK_REPEAT_MS = 160;

/**
 * Compute the integer column count for a CSS grid given a container width,
 * a minimum card width, and the gap between cards. Matches the breakpoint math
 * of `grid-template-columns: repeat(auto-fit, minmax(minCardWidth, 1fr))` with
 * `gap`. Always returns at least 1.
 *
 * @param {number} containerWidth - Current grid container width in px.
 * @param {number} minCardWidth   - Minimum card width in px (e.g. 220).
 * @param {number} gap            - Gap between cards in px.
 * @returns {number} Integer column count, >= 1.
 */
export function columnsFor(containerWidth, minCardWidth, gap) {
  // Follows the spec formula literally; only the RESULT is clamped to >= 1 so
  // callers never get a zero/negative column count (which would break layout).
  return Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)));
}

/**
 * Grid-aware move index. Returns the new 0-based index after moving one step
 * in the given direction on a `cols`-wide grid containing `total` items.
 *
 * Wrap rules:
 *  - 'up'   : vertical wrap to bottom of the column.
 *  - 'down' : vertical wrap to top of the column.
 *  - 'left' : horizontal wrap to the END of the current row when already at
 *             the start of the row.
 *  - 'right': horizontal wrap to the START of the next row when already at
 *             the end of the row; from the very last item wrap to 0.
 *
 * Edge-safe: returns 0 when total <= 1, and behaves sanely when cols <= 1.
 *
 * @param {number} current   - Current 0-based index (clamped to [0, total-1]).
 * @param {'up'|'down'|'left'|'right'} direction
 * @param {number} cols      - Column count of the grid (>= 1).
 * @param {number} total     - Total item count (>= 0).
 * @returns {number} New 0-based index.
 */
export function nextIndex(current, direction, cols, total) {
  if (!Number.isFinite(total) || total <= 1) return 0;
  if (!Number.isFinite(cols) || cols < 1) cols = 1;

  const safeCols = Math.floor(cols);
  const last = total - 1;

  // Clamp current into [0, last] defensively.
  let c = Number.isFinite(current) ? Math.floor(current) : 0;
  if (c < 0) c = 0;
  if (c > last) c = last;

  const row = Math.floor(c / safeCols);
  const rowStart = row * safeCols;
  const rowEnd = Math.min(rowStart + safeCols - 1, last);

  switch (direction) {
    case 'up':
      return ((c - safeCols) % total + total) % total;

    case 'down':
      return (c + safeCols) % total;

    case 'left':
      // At the start of a row → wrap to the END of the same row.
      if (c === rowStart) return rowEnd;
      return c - 1;

    case 'right':
      // At the end of a row → wrap to the START of the next row.
      if (c === rowEnd) {
        const nextRowStart = rowStart + safeCols;
        return nextRowStart >= total ? 0 : nextRowStart;
      }
      return c + 1;

    default:
      return c;
  }
}

/**
 * Decide whether a repeating stick-driven action should fire on this frame.
 *
 * Pure: `now` is supplied by the caller (do NOT call Date.now() here). A
 * non-finite/null `lastFireAt` means "never fired", so the first call fires.
 *
 * @param {number} now          - Current timestamp (ms), passed in by caller.
 * @param {number|null} lastFireAt - Timestamp (ms) of the last fire, or null/non-finite.
 * @param {number} intervalMs   - Minimum ms between fires.
 * @returns {{ fire: boolean, nextLast: number }}
 */
export function stickRepeat(now, lastFireAt, intervalMs) {
  const safeInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : STICK_REPEAT_MS;
  const validLast = Number.isFinite(lastFireAt);

  if (!Number.isFinite(now)) {
    return { fire: false, nextLast: validLast ? lastFireAt : 0 };
  }

  const elapsed = validLast ? now - lastFireAt : Infinity;
  const fire = elapsed >= safeInterval;

  return {
    fire,
    nextLast: fire ? now : validLast ? lastFireAt : 0,
  };
}

export { MIN_CARD_WIDTH, STICK_REPEAT_MS };
