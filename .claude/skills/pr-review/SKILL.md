---
name: pr-review
description: Comprehensive vanilla HTML/JS/Canvas PR review with Gamepad API best practices, zero-dependency checks, child-friendly UX, and code quality assessment. Use when user requests to review a pull request or compare branches for code review.
---

# PR Review Skill

When user requests **PR review** or to **compare branches**:

### Branch Defaults

- **Source branch**: Current local branch. Determine with `git branch --show-current`.
- **Target branch**: `main`, unless user explicitly specifies different branch.
- If user specifies both branches, use those values.

### Pre-Review: Branch Synchronisation

Before review, both branches must be up-to-date and source must be rebased onto target (project uses **Rebase and Merge** on GitHub).

**Standard mode** (online):

```bash
# 1. Fetch all remotes
git fetch --all

# 2. Reset target to origin
git checkout <target-branch> && git reset --hard origin/<target-branch>

# 3. Reset source to origin
git checkout <source-branch> && git reset --hard origin/<source-branch>

# 4. Rebase source onto target
git rebase <target-branch>
```

**Offline mode**: If user says **"offline"** when invoking this skill, skip steps 1-3 entirely. Only run rebase (step 4) against local copy of target branch. Allows reviewing purely local state without network access.

**Conflict handling**: If rebase in step 4 produces merge conflicts, **stop entire review**. Abort rebase (`git rebase --abort`), inform user of conflicts, do not proceed with any review steps.

**If rebase succeeds**: Proceed to review steps below.

### Parallel Subagent Strategy

Review accelerates using **up to 3 parallel subagents** (via `Agent` tool). Split independent review tasks across subagents to save context window and speed process. Example parallelisation:

| Subagent | Scope | Agent Type |
|----------|-------|------------|
| 1 | Diff analysis + architecture review | `general-purpose` |
| 2 | Vanilla-JS/Canvas/Gamepad-specific checks (modules, events, render loop, pure logic) | `general-purpose` |
| 3 | Test coverage assessment + code quality checklist | `general-purpose` |

**When to parallelise:** Always use parallel subagents when diff is non-trivial (more than few files). For tiny diffs (1-2 files, cosmetic changes), single-pass review fine.

**How to parallelise:** Launch all independent subagents in single message using multiple `Agent` tool calls. Each subagent receives diff (via `git diff`) and its specific review scope. After all subagents return, synthesize findings into final review summary (step 6).

## 1. Run Complete Diff

Compare source branch against target branch. Analyze **actual code changes**, not just commit messages.

```bash
git diff target..source
git log target..source --oneline
```

## 2. Identify Change Types

Determine what each change represents:

- New game added
- Shared module change (e.g., GamepadManager)
- Bug fix
- Refactor
- Cleanup
- Potential breaking change (e.g., renaming a `gamepad-*` event other games depend on)

Note: missing tests, incomplete docs, inconsistencies.

## 3. Assess Code Quality & Impact

Evaluate:

- **Correctness**: Does code work as intended? Does it match the PRD mechanics for that game?
- **Readability**: Is code understandable?
- **Maintainability**: Will this be easy to modify later?
- **Architectural Alignment**: Does it follow the project's structure (`games/`, `shared/`, `tests/`) and consume gamepad input via events only?
- **Performance Implications**: Per-frame allocations? Leaking `requestAnimationFrame` loops? Uncancelled listeners?
- **Security Considerations**: Anything injected from outside? (No backend, but check `innerHTML`/XSS, external URLs, `eval`.)

Check whether tests adequately cover changed logic.

## 4. Vanilla-JS / Canvas / Gamepad-Specific Review Items

### Gamepad Input

- All gamepad access goes through `shared/gamepad-manager.js`? No direct `navigator.getGamepads()` elsewhere?
- Games consume only documented `gamepad-*` events?
- Event names match the canonical taxonomy exactly?
- Connect/disconnect handled without a fail state?
- Keyboard fallback present and not breaking gamepad input?

