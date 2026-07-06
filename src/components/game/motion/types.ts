import type { Frac, SpriteKey } from '../courtMath';
import type { WatchMode } from '../choreography';
import type { Position } from '@/types/roster';
import type { SimEvent, SimTeamSide } from '@/types/sim';
import type { CoachStyle } from '@/game/coaches';
import type { TeamArchetype } from '@/game/team-archetype';
import type { PlayerStats } from '@/types/player';
import type { PlaystyleId, TendencyProfile } from '@/game/playstyle';

/**
 * Shared vocabulary for the agent-based possession engine. The decision layer
 * (sampler/roles/defense) turns one abstract SimEvent outcome into a
 * `PossessionScript`; the steering core (agents/phases/simulate/bake) plays that
 * script out and bakes it into the renderer's Waypoint/ball structures. Pure,
 * Node-safe (no react-native/reanimated). See choreography.ts for the seam.
 */

// --- Play vocabulary ---

/** How the possession starts: a break, early offense, a set, or a putback. */
export type PlayFamily = 'transition' | 'earlyOffense' | 'halfCourt' | 'putback';

/** A named half-court action (the read the offense runs). */
export type HalfCourtAction =
  | 'pnr' // pick-and-roll
  | 'pnp' // pick-and-pop
  | 'iso' // isolation
  | 'postUp'
  | 'dho' // dribble hand-off
  | 'pindown'
  | 'floppy'
  | 'flare'
  | 'motion'
  | 'spotUp' // drive-and-kick to a spot-up shooter
  | 'horns';

/** The concrete action a possession runs (family collapses into one of these). */
export type PlayAction = HalfCourtAction | 'transition' | 'putback';

/** An off-ball decoy cut (never touches the ball unless the cutter is the assister). */
export type CutType = 'backdoor' | 'basketCut' | 'giveAndGo' | 'flare' | 'curl' | 'relocate';

/** Defensive base: man or a sparing zone. */
export type DefScheme = 'man' | 'zone23' | 'zone32';

/** On-ball screen coverage (only meaningful for screen actions). */
export type Coverage = 'drop' | 'hedge' | 'switch' | 'ice' | 'none';

/** How guarded the shot reads (tunes defender timing/tightness, never the make). */
export type Contest = 'open' | 'contested';

/** An offensive role, one per on-court position. */
export type OffRole = 'finisher' | 'initiator' | 'screener' | 'wing' | 'corner' | 'big';

// --- Player + coach identity resolved for the sim ---

/** Rating-derived movement hints for one player (all ~0.8..1.3 unless noted). */
export interface SteeringHint {
  /** Max speed multiplier from athleticism. */
  speed: number;
  /** Max acceleration multiplier from athleticism. */
  accel: number;
  /** Defender closeout/recovery speed from perimeterD/interiorD. */
  closeoutSpeed: number;
  /** Pass leg speed from playmaking (higher = snappier, fewer swings). */
  passCrispness: number;
  /** 0..1 from iq: how cleanly cuts/reads time (gates decoy timing). */
  readQuality: number;
  /** 0..1 from strength: screen contact depth + roller separation. */
  screenQuality: number;
  /** Gather->rise/leap tempo from athleticism+inside. */
  finishBurst: number;
  /** Reaction latency (ms) before acting on a new phase target (GRF-style). */
  reactMs: number;
}

/** A player resolved for the movement sim. */
export interface MotionPlayer {
  key: SpriteKey;
  side: SimTeamSide;
  position: Position;
  hint: SteeringHint;
  /** Effective ratings (training folded in), for team composites + sampler gates. */
  stats: PlayerStats;
  /** Shot/role tendency (baked for real players, derived otherwise). */
  tendency: TendencyProfile;
  /** Derived playstyle id (movement-shooter, slasher, post-scorer, ...). */
  style: PlaystyleId;
}

/**
 * A coach's identity for the movement layer. Both the player's coach (a
 * `CoachProfile extends CoachStyle`) and an opponent coach (`OpponentCoach =
 * CoachStyle`) satisfy this, so one type reads both.
 */
export type CoachIdentity = CoachStyle;

/** One team resolved for the sim: its five, coach, archetype, and star slot. */
export interface MotionTeam {
  five: Record<Position, MotionPlayer>;
  coach: CoachIdentity;
  archetype: TeamArchetype;
  /** Position of the best on-court player (the "star" for star-usage coaches). */
  starPos: Position;
}

