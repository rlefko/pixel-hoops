import type { RosterPlayer } from '@/types/roster';
import type { Team } from '@/types/team';
import type { SimResult } from '@/types/sim';
import type { PlayerClass } from './ratings';
import { mvpIndex } from './box-score';
import { DIFFICULTIES, isLadderClass, type Difficulty, type LadderClass } from './difficulty-mode';

/**
 * The Hall of Fame: a permanent, cross-run trophy case of every roster that won a
 * ladder. An entry is a frozen snapshot of the final game (difficulty, ladder
 * class, score, opponent) plus the five who closed it out, so the player can
 * revisit and share their championships long after the run is over. Entries are
 * banked at run end by mergeRunGainsIntoHome and persist in the HomeRoster save.
 */

/** Newest entries are kept up to this cap; older banners fall off the bottom. */
export const HALL_OF_FAME_CAP = 50;

/** The standout player of the final game (highest game score), for the share blurb. */
export interface HallOfFameMvp {
  name: string;
  pts: number;
  reb: number;
  ast: number;
}

export interface HallOfFameEntry {
  /** Stable unique id for list keys (timestamp + score). */
  id: string;
  /** Win time (ms epoch); entries are stored and shown newest first. */
  ts: number;
  difficulty: Difficulty;
  ladderClass: LadderClass;
  /** The player's final score. */
  finalHome: number;
  /** The opponent's final score. */
  finalAway: number;
  opponentName: string;
  /** The player's team name in the final game (e.g. "Your Squad"). */
  homeTeamName: string;
  /** Games won across the whole run. */
  wins: number;
  /** The starting five of the final game, cleaned for storage/display. */
  starters: RosterPlayer[];
  /** Final-game MVP (highest game score). Absent on pre-MVP saves. */
  mvp?: HallOfFameMvp;
}

/** The slice of the final game an entry is built from (a subset of RunModel.game). */
export interface ChampionGame {
  opponentName: string;
  result: SimResult;
  home: Team;
}

/**
 * A final-game starter as stored in an entry. The lineup players come from
 * effectivePlayers, which bakes item/ability/training gains INTO player.stats but
 * leaves the run-scoped fields on the object; PlayerCard re-applies trainingDelta,
 * so trainingDelta MUST be stripped here or the trophy would double-count it.
 * gamesOut/onLoan are run-scoped noise on a frozen snapshot. The remaining display
 * marks (item/ability/equippedAbility/legendary) are kept and never re-add stats.
 */
export function cleanStarter(rp: RosterPlayer): RosterPlayer {
  const copy = { ...rp };
  delete copy.trainingDelta;
  delete copy.gamesOut;
  delete copy.onLoan;
  return copy;
}

/**
 * Build a Hall of Fame entry from a won final game. Pure: the caller passes `ts`
 * (Date.now lives in the hook, never here) so this stays deterministic/testable.
 */
export function buildHallOfFameEntry(
  game: ChampionGame,
  difficulty: Difficulty,
  ladderClass: LadderClass,
  wins: number,
  ts: number
): HallOfFameEntry {
  return {
    id: `${ts}-${game.result.finalHome}-${game.result.finalAway}`,
    ts,
    difficulty,
    ladderClass,
    finalHome: game.result.finalHome,
    finalAway: game.result.finalAway,
    opponentName: game.opponentName,
    homeTeamName: game.home.name,
    wins,
    starters: game.home.lineup.players.map(cleanStarter),
    mvp: pickMvp(game.result.box.home),
  };
}

/** The home squad's standout (highest game score), or undefined if nobody played. */
function pickMvp(home: SimResult['box']['home']): HallOfFameMvp | undefined {
  const i = mvpIndex(home);
  if (i < 0) return undefined;
  const { name, pts, reb, ast } = home[i];
  return { name, pts, reb, ast };
}

/** Minimal shape check for a stored starter (mirrors the player guard in deserialize). */
function isStarterShape(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const rp = p as Partial<RosterPlayer>;
  const stats = rp.player?.stats as unknown;
  return (
    typeof rp.player?.name === 'string' &&
    typeof rp.position === 'string' &&
    !!stats &&
    typeof stats === 'object'
  );
}

/**
 * Restore the Hall of Fame from a persisted save, tolerating missing/garbage data:
 * non-arrays become empty, malformed entries are dropped, and the list is capped so
 * a corrupt save can never bloat. Order is preserved (newest first).
 */
export function sanitizeHallOfFame(raw: unknown): HallOfFameEntry[] {
  if (!Array.isArray(raw)) return [];
  const ok: HallOfFameEntry[] = [];
  for (const e of raw) {
    if (ok.length >= HALL_OF_FAME_CAP) break;
    if (!e || typeof e !== 'object') continue;
    const c = e as Partial<HallOfFameEntry>;
    if (
      typeof c.id === 'string' &&
      typeof c.ts === 'number' &&
      typeof c.difficulty === 'string' &&
      (DIFFICULTIES as readonly string[]).includes(c.difficulty) &&
      typeof c.ladderClass === 'string' &&
      isLadderClass(c.ladderClass as PlayerClass) &&
      typeof c.finalHome === 'number' &&
      typeof c.finalAway === 'number' &&
      typeof c.opponentName === 'string' &&
      typeof c.homeTeamName === 'string' &&
      typeof c.wins === 'number' &&
      Array.isArray(c.starters) &&
      c.starters.every(isStarterShape)
    ) {
      ok.push(c as HallOfFameEntry);
    }
  }
  return ok;
}
