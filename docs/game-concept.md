# Pixel Hoops - Game Concept

## Overview

Pixel Hoops is an 8-bit basketball shooting game for mobile. Hold to charge power, release to shoot, and make consecutive free throws before a moving hoop beats you. The core loop is simple enough to play with one hand; the depth comes from compounding difficulty and meta-progression.

> "The best casual games are deceptive: simple on the surface, deep underneath." -- Daniel Ammann, Flappy Bird creator

## Design Pillars

1. **One-thumb playable** -- every action requires a single long press and release
2. **Instant restart** -- from decision to tap after a miss takes less than one second
3. **Skill-based with uncertainty** -- physics are consistent so skill matters, but randomness prevents pattern memorization
4. **Compounding progression** -- you always leave with something (coins, unlocks) regardless of how long the run lasted
5. **8-bit aesthetic throughout** -- pixel art sprites, 8-bit sound effects, CRT-style scanline overlay

## Core Gameplay Loop

```
Shoot → Score or Miss → Earn Coins → Upgrade → Repeat
```

### The Shoot Mechanic

- Player holds a charged power meter (vertical bar on the left side of screen)
- Release at any height to shoot -- higher charge = flatter, faster arc; lower charge = higher parabolic arc
- The ball follows simulated projectile motion with gravity and spin
- Swish = points. Rim hit that bounces in = points. Rim hit that bounces out = miss (run ends)

### Scoring System

| Event | Points | Coins |
|-------|--------|-------|
| Regular basket | 1 base | 1 + streak bonus |
| Moneyball (rare random event on shot, ~8% chance per attempt once streak >= 3) | 3x base | 3x regular |
| Three-point range upgrade active | 2x base | 2x regular |

Streak multiplier: each consecutive basket adds +0.5x to points earned on that shot. A streak of 5 means 3.5x multiplier per basket. No decay -- streaks only grow until broken.

### The Moving Hoop (Core Tension Mechanic)

The hoop moves **between shots**, never during a ball's flight. This is intentional: it creates predictability within each shot while demanding adaptive skill across attempts.

Movement direction follows a weighted random selection before each shot:

| Selection | Action |
|-----------|--------|
| Roll 0 (33% base) | Hoop shifts up by move_amount pixels |
| Roll 1 (33% base) | No movement |
| Roll 2 (33% base) | Hoop shifts down by move_amount pixels |

If the new position would push the hoop off-screen, it clamps to the nearest valid position instead. This edge case is hidden from the player -- they see a "blocked" direction but not the clamping itself.

The **move_amount** (in pixels) scales with current streak:

| Current Streak | move_amount |
|----------------|-------------|
| 0              | 0           |
| 1 - 4          | 5           |
| 5 - 9          | 10          |
| 10 - 14        | 18          |
| 15+            | 28          |

The visual change is smooth: the hoop slides to its new position over 300ms with a slight bounce effect. The shot clock timer (if active) ticks down during this transition.

### Shot Clock Pressure

At streak >= 8, a shot clock appears in the top-right corner showing 10 seconds remaining. The visual design intensifies with streak: background color shifts from cool blue (streak 0-3) through purple (4-7) to deep red/orange (8+) with pulsing border glow. At streak >= 5, rim bounces out are highlighted with a brief screen shake and impact vibration.

## Psychological Design

### Flow State Architecture

Based on Csikszentmihalyi's flow theory, the game targets all eight dimensions:

