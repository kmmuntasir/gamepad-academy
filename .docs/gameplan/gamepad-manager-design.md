# `GamepadManager` Design — the foundation

**Part of:** [implementation-plan.md](./implementation-plan.md)
**Scope:** `shared/button-mapping.js`, `shared/gamepad-manager.js`, `shared/glyph.js` (input-related parts)

Every game depends on this module. It must be correct and stable before any game is built. This document fixes the **canonical event names** (do not change after Phase 0) and the mapping tables.

## Standard Gamepad mapping (authoritative)

Source: W3C Gamepad spec ("Standard Gamepad") + MDN. Only trust these indices when `gamepad.mapping === "standard"`.

### Buttons (indices 0–16)

| Idx | Standard role | Press event | Release event | `detail` |
|----:|---------------|-------------|---------------|----------|
| 0 | Face — bottom | `gamepad-face-bottom` | `gamepad-face-bottom-up` | — |
| 1 | Face — right | `gamepad-face-right` | `gamepad-face-right-up` | — |
| 2 | Face — left | `gamepad-face-left` | `gamepad-face-left-up` | — |
| 3 | Face — top | `gamepad-face-top` | `gamepad-face-top-up` | — |
| 4 | Left bumper (L1/LB/L) | `gamepad-bumper-left` | `gamepad-bumper-left-up` | — |
| 5 | Right bumper (R1/RB/R) | `gamepad-bumper-right` | `gamepad-bumper-right-up` | — |
| 6 | Left trigger (L2/LT/ZL) — analog | `gamepad-trigger-left` | — | `{ value }` 0.0–1.0 |
| 7 | Right trigger (R2/RT/ZR) — analog | `gamepad-trigger-right` | — | `{ value }` 0.0–1.0 |
| 8 | Center-left (Back/View/Select) | *(not surfaced)* | — | — |
| 9 | Center-right (Start/Menu/Options) | *(not surfaced)* | — | — |
| 10 | Left stick click (L3) | `gamepad-stick-click-left` | `gamepad-stick-click-left-up` | — |
| 11 | Right stick click (R3) | `gamepad-stick-click-right` | `gamepad-stick-click-right-up` | — |
| 12 | D-Pad up | `gamepad-dpad-up` | `gamepad-dpad-up-up` | — |
| 13 | D-Pad down | `gamepad-dpad-down` | `gamepad-dpad-down-up` | — |
| 14 | D-Pad left | `gamepad-dpad-left` | `gamepad-dpad-left-up` | — |
| 15 | D-Pad right | `gamepad-dpad-right` | `gamepad-dpad-right-up` | — |
| 16 | Home/Guide/PS | *(not surfaced)* | — | — |

Indices 8, 9, 16 are intentionally not surfaced as gameplay events (they vary most by platform). A game may opt in later by extending the table.

### Axes (indices 0–3)

| Axes | Stick | Event | `detail` | Sign convention |
|------|-------|-------|----------|-----------------|
| 0, 1 | Left stick | `gamepad-stick-left` | `{ x, y }` −1.0–1.0 | left = −x, up = −y |
| 2, 3 | Right stick | `gamepad-stick-right` | `{ x, y }` −1.0–1.0 | left = −x, up = −y |

Dispatch axes **every frame** (after deadzone). UI that treats up as positive must negate `y`.

### Deadzone

Apply a **radial deadzone** per stick: if `√(x² + y²) < STICK_DEADZONE` (default `0.2`), zero both axes; otherwise pass through (optionally rescale to the remaining range to avoid a snap at the edge). Triggers: a small `TRIGGER_DEADZONE` (~0.05) zeroes resting noise; pass `value` through otherwise.

## Layout detection (`detectLayout` in `button-mapping.js`)

The `gamepad.id` string is vendor-defined and **format differs by browser**:

- Chromium: `"Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)"`, `"Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"`, `"Pro Controller (Vendor: 057e Product: 2009)"`.
- Firefox/Safari: `"045e-028e-Microsoft X-Box 360 pad"`, `"054c-0ce6-Wireless Controller"`, `"057e-2009-Pro Controller"`, or bare `"xinput"` for Xbox on Firefox.

The **USB Vendor ID is the strongest signal** (Name is unreliable — DualSense reports as the generic "Wireless Controller"). VID hex codes: `045e` Microsoft/Xbox, `054c` Sony, `057e` Nintendo. Fall back to name substrings, then default to Xbox (the standard mapping is itself defined by the Xbox positional arrangement).

