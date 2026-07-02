# Player Scouting Gacha and Recruit Retention

This document covers two coupled systems that shape how your roster grows between runs:
recruit retention (you keep mid-run signings only when you clear a run) and the Scouting
gacha (the reliable, permanent way to grow your collection with coins).

## Recruit retention: clear to keep

Players you sign at recruit nodes during a run are **provisional**. They play for that run,
but they only join your permanent collection if you **clear the run** (win the final boss).

- **Clear a run:** every recruit you fielded comes home (run scoped state such as items,
  training, and injuries is stripped, as before).
- **Lose a run:** the recruits evaporate, but not their FAVOR: every un-owned player who
  logged minutes in the run's wins banked favor toward owning them (see
  [favor-system.md](favor-system.md)). Your owned collection is never reduced, and you
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

### Copies mode and the directed chase

A pull grants **one copy** toward owning a player of the tier's class. Rarer classes need
more copies (`collection.COPIES_TO_OWN`: C 1 / B 1 / A 4 / S 6 / legends 1), so a single
pull is a step, not an instant sign. To keep a chase from scattering across the whole
tier, the copy lands on ONE player, chosen by a strict precedence:

1. **The pinned scout target**, when one is set for the machine (from the roster
   browser's in-progress rows). Every pull feeds that exact chase until owned.
2. **The highest effective progress** otherwise: collected copies plus the banked-favor
   fraction (see [favor-system.md](favor-system.md)). With no favor anywhere this is the
   classic closest-to-unlock rule.
3. **A seeded tie-break** on a fresh tier.

The machine card shows the exact next target (the RNG-free `scoutTargetFor`), a
"collected N/N" counter, and the target's copies and favor, so the odds are transparent
and the card can never promise a player the pull would not deliver. Once a tier is fully
collected, the machine shows `COLLECTED N/N` and is disabled in the Arcade; a pull that
somehow lands on a completed tier overflows into a coin bounty
(`collection.OVERFLOW_BOUNTY`, half the machine price), so a duplicate is always progress
or currency, never a dead drop. When a chase completes through the machine, any banked
favor for that player also pays out as coins (nothing the game asked you to fill ever
evaporates).

This is implemented in `pullPlayer` (`src/game/player-gacha.ts`); `applyPlayerPull`
(`src/game/home-roster.ts`) charges coins, folds the copy in, credits any bounty or favor
residual, and prepends a new signing to the collection (recency first). Both are pure and
deterministic from a seeded RNG plus the ledgers passed in.

### Economy fit

A full easy clear nets roughly 900-1000 coins; a lost early run still banks roughly 150-300.
So a first C Scout (250) is reachable within a run or two even while losing, while a Legendary
(10,000) is a long-term chase of about ten clears. Prices are intentionally steep but fair: the
gacha is the dependable growth path now that mid-run recruits are provisional.

### Notes

- Legends (S+) become permanently ownable via the Legendary Scout or by winning a run
  with an on-loan legend. Existing draft gating still applies, so a high-tier signing
  cannot trivially stomp low ladders.
- The once-per-run legend reveal offers the highest-FAVOR un-owned legend (uniform when
  nobody has favor), so the legend you lost a run with becomes the standing front-runner;
  the reveal's rate and pity are untouched.
