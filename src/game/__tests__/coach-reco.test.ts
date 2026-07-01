import { describe, it, expect } from 'vitest';
import { recommendLineup, reorderForCoach, recMinDelta } from '@/game/coach-reco';
import { buildTeam } from '@/game/lineup';
import { getCoach } from '@/game/coaches';
import { createRNG } from '@/game/rng';
import { DEFAULT_GAME_PLAN } from '@/types/tactics';
import { createPlayer, STAT_KEYS, type PlayerStats } from '@/types/player';
import {
  POSITIONS,
  POSITION_ARCHETYPE,
  type Position,
  type Roster,
  type RosterPlayer,
} from '@/types/roster';
import type { Team } from '@/types/team';

/** A player whose every rating is `value` (so team strength is controllable). */
function flatPlayer(name: string, position: Position, value: number): RosterPlayer {
  const base = createPlayer(name, POSITION_ARCHETYPE[position], createRNG(name).int);
  const stats = { ...base.stats } as PlayerStats;
  for (const k of STAT_KEYS) stats[k] = value;
  return { player: { ...base, stats }, position };
}

function fiveAt(value: number, tag: string): RosterPlayer[] {
  return POSITIONS.map((p, i) => flatPlayer(`${tag}-${p}-${i}`, p, value));
}

/** A player at `base` with specific stats overridden, for shaping a stylistic profile
 * (e.g. a defender vs a scorer) at a controlled overall/class. */
function shaped(
  name: string,
  position: Position,
  base: number,
  over: Partial<PlayerStats>
): RosterPlayer {
  const rp = flatPlayer(name, position, base);
  return { ...rp, player: { ...rp.player, stats: { ...rp.player.stats, ...over } } };
}

/** The injected team builder: a plain team from the candidate's starters + bench. */
const buildHome = (r: Roster): Team =>
  buildTeam('You', r.starters, DEFAULT_GAME_PLAN, '#FFD54F', '#1D428A', r.bench);

const opponent = buildTeam('Them', fiveAt(13, 'opp'), DEFAULT_GAME_PLAN, '#E5484D', '#000');

