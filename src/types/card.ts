import type { Archetype, PlayerStats } from './player';

// --- Card discriminants ---

/** Offensive cards that attack in your quarter. */
export type OffensiveCardId =
  | 'three-pointer'
  | 'bank-shot'
  | 'step-back'
  | 'crossover'
  | 'behind-back'
  | 'alley-oop'
  | 'poster-dunk';

/** Defensive cards that counter the opponent's attack. */
export type DefensiveCardId = 'zone-defense' | 'pressure-trap';

/** Special cards with one-time-use effects. */
export type SpecialCardId = 'timeout' | 'hustle-play' | 'and-one';

/** All playable card IDs. */
export type CardId = OffensiveCardId | DefensiveCardId | SpecialCardId;

/** Card category for UI colouring and filtering. */
export type CardCategory = 'offense' | 'defense' | 'special';

// --- Stat mapping ---

/**
 * Which stat of the card-holder is used during resolution. Mapped onto the
 * ten-rating model: jump-shot cards use `outside`, handle cards `playmaking`,
 * rim cards `inside`. (The legacy 1v1 card game shares the new ratings; this
 * also sharpens it, since defense now reads perimeter vs interior correctly.)
 */
export const CARD_STAT_MAP: Record<CardId, keyof PlayerStats> = {
  'three-pointer': 'outside',
  'bank-shot': 'outside',
  'step-back': 'outside',
  'crossover': 'playmaking',
  'behind-back': 'playmaking',
  'alley-oop': 'inside',
  'poster-dunk': 'inside',
  'zone-defense': 'interiorD',
  'pressure-trap': 'perimeterD',
  'timeout': 'clutch',
  'hustle-play': 'clutch',
  'and-one': 'inside',
};

/** Opponent's counter-stat keyed by the attacking player's card. */
export const COUNTER_STAT_MAP: Record<CardId, keyof PlayerStats> = {
  'three-pointer': 'perimeterD', // outside shot vs a perimeter contest
  'bank-shot': 'perimeterD',
  'step-back': 'perimeterD',
  'crossover': 'perimeterD', // handle vs on-ball pressure
  'behind-back': 'perimeterD',
  'alley-oop': 'interiorD', // rim attack vs rim protection
  'poster-dunk': 'interiorD',
  'zone-defense': 'interiorD', // our interior anchor vs theirs
  'pressure-trap': 'perimeterD', // our perimeter pressure vs theirs
  'timeout': 'clutch',
  'hustle-play': 'clutch',
  'and-one': 'interiorD',
};

// --- Card definitions ---

export interface CardDef {
  /** Unique ID used for logic and resolution. */
  id: CardId;
  /** Full name shown in logs and detail views. */
  displayName: string;
  /** Short name rendered on the card face (≤6 chars). */
  shortName: string;
  category: CardCategory;
  /** Points scored when this offensive card succeeds. */
  pointsOnSuccess: number;
  /** Energy cost to play (0 for most cards; dunks cost more). */
  energyCost: number;
  /** Brief description shown on hover / long-press. */
  description: string;
}

/** A playable card instance in a deck or hand (card def + unique uuid). */
export interface GameCard extends CardDef {
  /** Stable unique identifier for deck tracking across reshuffles. */
  uuid: string;
}

// --- Archetype card pool mappings ---
/** Which offensive cards each archetype can build into their starting deck. */
export const ARCHETYPE_OFFENSIVE_CARDS: Record<Archetype, OffensiveCardId[]> = {
  'point-guard': ['crossover', 'behind-back', 'step-back'],
  'shooting-guard': ['three-pointer', 'bank-shot', 'step-back'],
  'small-forward': ['three-pointer', 'crossover', 'alley-oop'],
  'power-forward': ['alley-oop', 'poster-dunk', 'bank-shot'],
  'center': ['alley-oop', 'poster-dunk', 'bank-shot'],
};

/** Which defensive cards each archetype can build into their starting deck. */
export const ARCHETYPE_DEFENSIVE_CARDS: Record<Archetype, DefensiveCardId[]> = {
  'point-guard': ['zone-defense', 'pressure-trap'],
  'shooting-guard': ['zone-defense', 'pressure-trap'],
  'small-forward': ['zone-defense', 'pressure-trap'],
  'power-forward': ['zone-defense', 'pressure-trap'],
  'center': ['zone-defense', 'pressure-trap'],
};

/** Which special cards each archetype gets in their starting deck. */
export const ARCHETYPE_SPECIAL_CARDS: Record<Archetype, SpecialCardId[]> = {
  'point-guard': ['timeout', 'hustle-play'],
  'shooting-guard': ['timeout', 'and-one'],
  'small-forward': ['timeout', 'hustle-play'],
  'power-forward': ['timeout', 'hustle-play'],
  'center': ['timeout', 'and-one'],
};
