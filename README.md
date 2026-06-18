# Pixel Hoops 🏀

Addictive 8-bit basketball shooting game built with React Native (Expo) and TypeScript.

Hold to charge, release to shoot, make consecutive free throws before a moving hoop beats you. Deep skill ceiling wrapped in a one-thumb casual experience.

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

Full design document in [docs/game-concept.md](docs/game-concept.md). Key pillars: one-thumb playability, instant restart, skill-based uncertainty, compounding progression, and 8-bit aesthetics throughout.

## License

This project is licensed under the GNU General Public License v3.0 -- see [LICENSE](LICENSE).

## Author

Ryan Lefkowitz ([rlefkowitz1800@yahoo.com](mailto:rlefkowitz1800@yahoo.com))
