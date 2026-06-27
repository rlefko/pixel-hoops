import { type ReactNode } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/StyledText';
import { Scanlines } from '@/components/fx';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The one screen shell. Owns the dark background and turns real device safe-area
 * insets (notch, Dynamic Island, Android status bar and gesture bar) into
 * padding so no UI hides behind a cutout. Replaces the per-screen hardcoded
 * paddingTop guesses that over-padded small phones and under-padded big ones.
 *
 * Pass `onBack` to get a fixed top-left exit control (the app's nav lives at the
 * top-left, away from the bottom home indicator). Pass `scroll` for screens
 * whose body should scroll: the inset rides the content so it clears the cutouts
 * while the scroll track stays full-bleed dark.
 */

interface BaseScreenProps {
  children: ReactNode;
  /** Constant gap below the top inset so content keeps a breath. Default space(2). */
  topGap?: number;
  /** Constant gap above the bottom inset. Default space(2). */
  bottomGap?: number;
  /** Merged into the body container (the part that owns design padding). */
  style?: StyleProp<ViewStyle>;
  /** When set, renders a fixed top-left back/exit control. */
  onBack?: () => void;
  /** Label for the back control. Default 'BACK'. */
  backLabel?: string;
  /** Render a full-bleed CRT scanline overlay across the whole screen. */
  scanlines?: boolean;
}

interface ViewScreenProps extends BaseScreenProps {
  scroll?: false;
}

interface ScrollScreenProps extends BaseScreenProps {
  scroll: true;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

type ScreenProps = ViewScreenProps | ScrollScreenProps;

export function Screen(props: ScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    children,
    topGap = space(2),
    bottomGap = space(2),
    style,
    onBack,
    backLabel = 'BACK',
    scanlines,
  } = props;

  const bottom = insets.bottom + bottomGap;
  // The fixed back bar supplies the breath below the notch; otherwise the body does.
  const bodyTop = onBack ? 0 : topGap;

  const body = props.scroll ? (
    <ScrollView
      style={[styles.fill, style]}
      contentContainerStyle={[
        // flexGrow lets short content fill the viewport; with bounce off, a page
        // that fits no longer scrolls or rubber-bands, only an overflowing one does.
        { paddingTop: bodyTop, paddingBottom: bottom, flexGrow: 1 },
        props.contentContainerStyle,
      ]}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, { paddingTop: bodyTop, paddingBottom: bottom }, style]}>
      {children}
    </View>
  );

  // The outer view is full-bleed (no inset padding) so the optional scanline
  // overlay covers the entire screen, including the status-bar area and back bar.
  return (
    <View style={styles.fill}>
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        {onBack ? (
          <View style={styles.topBar}>
            <Pressable onPress={onBack} hitSlop={space(3)}>
              <Text style={styles.backText}>{`‹ ${backLabel}`}</Text>
            </Pressable>
          </View>
        ) : null}
        {body}
      </View>
      {scanlines ? <Scanlines /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.bgDeep },
  topBar: {
    paddingHorizontal: space(4),
    paddingTop: space(2),
    paddingBottom: space(1),
    alignItems: 'flex-start',
  },
  backText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    letterSpacing: 1,
  },
});
