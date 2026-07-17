// home.js — console-style homepage: grid navigator + settings panel +
// live controller overlay. Zero-dependency ES module.
//
// Consumes only the `gamepad-*` window events dispatched by the shared
// GamepadManager. Never calls `navigator.getGamepads()` directly except via
// `gamepadManager.getInputState()` for the live overlay snapshot.

import { gamepadManager } from './shared/gamepad-manager.js';
import {
  load,
  getAll,
  set,
  subscribe,
  LAYOUT_OVERRIDE_VALUES,
} from './shared/settings.js';
import {
  columnsFor,
  nextIndex,
  stickRepeat,
  MIN_CARD_WIDTH,
  STICK_REPEAT_MS,
} from './shared/nav-logic.js';
import {
  createControllerGlyph,
  setControllerLayout,
  setControllerInput,
} from './shared/controller-glyph.js';
import {
  FACE_BOTTOM,
  FACE_RIGHT,
  START,
  DPAD_UP,
  DPAD_DOWN,
  DPAD_LEFT,
  DPAD_RIGHT,
  STICK_LEFT,
  LAYOUT_CHANGE,
  AVAILABILITY,
  faceLabel,
  menuLabel,
} from './shared/button-mapping.js';
import { playBlip } from './shared/utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Gap between cards in px — must match the `var(--space-5)` rule on
// `.home-grid` in shared/retro.css. --space-5 = 1.5rem = 24px at 16px base.
const GRID_GAP_PX = 24;

// Stick magnitude above which a direction is considered "pushed" for grid nav.
const STICK_NAV_DEADZONE = 0.5;

// All digital input names that the overlay mirrors each frame (so we can
// clear parts that were held last frame but released this frame).
const DIGITAL_INPUTS = [
  FACE_BOTTOM,
  FACE_RIGHT,
  'gamepad-face-left',
  'gamepad-face-top',
  DPAD_UP,
  DPAD_DOWN,
  DPAD_LEFT,
  DPAD_RIGHT,
  'gamepad-bumper-left',
  'gamepad-bumper-right',
  'gamepad-stick-click-left',
  'gamepad-stick-click-right',
];

// Settings row definitions in display order.
const TOGGLE_KEYS = ['controllerOverlay', 'crt', 'uiSounds', 'reduceMotion'];

const LAYOUT_OVERRIDE_LABELS = {
  auto: 'Auto',
  xbox: 'Xbox',
  playstation: 'PlayStation',
  switch: 'Switch',
};

// ---------------------------------------------------------------------------
// Mutable module state
// ---------------------------------------------------------------------------

const body = document.body;
const grid = document.querySelector('.home-grid');
const cardEls = Array.from(grid.querySelectorAll('.card'));
const banner = document.getElementById('gamepad-banner');
const bannerText = document.getElementById('gamepad-banner-text');
const overlayMount = document.querySelector('.controller-overlay');
const settingsMount = document.querySelector('.settings-panel');
const moveKeyEls = Array.from(document.querySelectorAll('[data-legend-key]'));

const DEFAULT_BANNER_TEXT = 'Connect a gamepad and press any button.';

let detectedLayout = 'xbox';
let currentIndex = 0;
let settingsOpen = false;
let settingsFocusIndex = 0;
let overlayRafId = null;
let overlayGlyph = null;
let overlayCurrentLayout = null;
let stickLastFireAt = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Effective layout: override wins over detected. */
function effectiveLayout() {
  const override = getAll().layoutOverride;
  if (override && override !== 'auto') return override;
  return detectedLayout;
}

/** True when reduce-motion OR prefers-reduced-motion is active. */
function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    return false;
  }
}

/** Play a UI blip only when the user has uiSounds enabled. */
function maybeBlip() {
  if (getAll().uiSounds) {
    try {
      playBlip();
    } catch (error) {
      // Fail soft — never surface audio errors.
    }
  }
}

/** Friendly banner label for a layout key. */
function layoutLabel(layout) {
  if (layout === 'playstation') return 'PlayStation';
  if (layout === 'switch') return 'Switch';
  return 'Xbox';
}

// ---------------------------------------------------------------------------
// Theme + body-class application
// ---------------------------------------------------------------------------

