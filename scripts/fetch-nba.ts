/**
 * Offline NBA dataset baker. Pulls ratings from the NBA 2K API
 * (https://www.nba2kapi.com) and writes baked JSON under src/data. The app NEVER
 * calls the API at runtime, so the sim stays deterministic, offline, and the API
 * key never ships.
 *
 * Two modes:
 *   NBA2K_API_KEY=key npx tsx scripts/fetch-nba.ts --mode=legends   (default)
 *     Bakes the curated all-time-great LEGEND pool to src/data/nba-legends.json.
 *     One request per slug in ROSTER (~40). The `legendary` flag and each legend's
 *     signature `ability` are hand-maintained after a bake (the API gives neither).
 *
 *   NBA2K_API_KEY=key npx tsx scripts/fetch-nba.ts --mode=pool
 *     Bakes a LARGE real-player pool (~400-500 current players, all classes) to
 *     src/data/nba-pool.json. Uses the PAGINATED list endpoint (limit=100), so the
 *     whole pool is only ~7 requests: it never fans out per-slug. Each player is
 *     bucketed into a class (C/B/A/S) by 2K overall, and its in-game stats are
 *     anchored to a quality-varied point INSIDE that class's band (by where its 2K
 *     overall sits in the bucket), so same-class reals spread across the window
 *     instead of all sharing one OVR while the badge still matches the band. Pool
 *     players have no `ability` and are not legends.
 *
 *   npx tsx scripts/fetch-nba.ts --mode=reanchor   (OFFLINE, no API key)
 *     Re-spreads the already-committed src/data/nba-pool.json using each player's
 *     stored 2K `overall`. Anchoring only shifts a line as a whole, so the baked
 *     stats still carry each player's shape; this re-anchors them to the same
 *     quality-varied targets as --mode=pool, with no network call. Use it to apply
 *     the within-class-variance fix without a full re-bake.
 *
 *   npx tsx scripts/fetch-nba.ts --mode=demote   (OFFLINE, no API key)
 *     Relocates the DEMOTE_TO_S legends into the keepable S "Superstar" tier:
 *     removes them from nba-legends.json and folds them into nba-pool.json
 *     (re-sorted), re-anchored to the S band (signature ability kept, `legendary`
 *     dropped). Also stamps the three homegrown S players with their S_SIGNATURES.
 *     This populates the formerly near-empty S tier so superstars are attainable.
 *     Offline and idempotent. (A later --mode=pool re-bake reproduces the same
 *     membership and abilities from the API, since both honor DEMOTE_TO_S /
 *     S_SIGNATURES; the re-baked stat lines come from live attributes, so they
 *     need not be byte-identical to the offline re-anchor.)
 *
 * Rate limit: the 2K API allows 500 requests/day. A full re-bake of BOTH modes is
 * ~45 requests, far under the cap. A short delay is inserted between list pages.
 *
 * Optional env:
 *   NBA2K_API_BASE   override the API base URL (default below)
 *
 * The key is read from the environment only. Do not hardcode it or commit it.
 * Team colors live in src/data/nba-teams.json and are maintained by hand.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapRatingsToStats, deriveTendency, type RawRatings } from '../src/game/nba-map';
import type { BakedTendency } from '../src/game/playstyle';
import { backfillPlayStyleStats } from '../src/game/stat-migration';
import type { PlayerStats } from '../src/types/player';
import { anchorStatsToClass, classTargetOvr } from '../src/game/classes';
import { ovr, classForOvr, type PlayerClass } from '../src/game/ratings';
import { STAT_MIN, STAT_NORMAL_MAX, clamp } from '../src/game/stat-scaling';
import teams from '../src/data/nba-teams.json';
import legendsData from '../src/data/nba-legends.json';

type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
type Era = 'historical' | 'modern';

/** Who to bake (legend mode), with the metadata the ratings API does not give us cleanly. */
interface RosterEntry {
  slug: string;
  teamAbbr: string;
  era: Era;
  position: Position;
  jerseyNumber: number;
  /** Signature ability id (see src/game/abilities.ts). The ROSTER is the source of
   * truth for each legend's signature; the bake writes it onto the legend line. */
  ability: string;
}

