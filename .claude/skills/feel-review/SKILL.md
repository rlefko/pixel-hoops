---
name: feel-review
description: Review a diff or feature against Pixel Hoops' feel conventions (the 8-bit presentation language; visual, audio, and haptic juice; celebration honesty; watch pacing; degradation semantics). Use for the pre-commit feel agent check, when the user asks for a "feel review" / "juice check" / "visual review" or whether something "lands" or "reads right", or before committing changes that touch screens, components, src/feel, src/components/fx, audio recipes or music tracks, the theme, or the watch's presentation. Reads docs/feel-conventions.md as the source of truth.
---

# Feel Review

Check a change against Pixel Hoops' feel conventions and report where it complies, where it violates a rule, and how to fix each violation.

This skill is a review tool, not a rubber stamp. Every rule in the conventions doc was earned by a shipped decision; a change that violates one should be told so with the concrete way it breaks the feel and the compliant fix, not waved through. Equally, do not invent violations: a rule that does not apply to the diff is simply not in play.

## Step 1: Load the source of truth

Read `docs/feel-conventions.md`. Its rule sections and the review checklist at the bottom are authoritative; if the doc has changed, follow the changed version, not any summary reproduced elsewhere (including this skill).

## Step 2: Gather the change under review

In priority order:

1. A target the user named (a PR number, branch, file, screen, or feature description).
2. The current working diff: `git diff origin/main...HEAD`, plus `git diff HEAD` if there are uncommitted changes (pre-commit reviews usually run before the commit exists).

If the diff is empty and no target was named, say so and stop. If the diff touches no presentation surface (pure game logic, tooling, data, docs), say so and stop: this check is only for changes the player can see, hear, or feel.

## Step 3: Walk the review checklist

Go through the checklist at the bottom of the conventions doc in order, applying each item to the diff. Run the mechanical commands (the hex grep, the emoji scan) rather than eyeballing; the other items are judgment calls, so read the full post-change files around each touched surface, not just the diff hunks: precedence chains, gates, and one-shot guards often live a few lines away.

For each violation, report:

- **file:line** of the offending code.
- **The rule it breaks**, by section number from the doc.
- **How it breaks the feel**: what the player would see, hear, or stop trusting (a flat beat, a stacked voice, a celebration on a loss, a badge that lies, a ceremony that replays).
- **The compliant fix**, naming the existing primitive or pattern the doc prescribes (the rarity burst, the callout chain, a scaled() duration, a persisted one-shot guard, an imperative handle, and so on).

## Step 4: Report

Output, in this order:

1. **Verdict**: clean, clean with notes, or violations found.
2. **Violations** (if any), each with the four fields from Step 3, ordered by how badly the player's trust or the game's pace is hurt.
3. **Risks worth a look**: things the diff makes easier to get wrong later, or rules it comes close to breaking.
4. **Confirmed clean**: the checklist areas the diff actually exercised and passed, so the reader knows what was checked rather than assuming everything was.

Keep the report tight: findings first, no praise, no restating the diff.
