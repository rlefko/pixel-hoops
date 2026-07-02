# Performance Conventions

The hard-won rules from eight performance passes (#80, #81, #88, #90, #109, #111, #112, #114). Every rule below was earned by a real, verified defect: the "why" lines describe mechanics confirmed in this codebase or in native library source, not folklore. Treat this file as the source of truth for performance review; the `perf-review` skill walks it, and the pre-commit performance agent checks every change against it. This doc owns the battery, CPU, and responsiveness mechanics; how a change should look, sound, and land lives in `docs/feel-conventions.md` (the `feel-review` skill).

## Prime directive

Battery, CPU, and tap-to-paint responsiveness are first-class product constraints, equal to gameplay design. Pixel Hoops should be a lightweight, flight-friendly game: no heat, no drain, no dead taps. Two standing consequences:

1. The simulator and the coach lineup search are pure, seeded, and deterministic. Performance work on them must be provably output-identical, pinned by golden tests recorded before the change.
2. Presentation work must stay behavior-close and interactive-first: it is always acceptable to remove invisible work, and never acceptable to trade a tap's responsiveness for a flourish.

## 1. Animation and motion

- **Every infinite `withRepeat` loop gates on effective `reducedMotion` AND a runtime pause.** Effective reduced motion is `userSetting || lowPowerMode` (from `useFeelSettings`; Low Power Mode forces the whole juice layer down, #90). The runtime pause is `useIdle` (via `useHubBackdrop` on hub screens) for screens the player stares at, or a condition like `!hot` / `!isReachable` for elements that only sometimes animate. A loop that checks only reducedMotion is a defect (#80, #88).
- **Reuse the canonical pulse helpers** in `src/feel/usePulse.ts` (`useGlowPulse`, `useBobPulse`, `useScalePulse`); they hold steady under `reducedMotion || paused` and cost zero loops while paused. Do not hand-roll a repeat loop.
- **Never add always-on work to the live game watch** (`CourtView`, `PlayByPlayFeed`). The watch is event-driven, not per-frame; that property is what makes the whole app cheap (#80).
- **Pure-atmosphere flourishes also gate behind the `arcadeExtras` setting.**
- **Off-screen screens freeze** (`freezeOnBlur` on the stacks, #88). Do not rely on a blurred screen's loops being cheap; rely on them being frozen.
- **Never animated-scroll a screen the player is about to tap.** During an animated `scrollTo`, React Native delivers a tap to the scroll-canceller, not to the child Pressable: the first tap silently stops the scroll and the player reads it as a stall (#114). Land in position instead (the run map uses a `useLayoutEffect` ref jump before the first frame paints). Do not use a controlled `contentOffset` prop (re-renders can snap a manually scrolled view back) and do not set `canCancelContentTouches={false}` (it breaks drag-to-scroll started on child tiles).
- **Heavy screen mounts land behind the wipe's full cover.** `TransitionProvider.run` holds the cover until the destination's commit paints (`afterCommit`, double `requestAnimationFrame`); the reveal must never race a heavy mount (#111).
- Verify on any diff: `git diff origin/main... | grep -E '^\+.*(withRepeat|scrollTo)'` and confirm each hit's gates.

## 2. Audio

- **Create players only through `src/feel/audioPlayers.ts`, never `createAudioPlayer` directly.** The factory passes a quiet `updateInterval`: on Android every expo-audio player runs an unconditional main-thread wakeup loop at that interval for its entire lifetime, even paused (the 500ms default across ~37 resident players cost ~74 wakeups per second, #109). It also owns `ensureAudioMode`, which must complete before any player exists.
- **Load lazily, gate everything.** Music beds load per declared context through `music.ts`'s desired/applied `sync()` reconciler; boot loads only the menu bed, a run loads its one theme plus the energy layer, and nothing loads or plays while music is off, backgrounded, or in Low Power Mode (#109).
- **Bound rapid cues; every `play()` is expensive.** One SFX shot is 3-4 native calls plus observer re-registration inside expo-audio's `play()`. Rapid-fire cues take per-name cooldowns from `RAPID_CUE_COOLDOWN_MS` in `src/feel/soundPolicy.ts` (taps and toggles 45ms; count ticks 80ms so a capped 600ms tally sings ~8 notes, matching TickCounter's 8-step pitch ladder; tests pin these couplings, #112).
- **Skip no-op native writes.** Both `music.ts` and `audio.ts` keep `lastVolume` caches and only write a player's volume when the computed value changed (#109, #112).
- **Volume tweens exist only while a fade runs and cancel on deactivate.** Backgrounding halts all tweens and resets the duck factor; a silent bed costs zero bridge calls during a duck (#109).

## 3. Reducers and the tap path

- **Reducer actions on tap paths are O(1).** The run machine executes synchronously inside React dispatch, so a slow action blocks the very tap that fired it. Heavy derived work belongs in a pure exported `compute*` function scheduled after the tap's frame commits (`InteractionManager.runAfterInteractions`), landing through a guarded sentinel action. Follow the `computeCoachRec` / `setCoachRec` pattern in `src/game/run-machine.ts` and `src/hooks/useRun.ts`: `undefined` means not computed yet, `null` means resolved, and the reducer refuses stale or duplicate landings (#111).
- **Keep the slow-action warning wired.** `withSlowActionWarning` (`src/game/dev-timing.ts`) wraps the run reducer in dev and warns on any action at or over 16ms. When touching the reducer, run a hard S/S+ run in dev and watch for `[run] slow action` lines.
- **Persistence is debounced, never on a tap.** All stores write through the shared debounced writer (`src/storage/debouncedWriter.ts`), which coalesces bursts and flushes on background (#81). Never `JSON.stringify` a store synchronously in a tap handler or reducer.

## 4. React render hygiene

- **Virtualize long card lists.** Locker, roster, arcade loadout, and draft pool use `FlatList`; hundreds of mounted `PlayerCard`s was the app's worst freeze (#81).
- **Memoize repeated SVG-heavy tiles and keep their callbacks identity-stable.** `MapNodeTile` is `React.memo`'d; `useRun` splits its actions into dispatch-only closures (memoized once; `dispatch` is stable) and home-roster closures, so `actions.chooseNode` never churns on a coin bank (#111). New run actions go in the right group.
- **Narrow `useMemo` deps to what the computation reads.** The pregame screen memoizes team builds and identities on the core/roster inputs, so a phase-only dispatch (like the coach scout landing) rebuilds nothing (#111).
- **Count-ups stay leaf-local and quiet.** Counter state lives in leaf components (one `Text`); `useCountUp` commits only real integer changes and stops its rAF loop the moment the display lands on the target (#112). Do not reintroduce per-frame setState.
- **No cargo-cult memoization.** Memoization has its own cost; it is only justified where re-renders are frequent or the subtree is heavy. Documented rejections that should stay rejected without new evidence: memoizing `BoxScoreView`/`LineupBoard` (never mounted during the feed), conditionally mounting `FlashOverlay`, converting `useCountUp` to a worklet, court rasterization, `expo-image` for bundled logos, and the `tendencyFor` sim cache (#88, #90).

## 5. Optimization discipline

- **Golden tests first, and never regenerate them for performance work.** Before optimizing deterministic code, record characterization tests pinning exact outputs (`src/game/__tests__/golden-master.test.ts` for the sim, `src/game/__tests__/coach-reco-golden.test.ts` for the lineup search). They may be regenerated only for an intentional gameplay change.
- **Exactness arguments, not vibes.** A pruning or reordering optimization needs a proof sketch against the real code: monotone terms, strict-inequality tie-breaking, no floating-point regrouping (addition is not associative). The coach-search pruning in `src/game/coach-reco.ts` is the model (#111).
- **Verify claimed native costs in source before fixing.** The decisive facts in these passes came from reading `node_modules` internals (expo-audio's per-player wakeup loop and observer churn, ScrollView's tap-cancel semantics), not from assumptions. A fix aimed at an unverified cost is a guess.
- **Account costs structurally**: calls x frequency x thread. "~95 team builds per tap on the JS thread" decides priorities; "it feels slow" does not.
- **Calibrate symptoms to the build type.** Dev-mode JS runs roughly 10-50x slower than release; a release-build stall implicates native-side work (mounts, animations, scroll semantics) more than pure JS math.
- **Prefer removing work over spreading it, and document rejections.** Every pass shipped a "deliberately not done" list with reasons; keep that honesty. An optimization that cannot show its win structurally should not ship.

## 6. Known debts

- `PlayerCard` glow loops on LEGENDARY and zenith cards run with no idle pause on long-lived screens (roster, locker, lineup builder). Ordinary cards are already paused (`paused: !legendaryGlow` on the name glow, `paused: !animated` on the tier badge), so this bites only when a legendary or zenith card is visible; fixing it properly needs a `paused` prop threaded through ~20 mount sites (recorded as future work in #112).

## Review checklist

For any diff, check in order:

1. New `withRepeat` or animation loop: gated on effective reducedMotion AND a runtime pause? Uses the pulse helpers?
2. New `scrollTo` or scroll behavior: can it eat a tap the player is about to make?
3. New audio: created via the factory? Cue bounded? Loads gated on enabled/foreground/low-power?
4. New reducer work: O(1) on tap paths? Heavy derivation moved behind a sentinel action?
5. New synchronous persistence, `JSON.stringify`, or unbounded loop on an interaction path?
6. New list of cards/tiles: virtualized or memoized with stable props?
7. Touches sim/coach-search math: golden tests recorded first and passing unchanged?
8. Any per-frame or per-event work added to the live watch?
