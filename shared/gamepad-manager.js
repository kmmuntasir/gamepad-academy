// shared/gamepad-manager.js — the SINGLE engine for gamepad + keyboard input.
// This is the ONLY module permitted to call `navigator.getGamepads()`.
// Zero dependencies. ES2020+ module. Named exports + a ready-to-use singleton.

import {
  buttonIndexToEvent,
  axisToStickEvent,
  detectLayout,
  KEY_TO_EVENT,
  TRIGGER_LEFT,
  TRIGGER_RIGHT,
  STICK_LEFT,
  LAYOUT_CHANGE,
  AVAILABILITY,
} from './button-mapping.js';
import { resumeAudio } from './utils.js';

// Standard-gamepad indices that carry analog values (vs. boolean buttons).
const LEFT_TRIGGER_INDEX = 6;
const RIGHT_TRIGGER_INDEX = 7;
const LEFT_STICK_AXES = [0, 1];
const RIGHT_STICK_AXES = [2, 3];

// Arrow codes whose held state synthesizes a left-stick vector.
const KEYBOARD_STICK_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Centralized, layout-agnostic gamepad input engine.
 *
 * - Polls `navigator.getGamepads()` inside a `requestAnimationFrame` loop.
 * - Diffs each frame against the previous snapshot to synthesize rising/falling
 *   edges → dispatches positional `CustomEvent`s on `target` (default `window`).
 * - Detects the connected controller layout (Xbox/PlayStation/Switch) and
 *   re-detects on connect.
 * - Additive keyboard fallback: dispatches the SAME positional events from
 *   `keydown`/`keyup` so games are identical under keyboard. Never interferes
 *   with real gamepad polling.
 */
class GamepadManager {
  constructor({ target = window, deadzone = 0.2, triggerDeadzone = 0.05 } = {}) {
    this.target = target;
    this.deadzone = deadzone;
    this.triggerDeadzone = triggerDeadzone;

    this.activeIndex = null;
    this.layout = 'xbox';
    this.id = '';
    this.mapping = '';
    this.prev = { buttons: [], axes: [] };

    // Held Arrow keys used to synthesize `gamepad-stick-left` events.
    this._heldKeys = new Set();

    this.rafId = null;
    this.resumed = false;
    this.destroyed = false;

    // Bound handlers so we can remove them in `destroy()`.
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onConnect = this._onConnect.bind(this);
    this._onDisconnect = this._onDisconnect.bind(this);
    this._loop = this._loop.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);

    this.start();
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Start (or resume) the polling loop. Safe to call repeatedly. */
  start() {
    if (this.rafId != null || this.destroyed) return;
    this.rafId = requestAnimationFrame(this._loop);
  }

