# Earned Greatness: Signature Signings, the Proving Floor, and Legacy

This document is the source of truth for how top-tier players are EARNED (v21):
why an S or S+ player can no longer be farmed from an easy tournament, how each
channel closed, and the usage-driven growth system that sits alongside it. The
design principle, applied three ways: greatness is proven, not purchased, at the
content tier that matters, with the player you are proving.

Research basis (verified against primary sources): Head Basketball / Head Soccer
per-character unlock conditions with punitive buyouts, The Binding of Isaac's
difficulty-coupled completion marks and tainted-character runs, Balatro's
per-deck stakes, Hades' one-time bounty keying, League of Legends' 2024 mastery
rework ("real accomplishment, not just grind"), NBA 2K's badge-regression
backlash (never decay), and gacha pity design (never ship a chase without a
deterministic ceiling).

## 1. Signature Signings (S+ legends)

Every one of the 92 legends signs through a two-mark **Signature Card**
(`src/game/signature.ts`), earned in any order, across any number of runs:

- **SIGNATURE MOMENT**: the legend, fielded on loan, performs their bespoke
  condition in a single WON game on an S or S+ ladder at or above their tier
  floor. Banks at the terminal settle, win or lose (a lost run keeps the mark).
- **CHAMPIONSHIP TOGETHER**: win a championship with the legend logging minutes
  in the title game, same ladder and floor. Banks on the clear.

Both marks done, the legend signs (owns at one copy, as always) and the card
leaves the ledger: owned IS signed. The honest floor fits one sentence: "Do his
moment once; win a title with him once, or buy out the contract."

### Tiers, floors, stages

Derived from the baked 2K `overall` (no extra data):

| Tier | Overall | Count | Difficulty floor | Moment stage |
| --- | --- | --- | --- | --- |
| I GREAT | 92 and under | 21 | medium | any game |
| II ICON | 93 to 96 | 47 | hard | elite or boss |
| III PANTHEON | 97 to 99 | 24 | insane | boss only |

Crediting is one-directional (the Isaac rule): playing above the floor always
counts, below never does. If live pacing shows insane participation too thin, the
PANTHEON floor softens to hard (the boss-stage overlay stays); the `signature-sim`
bands are the decision criterion.

### Conditions

Eight templates, assigned deterministically from each legend's baked playstyle,
shot diet, and ratings, with a tiny hand-authored override map for marquee
identity (Jordan closes, Magic and Stockton distribute, Rodman owns the glass,
Oscar posts the line). All 92 derived cards are pinned in a snapshot test, so
any tuning change is loud in review. Numbers are CALIBRATED against real seeded
sims (`signature-sim.test.ts`): each template's aggregate hit rate measures
roughly 28% to 55% of qualifying won games with a dedicated maxed five, so a
moment is a real moment, never a gift and never a dead letter. Per-legend rates
spread wider by design (a PANTHEON condition can sit near 5% per boss win and
still land ~40% per seven-boss run); the pinned bands are 15-70% per template
and 2-92% per legend. The sim's counting stats run small (a monster
rim-protector game is 2-3 blocks), which is why the numbers read modest next to
NBA box scores.

### The Showcase (the chase as a deliberate play)

The moment used to be arm-and-hope: field the legend, tip off, and let the sim
decide. The SHOWCASE call (`src/game/showcase.ts`) makes each attempt a
decision at the altitude the auto-sim design permits (one legible, whole-game
call, never a per-possession menu): when a chase legend with an unproven moment
starts a QUALIFYING game, the pregame offers a single toggle that bends the
game plan toward their bespoke condition, and the other team keys on it.

- **Template-aware biases**, all strictly upstream of the seeded RNG (weights
  and gates the existing draws consume; same draw count; a game without a call
  resolves byte-identically): RUN IT THROUGH HIM and CLOSER'S GAME feed the
  scorer through the usage lever; GREEN LIGHT FROM DEEP adds the three-hunting
  diet; TABLE-SETTER'S NIGHT inverts (usage DOWN, since assists credit only
  non-scorers, while the offense hunts his pass); PUT IT IN HIS HANDS runs both
  halves gently; FUNNEL THEM INSIDE shades the arc and concedes the drive into
  the rim protector; CRASH THE GLASS and FULL-COURT PRESS raise the event
  supply and the legend's share of it. Benefit and cost both gate on the legend
  being ON COURT.
