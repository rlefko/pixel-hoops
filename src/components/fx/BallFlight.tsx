import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useBallFlight } from '@/feel/useBallFlight';
import { useFeelSettings } from '@/feel';
import { spotPx, rimCenterPx } from '@/components/game/courtGeometry';
import { palette } from '@/theme';
import { isMadeShot, type SimEvent } from '@/types/sim';

/**
 * The shot ball: on a made basket it arcs from the shooter to the rim they
 * attack, landing in time with the score. Driven declaratively by the current
 * event and the measured court size. Hidden between shots (the held ball on the
 * active sprite covers possession). Skipped under reduced motion.
 */

interface BallFlightProps {
  /** The event being shown, or null before tip-off. */
  event: SimEvent | null;
  /** Measured court size, for converting court fractions to pixels. */
  width: number;
  height: number;
}

const BALL = 9;

export function BallFlight({ event, width, height }: BallFlightProps) {
  const { reducedMotion } = useFeelSettings();
  const { ballStyle, fire } = useBallFlight();
  const lastSeq = useRef<number | null>(null);

  useEffect(() => {
    if (!event || width === 0 || height === 0) return;
    if (event.seq === lastSeq.current) return;
    lastSeq.current = event.seq;
    if (!isMadeShot(event)) return;
    fire(
      spotPx(event.team, event.scorerPosition, width, height),
      rimCenterPx(event.team, width, height)
    );
  }, [event, width, height, fire]);

  if (reducedMotion) return null;
  return <Animated.View pointerEvents="none" style={[styles.ball, ballStyle]} />;
}

const styles = StyleSheet.create({
  ball: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BALL,
    height: BALL,
    marginLeft: -BALL / 2,
    marginTop: -BALL / 2,
    borderRadius: BALL / 2,
    backgroundColor: palette.orange,
    borderWidth: 1,
    borderColor: palette.courtLine,
  },
});
