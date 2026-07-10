import type { TipId } from '@/game/teach';

/**
 * The seven in-run teach beats' copy, one voice for all of them: one or two
 * short sentences, arcade cadence, strategy-forward, never condescending.
 * `{name}` placeholders interpolate from TeachCallout's copyArgs so numbers
 * always come from game constants, never hardcoded prose.
 */
export type CalloutTip = Extract<
  TipId,
  | 'draftBudget'
  | 'watchDontTap'
  | 'coinsEarned'
  | 'recruitRental'
  | 'boostSynergy'
  | 'lossFraming'
  | 'ladderShape'
  | 'legacyRanks'
  | 'legendSignature'
  | 'provingFloor'
  | 'showcaseCall'
>;

export const TEACH_COPY: Record<CalloutTip, string> = {
  draftBudget: 'Better class, bigger price. Build your best five under {budget} points.',
  watchDontTap: 'Your five plays itself. You already made the calls.',
  coinsEarned:
    'Coins bank the moment you earn them. Spend them between runs in the Locker Room and Arcade.',
  recruitRental:
    'Recruits sign for this run. Clear it to keep them, and un-owned recruits bank favor, win or lose.',
  boostSynergy: 'Boosts stack for the whole run. A flame tag fits your five. Chase the set.',
  // "are lost", never "go home": everywhere else "home" means the permanent
  // collection ("Recruits carried home."), so "go home" would read as KEPT.
  lossFraming: 'Everything below is banked: coins, favor, ladder. Only run recruits are lost.',
  ladderShape: 'Every difficulty-class cell pays a bounty like this, once. Harder cells pay bigger.',
  legacyRanks:
    'Deep ranks come from careers, not coins. Field a player and win: their legacy opens ranks 4 and 5.',
  legendSignature:
    'Every legend signs the same way: prove their moment, then win a title together. Arm one to draft them on loan.',
  provingFloor:
    'Easy earns his trust; Medium signs him. S contracts bank as copies on MEDIUM and up.',
  showcaseCall:
    'Call the Showcase and the plan bends toward his moment. They key on it, and moments only bank in wins.',
};
