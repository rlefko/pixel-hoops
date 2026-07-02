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

- **Difficulty** (easy / medium / hard / insane) shapes the **opponent ramp** (its endpoints, see below), grants a pool of **timeouts** (forgiven losses: 2 / 1 / 0 / 0), sets the **draft point budget** (8 / 5 / 3 / 2, never zero: difficulty amplifies the opponents, it does not confiscate the collection or shrink the boost draft, which offers three picks on every tier), and folds in the escalation modifiers: early elites, glass-bones injuries, and (insane) no pre-boss rest. Harder tiers also pay a **repeatable reward premium**: more coins per win plus a flat championship clear bonus, richer drop rarity, extra training points, multiplied recruit copies, and (hard/insane S ladders) Boss Legend Signings; see "Rewarding the climb" below. All four are selectable from the start.
- **Ladder class** (C / B / A / S / S+) sets the opponent class the run centers on. Classes unlock **globally**: clearing a class on ANY difficulty opens it on ALL of them, so the 4x5 grid is a 20-cell bounty board attacked in any order rather than four ladders to re-climb. Cleared cells are tracked exactly (`clearedCells` in `src/game/home-roster.ts`); crests, bounty availability, and court-theme unlocks all derive from the cell set. Legendaries (S+) only appear on the S / S+ ladders.

## Within-run scaling (ladder-relative, difficulty-shaped)

`src/game/difficulty.ts` computes an opponent **level** relative to the run's ladder: `ladderLevel + ramp + bossBump`, where the ramp runs from `rampStart` on the first map to `rampEnd` at the final regular peak, smoothly and with no reset at map boundaries. The ramp **endpoints are the difficulty's main lever** (`difficultyMods` in `src/game/difficulty-mode.ts`): every tier opens at a similar gentle offset below the ladder (`rampStart` -4.0 to -3.0), but the finale diverges hard. Easy ends just under the ladder class (`rampEnd` -0.4, so a base roster plus good in-run play wins), while insane ends about **two classes above** (`rampEnd` +4.3, demanding maxed players and abilities). Medium (0.0) and hard (+1.7) sit between.

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

So on easy (8 points) you can splurge on a couple of above-class stars; on insane (2 points) you still field two at-ladder players or one above-ladder star among your below-class core: "my guys, against the wall." The budget squeezes but never hits zero, because the genre evidence is unambiguous (Balatro's high stakes vs Monster Train's covenants): difficulty that confiscates the player's collection reads as punishment, while difficulty that amplifies the opponents reads as challenge. The punishment comes from opponent strength, not removed agency.

## Bounded meta-progression (no snowball)

- **Capped permanent upgrades.** Coins buy a permanent +1 in the Locker Room. The per-stat cap is a flat **+5** (`src/game/upgrades.ts`), and the absolute rating any stat can reach is the hard cap of **30**. The costs are cheap with a gentle ramp: standard stats cost **200 / 400 / 800 / 1,600 / 3,200** (base 200, x2 per rank), and the premium ratings (`outside`, `playmaking`, `clutch`) cost **300 / 600 / 1,200 / 2,400 / 4,800**. Permanent power can specialize a player, never reclass them outright.
- **The class ladder is the gate.** Winning unlocks the *next class* on that difficulty, so progress makes the next run harder, not easier (the Slay the Spire "Ascension" / Hades "Heat" pattern, reframed as a class climb).
- **In-run training** (the Pokelike "EV" analog) still spends banked training points on run-scoped +1s (up to the hard cap of **30**, the only path into the S++ apex), resetting every run.
- **Soft-capped run rewards.** Run-scoped items, abilities, and boosts bake in before the sim and **soft-cap into the elite band**: full value through the normal cap of 20, then diminishing returns up to **24** (`applyStatDelta` in `src/game/effects.ts`). A big reward sharpens an already-strong specialist instead of hitting a flat wall, while **training** stays the only channel that reaches the 30 apex. Rare items and boosts trade a small off-stat downside for a sharper upside, so a maxed roster reads spiky (a glass-cannon sniper, a lockdown wing) rather than uniformly maxed, and a small chance bumps a drop one rarity band higher (the "hot" jackpot). These keep reward magnitudes textured and additive, so they never break the make-probability clamp the difficulty curve relies on.

## The ability gacha (separate, bounded power)

Three coin machines (`src/game/abilities-gacha.ts`) dispense passive abilities equipped onto players before a run (a slot separate from the run-scoped boost items): Common (100 coins, only commons), Rare (1,000, 10% rare), Legendary (10,000, 10% legendary). Commons are a +1 boost with a -1 drawback; rares are two boosts or a team boost with a drawback; legendaries are pure upside. Abilities persist between runs, one per player, duplicates allowed, swapped freely between runs. They fold into effective stats through the same `effectivePlayers` / `teamModifierFor` path as items and legend abilities, without interfering.

