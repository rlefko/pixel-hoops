# Dynamic Power Systems

Pixel Hoops' power layer (run items, passive boosts, gacha abilities, legend
signatures) started out clean and well budgeted but entirely flat and static:
every effect was fixed at acquisition. This document covers the dynamic systems
layered on top to give the run an internal power curve, reward intentional
construction, and hand the player real agency against a cold draft. They all reuse
the existing effect spine (`StatDelta`, `TeamModifier`, `SimHook`) in
[src/game/effects.ts](../src/game/effects.ts), so the sim stays deterministic and
replay safe.

The north star is [docs/addictive-blueprint.md](addictive-blueprint.md): synergy
first, escalating challenge and power fantasy, variable rewards and near misses, no
single dominant build, no wasted run.

## 1. Event-keyed conditional hooks

`SimHook` is a plain serializable tagged union evaluated once per possession in
`applyHooks` ([src/game/simulation.ts](../src/game/simulation.ts)). Four new kinds
join the original four (`quarterDelta`, `paceClutch`, `tiredBench`,
`opponentRatingMult`):

- **whenTrailing / whenLeading**: a margin-keyed swing. While the owner trails by at
  least `marginBehind` (resp. leads by `marginAhead`) going into a possession, add
  `delta` to its line. Comeback engines and front runners. Self limiting: the bonus
  switches off once the gap closes.
- **hotHand**: a streak ramp. Each made field goal by the owner this quarter adds
  `maxAdd * n / (n + halfLife)` to `stat`, where `n` is the makes so far this
  quarter. The hyperbolic shape asymptotes toward `maxAdd` and never reaches it, so
  even a scorching quarter cannot push a make rate to certainty. Resets each quarter.
- **onResult**: a one-possession momentum proc. If the owner's previous offensive
  possession ended in `madeThree`, add `delta` to this possession, then it decays.

These are offense-side concepts (no-ops while the owner defends, like `paceClutch`).
The per-side streak counters (`quarterMakes`, `lastResult`) live on `SideState`,
update at fixed RNG-free points after each possession resolves, and reset at quarter
boundaries, so replays stay byte identical.

Items and gacha abilities can now carry `hooks` too (legend signatures already
could). An item or ability hook folds into the team modifier while that player
starts, matching the legend-signature contract: team wide for the game, frozen at
tip-off, re-folded on substitutions. The flat `effect` still bakes once per player in
`effectivePlayers`, a disjoint channel, so there is no double count.

### Budget

Conditional hooks sit outside the static rarity-net budget (common 1, rare 2, epic
3, legendary 5). They are sized by their average expected value per game: a hook
fires only sometimes, so a rare-tier hook targets roughly the same per-game uplift as
a rare flat effect, not a raw +2 on every possession. A hook-carrying item or ability
may therefore spend less than its full rarity net on flat stats, the remainder
"paid" by the conditional effect. The content tests enforce `0 <= flat net <= rarity
net` for hook carriers and the exact rarity net for everyone else.

## 2. Scaling (snowball) effects

A `ScalingSpec` on a boost or item describes a snowball: the static effect is the
floor, and `perStack` (a team-modifier fragment) is added once per stack on top,
capped at `maxStacks`. `every` is the counter units per stack, `per` chooses the
counter (`win` or `map`), and `greedy` zeroes all stacks the moment a timeout is
spent (a Green-Joker risk and reward: a clean run keeps it, one forgiven loss wipes
it). Stacks are a pure function of `RunCounters` (`wins`, `mapIndex`,
`forgivenLosses`) captured at team-build time in `buildHomeTeam`, so the sim never
reads run state and replays stay deterministic.

Scaling is front loaded weak (0 stacks at game one) and capped near twice the
rarity's static net by late game, so it is a stabilizer early and a payoff late. It
manufactures the "one more game so it grows" pull. An item's snowball rides the team
modifier (not the per-player bake), preserving the bake-once invariant. Opponents
pass no counters, so they never scale.

## 3. Set and duo synergies

[src/game/sets.ts](../src/game/sets.ts) declares tagged families of boosts and items
and a small table of sets. When the player's dressed five plus owned boosts supply
enough sources from a family, the set emits an extra `TeamModifier`. Set bonuses are
net-budget free but gated by commitment (you spent multiple draft picks or item
slots), the Hades-duo model, so they reward intentional construction without
inflating any single piece. Distinct-player duos (Lob City, Rim Wall) require the
item sources to sit on different players, matched with a small bipartite assignment.

Sets resolve in `teamModifierFor` on the player path only (counters present), fold
into the frozen modifier, and survive substitutions like any other team bonus.
Progress is surfaced in the map HUD (`SetRow`) and as a hint on draft offers
(`set-ui.ts`), so synergy is discoverable rather than buried in a wiki.

## 4. Boost-draft agency: banish and pity

The 1-of-N boost draft has two levers so a cold board is never a trap, both free
(no coins are spent at the draft):

- **Banish**: remove an offered boost from this run's pool (free, hard-capped at
  `MAX_BANISHES = 6`) and draw a single distinct replacement so the board stays full.
  The cap keeps the pool from being narrowed into a guaranteed build. A pool-floor
  guard ensures the board can always fill. It is the one explicit lever, surfaced as
  a clearly labeled per-offer button with a visible "N left" count.
- **Pity**: a run-scoped streak (`boostPity`) that climbs each draft node with no
  epic+ offer and resets when the player sees one. It biases the next draw's rarity
  roll toward epic+ (`rollRarity(rng, pityOffset)`), rising from about 6 percent
  epic+ to about 30 percent at the cap, never the norm. It is deliberately separate
  from the persistent legendary-player pity in `legendDryStreak`: boost rarity is
  drawn many times per run, so its drought is a within-run phenomenon and lives on
  the transient `RunModel` (no persistence migration).

### Determinism contract

Every draw derives from `core.seed`, so replays are stable. Seed labels:

| Draw                | Label                              |
| ------------------- | ---------------------------------- |
| Map 0 draft         | `boost-m0`                         |
| Map N draft         | `boost-m<N>`                       |
| Banish replacement  | `<drawLabel>-banish-<k>`           |

## 5. Balancing and tuning

The auto-sim's advantage is that thousands of games run headlessly.
[src/game/__tests__/boost-balance.test.ts](../src/game/__tests__/boost-balance.test.ts)
measures each boost's marginal win lift against a same-level opponent and asserts
rarity buys power (legendary mean lift > common mean), no boost dominates (lift under
30pp), and none is actively harmful. It also checks the pity-biased roll keeps epic+
under half even at the cap. Run `BOOST_BALANCE_N=400 npx vitest run boost-balance`
for tight estimates while tuning; the shipped default is small so CI stays fast.

Observed shape at N=200: common +0.8pp, rare +1.4pp, epic +1.1pp, legendary +4.4pp,
no dominant boosts. Defensive and conditional boosts read near zero in an even mirror
(they need a scoring-heavy opponent or a specific game state to shine), which is the
expected limitation of measuring a single boost in isolation, not an imbalance.

### Tuning knobs

- Hook magnitudes and `halfLife` / margin thresholds: in the content files
  ([items.ts](../src/game/items.ts), [boosts.ts](../src/game/boosts.ts),
  [abilities-gacha.ts](../src/game/abilities-gacha.ts)).
- Scaling ramps: `every` / `maxStacks` / `perStack` on each `ScalingSpec`.
- Set bonuses: `bonus` and `reqs` in `SET_DEFS`.
- Agency: `MAX_BANISHES` (run-machine.ts), `PITY_PER_STREAK` / `PITY_MAX` (rarity.ts).
