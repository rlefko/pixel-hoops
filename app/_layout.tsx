import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { FeelSettingsProvider } from '@/feel';
import { HomeRosterProvider } from '@/context/HomeRosterContext';
import { FONT_ASSETS, palette } from '@/theme';

/**
 * Pixel Hoops is a dark 8-bit game. We pin a single palette-matched dark theme
 * instead of following the device color scheme so the light navigator surface
 * never flashes white through overscroll, transitions, or safe-area gaps.
 */
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.bgDeep,
    card: palette.bgDeep,
  },
};

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(home)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_ASSETS);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <FeelSettingsProvider>
      <HomeRosterProvider>
        <RootLayoutNav />
      </HomeRosterProvider>
    </FeelSettingsProvider>
  );
}

function RootLayoutNav() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.bgDeep },
          }}
        >
          <Stack.Screen name="(home)" />
          <Stack.Screen name="run" />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal', title: 'How to Play' }}
          />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
