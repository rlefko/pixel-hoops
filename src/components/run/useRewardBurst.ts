import { useCallback, useRef } from 'react';
import { haptics } from '@/feel';
import { palette } from '@/theme';
import type { ShakeViewHandle, FlashOverlayHandle } from '@/components/fx';

/**
 * Reusable, rarity-gated reward "pop": one call fires a screen shake, a color
 * flash, and a haptic, all scaled by how big the reward is. Every channel no-ops
 * under FeelSettings (reduced motion / shake off / haptics off), so it is
 * accessibility- and CI-safe. The juice MUST scale with rarity, never be uniform
 * (a flat reward beat is the presentation-layer version of the "+2 everywhere"
 * problem this whole change fixes).
 *
 * Usage: hold the returned refs on a <ShakeView> wrapper and a <FlashOverlay>,
 * and call fire(tier) on a reward pick.
 */
export type RewardTier = 'small' | 'medium' | 'big';

const TIER: Record<
  RewardTier,
  { shake: 'light' | 'medium' | 'heavy'; color: string; peak: number; haptic: () => void }
> = {
  small: { shake: 'light', color: palette.makeGreen, peak: 0.12, haptic: haptics.selection },
  medium: { shake: 'medium', color: palette.gold, peak: 0.22, haptic: haptics.success },
  big: { shake: 'heavy', color: palette.flame, peak: 0.34, haptic: haptics.bigPlay },
};

export function useRewardBurst() {
  const shakeRef = useRef<ShakeViewHandle>(null);
  const flashRef = useRef<FlashOverlayHandle>(null);

  const fire = useCallback((tier: RewardTier) => {
    const t = TIER[tier];
    shakeRef.current?.shake(t.shake);
    flashRef.current?.flash(t.color, { peak: t.peak });
    t.haptic();
  }, []);

  return { shakeRef, flashRef, fire };
}
