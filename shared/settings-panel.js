// shared/settings-panel.js — console-style settings overlay: toggles for the
// per-session UI flags + a layout-override cycle. Extracted from home.js
// (buildSettingsPanel/moveSettingsRow/activateSettingsRow/refreshSettingsValues
// /onSettingsKeydown ~289-619). Zero dependencies. All listeners removable.
//
// Navigation handlers fire ONLY while open (guard with `if (!open) return`),
// so the panel never steals D-pad/stick input from the underlying game.

import {
  getAll,
  set,
  subscribe,
  LAYOUT_OVERRIDE_VALUES,
} from './settings.js';
import {
  DPAD_UP,
  DPAD_DOWN,
  FACE_BOTTOM,
  FACE_RIGHT,
  STICK_LEFT,
} from './button-mapping.js';
import { stickRepeat, STICK_REPEAT_MS } from './nav-logic.js';
import { maybeBlip } from './ui-theme.js';

// Toggle row keys, in display order. The layoutOverride cycle follows these.
const TOGGLE_KEYS = ['controllerOverlay', 'crt', 'uiSounds', 'reduceMotion'];

const LAYOUT_OVERRIDE_LABELS = {
  auto: 'Auto',
  xbox: 'Xbox',
  playstation: 'PlayStation',
  switch: 'Switch',
};

const SETTINGS_LABELS = {
  controllerOverlay: 'Controller overlay',
  crt: 'CRT scanlines',
  uiSounds: 'UI sounds',
  reduceMotion: 'Reduce motion',
  layoutOverride: 'Controller layout',
};

// Stick magnitude above which a direction is considered "pushed" for settings nav.
const STICK_NAV_DEADZONE = 0.5;

/**
 * Build the settings panel DOM into mountEl. Mirrors home.js buildSettingsPanel.
 * The focusable controls (.settings-panel__toggle / .settings-panel__cycle)
 * inside each row are the nav targets.
 *
 * @param {HTMLElement} mountEl
 */
function buildPanel(mountEl) {
  const s = getAll();
  mountEl.innerHTML = '';

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

  header.appendChild(title);
  header.appendChild(closeBtn);
  card.appendChild(header);

  // Toggle rows.
  TOGGLE_KEYS.forEach((key) => {
    card.appendChild(buildToggleRow(key, s[key]));
  });

  // Cycle row: layoutOverride.
  card.appendChild(buildCycleRow('layoutOverride', s.layoutOverride));

  mountEl.appendChild(card);
  return closeBtn;
}

/**
 * Build a toggle row. The inner `.settings-panel__toggle` button is the
 * focusable target. Mirrors home.js buildToggleRow.
 */
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

/**
 * Build a cycle row. The inner `.settings-panel__cycle` button is the
 * focusable target. Mirrors home.js buildCycleRow.
 */
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
    const nextVal =
      LAYOUT_OVERRIDE_VALUES[(idx + 1) % LAYOUT_OVERRIDE_VALUES.length];
    set(key, nextVal);
  });

  row.appendChild(label);
  row.appendChild(cycle);
  return row;
}

/** Query the focusable controls (.settings-panel__toggle, .settings-panel__cycle). */
function queryControls(mountEl) {
  return mountEl.querySelectorAll('.settings-panel__toggle, .settings-panel__cycle');
}

/**
 * Create a settings panel controller bound to the given mount element.
 * @param {Object} [opts]
 * @param {HTMLElement} [opts.mountEl]  The `.settings-panel` container.
 * @param {() => void} [opts.onClose]   Called after the panel closes.
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean, destroy: () => void }}
 */
