import type { CoachStyle } from './coaches';
import { teamByName } from '@/data/nba';

/**
 * Opponent coaches: the missing strategic layer for the teams you face. Every
 * opponent is a real NBA franchise fielding its real starters; this maps each
 * franchise to its recent real head coach's PLAY-STYLE so the roster plays the way
 * the real team plays, instead of every opponent defaulting to a flat,
 * roster-derived game plan (the old `planForRoster`-only path).
 *
 * Style only, never power: an opponent coach drives tempo / focus / star-usage
 * (via planForCoach) and the substitution rotation (via rotationForCoach), but
 * grants NO system bonus, so opponents play distinctly without an unfair rating
 * bump. The lookup is a pure, deterministic table keyed by franchise abbreviation,
 * so it never adds an RNG draw and the opponent preview / seeding stay unchanged
 * (the franchise is still the first draw, via pickRealTeam).
 *
 * Pure and dependency-light (the nba data + a type), so it unit-tests headless.
 */

/** A coach style is the play-style subset of a CoachProfile. */
export type OpponentCoach = CoachStyle;

/** The neutral fallback for any franchise not in the table (or a procedural
 * opponent): defer pace/focus to the roster, even usage, standard rotation, so it
 * resolves exactly like the old roster-derived plan. */
const NEUTRAL: OpponentCoach = {
  name: 'Staff',
  prefPace: 'auto',
  prefFocus: 'auto',
  usage: 'balanced',
  rotation: 9,
};

/**
 * Franchise abbreviation -> the team's recent real head-coach play-style. Tuned to
 * each team's real identity: up-tempo shooting teams run fast and outside, defensive
 * teams lock down and slow it, star-led teams feature their best scorer, deep teams
 * go ten deep. Mirrors the player's coach tendencies (see COACHES in coaches.ts),
 * so the two systems read consistently on the scout cards.
 */
const COACH_BY_ABBR: Record<string, OpponentCoach> = {
  ATL: { name: 'Quin Snyder', prefPace: 'balanced', prefFocus: 'outside', usage: 'star', rotation: 9 },
  BOS: { name: 'Joe Mazzulla', prefPace: 'fast', prefFocus: 'outside', usage: 'balanced', rotation: 8 },
  BKN: { name: 'Jordi Fernandez', prefPace: 'balanced', prefFocus: 'balanced', usage: 'egalitarian', rotation: 10 },
  CHA: { name: 'Charles Lee', prefPace: 'fast', prefFocus: 'outside', usage: 'star', rotation: 9 },
  CHI: { name: 'Billy Donovan', prefPace: 'balanced', prefFocus: 'balanced', usage: 'balanced', rotation: 9 },
  CLE: { name: 'Kenny Atkinson', prefPace: 'fast', prefFocus: 'balanced', usage: 'balanced', rotation: 9 },
  DAL: { name: 'Jason Kidd', prefPace: 'balanced', prefFocus: 'balanced', usage: 'star', rotation: 8 },
  DEN: { name: 'Michael Malone', prefPace: 'balanced', prefFocus: 'inside', usage: 'star', rotation: 8 },
  DET: { name: 'J.B. Bickerstaff', prefPace: 'balanced', prefFocus: 'lockdown', usage: 'balanced', rotation: 9 },
  GSW: { name: 'Steve Kerr', prefPace: 'fast', prefFocus: 'outside', usage: 'egalitarian', rotation: 10 },
  HOU: { name: 'Ime Udoka', prefPace: 'balanced', prefFocus: 'lockdown', usage: 'balanced', rotation: 9 },
  IND: { name: 'Rick Carlisle', prefPace: 'fast', prefFocus: 'outside', usage: 'egalitarian', rotation: 10 },
  LAC: { name: 'Tyronn Lue', prefPace: 'balanced', prefFocus: 'balanced', usage: 'star', rotation: 8 },
  LAL: { name: 'JJ Redick', prefPace: 'balanced', prefFocus: 'inside', usage: 'star', rotation: 8 },
  MEM: { name: 'Taylor Jenkins', prefPace: 'fast', prefFocus: 'balanced', usage: 'star', rotation: 10 },
  MIA: { name: 'Erik Spoelstra', prefPace: 'balanced', prefFocus: 'lockdown', usage: 'balanced', rotation: 9 },
  MIL: { name: 'Doc Rivers', prefPace: 'balanced', prefFocus: 'inside', usage: 'star', rotation: 8 },
  MIN: { name: 'Chris Finch', prefPace: 'balanced', prefFocus: 'lockdown', usage: 'star', rotation: 9 },
  NOP: { name: 'Willie Green', prefPace: 'balanced', prefFocus: 'inside', usage: 'star', rotation: 9 },
  NYK: { name: 'Tom Thibodeau', prefPace: 'slow', prefFocus: 'lockdown', usage: 'star', rotation: 8 },
  OKC: { name: 'Mark Daigneault', prefPace: 'fast', prefFocus: 'lockdown', usage: 'balanced', rotation: 10 },
  ORL: { name: 'Jamahl Mosley', prefPace: 'slow', prefFocus: 'lockdown', usage: 'balanced', rotation: 9 },
  PHI: { name: 'Nick Nurse', prefPace: 'balanced', prefFocus: 'balanced', usage: 'star', rotation: 9 },
  PHX: { name: 'Mike Budenholzer', prefPace: 'balanced', prefFocus: 'outside', usage: 'star', rotation: 9 },
  POR: { name: 'Chauncey Billups', prefPace: 'balanced', prefFocus: 'balanced', usage: 'balanced', rotation: 10 },
  SAC: { name: 'Mike Brown', prefPace: 'fast', prefFocus: 'outside', usage: 'star', rotation: 9 },
  SAS: { name: 'Gregg Popovich', prefPace: 'balanced', prefFocus: 'balanced', usage: 'egalitarian', rotation: 10 },
  TOR: { name: 'Darko Rajakovic', prefPace: 'fast', prefFocus: 'balanced', usage: 'egalitarian', rotation: 10 },
  UTA: { name: 'Will Hardy', prefPace: 'fast', prefFocus: 'outside', usage: 'balanced', rotation: 10 },
  WAS: { name: 'Brian Keefe', prefPace: 'fast', prefFocus: 'balanced', usage: 'balanced', rotation: 10 },
};

/** The coach style for a franchise abbreviation (neutral fallback when unknown). */
export function coachForTeamAbbr(abbr: string): OpponentCoach {
  return COACH_BY_ABBR[abbr] ?? NEUTRAL;
}

/**
 * The coach style for an opponent by its full "City Name" display string (what the
 * generated opponent Team carries). Resolves through the nba franchise table; falls
 * back to the neutral staff for a procedural / unrecognized name.
 */
export function coachForTeamName(fullName: string): OpponentCoach {
  const team = teamByName(fullName);
  return team ? coachForTeamAbbr(team.abbreviation) : NEUTRAL;
}
