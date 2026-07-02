import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PixelCrowd, type PixelCrowdHandle } from '@/components/fx';
import { SEAT_PITCH } from '@/components/fx/pixelCrowdLayout';
import type { ArenaTier } from '@/game/arena-tier';

/**
 * The peak-game crowd in the watch's out-of-bounds apron. Routine games keep the
 * clean dark apron — mounting this only for elite/boss/championship IS the
 * escalation, and the seats fill with the stakes (elite a sparse band, the
 * championship a packed double row). On phones the aspect-locked court is
 * height-limited, so the apron is the left/right columns and the strips run
 * vertical; the top/bottom fallback covers wide layouts. Tiny aprons render
 * nothing (graceful degrade).
 *
 * Static at rest (never a loop on the live watch): reactions come only through
 * the imperative `react()` handle, driven by CourtView's arrival callback for
 * the HOME side, so the crowd is a diegetic momentum meter — it never stirs for
 * the opponent.
 */

/** The fan-out handle mirrors the strip primitive's contract exactly. */
export type ApronCrowdHandle = PixelCrowdHandle;

interface ApronCrowdProps {
  /** CourtView's measured container. */
  availWidth: number;
  availHeight: number;
  /** The aspect-locked court centered inside it. */
  courtWidth: number;
  courtHeight: number;
  tier: Exclude<ArenaTier, 'routine'>;
  /** Per-arena determinism (the away team's name): each host seats its own crowd. */
  seed: string | number;
}

/** Below this apron thickness there is no room for a strip at all. */
const MIN_APRON = 18;
/** A second row (championship only) needs this much apron to breathe. */
const TWO_ROW_APRON = 26;
const MAX_SEATS = 36;
const DENSITY: Record<Exclude<ArenaTier, 'routine'>, number> = {
  elite: 0.65,
  boss: 0.85,
  championship: 1,
};

export const ApronCrowd = memo(
  forwardRef<ApronCrowdHandle, ApronCrowdProps>(function ApronCrowd(
    { availWidth, availHeight, courtWidth, courtHeight, tier, seed },
    ref
  ) {
    const near = useRef<PixelCrowdHandle>(null);
    const far = useRef<PixelCrowdHandle>(null);
    useImperativeHandle(
      ref,
      () => ({
        react: (kind) => {
          near.current?.react(kind);
          far.current?.react(kind);
        },
      }),
      []
    );

    const apronX = (availWidth - courtWidth) / 2;
    const apronY = (availHeight - courtHeight) / 2;
    const vertical = apronX >= MIN_APRON;
    if (!vertical && apronY < MIN_APRON) return null;

    const apron = vertical ? apronX : apronY;
    const rows = tier === 'championship' && apron >= TWO_ROW_APRON ? 2 : 1;
    const density = DENSITY[tier];
    const inset = Math.max(0, (apron - rows * SEAT_PITCH) / 2);

    if (vertical) {
      const length = Math.min(courtHeight, MAX_SEATS * SEAT_PITCH);
      const top = (availHeight - length) / 2;
      return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PixelCrowd
            ref={near}
            orientation="vertical"
            length={length}
            rows={rows}
            density={density}
            seed={`${seed}-l`}
            style={{ position: 'absolute', left: inset, top }}
          />
          <PixelCrowd
            ref={far}
            orientation="vertical"
            length={length}
            rows={rows}
            density={density}
            seed={`${seed}-r`}
            style={{ position: 'absolute', right: inset, top }}
          />
        </View>
      );
    }

    const length = Math.min(courtWidth, MAX_SEATS * SEAT_PITCH);
    const left = (availWidth - length) / 2;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <PixelCrowd
          ref={near}
          length={length}
          rows={rows}
          density={density}
          seed={`${seed}-t`}
          style={{ position: 'absolute', top: inset, left }}
        />
        <PixelCrowd
          ref={far}
          length={length}
          rows={rows}
          density={density}
          seed={`${seed}-b`}
          style={{ position: 'absolute', bottom: inset, left }}
        />
      </View>
    );
  })
);
