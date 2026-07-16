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
