# Game Specs — all 11 mini-games

**Part of:** [implementation-plan.md](./implementation-plan.md)
**Conventions:** every game has `index.html`, `game.js`, and a pure `*-logic.js`. Games import `../../shared/gamepad-manager.js`, `../../shared/utils.js`, `../../shared/button-mapping.js`, `../../shared/glyph.js`. Every page has a visible **"Back to Home"** button and dynamic, layout-correct prompts. No fail states anywhere.

## Quick reference

| # | Game | Folder | Pure module | Events consumed | Render |
|---|------|--------|-------------|-----------------|--------|
| 1 | Animal Spawner | `animal-spawner` | `spawn-logic.js` | face ×4, dpad ×4 | DOM |
| 2 | Bumper Lane Runner | `bumper-lane-runner` | `lane-logic.js` | bumper-left/right | Canvas |
| 3 | Simon Says | `simon-says` | `sequence-logic.js` | face ×4 | DOM |
| 4 | Claw Machine | `claw-machine` | `claw-logic.js` | dpad ×4, face-bottom | Canvas |
| 5 | Color-Match Feeder | `color-match-feeder` | `feeder-logic.js` | face ×4 | Canvas |
| 6 | Stargazer | `stargazer` | `constellation-logic.js` | stick-left, face ×4 | Canvas |
| 7 | Butterfly Catcher | `butterfly-catcher` | `tilt-logic.js` | stick-left (magnitude) | Canvas |
| 8 | Hot Air Balloon | `hot-air-balloon` | `balloon-physics.js` | trigger-right (value) | Canvas |
| 9 | Submarine Sonar | `submarine-sonar` | `sonar-logic.js` | stick-left, stick-click-left/right | Canvas |
| 10 | Wildlife Photographer | `wildlife-photographer` | `camera-logic.js` | stick-right, trigger-right, bumper-right | Canvas |
| 11 | City-Pop DJ | `city-pop-dj` | `track-logic.js` | face ×4 (press + release) | DOM |

---

## 1. Animal Spawner

**Teaches:** Action → consequence (face buttons + D-Pad). **Difficulty:** Easy. **Render:** DOM.

**Mechanic:** A blank playfield. Pressing a face button spawns that animal emoji with a fun blip; the D-Pad changes the background color.

- Bottom → 🐱 Cat · Right → 🐶 Dog · Left → 🐦 Bird · Top → 🐸 Frog.
- D-Pad Up/Down/Left/Right → cycle background color through a child-friendly palette.

**Events:** `gamepad-face-{bottom,right,left,top}` (spawn), `gamepad-dpad-{up,down,left,right}` (color).

**Pure module `spawn-logic.js`:**

- `animalForPosition(position)` → `{ emoji, label, position }`.
- `nextBackgroundColor(direction, palette, currentIndex)` → next palette index (direction maps to +/− step or distinct slot).

**Audio:** `playBlip()` with a slightly different pitch per animal (4 pitches for 4 positions).

**UX:** spawn emoji at a random jittered position with a gentle pop-in animation; emojis linger or softly fade. No cap panic — if too many, recycle the oldest. Background color changes are instant and playful.

**Acceptance:** all 4 face buttons spawn the correct animal; all 4 D-Pad directions change the background; prompts render the correct glyph for the connected layout; keyboard works.

**Edge cases:** rapid mashing → cap concurrent emoji (~40) by recycling oldest; D-Pad repeat fires only on press edge (handled by manager).

---

## 2. Bumper Lane Runner

**Teaches:** Shoulder bumpers (L1/R1). **Difficulty:** Easy. **Render:** Canvas.

**Mechanic:** Top-down auto-runner on a 3-lane track. Left bumper hops one lane left, right bumper hops one lane right. Coins to collect; static obstacles bounce the runner back a lane (no stop, no fail).

**Events:** `gamepad-bumper-left`, `gamepad-bumper-right`.

**Pure module `lane-logic.js`:**

- `nextLane(current, direction, laneCount = 3)` → clamped lane (matches the style-guide example).
- `resolveObstacleHit(lane, obstacle, laneCount)` → resulting lane after a bounce-back.
- `tryCollectCoin(player, coin)` → boolean (distance check).

