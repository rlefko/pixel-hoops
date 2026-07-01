import type { RosterPlayer, Roster } from '@/types/roster';
import type { GamePlan, Pace, Focus } from '@/types/tactics';
import type { StatDelta, TeamModifier } from './effects';
import { ovrRaw } from './ratings';
import { deriveArchetypeFromFive, type TeamArchetype } from './team-archetype';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  advanceLadder,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';

/**
 * Coaches: the strategic-expertise layer. One coach is equipped per run (locked
 * for the run, picked before tip-off, defaulted so it is never a forced choice).
 * A coach (1) shapes how your team plays in the auto-sim, biasing the game plan,
 * the substitution rotation, and granting a small conditional system bonus when
 * the roster fits its style, and (2) powers optional, one-click lineup
 * recommendations (see coach-reco.ts).
 *
 * Coaches are COLLECTED off the existing (difficulty x ladder class) ladder, never
 * bought: the first coach of a class is won by first clearing the class below, and
 * additional coaches of a class are won by clearing that class on more difficulties
 * (so collecting a whole class requires clearing it on every difficulty). The unlock
 * functions here are the single source of truth, reused by the championship grant
 * and the save migration in home-roster.ts.
 *
 * Pure and dependency-light (no React/theme/RNG), so it stays Node/Vitest-safe.
 */

export type CoachUsage = 'star' | 'egalitarian' | 'balanced';

/** Coaches grade on the player class ladder (C..S+); S++ is never a coach class. */
export type CoachClass = LadderClass;

/**
 * How a coach is earned (never coins):
 *  - `starter`: owned from a fresh save (the C-class opener / sensible default).
 *  - `opener`: the first coach of `forClass`, won by first clearing the class below
 *     it on ANY difficulty ("the first coach of a class from the previous ladder").
 *  - `ladder`: an additional coach of `forClass`, won once that class has been
 *     cleared on at least `rank` distinct difficulties (so rank 4 needs all four).
 */
export type CoachUnlock =
  | { kind: 'starter' }
  | { kind: 'opener'; forClass: CoachClass }
  | { kind: 'ladder'; forClass: CoachClass; rank: number };

/**
 * The play-style fields the sim reads to shape how a team plays. Shared by the
 * player's collectible {@link CoachProfile}s and the lightweight opponent coaches
 * (see opponent-coach.ts), so planForCoach / rotationForCoach accept either: an
 * opponent franchise can be coached in its real coach's style without carrying the
 * collection metadata (id / class / iq / system / unlock).
 */
export interface CoachStyle {
  /** Display name. */
  name: string;
  /** Preferred tempo, or `auto` to defer to the roster-derived pace (the starter). */
  prefPace: Pace | 'auto';
  /** Preferred focus, or `auto` to defer to the roster-derived focus (the starter). */
  prefFocus: Focus | 'auto';
  /** Star-centric vs egalitarian usage (drives the game plan's starPlayerIndex). */
  usage: CoachUsage;
  /** Rotation depth: 8 = short (starters play more), 9 = standard, 10 = deep. */
  rotation: 8 | 9 | 10;
}

export interface CoachProfile extends CoachStyle {
  /** Stable kebab id (persisted in the save); never changes even if the name does. */
  id: string;
  class: CoachClass;
  /** Coaching IQ on the 6-20 stat scale: drives recommendation search depth. */
  iq: number;
  /** Archetypes this coach's system fits; the system bonus fires only on a match.
   * Empty = no system (the neutral starter), so the bonus never applies. */
  system: readonly TeamArchetype[];
  /** Small conditional rating edge granted when the roster matches `system`. */
  systemBonus: StatDelta;
  /** One-line flavor for the collection UI. */
  blurb: string;
  unlock: CoachUnlock;
}

/** The default/starter coach: a true no-op (defers pace/focus, even usage, standard
 * rotation, no system), so a brand-new player's games are identical to today and
 * coaches are purely additive. */
export const STARTER_COACH_ID = 'nate-mcmillan';