// Edit this list to change the baked LEGEND pool. Slugs match the API's player slugs.
const ROSTER: RosterEntry[] = [
  { slug: 'michael-jordan', teamAbbr: 'CHI', era: 'historical', position: 'SG', jerseyNumber: 23, ability: 'flu_game' },
  { slug: 'magic-johnson', teamAbbr: 'LAL', era: 'historical', position: 'PG', jerseyNumber: 32, ability: 'showtime' },
  { slug: 'larry-bird', teamAbbr: 'BOS', era: 'historical', position: 'SF', jerseyNumber: 33, ability: 'cold_blooded' },
  { slug: 'kareem-abdul-jabbar', teamAbbr: 'LAL', era: 'historical', position: 'C', jerseyNumber: 33, ability: 'sky_hook' },
  { slug: 'hakeem-olajuwon', teamAbbr: 'HOU', era: 'historical', position: 'C', jerseyNumber: 34, ability: 'dream_shake' },
  { slug: 'tim-duncan', teamAbbr: 'SAS', era: 'historical', position: 'PF', jerseyNumber: 21, ability: 'rim_wall' },
  { slug: 'shaquille-oneal', teamAbbr: 'LAL', era: 'historical', position: 'C', jerseyNumber: 34, ability: 'diesel' },
  { slug: 'kobe-bryant', teamAbbr: 'LAL', era: 'historical', position: 'SG', jerseyNumber: 24, ability: 'mamba' },
  { slug: 'allen-iverson', teamAbbr: 'PHI', era: 'historical', position: 'PG', jerseyNumber: 3, ability: 'crossover' },
  { slug: 'scottie-pippen', teamAbbr: 'CHI', era: 'historical', position: 'SF', jerseyNumber: 33, ability: 'pippen_lockdown' },
  { slug: 'lebron-james', teamAbbr: 'LAL', era: 'modern', position: 'SF', jerseyNumber: 23, ability: 'chosen_one' },
  { slug: 'stephen-curry', teamAbbr: 'GSW', era: 'modern', position: 'PG', jerseyNumber: 30, ability: 'gravity' },
  { slug: 'kevin-durant', teamAbbr: 'HOU', era: 'modern', position: 'SF', jerseyNumber: 35, ability: 'unguardable' },
  { slug: 'giannis-antetokounmpo', teamAbbr: 'MIA', era: 'modern', position: 'PF', jerseyNumber: 34, ability: 'greek_freak' },
  { slug: 'nikola-jokic', teamAbbr: 'DEN', era: 'modern', position: 'C', jerseyNumber: 15, ability: 'point_center' },
  { slug: 'joel-embiid', teamAbbr: 'PHI', era: 'modern', position: 'C', jerseyNumber: 21, ability: 'the_process' },
  { slug: 'luka-doncic', teamAbbr: 'LAL', era: 'modern', position: 'PG', jerseyNumber: 77, ability: 'step_back' },
  { slug: 'jayson-tatum', teamAbbr: 'BOS', era: 'modern', position: 'SF', jerseyNumber: 0, ability: 'shot_creator' },
  { slug: 'devin-booker', teamAbbr: 'PHX', era: 'modern', position: 'SG', jerseyNumber: 1, ability: 'be_legendary' },
  { slug: 'damian-lillard', teamAbbr: 'POR', era: 'modern', position: 'PG', jerseyNumber: 0, ability: 'dame_time' },
  { slug: 'anthony-davis', teamAbbr: 'WAS', era: 'modern', position: 'PF', jerseyNumber: 3, ability: 'the_brow' },
  { slug: 'jimmy-butler', teamAbbr: 'MIA', era: 'modern', position: 'SF', jerseyNumber: 22, ability: 'playoff_jimmy' },
  { slug: 'ja-morant', teamAbbr: 'MEM', era: 'modern', position: 'PG', jerseyNumber: 12, ability: 'ja_liftoff' },
  { slug: 'shai-gilgeous-alexander', teamAbbr: 'OKC', era: 'modern', position: 'SG', jerseyNumber: 2, ability: 'midrange_maestro' },
  { slug: 'dominique-wilkins', teamAbbr: 'ATL', era: 'historical', position: 'SF', jerseyNumber: 21, ability: 'human_highlight' },
  { slug: 'jason-kidd', teamAbbr: 'BKN', era: 'historical', position: 'PG', jerseyNumber: 5, ability: 'triple_double_kidd' },
  { slug: 'larry-johnson', teamAbbr: 'CHA', era: 'historical', position: 'PF', jerseyNumber: 2, ability: 'grandmama' },
  { slug: 'mark-price', teamAbbr: 'CLE', era: 'historical', position: 'PG', jerseyNumber: 25, ability: 'deadeye_price' },
  { slug: 'isiah-thomas', teamAbbr: 'DET', era: 'historical', position: 'PG', jerseyNumber: 11, ability: 'zeke' },
  { slug: 'reggie-miller', teamAbbr: 'IND', era: 'historical', position: 'SG', jerseyNumber: 31, ability: 'miller_time' },
  { slug: 'chris-paul', teamAbbr: 'LAC', era: 'modern', position: 'PG', jerseyNumber: 3, ability: 'point_god' },
  { slug: 'kevin-garnett', teamAbbr: 'MIN', era: 'historical', position: 'PF', jerseyNumber: 21, ability: 'big_ticket' },
  { slug: 'zion-williamson', teamAbbr: 'NOP', era: 'modern', position: 'PF', jerseyNumber: 1, ability: 'zion_force' },
  { slug: 'patrick-ewing', teamAbbr: 'NYK', era: 'historical', position: 'C', jerseyNumber: 33, ability: 'ewing_anchor' },
  { slug: 'tracy-mcgrady', teamAbbr: 'ORL', era: 'historical', position: 'SF', jerseyNumber: 1, ability: 'tmac_iso' },
  { slug: 'clyde-drexler', teamAbbr: 'POR', era: 'historical', position: 'SG', jerseyNumber: 22, ability: 'the_glide' },
  { slug: 'chris-webber', teamAbbr: 'SAC', era: 'historical', position: 'PF', jerseyNumber: 4, ability: 'point_forward' },
  { slug: 'vince-carter', teamAbbr: 'TOR', era: 'historical', position: 'SG', jerseyNumber: 15, ability: 'vinsanity' },
  { slug: 'karl-malone', teamAbbr: 'UTA', era: 'historical', position: 'PF', jerseyNumber: 32, ability: 'mailman' },
  { slug: 'gilbert-arenas', teamAbbr: 'WAS', era: 'historical', position: 'SG', jerseyNumber: 0, ability: 'agent_zero' },
  // --- Expanded curated legend pool (85 new all-time greats) ---
  { slug: 'ray-allen', teamAbbr: 'MIL', era: 'historical', position: 'SG', jerseyNumber: 34, ability: 'jesus_shuttlesworth' },
  { slug: 'carmelo-anthony', teamAbbr: 'DEN', era: 'historical', position: 'SF', jerseyNumber: 15, ability: 'hoodie_melo' },
  { slug: 'nate-archibald', teamAbbr: 'SAC', era: 'historical', position: 'PG', jerseyNumber: 1, ability: 'tiny' },
  { slug: 'paul-arizin', teamAbbr: 'GSW', era: 'historical', position: 'SF', jerseyNumber: 11, ability: 'pitchin_paul' },
  { slug: 'rick-barry', teamAbbr: 'GSW', era: 'historical', position: 'SF', jerseyNumber: 24, ability: 'granny_shot' },
  { slug: 'elgin-baylor', teamAbbr: 'LAL', era: 'historical', position: 'SF', jerseyNumber: 22, ability: 'hang_time' },
  { slug: 'dave-bing', teamAbbr: 'DET', era: 'historical', position: 'PG', jerseyNumber: 21, ability: 'motor_city' },
  { slug: 'wilt-chamberlain', teamAbbr: 'GSW', era: 'historical', position: 'C', jerseyNumber: 13, ability: 'hundred_point_night' },
  { slug: 'bob-cousy', teamAbbr: 'BOS', era: 'historical', position: 'PG', jerseyNumber: 14, ability: 'houdini' },
  { slug: 'dave-cowens', teamAbbr: 'BOS', era: 'historical', position: 'C', jerseyNumber: 18, ability: 'big_redhead' },
  { slug: 'billy-cunningham', teamAbbr: 'PHI', era: 'historical', position: 'SF', jerseyNumber: 32, ability: 'kangaroo_kid' },
  { slug: 'dave-debusschere', teamAbbr: 'NYK', era: 'historical', position: 'PF', jerseyNumber: 22, ability: 'iron_lung' },
  { slug: 'julius-erving', teamAbbr: 'BKN', era: 'historical', position: 'SF', jerseyNumber: 6, ability: 'doctor_dunk' },
  { slug: 'walt-frazier', teamAbbr: 'NYK', era: 'historical', position: 'PG', jerseyNumber: 10, ability: 'clyde_steal' },
  { slug: 'george-gervin', teamAbbr: 'SAS', era: 'historical', position: 'SF', jerseyNumber: 44, ability: 'iceman' },
  { slug: 'hal-greer', teamAbbr: 'PHI', era: 'historical', position: 'PG', jerseyNumber: 15, ability: 'midrange_metronome' },
  { slug: 'james-harden', teamAbbr: 'CLE', era: 'modern', position: 'PG', jerseyNumber: 13, ability: 'the_beard' },
  { slug: 'john-havlicek', teamAbbr: 'BOS', era: 'historical', position: 'SF', jerseyNumber: 17, ability: 'havlicek_stole_it' },
  { slug: 'elvin-hayes', teamAbbr: 'WAS', era: 'historical', position: 'PF', jerseyNumber: 11, ability: 'the_big_e' },
  { slug: 'kawhi-leonard', teamAbbr: 'LAC', era: 'modern', position: 'SF', jerseyNumber: 2, ability: 'klaw' },
  { slug: 'jerry-lucas', teamAbbr: 'SAC', era: 'historical', position: 'PF', jerseyNumber: 16, ability: 'dr_memory' },
  { slug: 'moses-malone', teamAbbr: 'PHI', era: 'historical', position: 'C', jerseyNumber: 24, ability: 'chairman_boards' },
  { slug: 'pete-maravich', teamAbbr: 'UTA', era: 'historical', position: 'SG', jerseyNumber: 7, ability: 'pistol' },
  { slug: 'bob-mcadoo', teamAbbr: 'LAC', era: 'historical', position: 'C', jerseyNumber: 11, ability: 'jump_shooting_big' },
  { slug: 'kevin-mchale', teamAbbr: 'BOS', era: 'historical', position: 'PF', jerseyNumber: 32, ability: 'torture_chamber' },
  { slug: 'george-mikan', teamAbbr: 'LAL', era: 'historical', position: 'C', jerseyNumber: 99, ability: 'mr_basketball' },
  { slug: 'earl-monroe', teamAbbr: 'WAS', era: 'historical', position: 'PG', jerseyNumber: 10, ability: 'black_magic' },
  { slug: 'steve-nash', teamAbbr: 'PHX', era: 'historical', position: 'PG', jerseyNumber: 13, ability: 'seven_seconds' },
  { slug: 'dirk-nowitzki', teamAbbr: 'DAL', era: 'historical', position: 'PF', jerseyNumber: 41, ability: 'one_legged_fade' },
  { slug: 'robert-parish', teamAbbr: 'BOS', era: 'historical', position: 'C', jerseyNumber: 0, ability: 'the_chief' },
  { slug: 'gary-payton', teamAbbr: 'OKC', era: 'historical', position: 'PG', jerseyNumber: 20, ability: 'glove' },
  { slug: 'bob-pettit', teamAbbr: 'ATL', era: 'historical', position: 'PF', jerseyNumber: 9, ability: 'workhorse' },
  { slug: 'paul-pierce', teamAbbr: 'BOS', era: 'historical', position: 'SF', jerseyNumber: 34, ability: 'the_truth' },
  { slug: 'willis-reed', teamAbbr: 'NYK', era: 'historical', position: 'C', jerseyNumber: 19, ability: 'captain_courageous' },
  { slug: 'oscar-robertson', teamAbbr: 'SAC', era: 'historical', position: 'PG', jerseyNumber: 14, ability: 'triple_double_machine' },
  { slug: 'david-robinson', teamAbbr: 'SAS', era: 'historical', position: 'C', jerseyNumber: 50, ability: 'the_admiral' },
  { slug: 'dennis-rodman', teamAbbr: 'CHI', era: 'historical', position: 'PF', jerseyNumber: 91, ability: 'the_worm' },
  { slug: 'bill-russell', teamAbbr: 'BOS', era: 'historical', position: 'C', jerseyNumber: 6, ability: 'eleven_rings' },
  { slug: 'dolph-schayes', teamAbbr: 'PHI', era: 'historical', position: 'PF', jerseyNumber: 4, ability: 'iron_man_dolph' },
  { slug: 'bill-sharman', teamAbbr: 'BOS', era: 'historical', position: 'SG', jerseyNumber: 21, ability: 'free_throw_king' },
  { slug: 'john-stockton', teamAbbr: 'UTA', era: 'historical', position: 'PG', jerseyNumber: 12, ability: 'floor_general' },
  { slug: 'nate-thurmond', teamAbbr: 'GSW', era: 'historical', position: 'C', jerseyNumber: 42, ability: 'nate_the_great' },
  { slug: 'wes-unseld', teamAbbr: 'WAS', era: 'historical', position: 'C', jerseyNumber: 41, ability: 'outlet_cannon' },
  { slug: 'dwyane-wade', teamAbbr: 'MIA', era: 'historical', position: 'SG', jerseyNumber: 3, ability: 'flash' },
  { slug: 'bill-walton', teamAbbr: 'POR', era: 'historical', position: 'C', jerseyNumber: 32, ability: 'redwood' },
  { slug: 'jerry-west', teamAbbr: 'LAL', era: 'historical', position: 'PG', jerseyNumber: 44, ability: 'mr_clutch' },
  { slug: 'russell-westbrook', teamAbbr: 'SAC', era: 'modern', position: 'PG', jerseyNumber: 0, ability: 'brodie' },
  { slug: 'james-worthy', teamAbbr: 'LAL', era: 'historical', position: 'SF', jerseyNumber: 42, ability: 'big_game_james' },
  { slug: 'kyrie-irving', teamAbbr: 'DAL', era: 'modern', position: 'SG', jerseyNumber: 11, ability: 'uncle_drew' },
  { slug: 'paul-george', teamAbbr: 'PHI', era: 'modern', position: 'PF', jerseyNumber: 8, ability: 'pandemic_p' },
  { slug: 'klay-thompson', teamAbbr: 'DAL', era: 'modern', position: 'SF', jerseyNumber: 31, ability: 'splash_brother' },
  { slug: 'draymond-green', teamAbbr: 'GSW', era: 'modern', position: 'C', jerseyNumber: 23, ability: 'defensive_qb' },
  { slug: 'anthony-edwards', teamAbbr: 'MIN', era: 'modern', position: 'SG', jerseyNumber: 5, ability: 'ant_man' },
  { slug: 'victor-wembanyama', teamAbbr: 'SAS', era: 'modern', position: 'C', jerseyNumber: 1, ability: 'the_alien' },
  { slug: 'donovan-mitchell', teamAbbr: 'CLE', era: 'modern', position: 'SG', jerseyNumber: 45, ability: 'spida' },
  { slug: 'jaylen-brown', teamAbbr: 'BOS', era: 'modern', position: 'SF', jerseyNumber: 7, ability: 'two_way_wing' },
  { slug: 'trae-young', teamAbbr: 'WAS', era: 'modern', position: 'PG', jerseyNumber: 11, ability: 'ice_trae' },
  { slug: 'tyrese-haliburton', teamAbbr: 'IND', era: 'modern', position: 'PG', jerseyNumber: 0, ability: 'pace_and_space' },
  { slug: 'domantas-sabonis', teamAbbr: 'SAC', era: 'modern', position: 'C', jerseyNumber: 10, ability: 'handoff_hub' },
  { slug: 'bam-adebayo', teamAbbr: 'MIA', era: 'modern', position: 'C', jerseyNumber: 13, ability: 'switch_everything' },
  { slug: 'jrue-holiday', teamAbbr: 'POR', era: 'modern', position: 'PG', jerseyNumber: 4, ability: 'point_of_attack' },
  { slug: 'rudy-gobert', teamAbbr: 'MIN', era: 'modern', position: 'C', jerseyNumber: 27, ability: 'the_stifle_tower' },
  { slug: 'demar-derozan', teamAbbr: 'SAC', era: 'modern', position: 'SF', jerseyNumber: 10, ability: 'midrange_assassin' },
  { slug: 'pascal-siakam', teamAbbr: 'IND', era: 'modern', position: 'PF', jerseyNumber: 43, ability: 'spicy_p' },
  { slug: 'brandon-ingram', teamAbbr: 'TOR', era: 'modern', position: 'SF', jerseyNumber: 14, ability: 'silky_smooth' },
  { slug: 'karl-anthony-towns', teamAbbr: 'NYK', era: 'modern', position: 'C', jerseyNumber: 32, ability: 'stretch_five' },
  { slug: 'jamal-murray', teamAbbr: 'DEN', era: 'modern', position: 'PG', jerseyNumber: 27, ability: 'blue_arrow' },
  { slug: 'kristaps-porzingis', teamAbbr: 'GSW', era: 'modern', position: 'C', jerseyNumber: 6, ability: 'the_unicorn' },
  { slug: 'zach-lavine', teamAbbr: 'SAC', era: 'modern', position: 'SG', jerseyNumber: 8, ability: 'hangtime_lavine' },
  { slug: 'evan-mobley', teamAbbr: 'CLE', era: 'modern', position: 'PF', jerseyNumber: 4, ability: 'help_side_eraser' },
  { slug: 'paolo-banchero', teamAbbr: 'ORL', era: 'modern', position: 'PF', jerseyNumber: 5, ability: 'downhill_freight' },
  { slug: 'tyrese-maxey', teamAbbr: 'PHI', era: 'modern', position: 'PG', jerseyNumber: 0, ability: 'turbo' },
  { slug: 'manu-ginobili', teamAbbr: 'SAS', era: 'historical', position: 'SG', jerseyNumber: 20, ability: 'euro_step' },
  { slug: 'tony-parker', teamAbbr: 'SAS', era: 'historical', position: 'PG', jerseyNumber: 9, ability: 'teardrop' },
  { slug: 'pau-gasol', teamAbbr: 'MEM', era: 'historical', position: 'C', jerseyNumber: 16, ability: 'high_low_maestro' },
  { slug: 'dwight-howard', teamAbbr: 'ORL', era: 'historical', position: 'C', jerseyNumber: 12, ability: 'superman_dwight' },
  { slug: 'yao-ming', teamAbbr: 'HOU', era: 'historical', position: 'C', jerseyNumber: 11, ability: 'great_wall' },
  { slug: 'ben-wallace', teamAbbr: 'DET', era: 'historical', position: 'C', jerseyNumber: 3, ability: 'big_ben' },
  { slug: 'chauncey-billups', teamAbbr: 'DET', era: 'historical', position: 'PG', jerseyNumber: 1, ability: 'mr_big_shot' },
  { slug: 'bernard-king', teamAbbr: 'NYK', era: 'historical', position: 'SF', jerseyNumber: 30, ability: 'bucket_getter' },
  { slug: 'jalen-brunson', teamAbbr: 'NYK', era: 'modern', position: 'PG', jerseyNumber: 11, ability: 'crafty_captain' },
  { slug: 'mikal-bridges', teamAbbr: 'NYK', era: 'modern', position: 'SG', jerseyNumber: 25, ability: 'iron_man_wing' },
  { slug: 'chet-holmgren', teamAbbr: 'OKC', era: 'modern', position: 'PF', jerseyNumber: 7, ability: 'rim_spider' },
  { slug: 'deaaron-fox', teamAbbr: 'SAS', era: 'modern', position: 'PG', jerseyNumber: 4, ability: 'swipa' },
];

