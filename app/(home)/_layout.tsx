import { Stack } from 'expo-router';
import { palette } from '@/theme';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bgDeep },
      }}
    >
      <Stack.Screen name="(home)" />
      <Stack.Screen name="game" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
