import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Pop } from '@/components/fx';
import { PlayerCard } from '@/components/run/PlayerCard';
import { CoinIcon } from '@/components/run/PixelIcons';
import { useHomeRoster } from '@/context/HomeRosterContext';
import {
  playerKey,
  ownedRosterPlayers,
  abilityOwned,
  abilityEquipped,
  canEquipAbility,
  addAbility,
  equipAbility,
  unequipAbility,
  applyPlayerPull,
} from '@/game/home-roster';
import {
  GACHA_MACHINES,
  pullMachine,
  getGachaAbility,
  GACHA_ABILITIES,
  type AbilityRarity,
  type MachineId,
} from '@/game/abilities-gacha';
import {
  PLAYER_MACHINES,
  PLAYER_GACHA_TIERS,
  tierCounts,
  type PlayerGachaTier,
  type PlayerPullResult,
} from '@/game/player-gacha';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { createRNG } from '@/game/rng';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The Arcade: the coin gacha hub. A SCOUTING section of five machines signs new
 * players into the collection (see src/game/player-gacha.ts), and an ABILITIES
 * section of three machines pulls passive abilities plus an equip loadout to
 * assign owned abilities onto owned players (persists between runs).
 */

const RARITY_COLOR: Record<AbilityRarity, string> = {
  common: palette.inkDim,
  rare: palette.steelBlue,
  legendary: palette.gold,
};

let pullCounter = 0; // varies the pull seed within a session (pulls are not replayed)
let scoutCounter = 0; // same, for the player scouting machines

