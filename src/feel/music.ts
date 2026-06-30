import { Asset } from 'expo-asset';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { MUSIC_SOURCES, type MusicName } from '@/audio/musicManifest';
import { IS_WEB, bestEffort } from './bestEffort';

/**
 * Looping background music. A warm `menuTheme` plays on the hubs; one of two rotating run
 * themes plays across an entire run; and a key-safe `gameEnergy` percussion layer fades in
 * on top during the live game. Mirrors ./audio (web no-op, best-effort, lazy init,
 * long-lived players) but plays continuously rather than one-shots.
 *
 * Screens DECLARE a context via playMusicContext('menu'|'run'); the module decides what
 * changes (idempotent: re-declaring the current context is a no-op, so navigating hubs or
 * stepping through run phases never restarts the bed). The run theme rotates per run so a
 * long session stays fresh. The live-game lift is a faded-in LAYER, not a pitch change.
 *
 * Volume is a single source of truth: each player's volume = masterVolume * its own factor
 * (crossfade for a main bed, energy for the layer) * duckFactor. Tweens animate the
 * FACTORS, never the player volume directly, so crossfade, duck, and the live slider never
 * fight. It does NOT configure the audio session: initSfx owns the one shared
 * setAudioModeAsync; background pause/resume is driven by setMusicActive.
 */

export type MusicContext = 'menu' | 'run';

const MENU_TRACK: MusicName = 'menuTheme';
const RUN_THEMES: MusicName[] = ['runThemeA', 'runThemeB'];
/** Main beds that crossfade exclusively (one audible at a time). */
const MAIN_TRACKS: MusicName[] = [MENU_TRACK, ...RUN_THEMES];
const ENERGY_TRACK: MusicName = 'gameEnergy';

const FADE_MS = 1200; // bed-to-bed crossfade (slower = calmer transitions)
const ENERGY_FADE_MS = 900; // game-energy layer fade in/out
const TICK_MS = 33; // ~30 Hz tween
const ENERGY_LEVEL = 0.85; // the layer sits just under the run bed
const DUCK_LEVEL = 0.4;
const DUCK_FADE_MS = 120;
const DUCK_RESTORE_MS = 420;
const DUCK_HOLD_MS = 350;

let enabled = true;
let masterVolume = 0.5;
let ready = false;
let initStarted = false;
let active = true; // foreground gate
let duckFactor = 1;

let current: MusicName | null = null; // the active main bed
let runRotation = 0; // advances each time a run is entered, to rotate run themes
let energyFactor = 0; // 0..1 crossfade of the game-energy layer
let energyOn = false; // desired energy state (survives background/foreground)

const mains = new Map<MusicName, AudioPlayer>();
const cfFactor = new Map<MusicName, number>(); // crossfade factor per main bed, 0..1
let energyPlayer: AudioPlayer | null = null;
const cancels = new Map<string, () => void>(); // active tween/timer cancels by key

function isRunTheme(name: MusicName | null): boolean {
  return name === 'runThemeA' || name === 'runThemeB';
}

/** The single writer for a main bed. */
function applyMain(name: MusicName): void {
  const player = mains.get(name);
  if (!player) return;
  const cf = cfFactor.get(name) ?? 0;
  bestEffort(() => {
    player.volume = masterVolume * cf * duckFactor;
  });
}

function applyEnergy(): void {
  if (!energyPlayer) return;
  const p = energyPlayer;
  bestEffort(() => {
    p.volume = masterVolume * energyFactor * ENERGY_LEVEL * duckFactor;
  });
}

function applyAll(): void {
  for (const name of mains.keys()) applyMain(name);
  applyEnergy();
}

/** Tween a value over ms, cancelable by key (a new tween on a key cancels the old). */
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

/** Crossfade the audible main bed to `name`: it fades up, the others fade down then pause. */
function crossfadeTo(name: MusicName): void {
  const incoming = mains.get(name);
  if (!incoming) return;
  bestEffort(() => {
    incoming.seekTo(0);
    incoming.play();
  });
  tween(`cf:${name}`, cfFactor.get(name) ?? 0, 1, FADE_MS, (v) => {
    cfFactor.set(name, v);
    applyMain(name);
  });
  for (const other of mains.keys()) {
    if (other === name || (cfFactor.get(other) ?? 0) === 0) continue;
    tween(`cf:${other}`, cfFactor.get(other) ?? 0, 0, FADE_MS, (v) => {
      cfFactor.set(other, v);
      applyMain(other);
      if (v === 0) {
        const player = mains.get(other);
        if (player) bestEffort(() => player.pause());
      }
    });
  }
}

