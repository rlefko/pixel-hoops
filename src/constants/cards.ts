import type { CardCategory, CardId, OffensiveCardId } from '@/types/card';

// ---------------------------------------------------------------------------
// Card definitions — single source of truth
// ---------------------------------------------------------------------------

interface RawCardDef {
   /** Unique ID matching the key in CARD_DEFS — required to construct GameCard. */
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

/** All 12 card definitions keyed by their unique ID. */
export const CARD_DEFS: Record<CardId, RawCardDef> = {
    'three-pointer': {
        displayName: 'Three Pointer',
        shortName: '3-PT',
        category: 'offense',
        pointsOnSuccess: 3,
        energyCost: 0,
        description: 'Long-range shot. High risk, high reward.',
         id: 'three-pointer' as CardId,
     },
     'bank-shot': {
        displayName: 'Bank Shot',
        shortName: 'BANK',
        category: 'offense',
        pointsOnSuccess: 2,
        energyCost: 0,
        description: 'Off the backboard for a safer shot.',
         id: 'bank-shot' as CardId,
     },
     'step-back': {
        displayName: 'Step Back',
        shortName: 'STEP',
        category: 'offense',
        pointsOnSuccess: 2,
        energyCost: 0,
        description: 'Create space with a step-back jumper.',
         id: 'step-back' as CardId,
     },
     'crossover': {
        displayName: 'Crossover Drive',
        shortName: 'CROSS',
        category: 'offense',
        pointsOnSuccess: 2,
        energyCost: 0,
        description: 'Blitz past defenders with a crossover.',
         id: 'crossover' as CardId,
     },
     'behind-back': {
        displayName: 'Behind-Back Pass',
        shortName: 'BB-PASS',
        category: 'offense',
        pointsOnSuccess: 1,
        energyCost: 0,
        description: 'No-look dime for an open layup.',
         id: 'behind-back' as CardId,
     },
     'alley-oop': {
        displayName: 'Alley Oop',
        shortName: 'ALLEY',
        category: 'offense',
        pointsOnSuccess: 2,
        energyCost: 3,
        description: 'Throw it up and finish! Costs 3 energy.',
         id: 'alley-oop' as CardId,
     },
     'poster-dunk': {
        displayName: 'Poster Dunk',
        shortName: 'DUNK',
        category: 'offense',
        pointsOnSuccess: 2,
        energyCost: 3,
        description: 'Hang on the rim for the poster. Costs 3 energy.',
         id: 'poster-dunk' as CardId,
     },
     'zone-defense': {
        displayName: 'Zone Defense',
        shortName: 'ZONE',
        category: 'defense',
        pointsOnSuccess: 0,
        energyCost: 0,
        description: 'Tight zone. Win the Ath comparison = their turnover.',
         id: 'zone-defense' as CardId,
     },
     'pressure-trap': {
        displayName: 'Pressure Trap',
        shortName: 'PRESS',
        category: 'defense',
        pointsOnSuccess: 0,
        energyCost: 0,
        description: 'Full-court pressure. High risk steal attempt.',
         id: 'pressure-trap' as CardId,
     },
     'timeout': {
        displayName: 'Timeout',
        shortName: 'TMO',
        category: 'special',
        pointsOnSuccess: 0,
        energyCost: 0,
        description: 'Reroll your hand for the next quarter.',
         id: 'timeout' as CardId,
     },
     'hustle-play': {
        displayName: 'Hustle Play',
        shortName: 'HUSTLE',
        category: 'special',
        pointsOnSuccess: 0,
        energyCost: 1,
        description: 'Sacrifice 1 energy for a +2 stat bonus this quarter.',
         id: 'hustle-play' as CardId,
     },
     'and-one': {
        displayName: 'And-One',
        shortName: 'AND-1',
        category: 'special',
        pointsOnSuccess: 1,
        energyCost: 0,
        description: 'Carries momentum. Auto-point at start of next quarter.',
         id: 'and-one' as CardId,
     },
};

/** Return an array of every card definition in the game. */
export function getAllCardDefs(): RawCardDef[] {
    return Object.values(CARD_DEFS);
}

// ---------------------------------------------------------------------------
// Archetype deck templates
// ---------------------------------------------------------------------------

interface DeckTemplate {
     /** [card-id, count] pairs for offensive cards */
    offense: [string, number][];
    defense: [string, number][];
    special: [string, number][];
}

const TEMPLATES: Record<string, DeckTemplate> = {
     'point-guard': {
        offense: [['crossover', 6], ['behind-back', 3], ['step-back', 2]],
        defense: [['zone-defense', 4], ['pressure-trap', 3]],
        special: [['timeout', 1], ['hustle-play', 2]],
     },
     'shooting-guard': {
        offense: [['three-pointer', 5], ['bank-shot', 4], ['step-back', 2]],
        defense: [['zone-defense', 5], ['pressure-trap', 2]],
        special: [['timeout', 1], ['and-one', 2]],
     },
     'small-forward': {
        offense: [['three-pointer', 3], ['crossover', 3], ['alley-oop', 3]],
        defense: [['zone-defense', 4], ['pressure-trap', 2]],
        special: [['timeout', 1], ['hustle-play', 1], ['and-one', 1]],
     },
     'power-forward': {
        offense: [['alley-oop', 5], ['poster-dunk', 4], ['bank-shot', 2]],
        defense: [['zone-defense', 5], ['pressure-trap', 2]],
        special: [['timeout', 1], ['hustle-play', 2]],
     },
     'center': {
        offense: [['alley-oop', 4], ['poster-dunk', 5], ['bank-shot', 2]],
        defense: [['zone-defense', 6], ['pressure-trap', 2]],
        special: [['timeout', 1], ['and-one', 2]],
     },
};

/** Deck template for a given player archetype. */
export function getArchetypeTemplate(archetype: string): DeckTemplate {
    return TEMPLATES[archetype];
}

// ---------------------------------------------------------------------------
// Archetype-specific offensive card availability (for UI filtering)
// ---------------------------------------------------------------------------

const OFFENSIVE_PREFS: Record<string, OffensiveCardId[]> = {
     'point-guard': ['crossover', 'behind-back', 'step-back'],
     'shooting-guard': ['three-pointer', 'bank-shot', 'step-back'],
     'small-forward': ['three-pointer', 'crossover', 'alley-oop'],
     'power-forward': ['alley-oop', 'poster-dunk', 'bank-shot'],
     'center': ['alley-oop', 'poster-dunk', 'bank-shot'],
};

/** Offensive card IDs available to a given archetype. */
export function getArchetypeOffensiveCards(archetype: string): string[] {
    return OFFENSIVE_PREFS[archetype] ?? [];
}
