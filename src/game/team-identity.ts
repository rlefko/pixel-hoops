import type { PlayerStats } from '@/types/player';
import type { Position } from '@/types/roster';
import type { Pace, Focus } from '@/types/tactics';
import type { Team } from '@/types/team';
import { ovr } from './ratings';
import { archetypeLabel, deriveArchetype, type TeamArchetype } from './team-archetype';

/**
 * Team identity: the scouting read. Turns a dressed five plus its auto-derived
 * game plan into a few character tags, a one-line blurb, headline strengths and
 * weaknesses, and concrete numeric tendencies. This is the Slay-the-Spire
 * "intent" surface: enough hard numbers to plan a counter (so a loss reads as a
 * strategic miss, not bad luck) while the watched sim keeps the outcome live.
 * Pure and dependency-light (type-only imports plus ratings.ts) so it unit-tests
 * headless and never disagrees with what the sim will field.
 */

// --- Tunables (thresholds on the 6-20 normal band; ~13 is average) ---

/** A team mean at or above this on a stat reads as a real strength. */
const STRONG = 15;
/** A team mean at or below this reads as a real weakness. */
const WEAK = 11.5;
/** An elite, identity-defining level on a single stat. */
const ELITE = 16;
/** OVR gap between the top scorer and the next that reads as iso-heavy. */
const ISO_GAP = 3;
/** How far a stat must clear the team's own overall level to count as a STANDOUT
 * trait. Keeps an across-the-board-strong team from collecting every tag: a tag
 * fires on what a team is sharpest at, not on raw inflation. */
const REL = 1.5;
/** A clear lean of one offensive stat family over its opposite (inside vs outside),
 * mirroring TILT in team-archetype.ts. */
const TILT = 1.5;
/** Max tags shown (strongest first). */
const MAX_TAGS = 3;

export type ThreeLean = 'heavy' | 'balanced' | 'inside';

export interface TeamTendencies {
  pace: Pace;
  focus: Focus;
  /** The team's canonical strategic identity, the single node that drives the
   * matchup counter (see src/game/team-archetype.ts). The sim and this scout read
   * share one derivation, so what the player is shown is what the sim fields. */
  archetype: TeamArchetype;
  /** Whether the offense leans on threes, the paint, or splits it. */
  threeLean: ThreeLean;
  /** Projected per-game steals/blocks/rebounds (heuristic, for the scout glance). */
  projSteals: number;
  projBlocks: number;
  projRebounds: number;
  /** The five's headliner (highest position-weighted OVR). */
  topScorer: { name: string; ovr: number; position: Position };
}

export interface TeamIdentity {
  /** One to three character tags, strongest first (always at least one). */
  tags: string[];
  /** A one-line scouting blurb keyed off the primary tag. */
  blurb: string;
  /** Up to two headline strengths (short phrases). */
  strengths: string[];
  /** Up to two headline weaknesses (short phrases). */
  weaknesses: string[];
  tendencies: TeamTendencies;
}

/** Short phrase for a stat, used in the strengths/weaknesses lines. */
const STAT_PHRASE: Partial<Record<keyof PlayerStats, string>> = {
  inside: 'interior scoring',
  outside: 'perimeter shooting',
  playmaking: 'playmaking',
  perimeterD: 'perimeter defense',
  interiorD: 'rim protection',
  athleticism: 'athleticism',
  blocking: 'shot-blocking',
  stealing: 'ball pressure',
  strength: 'physicality',
  rebounding: 'rebounding',
};

/** Stats ranked for the strengths/weaknesses read (skips IQ/clutch/condition). */
const DISPLAY_KEYS: readonly (keyof PlayerStats)[] = [
  'inside',
  'outside',
  'playmaking',
  'perimeterD',
  'interiorD',
  'blocking',
  'stealing',
  'strength',
  'rebounding',
  'athleticism',
];

