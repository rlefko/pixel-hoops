import { Image, View } from 'react-native';
import { TEAM_LOGOS } from '@/assets/teamLogos';
import { teamByAbbr } from '@/data/nba';
import { palette } from '@/theme';
import { BasketballIcon } from './PixelIcons';

/**
 * A franchise's 8-bit pixel logo, bundled as a pre-pixelated PNG (baked offline by
 * scripts/pixelate-logos.ts). Rendered with a plain RN Image: the crisp blocks are
 * baked into the source, so no nearest-neighbor scaling prop is needed. Falls back
 * to a team-tinted basketball if a logo is missing, so a tile never goes blank.
 */
interface TeamLogoProps {
  /** The team's 3-letter abbreviation (matches src/data/nba-teams.json). */
  abbr: string;
  size: number;
  /** Multiplies the rendered opacity, for the dimmed played-node look. */
  opacity?: number;
}

export function TeamLogo({ abbr, size, opacity = 1 }: TeamLogoProps) {
  const source = TEAM_LOGOS[abbr];
  if (!source) {
    return <BasketballIcon size={size} color={teamByAbbr(abbr)?.primaryHex ?? palette.orange} />;
  }
  return (
    <View style={{ width: size, height: size, opacity }}>
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMode="contain"
        fadeDuration={0}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
