# Difficulty Rebalance

This is the reference for how Pixel Hoops keeps difficulty fair-but-punishing across runs. It expands the "Difficulty Design" section of [game-concept.md](game-concept.md) and realizes the blueprint's pillar 2 ("can I grow faster than the bracket does?", see [addictive-blueprint.md](addictive-blueprint.md)).

## The problem it fixes

The game used to be impossibly hard on run 1 and trivially easy after one or two runs. Meta power (permanent +5..+8 stat upgrades, an ever-growing roster) outran a merely linear opponent curve within two runs, and the only difficulty knob was a single hidden ladder.

## The model: a player-class ladder

Every player belongs to a **class** on a single ladder, derived from their in-game OVR on the 3-10 surface scale (`classForOvr` in `src/game/ratings.ts`, scaling math in `src/game/classes.ts`):

| Class | OVR band | Source |
| ----- | -------- | ------ |
| D | 3-4 | procedural streetball rookies (the only auto-generated class) |
| C | 5 | real NBA players (2K overall 67-74) |
| B | 6-7 | real NBA players (75-81) |
| A | 8 | real NBA players (82-88) |
| S | 9-10 | real NBA players (89-99) |
| S+ | 11+ | hand-curated all-time legends |
| S++ | 13+ | the emergent apex: reached only by deep run-scoped training or the toughest end-of-run bosses |

Real players are baked offline from the NBA 2K API into `src/data/nba-pool.json`, each carrying an `originalClass` and stats anchored into that class's band (`anchorStatsToClass` preserves a player's shape while setting its magnitude). A player's class for the draft is always their **original** class (before any Locker Room upgrade, ability, or training); the card shows `original -> current` with an arrow.

## The run configuration: 4 difficulties x 5 ladders

A run is chosen as a **(difficulty, ladder class)** pair on the home screen (`src/game/difficulty-mode.ts`):

- **Difficulty** (easy / medium / hard / insane) sets the **draft point budget** (8 / 5 / 2 / 0) and folds in the old escalation modifiers: early elites, leaner boost drafts, glass-bones injuries, lean coin payouts, and (insane) no pre-boss rest plus an opponent stat-floor shift. All four are selectable from the start.
- **Ladder class** (C / B / A / S / S+) sets the opponent class the run centers on. Within a difficulty you climb **C -> B -> A -> S -> S+**, unlocking the next rung only by clearing the current one (per difficulty). Legendaries (S+) only appear on the S / S+ ladders.

## Within-run scaling (ladder-relative)

`src/game/difficulty.ts` computes an opponent **level** relative to the run's ladder: `ladderLevel + ramp + bossBump + difficultyStatShift`, where the ramp runs from **a class below** the ladder on the first map to **two classes above** at the final boss, smoothly and with no reset at map boundaries. On the S / S+ ladders the late ramp pushes opponents past 10 into the **S++ apex** (the difficulty band ceiling in `src/game/stat-scaling.ts` rises to 14 to allow it), so the finale is genuinely brutal. Opponents are staffed from real franchise players scaled to the node level; bosses are headlined by their franchise legend.

Recruits are real players at the **ladder class**, with a chance ramping **0 -> 50%** by the last map of offering the **class above** (`generateRecruitOffers`).

## The pre-run draft (replaces the salary cap)

Before a run you **draft** a rotation from your owned collection under the difficulty's point budget, paying by class relative to the ladder (`src/game/draft.ts`):

- **0** points below the ladder class, **1** at it, **2** one class above; anything higher is barred. Legendaries always cost **2**.
- A hard **8-man rotation** cap at the draft, and a **12-man** cap during the run (recruiting past 12 forces a drop, returning any held item to the bag).

So on easy (8 points) you can splurge on a couple of above-class stars; on insane (0 points) you can only field below-class players, and the punishment comes from opponent strength, not removed agency.

## Bounded meta-progression (no snowball)

- **Capped permanent upgrades.** Coins buy a permanent +1 in the Locker Room, but the per-stat cap is a flat **+2** (`src/game/upgrades.ts`). Permanent power can nudge a player, never reclass them.
- **The class ladder is the gate.** Winning unlocks the *next class* on that difficulty, so progress makes the next run harder, not easier (the Slay the Spire "Ascension" / Hades "Heat" pattern, reframed as a class climb).
- **In-run training** (the Pokelike "EV" analog) still spends banked training points on run-scoped +1s (up to the 15 cap, the only path to S++), resetting every run.

## The ability gacha (separate, bounded power)

Three coin machines (`src/game/abilities-gacha.ts`) dispense passive abilities equipped onto players before a run (a slot separate from the run-scoped boost items): Common (100 coins, only commons), Rare (1,000, 10% rare), Legendary (10,000, 10% legendary). Commons are a +1 boost with a -1 drawback; rares are two boosts or a team boost with a drawback; legendaries are pure upside. Abilities persist between runs, one per player, duplicates allowed, swapped freely between runs. They fold into effective stats through the same `effectivePlayers` / `teamModifierFor` path as items and legend abilities, without interfering.

## No run is wasted

Recruits, coins, and ladder progress bank every run; the home roster is an uncapped, de-duplicated collection (searchable/filterable in the roster browser). But power and difficulty rise together rather than power outpacing the bracket.