export function createSettingsPanel({ mountEl, onClose } = {}) {
  let open = false;
  let focusIndex = 0;
  let closeBtn = null;
  let stickLastFireAt = null;

  function controlsArray() {
    if (!mountEl) return [];
    return Array.from(queryControls(mountEl));
  }

  function refreshValues() {
    if (!open || !mountEl) return;
    const s = getAll();
    const controls = queryControls(mountEl);
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

  function moveRow(delta) {
    const controls = controlsArray();
    if (controls.length === 0) return;
    let next = focusIndex + delta;
    if (next < 0) next = controls.length - 1;
    if (next >= controls.length) next = 0;
    focusIndex = next;
    controls[next].focus();
    maybeBlip();
  }

  function activateRow(index) {
    const controls = controlsArray();
    const ctrl = controls[index];
    if (!ctrl) return;
    ctrl.click();
    maybeBlip();
  }

  // ----- Gamepad + keyboard handlers (guarded by `open`) -----

  function onDpadUp() {
    if (!open) return;
    moveRow(-1);
  }
  function onDpadDown() {
    if (!open) return;
    moveRow(1);
  }
  function onFaceBottom() {
    if (!open) return;
    activateRow(focusIndex);
  }
  function onFaceRight() {
    if (!open) return;
    close();
  }
  function onStick(event) {
    if (!open) return;
    const { x, y } = (event && event.detail) || {};
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (Math.max(ax, ay) < STICK_NAV_DEADZONE) {
      stickLastFireAt = null;
      return;
    }

    // Settings is a single vertical list — only up/down navigate.
    const dir = ax > ay ? null : y < 0 ? 'up' : 'down';
    if (!dir) return;

    const now = performance.now();
    const { fire } = stickRepeat(now, stickLastFireAt, STICK_REPEAT_MS);
    if (!fire) return;
    stickLastFireAt = now;

    if (dir === 'up') moveRow(-1);
    else if (dir === 'down') moveRow(1);
  }
  function onKeydown(event) {
    if (event.code === 'Escape') {
      event.preventDefault();
      close();
    }
  }
  function onCloseClick() {
    close();
  }

  // ----- Public API -----

  function openPanel() {
    if (!mountEl || open) return;
    buildPanel(mountEl);
    closeBtn = mountEl.querySelector('.settings-panel__close');
    if (closeBtn) closeBtn.addEventListener('click', onCloseClick);
    mountEl.hidden = false;
    open = true;
    focusIndex = 0;
    const controls = controlsArray();
    if (controls.length > 0) controls[0].focus();
    maybeBlip();
  }

  function closePanel() {
    if (!open) return;
    if (mountEl) {
      mountEl.hidden = true;
      mountEl.innerHTML = '';
    }
    closeBtn = null;
    open = false;
    try {
      onClose?.();
    } catch (error) {
      // Fail soft: caller's onClose must never surface to the child.
    }
    maybeBlip();
  }

  function isOpen() {
    return open;
  }

  const unsubscribe = subscribe(refreshValues);

  // Register listeners (kept around for the panel's lifetime; handlers are
  // internally guarded by `open` so they no-op when closed).
  window.addEventListener(DPAD_UP, onDpadUp);
  window.addEventListener(DPAD_DOWN, onDpadDown);
  window.addEventListener(FACE_BOTTOM, onFaceBottom);
  window.addEventListener(FACE_RIGHT, onFaceRight);
  window.addEventListener(STICK_LEFT, onStick);
  window.addEventListener('keydown', onKeydown);

  function destroy() {
    window.removeEventListener(DPAD_UP, onDpadUp);
    window.removeEventListener(DPAD_DOWN, onDpadDown);
    window.removeEventListener(FACE_BOTTOM, onFaceBottom);
    window.removeEventListener(FACE_RIGHT, onFaceRight);
    window.removeEventListener(STICK_LEFT, onStick);
    window.removeEventListener('keydown', onKeydown);
    if (closeBtn) closeBtn.removeEventListener('click', onCloseClick);
    try {
      unsubscribe();
    } catch (error) {
      // Fail soft.
    }
  }

  return { open: openPanel, close: closePanel, isOpen, destroy };
}
