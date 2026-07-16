// shared/button-mapping.js — PURE button/label/event mapping for the GamepadManager.
// Zero dependencies. No DOM, no navigator, no side effects. Fully unit-tested.

// ---------------------------------------------------------------------------
// Positional face-button order (clockwise from bottom).
// ---------------------------------------------------------------------------
export const FACE_POSITIONS = ['bottom', 'right', 'left', 'top'];

// ---------------------------------------------------------------------------
// Canonical event-name constants. Every game and the GamepadManager itself
// references these so event names are never mistyped.
// ---------------------------------------------------------------------------

// Face buttons (positional) — press + `…-up` release.
export const FACE_BOTTOM = 'gamepad-face-bottom';
export const FACE_RIGHT = 'gamepad-face-right';
export const FACE_LEFT = 'gamepad-face-left';
export const FACE_TOP = 'gamepad-face-top';
export const FACE_BOTTOM_UP = 'gamepad-face-bottom-up';
export const FACE_RIGHT_UP = 'gamepad-face-right-up';
export const FACE_LEFT_UP = 'gamepad-face-left-up';
export const FACE_TOP_UP = 'gamepad-face-top-up';

// D-Pad — press + `…-up` release.
export const DPAD_UP = 'gamepad-dpad-up';
export const DPAD_DOWN = 'gamepad-dpad-down';
export const DPAD_LEFT = 'gamepad-dpad-left';
export const DPAD_RIGHT = 'gamepad-dpad-right';
export const DPAD_UP_UP = 'gamepad-dpad-up-up';
export const DPAD_DOWN_UP = 'gamepad-dpad-down-up';
export const DPAD_LEFT_UP = 'gamepad-dpad-left-up';
export const DPAD_RIGHT_UP = 'gamepad-dpad-right-up';

// Bumpers (L1/R1) — press + `…-up` release.
export const BUMPER_LEFT = 'gamepad-bumper-left';
export const BUMPER_RIGHT = 'gamepad-bumper-right';
export const BUMPER_LEFT_UP = 'gamepad-bumper-left-up';
export const BUMPER_RIGHT_UP = 'gamepad-bumper-right-up';

// Triggers (analog) — every active frame, with `detail.value`; no release event.
export const TRIGGER_LEFT = 'gamepad-trigger-left';
export const TRIGGER_RIGHT = 'gamepad-trigger-right';

// Thumbsticks (analog) — every active frame, with `detail { x, y }`; no release event.
export const STICK_LEFT = 'gamepad-stick-left';
export const STICK_RIGHT = 'gamepad-stick-right';

// Stick clicks (L3/R3) — press + `…-up` release.
export const STICK_CLICK_LEFT = 'gamepad-stick-click-left';
export const STICK_CLICK_RIGHT = 'gamepad-stick-click-right';
export const STICK_CLICK_LEFT_UP = 'gamepad-stick-click-left-up';
export const STICK_CLICK_RIGHT_UP = 'gamepad-stick-click-right-up';

// Auxiliary events dispatched by the manager (not gameplay inputs).
export const LAYOUT_CHANGE = 'gamepad-layout-change';
export const AVAILABILITY = 'gamepad-availability';

// ---------------------------------------------------------------------------
// Layout detection — parse the gamepad `id` string.
// ---------------------------------------------------------------------------

// USB Vendor/Product IDs:
//   045e → Microsoft/Xbox, 054c → Sony, 057e → Nintendo.
// Matches either the Chromium form (`Vendor: 045e Product: 0b12`) or the
// Firefox/Safari form (`045e-028e-Name`).
const VID_PID_RE =
  /(?:vendor[:\s]*([0-9a-f]{4})\D+(?:product[:\s]*([0-9a-f]{4}))?)|(?:^([0-9a-f]{3,4})-([0-9a-f]{3,4})(?:-|$))/i;

/**
 * Detect the controller layout from its `gamepad.id` string.
 * Returns 'xbox' | 'playstation' | 'switch'. Defaults to 'xbox'
 * (the standard mapping is positional by definition).
 */
export function detectLayout(rawId) {
  const id = (rawId || '').toLowerCase();
  const m = id.match(VID_PID_RE);
  const vid = (m && (m[1] || m[3])) || '';
  if (vid === '045e') return 'xbox';
  if (vid === '054c') return 'playstation';
  if (vid === '057e') return 'switch';
  if (id === 'xinput' || id.includes('xbox')) return 'xbox';
  if (
    id.includes('dualshock') ||
    id.includes('dualsense') ||
    id.includes('playstation') ||
    id.includes('sony')
  ) {
    return 'playstation';
  }
  if (
    id.includes('pro controller') ||
    id.includes('nintendo') ||
    id.includes('switch') ||
    id.includes('joycon')
  ) {
    return 'switch';
  }
  return 'xbox';
}

// ---------------------------------------------------------------------------
// Label tables — rendered by glyph.js; never hardcoded in games.
// ---------------------------------------------------------------------------

const FACE_LABELS = {
  xbox: { bottom: 'A', right: 'B', left: 'X', top: 'Y' },
  playstation: { bottom: 'Cross', right: 'Circle', left: 'Square', top: 'Triangle' },
  switch: { bottom: 'B', right: 'A', left: 'Y', top: 'X' },
};

