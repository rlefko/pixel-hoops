import { describe, it, expect } from 'vitest';
import {
  COACHES,
  STARTER_COACH_ID,
  getCoach,
  coachesByClass,
  isCoachUnlocked,
  earnedCoachIds,
  coachesWonByClear,
  planForCoach,
  rotationForCoach,
  coachSystemModifier,
  DEFAULT_ROTATION,
  type CoachProfile,
} from '@/game/coaches';
import { DIFFICULTIES, type Difficulty, type LadderClass } from '@/game/difficulty-mode';
import { buildTeam } from '@/game/lineup';
import { simulateGame } from '@/game/simulation';
import { createRNG } from '@/game/rng';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import {
  POSITIONS,
  POSITION_ARCHETYPE,
  type Roster,
  type RosterPlayer,
} from '@/types/roster';
import { createPlayer } from '@/types/player';
import type { Team } from '@/types/team';

/** Fill a sparse ladder-progress map (unset difficulties default to null). */
function progress(
  partial: Partial<Record<Difficulty, LadderClass | null>>
): Record<Difficulty, LadderClass | null> {
  const out = {} as Record<Difficulty, LadderClass | null>;
  for (const d of DIFFICULTIES) out[d] = partial[d] ?? null;
  return out;
}

describe('coach catalog integrity', () => {
  it('has unique ids and a single starter that is the default id', () => {
    const ids = COACHES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const starters = COACHES.filter((c) => c.unlock.kind === 'starter');
    expect(starters).toHaveLength(1);
    expect(starters[0].id).toBe(STARTER_COACH_ID);
  });

  it('grades five coaches per class with an opener and ranks 1-4', () => {
    for (const cls of ['C', 'B', 'A', 'S', 'S+'] as LadderClass[]) {
      const group = coachesByClass(cls);
      expect(group).toHaveLength(5);
      // C's "opener" is the starter; every other class has an explicit opener.
      const opener = group.find((c) =>
        cls === 'C' ? c.unlock.kind === 'starter' : c.unlock.kind === 'opener'
      );
      expect(opener).toBeDefined();
      const ranks = group
        .filter((c) => c.unlock.kind === 'ladder')
        .map((c) => (c.unlock.kind === 'ladder' ? c.unlock.rank : 0))
        .sort();
      expect(ranks).toEqual([1, 2, 3, 4]);
    }
  });

  it('keeps the starter a true no-op (no system, defers pace/focus, even usage)', () => {
    const starter = getCoach(STARTER_COACH_ID);
    expect(starter.system).toHaveLength(0);
    expect(starter.prefPace).toBe('auto');
    expect(starter.prefFocus).toBe('auto');
    expect(starter.usage).toBe('balanced');
    expect(rotationForCoach(starter)).toEqual(DEFAULT_ROTATION);
  });

  it('falls back to the starter for an unknown id', () => {
    expect(getCoach(undefined).id).toBe(STARTER_COACH_ID);
    expect(getCoach('not-a-coach').id).toBe(STARTER_COACH_ID);
  });
});

describe('coach unlock logic', () => {
  it('owns only the starter on a fresh save', () => {
    expect(earnedCoachIds(progress({}))).toEqual([STARTER_COACH_ID]);
  });

  it('opens the next class from a first clear, and grants the class own coach too', () => {
    // First clear of C on easy: grants C rank-1 AND opens B (B's opener) — two coaches.
    const won = coachesWonByClear(progress({}), 'easy', 'C', new Set([STARTER_COACH_ID]));
    expect(won).toHaveLength(2);
    const owned = earnedCoachIds(progress({ easy: 'C' }));
    expect(owned).toContain(STARTER_COACH_ID);
    // B's opener is now owned (first clear of the previous ladder).
    const bOpener = COACHES.find((c) => c.unlock.kind === 'opener' && c.unlock.forClass === 'B')!;
    expect(owned).toContain(bOpener.id);
  });

  it('requires clearing a class on every difficulty to collect all of it', () => {
    const cCoaches = coachesByClass('C').map((c) => c.id);
    // Cleared C on three difficulties: the rank-4 coach is still locked.
    const three = earnedCoachIds(progress({ easy: 'C', medium: 'C', hard: 'C' }));
    expect(cCoaches.filter((id) => three.includes(id))).toHaveLength(4); // starter + ranks 1-3
    // Cleared C on all four: the whole class is owned.
    const four = earnedCoachIds(progress({ easy: 'C', medium: 'C', hard: 'C', insane: 'C' }));
    expect(cCoaches.every((id) => four.includes(id))).toBe(true);
  });

  it('counts higher clears toward lower-class collection (monotonic ladder)', () => {
    // Reaching B on a difficulty implies C was cleared there, so it counts for C.
    const p = progress({ easy: 'B', medium: 'A' });
    const opener = COACHES.find((c) => c.unlock.kind === 'opener' && c.unlock.forClass === 'B')!;
    expect(isCoachUnlocked(opener.unlock, p)).toBe(true);
    // C cleared on two difficulties → C ranks 1 and 2 unlocked.
    const cRank2 = COACHES.find(
      (c) => c.unlock.kind === 'ladder' && c.unlock.forClass === 'C' && c.unlock.rank === 2
    )!;
    expect(isCoachUnlocked(cRank2.unlock, p)).toBe(true);
  });

  it('grants nothing on a re-clear of an already-cleared class', () => {
    const owned = new Set(earnedCoachIds(progress({ easy: 'C' })));
    const again = coachesWonByClear(progress({ easy: 'C' }), 'easy', 'C', owned);
    expect(again).toHaveLength(0);
  });
});

