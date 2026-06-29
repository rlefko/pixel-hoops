import { View } from 'react-native';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { RADIUS } from '@/theme';
import type { Position } from '@/types/roster';

/**
 * A tiny inline row of colored squares, one per position, using the shared
 * POSITION_COLOR map. Draws a roster "shape" without sprites: used by the synergy
 * tiles and the guard-heavy vs big-heavy contrast cards on the How to Play page.
 */
export function PositionPips({ positions, size = 10 }: { positions: Position[]; size?: number }) {
  const gap = Math.max(2, Math.round(size * 0.4));
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {positions.map((p, i) => (
        <View
          key={`${p}-${i}`}
          style={{
            width: size,
            height: size,
            backgroundColor: POSITION_COLOR[p],
            borderRadius: RADIUS.chip,
          }}
        />
      ))}
    </View>
  );
}
