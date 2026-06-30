# Pixel Hoops App Store Listing

Ready-to-paste copy and submission notes for the App Store (Apple) and Google
Play. Keep this in sync with the marketing language in `README.md` and
`docs/game-concept.md`. American English, no em dashes.

## Identity

- **App name:** Pixel Hoops
- **Subtitle (iOS, 30 char max):** 8-Bit Basketball Roguelike
- **Short description (Google Play, 80 char max):** Strategy-first 8-bit basketball roguelike. Build the squad, watch it ball out.
- **Bundle identifier / Android package:** `com.pixelhoops.app`
- **Version:** 1.0.0 (build 1)
- **Primary category:** Games
- **Secondary categories:** Strategy, Sports
- **Copyright:** © 2026 Ryan Lefkowitz
- **Developer / author:** Ryan Lefkowitz (rlefkowitz1800@yahoo.com)

## Promotional text (iOS, 170 char max)

Draft pixel ballers, set your game plan, then watch the auto-sim go to work. A
strategy-first basketball roguelike with NBA Jam energy. Fully offline, no ads.

## Description (App Store and Google Play full description)

Build the squad. Set the plan. Watch it ball out.

Pixel Hoops is an 8-bit basketball roguelike that trades reflexes for strategy.
Draft a roster of pixel players, lock in your lineup and game plan, then watch a
fast, juicy auto-sim play each game out possession by possession. You coach. The
cabinet plays.

It is Slay the Spire-style roster building with NBA Jam arcade energy. Chase
lineup synergies, recruit the opponents you defeat, equip abilities, and climb
the difficulty ladder by out-building your rivals. Every run ends in permadeath,
but your roster, coins, training, and reputation carry forward, so no run is ever
wasted.

FEATURES

- One-thumb strategy: tap to play, no twitch timing
- Fast auto-sim you can watch or skip
- Permadeath runs with compounding, persistent progress
- Recruit defeated players to grow your roster
- Coaches, training, and equippable abilities
- A difficulty ladder from class C to S+ with new unlocks
- Procedural 8-bit pixel art and chiptune audio
- 100 percent offline. No ads. No accounts. No tracking.

Pick it up for a five-minute run on the bus, or settle in for a deep climb on
the couch.

## Keywords (iOS, 100 char max, comma separated, no spaces after commas)

basketball,roguelike,roster,auto sim,arcade,8-bit,pixel,strategy,sports,hoops,gm,manager

> Verify this is at or under 100 characters before submitting. Do not repeat
> words already in the app name ("pixel", "hoops") if you need to free up space.

## What's New (release notes, 1.0.0)

First tip-off. Welcome to Pixel Hoops: draft your squad, set the game plan, and
climb the ladder. Includes the full roster, recruiting, coaches, training,
equippable abilities, procedural pixel art, and chiptune audio.

## App privacy (App Store Connect + Google Play Data safety)

Answer: **Data Not Collected.** The app has no accounts and no network calls. All
progress is stored locally on the device and never leaves it. There are no
analytics, no ads, and no third party SDKs. See `docs/privacy-policy.md` for the
full policy, which must be hosted at a public URL (for example GitHub Pages) and
linked below.

## Age rating

- **Apple:** 4+. No objectionable content. The ability "pull" mechanic uses
  in-game coins earned through play, not real money, so it is not simulated
  gambling. If real-money in-app purchases are ever added, revisit the age
  rating questionnaire.
- **Google Play (IARC):** Everyone. No in-app purchases, no ads, no user
  generated content.

## URLs (fill in before submission)

- **Support URL:** TODO (a simple page or the GitHub repo's issues page works)
- **Marketing URL (optional):** TODO
- **Privacy Policy URL:** TODO (host `docs/privacy-policy.md`, then paste the URL)

## Screenshots (follow-up, required for submission)

Not included in this pass. Capture from the running app on a simulator or device
and frame them. Required sizes:

- **iPhone 6.9 inch** (1320 x 2868 or 2868 x 1320), 3 to 10 shots
- **iPad 13 inch** (2064 x 2752) if shipping the iPad build
- **Google Play:** phone screenshots (min 2), plus a 1024 x 500 feature graphic

Good candidate screens: the home/title screen, the draft, a live game with the
court and players, a reward/recruit screen, and the difficulty ladder.

## EAS submit configuration (fill credentials before `eas submit`)

`eas.json` ships a `submit.production` placeholder. Provide credentials at submit
time (do not commit secrets):

- **iOS:** Apple ID, App Store Connect app ID (`ascAppId`), and Apple Team ID, or
  an App Store Connect API key.
- **Android:** a Google Play service account key JSON and the target `track`
  (for example `internal` for the first upload).

## Beta (TestFlight / Play internal testing)

For the beta group, build the `preview` or `production` profile and distribute
through TestFlight (iOS) or Play internal testing (Android). The app icon,
adaptive icons, and splash in this pass give testers a finished first impression.
