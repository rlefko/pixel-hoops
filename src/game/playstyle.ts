import type { PlayerStats } from '@/types/player';
import type { Position, RosterPlayer } from '@/types/roster';
import type { OffActionId } from '@/types/sim';

/**
 * Player playstyle: the "how does this player score" axis, kept independent of
 * POSITION (where they line up) and OVR (how good they are). This is the NBA-2K
 * "tendency vs ability" split made real in the sim: two players with the same
 * OVR behave differently because their TendencyProfile biases which action they
 * take when they are the scorer, and their own ratings (not just the team
 * aggregate) resolve the shot.
 *
 * Every player gets a playstyle: real players carry a richer one baked from 2K
 * attributes/badges (see nba-map.ts `deriveTendency`), and everyone else derives
 * one from their fourteen ratings here. Pure and dependency-light (type-only
 * imports) so it unit-tests headless and the scout report and the sim share one
 * source of truth (mirrors how src/game/specialty.ts is shared).
 */

export type PlaystyleId =
  | 'floor-general'
  | 'combo-guard'
  | 'movement-shooter'
  | 'three-and-d'
  | 'slasher'
  | 'shot-creator'
  | 'two-way-wing'
  | 'point-forward'
  | 'stretch-big'
  | 'rim-runner'
  | 'post-scorer'
  | 'rim-protector';

/**
 * A player's shot diet plus role leanings. The six shot fields are RELATIVE
 * multipliers (neutral = 1) applied to the team's base action weights when this
 * player is the scorer, so a sharpshooter actually shoots more threes and a post
 * scorer actually backs you down. `onBall` (0 = pure off-ball catch-and-shoot, 1
 * = pure on-ball creator) and `drawFoul` (0 neutral, up to ~1 a foul magnet) are
 * the signals the condensed fourteen ratings cannot recover; they come through
 * for real players from the baked 2K data. Serializable, no closures.
 */
export interface TendencyProfile {
  post: number;
  drive: number;
  layup: number;
  dunk: number;
  midrange: number;
  three: number;
  onBall: number;
  drawFoul: number;
}

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

/** A resolved playstyle: its id, a display label, and its canonical tendency. */
export interface Playstyle {
  id: PlaystyleId;
  label: string;
  tendency: TendencyProfile;
}

/**
 * The compact, serialized tendency baked per real player from rich 2K data. Shot
 * fields are integer percents (~summing to 100) so the JSON stays float-free and
 * diffs cleanly; onBall/drawFoul are 0..100. Converted to a runtime
 * {@link TendencyProfile} by {@link tendencyFromBaked}.
 */
export interface BakedTendency {
  shot: { post: number; drive: number; layup: number; dunk: number; mid: number; three: number };
  onBall: number;
  drawFoul: number;
  playstyle: PlaystyleId;
}

/** Multiplier bounds: a tendency SHAPES the diet but never fully erases an action
 * or lets one balloon, so the team plan and IQ shot-hunting still read through. */
const SHOT_MULT_MIN = 0.4;
const SHOT_MULT_MAX = 2.2;

function clampMult(value: number): number {
  return Math.max(SHOT_MULT_MIN, Math.min(SHOT_MULT_MAX, value));
}

/** Normalize a 6-20 rating to ~0..1 for scoring (same q() the sim uses). */
function n(rating: number): number {
  return Math.max(0, Math.min(1, (rating - 6) / 14));
}

/** Canonical shot diet + role leanings per playstyle (neutral = 1 per lane). */
const PLAYSTYLE_TABLE: Record<
  PlaystyleId,
  { label: string; positions: readonly Position[]; tendency: TendencyProfile; score: (s: PlayerStats) => number }
