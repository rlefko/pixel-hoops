# Visuals and Data Foundation

This doc covers the work that takes Pixel Hoops from "playable but flat" to "feels
like a game": readable navigation, a dark-only presentation, pixel players on the
court, and a real NBA data foundation. It is the groundwork PR; deeper polish
(rich shot animation, full per-franchise rosters, audio) is sequenced in
[roadmap.md](roadmap.md).

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
- **`src/data/nba-players.json`**: a curated seed of real players across eras,
  with stats already on the game's 3-10 scale. Hand-authored so the feature works
  with no key; refresh/expand it with the script below.
- **`src/data/nba.ts`**: typed loader (`NBA_TEAMS`, `NBA_PLAYERS`, `teamByAbbr`).

### Ratings mapping

`src/game/nba-map.ts` is a pure (dependency-free) module that condenses 2K's
0-99 attribute space into the game's four stats, so the app and the fetch script
share one source of truth:

| Game stat   | 2K attributes |
| ----------- | ------------- |
| shooting    | three-point, mid-range, free-throw |
| speed       | speed, acceleration, ball-handling |
| athleticism | vertical, strength, dunk, block |
| clutch      | intangibles (falls back to overall) |

`scaleRating` maps `~25..99` linearly to `3..10`, clamped. Field lookups are
defensive (the API/2kratings naming varies), so missing fields fall back to
overall rather than producing `NaN`.

### The mixed pool

`src/game/player-pool.ts` draws from the baked dataset:

- `generateOpponentTeam` (in `tournament.ts`) adopts a real franchise identity
  (name + `colorHex`) and staffs the five with a seeded mix of real players (by
  position) and procedural fakes.
- `generateRecruitOffers` mixes real players (the exciting "catch") with fakes.

Real players are scaled into the current round's range like fakes
(`src/game/stat-scaling.ts`, shared to avoid an import cycle), so they bring
identity without breaking difficulty balance. Everything is driven by the seeded
RNG, so replays stay deterministic.

### Refreshing the data

```sh
NBA2K_API_KEY=your_key npx tsx scripts/fetch-nba.ts
# or
NBA2K_API_KEY=your_key npm run fetch:nba
```

The script (`scripts/fetch-nba.ts`) reads the key from the environment only,
fetches the curated slug list via the `X-API-Key` header, maps ratings with
`mapRatingsToStats`, and writes `src/data/nba-players.json`. Edit its `ROSTER`
list to change who is baked. Set `NBA2K_API_BASE` to override the API host if it
differs from the default. `.env` is gitignored; never commit the key. Team colors
in `nba-teams.json` are maintained by hand (the ratings API does not provide
reliable brand colors).

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

## Deferred (see roadmap)

Hand-drawn sprite sheets, a reactive crowd, multi-frame dunk and block animation
frames, complete per-franchise real rosters and a full 2,500-player import,
era-based power tiers, and an audio pass.