function applyTheme() {
  const s = getAll();
  body.classList.add('retro-shell');

  if (s.crt) body.classList.remove('no-crt');
  else body.classList.add('no-crt');

  const reduce = s.reduceMotion || prefersReducedMotion();
  if (reduce) body.classList.add('reduce-motion');
  else body.classList.remove('reduce-motion');
}

// ---------------------------------------------------------------------------
// Legend rendering (per effective layout)
// ---------------------------------------------------------------------------

function renderLegend() {
  const layout = effectiveLayout();
  // Move = D-Pad glyph (always "D-Pad" — positional arrows, layout-agnostic).
  // Select = bottom face button. Settings = Start/Menu button. Back = right face button.
  const selectLabel = faceLabel(layout, 'bottom');
  const settingsLabel = menuLabel(layout);
  const backLabel = faceLabel(layout, 'right');
  for (const el of moveKeyEls) {
    const key = el.dataset.legendKey;
    if (key === 'move') el.textContent = 'D-Pad';
    else if (key === 'select') el.textContent = selectLabel;
    else if (key === 'settings') el.textContent = settingsLabel;
    else if (key === 'back') el.textContent = backLabel;
  }
}

// ---------------------------------------------------------------------------
// Gamepad availability banner (moved from the old inline script)
// ---------------------------------------------------------------------------

function syncBanner() {
  const layout = effectiveLayout();
  if (gamepadManager.isActive()) {
    banner.classList.add('is-connected');
    bannerText.textContent = `${layoutLabel(layout)} controller connected`;
  } else {
    banner.classList.remove('is-connected');
    bannerText.textContent = DEFAULT_BANNER_TEXT;
  }
}

// ---------------------------------------------------------------------------
// Focus tracking — the active card IS the focused card.
// ---------------------------------------------------------------------------

function refreshCurrentIndex() {
  const active = document.activeElement;
  // Grid cards.
  const idx = cardEls.indexOf(active);
  if (idx >= 0) currentIndex = idx;
  // Settings controls — keep gamepad nav in sync with Tab/mouse.
  if (settingsOpen && settingsMount.contains(active)) {
    const controls = Array.from(settingsControls());
    const sidx = controls.indexOf(active);
    if (sidx >= 0) settingsFocusIndex = sidx;
  }
}

function focusCard(index) {
  const el = cardEls[index];
  if (!el) return;
  el.focus();
  currentIndex = index;
}

// `:focus` on a non-tabbable element needs tabindex="0" once to opt in. We
// add it lazily to the first card so it's focusable on initial focus.
function ensureFocusable() {
  cardEls.forEach((card) => {
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
  });
}

// ---------------------------------------------------------------------------
// Grid navigator
// ---------------------------------------------------------------------------

function moveGrid(direction) {
  const cols = columnsFor(grid.offsetWidth, MIN_CARD_WIDTH, GRID_GAP_PX);
  const next = nextIndex(currentIndex, direction, cols, cardEls.length);
  if (next === currentIndex) return;
  focusCard(next);
  maybeBlip();
}

function onGridDpad(direction) {
  if (settingsOpen) return;
  moveGrid(direction);
}

function onStick(event) {
  const { x, y } = event.detail || {};
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (Math.max(ax, ay) < STICK_NAV_DEADZONE) {
    // Released/centered → reset throttle so the next push fires immediately.
    stickLastFireAt = null;
    return;
  }

  // Dominant axis wins; W3C sign convention: up = negative y.
  const dir = ax > ay ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';

  const now = performance.now();
  const { fire } = stickRepeat(now, stickLastFireAt, STICK_REPEAT_MS);
  if (!fire) return;
  stickLastFireAt = now;

  // Settings is a single vertical list — only up/down navigate there,
  // giving the stick the same experience as the D-Pad.
  if (settingsOpen) {
    if (dir === 'up') moveSettingsRow(-1);
    else if (dir === 'down') moveSettingsRow(1);
    return;
  }

  moveGrid(dir);
}

function onSelect() {
  if (settingsOpen) {
    activateSettingsRow(settingsFocusIndex);
    return;
  }
  const card = cardEls[currentIndex];
  if (card && card.tagName === 'A') {
    maybeBlip();
    card.click();
  }
}

function onBack() {
  if (!settingsOpen) return;
  closeSettings();
}

