# Implementation Plan → Tasks — gamepad-academy

**Source plan:** `implementation-plan.md`
**Companion:** `gamepad-manager-design.md` · `game-specs.md`
**Generated:** 2026-07-16
**Repo state at generation:** 100% greenfield for code. Only `LICENSE`, `README.md`, `logo.svg`/`logo.png`/`logo.jpg` (at repo root, **not** `assets/images/`), `.docs/`, `.claude/`. No `.gitignore`, no `.github/`, no harness, no shared modules, no games.

---

## Parallelization Strategy

Tasks grouped into **dependency-ordered batches**. All tasks in a batch touch **disjoint files** unless noted, so they can run in parallel via git worktrees. Within a batch, tasks flagged `⚠ shared: tests/index.html` both create a `*.test.js` **and** append one import line to `tests/index.html` — those appends must be **serialized** (run them one at a time; the orchestrator does this automatically because the file overlaps).

### Batch diagram

```
Batch 0          Batch 1        Batch 2        Batch 3            Batch 4            Batch 5      Batch 6
[no deps]        [needs T2]     [needs T3/T5]  [needs T6/T7/T1]   [needs T6/T7/T5]   [needs B4]   [needs B5]
 T1 scaffolding ─┐
 T2 harness ─────┼─► T3 button-map ──► T6 glyph ──┐
 T5 styles ──────┤   T4 utils        T7 manager ──┤─► T8 homepage ──┐
                 │                                  ├─► T9 animal ───┤─► T11..T17 ─► T18,T19 ─► T20 ─► T21
                 └──────────────────────────────────┘   T10 simon ──┘   (7 games)   (2 hard)   (a11y) (CI)
```

### Merge order rules

1. Batch N fully lands before Batch N+1 starts (hard dependencies on shared modules).
2. Within a batch, game tasks (distinct `games/<name>/` dirs) merge freely.
3. Test-registration edits to `tests/index.html` are serialized within their batch.
4. Batch 6 is sequential: T20 → T21.

### Summary table

| # | Batch | Target files (primary) | Depends on | Can parallel with |
|---|-------|------------------------|-----------|-------------------|
| T1 | 0 | `.gitignore`, `assets/images/*`, `assets/sounds/.gitkeep` | None | T2, T5 |
| T2 | 0 | `tests/harness.js`, `tests/index.html` | None | T1, T5 |
| T3 | 1 | `shared/button-mapping.js`, `tests/button-mapping.test.js`, `tests/index.html` | T2 | T4 |
| T4 | 1 | `shared/utils.js`, `tests/utils.test.js`, `tests/index.html` | T2 | T3 |
| T5 | 0 | `shared/styles.css` | None | T1, T2 |
| T6 | 2 | `shared/glyph.js` | T3, T5 | T7 |
| T7 | 2 | `shared/gamepad-manager.js` | T3 | T6 |
| T8 | 3 | `index.html` (root homepage) | T1, T5, T7 | T9, T10 |
| T9 | 3 | `games/animal-spawner/{index.html,game.js,spawn-logic.js}`, `tests/spawn-logic.test.js`, `tests/index.html` | T2, T5, T6, T7 | T8, T10 |
| T10 | 3 | `games/simon-says/{index.html,game.js,sequence-logic.js}`, `tests/sequence-logic.test.js`, `tests/index.html` | T2, T5, T6, T7 | T8, T9 |
| T11 | 4 | `games/bumper-lane-runner/*`, `tests/lane-logic.test.js`, `tests/index.html` | T5, T6, T7 | T12–T17 |
| T12 | 4 | `games/claw-machine/*`, `tests/claw-logic.test.js`, `tests/index.html` | T5, T6, T7 | T11,T13–T17 |
| T13 | 4 | `games/color-match-feeder/*`, `tests/feeder-logic.test.js`, `tests/index.html` | T5, T6, T7 | (others) |
| T14 | 4 | `games/stargazer/*`, `tests/constellation-logic.test.js`, `tests/index.html` | T5, T6, T7 | (others) |
| T15 | 4 | `games/butterfly-catcher/*`, `tests/tilt-logic.test.js`, `tests/index.html` | T5, T6, T7 | (others) |
| T16 | 4 | `games/hot-air-balloon/*`, `tests/balloon-physics.test.js`, `tests/index.html` | T5, T6, T7 | (others) |
| T17 | 4 | `games/submarine-sonar/*`, `tests/sonar-logic.test.js`, `tests/index.html` | T5, T6, T7 | (others) |
| T18 | 5 | `games/wildlife-photographer/*`, `tests/camera-logic.test.js`, `tests/index.html` | T5, T6, T7 | T19 |
| T19 | 5 | `games/city-pop-dj/*`, `tests/track-logic.test.js`, `tests/index.html` | T5, T6, T7 | T18 |
| T20 | 6 | a11y/responsive edits across all game pages + `shared/styles.css` | T8–T19 | — |
| T21 | 6 | `.github/workflows/deploy.yml`, `README.md`, `tests/index.html` (verify) | T20 | — |

