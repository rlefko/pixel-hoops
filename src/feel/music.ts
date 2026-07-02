import type { AudioPlayer } from 'expo-audio';
import { MUSIC_SOURCES, type MusicName } from '@/audio/musicManifest';
import { createLoadedPlayer, ensureAudioMode } from './audioPlayers';
import { IS_WEB, bestEffort } from './bestEffort';
import {
  MENU_TRACK,
  ENERGY_TRACK,
  bedsFor,
  resolveMusicTarget,
  type MusicContext,
} from './musicPolicy';

/**
 * Looping background music. A warm `menuTheme` plays on the hubs; one of two rotating run
 * themes plays across an entire run; and a key-safe `gameEnergy` percussion layer fades in
 * on top during the live game. Mirrors ./audio (web no-op, best-effort, long-lived
 * players) but plays continuously rather than one-shots.
 *
 * Screens DECLARE a context via playMusicContext('menu'|'run'), and every entry point
 * funnels into one sync(): declarations and gate flips record DESIRED state, sync makes
 * the APPLIED state match. Beds load lazily the first time a declared context needs them
 * (boot loads only the menu bed; a run pulls in its one theme plus the energy layer), so
 * a session that never starts a run never pays for run music, and nothing loads while
 * music is off, backgrounded, or in low power. Bed selection lives in ./musicPolicy.
 *
 * Volume is a single source of truth: each player's volume = masterVolume * its own factor
 * (crossfade for a main bed, energy for the layer) * duckFactor. Tweens animate the
 * FACTORS, never the player volume directly, so crossfade, duck, and the live slider never
 * fight. The audio session is owned by ./audioPlayers (ensureAudioMode); background
 * pause/resume is driven by setMusicActive.
 */

export type { MusicContext } from './musicPolicy';

const FADE_MS = 1200; // bed-to-bed crossfade (slower = calmer transitions)
const ENERGY_FADE_MS = 900; // game-energy layer fade in/out
const TICK_MS = 33; // ~30 Hz tween
const ENERGY_LEVEL = 0.85; // the layer sits just under the run bed
const DUCK_LEVEL = 0.4;
const DUCK_FADE_MS = 120;
const DUCK_RESTORE_MS = 420;
const DUCK_HOLD_MS = 350;

// Desired state: what the app has declared, whether or not it is audible yet.
let enabled = false; // wired to the effective policy (hydrated, music on, not low power)
let active = true; // foreground gate
let masterVolume = 0.5;
let current: MusicName | null = null; // the declared main bed
let energyOn = false; // desired energy state (survives background/foreground)
let runRotation = 0; // advances when a run picks a new theme, so themes alternate

// Applied state: which players exist and what they are audibly doing.
const mains = new Map<MusicName, AudioPlayer>();
let energyPlayer: AudioPlayer | null = null;
const attempted = new Set<MusicName>(); // beds whose one load has started (or failed)
let audibleBed: MusicName | null = null; // the bed sync() last crossfaded in
let energyApplied = false; // the energy state sync() last applied
const cfFactor = new Map<MusicName, number>(); // crossfade factor per main bed, 0..1
let energyFactor = 0; // 0..1 crossfade of the game-energy layer
let duckFactor = 1;
const cancels = new Map<string, () => void>(); // active tween/timer cancels by key
const lastVolume = new Map<MusicName, number>(); // last volume written per player

/**
 * The single writer for a main bed. Skips the native call when the computed volume has
 * not changed, so a silent bed costs zero bridge traffic while a duck or crossfade
 * tweens the audible ones at 30 Hz.
 */
function applyMain(name: MusicName): void {
  const player = mains.get(name);
  if (!player) return;
  const volume = masterVolume * (cfFactor.get(name) ?? 0) * duckFactor;
  if (lastVolume.get(name) === volume) return;
  bestEffort(() => {
    player.volume = volume;
    lastVolume.set(name, volume);
  });
}

