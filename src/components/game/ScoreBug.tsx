import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/StyledText';
import { Counter, Pop } from '@/components/fx';
import { palette, FONT, FONT_SIZE, RADIUS, space } from '@/theme';

interface ScoreBugProps {
    yourScore: number;
    opponentScore: number;
}

/** Top-of-screen scoreboard: "YOU 28 - 31 OPP" with the scores ticking up. */
export function ScoreBug({ yourScore, opponentScore }: ScoreBugProps) {
    return (
        <View style={styles.container}>
            <Text style={[styles.label, styles.yourLabel]}>YOU</Text>
            <Pop trigger={yourScore}>
                <Counter value={yourScore} style={styles.score} />
            </Pop>
            <Text style={styles.divider}>-</Text>
            <Pop trigger={opponentScore}>
                <Counter value={opponentScore} style={styles.score} />
            </Pop>
            <Text style={[styles.label, styles.oppLabel]}>OPP</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space(2),
        paddingVertical: space(1),
        borderRadius: RADIUS.chip,
        backgroundColor: palette.bgPanel,
    },
    label: {
        fontFamily: FONT.body,
        fontSize: FONT_SIZE.small,
        letterSpacing: 1,
    },
    yourLabel: {
        color: palette.makeGreenLt,
    },
    oppLabel: {
        color: palette.missRedLt,
    },
    score: {
        fontFamily: FONT.display,
        fontSize: FONT_SIZE.label,
        color: palette.ink,
        marginHorizontal: space(2),
    },
    divider: {
        fontSize: FONT_SIZE.label,
        color: palette.inkDim,
        marginHorizontal: space(0.5),
    },
});
