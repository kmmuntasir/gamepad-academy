# Project Overview: gamepad-academy
Build a static HTML/JS repository hosted via GitHub Pages containing a collection of zero-stress mini-games. The goal is to help a 7-year-old child build muscle memory for a gamepad without any fail states, timers, or health bars. 

## Architecture & Technical Constraints
*   **Zero Dependencies:** Use vanilla HTML, CSS, and JavaScript. Use the Canvas API for games requiring movement/rendering, and standard DOM manipulation for UI-heavy games.
*   **Central Gamepad Manager & Layout Detection:** Create a single, reusable `GamepadManager.js` class. This class must handle the `navigator.getGamepads()` polling loop inside a `requestAnimationFrame`.
    *   **Controller Detection:** The manager must parse the gamepad's `id` string to determine if the connected controller is an Xbox, PlayStation, or Nintendo Switch layout.
    *   **Unified Events:** It must dispatch generic positional `CustomEvent`s (e.g., `gamepad-face-bottom`, `gamepad-face-right`, `gamepad-face-left`, `gamepad-face-top`, `gamepad-bumper-left`) so the game logic is layout-agnostic.
*   **Dynamic UI & Instructions:** All on-screen prompts must dynamically render icons or text matching the detected controller. 
    *   Xbox: A (Bottom), B (Right), X (Left), Y (Top)
    *   PlayStation: Cross (Bottom), Circle (Right), Square (Left), Triangle (Top)
    *   Switch: B (Bottom), A (Right), Y (Left), X (Top)
*   **Navigation:** A central `index.html` homepage with visual cards linking to the individual mini-game HTML files. Each mini-game must have a visible "Back to Home" button.
*   **Testing (Zero-Dependency):** Unit tests run via a tiny, hand-rolled in-browser harness — no npm, no test runner install. A `tests/harness.js` provides `describe`/`it`/`expect`/`assert`, and a `tests/index.html` loads it plus every `*.test.js` and renders a green/red report when opened in a browser. Game rules (layout mapping, sequences, lane math, trigger/stick math, collision, scoring) are kept in pure functions so they are unit-testable in isolation; Canvas rendering, DOM wiring, and live gamepad input are covered by manual playtesting.

## The Mini-Games to Implement

### 1. The Animal Spawner (Focus: Action to Consequence)
*   **Mechanic:** A blank canvas. Pressing face buttons spawns different animal emojis or SVGs with a fun sound effect.
*   **Logic:** The Bottom face button spawns a Cat, Right spawns a Dog, Left spawns a Bird, Top spawns a Frog. The D-Pad changes the background color. 
*   **Goal:** Pure sandbox creation to link physical buttons to immediate visual rewards.

### 2. The Color-Match Feeder (Focus: Targeted Reflexes)
*   **Mechanic:** A static monster in the center. Food items slowly drift toward it.
*   **Logic:** The food items display a specific face button prompt. The UI must render the correct button icon based on the detected controller layout. The player must press the matching physical button when the food is near the monster to trigger an "eating" animation. If they miss, the food just harmlessly drifts away. 

### 3. Simon Says / Copycat Rhythm (Focus: Muscle Memory)
*   **Mechanic:** An on-screen visual representation of the 4 face buttons, rendered to match the player's physical controller layout exactly.
*   **Logic:** The game highlights a button and plays a tone. The player presses the corresponding physical button. It starts with single presses and slowly builds sequences (e.g., Bottom -> Left -> Right). No penalties for wrong presses, just wait for the correct input.

### 4. City-Pop DJ (Focus: Holding & Chording)
*   **Mechanic:** A virtual mixing desk. The player must hold down buttons to keep musical tracks playing.
*   **Logic:** Bottom face button holds the bassline, Right holds the drums, Left holds the melody, and Top holds the vocals. Releasing the button mutes that track. They learn to hold multiple buttons simultaneously to hear the full song.

### 5. The Stargazer (Focus: Dual-Thumb Independence)
*   **Mechanic:** A night sky canvas.
*   **Logic:** The Left Thumbstick moves a glowing cursor around the screen. Hidden, faded dots are scattered around. When the cursor hovers over a dot, a prompt shows a face button matching their specific controller layout. Pressing the correct button ignites a bright star. Connecting them draws a constellation.

