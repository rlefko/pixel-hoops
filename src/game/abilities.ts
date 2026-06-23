import type { StatDelta, SimHook, TeamModifier } from './effects';

/**
 * Signature abilities for the Legendary (real NBA) players. Each bends one rule
 * the way the real player did. Three contribution channels, all optional:
 *  - selfDelta: a flat self-buff, baked into the player's own stats by
 *    effectivePlayers (apply-effects.ts).
 *  - teamAura: a flat TeamModifier fragment contributed to the player's team.
 *  - hooks: conditional sim-time rule-benders contributed to the team modifier.
 *
 * Most legends are felt through their re-rated 10-stat line; the ability is the
 * extra "that's why he's a legend" spike. Magnitudes sit at the top of the
 * synergy band (1.0-1.5 rating points) per the balance anchor (+1 ~ +6.4% make).
 */
export interface Ability {
  id: string;
  /** Display name for the gold nameplate / scout line. */
  name: string;
  /** One-line "rule bent" description. */
  blurb: string;
  selfDelta?: StatDelta;
  teamAura?: Partial<TeamModifier>;
  hooks?: SimHook[];
}

export const ABILITIES: Record<string, Ability> = {
  flu_game: {
    id: 'flu_game',
    name: 'Flu Game',
    blurb: 'Takes over the fourth quarter: +3 to scoring and perimeter D.',
    hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { inside: 3, outside: 3, perimeterD: 3 } }],
  },
  mamba: {
    id: 'mamba',
    name: 'Mamba Mentality',
    blurb: 'A pure scorer who rises in crunch time: +2 outside, +2 clutch in Q4.',
    selfDelta: { outside: 1 },
    hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { outside: 2, clutch: 2 } }],
  },
  dame_time: {
    id: 'dame_time',
    name: 'Dame Time',
    blurb: 'Logo-range daggers when it matters: +3 outside in the fourth.',
    hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { outside: 3 } }],
  },
  cold_blooded: {
    id: 'cold_blooded',
    name: 'Cold Blooded',
    blurb: 'Never rattled: +1 outside, +1 clutch.',
    selfDelta: { outside: 1, clutch: 1 },
  },
  sky_hook: {
    id: 'sky_hook',
    name: 'Skyhook',
    blurb: 'An unblockable signature: +1 inside.',
    selfDelta: { inside: 1 },
  },
  rim_wall: {
    id: 'rim_wall',
    name: 'The Wall',
    blurb: 'Anchors the paint: +1 interior D, and caps the opponent\'s finishing.',
    selfDelta: { interiorD: 1 },
    hooks: [{ kind: 'opponentRatingMult', stat: 'inside', mult: 0.8, when: 'defense' }],
  },
  diesel: {
    id: 'diesel',
    name: 'Diesel',
    blurb: 'Unstoppable in the post: halves your interior D unless you double-team.',
    hooks: [{ kind: 'opponentRatingMult', stat: 'interiorD', mult: 0.5, when: 'offense', unlessDoubled: true }],
  },
  crossover: {
    id: 'crossover',
    name: 'Killer Crossover',
    blurb: 'Breaks ankles off the bounce: +1 playmaking, +1 athleticism.',
    selfDelta: { playmaking: 1, athleticism: 1 },
  },
  glove: {
    id: 'glove',
    name: 'The Glove',
    blurb: 'Smothers the wing: +1 perimeter D, and cools the opponent\'s shooting.',
    selfDelta: { perimeterD: 1 },
    hooks: [{ kind: 'opponentRatingMult', stat: 'outside', mult: 0.85, when: 'defense' }],
  },
  chosen_one: {
    id: 'chosen_one',
    name: 'The Chosen One',
    blurb: 'Lifts the whole team on both ends.',
    teamAura: { offenseBonus: 1, defenseBonus: 0.5, labels: ['The Chosen One'] },
  },
  gravity: {
    id: 'gravity',
    name: 'Gravity',
    blurb: 'Bends the defense: +1 team offense, and pulls help off the rim.',
    teamAura: { offenseBonus: 1, labels: ['Gravity'] },
    hooks: [{ kind: 'opponentRatingMult', stat: 'interiorD', mult: 0.85, when: 'offense' }],
  },
  unguardable: {
    id: 'unguardable',
    name: 'Unguardable',
    blurb: 'Shoots over anyone: +1 outside.',
    selfDelta: { outside: 1 },
  },
  greek_freak: {
    id: 'greek_freak',
    name: 'Freak Athlete',
    blurb: 'Devastating in space: +1 athleticism, and +1 clutch when you run.',
    selfDelta: { athleticism: 1 },
    hooks: [{ kind: 'paceClutch', minPace: 8, clutchAdd: 1 }],
  },
  point_center: {
    id: 'point_center',
    name: 'Point Center',
    blurb: 'A big who runs the offense: +1 playmaking, +1 team offense.',
    selfDelta: { playmaking: 1 },
    teamAura: { offenseBonus: 1, labels: ['Point Center'] },
  },
  step_back: {
    id: 'step_back',
    name: 'Step Back',
    blurb: 'Creates his own shot: +1 outside, +1 IQ.',
    selfDelta: { outside: 1, iq: 1 },
  },
  showtime: {
    id: 'showtime',
    name: 'Showtime',
    blurb: 'Ignites the break: +1.5 pace and a team offense lift.',
    teamAura: { paceBonus: 1.5, offenseBonus: 0.5, labels: ['Showtime'] },
  },
  playoff_jimmy: {
    id: 'playoff_jimmy',
    name: 'Playoff Jimmy',
    blurb: 'Another gear in the fourth: +2 perimeter D, +2 clutch in Q4.',
    hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { perimeterD: 2, clutch: 2 } }],
  },
  vinsanity: {
    id: 'vinsanity',
    name: 'Vinsanity',
    blurb: 'Plays above the rim: +1 athleticism, +1 outside.',
    selfDelta: { athleticism: 1, outside: 1 },
  },
  mailman: {
    id: 'mailman',
    name: 'The Mailman',
    blurb: 'Always delivers: +1 inside, +1 clutch.',
    selfDelta: { inside: 1, clutch: 1 },
  },
};

/** Look up an ability by id (undefined for non-legends or unknown ids). */
export function getAbility(id?: string): Ability | undefined {
  return id ? ABILITIES[id] : undefined;
}
