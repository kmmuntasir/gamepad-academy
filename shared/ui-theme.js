// shared/ui-theme.js — theme helpers extracted from home.js so any game page
// can share the same retro-shell / CRT / reduce-motion / blip behavior.
// Zero dependencies. Assumes settings.load() has already been called by the
// page boot (so getAll() returns the persisted + merged snapshot).

import { gamepadManager } from './gamepad-manager.js';
import { getAll } from './settings.js';
import { playBlip } from './utils.js';

/**
 * Effective layout: the user's override wins over the detected physical
 * layout. Mirrors home.js ~110-114.
 * @returns {'xbox'|'playstation'|'switch'}
 */
export function effectiveLayout() {
  const override = getAll().layoutOverride;
  if (override && override !== 'auto') return override;
  return gamepadManager.getLayout();
}

/**
 * True when the OS/user has requested reduced motion. Fail-soft — returns
 * false if matchMedia is unavailable. Mirrors home.js ~117-123.
 */
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    return false;
  }
}

/**
 * Apply the theme classes to <body> (or another root). Always adds
 * `retro-shell`; toggles `no-crt` (off when CRT is on) and `reduce-motion`.
 * Mirrors home.js applyTheme ~147-158.
 *
 * @param {HTMLElement} [body] Defaults to document.body.
 */
export function applyTheme(body) {
  const root = body || document.body;
  if (!root) return;
  const s = getAll();
  root.classList.add('retro-shell');

  if (s.crt) root.classList.remove('no-crt');
  else root.classList.add('no-crt');

  const reduce = s.reduceMotion || prefersReducedMotion();
  if (reduce) root.classList.add('reduce-motion');
  else root.classList.remove('reduce-motion');
}

/**
 * Play a UI blip only when the user has uiSounds enabled. Fail-soft — never
 * surfaces audio errors. Mirrors home.js maybeBlip ~126-134.
 */
export function maybeBlip() {
  if (getAll().uiSounds) {
    try {
      playBlip();
    } catch (error) {
      // Fail soft — never surface audio errors.
    }
  }
}
