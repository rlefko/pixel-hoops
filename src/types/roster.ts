import type { Archetype, Player, PlayerStats } from './player';
import type { PlayerClass } from '@/game/ratings';

/**
 * Floor positions for the 5-on-5 model. PG/SG are guards, SF is the wing,
 * PF/C are bigs. The sim deploys five players, one per position, so "5-on-5"
 * is real.
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
  /**
   * The player's intrinsic class (D/C/B/A/S/S+), fixed from their BASE stats at
   * creation/recruit and never changed by upgrades, abilities, or training. Drives
   * draft cost and recruit/opponent class gating; the card shows it with an arrow
   * to the current class (classForOvr of the effective OVR). Optional for legacy
   * saves; backfilled on load.
   */
  originalClass?: PlayerClass;
  /** Games this player must sit out from a between-game injury (0/undefined = healthy). */
  gamesOut?: number;
  /** A 90+ real NBA great: gold nameplate, signature ability, very rare. */
  legendary?: boolean;
  /** Signature ability id (legends only; see src/game/abilities.ts). */
  ability?: string;
  /** On-loan recruit: usable for the rest of this run but never kept (stripped at merge). */
  onLoan?: boolean;
  /** Run-scoped equipped item (max 1/player; reset each run, never persists home). */
  item?: { defId: string };
  /**
   * Equipped gacha ability (a SEPARATE slot from {@link item} and the legend
   * signature {@link ability}). Stamped onto the run player from the home record's
   * equippedAbilities at run start and kept for the whole run (persists between
   * rounds, cannot change mid-run), but never persisted home at merge: the home
   * source of truth is HomeRoster.equippedAbilities. See src/game/abilities-gacha.ts.
   */
  equippedAbility?: { id: string };
  /**
   * Run-scoped training gains: accumulated +1s bought at Training nodes with
   * training points. The only path past the normal 10 cap (up to 15). Baked into
   * effective stats and the card display, but never persisted home (stripped at
   * merge, like {@link item}).
   */
  trainingDelta?: Partial<PlayerStats>;
}

/** The full owned squad: five starters plus bench depth. */
export interface Roster {
  starters: RosterPlayer[];
  bench: RosterPlayer[];
}
