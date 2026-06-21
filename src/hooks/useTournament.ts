import { useState, useCallback } from 'react';
import type { Player } from '@/types/player';
import type { CardId } from '@/types/card';
import type { GameState, GameResult, QuarterOutcome } from '@/types/game-state';
import { TOTAL_Quarters, MAX_ENERGY, HAND_SIZE } from '@/types/game-state';
import { buildStartingDeck } from '@/game/deck';
import { generateOpponent } from '@/game/tournament';
import { pickAIDefensiveCard } from '@/game/ai';
import { resolveOffense, calculateSuccessRate } from '@/game/resolution';
import { CARD_STAT_MAP, COUNTER_STAT_MAP } from '@/types/card';

// ---------------------------------------------------------------------------
// Helper: create initial GameState for a new tournament
// ---------------------------------------------------------------------------

function createInitialState(
    player: Player,
    round: number = 1,
): GameState {
    const deck = buildStartingDeck(player.archetype);
    const hand = deck.slice(0, HAND_SIZE);
    return {
        player,
         // Generate an opponent scaled to the given round (usually round 1 for first game)
        opponent: generateOpponent(round),
        deck: deck.slice(HAND_SIZE),
        hand,
        energy: MAX_ENERGY,
        currentQuarter: 1,
        yourScore: 0,
        opponentScore: 0,
        isPlaying: false, // Not started until user presses "Play Game"
        gameOver: false,
        outcomes: [],
        selectedCardUuid: null,
        resolving: false,
    };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface TournamentActions {
    startGame: () => void;
    /** Select a card from the hand for this quarter. */
    selectCard: (uuid: string) => void;
    /** Play the selected offensive card and resolve the quarter. */
    playQuarter: () => void;
    /** Advance to the next quarter after resolution animation finishes. */
    advanceQuarter: () => void;
    /** Use a Timeout special card to reroll the hand (end-of-quarter action). */
    useTimeout: () => void;
    /** End the game and show result overlay. */
    endGame: () => GameResult | undefined;
}

/**
 * Manage the full tournament run lifecycle as a single React state object.
 * Exposes gameState + all actions for screens to consume.
 */
export function useTournament(player: Player) {
    const [state, setState] = useState<GameState>(() => createInitialState(player));
    const [pendingOutcome, setPendingOutcome] = useState<QuarterOutcome | null>(null);

    /** Start the game (set isPlaying and begin quarter 1). */
    const startGame = useCallback(() => {
        setState(prev => ({
            ...prev,
            isPlaying: true,
            currentQuarter: 1,
            yourScore: 0,
            opponentScore: 0,
            outcomes: [],
            selectedCardUuid: null,
            gameOver: false,
            resolving: false,
         }));
    }, []);

    /** Select a card from the hand (tap-to-play mechanic). */
    const selectCard = useCallback((uuid: string) => {
        setState(prev => ({
            ...prev,
            selectedCardUuid: prev.selectedCardUuid === uuid ? null : uuid,
         }));
     }, []);

    /** Play the selected offensive card and resolve the quarter. */
    const playQuarter = useCallback(() => {
        setState(prev => {
            if (!prev.isPlaying || prev.resolving || prev.gameOver) return prev;
            if (prev.selectedCardUuid === null) return prev; // No card selected yet

            // Find the selected card and check it's offensive
            const selectedCard = prev.hand.find(c => c.uuid === prev.selectedCardUuid);
            if (!selectedCard) return prev;
            if (selectedCard.category !== 'offense') return prev; // Only play offensive cards

            // Pick AI defensive response
            const aiDefensiveCard = pickAIDefensiveCard(prev.opponentScore - prev.yourScore);

            // Determine stats for resolution
            const statKey = CARD_STAT_MAP[selectedCard.id as CardId];
            const counterStatKey = COUNTER_STAT_MAP[selectedCard.id as CardId];
            const ourStat = prev.player.stats[statKey];
            const theirCounterStat = prev.opponent.stats[counterStatKey];

            // Resolve the play
            const outcome: QuarterOutcome = resolveOffense(
                selectedCard.id as CardId,
                aiDefensiveCard as CardId,
                ourStat,
                theirCounterStat,
                prev.energy,
                selectedCard.energyCost,
            );

            return {
                ...prev,
                 // Remove played card from hand immediately (it will be refilled on advance)
                hand: prev.hand.filter(c => c.uuid !== prev.selectedCardUuid),
                 // Energy cost for dunk-type plays
                energy: Math.max(0, prev.energy - selectedCard.energyCost),
                resolving: true,
                selectedCardUuid: null,
                 // Update scores based on outcome
                yourScore: prev.yourScore + outcome.pointsAwarded,
                opponentScore: prev.opponentScore + outcome.opponentPoints,
                outcomes: [...prev.outcomes, outcome],
             };
         });

         // Set pending outcome for the resolution flash display
        const card = state.hand.find(c => c.uuid === state.selectedCardUuid);
        if (card) {
            const statKey = CARD_STAT_MAP[card.id as CardId];
            const counterStatKey = COUNTER_STAT_MAP[card.id as CardId];
            const ourStat = state.player.stats[statKey];
            const theirCounterStat = state.opponent.stats[counterStatKey];
            const successRate = calculateSuccessRate(ourStat, theirCounterStat);

             // We need to resolve here too for the flash... but we can't access the new state in setState callback synchronously.
             // Instead, store a copy of the outcome-like data for the flash to display.
            setPendingOutcome({
                yourCard: card.id as CardId,
                opponentCard: pickAIDefensiveCard(state.opponentScore - state.yourScore) as CardId,
                successRate,
                succeeded: false, // Will be updated after actual resolution
                result: 'miss', // Placeholder — real value comes from the setState above
                pointsAwarded: 0,
                opponentPoints: 0,
             });
         }
     }, [state]);

    /** Advance to the next quarter after resolution animation finishes. */
    const advanceQuarter = useCallback(() => {
        setState(prev => {
            if (prev.currentQuarter >= TOTAL_Quarters) {
                 // Game is over — show result
                return {
                    ...prev,
                    gameOver: true,
                    isPlaying: false,
                    resolving: false,
                     pendingOutcome: null,
                 };
             }

             // Draw a new card for the next quarter (refill hand towards size 4)
            let newDeck = [...prev.deck];
            let newHand = [...prev.hand];

             // Add And-One carryover point if applicable
            const lastOutcome = prev.outcomes[prev.outcomes.length - 1];
            let andOneBonus = 0;
            if (lastOutcome?.result === 'and-one') {
                andOneBonus = 1;
             }

             // Draw up to HAND_SIZE cards for the next quarter
            while (newHand.length < HAND_SIZE && newDeck.length > 0) {
                const [card, ...rest] = newDeck;
                newHand.push(card);
                newDeck = rest;
             }

            return {
                ...prev,
                currentQuarter: prev.currentQuarter + 1,
                deck: newDeck,
                hand: newHand,
                 // Regenerate energy (capped at MAX_ENERGY)
                energy: Math.min(MAX_ENERGY, prev.energy + 2),
                resolving: false,
                selectedCardUuid: null,
                 pendingOutcome: null,
                 yourScore: prev.yourScore + andOneBonus,
                 // And-One doesn't give opponent extra points
             };
         });
     }, []);

    /** Use a Timeout special card to reroll the hand. */
    const useTimeout = useCallback(() => {
        setState(prev => {
            if (!prev.isPlaying || prev.resolving) return prev;

             // Find and remove the timeout card from hand, reshuffle into deck
            const timeoutIdx = prev.hand.findIndex(c => c.id === 'timeout');
            if (timeoutIdx === -1) return prev; // No timeout card in hand

            const timeoutCard = prev.hand[timeoutIdx];
            const newHand = [...prev.hand].filter(c => c.id !== 'timeout');
            let newDeck = shuffle([...prev.deck, timeoutCard]);

            // Draw new cards to fill the hand
            while (newHand.length < HAND_SIZE && newDeck.length > 0) {
                const [card, ...rest] = newDeck;
                newHand.push(card);
                 newDeck = rest;
             }

            return {
                ...prev,
                hand: newHand,
                deck: newDeck,
                selectedCardUuid: null,
                 // Timeout doesn't resolve anything — just reshuffles
             };
         });
     }, []);

    /** End the game and return a GameResult. */
    const endGame = useCallback((): GameResult | undefined => {
        if (!state.gameOver) return undefined;

        const won = state.yourScore > state.opponentScore;
        const isTie = state.yourScore === state.opponentScore;

        // In basketball, ties go to overtime — but for this roguelike we break it:
        // if tied, the higher-clutch player wins (simulated in favor of them).
        let result: 'victory' | 'defeat';
        if (isTie) {
            result = state.player.stats.clutch >= state.opponent.stats.clutch ? 'victory' : 'defeat';
         } else {
            result = won ? 'victory' : 'defeat';
         }

        const gameResult: GameResult = {
            result,
            finalScore: [state.yourScore, state.opponentScore],
            outcomes: state.outcomes,
             // Could return recruited opponent here in a future PR
         };

        setState(prev => ({ ...prev, gameOver: true }));

        return gameResult;
     }, [state]);

    return {
        gameState: state,
        pendingOutcome,
        actions: { startGame, selectCard, playQuarter, advanceQuarter, useTimeout, endGame },
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
         [a[i], a[j]] = [a[j], a[i]];
     }
    return a;
}
