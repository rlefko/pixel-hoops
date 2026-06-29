import type { PlayerStats } from '@/types/player';
import type { Position, RosterPlayer } from '@/types/roster';
import type { Team } from '@/types/team';
import type { Focus, Pace } from '@/types/tactics';
import type { StatDelta } from './effects';
import { ovr } from './ratings';

/**
 * Team archetype: the single canonical identity that drives strategic matchups.
 * It is derived from the same stat means and auto pace/focus that
 * team-identity.ts already reads for the scout tags, so the scout card and the
 * sim never disagree (the Slay-the-Spire "intent": a counter loss is legible
 * before tip-off). A bounded rock-paper-scissors COUNTER matrix then grants the
 * favored team a small effective-rating edge, sized so a clear strategic counter
 * swings win probability ~10-20% (it flips a close-OVR game) but a real OVR gap
 * still usually wins and the per-game form (±3.2) stays the larger swing. Pure
 * and serializable; `balanced` is the neutral no-op node (no edge either way, so
 * a mirror matchup stays a true coin flip).
 */

export type TeamArchetype =
  | 'pace-and-space'
  | 'three-point-barrage'
  | 'run-and-gun'
  | 'twin-towers'
  | 'bully-ball'
  | 'grit-and-grind'
  | 'iso-heavy'
  | 'balanced';

// Thresholds shared with team-identity.ts (the 6-20 band; ~13 average).
const STRONG = 15;
const ELITE = 16;
const ISO_GAP = 3;

const GUARDS: readonly Position[] = ['PG', 'SG'];
const BIGS: readonly Position[] = ['PF', 'C'];

const ARCHETYPE_LABEL: Record<TeamArchetype, string> = {
  'pace-and-space': 'Pace & Space',
  'three-point-barrage': 'Three-Point Barrage',
  'run-and-gun': 'Run & Gun',
  'twin-towers': 'Twin Towers',
  'bully-ball': 'Bully Ball',
  'grit-and-grind': 'Grit & Grind',
  'iso-heavy': 'Iso Heavy',
  balanced: 'Balanced',
};