const SHOULDER_LABELS = {
  xbox: { left: 'LB', right: 'RB' },
  playstation: { left: 'L1', right: 'R1' },
  switch: { left: 'L', right: 'R' },
};

const TRIGGER_LABELS = {
  xbox: { left: 'LT', right: 'RT' },
  playstation: { left: 'L2', right: 'R2' },
  switch: { left: 'ZL', right: 'ZR' },
};

const STICK_CLICK_LABELS = {
  xbox: { left: 'L3', right: 'R3' },
  playstation: { left: 'L3', right: 'R3' },
  switch: { left: 'L-stick', right: 'R-stick' },
};

/**
 * Return the printed label for a positional face button on the given layout.
 * `position` ∈ FACE_POSITIONS.
 */
export function faceLabel(layout, position) {
  const table = FACE_LABELS[layout] || FACE_LABELS.xbox;
  return table[position] != null ? table[position] : position;
}

/** Return the bumper label (LB/R1/L …) for `side` ∈ {'left','right'}. */
export function shoulderLabel(layout, side) {
  const table = SHOULDER_LABELS[layout] || SHOULDER_LABELS.xbox;
  return table[side] != null ? table[side] : side;
}

/** Return the trigger label (LT/L2/ZL …) for `side` ∈ {'left','right'}. */
export function triggerLabel(layout, side) {
  const table = TRIGGER_LABELS[layout] || TRIGGER_LABELS.xbox;
  return table[side] != null ? table[side] : side;
}

/** Return the stick-click label (L3 / R3 / L-stick …) for `side` ∈ {'left','right'}. */
export function stickClickLabel(layout, side) {
  const table = STICK_CLICK_LABELS[layout] || STICK_CLICK_LABELS.xbox;
  return table[side] != null ? table[side] : side;
}

// ---------------------------------------------------------------------------
// Standard-gamepad index → event mapping (W3C "standard" mapping).
// Indices 8, 9, 16 are intentionally not surfaced as gameplay events.
// ---------------------------------------------------------------------------

const BUTTON_INDEX_TO_EVENT = [
  FACE_BOTTOM, // 0
  FACE_RIGHT, // 1
  FACE_LEFT, // 2
  FACE_TOP, // 3
  BUMPER_LEFT, // 4
  BUMPER_RIGHT, // 5
  TRIGGER_LEFT, // 6 (analog; detail.value)
  TRIGGER_RIGHT, // 7 (analog; detail.value)
  null, // 8  center-left (Back/View/Select) — not surfaced
  null, // 9  center-right (Start/Menu/Options) — not surfaced
  STICK_CLICK_LEFT, // 10 L3
  STICK_CLICK_RIGHT, // 11 R3
  DPAD_UP, // 12
  DPAD_DOWN, // 13
  DPAD_LEFT, // 14
  DPAD_RIGHT, // 15
  null, // 16 Home/Guide/PS — not surfaced
];

/** Map a standard-gamepad button index (0–16) to its press event name (or null). */
export function buttonIndexToEvent(i) {
  return BUTTON_INDEX_TO_EVENT[i] ?? null;
}

// ---------------------------------------------------------------------------
// Axes → stick event. Axes 0,1 → left stick; 2,3 → right stick.
// ---------------------------------------------------------------------------

/** Map an axis index (0–3) to its stick event name, or null for unknown axes. */
export function axisToStickEvent(axisIndex) {
  if (axisIndex === 0 || axisIndex === 1) return STICK_LEFT;
  if (axisIndex === 2 || axisIndex === 3) return STICK_RIGHT;
  return null;
}

// ---------------------------------------------------------------------------
// Keyboard fallback — manager dispatches the SAME positional events on
// keydown (press) / keyup (release). Each code maps to an array of additive
// `{ name, detail? }` entries so one key can fan out (e.g. arrows → dpad +
// emulated stick). Triggers and emulated sticks carry a `detail` payload.
// Sticks emulated from held arrow/IJKL keys are assembled by the manager; this
// table only covers the discrete per-key events.
// ---------------------------------------------------------------------------

export const KEY_TO_EVENT = {
  // Face buttons.
  KeyW: [{ name: FACE_TOP }],
  KeyA: [{ name: FACE_LEFT }],
  KeyS: [{ name: FACE_BOTTOM }],
  KeyD: [{ name: FACE_RIGHT }],
  // D-Pad.
  ArrowUp: [{ name: DPAD_UP }],
  ArrowDown: [{ name: DPAD_DOWN }],
  ArrowLeft: [{ name: DPAD_LEFT }],
  ArrowRight: [{ name: DPAD_RIGHT }],
  // Bumpers.
  KeyQ: [{ name: BUMPER_LEFT }],
  KeyE: [{ name: BUMPER_RIGHT }],
  // Triggers (fully pressed → value 1).
  ShiftLeft: [{ name: TRIGGER_LEFT, detail: { value: 1 } }],
  Space: [{ name: TRIGGER_RIGHT, detail: { value: 1 } }],
  // Stick clicks.
  KeyC: [{ name: STICK_CLICK_LEFT }],
  KeyV: [{ name: STICK_CLICK_RIGHT }],
};