function onStart() {
  // Start opens Settings (it does not toggle — Back closes). No-op while open
  // so the keyboard Enter (which also maps to Start) can still activate rows.
  if (!settingsOpen) openSettings();
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

function buildSettingsPanel() {
  const s = getAll();
  settingsMount.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'settings-panel__card';

  // Header.
  const header = document.createElement('div');
  header.className = 'settings-panel__header';

  const title = document.createElement('h2');
  title.className = 'settings-panel__title';
  title.textContent = 'Settings';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'settings-panel__close';
  closeBtn.setAttribute('aria-label', 'Close settings');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeSettings);

  header.appendChild(title);
  header.appendChild(closeBtn);
  card.appendChild(header);

  // Toggle rows.
  TOGGLE_KEYS.forEach((key) => {
    card.appendChild(buildToggleRow(key, s[key]));
  });

  // Cycle row: layoutOverride.
  card.appendChild(buildCycleRow('layoutOverride', s.layoutOverride));

  settingsMount.appendChild(card);
}

// Build a toggle row. The inner `.settings-panel__toggle` button is the
// focusable target (its :focus-visible ring is styled by retro.css).
function buildToggleRow(key, value) {
  const row = document.createElement('div');
  row.className = 'settings-panel__row';
  row.dataset.row = key;

  const label = document.createElement('span');
  label.className = 'settings-panel__label';
  label.textContent = SETTINGS_LABELS[key] || key;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'settings-panel__toggle';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(!!value));
  if (value) toggle.classList.add('is-on');
  toggle.addEventListener('click', () => {
    set(key, !getAll()[key]);
  });

  row.appendChild(label);
  row.appendChild(toggle);
  return row;
}

// Build a cycle row. The inner `.settings-panel__cycle` button is the
// focusable target (its :focus-visible ring is styled by retro.css).
function buildCycleRow(key, value) {
  const row = document.createElement('div');
  row.className = 'settings-panel__row';
  row.dataset.row = key;

  const label = document.createElement('span');
  label.className = 'settings-panel__label';
  label.textContent = SETTINGS_LABELS[key] || key;

  const cycle = document.createElement('button');
  cycle.type = 'button';
  cycle.className = 'settings-panel__cycle';
  cycle.textContent = LAYOUT_OVERRIDE_LABELS[value] || 'Auto';
  cycle.setAttribute('aria-label', 'Cycle controller layout');
  cycle.addEventListener('click', () => {
    const cur = getAll()[key];
    const idx = LAYOUT_OVERRIDE_VALUES.indexOf(cur);
    const nextVal = LAYOUT_OVERRIDE_VALUES[(idx + 1) % LAYOUT_OVERRIDE_VALUES.length];
    set(key, nextVal);
  });

  row.appendChild(label);
  row.appendChild(cycle);
  return row;
}

/**
 * Return the focusable control (toggle/cycle) inside each settings row.
 * These are the actual nav targets — their :focus-visible ring is styled.
 */
function settingsControls() {
  return settingsMount.querySelectorAll(
    '.settings-panel__toggle, .settings-panel__cycle',
  );
}

const SETTINGS_LABELS = {
  controllerOverlay: 'Controller overlay',
  crt: 'CRT scanlines',
  uiSounds: 'UI sounds',
  reduceMotion: 'Reduce motion',
  layoutOverride: 'Controller layout',
};

function openSettings() {
  buildSettingsPanel();
  settingsMount.hidden = false;
  settingsOpen = true;
  settingsFocusIndex = 0;
  const controls = settingsControls();
  if (controls.length > 0) controls[0].focus();
  maybeBlip();
}

function closeSettings() {
  if (!settingsOpen) return;
  settingsMount.hidden = true;
  settingsOpen = false;
  settingsMount.innerHTML = '';
  // Restore focus to the last-focused game card.
  focusCard(currentIndex);
  maybeBlip();
}

function moveSettingsRow(delta) {
  const controls = Array.from(settingsControls());
  if (controls.length === 0) return;
  let next = settingsFocusIndex + delta;
  // Wrap within the control list.
  if (next < 0) next = controls.length - 1;
  if (next >= controls.length) next = 0;
  settingsFocusIndex = next;
  controls[next].focus();
  maybeBlip();
}

