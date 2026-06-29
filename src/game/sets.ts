import type { TeamModifier } from './effects';
import { teamModifierFromPartial } from './effects';
import type { PassiveBoost } from './boosts';
import type { RosterPlayer } from '@/types/roster';

/**
 * Set and duo synergies: a build reward, the Hades-duo model. When the player's
 * dressed five plus owned boosts supply enough sources from a tagged FAMILY, the
 * set emits an extra TeamModifier. Set bonuses are net-budget FREE but gated by
 * commitment (you spent multiple draft picks or item slots to earn them), so they
 * reward intentional construction without inflating any single piece.
 *
 * Tags live in the family registries below (not on each def) so set membership is
 * declared in one place and validated by the tests. Sets resolve at team-build
 * time (player path only: opponents never trigger them) and fold into the frozen
 * team modifier, so they survive substitutions exactly like boosts.
 */

/** Boost-id families. A boost can belong to more than one family. */
export const BOOST_FAMILIES: Record<string, readonly string[]> = {
  'run-gun': ['seven-seconds', 'fast-break', 'run-and-gun', 'pace-and-space', 'avalanche'],
  lockdown: ['full-court-press', 'perimeter-clamps', 'lockdown', 'death-lineup', 'switch-everything', 'swarm-d'],
  splash: ['splash-brothers', 'sharpshooting', 'heat-check', 'small-ball', 'motion-offense', 'momentum'],
};

/** Item-id families. */
export const ITEM_FAMILIES: Record<string, readonly string[]> = {
  shooter: ['grip-tape', 'shooting-gloves', 'shooting-sleeve', 'sniper-scope', 'deadeye-scope', 'marksman-gloves', 'glass-cannon-goggles', 'corner-specialist-grips'],
  passer: ['playmaker-gloves', 'floor-general-headset', 'court-vision-visor'],
  'rim-runner': ['track-spikes', 'blitz-boots', 'power-insoles'],
  anchor: ['anchor-brace', 'rim-protector-pads', 'iron-man-brace', 'two-way-harness', 'swatter-gauntlets'],
};

/** Reverse lookup: id -> the families it belongs to. */
function reverse(families: Record<string, readonly string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const tag in families) {
    for (const id of families[tag]) {
      const list = out.get(id) ?? [];
      list.push(tag);
      out.set(id, list);
    }
  }
  return out;
}

const BOOST_TAGS = reverse(BOOST_FAMILIES);
const ITEM_TAGS = reverse(ITEM_FAMILIES);

export function boostTags(id: string): readonly string[] {
  return BOOST_TAGS.get(id) ?? [];
}
export function itemTags(id: string): readonly string[] {
  return ITEM_TAGS.get(id) ?? [];
}

/** One prerequisite: at least `fromBoosts` owned boosts and/or `fromItems`
 * equipped items carrying `tag`. */
export interface SetReq {
  tag: string;
  fromBoosts?: number;
  fromItems?: number;
}

export interface SetDef {
  id: string;
  name: string;
  blurb: string;
  /** ALL reqs must be satisfied for the set to activate. */
  reqs: SetReq[];
  /** When true, the item reqs must be covered by DIFFERENT players (a true duo). */
  distinctPlayers?: boolean;
  /** The net-budget-free bonus the satisfied set folds into the team modifier. */
  bonus: Partial<TeamModifier>;
}

