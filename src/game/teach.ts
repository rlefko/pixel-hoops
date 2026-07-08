import type { HallOfFameEntry } from './hall-of-fame';
import { cellKey, type Difficulty, type LadderClass } from './difficulty-mode';
import { PLAYER_MACHINES } from './player-gacha';

/**
 * The progressive-onboarding ledger (home-roster v20): which one-shot teaching
 * beats have played, how many runs have reached a terminal settle, and the
 * consecutive-loss streak that arms the draft's coaching nudge.
 *
 * The design contract (docs-level, enforced across this module):
 * - Every beat fires ONCE, guarded by persisted state, never by UI memory
 *   (feel-conventions: ceremonies are one-shot; revisits render settled).
 * - A MISSING ledger reads as fully graduated: silencing a tip for a veteran is
 *   safe, showing one is not (the same missing-ledger rule as hubDeltas).
 * - Hub gates DERIVE from real progress (coins, cleared cells, banners) with the
 *   played ceremony as a one-way ratchet, so a gate can never desynchronize from
 *   the thing it celebrates.
 */

/**
 * Every one-shot teaching beat. The first seven are in-run callouts stamped by
 * the run views when they first show; the last five are hub unlock ceremonies
 * stamped by the hub on the focus they play. Append-only: removing an id would
 * resurrect a seen tip on old saves.
 */
export const TIP_IDS = [
  'draftBudget', // DraftView, first draft: the point-budget rule
  'watchDontTap', // first pregame: the sim plays itself
  'coinsEarned', // first postgame with coins: where coins live
  'recruitRental', // first recruit node: run-scoped signing + favor
  'boostSynergy', // first boost draft: boosts stack, sets glow
  'lossFraming', // first run-ending loss: what banked vs what left
  'ladderShape', // first clear: every cell pays a bounty once
  'lockerUnlock', // hub ceremony: Locker Room opens
  'arcadeUnlock', // hub ceremony: Arcade opens
  'coachesUnlock', // hub reveal: coach row appears
  'hofUnlock', // hub ceremony: Hall of Fame appears
  'dailyUnlock', // hub reveal: Daily panel appears
  'legacyRanks', // Locker Room, first legacy-locked rank in view: careers open ranks 4-5
] as const;
export type TipId = (typeof TIP_IDS)[number];

export interface LossStreak {
  /** cellKey (`difficulty:class`) of the streaking cell. */
  cell: string;
  /** Consecutive terminal losses settled on that exact cell. */
  count: number;
}

export interface TeachLedger {
  /** One-shot tips and ceremonies already shown. Append-only; never removed. */
  seen: TipId[];
  /** Terminal run settles (win or lose) since this ledger existed. Monotone;
   * gates the Locker Room and Daily panel at >= 1. For veterans this counts
   * settles since v20 (backfilled 0 or 1), not a lifetime total. */
  runsSettled: number;
  /** Consecutive losses at ONE (difficulty:class) cell; null when the streak is
   * broken. A championship clears it; a loss at a different cell restarts it. */
  lossStreak: LossStreak | null;
}

/** The Arcade opens when the wallet can afford the cheapest scout. Derived from
 * the machine tuning so the gate and its reason copy can never drift. */
export const ARCADE_UNLOCK_COINS = PLAYER_MACHINES.C.cost;

/** Losses at one cell before the draft shows the adaptive strategy line. */
export const LOSS_NUDGE_STREAK = 3;

/** A brand-new save: nothing seen, nothing settled. */
export function emptyTeach(): TeachLedger {
  return { seen: [], runsSettled: 0, lossStreak: null };
}

/** A fully graduated ledger (the veteran backfill): every tip seen, so every
 * gate reads open and no ceremony is ever owed. */
export function graduatedTeach(hasRunSignal = true): TeachLedger {
  return { seen: [...TIP_IDS], runsSettled: hasRunSignal ? 1 : 0, lossStreak: null };
}

/** Whether a tip has played. A missing ledger reads as seen (graduated). */
export function tipSeen(teach: TeachLedger | undefined, tip: TipId): boolean {
  if (!teach) return true;
  return teach.seen.includes(tip);
}

/**
 * One-way stamp. Returns the SAME reference when the tip is already seen (or the
 * ledger is missing, i.e. graduated), so a mount effect can call it
 * unconditionally without triggering a save loop (the stampHubSeen convention).
 */
export function markTipSeen<T extends { teach?: TeachLedger }>(home: T, tip: TipId): T {
  const teach = home.teach;
  if (!teach || teach.seen.includes(tip)) return home;
  return { ...home, teach: { ...teach, seen: [...teach.seen, tip] } };
}

export interface TeachSettleInput {
  champion: boolean;
  difficulty: Difficulty;
  ladderClass: LadderClass;
}

/**
 * Fold one terminal settle into the ledger: runsSettled always advances; a
 * championship clears the loss streak; a loss extends the streak at its exact
 * cell or restarts it at a new one. A missing ledger stays graduated. Called
 * ONLY from mergeRunGainsIntoHome, whose settledRunId guard makes it
 * exactly-once per run.
 */
export function settleTeach(
  teach: TeachLedger | undefined,
  input: TeachSettleInput
): TeachLedger {
  const base = teach ?? graduatedTeach();
  const runsSettled = base.runsSettled + 1;
  if (input.champion) return { ...base, runsSettled, lossStreak: null };
  const cell = cellKey(input.difficulty, input.ladderClass);
  const count = base.lossStreak?.cell === cell ? base.lossStreak.count + 1 : 1;
  return { ...base, runsSettled, lossStreak: { cell, count } };
}

