# Implementation Plan — gamepad-academy (full site)

**Source:** `.docs/PRD.md`
**Type:** Feature (greenfield — whole site)
**Generated:** 2026-07-16
**Companion docs:** [gamepad-manager-design.md](./gamepad-manager-design.md) · [game-specs.md](./game-specs.md)

---

## Summary

Build a zero-dependency, static HTML/CSS/JS site hosted on GitHub Pages. It teaches a 7-year-old gamepad muscle memory through **11 zero-stress mini-games**. There is no backend, no framework, no build step. All input flows through one central `GamepadManager` that detects the controller layout (Xbox / PlayStation / Switch) and dispatches **layout-agnostic positional** events, so every game runs unchanged on any controller. On-screen prompts render the correct button label for the detected layout.

The site is a homepage with a grid of game cards. Clicking a card opens that game's page; each game page has a visible **"Back to Home"** button, dynamic instructions, and its own render loop. Game rules live in **pure functions** so they are unit-tested in a hand-rolled in-browser harness; Canvas/DOM/live-gamepad behavior is covered by manual playtesting.

## Goals & Non-Goals

**Goals**

- 11 playable mini-games, each isolating one gamepad skill (face buttons, D-pad, bumpers, analog triggers, sticks, stick-clicks, analog tilt, chording).
- One central, well-tested `GamepadManager` with reliable layout detection and a keyboard fallback.
- Child-friendly UX: large targets, high contrast, **no fail states, timers, health bars, or penalties**.
- Works on Chrome/Edge (primary), Firefox, and Safari, Xbox/PS/Switch controllers.

**Non-Goals**

