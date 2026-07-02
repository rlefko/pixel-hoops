# Feel Conventions

The presentation rulebook: how a change should look, sound, and land. Every rule below was earned by a shipped decision across the juice and ceremony passes (#106, #108, #112, #118) and the arcade and roguelike research behind them; the "why" lines describe intent verified in this codebase, not folklore. Treat this file as the source of truth for feel review: the `feel-review` skill walks it, and the pre-commit feel agent checks presentation-touching changes against it.

## Prime directive

Pixel Hoops presents like an 8-bit arcade broadcast: every beat fast, every celebration proportional and honest, every channel degradable without losing meaning. Presentation READS the sim; it never bends outcomes. Two standing consequences:

1. Celebration is information. A beat that fires when nothing was earned, or that stays uniform across magnitudes, teaches the player to ignore every beat.
2. The watch's average duration is sacred. Juice rides existing gaps as overlays and one-shots; only a named, budgeted peak may spend time.

Boundaries: `docs/performance-conventions.md` owns the battery, CPU, and responsiveness mechanics (loop gating, audio player lifecycle, persistence, render hygiene); `docs/addictive-blueprint.md` owns design-level scoring (whether a feature earns its place at all). This doc owns how the built thing looks, sounds, and lands. Cross-reference them; never duplicate their rules here.

## 1. The 8-bit language

- **Colors come from the palette.** `src/theme/palette.ts` is the single named source; a diff adds no new hex literals outside `src/theme/` (legacy hex migrates as components are touched, per the palette header). Alpha via suffix concatenation on palette entries (`palette.gold + '22'`) is the sanctioned pattern.
- **Everything sits on the pixel grid.** 4px spacing unit, hard borders, square or barely rounded corners (`src/theme/metrics.ts`). This is what keeps new UI reading as 8-bit rather than smooth and modern.
- **Motion moves in whole pixels.** Snap transforms with `snapPx` or step them by integer offsets: the screen shake rattles like a CRT (`src/feel/useScreenShake.ts`), the crowd bob steps exactly 1px (`src/components/fx/PixelCrowd.tsx`). Stepped reads 8-bit; floaty sub-pixel motion breaks the fiction.
- **Art is procedural.** Plain Views, SVG, and `PixelIcons`; no bitmap sprite sheets, and never OS emoji in-app. The single emoji exception is the share-text path (`src/game/victory-share-text.ts` and the share emoji field in `victory-tier.ts`), which leaves the app.
- **Audio is baked procedural chiptune.** SFX and music come from the deterministic synth via `npm run gen:sfx` (`src/audio/recipes.ts`, `musicTracks.ts`); never recorded samples. Music may opt into the richer synthesis; SFX stay chip-simple.

## 2. Beats and pacing

- **Every beat lands inside the DUR window** (80-260ms tokens in `src/feel/timings.ts`). The old card game locked the screen for 1600ms per resolution; those tokens exist so that never returns.
- **Pace scales, sync holds.** Every per-event duration AND gap on the watch flows through `scaled(ms, speed)` (60ms floor), and a slow-mo peak stretches animation and scheduler by ONE shared constant (`WINNER_TIME_SCALE` in `src/components/game/possession.ts`), so the ball and the clock can never drift apart at any speed. Ambient loops (glow, bob, shimmer, scanlines) are never scaled. Pinned by `src/feel/__tests__/timings.test.ts`.
- **Juice the peaks, compress the routine.** Roughly 80 percent of plays are routine and whip by (`LINGER`: winner 420 / big 120 / make 30 / other 16, possession.ts); hit-stop (100ms, 140 for the winner) folds into `eventGapMs` and is zero under reduced motion.
- **The backdrop holds still; only the focal element moves** (the ball and the active player). A floor that shuffles or a camera that cuts adds motion without meaning and reads as jumpy.
- **The watch never gains average duration.** New juice rides existing gaps as overlays and one-shots. The only budgeted spends are the game-winner cinema (~250ms, at most once per game, close finishes only) and the pregame ceremony wipe (the 3-4 peak games per run). Anything else that adds milliseconds to the watch is a finding.
- **Always skippable, and skip pays off.** Skip jumps to the final beat and the ball still lands the payoff. Ceremonies never block input: buttons live immediately, reveals are tap-through.

## 3. Celebration is proportional and honest

- **Juice scales with rarity, never uniform** (`src/components/run/useRewardBurst.ts`): common is a selection tick and a faint flash; legendary is the heavy shake, bigPlay haptic, and confetti. A class promotion pops; a +1 blips. Flat feedback on everything flattens the ladder.
- **One voice at a time.** The callout slot speaks in strict precedence: clincher > streak > big play > crunch > run > sub (`src/components/game/PlayByPlayFeed.tsx`). A new banner joins the chain; it never stacks a second voice on the same beat.
- **Never celebrate a loss.** No confetti on RUN OVER; the summary shows real keeps only, and near-miss reads (the gold "1 MORE TO OWN") are static, honest state, not animated teases.
- **The crowd is the PLAYER's crowd.** Big and peak crowd beats (edge pulses, apron reactions, swells) fire for home plays only; an opponent walk-off gets silence, and the silence IS the read (`src/game/crowd-pulse.ts`; the sim can award the buzzer-beater to either side). Neutral state reads (quarter breaks, crunch lead changes) stay neutral. Pinned by `src/game/__tests__/crowd-pulse.test.ts`.
- **Badges are credible or they are nothing.** A delta chip renders only for a real earned rise, clears on VIEWING the owning surface (never on tapping the badge), and renders nothing when nothing is new (`DeltaChip`, `useHubDeltas`, `useAcknowledgeHubSeen`). A badge that points at nothing spends trust the whole system runs on.
- **Ceremonies are one-shot, enforced in persisted state.** A revisit renders settled and static; UI memory is not a guard (the `hubSeen` ledger; `BountyCrestShelf`). Pinned by `src/game/__tests__/hub-seen.test.ts`.
- **Anticipation scales with stakes, payoff with result; commons stay instant** (`src/feel/useStagedReveal.ts`). Never make a routine pull wait for a windup it did not earn.

## 4. Sound and haptics are feel channels

- **Call sites speak intent** (`sfx.dunk()`, `haptics.bigPlay()`), never player plumbing; haptics map to event semantics (selection / light / medium / success / bigPlay).
- **Tier by layers, not duration** (`TickCounter`): small is ticks only, medium adds the coin clink and a pop, large adds the success haptic. A bigger reward gets more channels, not a longer animation.
- **Repeatable cues carry pitch jitter** so repeats never sound identical (`src/feel/audio.ts`), and count ticks pace at 80ms so a capped tally sings about eight notes, coupled to TickCounter's pitch ladder. Pinned by `src/feel/__tests__/soundPolicy.test.ts`.
- **The crowd answers; it never leads.** Swells start ~90ms after the play's own sting, coalesce through 2.2-2.5s cooldowns so a flurry answers once, and never duck the music. Big stings duck with a hold scaled to their size; the quiet win cue never ducks (`src/feel/audio.ts`).
- **Ambience is unpitched noise with slow attacks** (80-220ms), so it can never sit out of key with any bed and never reads as a cue. Pinned by the gentleness pins in `src/audio/__tests__/recipes.test.ts`.

## 5. Degradation preserves semantics

- **Reduced motion changes HOW a beat lands, never WHETHER.** Under effective reduced motion (user setting or Low Power Mode): values snap, glows hold steady-lit, holds and flights are skipped, but every semantic beat still resolves (counts land, settle beats play, arrivals fire synchronously: `useCountUp`, `useFlash`, `useStagedReveal`, possession.ts's no-flight branch). Walk a change's reduced-motion path explicitly before shipping it.
- **`arcadeExtras` gates pure atmosphere only** (CrowdPulse, the crowds, the vignettes). If removing an element would lose information, it must not sit behind arcadeExtras; the play's own flash, haptics, and sfx carry the semantics.
- **Low Power Mode silences sound and music** the same way it reduces motion (`src/feel/soundPolicy.ts`). No feature may be legible ONLY through a gated channel: every meaning has a path that survives all gates.
- The mechanics of loop gating (effective reducedMotion AND a runtime pause; the pulse helpers) are performance-conventions rules. This doc adds the semantic half: the paused and steady states must still read correctly.

## 6. The architecture of presentation

- **Derive once.** Watch narratives are pure per-timeline plans (`momentum.ts`, `streaks.ts`, `crowd-pulse.ts`, `arena-tier.ts`) computed in a single memo. Budgets live in the plan (`CROWD_PULSE_BUDGET`), not scattered at call sites, so caps are testable and a wild game can never strobe.
- **Presentation never mutates the sim.** Plans read the timeline; they change what gets celebrated, never outcomes, rewards, or persisted state.
- **One-shot beats fire through imperative handles** (`FlashOverlay`, `ShakeView`, `CrowdPulse`) **or trigger-keyed wrappers** (`Pop`, `StaggerIn`, `ParticleBurst`). Never gate an async beat on render state.
- **Juice lands with the ball, not the reveal.** Outcome feedback fires on arrival (the landed-event sync in `PlayByPlayFeed`/`CourtView`), so the bucket counts and the celebration land together.
- **Color speaks a fixed language:** green = make, gold = three / and-one / peaks, steel blue = defense, red = miss (`colorForEvent`). Do not reassign meanings.
- **Escalation is contrast and density, not more motion.** The routine game's clean apron IS the elite game's signal; the stands fill deterministically per seed and never reshuffle.

## Review checklist

For any presentation-touching diff, check in order:

1. New colors: palette-only? `git diff origin/main... -- src ':!src/theme' | grep -E "^\+.*'#[0-9A-Fa-f]{3,8}'"` should return nothing (legacy hex migrates only when its component is touched).
2. New emoji: `rg -n "[\x{1F300}-\x{1FAFF}]" src/` hits only the share-text path.
3. New beats inside the DUR window, and every watch-path duration and gap through `scaled()`?
4. Celebration tiered by magnitude, and nothing celebrating a loss?
5. New callouts or banners slotted into the one-voice precedence chain, not stacked beside it?
6. Honesty gates intact: crowd channels home-only, badges only on real rises and cleared on view, ceremonies one-shot in persisted state?
7. Reduced motion: does every semantic beat in the change still land, just faster and stiller?
8. `arcadeExtras`: everything behind it pure atmosphere, nothing semantic?
9. New cues: intent-named, cooldown-bounded, pitch-jittered if repeatable, and ducking (or deliberately not ducking) per the hierarchy?
10. New presentation derivations: pure, computed once per timeline, budget-capped in the plan, mutating nothing?
