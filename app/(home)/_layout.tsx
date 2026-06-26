import { Stack } from 'expo-router';
import { palette } from '@/theme';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bgDeep },
        // Menu hops cut instantly under the arcade pixel-wipe; no native swipe.
        animation: 'none',
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="locker" />
      <Stack.Screen name="arcade" />
      <Stack.Screen name="hall-of-fame" />
      <Stack.Screen name="roster" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