export function archetypeLabel(a: TeamArchetype): string {
  return ARCHETYPE_LABEL[a];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * Classify a five into its single dominant {@link TeamArchetype}. Reads the
 * starters' raw stat means + position shape + the team's auto pace/focus. The
 * priority order resolves overlaps deterministically (a two-big wall reads as
 * Twin Towers before Bully Ball; a fast shooting five reads Pace & Space before
 * Run & Gun). Falls back to `balanced` when nothing dominates.
 */
export function deriveArchetype(team: Team): TeamArchetype {
  return deriveArchetypeFromFive(team.lineup.players, team.tactic);
}

/**
 * The archetype classification, decoupled from a built {@link Team} so callers that
 * only have the five and the pace/focus (e.g. the coach system-bonus check, before
 * buildTeam) classify identically to the sim. {@link deriveArchetype} delegates here.
 */
export function deriveArchetypeFromFive(
  five: RosterPlayer[],
  tactic: { pace: Pace; focus: Focus }
): TeamArchetype {
  const { pace, focus } = tactic;
  const m = (key: keyof PlayerStats): number => mean(five.map((rp) => rp.player.stats[key]));

  const counts = new Map<Position, number>();
  for (const rp of five) counts.set(rp.position, (counts.get(rp.position) ?? 0) + 1);
  const guardCount = GUARDS.reduce((s, p) => s + (counts.get(p) ?? 0), 0);
  const bigCount = BIGS.reduce((s, p) => s + (counts.get(p) ?? 0), 0);

  const sorted = [...five].sort(
    (a, b) => ovr(b.player.stats, b.position) - ovr(a.player.stats, a.position)
  );
  const topOvr = sorted.length ? ovr(sorted[0].player.stats, sorted[0].position) : 0;
  const secondOvr = sorted[1] ? ovr(sorted[1].player.stats, sorted[1].position) : topOvr;

  const interiorD = m('interiorD');
  const perimeterD = m('perimeterD');
  const outside = m('outside');
  const strength = m('strength');
  const athleticism = m('athleticism');
  const stealing = m('stealing');

  // Priority order: the most identity-defining shape wins.
  if (bigCount >= 2 && (interiorD >= STRONG || m('rebounding') >= STRONG)) return 'twin-towers';
  if (pace === 'slow' && (perimeterD + interiorD) / 2 >= STRONG) return 'grit-and-grind';
  if (stealing >= ELITE && (perimeterD + interiorD) / 2 >= STRONG - 1) return 'grit-and-grind';
  if (pace === 'fast' && outside >= STRONG && guardCount >= 2) return 'pace-and-space';
  if (focus === 'outside' && outside >= ELITE) return 'three-point-barrage';
  if (pace === 'fast' && (athleticism >= STRONG || stealing >= STRONG)) return 'run-and-gun';
  if (focus === 'inside' && strength >= STRONG) return 'bully-ball';
  if (topOvr - secondOvr >= ISO_GAP) return 'iso-heavy';
  return 'balanced';
}

/**
 * Counter edges in q-space (the sim's normalized rating units; 1.0 = the full
 * 6-20 band, so 0.05 ≈ 0.7 rating points). Capped at ±0.06 and roughly
 * antisymmetric on the rock-paper-scissors pairs. `balanced` carries no edge in
 * either direction (the safe anchor), and the diagonal is implicitly 0 (a mirror
 * matchup is even). Read COUNTER_EDGE[attacker][defender].
 */
const COUNTER_EDGE: Record<TeamArchetype, Partial<Record<TeamArchetype, number>>> = {
  // Spacing drags the rim protector out and runs the grinders off the floor.
  'pace-and-space': { 'twin-towers': 0.05, 'grit-and-grind': 0.05, 'bully-ball': -0.03, 'run-and-gun': -0.02, 'iso-heavy': 0.02 },
  // Elite half-court shooting shreds size but is smothered by elite defense.
  'three-point-barrage': { 'twin-towers': 0.06, 'bully-ball': -0.03, 'grit-and-grind': -0.05, 'iso-heavy': 0.02 },
  // Pace beats size and grinders; runs iso off the floor.
  'run-and-gun': { 'twin-towers': 0.04, 'grit-and-grind': 0.04, 'bully-ball': 0.03, 'pace-and-space': 0.02, 'iso-heavy': 0.03 },
  // Size walls bully-ball and iso but gets pulled apart by spacing and pace.
  'twin-towers': { 'pace-and-space': -0.05, 'three-point-barrage': -0.06, 'run-and-gun': -0.04, 'bully-ball': 0.04, 'iso-heavy': 0.03 },
  // Muscle punishes small-ball and shooters inside; out-sized by twin towers, out-run by pace.
  'bully-ball': { 'pace-and-space': 0.03, 'three-point-barrage': 0.03, 'twin-towers': -0.04, 'run-and-gun': -0.03, 'grit-and-grind': -0.02, 'iso-heavy': 0.03 },
  // Defense smothers shooting variance and iso; overwhelmed by pace.
  'grit-and-grind': { 'three-point-barrage': 0.05, 'iso-heavy': 0.05, 'bully-ball': 0.02, 'pace-and-space': -0.05, 'run-and-gun': -0.04 },
  // Leaning on one star is predictable and -EV against disciplined defense.
  'iso-heavy': { 'grit-and-grind': -0.05, 'twin-towers': -0.03, 'bully-ball': -0.03, 'run-and-gun': -0.03, 'pace-and-space': -0.02, 'three-point-barrage': -0.02 },
  // Balanced: no exploitable hole, no special edge.
  balanced: {},
};

/** The bounded effective-rating edge (q-space) the attacker archetype gets vs the
 * defender archetype. 0 for the diagonal, anything vs `balanced`, or any unlisted
 * pair. */
export function counterEdge(attacker: TeamArchetype, defender: TeamArchetype): number {
  if (attacker === defender) return 0;
  return COUNTER_EDGE[attacker]?.[defender] ?? 0;
}

export type CounterTier = 'even' | 'slight' | 'strong';

/**
 * The telegraphed scouting read of a matchup from `self`'s point of view: the
 * edge, a three-bucket strength, and whether it favors you. Surfaced pre-game so a
 * counter loss is legible as a strategy miss before tip-off (the Slay-the-Spire
 * "intent"), never a surprise.
 */
export function counterVerdict(
  self: TeamArchetype,
  opp: TeamArchetype
): { edge: number; tier: CounterTier; favorable: boolean } {
  const edge = counterEdge(self, opp);
  const mag = Math.abs(edge);
  const tier: CounterTier = mag < 0.02 ? 'even' : mag < 0.045 ? 'slight' : 'strong';
  return { edge, tier, favorable: edge > 0 };
}

/** Rating points one q-unit of edge is worth (the 6-20 band width). */
export const Q_TO_RATING = 14;
/** How strongly the counter edge expresses: a knob tuned against the balance
 * harness so a clear counter lands in the ~10-20% win-prob band. */
const COUNTER_STRENGTH = 1.0;

/**
 * The frozen offensive {@link StatDelta} the counter grants (or costs) a team for
 * its archetype matchup, applied once at tip-off to the team's effective line
 * (reuses the TeamModifier.extra channel; no new RNG). Spreads the edge across
 * the scoring stats so every action lane feels it. A negative edge (you are
 * countered) is a drag, keeping the matrix roughly antisymmetric.
 */
export function counterDelta(attacker: TeamArchetype, defender: TeamArchetype): StatDelta {
  const edge = counterEdge(attacker, defender) * Q_TO_RATING * COUNTER_STRENGTH;
  if (edge === 0) return {};
  return { outside: edge, inside: edge, playmaking: edge * 0.5 };
}
