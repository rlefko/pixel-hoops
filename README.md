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
| Start (fresh cache) | `npm run start:clear`           |
| Clean caches     | `npm run clean`                    |

## Troubleshooting

### "Unable to resolve ..." after an Expo SDK upgrade

If `npx expo start` or `npx expo run:ios` fails to bundle with an error like `Unable to resolve "expo-router/react-navigation"` (or any other newly added module path) right after bumping the Expo SDK, it is almost always a stale Metro/Haste cache, not a missing dependency. The cached module map predates the new file, so Metro reports it as missing even though it is installed. Clear the cache and restart:

```bash
npm run start:clear   # expo start with a fresh Metro cache
```

For a deeper reset, also wipe project caches and reinstall:

```bash
npm run clean
rm -rf node_modules
npm install
npx expo start --clear
```

### Native build errors after an Expo SDK upgrade

If `npx expo run:ios` or `npx expo run:android` fails at the native build or CocoaPods step after bumping the Expo SDK, with errors like `[Expo] @expo/dom-webview was not linked: requires iOS 16.4 but app targets 15.1`, `Unable to find a specification for ExpoModulesCore`, or `no such module 'Expo'`, your local native build state is stale. The gitignored `ios/` and `android/` folders, the CocoaPods install, and Xcode's DerivedData were all produced by the old SDK. Regenerate everything from scratch at the current SDK's defaults (SDK 56 targets iOS 16.4 and ships Expo as precompiled XCFrameworks):

```bash
npx expo prebuild --clean                      # regenerate ios/ and android/
rm -rf ~/Library/Developer/Xcode/DerivedData   # clear Xcode's stale build cache
cd ios && pod install && cd ..                 # reinstall pods (fetches the precompiled frameworks)
npx expo run:ios
```

If CocoaPods still cannot resolve a pod spec such as `ExpoModulesCore`, refresh the local spec repo first with `cd ios && pod install --repo-update`.

## Game Concept

Pixel Hoops combines Slay the Spire-style roster building with NBA Jam arcade energy. Draft a roster of 8-bit players, chase lineup synergies, recruit defeated opponents between runs, and climb tournament brackets by out-building your rivals. You set the five and the game plan; the game auto-sims each matchup possession by possession. Every run ends in permadeath but leaves permanent progress behind.

Full design document in [docs/game-concept.md](docs/game-concept.md). Key pillars: one-thumb strategy playability, instant restart under 5 seconds, meaningful death (no run is wasted), compounding roster growth, and NBA Jam arcade energy.

## License

This project is licensed under the GNU General Public License v3.0 -- see [LICENSE](LICENSE).

## Author

Ryan Lefkowitz ([rlefkowitz1800@yahoo.com](mailto:rlefkowitz1800@yahoo.com))
