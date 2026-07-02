# The Favor System: the Directed Chase

Favor is deterministic, win-earned progress toward owning a specific player. It exists
to make "get my favorite onto the roster" a directed medium-term chase instead of a
lottery, and to repair the two sharpest edges of the collection economy:

1. **The reach-up collapse.** Recruit offers on the C/B/A ladders reach up to the class
   above (3/6/13/19% per offer slot by difficulty), and a championship used to deposit
   the full difficulty copies multiplier for every new recruit. On the B ladder at hard,
   13% reach-up times the x3 multiplier met the old 3-copy A threshold, so every A-class
   reach-up recruit on a cleared run was **instantly owned**. The intended multi-run
   A-class chase collapsed into one B-ladder clear, and the collection burned out before
   the harder difficulties were even attempted.
2. **The evaporating recruit.** Run recruits are kept only on a clear, so a lost run
   converted its roster-building into nothing. Loss aversion is the point of
   clear-to-keep, but a deep run with a beloved recruit ended with zero trace of them.

The design follows the research behind [addictive-blueprint.md](addictive-blueprint.md)'s
"Collection pacing and the directed chase" section: shipped earned-favor systems are
**deterministic and legible** (Hades keepsakes rank up by encounters played while
equipped, never by hidden odds), pity-style guaranteed progress reads as fair, and
top rarities must not leak whole out of low-tier content (Brawl Stars simply excludes
them there).

## The structural fixes (no leak, no farm)

- **Reach-up deposit cap.** A recruit whose class sits strictly above the run's ladder
  deposits exactly ONE copy on a clear (`collection.REACH_UP_DEPOSIT_COPIES`), ignoring
  the difficulty copies multiplier. Below-ladder content grants a taste of the class
  above, never the signing.
- **A-class threshold 3 to 4** (`collection.COPIES_TO_OWN`). At three copies, an
  at-class hard clear (x3) also insta-owned every new A recruit. At four, a hard
  A-ladder clear banks 3/4, and only a recruit fielded from early (whose favor converts
  a fourth copy) signs at the buzzer. That signing is earned at-class on hard, which is
  exactly the difficulty premium.
- **Milestone banking excludes reach-ups** (`home-roster.bestBankableRecruit`). A
  hard/insane loss after four boss wins banks one copy of the best at-class-or-below
  recruit. Before the fix, banking a reach-up would have equaled its clear deposit,
  making a four-boss suicide the fastest above-class farm; clearing must strictly
  dominate every other channel to the same reward.

## Earning favor

Favor accrues in the run reducer (`run-machine.resolveGameResult`) to every player who
**logged minutes in a WON game** (`fieldedFavorKeys`; box seconds > 0):

| Win | Base points |
| --- | --- |
| Regular game | 1 |
| Elite | 2 |
| Boss | 3 |
| Championship | +5 flat on top of the boss points |

The rules that make it exploit-proof:

- **Losses and timeout replays earn nothing.** A floor that pays on losses would make
  deliberate losing the optimal farm; favor is earned by winning, banked win or lose.
- **Benched spectators earn nothing.** Only minutes played count, so parking an
  un-owned recruit on the bench costs a roster slot and pays nothing. Fielding a weaker
  un-owned recruit over a maxed starter is a real tradeoff: win odds now against favor
  accrual toward owning them.
- **The run banks at the terminal settle, win or lose** (`home-roster.settleCollection`).
  A lost run keeps the favor its wins earned, so a deep loss with a great recruit leaves
  a visible meter instead of nothing. Cutting a player mid-run forfeits their favor
  (they did not finish the run on your squad).
- **The difficulty premium is a settle multiplier** (`difficultyMods.favorMul`:
  x1.0 / x1.25 / x1.5 / x2.0), and reach-up players earn at half rate
  (`favor.FAVOR_REACH_UP_DAMP`). A full dedicated hard clear banks roughly one A copy
  of favor; a maximal below-ladder run stays under one converted copy, so one deposit
  copy plus one favor copy can never reach the four-copy A threshold from below
  (the single-run leak invariant, locked by `collection-pacing-sim.test.ts`).

## Spending favor (it spends itself)

