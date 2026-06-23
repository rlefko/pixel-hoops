import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useBallFlight, type Pt } from '@/feel/useBallFlight';
import { useFeelSettings } from '@/feel';
import { spotPx, rimCenterPx } from '@/components/game/courtGeometry';
import { shotShapeFor, isNoteworthy } from '@/components/game/possession';
import { palette } from '@/theme';
import { type SimEvent } from '@/types/sim';

/**
 * The game ball. On every shot it leaves the shooter and arcs to the rim they
 * attack, then resolves: a make drops through the net, a miss clanks off the
 * iron, a block gets swatted away, a steal is knocked loose. `onArrival` fires
 * the instant the ball reaches the rim so the make/miss flourish lands with it.
 * Hidden between shots. Skipped under reduced motion (the held ball on the active
 * sprite is the read), but `onArrival` still fires so the beat resolves.
 */

interface BallFlightProps {
  /** The event being shown, or null before tip-off. */
  event: SimEvent | null;
  /** Measured court size, for converting court fractions to pixels. */
  width: number;
  height: number;
  /** Fired when the ball reaches the rim, to sync the landing flourish. */
  onArrival?: (e: SimEvent) => void;
}

const BALL = 9;

// Where the ball ends up after it reaches the rim, by outcome.
const BLOCK_REACH = 0.82; // a block meets the ball this far toward the rim
const LOOSE_REACH = 0.35; // a steal/turnover knocks it loose this early
const DEFLECT_DX = 30; // sideways kick on a block
const DEFLECT_DY = 22; // ...and back toward mid-court
const CAROM_DX = 34; // sideways kick on a miss off the iron
const CAROM_DY = 24; // ...and back toward mid-court
const DROP_THROUGH = 10; // a make drops this far down through the net
const DUNK_DROP_THROUGH = 22; // a dunk rams the ball harder through the net

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function BallFlight({ event, width, height, onArrival }: BallFlightProps) {
  const { reducedMotion, highlightsOnly } = useFeelSettings();
  const { ballStyle, trailStyles, fire } = useBallFlight();
  const lastSeq = useRef<number | null>(null);

  useEffect(() => {
    if (!event || width === 0 || height === 0) return;
    if (event.seq === lastSeq.current) return;
    lastSeq.current = event.seq;

    // Highlights: routine non-scoring plays whip by with no ball, but still
    // resolve so the score and ticker stay correct.
    if (highlightsOnly && !isNoteworthy(event)) {
      onArrival?.(event);
      return;
    }

    const shape = shotShapeFor(event);
    // The ball leaves the shooter at its stable base (the floor no longer
    // advances per possession), so pass null and the ball matches the sprite.
    const origin = spotPx(event.team, event.scorerPosition, width, height, null);
    const rim = rimCenterPx(event.team, width, height);
    // Mid-court is +y from the top hoop and -y from the bottom hoop.
    const dropSign = event.team === 'home' ? 1 : -1;
    // Alternate the carom side by sequence so back-to-back misses don't bounce
    // the same way.
    const caromSide = event.seq % 2 === 0 ? 1 : -1;
    const arrival = onArrival ? () => onArrival(event) : undefined;

    let target = rim;
    let resolve: Pt;
    if (shape === 'block') {
      target = lerp(origin, rim, BLOCK_REACH); // met short of the rim
      resolve = { x: target.x + caromSide * DEFLECT_DX, y: target.y + dropSign * DEFLECT_DY };
    } else if (shape === 'loose') {
      target = lerp(origin, rim, LOOSE_REACH); // knocked loose early
      resolve = { x: target.x + caromSide * DEFLECT_DX, y: target.y };
    } else if (shape === 'miss') {
      resolve = { x: rim.x + caromSide * CAROM_DX, y: rim.y + dropSign * CAROM_DY }; // carom off iron
    } else {
      const drop = shape === 'dunk' ? DUNK_DROP_THROUGH : DROP_THROUGH;
      resolve = { x: rim.x, y: rim.y + dropSign * drop }; // ram/drop through the net
    }

    fire({ origin, target, resolve, shape, onArrival: arrival });
  }, [event, width, height, fire, onArrival, highlightsOnly]);

  if (reducedMotion) return null;
  return (
    <>
      {trailStyles.map((ts, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.trail, ts]} />
      ))}
      <Animated.View pointerEvents="none" style={[styles.ball, ballStyle]} />
    </>
  );
}

const TRAIL = 6;

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
  trail: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TRAIL,
    height: TRAIL,
    marginLeft: -TRAIL / 2,
    marginTop: -TRAIL / 2,
    borderRadius: TRAIL / 2,
    backgroundColor: palette.orange,
  },
});
