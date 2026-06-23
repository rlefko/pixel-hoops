import type { Archetype, Player } from './player';

/**
 * Floor positions for the 5-on-5 model. PG/SG are guards, SF is the wing,
 * PF/C are bigs. The existing card game is a 1v1 stat comparison; the sim
 * pivot deploys five players, one per position, so "5-on-5" is real.
 */
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export const POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** Natural position for each existing archetype (no Player change needed). */
export const ARCHETYPE_POSITION: Record<Archetype, Position> = {
  'point-guard': 'PG',
  'shooting-guard': 'SG',
  'small-forward': 'SF',
  'power-forward': 'PF',
  center: 'C',
};

/** Inverse of ARCHETYPE_POSITION, for generating a player to fill a slot. */
export const POSITION_ARCHETYPE: Record<Position, Archetype> = {
  PG: 'point-guard',
  SG: 'shooting-guard',
  SF: 'small-forward',
  PF: 'power-forward',
  C: 'center',
};

/**
 * A {@link Player} as deployed on a team. Wraps the existing Player type
 * without modifying it, so all legacy player code keeps working (additive).
 */
export interface RosterPlayer {
  player: Player;
  /**
   * The player's real/intrinsic position (from their archetype). Drives synergy,
   * usage, and game-plan composition. NOT their court slot: where they line up on
   * the floor is the lineup array index (set by the lineup builder order), so any
   * player can fill any slot and you can field two of the same position.
   */
  position: Position;
  /** 0..100 share of offensive possessions when on court; derived if absent. */
  usage?: number;
  /** Real jersey number for baked NBA players; fakes derive one from the name. */
  jerseyNumber?: number;
}

/** The full owned squad: five starters plus bench depth. */
export interface Roster {
  starters: RosterPlayer[];
  bench: RosterPlayer[];
}
