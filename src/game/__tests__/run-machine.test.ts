import { describe, it, expect } from 'vitest';
import { buildCoachedHomeTeam } from '@/game/run-machine';
import { getCoach } from '@/game/coaches';
import { createPlayer } from '@/types/player';
import { POSITION_ARCHETYPE, POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import { createRNG } from '@/game/rng';

/** A modest ladder-ish player at a position (its exact strength is irrelevant: the
 * legend test only varies the LEGEND between two calls, everything else is held fixed). */
function fillerAt(pos: Position): RosterPlayer {
  const player = createPlayer(`fill-${pos}`, POSITION_ARCHETYPE[pos], createRNG(`f-${pos}`).int);
  return { player, position: pos };
}

/** A strong all-time-great starter, flagged legendary so the build path scales it by ladder. */
function legendAt(pos: Position): RosterPlayer {
  const player = createPlayer(`goat-${pos}`, POSITION_ARCHETYPE[pos], createRNG(`g-${pos}`).int);
  player.stats = {
    ...player.stats,
    inside: 24, outside: 22, playmaking: 22, perimeterD: 22,
    interiorD: 22, athleticism: 22, iq: 22, clutch: 22,
  };
  return { player, position: pos, originalClass: 'S+', legendary: true };
}

const coach = getCoach(); // the no-op starter coach: pure roster-derived plan, no system bonus
const fillers = (POSITIONS.filter((p) => p !== 'SF') as Position[]).map(fillerAt);

describe('buildCoachedHomeTeam: drafted legend ladder scaling', () => {
  it('fields the same drafted legend weaker on a low ladder than on the S+ ladder', () => {
    const roster = { starters: [legendAt('SF'), ...fillers], bench: [] };
    const onC = buildCoachedHomeTeam(roster, coach, [], 'C');
    const onSPlus = buildCoachedHomeTeam(roster, coach, [], 'S+');
    // Only the legend's scaling differs between the two builds, so the S+ team (legend at
    // full power) must out-composite the C team (legend scaled to ~two classes above).
    expect(onC.teamStats.off + onC.teamStats.def).toBeLessThan(
      onSPlus.teamStats.off + onSPlus.teamStats.def
    );
  });

  it('leaves a legend-free roster identical on every ladder', () => {
    const roster = { starters: [fillerAt('SF'), ...fillers], bench: [] };
    const onC = buildCoachedHomeTeam(roster, coach, [], 'C');
    const onSPlus = buildCoachedHomeTeam(roster, coach, [], 'S+');
    expect(onC.teamStats.off).toBe(onSPlus.teamStats.off);
    expect(onC.teamStats.def).toBe(onSPlus.teamStats.def);
  });
});