## No run is wasted

Recruits, coins, and ladder progress bank every run; the home roster is an uncapped, de-duplicated collection (searchable/filterable in the roster browser). But power and difficulty rise together rather than power outpacing the bracket.

## Rewarding the climb

The ladder was fair-but-punishing but under-rewarded: coins were never the binding constraint (they bank as-earned and the sinks are finite), one-time bounties exhaust after a single clear, and the collection, the game's real chase, grew fastest by farming easy. The fix is a layered climb reward (see [addictive-blueprint.md](addictive-blueprint.md), and the genre models: Hades Bounties, Dead Cells Boss Cells, Archero hero mode, Monster Train covenants).

**Championship Bounties (one-time, front-loaded).** Every cell of the 4x5 (difficulty x ladder class) grid carries a one-time reward, granted the FIRST time it is cleared (`src/game/bounties.ts`, granted in `home-roster.claimRunBounty`, revealed by `BountyRewardView`). Rewards scale up-and-to-the-right, with the headline exclusives (a guaranteed legend, a legendary ability, S-tier stars, a big coin bundle) gated behind hard/insane and the high classes. Clearing S+ on insane earns the **Grandmaster** capstone. Because the reward is one-time per cell, this is inherently non-grindy: you get the full payout on the first clear and never by farming. The escalating track *ends* at the apex, handing off to the repeatable floor below (the anti-grind principle: an escalating schedule must terminate, then hand off to variable-ratio).

- **Crests and bounty claims are cell-exact.** Both derive from the persisted cleared-cell set, so a cross-difficulty jump leaves the skipped cells open as live goals (their bounties still pay when you come back), and the load migration seeds cells from each pre-v16 frontier so a veteran can never re-farm a conquered cell.
- **Guaranteed-legend cells sit behind the wall, not around it.** The legend/S grants live on cells whose ramp end already demands a maxed roster, so the reward is *for* clearing the wall, not a shortcut through it. The guaranteed legend is a random legend, so it is a spice rather than a targeted meta-pick (protecting build variety, blueprint criterion 9).

**The repeatable premium (why capable players farm up-grid).** All of these derive from `difficultyMods` and are surfaced as perk chips on the difficulty selector, so the pitch can never drift from the tuning:

