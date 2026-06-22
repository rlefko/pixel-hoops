# Pixel Hoops - Game Concept

> **Update (pivot):** The moment-to-moment loop has changed. Pixel Hoops is no longer "play a card every quarter." It is now an **auto-sim 5-on-5 roguelike**: build a five, set a game plan, and watch a fast, juicy simulation, with agency in the roster and a branching run map. See **[gameplay-redesign.md](gameplay-redesign.md)** for the new core loop and **[addictive-blueprint.md](addictive-blueprint.md)** for the design principles behind it. The roster, meta-progression, difficulty, mobile UX, and arcade-presentation goals below still hold; the per-possession card mechanic described under "The Card System" and "How a Quarter Works" is retired (kept dormant in code) and returns later as between-games "playbook cards." Sections below are preserved for that context.

## Overview

Pixel Hoops is a card-driven basketball roguelike for mobile. You build a roster of 8-bit pixel players with unique stats and abilities, then send them into procedurally-generated tournament brackets where every match is decided by tactical card play. Win games to advance. Recruit defeated opponents. Build the ultimate underground team.

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
Build Roster → Enter Tournament → Play Card Battles → Win Games → Recruit Opponents → Repeat
```

### Run Structure

Each run starts from the main menu as a fresh tournament bracket (5-7 opponents with procedurally-generated rosters). Between runs you use earned resources to permanently upgrade your home roster.

The tournament is structured in rounds:

- **Round 1**: Weakest opponent -- easy tutorial through core mechanics
- **Rounds 2-4**: Mid-tier opponents with increasing tactical complexity
- **Rounds 5-7**: Elite opponents requiring optimized deck synergy (tournament finals and championship)

Each round = one full game against an opponent. Win the most quarters to advance. Lose once and your run ends (permadeath for that tournament -- but your players return home to the roster with progress).

### The Card System

Every player has a deck of basketball cards representing offensive and defensive plays. During a game, you draw cards from your hand each quarter and play them strategically against your opponent's defense.

#### Player Stats (4 Core Attributes)

| Stat            | What it Does                                             | Example Cards Using It                   |
| --------------- | -------------------------------------------------------- | ---------------------------------------- |
| **Shooting%**   | Base accuracy of shot plays                              | 3-POINTER, BANK SHOT, STEP-BACK          |
| **Speed**       | Evasion and crossover power                              | Crossover drive, behind-back pass, steal |
| **Athleticism** | Power plays and dunking ability                          | Alley-oop, poster dunk, block            |
| **Clutch**      | Performance in close quarters (ties favor higher clutch) | Free throw pressure, buzzer-beater play  |

Each player starts with a base stat of 5 across all attributes. Stats range from 3 to 10 (cap per character). The higher your relevant stat relative to the opponent's defense, the more likely your card succeeds and the bigger the payoff.

#### Card Types

**Offensive Cards** (attack in your quarter):

- **Shoot**: Attempt a shot. Resolution uses your Shooting% vs opponent's Shot Block stat. Success = 2 or 3 points based on card type.
- **Drive**: Attack with Speed-based plays. High-risk/high-reward -- may result in a foul (free throws), assist, or turnover if opponent outspeeds you.
- **Dunk**: High-power Athleticism plays. Guaranteed scoring but uses up your "energy" pool for the quarter. Opponent's Rim Block stat determines block chance.

**Defensive Cards** (respond to opponent's attack):

- **Zone Defense**: Reduces opponent scoring by matching Ath vs Opp Ath. If you win the comparison, they get a turnover instead of points.
- **Pressure Trap**: Speed-based defensive plays. May result in steal (flips quarter), foul call against them, or being beaten for easy basket if outspeeded.

**Special Cards** (one-time use per game):

- **Timeout**: Reroll your hand for next quarter
- **Hustle Play**: Sacrifice energy to guarantee a stat comparison bonus
- **And-One**: Successful offensive play that carries into the next quarter as momentum (automatic point at start)

#### How a Quarter Works

1. Both players draw from their deck (you get 4 cards, opponent draws face-down)
2. You reveal your offensive card first
3. Opponent's AI reveals its defensive card
4. Stats resolve: your Shooting% vs their Block stat determines success probability
5. Outcome resolves with arcade-style visual feedback (pixel dunk animation, swish, crowd cheer)
6. Next quarter begins with updated score and energy levels

The entire quarter sequence takes ~8-12 seconds. A full game is 4 quarters (~30-48 seconds of active play). The "unfolding formula" from mobile roguelike UX research applies: start with hypercasual simplicity (one card type early), then gradually introduce RPG systems, equipment upgrades, and strategic depth over multiple days of play rather than overwhelming new players.

### Example Game Flow

```
QUARTER 1 (you vs opponent "Tank McRebound"):
  Your hand: [3-POINTER] [CROSSOVER] [ALLEY-OOP] [FREE THROW PRESSURE]
  You play: CROSSOVER (Speed 7)
  Opponent plays: ZONE DEFENSE (Speed 5)
  Resolution: Your Speed wins → drive to basket → foul called! → FREE THROWS awarded

