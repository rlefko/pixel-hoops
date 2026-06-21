import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import type { QuarterOutcome } from '@/types/game-state';

const FLASH_DURATION = 1500; // ms per flash animation phase

interface ResolutionFlashProps {
    outcome: QuarterOutcome | null;
}

const FLASH_MESSAGES: Record<string, string> = {
    score: 'SWISH!!',
    miss: 'MISS!',
    steal: 'SWIPED!!!',
    turnover: 'TURNOVER!',
    block: 'BLOCKED!!',
    'and-one': 'AND-ONE!!',
};

const windowDims = Dimensions.get('window');

/** Full-screen overlay (above card hand) that shows resolution feedback briefly. */
export function ResolutionFlash({ outcome }: ResolutionFlashProps) {
    const [phase, setPhase] = useState<'rate' | 'result'>('rate');

    useEffect(() => {
        if (!outcome) return;
        // Phase 1: show success rate (e.g. "62% to score!")
        setPhase('rate');
        const timer = setTimeout(() => {
            // Phase 2: show result text (e.g. "SWISH!!")
            setPhase('result');
        }, FLASH_DURATION);

        return () => clearTimeout(timer);
    }, [outcome]);

    if (!outcome) return null;

    const isSuccess = outcome.result === 'score' || outcome.result === 'and-one';
    const accentColor = isSuccess ? '#66BB6A' : '#EF5350';

    return (
        <View style={styles.overlay}>
            <View style={[styles.pulse, { borderColor: accentColor }]}>
                {phase === 'rate' ? (
                    <>
                        <Text style={[styles.rate, { color: accentColor }]}>
                            {outcome.successRate.toFixed(0)}% to score!
                        </Text>
                        <Text style={styles.vs}>
                            {outcome.yourCard.toUpperCase()} vs {outcome.opponentCard.toUpperCase()}
                        </Text>
                    </>
                ) : (
                    <>
                        <Text style={[styles.result, { color: accentColor }]}>
                            {FLASH_MESSAGES[outcome.result] ?? '...'}
                        </Text>
                        {outcome.pointsAwarded > 0 ? (
                            <Text style={styles.plusPoints}>+{outcome.pointsAwarded}</Text>
                        ) : null}
                        {outcome.opponentOffense ? (
                            <Text style={styles.opponentLine}>
                                {`OPP ${FLASH_MESSAGES[outcome.opponentOffense.result] ?? '...'}`}
                                {outcome.opponentOffense.points > 0
                                    ? ` +${outcome.opponentOffense.points}`
                                    : ''}
                            </Text>
                        ) : null}
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: windowDims.height * 0.35 + 40, // Leave card hand area visible
        alignItems: 'center',
        justifyContent: 'center',
    },
    pulse: {
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderWidth: 2,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    rate: {
        fontSize: 22,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    vs: {
        fontSize: 11,
        color: '#aaa',
        marginTop: 4,
    },
    result: {
        fontSize: 28,
        fontWeight: 'bold',
        letterSpacing: 2,
    },
    plusPoints: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFD54F',
        marginTop: 4,
    },
    opponentLine: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#EF5350',
        marginTop: 8,
        letterSpacing: 1,
    },
});
