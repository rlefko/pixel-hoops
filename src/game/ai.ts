/** Score threshold above which an offense becomes conservative (plays safe). */
const SCORE_AHEAD_THRESHOLD = 3;

/** Score threshold below which an offense becomes aggressive (chases big plays). */
const SCORE_BEHIND_THRESHOLD = -2;

/** Coarse posture an offense takes given the score: how much risk to accept. */
export type RiskPosture = 'safe' | 'risky' | 'mixed';

/**
 * Ahead/behind/close heuristic the auto-sim reads to bias possession choices:
 * comfortably ahead plays safe, behind chases big plays, close games mix.
 * `scoreDifferential` is from the offense's view (offenseScore - opponentScore).
 */
export function pickRiskPosture(scoreDifferential: number): RiskPosture {
    if (scoreDifferential >= SCORE_AHEAD_THRESHOLD) return 'safe';
    if (scoreDifferential <= SCORE_BEHIND_THRESHOLD) return 'risky';
    return 'mixed';
}
