import {
  cellKey,
  DIFFICULTIES,
  LADDER_CLASSES,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';
import type { PlayerGachaTier } from './player-gacha';
import type { Rarity } from './rarity';

/**
 * CHAMPIONSHIP BOUNTIES: a one-time reward on every cell of the (difficulty x ladder
 * class) grid, granted the FIRST time that cell's championship is cleared. The reward
 * scales up-and-to-the-right, with the biggest exclusives (a guaranteed legend, a
 * legendary ability, S-tier stars, a big coin bundle) gated behind hard/insane and the
 * high classes, so climbing a harder difficulty finally pays a headline reward instead
 * of a rounding-error coin bump. One-time-per-cell keeps it non-grindy: you get the full
 * payout on the first clear and never by farming.
 *
 * Pure and data-only (no RNG, no storage). home-roster.ts owns the grant (claimRunBounty)
 * and the persisted claimed set; this module is the single source of truth for the table,
 * reused by the grant, the run-summary reveal, and the selector grid. Crests are NOT
 * tracked here: a cell's crest derives from ladderProgress (so veteran saves show every
 * past-clear crest without any migration), while this grid's material reward fires only on
 * a genuine first clear. See src/game/difficulty-mode.ts and docs/difficulty-rebalance.md.
 */

export type BountyReward =
  | { kind: 'coins'; amount: number }
  /** A guaranteed scout-style draw of a class (routes through the collection copy path, so
   *  an already-owned tier converts to the overflow coin bounty; never a dead reward). */
  | { kind: 'player'; tier: PlayerGachaTier }
  /** A random passive ability of a rarity. */
  | { kind: 'ability'; rarity: Rarity }
  /** The capstone: the crest IS the prize, optionally with a coin bundle alongside it. */
  | { kind: 'crest'; coins?: number };

export interface Bounty {
  reward: BountyReward;
  /** Short reveal headline, e.g. "GUARANTEED S-TIER STAR". */
  label: string;
  blurb: string;
}

/** Stable per-cell key; the persisted claimed set uses exactly this. Delegates to
 * difficulty-mode's cellKey so the bounty table and the cleared-cell set share one
 * key format by construction. */
export function bountyKey(d: Difficulty, cls: LadderClass): string {
  return cellKey(d, cls);
}

/** The apex cell: clearing S+ on insane earns the Grandmaster crest. */
export const GRANDMASTER_KEY = bountyKey('insane', 'S+');

/**
 * The reward per cell, authored as a grid for readability. Non-decreasing in value down
 * each column (a harder difficulty never pays a same-class cell LESS), which the table
 * test enforces. Exclusives cluster bottom-right.
 */
const REWARD_GRID: Record<Difficulty, Record<LadderClass, BountyReward>> = {
  easy: {
    C: { kind: 'coins', amount: 150 },
    B: { kind: 'coins', amount: 300 },
    A: { kind: 'coins', amount: 600 },
    S: { kind: 'ability', rarity: 'rare' },
    'S+': { kind: 'player', tier: 'A' },
  },
  medium: {
    C: { kind: 'coins', amount: 400 },
    B: { kind: 'ability', rarity: 'rare' },
    A: { kind: 'coins', amount: 900 },
    S: { kind: 'player', tier: 'A' },
    'S+': { kind: 'player', tier: 'S' },
  },
  hard: {
    C: { kind: 'coins', amount: 800 },
    B: { kind: 'ability', rarity: 'epic' },
    A: { kind: 'player', tier: 'A' },
    S: { kind: 'ability', rarity: 'epic' },
    'S+': { kind: 'player', tier: 'S' },
  },
  insane: {
    C: { kind: 'player', tier: 'A' },
    B: { kind: 'player', tier: 'S' },
    A: { kind: 'ability', rarity: 'legendary' },
    S: { kind: 'player', tier: 'legendary' },
    'S+': { kind: 'crest', coins: 10000 },
  },
};

const TIER_LABEL: Record<PlayerGachaTier, string> = {
  C: 'C-TIER PLAYER',
  B: 'B-TIER PLAYER',
  A: 'A-TIER STAR',
  S: 'S-TIER STAR',
  legendary: 'ALL-TIME LEGEND',
};

/** Author a cell's reveal headline + blurb from its reward, so the table stays DRY. */
function describeReward(reward: BountyReward): { label: string; blurb: string } {
  switch (reward.kind) {
    case 'coins':
      return { label: `${reward.amount} COINS`, blurb: 'A coin bounty, banked to your wallet.' };
    case 'player':
      return {
        label: `GUARANTEED ${TIER_LABEL[reward.tier]}`,
        blurb: 'A guaranteed scout, signed free for conquering this rung.',
      };
    case 'ability':
      return {
        label: `${reward.rarity.toUpperCase()} ABILITY`,
        blurb: `A random ${reward.rarity} passive ability for your locker.`,
      };
    case 'crest':
      return {
        label: 'GRANDMASTER CREST',
        blurb: reward.coins
          ? `The apex crest, plus a ${reward.coins}-coin bounty. The ladder at its cruelest.`
          : 'The apex crest. The ladder at its cruelest.',
      };
  }
}

/** The 20-cell table, keyed by bountyKey. */
export const BOUNTIES: Record<string, Bounty> = Object.fromEntries(
  DIFFICULTIES.flatMap((d) =>
    LADDER_CLASSES.map((cls) => {
      const reward = REWARD_GRID[d][cls];
      return [bountyKey(d, cls), { reward, ...describeReward(reward) }];
    })
  )
);

/** The bounty for a cell (always defined for a valid difficulty x ladder class). */
export function bountyFor(d: Difficulty, cls: LadderClass): Bounty {
  return BOUNTIES[bountyKey(d, cls)];
}

/** Coin-equivalent value of a reward, for the table's monotonicity guard and any UI
 * sorting. Cross-kind values are approximate (scout/machine prices), enough to catch a
 * mis-typed cell. */
export function rewardPower(reward: BountyReward): number {
  switch (reward.kind) {
    case 'coins':
      return reward.amount;
    case 'ability':
      return { common: 400, rare: 1200, epic: 5200, legendary: 10200 }[reward.rarity];
    case 'player':
      return { C: 300, B: 600, A: 2000, S: 6000, legendary: 12000 }[reward.tier];
    case 'crest':
      return 15000 + (reward.coins ?? 0);
  }
}
