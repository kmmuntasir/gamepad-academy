// games/hot-air-balloon/balloon-physics.js — PURE vertical-physics + collision
// logic for the Hot Air Balloon game. Zero dependencies. No DOM, no gamepad,
// no side effects. Unit-tested in tests/balloon-physics.test.js.
//
// Sign convention (IMPORTANT — documented for callers and tests):
//   vy is in PIXELS PER SECOND, with the screen-y axis flipped so that
//   NEGATIVE vy = upward motion (rising), POSITIVE vy = downward motion
//   (falling). This matches Canvas's downward-positive y axis: to move the
//   balloon up the screen each frame we ADD a negative vy to its y.
//
//   gravity is a POSITIVE constant (pixels/s^2) pulling vy toward positive
//   (downward). maxThrust is a POSITIVE constant (pixels/s^2); the burner's
//   effective thrust = value * maxThrust pushes vy toward negative (upward).
//   Net accel applied to vy each frame = (gravity - thrust) * dt, i.e. when
//   thrust > gravity the balloon accelerates upward; when thrust < gravity it
//   accelerates downward; equal = hover.

import { circleCollision, clamp } from '../../shared/utils.js';

/**
 * Compute the balloon's next vertical velocity from the right-trigger value.
 *
 * Formula:  thrust = value * maxThrust
 *           vy'    = vy + (gravity - thrust) * dt
 *
 * - value 0   → thrust 0   → vy grows by +gravity*dt (pure descent).
 * - value 1   → thrust = maxThrust → if maxThrust > gravity, vy decreases
 *               (balloon rises); the magnitude of the rise scales with
 *               (maxThrust - gravity).
 * - value 0.5 → thrust = maxThrust/2 → partial; hovers when maxThrust/2
 *               equals gravity, otherwise drifts gently.
 *
 * `value` is clamped to [0, 1] so a noisy >1 or <0 reading can never invert
 * the physics. `dt` is assumed already clamped by the caller (the engine
 * clamps it to avoid tunneling on lag spikes).
 *
 * @param {number} value                       right-trigger pressure 0..1
 * @param {Object} opts
 * @param {number} opts.gravity                 downward accel (px/s^2), positive
 * @param {number} opts.maxThrust               max upward accel (px/s^2), positive
 * @param {number} opts.vy                      current vertical velocity (px/s)
 * @param {number} opts.dt                      frame delta in seconds
 * @returns {number} the new vertical velocity vy' (px/s)
 */
export function verticalVelocity(value, { gravity, maxThrust, vy, dt } = {}) {
  const g = Number(gravity) || 0;
  const maxT = Number(maxThrust) || 0;
  const v = clamp(Number(value) || 0, 0, 1);
  const d = Number(dt) || 0;
  const startVy = Number(vy) || 0;
  const thrust = v * maxT;
  return startVy + (g - thrust) * d;
}

/**
 * Decide whether the balloon overlaps a star. Both inputs are circles with
 * `{ x, y, r }`. Edge-touching counts as a collect. Missing inputs or a
 * missing radius never throws — a absent `r` is treated as 0.
 *
 * @param {{x: number, y: number, r?: number}} balloon
 * @param {{x: number, y: number, r?: number}} star
 * @returns {boolean} true when the two circles overlap
 */
export function collectStar(balloon, star) {
  if (!balloon || !star) return false;
  const br = typeof balloon.r === 'number' ? balloon.r : 0;
  const sr = typeof star.r === 'number' ? star.r : 0;
  return circleCollision(
    { x: balloon.x, y: balloon.y, r: br },
    { x: star.x, y: star.y, r: sr },
  );
}

/**
 * Compute a gentle, harmless nudge for when the balloon touches a cloud.
 *
 * Rule (deterministic, never a penalty): push the balloon AWAY from the
 * cloud's center along the line connecting the two centers, plus add a small
 * UPWARD vy bump so the balloon tends to ride over clouds rather than sink
 * through them. The horizontal nudge is proportional to the overlap depth so
 * deep overlaps push harder; the upward bump is a fixed, small value.
 *
 * Returns a nudge object the engine simply adds to the balloon's position and
 * velocity. Callers should treat the cloud as non-solid: motion continues,
 * just deflected.
 *
 * @param {{x: number, y: number, r: number}} balloon
 * @param {{x: number, y: number, r: number}} cloud
 * @param {Object} [opts]
 * @param {number} [opts.bumpVy]      upward vy added (negative = up); default -40 px/s
 * @param {number} [opts.push]         position push strength multiplier; default 1.0
 * @returns {{x: number, y: number, vy: number}} nudge to apply: x/y in px, vy in px/s
 */
export function cloudBounce(balloon, cloud, { bumpVy = -40, push = 1 } = {}) {
  const safeBalloon = balloon || { x: 0, y: 0, r: 0 };
  const safeCloud = cloud || { x: 0, y: 0, r: 0 };
  const dx = safeBalloon.x - safeCloud.x;
  const dy = safeBalloon.y - safeCloud.y;
  const dist = Math.hypot(dx, dy) || 1; // guard divide-by-zero
  const overlap = (safeBalloon.r + safeCloud.r - dist) * Number(push) || 0;
  const nx = dx / dist; // unit vector cloud → balloon
  const ny = dy / dist;
  return {
    x: nx * Math.max(0, overlap),
    y: ny * Math.max(0, overlap),
    vy: Number(bumpVy) || 0,
  };
}
