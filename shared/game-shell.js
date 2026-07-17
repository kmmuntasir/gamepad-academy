// shared/game-shell.js — reusable shell every game page mounts.
// Provides: retro theme, persistent controller overlay, gamepad banner,
// Start-button pause menu (Resume / Restart / Back to Home / Settings), and
// the settings panel. Games gate their loop + gameplay input on isPaused().
//
// Zero dependencies. Consumes only the `gamepad-*` window events dispatched
// by the shared GamepadManager — never calls navigator.getGamepads() directly.
// Fail-soft: no public path throws.

import { load, subscribe } from './settings.js';
import {
  START,
  DPAD_UP,
  DPAD_DOWN,
  FACE_BOTTOM,
  FACE_RIGHT,
  STICK_LEFT,
} from './button-mapping.js';
import { stickRepeat, STICK_REPEAT_MS } from './nav-logic.js';
import { applyTheme, maybeBlip } from './ui-theme.js';
import { mountGamepadBanner } from './gamepad-banner.js';
import { createOverlayController } from './controller-overlay.js';
import { createSettingsPanel } from './settings-panel.js';

// Stick magnitude above which a direction is considered "pushed" for pause nav.
const STICK_NAV_DEADZONE = 0.5;

// Pause-menu actions in display order (must match the buttons built below).
const PAUSE_ACTIONS = ['resume', 'restart', 'home', 'settings'];

/**
 * Mount the game shell on the current page. Returns the pause-control API.
 *
 * @param {Object} [options]
 * @param {string} [options.homeUrl='../../index.html']
 * @param {() => void} [options.onRestart=() => window.location.reload()]
 * @param {HTMLElement} [options.bannerEl]     Optional banner mount (paired with bannerTextEl).
 * @param {HTMLElement} [options.bannerTextEl] Optional banner text element.
 * @returns {{ isPaused: () => boolean, pause: () => void, resume: () => void, destroy: () => void }}
 */