**Render:** world scrolls downward (lanes fixed x); player sprite in current lane; coins as gold dots; obstacles as soft blocks. `requestAnimationFrame` loop with `dt`.

**Audio:** coin collect = bright `playBlip`; obstacle bump = soft thud (low tone), never punitive.

**UX:** auto-forward speed is gentle; lanes are wide; bump animation is playful (squash/stretch), not violent. Score = coins, displayed only as a friendly count.

**Acceptance:** bumpers move lanes and clamp at edges; coins collect on overlap; obstacles bounce back without stopping; no fail state; keyboard (`KeyQ`/`KeyE`) works.

**Edge cases:** lane clamping at 0 and `laneCount-1`; simultaneous bumper + obstacle on the same frame resolves lane first, then collision.

---

## 3. Simon Says / Copycat Rhythm

**Teaches:** Face-button memory. **Difficulty:** Easy. **Render:** DOM.

**Mechanic:** Four on-screen face-button pads rendered to match the player's physical layout. The game highlights a pad + plays a tone; the player echoes it. Starts with one press, grows the sequence one step per successful round. Wrong presses are simply ignored — the game waits for the correct input.

**Events:** `gamepad-face-{bottom,right,left,top}`.

**Pure module `sequence-logic.js`:**

- `extendSequence(seq)` → `seq` with one random position appended (seedable RNG via index for tests).
- `expectedAt(seq, step)` → the position expected at `step`.
- `isCorrect(seq, step, position)` → boolean.
- `toneForPosition(position)` → frequency (4 distinct pitches).

**Audio:** 4 tones (e.g., C/E/G/C↑) via `playTone`; one per position.

**UX:** playback highlights each pad with its tone; a generous tempo; after a correct full echo, celebrate (sparkles) and add one more. No timeout, no "wrong" penalty — wrong press just doesn't advance.

**Acceptance:** sequence grows by one per correct round; wrong press never penalizes; prompts match layout; tones distinct; keyboard works.

**Edge cases:** input during playback is buffered/ignored until the player's turn; sequence length unbounded but UI scrolls/summarizes.

---

## 4. The Claw Machine

**Teaches:** D-Pad grid navigation (discrete steps). **Difficulty:** Easy. **Render:** Canvas.

**Mechanic:** A 2D grid of toy prizes; a claw starts at the top. The D-Pad moves the claw **one cell** per press (Up/Down/Left/Right). **Thumbsticks are deliberately disabled** for this game. Once over a prize, the Bottom face button drops the claw to grab it into a prize tray.

**Events:** `gamepad-dpad-{up,down,left,right}`, `gamepad-face-bottom` (drop). Stick events are NOT listened to here (enforced by simply not registering them).

**Pure module `claw-logic.js`:**

- `moveClaw(pos, direction, gridBounds)` → `{ x, y }` clamped within `gridBounds`.
- `grabAt(pos, prizes)` → grabbed prize object or `null`.
- `resetClaw(gridBounds)` → top-center start position.

**Render:** grid of prize emojis; claw sprite animates drop/grab/rise; prize tray fills on success.

**Audio:** mechanical whir on move (very soft), grab success = happy chime.

**UX:** one cell per press (edge-triggered, so holding does not auto-repeat); large grid cells; prizes never disappear forever — after a grab, a new prize can refill so the tray keeps filling.

**Acceptance:** D-Pad moves the claw one discrete cell and clamps at edges; sticks do nothing; Bottom drops and grabs the prize under the claw; tray accumulates; keyboard works.

**Edge cases:** dropping on an empty cell just re-rises empty (no penalty); bounds clamp on all four edges.

---

## 5. The Color-Match Feeder

**Teaches:** Face buttons + targeted timing. **Difficulty:** Medium. **Render:** Canvas.

**Mechanic:** A static monster in the center. Food items drift toward it, each carrying a face-position prompt rendered with the correct glyph for the layout. Press the matching face button when the food is near the monster to trigger an "eating" animation. Miss → the food harmlessly drifts past.

**Events:** `gamepad-face-{bottom,right,left,top}`.

