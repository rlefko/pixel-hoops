import type { GameCard } from '@/types/card';
import type { Archetype } from '@/types/player';
import { getArchetypeTemplate, getAllCardDefs } from '@/constants/cards';

// ---------------------------------------------------------------------------
// UUID generation (simple but sufficient for a frontend game)
// ---------------------------------------------------------------------------

let uuidCounter = 0;

function generateUuid(): string {
    return `c${++uuidCounter}`;
}

// ---------------------------------------------------------------------------
// Deck construction
// ---------------------------------------------------------------------------

/** Build a starting deck from the archetype template. Returns an array of GameCards. */
export function buildStartingDeck(archetype: Archetype): GameCard[] {
    const template = getArchetypeTemplate(archetype);
    const allDefs = getAllCardDefs();

    const cards: GameCard[] = [];

     // Offensive cards (target ~11 total)
    for (const [cardId, count] of template.offense) {
        for (let i = 0; i < count; i++) {
            const def = allDefs.find(d => d.id === cardId);
            if (!def) continue;
            cards.push({ ...def, uuid: generateUuid() });
         }
     }

     // Defensive cards (target ~7-8 total)
    for (const [cardId, count] of template.defense) {
        for (let i = 0; i < count; i++) {
            const def = allDefs.find(d => d.id === cardId);
            if (!def) continue;
            cards.push({ ...def, uuid: generateUuid() });
         }
     }

     // Special cards (target ~2-3 total)
    for (const [cardId, count] of template.special) {
        for (let i = 0; i < count; i++) {
            const def = allDefs.find(d => d.id === cardId);
            if (!def) continue;
            cards.push({ ...def, uuid: generateUuid() });
         }
     }

     // Shuffle the deck
    return shuffleDeck(cards);
}

/** Fisher-Yates shuffle for a game card array (in-place). */
function shuffleDeck(deck: GameCard[]): GameCard[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
         [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
     }
    return shuffled;
}

// ---------------------------------------------------------------------------
// Card drawing and playing
// ---------------------------------------------------------------------------

/** Draw the opening hand from the deck. Returns { hand, remainingDeck }. */
export function drawOpeningHand(deck: GameCard[], size: number = 4): {
    hand: GameCard[];
    remainingDeck: GameCard[];
} {
    const hand = deck.slice(0, size);
    return {
        hand,
        remainingDeck: deck.slice(size),
     };
}

/** Draw one card from the top of the deck. Returns the drawn card or null if empty. */
export function drawOneCard(deck: GameCard[]): {
    deck: GameCard[];
    card: GameCard | null;
} {
    if (deck.length === 0) return { deck: [], card: null };
    const [card, ...rest] = deck;
    return { deck: rest, card };
}

/** Remove a card from the hand by uuid. Returns the updated hand. */
export function playCard(hand: GameCard[], cardUuid: string): GameCard[] {
    return hand.filter(c => c.uuid !== cardUuid);
}

/** Draw cards to refill the hand after playing (up to HAND_SIZE total). */
export function refillHand(
    deck: GameCard[],
    hand: GameCard[],
    maxSize: number = 4,
): { deck: GameCard[]; hand: GameCard[] } {
    let newDeck = [...deck];
    let newHand = [...hand];

    while (newHand.length < maxSize && newDeck.length > 0) {
        const { card, deck: updatedDeck } = drawOneCard(newDeck);
        if (card) {
            newHand.push(card);
            newDeck = updatedDeck;
         } else {
            break; // Deck is empty — no more cards to draw
         }
     }

    return { deck: newDeck, hand: newHand };
}
