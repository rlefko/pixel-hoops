# Pixel Hoops Redesign: Auto-Sim 5-on-5 Roguelike

This document details the core gameplay loop, expanding on [game-concept.md](game-concept.md). The roster, meta-progression, difficulty, and arcade-presentation goals there still stand. Read [addictive-blueprint.md](addictive-blueprint.md) first; this is its application to basketball.

## Why the core loop works this way

The original prototype was card-driven: the player tapped one offensive card per quarter, four decisions per game, and each resolution locked the screen for 1600ms. In practice it felt unintuitive and slow, it did not feel like a 5-on-5, and it was not actually snappy. The diagnosis was that **a card per possession is the wrong altitude of decision**: too sparse to be tactical, too frequent to be snappy. That mechanic has since been removed.

The fix comes from the project's north star, **pokelike.xyz**, a Pokemon roguelike autobattler. In pokelike the combat resolves automatically and all the player's thinking goes into team-building, route choice on a branching map, and type and coverage decisions. The loop is compulsive precisely because the player operates one level up from the action.

## The pivot in one line

Stop playing a card every possession. **Build a five, set a game plan, then watch a fast, juicy auto-sim of the game.** Move all agency up to the roster, the game plan, and a branching tournament map.

## The new core loop

```
Build a Five  ->  Set a Game Plan  ->  Watch the Auto-Sim  ->  Win / Lose
      ^                                                              |
      |                                                              v
   Run Map  <-  Recruit / Train / Boost / Rest  <-  Rewards  <-  Advance
```

1. **Build a five.** Choose five players by position (PG, SG, SF, PF, C) from your roster, plus bench depth. This is what finally makes the game a real 5-on-5: five distinct players on the floor, with synergies between them.
2. **Set a game plan.** Pick pace (slow, balanced, fast) and focus (inside, outside, balanced, lockdown), and later a star to feature. These bias the simulation.
3. **Watch the auto-sim.** The engine plays the game possession by possession and emits a timeline of events. The UI replays it default-fast with count-up scores, screen shake on big plays, arcade callouts, and haptics. The floor holds a stable formation (the ball and the active player carry the possession, rather than the whole floor sliding each time), routine plays are compressed while the peaks are juiced, and the player controls pacing with an in-replay speed toggle (chill, brisk default, blitz), a condensed highlights mode, and skip. See the "Pacing the watch" principles in [addictive-blueprint.md](addictive-blueprint.md).
4. **Take the reward, advance the map.** Win to move forward on a branching run map; lose and the run ends, but you keep meta-progression.

## Agency model: pure auto-sim now, crunch moments later

For now the game is a **pure auto-sim**: the player sets the lineup and game plan, then watches. This is the snappiest answer to the "too slow" problem and matches pokelike directly.

The engine is deliberately built as **simulate, emit a timeline, then replay**. Because the timeline is data, a future **crunch-time decision** drops in without rework: at a Q4 close-game boundary the replay can pause, surface a single high-leverage choice (pound it inside, chuck threes, full-court press), and resume the simulation with that bias. This is the most dramatic moment basketball can offer, so it is designed-in from the start even though it ships later.

## Modeling 5-on-5

A full five-actor possession simulation is unnecessary and expensive. Instead each team is reduced to a **weighted aggregate stat line** with **per-play attribution**:

- A lineup's effective stats are a usage-weighted blend of its five players. Your scorers' shooting counts for more; the rim is anchored by your best athlete on defense; pace is dragged by your slowest starter and lifted by your guards.
- Each possession still **names a real player** as the scorer, chosen by a usage-weighted pick, so the play-by-play reads like a real game ("Jonez drains a three").

This keeps the simulation cheap and fully deterministic while making lineup construction genuinely matter.

### Synergies

Synergy is the reward for thoughtful roster building. The groundwork rules are intentionally small and will grow:

- **Backcourt Speed:** two or more guards (PG/SG) raise pace.
- **Twin Towers:** two or more bigs (PF/C) raise defense.
- **Positionless Basketball:** a balanced one-of-each-position five raises clutch.

Synergies are computed once at game start and surfaced in the pregame screen so the player can see what their lineup unlocks.

## The simulation, briefly

The engine uses transparent, deterministic resolution math (detailed in [stat-and-sim-system.md](stat-and-sim-system.md)). For each possession:

1. Choose an action (three, midrange, drive, dunk, layup, or a defensive event), biased by the offense's focus and stats.
2. Attribute it to an on-court player by usage weight.
3. Compute the success rate with the existing formula `yourStat / (yourStat + theirCounterStat) * 100`.
4. Apply a clutch nudge in a close fourth quarter.
5. Roll against the rate with a seeded RNG (so the game is reproducible), award points, and label the outcome.
6. Emit a timeline event with everything the UI needs to replay it with juice.

Determinism matters: the same seed always produces the same game, which makes replay, fast-forward, and testing reliable.

## The run: a sequence of fixed-shape pokelike maps

A run is a climb through several short maps (one boss each). Every map shares the
same authored **shape** (rows, nodes per row, edges); the interior node **types**
are randomized run to run, with three pins: the entry pair is **Recruit (left) +
Boost (right)**, a **Rest** always sits before the boss, and the boss ends the
map. A **passive-boost draft opens each map** (the first is the run-start "starter
pick"); clearing a map's boss opens the next map, and clearing the final boss wins
the run. Node types:

- **Game / Elite / Boss:** opponents of escalating difficulty; wins bank training points (1 / 2 / 4).
- **Recruit:** add a player to your bench (the "catch" analog).
- **Training:** spend banked training points on run-scoped skill boosts, the only path past the normal 10 cap (up to 12, the S+ tier).
- **Boost:** grab one free item and equip it (the renamed, coin-free shop; coins are spent only in the Locker Room).
- **Rest:** restore or re-seed your lineup.

The playable slice shipped a **minimal linear run** first to prove the loop. The **full fixed-shape maps, recruitment, lineup building, and a compounding home roster are now implemented** (see "The run loop and home roster" below).

## What happened to cards

Per-possession cards are **removed**: the legacy card game and its standalone quick-sim mode have been deleted from the codebase. The card *concept* may return later in a better-fitting form: **playbook cards** drafted between games (and spendable at timeouts) that bias the simulation, for example "Run and Gun," "Iso the Star," or "2-3 Zone." That would be a fresh feature built on the sim, pairing a collectible-card meta with the recruit and boost nodes, with none of the slow per-possession tapping.

## Presentation: programmatic 8-bit now, art later

The first pass achieves the 8-bit feel **programmatically**: a bundled pixel font, a constrained retro color palette, a scanline overlay, snapped (stepped) motion, and a shape-based pixel court and scoreboard. Hand-drawn sprite sheets, a crowd, multi-frame dunk animations, and chiptune audio are a dedicated art and audio pass later. See [roadmap.md](roadmap.md) for sequencing.

## How this scores on the blueprint

- **Synergy-first:** lineup and game plan are the game; combat is automatic.
- **Escalating stakes and power fantasy:** opponents scale per round while the roster compounds.
- **Snappy layered juice:** count-up, shake, flash, callout, and haptics on every beat, in well under half a second.
- **Short, interruptible sessions:** games auto-sim in seconds; runs are short and resume cleanly.
- **Variable-ratio rewards:** recruit, gear, and synergy payoffs vary run to run.

Run the `addictive-blueprint` skill against any feature in this redesign to confirm it earns its place.

## The run loop and home roster (implemented)

The run is one screen (`RunScreen`) driven by `useRun`, a thin wrapper over a pure, headless-tested reducer (`src/game/run-machine.ts`). The reducer holds a `RunPhase` discriminated union; choosing a node dispatches to the matching sub-view (map, pregame, game, recruit, training, rest, boost, lineup builder, summary). Keeping the run in one screen means run state survives every step (no navigation can drop it), and keeping the reducer pure means the whole state machine is unit-tested without a device.

**Compounding home roster.** A persistent home roster (`src/game/home-roster.ts`, owned by `HomeRosterContext`, saved through a Platform-split storage wrapper: AsyncStorage on native, guarded `localStorage` on web) is the "permadeath per run, permanent growth" hook. A run starts from a copy of the home roster; recruits join the bench and training boosts stats during the run; when the run ends (win or loss) those gains are merged back home and saved. So no run is wasted: each one fields a stronger team. The owned roster is capped so it cannot bloat, and the player builds their starting five from it before each game.