Favor is fractional copies. At the settle it converts at a class-scaled threshold
(`favor.FAVOR_PER_COPY`: C 20 / B 30 / A 40 / S 60), through the same deposit function
recruits use, so unlock semantics are identical; the remainder stays on the meter.
Legends (S+) never convert (one copy owns them); their favor is pure steering:

- **The scout machines are favor-directed** (`player-gacha.pullPlayer`). Selection
  among the un-owned: an explicit PINNED target first (set from the roster browser's
  in-progress rows or shown on the Arcade card), else the highest EFFECTIVE progress
  (copies plus banked-favor fraction), seeded tie-break. With no pins and no favor this
  is exactly the classic closest-to-unlock rule, so veterans' in-flight chases are
  untouched. The card's target chip is computed by the RNG-free `scoutTargetFor`, so
  the UI can never promise a different player than the machine delivers.
- **The legend reveal is favor-steered** (`player-pool.legendRecruitFavored`). The
  once-per-run S/S+-ladder reveal offers the highest-favor un-owned legend; rate and
  pity are untouched. Lose a run with an on-loan legend and they become the standing
  front-runner of every future reveal: identity is earned, timing stays chance.
- **Recruit re-offers lean toward favorites** (`tournament.pickRealOfClass`). Players
  you hold favor with are weighted up (1 + points) inside their class bucket, the
  "they came looking for you" reunion, so run one's chance encounter seeds run two's
  meter progress instead of stalling on a one-in-a-pool re-roll.
- **Overflow converts.** When a chase completes another way (a deposit or a pull signs
  the player), the leftover favor pays out as coins
  (`favor.FAVOR_RESIDUAL_COIN_RATE` per point). A meter the game asked the player to
  fill never evaporates.

The certainty budget (see the blueprint): favor and pins spend certainty on IDENTITY
(who the chase resolves to); TIMING and TEXTURE stay variable (whether the run clears,
when the reveal fires, which recruits appear). No new currency exists; coins remain the
only spin cost.

## Pacing (the excitement window)

The `collection-pacing-sim.test.ts` guard drives the real offer, settle, and pull code
with modeled clear rates and locks these bands (medians over seeded trials):

| Directed chase | Runs to own |
| --- | --- |
| A-class favorite, A ladder easy/medium | ~4-6 |
| A-class favorite, B-hard farming | ~5-6 (was: instant, and random) |
| S-class favorite, S ladder medium | ~9-15 |
| S-class favorite, S ladder hard | ~7-10 |
| A specific legend | offered every few runs once favored; own on a clear-with or the 10k pin |

Too fast devalues the tier and burns the content (the Dragalia Lost failure); too slow
reads as a wall. The bands sit inside the researched 30-to-40-unit excitement window
with clear daylight below the ~55-unit gambling-feel boundary.

## Persistence and migration

- `HomeRoster.favor` (playerKey to points, un-owned players only) and
  `HomeRoster.scoutTargets` (tier to pinned playerKey) shipped in **v18**
  (`deserializeHomeRoster`). Older saves default to an empty ledger and no pins; owned
  players' entries and invalid pins are dropped on every load.
- **Goodwill grant.** The same version raises the A threshold from three to four, so
  the one-time migration grants every in-progress A entry half a copy of favor
  (+20 points): a veteran's meter visibly moves forward on update day, never back.
- Run-side state (`RunModel.favor`, `RunModel.homeFavor`) rides the suspended-run
  snapshot as optional fields, so pre-favor suspended runs resume cleanly with no
  `ACTIVE_RUN_VERSION` bump. Favor banks only inside the `settledRunId`-guarded
  terminal settle, so a crash-resumed run can never double-bank.

## Surfaces

- **Run summary and champion screens**: a compact FAVOR EARNED strip (top rows plus a
  "+N more" fold), count-ups per gain, copy conversions popped in gold; favor-driven
  unlocks ride the existing player-scouted reveal (or the "stays in touch" line on a
  loss).
- **Arcade**: each scout machine shows its exact next target (pin or leader) with
  copies, favor, and a pennant glyph; the difficulty chips show the favor multiplier on
  the C/B ladders where the copies chip would be dead.
- **Roster browser**: in-progress rows show banked favor and a SET SCOUT TARGET pin.
- **Recruit node**: one pitch line ("Un-owned recruits earn favor every game they win.
  Favor banks, win or lose.").
