import type { RosterPlayer } from '@/types/roster';
import {
  addStatDelta,
  applyStatDelta,
  applyTrainingDelta,
  hasDelta,
  mergeTeamModifiers,
  teamModifierFromPartial,
  type StatDelta,
  type TeamModifier,
} from './effects';
import { getAbility } from './abilities';
import { getGachaAbility } from './abilities-gacha';
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

/** −2.0 chemistry tax (split across offense/defense) for fielding an on-loan star. */
const LEGEND_CHEMISTRY: Partial<TeamModifier> = {
  offenseBonus: -1,
  defenseBonus: -1,
  labels: ['On-Loan Star'],
};

/** Return effective-stat COPIES of a five/bench (item + legend self-aura + equipped
 * gacha ability + run-scoped training baked in). Item/abilities cap at 20; training
 * folds on top, the only path past 20 (up to 30). */
export function effectivePlayers(players: RosterPlayer[]): RosterPlayer[] {
  return players.map((rp) => {
    let delta: StatDelta = {};
    if (rp.item) {
      const def = ITEM_BY_ID[rp.item.defId];
      if (def) delta = addStatDelta(delta, itemDelta(def));
    }
    const ability = getAbility(rp.ability);
    if (ability?.selfDelta) delta = addStatDelta(delta, ability.selfDelta);
    // The gacha-equipped ability is a SEPARATE channel from the legend signature
    // and the run-scoped item; its self-delta stacks in the same single bake pass.
    const gacha = getGachaAbility(rp.equippedAbility?.id);
    if (gacha?.selfDelta) delta = addStatDelta(delta, gacha.selfDelta);
    const hasTraining = !!rp.trainingDelta && hasDelta(rp.trainingDelta);
    if (!hasDelta(delta) && !hasTraining) return rp;
    let stats = applyStatDelta(rp.player.stats, delta);
    if (hasTraining) stats = applyTrainingDelta(stats, rp.trainingDelta);
    return { ...rp, player: { ...rp.player, stats } };
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
    if (ability) {
      if (ability.teamAura) mods.push(teamModifierFromPartial(ability.teamAura));
      if (ability.hooks?.length) mods.push(teamModifierFromPartial({ hooks: ability.hooks }));
    }
    // The equipped gacha ability can also carry a team aura (rare/legendary team boosts).
    const gacha = getGachaAbility(rp.equippedAbility?.id);
    if (gacha?.teamAura) mods.push(teamModifierFromPartial(gacha.teamAura));
  }
  if (hasOnLoan) mods.push(teamModifierFromPartial(LEGEND_CHEMISTRY));
  return mergeTeamModifiers(mods);
}