### Developer assignment tracks (3 devs)

- **Track A (engine):** T1 → T2 → T3 → T7 → T8 → T19 → T21
- **Track B (DOM games + glyph):** T5 → T6 → T10 → T9 → T12 → T20
- **Track C (Canvas games):** T4 → T11 → T13 → T14 → T15 → T16 → T17 → T18

---

## Load-bearing reference (do not deviate)

These names are canonical and referenced by every downstream task. Pin them exactly.

**Canonical event names** (dispatched on `window`, `CustomEvent`):
- Face: `gamepad-face-bottom` `gamepad-face-right` `gamepad-face-left` `gamepad-face-top` (+ `-up` release)
- D-Pad: `gamepad-dpad-up` `gamepad-dpad-down` `gamepad-dpad-left` `gamepad-dpad-right` (+ `-up`)
- Bumpers: `gamepad-bumper-left` `gamepad-bumper-right` (+ `-up`)
- Triggers (analog, every frame, `detail.value` 0–1): `gamepad-trigger-left` `gamepad-trigger-right`
- Sticks (analog, every frame, `detail.{x,y}` −1..1): `gamepad-stick-left` `gamepad-stick-right`
- Stick clicks: `gamepad-stick-click-left` `gamepad-stick-click-right` (+ `-up`)
- Manager: `gamepad-layout-change` (`detail.{layout,id,mapping}`), `gamepad-availability` (`detail.{connected,id,layout}`)

**Face label table** (`faceLabel(layout, position)`):

| position | xbox | playstation | switch |
|---|---|---|---|
| bottom | A | Cross | B |
| right | B | Circle | A |
| left | X | Square | Y |
| top | Y | Triangle | X |

**Thresholds:** `STICK_DEADZONE = 0.2` (radial), `TRIGGER_DEADZONE = 0.05`. Trigger axis 0..1; stick axis −1..1 (up = −y, left = −x).

---

# Tasks

## Batch 0

### T1 — Repo scaffolding & asset layout
**Description:** Set up housekeeping files and move the three logo variants from repo root into `assets/images/` (the plan references `assets/images/logo.svg`). Create `.gitignore` with the entries required by `.claude/rules/git-guidelines.md`. Create the `assets/sounds/` directory (kept empty per PRD — all audio synthesized) with a `.gitkeep`.
**Files:** `.gitignore` (create), `assets/images/logo.svg` + `logo.png` + `logo.jpg` (move from root via `git mv`), `assets/sounds/.gitkeep` (create).
**Acceptance:**
- [ ] `git mv logo.svg logo.png logo.jpg assets/images/` (root no longer has logos)
- [ ] `.gitignore` contains exactly: `node_modules/`, `.env`, `dist/`, `build/`, `*.log`, `.DS_Store`, `Thumbs.db`
- [ ] `assets/images/logo.svg` opens (valid SVG, ~661×660 viewBox, gamepad art)
- [ ] `assets/sounds/.gitkeep` exists; dir tracked
**Dependencies:** None

