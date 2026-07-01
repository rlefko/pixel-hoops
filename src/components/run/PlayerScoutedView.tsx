import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { FlashOverlay, ParticleBurst, ShakeView, StaggerIn } from '@/components/fx';
import { useIdle, HUB_IDLE_MS } from '@/feel';
import { useRewardBurst } from './useRewardBurst';
import { LegendaryHalo } from './reward-fx';
import { PlayerCard } from './PlayerCard';
import { CLASS_COLOR } from './class-ui';
import { RecruitIcon } from '@/components/run/PixelIcons';
import { playerDraftClass } from '@/game/draft';
import type { Rarity } from '@/game/rarity';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The "PLAYER SCOUTED!" reveal: the reward beat after a championship that UNLOCKS one or more
 * players into the collection (crossing their copies-to-own threshold). It mirrors the coach
 * unlock, scaled by the best tier signed: a legend or S-tier star lights the legendary halo +
 * gold burst, A is epic, C/B is rare. Unlocked cards stagger in (no per-card step-through, since
 * a run can sign several at once). All juice no-ops under reduced motion. Runs that only
 * PROGRESSED shards (no unlock) skip this and show a compact strip on the win screen instead.
 * Sequenced by RunScreen after the champion celebration and the bounty reveal, before the
 * coach unlock.
 */

const CENTER_X = Dimensions.get('window').width / 2;
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** Class -> celebration rarity: a legend or S-tier star lands the loudest burst, A is epic,
 * everything else at least rare (a real unlock always celebrates). Mirrors CoachUnlockView. */
function playerRarity(rp: RosterPlayer): Rarity {
  const cls = playerDraftClass(rp);
  if (rp.legendary || cls === 'S' || cls === 'S+' || cls === 'S++') return 'legendary';
  if (cls === 'A') return 'epic';
  return 'rare';
}

interface PlayerScoutedViewProps {
  /** The players unlocked this run (always at least one; the caller gates on that). */
  players: RosterPlayer[];
  onNewRun: () => void;
  onHome: () => void;
}

export function PlayerScoutedView({ players, onNewRun, onHome }: PlayerScoutedViewProps) {
  // Scale the whole burst to the best-tier signing; the best card also lights the halo.
  const best = players.reduce<Rarity>(
    (r, p) => (RARITY_RANK[playerRarity(p)] > RARITY_RANK[r] ? playerRarity(p) : r),
    'rare'
  );
  const legendary = best === 'legendary';
  const bestPlayer = players.reduce((a, b) => (RARITY_RANK[playerRarity(b)] > RARITY_RANK[playerRarity(a)] ? b : a));
  const accent = legendary ? palette.gold : CLASS_COLOR[playerDraftClass(bestPlayer)];

  const { shakeRef, flashRef, fire } = useRewardBurst();
  // Pause the legendary halo's breathe once the player settles here; a touch wakes it.
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    fire(best);
    setBurst((n) => n + 1);
  }, [fire, best]);

  return (
    <Screen style={styles.container} topGap={space(4)} onTouchStart={bump}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ShakeView ref={shakeRef} style={styles.hero}>
          <RecruitIcon size={26} color={accent} />
          <Text style={styles.title}>{players.length > 1 ? 'PLAYERS SCOUTED!' : 'PLAYER SCOUTED!'}</Text>
          <Text style={styles.sub}>Signed to your collection.</Text>
          <View style={styles.list}>
            {players.map((p, i) => (
              <StaggerIn key={`${p.player.name}-${p.position}-${i}`} index={i} style={styles.row}>
                <View style={styles.cardWrap}>
                  <LegendaryHalo visible={playerRarity(p) === 'legendary'} paused={idle} />
                  <PlayerCard rp={p} showSpecialty right={<Text style={styles.newTag}>NEW</Text>} />
                </View>
              </StaggerIn>
            ))}
          </View>
          <ParticleBurst
            origin={{ x: CENTER_X, y: 90 }}
            variant="confetti"
            color={accent}
            count={legendary ? 18 : best === 'epic' ? 14 : 10}
            trigger={burst}
          />
        </ShakeView>

        <Pressable style={[styles.button, styles.primary]} onPress={onNewRun}>
          <Text style={styles.primaryText}>NEW RUN</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onHome}>
          <Text style={styles.homeText}>HOME</Text>
        </Pressable>
      </ScrollView>

      <FlashOverlay ref={flashRef} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(5) },
  scroll: { alignSelf: 'stretch' },
  scrollContent: { alignItems: 'center', paddingBottom: space(6) },
  hero: { alignSelf: 'stretch', alignItems: 'center' },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.chrome,
    textAlign: 'center',
    marginTop: space(2),
  },
  sub: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(1),
  },
  list: { alignSelf: 'stretch', width: '100%', maxWidth: 360, marginTop: space(4), gap: space(2) },
  row: { alignSelf: 'stretch' },
  cardWrap: { position: 'relative', width: '100%' },
  newTag: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.makeGreen,
    marginLeft: space(2),
  },
  button: {
    marginTop: space(4),
    paddingVertical: space(3),
    paddingHorizontal: space(8),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  primary: { backgroundColor: palette.gold + '1A', marginTop: space(6) },
  primaryText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    textAlign: 'center',
  },
  homeText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
    textAlign: 'center',
  },
});
