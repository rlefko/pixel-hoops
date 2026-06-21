import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/StyledText';

interface QuarterIndicatorProps {
    current: number;
    total: number;
}

/** Top-of-screen quarter progress indicator: "QUARTER 3/4" with dots. */
export function QuarterIndicator({ current, total }: QuarterIndicatorProps) {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>QUARTER {current}/{total}</Text>
            <View style={styles.dots}>
                {Array.from({ length: total }).map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                              { backgroundColor: i < current ? '#FFD54F' : 'rgba(255,255,255,0.2)' },
                         ]}
                    />
                ))}
            </View>
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
    text: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#fff',
        letterSpacing: 1,
     },
    dots: {
        flexDirection: 'row',
         marginLeft: 8,
     },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginHorizontal: 2,
    },
 });
