import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { FlashOverlay, ParticleBurst, ShakeView, Counter } from '@/components/fx';
import { useRewardBurst } from './useRewardBurst';
import { LegendaryHalo } from './reward-fx';
import { PlayerCard } from './PlayerCard';
import { CoinIcon, CrownIcon, StarIcon } from '@/components/run/PixelIcons';
import { RARITY_COLOR, RARITY_LABEL } from './rarity-ui';
import { getGachaAbility } from '@/game/abilities-gacha';
import type { BountyGrant } from '@/game/home-roster';
import type { BountyReward } from '@/game/bounties';
import type { Rarity } from '@/game/rarity';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The "CHAMPIONSHIP BOUNTY!" reveal: the headline reward beat when a run clears a
 * (difficulty x ladder class) cell for the FIRST time. It is the payoff that makes a
 * harder difficulty worth it, so it plays FIRST among the post-championship reveals
 * (bounty -> scouted players -> coach unlock). Reuses useRewardBurst, scaled to the
 * bounty's value: the Grandmaster capstone and legend/S grants light the gold burst.
 * All juice no-ops under reduced motion. Sequenced by RunScreen.
 */

const CENTER_X = Dimensions.get('window').width / 2;

/** Burst intensity for a bounty, mapped to the shared rarity ramp. */
function bountyRarity(reward: BountyReward): Rarity {
  switch (reward.kind) {
    case 'crest':
      return 'legendary';
    case 'ability':
      return reward.rarity;
    case 'player':
      return reward.tier === 'A' ? 'epic' : 'legendary'; // S / legendary land the loudest
    case 'coins':
      return reward.amount >= 5000 ? 'legendary' : reward.amount >= 1000 ? 'epic' : 'rare';
  }
}

interface BountyRewardViewProps {
  grant: BountyGrant;
  onNewRun: () => void;
  onHome: () => void;
}

export function BountyRewardView({ grant, onNewRun, onHome }: BountyRewardViewProps) {
  const rarity = bountyRarity(grant.bounty.reward);
  const legendary = rarity === 'legendary';
  const accent = legendary ? palette.gold : RARITY_COLOR[rarity];

  const { shakeRef, flashRef, fire } = useRewardBurst();
  // burst goes 0 -> 1 once on mount: it triggers the confetti AND kicks a coin count-up off
  // zero (Counter only tweens on a change), so no separate "settled" flag is needed.
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    fire(rarity);
    setBurst((n) => n + 1);
  }, [fire, rarity]);

  // A player grant that actually deposited a copy shows its card; an overflow (fully-owned
  // tier) or a coin/capstone reward shows a coin count-up instead.
  const showPlayerCard = grant.player != null && grant.coins == null;
  const ability = grant.abilityId ? getGachaAbility(grant.abilityId) : undefined;

  return (
    <Screen style={styles.container} topGap={space(4)}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ShakeView ref={shakeRef} style={styles.hero}>
          {grant.isCapstone ? (
            <CrownIcon size={30} color={palette.gold} />
          ) : (
            <StarIcon size={26} color={accent} />
          )}
          <Text style={styles.title}>
            {grant.isCapstone ? 'GRANDMASTER!' : 'CHAMPIONSHIP BOUNTY!'}
          </Text>
          <Text style={[styles.label, { color: accent }]}>{grant.bounty.label}</Text>
          <Text style={styles.blurb}>{grant.bounty.blurb}</Text>

          <View style={styles.rewardWrap}>
            {showPlayerCard && grant.player ? (
              <View style={styles.cardWrap}>
                <LegendaryHalo visible={legendary} />
                <PlayerCard
                  rp={grant.player}
                  showSpecialty
                  right={
                    <Text style={styles.tag}>{grant.playerUnlocked ? 'NEW' : '+1 COPY'}</Text>
                  }
                />
              </View>
            ) : ability ? (
              <View style={[styles.abilityCard, { borderColor: accent + '88' }]}>
                <Text style={[styles.abilityName, { color: accent }]}>{ability.name}</Text>
                <Text style={styles.abilityRarity}>{RARITY_LABEL[ability.rarity]} ABILITY</Text>
                <Text style={styles.abilityBlurb}>{ability.blurb}</Text>
              </View>
            ) : grant.coins != null ? (
              <View style={styles.coinRow}>
                <CoinIcon size={22} color={palette.gold} />
                <Text style={styles.coinAmount}>
                  +<Counter value={burst > 0 ? grant.coins : 0} />
                </Text>
              </View>
            ) : null}
          </View>

          <ParticleBurst
            origin={{ x: CENTER_X, y: 90 }}
            variant="confetti"
            color={accent}
            count={legendary ? 18 : rarity === 'epic' ? 14 : 10}
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
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    marginTop: space(3),
  },
  blurb: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(1),
    paddingHorizontal: space(4),
  },
  rewardWrap: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 360,
    marginTop: space(4),
    alignItems: 'center',
  },
  cardWrap: { position: 'relative', width: '100%' },
  tag: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.makeGreen,
    marginLeft: space(2),
  },
  abilityCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgDeep,
  },
  abilityName: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
  abilityRarity: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(1),
  },
  abilityBlurb: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
    textAlign: 'center',
    marginTop: space(2),
  },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  coinAmount: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.gold,
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
