// shared/gamepad-banner.js — controller-connected banner synced to the
// GamepadManager's AVAILABILITY + LAYOUT_CHANGE events. Mirrors home.js
// syncBanner (~181-190). Zero dependencies; all listeners are removable.

import { gamepadManager } from './gamepad-manager.js';
import { AVAILABILITY, LAYOUT_CHANGE } from './button-mapping.js';
import { effectiveLayout } from './ui-theme.js';

/**
 * Friendly banner label for a layout key. Defaults to 'Xbox' for unknown.
 * @param {'xbox'|'playstation'|'switch'} layout
 * @returns {string}
 */
function labelForLayout(layout) {
  if (layout === 'xbox') return 'Xbox';
  if (layout === 'playstation') return 'PlayStation';
  if (layout === 'switch') return 'Switch';
  return 'Xbox';
}

/**
 * Mount the gamepad availability banner. Returns { sync, destroy }.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.bannerEl    The banner container (gets is-connected class).
 * @param {HTMLElement} opts.textEl      The element whose textContent reflects status.
 * @param {string} [opts.defaultText]    Text shown when no controller is connected.
 * @returns {{ sync: () => void, destroy: () => void }}
 */
export function mountGamepadBanner({
  bannerEl,
  textEl,
  defaultText = 'Connect a gamepad and press any button.',
}) {
  function sync() {
    if (!bannerEl || !textEl) return;
    if (gamepadManager.isActive()) {
      bannerEl.classList.add('is-connected');
      textEl.textContent = `${labelForLayout(effectiveLayout())} controller connected`;
    } else {
      bannerEl.classList.remove('is-connected');
      textEl.textContent = defaultText;
    }
  }

  window.addEventListener(AVAILABILITY, sync);
  window.addEventListener(LAYOUT_CHANGE, sync);

  function destroy() {
    window.removeEventListener(AVAILABILITY, sync);
    window.removeEventListener(LAYOUT_CHANGE, sync);
  }

  return { sync, destroy };
}
