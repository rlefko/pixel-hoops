import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { GamePlan, Pace, Focus } from '@/types/tactics';

/** Pregame tactics: pick pace and focus to bias the auto-sim. */

const PACES: Pace[] = ['slow', 'balanced', 'fast'];
const FOCUSES: Focus[] = ['inside', 'balanced', 'outside', 'lockdown'];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>
              {opt.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function GamePlanPicker({
  plan,
  onChange,
}: {
  plan: GamePlan;
  onChange: (plan: GamePlan) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>PACE</Text>
      <Segmented
        options={PACES}
        value={plan.pace}
        onChange={(pace) => onChange({ ...plan, pace })}
      />
      <Text style={styles.label}>FOCUS</Text>
      <Segmented
        options={FOCUSES}
        value={plan.focus}
        onChange={(focus) => onChange({ ...plan, focus })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(1),
    marginBottom: space(1),
  },
  segment: {
    flexDirection: 'row',
    gap: space(1),
  },
  seg: {
    flex: 1,
    paddingVertical: space(2),
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
  },
  segActive: {
    borderColor: palette.gold,
    backgroundColor: palette.gold + '22',
  },
  segText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  segTextActive: {
    color: palette.gold,
  },
});
