import type { RosterPlayer } from '@/types/roster';
import {
  addStatDelta,
  applyStatDelta,
  applyTrainingDelta,
  hasDelta,
  mergeTeamModifiers,
  resolveScaling,
  teamModifierFromPartial,
  type RunCounters,
  type StatDelta,
  type TeamModifier,
} from './effects';
import { getAbility } from './abilities';
import { getGachaAbility } from './abilities-gacha';
import { ITEM_BY_ID, itemDelta } from './items';
import { boostsToModifier, type PassiveBoost } from './boosts';
import { resolveSets } from './sets';

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
 * gacha ability + run-scoped training baked in). Item/abilities soft-cap into the
 * elite band (full value to 20, diminishing to 24); training folds on top, the only
 * path to the 30 hard cap. */
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
  boosts: readonly PassiveBoost[],
  counters?: RunCounters
): TeamModifier {
  const mods: TeamModifier[] = [boostsToModifier(boosts, counters)];
  let hasOnLoan = false;
  for (const rp of five) {
    if (rp.onLoan) hasOnLoan = true;
    const ability = getAbility(rp.ability);
    if (ability) {
      if (ability.teamAura) mods.push(teamModifierFromPartial(ability.teamAura));
      if (ability.hooks?.length) mods.push(teamModifierFromPartial({ hooks: ability.hooks }));
    }
    // The equipped gacha ability can also carry a team aura and/or conditional hooks.
    const gacha = getGachaAbility(rp.equippedAbility?.id);
    if (gacha?.teamAura) mods.push(teamModifierFromPartial(gacha.teamAura));
    if (gacha?.hooks?.length) mods.push(teamModifierFromPartial({ hooks: gacha.hooks }));
    // A run item's conditional hooks ride the team modifier (a separate channel
    // from its flat itemDelta, which is baked once in effectivePlayers). Its
    // snowball ramp also rides here (resolved from the run counters), so the
    // growing portion never compounds through the per-player bake. Both are
    // player-team only: opponents pass no counters, so item scaling is skipped.
    if (rp.item) {
      const itemDef = ITEM_BY_ID[rp.item.defId];
      if (itemDef?.hooks?.length) mods.push(teamModifierFromPartial({ hooks: itemDef.hooks }));
      if (itemDef?.scaling && counters) mods.push(resolveScaling(itemDef.scaling, counters));
    }
  }
  // Set/duo synergies are a player BUILD reward: resolved on the player path only
  // (counters present), so opponents never trigger them. They fold into the frozen
  // modifier here, surviving substitutions like any other team bonus.
  if (counters) {
    for (const m of resolveSets(five, boosts).active) mods.push(m);
  }
  if (hasOnLoan) mods.push(teamModifierFromPartial(LEGEND_CHEMISTRY));
  return mergeTeamModifiers(mods);
}
