import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { ParticleBurst, type BurstVariant } from '@/components/fx';

/**
 * Fires a single ParticleBurst from the center of its parent once it has laid out
 * (so the origin is correct without hardcoding sizes). Drop it inside any
 * relatively-positioned container to add a one-shot pixel burst on mount. Auto
 * no-ops under reduced motion (ParticleBurst returns null).
 */
export function CenterBurst({ variant, color }: { variant: BurstVariant; color?: string }) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setOrigin({ x: width / 2, y: height / 2 });
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {/* ParticleBurst stays null until origin lands, then fires once on its mount. */}
      <ParticleBurst origin={origin} variant={variant} color={color} trigger={1} />
    </View>
  );
}
