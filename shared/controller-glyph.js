// shared/controller-glyph.js — DOM helper that builds a FULL controller
// schematic (face buttons, D-Pad, bumpers, triggers, sticks).
// Zero dependencies. DOM-only (UI helper, not a pure module). No CSS here —
// styling lives in a separate stylesheet (shared/styles.css), exactly like
// shared/glyph.js. Every interactable part carries `data-input="<event-name>"`
// using the canonical event-name constants from ./button-mapping.js.

import {
  FACE_POSITIONS,
  FACE_BOTTOM,
  FACE_RIGHT,
  FACE_LEFT,
  FACE_TOP,
  DPAD_UP,
  DPAD_DOWN,
  DPAD_LEFT,
  DPAD_RIGHT,
  BUMPER_LEFT,
  BUMPER_RIGHT,
  TRIGGER_LEFT,
  TRIGGER_RIGHT,
  STICK_LEFT,
  STICK_RIGHT,
  STICK_CLICK_LEFT,
  STICK_CLICK_RIGHT,
  faceLabel,
  shoulderLabel,
  triggerLabel,
  stickClickLabel,
} from './button-mapping.js';

// Capitalized positional word used when the layout is unknown
// (e.g. face pad shows "Bottom" instead of "A"). Mirrors glyph.js.
const POSITION_WORD = {
  bottom: 'Bottom',
  right: 'Right',
  left: 'Left',
  top: 'Top',
};

// Map a face-position event name back to its positional word.
const FACE_EVENT_TO_POSITION = {
  [FACE_BOTTOM]: 'bottom',
  [FACE_RIGHT]: 'right',
  [FACE_LEFT]: 'left',
  [FACE_TOP]: 'top',
};

const SIDES = ['left', 'right'];

const STICK_EVENT_TO_SIDE = {
  [STICK_LEFT]: 'left',
  [STICK_RIGHT]: 'right',
};

const STICK_CLICK_EVENT_TO_SIDE = {
  [STICK_CLICK_LEFT]: 'left',
  [STICK_CLICK_RIGHT]: 'right',
};

/**
 * Label for a face pad on a given layout. Falls back to the positional WORD
 * when the layout is falsy/unknown. Same logic as glyph.js's padLabel.
 */
function facePadLabel(layout, position) {
  if (!layout || !FACE_POSITIONS.includes(position)) {
    return POSITION_WORD[position] || position;
  }
  const label = faceLabel(layout, position);
  return FACE_POSITIONS.includes(label) ? POSITION_WORD[position] : label;
}

/** Neutral label for non-face parts when layout is unknown. */
function neutralLabel(layout, label) {
  return layout ? label : '';
}

/** Create a child element with class + dataset. */
function createPart(className, inputName) {
  const el = document.createElement('div');
  el.className = className;
  if (inputName) el.dataset.input = inputName;
  return el;
}

/** Build the D-Pad cross (4 directional arms around a center). */
function buildDpad() {
  const dpad = createPart('controller-glyph__dpad');
  dpad.appendChild(createPart('controller-glyph__dpad-arm controller-glyph__dpad-arm--up', DPAD_UP));
  dpad.appendChild(createPart('controller-glyph__dpad-arm controller-glyph__dpad-arm--down', DPAD_DOWN));
  dpad.appendChild(createPart('controller-glyph__dpad-arm controller-glyph__dpad-arm--left', DPAD_LEFT));
  dpad.appendChild(createPart('controller-glyph__dpad-arm controller-glyph__dpad-arm--right', DPAD_RIGHT));
  return dpad;
}

/** Build the 4-pad face diamond (mirrors glyph.js pad structure). */
function buildFace() {
  const face = createPart('controller-glyph__face');
  FACE_POSITIONS.forEach((pos) => {
    const event = {
      bottom: FACE_BOTTOM,
      right: FACE_RIGHT,
      left: FACE_LEFT,
      top: FACE_TOP,
    }[pos];
    const pad = createPart(`controller-glyph__pad controller-glyph__pad--${pos}`, event);
    pad.dataset.position = pos;
    face.appendChild(pad);
  });
  return face;
}

