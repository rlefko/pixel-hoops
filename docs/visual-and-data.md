# Visuals and Data Foundation

This doc covers the work that takes Pixel Hoops from "playable but flat" to "feels
like a game": readable navigation, a dark-only presentation, pixel players on the
court, a real NBA data foundation, and the reactive-crowd and ceremony passes
layered on top. Deeper polish (rich shot animation, full per-franchise rosters)
is sequenced in [roadmap.md](roadmap.md).

## 1. Dark-only presentation (the white-background fix)

The sim and run screens could flash white. Root cause: the root navigator
(`app/_layout.tsx`) followed the device color scheme and used React Navigation's
light `DefaultTheme` when the phone was in light mode, and the `Stack` set no
`contentStyle`, so the white navigator surface showed through on overscroll,
transitions, and safe-area gaps.

Pixel Hoops is a dark 8-bit game, so we pin a single palette-matched dark theme
unconditionally:

- `app/_layout.tsx` builds `navTheme` from `DarkTheme` with `background` and
  `card` set to `palette.bgDeep`, and the `Stack` sets
  `screenOptions.contentStyle = { backgroundColor: palette.bgDeep }`.
- `app/(home)/_layout.tsx` sets the same `contentStyle`.
- `app.json` sets `"userInterfaceStyle": "dark"` and a dark root `backgroundColor`.

## 2. Run-map navigation (real branches you can see)

Two problems made the map feel like a forced single route:

- **Generation.** Each node was wired `rng.int(1, 2)` forward edges, so it usually
  rolled **1** and `getReachableNodes` returned a single next node. Fixed in
  `src/game/run-map.ts`: each node now forks to `rng.int(2, 3)` next nodes
  (clamped to the next layer's size), so there is always a real branch. The
  orphan-patch still guarantees no node is unreachable. A test in
  `src/game/__tests__/run.test.ts` asserts every node forks whenever the next
  layer allows and that no node is orphaned.
- **Rendering.** `RunMapView` drew one generic vertical line per layer gap, so
  you could not tell which node led where. It now lays nodes out on a fixed-width
  board and draws a real connector line between every node and each of its `next`
  nodes (a thin rotated `View` per edge). The edges leaving your current node are
  highlighted gold, reachable nodes get a halo, the current node is tagged
  "YOU ARE HERE," and the map auto-scrolls to your position as you advance.

## 3. Procedural pixel players (the visual layer)

No sprite assets ship: players are drawn with plain `View`s, matching the
existing programmatic `PixelCourt`.

- **`src/components/fx/PixelPlayer.tsx`** draws one player: head (skin-tone
  variant), team-colored jersey with a number, shorts, and legs. `active` adds a
  gold ring for the player making the current play.
- **`src/components/game/CourtView.tsx`** places five home and five away players
  on the court in a position-based formation (home defends the bottom half, away
  the top, mirrored). It takes the current `SimEvent` and spotlights the scoring
  side's player at that position, who holds the ball and pops on each possession.
- **`PlayByPlayFeed`** now renders `CourtView` behind a slimmer play-by-play
  ticker (3 rows, text-shadowed for legibility), keeping all the existing juice
  (shake, flash, callouts). It takes the full `Team` objects so it can color the
  score bug and sprites with each team's `colorHex`. To support this, the run
  machine's `game` state carries the built `home`/`away` `Team`s.
- **`LineupBoard`** shows a small `PixelPlayer` avatar per starter, so players
  have a visual identity in the pregame screen too.

Stable jersey numbers and skin tones are derived from the player's name in
`src/components/game/jersey.ts` (shared by `CourtView` and `LineupBoard`).

## 4. NBA data foundation (real teams and likenesses)

Players and opponents are now a mix of **historical** legends, **modern** stars,
and **procedural** streetball players, giving the run real teams and likenesses
in the 8-bit style (names, team colors, jersey numbers, ratings: no photos).

### Offline-baked, key-free

The app never calls the NBA 2K API at runtime. A dev script bakes a curated
dataset into the repo so the sim stays deterministic, offline, and the API key
never ships:

- **`src/data/nba-teams.json`**: the 30 NBA franchises with primary/secondary
  colors (drives sprite jerseys and matchup text).
- **`src/data/nba-legends.json`**: ~40 all-time legends, one or more per
  franchise, each with a signature `ability`. Stats sit in the curated-great band
  (6-24, peaking near 24), re-baked from the NBA 2K API via `teamType=allt`.
  Refresh with the script below.
- **`src/data/nba-pool.json`**: the ~559-player current pool of stars and role
  players, re-baked from the NBA 2K API onto the normal 6-20 band, so each carries
  a granular, specialized stat line.
- **`src/data/nba.ts`**: typed loader (`NBA_TEAMS`, `NBA_LEGENDS`, `NBA_POOL`,
  `NBA_PLAYERS` alias of the legend pool, `teamByAbbr`) over the baked pools.

### Ratings mapping

`src/game/nba-map.ts` is a pure (dependency-free) module (`mapRatingsToStats`)
that condenses 2K's 0-99 attribute space into the game's ten ratings, so the app
and the fetch script share one source of truth:

| Game rating | 2K attributes |
| ----------- | ------------- |
| inside      | layup, driving/standing dunk, post control, strength |
| outside     | three-point, mid-range, free-throw |
| playmaking  | ball-handle, pass accuracy, pass IQ, speed-with-ball |
| perimeterD  | perimeter defense, steal, lateral quickness |
| interiorD   | interior defense, block, defensive rebound, strength |
| athleticism | speed, acceleration, vertical |
| iq          | intangibles, pass IQ, consistency |
| clutch      | intangibles (falls back to overall) |
| stamina     | stamina |
| durability  | durability / hustle |

`scaleRating` maps `~25..99` linearly onto the normal **6-20** game band, clamped;
`scaleRatingElite` widens the target to the curated-great **6-24** band for
legends. Field lookups are defensive (the API/2kratings naming varies), so
missing fields fall back to overall rather than producing `NaN`. The whole pool
was re-baked onto this scale, so every real player carries a granular,
specialized stat line.

### The real pools

`src/game/player-pool.ts` draws from the baked dataset:

- `generateOpponentTeam` (in `tournament.ts`) adopts a real franchise identity
  (name + `colorHex`) and fields that team's real starting five (`realStarterAt`),
  round-scaled, with a procedural fake only when a slot has no real. Every boss is
  additionally headlined by its own franchise's legend (`legendForTeam`, unscaled,
  gold) at the legend's natural position. Regular games never field a legend.