function applyEnergy(): void {
  const p = energyPlayer;
  if (!p) return;
  const volume = masterVolume * energyFactor * ENERGY_LEVEL * duckFactor;
  if (lastVolume.get(ENERGY_TRACK) === volume) return;
  bestEffort(() => {
    p.volume = volume;
    lastVolume.set(ENERGY_TRACK, volume);
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

/**
 * Load one bed's looping player, at most once per session (a failed load stays silent,
 * exactly like a failed SFX). Completion just re-runs sync(), so a load that outlives
 * the declaration that requested it parks paused and silent, and a load that is still
 * wanted fades in the moment it lands.
 */
async function ensureBed(name: MusicName): Promise<void> {
  if (attempted.has(name)) return;
  attempted.add(name);
  try {
    await ensureAudioMode();
    const player = await createLoadedPlayer(MUSIC_SOURCES[name]);
    if (!player) return;
    player.loop = true;
    player.volume = 0; // start silent; fades bring it in
    lastVolume.set(name, 0);
    if (name === ENERGY_TRACK) {
      energyPlayer = player;
    } else {
      mains.set(name, player);
      cfFactor.set(name, 0);
    }
  } catch {
    /* one failed bed never blocks the others */
  } finally {
    sync();
  }
}

/**
 * The single reconcile step: make the applied state match the desired state. Cheap and
 * idempotent, so every entry point (context declared, gate flipped, bed loaded) records
 * its change and calls sync(). While music is off, backgrounded, or undeclared this does
 * nothing at all, which is what keeps the module battery-honest.
 */
function sync(): void {
  if (IS_WEB || !enabled || !active || current === null) return;
  for (const name of bedsFor(current)) void ensureBed(name);
  if (audibleBed !== current && mains.has(current)) {
    audibleBed = current;
    crossfadeTo(current);
  }
  // The energy layer only ever rides on top of an audible bed: if the bed is still
  // loading (it is far larger than the layer), the layer waits and both fade in together.
  if (energyPlayer && audibleBed === current && energyApplied !== energyOn) {
    energyApplied = energyOn;
    fadeEnergy(energyOn);
  }
}

/**
 * Pause every loaded player, cancel every tween and timer, and forget what was applied,
 * so nothing ticks while halted and sync() re-applies cleanly on resume. Resetting
 * duckFactor here means a duck interrupted mid-dip can never leave the music
 * permanently quieter after a resume.
 */
function haltPlayback(): void {
  for (const cancel of cancels.values()) cancel();
  cancels.clear();
  duckFactor = 1;
  for (const player of mains.values()) bestEffort(() => player.pause());
  const p = energyPlayer;
  if (p) bestEffort(() => p.pause());
  audibleBed = null;
  energyApplied = false;
}

/** Stop for real (music toggled off): silence everything so re-enabling fades in fresh. */
function stopAll(): void {
  haltPlayback();
  for (const name of mains.keys()) cfFactor.set(name, 0);
  energyFactor = 0;
}

/** Toggle music (wired to the effective policy: hydrated, music on, not low power). */
export function setMusicEnabled(value: boolean): void {
  enabled = value;
  if (IS_WEB) return;
  if (!enabled) stopAll();
  else sync();
}

/** Master music volume 0..1 (wired to FeelSettings.musicVolume). Applied live, no tween. */
export function setMusicVolume(value: number): void {
  masterVolume = Math.min(1, Math.max(0, value));
  applyAll();
}

/** Foreground gate: false pauses everything and stops all tweens, true resumes the bed. */
export function setMusicActive(value: boolean): void {
  active = value;
  if (IS_WEB) return;
  if (!value) haltPlayback();
  else sync();
}

/** Fade the game-energy percussion layer in (live game) or out. */
export function setGameEnergy(on: boolean): void {
  energyOn = on;
  if (IS_WEB) return;
  sync();
}

/** Briefly dip the music under a big SFX sting, then ease it back. Self-cancelling. */
export function duck(holdMs: number = DUCK_HOLD_MS): void {
  if (IS_WEB || !enabled || !active || audibleBed === null) return;
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
 * long session alternates themes. Leaving the run for the menu drops the energy layer.
 */
export function playMusicContext(ctx: MusicContext): void {
  if (IS_WEB) return;
  const { target, nextRotation } = resolveMusicTarget(ctx, current, runRotation);
  runRotation = nextRotation;
  if (current === target) return;
  current = target;
  if (target === MENU_TRACK) energyOn = false; // menu never has the game layer
  sync();
}