1. **Unambiguous objectives** -- make the basket. One goal. No secondary menus mid-game.
2. **Rapid feedback** -- instant result after every shot (swish audio + visual celebration or miss animation) within 0.5 seconds
3. **Uninterrupted concentration** -- no pop-ups, ads interrupt gameplay, or hidden menus. Settings accessible only from main menu.
4. **Difficulty calibrated to skill** -- move_amount scales with streak so players must constantly develop new spatial awareness. The hoop starts perfectly still (streak 0) and becomes a puzzle within seconds.
5. **Action-awareness merging** -- hold and release become automatic reflexes after ~3 runs. No conscious thought required during shooting.
6. **Deep concentration** -- the moving hoop forces full attention. Partial peripheral awareness of rim position becomes part of the skill.
7. **Time distortion** -- flow state compresses perceived time. Players report "just one more shot" turns into minutes without noticing.
8. **Autotelic engagement** -- the game is rewarding for its own sake. No mandatory external rewards (no forced ad breaks, no energy timers).

### Near-Miss Effect Engineering

When a shot hits the rim and bounces out:
- The ball has a subtle wobble animation emphasizing how close it was to going in
- A brief "so close" visual flash appears for 150ms
- Screen shake intensity scales inversely with distance from center -- closer misses produce stronger shakes
- Audio pitch on rim bounce rises slightly as proximity to center increases (subconscious positive signal)

Research shows near-misses activate the same reward pathways as actual wins in fMRI studies. This is the primary driver of "one more try" behavior.

### Variable Reward Schedule

Despite a deterministic scoring structure, variable rewards are built into the game loop:

- **Moneyball events** (8% chance after streak >= 3): unpredictable bonus multiplier with distinct fanfare
- **Rim bounces**: some shots that look like misses actually bank in -- this occasional reversal of expectations creates dopamine spikes
- **Coin drop patterns**: coins scatter unpredictably on made baskets, creating a mini-collection moment
- **Unlock frequency**: players cannot predict exactly when they will earn enough for the next upgrade. The gap is always "just one more run"

This follows Skinner's variable ratio reinforcement schedule -- the strongest predictor of compulsive behavior in operant conditioning research.

### Compounding Progression Systems

Two tracks of permanent progression operate simultaneously:

**Meta-upgrades (purchased with earned coins)**:
- Larger hoop (+4px radius, stackable up to +16px)
- Slower shot clock decay (-0.5s per level, max 3s reduction)
- More precise power meter (+2% accuracy per level, max +8%)
- Shot counter persistence (retain shot indicator during streak transition animations)

**Collection unlocks**:
- New courts (street courts, arena courts, iconic venues) at specific coin thresholds
- Ball variants (classic orange, black/gold, rainbow glitch effect)
- Rim textures (chrome, gold, ice)
- Celebrations (confetti burst, crowd cheer, flash photo) unlock based on streak milestones

Progression guarantees that every session produces tangible advancement. This eliminates the psychological weight of "wasted time" after a short run.

### Loss Aversion Mechanics

The pain of losing a streak is designed to feel motivating rather than punishing:

- Streak counter glows brighter as it grows, making loss visually painful
- Each level's coin cost has a "90% complete" visual indicator showing progress toward the next unlock
- After any miss, a summary screen shows exact coins earned during that run (never shows only total)
- Streak insurance items (purchasable, limited stock per day) let players save a streak of 3+ baskets with one tap

### Zeigarnik Effect in Collection System

Achievement cards are designed to be incomplete by default:

- Players start with no cards visible; each achievement has a grayed-out silhouette
- Completing an achievement triggers a distinct sound and animation that cannot be dismissed until the card is viewed
- Cards have no numerical progress -- only complete or not. This binary state creates closure urgency
- The "collections" page shows empty slots prominently, making incompleteness visually unavoidable

## Retro Aesthetic Specification

### Visual Design

- **Resolution**: 160x144 pixels rendered at native resolution (no upscaling). Each "pixel" is visible but crisp.
- **Color palette**: Limited to 32 colors per scene. Primary game screen uses: deep blue background, white court lines, orange ball, red rim with white net.
- **Sprites**: All characters and objects are hand-drawn at 8x8 or 16x16 pixel grids.
- **Animation**: Ball rotation is a simple 4-frame spin cycle. Rim bounce uses a single deformation frame (rim stretches outward 3px then springs back). Net swings on made baskets with a 2-frame sine wave approximation.
- **CRT effect**: Subtle scanline overlay at 10% opacity covering the full screen. No bloom, no anti-aliasing, pure pixel-perfect rendering.