  /** Cancel the polling loop. Leaves listeners intact. */
  stop() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Full teardown: stop polling and remove every listener. Idempotent. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    this.prev = { buttons: [], axes: [] };
    this._heldKeys.clear();
    this.activeIndex = null;
    this.target = null;
  }

  // --------------------------------------------------------------------------
  // Public accessors
  // --------------------------------------------------------------------------

  /** Current detected layout: 'xbox' | 'playstation' | 'switch'. */
  getLayout() {
    return this.layout;
  }

  /**
   * Live snapshot of the active gamepad (same source `_poll` uses), or null
   * when no pad is connected. Centralizes `navigator.getGamepads()` access.
   */
  _activePad() {
    if (this.activeIndex == null) return null;
    const getGamepads = navigator.getGamepads?.bind(navigator);
    if (typeof getGamepads !== 'function') return null;
    let pads;
    try {
      pads = getGamepads() || [];
    } catch (error) {
      return null;
    }
    return pads[this.activeIndex] || null;
  }

  /** Live analog value of the left trigger (L2 / LT / ZL), 0..1; 0 when no pad. */
  getLeftTrigger() {
    const pad = this._activePad();
    const t = pad && pad.buttons[LEFT_TRIGGER_INDEX];
    return t && typeof t.value === 'number' ? t.value : 0;
  }

  /** Live analog value of the right trigger (R2 / RT / ZR), 0..1; 0 when no pad. */
  getRightTrigger() {
    const pad = this._activePad();
    const t = pad && pad.buttons[RIGHT_TRIGGER_INDEX];
    return t && typeof t.value === 'number' ? t.value : 0;
  }

  /** True when a gamepad is connected and active. */
  isActive() {
    return this.activeIndex != null;
  }

  // --------------------------------------------------------------------------
  // Polling
  // --------------------------------------------------------------------------

  _loop() {
    this._poll();
    if (!this.destroyed) {
      this.rafId = requestAnimationFrame(this._loop);
    }
  }

  _poll() {
    // Re-fetch by index every frame; never cache the Gamepad object.
    const getGamepads = navigator.getGamepads?.bind(navigator);
    if (typeof getGamepads !== 'function') return;
    let pads;
    try {
      pads = getGamepads() || [];
    } catch (error) {
      return;
    }

    const pad =
      (this.activeIndex != null && pads[this.activeIndex]) ||
      pads.find((p) => p && p.connected);
    if (!pad) return;

    // Latch onto the first connected pad if we didn't have one yet.
    if (this.activeIndex !== pad.index) {
      this.activeIndex = pad.index;
      this._applyLayout(pad);
    }

    const buttons = pad.buttons || [];
    const axes = pad.axes || [];

    this._diffButtons(buttons);
    this._diffTriggers(buttons);
    this._diffAxes(axes);

    // Snapshot for next frame's edge detection. Store only primitives.
    this.prev = {
      buttons: Array.from(buttons, (b) => b && (b.pressed || b.touched || b.value > 0)),
      axes: Array.from(axes),
    };

    // Keyboard stick emulation: synthesize a left-stick vector from held Arrow
    // keys. Real gamepad wins — skip when the active pad's left stick is above
    // deadzone to avoid double events.
    this._emitKeyboardStick(axes);
  }

  /**
   * Synthesize `gamepad-stick-left` from held Arrow keys. Skipped entirely when
   * the real gamepad's left stick is above `deadzone` (real input wins).
   */
  _emitKeyboardStick(axes) {
    if (this._heldKeys.size === 0) return;
    // Real left stick above deadzone → let the gamepad own this frame.
    const rx = Number(axes[LEFT_STICK_AXES[0]]) || 0;
    const ry = Number(axes[LEFT_STICK_AXES[1]]) || 0;
    if (Math.hypot(rx, ry) >= this.deadzone) return;

    const x = (this._heldKeys.has('ArrowRight') ? 1 : 0) -
      (this._heldKeys.has('ArrowLeft') ? 1 : 0);
    // W3C sign convention: up = negative y (matches `_emitStick`).
    const y = (this._heldKeys.has('ArrowDown') ? 1 : 0) -
      (this._heldKeys.has('ArrowUp') ? 1 : 0);
    if (Math.hypot(x, y) < this.deadzone) return;
    this._emitStick([x, y], [0, 1], STICK_LEFT);
  }

  _diffButtons(buttons) {
    const prev = this.prev.buttons || [];
    for (let i = 0; i < buttons.length; i++) {
      const evt = buttonIndexToEvent(i);
      if (!evt) continue; // indices 8/9/16 are intentionally not surfaced
      const b = buttons[i];
      if (!b) continue;

      const pressed = !!(b.pressed || b.touched || b.value > 0);
      const wasPressed = !!prev[i];

      if (pressed && !wasPressed) {
        this._resumeAudioOnce();
        this._emit(evt);
      } else if (!pressed && wasPressed) {
        this._emit(`${evt}-up`);
      }
    }
  }

  _diffTriggers(buttons) {
    const lt = buttons[LEFT_TRIGGER_INDEX];
    const rt = buttons[RIGHT_TRIGGER_INDEX];
    if (lt && typeof lt.value === 'number' && lt.value > this.triggerDeadzone) {
      this._emit(TRIGGER_LEFT, { value: lt.value });
    }
    if (rt && typeof rt.value === 'number' && rt.value > this.triggerDeadzone) {
      this._emit(TRIGGER_RIGHT, { value: rt.value });
    }
  }

  _diffAxes(axes) {
    this._emitStick(axes, LEFT_STICK_AXES, axisToStickEvent(0));
    this._emitStick(axes, RIGHT_STICK_AXES, axisToStickEvent(2));
  }

  _emitStick(axes, [xIdx, yIdx], evt) {
    if (!evt) return;
    const x = Number(axes[xIdx]) || 0;
    const y = Number(axes[yIdx]) || 0;
    const mag = Math.hypot(x, y);
    if (mag < this.deadzone) return; // radial deadzone → emit nothing
    // Pass through raw -1..1. Sign convention: left = -x, up = -y per spec.
    this._emit(evt, { x, y });
  }

  // --------------------------------------------------------------------------
  // Connect / disconnect
  // --------------------------------------------------------------------------

  _onConnect(event) {
    const pad = event.gamepad;
    if (!pad) return;
    this.activeIndex = pad.index;
    this._applyLayout(pad);
    this._emit(AVAILABILITY, {
      connected: true,
      id: pad.id,
      layout: this.layout,
    });
  }

  _onDisconnect(event) {
    const pad = event.gamepad;
    const id = pad ? pad.id : '';
    const layout = this.layout;
    const wasActive = pad && this.activeIndex === pad.index;

    this._emit(AVAILABILITY, {
      connected: false,
      id,
      layout,
    });

    if (wasActive) {
      this.activeIndex = null;
      this.prev = { buttons: [], axes: [] };
    }
  }

  _applyLayout(pad) {
    const layout = detectLayout(pad.id);
    if (layout !== this.layout || pad.id !== this.id) {
      this.layout = layout;
    }
    this.id = pad.id;
    this.mapping = pad.mapping || '';
    this._emit(LAYOUT_CHANGE, {
      layout: this.layout,
      id: this.id,
      mapping: this.mapping,
    });
  }

  // --------------------------------------------------------------------------
  // Keyboard fallback (additive — never interferes with gamepad polling)
  // --------------------------------------------------------------------------

  _onKeyDown(event) {
    this._resumeAudioOnce();
    if (KEYBOARD_STICK_CODES.has(event.code)) this._heldKeys.add(event.code);
    if (event.repeat) return; // no double-firing
    const entries = KEY_TO_EVENT[event.code];
    if (!entries) return;
    for (const { name, detail } of entries) {
      this._emit(name, detail);
    }
  }

  _onKeyUp(event) {
    if (KEYBOARD_STICK_CODES.has(event.code)) this._heldKeys.delete(event.code);
    const entries = KEY_TO_EVENT[event.code];
    if (!entries) return;
    for (const { name, detail } of entries) {
      // Triggers have no release event (analog); skip the `-up` for them.
      if (name === TRIGGER_LEFT || name === TRIGGER_RIGHT) continue;
      this._emit(`${name}-up`, detail);
    }
  }

  _onPointerDown() {
    this._resumeAudioOnce();
  }

  // --------------------------------------------------------------------------
  // Audio + dispatch helpers
  // --------------------------------------------------------------------------

  _resumeAudioOnce() {
    if (this.resumed) return;
    this.resumed = true;
    try {
      resumeAudio();
    } catch (error) {
      // Fail soft: autoplay policy or missing context must never surface.
    }
  }

  _emit(name, detail) {
    if (!this.target || this.destroyed) return;
    try {
      this.target.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
      // Fail soft: a malformed event must never surface to the child.
    }
  }
}

// Singleton — the only top-level side effect in this module.
export const gamepadManager = new GamepadManager();

export { GamepadManager };
