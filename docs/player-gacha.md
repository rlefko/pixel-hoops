# Player Scouting Gacha and Recruit Retention

This document covers two coupled systems that shape how your roster grows between runs:
recruit retention (you keep mid-run signings only when you clear a run) and the Scouting
gacha (the reliable, permanent way to grow your collection with coins).

## Recruit retention: clear to keep

Players you sign at recruit nodes during a run are **provisional**. They play for that run,
but they only join your permanent collection if you **clear the run** (win the final boss).

- **Clear a run:** every recruit you fielded comes home (run scoped state such as items,
  training, and injuries is stripped, as before).
- **Lose a run:** the recruits evaporate. Your owned collection is never reduced, and you
  still **bank all coins and reputation** earned during the run, so every run moves you
  forward even in defeat.

This is implemented in `mergeRunGainsIntoHome` (`src/game/home-roster.ts`), which keeps new
recruits only when `champion` is true. The end-of-run summary states the outcome plainly
("Recruits carried home." vs "Run recruits lost. Coins banked."), and the recruit node notes
that signings are kept only on a clear.

Why: it creates genuine loss aversion ("one more run" tension) without a death spiral, because
coins always bank and the Scouting gacha guarantees roster growth (below).

## The Scouting gacha

Five coin machines in the Arcade, one per tier. Each draws a real player from that tier's pool.

| Machine          | Cost    | Pool                              |
| ---------------- | ------- | --------------------------------- |
| C Scout          | 250     | every C-class real player (~212)  |
| B Scout          | 500     | every B-class real player (~245)  |
| A Scout          | 1,000   | every A-class real player (~85)   |
| S Scout          | 2,500   | every S-class real player (~17)   |
| Legendary Scout  | 10,000  | every all-time great / S+ (~40)   |

### Collection mode

While a tier still has players you do **not** own, a pull always returns a **new** one
(uniform among the un-owned) at full price. A "collected N/N" counter on each machine keeps the
odds transparent. Once a tier is fully collected, the machine shows `COLLECTED N/N` and is
disabled in the Arcade, so in normal play you never spend on a guaranteed repeat.

The half-price **repeat refund** is the safety net underneath that: `pullPlayer` returns a
repeat with half the price refunded when the tier is exhausted. The Arcade prevents reaching it
(the disabled machine), so it exists mainly as the defined behavior for a completed tier rather
than a routine player-facing outcome.

This is implemented in `pullPlayer` (`src/game/player-gacha.ts`); `applyPlayerPull`
(`src/game/home-roster.ts`) charges coins, credits any refund, and prepends a new signing to the
collection (recency first). Both are pure and deterministic from a seeded RNG.

### Economy fit

A full easy clear nets roughly 900-1000 coins; a lost early run still banks roughly 150-300.
So a first C Scout (250) is reachable within a run or two even while losing, while a Legendary
(10,000) is a long-term chase of about ten clears. Prices are intentionally steep but fair: the
gacha is the dependable growth path now that mid-run recruits are provisional.

### Notes

- Legends (S+) become permanently ownable for the first time, only via the Legendary Scout.
  Existing draft gating still applies, so a high-tier signing cannot trivially stomp low ladders.
- No save migration is required: scouted players join the existing owned-collection array.
