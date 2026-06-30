import { Asset } from 'expo-asset';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { MUSIC_SOURCES, type MusicName } from '@/audio/musicManifest';
import { IS_WEB, bestEffort } from './bestEffort';

/**
 * Looping chiptune background music: a calm menu/hub bed and a driving in-game bed,
 * crossfaded when the context changes. Mirrors ./audio (web no-op, best-effort, lazy
 * init, long-lived players) but plays continuously rather than one-shots.
 *
 * Screens DECLARE their desired context via playMusicContext('menu'|'game'); the module
 * decides whether anything changes (idempotent: re-declaring the current context is a
 * no-op, so navigating between hubs never restarts the bed). The in-game bed also ramps
 * tempo/pitch up toward Q4 (setMusicTempo) and the bed ducks briefly under big stings.
 *
 * Volume is a single source of truth: effective = masterVolume * crossfadeFactor[bed] *
 * duckFactor. Tweens animate the FACTORS (never the player volume directly), so the
 * crossfade, the duck, and the live slider never fight. One applier writes each player.
 *
 * It does NOT configure the audio session: initSfx owns the one shared setAudioModeAsync
 * (mixWithOthers, playsInSilentMode:false so music is silenced by the iOS mute switch,
 * shouldPlayInBackground:false). Background pause/resume is driven by setMusicActive.
 */

export type MusicContext = 'menu' | 'game';

const CONTEXT_TRACK: Record<MusicContext, MusicName> = {
  menu: 'menuLoop',
  game: 'gameLoop',
};

const FADE_MS = 800; // bed-to-bed crossfade
const TICK_MS = 33; // ~30 Hz tween; Android marshals each volume write to the main queue
const DUCK_LEVEL = 0.35; // dip to 35% of the ceiling under a big sting
const DUCK_FADE_MS = 120;
const DUCK_RESTORE_MS = 360;
const DUCK_HOLD_MS = 350;

let enabled = true;
let masterVolume = 0.5; // lower than SFX; read live
let ready = false;
let initStarted = false;
let active = true; // foreground gate
let current: MusicContext | null = null;
let gameRate = 1; // Q4 ramp state, applied to the game bed
let duckFactor = 1;

const beds = new Map<MusicContext, AudioPlayer>();
const cfFactor = new Map<MusicContext, number>(); // crossfade factor per bed, 0..1
const cancels = new Map<string, () => void>(); // active tween/timer cancels by key

/** The single writer: effective bed volume = master * crossfade * duck. */
function applyBedVolume(ctx: MusicContext): void {
  const player = beds.get(ctx);
  if (!player) return;
  const cf = cfFactor.get(ctx) ?? 0;
  bestEffort(() => {
    player.volume = masterVolume * cf * duckFactor;
  });
}

function applyAllBeds(): void {
  for (const ctx of beds.keys()) applyBedVolume(ctx);
}

/** Tween a value 0..1 over ms, cancelable by key (a new tween on a key cancels the old). */
function tween(key: string, from: number, to: number, ms: number, onStep: (v: number) => void): void {
  cancels.get(key)?.();
  const totalTicks = Math.max(1, Math.round(ms / TICK_MS));
  let tick = 0;
  const id = setInterval(() => {
    tick += 1;
    const t = Math.min(1, tick / totalTicks);
    onStep(from + (to - from) * t);
    if (t >= 1) {
      clearInterval(id);
      cancels.delete(key);
    }
  }, TICK_MS);
  cancels.set(key, () => {
    clearInterval(id);
    cancels.delete(key);
  });
}

function resetGameRate(): void {
  gameRate = 1;
  const player = beds.get('game');
  if (player) {
    bestEffort(() => {
      player.shouldCorrectPitch = false;
      player.setPlaybackRate(1);
    });
  }
}

/** Crossfade the audible bed to `ctx`: incoming fades up, others fade down then pause. */
function crossfadeTo(ctx: MusicContext): void {
  const incoming = beds.get(ctx);
  if (!incoming) return;
  if (ctx === 'game') resetGameRate(); // never start the game bed pitched-up from a prior Q4
  bestEffort(() => {
    incoming.seekTo(0);
    incoming.play();
  });
  tween(`cf:${ctx}`, cfFactor.get(ctx) ?? 0, 1, FADE_MS, (v) => {
    cfFactor.set(ctx, v);
    applyBedVolume(ctx);
  });
  for (const other of beds.keys()) {
    if (other === ctx || (cfFactor.get(other) ?? 0) === 0) continue;
    tween(`cf:${other}`, cfFactor.get(other) ?? 0, 0, FADE_MS, (v) => {
      cfFactor.set(other, v);
      applyBedVolume(other);
      if (v === 0) {
        const player = beds.get(other);
        if (player) bestEffort(() => player.pause()); // steady state: one bed playing
      }
    });
  }
}

