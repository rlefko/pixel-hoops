import type { RNG } from '@/game/rng';
import type { Position } from '@/types/roster';
import { meanStat, norm01 } from './composite';
import type { Contest, Coverage, DefensePlan, DefScheme, MotionTeam, PlayAction } from './types';

/**
 * Coach-driven defense: derives the DEFENDING team's scheme (man vs a sparing
 * zone) and on-ball screen coverage (drop / hedge / switch / ice) from the coach's
 * identity (prefFocus/prefPace/usage), the team archetype, and personnel
 * (perimeter/interior D, athleticism). Realistic: a rim-protecting slow big drops,
 * switchable pace-and-space wings switch, aggressive lockdown hedges. Weak-side
 * help sits on the ball-you-man line. Pure, Node-safe, seeded. Never gates the
 * recorded shot (zone is positional only).
 */

/** Does this action feature an on-ball screen (so coverage is meaningful)? */
function hasScreen(action: PlayAction): boolean {
  return action === 'pnr' || action === 'pnp' || action === 'dho' || action === 'horns';
}

function sampleScheme(event: { action: string }, offense: MotionTeam, defense: MotionTeam, contest: Contest, rng: RNG): DefScheme {
  const arch = defense.archetype;
  const coach = defense.coach;
  let zoneProb = 0.06;
  if (arch === 'grit-and-grind') zoneProb += 0.05;
  if (coach.prefFocus === 'lockdown') zoneProb += 0.04;
  if (norm01(meanStat(defense, 'interiorD')) >= 0.7 && norm01(meanStat(defense, 'athleticism')) < 0.4) zoneProb += 0.03;
  if (coach.prefPace === 'fast') zoneProb -= 0.04;
  zoneProb = Math.max(0.03, Math.min(0.15, zoneProb));
  // Keep the recorded shot plausible: don't sit in a 2-3 that would never concede an open midrange.
  if (event.action === 'midrange' && contest === 'open') zoneProb *= 0.3;
  if (!rng.chance(zoneProb)) return 'man';
  // 2-3 packs the rim (default); 3-2 tops out to chase shooters.
  const shooters = norm01(meanStat(offense, 'outside'));
  return rng.chance(shooters > 0.6 ? 0.55 : 0.3) ? 'zone32' : 'zone23';
}

function sampleCoverage(action: PlayAction, defense: MotionTeam, screenerPos: Position | undefined, rng: RNG): Coverage {
  if (!hasScreen(action)) return 'none';
  const coach = defense.coach;
  const arch = defense.archetype;
  const bigDef = defense.five[screenerPos ?? 'C'];
  const bigAthl = norm01(bigDef.stats.athleticism);
  const teamPerimD = norm01(meanStat(defense, 'perimeterD'));
  const teamAthl = norm01(meanStat(defense, 'athleticism'));

  let drop = 1.0;
  if (bigDef.style === 'rim-protector' || bigAthl <= 0.35) drop += 1.5;
  if (arch === 'twin-towers' || arch === 'grit-and-grind') drop += 1.0;
  if (coach.prefPace === 'slow' && coach.prefFocus === 'lockdown') drop += 0.8;

  let sw = 1.0;
  if (teamPerimD >= 0.6 && teamAthl >= 0.6) sw += 1.8;
  if (arch === 'pace-and-space') sw += 1.5;
  if (coach.prefPace === 'fast' && coach.prefFocus === 'outside') sw += 1.2; // modern switch teams
  if (bigDef.style === 'two-way-wing' || bigDef.style === 'three-and-d' || bigDef.style === 'stretch-big') sw += 1.0;

  let hedge = 1.0;
  if (coach.prefFocus === 'lockdown' && coach.usage !== 'balanced') hedge += 1.5;
  if (norm01(meanStat(defense, 'stealing')) >= 0.6) hedge += 1.2;
  if (arch === 'run-and-gun') hedge += 1.0;

  let ice = 0.7;
  if (coach.prefFocus === 'lockdown') ice += 0.8;
  if (bigAthl <= 0.4) ice += 0.6;

  return rng.weightedPick<Coverage>([
    ['drop', drop],
    ['switch', sw],
    ['hedge', hedge],
    ['ice', ice],
  ]);
}

/** Build the possession's defensive plan. */
export function sampleDefense(
  event: { action: string },
  action: PlayAction,
  offense: MotionTeam,
  defense: MotionTeam,
  screenerPos: Position | undefined,
  contest: Contest,
  rng: RNG
): DefensePlan {
  const scheme = sampleScheme(event, offense, defense, contest, rng);
  const coverage = scheme === 'man' ? sampleCoverage(action, defense, screenerPos, rng) : 'none';
  const coach = defense.coach;
  let helpDepth = 0.33;
  if (coach.prefFocus === 'lockdown' || defense.archetype === 'grit-and-grind') helpDepth = 0.5;
  else if (defense.archetype === 'pace-and-space' || coach.prefFocus === 'outside') helpDepth = 0.25;
  // On-ball / deny pressure: lockdown coaches + grit/switchy archetypes + strong perimeter D
  // pick up tight at the arc; a poor defensive team sags. Drives #3 (arc pickup) + #5 (in front).
  let ballPressure = 0.4;
  if (coach.prefFocus === 'lockdown') ballPressure += 0.3;
  if (defense.archetype === 'grit-and-grind') ballPressure += 0.2;
  else if (defense.archetype === 'pace-and-space') ballPressure += 0.1; // switchy, up in stances
  if (coach.prefPace === 'fast') ballPressure += 0.1; // pressure-and-run
  ballPressure += 0.3 * (norm01(meanStat(defense, 'perimeterD')) - 0.4);
  ballPressure += 0.15 * (norm01(meanStat(defense, 'athleticism')) - 0.4);
  ballPressure = Math.max(0, Math.min(1, ballPressure));
  const tagRoller = (action === 'pnr' || action === 'pnp') && (coverage === 'drop' || coverage === 'hedge');
  return { scheme, coverage, helpDepth, ballPressure, tagRoller };
}