### Modules & Structure

- ES modules used (`type="module"`, `import`/`export`)? No global namespace pollution?
- Zero npm/framework dependencies introduced?
- Each game self-contained under `games/<kebab-name>/`?
- Visible "Back to Home" button present and working?
- Pure game logic extracted into testable functions?

### Canvas & Game Loop

- `requestAnimationFrame` used and cancelled on teardown?
- State updates separated from drawing?
- Canvas sized with `devicePixelRatio` accounted for?
- No per-frame allocations in hot paths?

### Web Audio

- `AudioContext` resumed on first user gesture?
- No external audio files unless intended?
- Errors around audio fail soft?

### Child-Friendly UX (Zero-Stress)

- No fail states, timers, health bars, or penalties?
- Large hit targets, high contrast?
- Errors never surface to the child?

## 5. Test Coverage

- Pure logic (mapping, sequences, lanes, collision, scoring) has unit tests under `tests/`?
- Tests follow the in-browser harness pattern (`describe`/`it`/`expect`)?
- Table-driven where appropriate?
- Happy path + edge cases (boundaries, clamping) covered?
- No tests depend on a live gamepad?

## 6. Provide Senior-Level Review Summary

Offer direct, actionable feedback:

- Call out risks
- Highlight strengths
- Suggest improvements
- Indicate whether changes ready to merge or need revisions

## 7. Aim for Practical, High-Value Feedback

Goal: emulate real PR review from experienced engineer — clear, specific, focused on what matters.

## 8. Write Comprehensive PR Review Report

Write comprehensive PR review report as markdown file, save in `./docs/ai_generated` directory. Report includes:

- Summary of changes
- Code quality assessment
- Performance considerations
- Security implications
- Testing coverage
- Recommendations
- Whether changes ready to merge or need revisions

---

## Vanilla JS / Canvas Code Review Checklist

### Architecture & Design

- [ ] Follows project structure (`games/`, `shared/`, `assets/`, `tests/`)
- [ ] Separation of concerns (pure logic vs. DOM/Canvas/gamepad wiring)
- [ ] Gamepad input centralized in `GamepadManager`
- [ ] Each game self-contained with a single responsibility

### Modules & Dependencies

- [ ] ES modules, no global pollution
- [ ] Zero npm/framework dependencies
- [ ] Named exports preferred

### Vanilla JS

- [ ] `const`/`let` only (no `var`)
- [ ] No top-level side effects
- [ ] Early returns to reduce nesting
- [ ] Pure functions for game logic

### Gamepad API

- [ ] No `navigator.getGamepads()` outside `GamepadManager`
- [ ] Canonical event names used exactly
- [ ] Keyboard fallback present
- [ ] Connect/disconnect handled gracefully

### Canvas & Loop

- [ ] `requestAnimationFrame` + cancellation on teardown
- [ ] State update separated from draw
- [ ] `devicePixelRatio` accounted for
- [ ] No per-frame allocations

### Error Handling

- [ ] `try/catch` around fallible browser API calls
- [ ] Errors fail soft — never shown to the child
- [ ] No uncaught exceptions in the render loop

### Security

- [ ] No `innerHTML` with untrusted data / no XSS
- [ ] No external URLs or `eval`
- [ ] No secrets (none should exist — no backend)

### Performance

- [ ] No per-frame allocations or leaks
- [ ] Listeners removed on page leave
- [ ] 60fps achievable

### Testing

- [ ] Pure logic unit-tested under `tests/`
- [ ] In-browser harness used correctly
- [ ] Edge/boundary cases covered
- [ ] No live-gamepad-dependent tests

### Code Quality

- [ ] Follows naming conventions (kebab-case files, camelCase/SCREAMING_SNAKE/PascalCase identifiers)
- [ ] Organized imports
- [ ] No magic numbers — constants defined
- [ ] Early returns to reduce nesting