export function mountGameShell(options = {}) {
  const {
    homeUrl = '../../index.html',
    onRestart = () => window.location.reload(),
    bannerEl = null,
    bannerTextEl = null,
  } = options;

  // -------------------------------------------------------------------------
  // Boot: theme + body class.
  // -------------------------------------------------------------------------
  load();
  try {
    applyTheme(document.body);
  } catch (error) {
    // Fail soft — theme must never break the game.
  }
  document.body.classList.add('game-page');

  // -------------------------------------------------------------------------
  // Mount containers (created + owned by the shell).
  // -------------------------------------------------------------------------
  const overlayMount = ensureMount('controller-overlay');
  const settingsMount = ensureMount('settings-panel');
  const pauseMount = ensureMount('game-pause');

  let overlayController = null;
  try {
    overlayController = createOverlayController({ mountEl: overlayMount });
    overlayController.sync();
  } catch (error) {
    // Fail soft — overlay is non-critical.
  }

  let settingsController = null;
  try {
    settingsController = createSettingsPanel({ mountEl: settingsMount, onClose: null });
  } catch (error) {
    // Fail soft — settings is non-critical.
  }

  // Optional banner.
  let bannerController = null;
  if (bannerEl && bannerTextEl) {
    try {
      bannerController = mountGamepadBanner({
        bannerEl,
        textEl: bannerTextEl,
        defaultText: 'Connect a gamepad and press any button.',
      });
      bannerController.sync();
    } catch (error) {
      // Fail soft — banner is non-critical.
    }
  }

  // Live re-apply theme + overlay on settings changes.
  const unsubscribe = subscribe(() => {
    try {
      applyTheme(document.body);
    } catch (error) {
      // Fail soft.
    }
    try {
      overlayController?.sync();
    } catch (error) {
      // Fail soft.
    }
  });

  // -------------------------------------------------------------------------
  // Pause menu DOM.
  // -------------------------------------------------------------------------
  const { pauseButtons } = buildPauseMenu(pauseMount, runAction);

  // -------------------------------------------------------------------------
  // Pause state.
  // -------------------------------------------------------------------------
  let paused = false;
  let pauseFocusIndex = 0;
  let stickLastFireAt = null;

  function isPaused() {
    return paused;
  }

  function pause() {
    paused = true;
    pauseMount.hidden = false;
    pauseFocusIndex = 0;
    focusPauseItem(0);
    maybeBlip();
    try {
      window.dispatchEvent(new CustomEvent('game-shell:paused'));
    } catch (error) {
      // Fail soft.
    }
  }

  function resume() {
    if (!paused) return;
    paused = false;
    pauseMount.hidden = true;
    maybeBlip();
    try {
      window.dispatchEvent(new CustomEvent('game-shell:resumed'));
    } catch (error) {
      // Fail soft.
    }
  }

  // -------------------------------------------------------------------------
  // Pause-menu navigation helpers.
  // -------------------------------------------------------------------------

  function focusPauseItem(index) {
    const el = pauseButtons[index];
    if (!el) return;
    pauseButtons.forEach((b, i) => b.classList.toggle('is-active', i === index));
    try {
      el.focus();
    } catch (error) {
      // Fail soft.
    }
  }

  function movePauseFocus(delta) {
    if (!paused || (settingsController && settingsController.isOpen())) return;
    const len = pauseButtons.length;
    if (len === 0) return;
    let next = pauseFocusIndex + delta;
    if (next < 0) next = len - 1;
    if (next >= len) next = 0;
    pauseFocusIndex = next;
    focusPauseItem(next);
    maybeBlip();
  }

  function activateFocused() {
    if (!paused || (settingsController && settingsController.isOpen())) return;
    runAction(PAUSE_ACTIONS[pauseFocusIndex]);
  }

  function runAction(action) {
    switch (action) {
      case 'resume':
        resume();
        return;
      case 'restart':
        resume();
        try {
          onRestart();
        } catch (error) {
          // Fail soft — fall back to reload.
          window.location.reload();
        }
        return;
      case 'home':
        window.location.href = homeUrl;
        return;
      case 'settings':
        try {
          settingsController?.open();
        } catch (error) {
          // Fail soft.
        }
        return;
      default:
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Listeners (all on window, all removable).
  // -------------------------------------------------------------------------

  function onStart() {
    if (settingsController && settingsController.isOpen()) {
      settingsController.close();
      return;
    }
    if (paused) resume();
    else pause();
  }

  function onDpadUp() {
    movePauseFocus(-1);
  }
  function onDpadDown() {
    movePauseFocus(1);
  }
  function onFaceBottom() {
    activateFocused();
  }
  function onFaceRight() {
    if (!paused || (settingsController && settingsController.isOpen())) return;
    resume();
  }

  function onStick(event) {
    if (!paused || (settingsController && settingsController.isOpen())) return;
    const { x, y } = (event && event.detail) || {};
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (Math.max(ax, ay) < STICK_NAV_DEADZONE) {
      stickLastFireAt = null;
      return;
    }

    // Dominant axis wins; up/down only.
    if (ax > ay) return;
    const dir = y < 0 ? -1 : 1;

    const now = performance.now();
    const { fire } = stickRepeat(now, stickLastFireAt, STICK_REPEAT_MS);
    if (!fire) return;
    stickLastFireAt = now;

    movePauseFocus(dir);
  }

  function onKeydown(event) {
    // Escape backs out of settings first, then pause.
    if (event.code === 'Escape') {
      if (settingsController && settingsController.isOpen()) {
        event.preventDefault();
        settingsController.close();
      } else if (paused) {
        event.preventDefault();
        resume();
      }
    }
  }

  const windowListeners = [
    [START, onStart],
    [DPAD_UP, onDpadUp],
    [DPAD_DOWN, onDpadDown],
    [FACE_BOTTOM, onFaceBottom],
    [FACE_RIGHT, onFaceRight],
    [STICK_LEFT, onStick],
    ['keydown', onKeydown],
  ];

  windowListeners.forEach(([name, handler]) => window.addEventListener(name, handler));

  // Native click parity on pause items (mouse).
  const clickHandlers = pauseButtons.map((btn) => {
    const handler = () => {
      const idx = pauseButtons.indexOf(btn);
      if (idx < 0) return;
      pauseFocusIndex = idx;
      runAction(PAUSE_ACTIONS[idx]);
    };
    btn.addEventListener('click', handler);
    return { btn, handler };
  });

  // -------------------------------------------------------------------------
  // Teardown.
  // -------------------------------------------------------------------------
  function destroy() {
    windowListeners.forEach(([name, handler]) => window.removeEventListener(name, handler));
    clickHandlers.forEach(({ btn, handler }) => btn.removeEventListener('click', handler));
    try {
      overlayController?.destroy();
    } catch (error) {
      // Fail soft.
    }
    try {
      settingsController?.destroy();
    } catch (error) {
      // Fail soft.
    }
    try {
      bannerController?.destroy();
    } catch (error) {
      // Fail soft.
    }
    try {
      unsubscribe();
    } catch (error) {
      // Fail soft.
    }
    overlayMount.remove();
    settingsMount.remove();
    pauseMount.remove();
  }

  return { isPaused, pause, resume, destroy };
}

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

/**
 * Find or create a mount container with the given class on document.body.
 * Marks shell-created containers so destroy() only removes its own.
 */
function ensureMount(className) {
  let el = document.body.querySelector(`.${className}`);
  if (!el) {
    el = document.createElement('div');
    el.className = className;
    el.hidden = true;
    el.dataset.gameShell = 'true';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Build the pause-menu DOM into mountEl. Returns the 4-item button array.
 * @param {HTMLElement} mountEl
 * @param {(action: string) => void} onAction
 */
function buildPauseMenu(mountEl, onAction) {
  mountEl.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'game-pause__card';

  const title = document.createElement('h2');
  title.className = 'game-pause__title';
  title.textContent = 'Paused';
  card.appendChild(title);

  const labels = {
    resume: 'Resume',
    restart: 'Restart',
    home: 'Back to Home',
    settings: 'Settings',
  };

  const pauseButtons = PAUSE_ACTIONS.map((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-pause__item';
    btn.dataset.action = action;
    btn.textContent = labels[action] || action;
    // Click handler is wired by the caller (so it can own the handler refs).
    card.appendChild(btn);
    return btn;
  });

  mountEl.appendChild(card);
  return { pauseButtons };
}