**Pure module `feeder-logic.js`:**

- `createFood()` → `{ position, x, y, speed, eaten: false }` (position is one of the 4 face positions).
- `isInEatZone(food, monster, radius)` → boolean.
- `positionMatchesPrompt(position, prompt)` → boolean (same-position check).
- `updateFood(food, dt)` → advanced position.

**Render:** monster with idle/munch animations; food emoji + glyph badge moving inward; munch burst on eat.

**Audio:** eat = happy chomp `playBlip`; food drifts away silently (no negative sound).

**UX:** drift speed is slow and forgiving; multiple foods can be in flight; only the matching button eats a matching food in the zone; mismatched press is a no-op. No score pressure — show a friendly "Yum!" count.

**Acceptance:** eating only succeeds when matching button pressed AND food in eat zone; wrong button or out-of-zone press does nothing; prompts render correct glyph; keyboard works.

**Edge cases:** two same-position foods in the zone at once → eat the nearest; food leaving the screen is removed and recycled.

---

## 6. The Stargazer

**Teaches:** Dual-thumb independence (left stick move + face button confirm). **Difficulty:** Medium. **Render:** Canvas.

**Mechanic:** A night-sky canvas. The left thumbstick moves a glowing cursor. Hidden, faded dots are scattered. When the cursor hovers a dot, a prompt shows the face button for that dot (matching the layout). Pressing the correct button ignites a bright star; connecting ignited stars draws constellation lines.

**Events:** `gamepad-stick-left` (`detail { x, y }`), `gamepad-face-{bottom,right,left,top}`.

**Pure module `constellation-logic.js`:**

- `findHoveredDot(cursor, dots, radius)` → the dot within `radius` of the cursor, or `null`.
- `promptForDot(dot)` → the face position the dot requires.
- `connectDots(ignited)` → list of edges connecting stars in ignition order (or proximity).

**Render:** cursor glow; faint dots brighten on hover with their glyph; ignited stars are bright; lines connect them.

**Audio:** ignite = soft sparkle `playBlip`; connection chime when a new edge forms.

**UX:** cursor has a small deadzone so it holds still; hover reveals the prompt; only the correct button ignites; wrong button is a no-op. Constellation builds indefinitely and beautifully.

**Acceptance:** left stick moves the cursor; hovering a dot shows the correct glyph prompt; correct button ignites; stars connect into a constellation; wrong button does nothing; keyboard (stick emulation) works.

**Edge cases:** two dots within radius → pick nearest; off-canvas cursor clamped to bounds; many ignited stars → cap line drawing to recent/nearest to avoid clutter.

---

## 7. The Butterfly Catcher

**Teaches:** Thumbstick analog tilt (vector magnitude). **Difficulty:** Medium. **Render:** Canvas.

**Mechanic:** Top-down grassy field. The left stick moves a character toward resting butterflies. The game uses the stick's **magnitude**: full tilt (>0.7) makes the character run, creating dust/speed lines — a running character scares nearby butterflies away (they fly off and respawn elsewhere). Gentle tilt (<0.4) makes the character tiptoe — get close enough and the butterfly is auto-caught/photographed.

**Events:** `gamepad-stick-left` (`detail { x, y }`).

**Pure module `tilt-logic.js`:**

- `stickMagnitude(x, y)` → `Math.hypot(x, y)` clamped to 1.
- `movementMode(magnitude)` → `'tiptoe'` (<0.4) | `'walk'` (0.4–0.7) | `'run'` (>0.7).
- `butterflyFlees(butterfly, player, mode)` → boolean (within scare radius AND mode is run).
- `tryCatch(butterfly, player, mode)` → boolean (within catch radius AND mode is tiptoe).

**Render:** character with walk/run animation + dust on run; butterflies flutter; caught butterfly joins a photo collection.

**Audio:** soft footstep blips scaled by mode; catch = gentle camera-shutter `playBlip`.

**UX:** the magnitude thresholds teach the physical difference between nudge and tilt; butterflies that flee respawn after a short delay elsewhere; collection grows without end.

**Acceptance:** run scares butterflies; tiptoe catches them; walk neither; magnitude computed correctly; keyboard stick-emulation works.