### T2 — In-browser test harness
**Description:** Build the zero-dependency test runner per `.claude/rules/js-testing-rules.md`. `tests/harness.js` exports `describe`, `it`, `expect`, `assert`/`assertEqual`, accumulates `{name,pass,error}` into a `results` array, and exposes `window.__runTests` to render a green/red summary (counts + per-test line). `tests/index.html` loads `harness.js` then each `*.test.js` explicitly (static HTML cannot glob on `file://`) then calls `window.__runTests()`. Leave a clearly-marked append point (HTML comment `<!-- append test scripts here -->`) so test-bearing tasks add one `<script type="module" src="./NAME.test.js"></script>` line each. Page must render an empty green report with zero tests initially.
**Files:** `tests/harness.js`, `tests/index.html`.
**Acceptance:**
- [ ] `harness.js` exports `describe`/`it`/`expect`/`assert`; throws on failure with `expected X got Y` message
- [ ] `expect(x).toBe/toEqual/toBeTruthy/toBeLessThan` all implemented
- [ ] `tests/index.html` shows green "0 passed, 0 failed" when opened (serve over `python -m http.server` if `file://` CORS-blocks module imports)
- [ ] No npm, no runner install; plain ES modules
**Dependencies:** None

### T5 — Global stylesheet
**Description:** `shared/styles.css` with CSS reset, a CSS-custom-property palette (child-friendly high-contrast), and component classes used site-wide: `.card-grid` (CSS grid, `repeat(auto-fit, minmax(220px, 1fr))`, gap), `.card` (anchor, large tap target, hover), `.back-home` (visible "Back to Home" button), `.gamepad-banner` (non-blocking connection hint), `.face-glyph` + `.face-glyph__pad` (positional diamond: four pads bottom/right/left/top; active pad filled). Include `prefers-reduced-motion` guard and `:focus-visible` outline. Target ~220px+ controls for a 7-year-old.
**Files:** `shared/styles.css`.
**Acceptance:**
- [ ] All classes above defined and responsive
- [ ] Palette as custom props (e.g. `--c-bg`, `--c-primary`); high contrast
- [ ] `.back-home` is large, high-contrast, always visible
- [ ] `:focus-visible` outline + reduced-motion handling present
**Dependencies:** None

---

## Batch 1

### T3 — Button mapping module + tests  ⚠ shared: tests/index.html
**Description:** `shared/button-mapping.js` — pure module, fully unit-tested. Implement exactly:
- `detectLayout(rawId)` → `'xbox'|'playstation'|'switch'`. Parse vendor/product via regex; VID `045e`→xbox, `054c`→playstation, `057e`→switch; name-substring fallbacks (`xbox`,`playstation|dualshock|dualsense`,`switch|pro controller|joycon`); default `'xbox'`.
- `faceLabel(layout, position)` → label per table above.
- `shoulderLabel(layout, side)` / trigger / stick-click label helpers (LB/RB/L1/R1/LT/RT/L2/R2/L3/R3 / Switch L/R/ZL/ZR/L-stick/R-stick).
- `buttonIndexToEvent(i)` → canonical event name for indices 0–15: 0 face-bottom,1 face-right,2 face-left,3 face-top,4 bumper-left,5 bumper-right,6 trigger-left,7 trigger-right,8/9 (back/select,start — not surfaced, return `null`),10 stick-click-left,11 stick-click-right,12 dpad-up,13 dpad-down,14 dpad-left,15 dpad-right,16 home(guide,`null`).
- `axisToStickEvent(axisIndex)` → `'gamepad-stick-left'|'gamepad-stick-right'` (axes 0/1 left, 2/3 right).
- `KEY_TO_EVENT` object: KeyW→face-top, KeyA→face-left, KeyS→face-bottom, KeyD→face-right; ArrowUp/Down/Left/Right→dpad-*; KeyQ→bumper-left, KeyE→bumper-right; ShiftLeft→trigger-left(value 1), Space→trigger-right(value 1); KeyC→stick-click-left, KeyV→stick-click-right; Arrows ALSO emit stick-left vector, IJKL→stick-right vector.
- Constants: `FACE_POSITIONS = ['bottom','right','left','top']`, all event-name string constants.
Tests: `tests/button-mapping.test.js` — table-driven across Chrome/Firefox `id` strings (Xbox Wireless, DualSense `045e`/`054c`/`057e` VID lines, generic "Wireless Controller", bare `xinput`), label table for all 3 layouts × 4 positions, index→event for 0–16, keyboard map.
**Files:** `shared/button-mapping.js`, `tests/button-mapping.test.js`, `tests/index.html` (append one script import).
**Acceptance:**
- [ ] `detectLayout` correct for ≥6 real-world `id` strings incl. Firefox bare `xinput` and Chrome generic → default xbox
- [ ] `faceLabel` matches table for all layouts
- [ ] `buttonIndexToEvent` correct 0–16; 8/9/16 → null
- [ ] `KEY_TO_EVENT` complete and additive-only (no mutation of gamepad state)
- [ ] Tests green in `tests/index.html`
**Dependencies:** T2