/**
 * The legend<->superstar split. ROSTER stays the single curated source of each
 * real player's identity + signature ability; the slugs below are RELOCATED out
 * of the S+ legend tier into the keepable S "Superstar" tier. They keep their
 * authored ability but are re-anchored to the S band (so an S superstar is a
 * notch below an on-loan legend), are not `legendary`, and are kept on a clear
 * like any pool player. Edit this one set to move a name either way.
 *
 * Applied by every mode: --mode=legends skips these (they never re-enter S+),
 * --mode=pool re-bakes them as S superstars from the API, and --mode=demote
 * relocates them offline from the already-committed JSON (no API). Constraint:
 * never demote a team's last legend (bosses field a franchise legend); the
 * demote mode asserts this.
 */
const DEMOTE_TO_S: ReadonlySet<string> = new Set([
  'russell-westbrook', 'kyrie-irving', 'paul-george', 'klay-thompson', 'draymond-green',
  'devin-booker', 'damian-lillard', 'jimmy-butler', 'anthony-edwards', 'victor-wembanyama',
  'donovan-mitchell', 'jaylen-brown', 'trae-young', 'tyrese-haliburton', 'domantas-sabonis',
  'bam-adebayo', 'jrue-holiday', 'rudy-gobert', 'demar-derozan', 'pascal-siakam',
  'brandon-ingram', 'karl-anthony-towns', 'jamal-murray', 'kristaps-porzingis', 'zach-lavine',
  'evan-mobley', 'paolo-banchero', 'tyrese-maxey', 'jalen-brunson', 'mikal-bridges',
  'chet-holmgren', 'deaaron-fox',
]);