export const SET_DEFS: readonly SetDef[] = [
  { id: 'set-track-meet', name: 'Track Meet', blurb: '3 run-and-gun boosts: +2 team pace, +1 athleticism', reqs: [{ tag: 'run-gun', fromBoosts: 3 }], bonus: { paceBonus: 2, extra: { athleticism: 1 } } },
  { id: 'set-no-fly-zone', name: 'No Fly Zone', blurb: '3 lockdown boosts: +2 team perimeter and interior D', reqs: [{ tag: 'lockdown', fromBoosts: 3 }], bonus: { extra: { perimeterD: 2, interiorD: 2 } } },
  { id: 'set-bombs-away', name: 'Bombs Away', blurb: 'A shooting boost and a shooter item: +3 team outside', reqs: [{ tag: 'splash', fromBoosts: 1 }, { tag: 'shooter', fromItems: 1 }], bonus: { extra: { outside: 3 } } },
  { id: 'set-lob-city', name: 'Lob City', blurb: 'A passer and a rim runner on different players: +2 inside, +1 athleticism', reqs: [{ tag: 'passer', fromItems: 1 }, { tag: 'rim-runner', fromItems: 1 }], distinctPlayers: true, bonus: { extra: { inside: 2, athleticism: 1 } } },
  { id: 'set-rim-wall', name: 'Rim Wall', blurb: 'Two anchor items on different players: +3 interior D, +1 rebounding', reqs: [{ tag: 'anchor', fromItems: 2 }], distinctPlayers: true, bonus: { extra: { interiorD: 3, rebounding: 1 } } },
  { id: 'set-spacing', name: 'Spacing and Pace', blurb: 'A run-and-gun boost and a shooting boost: +1 team pace, +2 outside', reqs: [{ tag: 'run-gun', fromBoosts: 1 }, { tag: 'splash', fromBoosts: 1 }], bonus: { paceBonus: 1, extra: { outside: 2 } } },
];

export interface SetProgress {
  def: SetDef;
  /** Satisfied req-units so far (for a "2/3" style progress chip). */
  have: number;
  /** Total req-units the set needs. */
  need: number;
  met: boolean;
}

/** Kuhn's algorithm: match each tag SLOT to a distinct player whose item carries
 * that tag. Returns the number of slots matched (== slots.length when all covered). */
function maxDistinctMatch(slots: readonly string[], playerTags: readonly Set<string>[]): number {
  const playerToSlot = Array.from({ length: playerTags.length }, () => -1);
  const augment = (slot: number, seen: boolean[]): boolean => {
    for (let p = 0; p < playerTags.length; p++) {
      if (seen[p] || !playerTags[p].has(slots[slot])) continue;
      seen[p] = true;
      if (playerToSlot[p] === -1 || augment(playerToSlot[p], seen)) {
        playerToSlot[p] = slot;
        return true;
      }
    }
    return false;
  };
  let matched = 0;
  for (let s = 0; s < slots.length; s++) {
    if (augment(s, Array.from({ length: playerTags.length }, () => false))) matched += 1;
  }
  return matched;
}

/**
 * Resolve which sets the player's five + owned boosts satisfy. Returns the active
 * bonuses (as TeamModifiers, each labeled with its set name) and per-set progress
 * for the UI. Pure and deterministic.
 */
export function resolveSets(
  five: readonly RosterPlayer[],
  boosts: readonly PassiveBoost[]
): { active: TeamModifier[]; progress: SetProgress[] } {
  const boostTagCount = new Map<string, number>();
  for (const b of boosts) {
    for (const t of boostTags(b.id)) boostTagCount.set(t, (boostTagCount.get(t) ?? 0) + 1);
  }
  const playerItemTags: Set<string>[] = five.map(
    (rp) => new Set(rp.item ? itemTags(rp.item.defId) : [])
  );

  const active: TeamModifier[] = [];
  const progress: SetProgress[] = [];

  for (const def of SET_DEFS) {
    let have = 0;
    let need = 0;
    let met = true;

    for (const r of def.reqs) {
      if (r.fromBoosts) {
        need += r.fromBoosts;
        const got = Math.min(boostTagCount.get(r.tag) ?? 0, r.fromBoosts);
        have += got;
        if (got < r.fromBoosts) met = false;
      }
    }

    const itemReqs = def.reqs.filter((r) => r.fromItems);
    if (itemReqs.length) {
      const itemNeed = itemReqs.reduce((n, r) => n + (r.fromItems ?? 0), 0);
      need += itemNeed;
      if (def.distinctPlayers) {
        const slots: string[] = [];
        for (const r of itemReqs) for (let i = 0; i < (r.fromItems ?? 0); i++) slots.push(r.tag);
        const matched = maxDistinctMatch(slots, playerItemTags);
        have += matched;
        if (matched < itemNeed) met = false;
      } else {
        for (const r of itemReqs) {
          const got = Math.min(playerItemTags.filter((s) => s.has(r.tag)).length, r.fromItems ?? 0);
          have += got;
          if (got < (r.fromItems ?? 0)) met = false;
        }
      }
    }

    progress.push({ def, have, need, met });
    if (met) active.push(teamModifierFromPartial({ ...def.bonus, labels: [def.name] }));
  }

  return { active, progress };
}
