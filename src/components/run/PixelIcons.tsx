import { View } from 'react-native';
import { palette } from '@/theme';
import type { MapNodeType } from '@/types/run-map';

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

/** game: a basketball with two seams. */
export function BasketballIcon({ size, color }: IconProps) {
  const seam = Math.max(1, Math.round(size * 0.08));
  return (
    <View style={box(size)}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{ position: 'absolute', width: seam, height: size, backgroundColor: palette.bgPanel }}
        />
        <View
          style={{ position: 'absolute', width: size, height: seam, backgroundColor: palette.bgPanel }}
        />
      </View>
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

/** shop / coins: a coin. */
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

const ICONS: Record<MapNodeType, (p: IconProps) => React.ReactElement> = {
  game: BasketballIcon,
  elite: FlameIcon,
  boss: CrownIcon,
  recruit: RecruitIcon,
  training: DumbbellIcon,
  rest: RestIcon,
  shop: CoinIcon,
};

/** Dispatch to the right icon for a node type. */
export function NodeIcon({ type, size, color }: { type: MapNodeType } & IconProps) {
  const Icon = ICONS[type];
  return <Icon size={size} color={color} />;
}
