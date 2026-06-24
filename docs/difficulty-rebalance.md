# Difficulty Rebalance

This is the reference for how Pixel Hoops keeps difficulty fair-but-punishing across runs. It expands the "Difficulty Design" section of [game-concept.md](game-concept.md) and realizes the blueprint's pillar 2 ("can I grow faster than the bracket does?", see [addictive-blueprint.md](addictive-blueprint.md)).

## The problem it fixes

The game used to be impossibly hard on run 1 and trivially easy after one or two runs. Two causes:

1. **Difficulty reset every map.** Opponent strength was keyed only to the map index, so every regular game in a map was the same, and each new map dropped back to barely above the last while the player's power had jumped.
2. **Meta-progression with no ceiling.** Coins bought permanent +1 stats forever and kept recruits carried inflated stats, so power outran a merely linear opponent curve within two runs.

A separate sim bug let star players log all 48 minutes while weaker bench players got none.

## The continuous difficulty curve

`src/game/difficulty.ts` computes a float **difficulty level** from a node's absolute position in the run, blending map progress with an intra-map ramp:

- The level rises smoothly node to node across all 7 maps, with **no reset** at map boundaries: the first game of map N+1 sits just above map N's late games.
- A **boss** is its map's local peak (a bump on top of its ramp).
- It opens near a rookie roster's strength (~5 on the 3-10 scale) and reaches the cap (~10) at the final boss.

`src/game/stat-scaling.ts` turns that float into a stat band (`getStatRangeForLevel`), replacing the old eight-bucket integer-round table. Opponent and recruit stats scale on this band. The coarse integer `node.round` is kept only for the economy and rarity gates (coins, legend chance, item drops, boost stock), which deliberately did not need the continuous treatment.

## In-run "EV" upgrades (keeping pace)

Training points earned from wins are spent at Training nodes on run-scoped per-stat `+1`s (`trainingDelta`), the Pokelike effort-value analog. These reset every run, so each run is a fresh climb against the rising curve. This is the primary lever for staying ahead of the bracket within a run.

## Bounded meta-progression (no snowball)

Three bounds keep later runs hard:

### Salary-cap budget (`src/game/budget.ts`)

Each player has a **cost** that is a convex function of OVR (roughly: OVR 5 ~ 1, 7 ~ 5, 8 ~ 9, 10 ~ 22). Before each run you pick your starting five under a **cap** (run-1 cap is 40); the bench is free. Five maxed studs (~110) never fit, and five strong recruits do not either, so you must choose which upgraded players to field and keep cheaper role players around them. The cap grows slowly with the earned League tier. The cap is enforced both on the pre-run pick and on in-run lineup changes, with a grace floor so a pool of nothing-but-expensive players never soft-locks the picker.

### Capped permanent upgrades (`src/game/upgrades.ts`)

Coins still buy permanent `+1`s in the Locker Room, but the per-stat purchase cap starts at 5 and only rises (toward 8) by climbing the League ladder. The rating ceiling of 10 still bounds the absolute value. So permanent power raises the floor without ever letting a fielded five outrun the curve; the salary cap is the main limiter.

### The League Tier ladder (`src/game/ascension.ts`)

A persistent, escalating difficulty (Slay the Spire "Ascension" / Hades "Heat"). Clearing a run **at your top unlocked tier** unlocks (and auto-selects) the next one, so winning makes the next run harder. You can replay any unlocked tier from the home screen. Each tier adds one legible, known-mechanic modifier on top of the lower tiers:

| Tier | Modifier |
| ---- | -------- |
| 1 | Opponent stat floor +0.4 level |
| 2 | Elites appear from the first map |
| 3 | Boost draft offers 2 picks, not 3 |
| 4 | Bosses field a second franchise legend |
| 5 | Opponent stat floor +0.8 level |
| 6 | Injuries strike 1.5x as often and sideline up to 3 games |
| 7 | Win coins x0.85 |
| 8 | More elites per map |
| 9 | Opponent stat floor +1.2 level |
| 10 | Opponent stat floor +1.6 level, and no rest before the finale |

The `tier` is stored on the home roster as `leagueTier` (highest unlocked) and `selectedTier` (chosen next). Map generation stays tier-agnostic; every effect is applied at consumption time in the run machine, so a tier-0 run is byte-identical to the pre-ladder behavior and determinism holds.

## The rotation fix (`src/game/simulation.ts`)

The old `substitute` only swapped in a fresh player if they were *better* than the tired starter, and fatigue capped degradation at ~20%, so any bench player more than ~20% worse never entered. The fix adds three layered rules:

1. A **hard rest floor**: below ~28 energy a starter is always pulled for the best rested body, even a worse one.
2. A **good-enough soft sub**: above the floor, a fresh bench player who is at least ~90% as effective spells a tired starter.
3. **Blowout rest**: in a late-game blowout the stars yield to the bench (garbage time).

Drain and recovery were retuned so a normal starter dips into the sub zone a couple of times a game. Result: stars play roughly 30-36 minutes, the bench earns real minutes, blowouts clear the bench, and 48-minute games are rare. High stamina still earns more minutes, and a deep bench still outlasts a thin one. The per-side minutes invariant and full determinism are preserved.