/**
 * The coach catalog: real coaches mapped to systems and classes. Class reflects the
 * STRENGTH of the unlockable system (system-bonus magnitude + coaching IQ), the same
 * way the game already classes real players. The starter is a no-op; every other
 * coach is a sidegrade (an identity to build toward), never raw power.
 */
export const COACHES: readonly CoachProfile[] = [
  // --- Class C (starter + four ladder coaches) ---
  {
    id: 'nate-mcmillan', name: 'Nate McMillan', class: 'C',
    prefPace: 'auto', prefFocus: 'auto', usage: 'balanced', rotation: 9, iq: 8,
    system: [], systemBonus: {},
    blurb: 'Steady fundamentals. Lets the roster set the tone.',
    unlock: { kind: 'starter' },
  },
  {
    id: 'don-nelson', name: 'Don Nelson', class: 'C',
    prefPace: 'fast', prefFocus: 'outside', usage: 'egalitarian', rotation: 8, iq: 9,
    system: ['run-and-gun', 'pace-and-space'], systemBonus: { outside: 0.6 },
    blurb: 'Nellie ball: small, fast, and impossible to guard.',
    unlock: { kind: 'ladder', forClass: 'C', rank: 1 },
  },
  {
    id: 'george-karl', name: 'George Karl', class: 'C',
    prefPace: 'fast', prefFocus: 'outside', usage: 'egalitarian', rotation: 10, iq: 8,
    system: ['run-and-gun'], systemBonus: { athleticism: 0.6 },
    blurb: 'Push the pace, share the ball, run them ragged.',
    unlock: { kind: 'ladder', forClass: 'C', rank: 2 },
  },
  {
    id: 'jerry-sloan', name: 'Jerry Sloan', class: 'C',
    prefPace: 'slow', prefFocus: 'inside', usage: 'balanced', rotation: 9, iq: 9,
    system: ['bully-ball', 'twin-towers'], systemBonus: { inside: 0.6 },
    blurb: 'Pick-and-roll, hard screens, pound it inside.',
    unlock: { kind: 'ladder', forClass: 'C', rank: 3 },
  },
  {
    id: 'rick-adelman', name: 'Rick Adelman', class: 'C',
    prefPace: 'balanced', prefFocus: 'balanced', usage: 'egalitarian', rotation: 10, iq: 9,
    system: ['balanced', 'pace-and-space'], systemBonus: { playmaking: 0.6, iq: 0.4 },
    blurb: 'Corner offense: read, move, find the open man.',
    unlock: { kind: 'ladder', forClass: 'C', rank: 4 },
  },

  // --- Class B (opener from first C clear + four ladder coaches) ---
  {
    id: 'lionel-hollins', name: 'Lionel Hollins', class: 'B',
    prefPace: 'slow', prefFocus: 'lockdown', usage: 'balanced', rotation: 8, iq: 11,
    system: ['grit-and-grind'], systemBonus: { interiorD: 0.8 },
    blurb: 'Grit and grind: bruise them, slow them, win ugly.',
    unlock: { kind: 'opener', forClass: 'B' },
  },
  {
    id: 'doc-rivers', name: 'Doc Rivers', class: 'B',
    prefPace: 'balanced', prefFocus: 'balanced', usage: 'star', rotation: 8, iq: 11,
    system: ['iso-heavy', 'balanced'], systemBonus: { clutch: 0.8 },
    blurb: 'Trust your best player when it matters most.',
    unlock: { kind: 'ladder', forClass: 'B', rank: 1 },
  },
  {
    id: 'mike-budenholzer', name: 'Mike Budenholzer', class: 'B',
    prefPace: 'balanced', prefFocus: 'outside', usage: 'egalitarian', rotation: 9, iq: 11,
    system: ['pace-and-space', 'three-point-barrage'], systemBonus: { outside: 0.8, playmaking: 0.4 },
    blurb: 'Spread the floor, swing the ball, bomb away.',
    unlock: { kind: 'ladder', forClass: 'B', rank: 2 },
  },
  {
    id: 'tom-thibodeau', name: 'Tom Thibodeau', class: 'B',
    prefPace: 'slow', prefFocus: 'lockdown', usage: 'star', rotation: 8, iq: 11,
    system: ['grit-and-grind'], systemBonus: { perimeterD: 0.5, interiorD: 0.5 },
    blurb: 'Lock in and ride the starters: no easy buckets.',
    unlock: { kind: 'ladder', forClass: 'B', rank: 3 },
  },
  {
    id: 'rudy-tomjanovich', name: 'Rudy Tomjanovich', class: 'B',
    prefPace: 'balanced', prefFocus: 'inside', usage: 'star', rotation: 9, iq: 10,
    system: ['bully-ball', 'iso-heavy'], systemBonus: { inside: 0.8 },
    blurb: 'Inside-out: feed the big, kick to shooters.',
    unlock: { kind: 'ladder', forClass: 'B', rank: 4 },
  },

  // --- Class A (opener from first B clear + four ladder coaches) ---
  {
    id: 'mike-dantoni', name: "Mike D'Antoni", class: 'A',
    prefPace: 'fast', prefFocus: 'outside', usage: 'star', rotation: 8, iq: 13,
    system: ['run-and-gun', 'pace-and-space'], systemBonus: { outside: 1.0, athleticism: 0.5 },
    blurb: 'Seven seconds or less. Shoot before they set.',
    unlock: { kind: 'opener', forClass: 'A' },
  },
  {
    id: 'mike-brown', name: 'Mike Brown', class: 'A',
    prefPace: 'balanced', prefFocus: 'lockdown', usage: 'balanced', rotation: 10, iq: 14,
    system: ['grit-and-grind', 'pace-and-space'], systemBonus: { perimeterD: 1.0, playmaking: 0.5 },
    blurb: 'Spurs-bred defense, Warriors-bred motion, and a ring to prove it.',
    unlock: { kind: 'ladder', forClass: 'A', rank: 1 },
  },
  {
    id: 'frank-vogel', name: 'Frank Vogel', class: 'A',
    prefPace: 'slow', prefFocus: 'lockdown', usage: 'balanced', rotation: 9, iq: 13,
    system: ['twin-towers', 'grit-and-grind'], systemBonus: { interiorD: 1.0 },
    blurb: 'Build a wall at the rim and dare them to shoot over it.',
    unlock: { kind: 'ladder', forClass: 'A', rank: 2 },
  },
  {
    id: 'rick-carlisle', name: 'Rick Carlisle', class: 'A',
    prefPace: 'balanced', prefFocus: 'balanced', usage: 'egalitarian', rotation: 9, iq: 14,
    system: ['balanced', 'pace-and-space'], systemBonus: { iq: 0.8, playmaking: 0.6 },
    blurb: 'Flow offense run by a chess player.',
    unlock: { kind: 'ladder', forClass: 'A', rank: 3 },
  },
  {
    id: 'tyronn-lue', name: 'Tyronn Lue', class: 'A',
    prefPace: 'balanced', prefFocus: 'outside', usage: 'star', rotation: 8, iq: 14,
    system: ['iso-heavy', 'pace-and-space'], systemBonus: { clutch: 1.0, outside: 0.5 },
    blurb: 'Adjusts on the fly and owns the clutch.',
    unlock: { kind: 'ladder', forClass: 'A', rank: 4 },
  },

  // --- Class S (opener from first A clear + four ladder coaches) ---
  {
    id: 'steve-kerr', name: 'Steve Kerr', class: 'S',
    prefPace: 'fast', prefFocus: 'outside', usage: 'egalitarian', rotation: 9, iq: 16,
    system: ['pace-and-space', 'three-point-barrage'], systemBonus: { outside: 1.2, playmaking: 0.6 },
    blurb: 'Pace and space, joy and threes, ball never stops.',
    unlock: { kind: 'opener', forClass: 'S' },
  },
  {
    id: 'erik-spoelstra', name: 'Erik Spoelstra', class: 'S',
    prefPace: 'balanced', prefFocus: 'lockdown', usage: 'balanced', rotation: 9, iq: 17,
    system: ['grit-and-grind', 'balanced'], systemBonus: { perimeterD: 0.8, interiorD: 0.8 },
    blurb: 'Positionless, relentless, switch everything.',
    unlock: { kind: 'ladder', forClass: 'S', rank: 1 },
  },
  {
    id: 'chuck-daly', name: 'Chuck Daly', class: 'S',
    prefPace: 'slow', prefFocus: 'lockdown', usage: 'balanced', rotation: 9, iq: 15,
    system: ['grit-and-grind'], systemBonus: { interiorD: 1.0, perimeterD: 0.8 },
    blurb: 'Bad Boys defense: make every bucket hurt.',
    unlock: { kind: 'ladder', forClass: 'S', rank: 2 },
  },
  {
    id: 'larry-brown', name: 'Larry Brown', class: 'S',
    prefPace: 'slow', prefFocus: 'balanced', usage: 'egalitarian', rotation: 9, iq: 16,
    system: ['balanced', 'grit-and-grind'], systemBonus: { iq: 1.2 },
    blurb: 'Play the right way: discipline wins championships.',
    unlock: { kind: 'ladder', forClass: 'S', rank: 3 },
  },
  {
    id: 'hubie-brown', name: 'Hubie Brown', class: 'S',
    prefPace: 'slow', prefFocus: 'lockdown', usage: 'egalitarian', rotation: 10, iq: 16,
    system: ['grit-and-grind', 'balanced'], systemBonus: { interiorD: 1.0, iq: 0.5 },
    blurb: 'Ten deep, all defense, wear them down to the wood.',
    unlock: { kind: 'ladder', forClass: 'S', rank: 4 },
  },

  // --- Class S+ (opener from first S clear + four ladder coaches) ---
  {
    id: 'gregg-popovich', name: 'Gregg Popovich', class: 'S+',
    prefPace: 'balanced', prefFocus: 'balanced', usage: 'egalitarian', rotation: 10, iq: 19,
    system: ['balanced', 'pace-and-space'], systemBonus: { iq: 1.5, playmaking: 1.0 },
    blurb: 'Motion, trust, and the long game. Beautiful basketball.',
    unlock: { kind: 'opener', forClass: 'S+' },
  },
  {
    id: 'phil-jackson', name: 'Phil Jackson', class: 'S+',
    prefPace: 'balanced', prefFocus: 'balanced', usage: 'star', rotation: 8, iq: 20,
    system: ['iso-heavy', 'balanced'], systemBonus: { clutch: 1.5, iq: 1.0 },
    blurb: 'The Triangle, and the calm to ride a superstar to a ring.',
    unlock: { kind: 'ladder', forClass: 'S+', rank: 1 },
  },
  {
    id: 'pat-riley', name: 'Pat Riley', class: 'S+',
    prefPace: 'fast', prefFocus: 'balanced', usage: 'star', rotation: 9, iq: 19,
    system: ['run-and-gun', 'pace-and-space'], systemBonus: { athleticism: 1.2, clutch: 0.8 },
    blurb: 'Showtime swagger backed by championship steel.',
    unlock: { kind: 'ladder', forClass: 'S+', rank: 2 },
  },
  {
    id: 'red-auerbach', name: 'Red Auerbach', class: 'S+',
    prefPace: 'fast', prefFocus: 'balanced', usage: 'egalitarian', rotation: 10, iq: 19,
    system: ['run-and-gun', 'balanced'], systemBonus: { athleticism: 1.2, iq: 1.0 },
    blurb: 'Fast break, the sixth man, and more banners than anyone.',
    unlock: { kind: 'ladder', forClass: 'S+', rank: 3 },
  },
  {
    id: 'bill-russell', name: 'Bill Russell', class: 'S+',
    prefPace: 'balanced', prefFocus: 'lockdown', usage: 'egalitarian', rotation: 9, iq: 20,
    system: ['grit-and-grind', 'twin-towers'], systemBonus: { interiorD: 1.5, iq: 1.0 },
    blurb: 'Defense and winning, distilled. Owns the fourth quarter.',
    unlock: { kind: 'ladder', forClass: 'S+', rank: 4 },
  },
];

