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

  it('a low-IQ coach ignores a subtle, non-obvious edge a smart coach would catch', () => {
    const starters = fiveAt(12, 'me');
    const bench = [flatPlayer('Slight', 'PG', 13)]; // +1 only: below the "obvious" gap of 2
    const args = { roster: { starters, bench }, opponent, buildHome, minDelta: 0.05 };
    const dumb = recommendLineup({ ...args, coach: getCoach('george-karl') }); // iq 8
    const smart = recommendLineup({ ...args, coach: getCoach('steve-kerr') }); // iq 16
    expect(dumb).toBeNull();
    expect(smart).not.toBeNull();
  });

  it('reorders the WHOLE roster (multiple slots) for a smart coach', () => {
    // A weak five with a strong, deep bench: a high-IQ coach pulls several upgrades
    // into the lineup at once, not a single swap.
    const roster: Roster = {
      starters: fiveAt(8, 'weak'),
      bench: [
        flatPlayer('S1', 'PG', 18),
        flatPlayer('S2', 'SG', 18),
        flatPlayer('S3', 'C', 18),
      ],
    };
    const rec = recommendLineup({
      roster,
      coach: getCoach('gregg-popovich'), // iq 19 (deep search)
      opponent,
      buildHome,
      minDelta: recMinDelta('hard', 'game'),
    });
    expect(rec).not.toBeNull();
    expect(rec!.changes).toBeGreaterThan(1);
  });

  it('a low-IQ coach makes at most one blunt change', () => {
    const roster: Roster = {
      starters: fiveAt(10, 'weak'),
      bench: [flatPlayer('S1', 'PG', 16), flatPlayer('S2', 'SG', 16)],
    };
    const rec = recommendLineup({
      roster,
      coach: getCoach('george-karl'), // iq 8 (one move only)
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