describe('recommendLineup', () => {
  it('surfaces a swap that clearly upgrades the five', () => {
    const roster: Roster = { starters: fiveAt(8, 'me'), bench: [flatPlayer('Star', 'PG', 18)] };
    const rec = recommendLineup({
      roster,
      coach: getCoach('mike-budenholzer'), // mid IQ
      opponent,
      buildHome,
      minDelta: recMinDelta('hard', 'game'),
    });
    expect(rec).not.toBeNull();
    expect(rec!.starters.some((p) => p.player.name === 'Star')).toBe(true);
    expect(['minor', 'solid', 'big']).toContain(rec!.edge);
  });

  it('stays quiet when no swap clears the threshold (favorable matchup)', () => {
    // Already-strong five, only a weak bench body: no beneficial swap.
    const roster: Roster = { starters: fiveAt(16, 'me'), bench: [flatPlayer('Scrub', 'PG', 7)] };
    const rec = recommendLineup({
      roster,
      coach: getCoach('steve-kerr'),
      opponent,
      buildHome,
      minDelta: recMinDelta('easy', 'game'),
    });
    expect(rec).toBeNull();
  });

  it('returns null with no bench', () => {
    const roster: Roster = { starters: fiveAt(10, 'me'), bench: [] };
    const rec = recommendLineup({
      roster,
      coach: getCoach('steve-kerr'),
      opponent,
      buildHome,
      minDelta: 0.1,
    });
    expect(rec).toBeNull();
  });

  it('a low-IQ coach still flags a glaring upgrade', () => {
    const roster: Roster = { starters: fiveAt(10, 'me'), bench: [flatPlayer('Star', 'PG', 16)] };
    const rec = recommendLineup({
      roster,
      coach: getCoach('george-karl'), // iq 8
      opponent,
      buildHome,
      minDelta: 0.1,
    });
    expect(rec).not.toBeNull();
    expect(rec!.summary).toContain('Star');
  });

  it('scales the number of moves with coach class (bigger coach, bigger reshape)', () => {
    // A weak five (C class) with five strong, higher-class upgrades on the bench.
    const deep = (tag: string): Roster => ({
      starters: fiveAt(10, `${tag}-s`),
      bench: [
        flatPlayer(`${tag}-b0`, 'PG', 16),
        flatPlayer(`${tag}-b1`, 'SG', 16),
        flatPlayer(`${tag}-b2`, 'SF', 16),
        flatPlayer(`${tag}-b3`, 'PF', 16),
        flatPlayer(`${tag}-b4`, 'C', 16),
      ],
    });
    const cCoach = reorderForCoach({ roster: deep('c'), coach: getCoach('george-karl'), buildHome }); // C, budget 1
    const sPlus = reorderForCoach({ roster: deep('s'), coach: getCoach('gregg-popovich'), buildHome }); // S+, budget 5
    expect(cCoach.changes).toBe(1);
    expect(sPlus.changes).toBe(5);
  });

  it('honors the class floor: never benches a higher-class player for a lower-class fit', () => {
    // A high-class scorer starting; a low-class great defender on the bench. A lockdown
    // coach loves the defender's style, but the class floor blocks the downgrade.
    const roster: Roster = {
      starters: [
        flatPlayer('pg', 'PG', 13),
        flatPlayer('sg', 'SG', 13),
        flatPlayer('AceScorer', 'SF', 18), // S class
        flatPlayer('pf', 'PF', 13),
        flatPlayer('c', 'C', 13),
      ],
      bench: [shaped('LowDefender', 'SF', 9, { perimeterD: 14, interiorD: 14 })], // C class
    };
    const { roster: out, changes } = reorderForCoach({
      roster,
      coach: getCoach('erik-spoelstra'), // lockdown
      buildHome,
    });
    expect(changes).toBe(0);
    expect(out.starters.some((p) => p.player.name === 'AceScorer')).toBe(true);
  });

  it('picks the best stylistic fit among same-class players (lockdown -> defender)', () => {
    // Mirror-symmetric defender vs scorer at the same slot/overall (so same class). A
    // lockdown coach starts the defender; the choice is style, not raw overall.
    const starterScorer = shaped('Scorer', 'SF', 13, {
      perimeterD: 8,
      interiorD: 8,
      outside: 18,
      inside: 18,
    });
    const benchDefender = shaped('Defender', 'SF', 13, {
      perimeterD: 18,
      interiorD: 18,
      outside: 8,
      inside: 8,
    });
    const roster: Roster = {
      starters: [
        flatPlayer('pg', 'PG', 13),
        flatPlayer('sg', 'SG', 13),
        starterScorer,
        flatPlayer('pf', 'PF', 13),
        flatPlayer('c', 'C', 13),
      ],
      bench: [benchDefender],
    };
    // Pure style (no opponent), so the choice is style, not the matchup.
    const { roster: out } = reorderForCoach({
      roster,
      coach: getCoach('erik-spoelstra'), // lockdown, S
      buildHome,
    });
    expect(out.starters.some((p) => p.player.name === 'Defender')).toBe(true);
    expect(out.starters.some((p) => p.player.name === 'Scorer')).toBe(false);
  });

  it('values the effective line, not the base (respects in-run training)', () => {
    // Prospect is weak on paper (base 10) but +8 in-run training on every stat makes
    // it effectively elite (~18). The coach must value that, not the base 10.
    const prospect: RosterPlayer = {
      ...flatPlayer('Prospect', 'PG', 10),
      trainingDelta: Object.fromEntries(STAT_KEYS.map((k) => [k, 8])) as Partial<PlayerStats>,
    };
    const roster: Roster = {
      starters: [
        flatPlayer('Vet', 'PG', 14),
        flatPlayer('sg', 'SG', 13),
        flatPlayer('sf', 'SF', 13),
        flatPlayer('pf', 'PF', 13),
        flatPlayer('c', 'C', 13),
      ],
      bench: [prospect],
    };
    const { roster: out, changes } = reorderForCoach({ roster, coach: getCoach('rick-carlisle'), buildHome });
    // Valued at its effective ~18, Prospect starts; on its base 10 it would never be
    // picked over the 13-14 starters.
    expect(out.starters.some((p) => p.player.name === 'Prospect')).toBe(true);
    expect(changes).toBe(1);
  });

  it('keeps the guard/big balance (never discards a ball handler for a center)', () => {
    // A lead ball handler in the five and a strong defensive center on the bench. A
    // lockdown coach loves the center, but it may only take a frontcourt slot, never a
    // guard's, so the backcourt is preserved.
    const pg = shaped('LeadGuard', 'PG', 13, { playmaking: 19, outside: 16, perimeterD: 12 });
    const benchC = shaped('BenchBig', 'C', 13, {
      interiorD: 18,
      inside: 16,
      rebounding: 18,
      blocking: 16,
      playmaking: 6,
    });
    const roster: Roster = {
      starters: [
        pg,
        flatPlayer('sg', 'SG', 13),
        flatPlayer('sf', 'SF', 13),
        flatPlayer('pf', 'PF', 13),
        flatPlayer('c', 'C', 13),
      ],
      bench: [benchC],
    };
    const { roster: out } = reorderForCoach({ roster, coach: getCoach('erik-spoelstra'), buildHome });
    const bigs = out.starters.filter((p) => p.position === 'PF' || p.position === 'C').length;
    expect(out.starters.some((p) => p.player.name === 'BenchBig')).toBe(true); // the center is used
    expect(bigs).toBe(2); // ...but in a frontcourt slot, so the big count is unchanged
    expect(out.starters.some((p) => p.player.name === 'LeadGuard')).toBe(true); // the ball handler stays
  });

  it('a smart coach avoids a style move that tanks the matchup; a blunt one takes it', () => {
    // Both coaches are fast/outside, so they both want this shooter's style. But
    // starting it craters this matchup (the injected builder makes that five far
    // weaker). A high-IQ coach threads the matchup and refuses; a low-IQ coach plays
    // pure style. Same playstyle isolates the IQ-driven threading.
    const styleFit = shaped('StyleFit', 'SG', 13, { outside: 18, athleticism: 18 });
    const roster: Roster = {
      starters: [
        flatPlayer('pg', 'PG', 13),
        flatPlayer('Starter', 'SG', 13),
        flatPlayer('sf', 'SF', 13),
        flatPlayer('pf', 'PF', 13),
        flatPlayer('c', 'C', 13),
      ],
      bench: [styleFit],
    };
    // Control the matchup directly: a five with StyleFit starting scores far worse.
    const tanking = (r: Roster): Team => {
      const starting = r.starters.some((p) => p.player.name === 'StyleFit');
      return buildTeam('You', fiveAt(starting ? 6 : 15, 'ctl'), DEFAULT_GAME_PLAN, '#FFD54F', '#1D428A', r.bench);
    };
    const dumb = reorderForCoach({ roster, coach: getCoach('george-karl'), opponent, buildHome: tanking }); // C, iq 8
    const smart = reorderForCoach({ roster, coach: getCoach('steve-kerr'), opponent, buildHome: tanking }); // S, iq 16
    expect(dumb.changes).toBe(1); // pure style: starts the stylistic fit despite the matchup
    expect(smart.changes).toBe(0); // threads the matchup: refuses the tanking swap
  });

  it('a low-class coach makes at most one blunt change', () => {
    const roster: Roster = {
      starters: fiveAt(10, 'weak'),
      bench: [flatPlayer('S1', 'PG', 16), flatPlayer('S2', 'SG', 16)],
    };
    const rec = recommendLineup({
      roster,
      coach: getCoach('george-karl'), // C class (one move only)
      opponent,
      buildHome,
      minDelta: 0.1,
    });
    expect(rec).not.toBeNull();
    expect(rec!.changes).toBe(1);
  });

  it('orders the bench by rotation priority (best reserve first), even with no opponent', () => {
    const roster: Roster = {
      starters: fiveAt(16, 'me'),
      bench: [flatPlayer('Weak', 'PG', 9), flatPlayer('Strong', 'PG', 14)],
    };
    // No opponent: a pure-style reorder. The five is already strong, so the bench is
    // simply reordered by the coach's rotation priority.
    const { roster: out } = reorderForCoach({ roster, coach: getCoach('nate-mcmillan'), buildHome });
    expect(out.bench[0].player.name).toBe('Strong');
  });
});

