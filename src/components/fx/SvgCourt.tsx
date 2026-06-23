import { memo } from 'react';
import Svg, { Rect, Line, Circle, Path } from 'react-native-svg';
import { palette } from '@/theme';
import {
  COURT,
  CENTER_LINE_Y,
  CENTER_CIRCLE,
  INNER_CIRCLE_R,
  LANE,
  FT_CIRCLE,
  BACKBOARD,
  RIM,
  RESTRICTED_R,
  THREE,
} from '@/components/game/courtDimensions';

/**
 * A programmatic NBA court drawn with react-native-svg. The viewBox is the court
 * itself in feet ("0 0 50 94"), so every marking below is specified in real
 * dimensions straight from courtDimensions: the center logo circles, both lanes
 * and free-throw circles, the backboards and rims, the restricted-area arcs, and
 * the true three-point line (straight corners joined to a 23.75 ft arc). It sits
 * behind the play-by-play feed and is themed per matchup (the opponent's arena,
 * see courtThemeFor), defaulting to the house palette. The parent court box is
 * aspect-locked to 50:94, so feet map to pixels uniformly and the rims line up
 * with the ball-flight target (see courtGeometry.rimCenterPx).
 */

/** Stroke widths in feet (1 unit = 1 ft). At a typical court these read ~2 px. */
const LINE_FT = 0.3;
const BORDER_FT = 0.45;
const RIM_FT = 0.4;
const NET_FT = 0.18;
/** How far the net strands droop off the rim, in feet. */
const NET_LEN = 1.7;
/** Dashes for the in-lane half of each free-throw circle, in feet. */
const FT_DASH = '0.8,0.6';

interface SvgCourtProps {
  /** Floor fill. Defaults to the house court color. */
  floorColor?: string;
  /** Border, lines, lanes, and circles. Defaults to the house court line. */
  lineColor?: string;
  /** Rim color. Defaults to the brand orange. */
  accentColor?: string;
}

/** Map a depth in feet from a baseline to a y in the viewBox, per end. */
function depthY(end: 'top' | 'bottom', depthFt: number): number {
  return end === 'top' ? depthFt : COURT.length - depthFt;
}

/** The true three-point line for one end: straight corners into a 23.75 ft arc. */
function threePtPath(end: 'top' | 'bottom'): string {
  const base = depthY(end, 0);
  const junc = depthY(end, THREE.cornerTopY);
  const sweep = end === 'top' ? 0 : 1;
  return `M ${THREE.cornerX} ${base} L ${THREE.cornerX} ${junc} A ${THREE.radius} ${THREE.radius} 0 0 ${sweep} ${THREE.cornerXFar} ${junc} L ${THREE.cornerXFar} ${base}`;
}

/** Restricted-area semicircle (radius 4) under a basket, bowing to mid-court. */
function restrictedPath(end: 'top' | 'bottom'): string {
  const cy = depthY(end, RIM.cy);
  const sweep = end === 'top' ? 0 : 1;
  return `M ${RIM.cx - RESTRICTED_R} ${cy} A ${RESTRICTED_R} ${RESTRICTED_R} 0 0 ${sweep} ${RIM.cx + RESTRICTED_R} ${cy}`;
}

/** One half of a free-throw circle. `side` picks the mid-court or in-lane half. */
function ftHalfPath(end: 'top' | 'bottom', side: 'mid-court' | 'lane'): string {
  const cy = depthY(end, FT_CIRCLE.cy);
  // Top end: the mid-court half bows to +y (sweep 0); bottom end is mirrored.
  // The lane half is just the opposite sweep.
  const midCourtSweep = end === 'top' ? 0 : 1;
  const sweep = side === 'mid-court' ? midCourtSweep : 1 - midCourtSweep;
  return `M ${FT_CIRCLE.cx - FT_CIRCLE.r} ${cy} A ${FT_CIRCLE.r} ${FT_CIRCLE.r} 0 0 ${sweep} ${FT_CIRCLE.cx + FT_CIRCLE.r} ${cy}`;
}