const COACH_BY_ID = new Map(COACHES.map((c) => [c.id, c]));

/** Look up a coach by id, falling back to the starter for an unknown/absent id. */
export function getCoach(id?: string): CoachProfile {
  return (id ? COACH_BY_ID.get(id) : undefined) ?? COACH_BY_ID.get(STARTER_COACH_ID)!;
}

/** Whether `id` is a known coach. */
export function isCoachId(id: string): boolean {
  return COACH_BY_ID.has(id);
}

/** Coaches of a given class, in catalog order. */
export function coachesByClass(cls: CoachClass): CoachProfile[] {
  return COACHES.filter((c) => c.class === cls);
}

// --- Unlock logic (the single source of truth; reused by grant + migration) ---

function classIndex(c: LadderClass): number {
  return LADDER_CLASSES.indexOf(c);
}

/** The ladder class one rung below `c`, or null for the lowest (C). */
function prevClass(c: CoachClass): LadderClass | null {
  const i = classIndex(c);
  return i > 0 ? LADDER_CLASSES[i - 1] : null;
}

/** How many distinct difficulties have cleared at least up to `cls`. The ladder is
 * climbed one rung at a time per difficulty, so this is monotonic. */
function clearedDifficulties(
  cls: LadderClass,
  progress: Record<Difficulty, LadderClass | null>
): number {
  const need = classIndex(cls);
  let count = 0;
  for (const d of DIFFICULTIES) {
    const cleared = progress[d];
    if (cleared != null && classIndex(cleared) >= need) count += 1;
  }
  return count;
}

