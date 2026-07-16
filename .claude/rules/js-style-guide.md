---
trigger: model_decision
description: Ruleset that MUST be followed when writing JavaScript
---

# JavaScript Style Guide

Vanilla ES2020+ JavaScript in ES modules. No TypeScript, no transpiler, no framework.

## Formatting

- Prettier-compatible where a config exists; otherwise:
- Line length: 100 chars max.
- Indent: 2 spaces.
- Semicolons: yes.
- Single quotes for strings.
- Trailing commas in multi-line arrays and objects.

## Naming Conventions

### Files
- HTML, JS, and CSS files: **kebab-case** (e.g., `gamepad-manager.js`, `color-match-feeder/index.html`, `button-mapping.js`, `global-styles.css`).
- Test files: `<module>.test.js` (e.g., `gamepad-manager.test.js`).
- Assets: kebab-case, descriptive (e.g., `eat-blip.wav`, `star-icon.svg`).

### Identifiers
- `camelCase` for variables and functions (e.g., `currentLane`, `spawnAnimal`).
- `PascalCase` for classes and constructor functions (e.g., `class GamepadManager {}`).
- `SCREAMING_SNAKE_CASE` for top-level constants (e.g., `const STICK_DEADZONE = 0.2`, `const FPS_TARGET = 60`).

```javascript
// Classes
class GamepadManager {}

// Constants
const LANE_COUNT = 3
const FACE_POSITIONS = ['bottom', 'right', 'left', 'top']

// Variables and functions
const currentLane = 1
function spawnAnimal(type) {}
```

### Acronyms
- Keep case consistent: `URL`, `ID`, `HTTP`, `API` (all caps) — as in `gamepadId`, `audioContext`.

## Code Structure

### Functions
- Keep short and focused (<50 lines).
- Early returns to reduce nesting.
- `async`/`await` over raw promise chains.
- **Extract pure functions** for game logic (button mapping, sequence matching, collision, lane math) so they are unit-testable without the DOM/Canvas/gamepad.

```javascript
function nextLane(current, direction, laneCount = LANE_COUNT) {
    if (direction === 'left') return Math.max(0, current - 1)
    if (direction === 'right') return Math.min(laneCount - 1, current + 1)
    return current
}
```

### Modules
- One concern per module; `export`/`import` via `<script type="module">`.
- Prefer named exports. At most one default export per module.

```javascript
// shared/gamepad-manager.js
export class GamepadManager {}

// games/color-match-feeder/game.js
import { GamepadManager } from '../../shared/gamepad-manager.js'
```

### Error Handling

```javascript
try {
    const ctx = getAudioContext()
    playTone(ctx, frequency)
} catch (error) {
    console.error('Failed to play tone:', error)
}
```

### Game Loop Pattern

```javascript
let rafId = null

function loop(timestamp) {
    update(timestamp)
    draw()
    rafId = requestAnimationFrame(loop)
}

function start() {
    rafId = requestAnimationFrame(loop)
}

function stop() {
    if (rafId) cancelAnimationFrame(rafId)
}
```

## Import Organization

Import order:

1. Shared modules (`gamepad-manager.js`, `utils.js`).
2. Game-local modules.
3. Constants/config.

```javascript
import { GamepadManager } from '../../shared/gamepad-manager.js'
import { clamp, randomInt } from '../../shared/utils.js'
import { FOOD_COLORS } from './config.js'
```

## Things to Avoid

- `var` — use `const` (default) or `let` (reassignment only).
- Global namespace pollution — use modules; no bare top-level side effects.
- `console.log` left in committed code (debugging only).
- Inline styles — use CSS classes/stylesheets. Canvas drawing styles (`fillStyle`, etc.) are the exception.
- Magic numbers — define named constants.
- Touching `navigator.getGamepads()` outside `GamepadManager`.
