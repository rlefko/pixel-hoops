import { useColorScheme as useColorSchemeCore } from 'react-native';

export const useColorScheme = (): 'light' | 'dark' => {
  // RN 0.85's ColorSchemeName widened to include 'unspecified' (and null), so
  // narrow to dark only on an explicit 'dark'; everything else defaults to light.
  return useColorSchemeCore() === 'dark' ? 'dark' : 'light';
};
