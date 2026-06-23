# Pixel Hoops Roadmap

This roadmap sequences the pivot to the auto-sim 5-on-5 roguelike described in [gameplay-redesign.md](gameplay-redesign.md), measured against [addictive-blueprint.md](addictive-blueprint.md).

The groundwork ships as three stacked pull requests. Everything after PR3 is "Phase 2 and beyond" and is not yet committed to a specific PR boundary.

## PR1: Blueprint, docs, and sim scaffolding

The foundation in writing and contracts. No runtime behavior changes, so it is the safest to land first.

- Design docs: this roadmap, the addictive blueprint, and the gameplay redesign, plus a pivot banner on the original concept doc.
- The `addictive-blueprint` Claude skill that scores a feature against the blueprint checklist.
- Pure scaffolding: a seedable RNG (`src/game/rng.ts`) and the type contracts the engine and UI will share (`src/types/roster.ts`, `team.ts`, `tactics.ts`, `sim.ts`, `run-map.ts`).

## PR2: Game-feel foundation, auto-sim engine, and juice retrofit

The load-bearing logic and the feel system. The card game (since removed) was retrofitted at this stage so it felt snappier immediately, even before the new screen existed.

- **Auto-sim engine** (pure, deterministic, tested): synergy and lineup math, `simulateGame`, the run-map generator, and seeded team generation. Has its own deterministic resolution (`sim-resolution.ts`) and risk-posture AI (`ai.ts`), threaded with a seeded RNG so every game is reproducible.
- **Feel system:** `src/feel` (snappy timing tokens, a haptics wrapper, screen-shake, pop, count-up, and flash hooks, and a settings context for reduced motion), `src/theme` (a constrained palette, pixel-grid metrics, and the pixel font), and `src/components/fx` (the visual building blocks).
- **8-bit foundation:** a bundled Press Start 2P font loaded alongside the existing one, plus the palette and scanline overlay.
- **Juice retrofit into the card game:** a count-up, popping scoreboard; screen shake and haptics on big plays; and removal of the 1600ms resolution lock.
- **Tests:** a Vitest setup covering RNG reproducibility and sim determinism and score sanity.

## PR3: Playable auto-sim 5-on-5 vertical slice

The new loop, playable end to end on its own route. At this stage the card game stayed reachable and unchanged. (Both legacy modes, the card game and the quick sim, have since been removed, completing the retirement item in Phase 3 below.)

- A sim-game hook (pregame, simulate, replay, final), the play-by-play replay component, a programmatic pixel court, and pregame lineup and game-plan screens.
- A new menu entry into the sim mode.
- A minimal linear run: a short sequence of escalating opponents with permadeath and a one-tap restart, demonstrating the roguelike loop without the full branching-map UI.

## PR4: The roguelike meta-loop (branching run + recruitment + compounding roster)

Turns the linear slice into the desired roguelike loop, on a single `RunScreen` driven by `useRun` (a pure, headless-tested reducer in `src/game/run-machine.ts`).

- **Branching run map.** Wires the previously unused `generateRunMap`/`getReachableNodes`/`traverseTo` into a navigable map (`RunMapView`): choose your path through layers of nodes to the boss.
- **Node types resolve.** game/elite/boss play a sim game; recruit offers depth-scaled candidates; training spends banked training points on run-scoped skill boosts; rest rebuilds the lineup; boost hands out one free item.
- **Recruitment.** `generateRecruitOffers` presents candidates at recruit nodes; pick one for your bench.
- **Lineup builder.** Choose your starting five from the whole roster (any five, so stacking unlocks the `Specialists` synergy).
- **Compounding home roster.** A persistent home roster (`src/game/home-roster.ts` + `HomeRosterContext` + a Platform-split AsyncStorage/localStorage wrapper) banks recruits and training on every run end, win or loss.

## PR5: Visuals and NBA data foundation

Makes the game feel right: readable navigation, dark-only presentation, pixel
players on the court, and real teams. Detailed in
[visual-and-data.md](visual-and-data.md).

- **Dark-only presentation.** Pin a palette-matched dark navigation theme and
  `Stack` content style so the light navigator surface never flashes white.
