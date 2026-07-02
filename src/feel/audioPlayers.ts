import { Asset } from 'expo-asset';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Shared expo-audio plumbing for ./audio (one-shot SFX) and ./music (looping beds).
 * Every player in the app is created through here so all of them inherit the same
 * battery posture and audio session, and neither module can drift from the other.
 */

/**
 * How often each player emits playbackStatusUpdate. Nothing in the app listens to that
 * event, but on Android every player runs a main-thread wakeup loop at this interval for
 * its entire lifetime, even while paused (expo-audio's BaseAudioPlayer). At the default
 * 500ms our resident players cost a constant drip of wakeups; at one minute they are
 * effectively free when idle.
 */
const STATUS_UPDATE_INTERVAL_MS = 60_000;

let audioModePromise: Promise<void> | null = null;

/**
 * Configure the one shared audio session (idempotent, best-effort). MUST complete before
 * any player is created so iOS does not deactivate the user's own music and Android does
 * not grab exclusive focus. Owned here rather than by initSfx so a player with sound off
 * but music on still gets the mix-with-others / respect-the-ringer behavior.
 */
export function ensureAudioMode(): Promise<void> {
  audioModePromise ??= setAudioModeAsync({
    playsInSilentMode: false, // respect the iOS ringer switch (settings copy says so)
    interruptionMode: 'mixWithOthers', // never pause the user's Spotify; fixes Android self-pause
    shouldPlayInBackground: false,
    allowsRecording: false,
  }).catch(() => {
    /* sound is best-effort */
  });
  return audioModePromise;
}

/**
 * Resolve a bundled audio asset to a local file URI. A bare require() passed straight
 * into createAudioPlayer can fail silently in release builds (expo/expo#40448); resolving
 * first also warms the first play.
 */
export async function resolveAudioUri(source: number): Promise<string | null> {
  const [asset] = await Asset.loadAsync(source);
  return asset?.localUri ?? asset?.uri ?? null;
}

/** Create a player for an already-resolved URI, with the quiet status interval. */
export function createResolvedPlayer(uri: string): AudioPlayer {
  return createAudioPlayer({ uri }, { updateInterval: STATUS_UPDATE_INTERVAL_MS });
}

/** Resolve and create in one step, for callers that want one player per asset. */
export async function createLoadedPlayer(source: number): Promise<AudioPlayer | null> {
  const uri = await resolveAudioUri(source);
  return uri === null ? null : createResolvedPlayer(uri);
}
