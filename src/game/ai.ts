import type { CardId } from '@/types/card';

/** Score threshold above which AI becomes conservative (prefers zone defense). */
const SCORE_AHEAD_THRESHOLD = 3;

/** Score threshold below which AI becomes aggressive (prefers pressure trap). */
const SCORE_BEHIND_THRESHOLD = -2;

/** Coarse posture an offense takes given the score: how much risk to accept. */
export type RiskPosture = 'safe' | 'risky' | 'mixed';

/**
 * Shared ahead/behind/close heuristic. The legacy card AI and the auto-sim both
 * read the same thresholds: comfortably ahead plays safe, behind chases big
 * plays, close games mix. `scoreDifferential` is from the offense's view
 * (offenseScore - opponentScore).
 */
export function pickRiskPosture(scoreDifferential: number): RiskPosture {
    if (scoreDifferential >= SCORE_AHEAD_THRESHOLD) return 'safe';
    if (scoreDifferential <= SCORE_BEHIND_THRESHOLD) return 'risky';
    return 'mixed';
}

/** Pick an AI defensive card based on the current score differential. */
export function pickAIDefensiveCard(scoreDifferential: number): CardId {
    // scoreDifferential = opponentScore - ourScore (positive = we're ahead)
    if (scoreDifferential >= SCORE_AHEAD_THRESHOLD) {
        // We're comfortably ahead — lock it down
        return 'zone-defense';
    }
    if (scoreDifferential <= SCORE_BEHIND_THRESHOLD) {
        // We're behind — go for the steal
        return 'pressure-trap';
    }

    // Close game: mix based on a slight preference zone for safety
    // In Q4 specifically this would be overridden, but we don't have quarter
    // info here. The caller can apply that logic before falling through to here.
    const roll = Math.random();
    return roll > 0.6 ? 'pressure-trap' : 'zone-defense';
}

/** Pick an AI offensive card from their available pool. */
export function pickAIOffensiveCard(
    scoreDifferential: number,
): CardId {
    const allOffensiveCards = [
        'three-pointer',
        'bank-shot',
        'step-back',
        'crossover',
        'behind-back',
        'alley-oop',
        'poster-dunk',
    ];

    if (scoreDifferential >= SCORE_AHEAD_THRESHOLD) {
        // Ahead — play safe (high-percentage shots)
        const safe = ['bank-shot', 'step-back', 'behind-back'];
        return safe[Math.floor(Math.random() * safe.length)] as CardId;
    }

    if (scoreDifferential <= SCORE_BEHIND_THRESHOLD) {
        // Behind — go for the big plays
        const risky = ['three-pointer', 'crossover', 'alley-oop', 'poster-dunk'];
        return risky[Math.floor(Math.random() * risky.length)] as CardId;
    }

    // Close game — weighted mix: slightly favor safe plays
    if (Math.random() < 0.6) {
        const safe = ['bank-shot', 'step-back', 'behind-back', 'crossover'];
        return safe[Math.floor(Math.random() * safe.length)] as CardId;
    }
    return allOffensiveCards[Math.floor(Math.random() * allOffensiveCards.length)] as CardId;
}
