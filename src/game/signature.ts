import {
  DIFFICULTIES,
  difficultyAtLeast,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';
import { NBA_LEGENDS } from '@/data/nba';
import { nameKey } from '@/types/roster';
import type { RealPlayer } from '@/types/nba';
import type { BoxLine, SimEvent } from '@/types/sim';

/**
 * SIGNATURE SIGNINGS: how S+ legends are earned. Every legend carries a one-time
 * Signature Card with two marks: the SIGNATURE MOMENT (the legend, fielded on
 * loan, performs their bespoke condition in a single won game) and CHAMPIONSHIP
 * TOGETHER (win a title with them logging minutes in the finale). Both marks are
 * floored by the legend's tier (difficulty AND the S/S+ ladders), credited
 * one-directionally (playing above the floor counts, never below), and keyed
 * once-ever, so easy-mode play can never farm a legend (see
 * docs/signature-signings.md and the research trail behind it).
 *
 * Every challenge DERIVES at runtime from the legend's baked data (playstyle,
 * ratings, overall): one source of truth, no second data file, and a pinned
 * snapshot test makes any tuning change loud in review. Pure and Node-safe;
 * conditions read only the BoxLine / SimEvent shapes the sim already produces.
 */

export type SignatureTemplateId =
  | 'takeover' // score P points
  | 'rain' // make X threes
  | 'maestro' // A assists with <= 2 turnovers
  | 'conductor' // A assists AND P points
  | 'wall' // B blocks
  | 'glass' // R rebounds
  | 'pickpocket' // S steals
  | 'clutch'; // score Q points in the 4th quarter

/** Where the moment must land, escalating with the legend's tier. */
export type MomentStage = 'any' | 'elite' | 'boss';

export type SignatureTier = 1 | 2 | 3;

export interface SignatureParams {
  pts?: number;
  threes?: number;
  ast?: number;
  maxTov?: number;
  reb?: number;
  blk?: number;
  stl?: number;
  q4pts?: number;
}

export interface SignatureChallenge {
  /** The legend's stable collection key (`name|POS`). */
  legendKey: string;
  slug: string;
  legendName: string;
  templateId: SignatureTemplateId;
  tier: SignatureTier;
  /** Minimum difficulty for BOTH marks (one-directional: above always counts). */
  floor: Difficulty;
  /** The node tier the moment itself must land in. */
  stage: MomentStage;
  params: SignatureParams;
  /** The condition line the Legends board shows, stage included. */
  text: string;
}

// --- Tiers: derived from the baked 2K overall (21 GREAT / 47 ICON / 24 PANTHEON) ---

export const SIGNATURE_TIER_NAMES: Record<SignatureTier, string> = {
  1: 'GREAT',
  2: 'ICON',
  3: 'PANTHEON',
};

export function signatureTier(overall: number): SignatureTier {
  if (overall >= 97) return 3;
  if (overall >= 93) return 2;
  return 1;
}

/** The difficulty floor per tier: the biggest names demand the biggest stages.
 * If the pacing harness bands drift, PANTHEON softening to hard is the tunable. */
const TIER_FLOOR: Record<SignatureTier, Difficulty> = {
  1: 'medium',
  2: 'hard',
  3: 'insane',
};

/** Where the moment must happen per tier: any game, elite or boss, boss only. */
const TIER_STAGE: Record<SignatureTier, MomentStage> = {
  1: 'any',
  2: 'elite',
  3: 'boss',
};

// --- Params: tier-indexed condition numbers, CALIBRATED against real seeded sims
// (signature-sim.test.ts pins the bands). The sim's team totals run ~45-60 and its
// defensive counting stats are scarce (a monster rim-protector game is 2-3 blocks,
// not 8), so these read small next to NBA box scores on purpose. ---

const PTS_BY_TIER: Record<SignatureTier, number> = { 1: 21, 2: 22, 3: 24 };
const THREES_BY_TIER: Record<SignatureTier, number> = { 1: 2, 2: 2, 3: 3 };
const AST_BY_TIER: Record<SignatureTier, number> = { 1: 8, 2: 9, 3: 10 };
const MAESTRO_MAX_TOV = 2;
const CONDUCTOR_AST_BY_TIER: Record<SignatureTier, number> = { 1: 5, 2: 5, 3: 6 };
const CONDUCTOR_PTS_BY_TIER: Record<SignatureTier, number> = { 1: 15, 2: 16, 3: 17 };
const BLK_BY_TIER: Record<SignatureTier, number> = { 1: 2, 2: 2, 3: 3 };
const REB_BY_TIER: Record<SignatureTier, number> = { 1: 10, 2: 11, 3: 12 };
const STL_BY_TIER: Record<SignatureTier, number> = { 1: 2, 2: 2, 3: 3 };
const Q4_PTS_BY_TIER: Record<SignatureTier, number> = { 1: 6, 2: 7, 3: 8 };

/** The clutch rating a legend needs before CLUTCH GENE claims their card. */
const CLUTCH_GENE_MIN = 24;
/** The baked diet's three-ball weight runs 1-29 across the legends (median 14);
 * at or above this a player genuinely HUNTS threes (Curry 27, Ray Allen 23,
 * Maravich 22), the honest sniper signal. Absolute OUTSIDE thresholds mislabel
 * legends, whose ratings are all inflated. */
const RAIN_DIET_MIN = 22;
/** The fallback sniper read for legends with no baked tendency (Reggie Miller). */
const RAIN_OUTSIDE_MIN = 23;

/**
 * Hand-authored exceptions for marquee legends whose derived template misses the
 * legend's story. Keyed by slug; merged over the derived assignment. Kept tiny on
 * purpose: the derivation should carry the pool, and every entry here shows up in
 * the pinned snapshot.
 */
const SIGNATURE_OVERRIDES: Partial<
  Record<string, { templateId: SignatureTemplateId }>
> = {
  // The shot over Ehlo, the Flu Game dagger, 6-for-6 in June: MJ's card is the
  // closer's, not a stat line.
  'michael-jordan': { templateId: 'clutch' },
  // The two greatest distributors ever run the table, they do not close it.
  'magic-johnson': { templateId: 'maestro' },
  'john-stockton': { templateId: 'maestro' },
  // The best rebounder who ever lived owns the glass, not the rim.
  'dennis-rodman': { templateId: 'glass' },
  // Mr. Triple-Double's card asks for the two-way stat line.
  'oscar-robertson': { templateId: 'conductor' },
};

// --- Template derivation ---

/** The template a legend's data earns, before overrides. First match wins and
 * every comparison is RELATIVE to the player's own profile (their diet
 * multipliers and stat shape), so inflated legend ratings cannot mislabel a
 * post giant as a sniper. Deterministic and snapshot-stable. */
function deriveTemplate(legend: RealPlayer): SignatureTemplateId {
  const stats = legend.stats;
  const threeHungry = (legend.tendency?.shot.three ?? 0) >= RAIN_DIET_MIN;
  const playstyle = legend.tendency?.playstyle;
  switch (playstyle) {
    case 'rim-protector':
      return 'wall';
    case 'three-and-d':
    case 'movement-shooter':
      return 'rain';
    case 'stretch-big':
      return threeHungry ? 'rain' : 'glass';
    case 'two-way-wing':
      return 'pickpocket';
    case 'point-forward':
      // Forwards rarely rack assists in this sim (the harness proved CONDUCTOR is
      // a dead letter for them), so a point-forward's card is the closer's or the
      // scorer's, never the distributor's.
      return stats.clutch >= CLUTCH_GENE_MIN ? 'clutch' : 'takeover';
    case 'shot-creator':
    case 'combo-guard':
    case 'slasher':
      return 'takeover';
    case 'rim-runner':
    case 'post-scorer':
      return stats.rebounding >= stats.blocking ? 'glass' : 'wall';
    case 'floor-general':
      // The biggest bucket (33 legends) splits four ways so the board reads
      // varied: the coldest closers take CLUTCH GENE, three-hungry generals
      // RAIN, scoring generals CONDUCTOR, pure table-setters MAESTRO.
      if (stats.clutch >= CLUTCH_GENE_MIN) return 'clutch';
      if (threeHungry) return 'rain';
      return stats.outside > stats.playmaking ? 'conductor' : 'maestro';
    default: {
      // No baked playstyle: fall back to the loudest relative signal.
      if (stats.blocking >= stats.rebounding && stats.blocking >= 20) return 'wall';
      if (stats.rebounding >= 20) return 'glass';
      if (threeHungry || stats.outside >= RAIN_OUTSIDE_MIN) return 'rain';
      return 'takeover';
    }
  }
}

function paramsFor(templateId: SignatureTemplateId, tier: SignatureTier): SignatureParams {
  switch (templateId) {
    case 'takeover':
      return { pts: PTS_BY_TIER[tier] };
    case 'rain':
      return { threes: THREES_BY_TIER[tier] };
    case 'maestro':
      return { ast: AST_BY_TIER[tier], maxTov: MAESTRO_MAX_TOV };
    case 'conductor':
      return { ast: CONDUCTOR_AST_BY_TIER[tier], pts: CONDUCTOR_PTS_BY_TIER[tier] };
    case 'wall':
      return { blk: BLK_BY_TIER[tier] };
    case 'glass':
      return { reb: REB_BY_TIER[tier] };
    case 'pickpocket':
      return { stl: STL_BY_TIER[tier] };
    case 'clutch':
      return { q4pts: Q4_PTS_BY_TIER[tier] };
  }
}

function conditionText(templateId: SignatureTemplateId, params: SignatureParams): string {
  switch (templateId) {
    case 'takeover':
      return `Drop ${params.pts} points in one game`;
    case 'rain':
      return `Bury ${params.threes} threes in one game`;
    case 'maestro':
      return `Dish ${params.ast} assists with ${params.maxTov} or fewer turnovers`;
    case 'conductor':
      return `Post ${params.pts} points and ${params.ast} assists in one game`;
    case 'wall':
      return `Swat ${params.blk} shots in one game`;
    case 'glass':
      return `Pull down ${params.reb} boards in one game`;
    case 'pickpocket':
      return `Pick ${params.stl} pockets in one game`;
    case 'clutch':
      return `Score ${params.q4pts} in the 4th quarter of a win`;
  }
}

const STAGE_SUFFIX: Record<MomentStage, string> = {
  any: '',
  elite: ', in an elite or boss game',
  boss: ', in a boss game',
};

/** Derive one legend's signature challenge from their baked data. */
export function signatureFor(legend: RealPlayer): SignatureChallenge {
  const tier = signatureTier(legend.overall);
  const templateId =
    SIGNATURE_OVERRIDES[legend.slug]?.templateId ?? deriveTemplate(legend);
  const params = paramsFor(templateId, tier);
  return {
    legendKey: nameKey(legend.name, legend.position),
    slug: legend.slug,
    legendName: legend.name,
    templateId,
    tier,
    floor: TIER_FLOOR[tier],
    stage: TIER_STAGE[tier],
    params,
    text: `${conditionText(templateId, params)}${STAGE_SUFFIX[TIER_STAGE[tier]]}`,
  };
}

// Lazily-built catalog + lookups over the 92 baked legends (computed once; the
// dataset is static for a session).
let catalog: readonly SignatureChallenge[] | null = null;
let byKey: Map<string, SignatureChallenge> | null = null;
let legendIndex: Map<string, RealPlayer> | null = null;

/** Every legend's signature challenge, in the dataset's order. */
export function allSignatureChallenges(): readonly SignatureChallenge[] {
  if (!catalog) catalog = NBA_LEGENDS.map(signatureFor);
  return catalog;
}

/** The challenge for a legend's collection key, or undefined for non-legends. */
export function signatureByKey(key: string): SignatureChallenge | undefined {
  if (!byKey) {
    byKey = new Map(allSignatureChallenges().map((ch) => [ch.legendKey, ch]));
  }
  return byKey.get(key);
}

/** The baked legend behind a collection key (for building a card at a settle
 * where the legend is no longer on the squad, e.g. cut after earning a mark). */
export function legendByKey(key: string): RealPlayer | undefined {
  if (!legendIndex) {
    legendIndex = new Map(NBA_LEGENDS.map((l) => [nameKey(l.name, l.position), l]));
  }
  return legendIndex.get(key);
}

/**
 * LEGACY CONTRACT prices by tier: the deterministic buyout of ONLY the
 * championship mark, purchasable once a legend's MOMENT is already proven (coins
 * never skip the challenge itself; the Head Basketball rule that the condition is
 * the intended path and the price is deliberately punitive). At ~950/1,300/1,850/2,600
 * coins per clear, a buyout costs 6-14 runs of pure income vs 1-3 more runs for
 * the honest championship, so clearing strictly dominates while a player who can
 * hit the moment but not the clear keeps a visible, reachable ceiling.
 */
export const LEGACY_CONTRACT_PRICE: Record<SignatureTier, number> = {
  1: 8000,
  2: 15000,
  3: 25000,
};

/** The Legacy Contract price for one legend's card. */
export function contractPriceFor(challenge: Pick<SignatureChallenge, 'tier'>): number {
  return LEGACY_CONTRACT_PRICE[challenge.tier];
}

// --- The Signature Card: two one-time marks, in any order, across any runs ---

export type SignatureMarkKind = 'moment' | 'title';

/** One mark earned during a run (run-scoped; banks at the terminal settle). */
export interface SignatureMark {
  legendKey: string;
  mark: SignatureMarkKind;
}

/** The card ledger entry for a single legend (two optional marks). */
export type SignatureMarks = Partial<Record<SignatureMarkKind, Difficulty>>;

/** The persisted card ledger: the difficulty each earned mark was proven at
 * (marks never revoke; a completed card signs the legend and leaves the ledger). */
export type SignatureLedger = Record<string, Partial<Record<SignatureMarkKind, Difficulty>>>;

/** Both marks earned = the legend signs. */
export function signatureComplete(card: SignatureLedger[string] | undefined): boolean {
  return !!card?.moment && !!card?.title;
}

/** Restore a persisted card ledger: keep marks that name a real legend and a real
 * difficulty, drop entries for owned legends (their chase is complete: the favor
 * hygiene rule), degrade garbage to empty. */
export function sanitizeSignatures(raw: unknown, owned: ReadonlySet<string>): SignatureLedger {
  if (!raw || typeof raw !== 'object') return {};
  const out: SignatureLedger = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (owned.has(key) || !signatureByKey(key)) continue;
    if (!value || typeof value !== 'object') continue;
    const card: SignatureLedger[string] = {};
    for (const mark of ['moment', 'title'] as const) {
      const d = (value as Record<string, unknown>)[mark];
      if (typeof d === 'string' && (DIFFICULTIES as readonly string[]).includes(d)) {
        card[mark] = d as Difficulty;
      }
    }
    if (card.moment || card.title) out[key] = card;
  }
  return out;
}