/** Whether the given ladder progress entitles a coach with this unlock condition. */
export function isCoachUnlocked(
  unlock: CoachUnlock,
  progress: Record<Difficulty, LadderClass | null>
): boolean {
  switch (unlock.kind) {
    case 'starter':
      return true;
    case 'opener': {
      const prev = prevClass(unlock.forClass);
      return prev != null && clearedDifficulties(prev, progress) >= 1;
    }
    case 'ladder':
      return clearedDifficulties(unlock.forClass, progress) >= unlock.rank;
  }
}

/** Every coach id the given ladder progress entitles the player to own (catalog
 * order). The single source of truth for both the championship grant and the
 * save migration's derive-from-progress. */
export function earnedCoachIds(progress: Record<Difficulty, LadderClass | null>): string[] {
  return COACHES.filter((c) => isCoachUnlocked(c.unlock, progress)).map((c) => c.id);
}

/**
 * The coach ids newly won by clearing `clearedClass` on `clearedDifficulty`, given
 * what is already owned. Re-applies advanceLadder internally so it is correct
 * regardless of call order relative to the ladder write, and idempotent on a
 * re-clear (advanceLadder only moves forward, the diff drops owned ids).
 */
export function coachesWonByClear(
  progressBefore: Record<Difficulty, LadderClass | null>,
  clearedDifficulty: Difficulty,
  clearedClass: LadderClass,
  owned: ReadonlySet<string>
): string[] {
  const after = {
    ...progressBefore,
    [clearedDifficulty]: advanceLadder(progressBefore[clearedDifficulty], clearedClass),
  };
  return earnedCoachIds(after).filter((id) => !owned.has(id));
}