export default function ArcadeScreen() {
  const router = useRouter();
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const [selected, setSelected] = useState<string | null>(null);
  const [lastPull, setLastPull] = useState<{ id: string; rarity: AbilityRarity } | null>(null);
  const [lastScout, setLastScout] = useState<PlayerPullResult | null>(null);
  const [query, setQuery] = useState('');

  const players = useMemo(() => {
    if (!homeRoster) return [];
    const q = query.trim().toLowerCase();
    const all = ownedRosterPlayers(homeRoster); // recency-ordered
    return q ? all.filter((rp) => rp.player.name.toLowerCase().includes(q)) : all;
  }, [homeRoster, query]);
  const ownedAbilities = useMemo(
    () => (homeRoster ? GACHA_ABILITIES.filter((a) => abilityOwned(homeRoster, a.id) > 0) : []),
    [homeRoster]
  );
  const ownedKeys = useMemo(
    () => new Set(homeRoster ? homeRoster.players.map(playerKey) : []),
    [homeRoster]
  );

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  const coins = homeRoster.coins;

  const pull = (machineId: MachineId) => {
    const machine = GACHA_MACHINES[machineId];
    if (coins < machine.cost) return;
    pullCounter += 1;
    const result = pullMachine(machineId, createRNG(`pull-${machineId}-${coins}-${pullCounter}`));
    setLastPull(result);
    saveHomeRoster(addAbility({ ...homeRoster, coins: coins - machine.cost }, result.id));
  };

  const scout = (tier: PlayerGachaTier) => {
    const machine = PLAYER_MACHINES[tier];
    // Block when unaffordable or the tier is fully collected (a guaranteed repeat).
    if (coins < machine.cost || tierCounts(tier, ownedKeys).complete) return;
    scoutCounter += 1;
    const { home, result } = applyPlayerPull(homeRoster, tier, createRNG(`scout-${tier}-${coins}-${scoutCounter}`));
    setLastScout(result);
    saveHomeRoster(home);
  };

  const onPlayer = (rp: (typeof players)[number]) => {
    const key = playerKey(rp);
    if (selected && homeRoster.equippedAbilities[key] !== selected) {
      saveHomeRoster(equipAbility(homeRoster, key, selected));
    } else if (homeRoster.equippedAbilities[key]) {
      saveHomeRoster(unequipAbility(homeRoster, key));
    }
  };

  const lastAbility = getGachaAbility(lastPull?.id);
  const scoutColor =
    lastScout && !lastScout.player.legendary
      ? CLASS_COLOR[lastScout.player.originalClass ?? 'C']
      : palette.gold;

  return (
    <Screen style={styles.container} onBack={() => router.back()}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>ARCADE</Text>
        <Pop trigger={coins} style={styles.coinPill}>
          <CoinIcon size={12} color={palette.gold} />
          <Text style={styles.coinText}>{coins}</Text>
        </Pop>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.section, styles.sectionTop]}>SCOUTING</Text>
        <View style={styles.machines}>
          {PLAYER_GACHA_TIERS.map((tier) => {
            const m = PLAYER_MACHINES[tier];
            const counts = tierCounts(tier, ownedKeys);
            const color = m.legendary ? palette.gold : CLASS_COLOR[m.cls];
            const disabled = coins < m.cost || counts.complete;
            return (
              <View key={tier} style={styles.machine}>
                <View style={styles.machineHead}>
                  <Text style={[styles.machineName, { color }]}>{m.name}</Text>
                  <Text style={styles.collected}>
                    {counts.owned}/{counts.total}
                  </Text>
                </View>
                <Text style={styles.machineBlurb}>{m.blurb}</Text>
                <Pressable
                  onPress={() => scout(tier)}
                  disabled={disabled}
                  style={[styles.pullBtn, disabled && styles.pullDisabled]}
                >
                  <Text style={styles.pullText}>
                    {counts.complete ? 'COLLECTED' : `SCOUT · ${m.cost}c`}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {lastScout ? (
          <Pop trigger={lastScout.player.player.name} style={[styles.reveal, { borderColor: scoutColor }]}>
            <Text style={[styles.revealRarity, { color: scoutColor }]}>
              {lastScout.isDupe ? `REPEAT · +${lastScout.refund}c REFUNDED` : 'NEW SIGNING'}
            </Text>
            <View style={styles.revealCardWrap}>
              <PlayerCard rp={lastScout.player} />
            </View>
          </Pop>
        ) : null}

        <Text style={styles.section}>ABILITIES</Text>
        <View style={styles.machines}>
          {(Object.keys(GACHA_MACHINES) as MachineId[]).map((id) => {
            const m = GACHA_MACHINES[id];
            const afford = coins >= m.cost;
            return (
              <View key={id} style={styles.machine}>
                <Text style={[styles.machineName, { color: RARITY_COLOR[m.topRarity] }]}>{m.name}</Text>
                <Text style={styles.machineBlurb}>{m.blurb}</Text>
                <Pressable
                  onPress={() => pull(id)}
                  disabled={!afford}
                  style={[styles.pullBtn, !afford && styles.pullDisabled]}
                >
                  <Text style={styles.pullText}>PULL · {m.cost}c</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {lastAbility ? (
          <Pop trigger={lastPull?.id ?? ''} style={[styles.reveal, { borderColor: RARITY_COLOR[lastAbility.rarity] }]}>
            <Text style={[styles.revealRarity, { color: RARITY_COLOR[lastAbility.rarity] }]}>
              {lastAbility.rarity.toUpperCase()}
            </Text>
            <Text style={styles.revealName}>{lastAbility.name}</Text>
            <Text style={styles.revealBlurb}>{lastAbility.blurb}</Text>
          </Pop>
        ) : null}

        <Text style={styles.section}>YOUR ABILITIES</Text>
        {ownedAbilities.length === 0 ? (
          <Text style={styles.empty}>Pull a machine to win abilities.</Text>
        ) : (
          <View style={styles.abilityChips}>
            {ownedAbilities.map((a) => {
              const owned = abilityOwned(homeRoster, a.id);
              const equipped = abilityEquipped(homeRoster, a.id);
              const active = selected === a.id;
              const color = RARITY_COLOR[a.rarity];
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setSelected(active ? null : a.id)}
                  style={[styles.abilityChip, { borderColor: color }, active && { backgroundColor: color + '33' }]}
                >
                  <Text style={[styles.abilityChipName, { color }]}>{a.name}</Text>
                  <Text style={styles.abilityChipMeta}>
                    {equipped}/{owned} · {a.blurb}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.section}>
          {selected ? 'TAP A PLAYER TO EQUIP' : 'EQUIPPED LOADOUT'}
        </Text>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search players..."
          placeholderTextColor={palette.inkDim}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {players.map((rp, i) => {
          const key = playerKey(rp);
          const equippedId = homeRoster.equippedAbilities[key];
          const equipped = getGachaAbility(equippedId);
          const blocked = !!selected && equippedId !== selected && !canEquipAbility(homeRoster, selected);
          return (
            <Pressable
              key={`${key}-${i}`}
              onPress={() => onPlayer(rp)}
              disabled={blocked}
              style={[styles.playerRow, blocked && styles.rowBlocked]}
            >
              <View style={styles.cardWrap}>
                <PlayerCard rp={rp} compact />
              </View>
              <Text style={styles.equipName}>
                {equipped ? equipped.name : selected ? '+ equip' : '—'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(4) },
  center: { flex: 1, backgroundColor: palette.bgDeep, alignItems: 'center', justifyContent: 'center' },
  loading: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.inkDim },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.gold },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '55',
    borderRadius: RADIUS.chip,
  },
  coinText: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.gold },
  scroll: { marginTop: space(3), alignSelf: 'stretch' },
  scrollContent: { paddingBottom: space(6), gap: space(2) },
  machines: { gap: space(2) },
  machine: {
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    backgroundColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
  },
  machineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  machineName: { fontFamily: FONT.display, fontSize: FONT_SIZE.body },
  collected: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  machineBlurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.inkDim, marginTop: space(1) },
  pullBtn: {
    marginTop: space(2),
    alignSelf: 'flex-start',
    paddingVertical: space(1.5),
    paddingHorizontal: space(4),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '1A',
  },
  pullDisabled: { opacity: 0.35, borderColor: palette.inkDim },
  pullText: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.gold },
  reveal: {
    alignItems: 'center',
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    marginTop: space(2),
  },
  revealRarity: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  revealName: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.ink, marginTop: space(1) },
  revealBlurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.inkDim, marginTop: space(1) },
  revealCardWrap: { alignSelf: 'stretch', marginTop: space(2) },
  section: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(4),
    marginBottom: space(1),
  },
  sectionTop: { marginTop: 0 }, // the first section sits flush under the scroll's top gap
  empty: { fontFamily: FONT.body, fontSize: FONT_SIZE.body, color: palette.inkDim },
  search: {
    height: 38,
    paddingHorizontal: space(3),
    marginBottom: space(2),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
    color: palette.ink,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
  },
  abilityChips: { gap: space(1.5) },
  abilityChip: {
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
  },
  abilityChipName: { fontFamily: FONT.display, fontSize: FONT_SIZE.small },
  abilityChipMeta: { fontFamily: FONT.body, fontSize: FONT_SIZE.micro, color: palette.inkDim, marginTop: 1 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(1),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
  },
  rowBlocked: { opacity: 0.35 },
  cardWrap: { flex: 1 },
  equipName: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    marginLeft: space(2),
    minWidth: 64,
    textAlign: 'right',
  },
});
