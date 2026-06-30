import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Mask, Path, Rect } from 'react-native-svg';
import { palette } from '@/theme';
import type { MapNodeType } from '@/types/run-map';
import type { VictoryTierKey } from '@/game/victory-tier';

/**
 * Tiny 8-bit icons drawn with plain Views (no assets), matching the procedural
 * style of PixelPlayer. One per run-map node type plus the two
 * resource glyphs (coin, star). Each takes a square `size` and a `color`.
 */

interface IconProps {
  size: number;
  color: string;
}

function box(size: number) {
  return { width: size, height: size, alignItems: 'center', justifyContent: 'center' } as const;
}

/**
 * game: a basketball. An orange disc crossed by the four classic seams: a
 * vertical and a horizontal center seam plus two curved side seams that hug the
 * left and right of the ball. Drawn with react-native-svg (as in SvgCourt) so
 * the curves scale cleanly across icon sizes and render the same on iOS,
 * Android, and web. Seams are clipped to the disc so nothing spills past the
 * silhouette.
 */
export function BasketballIcon({ size, color }: IconProps) {
  // Seams read ~8% of the icon, matching the old Math.round(size * 0.08) look:
  // 0.08 * 32 (the viewBox span) = 2.56 viewBox units.
  const seam = 2.6;
  const clipId = useId();
  return (
    <View style={box(size)}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={16} cy={16} r={16} />
          </ClipPath>
        </Defs>
        <Circle cx={16} cy={16} r={16} fill={color} />
        <G clipPath={`url(#${clipId})`} stroke={palette.bgPanel} strokeWidth={seam} fill="none">
          {/* Center seams */}
          <Line x1={16} y1={0} x2={16} y2={32} />
          <Line x1={0} y1={16} x2={32} y2={16} />
          {/* Side seams: half-ellipses (rx 9, ry 16) down each edge, curving inward */}
          <Path d="M 0 0 A 9 16 0 0 1 0 32" />
          <Path d="M 32 0 A 9 16 0 0 0 32 32" />
        </G>
      </Svg>
    </View>
  );
}

function upTriangle(halfWidth: number, height: number, color: string) {
  return {
    width: 0,
    height: 0,
    borderLeftWidth: halfWidth,
    borderRightWidth: halfWidth,
    borderBottomWidth: height,
    borderTopWidth: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: color,
    backgroundColor: 'transparent',
  } as const;
}