/**
 * Signature abilities for the three homegrown S players already in the pool (not
 * curated legends, so not in ROSTER). The demoted stars bring their own ability;
 * these give the originals one too, so the whole S tier reads as "a star with a
 * signature." Ids are defined in src/game/abilities.ts. Stamped by both
 * --mode=pool and --mode=demote.
 */
const S_SIGNATURES: Record<string, string> = {
  'cade-cunningham': 'smooth_operator',
  'jalen-johnson': 'transition_hammer',
  'scottie-barnes': 'swiss_army',
};

/**
 * Re-anchor a stat line into the S "Superstar" band, preserving its shape, then
 * clamp every rating to the normal cap. The anchor lifts the eight skills to the
 * S window; the clamp brings a demoted legend's elite condition ratings (e.g. 24
 * stamina) down to the pool's normal ceiling, so an S superstar reads like a
 * clean pool player rather than a half-legend. Marquee names sit high in the
 * band (quality 0.5..1.0 by their 2K overall).
 */
function toSuperstarStats(stats: PlayerStats, position: Position, overall: number): PlayerStats {
  const quality = 0.5 + 0.5 * clamp((overall - 80) / 19, 0, 1);
  const anchored = anchorStatsToClass(stats, 'S', position, classTargetOvr('S', quality));
  const out = {} as PlayerStats;
  for (const key of Object.keys(anchored) as (keyof PlayerStats)[]) {
    out[key] = clamp(anchored[key], STAT_MIN, STAT_NORMAL_MAX);
  }
  return out;
}