- No npm, no bundler, no framework, no build step, no backend, no fetch to any API.
- No trademarked console button glyphs shipped (use neutral positional shapes + text labels — see [Glyph strategy](#glyph--icon-strategy)).
- No sampled audio files — all sound is synthesized via the Web Audio API.
- No persistence beyond optional `localStorage` settings.

## Architecture Overview

```
/
  index.html                      # Homepage: responsive grid of 11 game cards
  shared/
    gamepad-manager.js            # Singleton GamepadManager (poll + dispatch + layout)
    button-mapping.js             # PURE: layout detection, label tables, index/keyboard → event
    utils.js                      # PURE: math (rand, clamp, lerp, magnitude, collision) + audio helpers
    glyph.js                      # DOM helper: render the positional face-button diamond
    styles.css                    # Global: reset, card grid, Back-to-Home, banner, glyph, palette
  games/
    animal-spawner/        index.html  game.js  spawn-logic.js
    color-match-feeder/    index.html  game.js  feeder-logic.js
    simon-says/            index.html  game.js  sequence-logic.js
    city-pop-dj/           index.html  game.js  track-logic.js
    stargazer/             index.html  game.js  constellation-logic.js
    bumper-lane-runner/    index.html  game.js  lane-logic.js
    wildlife-photographer/ index.html  game.js  camera-logic.js
    claw-machine/          index.html  game.js  claw-logic.js
    hot-air-balloon/       index.html  game.js  balloon-physics.js
    submarine-sonar/       index.html  game.js  sonar-logic.js
    butterfly-catcher/     index.html  game.js  tilt-logic.js
  assets/
    images/  logo.svg (exists) + any per-game SVG/emoji assets
    sounds/  (intentionally empty — all audio synthesized)
  tests/
    harness.js              # describe / it / expect / assert + results renderer
    index.html              # loads harness + every *.test.js, renders green/red report
    button-mapping.test.js
    utils.test.js
    <game>-logic.test.js    # one per game's pure-logic module
  docs/
    implementation-plan.md  gamepad-manager-design.md  game-specs.md
```

**Why this shape:** `shared/` holds the engine and helpers every game imports; `games/<kebab-name>/` keeps each game self-contained (own HTML/JS/pure-logic); `tests/` mirrors logic modules. Pure logic is split out of `game.js` into `*-logic.js` so it is unit-testable without DOM/Canvas/gamepad.

## Shared Modules

Detailed behavior for input lives in [gamepad-manager-design.md](./gamepad-manager-design.md). Summary:

| File | Responsibility | Pure? |
|------|----------------|-------|
| `shared/button-mapping.js` | `detectLayout(id)`; label tables (face/bumper/trigger/stick per layout); `buttonIndexToEvent(i)`; `KEY_TO_EVENT` keyboard map; constants (`FACE_POSITIONS`, event names). | Yes — fully unit-tested |
| `shared/gamepad-manager.js` | `GamepadManager` singleton: rAF poll loop, prev-state diffing, positional `CustomEvent` dispatch, connect/disconnect, layout detection, keyboard fallback, audio-context resume. | No (engine) |
| `shared/utils.js` | `clamp`, `lerp`, `randomInt`, `randomFloat`, `pick`, `magnitude`, `distance`, `circleCollision`, `aabbCollision`; audio: `getAudioContext()`, `playTone()`, `playBlip()`. | Yes (math) — unit-tested |
| `shared/glyph.js` | `createFaceGlyph({ layout, position, active })` → positional diamond DOM node with correct text label. | No (DOM) |
| `shared/styles.css` | Reset, CSS custom-property palette, `.card-grid`, `.card`, `.back-home`, `.gamepad-banner`, `.face-glyph`, responsive layout. | — |

`shared/glyph.js` is the one addition beyond the four files named in the project rules. It earns its place because the positional glyph is rendered by ~8 of the 11 games and must stay consistent; isolating it prevents label drift.

## Homepage (`index.html`)

- Responsive `.card-grid` (CSS grid, auto-fit, large min cell ~220px) of 11 `.card` anchors.
- Each card: game emoji/SVG icon, title, one-line "teaches …" subtitle naming the input focus, links to `games/<name>/index.html`. Relative paths (GitHub Pages subpath-safe).
- Header with `assets/images/logo.svg` and a one-line tagline.
- A non-blocking `.gamepad-banner` that mirrors the `GamepadManager` connection state ("Connect a gamepad and press any button" → "Xbox controller connected").
- Imports `shared/gamepad-manager.js` only to drive the banner and resume audio; no game loop on the homepage.

## Per-Game Index

The table below is the master list. Full mechanics, pure-logic APIs, audio, and acceptance per game are in [game-specs.md](./game-specs.md).

| # | Game | Teaches (primary input) | Render | Page path | Difficulty |
|---|------|-------------------------|--------|-----------|------------|
| 1 | Animal Spawner | Face buttons + D-Pad | DOM | `games/animal-spawner/` | Easy |
| 2 | Bumper Lane Runner | Bumpers (L1/R1) | Canvas | `games/bumper-lane-runner/` | Easy |
| 3 | Simon Says | Face buttons + memory | DOM | `games/simon-says/` | Easy |
| 4 | Claw Machine | D-Pad grid nav | Canvas | `games/claw-machine/` | Easy |
| 5 | Color-Match Feeder | Face buttons + timing | Canvas | `games/color-match-feeder/` | Medium |
| 6 | Stargazer | Left stick + face buttons | Canvas | `games/stargazer/` | Medium |
| 7 | Butterfly Catcher | Analog stick tilt (magnitude) | Canvas | `games/butterfly-catcher/` | Medium |
| 8 | Hot Air Balloon | Analog trigger pressure | Canvas | `games/hot-air-balloon/` | Medium |
| 9 | Submarine Sonar | Stick-clicks (L3/R3) | Canvas | `games/submarine-sonar/` | Medium |
| 10 | Wildlife Photographer | Right stick + trigger | Canvas | `games/wildlife-photographer/` | Hard |
| 11 | City-Pop DJ | Holding & chording (audio) | DOM | `games/city-pop-dj/` | Hard |

## Build Phases (recommended order)

Order is chosen so each game newly exercises a `GamepadManager` event type, validating the engine progressively. Each phase is independently shippable.

**Phase 0 — Foundation (blocks everything).**

1. `shared/button-mapping.js` + `tests/button-mapping.test.js` (layout detection, label tables, index→event, keyboard map).
2. `shared/utils.js` + `tests/utils.test.js` (math + audio helpers).
3. `shared/gamepad-manager.js` (poll loop, dispatch, layout, keyboard, connect/disconnect, banner events).
4. `tests/harness.js` + `tests/index.html`.
5. `shared/glyph.js` + `shared/styles.css` (palette, banner, glyph, card grid).

**Phase 1 — Homepage + 2 validator games.**

6. `index.html` (card grid + banner).
7. Animal Spawner (face + D-pad, DOM) — proves face/D-pad events end-to-end.
8. Simon Says (face + tones, DOM) — proves Web Audio + sequence logic.

**Phase 2 — Remaining easy/medium games** (any order).

9. Bumper Lane Runner · 10. Claw Machine · 11. Color-Match Feeder · 12. Stargazer · 13. Butterfly Catcher · 14. Hot Air Balloon · 15. Submarine Sonar.

**Phase 3 — Hard games.**

16. Wildlife Photographer (right-stick panning + reticle + scrapbook).
17. City-Pop DJ (multi-track Web Audio scheduling + held-button gating) — most complex; build last.

**Phase 4 — Polish & ship.**

18. Manual playtest pass per game (gamepad + keyboard; Xbox/PS/Switch if hardware available).
19. Responsive + a11y pass (focus-visible, contrast, reduced-motion where relevant).
20. GitHub Pages deploy verification (relative paths under `/<repo>/`).

## Global Conventions

- **Paths:** relative everywhere (homepage `games/...`, games `../../shared/...`). Never assume site root.
- **Modules:** `<script type="module">`; named exports; at most one default. No bare top-level side effects.
- **Naming:** kebab-case files; `camelCase` vars/fns; `PascalCase` classes; `SCREAMING_SNAKE_CASE` constants.
- **Gamepad:** games NEVER call `navigator.getGamepads()` — they only `addEventListener` for `gamepad-*` events on the `GamepadManager` target. Never hardcode layout labels ("A"/"Cross") in game logic — render labels via `button-mapping` + `glyph.js`.
- **Game loop:** `requestAnimationFrame`; store id; `cancelAnimationFrame` on teardown; separate update from draw; no per-frame allocations.
- **Canvas:** size via CSS, set `width`/`height` to CSS size × `devicePixelRatio`; handle resize; guard zero-size.
- **Audio:** lazy singleton `AudioContext`; resume on first user gesture (keydown/pointerdown/gamepad press); fail soft in `try/catch`.
- **Memory:** `GamepadManager` is a singleton that auto-stops its rAF loop; each game cancels its own loop and removes its listeners on `pagehide`/`beforeunload`.
- **Zero-stress:** no timers counting down, no health, no "game over", no penalties. Missed inputs are harmless.

## Testing Strategy

- **Harness:** `tests/harness.js` (`describe`/`it`/`expect`/`assert` + a results array + renderer). `tests/index.html` imports the harness and each `*.test.js` explicitly (static HTML can't glob directories on `file://`). Open in a browser for a green/red report.
- **Unit tests (target >80%):** `button-mapping` (layout detection across Chrome/Firefox `id` strings, label tables, index→event, keyboard map), `utils` (math, collision), and each game's `*-logic.js` (table-driven).
- **Manual playtesting:** each game with both gamepad and keyboard; exercise the "Back to Home" flow; confirm layout-correct prompts; confirm no fail states. GamepadManager event mapping and live gamepad are NOT unit-tested (per project rules).
- **Coverage rule:** keep every game rule (mapping, sequencing, lane math, trigger/stick math, collision, scoring) in pure functions; DOM/Canvas/gamepad code only calls them.

## Cross-Cutting Concerns

- **Glyph & icon strategy:** render a **neutral positional diamond** (four pads: bottom/right/left/top) with the active pad highlighted and the **detected-layout letter** as text inside it (Xbox A/B/X/Y, PS Cross/Circle/Square/Triangle, Switch B/A/Y/X). Do NOT ship trademarked console button glyphs. Unknown controllers show the diamond + positional word ("Bottom"). See [gamepad-manager-design.md → Glyph strategy](./gamepad-manager-design.md#glyph--icon-strategy).
- **Audio engine:** `getAudioContext()` singleton in `utils.js`; `playTone({freq, duration, type, gain})` and `playBlip()` for one-shots. City-Pop DJ uses a local lookahead scheduler for looping tracks (detailed in its spec).
- **Keyboard parity:** every game playable via `KEY_TO_EVENT` (WASD → face top/left/bottom/right, Arrows → D-Pad, `KeyQ`/`KeyE` → bumpers, `KeyR`/`KeyF` or `Shift`/`Space` → triggers, stick clicks → `KeyC`/`KeyV`). Sticks have keyboard equivalents (Arrows/`IJKL`) for testability.
- **Connection hint:** a non-blocking banner driven by `gamepad-availability` / `gamepad-layout-change` events. Absence of a gamepad is a waiting state, never an error.

## Acceptance Criteria (overall)

- [ ] Homepage shows a responsive grid of all 11 games; each card navigates to its game page.
- [ ] Every game page has a visible "Back to Home" button and dynamic, layout-correct button prompts.
- [ ] Connecting Xbox/PS/Switch controllers each render the correct labels (manual test on real hardware or emulator).
- [ ] Every game is playable with both a gamepad and the keyboard, with zero fail states.
- [ ] `shared/gamepad-manager.js` is the only place `navigator.getGamepads()` is called.
- [ ] `tests/index.html` opens green with >80% coverage on pure logic and `button-mapping`.
- [ ] Site loads from `file://` and under a GitHub Pages subpath (`/<repo>/`) with no console errors.
- [ ] No runtime dependencies, no build step, no `node_modules`, no backend calls.

## Risks & Edge Cases

- **Canonical event names are load-bearing.** A rename in `button-mapping.js`/`gamepad-manager.js` breaks every game. Pin the names in the event table and never change them after Phase 0.
- **Layout detection misses.** Firefox's bare `xinput`, Chrome's generic "Wireless Controller", and older Switch Pro non-standard mappings. Detection falls back to Xbox layout (matches the standard mapping's positional definition); unknown controllers still work via positional events with neutral glyphs. Document in the banner ("Controller not recognized — using default layout").
- **Gesture gate.** `getGamepads()` is empty until the user presses a button (spec-mandated). The banner must guide the child; absence is not an error.
- **Audio autoplay policy.** `AudioContext` starts suspended; must resume on first gesture. City-Pop DJ scheduling must account for this.
- **Memory leaks across navigation.** Each game cancels its rAF and removes listeners on unload; the `GamepadManager` singleton stops cleanly.
- **Canvas crispness.** `devicePixelRatio` sizing and resize handling per game; guard zero-size before drawing.
- **Keyboard must never break gamepad input.** Keyboard dispatches are additive; gamepad polling is untouched.

## Open Questions

- Brand/visual direction for the homepage and card icons (emoji vs custom SVG)? Logo exists at `assets/images/`.
- Should game selection progress be remembered (`localStorage` "played" badges), or keep the homepage stateless? PRD implies stateless; recommend stateless for v1.
- For City-Pop DJ, define the original (non-copyrighted) musical loops' tempo/feel, or accept any pleasant synthesized pattern? Recommend synthesized, ~100 BPM city-pop feel, original notes only.

## Out of Scope

- Mobile touch controls (gamepad/keyboard only for v1).
- Multiplayer / second controller.
- Internationalization beyond English labels.
- Persistent profiles, scoring history, or achievements beyond the in-session UI.
- Shipping audio sample files or trademarked button artwork.
