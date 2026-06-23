# Pixel Hoops - Game Concept

> **The core loop:** Pixel Hoops is an **auto-sim 5-on-5 roguelike**: build a five, set a game plan, and watch a fast, juicy simulation, with agency in the roster and a branching run map. See **[gameplay-redesign.md](gameplay-redesign.md)** for the moment-to-moment loop, **[stat-and-sim-system.md](stat-and-sim-system.md)** for the ratings and simulation engine, and **[addictive-blueprint.md](addictive-blueprint.md)** for the design principles behind it.

## Overview

Pixel Hoops is a roster-driven basketball roguelike for mobile. You build a roster of 8-bit pixel players with unique ratings and abilities, then send them into procedurally-generated tournament brackets. Before each game you set your starting five and a game plan, then watch a fast, possession-by-possession simulation play out with arcade juice. Win games to advance. Recruit defeated opponents. Build the ultimate underground team.

> "The best casual games are deceptive: simple on the surface, deep underneath." -- Daniel Ammann, Flappy Bird creator

## Design Pillars

1. **One-thumb strategy** -- every action is tap-to-play, no timing or reflexes needed
2. **Instant restart** -- from loss to "try again" takes under 5 seconds (Archero pattern)
3. **Meaningful death** -- every run leaves you with something permanent (players recruited, training earned) so no session feels wasted
4. **Compounding roster growth** -- your team evolves across runs; each player gains stats and unlocks abilities
5. **NBA Jam arcade energy** -- bright retro sports entertainment, crowd hype, "and-one" callouts, exaggerated pixel animations

## Psychological Research Foundation

This concept is built on findings from the roguelike genre's most successful games:

- **Balatro** ($15 price, 150+ jokers, zero instructional writing): reached 50 million users in its first week. Its success comes from exponential scaling (target scores multiply 1.5x-2x per phase), hidden mathematical interactions between modifiers that create emergent strategy, and a design where losses feel like player miscalculations not unfair randomness (eJAW analysis).
- **Vampire Survivors** (Bafta Best Game 2023): near-miss effect engineered like casino mechanics -- runs failing just before the 30-minute threshold feel "almost successful" and trigger immediate retries. Level-ups every ~23 seconds maintain constant engagement without breaking flow (The Conversation analysis).
- **Archero** (Habby): pioneered one-thumb portrait-mode roguelite design with instant restart under 5 seconds, first XP orb spawning at game start for interaction within 0-5 seconds, and the "unfolding formula" -- lock RPG systems behind gradual day-by-day unlocks rather than dumping them all at once (mobile gamereport analysis).

These games share a DNA: short runs → permanent progression → slightly easier next run → repeat. No run is ever wasted.

## Core Gameplay Loop

```
Build Roster → Enter Tournament → Set Five + Game Plan → Watch the Sim → Win Games → Recruit Opponents → Repeat
```

### Run Structure

Each run starts from the main menu as a fresh tournament bracket (5-7 opponents with procedurally-generated rosters). Between runs you use earned resources to permanently upgrade your home roster.

The tournament is structured in rounds:

- **Round 1**: Weakest opponent -- easy tutorial through core mechanics
- **Rounds 2-4**: Mid-tier opponents with increasing tactical complexity
- **Rounds 5-7**: Elite opponents requiring optimized lineup synergy (tournament finals and championship)

Each round = one full game against an opponent. Outscore them over four quarters to advance. Lose once and your run ends (permadeath for that tournament -- but your players return home to the roster with progress).

### How a Game Plays Out

You do not control possessions in real time. Each game is decided by two pre-game choices and a fast simulation of the result.

1. **Set your five.** Pick a starter for each of the five floor slots (PG, SG, SF, PF, C). Ratings and how players fit together decide games, so chase synergies (speedy backcourts, twin towers, lockdown wings).
2. **Set a game plan.** Choose a pace (slow / balanced / fast) and a focus (inside, outside, balanced, lockdown). The plan biases which actions the sim favors.
3. **Watch the sim.** The engine plays the game possession by possession and the UI replays it quickly with juice: count-up scores, screen shake, haptics, and arcade callouts. Read the box score afterward.

#### Player Ratings

