---
trigger: model_decision
description: Ruleset that MUST be followed when writing frontend code (vanilla HTML/JS/Canvas)
---

# Frontend Development Rules

## General

Vanilla HTML, CSS, and JavaScript — **zero runtime dependencies**. Hosted as static files on **GitHub Pages**. No build step, no bundler, no framework. Games use the **Canvas API** for rendering/movement and **standard DOM manipulation** for UI. Open `index.html` in a browser to run; no server required (a gamepad must be connected for full functionality).

### Project Structure

```
/
  index.html                      # Homepage: visual cards linking to each game
  games/
    animal-spawner/
      index.html
      game.js
      style.css                   # optional, per-game
    color-match-feeder/
      ...
    simon-says/
      ...
    city-pop-dj/
      ...
    stargazer/
      ...
    bumper-lane-runner/
      ...
  shared/
    gamepad-manager.js            # Central GamepadManager (single source of gamepad input)
    button-mapping.js             # Button index → name constants/logic
    styles.css                    # Global styles, card grid, "Back to Home" button
    utils.js                      # Shared helpers (rand, clamp, collision, audio)
  assets/
    sounds/
    images/
  tests/
    harness.js                    # Tiny assert/describe/it/expect runner (no framework)
    index.html                    # Open in browser to run the suite → green/red report
    gamepad-manager.test.js
```

### Central Gamepad Manager

A single, reusable `GamepadManager` class in `shared/gamepad-manager.js`. All gamepad input flows through it.

- Polls `navigator.getGamepads()` inside a `requestAnimationFrame` loop.
- Tracks previous button/stick state to emit events only on transitions (press / release), not every frame.
- **Layout detection:** parses the gamepad `id` string to determine the connected controller layout — **Xbox**, **PlayStation**, or **Nintendo Switch** — and exposes it so UI can render matching labels/icons. Re-detects on connect.
- Dispatches **layout-agnostic positional `CustomEvent`s** on `window` (or a configurable target). Games listen for positional events and never reference layout-specific names ("A", "Cross") directly, so the same code runs on any controller. Games never touch `navigator.getGamepads()` directly — they only `addEventListener`.
- Canonical event names (match these exactly so games stay consistent):

| Input | Press event | Release event |
|-------|-------------|---------------|
| Face buttons (positional) | `gamepad-face-bottom` `gamepad-face-right` `gamepad-face-left` `gamepad-face-top` | `…-up` |
| D-Pad | `gamepad-dpad-up` `gamepad-dpad-down` `gamepad-dpad-left` `gamepad-dpad-right` | `…-up` |
| Bumpers (L1/R1) | `gamepad-bumper-left` `gamepad-bumper-right` | `…-up` |
| Triggers (analog) | `gamepad-trigger-left` `gamepad-trigger-right` (with `detail.value` 0.0–1.0) | — |
| Thumbsticks | `gamepad-stick-left` `gamepad-stick-right` (with `detail.x`, `detail.y`, -1.0–1.0) | — |
| Stick clicks (L3/R3) | `gamepad-stick-click-left` `gamepad-stick-click-right` | `…-up` |

- Positional → label mapping the UI renders per detected layout:

  - Xbox: Bottom=A, Right=B, Left=X, Top=Y
  - PlayStation: Bottom=Cross, Right=Circle, Left=Square, Top=Triangle
  - Switch: Bottom=B, Right=A, Left=Y, Top=X

- Include a **keyboard fallback** mapping (e.g., `KeyW`/`KeyA`/`KeyS`/`KeyD` → face Top/Left/Bottom/Right, Arrow keys → D-Pad) so games are testable without a physical gamepad. Never break gamepad input with it.
- Handle connect/disconnect (`gamepadconnected` / `gamepaddisconnected`) with a non-blocking UI hint — never a fail state.

### Per-Game Conventions

- One self-contained folder per game under `games/<kebab-name>/` with its own `index.html` and `game.js`.
- Each game page must include a visible **"Back to Home"** button linking to `/index.html`.
- Each game registers only the `gamepad-*` events it needs and runs its own render loop; remove listeners when leaving.
- UI-heavy games (Animal Spawner, City-Pop DJ) → DOM manipulation. Movement/rendering games (Color-Match Feeder, Stargazer, Bumper Lane Runner) → Canvas.

### Audio

Use the **Web Audio API** (`AudioContext`) for sound effects and tones — no audio files required for synthesized tones (Simon Says tones, spawn blips). Resume the `AudioContext` on first user gesture (browser autoplay policy).

### Canvas

- Size canvas via CSS and set backing resolution on `canvas.width`/`canvas.height` (account for `devicePixelRatio` for crisp rendering).
- Guard the render loop with `requestAnimationFrame`; cancel on page unload.
- Keep game state (positions, entities) separate from drawing — update state, then draw.

### No-Backend Constraint

There is no server, database, auth, or API. Everything runs client-side. Do not introduce fetch calls to a backend, environment variables, or secrets. Any persisted data (settings, progress) uses `localStorage`.

### Deployment

- Deploy on **GitHub Pages** (root or `/docs` folder, or GitHub Actions).
- No build command — publish the static files as-is.
- Use relative paths so the site works under the GitHub Pages subpath (`/<repo-name>/`).

### Performance & Audience

- 60fps target; avoid per-frame allocations in hot loops.
- Keep the experience **zero-stress**: no fail states, timers, health bars, or penalties (per PRD).
- Large tap targets and high contrast for a 7-year-old audience.