```javascript
// shared/button-mapping.js — PURE, unit-tested
const VID_PID_RE =
  /(?:vendor[:\s]*([0-9a-f]{4})\D+(?:product[:\s]*([0-9a-f]{4}))?)|(?:^([0-9a-f]{3,4})-([0-9a-f]{3,4})(?:-|$))/i;

export function detectLayout(rawId) {
  const id = (rawId || '').toLowerCase();
  const m = id.match(VID_PID_RE);
  const vid = (m && (m[1] || m[3])) || '';
  if (vid === '045e') return 'xbox';
  if (vid === '054c') return 'playstation';
  if (vid === '057e') return 'switch';
  if (id === 'xinput' || id.includes('xbox')) return 'xbox';
  if (id.includes('dualshock') || id.includes('dualsense') ||
      id.includes('playstation') || id.includes('sony')) return 'playstation';
  if (id.includes('pro controller') || id.includes('nintendo') ||
      id.includes('switch')) return 'switch';
  return 'xbox'; // default — standard mapping is positional by definition
}
```

The **Switch "Nintendo swap"** (physical B reported as index 0/bottom) is not a bug — the positional abstraction makes pressing the bottom button always fire `gamepad-face-bottom`, and the Switch label table (bottom=B) renders the correct glyph. Re-detect on every `gamepadconnected`.

## Label tables (`button-mapping.js`)

Rendered by `glyph.js`; never hardcoded in games.

### Face buttons (positional → label)

| Positional event | Idx | Xbox | PlayStation | Switch |
|------------------|----:|------|-------------|--------|
| `gamepad-face-bottom` | 0 | A | Cross | B |
| `gamepad-face-right` | 1 | B | Circle | A |
| `gamepad-face-left` | 2 | X | Square | Y |
| `gamepad-face-top` | 3 | Y | Triangle | X |

### Shoulders, triggers, sticks

| Input | Xbox | PlayStation | Switch |
|-------|------|-------------|--------|
| Left bumper | LB | L1 | L |
| Right bumper | RB | R1 | R |
| Left trigger | LT | L2 | ZL |
| Right trigger | RT | R2 | ZR |
| Left stick click | L3 | L3 | L-stick (press) |
| Right stick click | R3 | R3 | R-stick (press) |

Note: Nintendo does not print L3/R3 — render "press left/right stick" with a stick icon for the Switch layout.

## Event catalog & payloads

Press events fire on the rising edge (`!prev && curr`); release (`-up`) events on the falling edge (`prev && !curr`). Triggers and sticks have no release event — they fire every active frame with a `detail` payload.

- Face, D-Pad, bumper, stick-click: press + `…-up` release, no `detail`.
- Triggers: `gamepad-trigger-left` / `gamepad-trigger-right`, `detail.value` (0.0–1.0), every frame while `value > TRIGGER_DEADZONE`.
- Sticks: `gamepad-stick-left` / `gamepad-stick-right`, `detail { x, y }`, every frame while magnitude `> STICK_DEADZONE`.

Auxiliary events dispatched by the manager (not gameplay inputs):

- `gamepad-layout-change` — `detail { layout, id, mapping }` when the active layout is detected/changes.
- `gamepad-availability` — `detail { connected, id, layout }` on connect/disconnect; drives the banner.

## Polling loop & state diffing

The spec provides only `gamepadconnected`/`gamepaddisconnected` — **no per-input events**. Poll every frame; **re-fetch the gamepad by index each frame** (never cache the `Gamepad` object); diff against the previous snapshot to synthesize edges.

```javascript
// shared/gamepad-manager.js — sketch (not full impl)
class GamepadManager {
  constructor({ target = window, deadzone = 0.2, triggerDeadzone = 0.05 } = {}) {
    this.target = target;
    this.deadzone = deadzone;
    this.triggerDeadzone = triggerDeadzone;
    this.activeIndex = null;
    this.layout = 'xbox';
    this.prev = { buttons: [], axes: [] };
    this.rafId = null;
    this._bindKeyboard();
    target.addEventListener('gamepadconnected', (e) => this._onConnect(e));
    target.addEventListener('gamepaddisconnected', (e) => this._onDisconnect(e));
    this.start();
  }

  start() {
    const loop = () => {
      this._poll();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  _poll() {
    const pads = navigator.getGamepads?.() || [];
    const pad = pads[this.activeIndex] || pads.find((p) => p);
    if (!pad) return;
    this.activeIndex = pad.index;
    // diff buttons[i] pressed vs prev → dispatch press / -up
    // diff triggers[6,7].value vs deadzone → dispatch with detail.value
    // diff axes with radial deadzone → dispatch stick-left/right with detail {x,y}
    this.prev = { buttons: pad.buttons.map((b) => b.pressed), axes: [...pad.axes] };
  }

  _emit(name, detail) {
    this.target.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export const gamepadManager = new GamepadManager(); // singleton
```

