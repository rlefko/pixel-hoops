import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';

/** Main menu screen — entry point for the game. */
export default function HomeScreen() {
    const router = useRouter();

    return (
        <View style={styles.container}>
             <View style={styles.titleBlock}>
                 <Text style={styles.title}>PIXEL</Text>
                 <Text style={[styles.title, styles.highlight]}>HOOPS</Text>
                 <Text style={styles.subtitle}>Card Basketball Roguelike</Text>
             </View>

             <Text style={styles.instructions}>
                 {'Tap cards. Beat opponents.\nBuild your roster.'}
             </Text>

             <View style={styles.buttonContainer}>
                 <Text
                    style={styles.startButton}
                    onPress={() => router.push('/game')}
                 >
                     Start Tournament
                 </Text>
             </View>

             <Text style={styles.tagline}>8-bit arcade energy. One-thumb strategy.</Text>
         </View>
     );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1A1A2E',
     },
    titleBlock: {
         marginBottom: 8,
     },
    title: {
         fontSize: 40,
         fontWeight: 'bold',
        color: '#fff',
        letterSpacing: 4,
      },
     highlight: {
        color: '#FF9800',
      },
    subtitle: {
        fontSize: 12,
        color: '#aaa',
        marginTop: 4,
         letterSpacing: 2,
     },
    instructions: {
         fontSize: 16,
         color: '#ccc',
         textAlign: 'center',
        marginTop: 32,
        lineHeight: 22,
      },
    buttonContainer: {
         marginTop: 48,
     },
    startButton: {
         fontSize: 22,
         fontWeight: 'bold',
        color: '#FFD54F',
        textAlign: 'center',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(255,213,79,0.1)',
         borderWidth: 2,
         borderColor: '#FFD54F',
     },
    tagline: {
        fontSize: 10,
        color: '#666',
         marginTop: 64,
         letterSpacing: 1,
     },
 });
