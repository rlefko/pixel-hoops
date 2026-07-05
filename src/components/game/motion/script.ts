import { createRNG } from '@/game/rng';
import { POSITIONS, type Position } from '@/types/roster';
import { assignOffRoles, defaultMatchup } from './roles';
import { sampleAction, sampleCuts, sampleFamily } from './sampler';
import { sampleDefense } from './defense';
import type {
  MotionInput,
  OffRole,
  PlayAction,
  PossessionScript,
  ScriptTouch,
} from './types';

/**
 * The decision-layer orchestrator: draws family -> action -> roles -> defense ->
 * cuts -> ball touches from one seeded RNG (fixed order) into a `PossessionScript`
 * the steering core executes. Pure, deterministic, Node-safe. The recorded scorer
 * is always the finisher and the assister always delivers the final pass, so no
 * draw can contradict the outcome.
 */

/** Find the position playing a given offensive role (roles are 1:1 with positions). */
function posOfRole(offRoles: Record<Position, OffRole>, role: OffRole): Position | undefined {
  return POSITIONS.find((p) => offRoles[p] === role);
}

/** The ball script: which role holds/passes when. The last touch ends at the finisher. */
function buildTouches(
  action: PlayAction,
  offRoles: Record<Position, OffRole>,
  hasInitiator: boolean,
  sa: string
): ScriptTouch[] {
  if (!hasInitiator) {
    // Unassisted: the finisher creates and finishes off the dribble.
    return [{ fromRole: 'finisher', toRole: 'finisher', kind: 'carry', startFrac: 0, endFrac: 1 }];
  }
  const finalKind: ScriptTouch['kind'] = action === 'dho' ? 'handoff' : sa === 'dunk' ? 'lob' : 'pass';
  const swingRole: OffRole | undefined = posOfRole(offRoles, 'wing') ? 'wing' : posOfRole(offRoles, 'corner') ? 'corner' : undefined;
  const offBall = action === 'spotUp' || action === 'pindown' || action === 'floppy' || action === 'flare' || action === 'motion';
  if (offBall && swingRole) {
    // A reversal moves the defense before the creator hits the relocating shooter.
    return [
      { fromRole: 'initiator', toRole: 'initiator', kind: 'carry', startFrac: 0, endFrac: 0.34 },
      { fromRole: 'initiator', toRole: swingRole, kind: 'pass', startFrac: 0.34, endFrac: 0.44 },
      { fromRole: swingRole, toRole: 'initiator', kind: 'pass', startFrac: 0.56, endFrac: 0.66 },
      { fromRole: 'initiator', toRole: 'finisher', kind: finalKind, startFrac: 0.84, endFrac: 1 },
    ];
  }
  // Screen / drive-kick: bring it up, run the action, deliver the assist.
  return [
    { fromRole: 'initiator', toRole: 'initiator', kind: 'carry', startFrac: 0, endFrac: 0.74 },
    { fromRole: 'initiator', toRole: 'finisher', kind: finalKind, startFrac: 0.84, endFrac: 1 },
  ];
}

/** Sample the full possession script from the movement input. */
export function sampleScript(input: MotionInput): PossessionScript {
  const { event, prevEvent, ctx, seed, contest } = input;
  const rng = createRNG(seed);
  const { offense, defense } = ctx;

  const family = sampleFamily(event, prevEvent, offense, rng);
  let action: PlayAction;
  if (family === 'transition') action = 'transition';
  else if (family === 'putback') action = 'putback';
  else if (family === 'earlyOffense') action = event.action === 'three' || event.action === 'midrange' ? 'spotUp' : 'transition';
  else action = sampleAction(event, offense, rng);

  const { offRoles, finisher, initiator } = assignOffRoles(action, event);
  const screenerPos = posOfRole(offRoles, 'screener');
  const def = sampleDefense(event, action, offense, defense, screenerPos, contest, rng);

  // Switch: the on-ball defender and the screener's defender swap assignments.
  const matchup = defaultMatchup();
  if (def.coverage === 'switch' && screenerPos) {
    const handler = initiator ?? finisher;
    matchup[handler] = screenerPos;
    matchup[screenerPos] = handler;
  }

  const cuts = sampleCuts(action, offense, offRoles, finisher, initiator, rng);
  const touches = buildTouches(action, offRoles, !!initiator, event.action);

  return { family, action, offRoles, matchup, cuts, touches, defense: def, contest };
}
