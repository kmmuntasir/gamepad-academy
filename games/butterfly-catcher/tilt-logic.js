// games/butterfly-catcher/tilt-logic.js — PURE tilt/movement logic.
// No DOM, no Canvas, no gamepad. Unit-tested in tests/tilt-logic.test.js.
//
// Butterfly Catcher teaches analog stick tilt MAGNITUDE:
//   - tiny tilt  → tiptoe (sneak up and auto-catch)
//   - medium tilt → walk  (neutral; neither scares nor catches)
//   - full tilt  → run   (fast, but scares nearby butterflies away)

// ---------------------------------------------------------------------------
// Magnitude thresholds.
// Documented boundary rule (tested at exactly these points):
//   magnitude <  TIPTOE_MAX        (0.4)  → 'tiptoe'
//   magnitude <  WALK_MAX          (0.7)  → 'walk'   (so 0.4 inclusive → walk,
//                                                   and 0.7 inclusive → run)
//   otherwise                              → 'run'
// In words: [0, 0.4) = tiptoe, [0.4, 0.7) = walk, [0.7, 1] = run.
// At exactly 0.4 → 'walk'. At exactly 0.7 → 'run'.
// ---------------------------------------------------------------------------
export const TIPTOE_MAX = 0.4;
export const WALK_MAX = 0.7;

// Radii are read off the butterfly object (fleeRadius / catchRadius) so the
// pure functions stay flexible and testable without hidden constants.

/**
 * Left-stick tilt magnitude clamped to [0, 1].
 * Matches shared/utils.js `magnitude` semantics (clamped hypot).
 *
 * @param {number} x  stick x in [-1, 1]
 * @param {number} y  stick y in [-1, 1]
 * @returns {number}  magnitude in [0, 1]
 */
export function stickMagnitude(x, y) {
  return Math.min(1, Math.hypot(x, y));
}

/**
 * Map a stick magnitude to a movement mode.
 *
 * Boundary rule (see module header):
 *   m < 0.4 → 'tiptoe'
 *   m < 0.7 → 'walk'
 *   else    → 'run'
 *
 * Negative or non-finite magnitudes collapse to 'tiptoe' (safest default —
 * a 7-year-old never gets a runaway character from garbage input).
 *
 * @param {number} magnitude  value from stickMagnitude, expected [0, 1]
 * @returns {'tiptoe'|'walk'|'run'}
 */
export function movementMode(magnitude) {
  if (!Number.isFinite(magnitude) || magnitude < TIPTOE_MAX) return 'tiptoe';
  if (magnitude < WALK_MAX) return 'walk';
  return 'run';
}

/**
 * Does this butterfly flee? True only when the player is RUNNING and within
 * the butterfly's `fleeRadius`. Touching exactly at the radius counts.
 *
 * @param {{ x:number, y:number, fleeRadius:number }} butterfly
 * @param {{ x:number, y:number }} player
 * @param {'tiptoe'|'walk'|'run'} mode
 * @returns {boolean}
 */
export function butterflyFlees(butterfly, player, mode) {
  if (!butterfly || !player) return false;
  if (mode !== 'run') return false;
  const dx = player.x - butterfly.x;
  const dy = player.y - butterfly.y;
  return Math.hypot(dx, dy) <= butterfly.fleeRadius;
}

/**
 * Does the player auto-catch this butterfly? True only when TIPTOE-ing and
 * within the butterfly's `catchRadius`. Touching exactly at the radius counts.
 *
 * @param {{ x:number, y:number, catchRadius:number }} butterfly
 * @param {{ x:number, y:number }} player
 * @param {'tiptoe'|'walk'|'run'} mode
 * @returns {boolean}
 */
export function tryCatch(butterfly, player, mode) {
  if (!butterfly || !player) return false;
  if (mode !== 'tiptoe') return false;
  const dx = player.x - butterfly.x;
  const dy = player.y - butterfly.y;
  return Math.hypot(dx, dy) <= butterfly.catchRadius;
}
