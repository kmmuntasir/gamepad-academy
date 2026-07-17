// shared/controller-overlay.js — live controller schematic that mirrors the
// held inputs each rAF frame. Extracted verbatim from home.js
// (mountOverlay/unmountOverlay/overlayFrame/syncOverlay ~467-564).
// Zero dependencies. Reads getInputState() only (never navigator.getGamepads).

import { gamepadManager } from './gamepad-manager.js';
import {
  createControllerGlyph,
  setControllerLayout,
  setControllerInput,
} from './controller-glyph.js';
import { getAll, subscribe } from './settings.js';
import {
  FACE_BOTTOM,
  FACE_RIGHT,
  DPAD_UP,
  DPAD_DOWN,
  DPAD_LEFT,
  DPAD_RIGHT,
  STICK_LEFT,
  TRIGGER_LEFT,
  TRIGGER_RIGHT,
} from './button-mapping.js';
import { effectiveLayout } from './ui-theme.js';

// All digital input names the overlay mirrors each frame (so we can clear
// parts that were held last frame but released this frame).
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

/**
 * Create a live controller overlay controller bound to the given mount point.
 * Mirrors home.js overlay behavior: mounts when controllerOverlay=true, rAF
 * reads getInputState() each frame, clears parts on release, relabels on
 * layout change.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.mountEl  The `.controller-overlay` container.
 * @returns {{ sync: () => void, destroy: () => void }}
 */
export function createOverlayController({ mountEl }) {
  let glyph = null;
  let rafId = null;
  let currentLayout = null;

  function overlayFrame() {
    if (!glyph) return;

    // Relabel when the effective layout changed.
    const layout = effectiveLayout();
    if (layout !== currentLayout) {
      currentLayout = layout;
      setControllerLayout(glyph, layout);
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
        setControllerInput(glyph, name, held.has(name));
      } catch (error) {
        // Fail soft — never surface to the child.
      }
    }

    // Triggers + sticks (analog).
    try {
      setControllerInput(glyph, TRIGGER_LEFT, (s.triggers && s.triggers.left) || 0);
      setControllerInput(glyph, TRIGGER_RIGHT, (s.triggers && s.triggers.right) || 0);
    } catch (error) {
      // Fail soft.
    }
    try {
      setControllerInput(glyph, STICK_LEFT, (s.sticks && s.sticks.left) || { x: 0, y: 0 });
      setControllerInput(
        glyph,
        'gamepad-stick-right',
        (s.sticks && s.sticks.right) || { x: 0, y: 0 },
      );
    } catch (error) {
      // Fail soft.
    }
  }

  function startLoop() {
    if (rafId != null) return;
    const tick = () => {
      overlayFrame();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function mountGlyph() {
    if (glyph) return; // idempotent
    const layout = effectiveLayout();
    currentLayout = layout;
    glyph = createControllerGlyph({ layout });
    mountEl.innerHTML = '';
    mountEl.appendChild(glyph);
    mountEl.hidden = false;
    startLoop();
  }

  function unmountGlyph() {
    stopLoop();
    if (glyph) {
      glyph.remove();
      glyph = null;
    }
    currentLayout = null;
    if (mountEl) {
      mountEl.hidden = true;
      mountEl.innerHTML = '';
    }
  }

  function sync() {
    if (getAll().controllerOverlay) mountGlyph();
    else unmountGlyph();
  }

  const unsubscribe = subscribe(sync);

  function destroy() {
    unmountGlyph();
    try {
      unsubscribe();
    } catch (error) {
      // Fail soft: subscription cleanup must never throw.
    }
  }

  return { sync, destroy };
}