On `_onConnect`: detect layout, set `this.layout`, emit `gamepad-layout-change` and `gamepad-availability`. On `_onDisconnect`: emit `gamepad-availability`; if the active pad left, clear `activeIndex` and `prev`.

## Keyboard fallback (`KEY_TO_EVENT` in `button-mapping.js`)

The manager attaches `keydown`/`keyup` listeners and dispatches the **same** positional events, so games are identical under keyboard. Press on keydown, release on keyup.

| Key | Event |
|-----|-------|
| `KeyW` / `ArrowUp` | `gamepad-face-top` / `gamepad-dpad-up` |
| `KeyA` / `ArrowLeft` | `gamepad-face-left` / `gamepad-dpad-left` |
| `KeyS` / `ArrowDown` | `gamepad-face-bottom` / `gamepad-dpad-down` |
| `KeyD` / `ArrowRight` | `gamepad-face-right` / `gamepad-dpad-right` |
| `KeyQ` / `KeyE` | `gamepad-bumper-left` / `gamepad-bumper-right` |
| `ShiftLeft` / `Space` | `gamepad-trigger-left` / `gamepad-trigger-right` (value 1) |
| `KeyC` / `KeyV` | `gamepad-stick-click-left` / `gamepad-stick-click-right` |
| `KeyI`/`KeyJ`/`KeyK`/`KeyL` | `gamepad-stick-right` (emulated right-stick vector) |
| `ArrowUp/Down/Left/Right` (also) | `gamepad-stick-left` (emulated left-stick vector) |

Rule: keyboard dispatches are **additive** — they never interfere with real gamepad polling. Layout is fixed to Xbox for keyboard prompts (or configurable). The manager also resumes the `AudioContext` on the first `keydown`/`pointerdown`.

## Public API

```javascript
gamepadManager.getLayout();   // 'xbox' | 'playstation' | 'switch'
gamepadManager.isActive();    // a gamepad is connected & active
gamepadManager.start();       // (auto-started)
gamepadManager.stop();        // cancelAnimationFrame
gamepadManager.destroy();     // stop + remove all listeners (used on full teardown)
```

Games only `addEventListener`/`removeEventListener` for `gamepad-*` on `window` (the default target). They never call `navigator.getGamepads()`.

## Glyph & icon strategy

`shared/glyph.js` exposes `createFaceGlyph({ layout, position, active })` returning a DOM node: a diamond outline with four pads (bottom/right/left/top). The active pad is filled and shows the **detected-layout label letter** from the face-label table. No trademarked console glyphs are shipped. For an unknown layout, render the diamond with a positional word ("Bottom"). This single component is reused by ~8 games so prompts stay consistent.

```javascript
import { createFaceGlyph } from '../../shared/glyph.js';
import { faceLabel } from '../../shared/button-mapping.js';

// render "press the button at this position for this layout"
const node = createFaceGlyph({ layout: gamepadManager.getLayout(), position: 'bottom' });
```

## Tests (`tests/button-mapping.test.js`)

- `detectLayout` across representative Chrome/Firefox `id` strings for Xbox, PS4/PS5, Switch; unknown default; Firefox bare `xinput`.
- `buttonIndexToEvent(i)` for every index 0–15.
- `faceLabel(layout, position)` for all 3 layouts × 4 positions (table-driven).
- Shoulder/trigger/stick label tables.
- `KEY_TO_EVENT` resolves every mapped key to the right event.

Coverage target >80%. No call to `navigator.getGamepads()` in any test.

## Edge cases

- `mapping !== "standard"` → cannot trust indices; treat as unknown layout, still dispatch via indices but render neutral glyphs and show a banner hint.
- `getGamepads()` empty until first button press (gesture gate) → banner guides the child; not an error.
- Up to 4 gamepad slots, some `null` → null-check before use.
- Hot-swap controllers → re-detect layout on connect; clear state on disconnect.
- Old Safari/iOS quirks → no modern prefix needed; test on real hardware.
- `devicePixelRatio` and resize are per-game concerns; the manager only handles input.
