import { describe, it, expect } from 'vitest';
import {
  BOUNTIES,
  GRANDMASTER_KEY,
  bountyFor,
  bountyKey,
  rewardPower,
} from '@/game/bounties';
import { DIFFICULTIES, LADDER_CLASSES } from '@/game/difficulty-mode';
import { PLAYER_GACHA_TIERS } from '@/game/player-gacha';
import { RARITY_ORDER } from '@/game/rarity';

describe('championship bounties table', () => {
  it('has exactly one bounty per (difficulty x ladder class) cell', () => {
    const keys = DIFFICULTIES.flatMap((d) => LADDER_CLASSES.map((cls) => bountyKey(d, cls)));
    expect(keys).toHaveLength(20);
    expect(Object.keys(BOUNTIES).sort()).toEqual([...keys].sort());
    for (const d of DIFFICULTIES) {
      for (const cls of LADDER_CLASSES) {
        const b = bountyFor(d, cls);
        expect(b).toBeDefined();
        expect(typeof b.label).toBe('string');
        expect(b.label.length).toBeGreaterThan(0);
        expect(typeof b.blurb).toBe('string');
      }
    }
  });

  it('every reward references a valid tier / rarity / amount', () => {
    for (const b of Object.values(BOUNTIES)) {
      const r = b.reward;
      switch (r.kind) {
        case 'coins':
          expect(r.amount).toBeGreaterThan(0);
          break;
        case 'player':
          expect(PLAYER_GACHA_TIERS).toContain(r.tier);
          break;
        case 'ability':
          expect(RARITY_ORDER).toContain(r.rarity);
          break;
        case 'crest':
          if (r.coins !== undefined) expect(r.coins).toBeGreaterThan(0);
          break;
        default:
          throw new Error(`unexpected reward kind: ${JSON.stringify(r)}`);
      }
    }
  });

  it('never pays a same-class cell LESS as difficulty rises (the key design invariant)', () => {
    // Reward value must be non-decreasing DOWN each column, so climbing to a harder
    // difficulty is always at least as rewarding for the same rung.
    for (const cls of LADDER_CLASSES) {
      const powers = DIFFICULTIES.map((d) => rewardPower(bountyFor(d, cls).reward));
      for (let i = 1; i < powers.length; i++) {
        expect(powers[i]).toBeGreaterThanOrEqual(powers[i - 1]);
      }
    }
  });

  it('concentrates the exclusives (S players, legends, legendary abilities) in hard/insane', () => {
    const exclusive = (key: string) => {
      const r = BOUNTIES[key].reward;
      return (
        (r.kind === 'player' && (r.tier === 'S' || r.tier === 'legendary')) ||
        (r.kind === 'ability' && r.rarity === 'legendary') ||
        r.kind === 'crest'
      );
    };
    const easyExclusives = LADDER_CLASSES.filter((cls) => exclusive(bountyKey('easy', cls)));
    expect(easyExclusives).toHaveLength(0); // easy never hands out a headline exclusive
    // The apex cell is the Grandmaster capstone.
    expect(GRANDMASTER_KEY).toBe(bountyKey('insane', 'S+'));
    expect(BOUNTIES[GRANDMASTER_KEY].reward.kind).toBe('crest');
  });
});