/** One-line blurb per primary tag. */
const TAG_BLURB: Record<string, string> = {
  'Paint Fortress': 'Walls up the rim. They make you earn everything inside.',
  'Lockdown Wall': 'Smothers both ends of the floor. Few easy looks here.',
  'Glass Cleaners': 'Owns the boards and feasts on second chances.',
  'Ball Hawks': 'Gambles into passing lanes and turns you over.',
  'Press & Run': 'Forces turnovers and sprints them the other way.',
  'Bully Ball': 'Punishes you in the post with size and strength.',
  'Perimeter Snipers': 'Lets it fly from deep. Run them off the line.',
  'Run & Gun': 'Pushes the pace and shoots early. A track meet.',
  'Grind It Out': 'Slows it to a crawl and grinds in the half court.',
  'Floor Generals': 'Shares it and picks you apart with crisp passing.',
  'Iso Heavy': 'Leans on one star to create. Load up on him.',
  'Balanced Squad': 'No glaring edge or hole. A steady, even five.',
};

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function clampRound(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

/** Map a 6-20 team mean onto a per-game projection band [base..base+scale]. */
function project(teamMean: number, scale: number, base: number, lo: number, hi: number): number {
  return clampRound(((teamMean - 6) / 14) * scale + base, lo, hi);
}

/**
 * Derive a {@link TeamIdentity} from the five that dress and the team's auto game
 * plan. Reads the raw starter stats (the whole unit, not just the anchor) so the
 * read matches the lineup the player actually sees.
 */
export function deriveTeamIdentity(team: Team): TeamIdentity {
  const five = team.lineup.players;
  const { pace, focus } = team.tactic;
  const m = {} as Record<keyof PlayerStats, number>;
  for (const key of DISPLAY_KEYS) m[key] = mean(five.map((rp) => rp.player.stats[key]));
  // The team's overall level: tags fire on a trait that STANDS OUT from this (clears
  // it by REL), not on a raw threshold, so an across-the-board-strong team surfaces
  // its sharpest traits (or reads Balanced) instead of every high-level team
  // collecting the same handful of tags.
  const archetype = deriveArchetype(team);
  const avg = mean(DISPLAY_KEYS.map((k) => m[k]));
  const standout = (key: keyof PlayerStats, floor = STRONG): boolean =>
    m[key] >= floor && m[key] - avg >= REL;

  // --- Tags (priority order; capped at MAX_TAGS, always at least one) ---
  const tags: string[] = [];
  const push = (t: string): void => {
    // Skip the archetype's own label so the supporting tags COMPLEMENT the bold
    // headline instead of echoing it.
    if (t === archetypeLabel(archetype)) return;
    if (tags.length < MAX_TAGS && !tags.includes(t)) tags.push(t);
  };
  const sorted = [...five].sort(
    (a, b) => ovr(b.player.stats, b.position) - ovr(a.player.stats, a.position)
  );
  const top = sorted[0];
  const topOvr = ovr(top.player.stats, top.position);
  const secondOvr = sorted[1] ? ovr(sorted[1].player.stats, sorted[1].position) : topOvr;

  if (standout('interiorD') && m.blocking >= STRONG - 1) push('Paint Fortress');
  if (m.perimeterD >= STRONG && m.interiorD >= STRONG && (m.perimeterD + m.interiorD) / 2 - avg >= REL)
    push('Lockdown Wall');
  if (standout('stealing', ELITE)) push('Ball Hawks');
  if (pace === 'fast' && m.stealing >= 13 && m.stealing - avg >= REL) push('Press & Run');
  if (standout('rebounding')) push('Glass Cleaners');
  if (focus === 'inside' && m.strength >= STRONG && m.inside - m.outside >= TILT) push('Bully Ball');
  if (focus === 'outside' && m.outside >= STRONG && m.outside - m.inside >= TILT)
    push('Perimeter Snipers');
  if (pace === 'fast' && m.outside >= 14 && m.outside - m.inside >= TILT) push('Run & Gun');
  if (pace === 'slow' && standout('interiorD', 14)) push('Grind It Out');
  if (standout('playmaking')) push('Floor Generals');
  if (topOvr - secondOvr >= ISO_GAP) push('Iso Heavy');
  if (tags.length === 0) push('Balanced Squad');

  // --- Strengths / weaknesses (ranked team means) ---
  const ranked = DISPLAY_KEYS.map((key) => ({ key, value: m[key] })).sort(
    (a, b) => b.value - a.value
  );
  const strengths = ranked
    .filter((r) => r.value >= STRONG)
    .slice(0, 2)
    .map((r) => STAT_PHRASE[r.key]!);
  const weaknesses = ranked
    .filter((r) => r.value <= WEAK)
    .slice(-2)
    .reverse()
    .map((r) => STAT_PHRASE[r.key]!);

  // --- Tendencies ---
  const threeLean: ThreeLean =
    focus === 'outside' || m.outside - m.inside >= 2
      ? 'heavy'
      : focus === 'inside' || m.inside - m.outside >= 2
        ? 'inside'
        : 'balanced';

  return {
    tags,
    blurb: TAG_BLURB[tags[0]] ?? TAG_BLURB['Balanced Squad'],
    strengths,
    weaknesses,
    tendencies: {
      pace,
      focus,
      archetype,
      threeLean,
      projSteals: project(m.stealing, 5, 2, 2, 9),
      projBlocks: project(m.blocking, 5, 1, 1, 7),
      projRebounds: project(m.rebounding, 14, 16, 16, 32),
      topScorer: { name: top.player.name, ovr: topOvr, position: top.position },
    },
  };
}
