# Stat and Simulation System

This document describes the player rating model and the auto-sim engine that
resolves a game. It supersedes the four-stat description in
[game-concept.md](game-concept.md) for the auto-sim path. The goal is a sim that
plays like real basketball while staying arcade-simple: deep under the hood, a
single OVR and three composites on the surface.

## The rating model

Every player has fourteen ratings on a granular surface scale: ten skill and
condition ratings, plus four intrinsic play-style ratings (see the table below). The normal band, where
procedurally generated and pool players live, runs 6 (worst) to 20 (elite) with a
generation base of 10. Curated all-time greats (legends) push above the normal cap
to about 24, and an absolute hard cap of 30 is reachable only through permanent
upgrades plus run-scoped training and the toughest end-of-run bosses. The wider
band is a pure 2x of the old 3-10 model, so relative balance is unchanged; it just
buys more granular, specialized skillsets. They live on `PlayerStats` in
`src/types/player.ts`.

Run-scoped rewards (equipped items, gacha abilities, and the legend self-aura) bake
into a player's effective line before the sim and **soft-cap into the elite band**:
full value through the normal cap of 20, then diminishing returns up to 24
(`applyStatDelta` in `src/game/effects.ts`). So a big reward still lands on an
already-strong stat, sharpening a specialist, instead of leaking into a hard wall.
Run-scoped **training** is the only channel that reaches the 30 hard cap. Reward
magnitudes are deliberately **textured rather than uniform**: common boosts and items
span +1 to +3, rares trade a small off-stat downside for a sharper upside (so a maxed
roster reads spiky, not uniformly maxed), and a small chance bumps a drop one rarity
band higher (the "hot" jackpot). The card stat bar fills to the normal cap of 20, with
a gold tip past it for trained/over-cap stats, so maxing a stat for its tier reads as
a full, satisfying bar.

| Group | Rating | Drives |
| --- | --- | --- |
| Offense | `inside` | rim finishing: layups, dunks, post |
| Offense | `outside` | jump shooting: midrange and three |
| Offense | `playmaking` | handle and passing: drives, assists, ball security |
| Defense | `perimeterD` | contest jumpers and drives |
| Defense | `interiorD` | rim protection: contest layups and dunks |
| Physical | `athleticism` | speed, quickness, vertical: pace, transition, finishing burst |
| Mental | `iq` | shot selection quality and turnover avoidance |
| Mental | `clutch` | a small crunch-time nudge |
| Condition | `stamina` | fatigue pool size and drain rate |
| Condition | `durability` | resistance to injury from load |
| Play style | `blocking` | who swats shots (block box-score attribution) |
| Play style | `stealing` | who jumps passing lanes (steal box-score attribution) |
| Play style | `strength` | post leverage, finishing through contact, and-one rate |
| Play style | `rebounding` | offensive/defensive board rate and attribution |

### Play-style ratings (intrinsic, behavioral only)

The four play-style ratings join `stamina` and `durability` as the **non-upgradeable**
group: they are not trained, upgraded, round-scaled, or anchored to a class. A
player is born with them (mapped from real 2K data) and you acquire them only by
**recruiting** the player who has them. They do **not** feed `OFF`/`DEF`/`OVR` or
the class ladder, so balance and the surface composites are unchanged. Instead
they define how a player behaves in the box score: `blocking` decides who blocks,
`stealing` who steals, `rebounding` who cleans the glass (and the offensive vs
defensive split), and `strength` is a secondary nudge to finishing through contact
and the and-one rate. This is the "power from who you draft" lever: a rim
protector changes the sim, not just a rating number.

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
   `a / (a + b)` of the team's `blocking` (vs the finisher, who resists with
   `strength`) or `stealing` (vs the ball-handler, reduced by IQ). The *rate*
   uses the team aggregate; the *recipient* of the block/steal/rebound/assist is
   then chosen by a powered weighted pick `P(player) ~ rating^power` over the five
   (BBGM/ZenGM model). The power exponent concentrates each event on the
   specialist: with block power 8 a rim protector hoards the swats and a
   pass-first guard essentially never blocks, while quick guards lead steals and
   bigs lead rebounds. Rebounds split offensive vs defensive by team `rebounding`
   (tuned so ~27% of misses are offensive boards).

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
blocks, minutes, energy, load). Each event is credited to the right player by a
powered weighted pick over the on-court five (`P ~ rating^power`): blocks off
`blocking`, steals off `stealing`, rebounds off `rebounding` (offensive boards
more concentrated than defensive), assists off `playmaking`. The high power is
what makes the box score read true to type, so a center leads blocks/rebounds and
a pass-first guard does not. Between games, `src/game/run-machine.ts` rolls
injuries from accumulated load and `durability` (more load and lower durability
mean more risk). An injured player sits one or two games; rest nodes heal, bench
depth covers, and the roster always fields a healthy five when it can, so a run
is never bricked.

### Scouting report

The pregame surfaces each team's identity (`src/game/team-identity.ts`): a few
character tags read off the five's stats and auto-derived pace/focus, a one-line
blurb, headline strengths/weaknesses, and concrete numeric tendencies (projected
steals/blocks/rebounds, three-point lean, top scorer). It is shown for both the
opponent and the player's own team, so the matchup is a plannable decision (set a
counter lineup) while the watched sim keeps the outcome live.

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
  learning, with basketball IQ as the central realism lever. Its `pickPlayer`
  model also informs our box-score attribution: weight each player by
  `rating^power`, where a high power concentrates an event on the specialist
  (block ~8, steal ~4, offensive rebound ~5, defensive rebound ~3, assist ~10),
  so per-position rates fall out without special-casing.
- **Slay the Spire intent**: a strong scout shows the threat in concrete numbers
  and a legible identity so a loss reads as a strategy miss, not bad luck, while
  the resolution stays uncertain. The pregame scouting report follows this:
  transparent on the opponent's identity, live on the watched sim's outcome.
- **NBA 2K** separates tendencies (what a player chooses to do) from attributes
  (how well they do it), and splits stamina from fatigue rate. We model IQ-driven
  shot selection distinct from shooting skill, and energy that drains and recovers.
- **Analytics and sports science**: defense splits into perimeter and interior;
  pace controls upset variance; fatigue degrades contested finishing more than
  spot-up threes; clutch is mostly noise rather than a durable skill (so its
  effect is kept small); injury risk rises with accumulated load and falls with
  durability (never the naive "more minutes is safer" correlation, which is a
  selection-bias artifact).