- `pickFreeAgentFive` seeds a fresh save with five real free agents (one per
  position); the first-run `FreeAgentRevealView` welcomes the player with them.
- `generateRecruitOffers` offers real free agents (`freeAgentPool`), skipping any
  the squad already owns, with a procedural backfill when the pool is exhausted.
- The rare on-loan legendary jackpot still comes from `legendRecruit`.

Pool players are scaled into the current round's range like fakes
(`src/game/stat-scaling.ts`, shared to avoid an import cycle), so they bring real
identity without breaking difficulty balance; legends keep their authored
curated-great ratings (up to 24). Everything is driven by the seeded RNG, so
replays stay deterministic.

### Refreshing the data

```sh
# Legend pool (default): the curated all-time greats + current stars
NBA2K_API_KEY=your_key npx tsx scripts/fetch-nba.ts --mode=legends
# Current player pool (~559 players)
NBA2K_API_KEY=your_key npx tsx scripts/fetch-nba.ts --mode=pool
# or
NBA2K_API_KEY=your_key npm run fetch:nba
```

The script (`scripts/fetch-nba.ts`) has two modes. In `--mode=legends` (the
default) it bakes the curated all-time greats (matched under `teamType=allt`)
plus current stars from the `ROSTER` list, maps their ratings with
`mapRatingsToStats` on the elite 6-24 band, and writes `src/data/nba-legends.json`;
the `legendary` flag and each legend's `ability` are re-added by hand after a bake
(the API provides neither). In `--mode=pool` it pages the current-player list
endpoint and bakes the ~559-player pool onto the normal 6-20 band into
`src/data/nba-pool.json` (no abilities, all classes). Edit the `ROSTER` list to
change which legends are baked. Set `NBA2K_API_BASE` to override the API host.
`.env` is gitignored; never commit the key. Team colors in `nba-teams.json` are
maintained by hand (the ratings API does not provide reliable brand colors).

## 5. Map polish, team colors, and game juice

A second visual pass made navigation legible and the sim lively.

- **Pokelike run map.** `RunMapView` was rebuilt as a themed court: an
  `ArenaBackdrop` (hardwood planks, a court frame, a crowd band), node tiles
  (`MapNodeTile`) with per-type 8-bit icons (`PixelIcons`), and dotted paths
  (`DottedPath`) that occupy only the gap between tiles so edges never cross a
  node. Combat tiles preview their opponent's franchise color and abbreviation
  via `previewOpponent` (deterministic, matches the team the game actually
  builds). The position marker and a start banner live in board headroom so they
  never clip, resources are labeled (coins / rep / round), and a `RosterStrip`
  shows the player's five starters (tap to open the lineup builder). Geometry
  lives in `map-geometry.ts`.
