import type { Archetype } from '@/types/player';
import { createPlayer, type Player, type PlayerStats, randomInt } from '@/types/player';

// ---------------------------------------------------------------------------
// Streetball name generator
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
     'Slam', 'Flash', 'Ice', 'Tank', 'Sky', 'Dagger', 'Blaze', 'Sticky',
     "Lil' Pockets", 'Bullet', 'Switchblade', 'Slick', 'Freak', 'Beast',
    'Macho', 'Thunder', 'Viper', 'Ghost', 'Reaper', 'Havoc',
];

const LAST_NAMES = [
     'Marcus', 'Rivera', "O'Neal Jr.", 'Chen', 'Washington', 'Carter',
    'Delgado', 'Petrov', 'Okafor', 'McRebound', 'Basketball Smith',
    'The Wall', 'Quick', 'Money', 'Danger', 'Steele', 'Banks', 'Cross',
];

/** Generate a random streetball-sounding opponent name. */
export function generateOpponentName(): string {
    return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} "${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}"`;
}

// ---------------------------------------------------------------------------
// Archetype selection by round
// ---------------------------------------------------------------------------

/** Which archetypes appear at each round and how heavily weighted. */
const ARCHETYPE_WEIGHTS: Record<string, Record<Archetype, number>> = {
    '1': { 'point-guard': 5, 'shooting-guard': 3, 'small-forward': 2, 'power-forward': 1, 'center': 1 },
    '2': { 'point-guard': 4, 'shooting-guard': 3, 'small-forward': 3, 'power-forward': 2, 'center': 2 },
    '3': { 'point-guard': 3, 'shooting-guard': 3, 'small-forward': 3, 'power-forward': 3, 'center': 3 },
    '4': { 'point-guard': 2, 'shooting-guard': 3, 'small-forward': 3, 'power-forward': 4, 'center': 4 },
    '5': { 'point-guard': 1, 'shooting-guard': 2, 'small-forward': 3, 'power-forward': 5, 'center': 5 },
    '6': { 'point-guard': 1, 'shooting-guard': 1, 'small-forward': 2, 'power-forward': 5, 'center': 5 },
    '7': { 'point-guard': 0, 'shooting-guard': 1, 'small-forward': 1, 'power-forward': 5, 'center': 5 },
};

/** Weighted random archetype selection for a given round. */
function pickArchetype(round: number): Archetype {
    const weights = ARCHETYPE_WEIGHTS[String(Math.min(round, 7))];
    if (!weights) return 'point-guard';

    const entries = Object.entries(weights) as [Archetype, number][];
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * totalWeight;

    for (const [archetype, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return archetype;
     }

    return 'point-guard'; // Fallback
}

// ---------------------------------------------------------------------------
// Stat scaling by round
// ---------------------------------------------------------------------------

/** Expected stat range for a given tournament round. */
export function getRoundStatRange(round: number): { min: number; max: number } {
    switch (Math.min(round, 7)) {
        case 1: return { min: 4, max: 5 };
        case 2: return { min: 4, max: 6 };
        case 3: return { min: 5, max: 6 };
        case 4: return { min: 5, max: 7 };
        case 5: return { min: 6, max: 8 };
        case 6: return { min: 7, max: 9 };
        case 7: return { min: 8, max: 10 };
        default: return { min: 4, max: 5 };
     }
}

/** Scale the archetypes that appear at a given round. */
export function getRoundArchetypeWeights(round: number): Record<Archetype, number> {
    return ARCHETYPE_WEIGHTS[String(Math.min(round, 7))] ?? ARCHETYPE_WEIGHTS['1'];
}

// ---------------------------------------------------------------------------
// Opponent generation
// ---------------------------------------------------------------------------

/** Generate a procedurally-scaled opponent for the given tournament round. */
export function generateOpponent(
    round: number,
    playerName?: string,
): Player {
    const archetype = pickArchetype(round);
    const name = playerName ?? generateOpponentName();
    const basePlayer = createPlayer(name, archetype);
    const range = getRoundStatRange(round);

     // Scale each stat within the round's range with some variance
    const stats: PlayerStats = {
        shooting: clamp(basePlayer.stats.shooting + randomInt(-1, 2), range.min, range.max),
        speed: clamp(basePlayer.stats.speed + randomInt(-1, 2), range.min, range.max),
        athleticism: clamp(basePlayer.stats.athleticism + randomInt(-1, 2), range.min, range.max),
        clutch: clamp(basePlayer.stats.clutch + randomInt(-1, 2), range.min, range.max),
     };

    return { ...basePlayer, stats };
}

/** Clamp a value to [min, max] inclusive. */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
