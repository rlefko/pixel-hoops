import { describe, it, expect } from 'vitest';
import { computeSynergy } from '@/game/synergy';
import { poolByClass, realPlayerToRosterPlayer } from '@/game/player-pool';
import type { Position, RosterPlayer } from '@/types/roster';

/** Pins the synergy LABEL STRINGS the draft board's DraftSynergyStrip matches
 * on (a silent rename in synergy.ts would otherwise leave its chips dark). */

function fiveAt(positions: Position[]): RosterPlayer[] {
  const pool = poolByClass('C').map(realPlayerToRosterPlayer);
  return positions.map((pos, i) => ({ ...pool[i % pool.length], position: pos }));
}

describe('synergy labels the draft strip matches on', () => {
  it('emits the exact four label strings', () => {
    expect(computeSynergy(fiveAt(['PG', 'SG', 'SF', 'SF', 'SF'])).labels).toContain(
      'Backcourt Speed'
    );
    expect(computeSynergy(fiveAt(['SF', 'SF', 'SF', 'PF', 'C'])).labels).toContain('Twin Towers');
    expect(computeSynergy(fiveAt(['PG', 'SG', 'SF', 'PF', 'C'])).labels).toContain(
      'Positionless Basketball'
    );
    expect(computeSynergy(fiveAt(['SG', 'SG', 'SG', 'PF', 'SF'])).labels).toContain('Specialists');
  });
});
