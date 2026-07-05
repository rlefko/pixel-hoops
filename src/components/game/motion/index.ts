import { isMadeShot } from '@/types/sim';
import { sampleScript } from './script';
import { simulate } from './simulate';
import { bake } from './bake';
import { bakeHighlights } from './highlights';
import { budgetFrom, fullPreShot, highlightPreShot } from './pacing';
import { resolvedPace } from './composite';
import type { MotionInput, MotionOutput } from './types';

/**
 * The agent-based possession engine, behind the choreography seam. Turns one
 * abstract SimEvent outcome into believable NBA movement: a seeded decision layer
 * samples the play type / roles / defense, the engine sizes the broadcast-real
 * pacing, and a lightweight steering sim plays it out (or highlights cuts straight
 * to the set) and bakes into the renderer's Waypoint/ball structures. Pure,
 * deterministic, Node-safe. Never changes the recorded outcome.
 */
export function buildMotionPlan(input: MotionInput): MotionOutput {
  const script = sampleScript(input);
  const assisted = !!input.event.assist && isMadeShot(input.event);
  const preShotMs =
    input.mode === 'highlights'
      ? highlightPreShot(assisted)
      : fullPreShot(
          script.family,
          script.action,
          input.contest,
          input.event.isBigPlay,
          resolvedPace(input.ctx.offense),
          input.event.homeScore - input.event.awayScore
        );
  const budget = budgetFrom(preShotMs, input.flight, input.postMs);

  const out =
    input.mode === 'highlights'
      ? bakeHighlights(input, script, budget)
      : bake(simulate(input, script, budget), script, input.event.scorerPosition, input.shotSpot);

  return { ...out, preShotMs: budget.preShotMs, totalMs: budget.totalMs, holdUntil: budget.holdUntil, family: script.family };
}

export { sampleScript } from './script';
export { resolveMotionCtx, neutralCtx, type GameMotionData, type SideMotionData } from './ratings';