**Edge cases:** deadzone zeroes tiny noise so standing still is truly still; butterfly respawn keeps a minimum count on screen.

---

## 8. The Hot Air Balloon

**Teaches:** Analog trigger pressure (throttle control). **Difficulty:** Medium. **Render:** Canvas.

**Mechanic:** Side-scrolling view. The right trigger's `value` (0.0–1.0) controls the burner: full press → big flame, balloon rises fast; slight press → small flame, hover/gentle rise; release → slow descent. Modulate squeeze to collect floating stars and pass gentle clouds.

**Events:** `gamepad-trigger-right` (`detail.value`).

**Pure module `balloon-physics.js`:**

- `verticalVelocity(value, { gravity, maxThrust, vy, dt })` → new `vy` = `vy + (thrust − gravity) * dt`, where `thrust = value * maxThrust`. Released (`value ≈ 0`) → gravity-only descent.
- `collectStar(balloon, star)` → boolean.
- `cloudBounce(balloon, cloud)` → gentle nudge (harmless, no penalty).

**Render:** balloon + flame size keyed to `value` (0→tiny/no flame, 1→big flame); side-scrolling clouds and stars; altitude indicator optional.

**Audio:** flame whoosh scaled to `value` (gain ∝ value) via a filtered noise/tone; star collect chime.

**UX:** physics is forgiving; clouds only gently nudge; stars float at varied altitudes to encourage modulation; nothing ever ends the game.

**Acceptance:** trigger value directly maps to flame size and climb rate; release descends; partial press hovers; stars collect; clouds only nudge; keyboard (`Space` = full value) works.

**Edge cases:** trigger deadzone zeroes resting noise; clamp altitude to screen bounds (balloon gently bumps top/bottom); `dt` clamped to avoid tunneling on lag spikes.

---

## 9. The Submarine Sonar

**Teaches:** L3/R3 stick-clicks. **Difficulty:** Medium. **Render:** Canvas.

**Mechanic:** Dark underwater scene. The left stick moves a small submarine. The screen is mostly dark. Press the left stick IN (L3) to emit a sonar ping that illuminates hidden fish/treasure for a few seconds. Click the right stick IN (R3) to cycle the submarine's headlight color.

**Events:** `gamepad-stick-left` (move), `gamepad-stick-click-left` (ping), `gamepad-stick-click-right` (headlight color).

**Pure module `sonar-logic.js`:**

- `pingRadius(elapsed, maxRadius, duration)` → expanding ring radius (`easeOut` from 0 to `maxRadius` over `duration`).
- `revealedByPing(entity, subPos, radius)` → boolean (entity within `radius` of `subPos`).
- `nextHeadlightColor(current, palette)` → next color in the palette.

**Render:** submarine with a colored headlight cone; faint entities revealed by ping (fading back to dark after the ping); expanding sonar ring.

**Audio:** ping = soft sonar "blip-blip"; headlight color change = subtle switch tone.

**UX:** pings illuminate generously; entities fade gently; headlight color is cosmetic fun; movement is smooth; nothing is penalized.

**Acceptance:** L3 ping illuminates entities within the expanding radius; R3 cycles headlight color; left stick moves the sub; clicks do NOT accidentally move the sub (manager edge-triggers clicks); keyboard (`KeyC`/`KeyV`) works.

**Edge cases:** clicking must not be read as a stick flick (handled by the manager separating button 10/11 presses from axis 0/1); multiple pings overlap additively; ping cooldown optional to avoid spam (gentle, non-blocking).

---

## 10. The Wildlife Photographer

**Teaches:** Right-stick camera control. **Difficulty:** Hard. **Render:** Canvas.

**Mechanic:** A first-person panoramic forest (scrolling wide canvas). The right thumbstick pans the camera up/down/left/right across the scene. Hidden static animals glow when the center reticle hovers over them. Press the right trigger **or** right bumper to snap a photo, adding the animal to a UI scrapbook.

**Events:** `gamepad-stick-right` (`detail { x, y }`), `gamepad-trigger-right` (`detail.value`, treat >threshold as snap), `gamepad-bumper-right` (snap).

