import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import {
  FlashOverlay,
  ParticleBurst,
  ShakeView,
  type FlashOverlayHandle,
  type ShakeViewHandle,
} from '@/components/fx';
import { haptics } from '@/feel';
import { Screen } from '@/components/Screen';
import { PlayerCard } from './PlayerCard';
import { LegendaryHalo } from './reward-fx';
import { getAbility } from '@/game/abilities';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The legendary jackpot reveal. A face-down gold card the player taps to scout;
 * the flip fires a white flash, gold sparkle, screen shake, and haptics, then
 * resolves into the legend with their signature ability. Sign them on loan
 * (powerful but never kept) or pass. The full reveal is reserved for legends.
 */
interface LegendRevealViewProps {
  offer: RosterPlayer;
  onScout: () => void;
  onDecline: () => void;
}

const REVEAL_MS = 280;
const CENTER_X = Dimensions.get('window').width / 2;

export function LegendRevealView({ offer, onScout, onDecline }: LegendRevealViewProps) {
  const [revealed, setRevealed] = useState(false);
  const [burst, setBurst] = useState(0);
  const flashRef = useRef<FlashOverlayHandle>(null);
  const shakeRef = useRef<ShakeViewHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ability = getAbility(offer.ability);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const scout = () => {
    flashRef.current?.flash(palette.gold, { peak: 0.5 });
    shakeRef.current?.shake('medium');
    haptics.bigPlay();
    setBurst((n) => n + 1);
    timer.current = setTimeout(() => setRevealed(true), REVEAL_MS);
  };

  return (
    <Screen style={styles.container} topGap={space(4)}>
      <Text style={styles.kicker}>A LEGEND APPEARS</Text>

      <ShakeView ref={shakeRef} style={styles.stage}>
        {revealed ? (
          <View style={styles.cardWrap}>
            <LegendaryHalo visible />
            <View style={styles.card}>
              <PlayerCard rp={offer} expanded />
              <Text style={styles.onLoan}>ON LOAN: yours for this run only</Text>
            </View>
          </View>
        ) : (
          <Pressable style={styles.facedown} onPress={scout}>
            <Text style={styles.mark}>★</Text>
            <Text style={styles.scout}>SCOUT</Text>
          </Pressable>
        )}
        <ParticleBurst origin={{ x: CENTER_X, y: 40 }} variant="confetti" color={palette.gold} trigger={burst} />
      </ShakeView>

      {revealed ? (
        <View style={styles.actions}>
          {ability ? (
            <Text style={styles.abilityNote}>
              {ability.name}: {ability.blurb}
            </Text>
          ) : null}
          <Pressable style={[styles.button, styles.primary]} onPress={onScout}>
            <Text style={styles.primaryText}>SIGN (ON LOAN)</Text>
          </Pressable>
          <Pressable onPress={onDecline}>
            <Text style={styles.pass}>Pass</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>Tap the card to scout</Text>
      )}

      <FlashOverlay ref={flashRef} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: space(5),
  },
  kicker: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
    textAlign: 'center',
  },
  stage: { marginTop: space(8), alignSelf: 'stretch', alignItems: 'center' },
  cardWrap: { alignSelf: 'stretch', position: 'relative' }, // anchors the legend's gold halo
  facedown: {
    width: 180,
    height: 220,
    borderWidth: BORDER.chunkier,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
  },
  mark: { fontFamily: FONT.body, fontSize: 48, color: palette.gold },
  scout: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.gold },
  card: {
    alignSelf: 'stretch',
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    padding: space(3),
    gap: space(2),
  },
  onLoan: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    textAlign: 'center',
  },
  actions: { marginTop: space(6), alignSelf: 'stretch', alignItems: 'center', gap: space(2) },
  abilityNote: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
  },
  button: {
    marginTop: space(2),
    paddingVertical: space(3),
    paddingHorizontal: space(6),
    borderRadius: RADIUS.chip,
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
  },
  primary: { backgroundColor: palette.gold + '1A' },
  primaryText: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.gold },
  pass: { fontFamily: FONT.body, fontSize: FONT_SIZE.body, color: palette.inkDim, marginTop: space(2) },
  hint: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(6),
  },
});