/** elite: a flame (round base under a point). */
export function FlameIcon({ size, color }: IconProps) {
  return (
    <View style={box(size)}>
      <View style={upTriangle(size * 0.3, size * 0.55, color)} />
      <View
        style={{
          width: size * 0.62,
          height: size * 0.42,
          marginTop: -size * 0.18,
          borderRadius: size * 0.31,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** boss: a three-point crown. */
export function CrownIcon({ size, color }: IconProps) {
  return (
    <View style={box(size)}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: size * 0.04 }}>
        <View style={upTriangle(size * 0.14, size * 0.34, color)} />
        <View style={upTriangle(size * 0.16, size * 0.46, color)} />
        <View style={upTriangle(size * 0.14, size * 0.34, color)} />
      </View>
      <View
        style={{ width: size * 0.74, height: size * 0.22, marginTop: -1, backgroundColor: color }}
      />
    </View>
  );
}

/** coach: a referee/coach whistle (chamber + mouthpiece + a lanyard nub). */
export function WhistleIcon({ size, color }: IconProps) {
  const body = size * 0.56;
  return (
    <View style={box(size)}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.1,
          left: size * 0.42,
          width: Math.max(1, size * 0.12),
          height: size * 0.16,
          backgroundColor: color,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: size * 0.12 }}>
        <View
          style={{
            width: body,
            height: body,
            borderRadius: body / 2,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: body * 0.3,
              height: body * 0.3,
              borderRadius: body * 0.15,
              backgroundColor: palette.bgPanel,
            }}
          />
        </View>
        <View
          style={{
            width: size * 0.22,
            height: size * 0.2,
            marginLeft: -size * 0.03,
            borderTopRightRadius: 2,
            borderBottomRightRadius: 2,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

/** locked: a padlock (an open-bottom shackle arch over a body with a keyhole). */
export function LockIcon({ size, color }: IconProps) {
  const shackleW = size * 0.42;
  return (
    <View style={box(size)}>
      <View
        style={{
          width: shackleW,
          height: size * 0.34,
          borderWidth: Math.max(1, Math.round(size * 0.1)),
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: shackleW / 2,
          borderTopRightRadius: shackleW / 2,
          marginBottom: -size * 0.06,
        }}
      />
      <View
        style={{
          width: size * 0.7,
          height: size * 0.5,
          borderRadius: Math.max(1, Math.round(size * 0.08)),
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.12,
            height: size * 0.12,
            borderRadius: size * 0.06,
            backgroundColor: palette.bgPanel,
          }}
        />
      </View>
    </View>
  );
}

/** recruit: a person with a plus. */
export function RecruitIcon({ size, color }: IconProps) {
  const bar = Math.max(1, Math.round(size * 0.1));
  return (
    <View style={box(size)}>
      <View
        style={{ width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17, backgroundColor: color }}
      />
      <View
        style={{
          width: size * 0.6,
          height: size * 0.3,
          marginTop: size * 0.05,
          borderTopLeftRadius: size * 0.3,
          borderTopRightRadius: size * 0.3,
          backgroundColor: color,
        }}
      />
      <View style={{ position: 'absolute', top: 0, right: size * 0.04 }}>
        <View
          style={{ position: 'absolute', width: size * 0.34, height: bar, top: size * 0.12, left: -size * 0.04, backgroundColor: color }}
        />
        <View
          style={{ position: 'absolute', width: bar, height: size * 0.34, top: 0, left: size * 0.11, backgroundColor: color }}
        />
      </View>
    </View>
  );
}

/** training: a dumbbell. */
export function DumbbellIcon({ size, color }: IconProps) {
  const plate = size * 0.3;
  return (
    <View style={box(size)}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: plate, height: plate * 1.4, backgroundColor: color }} />
        <View style={{ width: size * 0.24, height: size * 0.14, backgroundColor: color }} />
        <View style={{ width: plate, height: plate * 1.4, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** rest: a Z. */
export function RestIcon({ size, color }: IconProps) {
  const bar = Math.max(2, Math.round(size * 0.14));
  const w = size * 0.66;
  return (
    <View style={box(size)}>
      <View style={{ width: w, height: bar, backgroundColor: color }} />
      <View
        style={{
          width: Math.hypot(w, size * 0.4),
          height: bar,
          backgroundColor: color,
          transform: [{ rotate: '-50deg' }],
        }}
      />
      <View style={{ width: w, height: bar, backgroundColor: color }} />
    </View>
  );
}

/** boost: an up-arrow (a power-up: grab one free item). */
export function BoostIcon({ size, color }: IconProps) {
  const stem = Math.max(2, Math.round(size * 0.22));
  return (
    <View style={box(size)}>
      <View style={upTriangle(size * 0.32, size * 0.36, color)} />
      <View style={{ width: stem, height: size * 0.34, marginTop: -1, backgroundColor: color }} />
    </View>
  );
}

/** coins: a coin (the run/locker-room currency glyph). */
export function CoinIcon({ size, color }: IconProps) {
  return (
    <View style={box(size)}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: size * 0.25,
            borderWidth: Math.max(1, Math.round(size * 0.08)),
            borderColor: palette.bgPanel,
          }}
        />
      </View>
    </View>
  );
}

/** reputation: an eight-point star (two overlapped squares). */
export function StarIcon({ size, color }: IconProps) {
  const s = size * 0.62;
  const square = { position: 'absolute' as const, width: s, height: s, backgroundColor: color };
  return (
    <View style={box(size)}>
      <View style={square} />
      <View style={[square, { transform: [{ rotate: '45deg' }] }]} />
    </View>
  );
}

/** timeout: a clock face (a ring with two hands), the run's "second chance" glyph. */
export function ClockIcon({ size, color }: IconProps) {
  const hand = Math.max(1, Math.round(size * 0.1));
  return (
    <View style={box(size)}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: size * 0.31,
            backgroundColor: palette.bgPanel,
          }}
        />
        {/* minute hand (up) and hour hand (right), both anchored at the center. */}
        <View
          style={{
            position: 'absolute',
            width: hand,
            height: size * 0.26,
            left: (size - hand) / 2,
            top: size / 2 - size * 0.26,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: size * 0.2,
            height: hand,
            left: size / 2,
            top: (size - hand) / 2,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

/**
 * energy: three stacked cells that fill green/gold/red by an energy (0..100)
 * reading. Full energy lights all three green, mid lights two gold, low lights
 * one red. A quiet at-a-glance condition glyph for box scores and cards.
 */
export function EnergyPips({ energy, size = 10 }: { energy: number; size?: number }) {
  const cells = 3;
  const lit =
    energy >= 67 ? 3 : energy >= 34 ? 2 : energy > 0 ? 1 : 0;
  const litColor =
    lit >= 3 ? palette.energyHigh : lit === 2 ? palette.energyMid : palette.energyLow;
  const cellW = size;
  const cellH = Math.max(2, Math.round(size * 0.4));
  return (
    <View style={{ gap: Math.max(1, Math.round(size * 0.15)) }}>
      {Array.from({ length: cells }).map((_, i) => {
        // Fill bottom-up so the bar drains from the top as energy falls.
        const on = i >= cells - lit;
        return (
          <View
            key={i}
            style={{
              width: cellW,
              height: cellH,
              backgroundColor: on ? litColor : palette.bgPanel,
            }}
          />
        );
      })}
    </View>
  );
}

/** injury: a small red cross (two crossing bars). */
export function InjuryIcon({ size = 12 }: { size?: number }) {
  const bar = Math.max(2, Math.round(size * 0.32));
  return (
    <View style={box(size)}>
      <View
        style={{ position: 'absolute', width: size, height: bar, backgroundColor: palette.injury }}
      />
      <View
        style={{ position: 'absolute', width: bar, height: size, backgroundColor: palette.injury }}
      />
    </View>
  );
}

/** locker room: a locker door with two vent slats and a handle. */
export function LockerIcon({ size, color }: IconProps) {
  const w = size * 0.66;
  const slat = Math.max(1, Math.round(size * 0.08));
  return (
    <View style={box(size)}>
      <View
        style={{
          width: w,
          height: size,
          borderRadius: Math.max(1, Math.round(size * 0.08)),
          backgroundColor: color,
          alignItems: 'center',
          paddingTop: size * 0.16,
          gap: slat,
        }}
      >
        <View style={{ width: w * 0.5, height: slat, backgroundColor: palette.bgPanel }} />
        <View style={{ width: w * 0.5, height: slat, backgroundColor: palette.bgPanel }} />
        <View
          style={{
            position: 'absolute',
            right: size * 0.08,
            top: size * 0.46,
            width: Math.max(2, Math.round(size * 0.1)),
            height: Math.max(2, Math.round(size * 0.2)),
            backgroundColor: palette.bgPanel,
          }}
        />
      </View>
    </View>
  );
}

/** arcade: a joystick (ball top, stem, base). */
export function JoystickIcon({ size, color }: IconProps) {
  const ball = size * 0.36;
  const stem = Math.max(2, Math.round(size * 0.12));
  return (
    <View style={box(size)}>
      <View style={{ width: ball, height: ball, borderRadius: ball / 2, backgroundColor: color }} />
      <View style={{ width: stem, height: size * 0.28, backgroundColor: color }} />
      <View
        style={{
          width: size * 0.7,
          height: size * 0.16,
          borderTopLeftRadius: size * 0.08,
          borderTopRightRadius: size * 0.08,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * settings: an eight-tooth cog. Drawn with react-native-svg (as the basketball is) so
 * the teeth sit cleanly at 45-degree steps and the hub is a real transparent cutout
 * (via a mask), reading as a gear on any background. The old four-axis-teeth View
 * version read more like a plus.
 */
const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315];
export function GearIcon({ size, color }: IconProps) {
  const maskId = useId();
  return (
    <View style={box(size)}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Defs>
          <Mask id={maskId}>
            {/* white keeps, black cuts: the hub circle punches a transparent hole */}
            <Rect x={0} y={0} width={32} height={32} fill="white" />
            <Circle cx={16} cy={16} r={3.4} fill="black" />
          </Mask>
        </Defs>
        <G fill={color} mask={`url(#${maskId})`}>
          {GEAR_TEETH.map((angle) => (
            <Rect
              key={angle}
              x={13.5}
              y={3.5}
              width={5}
              height={6}
              transform={`rotate(${angle} 16 16)`}
            />
          ))}
          <Circle cx={16} cy={16} r={8.5} />
        </G>
      </Svg>
    </View>
  );
}

/** how to play: a question mark (top hook, stem, dot). */
export function HelpIcon({ size, color }: IconProps) {
  const bar = Math.max(2, Math.round(size * 0.16));
  const dot = Math.max(2, Math.round(size * 0.18));
  return (
    <View style={box(size)}>
      <View
        style={{
          width: size * 0.5,
          height: size * 0.4,
          borderTopLeftRadius: size * 0.25,
          borderTopRightRadius: size * 0.25,
          borderColor: color,
          borderTopWidth: bar,
          borderRightWidth: bar,
          borderLeftWidth: bar,
        }}
      />
      <View style={{ width: bar, height: size * 0.16, backgroundColor: color }} />
      <View style={{ width: dot, height: dot, marginTop: size * 0.08, backgroundColor: color }} />
    </View>
  );
}

const ICONS: Record<MapNodeType, (p: IconProps) => React.ReactElement> = {
  game: BasketballIcon,
  elite: FlameIcon,
  boss: CrownIcon,
  recruit: RecruitIcon,
  training: DumbbellIcon,
  rest: RestIcon,
  boost: BoostIcon,
};

/** Dispatch to the right icon for a node type. */
export function NodeIcon({ type, size, color }: { type: MapNodeType } & IconProps) {
  const Icon = ICONS[type];
  return <Icon size={size} color={color} />;
}

// The celebration-tier stamp glyph, reusing existing icons so each tier reads as a
// distinct pixel mark: a medallion, a star, a flame, and the champion's crown.
const TIER_ICONS: Record<VictoryTierKey, (p: IconProps) => React.ReactElement> = {
  rookie: CoinIcon,
  pro: StarIcon,
  elite: FlameIcon,
  legend: CrownIcon,
};

/** Dispatch to the right stamp icon for a victory tier. */
export function VictoryTierIcon({ tier, size, color }: { tier: VictoryTierKey } & IconProps) {
  const Icon = TIER_ICONS[tier];
  return <Icon size={size} color={color} />;
}
