import React, { useCallback, useEffect, useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { CardDisplay } from '@/components/game/CardDisplay';
import { ScoreBug } from '@/components/game/ScoreBug';
import { QuarterIndicator } from '@/components/game/QuarterIndicator';
import { EnergyBar } from '@/components/game/EnergyBar';
import { ResolutionFlash } from '@/components/game/ResolutionFlash';
import { useTournament } from '@/hooks/useTournament';
import { TOTAL_QUARTERS } from '@/types/game-state';

/** Full playable game screen — one complete 4-quarter basketball game. */
export default function GameScreen() {
    const router = useRouter();

     // Create a random small-forward player for this demo run.
     // In the future this will come from the roster system (persistent).
    const player = useMemo(() => ({
        name: 'Player 1',
        archetype: 'small-forward' as const,
        stats: { shooting: 5, speed: 5, athleticism: 5, clutch: 5 },
        level: 1,
        trainingXP: 0,
     }), []);

    const { gameState, actions } = useTournament(player);
    const [showResult, setShowResult] = React.useState(false);

     // Auto-advance to next quarter or end game after resolution animation.
    useEffect(() => {
        if (!gameState.resolving) return;
        const timer = setTimeout(() => {
            if (gameState.gameOver) {
                setShowResult(true);
                Alert.alert(
                    gameState.yourScore > gameState.opponentScore
                        ? 'VICTORY!'
                      : gameState.yourScore < gameState.opponentScore
                          ? 'DEFEAT'
                          : 'TIE',
                    `Final: ${gameState.yourScore} - ${gameState.opponentScore}`,
                    [
                        { text: 'Play Again', onPress: () => router.replace('/') },
                        { text: 'Menu', style: 'cancel', onPress: () => router.replace('/') },
                    ],
                );
            } else {
                 // Advance to the next quarter after a brief pause
                actions.advanceQuarter();
            }
         }, 1600);

        return () => clearTimeout(timer);
      }, [gameState.resolving, gameState.gameOver]);

    const opponentName = gameState.opponent?.name ?? '...';

     // Get the last resolved quarter outcome for flash display.
    const lastOutcome = gameState.outcomes.length > 0
        ? gameState.outcomes[gameState.outcomes.length - 1]
        : null;

    /** Tap-play handler for the action button. */
    const handleAction = useCallback(() => {
        if (!gameState.isPlaying) {
             // Start the game — this begins quarter 1 and allows card selection
            actions.startGame();
            return;
         }
        // Pressing PLAY while a card is selected resolves the current quarter
        actions.playQuarter();
      }, [gameState, actions]);

    return (
         <View style={styles.container}>
              {/* Top HUD: Quarter | Score | Energy */}
             <View style={styles.hud}>
                 <QuarterIndicator current={gameState.currentQuarter} total={TOTAL_QUARTERS} />
                 <ScoreBug yourScore={gameState.yourScore} opponentScore={gameState.opponentScore} />
                 <EnergyBar current={gameState.energy} max={10} />
              </View>

              {/* Court area */}
             {showResult ? (
                  <View style={styles.resultOverlay}>
                     <Text style={styles.resultTitle}>
                         {gameState.yourScore > gameState.opponentScore
                             ? 'VICTORY!'
                           : gameState.yourScore < gameState.opponentScore
                               ? 'DEFEAT'
                               : 'TIE'}
                      </Text>
                      <View style={styles.scoreLine}>
                          <Text style={styles.finalScore}>{gameState.yourScore}</Text>
                          <Text style={styles.divider}>-</Text>
                           <Text style={styles.finalScore}>{gameState.opponentScore}</Text>
                       </View>
                     <Text style={styles.vsText}>vs {opponentName}</Text>
                      <Text
                          style={styles.playAgainButton}
                          onPress={() => router.replace('/')}
                      >
                         Play Again
                      </Text>
                  </View>
              ) : (
                   <View style={styles.court}>
                       {/* Resolution flash overlays the court when a quarter resolves */}
                      {lastOutcome && gameState.resolving
                           ? <ResolutionFlash outcome={lastOutcome} />
                           : null}
                       <Text style={styles.vsLabel}>vs {opponentName}</Text>
                  </View>
              )}

              {/* Card hand area — bottom third of screen */}
             {!showResult && (
                   <View style={styles.handArea}>
                      <View style={styles.hand}>
                         {gameState.hand.map(card => (
                             <CardDisplay
                                key={card.uuid}
                                card={card}
                                 selected={gameState.selectedCardUuid === card.uuid}
                                onPress={() => actions.selectCard(card.uuid)}
                                  disabled={gameState.resolving || !gameState.isPlaying}
                              />
                          ))}
                     </View>
                       <Text
                           style={[styles.actionButton, { opacity: gameState.isPlaying ? 1 : 0.4 }]}
                           onPress={handleAction}
                         >
                           {!gameState.isPlaying
                               ? 'PLAY'
                             : !gameState.selectedCardUuid
                                   ? 'SELECT A CARD'
                                 : 'PLAY'}
                       </Text>
                  </View>
              )}

              {/* Quarter-by-quarter summary */}
             {gameState.outcomes.length > 0 && !showResult && (
                   <View style={styles.summary}>
                      {gameState.outcomes.map((o, i) => (
                           <Text key={i} style={styles.outcomeLine}>
                             Q{i + 1}: {o.yourCard.toUpperCase()} → {o.result.toUpperCase()} (+{o.pointsAwarded})
                          </Text>
                       ))}
                   </View>
              )}
          </View>
     );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1A2E',
      },
    hud: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
         paddingVertical: 6,
     },
    court: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
         backgroundColor: '#2D3142',
      },
    vsLabel: {
        fontSize: 20,
         fontWeight: 'bold',
        color: '#fff',
         letterSpacing: 2,
     },
     resultOverlay: {
        flex: 1,
         alignItems: 'center',
         justifyContent: 'center',
         backgroundColor: 'rgba(26,26,46,0.95)',
      },
    resultTitle: {
        fontSize: 36,
        fontWeight: 'bold',
         color: '#FFD54F',
         letterSpacing: 4,
     },
    scoreLine: {
        flexDirection: 'row',
        alignItems: 'center',
         marginTop: 16,
     },
    finalScore: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
         marginHorizontal: 12,
     },
    divider: {
        fontSize: 20,
        color: '#888',
      },
    vsText: {
        fontSize: 14,
        color: '#aaa',
        marginTop: 8,
      },
    playAgainButton: {
         fontSize: 20,
        fontWeight: 'bold',
        color: '#FFD54F',
        textAlign: 'center',
         paddingVertical: 16,
         paddingHorizontal: 32,
         borderRadius: 8,
         borderWidth: 2,
         borderColor: '#FFD54F',
         backgroundColor: 'rgba(255,213,79,0.1)',
        marginTop: 32,
     },
    handArea: {
         minHeight: 160,
         borderTopWidth: 1,
         borderTopColor: '#333',
         paddingTop: 8,
     },
    hand: {
         flexDirection: 'row',
         justifyContent: 'center',
         alignItems: 'flex-end',
     },
    actionButton: {
         fontSize: 16,
        fontWeight: 'bold',
        color: '#FFD54F',
         textAlign: 'center',
         paddingVertical: 12,
         letterSpacing: 1,
      },
    summary: {
         position: 'absolute',
         bottom: 180,
         right: 16,
         alignItems: 'flex-end',
      },
    outcomeLine: {
         fontSize: 9,
        color: '#888',
     },
});
