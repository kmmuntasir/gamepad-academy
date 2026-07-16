---
trigger: model_decision
description: Ruleset that MUST be followed when writing or running tests
---

# Testing Rules

## Overview

Unit testing for a zero-dependency, browser-only project uses a **hand-rolled in-browser harness** — no npm, no test runner install. Tests run by opening an HTML page in a real browser, so the Canvas, DOM, and Gamepad APIs are available natively.

The enabler: **keep game logic in pure functions** (no DOM/Canvas/gamepad calls) so it can be unit-tested in isolation. Code that must touch the browser is tested by injecting fake input or by checking observable DOM/Canvas state.

## Test Organization

```
tests/
  harness.js                       # assert / describe / it / expect (the framework)
  index.html                       # loads harness + every *.test.js, runs on open
  gamepad-manager.test.js
  button-mapping.test.js
  color-match-logic.test.js
```

Test files live under `tests/` and import the modules under test via relative paths.

## The Harness

`tests/harness.js` provides a minimal assertion API with no dependencies:

```javascript
// tests/harness.js — tiny framework-free test runner
const results = []

function describe(name, fn) {
    console.group?.(name)
    fn()
    console.groupEnd?.(name)
}

function it(name, fn) {
    try {
        fn()
        results.push({ name, pass: true })
    } catch (error) {
        results.push({ name, pass: false, error: error.message })
    }
}

function assertEqual(actual, expected, message) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    if (!ok) {
        throw new Error(
            `${message || 'assertion failed'} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        )
    }
}

function expect(actual) {
    return {
        toBe: (expected) => assertEqual(actual, expected),
        toEqual: (expected) => assertEqual(actual, expected),
        toBeTruthy: () => {
            if (!actual) throw new Error(`expected truthy, got ${actual}`)
        },
        toBeLessThan: (n) => {
            if (!(actual < n)) throw new Error(`expected ${actual} < ${n}`)
        },
    }
}

// Called by index.html after all tests load: render a green/red summary.
window.__runTests = () => {
    /* render results[] into the page */
}
```

## Writing Tests

### Table-Driven Tests (preferred)

```javascript
import { nextLane } from '../games/bumper-lane-runner/lane-logic.js'
import { describe, it, expect } from './harness.js'

describe('nextLane', () => {
    const tests = [
        { name: 'left from middle', input: { current: 1, direction: 'left' }, expected: 0 },
        { name: 'left at edge stays', input: { current: 0, direction: 'left' }, expected: 0 },
        { name: 'right from middle', input: { current: 1, direction: 'right' }, expected: 2 },
        { name: 'right at edge stays', input: { current: 2, direction: 'right' }, expected: 2 },
    ]

    tests.forEach(({ name, input, expected }) => {
        it(name, () => {
            expect(nextLane(input.current, input.direction, 3)).toBe(expected)
        })
    })
})
```

### Testing Event-Driven Logic

For modules that map/dispatch events (e.g., `GamepadManager`), drive them with fake input and assert on observed output — never call `navigator.getGamepads()` in a unit test:

```javascript
import { describe, it, expect } from './harness.js'
import { mapFaceButton } from '../shared/gamepad-manager.js'

describe('mapFaceButton', () => {
    it('maps standard button index 0 to the bottom face button', () => {
        expect(mapFaceButton(0)).toBe('gamepad-face-bottom')
    })
})
```

## Running Tests

1. Open `tests/index.html` in a browser (Chrome/Edge/Firefox).
2. The page loads the harness and every `*.test.js`, runs them, and renders a green/red summary.
3. No CLI, no install. If module CORS blocks `file://`, serve over `python -m http.server`.

## Mocking

There is no `vi.fn()`. Strategies:

- **Pure functions** — pass inputs directly, assert outputs. Preferred.
- **DOM/Canvas** — query the real DOM/canvas after driving the code; assert on observable state.
- **Gamepad** — test the mapping/pure logic only; exercise the real gamepad via manual playtesting.

## Coverage Targets

- Pure game logic (mapping, sequences, lanes, collision, scoring math): **>80%**.
- GamepadManager event mapping: **>80%**.
- Canvas rendering / DOM wiring / live gamepad: covered by manual playtesting, not unit tests.
