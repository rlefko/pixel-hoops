---
name: perf-review
description: Review a diff or feature against Pixel Hoops' performance conventions (battery, CPU, tap-to-paint responsiveness). Use for the pre-commit performance agent check, when the user asks for a "perf review" / "performance check" / "battery check", when investigating jank, heat, drain, or unresponsive taps, or before committing changes that touch animations, audio, reducers, scrolling, lists, or the sim. Reads docs/performance-conventions.md as the source of truth.
---

# Performance Review

Check a change against Pixel Hoops' performance conventions and report where it complies, where it violates a rule, and how to fix each violation.

This skill is a review tool, not a rubber stamp. Every rule in the conventions doc was earned by a real defect; a change that violates one should be told so with the concrete cost and the compliant fix, not waved through. Equally, do not invent violations: a rule that does not apply to the diff is simply not in play.

## Step 1: Load the source of truth

Read `docs/performance-conventions.md`. Its rule areas and the review checklist at the bottom are authoritative; if the doc has changed, follow the changed version, not any summary reproduced elsewhere (including this skill).

## Step 2: Gather the change under review

In priority order:

1. A target the user named (a PR number, branch, file, or feature description).
2. The current working diff: `git diff origin/main...HEAD`, plus `git diff HEAD` if there are uncommitted changes (pre-commit reviews usually run before the commit exists).

If the diff is empty and no target was named, say so and stop.

## Step 3: Walk the review checklist

Go through the checklist at the bottom of the conventions doc in order, applying each item to the diff. For the mechanical items, run the doc's verification commands (for example the `withRepeat`/`scrollTo` grep) rather than eyeballing. Read the full post-change files around each hit, not just the diff hunks: gates and pauses often live a few lines away.

For each violation, report:

- **file:line** of the offending code.
- **The rule it breaks**, by section number from the doc.
- **The concrete cost**: what work, how often, on which thread (structural accounting: calls x frequency x thread), and when the player would feel it.
- **The compliant fix**, naming the existing helper or pattern the doc prescribes (pulse helpers, the audio factory, a compute-plus-sentinel action, the debounced writer, and so on).

Two special cases deserve extra suspicion:

- Changes to `src/game/simulation.ts`, `src/game/coach-reco.ts`, or anything they feed: confirm the golden suites pass unchanged and were not regenerated. A regenerated golden snapshot in a performance diff is a finding, not a convenience.
- Claims that a change is "faster" or "cheaper": ask for the structural accounting. If the win cannot be stated as removed calls, removed frames, or a removed thread hop, flag it as unproven.

## Step 4: Report

Output, in this order:

1. **Verdict**: clean, clean with notes, or violations found.
2. **Violations** (if any), each with the four fields from Step 3, ordered by player impact.
3. **Risks worth a look**: things the diff makes easier to get wrong later, or rules it comes close to breaking.
4. **Confirmed clean**: the checklist areas that were actually exercised by this diff and passed, so the reader knows what was checked rather than assuming everything was.

Keep the report tight: findings first, no praise, no restating the diff.
