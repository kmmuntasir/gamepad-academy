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

// ---------------------------------------------------------------------------
// Flight animation helpers — used when a butterfly is scared off and flies
// to a new resting spot. All pure: no DOM, no Canvas, no side effects.
// ---------------------------------------------------------------------------

/**
 * Cubic ease-out: fast at the start, decelerating to the target.
 * Maps t in [0,1] to [0,1]. Clamped; identity at endpoints.
 *
 * @param {number} t  progress in [0, 1]
 * @returns {number}  eased progress in [0, 1]
 */
export function easeOutCubic(t) {
  if (!Number.isFinite(t)) return 0;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * Pick a new resting spot for a fleeing butterfly.
 *
 * Returns `{ x, y }` clamped to `[0, viewW] × [0, viewH]` and at least
 * `minDist` away from the butterfly's current position. If `player` is
 * provided, the target also stays at least `minDist` from the player so a
 * scared butterfly doesn't immediately land back on top of the scare source.
 *
 * Falls back to the current position (clamped) if no valid spot can be
 * found after a few attempts — never throws.
 *
 * @param {{ x:number, y:number }} butterfly   current position
 * @param {number} viewW                        field width  (>0)
 * @param {number} viewH                        field height (>0)
 * @param {number} minDist                      minimum distance from origin
 * @param {{ x:number, y:number }=} [player]    optional player position to avoid
 * @returns {{ x:number, y:number }}
 */
export function pickFlightTarget(butterfly, viewW, viewH, minDist, player) {
  const w = Number.isFinite(viewW) && viewW > 0 ? viewW : 1;
  const h = Number.isFinite(viewH) && viewH > 0 ? viewH : 1;
  const ox = butterfly && Number.isFinite(butterfly.x) ? butterfly.x : w / 2;
  const oy = butterfly && Number.isFinite(butterfly.y) ? butterfly.y : h / 2;
  const minD = Number.isFinite(minDist) && minDist > 0 ? minDist : 0;
  const margin = 40;
  const maxX = Math.max(margin, w - margin);
  const maxY = Math.max(margin, h - margin);

  const farFrom = (tx, ty, px, py) =>
    px == null || py == null || Math.hypot(tx - px, ty - py) >= minD;

  const hasPlayer =
    player && Number.isFinite(player.x) && Number.isFinite(player.y);
  const px = hasPlayer ? player.x : null;
  const py = hasPlayer ? player.y : null;

  for (let i = 0; i < 12; i++) {
    const tx = margin + Math.random() * Math.max(1, maxX - margin);
    const ty = margin + Math.random() * Math.max(1, maxY - margin);
    if (Math.hypot(tx - ox, ty - oy) < minD) continue;
    if (!farFrom(tx, ty, px, py)) continue;
    return { x: tx, y: ty };
  }
  // Fallback: a point along the field edge away from the player, clamped.
  const fx = clampPure(margin + Math.random() * Math.max(1, maxX - margin), 0, w);
  const fy = clampPure(margin + Math.random() * Math.max(1, maxY - margin), 0, h);
  return { x: fx, y: fy };
}

/**
 * Advance a butterfly's flight path by `dtMs`.
 *
 * Reads flight state off the butterfly:
 *   flyStartX, flyStartY, targetX, targetY, flyT (0..1), flyDurationMs.
 * Advances `flyT` by `dtMs / flyDurationMs`, applies `easeOutCubic`, and
 * lerps the position from start → target. When `flyT >= 1` the butterfly
 * is snapped to the target and `done` is true.
 *
 * Returns `{ x, y, flyT, done }`. Does NOT mutate the butterfly.
 *
 * @param {object} butterfly   must carry the flight fields above
 * @param {number} dtMs        elapsed milliseconds since last advance
 * @returns {{ x:number, y:number, flyT:number, done:boolean }}
 */
export function advanceFlight(butterfly, dtMs) {
  const dur = butterfly && Number.isFinite(butterfly.flyDurationMs)
    ? butterfly.flyDurationMs
    : 1000;
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const startT = butterfly && Number.isFinite(butterfly.flyT) ? butterfly.flyT : 0;
  let t = startT + dt / dur;
  let done = false;
  if (t >= 1) {
    t = 1;
    done = true;
  }
  const e = easeOutCubic(t);
  const sx = butterfly.flyStartX;
  const sy = butterfly.flyStartY;
  const tx = butterfly.targetX;
  const ty = butterfly.targetY;
  const x = sx + (tx - sx) * e;
  const y = sy + (ty - sy) * e;
  return { x, y, flyT: t, done };
}

// Local clamp to keep this module self-contained (no shared/utils import).
function clampPure(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}