const API_BASE = process.env.NBA2K_API_BASE ?? 'https://api.nba2kapi.com';
const API_KEY = process.env.NBA2K_API_KEY;
const POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'data');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Map the API's full team name ("Denver Nuggets") to our 3-letter abbreviation.
const TEAM_BY_FULLNAME = new Map<string, string>(
  (teams as { name: string; city: string; abbreviation: string }[]).map((t) => [
    `${t.city} ${t.name}`,
    t.abbreviation,
  ])
);

/** Lowercase hyphen slug ("Los Angeles Lakers" -> "los-angeles-lakers"). */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Map our 3-letter abbreviation to the team's slug fragment, used to disambiguate
// an all-time card whose slug encodes the team (michael-jordan-all-time-chicago-bulls).
const ABBR_TO_TEAMSLUG = new Map<string, string>(
  (teams as { name: string; city: string; abbreviation: string }[]).map((t) => [
    t.abbreviation,
    slugify(`${t.city} ${t.name}`),
  ])
);

/** Deterministic jersey number (0-98) from a slug, for pool players (the API list
 * endpoint does not return one). */
function jerseyFromSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 99;
}

/** Bucket a 2K overall (0-99) into an intrinsic class. Reals span C-S; D is the
 * procedural floor and S+ is the hand-curated legend tier, handled elsewhere. */
function classFor2KOverall(overall: number): PlayerClass {
  if (overall >= 89) return 'S';
  if (overall >= 82) return 'A';
  if (overall >= 75) return 'B';
  return 'C';
}

type RealClass = 'C' | 'B' | 'A' | 'S';
type ClassRange = Record<RealClass, [number, number]>;

/**
 * The 2K-overall bucket [lo, hi) each real class spans, aligned with the
 * classFor2KOverall thresholds (B 75-81, A 82-88, S 89+). The OPEN ends, C's floor
 * and S's ceiling, are filled from the dataset's own min/max so the weakest and
 * strongest reals land at the bottom and top of their class window no matter who is
 * in the pool. This is what spreads same-class overalls instead of flattening them.
 */
function classRangesFor(overalls: readonly number[]): ClassRange {
  const min = overalls.length ? Math.min(...overalls) : 67;
  const max = overalls.length ? Math.max(...overalls) : 95;
  return {
    C: [Math.min(min, 74), 75],
    B: [75, 82],
    A: [82, 89],
    S: [89, Math.max(max, 90) + 1],
  };
}

/** Where a 2K overall sits within its class bucket, as 0..1 (weakest..strongest in
 * class). Feeds classTargetOvr so true quality drives within-class OVR variance. */
function qualityWithinClass(overall: number, cls: PlayerClass, ranges: ClassRange): number {
  const range = ranges[cls as RealClass];
  if (!range) return 0.5;
  const [lo, hi] = range;
  if (hi <= lo) return 0.5;
  return Math.max(0, Math.min(1, (overall - lo) / (hi - lo)));
}

const POOL_CLASS_RANK: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

/** Stable in-place order for nba-pool.json: team, then class (strong first), then
 * name, so the file diffs cleanly across bakes. Shared by --mode=pool and
 * --mode=demote (both rewrite the pool file). */
function sortPoolPlayers<T extends { teamAbbr: string; originalClass: string; name: string }>(
  players: T[]
): T[] {
  return players.sort(
    (a, b) =>
      a.teamAbbr.localeCompare(b.teamAbbr) ||
      (POOL_CLASS_RANK[a.originalClass] ?? 9) - (POOL_CLASS_RANK[b.originalClass] ?? 9) ||
      a.name.localeCompare(b.name)
  );
}

