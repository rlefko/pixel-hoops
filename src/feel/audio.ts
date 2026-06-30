import { Asset } from 'expo-asset';
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
} from 'expo-audio';
import type { Rarity } from '@/game/rarity';
import { SFX_SOURCES, SFX_POOL, type SfxName } from '@/audio/sfxManifest';
import { IS_WEB, bestEffort } from './bestEffort';
import { duck as duckMusic } from './music';

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
 */

let enabled = true;
let volume = 0.8;
let ready = false;
let initStarted = false;

interface Pool {
  players: AudioPlayer[];
  next: number;
}
const pools = new Map<SfxName, Pool>();

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
 */
export function setAudioActive(active: boolean): void {
  if (IS_WEB || !initStarted) return;
  bestEffort(() => {
    void setIsAudioActiveAsync(active);
  });
}

/**
 * Build the audio session and preload every SFX once. Called at app boot. Safe to call
 * more than once. The audio mode MUST be set before any player is created so iOS does
 * not deactivate the user's music and Android does not grab exclusive focus.
 */
export async function initSfx(): Promise<void> {
  if (initStarted || IS_WEB) return;
  initStarted = true;

  try {
    await setAudioModeAsync({
      playsInSilentMode: false, // respect the iOS ringer switch (settings copy says so)
      interruptionMode: 'mixWithOthers', // never pause the user's Spotify; fixes Android self-pause
      shouldPlayInBackground: false,
      allowsRecording: false,
    });
  } catch {
    /* sound is best-effort */
  }

  const names = Object.keys(SFX_SOURCES) as SfxName[];
  await Promise.all(
    names.map(async (name) => {
      try {
        // Resolve to a local file URI first: a bare require() into createAudioPlayer can
        // fail silently in release builds (expo/expo#40448). This also warms first play.
        const [asset] = await Asset.loadAsync(SFX_SOURCES[name]);
        const uri = asset?.localUri ?? asset?.uri;
        if (!uri) return;
        const size = SFX_POOL[name] ?? 1;
        const players = Array.from({ length: size }, () => {
          const player = createAudioPlayer({ uri });
          player.shouldCorrectPitch = false; // let playbackRate detune the pitch (chiptune jitter)
          return player;
        });
        pools.set(name, { players, next: 0 });
      } catch {
        /* one failed sound never blocks the rest */
      }
    })
  );

  ready = true;
}

/** Play one SFX from the start. `rate` (default 1) shifts pitch for variation. */
function trigger(name: SfxName, rate: number = 1): void {
  if (!enabled || !ready || IS_WEB) return;
  const pool = pools.get(name);
  if (!pool) return;
  bestEffort(() => {
    const player = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    player.volume = volume; // master volume, read live so the slider applies instantly
    // Use the method, not the `playbackRate` property: the property is getter-only in the
    // native module (a no-op assignment on iOS), so the pitch variation needs setPlaybackRate.
    player.setPlaybackRate(rate);
    player.seekTo(0);
    player.play();
  });
}

export type TapVariant = 'primary' | 'secondary';
export type WhooshDirection = 'forward' | 'backward';

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
  // Run-flow beats.
  tipoff: () => trigger('tipoff'),
  buzzerBeater: () => {
    duckMusic(450);
    trigger('buzzerBeater');
  },
  win: () => {
    duckMusic(700);
    trigger('win');
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
  dupe: () => trigger('dupe'),
  // UI.
  tap: (variant: TapVariant = 'primary') =>
    trigger(variant === 'secondary' ? 'tapSecondary' : 'tapPrimary'),
  toggle: () => trigger('toggle'),
  whoosh: (direction: WhooshDirection = 'forward') =>
    trigger(direction === 'backward' ? 'whooshBack' : 'whoosh'),
  error: () => trigger('error'),
};
