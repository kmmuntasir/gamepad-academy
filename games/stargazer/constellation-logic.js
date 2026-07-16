// games/stargazer/constellation-logic.js — PURE constellation logic.
// Zero dependencies. No DOM, no Canvas, no gamepad. Fully unit-tested in
// tests/constellation-logic.test.js.
//
// These helpers operate on plain { x, y } points so the rendering layer can
// stay thin. Every function is allocation-light and side-effect free.

import { FACE_POSITIONS } from '../../shared/button-mapping.js';

// Default face position returned by `promptForDot` when a dot carries no
// explicit `requiredPosition` (keeps the helper total / safe).
const DEFAULT_POSITION = 'bottom';

/**
 * Return the first dot within `radius` of `cursor`, or `null`.
 *
 * "First within radius" is defined as the first matching dot in array order;
 * when multiple dots overlap, the caller controls precedence via the array
 * ordering. Both `cursor` and each `dot` are objects with numeric `x` and `y`.
 *
 * @param {{x:number,y:number}} cursor
 * @param {Array<{x:number,y:number}>} dots
 * @param {number} radius
 * @returns {object|null}
 */
export function findHoveredDot(cursor, dots, radius) {
  if (!cursor || !dots || !dots.length || radius == null) return null;
  const r2 = radius * radius;
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    if (!d) continue;
    const dx = d.x - cursor.x;
    const dy = d.y - cursor.y;
    if (dx * dx + dy * dy <= r2) return d;
  }
  return null;
}

/**
 * Return the face position a dot requires, or a safe default.
 *
 * Pure accessor: reads `dot.requiredPosition` and validates it against the
 * canonical FACE_POSITIONS so a malformed dot never poisons downstream code.
 *
 * @param {object} dot
 * @returns {string} one of FACE_POSITIONS
 */
export function promptForDot(dot) {
  if (dot && dot.requiredPosition && FACE_POSITIONS.includes(dot.requiredPosition)) {
    return dot.requiredPosition;
  }
  return DEFAULT_POSITION;
}

/**
 * Build the list of edges connecting ignited stars in ignition order.
 *
 * Each consecutive pair (index i → i+1) becomes an edge `{ a, b }`. With 0 or
 * 1 ignited dots there are no edges; with N ≥ 2 there are N−1 edges in order.
 * Edges reference the SAME dot objects passed in (no clones) so callers can
 * read whatever fields they need (x, y, requiredPosition, …).
 *
 * @param {Array<object>} ignited  ignited dots in the order they were lit
 * @returns {Array<{a:object,b:object}>}
 */
export function connectDots(ignited) {
  if (!ignited || ignited.length < 2) return [];
  const edges = [];
  for (let i = 0; i < ignited.length - 1; i++) {
    edges.push({ a: ignited[i], b: ignited[i + 1] });
  }
  return edges;
}

/**
 * Return true when every dot has been ignited.
 *
 * Pure replacement for the inline `lit === total` check previously at
 * game.js:227. Treats missing inputs as "not complete" (total / safe).
 *
 * @param {Array<object>} ignited  ignited dots in ignition order
 * @param {Array<object>} dots     all dots in the sky
 * @returns {boolean}
 */
export function isComplete(ignited, dots) {
  const total = (dots && dots.length) || 0;
  const lit = (ignited && ignited.length) || 0;
  return total > 0 && lit >= total;
}

/**
 * Step the cursor's velocity toward a target velocity, decelerating with
 * inertia when the target is zero (stick released → glide to a stop).
 *
 * Mirrors the shape of `verticalVelocity` in
 * games/hot-air-balloon/balloon-physics.js:45-53: a simple dt-scaled approach
 * toward the target. `decel` is the approach rate per second (higher = snappier
 * response and faster deceleration). Frame-rate independent via `dt` (seconds).
 *
 * With a non-zero target the velocity approaches the target at `decel` per
 * second; with a zero target the same math naturally decays velocity toward 0,
 * producing the glide-to-stop feel.
 *
 * @param {{vx:number,vy:number}} velocity      current cursor velocity
 * @param {{tvx:number,tvy:number}} target      target velocity (stick * speed)
 * @param {{decel:number, dt:number}} opts      approach rate (1/s) and frame dt (s)
 * @returns {{vx:number,vy:number}} new velocity
 */
export function stepCursorVelocity({ vx, vy }, { tvx, tvy }, { decel, dt }) {
  const rate = Math.max(0, Number(decel) || 0);
  const d = Math.max(0, Number(dt) || 0);
  // dt-clamped approach factor in [0,1]; at rate*dt ≥ 1 we snap to target.
  const a = 1 - Math.exp(-rate * d);
  const sx = Number(vx) || 0;
  const sy = Number(vy) || 0;
  const tx = Number(tvx) || 0;
  const ty = Number(tvy) || 0;
  return {
    vx: sx + (tx - sx) * a,
    vy: sy + (ty - sy) * a,
  };
}

/**
 * Return a celebration pulse alpha in [0, 1] for the given elapsed time.
 *
 * Uses a single sine bump over the window so the overlay fades in, peaks at the
 * midpoint, and fades out — a bright, friendly congratulations flash. Values
 * outside the window clamp to 0.
 *
 * @param {number} elapsedMs    ms since celebration started
 * @param {number} durationMs   total celebration duration
 * @returns {number} alpha in [0,1]
 */
export function celebrationAlpha(elapsedMs, durationMs) {
  const dur = Math.max(1, Number(durationMs) || 1);
  const t = Number(elapsedMs) || 0;
  if (t < 0 || t > dur) return 0;
  // Half-sine from 0 → π across the window: 0 at both ends, 1 at midpoint.
  const phase = (t / dur) * Math.PI;
  return Math.max(0, Math.min(1, Math.sin(phase)));
}
