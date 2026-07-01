# Difficulty Rebalance

This is the reference for how Pixel Hoops keeps difficulty fair-but-punishing across runs. It expands the "Difficulty Design" section of [game-concept.md](game-concept.md) and realizes the blueprint's pillar 2 ("can I grow faster than the bracket does?", see [addictive-blueprint.md](addictive-blueprint.md)).

## The problem it fixes

The game used to be impossibly hard on run 1 and trivially easy after one or two runs. Meta power (an ever-growing roster plus permanent stat upgrades) outran a merely linear opponent curve within two runs, and the only difficulty knob was a single hidden ladder.

## The model: a player-class ladder

Every player belongs to a **class** on a single ladder, derived from their in-game OVR on the surface scale (`classForOvr` in `src/game/ratings.ts`, scaling math in `src/game/classes.ts`). The scale is the granular band that runs 6-20 for normal players, up to 24 for curated greats, and a hard cap of 30 reachable only through training and upgrades:

| Class | OVR band | Class level | Source |
| ----- | -------- | ----------- | ------ |
| D | below 10 | 8 | procedural streetball rookies (the only auto-generated class) |
| C | 10-11 | 10 | real NBA players (2K overall 67-74) |
| B | 12-15 | 13 | real NBA players (75-81) |
| A | 16-17 | 16 | real NBA players (82-88) |
| S | 18-21 | 19 | real NBA players (89-99) |
| S+ | 22-25 | 22 | hand-curated all-time legends |
| S++ | 26+ | 26 | the emergent apex: reached only by deep run-scoped training or the toughest end-of-run bosses |

The "class level" (`CLASS_LEVEL` in `src/game/classes.ts`) is the representative OVR each class scales opponents and recruits toward. Real players are baked offline from the NBA 2K API into `src/data/nba-pool.json`, each carrying an `originalClass` and stats anchored into that class's band (`anchorStatsToClass` preserves a player's shape while setting its magnitude). A player's class for the draft is always their **original** class (before any Locker Room upgrade, ability, or training); the card shows `original -> current` with an arrow.

## The run configuration: 4 difficulties x 5 ladders

A run is chosen as a **(difficulty, ladder class)** pair on the home screen (`src/game/difficulty-mode.ts`). The two axes are orthogonal: the **ladder** gates on player *acquisition* (you need better acquired players for higher rungs), and the **difficulty** gates on power *investment* (upgrades and abilities).

- **Difficulty** (easy / medium / hard / insane) shapes the **opponent ramp** (its endpoints, see below), grants a pool of **timeouts** (forgiven losses: 2 / 1 / 0 / 0), sets the **draft point budget** (8 / 5 / 2 / 0), and folds in the escalation modifiers: early elites, leaner boost drafts, glass-bones injuries, and (insane) no pre-boss rest. Harder tiers **reward more coins per win** (coin multiplier 1.0 / 1.1 / 1.25 / 1.5) so the grind they demand pays back in faster economy growth. All four are selectable from the start.
- **Ladder class** (C / B / A / S / S+) sets the opponent class the run centers on. Within a difficulty you climb **C -> B -> A -> S -> S+**, unlocking the next rung only by clearing the current one (per difficulty). Legendaries (S+) only appear on the S / S+ ladders.

## Within-run scaling (ladder-relative, difficulty-shaped)

`src/game/difficulty.ts` computes an opponent **level** relative to the run's ladder: `ladderLevel + ramp + bossBump`, where the ramp runs from `rampStart` on the first map to `rampEnd` at the final regular peak, smoothly and with no reset at map boundaries. The ramp **endpoints are the difficulty's main lever** (`difficultyMods` in `src/game/difficulty-mode.ts`): every tier opens at a similar gentle offset below the ladder (`rampStart` -3 to -1.5), but the finale diverges hard. Easy ends roughly **at** the ladder class (`rampEnd` +0.5, so a base roster plus good in-run play wins), while insane ends about **two classes above** (`rampEnd` +4.5, demanding maxed players and abilities). Medium (+1.5) and hard (+3.0) sit between.

This replaces the old model, where every difficulty shared one ramp (finishing two classes above the ladder) and differed only by a flat stat-shift, which left even easy with an A-tier final boss that a fresh roster could not beat. On the S / S+ ladders the late insane ramp still pushes opponents into the **S++ apex** (the difficulty band ceiling in `src/game/stat-scaling.ts` is 28 to allow it), the one place that genuinely requires upgrades. Opponents are staffed from real franchise players scaled to the node level; bosses are headlined by their franchise legend.

## Timeouts (a Death-Defiance pool)

