import type { Roster, RosterPlayer } from '@/types/roster';
import type { RunRewards } from '@/types/run-map';
import type { PlayerStats } from '@/types/player';
import type { RNG } from './rng';
import { buildStartingRoster } from './tournament';
import { expandStats, isLegacyStats } from './stat-migration';
import { RATING_CAP, canUpgrade, upgradeCost } from './upgrades';

/**
 * The persistent "home roster" that compounds across runs. A run operates on a
 * copy of these owned players; recruits and training merge back home when the
 * run ends (win OR loss), so no run is wasted. See docs/gameplay-redesign.md.
 *
 * Permanent stat upgrades (bought in the Locker Room between runs) live in the
 * `upgrades` ledger, the single source of truth for each stat's cost tier and
 * its +5 paid cap, kept separate from in-run training gains.
 */
export interface HomeRoster {
  /** Every owned player. The first five default to starters; the rest are bench. */
  players: RosterPlayer[];
  coins: number;
  reputation: number;
  /** Paid +1 counts per player (`name|POS`) per stat. Drives cost tier + cap. */
  upgrades: Record<string, Partial<Record<keyof PlayerStats, number>>>;
  /** Completed runs since a legendary was last offered (soft pity). */
  legendDryStreak: number;
}

/** Owned players beyond the starting five are capped so the roster cannot bloat. */
const EXTRA_CAP = 12;
const MAX_PLAYERS = 5 + EXTRA_CAP;
// v3 adds the permanent-upgrade ledger and legendary pity counter (both additive
// optionals); v1's four-stat lines are still migrated to the ten-rating model.
const HOME_ROSTER_VERSION = 3;

export interface SerializedHomeRoster {
  version: number;
  data: HomeRoster;
}

/** A fresh home roster: a rookie five (one per position), no extras. */
export function createRookieRoster(rng: RNG): HomeRoster {
  const base = buildStartingRoster(rng); // five starters, empty bench
  return { players: base.starters, coins: 0, reputation: 0, upgrades: {}, legendDryStreak: 0 };
}

/** Turn owned players into a run Roster (first five start, the rest are bench). */
export function homeToRunRoster(home: HomeRoster): Roster {
  return {
    starters: home.players.slice(0, 5),
    bench: home.players.slice(5),
  };
}

/** Stable per-player identity for the upgrade ledger (survives merge reordering). */
export function playerKey(rp: RosterPlayer): string {
  return `${rp.player.name}|${rp.position}`;
}

/** How many paid +1s a player has bought for one stat. */
export function upgradeCount(
  home: HomeRoster,
  rp: RosterPlayer,
  stat: keyof PlayerStats
): number {
  return home.upgrades[playerKey(rp)]?.[stat] ?? 0;
}

/**
 * Buy one permanent +1 of `stat` for the player at `index`. Returns a NEW home
 * roster with coins deducted, the stat raised, and the ledger incremented. A
 * no-op (returns the same reference) when unaffordable, at the per-stat cap, or
 * already at the rating ceiling.
 */
export function applyUpgrade(
  home: HomeRoster,
  index: number,
  stat: keyof PlayerStats
): HomeRoster {
  const rp = home.players[index];
  if (!rp) return home;
  const key = playerKey(rp);
  const bought = home.upgrades[key]?.[stat] ?? 0;
  if (!canUpgrade(stat, rp.player.stats[stat], bought)) return home;
  const cost = upgradeCost(stat, bought);
  if (home.coins < cost) return home;
  const players = home.players.map((p, i) =>
    i === index
      ? {
          ...p,
          player: {
            ...p.player,
            stats: { ...p.player.stats, [stat]: Math.min(RATING_CAP, p.player.stats[stat] + 1) },
          },
        }
      : p
  );
  const upgrades = { ...home.upgrades, [key]: { ...home.upgrades[key], [stat]: bought + 1 } };
  return { ...home, players, coins: home.coins - cost, upgrades };
}

/**
 * Fold a finished run's gains back into the home roster. The run roster started
 * as a copy of home and accumulated recruits and training, so its full player
 * set becomes the new owned roster, capped. Run-scoped state is stripped:
 * on-loan legends never come home, and equipped items reset each run. The
 * upgrade ledger is preserved; the legendary pity streak advances unless a
 * legendary was offered this run.
 */
export function mergeRunGainsIntoHome(
  home: HomeRoster,
  runRoster: Roster,
  rewards?: RunRewards,
  legendOffered = false
): HomeRoster {
  const all = [...runRoster.starters, ...runRoster.bench]
    .filter((p) => !p.onLoan)
    .map((p) => {
      if (!p.item) return p;
      const copy = { ...p };
      delete copy.item; // items are run-scoped; never persist
      return copy;
    })
    .slice(0, MAX_PLAYERS);
  return {
    players: all,
    coins: home.coins + (rewards?.coins ?? 0),
    reputation: home.reputation + (rewards?.reputation ?? 0),
    upgrades: home.upgrades,
    legendDryStreak: legendOffered ? 0 : home.legendDryStreak + 1,
  };
}

export function serializeHomeRoster(home: HomeRoster): SerializedHomeRoster {
  return { version: HOME_ROSTER_VERSION, data: home };
}

/**
 * Restore a home roster from storage, tolerating missing/garbage fields and
 * upgrading legacy four-stat saves (v1) to the ten-rating model. New optional
 * fields (the upgrade ledger, pity counter) default cleanly; run-scoped state
 * (items, on-loan flags) is stripped defensively in case a forward save leaks it.
 */
export function deserializeHomeRoster(raw: unknown): HomeRoster | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = (raw as Partial<SerializedHomeRoster>).data;
  if (!data || !Array.isArray(data.players) || data.players.length < 5) return null;
  const playersOk = data.players.every((p) => {
    const stats = p?.player?.stats as unknown as Record<string, unknown> | undefined;
    return (
      !!stats &&
      typeof p.position === 'string' &&
      (typeof stats.outside === 'number' || isLegacyStats(stats))
    );
  });
  if (!playersOk) return null;
  const players = data.players.map((p): RosterPlayer => {
    const migrated = isLegacyStats(p.player.stats)
      ? { ...p, player: { ...p.player, stats: expandStats(p.player.stats, p.position) } }
      : { ...p };
    delete migrated.item; // never trust a persisted run-scoped item
    delete migrated.onLoan;
    return migrated;
  });
  return {
    players,
    coins: typeof data.coins === 'number' ? data.coins : 0,
    reputation: typeof data.reputation === 'number' ? data.reputation : 0,
    upgrades: data.upgrades && typeof data.upgrades === 'object' ? data.upgrades : {},
    legendDryStreak: typeof data.legendDryStreak === 'number' ? data.legendDryStreak : 0,
  };
}
