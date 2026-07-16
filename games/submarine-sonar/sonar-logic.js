// games/submarine-sonar/sonar-logic.js — PURE sonar ping + headlight logic.
// Zero dependencies. No DOM, no Canvas, no gamepad, no side effects.
// Unit-tested in tests/sonar-logic.test.js.
//
// Keeping these functions pure + side-effect-free is what makes them
// unit-testable without a DOM/Canvas/gamepad. The Canvas engine in game.js
// calls into these; it contains no logic of its own.

import { clamp, distance } from '../../shared/utils.js';

// ---------------------------------------------------------------------------
// Sonar ping radius (easeOut expansion)
// ---------------------------------------------------------------------------

/**
 * Expanding sonar ring radius at `elapsed` ms into the ping.
 *
 * Rule (documented):
 *   - For 0 <= elapsed < duration: easeOut from 0 to `maxRadius` using
 *     `r = maxRadius * (1 - (1 - t)^2)` where `t = elapsed / duration`.
 *     This quadratic easeOut starts fast and decelerates as the ring reaches
 *     its maximum extent — a soft, organic pulse.
 *   - For elapsed >= duration: returns `maxRadius` (the ring has reached its
 *     full extent). The engine separately fades the ring's opacity to 0 after
 *     the duration; the radius itself is clamped to `maxRadius` so the ring
 *     never overshoots.
 *   - The result is always clamped to [0, maxRadius] so a negative `elapsed`
 *     or an over-large intermediate value can never escape the bound.
 *   - Non-finite or non-positive `maxRadius` / `duration` return 0 (safe default).
 *
 * @param {number} elapsed    - ms since the ping started (may be negative → 0)
 * @param {number} maxRadius  - peak ring radius in px (>= 0)
 * @param {number} duration   - ms the ring takes to reach `maxRadius` (> 0)
 * @returns {number} the ring radius in px, clamped to [0, maxRadius]
 */
export function pingRadius(elapsed, maxRadius, duration) {
  if (!Number.isFinite(maxRadius) || maxRadius <= 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(elapsed)) return 0;
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) return maxRadius;

  const t = elapsed / duration;
  const eased = 1 - (1 - t) * (1 - t); // quadratic easeOut
  return clamp(maxRadius * eased, 0, maxRadius);
}

// ---------------------------------------------------------------------------
// Ping reveal check
// ---------------------------------------------------------------------------

/**
 * Decide whether `entity` is revealed by a sonar ping centered on `subPos`.
 *
 * True when the entity's distance from the sub is within the ping's current
 * `radius` (edge-inclusive: exactly on the ring counts as revealed). This is a
 * pure spatial check — the engine tracks how long each entity stays "lit"
 * after the ping passes (entities fade gently; nothing is ever a fail state).
 *
 * Both inputs carry `{ x, y }`. `entity` may also expose a radius-like field
 * (`r` / `size`) to soften the boundary; if present the entity's half-size is
 * added to `radius` so a partially-overlapping entity still counts as revealed.
 *
 * @param {{x: number, y: number, r?: number, size?: number}} entity
 * @param {{x: number, y: number}} subPos
 * @param {number} radius     - current ping radius (>= 0)
 * @returns {boolean}
 */
export function revealedByPing(entity, subPos, radius) {
  if (!entity || !subPos) return false;
  if (!Number.isFinite(radius) || radius <= 0) return false;

  const er =
    typeof entity.r === 'number'
      ? entity.r
      : typeof entity.size === 'number'
        ? entity.size / 2
        : 0;

  return distance(entity.x, entity.y, subPos.x, subPos.y) <= radius + er;
}

// ---------------------------------------------------------------------------
// Headlight color cycling
// ---------------------------------------------------------------------------

/**
 * Advance to the next headlight color in `palette` (wraps from last → first).
 *
 * - `current` is interpreted modulo `palette.length`, so an out-of-range or
 *   negative current index is normalized via wraparound.
 * - Empty / non-array palette returns 0 (engine treats 0 as "no change" /
 *   "off" — there is no valid color to pick, and we never throw).
 * - Single-color palette always returns 0 (cycling is a no-op).
 *
 * @param {number} current   - index of the currently active color
 * @param {string[]} palette - list of CSS color values (non-empty)
 * @returns {number} the next palette index, wrapped into [0, palette.length)
 */
export function nextHeadlightColor(current, palette) {
  if (!Array.isArray(palette) || palette.length === 0) return 0;
  const len = palette.length;
  const base = Number.isFinite(current) ? ((current % len) + len) % len : 0;
  return (base + 1) % len;
}

// ---------------------------------------------------------------------------
// Discovery (gentle, positive-only goal — no fail state)
// ---------------------------------------------------------------------------

/**
 * Mark `entity` as discovered, deduping against `discoveredSet`.
 *
 * Rule (PRD: positive only, zero-stress):
 *   - If `entity` is missing or has no numeric `id`, returns false (no-op).
 *   - If `entity.id` is already in `discoveredSet`, returns false (already
 *     discovered — no double-count, no penalty).
 *   - Otherwise adds `entity.id` to the set, sets `entity.discovered = true`,
 *     and returns true so the engine can play a friendly blip exactly once per
 *     creature.
 *   - Mutates `entity` and `discoveredSet` in place but performs no other side
 *     effects (no DOM, no audio) — those live in the engine.
 *
 * Both ping-reveals and sub-overlap call this with the same set, so whichever
 * happens first counts; the second is a silent no-op.
 *
 * @param {{id: number, discovered?: boolean}|null|undefined} entity
 * @param {Set<number>} discoveredSet - mutable set of already-discovered ids
 * @returns {boolean} true if this call was the first discovery of `entity`
 */
export function markDiscovered(entity, discoveredSet) {
  if (!entity || !discoveredSet) return false;
  if (!Number.isFinite(entity.id)) return false;
  if (discoveredSet.has(entity.id)) return false;
  discoveredSet.add(entity.id);
  entity.discovered = true;
  return true;
}