### T4 — Utils module (math + audio) + tests  ⚠ shared: tests/index.html
**Description:** `shared/utils.js` — pure math + audio helpers. Math (pure, tested): `clamp(v,min,max)`, `lerp(a,b,t)`, `randomInt(min,max)`, `randomFloat(min,max)`, `pick(arr)`, `magnitude(x,y)` (= `Math.hypot`, clamped ≤1), `distance(ax,ay,bx,by)`, `circleCollision(a,b)` (radius-based), `aabbCollision(a,b)` (axis-aligned boxes). Audio (not unit-tested, lazy): `getAudioContext()` singleton (create on first call, suspended), `resumeAudio()` (call on first gesture), `playTone({freq,duration,type,gain})`, `playBlip()` short one-shot. All audio wrapped in `try/catch`, fail soft. No per-call allocations in hot loops where avoidable.
**Files:** `shared/utils.js`, `tests/utils.test.js` (math only — clamp/lerp/randomInt bounds/distance/circleCollision/aabbCollision/pick), `tests/index.html` (append import).
**Acceptance:**
- [ ] All math fns correct incl. edge cases (clamp at bounds, randomInt inclusive, collision touching-boundary)
- [ ] `getAudioContext` returns same instance on repeat calls
- [ ] `playTone`/`playBlip` never throw when `AudioContext` absent (try/catch)
- [ ] Tests green
**Dependencies:** T2

---

## Batch 2

### T6 — Face glyph DOM helper
**Description:** `shared/glyph.js` exports `createFaceGlyph({ layout, position, active })` → returns a DOM node: the positional diamond (`.face-glyph` with 4 `.face-glyph__pad` children bottom/right/left/top). The pad matching `position` gets an `is-active` class; the active pad's text is `faceLabel(layout, position)` (import from button-mapping). Unknown/missing layout → show positional word ("Bottom"/"Right"/"Left"/"Top"), no console glyph. Also export `setGlyphActive(node, position)` to re-highlight without rebuild (Simon Says, Stargazer re-use). Import `faceLabel` from `./button-mapping.js`.
**Files:** `shared/glyph.js`.
**Acceptance:**
- [ ] `createFaceGlyph({layout:'xbox',position:'bottom',active:true})` returns node whose active pad shows "A"
- [ ] playstation bottom → "Cross", switch bottom → "B"
- [ ] Unknown layout → positional word, no crash
- [ ] Uses `.face-glyph`/`.face-glyph__pad` classes from T5
**Dependencies:** T3, T5

