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
import {
  ReducedMotionConfig,
  ReduceMotion,
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';
import { enableFreeze } from 'react-native-screens';

import { FeelSettingsProvider } from '@/feel';
import { HomeRosterProvider } from '@/context/HomeRosterContext';
import { ActiveRunProvider } from '@/context/ActiveRunContext';
import { TransitionProvider } from '@/navigation';
import { FONT_ASSETS, palette } from '@/theme';

// Freeze off-screen screens: when a screen is blurred (occluded by a pushed route,
// e.g. the home menu behind a run), react-native-screens suspends its React tree, so
// its idle attract/glow/bob loops and re-renders stop running on the UI thread until
// it is focused again. The custom pixel-wipe paints over the instant native cut, and
// freeze only engages after the reveal, so the transition itself is unaffected.
enableFreeze(true);

// In production, drop Reanimated's strict logger so worklet/shared-value access is not
// validated every frame. Dev keeps the warnings.
if (!__DEV__) {
  configureReanimatedLogger({ level: ReanimatedLogLevel.error, strict: false });
}

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
              // Suspend a screen's React tree while it is occluded by another route
              // (e.g. the home menu behind a run), pausing its idle loops/renders.
              freezeOnBlur: true,
            }}
          >
            <Stack.Screen name="(home)" />
            <Stack.Screen name="run" />
            <Stack.Screen
              name="modal"
              options={{
                presentation: 'modal',
                title: 'How to Play',
                // The modal keeps its native slide-up; it is not wiped. Don't freeze it,
                // so its dismiss animation is never interrupted mid-slide.
                animation: 'default',
                gestureEnabled: true,
                freezeOnBlur: false,
              }}
            />
          </Stack>
        </TransitionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
