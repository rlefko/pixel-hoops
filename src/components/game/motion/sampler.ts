import { isMadeShot, type SimEvent } from '@/types/sim';
import type { RNG } from '@/game/rng';
import { POSITIONS, type Position } from '@/types/roster';
import { meanStat, norm01, resolvedPace } from './composite';
import type {
  CutType,
  HalfCourtAction,
  MotionTeam,
  OffRole,
  PlayFamily,
  PlayAction,
  ScriptCut,
} from './types';

/**
 * The play-type sampler (action selection): deterministically draws the play
 * FAMILY, the half-court ACTION, and any off-ball CUTS from the recorded outcome +
 * the on-court playstyles/ratings + both coaches. Draws pull from one seeded RNG in
 * a fixed order (family -> action -> cuts) so the whole thing is golden-testable.
 * The candidate set is gated by the recorded action so variety never contradicts
 * the outcome. Pure and Node-safe.
 */

const PACE_BOOST: Record<string, number> = { fast: 1.9, balanced: 1.0, slow: 0.55 };

/** A live turnover the other way runs a break; a made basket must be inbounded. */
export function sampleFamily(event: SimEvent, prev: SimEvent | undefined, offense: MotionTeam, rng: RNG): PlayFamily {
  const a = event.action;
  // Putback: a low-rate unassisted rim finish reads as a second-chance bucket.
  if ((a === 'layup' || a === 'dunk') && !event.assist && event.successRate < 45 && rng.chance(0.3)) {
    return 'putback';
  }
  if (a === 'post') return 'halfCourt'; // a post-up is never a break

  const flipped = !!prev && prev.team !== event.team;
  const liveTurnoverBack = flipped && (prev!.result === 'steal' || prev!.result === 'turnover');
  const missBack = flipped && (prev!.result === 'miss' || prev!.result === 'block');
  const madeBack = flipped && isMadeShot(prev!);

  const athl = norm01(meanStat(offense, 'athleticism'));
  const base = 0.1 * PACE_BOOST[resolvedPace(offense)] * (0.6 + 0.8 * athl);
  let breakProb: number;
  if (madeBack) breakProb = 0;
  else if (liveTurnoverBack) breakProb = Math.min(0.95, 0.75 + 0.2 * athl);
  else if (missBack) breakProb = Math.min(0.6, base + 0.22);
  else breakProb = base * 0.4;
  // A pull-up transition three is rarer than a runout dunk.
  if ((a === 'midrange' || a === 'three') && !event.assist) breakProb *= 0.5;

  if (rng.chance(breakProb)) {
    return a === 'dunk' || a === 'layup' || a === 'drive' ? 'transition' : 'earlyOffense';
  }
  return 'halfCourt';
}

/** Half-court actions the recorded (action, assisted) allows, so variety stays honest. */
function eligibleActions(event: SimEvent): HalfCourtAction[] {
  const a = event.action;
  const assisted = !!event.assist && isMadeShot(event);
  if (a === 'post') return ['postUp'];
  if (a === 'dunk') return assisted ? ['pnr', 'pnp', 'horns', 'motion'] : ['pnr', 'iso'];
  if (a === 'layup' || a === 'drive') return assisted ? ['pnr', 'dho', 'spotUp', 'horns', 'motion'] : ['iso', 'pnr', 'dho'];
  if (a === 'midrange') return assisted ? ['pnp', 'dho', 'pindown', 'flare', 'horns'] : ['iso', 'pnr', 'postUp'];
  // three
  return assisted ? ['spotUp', 'pindown', 'floppy', 'flare', 'dho', 'motion'] : ['pnr', 'iso'];
}

