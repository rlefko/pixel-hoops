/**
 * Font families. `display` is the chunky pixel font (scores, callouts, headers);
 * `body` stays the existing monospace for longer, readable text. The families
 * are registered in app/_layout.tsx via expo-font's useFonts.
 *
 * Note: Press Start 2P has a single weight and is wide. Do not apply
 * `fontWeight: 'bold'` or large `letterSpacing` to display text; rely on the
 * font's inherent chunkiness, and use `body` for anything multi-line.
 */
export const FONT = {
  display: 'PressStart2P',
  body: 'SpaceMono',
} as const;

/** Loader map for app/_layout.tsx (require paths to the bundled .ttf files). */
export const FONT_ASSETS = {
  PressStart2P: require('../../assets/fonts/PressStart2P-Regular.ttf'),
  SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
} as const;