function stopAll(): void {
  for (const cancel of cancels.values()) cancel();
  cancels.clear();
  for (const name of mains.keys()) {
    cfFactor.set(name, 0);
    const player = mains.get(name);
    if (player) bestEffort(() => player.pause());
  }
  energyFactor = 0;
  if (energyPlayer) bestEffort(() => energyPlayer?.pause());
}

/** Toggle music (wired to FeelSettings.musicEnabled && !lowPowerMode). */
export function setMusicEnabled(value: boolean): void {
  enabled = value;
  if (IS_WEB || !ready) return;
  if (!enabled) {
    stopAll();
  } else if (active && current) {
    crossfadeTo(current);
    if (energyOn) fadeEnergy(true);
  }
}

/** Master music volume 0..1 (wired to FeelSettings.musicVolume). Applied live, no tween. */
export function setMusicVolume(value: number): void {
  masterVolume = Math.min(1, Math.max(0, value));
  if (ready) applyAll();
}

/** Foreground gate: false pauses everything, true resumes the active bed (+ energy). */
export function setMusicActive(value: boolean): void {
  active = value;
  if (IS_WEB || !ready) return;
  if (!value) {
    for (const player of mains.values()) bestEffort(() => player.pause());
    if (energyPlayer) bestEffort(() => energyPlayer?.pause());
  } else if (enabled && current) {
    crossfadeTo(current);
    if (energyOn) fadeEnergy(true);
  }
}

function fadeEnergy(on: boolean): void {
  if (!energyPlayer) return;
  const p = energyPlayer;
  if (on) bestEffort(() => p.play());
  tween('energy', energyFactor, on ? 1 : 0, ENERGY_FADE_MS, (v) => {
    energyFactor = v;
    applyEnergy();
    if (!on && v === 0) bestEffort(() => p.pause());
  });
}

/** Fade the game-energy percussion layer in (live game) or out. */
export function setGameEnergy(on: boolean): void {
  energyOn = on;
  if (IS_WEB || !ready || !enabled || !active) return;
  fadeEnergy(on);
}

/** Briefly dip the music under a big SFX sting, then ease it back. Self-cancelling. */
export function duck(holdMs: number = DUCK_HOLD_MS): void {
  if (IS_WEB || !ready || !enabled || !active || !current) return;
  tween('duck', duckFactor, DUCK_LEVEL, DUCK_FADE_MS, (v) => {
    duckFactor = v;
    applyAll();
  });
  cancels.get('duck:hold')?.();
  const holdId = setTimeout(() => {
    cancels.delete('duck:hold');
    tween('duck', duckFactor, 1, DUCK_RESTORE_MS, (v) => {
      duckFactor = v;
      applyAll();
    });
  }, holdMs);
  cancels.set('duck:hold', () => clearTimeout(holdId));
}

/**
 * Declare the desired music context. Idempotent. 'run' keeps the current run theme if one
 * is already playing (stable within a run) or picks the next rotating theme on entry, so a
 * long session alternates themes. Leaving the run for the menu fades the energy layer out.
 */
export function playMusicContext(ctx: MusicContext): void {
  if (IS_WEB) return;
  let target: MusicName;
  if (ctx === 'menu') {
    target = MENU_TRACK;
  } else if (isRunTheme(current)) {
    target = current as MusicName; // already in a run: keep this run's theme
  } else {
    target = RUN_THEMES[runRotation % RUN_THEMES.length];
    runRotation += 1;
  }
  if (current === target) return;
  current = target;
  if (target === MENU_TRACK) setGameEnergy(false); // menu never has the game layer
  if (!ready || !enabled || !active) return;
  crossfadeTo(target);
}

/** Preload the beds as long-lived looping players. Lazy, called once music is effective. */
export async function initMusic(): Promise<void> {
  if (initStarted || IS_WEB) return;
  initStarted = true;
  await Promise.all(
    [...MAIN_TRACKS, ENERGY_TRACK].map(async (name) => {
      try {
        const [asset] = await Asset.loadAsync(MUSIC_SOURCES[name]);
        const uri = asset?.localUri ?? asset?.uri;
        if (!uri) return;
        const player = createAudioPlayer({ uri });
        player.loop = true;
        player.volume = 0; // start silent; fades bring it in
        if (name === ENERGY_TRACK) {
          energyPlayer = player;
        } else {
          mains.set(name, player);
          cfFactor.set(name, 0);
        }
      } catch {
        /* one failed bed never blocks the others */
      }
    })
  );
  ready = true;
  if (current && enabled && active) crossfadeTo(current);
  if (energyOn && enabled && active) fadeEnergy(true);
}
