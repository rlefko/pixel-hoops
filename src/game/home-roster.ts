import type { Roster, RosterPlayer } from '@/types/roster';
import type { RunRewards } from '@/types/run-map';
import type { RNG } from './rng';
import { buildStartingRoster } from './tournament';

/**
 * The persistent "home roster" that compounds across runs. A run operates on a
 * copy of these owned players; recruits and training merge back home when the
 * run ends (win OR loss), so no run is wasted. See docs/gameplay-redesign.md.
 */
export interface HomeRoster {
  /** Every owned player. The first five default to starters; the rest are bench. */
  players: RosterPlayer[];
  coins: number;
  reputation: number;
}

/** Owned players beyond the starting five are capped so the roster cannot bloat. */
const EXTRA_CAP = 12;
const MAX_PLAYERS = 5 + EXTRA_CAP;
const HOME_ROSTER_VERSION = 1;

export interface SerializedHomeRoster {
  version: number;
  data: HomeRoster;
}

/** A fresh home roster: a rookie five (one per position), no extras. */
export function createRookieRoster(rng: RNG): HomeRoster {
  const base = buildStartingRoster(rng); // five starters, empty bench
  return { players: base.starters, coins: 0, reputation: 0 };
}

/** Turn owned players into a run Roster (first five start, the rest are bench). */
export function homeToRunRoster(home: HomeRoster): Roster {
  return {
    starters: home.players.slice(0, 5),
    bench: home.players.slice(5),
  };
}

/**
 * Fold a finished run's gains back into the home roster. The run roster started
 * as a copy of home and accumulated recruits (bench) and training (mutated
 * stats), so its full player set becomes the new owned roster, capped.
 */
export function mergeRunGainsIntoHome(
  home: HomeRoster,
  runRoster: Roster,
  rewards?: RunRewards
): HomeRoster {
  const all = [...runRoster.starters, ...runRoster.bench].slice(0, MAX_PLAYERS);
  return {
    players: all,
    coins: home.coins + (rewards?.coins ?? 0),
    reputation: home.reputation + (rewards?.reputation ?? 0),
  };
}

export function serializeHomeRoster(home: HomeRoster): SerializedHomeRoster {
  return { version: HOME_ROSTER_VERSION, data: home };
}

/** Restore a home roster from storage, tolerating missing/garbage fields. */
export function deserializeHomeRoster(raw: unknown): HomeRoster | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = (raw as Partial<SerializedHomeRoster>).data;
  if (!data || !Array.isArray(data.players) || data.players.length < 5)
    return null;
  const playersOk = data.players.every((p) => {
    const stats = p?.player?.stats;
    return (
      !!stats &&
      typeof p.position === 'string' &&
      typeof stats.shooting === 'number' &&
      typeof stats.speed === 'number' &&
      typeof stats.athleticism === 'number' &&
      typeof stats.clutch === 'number'
    );
  });
  if (!playersOk) return null;
  return {
    players: data.players,
    coins: typeof data.coins === 'number' ? data.coins : 0,
    reputation: typeof data.reputation === 'number' ? data.reputation : 0,
  };
}