> = {
  'floor-general': {
    label: 'Floor General',
    positions: ['PG', 'SG'],
    tendency: { post: 0.3, drive: 1.1, layup: 0.9, dunk: 0.4, midrange: 1.0, three: 1.3, onBall: 0.85, drawFoul: 0.1 },
    score: (s) => 0.6 * n(s.playmaking) + 0.25 * n(s.iq) + 0.15 * n(s.outside),
  },
  'combo-guard': {
    label: 'Combo Guard',
    positions: ['PG', 'SG'],
    tendency: { post: 0.3, drive: 1.2, layup: 1.0, dunk: 0.5, midrange: 1.1, three: 1.3, onBall: 0.65, drawFoul: 0.3 },
    score: (s) => 0.4 * n(s.outside) + 0.35 * n(s.playmaking) + 0.25 * n(s.athleticism),
  },
  'movement-shooter': {
    label: 'Movement Shooter',
    positions: ['PG', 'SG', 'SF'],
    tendency: { post: 0.2, drive: 0.5, layup: 0.7, dunk: 0.4, midrange: 1.0, three: 2.0, onBall: 0.2, drawFoul: 0 },
    score: (s) => 0.7 * n(s.outside) + 0.2 * n(s.iq) - 0.3 * n(s.playmaking),
  },
  'three-and-d': {
    label: '3 & D Wing',
    positions: ['SG', 'SF', 'PF'],
    tendency: { post: 0.2, drive: 0.7, layup: 0.8, dunk: 0.5, midrange: 0.9, three: 1.8, onBall: 0.3, drawFoul: 0 },
    score: (s) => 0.45 * n(s.outside) + 0.45 * n(s.perimeterD) + 0.1 * n(s.iq),
  },
  slasher: {
    label: 'Slasher',
    positions: ['PG', 'SG', 'SF'],
    tendency: { post: 0.3, drive: 1.8, layup: 1.5, dunk: 1.4, midrange: 0.7, three: 0.4, onBall: 0.55, drawFoul: 0.6 },
    score: (s) => 0.45 * n(s.athleticism) + 0.35 * n(s.inside) - 0.4 * n(s.outside),
  },
  'shot-creator': {
    label: 'Shot Creator',
    positions: ['PG', 'SG', 'SF'],
    tendency: { post: 0.4, drive: 1.2, layup: 0.8, dunk: 0.4, midrange: 1.7, three: 1.3, onBall: 0.9, drawFoul: 0.3 },
    score: (s) => 0.35 * n(s.outside) + 0.25 * n(s.inside) + 0.2 * n(s.clutch) + 0.2 * n(s.playmaking),
  },
  'two-way-wing': {
    label: 'Two-Way Wing',
    positions: ['SG', 'SF', 'PF'],
    tendency: { post: 0.4, drive: 1.1, layup: 1.0, dunk: 0.7, midrange: 1.1, three: 1.3, onBall: 0.55, drawFoul: 0.2 },
    score: (s) => 0.3 * n(s.outside) + 0.25 * n(s.perimeterD) + 0.25 * n(s.athleticism) + 0.2 * n(s.inside),
  },
  'point-forward': {
    label: 'Point Forward',
    positions: ['SF', 'PF'],
    tendency: { post: 0.8, drive: 1.3, layup: 1.1, dunk: 0.8, midrange: 1.0, three: 1.1, onBall: 0.8, drawFoul: 0.3 },
    score: (s) => 0.5 * n(s.playmaking) + 0.25 * n(s.inside) + 0.25 * n(s.iq),
  },
  'stretch-big': {
    label: 'Stretch Big',
    positions: ['PF', 'C'],
    tendency: { post: 0.8, drive: 0.5, layup: 0.8, dunk: 0.6, midrange: 1.1, three: 1.9, onBall: 0.35, drawFoul: 0 },
    score: (s) => 0.7 * n(s.outside) + 0.15 * n(s.inside) + 0.15 * n(s.interiorD),
  },
  'rim-runner': {
    label: 'Rim Runner',
    positions: ['PF', 'C'],
    tendency: { post: 0.7, drive: 0.6, layup: 1.6, dunk: 2.0, midrange: 0.4, three: 0.2, onBall: 0.15, drawFoul: 0.4 },
    score: (s) => 0.4 * n(s.athleticism) + 0.35 * n(s.inside) + 0.25 * n(s.rebounding) - 0.4 * n(s.outside),
  },
  'post-scorer': {
    label: 'Post Scorer',
    positions: ['PF', 'C'],
    tendency: { post: 2.0, drive: 0.5, layup: 1.3, dunk: 0.9, midrange: 0.9, three: 0.3, onBall: 0.6, drawFoul: 0.6 },
    score: (s) => 0.5 * n(s.inside) + 0.35 * n(s.strength) - 0.3 * n(s.outside),
  },
  'rim-protector': {
    label: 'Rim Protector',
    positions: ['PF', 'C'],
    tendency: { post: 0.8, drive: 0.4, layup: 1.3, dunk: 1.3, midrange: 0.4, three: 0.2, onBall: 0.2, drawFoul: 0.2 },
    score: (s) => 0.45 * n(s.blocking) + 0.35 * n(s.interiorD) + 0.2 * n(s.rebounding),
  },
};