- **One cost model**: a bounded, visible efficiency tax while the call is live
  (the offense calls pay it on offense, the gamble calls concede easy finishes;
  the wall's funnel self-prices by handing the opponent rim looks). The pregame
  matchup headline recomputes with the call armed, so the price is read before
  tip-off, and the moment still only banks in a WIN: showcasing a boss game is
  a felt gamble, not a ritual tap.
- **Qualitative odds, never percentages** (the coach-odds law): the card shows
  the movement on a four-rung ladder (A LONG SHOT, A PUNCHER'S CHANCE, A LIVE
  LOOK, HIS KIND OF NIGHT), from a static table measured by the sim harness.
- **Calibration law (anti-ritual-tap)**: `signature-sim.test.ts` runs two lanes
  over the same seeds. The BASE lane keeps the condition numbers calibrated to
  un-showcased play (thresholds are never re-tuned around the call, so skipping
  it is never a tax); the SHOWCASE lane pins the lift (roughly 1.2x to 1.7x per
  template, aggregate lift +3 to +25 points, ceiling 0.70) and the win-rate
  floor (every dedicated five still wins over 30% showcased, median at least
  42%). Certainty stays spent on IDENTITY; TIMING stays variable.
- **Limits**: cost-limited, never counted. No per-run ration (the WIN
  requirement and the stage floors are the structural limiter), offered for
  chase legends only (a generic star toggle is the star coaches' identity and
  the roadmap's playbook-cards territory), and a showcase never fires from the
  bench (starting is part of the call).

### The chase reads back (the feedback loop)

Every stage of an attempt now has a surface; before this, the chase was
invisible between the Legends board and the run summary:

- **Draft**: an on-loan legend's row names their condition (SIGNATURE CHASE).
- **Pregame**: the Showcase card, including the muted WON'T COUNT HERE state
  with the exact reason (stage, floor, or ladder), so a non-qualifying cell can
  never be farmed in ignorance. The Legends board carries one coach's-notes
  hint per template naming the levers that exist beyond the call (roster shape,
  coach, route).
- **The watch**: a chase chip climbs with the landed ball for event-tracked
  templates (points, threes, Q4 points, assists), and the crossing fires a
  one-shot gold SIGNATURE MOMENT beat, only in a won game whose settled box
  truly met the condition. Blocks, boards, and steals are box-only (SimEvent
  never attributes them and gains no fields, the golden-master contract), so
  those chases read their result at the box score.
- **Postgame**: the box score carries the moment line: gold on a bank, the
  exact near-miss otherwise ("22/24 PTS. MOMENT MISSED."), and the honest
  moment-without-the-win framing on a loss.
- **Run summary**: `RunModel.signatureAttempts` keeps each chase's closest
  qualifying miss (best line, target, shots taken), shown as a CLOSEST row on
  the signature strip. Display-only and run-scoped: it never settles home, and
  a lost game is never an attempt (the win-only floor rule).

### Getting the legend on loan

1. **The Trial Pin** (deterministic): arming a legend on the Legends board makes
   them an on-loan draft option (the standard 2-point legend rate) on qualifying
   runs. Identity is certain, timing stays variable; an attempt never waits on a
   reveal roll (`trialPinLegend` in home-roster.ts, wired in `initRun`).
2. The favor-steered legend reveal (unchanged odds, once per run, soft pity).
3. Boss Legend Signings on hard/insane S ladders (unchanged odds).

### Legacy Contracts (the deterministic ceiling)

The 10,000-coin Legendary pull is GONE; nothing random sells a legend. In its
place, a **Legacy Contract** buys out ONLY the championship mark, and only for a
legend whose moment is already proven: coins never skip the challenge. Prices by
tier: 8,000 / 15,000 / 25,000. At roughly 950/1,300/1,850/2,600 coins per clear,
the buyout costs 6 to 14 runs of pure income against 1 to 3 more runs for the
honest championship, so clearing strictly dominates while a player who can hit
the moment but not the clear keeps a visible ceiling. The `insane:S` bounty pays
a one-time **LEGEND VOUCHER** (one free contract, moment still required), keeping
that cell's headline without reopening an ownership channel.

### Never confiscate

Owned legends stay owned and read as SIGNED (no ceremony replay). A run
suspended before this shipped settles once through the LEGACY VALVE (the old
on-loan auto-sign), keyed off the absent `RunModel.signatureProgress`; every run
started after the update uses the card.

## 2. The Proving Floor (S-class)

`PROVING_DIFFICULTY` (`src/game/collection.ts`): S-class copies bank only from
MEDIUM and up. Below the floor:

- A championship's S recruits deposit **letters of intent** instead of copies:
  a flat +20 favor per recruit (`LETTER_OF_INTENT_FAVOR`). The meter always
  moves on a title; below the floor it moves in trust, not contracts.
- S-class win-favor settles half-damped (`FAVOR_UNPROVEN_DAMP`), stacking with
  the reach-up damp where both apply.
- The scout machines went difficulty-exact: the S machine needs A cleared on
  medium or better, the Legendary slot gated behind the card system entirely.
  Machines a veteran had already opened under the old any-difficulty rule stay
  open forever (`legacyGates`, stamped once at the v21 migration: the v16
  never-re-lock precedent).

Measured pacing (seeded Monte-Carlo, `collection-pacing-sim.test.ts`): a
dedicated S chase on an easy-only save lands around a median of 18 runs
(banded 14 to 28) against medium's 8 to 24, even though easy clears nearly twice
as often. The floor, not the clear rate, owns the pace, and the "easy strictly
slower than medium" gradient is a pinned test. Easy still offers S stars at 60%
of S-ladder recruit weight for in-run power, still banks visible favor, and the
one-sentence path up is stated in a one-shot tip: "Easy earns his trust; Medium
signs him."

The flagship invariant, driven through every channel (recruits, deposits, favor,
machines, milestone banking, bounties, daily): **easy-only play can never own an
S+**.

## 3. Legacy (usage-gated growth)

`src/game/legacy.ts`: every OWNED player carries a career line `{w, mvp,
titles}`: wins with minutes, box-score MVP crowns (Game Score, so empty-calorie
chucking never counts), championship title games. Guards mirror favor: WIN-only,
minutes-only, and AT-CLASS only (the run's ladder may sit at most one class rung
below the player's own class; playing above always credits, so an S+ farming the
C ladder banks nothing). Careers
never decay (the 2K badge-regression lesson) and bank exactly once per run under
the settledRunId guard, credited to players owned before the merge.

| Level | Name | Threshold | Unlocks |
| --- | --- | --- | --- |
| L1 | ROTATION | 5 W | badge |
| L2 | STARTER | 15 W, 3 MVP | Locker rank 4 purchases |
| L3 | FRANCHISE | 35 W, 10 MVP, 1 title | Locker rank 5 purchases |
| L4 | ICON | 60 W, 20 MVP, 3 titles | one Icon Perk slot |

Locker ranks 1 to 3 stay coins-only; the gate applies to the NEXT purchase only
(already-bought ranks are never confiscated). Icon Perks are non-stat sidegrades
(the +5 per stat and 30 rating caps are design law): CAPTAIN'S PENNANT
(prestige), MENTOR (+1 favor to recruits fielded alongside, feeding the chase),
FILM ROOM (+1 training point on boss wins, riding the run-scoped TP economy).
Past ICON, each further MVP pays a +25 coin appearance fee: overflow converts.

## 4. Intentional bypass channels (decisions, not oversights)

- The Legacy Contract and the Legend Voucher both require the proven moment;
  neither ever sells the challenge itself.
- The `easy:S+` and `medium/hard:S+` bounty cells still grant one-time A or S
  tier scout pulls; those route through the standard copy path, are one-time by
  construction, and never touch legends.
- Legend favor still steers WHICH legend the reveal offers and pays residual
  coins on signing; it never converts to copies.

## 5. Test contracts

- `signature.test.ts`: derivation totality (92/92, null-playstyle fallback),
  the pinned snapshot, per-template truth tables, one-directional floors.
- `signature-sim.test.ts`: per-legend and per-template hit-rate bands from real
  seeded sims, in two lanes (base and showcased over the same seeds); a drift
  here means the sim's texture changed and the numbers need re-tuning, not a
  flaky test.
- `showcase.test.ts`: bias-package totality and bounds, the on-court gate, the
  eligibility reasons, the momentGap read (agreement with momentMet), and the
  odds ladder's never-demote rule.
- `collection-pacing-sim.test.ts`: the easy-S band, the proving gradient, the
  leak guards, and the apex invariant (easy-only play can never own an S+).
- `legacy.test.ts` and the run reducer suites: accrual guards, gate math,
  exactly-once banking, the legacy valve, and trial-pin qualification.
