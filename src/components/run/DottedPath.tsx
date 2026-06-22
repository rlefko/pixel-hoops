import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { palette } from '@/theme';
import type { Edge, EdgeState } from './map-geometry';

/**
 * One run-map edge drawn as a row of small square dots that occupy ONLY the gap
 * between two node tiles (the geometry insets the endpoints past the node
 * radius), so the trail never crosses a tile. Reachable branches glow gold, the
 * walked path shows dim gold, and future branches are a faint ink. Rendered
 * behind the opaque tiles. Pure layout, memoized so it does not recompute on
 * scroll.
 */

const DOT_PITCH = 9;

const STATE_STYLE: Record<EdgeState, { color: string; size: number }> = {
  reachable: { color: palette.gold, size: 4 },
  traveled: { color: palette.gold + '88', size: 3 },
  dim: { color: palette.inkDim + '66', size: 3 },
};

export const DottedPath = memo(function DottedPath({ edge }: { edge: Edge }) {
  const { sx, sy, ex, ey, gapLen, state } = edge;
  const s = STATE_STYLE[state];
  const dotCount = Math.max(2, Math.round(gapLen / DOT_PITCH));

  const dots = useMemo(() => {
    return Array.from({ length: dotCount }, (_, i) => {
      const t = i / (dotCount - 1);
      return {
        left: sx + (ex - sx) * t - s.size / 2,
        top: sy + (ey - sy) * t - s.size / 2,
      };
    });
  }, [sx, sy, ex, ey, dotCount, s.size]);

  return (
    <>
      {dots.map((p, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: s.size,
            height: s.size,
            borderRadius: 1,
            backgroundColor: s.color,
          }}
        />
      ))}
    </>
  );
});