/** A short hanging net under a rim: a few strands drooping toward mid-court. */
function NetStrands({ end, color }: { end: 'top' | 'bottom'; color: string }) {
  const top = depthY(end, RIM.cy);
  const len = end === 'top' ? NET_LEN : -NET_LEN;
  const xs = [RIM.cx - 0.6, RIM.cx, RIM.cx + 0.6];
  return (
    <>
      {xs.map((x) => (
        <Line
          key={x}
          x1={x}
          y1={top}
          x2={x}
          y2={top + len}
          stroke={color}
          strokeWidth={NET_FT}
          opacity={0.55}
        />
      ))}
    </>
  );
}

/** All markings for one basket end, mirrored about the center line per `end`. */
function EndMarkings({
  end,
  lineColor,
  accentColor,
}: {
  end: 'top' | 'bottom';
  lineColor: string;
  accentColor: string;
}) {
  const laneY = end === 'top' ? 0 : COURT.length - LANE.depth;
  const backboardY = depthY(end, BACKBOARD.y);
  const rimY = depthY(end, RIM.cy);
  return (
    <>
      {/* Lane / paint */}
      <Rect
        x={LANE.x}
        y={laneY}
        width={LANE.w}
        height={LANE.depth}
        fill="none"
        stroke={lineColor}
        strokeWidth={LINE_FT}
      />
      {/* Free-throw circle: solid mid-court half, dashed in-lane half */}
      <Path d={ftHalfPath(end, 'mid-court')} fill="none" stroke={lineColor} strokeWidth={LINE_FT} />
      <Path
        d={ftHalfPath(end, 'lane')}
        fill="none"
        stroke={lineColor}
        strokeWidth={LINE_FT}
        strokeDasharray={FT_DASH}
      />
      {/* True three-point line */}
      <Path d={threePtPath(end)} fill="none" stroke={lineColor} strokeWidth={LINE_FT} />
      {/* Restricted area */}
      <Path d={restrictedPath(end)} fill="none" stroke={lineColor} strokeWidth={LINE_FT} />
      {/* Backboard */}
      <Line
        x1={BACKBOARD.x1}
        y1={backboardY}
        x2={BACKBOARD.x2}
        y2={backboardY}
        stroke={lineColor}
        strokeWidth={LINE_FT}
        strokeLinecap="round"
      />
      {/* Net then rim, so the rim reads in front */}
      <NetStrands end={end} color={palette.inkDim} />
      <Circle cx={RIM.cx} cy={rimY} r={RIM.r} fill="none" stroke={accentColor} strokeWidth={RIM_FT} />
    </>
  );
}

export const SvgCourt = memo(function SvgCourt({
  floorColor = palette.bgCourt,
  lineColor = palette.courtLine,
  accentColor = palette.orange,
}: SvgCourtProps) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${COURT.width} ${COURT.length}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Floor and boundary (inset so the stroke is not clipped at the edge) */}
      <Rect x={0} y={0} width={COURT.width} height={COURT.length} fill={floorColor} />
      <Rect
        x={BORDER_FT / 2}
        y={BORDER_FT / 2}
        width={COURT.width - BORDER_FT}
        height={COURT.length - BORDER_FT}
        fill="none"
        stroke={lineColor}
        strokeWidth={BORDER_FT}
      />

      {/* Half-court line and the two center circles */}
      <Line
        x1={0}
        y1={CENTER_LINE_Y}
        x2={COURT.width}
        y2={CENTER_LINE_Y}
        stroke={lineColor}
        strokeWidth={LINE_FT}
      />
      <Circle
        cx={CENTER_CIRCLE.cx}
        cy={CENTER_CIRCLE.cy}
        r={CENTER_CIRCLE.r}
        fill="none"
        stroke={lineColor}
        strokeWidth={LINE_FT}
      />
      <Circle
        cx={CENTER_CIRCLE.cx}
        cy={CENTER_CIRCLE.cy}
        r={INNER_CIRCLE_R}
        fill="none"
        stroke={lineColor}
        strokeWidth={LINE_FT}
      />

      <EndMarkings end="top" lineColor={lineColor} accentColor={accentColor} />
      <EndMarkings end="bottom" lineColor={lineColor} accentColor={accentColor} />
    </Svg>
  );
});