function firstKnownPosition(positions: unknown): Position | null {
  if (!Array.isArray(positions)) return null;
  for (const p of positions) {
    if (typeof p === 'string' && (POSITIONS as readonly string[]).includes(p)) {
      return p as Position;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legend mode (all-time + current lists)
// ---------------------------------------------------------------------------

interface LegendMeta {
  legendary?: boolean;
  ability?: string;
  stats?: Record<string, number>;
}

/**
 * Find the API card for a curated ROSTER entry. Modern players match their exact
 * current slug; historical greats live under `teamType=allt` with a team-encoded
 * slug ("michael-jordan-all-time-chicago-bulls"), so match the all-time variant,
 * preferring the one whose slug carries the entry's team.
 */
function matchCard(
  entry: RosterEntry,
  bySlug: Map<string, ApiListPlayer>,
  allt: ApiListPlayer[]
): ApiListPlayer | undefined {
  const exact = bySlug.get(entry.slug);
  if (exact) return exact;
  const variants = allt.filter((p) => p.slug?.startsWith(`${entry.slug}-all-time`));
  if (variants.length === 0) return undefined;
  const teamSlug = ABBR_TO_TEAMSLUG.get(entry.teamAbbr);
  const teamMatch = teamSlug && variants.find((p) => p.slug?.includes(teamSlug));
  return (
    teamMatch ||
    [...variants].sort((a, b) => Number(b.overall ?? 0) - Number(a.overall ?? 0))[0]
  );
}

async function bakeLegends(): Promise<void> {
  // Carry over the hand-maintained `legendary` flag, signature `ability`, and the
  // curated clutch flavor (the API has no clutch attribute) from the existing baked
  // file, keyed by slug, so a re-bake preserves them.
  const meta = new Map<string, LegendMeta>(
    (legendsData as ({ slug: string } & LegendMeta)[]).map((l) => [
      l.slug,
      { legendary: l.legendary, ability: l.ability, stats: l.stats },
    ])
  );

  const [curr, allt] = [await fetchAll('curr'), await fetchAll('allt')];
  const bySlug = new Map<string, ApiListPlayer>();
  for (const p of curr) if (p.slug) bySlug.set(p.slug, p); // modern players: exact slug

  const players = [];
  for (const entry of ROSTER) {
    if (DEMOTE_TO_S.has(entry.slug)) continue; // relocated to the S pool, not a legend
    const m = meta.get(entry.slug);
    const card = matchCard(entry, bySlug, allt);
    let stats;
    let overall: number;
    if (card?.attributes) {
      // Inject the real overall so missing attributes (e.g. clutch) fall back to the
      // player's level, not a flat 75. Bake into the 6-24 elite band.
      overall = Number(card.overall ?? 0);
      stats = mapRatingsToStats({ ...card.attributes, overall }, { elite: true });
      // The API exposes no "clutch": keep the curated, hand-tuned clutch flavor for
      // the original legends (already on the elite 6-24 scale). New legends with no
      // curated line fall back to the overall-derived clutch from the mapper.
      if (typeof m?.stats?.clutch === 'number') stats.clutch = m.stats.clutch;
      console.log(`ok   ${entry.slug} -> ${card.name} (${overall}) [${card.slug}]`);
    } else if (m?.stats) {
      // Not in the API: keep the existing curated line (already on the elite scale).
      overall = Number((legendsData as ({ slug: string; overall?: number })[]).find((l) => l.slug === entry.slug)?.overall ?? 0);
      stats = { ...m.stats };
      console.log(`keep ${entry.slug} (not in API; curated line)`);
    } else {
      console.warn(`skip ${entry.slug}: no API card and no curated fallback`);
      continue;
    }
    const finalStats = backfillPlayStyleStats(stats as PlayerStats, entry.position);
    players.push({
      name: card?.name ?? entry.slug,
      slug: entry.slug,
      teamAbbr: entry.teamAbbr,
      era: entry.era,
      position: entry.position,
      jerseyNumber: entry.jerseyNumber,
      overall,
      legendary: m?.legendary ?? true,
      ability: entry.ability,
      // Guarantee the four play-style keys even for a curated-fallback legend not
      // in the API (e.g. Reggie Miller): backfill fills only missing keys.
      stats: finalStats,
      // Tendency from the rich API data; a curated-fallback legend (no API card)
      // has none and the runtime derives one from the stats instead.
      tendency: card?.attributes
        ? deriveTendency(card.attributes, badgeNames(card), finalStats, entry.position)
        : undefined,
    });
  }
  const out = join(outDir, 'nba-legends.json');
  writeFileSync(out, JSON.stringify(players, null, 2) + '\n');
  console.log(`\nWrote ${players.length} legends to ${out}`);
}

// ---------------------------------------------------------------------------
// Pool mode (paginated list)
// ---------------------------------------------------------------------------

interface ApiListPlayer {
  name?: string;
  slug?: string;
  team?: string;
  teamType?: string;
  positions?: unknown;
  overall?: number;
  attributes?: RawRatings;
  badges?: { list?: { name?: string }[] };
}

/** Badge display names for a card (the tendency deriver reads these for the shot
 * diet, e.g. a Deadeye boosts the three lane). */
function badgeNames(card: { badges?: { list?: { name?: string }[] } } | undefined): string[] {
  return (card?.badges?.list ?? []).map((b) => b.name).filter((n): n is string => typeof n === 'string');
}

async function fetchPage(
  cursor: string | null,
  teamType?: string
): Promise<{
  players: ApiListPlayer[];
  nextCursor: string | null;
}> {
  const url = new URL(`${API_BASE}/api/players`);
  url.searchParams.set('limit', '100');
  if (teamType) url.searchParams.set('teamType', teamType);
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY as string } });
  if (!res.ok) throw new Error(`list: HTTP ${res.status} ${res.statusText}`);
  const body = (await res.json()) as {
    data?: ApiListPlayer[];
    meta?: { pagination?: { hasMore?: boolean; nextCursor?: string } };
  };
  const players = body.data ?? [];
  const pag = body.meta?.pagination;
  return { players, nextCursor: pag?.hasMore ? (pag.nextCursor ?? null) : null };
}

/** Page through every player of a teamType ("curr" current, "allt" all-time). */
async function fetchAll(teamType: string): Promise<ApiListPlayer[]> {
  const all: ApiListPlayer[] = [];
  let cursor: string | null = null;
  let page = 0;
  do {
    const { players, nextCursor } = await fetchPage(cursor, teamType);
    all.push(...players);
    cursor = nextCursor;
    page += 1;
    if (cursor) await sleep(300);
  } while (cursor && page < 12);
  console.log(`fetched ${all.length} ${teamType} players`);
  return all;
}