// --- Evaluation ---

/** One-directional floor: the run's difficulty must sit at or above the
 * challenge floor AND the run must be on the S or S+ ladder (legends' stage). */
export function meetsSignatureFloor(
  challenge: Pick<SignatureChallenge, 'floor'>,
  difficulty: Difficulty,
  ladderClass: LadderClass
): boolean {
  if (ladderClass !== 'S' && ladderClass !== 'S+') return false;
  return difficultyAtLeast(difficulty, challenge.floor);
}

/** Whether a node tier satisfies the challenge's moment stage. */
export function stageAllows(stage: MomentStage, nodeType: 'game' | 'elite' | 'boss'): boolean {
  if (stage === 'any') return true;
  if (stage === 'elite') return nodeType === 'elite' || nodeType === 'boss';
  return nodeType === 'boss';
}

/** CLUTCH GENE: the legend's own points in the 4th quarter (or later) of the won
 * game, straight off the play-by-play. Closing time is when the whole building
 * watches; the box score cannot see it, the timeline can. Exported so the
 * showcase near-miss read (momentGap) measures with the same eyes. */
export function fourthQuarterPoints(events: readonly SimEvent[], scorerName: string): number {
  let pts = 0;
  for (const e of events) {
    if (e.quarter < 4 || e.team !== 'home' || e.points <= 0) continue;
    if (e.scorerName === scorerName) pts += e.points;
  }
  return pts;
}