The sim uses a ten-rating model (offense and defense split across inside, mid, and perimeter, plus playmaking, athleticism, rebounding, IQ, stamina, and durability) surfaced as a small set of composites (OVR plus OFF / DEF / ATH). Full details, including the possession resolution math, fatigue, and rotations, live in [stat-and-sim-system.md](stat-and-sim-system.md).

The higher a shooter's relevant rating relative to the defender contesting, the more likely the shot falls and the bigger the payoff. Lineup synergies and your game plan tilt those odds before each possession resolves.

#### How a Possession Works

1. The offense picks an action shaped by the game plan and the on-court personnel (drive, three, mid-range, post-up, and so on).
2. The defense contests using the matched defender's ratings.
3. The possession resolves through the seeded engine: a make scores 2 or 3, a miss can be rebounded, and pressure can force a steal, turnover, or block.
4. Big plays (dunks, threes, clutch buckets, steals) trigger extra juice; the running score updates and play moves on.

A full game is four quarters and watches in about 30 seconds at the default speed (chill and blitz tiers and a condensed highlights mode adjust that). Because the sim is deterministic from its seed, any game can be re-watched or fast-forwarded identically. See the "Pacing the watch" principles in [addictive-blueprint.md](addictive-blueprint.md).

## Meta-Progression (Between Runs)

### Roster Building

When you defeat an opponent in a run, they have a chance to join your roster permanently. Each recruited player brings unique stats, visual design, and starting abilities:

- **Base stat generation**: Opponents' stats scale with tournament round. Defeating Round 3 opponents gives you players with higher base stats (6-7 range).
- **Recruit cost**: Higher-stat players cost more "reputation" to recruit. You earn reputation based on how far you advance in the tournament each run.
- **Player variety**: Each opponent type plays differently -- a speedy point guard, a towering center, a clutch shooter. Building a balanced roster from diverse recruits creates meaningful team synergy decisions.

### Player Training

Players earn training XP during games even when your run ends. Between runs you spend XP to permanently improve their stats:

| Resource             | Earned By                          | Spent On                                            |
| -------------------- | ---------------------------------- | --------------------------------------------------- |
| **Coins**            | Winning games, tournament advancement | Equipment purchases and gear unlocks             |
| **Reputation**       | Tournament round reached           | Recruiting new opponents as roster players          |
| **Training XP**      | Playing games (even losses)        | Upgrading player ratings                            |
| **Player Fragments** | Defeating high-tier opponents      | Unlocking special abilities for existing roster players |

### Equipment System

Players can equip accessories that modify their stats during runs:

- **Sneakers**: +2 Athleticism OR +1 to all ratings (multiple tiers, stackable across your roster)
- **Headband**: a boost to shooting ratings (perimeter and mid-range accuracy)
- **Wristband**: +2 IQ in close quarters (becomes more valuable as tournament rounds increase)
- **Jersey Number**: +1 to all ratings (unique visual design, each number has a retro aesthetic)

Equipment is purchased between runs with coins and persists across all future runs. This creates the "meta-progression" pattern that Balatro and Vampire Survivors perfected: small stat increments accumulate into massive power gains over time, masking true mathematical progression while eliminating the feeling of wasted attempts (eJAW analysis of Balatro design).

### Player Ability Unlocks

As players gain Training XP, they unlock special abilities that bias how the sim plays them:

- **Level 1**: Base ratings only
- **Level 5**: First perk unlocked (varies by player position)
- **Level 10**: Second perk + rating boost
- **Level 15**: Signature trait (unique to that player character)
- **Level 20**: Ultimate -- a game-changing trait that reshapes the sim around them

Example: A speed-based point guard might unlock "Quick Hands" (more steals) at level 5, "Floor General" (lifts teammate playmaking) at level 10, and "Point God" (a clutch-quarter surge) at level 20.

## Difficulty Design

### Within-Run Scaling (The Exponential Curve)

Opponent stats scale with tournament round. This is not linear -- it compounds like Balatro's ante system:

| Round | Opponent Avg Stats                                 | Special Mechanics Introduced          |
| ----- | -------------------------------------------------- | ------------------------------------- |
| 1     | 4-5                                                | None -- full tutorialization          |
| 2     | 5                                                  | Opponent defense tightens             |
| 3     | 5.5                                                | Opponents run real lineup synergies   |
| 4     | 6.5                                                | Deeper benches, smarter rotations     |
| 5     | 7.5                                                | Signature player abilities in play    |
| 6     | 8+                                                 | Stacked synergies, elite execution    |
| 7     | 9+ (Championship) Boss-level with unique abilities |

This exponential progression mirrors Balatro's approach: target scores multiply by roughly 1.5x-2x per phase, creating a silent but escalating pressure curve that forces players to internalize rising difficulty without explicit warnings (eJAW analysis). The key principle from successful roguelike design: "difficulty comes from known mechanics rather than opaque systems" so losses feel like calculation errors, not unfair RNG.

### Between-Run Softening (Vampire Survivors Pattern)

Small meta-progression bonuses make the next run slightly easier:

- Recruited players with base 6+ stats immediately boost your team's average competitiveness
- Equipment purchases reduce difficulty (higher ratings = better odds on every possession)
- Training XP spent on home roster carries forward, meaning every hour invested permanently lowers the barrier to deeper tournament runs

This "monotonically decreasing" difficulty curve is the signature of successful roguelites: hardest at the start, gets progressively easier over time as your investment compounds.

## Mobile UX Design Patterns

### Session Length and Pacing

Successful mobile roguelike runs fall in the **5-20 minute window**, fitting naturally into commute, lunch break, or bedtime play patterns (mobile gamereport 2024 analysis). The auto-sim watch is the per-game time sink, so it is paced to stay short: routine plays are compressed and the peaks are juiced, the default playback speed is brisk (about 30 seconds a game) with chill and blitz tiers and an optional condensed highlights mode, and the floor stays stable rather than repositioning every possession. See the "Pacing the watch" section of [addictive-blueprint.md](addictive-blueprint.md). A full tournament run of 5 games takes a few minutes at the default speed, less on faster tiers, easily completable in a single sitting with room for multiple attempts.

### Instant Restart