- **Run-map branching.** Fix the generator so every node forks (no forced single
  route) and draw real per-edge connectors with a "you are here" marker and
  auto-scroll in `RunMapView`.
- **Procedural pixel players.** `PixelPlayer` sprites and a `CourtView` that
  places ten players in formation and spotlights the active scorer, wired into
  `PlayByPlayFeed` and `LineupBoard` (no image assets).
- **NBA data foundation.** An offline-baked, key-free dataset (`src/data/*.json`),
  a shared ratings->stats mapping (`src/game/nba-map.ts`), a mixed real/fake
  player pool (`src/game/player-pool.ts`), and a dev fetch script
  (`scripts/fetch-nba.ts`) that reads the API key from the environment.

## PR6: Reward systems and legendary players

The dopamine pass: makes getting a real player feel like a jackpot and gives
coins a permanent purpose. Built on a small declarative effect/modifier spine
(`src/game/effects.ts`, `apply-effects.ts`) that funnels per-player and team
bonuses through the existing `buildTeam` -> `computeTeamStats` path, so the sim
stays deterministic and a no-effect game resolves identically to before.

- **Legendary real players.** The 24 baked NBA greats are re-rated in the full
  ten-stat model, each with a signature ability (`src/game/abilities.ts`) and a
  gold-glow nameplate. They appear on opponents only on their real franchise;
  bosses can field a guest all-time legend in the later rounds. You can recruit
  one mid-run (rare, gated, once per run with soft pity) but it is on loan and
  never kept, with a staged jackpot reveal.
- **Coin economy + Locker Room.** Coins scale with round and dominance, are kept
  on a loss, and buy permanent +1 stat upgrades between runs with a rising
  per-tier cost (`src/game/upgrades.ts`, the `LockerRoomScreen`).
- **Items.** Run-scoped equippable gear (max one per player), rarity-banded with
  a boss-relic tier that trades a downside for a big upside, grabbed free at boost
  nodes and from elite/boss drops (`src/game/items.ts`).
- **Passive boosts.** A 1-of-3 draft before each map, max five equipped with a
  forced lossy drop when full, no duplicates, family-gated capstones
  (`src/game/boosts.ts`).

## Phase 3 and beyond

Sequenced roughly by player impact.

1. **Playbook cards.** Reintroduce cards as a between-games draft that biases the sim, a fresh feature in place of the removed per-possession cards. Pairs with boost and recruit nodes.
2. **Equipment + economy.** _Done (PR6):_ run-scoped items, a coin economy, and permanent stat upgrades shipped; the item shop has since become the coin-free Boost node (free item grab), with coins spent only in the Locker Room. Still ahead: permanent (home-roster) gear and a coin-fed gacha for permanently-ownable legendaries.
3. **Crunch-time decisions.** Pause the replay at a close Q4 boundary for one high-leverage tactical call, then resume. The engine already supports this hook.
4. **Defeated-opponent recruiting + resume-in-progress-run.** Recruit a player from a beaten team; save/resume an interrupted run.
5. **Audio and SFX.** Chiptune per arena, downsampled arcade callouts, and event sound effects synced to the existing haptics.
6. **Sprite art and particles.** Particle bursts, ball flight, rim/net ripple, the pokelike map redesign, team secondary colors, and opponent-themed courts shipped in PR6 (see visual-and-data.md). Still ahead: hand-drawn players and court (beyond the procedural sprites), a reactive crowd, and multi-frame dunk and block animations.
7. **Deeper synergies and archetypes.** Expand the synergy rules and signature abilities described in the concept doc. _In progress (PR6):_ legendary signature abilities landed; more synergy rules and non-legendary abilities are still ahead.
8. **Retire the legacy modes** (card game, quick sim). _Done:_ both have been removed now that the run mode is the default, leaving the run as the single game mode.

## Working agreement

- Every feature is checked against [addictive-blueprint.md](addictive-blueprint.md), ideally via the `addictive-blueprint` skill, before it is built.
- Pure game logic is unit-tested; presentation is verified by running the app.
- Changes stay additive where possible: new systems sat beside the old until the new path was proven, after which the legacy modes were removed.
