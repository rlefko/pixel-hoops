import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { FlashOverlay, ShakeView, StaggerIn } from '@/components/fx';
import { useHubBackdrop } from '@/feel';
import { HallOfFameCard } from '@/components/locker/HallOfFameCard';
import { BountyCrestShelf } from '@/components/locker/BountyCrestShelf';
import { RewardConfetti } from '@/components/run/reward-fx';
import { useRewardBurst } from '@/components/run/useRewardBurst';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { newCrestCells } from '@/game/home-roster';
import { useAcknowledgeHubSeen } from '@/hooks/useAcknowledgeHubSeen';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The Hall of Fame: a scrollable trophy case of every roster that won a ladder,
 * newest first. Each banner expands to its starting five and a Share button. A
 * standalone screen reached from the home menu (not a Locker Room tab).
 *
 * Crests earned since the last visit pop into the shelf on mount (see
 * BountyCrestShelf); viewing this screen is what acknowledges them in the
 * hubSeen ledger, so the ceremony can never replay. Milestone crossings fire
 * the shared reward burst (legendary confetti for the full 20).
 */
export default function HallOfFameScreen() {
  const nav = useArcadeRouter();
  const { homeRoster, loaded } = useHomeRoster();
  const { screenProps } = useHubBackdrop();
  const { shakeRef, flashRef, fire, confettiTrigger } = useRewardBurst();

  // Viewing this screen acknowledges the crests; `seenAt` is the roster as it
  // was BEFORE the stamp (and null until hydration), so this visit's ceremony
  // is derived from it and the shelf mounts only once it is known — a
  // pre-hydration mount can never swallow the ceremony.
  const seenAt = useAcknowledgeHubSeen((h) => ({
    crestCells: [...(h.clearedCells ?? [])],
  }));
  const newCells = useMemo(() => (seenAt ? newCrestCells(seenAt) : []), [seenAt]);

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  const entries = homeRoster.hallOfFame;

  return (
    <ShakeView ref={shakeRef} style={styles.flex}>
      <Screen
        scroll
        onBack={() => nav.back()}
        contentContainerStyle={styles.content}
        {...screenProps}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>HALL OF FAME</Text>
          <Text style={styles.count}>
            {entries.length} {entries.length === 1 ? 'banner' : 'banners'}
          </Text>
        </View>

        {/* Mounted only once the acknowledgment landed: the shelf's ceremony
            captures `newCells` on ITS mount, so it must see the final list. */}
        {seenAt ? (
          <BountyCrestShelf
            clearedCells={homeRoster.clearedCells}
            newCells={newCells}
            onMilestone={(m) => fire(m === 20 ? 'legendary' : 'epic')}
          />
        ) : null}

        {entries.length === 0 ? (
          <Text style={styles.empty}>
            Win a ladder to hang your first banner.
          </Text>
        ) : (
          entries.map((entry, i) => (
            <StaggerIn key={entry.id} index={i}>
              <HallOfFameCard entry={entry} />
            </StaggerIn>
          ))
        )}
      </Screen>
      <FlashOverlay ref={flashRef} />
      <RewardConfetti trigger={confettiTrigger} />
    </ShakeView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
  },
  content: { paddingHorizontal: space(4), gap: space(3) },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
  },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  empty: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(4),
    textAlign: 'center',
  },
});
