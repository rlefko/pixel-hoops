import { setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';
import type { Rarity } from '@/game/rarity';
import { SFX_SOURCES, SFX_POOL, SFX_DURATION_MS, type SfxName } from '@/audio/sfxManifest';
import { ensureAudioMode, resolveAudioUri, createResolvedPlayer } from './audioPlayers';
import { IS_WEB, bestEffort } from './bestEffort';
import { duck as duckMusic } from './music';
import { RAPID_CUE_COOLDOWN_MS, RATE_JITTER_MIN } from './soundPolicy';

/**
 * Semantic sound-effects wrapper, modeled on ./haptics. Call sites use intent names
 * (sfx.dunk(), sfx.win(), sfx.tap('primary')) instead of touching expo-audio. Globally
 * disablable (driven by FeelSettings) and a no-op on web so the web build stays green.
 * Best-effort: every failure is swallowed, exactly like haptics.
 *
 * Sounds are short, procedurally-generated chiptune WAVs (see scripts/generate-sfx.ts).
 * Each sound owns a tiny round-robin pool of players so a make can overlap itself on a
 * hot streak without cutting off. Players live for the whole app session (created once
 * in initSfx), which mirrors the haptics module's always-on stance.
 *
 * The shot sequence is ordering-aware: on iOS, play() and setPlaybackRate() are sync
 * JSI Functions while seekTo() is an AsyncFunction on a separate native queue, so the
 * old unconditional seekTo(0)-then-play() raced (play could execute before the seek
 * landed) and expo-audio never auto-rewinds a finished player, leaving it parked at
 * end-of-file where a raced play() is silent. Instead, players are re-parked AT ZERO
 * the moment they finish (the didJustFinish listener below, which pauses first: on
 * Android ExoPlayer keeps playWhenReady at STATE_ENDED, so a bare seek would audibly
 * auto-replay), and the hot path is just setPlaybackRate + play. The rare busy reuse
 * (pool exhausted mid-shot) takes an explicitly ordered seek-then-play.
 */

let enabled = true;
let volume = 0.65;
let ready = false;
let initStarted = false;

interface Pool {
  players: AudioPlayer[];
  next: number;
  /** Baked WAV length (SFX_DURATION_MS), for the busy-reuse check. */
  durationMs: number;
  /** Per-player timestamp when its current shot ends (duration scaled by the shot's
   * rate). Infinity = state unknown (interrupted mid-shot); forces the ordered path. */
  expectedEndAt: number[];
}
const pools = new Map<SfxName, Pool>();

/** Finish-event slop: emit latency between the native end and the JS listener. */
const FINISH_EPSILON_MS = 15;
/** Extra margin on the busy-reuse window beyond the computed shot end. */
const BUSY_SLACK_MS = 30;

// Rapid cues get per-name cooldowns (RAPID_CUE_COOLDOWN_MS in ./soundPolicy) so fast
// navigation never machine-guns and count tallies stream musically, plus a small
// pitch jitter so repeats never sound identical (anti-fatigue).
const lastCueAt = new Map<SfxName, number>();
let jitterTick = 0;

// The master volume each player last received (same skip-unchanged-writes pattern as
// music.ts's lastVolume, keyed by player object here since pools share names): volume
// only changes via the settings slider, so after a pool player's first play the native
// volume write is skipped, trimming a call from every rapid tick's hot path.
const lastVolume = new WeakMap<AudioPlayer, number>();

/** Toggle all sound (wired to FeelSettings.soundEnabled). */
export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

/**
 * Master SFX volume 0..1 (wired to FeelSettings.sfxVolume). Stored only; each player
 * reads it at play time, so dragging the volume slider is O(1) and never loops every
 * pooled player.
 */
export function setSoundVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value));
}

/**
 * Activate or release the shared audio session (best-effort, no-op on web). Called on
 * app background/foreground so we relinquish the session when the player is away,
 * instead of holding the audio route warm. The pooled players stay resident (memory,
 * not battery), so re-activating on return is instant.
 *
 * Deactivating pauses every player natively, which can park one MID-shot with no
 * didJustFinish ever firing for it, so the rewind listener cannot re-zero it. Marking
 * every player's state unknown (expectedEndAt = Infinity) forces each one's next shot
 * through the ordered seek-then-play path exactly once: pure JS bookkeeping, zero
 * native calls at background time. (An OS interruption that pauses audio WITHOUT
 * backgrounding the app can still park a player unswept; that lone stale-tail shot
 * self-corrects because its natural finish re-zeros the player.)
 */
export function setAudioActive(active: boolean): void {
  if (IS_WEB || !initStarted) return;
  if (!active) {
    for (const pool of pools.values()) pool.expectedEndAt.fill(Infinity);
    logDevShotCounts(); // backgrounding = a natural session boundary for the tally
  }
  bestEffort(() => {
    void setIsAudioActiveAsync(active);
  });
}

/**
 * Build the audio session and preload every SFX once. Called at app boot. Safe to call
 * more than once. ensureAudioMode MUST complete before any player is created (see
 * ./audioPlayers for why), which is why the pools wait on it.
 */
