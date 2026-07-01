# Pixel Hoops - Game Concept

> **The core loop:** Pixel Hoops is an **auto-sim 5-on-5 roguelike**: build a five and watch a fast, juicy simulation, with agency in the roster and a branching run map. See **[gameplay-redesign.md](gameplay-redesign.md)** for the moment-to-moment loop, **[stat-and-sim-system.md](stat-and-sim-system.md)** for the ratings and simulation engine, and **[addictive-blueprint.md](addictive-blueprint.md)** for the design principles behind it.

## Overview

Pixel Hoops is a roster-driven basketball roguelike for mobile. You build a roster of 8-bit pixel players with unique ratings and abilities, then send them into procedurally-generated tournament brackets. Before each game you set your starting five, then watch a fast, possession-by-possession simulation play out with arcade juice. Each team's tempo and shot selection are read automatically from its roster shape, so there is no game plan to set. Win games to advance. Recruit defeated opponents. Build the ultimate underground team.

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
Build Roster → Enter Tournament → Set Your Five → Watch the Sim → Win Games → Recruit Opponents → Repeat
```

### Run Structure

Each run starts from the main menu as a fresh tournament bracket (5-7 opponents with procedurally-generated rosters). Between runs you use earned resources to permanently upgrade your home roster.

The tournament is structured in rounds:

- **Round 1**: Weakest opponent -- easy tutorial through core mechanics
- **Rounds 2-4**: Mid-tier opponents with increasing tactical complexity
- **Rounds 5-7**: Elite opponents requiring optimized lineup synergy (tournament finals and championship)

Each round = one full game against an opponent. Outscore them over four quarters to advance. Lose once and your run ends (permadeath for that tournament -- but your players return home to the roster with progress).

### How a Game Plays Out

You do not control possessions in real time. Each game is decided by one pre-game choice, your starting five, and a fast simulation of the result.

1. **Set your five.** Pick a starter for each of the five floor slots (PG, SG, SF, PF, C). Ratings and how players fit together decide games, so chase synergies (speedy backcourts, twin towers, lockdown wings). This is the only pre-game decision.
2. **Tempo and shot selection set themselves.** There is no game plan menu. Each team's pace (slow / balanced / fast) and focus (inside, outside, balanced) are read automatically from its roster shape: a guard-heavy five runs faster and shoots more from outside, a big-heavy five slows down and pounds it inside. This biases which actions the sim favors, the same way an explicit plan used to. The pregame **scouting report** surfaces this as a team identity (character tags, a blurb, projected steals/blocks/rebounds, and the top scorer) for both the opponent and your own five, so you can set a counter lineup before tip-off.
3. **Watch the sim.** The engine plays the game possession by possession and the UI replays it quickly with juice: count-up scores, screen shake, haptics, and arcade callouts. Read the box score afterward.

#### Player Ratings

The sim uses a fourteen-rating model: ten skill and condition ratings (offense and defense split across inside, outside, playmaking, perimeter and interior defense, plus athleticism, IQ, clutch, stamina, and durability), surfaced as a small set of composites (OVR plus OFF / DEF / ATH); and four intrinsic play-style ratings (blocking, stealing, strength, rebounding) that are non-upgradeable and acquired only by recruiting the player who has them. The play-style ratings drive the box score (who blocks, steals, and rebounds) without touching OVR, so power comes from who you draft rather than only from upgrades. Full details, including the possession resolution math, fatigue, and rotations, live in [stat-and-sim-system.md](stat-and-sim-system.md).

The higher a shooter's relevant rating relative to the defender contesting, the more likely the shot falls and the bigger the payoff. Lineup synergies and the roster's auto-derived tendencies tilt those odds before each possession resolves.

#### How a Possession Works

1. The offense picks an action shaped by its roster-derived tendency and the on-court personnel (drive, three, mid-range, post-up, and so on).
2. The defense contests using the matched defender's ratings.
3. The possession resolves through the seeded engine: a make scores 2 or 3, a miss can be rebounded, and pressure can force a steal, turnover, or block.
4. Big plays (dunks, threes, clutch buckets, steals) trigger extra juice; the running score updates and play moves on.

A full game is four quarters and watches in about 30 seconds at the default speed (chill and blitz tiers and a condensed highlights mode adjust that). Because the sim is deterministic from its seed, any game can be re-watched or fast-forwarded identically. See the "Pacing the watch" principles in [addictive-blueprint.md](addictive-blueprint.md).

## Meta-Progression (Between Runs)

### Roster Building

When you defeat an opponent in a run, they have a chance to join your roster permanently. Each recruited player brings unique stats, visual design, and starting abilities:

- **Base stat generation**: Opponents' stats scale with tournament round. Defeating Round 3 opponents gives you players with higher base stats (deeper into the normal 6-20 band, roughly the 13-15 range).
- **Recruit cost**: Higher-stat players cost more "reputation" to recruit. You earn reputation based on how far you advance in the tournament each run.
- **Player variety**: Each opponent type plays differently -- a speedy point guard, a towering center, a clutch shooter. Building a balanced roster from diverse recruits creates meaningful team synergy decisions.
- **Specialty, reroll, and pity**: each recruit offer shows the player's specialty (Rim Protector, Ball Hawk, Glass Cleaner, Floor General, Sharpshooter, and so on) so a pick reads as a deliberate roster choice. Each of the offered options can be rerolled once per recruit node, and a soft pity guarantees a play-style specialist eventually surfaces, so chasing a missing piece (a shot-blocker, a rebounder) is reachable rather than pure luck. Since play-style traits are recruit-only, this is where you build a defensive or rebounding identity.
- **Recruits are kept only on a clear**: players you sign mid-run are provisional. Clear the run and they join your collection for good; lose, and they are gone (your owned collection and banked coins are never touched). This raises the stakes of every run. The reliable, permanent way to grow your collection is the Scouting gacha. See [player-gacha.md](player-gacha.md).

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

- **Sneakers**: +4 Athleticism OR +2 to all ratings (multiple tiers, stackable across your roster)
- **Headband**: a boost to shooting ratings (perimeter and mid-range accuracy)
- **Wristband**: +4 IQ in close quarters (becomes more valuable as tournament rounds increase)
- **Jersey Number**: +2 to all ratings (unique visual design, each number has a retro aesthetic)

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

The central tension is the one named in [addictive-blueprint.md](addictive-blueprint.md): **can I grow faster than the bracket does?** Difficulty and player power climb together, the way the project's north star pokelike.xyz handles it, rather than an older "every run gets easier" model that made the game trivial after a couple of runs. Full details and tuning live in [difficulty-rebalance.md](difficulty-rebalance.md).

### Within-Run Scaling (The Continuous Curve)

Opponent strength rises **continuously with absolute progress through the run**, not in flat per-map steps. Each combat node is a notch stronger than the last; a boss is its map's local peak; and the first game of a new map continues from the previous map rather than resetting to "weak." The curve opens near a fresh roster's strength and climbs toward a peak set by the chosen **difficulty**: every tier opens gently, but the finale diverges, ending near your ladder class on easy (winnable with a base roster and good in-run play) and about two classes above it on insane (which demands maxed players and abilities). See [difficulty-rebalance.md](difficulty-rebalance.md) for the ramp and how it is tuned (`src/game/difficulty.ts`, `src/game/stat-scaling.ts`).

Because a run is a long win streak that a single loss ends, the easier tiers grant a pool of **timeouts** (forgiven losses: easy 2, medium 1, hard and insane none): while any remain, a lost game is replayed instead of ending the run, keeping a first clear achievable without softening the punishing top tiers.

Within a run, the player keeps pace by spending **training points on run-scoped upgrades** (the Pokelike "EV" analog): pick a stat for a specific player and raise it, resetting every run. This is the per-run power climb against the rising curve. Difficulty comes from known mechanics rather than opaque systems, so losses read as calculation errors, not unfair RNG.

### Bounded Meta-Progression (No Snowball)

Meta-progression compounds, but it is bounded so later runs stay challenging:

- **Points draft.** Before each run you draft a rotation from your owned collection under a difficulty point budget, paying by each player's class relative to the run's ladder, so you cannot field a roster of nothing but above-class studs (`src/game/draft.ts`).
- **Capped permanent upgrades.** Coins buy permanent +1s, but the per-stat cap is a flat +5 (with the absolute rating hard cap at 30), so permanent power specializes a player without ever reclassing them outright (`src/game/upgrades.ts`).
- **The class ladder.** Clearing a class on any difficulty unlocks the next class everywhere (the Slay the Spire "Ascension" / Hades "Heat" pattern, reframed as a C -> S+ class climb across a 20-cell bounty board), so winning makes the *next* run harder, not easier, and higher difficulties pay a repeatable premium (multiplied recruit copies, richer drops, legend signings, a clear bonus) so the punishing grid is also the rewarding one (`src/game/difficulty-mode.ts`, [difficulty-rebalance.md](difficulty-rebalance.md)).

No run is wasted: recruits, coins, and ladder progress still bank every run. But power and difficulty rise together rather than power outpacing the bracket. Full detail in [difficulty-rebalance.md](difficulty-rebalance.md).

## Mobile UX Design Patterns

### Session Length and Pacing

Successful mobile roguelike runs fall in the **5-20 minute window**, fitting naturally into commute, lunch break, or bedtime play patterns (mobile gamereport 2024 analysis). The auto-sim watch is the per-game time sink, so it is paced to stay short: routine plays are compressed and the peaks are juiced, the default playback speed is brisk (about 30 seconds a game) with chill and blitz tiers and an optional condensed highlights mode, and the floor stays stable rather than repositioning every possession. See the "Pacing the watch" section of [addictive-blueprint.md](addictive-blueprint.md). A full tournament run of 5 games takes a few minutes at the default speed, less on faster tiers, easily completable in a single sitting with room for multiple attempts.

### Instant Restart

Players should be able to jump back into gameplay in **5 seconds or less** with zero tutorial text (Habby's "unfolding formula"). The next game's pregame is one tap from a loss, so the first decision happens within 0-5 seconds. Visual teaching works faster than text-based tutorials.

### One-Thumb Portrait Mode

Archero pioneered the portrait-mode, one-thumb roguelite formula. Pixel Hoops keeps every decision in the thumb zone: pregame lineup choices are tap targets at the bottom of the screen, and the game watch itself needs no input (tap to change speed or skip). No joystick required. The UI places interactive elements within easy thumb reach:

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

- Pregame selection: single sharp tap confirming a lineup choice
- Successful shot: strong pulse synced with swish audio and visual flash
- Steal/block: triple-burst micro-vibration (3 quick pulses, ~50ms each) matching the impact rhythm
- Turnover/miss: one long moderate vibration (100ms) -- conveys "bummer" without frustration
- Buzzer beater: escalating rumble that peaks at shot release

## Competitive and Social Systems

### The Daily Layer (shipped)

The daily and weekly vision below shipped as the offline, win-gated Daily Layer (`src/game/daily.ts`, granted by `home-roster.settleDailyRewards`). Design rules, per the research behind it: everything is won by PLAYING (never by logging in), there are no streaks, no countdown timers, and no ads; a missed day forfeits only that day's optional bonus, never anything earned.

- **Daily Spotlight.** One cell of the (difficulty x ladder) grid is featured each day, derived per player from the local date and their unlocked classes (rookies see mostly winnable cells; proven climbers see hard as the star). Winning the spotlighted cell pays a once-per-day bounty of 150/250/400/600 coins by difficulty, on top of normal run rewards. Resets at midnight local time. No leaderboard and no shared seed: with no server, sameness is imperceptible, and a fixed seed would make retries replay identical losses.
- **First win of the day.** The first championship each day pays 100 coins plus one free C scout pull (a new player early, a collection tick mid-game, and a coin overflow for veterans, so the bonus self-converts as progression grows).
- **Weekly goals.** One meter, individual game wins, counted even from lost runs: 10 wins pay 150 coins, 35 pay 400, 100 pay 600 plus a random rare ability. Tiers auto-grant the moment they are crossed (no claim buttons); unfinished tiers reset Monday with nothing earned ever taken away.

### Weekly Challenges (future)

Beyond the shipped win-count goals, richer objective variety remains on the board:

- "Win a game with an all-guard lineup"
- "Recruit 3 new players in one run"

Cosmetic rewards for challenges (jersey designs, court themes) are deferred to the Seasons vision; court themes are currently earned by difficulty conquests.

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
- Equipment, abilities, lineup synergies, and each team's auto-derived tendencies modify ratings and shot selection before resolution.
- Randomness is supplied by a seeded RNG, so the same matchup and seed always produce the same game.

### Lineup Construction Between and Within Runs

Roster building, not deck building, is where the strategy lives:

- Recruit and train players to deepen a roster of distinct archetypes.
- Before each game, set the starting five (one per floor slot); tempo and focus follow from that roster shape automatically.
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
