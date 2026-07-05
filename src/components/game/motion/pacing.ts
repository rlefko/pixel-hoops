import type { Pace } from '@/types/tactics';
import type { Contest, HalfCourtAction, MotionBudget, PlayAction, PlayFamily } from './types';

/**
 * Broadcast-real pacing: how long the pre-shot beat takes on screen. A possession
 * breathes now (bring-up -> set -> action -> shot), ~5-6s unscaled for a half-court
 * set, ~2.6s for a fast break, keeping the ratios real (iso quickest, post-up
 * slowest). The scheduler's speed slider compresses further. Pure and Node-safe.
 */

/** Per-action half-court pre-shot windows (unscaled ms). */
const PRESHOT_HALF: Record<HalfCourtAction, number> = {
  iso: 4600,
  pnr: 5300,
  pnp: 5200,
  dho: 5100,
  pindown: 5400,
  floppy: 5400,
  flare: 5300,
  motion: 5800,
  spotUp: 5600,
  postUp: 6000,
  horns: 5500,
};
const PRESHOT_TRANSITION = 2650;
const PRESHOT_EARLY = 3400;
const PRESHOT_PUTBACK = 2000;

/** Highlights: just the action beat + the assist, no bring-up/set. */
const HL_ACTION = 720;
const HL_ASSIST = 220;

function baseFor(family: PlayFamily, action: PlayAction): number {
  if (family === 'transition') return PRESHOT_TRANSITION;
  if (family === 'putback') return PRESHOT_PUTBACK;
  if (family === 'earlyOffense') return PRESHOT_EARLY;
  return PRESHOT_HALF[action as HalfCourtAction] ?? 5300;
}

/** Full-mode pre-shot window for a possession. */
export function fullPreShot(
  family: PlayFamily,
  action: PlayAction,
  contest: Contest,
  isBigPlay: boolean,
  pace: Pace,
  margin: number
): number {
  let ms = baseFor(family, action);
  if (contest === 'contested' && !isBigPlay) ms *= 0.82; // late-clock / hunted shot
  if (pace === 'fast') ms *= 0.9;
  else if (pace === 'slow') ms *= 1.1;
  if (Math.abs(margin) >= 20) ms *= 0.75; // garbage-time quick offense
  return Math.round(ms);
}

/** Highlights pre-shot window (assisted plays get the extra pass beat). */
export function highlightPreShot(assisted: boolean): number {
  return HL_ACTION + (assisted ? HL_ASSIST : 0);
}

/** Assemble the full budget from a pre-shot window + choreography's flight/post. */
export function budgetFrom(preShotMs: number, flight: number, postMs: number): MotionBudget {
  return { preShotMs, totalMs: preShotMs + flight + postMs, holdUntil: preShotMs + flight };
}
