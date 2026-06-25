# Play-Style Stats and Roguelike Balance

This note records why the play-style stats, the scouting report, and the recruit
fairness pass are shaped the way they are. It is a design-rationale companion to
[stat-and-sim-system.md](stat-and-sim-system.md) (the mechanical detail).

## The intrinsic vs upgradeable split

Players have two kinds of ratings:

- **Upgradeable skills** (inside, outside, playmaking, perimeter and interior
  defense, athleticism, IQ, clutch): improved with coins between games.
- **Intrinsic play-style** (stamina, durability, blocking, stealing, strength,
  rebounding): never trained or upgraded, only acquired by recruiting the player
  who has them.

This mirrors how the strongest roguelike deck-builders source identity. In Slay
the Spire your relics are fixed run-long properties you find, while your deck is
what you assemble and upgrade; in Balatro your jokers define the run and your
chip/mult upgrades smooth it; in Hades the Mirror is the slow grindable meta while
boons are the run-defining power you collect. The lesson is consistent: power that
comes from who you have feels like authorship and discovery, and power you simply
pay to increment feels like bookkeeping. So the identity-defining traits
(defense, rebounding, physicality) come from acquisition, and upgrades are the
reliable, always-viable smoothing layer.

Because the play-style stats do not feed OVR or the class ladder, a specialist is
not "a higher number," they are "a different sim." A recruited rim protector
visibly swats shots in the watched game; that is the discovery payoff.

## Acquisition over grinding

The risk of an acquisition-only trait is the "a stat I can never get" feel-bad.
Two mitigations, both standard fair-RNG practice:

- **Specialty line**: each recruit offer shows its role, so a pick is a deliberate
  build choice rather than a number compare, and a perimeter-heavy roster reads as
  a chosen archetype, not a deficiency.
- **Reroll + pity**: each offered option can be rerolled once per recruit node
  (agency over a bad draw), and a soft pity guarantees a play-style specialist
  eventually surfaces, so chasing a shot-blocker or a rebounder is reachable.

## Scouting as intent

The pregame scouting report is modeled on Slay the Spire's intent system: show the
opponent's threat in concrete numbers and a legible identity so a loss reads as a
strategy miss (set the wrong lineup) rather than bad luck, while the watched sim
keeps the outcome genuinely uncertain. It is shown for both teams so the player
sees their own identity emerge and can plan a counter.

## Deferred follow-ups

Out of scope for this pass, but natural next steps grounded in the same research:

- **Opt-in difficulty tiers** (Ascension/Heat style): granular, additive modifiers
  the player self-selects, never reset on loss, so losses feel earned.
- **Near-miss framing**: surface how close a lost run was ("lost by 4 in the
  final") with a one-tap retry, the strongest "one more run" retention lever.
- **Synergy telegraphs at the offer**: highlight when a recruit pairs with the
  build you are assembling (paint control, press defense, and so on).
