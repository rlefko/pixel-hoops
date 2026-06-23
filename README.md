# Pixel Hoops 🏀

Addictive 8-bit basketball roguelike built with React Native (Expo) and TypeScript. Build a roster of pixel players, set your lineup and game plan, then watch a fast, juicy auto-sim play out -- strategy over reflexes or timing.

## Quick Start

```bash
npm install
npx expo start
```

Run on device with the Expo Go app or build for iOS/Android.

## Project Structure

- `app/` -- navigation routes and screens (Expo Router)
- `components/` -- shared UI components
- `constants/` -- app-wide constants (colors, theme)
- `docs/` -- design documents and game concept
- `__tests__/` -- test suites

## Tech Stack

- **Framework**: Expo (React Native) v54
- **Language**: TypeScript with strict mode
- **Routing**: Expo Router
- **Linting**: oxlint
- **Type checking**: tsgo (TypeScript Native Preview)

## Development Commands

| Task             | Command                            |
| ---------------- | ---------------------------------- |
| Start dev server | `npx expo start`                   |
| Run on iOS       | `npx expo start --ios`             |
| Run on Android   | `npx expo start --android`         |
| Lint             | `npx oxlint`                       |
| Typecheck        | `npx tsgo --project tsconfig.json` |

## Game Concept

Pixel Hoops combines Slay the Spire-style roster building with NBA Jam arcade energy. Draft a roster of 8-bit players, chase lineup synergies, recruit defeated opponents between runs, and climb tournament brackets by out-building your rivals. You set the five and the game plan; the game auto-sims each matchup possession by possession. Every run ends in permadeath but leaves permanent progress behind.

Full design document in [docs/game-concept.md](docs/game-concept.md). Key pillars: one-thumb strategy playability, instant restart under 5 seconds, meaningful death (no run is wasted), compounding roster growth, and NBA Jam arcade energy.

## License

This project is licensed under the GNU General Public License v3.0 -- see [LICENSE](LICENSE).

## Author

Ryan Lefkowitz ([rlefkowitz1800@yahoo.com](mailto:rlefkowitz1800@yahoo.com))