export async function initSfx(): Promise<void> {
  if (initStarted || IS_WEB) return;
  initStarted = true;

  await ensureAudioMode();

  const names = Object.keys(SFX_SOURCES) as SfxName[];
  await Promise.all(
    names.map(async (name) => {
      try {
        const uri = await resolveAudioUri(SFX_SOURCES[name]);
        if (!uri) return;
        const size = SFX_POOL[name] ?? 1;
        const pool: Pool = {
          players: [],
          next: 0,
          durationMs: SFX_DURATION_MS[name],
          expectedEndAt: Array.from({ length: size }, () => 0),
        };
        pool.players = Array.from({ length: size }, (_, i) => {
          const player = createResolvedPlayer(uri);
          player.shouldCorrectPitch = false; // let playbackRate detune the pitch (chiptune jitter)
          // Re-park the player at 0 the moment a shot finishes naturally, so the hot
          // path can play() without a seek. The finish event rides NotificationCenter /
          // the ExoPlayer callback, NOT the (60s) status interval, so it always fires.
          // pause() first is load-bearing on Android: ExoPlayer keeps playWhenReady at
          // STATE_ENDED and a bare seek out of it auto-replays audibly; on iOS the
          // player is already paused and the pause is a no-op.
          player.addListener('playbackStatusUpdate', (status) => {
            if (!status.didJustFinish) return;
            if (Date.now() < pool.expectedEndAt[i] - FINISH_EPSILON_MS) {
              // A newer shot owns the player, so this finish must not re-park it.
              // But that newer shot may have been a ghost: if this event's JS
              // delivery was delayed past the busy window, the fast path played a
              // still-parked-at-EOF player (silent, emits no finish of its own).
              // Marking the state unknown routes the player's NEXT shot through the
              // ordered seek-then-play path, so a strand self-heals in one shot;
              // in the legitimate busy-reuse case the cost is one extra seek.
              pool.expectedEndAt[i] = Infinity;
              return;
            }
            bestEffort(() => {
              player.pause();
              void player.seekTo(0);
            });
          });
          return player;
        });
        pools.set(name, pool);
      } catch {
        /* one failed sound never blocks the rest */
      }
    })
  );

  ready = true;
}

// Dev-only shot accounting: a shot's sync native dispatch at or over this budget is
// worth a console warning (an AVAudioSession stall, a bridge pile-up), and the
// fast/busy/dropped split shows whether the pools are sized right in practice.
// The typeof guard keeps node/vitest imports safe, same as useRun's reducer wrapper.
const DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const SLOW_SHOT_MS = 4;
const devShotCounts = DEV
  ? {
      fast: new Map<SfxName, number>(),
      busy: new Map<SfxName, number>(),
      dropped: new Map<SfxName, number>(),
    }
  : null;
function countShot(kind: 'fast' | 'busy' | 'dropped', name: SfxName): void {
  if (!devShotCounts) return;
  const map = devShotCounts[kind];
  map.set(name, (map.get(name) ?? 0) + 1);
}
/** Dev-only: log the per-cue fast/busy/dropped tallies (one line, skipped when all
 * zero) and reset them. Fired on backgrounding so every dev session ends with the
 * pool-sizing evidence in the console: a busy-heavy cue wants a bigger pool, a
 * dropped-heavy one is machine-gunning into its cooldown. */
function logDevShotCounts(): void {
  if (!devShotCounts) return;
  const fmt = (map: Map<SfxName, number>): string =>
    [...map.entries()].map(([name, n]) => `${name}:${n}`).join(' ');
  const parts = (['fast', 'busy', 'dropped'] as const)
    .filter((kind) => devShotCounts[kind].size > 0)
    .map((kind) => `${kind} ${fmt(devShotCounts[kind])}`);
  if (parts.length === 0) return;
  console.log(`[sfx] shots: ${parts.join(' | ')}`);
  for (const kind of ['fast', 'busy', 'dropped'] as const) devShotCounts[kind].clear();
}

