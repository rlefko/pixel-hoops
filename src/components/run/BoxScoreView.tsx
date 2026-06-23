import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { CrownIcon, EnergyPips } from '@/components/run/PixelIcons';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { BoxLine } from '@/types/sim';
import type { Team } from '@/types/team';

/**
 * The post-game box score: a compact, tabular read of who did what. Grouped by
 * team under a team-colored header, monospace body for column alignment, each
 * team's top scorer crowned. Stays collapsed behind a toggle in the postgame so
 * the retry stays one tap away (see RunScreen Postgame).
 */

interface BoxScoreViewProps {
  home: Team;
  away: Team;
  box: { home: BoxLine[]; away: BoxLine[] };
}

const COLUMNS = ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK'] as const;
/** Trailing energy glyph header (kept narrow; pips are the at-a-glance read). */
const ENERGY_HEADER = 'NRG';

/** Index of the highest scorer (ties: first), or -1 if no one scored. */
function topScorerIndex(lines: BoxLine[]): number {
  let best = -1;
  let bestPts = 0;
  lines.forEach((l, i) => {
    if (l.pts > bestPts) {
      bestPts = l.pts;
      best = i;
    }
  });
  return best;
}

export function BoxScoreView({ home, away, box }: BoxScoreViewProps) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <TeamBox team={home} lines={box.home} />
      <TeamBox team={away} lines={box.away} />
    </ScrollView>
  );
}

function TeamBox({ team, lines }: { team: Team; lines: BoxLine[] }) {
  const top = topScorerIndex(lines);
  return (
    <View style={styles.teamBlock}>
      <View style={[styles.teamHeader, { backgroundColor: team.colorHex }]}>
        <Text style={styles.teamName} numberOfLines={1}>
          {team.name}
        </Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.cellName, styles.headerText]}>PLAYER</Text>
        {COLUMNS.map((c) => (
          <Text key={c} style={[styles.cell, styles.headerText]}>
            {c}
          </Text>
        ))}
        <Text style={[styles.energyCell, styles.headerText]}>{ENERGY_HEADER}</Text>
      </View>

      {lines.map((line, i) => (
        <StatRow key={`${line.name}-${i}`} line={line} top={i === top} />
      ))}
    </View>
  );
}

function StatRow({ line, top }: { line: BoxLine; top: boolean }) {
  const minutes = Math.round(line.seconds / 60);
  // A player who never checked in adds noise; dim them to the bench tail.
  const benched = line.seconds === 0;
  const values = [minutes, line.pts, line.reb, line.ast, line.stl, line.blk];
  return (
    <View style={[styles.row, benched && styles.benched, top && styles.topRow]}>
      <View style={styles.cellName}>
        {top ? <CrownIcon size={12} color={palette.gold} /> : null}
        <Text
          style={[styles.name, top && styles.topName]}
          numberOfLines={1}
        >
          {line.name}
        </Text>
      </View>
      {values.map((v, i) => (
        <Text key={i} style={[styles.cell, styles.value, top && styles.topName]}>
          {v}
        </Text>
      ))}
      <View style={styles.energyCell}>
        {benched ? null : <EnergyPips energy={line.energy} size={7} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'stretch' },
  content: { gap: space(4), paddingBottom: space(4) },
  teamBlock: { alignSelf: 'stretch' },
  teamHeader: {
    paddingVertical: space(1.5),
    paddingHorizontal: space(2),
    borderRadius: RADIUS.chip,
  },
  teamName: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.bgDeep,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(1),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.inkDim,
  },
  headerText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(1),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
  },
  benched: { opacity: 0.4 },
  topRow: { backgroundColor: palette.gold + '14' },
  cellName: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
  },
  name: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  topName: { color: palette.gold },
  cell: {
    width: 34,
    textAlign: 'center',
  },
  energyCell: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
});