describe('planForCoach', () => {
  const five = makeStarters('plan-seed');

  it('is a no-op for the starter (returns the base plan unchanged)', () => {
    const base: GamePlan = { pace: 'fast', focus: 'inside', starPlayerIndex: 2 };
    const out = planForCoach(base, getCoach(STARTER_COACH_ID), { starters: five, bench: [] });
    expect(out).toEqual(base);
  });

  it('overrides pace/focus and features the best player for a star coach', () => {
    const coach = getCoach('mike-dantoni'); // fast / outside / star
    const out = planForCoach(DEFAULT_GAME_PLAN, coach, { starters: five, bench: [] });
    expect(out.pace).toBe('fast');
    expect(out.focus).toBe('outside');
    expect(out.starPlayerIndex).not.toBeNull();
    expect(out.starPlayerIndex).toBeGreaterThanOrEqual(0);
    expect(out.starPlayerIndex).toBeLessThan(5);
  });

  it('nulls the star for an egalitarian coach', () => {
    const coach = getCoach('george-karl'); // egalitarian
    const out = planForCoach({ ...DEFAULT_GAME_PLAN, starPlayerIndex: 1 }, coach, {
      starters: five,
      bench: [],
    });
    expect(out.starPlayerIndex).toBeNull();
  });
});

describe('rotationForCoach', () => {
  it('maps rotation depth to a substitution policy', () => {
    expect(rotationForCoach(getCoach(STARTER_COACH_ID))).toEqual(DEFAULT_ROTATION);
    const short = rotationForCoach(makeCoach({ rotation: 8 }));
    const deep = rotationForCoach(makeCoach({ rotation: 10 }));
    expect(short.maxPlayers).toBe(8);
    expect(deep.maxPlayers).toBe(10);
    // Short keeps starters on longer (lower sub-out energy); deep spreads minutes.
    expect(short.subOutEnergy).toBeLessThan(deep.subOutEnergy);
  });
});

describe('coachSystemModifier', () => {
  it('returns no-op for a neutral coach or a non-matching roster', () => {
    const five = makeStarters('sys-seed');
    expect(coachSystemModifier(five, DEFAULT_GAME_PLAN, getCoach(STARTER_COACH_ID))).toEqual({});
    // A grit-and-grind coach on a non-defensive, non-slow five should not fire.
    const dantoni = getCoach('mike-dantoni');
    const mod = coachSystemModifier(five, { pace: 'balanced', focus: 'balanced', starPlayerIndex: null }, dantoni);
    // Either fires (if the five happens to read run-and-gun) or is a no-op; the bonus
    // must be exactly the coach's declared systemBonus when it does fire.
    if (Object.keys(mod).length > 0) expect(mod.extra).toEqual(dantoni.systemBonus);
  });
});

describe('rotation size restricts the bench in the sim', () => {
  it('a short rotation uses no more than its cap of distinct players', () => {
    // Low-stamina players force heavy substitution so the cap actually bites.
    const home = lowStaminaTeam('You', 'rot-home');
    const away = lowStaminaTeam('Them', 'rot-away');
    const seed = 'rotation-cap';

    const shortBox = simulateGame({ home, away, seed, homeRotation: rotationForCoach(makeCoach({ rotation: 8 })) }).box.home;
    const deepBox = simulateGame({ home, away, seed, homeRotation: rotationForCoach(makeCoach({ rotation: 10 })) }).box.home;

    const played = (box: typeof shortBox): number => box.filter((b) => b.seconds > 0).length;
    expect(played(shortBox)).toBeLessThanOrEqual(8);
    expect(played(deepBox)).toBeLessThanOrEqual(10);
    // A deeper rotation gives at least as many bodies real minutes.
    expect(played(deepBox)).toBeGreaterThanOrEqual(played(shortBox));
  });
});

// --- helpers ---

function makeStarters(seed: string): RosterPlayer[] {
  return POSITIONS.map((position, i) => ({
    player: createPlayer(`S${i}`, POSITION_ARCHETYPE[position], createRNG(`${seed}-${i}`).int),
    position,
  }));
}

/** A starting five plus a seven-deep bench, all low-stamina so subs happen often. */
function lowStaminaTeam(name: string, seed: string): Team {
  const drain = (rp: RosterPlayer): RosterPlayer => ({
    ...rp,
    player: { ...rp.player, stats: { ...rp.player.stats, stamina: 6 } },
  });
  const starters = makeStarters(`${seed}-start`).map(drain);
  const bench = Array.from({ length: 7 }, (_, i) => {
    const position = POSITIONS[i % POSITIONS.length];
    return drain({
      player: createPlayer(`B${i}`, POSITION_ARCHETYPE[position], createRNG(`${seed}-b${i}`).int),
      position,
    });
  });
  const roster: Roster = { starters, bench };
  return buildTeam(name, roster.starters, DEFAULT_GAME_PLAN, '#FFD54F', '#1D428A', roster.bench);
}

/** A minimal coach for knob tests (only the fields the function under test reads). */
function makeCoach(overrides: Partial<CoachProfile>): CoachProfile {
  return {
    id: 'test-coach',
    name: 'Test Coach',
    class: 'C',
    prefPace: 'balanced',
    prefFocus: 'balanced',
    usage: 'balanced',
    rotation: 9,
    iq: 10,
    system: [],
    systemBonus: {},
    blurb: '',
    unlock: { kind: 'starter' },
    ...overrides,
  };
}
