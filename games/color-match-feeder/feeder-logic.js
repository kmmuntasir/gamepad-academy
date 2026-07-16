// games/color-match-feeder/feeder-logic.js — PURE food/eat-zone logic.
// Zero dependencies. No DOM, no gamepad, no side effects. Unit-tested in
// tests/feeder-logic.test.js.
//
// All math is allocation-friendly and pure: callers pass in food/monster
// objects with numeric `x`/`y` (and `r` for the monster when needed) and
// receive booleans or fresh objects back.

import { FACE_POSITIONS } from '../../shared/button-mapping.js';
import { distance } from '../../shared/utils.js';

// Drift speed range in CSS pixels per second. Slow + forgiving per spec.
const MIN_SPEED = 45;
const MAX_SPEED = 85;

// Spawn origin is just past one of the four canvas edges (in CSS pixels).
// The engine injects the play-area dimensions via `createFood({ width, height })`.
const EDGE_MARGIN = 60;

/**
 * Create a food item at a random off-screen edge, drifting toward the center.
 *
 * The `position` field is the REQUIRED face button to eat this food — it is
 * one of the four positional face buttons (NOT a layout-specific label).
 *
 * @param {Object} [opts]
 * @param {number} [opts.width=800]   Play-area width in CSS pixels.
 * @param {number} [opts.height=600]  Play-area height in CSS pixels.
 * @param {() => number} [opts.rand]  Optional RNG override (0..1) for tests.
 * @returns {{position: string, x: number, y: number, speed: number, eaten: boolean}}
 */
export function createFood({ width = 800, height = 600, rand = Math.random } = {}) {
  const position = FACE_POSITIONS[Math.floor(rand() * FACE_POSITIONS.length)];

  // Pick one of the four edges and start just outside it, aimed at the center.
  const edge = Math.floor(rand() * 4);
  let x;
  let y;
  if (edge === 0) {
    // top
    x = rand() * width;
    y = -EDGE_MARGIN;
  } else if (edge === 1) {
    // bottom
    x = rand() * width;
    y = height + EDGE_MARGIN;
  } else if (edge === 2) {
    // left
    x = -EDGE_MARGIN;
    y = rand() * height;
  } else {
    // right
    x = width + EDGE_MARGIN;
    y = rand() * height;
  }

  const speed = MIN_SPEED + rand() * (MAX_SPEED - MIN_SPEED);

  return {
    position,
    x,
    y,
    speed,
    eaten: false,
  };
}

/**
 * Whether `food` is close enough to `monster` to be eaten.
 *
 * @param {{x: number, y: number}} food    A food item.
 * @param {{x: number, y: number}} monster The center monster.
 * @param {number} radius                  Eat-zone radius in CSS pixels.
 * @returns {boolean}
 */
export function isInEatZone(food, monster, radius) {
  if (!food || !monster || typeof radius !== 'number') return false;
  return distance(food.x, food.y, monster.x, monster.y) <= radius;
}

/**
 * Whether a positional face button matches the prompt shown on a food.
 * Both arguments are positional words ('bottom' | 'right' | 'left' | 'top').
 *
 * @param {string} position
 * @param {string} prompt
 * @returns {boolean}
 */
export function positionMatchesPrompt(position, prompt) {
  return position === prompt;
}

/**
 * Advance a food item toward the monster by `speed * dt`.
 *
 * Pure: returns a NEW object with updated `x`/`y` and all other fields
 * preserved (including `eaten`). `dt` is in seconds.
 *
 * @param {{x: number, y: number, speed: number}} food
 * @param {{x: number, y: number}} monster
 * @param {number} dt                         Seconds elapsed (>= 0).
 * @returns {{x: number, y: number, speed: number, eaten: boolean, position: string}}
 */
export function updateFood(food, monster, dt) {
  if (!food || !monster) return food;
  const stepSeconds = dt > 0 ? dt : 0;
  const dx = monster.x - food.x;
  const dy = monster.y - food.y;
  const dist = Math.hypot(dx, dy);
  const travel = food.speed * stepSeconds;

  // If already at/inside the monster, hold position (don't overshoot past it).
  if (dist === 0 || travel >= dist) {
    return {
      ...food,
      x: monster.x,
      y: monster.y,
    };
  }

  const ux = dx / dist;
  const uy = dy / dist;
  return {
    ...food,
    x: food.x + ux * travel,
    y: food.y + uy * travel,
  };
}
