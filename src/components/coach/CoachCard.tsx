import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { PixelButton } from '@/components/PixelButton';
import { WhistleIcon, LockIcon } from '@/components/run/PixelIcons';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { coachUnlockLabel, coachTags, type CoachProfile } from '@/game/coaches';
import { archetypeLabel } from '@/game/team-archetype';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * One coach in the collection: name, class badge, the system it builds toward, its
 * tempo / focus / rotation / usage tendencies, and a one-line blurb. Owned coaches can
 * be equipped (the equipped one is marked); locked coaches show how to win them. Mirrors
 * the player/hall-of-fame card styling so power reads at a glance by class color.
 */

interface CoachCardProps {
  coach: CoachProfile;
  owned: boolean;
  equipped: boolean;
  onEquip?: () => void;
}

function systemLabel(coach: CoachProfile): string {
  if (coach.system.length === 0) return 'Fundamentals';
  return coach.system.map(archetypeLabel).join(' / ');
}

export function CoachCard({ coach, owned, equipped, onEquip }: CoachCardProps) {
  const accent = CLASS_COLOR[coach.class];
  const tags = coachTags(coach);
  return (
    <View style={[styles.card, { borderColor: accent }, !owned && styles.locked]}>
      <View style={styles.header}>
        <WhistleIcon size={16} color={owned ? accent : palette.inkDim} />
        <Text style={[styles.name, { color: owned ? palette.ink : palette.inkDim }]} numberOfLines={1}>
          {coach.name}
        </Text>
        <View style={[styles.badge, { borderColor: accent }]}>
          <Text style={[styles.badgeText, { color: accent }]}>{coach.class}</Text>
        </View>
      </View>

      <Text style={[styles.system, { color: owned ? accent : palette.inkDim }]}>{systemLabel(coach)}</Text>
      <Text style={styles.blurb}>{coach.blurb}</Text>

      <View style={styles.tagRow}>
        {tags.map((t) => (
          <Text key={t.key} style={styles.tag}>
            {t.label}
          </Text>
        ))}
      </View>

      {owned ? (
        equipped ? (
          <Text style={[styles.equipped, { color: accent }]}>EQUIPPED</Text>
        ) : (
          <PixelButton label="EQUIP" variant="secondary" size="small" style={styles.equip} onPress={onEquip ?? (() => {})} />
        )
      ) : (
        <View style={styles.unlockRow}>
          <LockIcon size={11} color={palette.inkDim} />
          <Text style={styles.unlock}>{coachUnlockLabel(coach.unlock)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    gap: space(1),
  },
  locked: { opacity: 0.55 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  name: { flex: 1, fontFamily: FONT.display, fontSize: FONT_SIZE.small },
  badge: {
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.5),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
  },
  badgeText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  system: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, marginTop: space(1) },
  blurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.inkDim, lineHeight: FONT_SIZE.small + 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5), marginTop: space(1) },
  tag: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '55',
    borderRadius: RADIUS.chip,
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.5),
  },
  equip: { alignSelf: 'flex-start', marginTop: space(2) },
  equipped: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, marginTop: space(2) },
  unlockRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: space(2) },
  unlock: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.inkDim },
});