### Audio Design

- **Music**: Single looping 8-bit melody (4 channels maximum: lead, harmony, bass, noise). Tempo increases subtly with streak count (starts at 120 BPM, peaks at 160 BPM at streak 10+).
- **SFX catalog**:
    - Power charge ramp: rising tone pitch during hold (frequency scales with charge level)
    - Swish: white noise burst filtered to sound like net swoosh
    - Rim hit: short metallic click with resonant decay (~200ms)
    - Moneyball: ascending 3-note fanfare (C-E-G chord, 8-bit square wave)
    - Miss: descending tone pair (G-F#, 150ms each)
    - Streak milestone (every 5): brief crowd cheer sample (8-bit downsampled)
    - Upgrade purchase: satisfying coin clink + confirmation chime

### Haptic Feedback

- Power charge ramp: very subtle vibration ticks at 25%, 50%, 75% thresholds
- Made basket: single strong pulse synchronized with swish audio
- Rim hit: triple-burst micro-vibration matching the ball impact rhythm (3 quick pulses, ~50ms each)
- Miss/streak broken: one long moderate vibration (100ms)

## Session Design

### Default Run

- No time limit (unless shot clock active at streak >= 8)
- Run ends on first rim miss (ball bounces out)
- Coins earned = sum of coins from all baskets in that run
- High score and total lifetime coins persist across sessions

### Daily Challenge Mode

- One free daily challenge per calendar day
- Fixed handicap applied to all players equally (e.g., "Make 8 baskets with hoop moving 20px each shot")
- Global leaderboard showing best streaks from the past 7 days
- Reset at midnight local time -- creates urgency without forced engagement
- Completing a daily challenge awards bonus coins and achievement progress

### Streak Showcase

At every multiple of 5 (streak 5, 10, 15...), a brief celebration interrupts normal gameplay:
- Screen flashes gold for 500ms
- A "STREAK [N]" banner scrolls up from bottom in pixel font
- Power meter briefly resets to fully charged as a visual reward
- Play continues normally after the celebration (no game pause)

This leverages milestone psychology -- players stay engaged not just for the next basket but specifically to reach the next round-number celebration.

## UI Layout

```
┌─────────────────────┐
│   STREAK: 0         │  ← Streak counter + score multiplier top-left
│   HIGH: 12          │  ← Lifetime best streak
├──────────┬──────────┤
│ ║║       |    O     │  ← Left: power meter (vertical bar)
│ ║║       |   /|\    │  ← Center/Right: player sprite, ball, hoop
│  ▓▓      |   / \    │
│          |          │
│          |          │  ← Court background with pixel texture
├──────────┴──────────┤
│  COINS: 47         │  ← Coin count bottom-right
│  [SHOP] [CHALLENGE]│  ← Two buttons at bottom (settings accessed via menu)
└─────────────────────┘
```

The UI is minimal during active gameplay. Only the streak counter, coin total, and power meter are visible mid-run. All secondary screens (shop, achievements, daily challenge results) appear between runs only.

## Technical Notes for Implementation

- **Physics**: Simple projectile motion with gravity constant `9.8 m/s^2` scaled to pixel units
- **Collision detection**: Circle-to-circle (ball radius vs rim radius at left and right rim positions)
- **Rim bounce resolution**: If ball velocity after rim collision has an inward horizontal component AND the center is within rim width tolerance, ball continues toward net. Otherwise it bounces outward (miss).
- **Hoop position state**: Stored in a single mutable integer variable per run that updates between shots. Not accessible to physics calculations during active flight.
- **Power meter**: Linear mapping from hold duration to charge percentage. Clamped 0-100%. Visual fill bar synced at 60fps.
