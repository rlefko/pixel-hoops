import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { createPlayer, type Archetype } from '@/types/player';
import { buildTeam } from '@/game/lineup';
import { buildStartingRoster } from '@/game/tournament';
import { simulateGame } from '@/game/simulation';
import { DEFAULT_GAME_PLAN } from '@/types/tactics';
import { POSITIONS, ARCHETYPE_POSITION, type RosterPlayer } from '@/types/roster';

/**
 * A lineup can field two players of the same real position (e.g. two point
 * guards), each in a different court slot. The sim must attribute each scored
 * event to the scorer's SLOT (POSITIONS[index]), not their player position, so
 * the court lights up the right sprite and never renders a man down.
 */
describe('slot-based scorer attribution', () => {
  const rng = createRNG('slot-attr');
  const rp = (name: string, archetype: Archetype): RosterPlayer => ({
    player: createPlayer(name, archetype, rng.int),
    position: ARCHETYPE_POSITION[archetype], // the player's real position
  });

  // Slots 0 and 1 are both point guards (duplicate real position); the court
  // slot is the array index, so slot 1 lines up at the SG spot.
  const starters: RosterPlayer[] = [
    rp('Alpha', 'point-guard'), // slot 0 -> PG
    rp('Bravo', 'point-guard'), // slot 1 -> SG (a point guard playing the two)
    rp('Charlie', 'small-forward'), // slot 2 -> SF
    rp('Delta', 'power-forward'), // slot 3 -> PF
    rp('Echo', 'center'), // slot 4 -> C
  ];

  const home = buildTeam('Dupes', starters, DEFAULT_GAME_PLAN, '#FFD54F', '#1D428A');
  const away = buildTeam(
    'Foes',
    buildStartingRoster(createRNG('foes')).starters,
    DEFAULT_GAME_PLAN,
    '#EF5350',
    '#000000'
  );

  it('attributes each event to the scorer slot, not the player position', () => {
    const result = simulateGame({ home, away, seed: 'attr-seed' });
    let checkedHome = 0;
    for (const e of result.events) {
      expect(POSITIONS).toContain(e.scorerPosition); // always a slot label
      if (e.team !== 'home') continue;
      const slot = starters.findIndex((s) => s.player.name === e.scorerName);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(e.scorerPosition).toBe(POSITIONS[slot]); // the slot, not 'PG' for both
      checkedHome += 1;
    }
    expect(checkedHome).toBeGreaterThan(0);
  });

  it('gives the two point guards distinct slot labels (no man down)', () => {
    const result = simulateGame({ home, away, seed: 'attr-seed-2' });
    const slotOf = new Map<string, string>();
    for (const e of result.events) {
      if (e.team === 'home') slotOf.set(e.scorerName, e.scorerPosition);
    }
    // Alpha (slot 0) reads PG and Bravo (slot 1) reads SG, despite both being PGs.
    if (slotOf.has('Alpha')) expect(slotOf.get('Alpha')).toBe('PG');
    if (slotOf.has('Bravo')) expect(slotOf.get('Bravo')).toBe('SG');
  });
});