### 6. Bumper Lane Runner (Focus: Shoulder Buttons)
*   **Mechanic:** A top-down view of a character moving forward automatically across a 3-lane track.
*   **Logic:** The Left Bumper (L1/LB/L) instantly hops the character one lane to the left. The Right Bumper (R1/RB/R) hops one lane to the right. The player dodges static obstacles and collects coins. Hitting an obstacle simply bounces the character back a lane without stopping the game.

### 7. The Wildlife Photographer (Focus: Right-Stick Camera Control)
*   **Mechanic:** A stationary, first-person panoramic view (achieved via CSS 3D cylinder/cube mapping or a scrolling wide canvas) representing a vibrant forest or park. 
*   **Logic:** The Right Thumbstick pans the "camera" up, down, left, and right across the panoramic scene. Hidden in the scenery are static animals. When the center of the screen (a camera reticle) hovers over an animal, it glows. The player presses the Right Trigger or Right Bumper to "snap" a photo, adding it to a visible UI scrapbook.
*   **Goal:** Teaches the fundamental logic of using the right stick to control viewport orientation in 3D space, completely isolated from character movement.

### 8. The Claw Machine (Focus: D-Pad Grid Navigation)
* **Mechanic:** A 2D grid filled with toy prizes (plushies, blocks). A "claw" sits at the top.
* **Logic:** The player MUST use the D-Pad (Up, Down, Left, Right) to move the claw rigidly along the grid, one square at a time. The Thumbsticks are deliberately disabled for this game. Once positioned over a prize, pressing the Bottom face button drops the claw to grab it.
* **Goal:** Teaches the difference between fluid analog movement and discrete, step-by-step grid navigation, which is essential for retro games and UI menus.

### 9. The Hot Air Balloon (Focus: Analog Trigger Pressure)
* **Mechanic:** A side-scrolling view of a hot air balloon floating across the screen. 
* **Logic:** The Right Trigger (RT/R2/ZR) controls the burner. The Gamepad API provides a `value` from 0.0 (unpressed) to 1.0 (fully pressed) for the triggers. 
    * Pressing the trigger fully makes the fire massive and the balloon rise quickly.
    * Pressing it slightly makes a small flame and the balloon hovers or rises gently.
    * Releasing it lets the balloon slowly descend.
    * The player must modulate their trigger squeeze to guide the balloon up and down to collect floating stars and avoid gentle clouds.
* **Goal:** Introduces the concept of analog inputs and pressure sensitivity (throttle control), rather than treating every button as a binary on/off switch.

### 10. The Submarine Sonar (Focus: L3/R3 Stick Clicks)
* **Mechanic:** A dark underwater scene. The player controls a small submarine.
* **Logic:** The Left Thumbstick moves the submarine around. The screen is mostly dark. The player must physically press/click the Left Thumbstick IN (L3) to send out a glowing sonar ping that illuminates hidden fish and treasure in the dark water for a few seconds. Clicking the Right Thumbstick IN (R3) changes the submarine's headlight color.
* **Goal:** Teaches the existence of the "hidden" stick-click buttons (L3/R3) and trains the player to click the stick without accidentally flicking it in a direction.

### 11. The Butterfly Catcher (Focus: Thumbstick Sensitivity / Analog Tilt)
* **Mechanic:** A top-down view of a peaceful grassy field. The player controls a character trying to get close to resting butterflies.
* **Logic:** The Gamepad API provides `x` and `y` axis values (from -1.0 to 1.0) for the Left Thumbstick. The game loop must calculate the vector magnitude (distance from the center) of the stick tilt.
    * **Full Tilt (Magnitude > 0.7):** The character *runs* quickly. This creates visual noise (dust clouds/speed lines). If the running character gets too close to a butterfly, it instantly flies away and respawns somewhere else.
    * **Gentle Tilt (Magnitude < 0.4):** The character *tiptoes* slowly and quietly. The player must use this gentle tilt to get close enough to a butterfly to automatically "catch" or photograph it.
* **Goal:** Teaches the analog nature of the thumbsticks, demonstrating the physical difference between a slight nudge for careful precision and a full tilt for rapid movement.
