import type { CardId, SpecialCardId } from '@/types/card';
import type { QuarterResult, QuarterOutcome } from '@/types/game-state';

// ---------------------------------------------------------------------------
// Core resolution formula
// ---------------------------------------------------------------------------

/**
  * Calculate base success rate using the concept-doc formula:
  *   stat / (stat + counter_stat) * 100
  *
  * Example: Shooting% (8) vs Block (5) → 8/(8+5)*100 = 61.5%
  */
export function calculateSuccessRate(
    yourStat: number,
    counterStat: number,
): number {
    if (yourStat <= 0 && counterStat <= 0) {
         // Degenerate case — no stats to compare, give a coin flip
        return 50;
     }
    return Math.round((yourStat / (yourStat + counterStat)) * 1_000) / 10;
}

/** Roll against the success rate. Returns true if the play succeeds. */
function roll(successRate: number): boolean {
    const rollValue = Math.random() * 100; // 0-99.99...
    return rollValue < successRate;
}

// ---------------------------------------------------------------------------
// Quarter resolution — offensive cards
// ---------------------------------------------------------------------------

/** Resolve an offensive card against an opponent's defensive card. */
export function resolveOffense(
    yourCard: CardId,
    opponentCard: CardId,
    yourStat: number,
    opponentCounterStat: number,
    yourEnergy: number,
    energyCost: number,
): QuarterOutcome {
    const successRate = calculateSuccessRate(yourStat, opponentCounterStat);

     // Dunks and alley-oops require sufficient energy
    if (energyCost > yourEnergy) {
        return {
            yourCard,
            opponentCard,
            successRate,
            succeeded: false,
            result: 'miss', // Not enough energy to attempt
            pointsAwarded: 0,
            opponentPoints: 0,
         };
     }

    let succeeded = roll(successRate);

    if (succeeded) {
        let points = 0;
        let result: QuarterResult = 'score';

        switch (yourCard) {
            case 'three-pointer':
                 // Shooting% vs opponent athleticism — success scores 3 points
                points = 3;
                result = 'score';
                break;
            case 'bank-shot':
                points = 2;
                result = 'score';
                break;
            case 'step-back':
                 // Step-back has slightly higher variance but still 2 points
                points = roll(successRate + 5) ? 2 : 0;
                if (points === 0) {
                    result = 'miss';
                    succeeded = false;
                 } else {
                    result = 'score';
                 }
                break;
            case 'crossover':
                 // Drive success: points + chance of foul (free throws = +1 bonus)
                points = 2;
                if (roll(successRate - 20)) {
                    points += 1; // Foul called → free throw
                    result = 'score';
                 } else {
                    result = 'score';
                 }
                break;
            case 'behind-back':
                points = 1; // Lower base but assist-style play is reliable
                result = 'score';
                break;
            case 'alley-oop':
            case 'poster-dunk':
                points = 2;
                result = 'score';
                break;
            default:
                result = 'miss';
         }

        return {
            yourCard,
            opponentCard,
            successRate,
            succeeded: true,
            result,
            pointsAwarded: points,
            opponentPoints: 0,
         };
    } else {
         // Offensive play failed — determine the type of failure
        let result: QuarterResult = 'miss';

        switch (opponentCard) {
            case 'zone-defense':
                 // Zone defense prevents easy baskets
                result = 'block';
                break;
            case 'pressure-trap':
                 // Pressure trap causes turnovers on failed drives
                if (yourCard === 'crossover' || yourCard === 'behind-back') {
                    result = 'turnover';
                 } else {
                    result = 'miss';
                 }
                break;
            default:
                result = 'miss'; // Swish attempt missed the rim
         }

        return {
            yourCard,
            opponentCard,
            successRate,
            succeeded: false,
            result,
            pointsAwarded: 0,
            opponentPoints: 0,
         };
     }
}

// ---------------------------------------------------------------------------
// Quarter resolution — defensive cards (when opponent is attacking)
// ---------------------------------------------------------------------------