### T7 — Central GamepadManager
**Description:** `shared/gamepad-manager.js` — the single engine. `class GamepadManager` with `constructor({ target=window, deadzone=0.2, triggerDeadzone=0.05 })`; singleton `export const gamepadManager = new GamepadManager()`. Auto-starts a `requestAnimationFrame` poll loop calling `navigator.getGamepads()` each frame (this is the ONLY file allowed to call it — per project rules). Re-fetch gamepad by index each frame (never cache the `Gamepad` object). Diff against `this.prev` snapshot to emit rising edges (press) and falling edges (release, `-up` suffix). Apply radial stick deadzone; apply trigger deadzone. `_emit(name, detail)` dispatches `new CustomEvent(name,{detail})` on `this.target`. Handle `gamepadconnected`/`gamepaddisconnected`: on connect run `detectLayout`, set layout, emit `gamepad-layout-change` + `gamepad-availability`; on disconnect emit `gamepad-availability` and clear active state. Public API: `getLayout()`, `isActive()`, `start()`, `stop()` (`cancelAnimationFrame`), `destroy()` (stop + remove listeners). Keyboard fallback: listen `keydown`/`keyup`, map via `KEY_TO_EVENT`, dispatch additively (never interfere with gamepad polling). Resume audio on first gesture. Layout change re-detects on connect.
**Files:** `shared/gamepad-manager.js`.
**Acceptance:**
- [ ] Only file calling `navigator.getGamepads()`
- [ ] Press/release events fire on transitions only (not every frame) — verifiable by manual playtest
- [ ] Analog trigger/stick events fire every frame with correct `detail`
- [ ] `stop()` cancels rAF; `destroy()` removes window listeners
- [ ] Keyboard input works alongside gamepad (additive)
- [ ] No bare top-level side effects beyond constructing the singleton
**Dependencies:** T3

---

## Batch 3

### T8 — Homepage
**Description:** Root `index.html`: header with `<img src="assets/images/logo.svg">` + tagline, a `.gamepad-banner` (mirrors `gamepad-availability`/`gamepad-layout-change`: "Connect a gamepad and press any button" → "Xbox controller connected"), and a `.card-grid` of 11 `.card` anchors. Each card: emoji/SVG icon, title, one-line "Teaches: …" subtitle, links to `games/<name>/index.html` (relative paths). Card list + teaches text from the master table in `implementation-plan.md` §"Per-Game Index". Import `shared/gamepad-manager.js` (to drive banner + resume audio); no game loop here.
**Files:** `index.html`.
**Acceptance:**
- [ ] 11 cards, all link to correct relative game paths
- [ ] Banner updates on connect/disconnect (manual playtest)
- [ ] Logo renders from `assets/images/logo.svg`
- [ ] No console errors under `/<repo>/` subpath (relative paths)
**Dependencies:** T1, T5, T7

### T9 — Animal Spawner  ⚠ shared: tests/index.html
**Description:** DOM game. `games/animal-spawner/spawn-logic.js` (pure): `animalForPosition(position)` → `{emoji,label,position}` (bottom→Cat🐱, right→Dog🐶, left→Bird🐦, top→Frog🐸); `nextBackgroundColor(direction, palette, currentIndex)` → next palette index cycling by dpad direction. `game.js`: listen `gamepad-face-bottom/right/left/top` → spawn the animal emoji into a play area (DOM append, gentle pop animation, `playBlip()`); listen `gamepad-dpad-*` → change background color via palette. `index.html`: Back-to-Home button, dynamic prompt glyphs via `createFaceGlyph` using `gamepadManager.getLayout()`. Cancel listeners + no loop needed (event-driven), but add `pagehide` cleanup.
**Files:** `games/animal-spawner/index.html`, `games/animal-spawner/game.js`, `games/animal-spawner/spawn-logic.js`, `tests/spawn-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Each face button spawns correct animal; D-Pad cycles background
- [ ] Prompts show layout-correct labels (manual: xbox/ps/switch)
- [ ] `animalForPosition`/`nextBackgroundColor` pure + tested green
- [ ] Back-to-Home visible; listeners removed on unload
**Dependencies:** T2, T5, T6, T7

### T10 — Simon Says / Copycat  ⚠ shared: tests/index.html
**Description:** DOM game. `games/simon-says/sequence-logic.js` (pure): `extendSequence(seq)` (append random position), `expectedAt(seq,step)`, `isCorrect(seq,step,position)`, `toneForPosition(position)` (distinct frequency per position, e.g. C/E/G/C-octave). `game.js`: render 4 face-button pads via glyphs matching layout; highlight a pad + `playTone`; build sequence Bottom→Left→Right growing; player presses matching physical button; wrong press = no penalty, just wait for correct. No fail state. `index.html`: Back-to-Home, prompt glyphs.
**Files:** `games/simon-says/index.html`, `games/simon-says/game.js`, `games/simon-says/sequence-logic.js`, `tests/sequence-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Pads render matching detected layout; tones play on Web Audio (resume on gesture)
- [ ] Sequence grows; wrong press harmless
- [ ] Pure fns tested green (`extendSequence` length+1, `isCorrect`, `toneForPosition` distinct)
- [ ] Back-to-Home visible
**Dependencies:** T2, T5, T6, T7