/** Both teams resolved, framed as offense (ball) vs defense for this possession. */
export interface MotionCtx {
  offense: MotionTeam;
  defense: MotionTeam;
  offSide: SimTeamSide;
  defSide: SimTeamSide;
}

// --- The decision-layer output ---

/** One ball touch in the script (resolved to spots by the sim). */
export interface ScriptTouch {
  fromRole: OffRole;
  toRole: OffRole;
  kind: 'carry' | 'pass' | 'handoff' | 'lob';
  /** Fraction of the pre-shot window when this touch starts/ends. */
  startFrac: number;
  endFrac: number;
}

/** A fired off-ball cut. */
export interface ScriptCut {
  role: OffRole;
  type: CutType;
  /** Fraction of the pre-shot window when the cut fires. */
  fireFrac: number;
}

/** The defensive plan for the possession. */
export interface DefensePlan {
  scheme: DefScheme;
  coverage: Coverage;
  /** Ball-you-man help depth (0.25 tight to shooters .. 0.5 deep help) per off defender. */
  helpDepth: number;
  tagRoller: boolean;
}

/** The fully-resolved decision-layer output the steering core executes. */
export interface PossessionScript {
  family: PlayFamily;
  action: PlayAction;
  /** position -> its offensive role (offense side). */
  offRoles: Record<Position, OffRole>;
  /** defender position -> the offensive position it guards (mutated by a switch). */
  matchup: Record<Position, Position>;
  cuts: ScriptCut[];
  touches: ScriptTouch[];
  defense: DefensePlan;
  contest: Contest;
}

// --- The engine's input/output at the choreography seam ---

/** The resolved possession budget (the engine computes preShotMs from the play). */
export interface MotionBudget {
  preShotMs: number;
  totalMs: number;
  holdUntil: number;
}

export interface MotionInput {
  event: SimEvent;
  prevEvent?: SimEvent;
  /** The NEXT possession's event, for cross-possession continuity (this possession's
   *  reset flows into a live-ball break the other way). */
  nextEvent?: SimEvent;
  mode: WatchMode;
  contest: Contest;
  /** The authored shot spot (from shotSpotFor), the finisher's release point. */
  shotSpot: Frac;
  /** Shot flight + resolve (unscaled ms), owned by choreography. */
  flight: number;
  /** Post-shot time (rebound + reset + linger), owned by choreography. */
  postMs: number;
  ctx: MotionCtx;
  seed: number;
}

export interface MotionOutput {
  movers: Partial<Record<SpriteKey, import('../choreography').Waypoint[]>>;
  moverBursts: Partial<Record<SpriteKey, { startMs: number; endMs: number }>>;
  ball: import('../choreography').BallLeg[];
  /** The engine-owned pacing, back out to choreography for the camera + plan. */
  preShotMs: number;
  totalMs: number;
  holdUntil: number;
  family: PlayFamily;
}

/** Just the baked movement (bake/highlights produce this; index adds pacing). */
export type MotionMovement = Pick<MotionOutput, 'movers' | 'moverBursts' | 'ball'>;

/** A neutral rating hint (used when no roster is threaded, e.g. Node tests). */
export const NEUTRAL_HINT: SteeringHint = {
  speed: 1,
  accel: 1,
  closeoutSpeed: 1,
  passCrispness: 1,
  readQuality: 0.6,
  screenQuality: 0.6,
  finishBurst: 1,
  reactMs: 120,
};

/** A neutral coach identity (the no-op default). */
export const NEUTRAL_COACH: CoachIdentity = {
  name: 'Neutral',
  prefPace: 'balanced',
  prefFocus: 'balanced',
  usage: 'balanced',
  rotation: 9,
};

/** Average ratings for a player with no roster threaded (Node tests / fallbacks). */
export const NEUTRAL_STATS: PlayerStats = {
  inside: 10,
  outside: 10,
  playmaking: 10,
  athleticism: 10,
  iq: 10,
  perimeterD: 10,
  interiorD: 10,
  clutch: 10,
  stamina: 10,
  durability: 10,
  blocking: 10,
  stealing: 10,
  strength: 10,
  rebounding: 10,
};

/** A neutral shot/role tendency (no lean; balanced creator/shooter). */
export const NEUTRAL_TENDENCY: TendencyProfile = {
  post: 1,
  drive: 1,
  layup: 1,
  dunk: 1,
  midrange: 1,
  three: 1,
  onBall: 0.5,
  drawFoul: 0,
};