function activateSettingsRow(index) {
  const controls = Array.from(settingsControls());
  const ctrl = controls[index];
  if (!ctrl) return;
  ctrl.click();
  maybeBlip();
}

// ---------------------------------------------------------------------------
// Live re-render of settings controls when settings change.
// ---------------------------------------------------------------------------

function refreshSettingsValues() {
  if (!settingsOpen) return;
  const s = getAll();
  const controls = settingsControls();
  controls.forEach((ctrl) => {
    const row = ctrl.closest('.settings-panel__row');
    if (!row) return;
    const key = row.dataset.row;
    if (key === 'layoutOverride') {
      if (ctrl.classList.contains('settings-panel__cycle')) {
        ctrl.textContent = LAYOUT_OVERRIDE_LABELS[s[key]] || 'Auto';
      }
    } else if (TOGGLE_KEYS.includes(key)) {
      if (!ctrl.classList.contains('settings-panel__toggle')) return;
      ctrl.setAttribute('aria-checked', String(!!s[key]));
      if (s[key]) ctrl.classList.add('is-on');
      else ctrl.classList.remove('is-on');
    }
  });
}

// ---------------------------------------------------------------------------
// Controller overlay
// ---------------------------------------------------------------------------

function mountOverlay() {
  if (overlayGlyph) return;
  const layout = effectiveLayout();
  overlayCurrentLayout = layout;
  overlayGlyph = createControllerGlyph({ layout });
  overlayMount.innerHTML = '';
  overlayMount.appendChild(overlayGlyph);
  overlayMount.hidden = false;
  startOverlayLoop();
}

function unmountOverlay() {
  stopOverlayLoop();
  if (overlayGlyph) {
    overlayGlyph.remove();
    overlayGlyph = null;
  }
  overlayCurrentLayout = null;
  overlayMount.hidden = true;
  overlayMount.innerHTML = '';
}

function startOverlayLoop() {
  if (overlayRafId != null) return;
  const tick = () => {
    overlayFrame();
    overlayRafId = requestAnimationFrame(tick);
  };
  overlayRafId = requestAnimationFrame(tick);
}

function stopOverlayLoop() {
  if (overlayRafId != null) {
    cancelAnimationFrame(overlayRafId);
    overlayRafId = null;
  }
}

function overlayFrame() {
  if (!overlayGlyph) return;

  // Relabel when the effective layout changed.
  const layout = effectiveLayout();
  if (layout !== overlayCurrentLayout) {
    overlayCurrentLayout = layout;
    setControllerLayout(overlayGlyph, layout);
  }

  let s;
  try {
    s = gamepadManager.getInputState();
  } catch (error) {
    return;
  }
  if (!s) return;

  // Digital parts — set held, clear the rest.
  const held = new Set(s.buttons || []);
  for (const name of DIGITAL_INPUTS) {
    try {
      setControllerInput(overlayGlyph, name, held.has(name));
    } catch (error) {
      // Fail soft — never surface to the child.
    }
  }

  // Triggers + sticks (analog).
  try {
    setControllerInput(overlayGlyph, 'gamepad-trigger-left', (s.triggers && s.triggers.left) || 0);
    setControllerInput(overlayGlyph, 'gamepad-trigger-right', (s.triggers && s.triggers.right) || 0);
  } catch (error) {
    // Fail soft.
  }
  try {
    setControllerInput(overlayGlyph, STICK_LEFT, (s.sticks && s.sticks.left) || { x: 0, y: 0 });
    setControllerInput(overlayGlyph, 'gamepad-stick-right', (s.sticks && s.sticks.right) || { x: 0, y: 0 });
  } catch (error) {
    // Fail soft.
  }
}

function syncOverlay() {
  if (getAll().controllerOverlay) mountOverlay();
  else unmountOverlay();
}

// ---------------------------------------------------------------------------
// Event handlers (referenced by the LISTENERS array below)
// ---------------------------------------------------------------------------

function onAvailability(event) {
  syncBanner();
  const detail = event && event.detail ? event.detail : {};
  // First connect: focus the first card so the gamepad has a starting point.
  if (detail.connected && document.activeElement === body) {
    ensureFocusable();
    if (cardEls.length > 0) focusCard(0);
  }
}

