import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { GameCard } from '@/types/card';

interface CardDisplayProps {
    card: GameCard;
     /** Whether this card is currently selected (tapped). */
    selected?: boolean;
     /** Show face-down if the opponent's card is revealed. */
    revealed?: boolean;
     /** Disable tapping. */
    disabled?: boolean;
     /** Called when the card is tapped. */
    onPress?: () => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    offense: { bg: '#1B5E20', text: '#E8F5E9', border: '#66BB6A' },
    defense: { bg: '#4A148C', text: '#F3E5F5', border: '#AB47BC' },
    special: { bg: '#E65100', text: '#FFF3E0', border: '#FF9800' },
};

export function CardDisplay({ card, selected, revealed, disabled, onPress }: CardDisplayProps) {
    const colors = CATEGORY_COLORS[card.category] ?? CATEGORY_COLORS.offense;

    return (
        <TouchableOpacity
            activeOpacity={disabled ? 1 : 0.7}
            disabled={disabled}
            onPress={onPress}
            style={[
                styles.container,
                { borderColor: selected ? '#FFD54F' : colors.border },
             ]}>
            {revealed === false ? (
                 // Face-down card (opponent's hidden defensive card)
                <View style={[styles.faceDownCard, { backgroundColor: colors.bg }]}>
                    <Text style={styles.faceDownText}>?</Text>
                  </View>
              ) : (
                 // Face-up card
                <View style={styles.cardBody}>
                    <Text style={[styles.shortName, { color: colors.text }]}>
                        {card.shortName}
                      </Text>
                     {card.energyCost > 0 ? (
                        <View style={styles.energyBadge}>
                            <Text style={styles.energyText}>{card.energyCost}</Text>
                          </View>
                      ) : null}
                    <Text style={[styles.desc, { color: colors.text }]}>
                        {card.description}
                      </Text>
                  </View>
              )}
          </TouchableOpacity>
      );
}

const styles = StyleSheet.create({
    container: {
        width: 80,
        height: 110,
        borderRadius: 8,
        borderWidth: 2,
        marginHorizontal: 4,
         shadowColor: '#000',
         shadowOffset: { width: 0, height: 2 },
         shadowOpacity: 0.3,
         shadowRadius: 2,
          elevation: 3,
     },
    faceDownCard: {
        flex: 1,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
         borderStyle: 'dashed',
         borderWidth: 1,
         borderColor: 'rgba(255,255,255,0.3)',
     },
    faceDownText: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
         opacity: 0.7,
     },
    cardBody: {
        flex: 1,
        paddingVertical: 6,
        paddingHorizontal: 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 6,
     },
    shortName: {
        fontSize: 11,
        fontWeight: 'bold',
        textAlign: 'center',
         letterSpacing: 0.5,
     },
    energyBadge: {
        marginTop: 2,
         paddingHorizontal: 4,
         paddingVertical: 1,
        borderRadius: 4,
         backgroundColor: 'rgba(255,255,255,0.2)',
     },
    energyText: {
        fontSize: 8,
         fontWeight: 'bold',
        color: '#fff',
     },
    desc: {
        fontSize: 7,
        textAlign: 'center',
         marginTop: 4,
         lineHeight: 9,
          opacity: 0.85,
     },
 });
