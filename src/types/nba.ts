import type { Position } from './roster';
import type { PlayerStats } from './player';

/**
 * Real-player and real-team data, sourced (offline) from the NBA 2K API
 * (https://www.nba2kapi.com, data from 2kratings.com). The app never calls the
 * API at runtime: a dev script (scripts/fetch-nba.ts) bakes a curated dataset
 * into src/data/*.json so the sim stays deterministic, offline, and key-free.
 * Stats are pre-mapped to the game's 3-10 scale (see src/game/nba-map.ts).
 */

export type Era = 'historical' | 'modern';

/** A real NBA franchise: identity + colors used for sprites and matchup text. */
export interface NbaTeam {
  /** Nickname, e.g. "Lakers". */
  name: string;
  /** City/region, e.g. "Los Angeles". */
  city: string;
  /** Three-letter code, e.g. "LAL"; links a RealPlayer to its team. */
  abbreviation: string;
  /** Primary jersey color (drives the pixel sprite + score bug). */
  primaryHex: string;
  /** Secondary/accent color. */
  secondaryHex: string;
}

/** A real player with stats already mapped into the game's 3-10 stat space. */
export interface RealPlayer {
  name: string;
  /** NBA 2K API slug, e.g. "lebron-james" (the fetch script's lookup key). */
  slug: string;
  /** Links to an NbaTeam.abbreviation. */
  teamAbbr: string;
  era: Era;
  position: Position;
  jerseyNumber: number;
  /** 2K overall rating (0-99) from the source dataset; surfaced in-game later. */
  overall: number;
  /** A 90+ all-time great: rare, on-loan only, gold nameplate, signature ability. */
  legendary?: boolean;
  /** Signature ability id (legends only; see src/game/abilities.ts). */
  ability?: string;
  stats: PlayerStats;
}
