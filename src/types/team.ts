import type { PlayerStats } from './player';
import type { RosterPlayer } from './roster';
import type { GamePlan } from './tactics';
import type { TeamModifier } from '@/game/effects';

/**
 * Bonuses produced by a lineup's composition. Synergy rewards thoughtful roster
 * construction (the heart of the pokelike-style meta): two guards push the
 * pace, twin bigs anchor the defense, a balanced five plays clutch. Computed
 * once at game start (see src/game/synergy.ts) and stored on the Team.
 */
export interface SynergyResult {
  /** Additive pace bonus (more possessions). */
  paceBonus: number;
  /** Additive team clutch bonus. */
  clutchBonus: number;
  /** Additive defensive counter-stat bonus. */
  defenseBonus: number;
  /** Additive offensive stat bonus. */
  offenseBonus: number;
  /** Human-readable synergy names for the pregame UI (e.g. "Twin Towers"). */
  labels: string[];
}

/** The five players on the floor plus their normalized usage weights. */
export interface Lineup {
  /** Exactly five players, ideally one per position. */
  players: RosterPlayer[];
  /** Possession-share weights (sum to 1), driving who takes each shot. */
  usageWeights: number[];
}

/**
 * A lineup's effective stat line, used as the team's "player" during
 * resolution. Not a flat average: scorers are weighted by usage, the rim is
 * anchored by the best defender, etc. (see src/game/lineup.ts).
 */
export interface TeamStats extends PlayerStats {
  /** Derived possessions-per-quarter driver. */
  pace: number;
  /** Offensive composite of the on-court five (for display/AI). */
  off: number;
  /** Defensive composite of the on-court five. */
  def: number;
  /** Overall composite of the on-court five. */
  ovr: number;
  /**
   * Floor spacing, 0 (paint clogged, no shooters) to 1 (five-out). The share of
   * the five who are credible outside threats. Drives the fit/spacing layer:
   * poor spacing taxes rim attacks (defenders sag), good spacing frees up
   * everything (see src/game/simulation.ts).
   */
  spacing: number;
  /**
   * Playmaking depth, 0..1 (average playmaking normalized to the cap). Gates
   * assist rate and lob/cut finishing: a rim runner needs a creator to feed him.
   */
  creation: number;
}

/** Everything the sim needs to play one side of a game. */
export interface Team {
  name: string;
  lineup: Lineup;
  tactic: GamePlan;
  synergy: SynergyResult;
  /**
   * Run-level + ability bonuses (passive boosts, legend auras/hooks, on-loan
   * chemistry tax). Folded into teamStats and re-applied on every substitution;
   * the conditional hooks are evaluated per possession by the sim.
   */
  modifier: TeamModifier;
  teamStats: TeamStats;
  /** Bench players (beyond the starting five) available for in-game rotation. */
  bench: RosterPlayer[];
  /** Primary team color for juice / UI (a palette entry or franchise primary). */
  colorHex: string;
  /** Secondary/accent color: jersey trim, court lines, and score-bug accents. */
  accentHex: string;
}
