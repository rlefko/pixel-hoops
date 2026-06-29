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
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';

import { FeelSettingsProvider } from '@/feel';
import { HomeRosterProvider } from '@/context/HomeRosterContext';
import { ActiveRunProvider } from '@/context/ActiveRunContext';
import { TransitionProvider } from '@/navigation';
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
        <ActiveRunProvider>
          <RootLayoutNav />
        </ActiveRunProvider>
      </HomeRosterProvider>
    </FeelSettingsProvider>
  );
}

function RootLayoutNav() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={navTheme}>
        {/* Ignore the OS "Reduce Motion" flag so the game's juice (ball, particles,
            shake) always plays. The in-app Reduce Motion setting is the control. */}
        <ReducedMotionConfig mode={ReduceMotion.Never} />
        <StatusBar style="light" />
        <TransitionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.bgDeep },
              // The arcade pixel-wipe owns all route motion, so the native stack
              // cuts instantly and the swipe-back gesture is off.
              animation: 'none',
              gestureEnabled: false,
            }}
          >
            <Stack.Screen name="(home)" />
            <Stack.Screen name="run" />
            <Stack.Screen
              name="modal"
              options={{
                presentation: 'modal',
                title: 'How to Play',
                // The modal keeps its native slide-up; it is not wiped.
                animation: 'default',
                gestureEnabled: true,
              }}
            />
          </Stack>
        </TransitionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
