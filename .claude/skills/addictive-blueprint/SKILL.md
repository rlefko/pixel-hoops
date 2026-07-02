---
name: addictive-blueprint
description: Score a proposed Pixel Hoops gameplay feature against the addictive-gameplay blueprint. Use when the user asks whether a feature, mechanic, screen, or change "follows the blueprint", "is addictive / engaging / sticky", "earns its place", or wants a design review of a gameplay idea against the roguelike addiction principles. Reads docs/addictive-blueprint.md as the source of truth.
---

# Addictive Blueprint Review

Score a proposed gameplay feature against Pixel Hoops' addictive-gameplay blueprint and report where it passes, where it falls short, and how to fix the gaps.

This skill is a design tool, not a rubber stamp. Be honest and specific. A feature that scores poorly should be told so, with concrete fixes, not flattered.

## Step 1: Load the source of truth

Read `docs/addictive-blueprint.md`. The checklist near the bottom (18 criteria as of the collection-pacing amendment) is authoritative; if it has changed, use the changed version, not the list reproduced anywhere else, and take the passing bar from the checklist's own intro line. Also skim `docs/gameplay-redesign.md` for how the current game works (auto-sim 5-on-5, agency in roster, game plan, and the branching run map), so scoring is grounded in the real game, not a generic one.

## Step 2: Identify the feature under review

The feature can come from any of these, in priority order:

1. Text the user provided directly (in their message or as the skill argument).
2. A document or section they point to (read it).
3. The current working changes, if they ask to review "this" or "the diff": run `git diff` (and `git diff --staged`) and infer the feature from the changes.

If the feature is unclear or underspecified, ask one short clarifying question before scoring. Do not invent a feature.

## Step 3: Score each criterion

For each criterion in the checklist, assign:

- **pass**: the feature clearly satisfies the yes/no test.
- **partial**: it satisfies the spirit but has a gap or depends on something not yet designed.
- **fail**: it does not satisfy the test.
- **n/a**: the criterion genuinely does not apply (use sparingly, and justify it). An n/a does not count against the feature but also does not count toward the passing bar; say so.

Judge against the real game. For example, "immediate feedback" should reference the juice systems the game actually has (count-up scores, screen shake, callouts, haptics). For each criterion give a one-sentence justification tied to the feature, not a restatement of the criterion.

## Step 4: Report

Output, in this order:

1. **Verdict line:** the feature name, the score as `X / N passed` against the checklist's current criterion count (count `pass` only; note partials and n/a separately), and whether it clears the bar the checklist's intro line states (14 of 18 as of the collection-pacing amendment).
2. **Scorecard table:** one row per criterion: number, short name, verdict, one-sentence justification.
3. **Top gaps:** the 2 to 4 most important `fail` or `partial` items, each with a concrete, specific fix phrased as an action ("add a count-up on the recruit's stat reveal", not "improve feedback").
4. **Strengths:** 1 to 3 things the feature does well, so they are preserved.
5. **One-line recommendation:** ship as-is, ship with the listed fixes, or rework.

Keep the report tight and skimmable. Favor specific, buildable suggestions over general design advice.

## Example scorecard row

| # | Criterion | Verdict | Why |
|---|-----------|---------|-----|
| 2 | Immediate feedback | partial | The recruit screen shows the new player but the stat reveal does not pop, count up, or fire a haptic, so the reward does not land. |

## Notes

- The checklist is the contract. If the user wants to add or change a criterion, edit `docs/addictive-blueprint.md` (the source of truth), not this skill.
- Optional companion idea, not yet built: a focused `juice-check` skill that audits only the game-feel criteria (13 to 15) of a screen or interaction. If asked for it, propose adding it rather than overloading this skill.