export interface MomentGameContext {
  difficulty: Difficulty;
  ladderClass: LadderClass;
  nodeType: 'game' | 'elite' | 'boss';
  /** The legend's OWN box line in the won game; undefined = never checked in. */
  line: BoxLine | undefined;
  /** The play-by-play, needed only by CLUTCH GENE. */
  events?: readonly SimEvent[];
}

/**
 * Whether a single WON game satisfies a legend's SIGNATURE MOMENT. The caller
 * guarantees the win (moments never come from losses, favor's rule); floor,
 * stage, minutes, and the condition itself are all checked here.
 */
export function momentMet(challenge: SignatureChallenge, ctx: MomentGameContext): boolean {
  if (!meetsSignatureFloor(challenge, ctx.difficulty, ctx.ladderClass)) return false;
  if (!stageAllows(challenge.stage, ctx.nodeType)) return false;
  const line = ctx.line;
  if (!line || line.seconds <= 0) return false;
  const p = challenge.params;
  switch (challenge.templateId) {
    case 'takeover':
      return line.pts >= (p.pts ?? Infinity);
    case 'rain':
      return line.tpm >= (p.threes ?? Infinity);
    case 'maestro':
      return line.ast >= (p.ast ?? Infinity) && line.tov <= (p.maxTov ?? 0);
    case 'conductor':
      return line.ast >= (p.ast ?? Infinity) && line.pts >= (p.pts ?? Infinity);
    case 'wall':
      return line.blk >= (p.blk ?? Infinity);
    case 'glass':
      return line.reb >= (p.reb ?? Infinity);
    case 'pickpocket':
      return line.stl >= (p.stl ?? Infinity);
    case 'clutch':
      return ctx.events
        ? fourthQuarterPoints(ctx.events, challenge.legendName) >= (p.q4pts ?? Infinity)
        : false;
  }
}
