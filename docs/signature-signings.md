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
roughly 24% to 53% of qualifying won games with a dedicated maxed five, so a
moment is a real moment, never a gift and never a dead letter. Per-legend rates
spread wider by design (a PANTHEON condition can sit near 5% per boss win and
still land ~40% per seven-boss run); the pinned bands are 15-70% per template
and 2-92% per legend. The sim's counting stats run small (a monster
rim-protector game is 2-3 blocks), which is why the numbers read modest next to
NBA box scores.

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
  seeded sims; a drift here means the sim's texture changed and the numbers need
  re-tuning, not a flaky test.
- `collection-pacing-sim.test.ts`: the easy-S band, the proving gradient, the
  leak guards, and the apex invariant (easy-only play can never own an S+).
- `legacy.test.ts` and the run reducer suites: accrual guards, gate math,
  exactly-once banking, the legacy valve, and trial-pin qualification.
