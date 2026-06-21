import type { QuarterResult } from '@/types/game-state';
import type { CardId } from '@/types/card';
import { CARD_DEFS } from '@/constants/cards';

// ---------------------------------------------------------------------------
// Points awarded per offensive card on success
// ---------------------------------------------------------------------------

/**
 * Base points for a card on a successful play. Reads from CARD_DEFS so the card
 * catalog stays the single source of truth: add a card there and scoring follows.
 */
export function getPointsForCard(cardId: CardId): number {
    return CARD_DEFS[cardId].pointsOnSuccess;
}

// ---------------------------------------------------------------------------
// Quarter result — outcome label from resolution data
// ---------------------------------------------------------------------------

/**
 * Derive the QuarterResult for a resolved possession. The label depends on BOTH
 * the attacking card and the defending card: the same miss reads as a block
 * against zone defense but a turnover against a pressure trap, so callers must
 * pass the defender's card to get the correct arcade callout.
 */
export function resolveOutcomeLabel(
    attackCard: CardId,
    defenseCard: CardId,
    succeeded: boolean,
): QuarterResult {
    if (succeeded) {
        return attackCard === 'and-one' ? 'and-one' : 'score';
    }

    // Failed attack — the defender's card decides how the failure reads.
    switch (defenseCard) {
        case 'zone-defense':
            // Zone walls off the rim — failed drives and shots read as blocks.
            return 'block';
        case 'pressure-trap':
            // Pressure traps strip ball-handlers: drives/passes become turnovers,
            // jumpers just clank off the rim.
            return attackCard === 'crossover' || attackCard === 'behind-back'
                ? 'turnover'
                : 'miss';
        default:
            return 'miss';
    }
}

// ---------------------------------------------------------------------------
// Opponent points from a failed defensive play
// ---------------------------------------------------------------------------

/**
 * Adjust an opponent's earned points based on how the player defended, and label
 * the possession for the arcade callout.
 *
 * Stopping them (defense succeeded) yields 0 points, but the callout depends on
 * the card: a pressure trap reads as a STEAL, a zone as a TURNOVER, anything else
 * as a BLOCK. Getting beaten yields points; a beaten pressure trap leaks an extra
 * easy bucket (+1) because gambling for the steal left the lane wide open.
 */
export function applyDefensiveAdjustments(
    opponentPoints: number,
    playerCard: CardId,
    playerSucceeded: boolean,
): { adjustedPoints: number; result: QuarterResult } {
    if (playerSucceeded) {
        switch (playerCard) {
            case 'pressure-trap':
                return { adjustedPoints: 0, result: 'steal' };
            case 'zone-defense':
                return { adjustedPoints: 0, result: 'turnover' };
            default:
                return { adjustedPoints: 0, result: 'block' };
        }
    }

    // Player's defense was beaten — opponent scores what they earned.
    if (playerCard === 'pressure-trap') {
        // Gambling for the steal and losing leaves an open lane: +1 easy bucket.
        return { adjustedPoints: opponentPoints + 1, result: 'score' };
    }

    return { adjustedPoints: opponentPoints, result: 'score' };
}
