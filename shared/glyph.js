// shared/glyph.js — DOM helper that builds the positional face-button glyph.
// Zero dependencies. DOM-only (UI helper, not a pure module).
// Relies on `.face-glyph`, `.face-glyph__pad[--pos]`, `.face-glyph__center`
// classes defined in shared/styles.css.

import { FACE_POSITIONS, faceLabel } from './button-mapping.js';

// Capitalized positional word used when the layout is unknown
// (e.g. active pad shows "Bottom" instead of "A").
const POSITION_WORD = {
  bottom: 'Bottom',
  right: 'Right',
  left: 'Left',
  top: 'Top',
};

/**
 * Label for a pad on a given layout. Falls back to the positional WORD
 * (e.g. "Bottom") when the layout is falsy, unknown, or unmapped.
 */
function padLabel(layout, position) {
  if (!layout || !FACE_POSITIONS.includes(position)) {
    return POSITION_WORD[position] || position;
  }
  // faceLabel already falls back to the raw position string for unknown
  // layouts/positions, so normalize that into the positional word.
  const label = faceLabel(layout, position);
  return FACE_POSITIONS.includes(label) ? POSITION_WORD[position] : label;
}

/** Create a single pad element for `position`. */
function createPad(position) {
  const pad = document.createElement('div');
  pad.className = `face-glyph__pad face-glyph__pad--${position}`;
  pad.dataset.position = position;
  return pad;
}

/** Clear active state + text on every pad under `node`. */
function clearAllPads(node) {
  node.querySelectorAll('.face-glyph__pad').forEach((pad) => {
    pad.classList.remove('is-active');
    delete pad.dataset.active;
    pad.textContent = '';
  });
}

/** Activate + label a single pad identified by `data-position`. */
function activatePad(node, position, layout) {
  const pad = node.querySelector(`.face-glyph__pad[data-position="${position}"]`);
  if (!pad) return;
  pad.classList.add('is-active');
  pad.dataset.active = 'true';
  pad.textContent = padLabel(layout, position);
}

/**
 * Build a face-button glyph DOM node.
 *
 * @param {Object} opts
 * @param {string} opts.layout   - 'xbox' | 'playstation' | 'switch' (falsy → positional word)
 * @param {string} opts.position - which pad is active (one of FACE_POSITIONS)
 * @param {boolean} [opts.active]- when truthy, highlight + label `position`
 * @returns {HTMLDivElement}
 */
export function createFaceGlyph({ layout, position, active = false } = {}) {
  const root = document.createElement('div');
  root.className = 'face-glyph';
  root._layout = layout || null;

  FACE_POSITIONS.forEach((pos) => root.appendChild(createPad(pos)));

  // Optional center slot per stylesheet (empty, available for callers).
  const center = document.createElement('div');
  center.className = 'face-glyph__center';
  root.appendChild(center);

  if (active && position) {
    activatePad(root, position, root._layout);
  }

  return root;
}

/**
 * Move the active highlight to `position`, re-labeling with the glyph's
 * CURRENT (stored) layout. Clears any previously active pad.
 */
export function setGlyphActive(node, position) {
  clearAllPads(node);
  if (position) {
    activatePad(node, position, node._layout);
  }
}

/**
 * Re-label every pad for a newly detected layout. Keeps the currently
 * active position active; non-active pads stay blank per spec.
 */
export function setGlyphLayout(node, layout) {
  node._layout = layout || null;
  const activePad = node.querySelector('.face-glyph__pad.is-active');
  if (!activePad) return;
  const position = activePad.dataset.position;
  activePad.textContent = padLabel(node._layout, position);
}
