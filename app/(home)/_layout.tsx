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
        // Freeze a menu screen while it is occluded by another (e.g. the index's
        // attract pulses pause while the Locker or a run is on top).
        freezeOnBlur: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="locker" />
      <Stack.Screen name="arcade" />
      <Stack.Screen name="hall-of-fame" />
      <Stack.Screen name="coaches" />
      <Stack.Screen name="roster" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
