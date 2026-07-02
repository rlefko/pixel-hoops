# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pixel Hoops is an 8-bit basketball roguelike built with React Native (Expo v54) and TypeScript. You build a roster of pixel players, set your lineup and game plan, then watch a fast auto-sim of each game play out -- strategy over reflexes or timing. Full concept details in [docs/game-concept.md](docs/game-concept.md). Target platforms: iOS and Android.

## Git Workflow

- All changes go through pull requests into `main`
- PR titles: title case, emoji prefix (e.g., `🎮 Add free throw scoring logic`)
- Commits: small and logically separated, each one line with no ending punctuation and an emoji prefix (e.g., `🐛 Fix ball collision on rim bounce`)

## Development Commands

Run from the repo root.

| Task                     | Command                            |
| ------------------------ | ---------------------------------- |
| Install dependencies     | `npm install`                      |
| Start development server | `npx expo start`                   |
| Build for iOS            | `npx expo start --ios`             |
| Build for Android        | `npx expo start --android`         |
| Lint (oxlint)            | `npx oxlint`                       |
| Typecheck (tsgo)         | `npx tsgo --project tsconfig.json` |

## Code Review Before Commits

Before committing any change:

1. Run a **reuse** subagent: check if existing utilities, hooks, or components can be reused rather than rewritten.
2. Run a **simplification** subagent: ensure the code is not needlessly complex.
3. Run a **readability** subagent: confirm the code is clear and consistent with surrounding patterns.
4. Run a **performance** subagent: check the change against the performance conventions in `docs/performance-conventions.md` (the `perf-review` skill runs this check end to end).
5. Run a **feel** subagent when the change touches anything the player sees, hears, or feels: check it against the feel conventions in `docs/feel-conventions.md` (the `feel-review` skill runs this check end to end).
6. Apply any findings from the above agents before committing.

## Documentation

- `README.md`: project overview, setup instructions, quick start
- `docs/`: detailed design docs, architecture notes, API references
- Use American English throughout
- Avoid em dashes (`—`); use commas, periods, or colons instead

## CI Checklist (GitHub Actions)

Every PR must pass:

1. **oxlint** — static analysis
2. **tsgo check** — type checking
3. **build** — successful production build

CI config lives in `.github/workflows/` and triggers on pull requests to `main`.
