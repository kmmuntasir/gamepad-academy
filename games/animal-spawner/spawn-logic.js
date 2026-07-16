// games/animal-spawner/spawn-logic.js — PURE spawn + palette logic.
// Zero dependencies. No DOM, no gamepad, no side effects. Unit-tested in
// tests/spawn-logic.test.js.

// Face-position → animal emoji + label mapping (positional, not layout-specific).
// Bottom→Cat, Right→Dog, Left→Bird, Top→Frog per game spec.
const ANIMALS = {
  bottom: { emoji: '🐱', label: 'Cat', position: 'bottom' },
  right: { emoji: '🐶', label: 'Dog', position: 'right' },
  left: { emoji: '🐦', label: 'Bird', position: 'left' },
  top: { emoji: '🐸', label: 'Frog', position: 'top' },
};

/**
 * Return the animal descriptor for a positional face button.
 *
 * @param {string} position - one of 'bottom' | 'right' | 'left' | 'top'
 * @returns {{emoji: string, label: string, position: string}|null}
 *          the animal, or null for an unknown position.
 */
export function animalForPosition(position) {
  const animal = ANIMALS[position];
  if (!animal) return null;
  // Return a fresh object so callers can mutate without polluting the table.
  return { emoji: animal.emoji, label: animal.label, position: animal.position };
}

// D-Pad direction → signed step through the palette.
// Up/Right advance (+1 wrap), Down/Left retreat (-1 wrap) per task spec.
const DIRECTION_STEP = {
  up: 1,
  right: 1,
  down: -1,
  left: -1,
};

/**
 * Compute the next palette index for a D-Pad press.
 *
 * @param {string} direction - 'up' | 'down' | 'left' | 'right'
 * @param {string[]} palette - non-empty array of colors
 * @param {number} currentIndex - current index into `palette`
 * @returns {number} the new (wrapped) index, or `currentIndex` for an
 *                   empty palette / unknown direction.
 */
export function nextBackgroundColor(direction, palette, currentIndex) {
  if (!Array.isArray(palette) || palette.length === 0) return currentIndex;
  const step = DIRECTION_STEP[direction];
  if (step == null) return currentIndex;
  const len = palette.length;
  // ((index % len) + len) % len handles negative wraparound correctly.
  return ((currentIndex + step) % len + len) % len;
}