- **Team secondary colors.** `NbaTeam.secondaryHex` now flows through `Team`
  (`accentHex`): jersey trim on `PixelPlayer`, score-bug accent bars, and the
  court theme. The player's squad uses a brand gold accent (`homeTeamAccent`).
- **Opponent-themed court.** `courtThemeFor` (with the `color.ts` helpers) tints
  the floor and lines to the opponent franchise (the arena host), keeping the
  floor dark and falling back to the house orange when a secondary is too close
  to the floor to read. Unit-tested in `src/theme/__tests__`.
- **Game juice.** A ball arcs from shooter to rim on makes (`BallFlight`),
  particle bursts fire per event type (`ParticleBurst`: confetti on threes and
  and-ones, debris on dunks, cool on blocks and steals, team sparks on makes),
  and a rim/net ripple lands with the basket (`RimRipple`). All reuse the
  `feel/` reanimated primitives and honor `reducedMotion`.

## 6. Watch narrative and ceremony tiers (the visual excitement pass)

A third pass gave the watch a narrative layer and the meta screens celebration
proportional to magnitude, per the blueprint's compulsion-loop and
juice-the-peaks principles. Nothing below slows the average watch; only the
game-winner cinema spends time (about 250ms, at most once per game, close
finishes only).

- **Momentum derivation.** `src/game/momentum.ts` mirrors `streaks.ts`: pure,
  per-event scoring runs (banners gated at 6-0 / 10-0 / 14-0), lead changes,
  a crunch flag (close Q4, final 4:00, mirroring the sim's clutch margin), and
  the clincher. Unit-tested; no sim changes.
- **Watch peaks.** The hot hand escalates (warm tease aura at two straight, a
  flame-trailed ball and an ignite spark burst at three); the score bug pops and
  the frame tints on lead changes; crunch time dresses the screen (gold
  breathing underline, `CrunchVignette` edge frame, "CRUNCH TIME!" beat); quarter
  breaks get a small chapter marker; and the buzzer-beater or clincher plays in
  cinema (1.5x-stretched flight synced through `eventGapMs`, a 5 percent court
  zoom, a longer hit-stop). The callout slot keeps one voice at a time:
  clincher > streak > big play > crunch > run > sub.
- **The audible economy.** `TickCounter` (fx) wraps `useCountUp` with pitched
  tick audio and tier-layered settle beats (small ticks; medium adds the coin
  clink and a pop; large adds a success haptic). Wins tally their payout on the
  postgame screen (`pendingWinRewards` keeps the shown number exactly equal to
  the banked one), the wallet pill ticks as it receives, and training and locker
  +1s blip (band promotions land a bigger beat).
- **Ceremonies.** Run end shows an endowed ladder bar (cleared maps filled, the
  next rung breathing), a banked-coins keep-tally, and a NEW RUN glow; the
  champion screen counts its haul and stages the ladder unlock as its own beat;
  collection copy pips clink in one by one and a meter one copy from ownership
  turns gold ("1 MORE TO OWN").
- **Staged reveals.** `useStagedReveal` (feel) extracts the legend flip's
  windup-hold-payoff: anticipation scales with the machine's stakes, the payoff
  with the result. Applied to the arcade's ability and scouting pulls; commons
  stay instant and reduced motion skips the hold.
- **Run heat.** `StreakFlame` marks a hot run (ember at 2 wins, breathing flame
  at 4, gold blaze at 6) on the run HUD, the pregame, and the home screen's
  resume card. Peak games (elite, boss, championship) tip off through a
  stake-themed pixel-dissolve ceremony; routine games keep the instant cut.

## 7. Reactive crowds, hub deltas, and crest ceremonies (the deferred items)

A fourth pass shipped the items deferred from the visual excitement pass, with
two of them redesigned after research into arcade sports and roguelike practice.
Nothing here adds a millisecond to the watch; every beat is an overlay, a
one-shot, or a meta-screen ceremony.

- **The crowd plan.** `src/game/crowd-pulse.ts` mirrors `momentum.ts`: a pure,
  budget-capped plan (`CROWD_PULSE_BUDGET = 8`) of the game's crowd beats,
  derived once per timeline. Honesty is baked into the module and pinned by
  tests: big and peak beats belong to the HOME side only. The sim can hand the
  buzzer-beater to the opponent, and there the crowd stays silent — the quiet
  after the horn is the read of a loss (the existing neutral shake/flash still
  land). Quarter breaks and crunch lead changes stay neutral state reads.
- **CrowdPulse.** A one-shot edge glow (`src/components/fx/CrowdPulse.tsx`, a
  10px border frame, opacity-only) fired from the plan in `PlayByPlayFeed`:
  small 0.12 / big 0.20 / peak 0.32, colored by the beat (gold walk-off, scorer
  color, new-leader color, steel-blue chapter). No loop, so nothing to gate on
  idle; it no-ops under reduced motion and without Arcade Extras.
- **PixelCrowd + bracket-scaled stands.** The map's CrowdBand seat grid was
  extracted into `src/components/fx/PixelCrowd.tsx` over pure layout math
  (`pixelCrowdLayout.ts`): seat presence is a monotone hash of density, so the
  stands FILL IN as the bracket climbs (60% on map one to packed at the final,
  which also seats a second row under a gold frame) and never reshuffle. The
  map keeps the old idle-paused shimmer verbatim.
- **The apron crowd.** Elite, boss, and championship games seat PixelCrowd
  strips in the watch's out-of-bounds apron (`ApronCrowd.tsx`; vertical columns
  on phones, since the aspect-locked court is height-limited). Routine games
  keep the clean dark apron — the contrast is the escalation. Static at rest
  (never a loop on the live watch); home makes bob the seats 1px in alternating
  columns, plan-level big/peak beats add camera-flash pixels, and the opponent
  never stirs it. `arenaTierFor` (`src/game/arena-tier.ts`) is now the single
  stakes derivation shared by the pregame ceremony wipe and the watch.
