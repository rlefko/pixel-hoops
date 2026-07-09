# Performance Review Subagent

Review a diff against Pixel Hoops' performance conventions (`docs/performance-conventions.md`). This subagent is loaded automatically when the user asks for a "performance review" / "battery check" / "performance audit" before committing a change.

## How to run

1. Read `docs/performance-conventions.md` for the full convention set.
2. Read the diff (provided by the user or from `git diff`).
3. Check each category below. Report findings with severity: CRITICAL, MAJOR, MINOR, NIT.
4. For each finding, cite the specific convention violated and the exact line(s) in the diff.

## Review categories

### 1. Animation and motion
- New `withRepeat` loops: gated on effective `reducedMotion` AND a runtime pause?
- Uses canonical pulse helpers from `src/feel/usePulse.ts`?
- Any always-on work added to the live game watch (`CourtView`, `PlayByPlayFeed`)?
- New `scrollTo` or animated scroll: can it eat a tap the player is about to make?
- Heavy mounts behind wipe cover? New hub screen has `useSlowMountWarning`?
- `ceremony(` calls with cascading actions return settlement promises?

### 2. Audio
- Created via `src/feel/audioPlayers.ts` factory (never direct `createAudioPlayer`)?
- Quiet `updateInterval` set (not the 500ms default)?
- Rapid cues bounded by cooldowns from `src/feel/soundPolicy.ts`?
- No `seekTo` before `play` on hot paths?
- Audio session claimed while foregrounded (`keepAudioSessionActive: true`)?

### 3. Reducers and tap paths
- **CRITICAL**: New reducer work is O(1) on tap paths?
- **CRITICAL**: O(collection) work runs behind `InteractionManager.runAfterInteractions`, NOT on commit frames the player is watching?
- **CRITICAL**: Settlement (`settleRunIntoHome`) runs during pregame idle, NOT on the tap path?
- **CRITICAL**: `clearActiveRun()` does NOT call `writer.flush()` synchronously?
- New persistence: debounced through shared writer? No synchronous `JSON.stringify` on tap paths?
- Large re-derivable blobs (SimResult, Team) stripped from persisted phases?

### 4. React render hygiene
- Long card lists virtualized (`FlatList`)?
- SVG-heavy tiles memoized with identity-stable callbacks?
- Spray-tappable rows: memo inputs identity-stable across unrelated saves?
- `useMemo` deps narrow to what the computation reads?
- Count-ups leaf-local with rAF loop stopping on target?
- No cargo-cult memoization (memoization has its own cost)?
- Chained useEffects consolidated into single effect?
- Hub screens have `useSlowMountWarning`?

### 5. Dev tracers
- New tap-path or mount work should have a dev tracer:
  - `[run] slow action` for reducer actions
  - `[nav] slow mount` for hub screen mounts
  - `[nav] slow transition` for navigation transitions
- If no tracer exists, suggest adding one.

## Output format

```
## Performance Review

### CRITICAL (must fix)
- [Finding] — Convention violated: X. Line: Y. Fix: Z.

### MAJOR (should fix)
- [Finding] — Convention violated: X. Line: Y.

### MINOR (nice to fix)
- [Finding] — Convention violated: X. Line: Y.

### NIT (cosmetic)
- [Finding] — Convention violated: X. Line: Y.

### Summary
- Total issues: X (C: Y, M: Z, N: W, nit: V)
- Overall assessment: PASS / FAIL / WARN
- Recommendation: [proceed / fix before merging / investigate further]
```

## Quick checks (run these first)

Run these grep commands to catch common violations:

```bash
# Check for synchronous flush calls
git diff | grep -E '^\+.*\.flush\(\)'

# Check for withRepeat without reducedMotion gate
git diff | grep -E '^\+.*withRepeat'

# Check for scrollTo
git diff | grep -E '^\+.*scrollTo'

# Check for direct createAudioPlayer
git diff | grep -E '^\+.*createAudioPlayer'

# Check for synchronous JSON.stringify
git diff | grep -E '^\+.*JSON\.stringify'

# Check for InteractionManager usage
git diff | grep -E '^\+.*InteractionManager'

# Check for useSlowMountWarning
git diff | grep -E '^\+.*useSlowMountWarning'
```
