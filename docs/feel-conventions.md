# Feel Conventions

The presentation rulebook: how a change should look, sound, and land. Every rule below was earned by a shipped decision across the juice, ceremony, and audio passes (#92, #96, #100, #102, #106, #108, #112, #118) and the arcade, roguelike, and Gen IV Pokemon soundtrack research behind them; the "why" lines describe intent verified in this codebase, not folklore. Treat this file as the source of truth for feel review: the `feel-review` skill walks it, and the pre-commit feel agent checks presentation-touching changes against it.

## Prime directive

Pixel Hoops presents like an 8-bit arcade broadcast: every beat fast, every celebration proportional and honest, every channel degradable without losing meaning. Presentation READS the sim; it never bends outcomes. Two standing consequences:

1. Celebration is information. A beat that fires when nothing was earned, or that stays uniform across magnitudes, teaches the player to ignore every beat.
2. The watch's average duration is sacred; only a named, budgeted peak may spend time.

Boundaries: `docs/performance-conventions.md` owns the battery, CPU, and responsiveness mechanics (loop gating, audio player lifecycle, persistence, render hygiene); `docs/addictive-blueprint.md` owns design-level scoring (whether a feature earns its place at all). This doc owns how the built thing looks, sounds, and lands. Cross-reference them; never duplicate their rules here.

## 1. The 8-bit language

- **Colors come from the palette.** `src/theme/palette.ts` is the single named source; a diff adds no new hex literals outside `src/theme/` (legacy hex migrates as components are touched, per the palette header). Alpha via suffix concatenation on palette entries (`palette.gold + '22'`) is the sanctioned pattern.
- **Everything sits on the pixel grid.** 4px spacing unit, hard borders, square or barely rounded corners (`src/theme/metrics.ts`). This is what keeps new UI reading as 8-bit rather than smooth and modern.
- **Motion moves in whole pixels.** Snap transforms with `snapPx` or step them by integer offsets: the screen shake rattles like a CRT (`src/feel/useScreenShake.ts`), the crowd bob steps exactly 1px (`src/components/fx/PixelCrowd.tsx`). Stepped reads 8-bit; floaty sub-pixel motion breaks the fiction.
- **Art is procedural.** Plain Views, SVG, and `PixelIcons`; no bitmap sprite sheets, and never OS emoji in-app. The single emoji exception is the share-text path and its tests (`src/game/victory-share-text.ts` and the share emoji field in `victory-tier.ts`), which leaves the app.
- **Audio is baked procedural chiptune.** SFX and music come from the deterministic synth via `npm run gen:sfx` (`src/audio/recipes.ts`, `musicTracks.ts`); never recorded samples. Music may opt into the richer synthesis; SFX stay chip-simple.

## 2. Beats and pacing

- **Every pacing beat lands inside the DUR window** (80-260ms tokens in `src/feel/timings.ts`). The old card game locked the screen for 1600ms per resolution; those tokens exist so that never returns. Non-blocking overlay one-shots that ride an existing gap (a crowd bob, a camera-flash twinkle) may run longer: they are governed by the no-added-duration rule below, not the window.
- **Pace scales, sync holds.** Every scheduler-held duration and gap on the watch flows through `scaled(ms, speed)` (60ms floor), and a slow-mo peak stretches animation and scheduler by ONE shared constant (`WINNER_TIME_SCALE` in `src/components/game/possession.ts`), so the ball and the clock can never drift apart at any speed. Two named exceptions stay fixed: ambient loops (glow, bob, shimmer, scanlines) are never scaled, and perceptual constants (the ~90ms crowd answer delay, the haptic burst offsets) are deliberately speed-independent because they model reaction time, not pacing. Pinned by `src/feel/__tests__/timings.test.ts`.
- **Juice the peaks, compress the routine** (the blueprint's watch-pacing rule, grounded here in code): roughly 80 percent of plays are routine and whip by (`LINGER`: winner 420 / big 120 / make 30 / other 16, possession.ts); hit-stop (100ms, 140 for the winner) folds into `eventGapMs` and is zero under reduced motion.
- **The backdrop holds still; only the focal element moves** (the ball and the active player; the blueprint's stable-backdrop rule). A floor that shuffles or a camera that cuts adds motion without meaning and reads as jumpy.
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
- **A cue's fatigue budget is its frequency of fire, not its peak gain.** A quiet cue that fires twenty times a run wears the ear down more than a loud cue that fires once, so loudness and complexity match the event's rarity tier: every-tap navigation sounds are near-silent felt air, per-game cues are whisper-brief grace notes, and the grand fanfare is reserved for the championship (`sfx.champion`). Earned across three softening passes (#100, #102, #108).
- **Softening has three levers: gain, spectrum, and attack.** The nav whoosh took all three softening passes to stop reading as a ping (gain 0.55 to 0.28 to 0.12, plus spectral darkening) because gain alone is never enough: it is now a filtered noise puff with no pitch sweep and no tone layer, and direction reads purely from the filter opening (forward) versus closing (back). Pinned by the gentleness pins in `src/audio/__tests__/recipes.test.ts`.
- **One voice per interaction; texture may ride under it.** The "disruptive click" root cause was two cues on one tap (the button's own tick plus the whoosh); the fix made the second layer felt air, not a second voice. Stings never stack on stings either: reward stings cannot land on the win cue because reward views mount only after the CONTINUE tap. That is a flow-order guarantee with no pin, so re-verify it in code whenever the postgame flow moves (the Postgame flow in `src/screens/RunScreen.tsx`).
- **Repeatable cues carry pitch jitter** so repeats never sound identical; every cooldown-listed cue inherits the jitter automatically inside `trigger()` (`src/feel/audio.ts`), so listing a cue in `RAPID_CUE_COOLDOWN_MS` is how a new repeatable sound gets both its pacing and its variation. Unpitched felt air whose cadence an outer gate already bounds (the nav whoosh behind the route wipe) is the named exception and may skip the list. The tick cadence numbers and their TickCounter coupling are performance-conventions section 2 rules; this doc adds only the anti-fatigue intent. Pinned by `src/feel/__tests__/soundPolicy.test.ts`.
- **The crowd answers; it never leads.** Swells start ~90ms after the play's own sting, coalesce through 2.2-2.5s cooldowns so a flurry answers once, and never duck the music. Big stings duck with a hold scaled to their size; quiet cues never duck (`src/feel/audio.ts`): the win cue's duck was deleted when dipping the bed ten to twenty times a run pumped the music worse than the cue ever did, and a duck riding a high-fire cue needs the big-sting justification (`dunk` and `reward` earn it; the whisper win did not).
- **Ambience is unpitched noise with slow attacks** (80-220ms), so it can never sit out of key with any bed and never reads as a cue. Pinned by the gentleness pins in `src/audio/__tests__/recipes.test.ts`.
- **Every high-fire cue ships with a gentleness pin.** The gain, duration, and no-sweep caps in `src/audio/__tests__/recipes.test.ts` are what stop later tweaks from quietly re-sharpening a softened cue; a new high-fire cue without a pin, or a loosened pin riding an unrelated diff, is a finding.

## 5. Degradation preserves semantics

- **Reduced motion changes HOW a beat lands, never WHETHER.** Under effective reduced motion (user setting or Low Power Mode): values snap, glows hold steady-lit, holds and flights are skipped, but every semantic beat still resolves (counts land, settle beats play, arrivals fire synchronously: `useCountUp`, `useFlash`, `useStagedReveal`, possession.ts's no-flight branch). Walk a change's reduced-motion path explicitly before shipping it.
- **`arcadeExtras` gates pure atmosphere only** (CrowdPulse, the crowds, the vignettes); the play's own flash, haptics, and sfx carry the semantics.
- **Low Power Mode silences sound and music** the same way it reduces motion (`src/feel/soundPolicy.ts`). No feature may be legible ONLY through a gated channel: every meaning has a path that survives all gates.
- The mechanics of loop gating (effective reducedMotion AND a runtime pause; the pulse helpers) are performance-conventions rules. This doc adds the semantic half: the paused and steady states must still read correctly.

## 6. The architecture of presentation

- **Derive once.** Watch narratives are pure per-timeline plans (`momentum.ts`, `streaks.ts`, `crowd-pulse.ts`, `arena-tier.ts`) computed in a single memo. Budgets live in the plan (`CROWD_PULSE_BUDGET`), not scattered at call sites, so caps are testable and a wild game can never strobe.
- **Presentation never mutates the sim.** Plans read the timeline; they change what gets celebrated, never outcomes, rewards, or persisted state.
- **One-shot beats fire through imperative handles** (`FlashOverlay`, `ShakeView`, `CrowdPulse`) **or trigger-keyed wrappers** (`Pop`, `StaggerIn`, `ParticleBurst`). Never gate an async beat on render state.
- **Juice lands with the ball, not the reveal.** Outcome feedback fires on arrival (the landed-event sync in `PlayByPlayFeed`/`CourtView`), so the bucket counts and the celebration land together.
- **Color speaks a fixed language:** green = make, gold = three / and-one / peaks, steel blue = defense, red = miss (`colorForEvent`). Do not reassign meanings.
- **Escalation is contrast and density, not more motion.** The routine game's clean apron IS the elite game's signal; the stands fill deterministically per seed and never reshuffle.

## 7. The composed score

- **Harmony is authored, reviewable data.** Every theme is a chord-row timeline plus per-bar note generators in `src/audio/musicTracks.ts`: "Lobby Doors" (menu, F major, 88 BPM, 44 bars), "Banner Day" (`runThemeA`, G major, 112 BPM, 88 bars), "Neon Court" (`runThemeB`, C Dorian, 112 BPM, 88 bars). The harmonic language is Gen IV Pokemon (Game Freak's Ichinose and Masuda): IV-V-iii-vi rows, ii-V pulls, I-bVII-I lifts, borrowed iv color, secondary dominants, and key lifts through pivot chords. New music extends these rows; it does not freestyle.
- **The bed stays calm; hype lives in the energy layer.** The base bed loops the whole run and must survive minute 30, so the NBA signifiers (funk bass, brass stabs, handclaps, fanfare hooks) concentrate in the lead blocks (the bars where the lead carries a hook), and the `gameEnergy` layer fades in only during the live game. Lift comes from arrangement (fills, terraced dynamics, pivot lifts), never a tempo ramp; the energy layer's BPM parity with both run themes is pinned in `src/audio/__tests__/sequencer.test.ts`.
- **Loops are craft-checked at the seam.** Loops end resolved, never on V; drum fills land mid-loop, never the final bar (`FILL_BARS` excludes the wrap bar); reverb and delay pre-roll on the loop's own tail so the wet content matches across the seam; a raised-cosine boundary fade brings the endpoints to zero. Seam and note-start bounds are pinned in `src/audio/__tests__/sequencer.test.ts`.
- **Loudness parity across bakes is a printed fact, not vibes.** `npm run gen:sfx` prints peak and RMS dBFS per file; a new or edited bed sits within about 1.5 dB RMS of the previous bake so perceived volume never jumps at the player's current slider setting. Quote the prior and new numbers in the PR: the log prints only the new bake, so the delta stays checkable only if both ends are recorded.
- **The engine's sharp edges are convention-guarded; review is the guard.** The amp release anchors to the note's duration and hard-cuts any note shorter than its attack plus decay, so short-note templates (`EP_SHORT`, `CELESTA`, `PIZZ`) must finish their envelope inside their part's shortest note; the pluck oscillator quantizes pitch above roughly C5 and ignores `freqTo`, `arp`, vibrato, and unison (the `PluckSpec` docs in `src/audio/synth.ts`); new noise voices set an explicit `noiseSeed`; music renders at 32000 Hz stereo while SFX stay 22050 Hz mono, and neither touches the other's rate; untouched legacy voices stay byte-identical (golden hashes in `src/audio/__tests__/synth.test.ts`).
- **WAV only, inside the budget.** MP3 breaks Expo SDK 56 gapless looping, so beds ship as WAV; the audio bundle budget is about 80 MB (roughly 68 MB spent), and the trim levers if it grows are mono beds or dropping one run theme.

## 8. Verifying audio without ears

- **The bake is deterministic and the diff is the proof.** `npm run gen:sfx` run twice is byte-identical; after any recipe or track change, re-bake and confirm `git diff` moves only the intended WAVs and manifests. Committed WAVs are canonical; CI never regenerates them.
- **Prove structure mechanically before anyone listens.** The standing suites are the gentleness pins, the golden voice hashes, the seam and BPM-parity tests, and the cooldown couplings in `src/feel/__tests__/soundPolicy.test.ts`; a new composition also earns throwaway validators for scale membership and bar structure, a spectrogram or waveform eyeball for the intended structure, and the bake log's peak and RMS numbers. Evidence that lives outside the diff (validator output, the prior bake's RMS) gets quoted in the PR so the proof outlives the working tree.
- **Mechanical checks prove correctness, never quality: the real gate is listening.** Every audio-touching PR carries a human audition checklist naming exactly what to listen for, and tuning knobs stay single constants (per-part gains, hook note arrays, tempo) so audition feedback is a one-line fix.

## Review checklist

For any presentation-touching diff, check in order. In the commands, `<range>` is `origin/main...` for a working-tree review or the PR's commit range for a named target.

1. New colors: palette-only? `git diff <range> -- src ':!src/theme' | grep -E "^\+.*'#[0-9A-Fa-f]{3,8}'"` should return nothing (legacy hex migrates only when its component is touched).
2. New emoji: `rg -n "\p{Emoji_Presentation}" src/` hits only the share-text path and its tests (a whole-tree invariant, not a diff check).
3. New pacing beats inside the DUR window, every scheduler-held duration and gap through `scaled()` (perceptual constants are the named exception), and zero milliseconds added to the watch outside the two budgeted peaks?
4. Celebration tiered by magnitude, and nothing celebrating a loss?
5. New callouts or banners slotted into the one-voice precedence chain, not stacked beside it?
6. Honesty gates intact: crowd channels home-only, badges only on real rises and cleared on view, ceremonies one-shot in persisted state?
7. Reduced motion: does every semantic beat in the change still land, just faster and stiller?
8. `arcadeExtras`: everything behind it pure atmosphere, nothing semantic?
9. New cues: intent-named, listed for cooldown + jitter if repeatable (unpitched felt air bounded by an outer gate is the named exception), and ducking (or deliberately not ducking) per the hierarchy, with any duck riding a high-fire cue carrying the big-sting justification?
10. New presentation derivations: pure, computed once per timeline, budget-capped in the plan, mutating nothing?
11. Touched a recipe, track, or the synth: re-baked with `npm run gen:sfx` (twice, byte-identical; for a merged target, a current-tree re-bake reproducing the committed WAVs is the evidence), `git diff <range> -- assets/audio src/audio` moves only the intended WAVs, manifests, and sources, and no golden hash or gentleness pin loosened?
12. New or louder cue: fires-per-run accounted for, loudness matched to the rarity tier, one voice per interaction (count co-firing and stacked cues), and a pin added if high-fire?
13. New or edited music: bed calm with hype in the lead blocks or the energy layer, loop resolved with fills mid-loop, and RMS within about 1.5 dB of the prior bake (prior and new numbers from the `gen:sfx` log, quoted in the PR)?
14. Audio-touching PR carries a human audition checklist, with tuning knobs left as single constants?
