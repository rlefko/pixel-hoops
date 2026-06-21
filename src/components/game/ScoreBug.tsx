import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/StyledText';

interface ScoreBugProps {
    yourScore: number;
    opponentScore: number;
}

/** Top-of-screen scoreboard: "YOU: 28  OPP: 31" */
export function ScoreBug({ yourScore, opponentScore }: ScoreBugProps) {
    return (
        <View style={styles.container}>
            <Text style={[styles.label, styles.yourLabel]}>YOU</Text>
            <Text style={styles.score}>{yourScore}</Text>
            <Text style={styles.divider}>-</Text>
            <Text style={styles.score}>{opponentScore}</Text>
            <Text style={[styles.label, styles.oppLabel]}>OPP</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    label: {
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    yourLabel: {
        color: '#81C784',
    },
    oppLabel: {
        color: '#E57373',
    },
    score: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
        marginHorizontal: 6,
    },
    divider: {
        fontSize: 14,
        color: '#888',
        marginHorizontal: 2,
    },
});
