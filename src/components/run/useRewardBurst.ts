import { useCallback, useRef, useState } from 'react';
import { haptics, sfx } from '@/feel';
import { palette } from '@/theme';
import type { ShakeViewHandle, FlashOverlayHandle } from '@/components/fx';
import type { Rarity } from '@/game/rarity';
import { RARITY_COLOR } from './rarity-ui';

/**
 * Reusable, rarity-scaled reward "pop": one call fires a color flash, a haptic, and
 * (above common) a screen shake, all scaled by rarity. A common reward does NOT
 * shake (just a faint flash + selection tick); rare/epic shake harder; legendary
 * adds the heaviest shake, a bigPlay haptic, and a confetti burst (the caller reads
 * `confettiTrigger` to fire it and pairs it with a gold pulse). Every channel no-ops
 * under FeelSettings (reduced motion / shake off / haptics off), so it is
 * accessibility- and CI-safe. Juice MUST scale with rarity, never be uniform.
 *
 * Usage: hold the returned refs on a <ShakeView> wrapper and a <FlashOverlay>, call
 * fire(rarity) on a reward reveal, and (for legendary) render a <ParticleBurst
 * variant="confetti"> keyed on `confettiTrigger`. fire also plays a rarity-tiered
 * reward sting; pass { silent: true } when the caller plays its own sound (e.g. the
 * championship fanfare) so the two never stack.
 */
interface BurstSpec {
  shake: 'none' | 'light' | 'medium' | 'heavy';
  color: string;
  peak: number;
  haptic: () => void;
  confetti?: boolean;
}

const RARITY_BURST: Record<Rarity, BurstSpec> = {
  common: { shake: 'none', color: RARITY_COLOR.common, peak: 0.1, haptic: haptics.selection },
  rare: { shake: 'light', color: RARITY_COLOR.rare, peak: 0.16, haptic: haptics.success },
  epic: { shake: 'medium', color: RARITY_COLOR.epic, peak: 0.24, haptic: haptics.success },
  legendary: { shake: 'heavy', color: palette.gold, peak: 0.36, haptic: haptics.bigPlay, confetti: true },
};

export function useRewardBurst() {
  const shakeRef = useRef<ShakeViewHandle>(null);
  const flashRef = useRef<FlashOverlayHandle>(null);
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const fire = useCallback((rarity: Rarity, opts?: { silent?: boolean }) => {
    const t = RARITY_BURST[rarity];
    if (t.shake !== 'none') shakeRef.current?.shake(t.shake);
    flashRef.current?.flash(t.color, { peak: t.peak });
    t.haptic();
    if (!opts?.silent) sfx.reward(rarity);
    if (t.confetti) setConfettiTrigger((n) => n + 1);
  }, []);

  return { shakeRef, flashRef, fire, confettiTrigger };
}