- **Copies multiplier (the collector's engine).** A championship deposits **x1 / x2 / x3 / x4** collection copies per new AT-CLASS-OR-BELOW recruit by difficulty (`copiesMul`, applied in `home-roster.depositRecruitCopies`). Deposits cap at each player's copies-to-own threshold (never minting overflow coins), legends are exempt (they own at one copy), and **reach-up recruits (above the run's ladder class) deposit exactly one copy regardless of difficulty** (`collection.REACH_UP_DEPOSIT_COPIES`): below-ladder content tastes the class above, it never completes that chase. With the A threshold at four copies (above every sub-insane multiplier), no single clear insta-owns an A; a hard A-ladder clear banks 3/4, and the favor a recruit fielded from map one earned finishes the signing at the buzzer, which is the earned exception. An insane clear leaves an S recruit at 4/6, turning the S scout machine into a cheap finisher. Easy remains a complete, slower path: acceleration, not exclusivity.
- **Favor multiplier (the collector's premium on the low ladders).** A run's wins bank FAVOR with every un-owned player who logged minutes (see [favor-system.md](favor-system.md)); the settle scales it by `favorMul` (**x1.0 / x1.25 / x1.5 / x2.0**). On the C/B ladders every copies threshold is 1 and reach-ups cap at one copy, so the copies multiplier has nothing to multiply there; the perk chip shows the favor multiplier instead (`difficultyPerks` is ladder-aware, so the pitch still can never drift from the tuning). Favor accrues only from wins, and reach-up favor is halved, so a thrown run banks nothing and a below-ladder farm stays slower than honest at-class play.
- **Boss Legend Signings (the headline exclusive).** On hard/insane S and S+ ladders only, beating a map boss can prompt that franchise's legend to offer to sign: "beat the legend, sign the legend" (`rollBossSigning` in `src/game/run-machine.ts`; chance ramps 4-13% on hard, 6-18% on insane by map). The offer shares the once-per-run legend gate and pity with the recruit-node reveal, offers the natural-stat legend, joins on-loan, and banks only on a clear. Legends stay obtainable everywhere via the 10k scout and the S-ladder pity, so this is acceleration plus spice, never a hard gate.
- **Richer drops and training.** Boost drafts and boost-node stock shift rarity weight out of common (`rarityBonus`: epic+legendary ~6% / 10% / 14% / 18%), boss drops shift out of rare (`bossRarityBonus`: epic+legendary 25% / 33% / 43% / 55%), and elite/boss wins train harder (`trainingBonus`: TP 1/2/4 everywhere on easy/medium, 1/3/5 on hard, 1/4/6 on insane), feeding the only channel that reaches the S++ apex the insane finale demands. All run-scoped, so the texture funds the harder ramp instead of inflating meta power.
- **Coin curve.** `coinMul` stays modest (**1.0 / 1.25 / 1.5 / 1.8**) because coins bank as-earned and a fat multiplier would reward suicide-farming a hard run's gentle early maps. The difficulty premium moved onto finishing: a repeatable **championship clear bonus** of **0 / 200 / 500 / 1,000** coins that partial runs can never touch.
- **Milestone banking (the attempt de-risker).** A hard/insane loss after four boss wins still deposits ONE copy of the run's best non-legend, AT-CLASS-OR-BELOW recruit ("HE STAYS IN TOUCH" on the loss summary; `milestoneBossWins`). Reach-ups are excluded: their clear deposit is also one copy, so banking the same copy from a loss would make dying after boss four the fastest above-class farm. Strictly dominated by clearing, so it cannot be farmed; it exists to make attempting the brutal tiers rational despite forfeit-on-loss.
- **Court themes (the cosmetic exclusives).** Four home-court palettes unlock off the cell set: any medium clear (Playground Dusk), any hard clear (Hardwood Classic), any insane clear (Neon Nights), and the Grandmaster capstone (Grandmaster Gold), selectable in Settings (`src/game/court-themes.ts`). The opponent-arena tint mixes over the chosen base, so the visitor fiction and sprite legibility hold on every theme.
- **Recruit quality is a risk/reward.** Recruits are kept only on a clear, so `generateRecruitOffers` shifts the offer odds UP on harder difficulty (heavier reach-up on C/A ladders, a higher S share on the S ladder). The S-leak bar is preserved, so no A-ladder ever sees an S, and the reach-up deposit cap keeps the heavier hard/insane reach-up an in-run power spike plus a one-copy taste, never an above-class signing machine. Players you hold favor with are weighted up inside their class bucket, so a past run's recruit tends to come looking for you again.
- **Reputation is a prestige score.** The earned-but-unspent `reputation` stat scales by `repMul` (`1.0 / 1.5 / 2.5 / 4.0`), so a veteran's lifetime total reflects how hard they play. It has no sink by design, so it can never become a grind loop.
- **Near-miss framing and the step-up.** A close loss reads as "SO CLOSE: lost by 3 with 0:48 left," and a loss that would have unlocked a new class says so. On a championship below insane, the win screen offers "RUN IT BACK ON {next}" with the next tier's perk chips, pitched at the confidence peak (the only lever that moves a comfortable easy player). Pure information and one-tap flow, no reward attached.

## How the curve is tuned

The ramp endpoints, timeout counts, and reward multipliers are tuned against a deterministic Monte-Carlo harness (`src/game/__tests__/balance-sim.test.ts`). Because the RNG is seeded, the clear rates are reproducible, so the harness doubles as a regression guard. It plays representative full runs (real maps, a min-combat survival route, real-player rosters drafted under the difficulty budget, the live opponent curve, and the timeout pool) for four roster archetypes that stand in for investment level: **base** (no upgrades), **someUpgrades** (a few +2s), **maxed** (the +5 per-stat cap), and **maxed+abilities** (maxed plus a legendary ability). In-run growth is modeled per difficulty (`INRUN_MAX` 4 / 4 / 5 / 6) to reflect the richer hard/insane texture. The measured shape at N=400, on the C ladder:

| difficulty | base | some upgrades | maxed | maxed + abilities |
| ---------- | ---- | ------------- | ----- | ----------------- |
| easy   | ~70% (winnable for a first-timer) | ~100% | ~100% | ~100% |
| medium | <15% (needs investment) | ~70% (rewards some upgrades) | high | high |
| hard   | ~0% | ~0% | ~55% (rewards maxing) | ~95% |
| insane | ~0% | ~0% | ~0% | ~45% (needs everything) |

The gates the test enforces are looser bands around this shape (easy base 40-90%, medium base <15%, hard base <10%, insane base <5%, hard maxed >15%, insane maxed+abilities 10-60%). The top-right corner is deliberately generous: a fully invested roster clearing hard over half the time is what makes the x3-copies, richer-drops tier the rational farm, which is the entire point of the climb. Higher ladders hold the same shape with class-appropriate (acquired) players: a base roster of acquired S or S+ legends clears easy on those ladders, so the climb is gated by acquisition, not grinding. Run `BALANCE_N=400 npx vitest run balance-sim` for tight estimates while re-tuning.