---

## Batch 4

### T11 — Bumper Lane Runner  ⚠ shared: tests/index.html
**Description:** Canvas game. `games/bumper-lane-runner/lane-logic.js` (pure): `nextLane(current,direction,laneCount=3)` (clamped), `resolveObstacleHit(lane,obstacle,laneCount)` (bounce back one lane, clamp), `tryCollectCoin(player,coin)`. `game.js`: character auto-moves forward; `gamepad-bumper-left/right` → `nextLane`; obstacles bounce (no stop); collect coins. `requestAnimationFrame` loop with update/draw split, `devicePixelRatio` canvas sizing, resize handling, `cancelAnimationFrame` on unload.
**Files:** `games/bumper-lane-runner/{index.html,game.js,lane-logic.js}`, `tests/lane-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Bumpers move lanes; obstacle hit bounces (never stops game)
- [ ] Coins collectible; no fail state
- [ ] `nextLane`/`resolveObstacleHit`/`tryCollectCoin` tested green
- [ ] Canvas crisp (DPR), loop cancels on unload
**Dependencies:** T5, T6, T7

### T12 — Claw Machine  ⚠ shared: tests/index.html
**Description:** Canvas game. `games/claw-machine/claw-logic.js` (pure): `moveClaw(pos,direction,gridBounds)` (step one cell, clamp), `grabAt(pos,prizes)` (prize under claw or null), `resetClaw(gridBounds)` (top-center). `game.js`: **D-Pad ONLY** moves claw rigidly one square; thumbsticks deliberately disabled (do not register stick events). `gamepad-face-bottom` drops claw to grab. No penalty. Canvas DPR sizing.
**Files:** `games/claw-machine/{index.html,game.js,claw-logic.js}`, `tests/claw-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] D-Pad steps claw one cell; sticks do nothing (correct — teaches discrete nav)
- [ ] Face-bottom drops claw, grabs prize if over one
- [ ] Pure fns tested green
**Dependencies:** T5, T6, T7

### T13 — Color-Match Feeder  ⚠ shared: tests/index.html
**Description:** Canvas game. `games/color-match-feeder/feeder-logic.js` (pure): `createFood()` → `{position,x,y,speed,eaten:false}`, `isInEatZone(food,monster,radius)`, `positionMatchesPrompt(position,prompt)`, `updateFood(food,dt)`. `game.js`: food drifts toward center monster; each food shows a face-button prompt rendered via glyph (layout-correct); matching physical button while in eat zone → eat animation; miss → drifts away harmlessly. No penalty.
**Files:** `games/color-match-feeder/{index.html,game.js,feeder-logic.js}`, `tests/feeder-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Food prompts show layout-correct glyphs
- [ ] Correct button in zone = eat; wrong/missed = harmless drift
- [ ] Pure fns tested green
**Dependencies:** T5, T6, T7

### T14 — Stargazer  ⚠ shared: tests/index.html
**Description:** Canvas game. `games/stargazer/constellation-logic.js` (pure): `findHoveredDot(cursor,dots,radius)`, `promptForDot(dot)` (face position required), `connectDots(ignited)` (edges in ignition order). `game.js`: `gamepad-stick-left` moves glowing cursor; hovering a faded dot shows glyph prompt; correct face button ignites bright star; connecting forms constellation lines.
**Files:** `games/stargazer/{index.html,game.js,constellation-logic.js}`, `tests/constellation-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Left stick moves cursor; hover reveals prompt; correct button ignites star
- [ ] Constellation lines draw between ignited stars in order
- [ ] Pure fns tested green
**Dependencies:** T5, T6, T7