function stopAll(): void {
  for (const cancel of cancels.values()) cancel();
  cancels.clear();
  for (const ctx of beds.keys()) {
    cfFactor.set(ctx, 0);
    const player = beds.get(ctx);
    if (player) bestEffort(() => player.pause());
  }
}

/** Toggle music (wired to FeelSettings.musicEnabled && !lowPowerMode). */
export function setMusicEnabled(value: boolean): void {
  enabled = value;
  if (IS_WEB || !ready) return;
  if (!enabled) stopAll();
  else if (active && current) crossfadeTo(current);
}

/** Master music volume 0..1 (wired to FeelSettings.musicVolume). Applied live, no tween. */
export function setMusicVolume(value: number): void {
  masterVolume = Math.min(1, Math.max(0, value));
  if (ready) applyAllBeds();
}

/** Foreground gate: false pauses both beds, true resumes the active one. */
export function setMusicActive(value: boolean): void {
  active = value;
  if (IS_WEB || !ready) return;
  if (!value) {
    for (const player of beds.values()) bestEffort(() => player.pause());
  } else if (enabled && current) {
    crossfadeTo(current);
  }
}

/** Set the in-game bed's playback rate (and pitch, since shouldCorrectPitch is off). */
export function setMusicTempo(rate: number): void {
  gameRate = Math.min(2, Math.max(0.5, rate));
  if (IS_WEB || !ready) return;
  const player = beds.get('game');
  // iOS applies a rate live only while playing; otherwise it is stored for the next play.
  if (player) {
    bestEffort(() => {
      player.shouldCorrectPitch = false;
      player.setPlaybackRate(gameRate);
    });
  }
}

/** Briefly dip the active bed under a big SFX sting, then ease it back. Self-cancelling. */
export function duck(holdMs: number = DUCK_HOLD_MS): void {
  if (IS_WEB || !ready || !enabled || !active || !current) return;
  tween('duck', duckFactor, DUCK_LEVEL, DUCK_FADE_MS, (v) => {
    duckFactor = v;
    applyAllBeds();
  });
  cancels.get('duck:hold')?.();
  const holdId = setTimeout(() => {
    cancels.delete('duck:hold');
    tween('duck', duckFactor, 1, DUCK_RESTORE_MS, (v) => {
      duckFactor = v;
      applyAllBeds();
    });
  }, holdMs);
  cancels.set('duck:hold', () => clearTimeout(holdId));
}

/**
 * Declare the desired music context. Idempotent: re-declaring the current context does
 * nothing (so hub-to-hub navigation never restarts the bed). Remembers intent if called
 * before the beds are ready / while disabled / backgrounded, and honors it on init/resume.
 */
export function playMusicContext(ctx: MusicContext): void {
  if (IS_WEB || current === ctx) return;
  current = ctx;
  if (!ready || !enabled || !active) return;
  crossfadeTo(ctx);
}

/** Preload both beds as long-lived looping players. Lazy, called once music is effective. */
export async function initMusic(): Promise<void> {
  if (initStarted || IS_WEB) return;
  initStarted = true;
  const ctxs = Object.keys(CONTEXT_TRACK) as MusicContext[];
  await Promise.all(
    ctxs.map(async (ctx) => {
      try {
        const [asset] = await Asset.loadAsync(MUSIC_SOURCES[CONTEXT_TRACK[ctx]]);
        const uri = asset?.localUri ?? asset?.uri;
        if (!uri) return;
        const player = createAudioPlayer({ uri });
        player.loop = true;
        player.shouldCorrectPitch = false;
        player.volume = 0; // start silent; crossfade fades it in
        beds.set(ctx, player);
        cfFactor.set(ctx, 0);
      } catch {
        /* one failed bed never blocks the other */
      }
    })
  );
  ready = true;
  if (current && enabled && active) crossfadeTo(current);
}