/** Build a single bumper bar. */
function buildBumper(side) {
  const event = side === 'left' ? BUMPER_LEFT : BUMPER_RIGHT;
  const bumper = createPart(`controller-glyph__bumper controller-glyph__bumper--${side}`, event);
  bumper.dataset.side = side;
  return bumper;
}

/** Build a single trigger bar. */
function buildTrigger(side) {
  const event = side === 'left' ? TRIGGER_LEFT : TRIGGER_RIGHT;
  const trigger = createPart(`controller-glyph__trigger controller-glyph__trigger--${side}`, event);
  trigger.dataset.side = side;
  return trigger;
}

/** Build a single analog stick with click indicator + movable dot. */
function buildStick(side) {
  const stickEvent = side === 'left' ? STICK_LEFT : STICK_RIGHT;
  const clickEvent = side === 'left' ? STICK_CLICK_LEFT : STICK_CLICK_RIGHT;

  const stick = createPart(`controller-glyph__stick controller-glyph__stick--${side}`, stickEvent);
  stick.dataset.side = side;

  // Click indicator (L3/R3) is a distinct interactable part nested inside.
  const click = createPart(
    `controller-glyph__stick-click controller-glyph__stick-click--${side}`,
    clickEvent,
  );
  click.dataset.side = side;

  // Movable dot whose transform reflects the analog vector.
  const dot = createPart(`controller-glyph__stick-dot controller-glyph__stick-dot--${side}`);
  dot.dataset.role = 'stick-dot';

  stick.appendChild(dot);
  stick.appendChild(click);
  return stick;
}

/** Light a digital part (face/dpad/bumper/stick-click) on or off. */
function setDigital(part, on) {
  if (!part) return;
  if (on) {
    part.classList.add('is-active');
    part.dataset.active = 'true';
  } else {
    part.classList.remove('is-active');
    delete part.dataset.active;
  }
}

/** Set a trigger bar's fill proportional to a 0..1 intensity. */
function setTriggerIntensity(part, value) {
  if (!part) return;
  const intensity = Math.max(0, Math.min(1, Number(value) || 0));
  part.dataset.intensity = String(intensity);
  if (intensity > 0) {
    part.classList.add('is-active');
    part.style.opacity = String(0.3 + 0.7 * intensity);
  } else {
    part.classList.remove('is-active');
    part.style.opacity = '';
  }
}

/** Translate a stick's inner dot by the {x, y} vector (-1..1 each). */
function setStickVector(part, vector) {
  if (!part) return;
  const dot = part.querySelector('[data-role="stick-dot"]');
  if (!dot) return;
  const x = vector && Number.isFinite(vector.x) ? vector.x : 0;
  const y = vector && Number.isFinite(vector.y) ? vector.y : 0;
  part.dataset.x = String(x);
  part.dataset.y = String(y);
  if (x === 0 && y === 0) {
    dot.style.transform = '';
    part.classList.remove('is-active');
  } else {
    // Percent-based translate keeps the helper CSS-agnostic: the stylesheet
    // sizes the stick + dot, and this expresses the vector as a fraction of
    // half the stick's box (so 1.0 reaches the rim).
    dot.style.transform = `translate(${x * 50}%, ${y * 50}%)`;
    part.classList.add('is-active');
  }
}

/** Apply a label to a face pad given its position + the node's layout. */
function labelFacePad(pad, layout) {
  const position = pad.dataset.position;
  if (!position) return;
  pad.textContent = pad.classList.contains('is-active') ? facePadLabel(layout, position) : '';
}

/** Apply a label to a bumper given its side + the node's layout. */
function labelBumper(bumper, layout) {
  const side = bumper.dataset.side;
  if (!side) return;
  bumper.textContent = neutralLabel(layout, shoulderLabel(layout, side));
}

