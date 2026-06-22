# The Addictive Blueprint

This is the canonical reference for what makes Pixel Hoops worth playing "one more run." Every gameplay feature should be checked against it. The `addictive-blueprint` Claude skill scores proposed features against the checklist at the bottom of this document, so treat that checklist as the single source of truth and keep it current.

The goal is not dark-pattern manipulation. It is honest engagement: a tight loop, fair difficulty, visible progress, and feedback that feels good. The same mechanics that make a slot machine compulsive can make a well-designed roguelike satisfying. The difference is whether the player is rewarded for skill and learning, or only for time spent.

## The compulsion loop

Every engaging game runs a short loop with three phases. Pixel Hoops should be able to point at each phase explicitly.

1. **Anticipation.** The player forms an expectation about a reward and commits to an action. In Pixel Hoops this is choosing a lineup, setting a game plan, and choosing the next node on the run map. The stakes and the uncertainty are what create the pull.
2. **Action.** The committed decision resolves under controlled randomness. This is the auto-simmed game: fast, juicy, and legible, so the player can see why it went the way it did.
3. **Reward.** An intermittent, escalating payoff reinforces the loop: points climbing on the scoreboard, a win, a recruit, a piece of gear, a deeper run than last time. The reward then seeds the next anticipation phase.

A feature that does not clearly serve one of these three phases is probably not pulling its weight.

## The five pillars

These come from studying the genre's most successful games (see Sources). They are the lenses we design through.

### 1. Synergy-first construction (Balatro, Slay the Spire, Luck be a Landlord, pokelike)

Depth should come from how pieces combine, not from how many buttons the player presses. In pokelike the entire game is team composition and type coverage; combat is automatic. Pixel Hoops mirrors this: the interesting decisions are which five players share the floor, how their positions and stats combine into synergies, and what game plan amplifies them. Synergies should be discoverable rather than spelled out, so finding a strong lineup feels like the player's insight. Aim for most lineups being viable and no single dominant build.

### 2. Escalating challenge and power fantasy (Vampire Survivors, Risk of Rain 2)

Difficulty should compound across a run while the player's power compounds alongside it, creating the central tension: can I grow faster than the bracket does? Early rounds are gentle and teach by playing. Later rounds demand a tuned roster and a sharp game plan. Between runs, permanent progression makes the next attempt slightly easier, so no run is wasted.

### 3. Snappy, layered feedback (game juice)

Every meaningful moment should stack several feedback channels at once so it reads as a single satisfying beat: a made dunk fires a screen shake, a color flash, a count-up on the scoreboard, an arcade callout, and a haptic pulse together. Feedback must be fast. The old card game locked the screen for 1600ms per resolution; the target is 80 to 260ms per beat, with the whole game watchable in a few seconds and skippable on demand. Snappy beats slow even when slow is "prettier."

### 4. Short, interruptible sessions (Balatro, Slice and Dice, mobile roguelikes)

A run should fit a commute or a coffee break and should feel complete when it ends, win or lose. The player should be able to put the phone down between any two decisions and pick up exactly where they left off. Failed runs still grant meta-progression, so quitting never feels like losing ground. Target a median run well under the genre's 20 to 40 minute window, since basketball games auto-sim in seconds.

### 5. Variable-ratio rewards and near-misses (the slot-machine insight, used honestly)

Unpredictable rewards condition behavior more strongly than predictable ones. Recruit offers, gear drops, and synergy payoffs should vary run to run so the player keeps pulling the lever. Near-misses matter: losing a close game in the final quarter should feel "so close," which drives an immediate retry, as long as the loss is legible as a beatable mistake and not unfair RNG.

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

## Auto-sim agency: keeping a watched sim engaging

Pixel Hoops auto-sims games, so the player does not control each possession. Auto-battlers (TFT, Super Auto Pets) and management sims (Football Manager) show this works when:

- **Pre-game decisions are consequential.** Lineup, synergies, and game plan should be the real game. A loss should read as "my roster or plan was wrong," not "the dice hated me."
- **Outcomes are opaque but fair.** The player should not be able to predict the exact score, but strategy should clearly move the odds.
- **The watch is short and skippable.** A few seconds of juicy play-by-play, with skip and fast-forward, respects the player's time.
- **Post-game is legible.** It should be obvious which players carried the game and where the plan succeeded or failed, so the next decision is informed.

The engine is built as simulate then replay, so a future crunch-time decision (a Q4 timeout where the player picks pound-inside, chuck-threes, or full-court-press) can pause the replay and resume with the chosen bias, without changing the architecture.

## The checklist

A feature should satisfy at least **12 of these 15**. The skill scores each as pass, partial, or fail, and flags the gaps. Phrase every new criterion as a yes/no test.

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

11. **Short and tight.** It fits a short session and keeps decision density high.
12. **Interruptible.** The player can stop between decisions and resume without loss.

**Polish and feel**

13. **Snappy, layered juice.** Feedback stacks multiple channels and lands in well under half a second.
14. **Anticipation and pacing.** The feature builds toward its payoff and avoids dead time.
15. **Clear agency.** The player understands why they won or lost; failure teaches.

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