async function bakePool(): Promise<void> {
  const raw: ApiListPlayer[] = [];
  let cursor: string | null = null;
  let page = 0;
  do {
    const { players, nextCursor } = await fetchPage(cursor);
    raw.push(...players);
    cursor = nextCursor;
    page += 1;
    console.log(`page ${page}: +${players.length} (total ${raw.length})`);
    if (cursor) await sleep(300); // be polite between pages
  } while (cursor && page < 12);

  // Players already in the curated legend pool are the S+ tier; never duplicate
  // them into the C-S class pool.
  const legendSlugs = new Set((legendsData as { slug: string }[]).map((l) => l.slug));

  // The list endpoint can return a player under more than one team (recent-trade
  // ambiguity); keep one entry per slug, preferring the highest overall.
  const bySlug = new Map<string, ApiListPlayer>();
  for (const p of raw) {
    if (p.teamType && p.teamType !== 'curr') continue; // current rosters only
    // Skip legends (S+ tier), but NOT the superstars relocated out of it: those
    // re-bake here as keepable S players.
    if (!p.slug || (legendSlugs.has(p.slug) && !DEMOTE_TO_S.has(p.slug))) continue;
    const prev = bySlug.get(p.slug);
    if (!prev || Number(p.overall ?? 0) > Number(prev.overall ?? 0)) bySlug.set(p.slug, p);
  }

  // The relocated S superstars, keyed for the bake below: they carry their curated
  // ROSTER identity (position/jersey/era/ability) but bake from live API stats.
  const superstarMeta = new Map(
    ROSTER.filter((e) => DEMOTE_TO_S.has(e.slug)).map((e) => [e.slug, e] as const)
  );

  // First pass: keep the valid players, so the class ranges below reflect exactly
  // who gets baked (the open-ended C floor / S ceiling self-calibrate to the pool).
  type Valid = {
    name: string;
    slug: string;
    attributes: RawRatings;
    badges: string[];
    position: Position;
    teamAbbr: string;
    overall: number;
  };
  const valid: Valid[] = [];
  let skipped = 0;
  for (const p of bySlug.values()) {
    const position = firstKnownPosition(p.positions);
    const teamAbbr = p.team ? TEAM_BY_FULLNAME.get(p.team) : undefined;
    const overall = Number(p.overall ?? 0);
    if (!position || !teamAbbr || !p.attributes || !p.slug || overall <= 0) {
      skipped += 1;
      continue;
    }
    valid.push({ name: String(p.name ?? p.slug), slug: p.slug, attributes: p.attributes, badges: badgeNames(p), position, teamAbbr, overall });
  }

  // Second pass: anchor each line to a quality-varied point in its class band, so
  // same-class reals spread across the window (a 2K-89 S reads lower than a 2K-95 S).
  const ranges = classRangesFor(valid.map((v) => v.overall));
  const baked = valid.map((v) => {
    const sup = superstarMeta.get(v.slug);
    const position = sup ? sup.position : v.position;
    const originalClass: PlayerClass = sup ? 'S' : classFor2KOverall(v.overall);
    const shape = mapRatingsToStats({ ...v.attributes, overall: v.overall });
    const stats = sup
      ? toSuperstarStats(shape, position, v.overall)
      : anchorStatsToClass(
          shape,
          originalClass,
          position,
          classTargetOvr(originalClass, qualityWithinClass(v.overall, originalClass, ranges))
        );
    return {
      name: v.name,
      slug: v.slug,
      teamAbbr: v.teamAbbr,
      era: (sup ? sup.era : 'modern') as Era,
      position,
      jerseyNumber: sup ? sup.jerseyNumber : jerseyFromSlug(v.slug),
      overall: v.overall,
      originalClass,
      // The relocated superstars carry their curated signature; the three homegrown
      // S players get one from S_SIGNATURES; everyone else has none (undefined keys
      // are dropped on write).
      ability: sup?.ability ?? S_SIGNATURES[v.slug],
      stats,
      // Compact shot diet / role profile from the rich 2K attributes + badges.
      tendency: deriveTendency(v.attributes, v.badges, stats, position),
    };
  });

  sortPoolPlayers(baked);

  const out = join(outDir, 'nba-pool.json');
  writeFileSync(out, JSON.stringify(baked, null, 2) + '\n');

  const byClass: Record<string, number> = {};
  for (const p of baked) byClass[p.originalClass] = (byClass[p.originalClass] ?? 0) + 1;
  // Sanity: confirm the anchored in-game OVR reproduces the bucketed class.
  let mismatch = 0;
  for (const p of baked) if (classForOvr(ovr(p.stats, p.position)) !== p.originalClass) mismatch += 1;
  console.log(`\nWrote ${baked.length} pool players to ${out} (skipped ${skipped})`);
  console.log('class distribution:', JSON.stringify(byClass));
  console.log(`class/OVR mismatches: ${mismatch}`);
}

// ---------------------------------------------------------------------------
// Reanchor mode (offline re-spread of the committed pool)
// ---------------------------------------------------------------------------

/** A baked pool entry as it lives in src/data/nba-pool.json. */
interface BakedPoolPlayer {
  name: string;
  slug: string;
  teamAbbr: string;
  era: Era;
  position: Position;
  jerseyNumber: number;
  overall: number;
  originalClass: PlayerClass;
  /** Signature ability id, present only on S "Superstar" players. */
  ability?: string;
  stats: PlayerStats;
  /** Shot diet / role profile (preserved untouched by re-anchor/demote). */
  tendency?: BakedTendency;
}

/**
 * Re-spread the ALREADY-baked pool offline (no API call). Anchoring only shifts a
 * line as a whole, so the committed stats still carry each player's shape; this
 * re-anchors that shape to a quality-varied point in its class band using the stored
 * 2K `overall`. Same class/team/identity, only the eight skill stats move, so the
 * fix lands without a network re-bake. Deterministic and idempotent.
 */
function bakeReanchor(): void {
  const file = join(outDir, 'nba-pool.json');
  const pool = JSON.parse(readFileSync(file, 'utf8')) as BakedPoolPlayer[];
  const ranges = classRangesFor(pool.map((p) => p.overall));
  const reanchored = pool.map((p) => {
    const target = classTargetOvr(p.originalClass, qualityWithinClass(p.overall, p.originalClass, ranges));
    return { ...p, stats: anchorStatsToClass(p.stats, p.originalClass, p.position, target) };
  });
  writeFileSync(file, JSON.stringify(reanchored, null, 2) + '\n');

  const byClass: Record<string, number> = {};
  const distinct: Record<string, Set<number>> = {};
  let mismatch = 0;
  for (const p of reanchored) {
    byClass[p.originalClass] = (byClass[p.originalClass] ?? 0) + 1;
    (distinct[p.originalClass] ??= new Set()).add(ovr(p.stats, p.position));
    if (classForOvr(ovr(p.stats, p.position)) !== p.originalClass) mismatch += 1;
  }
  const spread = Object.fromEntries(
    Object.entries(distinct).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])
  );
  console.log(`\nRe-anchored ${reanchored.length} pool players in ${file}`);
  console.log('class distribution:', JSON.stringify(byClass));
  console.log('distinct OVRs per class:', JSON.stringify(spread));
  console.log(`class/OVR mismatches: ${mismatch}`);
}

// ---------------------------------------------------------------------------
// Demote mode (offline relocation of borderline legends into the S pool)
// ---------------------------------------------------------------------------

/** A baked legend entry as it lives in src/data/nba-legends.json. */
interface BakedLegend {
  name: string;
  slug: string;
  teamAbbr: string;
  era: Era;
  position: Position;
  jerseyNumber: number;
  overall: number;
  legendary?: boolean;
  ability?: string;
  stats: PlayerStats;
  /** Shot diet / role profile (preserved untouched by re-anchor/demote). */
  tendency?: BakedTendency;
}

/**
 * Relocate the DEMOTE_TO_S legends into the keepable S "Superstar" tier, OFFLINE
 * (no API key). Reads the committed nba-legends.json / nba-pool.json, re-anchors
 * each demoted legend's line to the S band (keeping its signature ability, dropping
 * `legendary`), stamps the three homegrown S players with their S_SIGNATURES, and
 * rewrites both files. The legend file shrinks by deletions only; the pool file
 * re-sorts with the new S entries folded in. Deterministic and idempotent (running
 * it twice is a no-op: the demoted slugs are already gone from the legend file).
 */
