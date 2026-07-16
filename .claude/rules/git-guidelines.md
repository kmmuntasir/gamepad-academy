---
trigger: model_decision
description: Ruleset that MUST be followed when executing ANY git command
---

# Git Guidelines

## Sacred Rule:
- NEVER run `git` command without user's explicit approval.

## Merge Policy:
- **Rebase and Merge ONLY** — Repo uses "Rebase and Merge" policy
- **No merge commits** — Never `git merge`
- **No squash merging** — Never `--squash` flag
- **No local branch merging** — All merging via PR rebase on GitHub

## Project Slug:
- PROJECTSLUG: short project abbreviation used as a prefix for branches and commits
- This project: **GAC** (Gamepad Academy)

## Branch Naming:
- Format: `type/PROJECTSLUG-TICKET_NUMBER-hyphenated-short-description`
- Example: `feature/GAC-123-add-color-match-feeder`, `bugfix/GAC-234-fix-gamepad-disconnect`
- Exception: Release branches: `release/1.2.3` — version only, no ticket or description
- Imperative, hyphenated description
- Never assume ticket number. If missing, omit (e.g., `feature/GAC-add-bumper-runner`)
- Trello projects: use Card Number instead of Ticket number

## Commit Messages:
- ALWAYS single-line commit message
- Format: `PROJECTSLUG-TICKET_NUMBER: message`
- Example: `GAC-123: Add color match feeder game`
- Extract ticket number from branch name
- If ticket unidentifiable, omit prefix — message only (e.g., `Add keyboard fallback to GamepadManager`)

## .gitignore
Ensure these entries exist. Never commit build artifacts or local junk:
- `node_modules/` (only if a dev toolchain is ever introduced)
- `.env`
- `dist/`
- `build/`
- `*.log`
- `.DS_Store`
- `Thumbs.db`