/** Order ties resolve in (first wins), kept stable for deterministic scouting. */
const PLAYSTYLE_ORDER: readonly PlaystyleId[] = [
  'floor-general',
  'combo-guard',
  'movement-shooter',
  'three-and-d',
  'slasher',
  'shot-creator',
  'two-way-wing',
  'point-forward',
  'stretch-big',
  'rim-runner',
  'post-scorer',
  'rim-protector',
];

/**
 * Infer a playstyle from the fourteen ratings + position: score every
 * position-eligible playstyle's defining vector, highest wins (the same scan
 * pattern as specialty.ts:getSpecialty). Pure and deterministic. The condensed
 * ratings cannot tell a movement shooter from a 3&D wing or a slasher from a lob
 * threat, so the result is a best guess for procedural players; real players
 * carry a richer baked tendency that overrides this (see tendencyFor).
 */
export function derivePlaystyle(stats: PlayerStats, position: Position): Playstyle {
  let bestId: PlaystyleId = 'two-way-wing';
  let bestScore = -Infinity;
  for (const id of PLAYSTYLE_ORDER) {
    const def = PLAYSTYLE_TABLE[id];
    if (!def.positions.includes(position)) continue;
    const score = def.score(stats);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  const def = PLAYSTYLE_TABLE[bestId];
  return { id: bestId, label: def.label, tendency: def.tendency };
}

/** The display label for a playstyle id. */
export function playstyleLabel(id: PlaystyleId): string {
  return PLAYSTYLE_TABLE[id].label;
}

/**
 * The runtime shot diet a player actually plays with: their baked/runtime profile
 * if one is attached (real players, mapped from 2K data), else the profile derived
 * from their ratings. The one call site the sim and scout share, so they never
 * diverge. Pure.
 */
export function tendencyFor(rp: RosterPlayer): TendencyProfile {
  return rp.tendency ?? derivePlaystyle(rp.player.stats, rp.position).tendency;
}

/** Convert a baked (integer-percent) tendency into a runtime profile: shot lanes
 * become multipliers normalized around their mean (so a flat diet is ~neutral),
 * onBall/drawFoul scale to 0..1. */
export function tendencyFromBaked(b: BakedTendency): TendencyProfile {
  const lanes = [b.shot.post, b.shot.drive, b.shot.layup, b.shot.dunk, b.shot.mid, b.shot.three];
  const mean = lanes.reduce((a, c) => a + c, 0) / lanes.length || 1;
  const m = (v: number): number => clampMult(mean > 0 ? v / mean : 1);
  return {
    post: m(b.shot.post),
    drive: m(b.shot.drive),
    layup: m(b.shot.layup),
    dunk: m(b.shot.dunk),
    midrange: m(b.shot.mid),
    three: m(b.shot.three),
    onBall: Math.max(0, Math.min(1, b.onBall / 100)),
    drawFoul: Math.max(0, Math.min(1, b.drawFoul / 100)),
  };
}

/** Multiply a player's tendency into the team's base action weights (the L1 lever
 * that makes a scorer's personality bias the action). Pure; bounded so a tendency
 * shapes, never dictates. Actions absent from the profile pass through unchanged. */
export function blendTendency(
  base: readonly (readonly [OffActionId, number])[],
  t: TendencyProfile
): [OffActionId, number][] {
  return base.map(([action, weight]) => {
    const mult = action === 'midrange' ? t.midrange : (t[action] as number | undefined);
    return [action, weight * clampMult(mult ?? 1)] as [OffActionId, number];
  });
}

/** Whether a profile leaves the action weights untouched (the byte-identical fast
 * path: an all-neutral offense resolves exactly like the legacy sim). */
export function isNeutralShotDiet(t: TendencyProfile): boolean {
  return (
    t.post === 1 && t.drive === 1 && t.layup === 1 && t.dunk === 1 && t.midrange === 1 && t.three === 1
  );
}