- **Crowd swells, not a crowd bed.** The deferred "crowd-noise layer" shipped
  as three baked one-shot LFSR-noise swells (`crowdCheer`/`crowdRoar`/
  `crowdMurmur` in `src/audio/recipes.ts`) rather than a resident loop: a loop
  costs battery (every resident expo-audio player runs a wakeup timer), masks
  the chiptune mix, and exposes its seam in a 30-second game, while NES-era
  sports games fired discrete swells on events. The swells are unpitched (never
  out of key), start ~90ms after the play's own sting (the arena answering),
  sit 6-9dB under the event SFX, never duck the music, and coalesce through
  2.2s/2.5s cooldowns. Cheers answer home dunks/and-ones/clutch threes, the
  roar answers the home walk-off and the championship, the murmur marks crunch
  opening; opponent plays and losses get silence. The tipoff whistle gained a
  one-second arena-air tail so every game opens in a building.
- **Hub "since you left" deltas.** A `hubSeen` ledger on the home roster (v19)
  records the coin/crest/copy values the player last ACKNOWLEDGED; deltas are
  clamped gains, and the migration backfills to current values so a veteran's
  first launch shows nothing fake. The hub lands static and tappable, then
  ~250ms later gold chips cascade in (30ms stagger): an earned-coins "+N" beside
  the CoinPill (which climbs from the old balance on the small-tier
  TickCounter), a copies count on the ROSTER tile, a dot on HALL OF FAME. One
  tick ladder + one haptic per return; nothing renders when nothing rose (badge
  credibility is a spendable budget); chips clear on VIEWING the owning screen,
  never on tapping the badge. All overlays — zero height on the one-viewport
  home column.
- **Crest-shelf ceremony.** The Hall of Fame visit that acknowledges new crests
  is also their ceremony: each new cell pops into the shelf with a tier-colored
  spark and a pitch-stepped tick while the count climbs, and crossing 5/10/15/20
  fires the shared reward burst (legendary confetti at 20/20). One-shot by
  persisted state — a revisit renders a settled, fully static shelf.

**Deliberately not built:** the instant replay on game-winners. The live
slow-mo cinema already sells the moment in the moment — the pattern Tekken 7
(which removed its post-KO replay because players had already processed the
moment), Smash's Finish Zoom, and Peggle's Extreme Fever converged on — so a
post-buzzer replay would be redundant ceremony in a 30-second session. If a
replay ever ships it should be pull-not-push: an opt-in affordance on the
postgame screen, close home wins only, 3-6s at half speed, one-tap skip.

## Deferred (see roadmap)

Hand-drawn sprite sheets, multi-frame dunk and block animation frames, complete
per-franchise real rosters and a full 2,500-player import, and era-based power
tiers.
