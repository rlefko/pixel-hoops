# Pixel Hoops Roadmap

This roadmap sequences the pivot to the auto-sim 5-on-5 roguelike described in [gameplay-redesign.md](gameplay-redesign.md), measured against [addictive-blueprint.md](addictive-blueprint.md).

The groundwork ships as three stacked pull requests. Everything after PR3 is "Phase 2 and beyond" and is not yet committed to a specific PR boundary.

## PR1: Blueprint, docs, and sim scaffolding

The foundation in writing and contracts. No runtime behavior changes, so it is the safest to land first.

- Design docs: this roadmap, the addictive blueprint, and the gameplay redesign, plus a pivot banner on the original concept doc.
- The `addictive-blueprint` Claude skill that scores a feature against the blueprint checklist.
- Pure scaffolding: a seedable RNG (`src/game/rng.ts`) and the type contracts the engine and UI will share (`src/types/roster.ts`, `team.ts`, `tactics.ts`, `sim.ts`, `run-map.ts`).

## PR2: Game-feel foundation, auto-sim engine, and juice retrofit

The load-bearing logic and the feel system. The existing card game is retrofitted so it feels snappier immediately, even before the new screen exists.

- **Auto-sim engine** (pure, deterministic, tested): synergy and lineup math, `simulateGame`, the run-map generator, and seeded team generation. Reuses the existing resolution, scoring, and AI logic. Threads the RNG through the sim path only; the legacy card path keeps its own randomness.
- **Feel system:** `src/feel` (snappy timing tokens, a haptics wrapper, screen-shake, pop, count-up, and flash hooks, and a settings context for reduced motion), `src/theme` (a constrained palette, pixel-grid metrics, and the pixel font), and `src/components/fx` (the visual building blocks).
- **8-bit foundation:** a bundled Press Start 2P font loaded alongside the existing one, plus the palette and scanline overlay.
- **Juice retrofit into the card game:** a count-up, popping scoreboard; screen shake and haptics on big plays; and removal of the 1600ms resolution lock.
- **Tests:** a Vitest setup covering RNG reproducibility and sim determinism and score sanity.

## PR3: Playable auto-sim 5-on-5 vertical slice

The new loop, playable end to end on its own route. The card game stays reachable and unchanged.

- A sim-game hook (pregame, simulate, replay, final), the play-by-play replay component, a programmatic pixel court, and pregame lineup and game-plan screens.
- A new menu entry into the sim mode.
- A minimal linear run: a short sequence of escalating opponents with permadeath and a one-tap restart, demonstrating the roguelike loop without the full branching-map UI.

## Phase 2 and beyond

Sequenced roughly by player impact.

1. **Branching run map UI.** Surface the layered map from the generator: choose a path, visit nodes, see the bracket.
2. **Recruitment.** Defeated opponents can join the bench at recruit nodes; persist the roster across runs.
3. **Meta-progression and storage.** Coins, reputation, and training XP earned and spent between runs, saved locally so progress survives app restarts.
4. **Playbook cards.** Reintroduce cards as a between-games draft that biases the sim, replacing the retired per-possession cards. Pairs with shop and recruit nodes.
5. **Equipment.** Gear that modifies a player's contribution to the lineup's effective stats.
6. **Crunch-time decisions.** Pause the replay at a close Q4 boundary for one high-leverage tactical call, then resume. The engine already supports this hook.
7. **Audio and SFX.** Chiptune per arena, downsampled arcade callouts, and event sound effects synced to the existing haptics.
8. **Sprite art and particles.** Hand-drawn players and court, a reactive crowd, multi-frame dunk and block animations, and particle bursts.
9. **Deeper synergies and archetypes.** Expand the synergy rules and signature abilities described in the concept doc.
10. **Retire the legacy card mode** once the sim mode is the default and proven.

## Working agreement

- Every feature is checked against [addictive-blueprint.md](addictive-blueprint.md), ideally via the `addictive-blueprint` skill, before it is built.
- Pure game logic is unit-tested; presentation is verified by running the app.
- Changes stay additive where possible: the engine reuses existing math, and new systems sit beside the old until the new path is proven.
