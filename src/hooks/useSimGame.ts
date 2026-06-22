import { useCallback, useMemo, useState } from 'react';
import { createRNG, deriveSeed } from '@/game/rng';
import {
  buildStartingRoster,
  generateOpponentTeam,
  planForRoster,
} from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { simulateGame } from '@/game/simulation';
import type { SimResult } from '@/types/sim';
import type { Roster } from '@/types/roster';
import type { Team } from '@/types/team';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import { palette } from '@/theme';

/**
 * Drives a minimal roguelike run for the slice: a short sequence of escalating
 * opponents with permadeath. The full branching map, recruitment, and gear are
 * later phases (see docs/roadmap.md). The player keeps one roster for the run;
 * agency lives in the game plan they set before each tip-off.
 */

export const TOTAL_ROUNDS = 5;

export type SimPhase = 'pregame' | 'replaying' | 'final' | 'runover';

function freshRunSeed(): string {
  // Date.now is fine in app runtime (only the workflow sandbox forbids it).
  return `run-${Date.now()}`;
}

export interface SimGameState {
  round: number;
  totalRounds: number;
  wins: number;
  roster: Roster;
  gamePlan: GamePlan;
  homeTeam: Team;
  awayTeam: Team;
  opponentName: string;
  result: SimResult | null;
  phase: SimPhase;
  won: boolean;
  champion: boolean;
}

export function useSimGame() {
  const [runSeed, setRunSeed] = useState(freshRunSeed);
  const [round, setRound] = useState(1);
  const [wins, setWins] = useState(0);
  const [gamePlan, setGamePlan] = useState<GamePlan>(DEFAULT_GAME_PLAN);
  const [phase, setPhase] = useState<SimPhase>('pregame');
  const [result, setResult] = useState<SimResult | null>(null);

  // The player's roster persists across the whole run.
  const roster = useMemo(
    () => buildStartingRoster(createRNG(deriveSeed(runSeed, 'roster'))),
    [runSeed]
  );

  const opponent = useMemo(
    () =>
      generateOpponentTeam(
        round,
        createRNG(deriveSeed(runSeed, `opp-${round}`))
      ),
    [runSeed, round]
  );

  const homeTeam = useMemo(
    () => buildTeam('Your Squad', roster.starters, gamePlan, palette.homeTeam),
    [roster, gamePlan]
  );

  const awayTeam = useMemo(
    () =>
      buildTeam(
        opponent.name,
        opponent.roster.starters,
        planForRoster(opponent.roster),
        palette.awayTeam
      ),
    [opponent]
  );

  const startGame = useCallback(() => {
    const r = simulateGame({
      home: homeTeam,
      away: awayTeam,
      seed: deriveSeed(runSeed, `game-${round}`),
    });
    setResult(r);
    setPhase('replaying');
  }, [homeTeam, awayTeam, runSeed, round]);

  const finishReplay = useCallback(() => setPhase('final'), []);

  const nextOrEnd = useCallback(() => {
    if (!result || result.winner !== 'home') {
      setPhase('runover');
      return;
    }
    setWins((w) => w + 1);
    if (round >= TOTAL_ROUNDS) {
      setPhase('runover'); // ran the table
      return;
    }
    setRound((r) => r + 1);
    setResult(null);
    setPhase('pregame');
  }, [result, round]);

  const newRun = useCallback(() => {
    setRunSeed(freshRunSeed());
    setRound(1);
    setWins(0);
    setResult(null);
    setGamePlan(DEFAULT_GAME_PLAN);
    setPhase('pregame');
  }, []);

  const won = result?.winner === 'home';
  const champion = won && round >= TOTAL_ROUNDS;

  const state: SimGameState = {
    round,
    totalRounds: TOTAL_ROUNDS,
    wins,
    roster,
    gamePlan,
    homeTeam,
    awayTeam,
    opponentName: opponent.name,
    result,
    phase,
    won,
    champion,
  };

  return {
    state,
    actions: { setGamePlan, startGame, finishReplay, nextOrEnd, newRun },
  };
}