function onLayoutChange(event) {
  const detail = event && event.detail ? event.detail : {};
  if (detail.layout) detectedLayout = detail.layout;
  renderLegend();
  syncBanner();
}

function onDpadUp() {
  if (settingsOpen) moveSettingsRow(-1);
  else onGridDpad('up');
}
function onDpadDown() {
  if (settingsOpen) moveSettingsRow(1);
  else onGridDpad('down');
}
function onDpadLeft() {
  if (settingsOpen) return;
  onGridDpad('left');
}
function onDpadRight() {
  if (settingsOpen) return;
  onGridDpad('right');
}

function onFaceBottom() {
  onSelect();
}
function onFaceRight() {
  onBack();
}

function onSettingsKeydown(event) {
  // Keyboard parity inside settings: Enter/Space toggles the focused control
  // (native buttons already do this — we only handle the close here),
  // Escape closes. (Tab/arrows are native.)
  if (settingsOpen && event.code === 'Escape') {
    event.preventDefault();
    closeSettings();
  }
}

function onGridKeydown(event) {
  // Enter maps to the Start button (opens Settings). Suppress the native link
  // activation on grid cards so Enter opens Settings instead of following the
  // card link. Games open via Select (face-bottom / KeyS). The settings panel
  // lives outside the grid, so its controls still use native Enter/Space.
  if (event.key === 'Enter') event.preventDefault();
}

// ---------------------------------------------------------------------------
// Settings change subscription (live effects)
// ---------------------------------------------------------------------------

function onSettingsChanged() {
  applyTheme();
  renderLegend();
  syncOverlay();
  refreshSettingsValues();
}

// ---------------------------------------------------------------------------
// Listener registration + cleanup (mirrors color-match-feeder pattern)
// ---------------------------------------------------------------------------

const LISTENERS = [
  [FACE_BOTTOM, onFaceBottom],
  [FACE_RIGHT, onFaceRight],
  [START, onStart],
  [DPAD_UP, onDpadUp],
  [DPAD_DOWN, onDpadDown],
  [DPAD_LEFT, onDpadLeft],
  [DPAD_RIGHT, onDpadRight],
  [STICK_LEFT, onStick],
  [LAYOUT_CHANGE, onLayoutChange],
  [AVAILABILITY, onAvailability],
];

function cleanup() {
  LISTENERS.forEach(([name, handler]) => window.removeEventListener(name, handler));
  window.removeEventListener('focusin', onAnyFocus);
  window.removeEventListener('blur', onAnyBlur, true);
  window.removeEventListener('keydown', onSettingsKeydown);
  grid.removeEventListener('keydown', onGridKeydown);
  stopOverlayLoop();
}

// ---------------------------------------------------------------------------
// Focus tracking handlers
// ---------------------------------------------------------------------------

function onAnyFocus() {
  refreshCurrentIndex();
}
function onAnyBlur() {
  // No-op: index remains where it was so gamepad can resume from last spot.
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  load();

  // Theme + body classes FIRST so the initial paint is correct.
  applyTheme();
  renderLegend();

  // Make cards keyboard/gamepad focusable.
  ensureFocusable();

  // Initial banner state. The manager latches its active pad on the first
  // poll frame, so re-sync once after a frame to catch an already-connected
  // pad (which never fires `gamepadconnected` on this page).
  syncBanner();
  requestAnimationFrame(() => {
    syncBanner();
    // Focus the first card now that we know a pad is connected.
    if (gamepadManager.isActive() && document.activeElement === body && cardEls.length > 0) {
      ensureFocusable();
      focusCard(0);
    }
  });

  // Mount overlay if it was left enabled.
  syncOverlay();

  // Gamepad + auxiliary listeners.
  LISTENERS.forEach(([name, handler]) => window.addEventListener(name, handler));
  window.addEventListener('focusin', onAnyFocus);
  window.addEventListener('blur', onAnyBlur, true);
  window.addEventListener('keydown', onSettingsKeydown);
  grid.addEventListener('keydown', onGridKeydown);

  // Live re-apply on any setting change.
  subscribe(onSettingsChanged);

  // Unload teardown (mirror the games' pattern).
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);

  // Focus the first card on load so keyboard/gamepad have a starting point
  // when nothing else is focused.
  if (document.activeElement === body && cardEls.length > 0) {
    focusCard(0);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
