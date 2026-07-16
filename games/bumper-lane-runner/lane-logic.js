// games/bumper-lane-runner/lane-logic.js — PURE lane + collision logic.
// Zero dependencies. No DOM, no gamepad, no side effects. Unit-tested in
// tests/lane-logic.test.js.
//
// Reuses the shared collision helpers so the coin check is consistent with
// every other game. Keeping these functions pure + side-effect-free is what
// makes them unit-testable without a DOM/Canvas/gamepad.

import { clamp, circleCollision } from '../../shared/utils.js';

// ---------------------------------------------------------------------------
// Lane navigation
// ---------------------------------------------------------------------------

/**
 * Compute the next lane index after moving one step in `direction`, clamped to
 * the closed range [0, laneCount - 1]. Unknown directions keep the player put.
 *
 * @param {number} current     - current lane index
 * @param {string} direction   - 'left' | 'right'
 * @param {number} [laneCount] - number of lanes (default 3)
 * @returns {number} the clamped lane index
 */
export function nextLane(current, direction, laneCount = 3) {
  const max = laneCount - 1;
  if (max < 0) return 0;
  if (direction === 'left') return clamp(current - 1, 0, max);
  if (direction === 'right') return clamp(current + 1, 0, max);
  return clamp(current, 0, max);
}

/**
 * Resolve the player's lane after bumping into an obstacle.
 *
 * Rule (deterministic, never stops the player): if the player is IN the
 * obstacle's lane, bounce one lane toward the side with more room. When both
 * sides have equal room, prefer the right side. If the player is already at
 * one edge (no room on the bounce side), bounce toward the opposite side; if
 * somehow trapped at a single-lane track, stay. If the player is NOT in the
 * obstacle's lane, there is no bounce.
 *
 * `obstacle` may simply be `{ lane }` — only its lane is consulted, so the
 * player x position is irrelevant here (the engine handles pixel overlap).
 *
 * @param {number} lane        - the player's current lane index
 * @param {{lane: number}} obstacle - the obstacle the player hit
 * @param {number} laneCount   - total number of lanes
 * @returns {number} the resulting lane index (clamped, never stopped)
 */
export function resolveObstacleHit(lane, obstacle, laneCount) {
  const max = laneCount - 1;
  if (max < 0) return 0;

  // No obstacle or obstacle off-track → no bounce.
  if (!obstacle || obstacle.lane == null) return clamp(lane, 0, max);

  // Only bounce when the player actually occupies the obstacle's lane.
  if (lane !== obstacle.lane) return clamp(lane, 0, max);

  const roomLeft = lane; // lanes with index < lane
  const roomRight = max - lane; // lanes with index > lane
  const canLeft = roomLeft > 0;
  const canRight = roomRight > 0;

  // Trapped in a single lane (no neighbours) — no room to bounce.
  if (!canLeft && !canRight) return lane;

  // Prefer the side with more room; tie-break to the right.
  if (canRight && (!canLeft || roomRight >= roomLeft)) {
    return clamp(lane + 1, 0, max);
  }
  return clamp(lane - 1, 0, max);
}

// ---------------------------------------------------------------------------
// Coin collection
// ---------------------------------------------------------------------------

/**
 * Decide whether the player overlaps a coin. Both inputs carry `{ x, y }` plus
 * a size descriptor — player uses `r` (radius) and coin uses `r` too. The coin
 * may also expose `size` (diameter) which is normalized to a radius. Falls
 * back to a small radius if neither is present so a missing field never throws.
 *
 * @param {{x: number, y: number, r?: number}} player
 * @param {{x: number, y: number, r?: number, size?: number}} coin
 * @returns {boolean} true when the two overlap (edge-touch counts)
 */
export function tryCollectCoin(player, coin) {
  if (!player || !coin) return false;
  const pr = typeof player.r === 'number' ? player.r : 0;
  const cr =
    typeof coin.r === 'number'
      ? coin.r
      : typeof coin.size === 'number'
        ? coin.size / 2
        : 0;
  return circleCollision(
    { x: player.x, y: player.y, r: pr },
    { x: coin.x, y: coin.y, r: cr },
  );
}