/** The closest locked coach and how to get him, for the home-screen nudge. Picks the
 * locked coach needing the fewest additional difficulty-clears (goal-gradient: the
 * one-clear-away coach pulls hardest); catalog order breaks ties. */
export function nextCoachNudge(
  progress: Record<Difficulty, LadderClass | null>,
  owned: ReadonlySet<string>
): { coach: CoachProfile; hint: string } | null {
  let best: { coach: CoachProfile; needed: number; cls: LadderClass } | null = null;
  for (const c of COACHES) {
    if (owned.has(c.id) || isCoachUnlocked(c.unlock, progress)) continue;
    let cls: LadderClass | null = null;
    let needed = 0;
    if (c.unlock.kind === 'opener') {
      cls = prevClass(c.unlock.forClass);
      if (cls == null) continue;
      needed = 1 - clearedDifficulties(cls, progress);
    } else if (c.unlock.kind === 'ladder') {
      cls = c.unlock.forClass;
      needed = c.unlock.rank - clearedDifficulties(cls, progress);
    }
    if (cls == null || needed <= 0) continue;
    if (!best || needed < best.needed) best = { coach: c, needed, cls };
  }
  if (!best) return null;
  const times = best.needed === 1 ? '1 more difficulty' : `${best.needed} more difficulties`;
  return {
    coach: best.coach,
    hint: `Clear ${best.cls} on ${times} to sign ${best.coach.name}`,
  };
}

