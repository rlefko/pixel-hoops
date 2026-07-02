# The Addictive Blueprint

This is the canonical reference for what makes Pixel Hoops worth playing "one more run." Every gameplay feature should be checked against it. The `addictive-blueprint` Claude skill scores proposed features against the checklist at the bottom of this document, so treat that checklist as the single source of truth and keep it current.

The goal is not dark-pattern manipulation. It is honest engagement: a tight loop, fair difficulty, visible progress, and feedback that feels good. The same mechanics that make a slot machine compulsive can make a well-designed roguelike satisfying. The difference is whether the player is rewarded for skill and learning, or only for time spent.

## The compulsion loop

Every engaging game runs a short loop with three phases. Pixel Hoops should be able to point at each phase explicitly.

1. **Anticipation.** The player forms an expectation about a reward and commits to an action. In Pixel Hoops this is choosing a lineup (which also sets the team's tempo and shot tendencies automatically) and choosing the next node on the run map. The stakes and the uncertainty are what create the pull.
2. **Action.** The committed decision resolves under controlled randomness. This is the auto-simmed game: fast, juicy, and legible, so the player can see why it went the way it did.
3. **Reward.** An intermittent, escalating payoff reinforces the loop: points climbing on the scoreboard, a win, a recruit, a piece of gear, a deeper run than last time. The reward then seeds the next anticipation phase.

A feature that does not clearly serve one of these three phases is probably not pulling its weight.

## The five pillars

These come from studying the genre's most successful games (see Sources). They are the lenses we design through.

### 1. Synergy-first construction (Balatro, Slay the Spire, Luck be a Landlord, pokelike)

Depth should come from how pieces combine, not from how many buttons the player presses. In pokelike the entire game is team composition and type coverage; combat is automatic. Pixel Hoops mirrors this: the interesting decisions are which five players share the floor, how their positions and stats combine into synergies, and what tempo and shot tendencies that roster shape produces. Synergies should be discoverable rather than spelled out, so finding a strong lineup feels like the player's insight. Aim for most lineups being viable and no single dominant build. Set and duo bonuses (a run-and-gun trio, a passer plus a rim runner) and boost-draft agency (a hard-capped banish, rarity pity) widen build expression, while the banish cap and an offline balance batch-sim keep any single piece from dominating. See [dynamic-power-systems.md](dynamic-power-systems.md).

### 2. Escalating challenge and power fantasy (Vampire Survivors, Risk of Rain 2)

Difficulty should compound across a run while the player's power compounds alongside it, creating the central tension: can I grow faster than the bracket does? Early rounds are gentle and teach by playing. Later rounds demand a tuned, well-shaped roster. Between runs, permanent progression makes the next attempt slightly easier, so no run is wasted.

### 3. Snappy, layered feedback (game juice)

Every meaningful moment should stack several feedback channels at once so it reads as a single satisfying beat: a made dunk fires a screen shake, a color flash, a count-up on the scoreboard, an arcade callout, and a haptic pulse together. Feedback must be fast. The old card game locked the screen for 1600ms per resolution; the target is 80 to 260ms per beat, with the whole game watchable quickly and skippable on demand at a default-fast playback speed (see "Pacing the watch"). Snappy beats slow even when slow is "prettier."

### 4. Short, interruptible sessions (Balatro, Slice and Dice, mobile roguelikes)

A run should fit a commute or a coffee break and should feel complete when it ends, win or lose. The player should be able to put the phone down between any two decisions and pick up exactly where they left off. Failed runs still grant meta-progression, so quitting never feels like losing ground. Target a median run well under the genre's 20 to 40 minute window, since basketball games auto-sim in seconds.

### 5. Variable-ratio rewards and near-misses (the slot-machine insight, used honestly)

Unpredictable rewards condition behavior more strongly than predictable ones. Recruit offers, gear drops, and synergy payoffs should vary run to run so the player keeps pulling the lever. Reward *magnitudes* vary too: most stat pickups are a textured +1 to +3 rather than a uniform notch, rares trade a small downside for a sharper upside, and a small chance rolls one rarity band higher (a "hot" jackpot), so the size of the next reward is never fully predictable and a high roll lands as a genuine spike. Near-misses matter: losing a close game in the final quarter should feel "so close," which drives an immediate retry, as long as the loss is legible as a beatable mistake and not unfair RNG. Several dynamic systems feed this directly: snowball boosts and items grow each win (the "one more game so it ticks up" pull), comeback hooks make a trailing team surge in the clutch, and a run-scoped pity biases the draft toward epic+ after a drought so a long dry streak still pays off (the honest jackpot floor), and a free, hard-capped banish lets the player drop a boost from the rest of the run to steer toward a synergy.

Variable rewards also need a budget for their opposite: see "Collection pacing and the directed chase" below for how much determinism (pity, favor, chosen targets) a chase can absorb before the anticipation phase dies, and which half of a reward (identity vs timing) should stay uncertain.

## Collection pacing and the directed chase

The collection is the medium-term game: runs are the short loop, and owning the next player is the chase that strings runs together. Five rules keep that chase honest, drawn from the games that got it right (Hades) and wrong (Dragalia Lost), and from the pity-system literature.

- **Structural no-leak.** A class's real chase is completed only by content of its own tier. Below-tier content may grant a taste (a single copy, a provisional loan), never the full chase at full speed, no matter what multipliers are active. Brawl Stars applies the blunt form (top rarities are simply absent from low-tier drops); ours is the floored form: reach-up rewards are hard-capped at one copy and reach-up favor earns at half rate. Consolation channels (milestone banking, loss floors) obey the same rule and must stay strictly weaker than clearing, or they become the optimal farm.
- **The excitement window.** A directed chase should resolve in a tuned band of dedicated runs: roughly four to eight for a class-above target, eight to twenty for a top-tier star, with the full-tier completionist arc measured in dozens. Faster devalues the reward and burns the content (Dragalia Lost died partly on over-generous pacing); slower reads as a wall and churns the player. When a chase resolves too fast, the fix is to slow the leak, not to add a new grind.
- **Deterministic floors under variable surfaces.** Every variable chase carries a visible floor the player can state in one sentence: pity that rises, favor that is earned by winning with the player you want (the Hades keepsake pattern: deterministic, effort-priced, legible). Floors are earned by winning, never by time spent or by losing on purpose; a floor that accrues on losses pays the player for playing badly.
- **The certainty budget.** A reward system can afford only so much determinism before anticipation dies. Spend certainty on IDENTITY (who the chase resolves to: a chosen scout target, a favored legend) and keep chance on TIMING and TEXTURE (whether the run clears, when the reveal fires, which recruits appear). A system that is certain in both dimensions is a spreadsheet; a system certain in neither is a slot machine. Every deterministic guarantee added must leave at least one variable surface on the same reward.
- **Overflow converts.** Any meter or duplicate that passes its threshold converts to visible value (coins, progress on the next target), never evaporates. A meter the game asked the player to fill must pay out even when the chase resolves another way.

See [favor-system.md](favor-system.md) for the shipped implementation (favor, scout targets, the reach-up cap) and the pacing simulation that locks the bands.

## Game feel: concrete juice techniques

Drawn from Vlambeer's "Art of Screenshake" and the "Juice it or lose it" talk. Layer these; do not rely on any one alone.

- **Screen shake** on impact (dunks, blocks, big runs). Small and snappy, on whole pixels, so it rattles like a CRT.
- **Hit-stop / freeze frame** for a beat or two on the biggest plays, to add weight.
- **Squash, stretch, and scale-pop** on score changes and callouts.
- **Color flash** for instant make/miss confirmation.
- **Count-up tweens** so numbers visibly climb rather than snapping.
- **Snappy easing** (fast-in, short) rather than slow floaty lerps. For an 8-bit read, quantize motion into discrete steps.
- **Layered, pitch-varied audio** (deferred to the audio pass) and **haptics** mapped to event semantics (selection, success, big play, miss).
- **Anticipation before payoff**: a short wind-up or a held beat before the reward lands.
- **Rarity-gated reward bursts**: a reward pickup (boost draft pick, gear drop) fires a screen shake, color flash, and haptic scaled by rarity, so a capstone or a hot jackpot roll lands louder than a common, and a class promotion pops the player's tier badge. Built from the shared `src/feel` hooks (`useRewardBurst`) and gated by `FeelSettings`, so the juice scales with the reward instead of being a flat beat on everything. The draft's banish control fires its own small burst through the same hook, so the agency lands as feedback rather than a silent button.

## Auto-sim agency: keeping a watched sim engaging

Pixel Hoops auto-sims games, so the player does not control each possession. Auto-battlers (TFT, Super Auto Pets) and management sims (Football Manager) show this works when:

- **Pre-game decisions are consequential.** Lineup and synergies should be the real game, including the tempo and shot tendencies the roster shape produces. A loss should read as "my roster was wrong," not "the dice hated me."
- **Outcomes are opaque but fair.** The player should not be able to predict the exact score, but strategy should clearly move the odds.
- **The watch is short, default-fast, and skippable.** The replay is decoupled from the sim (the engine emits a timeline, the UI replays it), so its length is a presentation choice. Target tens of seconds at the default speed, not minutes. Default to a brisk playback speed with chill and blitz tiers, plus an optional condensed highlights mode. See "Pacing the watch" below.
- **Post-game is legible.** It should be obvious which players carried the game and where the plan succeeded or failed, so the next decision is informed.

The engine is built as simulate then replay, so a future crunch-time decision (a Q4 timeout where the player picks pound-inside, chuck-threes, or full-court-press) can pause the replay and resume with the chosen bias, without changing the architecture.

## Pacing the watch: default-fast, juice the peaks

A watched sim lives or dies on pacing. Research across roguelikes, auto-battlers, and sports sims (see Sources) points to a consistent set of principles. The apparent tension between "juicy animation" and "a short, snappy loop" is false: the fix is to spend animation time only where it pays off.

- **Default fast; a skip button is a symptom.** If players reach for skip, the default is too slow. Make the default playback brisk and offer slower and faster tiers, rather than shipping a slow default with a speed-up. Skipping should feel like giving something up, not escaping a chore.
- **Juice the peaks, compress the routine.** Roughly 80 percent of plays are routine (misses, ordinary makes); animating them at full weight is what makes a watch drag. Give the big moments (dunks, threes, blocks, the game-winner) the full hit-stop and weight, and let routine plays whip by. A condensed highlights mode that elides routine non-scoring plays is a legitimate, time-respecting option.
- **Do not thrash the backdrop; move the focal element.** Constant repositioning of the whole scene (a floor that shuffles every possession, a camera that cuts back and forth) reads as jumpy and adds motion without meaning. Keep the backdrop stable and move only the focal element (the ball and the active player). This is calmer and faster at once.
- **The watch is a reward, not a tax.** Anticipation-then-payoff, variable rewards, and reactive flourishes (a hot-streak callout, a buzzer-beater) make watching feel earned. Dead time between beats is the enemy; compress it.
- **Pace scales, sync holds.** When you add a speed control, scale the event cadence and the animation durations by the same factor so the action stays in sync at every speed.

## The checklist

A feature should satisfy at least **14 of these 18**. The skill scores each as pass, partial, or fail, and flags the gaps. Phrase every new criterion as a yes/no test.

**Core loop and feedback**

1. **Serves a loop phase.** The feature clearly belongs to anticipation, action, or reward.
2. **Immediate feedback.** Every player action produces an instant audio-visual-haptic response.
3. **Visible progression.** Something the player cares about visibly climbs during play, not only in an end screen.
4. **Session completeness.** The feature has a natural endpoint that feels finished, not truncated.

**Reward mechanics**

5. **Variable-ratio rewards.** Payoffs vary in timing or value run to run rather than being fully predictable.
6. **Escalating stakes.** Challenge rises as the run progresses, creating mounting tension.
7. **No wasted runs.** Even on failure, the player keeps meta-progression or knowledge.

**Decisions and build variety**

8. **Meaningful choice.** The decision measurably changes the outcome (roughly 10 to 25 percent swing), not a cosmetic pick.
9. **Build variety.** Most reasonable approaches are viable; there is no single dominant strategy.
10. **Synergy discovery.** Interactions are discoverable through play rather than requiring a manual.

**Session design**

11. **Short and tight.** It fits a short session and keeps decision density high. A watched moment is default-fast (tens of seconds, not minutes) with the routine compressed.
12. **Interruptible.** The player can stop between decisions and resume without loss.

**Polish and feel**

13. **Snappy, layered juice.** Feedback stacks multiple channels and lands in well under half a second.
14. **Anticipation and pacing.** The feature builds toward its payoff and avoids dead time. It juices the peaks and compresses the routine, and its default speed is fast enough that skipping is rare.
15. **Clear agency.** The player understands why they won or lost; failure teaches.

**Collection and chase pacing**

16. **Honest floor.** Any variable reward chase the feature touches has a visible, win-earned deterministic floor the player can state in one sentence.
17. **No leak-through.** The feature cannot complete a higher tier's chase at full speed from lower-tier or consolation content; clearing strictly dominates every alternative channel to the same reward.
18. **Overflow converts.** Any meter, duplicate, or progress the feature grants converts to visible value past its threshold rather than evaporating.

## Sources

- pokelike.xyz, a Pokemon roguelike autobattler: branching map, team-building as the strategic core, automatic combat, permadeath, meta-progression.
- Balatro: simple rule with deep synergies, exponential score escalation, juicy "numbers go up" feedback.
- Slay the Spire: branching map, distinct build archetypes, discoverable synergies, small curated decks.
- Vampire Survivors: power-fantasy escalation, constant reward trickle, meta-progression so no run is wasted.
- Luck be a Landlord, Dome Keeper, Backpack Hero: synergy-engine and spatial-constraint design.
- Vlambeer, "The Art of Screenshake" (Jan Willem Nijman); Martin Jonasson and Petri Purho, "Juice it or lose it": concrete game-feel techniques.
- Daniel Cook, "The Chemistry of Game Design"; Raph Koster, "A Theory of Fun": the loop and mastery psychology.
- Compulsion-loop and variable-ratio-reward literature: the structure underneath "one more run."
- Auto-battlers (TFT, Super Auto Pets) and Football Manager: keeping a watched simulation engaging through consequential pre-game decisions.
- Supergiant, Hades: keepsakes and gifting as deterministic, earned favor; the legible floor under a variable run.
- Dragalia Lost postmortems: over-generous acquisition pacing devalues the chase and starves the content treadmill.
- Brawl Stars odds disclosures and mainstream pity systems (guaranteed-progress meters): structural rarity gating and deterministic floors as perceived fairness, with identity guaranteed and timing left variable.

On pacing the watch (default-fast, juice the peaks, do not thrash the backdrop):

- Parry Everything, "If your game needs a 'skip animations' button it's too slow": skipping is a symptom of slow defaults. https://parryeverything.com/2022/01/21/if-your-game-needs-a-skip-animations-option-its-too-slow/
- Grid Sage Games, "Animation vs. pacing dilemma in modern roguelikes": even quick animations cost player time once familiar; default to fast. https://www.gridsagegames.com/blog/2014/01/animation-vs-pacing-dilemma-modern-roguelikes/
- Vlambeer, "The Art of Screenshake": juice is many small effects layered on the impactful moments, not longer animations everywhere. https://www.youtube.com/watch?v=SkgkIXZ_13Y
- Slay the Spire, GDC "Metrics-Driven Design and Balance": pacing tuned with data; the intent system removes downtime. https://gdcvault.com/play/1025731/-Slay-the-Spire-Metrics
- Football Manager and NBA 2K simulation-speed presets, and Backpack Battles / Super Auto Pets round pacing: speed tiers that default brisk, with condensed and full views.
- Supergiant, Hades: making a repeated watch feel fresh and rewarding through reactive, variable moments rather than longer scenes.
