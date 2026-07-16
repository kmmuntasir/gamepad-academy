---
name: create-implementation-plan
description: Read a ticket/feature file, analyze the codebase, and write a comprehensive implementation plan for this vanilla HTML/JS/Canvas game project. Use when the user hands you a ticket file path and wants an implementation plan generated.
---

# Create Implementation Plan Skill

Read the provided ticket carefully, understand what needs to be delivered, analyze the codebase, then write a complete and comprehensive implementation plan as a new markdown file in the **same folder** as the ticket.

The ticket may be a **bug**, **feature**, or **enhancement** — adapt the analysis focus and plan shape to the ticket type.

## Inputs

User provides a **ticket file path**, e.g.:

- `.docs/feature/add-stargazer-constellation-mode.md`
- `docs/bugfix/some-bug-ticket.md`
- Absolute or relative path to a single `*.md` ticket

If no input is provided, **ask** for the ticket file path. Do not guess.

## Execution Steps

Follow exactly, in order.

### Step 1: Read & understand the ticket

Resolve the input to an absolute path and read it **completely**. Extract and hold in context:

- **Ticket ID** (e.g., `GAC-TICKET_NUMBER`) — derive from the filename or the ticket heading
- **Ticket type** — bug / feature / enhancement. Infer from content: repro steps + expected/actual → **bug**; a new game or capability → **feature**; a modification/tweak to something existing → **enhancement**. State the assumption explicitly.
- **What needs to be delivered** — the requirement or defect, in your own words
- **Named games, shared modules, mechanics** it touches
- For bugs: the **steps to reproduce** + expected vs. actual result

State your understanding back before analyzing: "Read ticket GAC-300 (bug) — <one-line summary>. Analyzing codebase..." (swap the type and summary as appropriate).

### Step 2: Analyze the codebase

Use up to **3 parallel `analyst` subagents** (via the Agent tool, `subagent_type: analyst`) to investigate and keep the main context window clean. **The split adapts to the ticket type.**

**For a bug** — focus on the defect:

| Subagent | Responsibility |
|----------|----------------|
| **Repro path** | Trace the defect end-to-end. Locate the game's `index.html`/`game.js`, the shared module, or the GamepadManager event involved; read the exact code path and confirm where the buggy behavior occurs. Cite `path:line`. |
| **Root cause** | Pinpoint the defect — the missing guard / wrong branch / bad assumption / off-by-one in the render loop or event handler — *why* it allows the bad behavior, and where the correct check belongs. |
| **Prior art & fix surface** | Map patterns to reuse: similar existing games, shared utils, the canonical `gamepad-*` event names, error-soft conventions, test fixtures, and any cross-game impact. |

**For a feature / enhancement** — focus on the design surface:

| Subagent | Responsibility |
|----------|----------------|
| **Integration points** | Where the new game/capability plugs in: the homepage card in `index.html`, the game folder to create, the shared modules it imports (`gamepad-manager.js`, `utils.js`), and assets needed. Cite `path:line`. |
| **Patterns & conventions** | Existing precedents to mirror: an analogous game already implemented (its folder layout, render loop, event listeners, Web Audio usage), naming, CSS approach, pure-logic extraction, in-browser test pattern. |
| **Cross-cutting** | Shared utilities/constants to add or reuse, GamepadManager event additions (if a new input is needed — flag the cross-game impact), asset additions, and homepage wiring. |

This is a **vanilla HTML/CSS/JS** project. Shared engine code lives in `shared/` (notably `gamepad-manager.js`). Each game lives in `games/<kebab-name>/`. Tests live in `tests/` using a hand-rolled in-browser harness. There is no backend, no framework, no build step.

Each subagent returns a **curated digest** with `path:line` evidence — not raw file dumps. Work from those digests.

If the ticket is clearly single-file or small, drop to 1–2 subagents. Add more `analyst` calls only if a digest surfaces a new area worth a focused probe.

### Step 3: Synthesize the approach

Combine the digests into a single coherent picture:

- **Bug** → state the root cause (what + why) and the minimal, convention-correct fix set
- **Feature / enhancement** → state the design: new/changed shared modules, the game's `index.html` + `game.js` (+ optional CSS), pure-logic modules, GamepadManager event consumption, Web Audio, assets, homepage card, and a sensible build order (shared module → pure logic → game JS → game HTML → homepage card → tests)
- **Both** → list edge cases & risks (cross-game impact of shared-module changes, event-name renames breaking other games, gamepad/keyboard parity, memory leaks from uncancelled loops/listeners, regressions) and any open questions