/** Apply a label to a trigger given its side + the node's layout. */
function labelTrigger(trigger, layout) {
  const side = trigger.dataset.side;
  if (!side) return;
  trigger.textContent = neutralLabel(layout, triggerLabel(layout, side));
}

/** Apply a label to a stick-click indicator given side + node's layout. */
function labelStickClick(click, layout) {
  const side = click.dataset.side;
  if (!side) return;
  click.textContent = neutralLabel(layout, stickClickLabel(layout, side));
}

/**
 * Build a full controller schematic DOM node.
 *
 * @param {Object} opts
 * @param {string} [opts.layout] - 'xbox' | 'playstation' | 'switch' (falsy → positional word)
 * @returns {HTMLDivElement}
 */
export function createControllerGlyph({ layout } = {}) {
  const root = document.createElement('div');
  root.className = 'controller-glyph';
  root._layout = layout || null;

  // Shoulder row: bumpers + triggers along the top edge.
  const shoulders = createPart('controller-glyph__shoulders');
  shoulders.appendChild(buildTrigger('left'));
  shoulders.appendChild(buildTrigger('right'));
  shoulders.appendChild(buildBumper('left'));
  shoulders.appendChild(buildBumper('right'));
  root.appendChild(shoulders);

  // Body: D-Pad on the left, face diamond on the right.
  const body = createPart('controller-glyph__body');
  body.appendChild(buildDpad());
  body.appendChild(buildFace());
  root.appendChild(body);

  // Stick row: two analog sticks along the bottom.
  const sticks = createPart('controller-glyph__sticks');
  sticks.appendChild(buildStick('left'));
  sticks.appendChild(buildStick('right'));
  root.appendChild(sticks);

  // Label everything for the initial layout (no-op when layout falsy).
  setControllerLayout(root, root._layout);

  return root;
}

/**
 * Re-label every part for a newly detected layout WITHOUT rebuilding the DOM.
 * Preserves active/highlighted states and any applied analog intensity/vector.
 */
export function setControllerLayout(node, layout) {
  if (!node) return;
  node._layout = layout || null;
  const layoutValue = node._layout;

  node.querySelectorAll('.controller-glyph__pad').forEach((pad) => labelFacePad(pad, layoutValue));
  node
    .querySelectorAll('.controller-glyph__bumper')
    .forEach((bumper) => labelBumper(bumper, layoutValue));
  node
    .querySelectorAll('.controller-glyph__trigger')
    .forEach((trigger) => labelTrigger(trigger, layoutValue));
  node
    .querySelectorAll('.controller-glyph__stick-click')
    .forEach((click) => labelStickClick(click, layoutValue));
}

/**
 * Light/clear a part identified by its canonical `data-input` event name.
 *
 * Digital inputs (face, dpad, bumpers, stick-clicks): `value` is boolean.
 * Analog triggers: `value` is a 0..1 intensity (sets fill opacity).
 * Analog sticks: `value` is `{ x, y }` with each axis in -1..1 (translates dot).
 * A falsy/zero value resets the part to its rest state.
 */
export function setControllerInput(node, inputName, value) {
  if (!node || !inputName) return;
  const part = node.querySelector(`[data-input="${inputName}"]`);
  if (!part) return;

  if (inputName === TRIGGER_LEFT || inputName === TRIGGER_RIGHT) {
    setTriggerIntensity(part, value);
    return;
  }

  if (inputName === STICK_LEFT || inputName === STICK_RIGHT) {
    setStickVector(part, value);
    return;
  }

  // Digital: face, dpad, bumpers, stick-clicks.
  setDigital(part, !!value);

  // Face pads render their label only while active (mirrors glyph.js).
  if (part.classList.contains('controller-glyph__pad')) {
    const position = FACE_EVENT_TO_POSITION[inputName];
    if (position) {
      part.textContent = value ? facePadLabel(node._layout, position) : '';
    }
  }
}