function bakeDemote(): void {
  const legendsFile = join(outDir, 'nba-legends.json');
  const poolFile = join(outDir, 'nba-pool.json');
  const legends = JSON.parse(readFileSync(legendsFile, 'utf8')) as BakedLegend[];
  const pool = JSON.parse(readFileSync(poolFile, 'utf8')) as BakedPoolPlayer[];

  const kept = legends.filter((l) => !DEMOTE_TO_S.has(l.slug));
  const demoted = legends.filter((l) => DEMOTE_TO_S.has(l.slug));

  // Every flagged slug must exist somewhere: still a legend (to relocate now) or
  // already in the pool (a prior run). A slug in neither is a typo. This keeps the
  // mode idempotent: a second run finds the demoted players already in the pool,
  // relocates nothing, and rewrites the same files.
  const demotedSlugs = new Set(demoted.map((l) => l.slug));
  const poolSlugs = new Set(pool.map((p) => p.slug));
  const missing = [...DEMOTE_TO_S].filter((s) => !demotedSlugs.has(s) && !poolSlugs.has(s));
  if (missing.length) {
    throw new Error(`demote: not found in nba-legends.json or nba-pool.json: ${missing.join(', ')}`);
  }
  // Bosses field a franchise legend, so no team may lose its last one.
  const teamsAfter = new Set(kept.map((l) => l.teamAbbr));
  const uncovered = [...new Set(legends.map((l) => l.teamAbbr))].filter((t) => !teamsAfter.has(t));
  if (uncovered.length) {
    throw new Error(`demote: these teams would have zero legends: ${uncovered.join(', ')}`);
  }

  // Demoted legends -> keepable S pool players (re-anchored, ability preserved).
  const newS: BakedPoolPlayer[] = demoted.map((l) => ({
    name: l.name,
    slug: l.slug,
    teamAbbr: l.teamAbbr,
    era: l.era,
    position: l.position,
    jerseyNumber: l.jerseyNumber,
    overall: l.overall,
    originalClass: 'S',
    ability: l.ability,
    stats: toSuperstarStats(l.stats, l.position, l.overall),
  }));

  // Stamp signatures onto the three homegrown S players already in the pool,
  // keeping `ability` before `stats` in the key order for a clean file.
  const updatedPool: BakedPoolPlayer[] = pool.map((p) => {
    const ability = S_SIGNATURES[p.slug];
    if (!ability) return p;
    const { stats, ...rest } = p;
    return { ...rest, ability, stats };
  });

  const mergedPool = sortPoolPlayers([...updatedPool, ...newS]);

  writeFileSync(legendsFile, JSON.stringify(kept, null, 2) + '\n');
  writeFileSync(poolFile, JSON.stringify(mergedPool, null, 2) + '\n');

  // Sanity: every pool OVR reproduces its class; every demoted star kept its ability.
  const byClass: Record<string, number> = {};
  let mismatch = 0;
  for (const p of mergedPool) {
    byClass[p.originalClass] = (byClass[p.originalClass] ?? 0) + 1;
    if (classForOvr(ovr(p.stats, p.position)) !== p.originalClass) mismatch += 1;
  }
  const missingAbility = newS.filter((p) => !p.ability).map((p) => p.slug);
  console.log(`\nDemoted ${demoted.length} legends to S. Legends: ${legends.length} -> ${kept.length}.`);
  console.log('pool class distribution:', JSON.stringify(byClass));
  console.log(`class/OVR mismatches: ${mismatch}`);
  if (missingAbility.length) console.warn(`demoted players missing an ability: ${missingAbility.join(', ')}`);
}

/**
 * Enrich the ALREADY-baked pool and legends with a shot diet / role `tendency`
 * derived from the rich 2K attributes + badges, WITHOUT touching their stats. The
 * full --mode=pool / --mode=legends re-bakes would also re-derive every stat line
 * from live data (drift); this mode only ADDS the tendency block, keyed by slug,
 * so the diff is purely additive and the carefully-tuned ratings/classes are kept.
 * ~10-14 requests (curr + allt pages).
 */
async function bakeTendency(): Promise<void> {
  const [curr, allt] = [await fetchAll('curr'), await fetchAll('allt')];
  const bySlug = new Map<string, ApiListPlayer>();
  for (const p of curr) if (p.slug) bySlug.set(p.slug, p);

  const poolFile = join(outDir, 'nba-pool.json');
  const pool = JSON.parse(readFileSync(poolFile, 'utf8')) as BakedPoolPlayer[];
  let poolHit = 0;
  let poolMiss = 0;
  const newPool = pool.map((p) => {
    const card = bySlug.get(p.slug);
    if (!card?.attributes) {
      poolMiss += 1;
      return p;
    }
    poolHit += 1;
    return { ...p, tendency: deriveTendency(card.attributes, badgeNames(card), p.stats, p.position) };
  });
  writeFileSync(poolFile, JSON.stringify(newPool, null, 2) + '\n');

  const legendsFile = join(outDir, 'nba-legends.json');
  const legends = JSON.parse(readFileSync(legendsFile, 'utf8')) as BakedLegend[];
  let legHit = 0;
  let legMiss = 0;
  const newLegends = legends.map((l) => {
    const entry = {
      slug: l.slug, teamAbbr: l.teamAbbr, era: l.era, position: l.position,
      jerseyNumber: l.jerseyNumber, ability: l.ability ?? '',
    } as RosterEntry;
    const card = matchCard(entry, bySlug, allt);
    if (!card?.attributes) {
      legMiss += 1;
      return l;
    }
    legHit += 1;
    return { ...l, tendency: deriveTendency(card.attributes, badgeNames(card), l.stats, l.position) };
  });
  writeFileSync(legendsFile, JSON.stringify(newLegends, null, 2) + '\n');

  console.log(`\ntendency baked: pool ${poolHit} hit / ${poolMiss} miss; legends ${legHit} hit / ${legMiss} miss`);
}

async function main(): Promise<void> {
  const mode = (process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1] ?? 'legends') as
    | 'legends'
    | 'pool'
    | 'reanchor'
    | 'demote'
    | 'tendency';
  if (mode === 'reanchor') {
    bakeReanchor(); // offline: re-spreads the committed pool, no API key needed
    return;
  }
  if (mode === 'demote') {
    bakeDemote(); // offline: relocates borderline legends into the S pool, no API key
    return;
  }
  if (!API_KEY) {
    console.error('NBA2K_API_KEY is not set. Run:\n  NBA2K_API_KEY=your_key npx tsx scripts/fetch-nba.ts --mode=pool');
    process.exit(1);
  }
  if (mode === 'pool') await bakePool();
  else if (mode === 'tendency') await bakeTendency();
  else await bakeLegends();
}

main();
