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
      <Stack.Screen name="index" />
      <Stack.Screen name="locker" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