/** Resolve the opponent's offensive card against your defense. */
export function resolveOpponentOffense(
    theirCard: CardId,
    yourCard: CardId,
    theirStat: number,
    yourCounterStat: number,
): QuarterOutcome {
    const successRate = calculateSuccessRate(theirStat, yourCounterStat);
    let succeeded = roll(successRate);

    if (succeeded) {
        let points = 0;
        let result: QuarterResult = 'score';

        switch (theirCard) {
            case 'three-pointer':
                points = 3;
                break;
            case 'bank-shot':
            case 'step-back':
            case 'crossover':
                points = 2;
                break;
            case 'behind-back':
                points = 1;
                break;
            case 'alley-oop':
            case 'poster-dunk':
                points = 2;
                break;
            default:
                result = 'miss';
         }

        return {
            yourCard,
            opponentCard: theirCard,
            successRate,
            succeeded: true,
            result,
            pointsAwarded: 0, // Opponent scoring doesn't add to our "pointsAwarded"
            opponentPoints: points,
         };
     } else {
        let result: QuarterResult = 'miss';

        switch (yourCard) {
            case 'zone-defense':
                result = 'turnover';
                break;
            case 'pressure-trap':
                result = 'steal';
                break;
            default:
                result = 'block';
         }

        return {
            yourCard,
            opponentCard: theirCard,
            successRate,
            succeeded: false,
            result,
            pointsAwarded: 0,
            opponentPoints: 0,
         };
     }
}

// ---------------------------------------------------------------------------
// Quarter resolution — special cards
// ---------------------------------------------------------------------------

/** Resolve a special card played by the player. */
export function resolveSpecial(
    specialCard: SpecialCardId,
    yourCard?: CardId,
    opponentCard?: CardId,
    yourStat?: number,
    opponentCounterStat?: number,
): QuarterOutcome {
    if (specialCard === 'timeout') {
         // Timeout doesn't resolve a play — it's a meta-card that rerolls the hand.
         // Return a neutral outcome; the game state hook handles the actual reroll.
        return {
            yourCard: specialCard,
            opponentCard: specialCard,
            successRate: 0,
            succeeded: true,
            result: 'turnover', // No points for either side
            pointsAwarded: 0,
            opponentPoints: 0,
         };
     }

    if (specialCard === 'hustle-play') {
         // Hustle Play: +2 to your stat for this resolution
        if (yourStat !== undefined && yourCard && opponentCard) {
            const boostedStat = (yourStat ?? 0) + 2;
            return resolveOffense(
                yourCard,
                opponentCard,
                boostedStat,
                opponentCounterStat ?? 0,
                yourCard === 'alley-oop' || yourCard === 'poster-dunk' ? 1 : 0, // Only spend 1 energy for hustle
                yourCard === 'alley-oop' || yourCard === 'poster-dunk' ? 1 : 0,
             );
         }
        return {
            yourCard: specialCard,
            opponentCard: specialCard,
            successRate: 0,
            succeeded: false,
            result: 'miss',
            pointsAwarded: 0,
            opponentPoints: 0,
         };
     }

    if (specialCard === 'and-one') {
         // And-One: carries momentum — auto point next quarter + this resolution
        if (yourCard && opponentCard && yourStat !== undefined && opponentCounterStat !== undefined) {
            const outcome = resolveOffense(
                yourCard,
                opponentCard,
                yourStat,
                opponentCounterStat,
                 0, // No energy check — And-One overrides it
                 0,
             );
            return {
                 ...outcome,
                result: 'and-one',
                pointsAwarded: outcome.pointsAwarded + 1, // Extra momentum point
                opponentPoints: outcome.opponentPoints,
             };
         }
        return {
            yourCard: specialCard,
            opponentCard: specialCard,
            successRate: 0,
            succeeded: true,
            result: 'and-one',
            pointsAwarded: 1,
            opponentPoints: 0,
         };
     }

     // Fallback — should never happen with exhaustive type checking
    return {
        yourCard: specialCard,
        opponentCard: specialCard,
        successRate: 0,
        succeeded: false,
        result: 'miss',
        pointsAwarded: 0,
        opponentPoints: 0,
     };
}