Respect project conventions: keep game logic in pure functions; consume gamepad input only via `GamepadManager` events; zero runtime dependencies; fail soft — no fail states; tests run in-browser.

### Step 4: Write the implementation plan

Write the plan to the **same directory as the ticket**, named `{ticket-filename}-plan.md` — e.g. ticket `.docs/feature/GAC-300.md` → `.docs/feature/GAC-300-plan.md`. Use the template below; include the **Root Cause** section **only for bugs**.

## Plan Template

````markdown
# Implementation Plan — {TICKET_ID}

**Ticket:** `{path-to-ticket}`
**Type:** {Bug | Feature | Enhancement}
**Title:** {ticket title}
**Generated:** {ISO date}

---

## Summary

{1–2 paragraph restatement of what needs to be delivered, in your own words.}

## Root Cause  *(bugs only — omit for feature/enhancement)*

{The precise defect: what is wrong and why it happens, with `path:line` evidence.}

## Affected Components

| Area | File | Why |
|------|------|-----|
| Homepage | `index.html` | Add card linking to the new game |
| Game page | `games/<name>/index.html` | New game entry point + Back to Home |
| Game logic | `games/<name>/game.js` | Render loop, event wiring |
| Pure logic | `games/<name>/<logic>.js` | Testable game rules |
| Shared | `shared/gamepad-manager.js` | (only if new input/event needed) |
| Shared | `shared/utils.js` | (only if a new helper is needed) |
| Tests | `tests/<logic>.test.js` | Unit tests for pure logic |
| Assets | `assets/...` | Sounds/images (if any) |

## Proposed Implementation

{Step-by-step. One sub-section per change, each with **File** / **What** / **Why** / **Code reference** (existing function/line the change builds on). Group shared-module changes and per-game changes separately. For features/enhancements, order changes by build dependency.}

### Shared Changes
*(only if the ticket requires shared-module or homepage changes)*
...

### Game Changes
...

### Test Changes
...

## Edge Cases & Risks

- {cross-game impact of shared changes / event-name renames / gamepad-keyboard parity / memory leaks / regressions}

## Testing

*Follow project conventions — hand-rolled in-browser harness (`tests/harness.js`, opened via `tests/index.html`); table-driven tests; one behavior per test; `*.test.js` under `tests/`. Pure logic is unit-tested; Canvas/DOM/live-gamepad covered by manual playtesting.*

- **Unit tests:** {pure-logic cases — mapping, sequences, lanes, collision, scoring}
- **Manual playtesting:** {re-run the ticket's reproduce steps for bugs / exercise the new game with both gamepad and keyboard for features}

## Acceptance Criteria

- [ ] {verifiable outcome — mirrors the ticket's "Expected Result" / acceptance criteria}
- [ ] ...

## Open Questions  *(optional)*

- {anything needing a product/owner decision}

## Out of Scope

- {anything explicitly not addressed}
````

## Error Handling

- **Can't read ticket** — ask the user to verify the path; do not proceed.
- **Ticket has no ID** — derive a slug from the filename; flag it in the plan.
- **Ticket type unclear** — state your best inference and why; proceed on that basis and note it.
- **Approach ambiguous** (e.g. unclear root cause, or a feature with multiple valid designs) — document the leading approach with evidence, list the alternatives, and mark what needs confirmation. Do not fabricate `path:line` citations.
- **Subagent failure** — retry the failed `analyst` individually; note in the plan if an area could not be fully investigated.

## Key Principles

- **Delegate analysis, write yourself.** Keep the main context clean — investigate via `analyst` subagents, synthesize and write the plan directly.
- **Evidence-backed.** Every code claim cites `path:line`. No guesses presented as fact.
- **Convention-correct.** Respect the vanilla-JS structure, centralized gamepad input, pure-logic extraction, zero-dependency, and zero-stress constraints; never propose gamepad polling inside game code or introducing a framework.
- **Adapt to the ticket type.** Bugs hunt a root cause; features/enhancements lay out a design. Same plan skeleton, type-appropriate emphasis.
- **Comprehensive but minimal.** Cover the full surface (including related games needing the same change) without scope creep. Out-of-scope items are called out explicitly.
