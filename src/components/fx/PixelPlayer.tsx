import { memo } from 'react';
import Svg, { Rect, Ellipse, Text as SvgText } from 'react-native-svg';
import { mix, pickReadable } from '@/theme/color';
import { palette, FONT } from '@/theme';

/**
 * A procedural 8-bit player sprite drawn as a single inline SVG (no image assets):
 * a head with eyes, two arms, a team-colored numbered jersey, shorts, bare legs,
 * and orange sneakers, all planted by a soft ground shadow. Shades and trim are
 * derived from the team color via `mix`/`pickReadable` so any franchise's colors
 * read with depth and a crisp outline on the dark floor. `active` lights the sprite
 * up (gold backlight + floor ring) for the player making the current play.
 *
 * Drawn as ONE SVG host node (a handful of native draws) rather than the old stack
 * of ~10 Views, so a full ten-player floor is cheaper to render even with the added
 * detail. Geometry lives in a fixed 24x36 viewBox (the chunky 2:3 arcade ratio), so
 * proportions stay identical at every `size`.
 */

const SKIN_TONES = ['#F2C8A0', '#E0A878', '#C68642', '#8D5524', '#5C3A21'];

/**
 * The silhouette parts the outline traces (x, y, w, h), drawn last for the crisp
 * "sticker" edge: head, both arms (with hand), jersey, shorts, both legs, both shoes.
 */
const OUTLINE_PARTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [8, 2, 8, 8],
  [3, 12, 3, 11],
  [18, 12, 3, 11],
  [6, 11.5, 12, 9],
  [6.5, 20.5, 11, 6],
  [7.5, 26.5, 3.5, 6],
  [13, 26.5, 3.5, 6],
  [6.5, 32.5, 5, 2.5],
  [12.5, 32.5, 5, 2.5],
];

interface PixelPlayerProps {
  /** Jersey color (the team's colorHex). */
  color: string;
  /**
   * Secondary/trim color (the team's accentHex). Shows as the collar, waistband,
   * and side stripes. When it matches the jersey (no usable secondary) the trim
   * falls back to a lifted tint of the jersey so it always stays visible.
   */
  accent?: string;
  /** Jersey number shown on the chest. */
  number: number;
  /** Sprite width in px (height renders at 1.5x). */
  size?: number;
  /** Picks a skin tone deterministically; defaults to the first. */
  skinIndex?: number;
  /** Highlights the sprite as the player making the current play. */
  active?: boolean;
}