/** Weight each eligible half-court action by the offense's playstyles + coach identity. */
export function sampleAction(event: SimEvent, offense: MotionTeam, rng: RNG): PlayAction {
  const eligible = eligibleActions(event);
  if (eligible.length === 1) return eligible[0];

  const scorer = offense.five[event.scorerPosition];
  const t = scorer.tendency;
  const style = scorer.style;
  const coach = offense.coach;
  const arch = offense.archetype;
  const scorerIsStar = event.scorerPosition === offense.starPos;

  const bump = (action: HalfCourtAction): number => {
    let w = 1;
    // Scorer tendency / playstyle.
    if (t.onBall >= 0.7) {
      if (action === 'iso') w *= 2.0;
      if (action === 'pnr' || action === 'pnp') w *= 1.6;
      if (action === 'pindown' || action === 'floppy' || action === 'flare' || action === 'dho') w *= 0.5;
    }
    if (t.onBall <= 0.3) {
      if (action === 'pindown') w *= 2.2;
      if (action === 'floppy') w *= 2.0;
      if (action === 'flare' || action === 'spotUp') w *= 1.7;
      if (action === 'iso') w *= 0.2;
    }
    if (style === 'movement-shooter') {
      if (action === 'pindown' || action === 'floppy') w *= 2.5;
      if (action === 'dho') w *= 1.8;
    }
    if (style === 'post-scorer' || style === 'rim-runner' || style === 'rim-protector') {
      if (action === 'postUp') w *= 2.0;
      if (action === 'pnr') w *= 1.5;
      if (action === 'iso' || action === 'spotUp') w *= 0.4;
    }
    if (norm01(scorer.stats.playmaking) > 0.85 && t.onBall > 0.5 && action === 'pnr') w *= 1.4;
    // Coach identity.
    if (coach.usage === 'star' && scorerIsStar && (action === 'iso' || action === 'pnr')) w *= 1.8;
    if (coach.usage === 'egalitarian') {
      if (action === 'motion' || action === 'dho') w *= 1.7;
      if (action === 'pindown' || action === 'floppy' || action === 'flare') w *= 1.4;
      if (action === 'iso') w *= 0.4;
    }
    if (coach.prefFocus === 'outside' || arch === 'pace-and-space' || arch === 'three-point-barrage') {
      if (action === 'spotUp' || action === 'floppy' || action === 'dho' || action === 'pnp') w *= 1.4;
    }
    if (coach.prefFocus === 'inside' || arch === 'bully-ball' || arch === 'twin-towers') {
      if (action === 'postUp') w *= 1.8;
      if (action === 'pnr') w *= 1.3;
    }
    if (arch === 'iso-heavy' && action === 'iso') w *= 2.0;
    return w;
  };

  const entries: [HalfCourtAction, number][] = eligible.map((a) => [a, bump(a)]);
  return rng.weightedPick(entries);
}

/** Fire 0-2 off-ball decoy cuts among the spacers. Cuts never touch the ball. */
export function sampleCuts(
  action: PlayAction,
  offense: MotionTeam,
  offRoles: Record<Position, OffRole>,
  finisher: Position,
  initiator: Position | undefined,
  rng: RNG
): ScriptCut[] {
  const fired: { role: OffRole; type: CutType; fireFrac: number; prio: number }[] = [];
  const drawsHelp = action === 'postUp' || action === 'iso' || action === 'spotUp' || action === 'pnr';
  for (const pos of POSITIONS) {
    if (pos === finisher || pos === initiator) continue;
    const role = offRoles[pos];
    if (role === 'screener') continue; // the screener is busy screening
    const p = offense.five[pos];
    let prob = 0.12 + (drawsHelp ? 0.15 : 0) + 0.1 * (p.hint.readQuality - 0.5);
    prob = Math.max(0, Math.min(0.6, prob));
    if (!rng.chance(prob)) continue;
    let type: CutType;
    if (p.tendency.onBall <= 0.3 && norm01(p.stats.outside) >= 0.7) type = 'relocate';
    else if (norm01(p.stats.athleticism) >= 0.75 && norm01(p.stats.inside) >= 0.55) type = rng.chance(0.5) ? 'backdoor' : 'basketCut';
    else type = rng.chance(0.5) ? 'flare' : 'curl';
    fired.push({ role, type, fireFrac: 0.35 + rng.next() * 0.25, prio: p.hint.readQuality });
  }
  // Keep the floor legible: at most two cutters (highest read-quality win).
  fired.sort((a, b) => b.prio - a.prio);
  return fired.slice(0, 2).map(({ role, type, fireFrac }) => ({ role, type, fireFrac }));
}