/** Play one SFX from the start. `rate` (default 1) shifts pitch for variation. */
function trigger(name: SfxName, rate: number = 1): void {
  if (!enabled || !ready || IS_WEB) return;
  const cooldown = RAPID_CUE_COOLDOWN_MS[name];
  if (cooldown !== undefined) {
    const now = Date.now();
    if (now - (lastCueAt.get(name) ?? 0) < cooldown) {
      countShot('dropped', name);
      return;
    }
    lastCueAt.set(name, now);
    rate *= RATE_JITTER_MIN + (jitterTick++ % 4) * 0.02; // subtle pitch variation per repeat
  }
  const pool = pools.get(name);
  if (!pool) return;
  bestEffort(() => {
    const i = pool.next;
    const player = pool.players[i];
    pool.next = (i + 1) % pool.players.length;
    // Master volume, read live so the slider applies on the very next shot; the write
    // is skipped when the player already carries it.
    if (lastVolume.get(player) !== volume) {
      player.volume = volume;
      lastVolume.set(player, volume);
    }
    const start = DEV ? performance.now() : 0;
    // Use the method, not the `playbackRate` property: the property is getter-only in the
    // native module (a no-op assignment on iOS), so the pitch variation needs setPlaybackRate.
    player.setPlaybackRate(rate);
    const now = Date.now();
    if (now < pool.expectedEndAt[i] + BUSY_SLACK_MS) {
      // Busy reuse (pool exhausted mid-shot, or state unknown after an interruption):
      // the ONLY correct sequence is to await the async seek before the sync play,
      // otherwise play() executes against the old position.
      countShot('busy', name);
      player
        .seekTo(0)
        .then(() => player.play())
        .catch(() => {
          /* best-effort, like every other sfx failure */
        });
    } else {
      // Resting player: parked at 0 by the finish listener, so play() alone is a
      // complete, race-free shot (one native call fewer than the old path).
      countShot('fast', name);
      player.play();
    }
    pool.expectedEndAt[i] = now + pool.durationMs / rate;
    if (DEV) {
      const ms = performance.now() - start;
      if (ms >= SLOW_SHOT_MS) console.warn(`[sfx] slow shot ${name}: ${ms.toFixed(1)}ms`);
    }
  });
}

export type TapVariant = 'primary' | 'secondary';
export type WhooshDirection = 'forward' | 'backward';

/**
 * The crowd answers the play: a swell starts this long after the event's own sting,
 * so it reads as the arena reacting rather than part of the cue. A perceptual
 * constant (reaction time), deliberately NOT scaled by sim speed — the precedent is
 * haptics.bigPlay's fixed 60/120ms burst offsets. Fire-and-forget is safe: trigger()
 * re-checks enabled/ready at fire time and every failure is swallowed.
 */
const CROWD_ANSWER_DELAY_MS = 90;
function crowd(name: SfxName): void {
  if (!enabled || !ready || IS_WEB) return;
  setTimeout(() => trigger(name), CROWD_ANSWER_DELAY_MS);
}

function rewardName(rarity: Rarity): SfxName {
  if (rarity === 'legendary') return 'rewardLegendary';
  if (rarity === 'epic') return 'rewardEpic';
  return 'rewardRare'; // rare + common share the base reward sting
}

export const sfx = {
  // In-game outcomes. `make`/`three` take a pitch rate for streak climb + anti-fatigue.
  // The big stings briefly duck the background music so they cut through (the duck is a
  // no-op when music is off/inactive, so it is always safe to call). Hold scales with
  // the sting length: a dunk dips briefly, a championship fanfare dips longer.
  make: (rate: number = 1) => trigger('make', rate),
  three: (rate: number = 1) => trigger('three', rate),
  dunk: () => {
    duckMusic();
    trigger('dunk');
  },
  andOne: () => trigger('andOne'),
  block: () => trigger('block'),
  steal: () => trigger('steal'),
  miss: () => trigger('miss'),
  // The home crowd answering the play (see crowd() above): a cheer on big plays,
  // the full roar on a home walk-off or the championship, a low murmur as crunch
  // time opens. No music duck — the swell is the bed answering the sting, not a
  // sting cutting through it (the co-firing dunk/buzzerBeater ducks stay
  // authoritative, so there is no double-duck fight).
  crowdCheer: () => crowd('crowdCheer'),
  crowdRoar: () => crowd('crowdRoar'),
  crowdMurmur: () => crowd('crowdMurmur'),
  // Run-flow beats.
  tipoff: () => trigger('tipoff'),
  buzzerBeater: () => {
    duckMusic(450);
    trigger('buzzerBeater');
  },
  win: () => {
    // Barely-there cue after every won game, with a small per-win pitch jitter so
    // back-to-back wins never sound identical. No music duck: at this size the cue
    // sits on top of the bed, and dipping the music 10-20 times a run pumps more
    // than the cue itself would.
    trigger('win', 0.99 + (jitterTick++ % 3) * 0.01);
  },
  loss: () => trigger('loss'),
  champion: () => {
    duckMusic(900);
    trigger('champion');
  },
  // Rewards (tiered by rarity), gacha, recruiting.
  reward: (rarity: Rarity) => {
    duckMusic();
    trigger(rewardName(rarity));
  },
  gachaWindup: () => trigger('gachaWindup'),
  recruit: () => trigger('recruit'),
  // `rate` lets a multi-copy bank step its clinks upward (the collection pip beat).
  dupe: (rate: number = 1) => trigger('dupe', rate),
  // Economy: count-up ticks (rate walks upward as a tally climbs) + coin settle.
  tick: (rate: number = 1) => trigger('tick', rate),
  coin: () => trigger('coin'),
  // UI.
  tap: (variant: TapVariant = 'primary') =>
    trigger(variant === 'secondary' ? 'tapSecondary' : 'tapPrimary'),
  toggle: () => trigger('toggle'),
  whoosh: (direction: WhooshDirection = 'forward') =>
    trigger(direction === 'backward' ? 'whooshBack' : 'whoosh'),
  error: () => trigger('error'),
};
