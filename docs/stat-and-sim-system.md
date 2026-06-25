# Stat and Simulation System

This document describes the player rating model and the auto-sim engine that
resolves a game. It supersedes the four-stat description in
[game-concept.md](game-concept.md) for the auto-sim path. The goal is a sim that
plays like real basketball while staying arcade-simple: deep under the hood, a
single OVR and three composites on the surface.

## The ten-rating model

Every player has ten ratings on a granular surface scale. The normal band, where
procedurally generated and pool players live, runs 6 (worst) to 20 (elite) with a
generation base of 10. Curated all-time greats (legends) push above the normal cap
to about 24, and an absolute hard cap of 30 is reachable only through permanent
upgrades plus run-scoped training and the toughest end-of-run bosses. The wider
band is a pure 2x of the old 3-10 model, so relative balance is unchanged; it just
buys more granular, specialized skillsets. They live on `PlayerStats` in
`src/types/player.ts`.

| Group | Rating | Drives |
| --- | --- | --- |
| Offense | `inside` | rim finishing: layups, dunks, post |
| Offense | `outside` | jump shooting: midrange and three |
| Offense | `playmaking` | handle and passing: drives, assists, ball security |
| Defense | `perimeterD` | contest jumpers and drives, steals |
| Defense | `interiorD` | rim protection, blocks, defensive rebounding |
| Physical | `athleticism` | speed, quickness, vertical: pace, transition, finishing burst |
| Mental | `iq` | shot selection quality and turnover avoidance |
| Mental | `clutch` | a small crunch-time nudge |
| Condition | `stamina` | fatigue pool size and drain rate |
| Condition | `durability` | resistance to injury from load |

### Surface composites

`src/game/ratings.ts` derives the values the UI shows, BBGM-style weighted
averages on the same surface scale (normal 6-20, elite up to 24, hard cap 30):

- `OFF` = weighted average of `outside`, `inside`, `playmaking`, `iq`, `athleticism`, `clutch`.
- `DEF` = weighted average of `perimeterD`, `interiorD`, `athleticism`, `iq`.
- `ATH` = `athleticism` (a legible third chip).
- `OVR` = a position-weighted blend of `OFF`/`DEF` plus a small per-position skill lean (a center leans interior, a point guard leans playmaking).

Player cards show OVR plus OFF/DEF/ATH by default; the full ten ratings are one
tap away (progressive disclosure).

## How a possession resolves

The engine (`src/game/simulation.ts`) is pure and seeded: the same seed yields
the identical timeline, box score, substitutions, and injuries. Each possession:

1. Substitution check (see Fatigue below).
2. Pick an action, weighted by the team's auto-derived tendency (its pace and
   focus, read off the roster shape) and reshaped by team IQ toward the highest
   expected-value looks (rim and threes), away from contested midrange.
3. Pick the scorer by usage weight.
4. Resolve the shot with `makeProbability` in `src/game/sim-resolution.ts`:
   an affine function of the matchup, clamped, then scaled by fatigue:

   ```
   p = clamp(base + SLOPE * q(offRating) - DEF_WEIGHT * q(defRating) + iqBonus + clutchDelta, 0.03, 0.97) * fatigueMult
   ```

   where `q(r) = (r - 6) / 14` normalizes a rating across the normal band, `base` is per action
   (`three .32`, `midrange .40`, `drive .47`, `layup .55`, `dunk .62`), and the
   offensive/defensive ratings are chosen per action (three/midrange use
   `outside` vs `perimeterD`; layup/dunk use `inside` vs `interiorD`; etc.).
5. On a miss, the flavor (block, steal, turnover, plain miss) is a ratio contest
   `a / (a + b)` of the relevant defensive rating versus the finisher or
   ball-handler, with IQ reducing turnovers.

### Per-game form

Each team draws a hot or cold shooting offset once per game
(`FORM_RANGE = 3.2` rating points on the wider scale). Independent per-shot luck washes out over a
full game, so this correlated factor is what keeps upsets alive: a cold favorite
can drop one to a hot underdog.

### Fatigue and rotation

Players carry an energy pool (0-100) that drains each possession they are on the
floor (faster with low `stamina`, the scorer hardest) and recovers on the bench.
Tired shooting suffers a multiplicative penalty, with threes more resilient than
contested finishes until energy is severely low. A deterministic rotation pulls
a tired starter for the best rested bench player when the fresh player is more
valuable right now (value weighted by the real fatigue multiplier, so a tired
star is never benched for a fresh scrub). The payoff: deeper benches keep fresher
legs late and win a modest but real majority of close, even games.

### Clutch

In the last frame of a close game the scorer's own `clutch` gives a small make
nudge, paired with a symmetric random term, so clutch is flavor rather than a
deterministic edge.

### Box score and injuries

The sim accumulates a per-player box line (points, rebounds, assists, steals,
blocks, minutes, energy, load). Between games, `src/game/run-machine.ts` rolls
injuries from accumulated load and `durability` (more load and lower durability
mean more risk). An injured player sits one or two games; rest nodes heal, bench
depth covers, and the roster always fields a healthy five when it can, so a run
is never bricked.

## Tuning

All knobs live in clearly labeled tunable blocks at the top of
`src/game/simulation.ts` (pacing, form, IQ pull, fatigue, rotation, clutch) and
`src/game/sim-resolution.ts` (make-probability slope, defense weight, shot
profiles, contest rates), plus injury constants in `run-machine.ts`. Score
realism is validated by the engine tests in `src/game/__tests__/engine.test.ts`.

## Research basis

The model draws on how accurate sims and prediction systems work:

- **Basketball GM** (open source) shows a realistic basketball sim needs only a
  handful of ratings and plain arithmetic (affine make probability, ratio
  contests, a multiplicative fatigue term), no logistic curves or machine
  learning, with basketball IQ as the central realism lever.
- **NBA 2K** separates tendencies (what a player chooses to do) from attributes
  (how well they do it), and splits stamina from fatigue rate. We model IQ-driven
  shot selection distinct from shooting skill, and energy that drains and recovers.
- **Analytics and sports science**: defense splits into perimeter and interior;
  pace controls upset variance; fatigue degrades contested finishing more than
  spot-up threes; clutch is mostly noise rather than a durable skill (so its
  effect is kept small); injury risk rises with accumulated load and falls with
  durability (never the naive "more minutes is safer" correlation, which is a
  selection-bias artifact).
