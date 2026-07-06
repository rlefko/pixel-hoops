import { createRNG, type RNG } from '@/game/rng';
import { POSITIONS, type Position } from '@/types/roster';
import { assignOffRoles, defaultMatchup } from './roles';
import { sampleAction, sampleCuts, sampleFamily } from './sampler';
import { sampleDefense } from './defense';
import { meanStat, norm01, resolvedPace } from './composite';
import { inbounderRole, startType } from './start';
import type {
  MotionCtx,
  MotionInput,
  OffRole,
  PlayAction,
  PossessionScript,
  ScriptTouch,
} from './types';

/** Renderer ball-leg cap (mirrors MAX_BALL_LEGS in useBallFlight.ts; kept local so this
 *  Node-safe module never imports the reanimated renderer). */
const MAX_LEGS = 8;

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

/** The distinct perimeter spacer roles the ball can be swung to (a real side-to-side
 *  reversal uses two, on opposite sides); at most one wing + one corner are addressable. */
function swingRolesFor(offRoles: Record<Position, OffRole>): OffRole[] {
  const avail: OffRole[] = [];
  if (posOfRole(offRoles, 'wing')) avail.push('wing');
  if (posOfRole(offRoles, 'corner')) avail.push('corner');
  return avail;
}

/** How much this offense moves the ball (0..~1.2): slow + egalitarian + pace-and-space +
 *  strong team playmaking swing it; fast + star + iso/bully stay direct. Pure (no RNG). */
export function ballMovementScore(ctx: MotionCtx, action: PlayAction): number {
  const off = ctx.offense;
  let s = 0.45;
  const pace = resolvedPace(off);
  if (pace === 'slow') s += 0.3;
  else if (pace === 'fast') s -= 0.25;
  if (off.coach.usage === 'egalitarian') s += 0.3;
  else if (off.coach.usage === 'star') s -= 0.25;
  const arch = off.archetype;
  if (arch === 'pace-and-space' || arch === 'three-point-barrage') s += 0.25;
  else if (arch === 'iso-heavy' || arch === 'bully-ball' || arch === 'run-and-gun') s -= 0.25;
  if (off.coach.prefFocus === 'outside') s += 0.1;
  s += 0.5 * (norm01(meanStat(off, 'playmaking')) - 0.4);
  if (action === 'iso' || action === 'postUp' || action === 'putback' || action === 'transition') s -= 0.5;
  if (action === 'motion') s += 0.2; // motion offense swings by definition
  return s;
}

/** Draw the number of ball reversals (0..2) from the style score. Two independent draws,
 *  each likelier with a higher score, so a motion team swings often and an iso team rarely.
 *  Drawn LAST in sampleScript so it never perturbs the earlier (family/action/...) stream. */
function sampleSwings(ctx: MotionCtx, action: PlayAction, rng: RNG): number {
  const s = ballMovementScore(ctx, action);
  let swings = 0;
  if (rng.chance(Math.max(0, Math.min(0.95, s)))) swings++;
  if (swings === 1 && rng.chance(Math.max(0, Math.min(0.8, s - 0.4)))) swings++;
  return swings;
}

/** The ball script: which role holds/passes when. The last touch ends at the finisher
 *  (the credited assist); an inbound start opens with the trailer's baseline pass. Every
 *  script is CONTIGUOUS and carry-backed (no held-ball gap). `swings` reverses the ball
 *  side-to-side among the perimeter spacers before the assist (0 = direct, 2 = full swing).*/
function buildTouches(
  action: PlayAction,
  offRoles: Record<Position, OffRole>,
  hasInitiator: boolean,
  sa: string,
  inbound: boolean,
  swings: number
): ScriptTouch[] {
  const handler: OffRole = hasInitiator ? 'initiator' : 'finisher';
  const inbRole = inbound ? inbounderRole(offRoles) : undefined;
  // The inbound pass (from the baseline inbounder to the handler) opens the possession.
  const lead: ScriptTouch[] =
    inbRole && inbRole !== handler ? [{ fromRole: inbRole, toRole: handler, kind: 'pass', startFrac: 0, endFrac: 0.05 }] : [];
  const carryStart = lead.length ? 0.05 : 0;

  if (!hasInitiator) {
    // Unassisted: the finisher creates and finishes off the dribble (after any inbound).
    return [...lead, { fromRole: 'finisher', toRole: 'finisher', kind: 'carry', startFrac: carryStart, endFrac: 1 }];
  }
  const finalKind: ScriptTouch['kind'] = action === 'dho' ? 'handoff' : sa === 'dunk' ? 'lob' : 'pass';

  // Cap the reversals by the leg budget and the addressable spacer roles. A k-swing script
  // is (4 + 2k) legs for k>=1 (plus any inbound lead), so k <= (MAX_LEGS - 4 - lead) / 2.
  const avail = swingRolesFor(offRoles);
  const budgetSwings = Math.floor((MAX_LEGS - 4 - lead.length) / 2);
  const k = Math.max(0, Math.min(swings, budgetSwings, avail.length));

  if (k === 0) {
    // Direct: bring it up, deliver the assist. The carry runs right to the final pass.
    return [
      ...lead,
      { fromRole: 'initiator', toRole: 'initiator', kind: 'carry', startFrac: carryStart, endFrac: 0.84 },
      { fromRole: 'initiator', toRole: 'finisher', kind: finalKind, startFrac: 0.84, endFrac: 1 },
    ];
  }

  // Swing the ball around the perimeter (init -> spacers in sequence -> init -> finisher),
  // a carry glued to each holder between passes. Contiguous; the LAST leg is the assist.
  const used = avail.slice(0, k);
  const seq: { from: OffRole; to: OffRole; kind: ScriptTouch['kind'] }[] = [
    { from: 'initiator', to: 'initiator', kind: 'carry' },
  ];
  let prev: OffRole = 'initiator';
  for (const r of used) {
    seq.push({ from: prev, to: r, kind: 'pass' });
    seq.push({ from: r, to: r, kind: 'carry' });
    prev = r;
  }
  seq.push({ from: prev, to: 'initiator', kind: 'pass' }); // reverse back to the top
  seq.push({ from: 'initiator', to: 'initiator', kind: 'carry' });

  // Distribute [carryStart, 0.84] across the pre-assist legs by weight (passes quick, carries
  // longer), forcing the last to land exactly on 0.84 so the final assist is [0.84, 1].
  const weights = seq.map((leg) => (leg.kind === 'carry' ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = 0.84 - carryStart;
  const touches: ScriptTouch[] = [...lead];
  let cursor = carryStart;
  for (let i = 0; i < seq.length; i++) {
    const endFrac = i === seq.length - 1 ? 0.84 : cursor + (span * weights[i]) / total;
    touches.push({ fromRole: seq[i].from, toRole: seq[i].to, kind: seq[i].kind, startFrac: cursor, endFrac });
    cursor = endFrac;
  }
  touches.push({ fromRole: 'initiator', toRole: 'finisher', kind: finalKind, startFrac: 0.84, endFrac: 1 });
  return touches;
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
  const inbound = startType(prevEvent, event) === 'inbound';
  // Draw the ball-movement reversals LAST (after every other draw) so adding it never
  // perturbs the family/action/roles/defense/cuts stream. Only assisted plays swing.
  const swings = initiator ? sampleSwings(ctx, action, rng) : 0;
  const touches = buildTouches(action, offRoles, !!initiator, event.action, inbound, swings);

  return { family, action, offRoles, matchup, cuts, touches, defense: def, contest };
}
