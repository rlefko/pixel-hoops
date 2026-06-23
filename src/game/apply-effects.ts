import type { RosterPlayer } from '@/types/roster';
import {
  addStatDelta,
  applyStatDelta,
  hasDelta,
  mergeTeamModifiers,
  teamModifierFromPartial,
  type StatDelta,
  type TeamModifier,
} from './effects';
import { getAbility } from './abilities';
import { ITEM_BY_ID, itemDelta } from './items';
import { boostsToModifier, type PassiveBoost } from './boosts';

/**
 * Bridges the declarative effects into the sim. Two pure entry points used
 * wherever a team is built:
 *  - effectivePlayers: bakes each player's equipped item + legend self-aura into
 *    a COPY of player.stats. Never mutates/persists base stats.
 *  - teamModifierFor: collects the team-level modifier (passive boosts + legend
 *    team-auras/hooks + the on-loan chemistry tax).
 *
 * INVARIANT: per-player deltas are baked exactly once, here, before buildTeam.
 * The sub path (recomputeAggregate) only re-folds the team modifier, never these
 * per-player deltas, so a substitution can never compound an item/ability.
 */

/** −1.0 chemistry tax (split across offense/defense) for fielding an on-loan star. */
const LEGEND_CHEMISTRY: Partial<TeamModifier> = {
  offenseBonus: -0.5,
  defenseBonus: -0.5,
  labels: ['On-Loan Star'],
};

/** Return effective-stat COPIES of a five/bench (items + legend self-auras baked in). */
export function effectivePlayers(players: RosterPlayer[]): RosterPlayer[] {
  return players.map((rp) => {
    let delta: StatDelta = {};
    if (rp.item) {
      const def = ITEM_BY_ID[rp.item.defId];
      if (def) delta = addStatDelta(delta, itemDelta(def));
    }
    const ability = getAbility(rp.ability);
    if (ability?.selfDelta) delta = addStatDelta(delta, ability.selfDelta);
    if (!hasDelta(delta)) return rp;
    return { ...rp, player: { ...rp.player, stats: applyStatDelta(rp.player.stats, delta) } };
  });
}

/**
 * The team-level modifier for a dressed five: passive boosts (player team only),
 * each legend's team-aura and conditional hooks, and the on-loan chemistry tax
 * when a recruited legend is in the five. Opponents pass an empty boost list.
 */
export function teamModifierFor(
  five: readonly RosterPlayer[],
  boosts: readonly PassiveBoost[]
): TeamModifier {
  const mods: TeamModifier[] = [boostsToModifier(boosts)];
  let hasOnLoan = false;
  for (const rp of five) {
    if (rp.onLoan) hasOnLoan = true;
    const ability = getAbility(rp.ability);
    if (!ability) continue;
    if (ability.teamAura) mods.push(teamModifierFromPartial(ability.teamAura));
    if (ability.hooks?.length) mods.push(teamModifierFromPartial({ hooks: ability.hooks }));
  }
  if (hasOnLoan) mods.push(teamModifierFromPartial(LEGEND_CHEMISTRY));
  return mergeTeamModifiers(mods);
}
