import type { QuarterResult } from '@/types/game-state';
import type { CardId } from '@/types/card';

// ---------------------------------------------------------------------------
// Points awarded per offensive card on success
// ---------------------------------------------------------------------------

/** Return base points for an offensive card (if it succeeds). */
export function getPointsForCard(cardId: CardId): number {
    switch (cardId) {
        case 'three-pointer': return 3;
        case 'bank-shot':
        case 'step-back':
        case 'crossover':
        case 'alley-oop':
        case 'poster-dunk': return 2;
        case 'behind-back': return 1;
            // Defensive and special cards don't award points directly
        case 'zone-defense':
        case 'pressure-trap':
        case 'timeout':
        case 'hustle-play':
        case 'and-one': return 0;
    }
}

// ---------------------------------------------------------------------------
// Quarter result — outcome label from resolution data
// ---------------------------------------------------------------------------

/** Derive the QuarterResult string for display purposes. */
export function resolveOutcomeLabel(
    cardId: CardId,
    succeeded: boolean,
): QuarterResult {
    if (cardId === 'and-one' && succeeded) return 'and-one';

    switch (cardId) {
        case 'three-pointer':
        case 'bank-shot':
        case 'step-back':
            return succeeded ? 'score' : 'miss';
        case 'crossover':
            // Drive: success = score, miss could be turnover if pressure trap
            return succeeded ? 'score' : 'turnover';
        case 'behind-back':
            return succeeded ? 'score' : 'miss';
        case 'alley-oop':
        case 'poster-dunk':
            // Dunks: success = score, miss with zone-defense = block
            return succeeded ? 'score' : 'block';
        case 'zone-defense':
        case 'pressure-trap':
            // Defensive cards don't score for the player — handled by resolveOpponentOffense
            return 'turnover';
        default:
            return succeeded ? 'score' : 'miss';
    }
}

// ---------------------------------------------------------------------------
// Opponent points from a failed defensive play
// ---------------------------------------------------------------------------

/**
 * Calculate how many points the opponent scores when they successfully break through defense.
 * The base depends on what card the opponent played (handled by resolveOpponentOffense).
 * This helper just does any post-resolution adjustments.
 */
export function applyDefensiveAdjustments(
    opponentPoints: number,
    playerCard: CardId,
    playerSucceeded: boolean,
): { adjustedPoints: number; result: QuarterResult } {
    if (playerSucceeded) {
        return { adjustedPoints: 0, result: 'turnover' };
    }

    // Player's defense failed — opponent gets the points they earned
    let result: QuarterResult = 'score';

    switch (playerCard) {
        case 'zone-defense':
            // Even on zone failure, it's a controlled bucket
            result = 'score';
            break;
        case 'pressure-trap':
            if (playerSucceeded === false) {
                // Pressure trap beaten → easy layup for opponent
                opponentPoints += 1;
                result = 'score';
            }
            break;
    }

    return { adjustedPoints: opponentPoints, result };
}