### T15 — Butterfly Catcher  ⚠ shared: tests/index.html
**Description:** Canvas game. `games/butterfly-catcher/tilt-logic.js` (pure): `stickMagnitude(x,y)` (`Math.hypot`, clamp ≤1), `movementMode(magnitude)` → `'tiptoe'`(<0.4)/`'walk'`(0.4–0.7)/`'run'` (>0.7), `butterflyFlees(butterfly,player,mode)` (flees if run+close), `tryCatch(butterfly,player,mode)` (catch only if tiptoe+close). `game.js`: `gamepad-stick-left` `detail.{x,y}` → magnitude → mode; run scares butterflies (respawn); tiptoe catches. No penalty.
**Files:** `games/butterfly-catcher/{index.html,game.js,tilt-logic.js}`, `tests/tilt-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Full tilt runs (dust/speed lines) + scares butterflies; gentle tilt tiptoes + catches
- [ ] `stickMagnitude`/`movementMode`/`butterflyFlees`/`tryCatch` tested green incl. 0.4/0.7 boundaries
**Dependencies:** T5, T6, T7

### T16 — Hot Air Balloon  ⚠ shared: tests/index.html
**Description:** Canvas game. `games/hot-air-balloon/balloon-physics.js` (pure): `verticalVelocity(value,{gravity,maxThrust,vy,dt})` (thrust = `value*maxThrust`; `vy += (gravity − thrust)*dt`), `collectStar(balloon,star)`, `cloudBounce(balloon,cloud)` (gentle nudge). `game.js`: `gamepad-trigger-right` `detail.value` 0–1 controls burner; full = rise fast, partial = hover/gentle rise, release = slow descend; collect stars, avoid clouds (bounce). No penalty.
**Files:** `games/hot-air-balloon/{index.html,game.js,balloon-physics.js}`, `tests/balloon-physics.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Trigger pressure modulates flame size + vertical speed (manual: feel analog)
- [ ] Stars collect; clouds nudge
- [ ] `verticalVelocity` tested green (thrust scales with value, gravity when 0)
**Dependencies:** T5, T6, T7

### T17 — Submarine Sonar  ⚠ shared: tests/index.html
**Description:** Canvas game. `games/submarine-sonar/sonar-logic.js` (pure): `pingRadius(elapsed,maxRadius,duration)` (easeOut expanding ring), `revealedByPing(entity,subPos,radius)`, `nextHeadlightColor(current,palette)`. `game.js`: dark scene; `gamepad-stick-left` moves sub; `gamepad-stick-click-left` (L3) sends sonar ping illuminating hidden fish/treasure briefly; `gamepad-stick-click-right` (R3) cycles headlight color. No penalty.
**Files:** `games/submarine-sonar/{index.html,game.js,sonar-logic.js}`, `tests/sonar-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] L3 pings sonar (reveals hidden entities); R3 cycles headlight color
- [ ] Stick click does NOT flick movement (click isolated from tilt)
- [ ] Pure fns tested green
**Dependencies:** T5, T6, T7

---

## Batch 5

### T18 — Wildlife Photographer  ⚠ shared: tests/index.html
**Description:** Canvas game (hard). `games/wildlife-photographer/camera-logic.js` (pure): `panCamera(stick,offset,bounds)` (new `{x,y}` clamped to panorama bounds), `isInReticle(animal,offset,reticle,viewport)`, `addPhoto(scrapbook,animal)`. `game.js`: scrolling-wide-canvas (or CSS 3D) panorama; `gamepad-stick-right` pans camera; center reticle over a static animal → glows; `gamepad-trigger-right` (>threshold) OR `gamepad-bumper-right` snaps photo → adds to visible scrapbook. No penalty.
**Files:** `games/wildlife-photographer/{index.html,game.js,camera-logic.js}`, `tests/camera-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Right stick pans; reticle-over-animal glows; trigger/bumper snaps → scrapbook grows
- [ ] `panCamera` clamps to bounds; `isInReticle`/`addPhoto` tested green
**Dependencies:** T5, T6, T7

