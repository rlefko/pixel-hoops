import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/StyledText';

interface EnergyBarProps {
    current: number;
    max: number;
}

/** Energy pool display: "ENERGY: |||" style bar. */
export function EnergyBar({ current, max }: EnergyBarProps) {
    const segments = Array.from({ length: max }, (_, i) => i < current);

    return (
        <View style={styles.container}>
            <Text style={styles.label}>ENERGY</Text>
            <View style={styles.segments}>
                {segments.map((filled, i) => (
                    <View
                        key={i}
                         style={[
                            styles.segment,
                             { backgroundColor: filled ? '#FFD54F' : 'rgba(255,255,255,0.15)' },
                         ]}
                     />
                ))}
            </View>
            <Text style={styles.value}>{current}/{max}</Text>
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
        color: '#fff',
        letterSpacing: 1,
    },
    segments: {
         flexDirection: 'row',
         marginLeft: 8,
     },
    segment: {
        width: 3,
        height: 10,
        marginHorizontal: 2,
        borderRadius: 1,
    },
    value: {
        fontSize: 10,
         color: '#fff',
         marginLeft: 6,
          fontWeight: 'bold',
     },
 });