QUARTER 2:
  Your hand: [STEP-BACK] [BLOCK] [DUNK] [HUSTLE PLAY]
  You play: DUNK (Athleticism 8, cost: 3 energy)
  Opponent plays: RIM BLOCK (Block stat 6)
  Resolution: Athletics win → SMASH IT!! → crowd goes wild

QUARTER 3:
  ... opponent closes gap through clutch plays ...

QUARTER 4:
  You lead by 2 points. Opponent has higher Clutch. Final quarter is nail-biter.
```

## Meta-Progression (Between Runs)

### Roster Building

When you defeat an opponent in a run, they have a chance to join your roster permanently. Each recruited player brings unique stats, visual design, and starting abilities:

- **Base stat generation**: Opponents' stats scale with tournament round. Defeating Round 3 opponents gives you players with higher base stats (6-7 range).
- **Recruit cost**: Higher-stat players cost more "reputation" to recruit. You earn reputation based on how far you advance in the tournament each run.
- **Player variety**: Each opponent type plays differently -- a speedy point guard, a towering center, a clutch shooter. Building a balanced roster from diverse recruits creates meaningful team synergy decisions.

### Player Training

Players earn training XP during games even when your run ends. Between runs you spend XP to permanently improve their stats:

| Resource             | Earned By                                | Spent On                                                          |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| **Coins**            | Winning quarters, tournament advancement | Card upgrades, equipment purchases                                |
| **Reputation**       | Tournament round reached                 | Recruiting new opponents as roster players                        |
| **Training XP**      | Playing games (even losses)              | Upgrading player base stats (Shooting%, Speed, Athletics, Clutch) |
| **Player Fragments** | Defeating high-tier opponents            | Unlocking special abilities for existing roster players           |

### Equipment System

Players can equip accessories that modify their stats during runs:

- **Sneakers**: +2 Speed OR +1 All stats (multiple tiers, stackable across your roster)
- **Headband**: +3% Shooting accuracy per point of Shooting% on player
- **Wristband**: +2 Clutch rating (becomes more valuable as tournament rounds increase)
- **Jersey Number**: +1 to all stats (unique visual design, each number has a retro aesthetic)

Equipment is purchased between runs with coins and persists across all future runs. This creates the "meta-progression" pattern that Balatro and Vampire Survivors perfected: small stat increments accumulate into massive power gains over time, masking true mathematical progression while eliminating the feeling of wasted attempts (eJAW analysis of Balatro design).

### Player Ability Unlocks

As players gain Training XP, they unlock special abilities that add new cards to your in-game deck:

- **Level 1**: Basic plays only
- **Level 5**: First special card unlocked (varies by player position)
- **Level 10**: Second ability + stat boost
- **Level 15**: Signature move (unique ability specific to that player character)
- **Level 20**: Ultimate -- one-time use per game, game-changing effect

Example: A speed-based point guard might unlock "Behind-Back Pass" at level 5, "No-Look Dime" at level 10, and "Point God Mode" (unlimited energy for 2 quarters) at level 20.

## Difficulty Design

### Within-Run Scaling (The Exponential Curve)

Opponent stats scale with tournament round. This is not linear -- it compounds like Balatro's ante system:

| Round | Opponent Avg Stats                                 | Special Mechanics Introduced       |
| ----- | -------------------------------------------------- | ---------------------------------- |
| 1     | 4-5                                                | None -- full tutorialization       |
| 2     | 5                                                  | Zone defenseAI becomes aggressive  |
| 3     | 5.5                                                | Opponent plays 2-card combos       |
| 4     | 6.5                                                | "Pressure" quarters (time-limited) |
| 5     | 7.5                                                | Special cards in opponent hand     |
| 6     | 8+                                                 | Multi-card synergies, elite AI     |
| 7     | 9+ (Championship) Boss-level with unique abilities |

This exponential progression mirrors Balatro's approach: target scores multiply by roughly 1.5x-2x per phase, creating a silent but escalating pressure curve that forces players to internalize rising difficulty without explicit warnings (eJAW analysis). The key principle from successful roguelike design: "difficulty comes from known mechanics rather than opaque systems" so losses feel like calculation errors, not unfair RNG.

### Between-Run Softening (Vampire Survivors Pattern)

Small meta-progression bonuses make the next run slightly easier:

- Recruited players with base 6+ stats immediately boost your team's average competitiveness
- Equipment purchases reduce difficulty (higher speed = more dodge chance = fewer turnovers)
- Training XP spent on home roster carries forward, meaning every hour invested permanently lowers the barrier to deeper tournament runs

This "monotonically decreasing" difficulty curve is the signature of successful roguelites: hardest at the start, gets progressively easier over time as your investment compounds.

## Mobile UX Design Patterns

### Session Length and Pacing

Successful mobile roguelike runs fall in the **5-20 minute window**, fitting naturally into commute, lunch break, or bedtime play patterns (mobile gamereport 2024 analysis). Each game is ~30-48 seconds. A full tournament run of 5 games takes approximately 4 minutes -- easily completable in a single sitting with room for multiple attempts.

### Instant Restart

Players should be able to jump back into gameplay in **5 seconds or less** with zero tutorial text (Habby's "unfolding formula"). First card interaction happens on game start so the first action occurs within 0-5 seconds of launching the app. Visual teaching works faster than text-based tutorials.

### One-Thumb Portrait Mode

Archero pioneered the portrait-mode, one-thumb roguelite formula: tap-to-play cards positioned in a natural thumb zone at the bottom of the screen. No joystick required -- all input is single-tap card selection and discard. The UI places interactive elements within easy thumb reach:

```
┌─────────────────────┐
│  QUARTER: 3/4       │   ← Quarter progress top-center
│  YOU: 28  OPP: 31   │   ← Score display with pixel score bug
│  ENERGY: |||        │   ← Energy bar (used for power plays)
├─────────────────────┤
│                     │
│    BASKETBALL       │   ← Court visualization area
│    COURT SCENE      │   ← Pixel animation of current play
│                     │
├─────────────────────┤
│ [3-PT] [CROSS] ...  │   ← Hand of cards in thumb zone (bottom)
│ [DUNK] [BLK] [TIME] │
└─────────────────────┘
```

### The Unfolding Formula

Popularized by Habby (Archero, Survivor.io): start with hypercasual simplicity so one-button or one-thumb controls are immediately accessible. Lock RPG elements, equipment systems, and deeper mechanics behind gradual unlocks -- let players focus on core gameplay first for multiple days before introducing complexity. Slowly shift attention from mastering gameplay to RPG progression as engagement deepens.

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
  - Card play: satisfying card flip + swoosh sound matching the play type
  - Successful shot: net swish (bright tone) vs rim bounce (muted metallic clang)
  - Turnover: low thud with crowd "AWWW" (8-bit downsampled)
  - Steal/block: crowd eruption sound with screen rumble vibration
  - Quarter end: referee whistle + score update chime
  - Tournament victory: full victory fanfare with retro sports melody

### Haptic Feedback

- Card play: single sharp tap confirming action selection
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
- "Score 50 points using only Speed cards"
- "Recruit 3 new players in one run"

Each challenge has tiered rewards -- partial completion earns something, full completion unlocks exclusive cosmetic equipment (jersey designs, court themes). This follows the Zeigarnik Effect: incomplete objectives create psychological tension that drives return engagement.

### Season Structure

Beyond individual runs and daily challenges, Pixel Hoops features seasonal progression:

- Each season lasts 4 weeks with a unique theme (e.g., "Underground Summer," "Winter Classic")
- Season rewards unlock at specific tier levels through continuous play
- Visual unlocks (new arena themes, crowd packs, player silhouette designs) alongside meaningful stat boosts

This mirrors Game of Runs' seasonal meta-progression: "lose, improve, and come back stronger in a new season" -- giving players long-term motivation beyond individual run outcomes.

## Player Archetypes

Players fall into natural basketball archetypes that affect their base stats and available card pools:

| Archetype      | Stats                | Playstyle                     | Example Signature Ability                                  |
| -------------- | -------------------- | ----------------------------- | ---------------------------------------------------------- |
| Point Guard    | Speed > others       | Pace, passes, precision shots | "Point God" -- unlimited energy for 2 quarters             |
| Shooting Guard | Shooting% > others   | Range, accuracy, clutch       | "Ice in Veins" -- +50% Shooting% for free throws           |
| Small Forward  | Balanced             | Versatile all-around          | "Two-Way Player" -- defensive card counts as attack too    |
| Power Forward  | Athleticism > others | Dunks, rebounds, blocks       | "Posterize" -- dunk that cannot be blocked, +1 extra point |
| Center         | Athletics + Clutch   | Paint dominance, rim control  | "The Wall" -- auto-blocks one shot per quarter             |

When recruiting opponents, players come pre-built with archetype distributions. A high-level Point Guard recruit will give you Speed-based cards and strong base stats in that category, while also bringing unique abilities you may not have unlocked yet. This creates strategic depth: do you recruit another sharpshooter to build a shooting-focused team, or diversify your roster for matchup flexibility?

## UI/UX Layout During Gameplay

```
┌─────────────────────┐
│  QUARTER: 3/4       │   ← Quarter progress top-center
│  YOU: 28  OPP: 31   │   ← Score display with pixel score bug
│  ENERGY: |||        │   ← Energy bar (used for power plays)
├─────────────────────┤
│                     │
│    [COURT SCENE]    │   ← Center area: pixel basketball animation
│    vs OPPONENT      │   ← Shows current play in progress
│                     │
├─────────────────────┤
│                     │
│  [3-PT] [CROSS] ... │   ← Bottom thumb zone: your hand of cards
│  [DUNK] [BLK] [TMO] │      Tap to select, drag to discard
└─────────────────────┘
```

The UI is designed for one-thumb play: card hand occupies the bottom third of the screen (thumb zone), game action occupies the center two-thirds. Quarter progress and score at top (visible but not requiring attention). No menus or secondary screens interrupt active gameplay.

## Run End Summary Screen

When a run ends (tournament loss), the summary screen shows:

1. **Tournament result**: "Round 3 Exit" with opponent name and record
2. **Stats earned this run**: coins, reputation, XP -- all three shown prominently
3. **Recruitment results**: any defeated players who joined your roster (with stat blocks)
4. **Next session prompt**: immediate "Play Again" button centered and large

The critical UX principle from mobile roguelike research: the gap from loss to "try again" should be under 5 seconds. No text walls, no menu navigation -- just a clear summary with one big button to jump back in immediately. This mirrors Archero's instant restart pattern which achieves 94% tutorial completion vs. the industry average of 60-70%.

## Technical Design Notes

### Card Resolution Math

Card outcomes use transparent probability resolution:

- Base success rate = your relevant stat / (your stat + opponent's counter stat) \* 100
- Example: Your Shooting% (8) vs Opponent Block (5) → 8/(8+5) \* 100 = **61.5%** base chance to score
- Equipment and abilities modify these stats before resolution (e.g., Headband adds +3% Shooting → now 64.3%)
- The probability is displayed as a percentage on the card play -- "61% to score" -- giving the player actionable information without hiding randomness

### Deck Construction Between Runs

Before each tournament run, players choose which 20 cards to bring from their full collection:

- You may have 50+ cards unlocked across all roster players
- Choose exactly 20 for this run
- This deck selection is a strategic choice (like building a Slay the Spire deck before entering a floor)
- Cards from different archetypes create synergies: Speed cards with Speed-focused players, Shooting cards with high-Shooting% players

This creates the "strategic depth within short sessions" pattern that Archero demonstrates with 100+ skills and emergent synergies -- ensuring no two runs feel identical even with the same roster.

### Procedural Tournament Generation

Each tournament bracket is procedurally generated:

- Opponent names drawn from randomized pool (streetball player names, fictional pros)
- Opponent stats scaled to round but with variance (not all Round 3 opponents have identical stats)
- Opponent card pools built around their archetype and stats (high Speed players use drive/crossover cards; high Athletics players favor dunk/block plays)
- Visual presentation varies (different jersey colors, court types, crowd themes)

This procedural generation solves the "content treadmill problem" -- algorithmic variety is essentially free content that keeps runs feeling fresh across hundreds of attempts. It mirrors the pattern identified in successful mobile roguelikes: "algorithmic generation + casual art + persistent unlock trees" creating near-infinite replayability from minimal hand-authored assets (robin-guo.com analysis).

## Session Length Targets

| Run Type     | Active Play Time | Restart Delay   |
| ------------ | ---------------- | --------------- |
| Single game  | 30-48 seconds    | Under 5 seconds |
| Tournament   | 2.5 - 4 minutes  | Under 5 seconds |
| Full bracket | 6 - 8 minutes    | Under 5 seconds |

These targets align with the successful mobile roguelike sweet spot: sessions that respect the platform by fitting into natural break points (commute, lunch, bedtime) while keeping restart friction near zero so the "just one more tournament" compulsion stays active.
