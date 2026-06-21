# Pixel Hoops 🏀

Addictive 8-bit basketball roguelike built with React Native (Expo) and TypeScript. Build a roster of pixel players, enter tournaments, and win games through tactical card play -- not reflexes or timing.

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

- **Framework**: Expo (React Native) v56
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

Pixel Hoops combines Slay the Spire-style card strategy with NBA Jam arcade energy. Build a roster of 8-bit players, recruit defeated opponents between runs, and climb tournament brackets through smart card play. Every run ends in permadeath but leaves permanent progress behind.

Full design document in [docs/game-concept.md](docs/game-concept.md). Key pillars: one-thumb strategy playability, instant restart under 5 seconds, meaningful death (no run is wasted), compounding roster growth, and NBA Jam arcade energy.

## License

This project is licensed under the GNU General Public License v3.0 -- see [LICENSE](LICENSE).

## Author

Ryan Lefkowitz ([rlefkowitz1800@yahoo.com](mailto:rlefkowitz1800@yahoo.com))