A run is a long, unbroken win streak (roughly a dozen routed combats, one mandatory boss per map) and a single loss ends it. To keep the easier tiers winnable for a player who is still learning, each difficulty grants a run-wide pool of **timeouts** (`secondChances`: easy 2, medium 1, hard 0, insane 0). While any remain, a lost game spends one and is **replayed** instead of ending the run: the player returns to the pregame to re-set their five, and the replay rolls a fresh seed (salted by timeouts spent in `run-machine.ts`, so it is a new contest of the same opponent rather than a deterministic repeat). When the pool is empty, the next loss ends the run as before. Hard and insane carry no timeouts: strict permadeath is part of their challenge. The remaining count is shown in the run HUD (`src/components/run/ResourceHeader.tsx`).

A boss legend is a **scaled headliner**, not an unscaled all-time great. `scaleLegendToLevel` (`src/game/classes.ts`) shifts the legend's stat line to `nodeLevel + LEGEND_BOSS_PREMIUM` (a notch above the boss's other starters), preserving its specialized shape and **never buffing it above its natural ability**. So an early-map boss is a real fight rather than a wall, while a top-ladder finale (where the node level meets the legend's natural OVR) fields the legend at full all-time-great power.

Games are also **fair home/away**: the auto-sim alternates which side leads possessions each quarter, so two evenly matched teams are a true coin flip (the player is always the sim's "home", so a standing last-possession edge would have quietly handicapped every game). Visually the player is billed as the **visitor** and the opponent as the host, but the player's squad still plays the bottom half of the court.

Recruits are real players at the **ladder class**, with a chance ramping **0 -> 50%** by the last map of offering the **class above** (`generateRecruitOffers`).

## The pre-run draft (replaces the salary cap)

Before a run you **draft** a rotation from your owned collection under the difficulty's point budget, paying by class relative to the ladder (`src/game/draft.ts`):

- **0** points below the ladder class, **1** at it, **2** one class above; anything higher is barred. Legendaries always cost **2**.
- A hard **8-man rotation** cap at the draft, and a **12-man** cap during the run (recruiting past 12 forces a drop, returning any held item to the bag).

So on easy (8 points) you can splurge on a couple of above-class stars; on insane (0 points) you can only field below-class players, and the punishment comes from opponent strength, not removed agency.

## Bounded meta-progression (no snowball)

- **Capped permanent upgrades.** Coins buy a permanent +1 in the Locker Room. The per-stat cap is a flat **+5** (`src/game/upgrades.ts`), and the absolute rating any stat can reach is the hard cap of **30**. The costs are cheap with a gentle ramp: standard stats cost **200 / 400 / 800 / 1,600 / 3,200** (base 200, x2 per rank), and the premium ratings (`outside`, `playmaking`, `clutch`) cost **300 / 600 / 1,200 / 2,400 / 4,800**. Permanent power can specialize a player, never reclass them outright.
- **The class ladder is the gate.** Winning unlocks the *next class* on that difficulty, so progress makes the next run harder, not easier (the Slay the Spire "Ascension" / Hades "Heat" pattern, reframed as a class climb).
- **In-run training** (the Pokelike "EV" analog) still spends banked training points on run-scoped +1s (up to the hard cap of **30**, the only path into the S++ apex), resetting every run.
- **Soft-capped run rewards.** Run-scoped items, abilities, and boosts bake in before the sim and **soft-cap into the elite band**: full value through the normal cap of 20, then diminishing returns up to **24** (`applyStatDelta` in `src/game/effects.ts`). A big reward sharpens an already-strong specialist instead of hitting a flat wall, while **training** stays the only channel that reaches the 30 apex. Rare items and boosts trade a small off-stat downside for a sharper upside, so a maxed roster reads spiky (a glass-cannon sniper, a lockdown wing) rather than uniformly maxed, and a small chance bumps a drop one rarity band higher (the "hot" jackpot). These keep reward magnitudes textured and additive, so they never break the make-probability clamp the difficulty curve relies on.

## The ability gacha (separate, bounded power)

Three coin machines (`src/game/abilities-gacha.ts`) dispense passive abilities equipped onto players before a run (a slot separate from the run-scoped boost items): Common (100 coins, only commons), Rare (1,000, 10% rare), Legendary (10,000, 10% legendary). Commons are a +1 boost with a -1 drawback; rares are two boosts or a team boost with a drawback; legendaries are pure upside. Abilities persist between runs, one per player, duplicates allowed, swapped freely between runs. They fold into effective stats through the same `effectivePlayers` / `teamModifierFor` path as items and legend abilities, without interfering.

## No run is wasted

Recruits, coins, and ladder progress bank every run; the home roster is an uncapped, de-duplicated collection (searchable/filterable in the roster browser). But power and difficulty rise together rather than power outpacing the bracket.

## Rewarding the climb: Championship Bounties and a steeper floor

The ladder was fair-but-punishing but under-rewarded: the only thing that scaled with difficulty was a token coin bump, so there was little reason to play above easy. Two composing layers fix that (see [addictive-blueprint.md](addictive-blueprint.md), and the genre models: Hades Bounties, Balatro Stakes/stickers, Dead Cells Boss Cells).

**Championship Bounties (one-time, front-loaded).** Every cell of the 4x5 (difficulty x ladder class) grid carries a one-time reward, granted the FIRST time it is cleared (`src/game/bounties.ts`, granted in `home-roster.claimRunBounty`, revealed by `BountyRewardView`). Rewards scale up-and-to-the-right, with the headline exclusives (a guaranteed legend, a legendary ability, S-tier stars, a big coin bundle) gated behind hard/insane and the high classes. Clearing S+ on insane earns the **Grandmaster** capstone. Because the reward is one-time per cell, this is inherently non-grindy: you get the full payout on the first clear and never by farming. The escalating track *ends* at the apex, handing off to the repeatable floor below (the anti-grind principle: an escalating schedule must terminate, then hand off to variable-ratio).

- **Crests derive from ladder progress**, not the claimed-bounty set, so a veteran save shows every past-clear crest immediately (on the ladder selector and the Hall of Fame `BountyCrestShelf`) with no migration. The material reward, though, fires only on a genuine first clear (`ladderIndex(preClearFrontier) < ladderIndex(class)`), so a returning player is never handed a windfall for cells they conquered before the update.
- **Guaranteed-legend cells sit behind the wall, not around it.** The legend/S grants live on cells whose ramp end (+1.5 hard, +4.0 insane) already demands a maxed roster, so the reward is *for* clearing the wall, not a shortcut through it. The guaranteed legend is a random legend, so it is a spice rather than a targeted meta-pick (protecting build variety, blueprint criterion 9).

**A steeper repeatable floor (so the grid stays worth replaying).**

- **Coin curve.** `coinMul` in `difficultyMods()` steepens from `1.0 / 1.1 / 1.25 / 1.5` to **`1.0 / 1.25 / 1.6 / 2.1`** (easy / medium / hard / insane), roughly doubling the top-end per-clear income (an insane clear now funds most of an S-scout) without a runaway. Easy stays the anchor.
- **Recruit quality is a risk/reward.** Recruits are kept only on a clear, so `generateRecruitOffers` shifts the offer odds UP on harder difficulty (heavier reach-up on C/A ladders, a higher S share on the S ladder), which pays off only if you survive the brutal run. The S-leak bar is preserved, so no A-ladder ever sees an S, and S stays scarce because insane-S clears are rare.
- **Reputation is a prestige score.** The earned-but-unspent `reputation` stat scales by a new `repMul` (`1.0 / 1.5 / 2.5 / 4.0`), so a veteran's lifetime total reflects how hard they play. It has no sink by design, so it can never become a grind loop.
- **Near-miss framing.** A close loss (within six points) reads as "SO CLOSE: lost by 3 with 0:48 left," and a loss at the frontier shows the class one clear would have unlocked. Pure information, no reward attached, so it drives the retry without being gameable.

## How the curve is tuned

The ramp endpoints, timeout counts, and reward multipliers are tuned against a deterministic Monte-Carlo harness (`src/game/__tests__/balance-sim.test.ts`). Because the RNG is seeded, the clear rates are reproducible, so the harness doubles as a regression guard. It plays representative full runs (real maps, a min-combat survival route, real-player rosters drafted under the difficulty budget, the live opponent curve, and the timeout pool) for four roster archetypes that stand in for investment level: **base** (no upgrades), **someUpgrades** (a few +2s), **maxed** (the +5 per-stat cap), and **maxed+abilities** (maxed plus a legendary ability). The target shape, on the C ladder, is:

| difficulty | base | some upgrades | maxed | maxed + abilities |
| ---------- | ---- | ------------- | ----- | ----------------- |
| easy   | ~55-60% (winnable for a first-timer) | high | high | high |
| medium | ~0% (needs investment) | ~40% (rewards some upgrades) | high | high |
| hard   | ~0% | ~0% | ~30% (rewards maxing, with luck) | high |
| insane | ~0% | ~0% | ~0% | ~20% (needs everything, plus luck) |

Higher ladders hold the same shape with class-appropriate (acquired) players: a base roster of acquired S or S+ legends clears easy on those ladders, so the climb is gated by acquisition, not grinding. Run `BALANCE_N=400 npx vitest run balance-sim` for tight estimates while re-tuning.
