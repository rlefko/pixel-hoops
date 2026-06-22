import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed } from '@/game/rng';
import { generateOpponentTeam } from '@/game/tournament';
import { previewOpponent } from '@/game/opponent-preview';

/**
 * The map preview must field the same franchise the game actually builds, so the
 * tile color/badge never lie. enterGame builds opponents with
 * createRNG(deriveSeed(seed, `opp-${nodeId}`)); the preview reuses that exactly.
 */
describe('previewOpponent', () => {
  it('matches the franchise generateOpponentTeam picks for the same node', () => {
    const seed = 'run-xyz';
    for (const nodeId of ['n-0-0', 'n-2-1', 'n-4-2', 'n-6-0']) {
      const round = 3;
      const real = generateOpponentTeam(
        round,
        createRNG(deriveSeed(seed, `opp-${nodeId}`))
      );
      const preview = previewOpponent(seed, nodeId);
      expect(real.colorHex).toBe(preview.primaryHex);
      expect(real.accentHex).toBe(preview.secondaryHex);
      expect(real.name).toBe(`${preview.city} ${preview.name}`);
    }
  });

  it('is deterministic per seed + node', () => {
    expect(previewOpponent('s', 'n-1-0')).toEqual(previewOpponent('s', 'n-1-0'));
  });
});