/** A short human-readable unlock condition for the collection UI's locked coaches. */
export function coachUnlockLabel(unlock: CoachUnlock): string {
  switch (unlock.kind) {
    case 'starter':
      return 'Starting coach';
    case 'opener': {
      const prev = prevClass(unlock.forClass);
      return prev ? `First clear of ${prev}-Class` : 'Starting coach';
    }
    case 'ladder':
      return unlock.rank <= 1
        ? `Clear ${unlock.forClass}-Class`
        : `Clear ${unlock.forClass}-Class on ${unlock.rank} difficulties`;
  }
}

/** A coach's tendency chip: a stable category `key` (so two chips never collide as
 * React keys, even when their labels match) plus the display `label`. */
export interface CoachTag {
  key: 'pace' | 'focus' | 'rotation' | 'usage';
  label: string;
}

function paceLabel(p: CoachProfile['prefPace']): string {
  if (p === 'auto') return 'Adapts';
  return p === 'fast' ? 'Fast' : p === 'slow' ? 'Slow' : 'Even pace';
}

function focusLabel(f: CoachProfile['prefFocus']): string {
  if (f === 'auto') return 'Reads roster';
  if (f === 'inside') return 'Inside';
  if (f === 'outside') return 'Outside';
  if (f === 'lockdown') return 'Lockdown';
  return 'Versatile';
}

const ROTATION_LABEL: Record<number, string> = { 8: 'Short bench', 9: 'Standard', 10: 'Deep bench' };

const USAGE_LABEL: Record<CoachProfile['usage'], string> = {
  star: 'Star-led',
  egalitarian: 'Egalitarian',
  balanced: 'Balanced share',
};

/**
 * The four tendency chips shown on a coach's collection card. Labels are pairwise
 * distinct across the categories (balanced pace reads "Even pace", balanced focus
 * "Versatile"), so a card never renders two identical chips and the per-category keys
 * never collide.
 */
export function coachTags(coach: CoachProfile): CoachTag[] {
  return [
    { key: 'pace', label: paceLabel(coach.prefPace) },
    { key: 'focus', label: focusLabel(coach.prefFocus) },
    { key: 'rotation', label: ROTATION_LABEL[coach.rotation] },
    { key: 'usage', label: USAGE_LABEL[coach.usage] },
  ];
}

// --- Sim-shaping (consumed by run-machine's buildHomeTeam) ---

/** Defensive floor at/above which a five can credibly run a lockdown plan without
 * it becoming a pure self-tax (the 6-20 band average is ~13). */
const CAN_DEFEND_FLOOR = 13;

function meanDefense(five: RosterPlayer[]): number {
  if (five.length === 0) return 0;
  const sum = five.reduce(
    (acc, rp) => acc + (rp.player.stats.perimeterD + rp.player.stats.interiorD) / 2,
    0
  );
  return sum / five.length;
}