/** The streak count relevant to a draft at (difficulty, class); 0 when the
 * streak lives on another cell or the ledger is missing. */
export function lossStreakAt(
  teach: TeachLedger | undefined,
  difficulty: Difficulty,
  ladderClass: LadderClass
): number {
  const streak = teach?.lossStreak;
  if (!streak || streak.cell !== cellKey(difficulty, ladderClass)) return 0;
  return streak.count;
}

/** Field-wise validation (the sanitizeHubSeen convention): each invalid field
 * falls back to the caller's fallback ledger, so garbage can only ever silence
 * teaching, never re-show it to a veteran or fabricate a streak. */
export function sanitizeTeach(raw: unknown, fallback: TeachLedger): TeachLedger {
  if (!raw || typeof raw !== 'object') return fallback;
  const { seen, runsSettled, lossStreak } = raw as Record<string, unknown>;
  const knownIds = new Set<string>(TIP_IDS);
  const cleanSeen = Array.isArray(seen)
    ? [...new Set(seen.filter((id): id is TipId => typeof id === 'string' && knownIds.has(id)))]
    : fallback.seen;
  const cleanSettled =
    typeof runsSettled === 'number' && Number.isFinite(runsSettled) && runsSettled >= 0
      ? Math.floor(runsSettled)
      : fallback.runsSettled;
  let cleanStreak: LossStreak | null = null;
  if (lossStreak && typeof lossStreak === 'object') {
    const { cell, count } = lossStreak as Record<string, unknown>;
    if (
      typeof cell === 'string' &&
      /^[a-z]+:(C|B|A|S|S\+)$/.test(cell) &&
      typeof count === 'number' &&
      Number.isFinite(count) &&
      count >= 1
    ) {
      cleanStreak = { cell, count: Math.floor(count) };
    }
  }
  return { seen: cleanSeen, runsSettled: cleanSettled, lossStreak: cleanStreak };
}

/** The five gated hub features. true = fully open. */
export interface HubStages {
  locker: boolean;
  arcade: boolean;
  coaches: boolean;
  hallOfFame: boolean;
  daily: boolean;
}

/** The narrow slice of home state the gates read (the currentHubSeen
 * convention), so this module never imports HomeRoster. */
export interface HubStageState {
  teach?: TeachLedger;
  coins: number;
  clearedCells: string[];
  hallOfFame: HallOfFameEntry[];
}

/**
 * Which hub features are open. Each gate derives from real progress, with the
 * played unlock ceremony as a one-way ratchet (the Arcade's wallet can dip back
 * under the scout cost after spending; the seen flag keeps it open).
 */
export function hubStages(s: HubStageState): HubStages {
  const t = s.teach;
  // A missing ledger is graduated: an unexpected state must never hide a veteran's hub.
  if (!t) return { locker: true, arcade: true, coaches: true, hallOfFame: true, daily: true };
  const seen = new Set(t.seen);
  const settled = t.runsSettled >= 1;
  return {
    locker: settled || seen.has('lockerUnlock'),
    daily: settled || seen.has('dailyUnlock'),
    arcade: s.coins >= ARCADE_UNLOCK_COINS || seen.has('arcadeUnlock'),
    coaches: s.clearedCells.length > 0 || seen.has('coachesUnlock'),
    hallOfFame: s.hallOfFame.length > 0 || seen.has('hofUnlock'),
  };
}

/** Ceremonies that pop and sting (one per hub focus, max). */
export const AUDIBLE_CEREMONIES: readonly TipId[] = ['lockerUnlock', 'arcadeUnlock', 'hofUnlock'];
/** Reveals that only stagger in (co-stamped on the focus they first render). */
export const QUIET_CEREMONIES: readonly TipId[] = ['dailyUnlock', 'coachesUnlock'];

/** The unlock beats owed on the hub: at most one audible ceremony (play order:
 * locker, arcade, hof) plus every quiet reveal whose gate just opened. */
export function dueHubCeremonies(s: HubStageState): { audible: TipId | null; quiet: TipId[] } {
  const stages = hubStages(s);
  const seen = new Set(s.teach?.seen ?? TIP_IDS);
  const open: Partial<Record<TipId, boolean>> = {
    lockerUnlock: stages.locker,
    arcadeUnlock: stages.arcade,
    hofUnlock: stages.hallOfFame,
    dailyUnlock: stages.daily,
    coachesUnlock: stages.coaches,
  };
  const audible = AUDIBLE_CEREMONIES.find((id) => open[id] && !seen.has(id)) ?? null;
  const quiet = QUIET_CEREMONIES.filter((id) => open[id] && !seen.has(id));
  return { audible, quiet };
}

export type HubPulseTarget = 'newRun' | 'resume' | 'locker' | 'arcade' | 'hallOfFame' | 'daily';

/**
 * Exactly ONE attract pulse per hub screen, pointing at the next-best action:
 * a playing unlock ceremony's tile, else a suspended run, else (before the
 * first settle) NEW RUN, else an unclaimed daily spotlight, else NEW RUN.
 */
export function hubPulseTarget(input: {
  stages: HubStages;
  ceremony: TipId | null;
  hasSavedRun: boolean;
  spotlightClaimed: boolean;
}): HubPulseTarget {
  switch (input.ceremony) {
    case 'lockerUnlock':
      return 'locker';
    case 'arcadeUnlock':
      return 'arcade';
    case 'hofUnlock':
      return 'hallOfFame';
    default:
      break;
  }
  if (input.hasSavedRun) return 'resume';
  if (!input.stages.locker) return 'newRun'; // pre-first-settle
  if (input.stages.daily && !input.spotlightClaimed) return 'daily';
  return 'newRun';
}
