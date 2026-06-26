import type { BoxLine } from '@/types/sim';

/**
 * The single source of truth for "who was the MVP of a game". We rank players by
 * Game Score (the Hollinger advanced stat), not raw points, so a high-impact line
 * (rebounds, assists, defense, efficient shooting) can outrank an empty-calorie
 * chucker. Used by the post-game box score crown and the championship share blurb.
 */

/**
 * An adaptation of Hollinger's Game Score to the stats we track in a BoxLine.
 * The original is PTS + 0.4*FGM - 0.7*FGA - 0.4*(FTA-FTM) + 0.7*ORB + 0.3*DRB +
 * STL + 0.7*AST + 0.7*BLK - 0.4*PF - TOV. We have no free throws, fouls, or an
 * offensive/defensive rebound split, so those terms drop and total rebounds take
 * a flat 0.3 weight (the defensive-board coefficient, since most boards are).
 */
export function gameScore(line: BoxLine): number {
  return (
    line.pts +
    0.4 * line.fgm -
    0.7 * line.fga +
    0.3 * line.reb +
    0.7 * line.ast +
    line.stl +
    0.7 * line.blk -
    line.tov
  );
}

/**
 * Index of the game's MVP: the highest Game Score among players who actually
 * checked in (ties resolve to the first). Returns -1 if nobody played.
 */
export function mvpIndex(lines: BoxLine[]): number {
  let best = -1;
  let bestScore = -Infinity;
  lines.forEach((line, i) => {
    if (line.seconds <= 0) return;
    const score = gameScore(line);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