### T19 — City-Pop DJ  ⚠ shared: tests/index.html
**Description:** DOM game (hard, build last). `games/city-pop-dj/track-logic.js` (pure): `trackForPosition(position)` → `'bass'|'drums'|'melody'|'vocals'`, `activeTracks(heldPositions)` → active track set, `mixGain(track,active)` → 1/0. `game.js`: virtual mixing desk; hold face button → that track plays (Web Audio), release → mute. Build a local **lookahead scheduler** for looping synthesized tracks (~100 BPM city-pop feel, original notes only — no samples, no copyrighted material). Face press = hold, `…-up` = release. Chord multiple to hear full song. `AudioContext` resume on first gesture; scheduling tolerates suspended state. No penalty.
**Files:** `games/city-pop-dj/{index.html,game.js,track-logic.js}`, `tests/track-logic.test.js`, `tests/index.html`.
**Acceptance:**
- [ ] Hold button = track audible; release = mute; multiple held = full mix
- [ ] Lookahead scheduler loops cleanly, survives suspended→resumed audio context
- [ ] `trackForPosition`/`activeTracks`/`mixGain` tested green
- [ ] No audio sample files; original synthesized notes only
**Dependencies:** T5, T6, T7

---

## Batch 6

### T20 — Accessibility & responsive pass
**Description:** Cross-cutting audit + fix across all game pages and `shared/styles.css`. Ensure every interactive control has a visible `:focus-visible` outline, large tap targets (≥44px), AA contrast on prompts, `prefers-reduced-motion` disables non-essential animation, all canvases resize responsively, every game has a visible Back-to-Home at all viewport sizes, semantic headings/landmarks. Fix gaps found; do not change game behavior.
**Files:** `shared/styles.css` + each `games/*/index.html` (markup/labels only).
**Acceptance:**
- [ ] `:focus-visible` outline present on all controls across all 11 games + homepage
- [ ] No console errors; reduced-motion respected
- [ ] Layout holds at mobile widths (320px) and desktop
- [ ] Back-to-Home reachable on every page at every width
**Dependencies:** T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19

### T21 — GitHub Pages CI + final test-suite verification
**Description:** Add `.github/workflows/deploy.yml` to publish the static site to GitHub Pages on push to `main` (upload-pages-artifact, `pages-build-deployment`). Confirm relative paths work under `/<repo>/` subpath. Verify `tests/index.html` registers every `*.test.js` (button-mapping, utils, + all 11 logic tests = 13 test files) and opens green with >80% pure-logic coverage. Update `README.md` with run/test instructions.
**Files:** `.github/workflows/deploy.yml`, `README.md`, `tests/index.html` (verify all 13 imports present, no duplicates).
**Acceptance:**
- [ ] `deploy.yml` valid; Pages deploy configured
- [ ] `tests/index.html` loads all 13 test modules, report green
- [ ] Site loads under `/<repo>/` subpath with no console errors
- [ ] `README.md` documents open-`index.html` + open-`tests/index.html`
**Dependencies:** T20

---

## Out of scope (human/manual, not tasks)
- Live gamepad playtesting on real Xbox/PS/Switch hardware (per testing rules, manual only).
- Final visual/brand polish decisions (Open Questions in `implementation-plan.md`).
