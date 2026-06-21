import type { CardId, SpecialCardId } from '@/types/card';
import type { QuarterResult, QuarterOutcome } from '@/types/game-state';
import {
    getPointsForCard,
    resolveOutcomeLabel,
    applyDefensiveAdjustments,
} from '@/game/scoring';

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
    let points = 0;

    if (succeeded) {
         // Base value comes from the card catalog (single source of truth).
        points = getPointsForCard(yourCard);

        switch (yourCard) {
            case 'step-back':
                 // Higher-variance jumper: a second roll can still rim out.
                if (!roll(successRate + 5)) {
                    succeeded = false;
                    points = 0;
                 }
                break;
            case 'crossover':
                 // A blow-by can draw a foul for a bonus free throw.
                if (roll(successRate - 20)) {
                    points += 1;
                 }
                break;
         }

         // Beating a gambling pressure trap leaves an open lane for an easy bucket
         // (+1). Mirrors applyDefensiveAdjustments so the reward is symmetric on
         // both offense and defense, per the concept doc.
        if (succeeded && opponentCard === 'pressure-trap') {
            points += 1;
         }
     }

     // Label depends on BOTH cards (e.g. miss vs zone reads as a block).
    const result: QuarterResult = resolveOutcomeLabel(yourCard, opponentCard, succeeded);

    return {
        yourCard,
        opponentCard,
        successRate,
        succeeded,
        result,
        pointsAwarded: succeeded ? points : 0,
        opponentPoints: 0,
     };
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
    const succeeded = roll(successRate);

     // Opponent earns their card's value only if they beat your defense; the
     // defensive adjustment then decides the final points + arcade callout.
    const earnedPoints = succeeded ? getPointsForCard(theirCard) : 0;
    const { adjustedPoints, result } = applyDefensiveAdjustments(
        earnedPoints,
        yourCard,
        !succeeded, // your defense succeeded iff their attack failed
    );

    return {
        yourCard,
        opponentCard: theirCard,
        successRate,
        succeeded,
        result,
        pointsAwarded: 0, // Opponent scoring doesn't add to our "pointsAwarded"
        opponentPoints: adjustedPoints,
     };
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