**Pure module `camera-logic.js`:**

- `panCamera(stick, offset, bounds)` → new `{ x, y }` offset clamped to the panorama `bounds`.
- `isInReticle(animal, offset, reticle, viewport)` → boolean (animal's screen position under the reticle).
- `addPhoto(scrapbook, animal)` → scrapbook with the animal added (dedup optional).

**Render:** wide panorama drawn with `offset`; reticle at viewport center; animals glow when under reticle; scrapbook strip fills with thumbnails.

**Audio:** shutter `playBlip` on snap; subtle ambient tones.

**UX:** panning speed scales with stick deflection; a snap only registers an animal currently under the reticle; scrapbook grows; animals never vanish permanently.

**Acceptance:** right stick pans and clamps to panorama bounds; reticle-over-animal glows; trigger or bumper snaps the glowing animal into the scrapbook; left stick does nothing here (only right stick); keyboard stick-emulation + `Space`/`KeyE` works.

**Edge cases:** snapping with no glowing animal is a no-op (no penalty); panorama bounds clamp on all sides; `devicePixelRatio` for crisp wide canvas.

---

## 11. City-Pop DJ

**Teaches:** Holding & chording multiple buttons. **Difficulty:** Hard. **Render:** DOM.

**Mechanic:** A virtual mixing desk. **Hold** face buttons to keep musical tracks playing: Bottom → bassline, Right → drums, Left → melody, Top → vocals. Releasing a button mutes that track. Holding multiple plays the full song. Teaches simultaneous holds (chording).

**Events:** `gamepad-face-{bottom,right,left,top}` (press → start/hold) and the matching `…-up` (release → mute).

**Pure module `track-logic.js`:**

- `trackForPosition(position)` → track id (`'bass' | 'drums' | 'melody' | 'vocals'`).
- `activeTracks(heldPositions)` → set of active track ids.
- `mixGain(track, active)` → target gain (1 if active, 0 if not).

**Audio (the hard part):** original, non-copyrighted synthesized loops at a fixed tempo (e.g., ~100 BPM city-pop feel). Implementation uses a standard Web Audio **lookahead scheduler**: a `setInterval` lookahead (~25 ms) schedules upcoming notes ahead of `audioCtx.currentTime` via `OscillatorNode`/`AudioBufferSourceNode` (noise for drums). Each track routes through its own `GainNode` (target from `mixGain`) → master. Held flags toggle the gains each frame; notes are always scheduled, so a track fades in/out smoothly when toggled mid-beat.

- Bassline: low sine/triangle arpeggio.
- Drums: scheduled kick (sine drop) + hi-hat (short noise burst).
- Melody: square/saw arpeggio an octave up.
- Vocals: soft sustained pad chord (detuned oscillators), gated by the hold flag.

**Render:** mixing-desk UI: four labeled channel strips, each with the layout-correct glyph; a fader/LED shows active/inactive; a VU-style animation pulses to the beat. Chord hints show which combination = "full song".

**UX:** the `AudioContext` resumes on first press; tracks never produce silence-as-punishment — releasing just mutes; holding all four is celebrated (sparkles + "Full mix!"). Tempo is steady and pleasant.

**Acceptance:** each face button toggles its track on press and mutes on release; multiple simultaneous holds mix all tracks; gains update smoothly (no clicks); labels match the layout; keyboard (hold WASD) works; the `AudioContext` resumes on first gesture.

**Edge cases:** scheduler must stop on `pagehide` (clear the interval + stop nodes); gain ramps (use `setTargetAtTime`) avoid clicks; losing the active gamepad must NOT kill audio (keyboard can still hold); the scheduler accounts for `audioCtx.currentTime` starting at 0 and tab-throttling (clamp scheduling catch-up).

---

## Shared per-game acceptance (applies to all)

- Visible "Back to Home" button linking to `/index.html` (relative).
- Prompts render via `glyph.js` using `gamepadManager.getLayout()`.
- Playable with gamepad and keyboard.
- No fail state, timer, health bar, or penalty.
- Render loop cancels and listeners are removed on page unload.
- No `console.log`, no inline styles, no magic numbers, no `navigator.getGamepads()` calls.