describe('reorderForCoach position coherence', () => {
  const isSorted = (five: RosterPlayer[]): boolean => {
    const ranks = five.map((p) => POSITIONS.indexOf(p.position));
    return ranks.every((r, i) => i === 0 || ranks[i - 1] <= r);
  };

  it('slots a swapped-in center into a big slot, never the PG spot', () => {
    const roster: Roster = {
      starters: fiveAt(8, 'weak'), // PG..C, all weak
      bench: [flatPlayer('BigC', 'C', 18)], // a strong center off the bench
    };
    const { roster: out, changes } = reorderForCoach({
      roster,
      coach: getCoach('steve-kerr'),
      opponent,
      buildHome,
    });
    expect(changes).toBe(1); // the center is brought in
    expect(out.starters.some((p) => p.player.name === 'BigC')).toBe(true);
    // The five is in natural PG..C slot order, so the center never sits at the PG slot.
    expect(isSorted(out.starters)).toBe(true);
    expect(out.starters[0].position).not.toBe('C');
    expect(out.starters.findIndex((p) => p.player.name === 'BigC')).toBeGreaterThanOrEqual(3);
  });

  it('re-slots the same five without counting it as a lineup change', () => {
    // A position-scrambled but strong five (center first); the only bench body is weak,
    // so the coach keeps the same players and simply slots them back into order.
    const five = fiveAt(16, 'me');
    const scrambled = [five[4], five[0], five[1], five[2], five[3]]; // C, PG, SG, SF, PF
    const roster: Roster = { starters: scrambled, bench: [flatPlayer('Scrub', 'PG', 7)] };
    const { roster: out, changes } = reorderForCoach({
      roster,
      coach: getCoach('steve-kerr'),
      opponent,
      buildHome,
    });
    expect(changes).toBe(0); // no player swapped in, so the banner stays quiet
    expect(out.starters.map((p) => p.position)).toEqual([...POSITIONS]); // but slots are fixed
  });
});

describe('recMinDelta', () => {
  it('demands a bigger edge on easy than on insane, and less on bosses', () => {
    expect(recMinDelta('easy', 'game')).toBeGreaterThan(recMinDelta('insane', 'game'));
    expect(recMinDelta('hard', 'boss')).toBeLessThan(recMinDelta('hard', 'game'));
    expect(recMinDelta('insane', 'boss')).toBeGreaterThanOrEqual(0.3);
  });
});