/** Index (0..4) of the highest position-weighted overall among the five. */
function bestStarterIndex(five: RosterPlayer[]): number {
  let best = 0;
  let bestVal = -Infinity;
  five.forEach((rp, i) => {
    const v = ovrRaw(rp.player.stats, rp.position);
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

/**
 * Overlay a coach's preferences onto the roster-derived game plan. The starter
 * defers everything (a true no-op), so a fresh-save game is identical to today.
 * A coach forcing `lockdown` onto a five that cannot defend falls back, so a coach
 * never imposes a pure self-tax.
 */
export function planForCoach(base: GamePlan, coach: CoachStyle, dressed: Roster): GamePlan {
  const pace: Pace = coach.prefPace === 'auto' ? base.pace : coach.prefPace;
  let focus: Focus = coach.prefFocus === 'auto' ? base.focus : coach.prefFocus;
  if (coach.prefFocus === 'lockdown' && meanDefense(dressed.starters) < CAN_DEFEND_FLOOR) {
    focus = base.focus;
  }
  // 'star' features the best player; 'egalitarian' forces an even share; 'balanced'
  // defers to the roster-derived plan (which never features a star today, so it reads
  // the same as egalitarian for now, but stays correct if planForRoster ever does).
  let starPlayerIndex = base.starPlayerIndex;
  if (coach.usage === 'star') starPlayerIndex = bestStarterIndex(dressed.starters);
  else if (coach.usage === 'egalitarian') starPlayerIndex = null;
  return { pace, focus, starPlayerIndex };
}

/**
 * The substitution policy a coach runs. The thresholds are the sim's own rotation
 * tunables made coach-driven; `maxPlayers` caps how many distinct players take the
 * floor (starters + bench). Short rotations keep starters on longer (more usage and
 * impact, more fatigue and injury load); deep rotations spread minutes (fresher in
 * crunch, diluted stars).
 */
export interface RotationPolicy {
  hardFloor: number;
  subOutEnergy: number;
  subInEnergy: number;
  subOutGoodEnough: number;
  maxPlayers: number;
}

/** The sim's historical rotation behavior: standard thresholds, no player cap.
 * Used by every opponent and by a no-coach (or rotation-9) home side, so those
 * games stay byte-identical to before coaches existed. */
export const DEFAULT_ROTATION: RotationPolicy = {
  hardFloor: 28,
  subOutEnergy: 50,
  subInEnergy: 72,
  subOutGoodEnough: 0.9,
  maxPlayers: 99,
};

/** Map a coach's rotation depth to a substitution policy. Rotation 9 (and the
 * starter / no coach) is the uncapped default; 8 tightens, 10 deepens. */
export function rotationForCoach(coach: CoachStyle | null | undefined): RotationPolicy {
  if (!coach || coach.rotation === 9) return DEFAULT_ROTATION;
  if (coach.rotation === 8) {
    return { hardFloor: 24, subOutEnergy: 42, subInEnergy: 78, subOutGoodEnough: 0.96, maxPlayers: 8 };
  }
  return { hardFloor: 32, subOutEnergy: 58, subInEnergy: 66, subOutGoodEnough: 0.82, maxPlayers: 10 };
}

/**
 * The conditional system bonus: a small TeamModifier fragment applied only when the
 * five (under the coached plan) classifies as one of the coach's `system`
 * archetypes. Reuses the TeamModifier.extra channel that counterDelta rides, so it
 * folds in once at the clamp site and survives substitutions. Returns {} (no-op)
 * for a neutral coach or a non-matching roster.
 */
export function coachSystemModifier(
  five: RosterPlayer[],
  plan: GamePlan,
  coach: CoachProfile
): Partial<TeamModifier> {
  if (coach.system.length === 0) return {};
  const archetype = deriveArchetypeFromFive(five, plan);
  if (!coach.system.includes(archetype)) return {};
  return { extra: { ...coach.systemBonus }, labels: [`${coach.name} System`] };
}