Players should be able to jump back into gameplay in **5 seconds or less** with zero tutorial text (Habby's "unfolding formula"). The next game's pregame is one tap from a loss, so the first decision happens within 0-5 seconds. Visual teaching works faster than text-based tutorials.

### One-Thumb Portrait Mode

Archero pioneered the portrait-mode, one-thumb roguelite formula. Pixel Hoops keeps every decision in the thumb zone: pregame lineup and game-plan choices are tap targets at the bottom of the screen, and the game watch itself needs no input (tap to change speed or skip). No joystick required. The UI places interactive elements within easy thumb reach:

```
┌─────────────────────┐
│  Q3  YOU 28  OPP 31 │   ← Score bug + quarter, top
├─────────────────────┤
│                     │
│    [COURT WATCH]    │   ← Center: pixel court, on-court fives,
│   play-by-play feed │      ball flight, count-up score, juice
│                     │
├─────────────────────┤
│  ‹‹  CHILL ▸ BLITZ  │   ← Speed control + skip in thumb zone
└─────────────────────┘
```

### The Unfolding Formula

Popularized by Habby (Archero, Survivor.io): start with hypercasual simplicity so one-thumb controls are immediately accessible. Lock RPG elements, equipment systems, and deeper mechanics behind gradual unlocks -- let players focus on core gameplay first for multiple days before introducing complexity. Slowly shift attention from mastering gameplay to RPG progression as engagement deepens.

## NBA Jam Arcade Energy

### Visual Design

- **Resolution**: 160x144 pixels rendered at native resolution (no upscaling). Each "pixel" is visible but crisp on modern screens.
- **Color palette**: Limited to 32 colors per scene, vibrant arcade sports tones -- bright orange court with white lines, neon crowd lighting, saturated player jerseys.
- **Court variety**: Each tournament round plays out on a different arena (underground gym, packed stadium, championship coliseum). Visual progression through the bracket creates natural sense of advancement.
- **Crowd rendering**: 8-bit pixel crowd fills the background with color-coded teams (home = team colors, away = opponent colors). Crowd density and animation intensity scale with score margin and quarter proximity.

### Arcade Animations

- **Dunks**: Full 8-frame sequence showing drive, jump, slam, rim bounce -- exaggerated for comic effect
- **Steals**: Quick swipe animation with "SWIPED!!!" text overlay in pixel font
- **Block**: Giant hand swatting ball into crowd, crowd goes wild (screen shake + flash)
- **Free throws**: Tight shot on rim, tension music rises, crowd holds breath (visualized by crowd going silent for 2 seconds then erupting)
- **Player defeat/elimination**: Arcade-style "ELIMINATED!" or "GAME OVER" screen with dramatic pixel fireworks and opponent portrait

### Audio Design

- **Music**: Upbeat 8-bit chiptune soundtrack per arena. Tempo increases subtly as game goes to final quarters (starts at 120 BPM, peaks at 150 BPM in quarter 4).
- **Voice samples**: 8-bit downsampled "AND-ONE!", "BUZZER BEATER!", "STEAL!" for key moments -- reminiscent of classic arcade sports callouts.
- **SFX catalog**:
  - Possession start: light dribble + swoosh matching the play type
  - Successful shot: net swish (bright tone) vs rim bounce (muted metallic clang)
  - Turnover: low thud with crowd "AWWW" (8-bit downsampled)
  - Steal/block: crowd eruption sound with screen rumble vibration
  - Quarter end: referee whistle + score update chime
  - Tournament victory: full victory fanfare with retro sports melody

### Haptic Feedback

- Pregame selection: single sharp tap confirming a lineup or game-plan choice
- Successful shot: strong pulse synced with swish audio and visual flash
- Steal/block: triple-burst micro-vibration (3 quick pulses, ~50ms each) matching the impact rhythm
- Turnover/miss: one long moderate vibration (100ms) -- conveys "bummer" without frustration
- Buzzer beater: escalating rumble that peaks at shot release

## Competitive and Social Systems

### Daily Tournament

One free daily tournament for all players. Fixed handicap applied equally to everyone (e.g., "All opponents +2 Speed this week"). Global leaderboard showing best round reached from the past 7 days. Resets at midnight local time -- creates urgency without forced engagement. Completing a daily tournament awards bonus coins, reputation, and player fragments.

### Weekly Challenges

Progressive objectives that span an entire week:

- "Win 5 games total"
- "Win a game with an all-guard lineup"
- "Recruit 3 new players in one run"

Each challenge has tiered rewards -- partial completion earns something, full completion unlocks exclusive cosmetic equipment (jersey designs, court themes). This follows the Zeigarnik Effect: incomplete objectives create psychological tension that drives return engagement.

### Season Structure

Beyond individual runs and daily challenges, Pixel Hoops features seasonal progression:

- Each season lasts 4 weeks with a unique theme (e.g., "Underground Summer," "Winter Classic")
- Season rewards unlock at specific tier levels through continuous play
- Visual unlocks (new arena themes, crowd packs, player silhouette designs) alongside meaningful stat boosts

This mirrors Game of Runs' seasonal meta-progression: "lose, improve, and come back stronger in a new season" -- giving players long-term motivation beyond individual run outcomes.

## Player Archetypes

Players fall into natural basketball archetypes that shape their ratings and how the sim deploys them:

| Archetype      | Strengths             | Playstyle                     | Example Signature Ability                               |
| -------------- | --------------------- | ----------------------------- | ------------------------------------------------------- |
| Point Guard    | Playmaking, speed     | Pace, passes, precision shots | "Point God" -- a clutch-quarter scoring surge           |
| Shooting Guard | Perimeter shooting    | Range, accuracy, clutch       | "Ice in Veins" -- raised shooting in close games        |
| Small Forward  | Balanced two-way      | Versatile all-around          | "Two-Way Player" -- strong on both ends of the floor    |
| Power Forward  | Athleticism, rebounds | Dunks, rebounds, blocks       | "Posterize" -- a higher dunk rate that swings momentum  |
| Center         | Interior, rim control | Paint dominance, rim control  | "The Wall" -- a big lift to interior defense and blocks |

When recruiting opponents, players come pre-built with archetype distributions. A high-level Point Guard recruit brings strong playmaking and speed ratings plus abilities you may not have unlocked yet. This creates strategic depth: do you recruit another sharpshooter to build a shooting-focused team, or diversify your roster for matchup flexibility?

## UI/UX Layout During Gameplay

```
┌─────────────────────┐
│  Q3   YOU 28 OPP 31 │   ← Quarter + score bug, top
├─────────────────────┤
│                     │
│    [COURT WATCH]    │   ← Center: pixel court with on-court fives,
│   play-by-play feed │      ball flight, count-up score, juice
│                     │
├─────────────────────┤
│                     │
│  ‹‹  CHILL ▸ BLITZ  │   ← Bottom thumb zone: speed control + skip
└─────────────────────┘
```

The UI is designed for one-thumb play: the game watch fills the center, with speed and skip controls in the bottom thumb zone. Quarter progress and score sit at the top (visible but not requiring attention). The watch needs no per-possession input; the decisions all happen in pregame.

## Run End Summary Screen

When a run ends (tournament loss), the summary screen shows:

1. **Tournament result**: "Round 3 Exit" with opponent name and record
2. **Stats earned this run**: coins, reputation, XP -- all three shown prominently
3. **Recruitment results**: any defeated players who joined your roster (with stat blocks)
4. **Next session prompt**: immediate "Play Again" button centered and large

The critical UX principle from mobile roguelike research: the gap from loss to "try again" should be under 5 seconds. No text walls, no menu navigation -- just a clear summary with one big button to jump back in immediately. This mirrors Archero's instant restart pattern which achieves 94% tutorial completion vs. the industry average of 60-70%.

## Technical Design Notes

### Possession Resolution Math

Possession outcomes use transparent, seeded resolution (full detail in [stat-and-sim-system.md](stat-and-sim-system.md)):

- A make is affine in the shooter's relevant rating minus a defensive offset, nudged by IQ and scaled by fatigue, then clamped.
- One-on-one miss-flavor contests (steals, blocks) use a ratio a / (a + b) between the two players' ratings, the parameter-free form that feels fair.
- Equipment, abilities, lineup synergies, and the game plan modify ratings before resolution.
- Randomness is supplied by a seeded RNG, so the same matchup and seed always produce the same game.

### Lineup Construction Between and Within Runs

Roster building, not deck building, is where the strategy lives:

- Recruit and train players to deepen a roster of distinct archetypes.
- Before each game, set the starting five (one per floor slot) and a game plan.
- Synergies emerge from how players fit: speedy backcourts, twin towers, lockdown wings, balanced cores.
- The same roster can be deployed many ways, so no two games feel identical.

This creates the "strategic depth within short sessions" pattern that Archero demonstrates with 100+ skills and emergent synergies -- ensuring no two runs feel identical even with the same roster.

### Procedural Tournament Generation

Each tournament bracket is procedurally generated:

- Opponent names drawn from randomized pool (streetball player names, fictional pros)
- Opponent stats scaled to round but with variance (not all Round 3 opponents have identical stats)
- Opponent lineups built around their archetypes and ratings (speedy guards push the pace; athletic bigs dominate the paint)
- Visual presentation varies (different jersey colors, court types, crowd themes)

This procedural generation solves the "content treadmill problem" -- algorithmic variety is essentially free content that keeps runs feeling fresh across hundreds of attempts. It mirrors the pattern identified in successful mobile roguelikes: "algorithmic generation + casual art + persistent unlock trees" creating near-infinite replayability from minimal hand-authored assets (robin-guo.com analysis).

## Session Length Targets

Watch times are at the brisk default speed; the blitz tier and highlights mode are faster, and chill is slower.

| Run Type     | Watch Time (brisk) | Restart Delay   |
| ------------ | ------------------ | --------------- |
| Single game  | about 30 seconds   | Under 5 seconds |
| Tournament   | a few minutes      | Under 5 seconds |
| Full bracket | a few minutes      | Under 5 seconds |

These targets align with the successful mobile roguelike sweet spot: sessions that respect the platform by fitting into natural break points (commute, lunch, bedtime) while keeping restart friction near zero so the "just one more tournament" compulsion stays active. The auto-sim watch is kept short by default-fast pacing (see the "Pacing the watch" principles in addictive-blueprint.md) rather than by forcing the player to skip.