function PixelPlayerView({
  color,
  accent,
  number,
  size = 30,
  skinIndex = 0,
  active = false,
}: PixelPlayerProps) {
  const skin = SKIN_TONES[skinIndex % SKIN_TONES.length];
  // Interior shading is dropped on small roster/card avatars so they stay crisp;
  // the silhouette, face, number, and trim always render.
  const detailed = size >= 28;

  // Shades + trim derived from the palette via color math (never hand-picked hex),
  // so any team color produces a readable, consistent figure with depth.
  const jerseyShade = mix(color, palette.bgPanel, 0.28);
  const shortsColor = mix(color, palette.bgPanel, 0.45);
  const shortsShade = mix(shortsColor, palette.bgPanel, 0.28);
  const skinShadow = mix(skin, palette.bgPanel, 0.3);
  const hairShade = mix(skin, palette.bgPanel, 0.62);
  const hasTrim = !!accent && accent !== color;
  const trim = hasTrim ? accent : mix(color, palette.ink, 0.35);
  // A crisp near-black silhouette edge that reads on the dark floor; turns gold when
  // active. pickReadable guards the rare near-black jersey that would otherwise vanish.
  const outline = active
    ? palette.gold
    : pickReadable(
        palette.bgCourt,
        [palette.bgPanel, mix(palette.bgPanel, palette.ink, 0.25)],
        palette.bgPanel,
        1.6
      );
  // Ink vs panel for the number, whichever stays legible on the jersey.
  const numberInk = pickReadable(color, [palette.ink, palette.bgPanel], palette.ink, 3);
  const numStr = String(number);
  // Press Start 2P is wide and monospaced (~1em advance), so shrink a two-digit
  // number to keep it inside the 12-unit chest.
  const numberSize = numStr.length >= 2 ? 5.5 : 7.5;

  return (
    <Svg width={size} height={size * 1.5} viewBox="0 0 24 36">
      {/* Active backlight behind the whole body. */}
      {active ? <Ellipse cx={12} cy={20} rx={11.5} ry={15} fill={palette.gold} opacity={0.22} /> : null}
      {/* Feet anchor: a bright gold floor ring when active, else a soft ground shadow. */}
      {active ? (
        <Ellipse cx={12} cy={35} rx={9} ry={2.4} fill="none" stroke={palette.gold} strokeWidth={1} opacity={0.95} />
      ) : (
        <Ellipse cx={12} cy={35} rx={8} ry={2} fill={palette.shadow} opacity={0.35} />
      )}

      {/* Arms + hands, behind the jersey so the torso reads in front. */}
      <Rect x={3} y={12} width={3} height={9} fill={skin} />
      <Rect x={18} y={12} width={3} height={9} fill={skin} />
      <Rect x={3} y={21} width={3} height={2} fill={skinShadow} />
      <Rect x={18} y={21} width={3} height={2} fill={skinShadow} />

      {/* Jersey: base, shaded right side + armhole notches (detailed only), collar. */}
      <Rect x={6} y={11.5} width={12} height={9} fill={color} />
      {detailed ? (
        <>
          <Rect x={13} y={11.5} width={5} height={9} fill={jerseyShade} />
          <Rect x={6} y={11.5} width={1.5} height={4} fill={jerseyShade} />
          <Rect x={16.5} y={11.5} width={1.5} height={4} fill={jerseyShade} />
        </>
      ) : null}
      <Rect x={9.5} y={11.5} width={5} height={1.5} fill={trim} />
      <SvgText
        x={12}
        y={18.3}
        fontFamily={FONT.display}
        fontSize={numberSize}
        textAnchor="middle"
        fill={numberInk}
      >
        {numStr}
      </SvgText>

      {/* Shorts: base, shade, waistband + side stripes (detailed only). */}
      <Rect x={6.5} y={20.5} width={11} height={6} fill={shortsColor} />
      {detailed ? <Rect x={12} y={20.5} width={5.5} height={6} fill={shortsShade} /> : null}
      <Rect x={6.5} y={20.5} width={11} height={1} fill={trim} />
      {detailed ? (
        <>
          <Rect x={6.5} y={20.5} width={0.8} height={6} fill={trim} />
          <Rect x={16.7} y={20.5} width={0.8} height={6} fill={trim} />
        </>
      ) : null}

      {/* Bare legs (shaded right leg when detailed). */}
      <Rect x={7.5} y={26.5} width={3.5} height={6} fill={skin} />
      <Rect x={13} y={26.5} width={3.5} height={6} fill={skin} />
      {detailed ? <Rect x={14.75} y={26.5} width={1.75} height={6} fill={skinShadow} /> : null}

      {/* Sneakers with ink soles. */}
      <Rect x={6.5} y={32.5} width={5} height={2.5} fill={palette.orange} />
      <Rect x={12.5} y={32.5} width={5} height={2.5} fill={palette.orange} />
      <Rect x={6.5} y={34.5} width={5} height={0.6} fill={palette.ink} />
      <Rect x={12.5} y={34.5} width={5} height={0.6} fill={palette.ink} />

      {/* Head, hairline, eyes, neck. */}
      <Rect x={8} y={2} width={8} height={8} fill={skin} />
      <Rect x={8} y={2} width={8} height={2} fill={hairShade} />
      <Rect x={9.5} y={5.5} width={1} height={1.5} fill={palette.bgPanel} />
      <Rect x={13.5} y={5.5} width={1} height={1.5} fill={palette.bgPanel} />
      <Rect x={10.5} y={10} width={3} height={1.5} fill={skinShadow} />

      {/* Crisp silhouette outline last, so the sprite reads as a sticker on the floor. */}
      {OUTLINE_PARTS.map(([x, y, w, h], i) => (
        <Rect key={i} x={x} y={y} width={w} height={h} fill="none" stroke={outline} strokeWidth={0.6} />
      ))}
    </Svg>
  );
}

/**
 * Memoized: every prop is a primitive that rarely changes, so the idle sprites on
 * the court skip re-rendering on each play-by-play event (only the active player's
 * `active` flag flips). Behavior is unchanged.
 */
export const PixelPlayer = memo(PixelPlayerView);
