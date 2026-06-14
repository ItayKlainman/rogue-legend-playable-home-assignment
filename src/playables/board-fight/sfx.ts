import { sdk } from '@smoud/playable-sdk';

// Core/always-used SFX. Per-scene sfx (slots, blackjack, lucky wheel, shop)
// live in dedicated `sfx-*.ts` modules so their audio data only ships in
// variants that reference those scenes.
import buttonClickData from 'assets/Audio/ButtonClick.mp3';
import boardHopData from 'assets/Audio/Board_Hop.mp3';
import rewardReceivedData from 'assets/Audio/Reward_Received.mp3';
import swordHitData from 'assets/Audio/Sword_Hit.mp3';
import damageData from 'assets/Audio/Damage.mp3';
import experienceBarData from 'assets/Audio/Experience_Bar.mp3';
import deathData from 'assets/Audio/Death.mp3';
import chargeData from 'assets/Audio/Charge.mp3';
import dodgeData from 'assets/Audio/Dodge.mp3';
import levelUpData from 'assets/Audio/Level_Up.mp3';
import diceRollData from 'assets/Audio/Dice_Roll.mp3';
import powerUpData from 'assets/Audio/Power_Up.mp3';
// Power_Down.mp3 is imported by its consumers (StatChangePopup, ShopScene)
// directly so variants without those scenes don't ship the audio.

// WebAudio-based playback. Replaces the old `new Audio(dataUrl)` x POOL_SIZE
// HTMLAudioElement pool, which on iOS caused a severe perf regression: the
// first user gesture activated the audio pipeline and dropped framerate from
// 60 → ~15 FPS. AudioBufferSourceNode-per-play is dramatically lighter on iOS
// and uses ~zero memory after the one-time decode.

let audioCtx: AudioContext | null = null;
let userHasInteracted = false;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx() as AudioContext;
  return audioCtx;
}

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const idx = dataUrl.indexOf(',');
  const base64 = dataUrl.slice(idx + 1);
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function getBuffer(dataUrl: string): Promise<AudioBuffer | null> {
  let p = bufferCache.get(dataUrl);
  if (p) return p;
  const ctx = getCtx();
  if (!ctx) return Promise.resolve(null);
  p = (async () => {
    try {
      const arr = dataUrlToArrayBuffer(dataUrl);
      // Older Safari needs the callback overload, but iOS 14+ supports the
      // promise form. Production minimum is iOS 14 per the playable target.
      return await ctx.decodeAudioData(arr);
    } catch (e) {
      if (__DEV__) console.warn('[sfx] decode failed', e);
      return null;
    }
  })();
  bufferCache.set(dataUrl, p);
  return p;
}

const onFirstInteraction = () => {
  userHasInteracted = true;
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  document.removeEventListener('pointerdown', onFirstInteraction, true);
  document.removeEventListener('touchstart', onFirstInteraction, true);
  document.removeEventListener('click', onFirstInteraction, true);
  document.removeEventListener('keydown', onFirstInteraction, true);
  startMusicIfPending();
};
// Capture phase ensures we set the flag before PIXI's federated pointer handlers fire,
// so sfx calls from inside the first click's handler still play.
document.addEventListener('pointerdown', onFirstInteraction, true);
document.addEventListener('touchstart', onFirstInteraction, true);
document.addEventListener('click', onFirstInteraction, true);
document.addEventListener('keydown', onFirstInteraction, true);

export interface PlayOpts {
  /** Multiply rate to pitch-shift (e.g., 2 ** (semitone/12) for chromatic ticks). */
  playbackRate?: number;
  /** Stereo pan in [-1, 1]. Silently no-ops on browsers without StereoPannerNode. */
  pan?: number;
}

export function play(dataUrl: string, volume: number, opts?: PlayOpts): void {
  if (!userHasInteracted) return;
  const base = sdk.volume > 0 ? sdk.volume : (__DEV__ ? 1 : 0);
  if (base <= 0) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  void getBuffer(dataUrl).then((buffer) => {
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts?.playbackRate ?? 1;

    const gain = ctx.createGain();
    gain.gain.value = base * volume;
    src.connect(gain);

    let tail: AudioNode = gain;
    if (opts?.pan != null && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(ctx.destination);
    src.start(0);
    // BufferSourceNodes auto-disconnect after `ended` fires; no manual cleanup needed.
  });
}

// ─── Music ───────────────────────────────────────────────────────────────────
// Music shares the SFX AudioContext + buffer cache. We track one active
// source + gain so we can change volume / pause / resume.

let musicData: string | null = null;
let musicSrc: AudioBufferSourceNode | null = null;
let musicGain: GainNode | null = null;
let musicVolume = 1;
let musicWantsPlay = false;

export function setMusic(dataUrl: string, volume: number): void {
  musicData = dataUrl;
  musicVolume = volume;
  musicWantsPlay = volume > 0;
  startMusicIfPending();
}

export function setMusicVolume(volume: number): void {
  musicVolume = volume;
  if (musicGain) musicGain.gain.value = volume;
  if (volume > 0) {
    musicWantsPlay = true;
    startMusicIfPending();
  } else {
    pauseMusic();
  }
}

export function pauseMusic(): void {
  if (musicSrc) {
    try { musicSrc.stop(); } catch { /* already stopped */ }
    musicSrc.disconnect();
    musicSrc = null;
  }
  // Note: `musicWantsPlay` stays as-is; resumeMusic() picks it back up.
}

export function resumeMusic(): void {
  if (musicSrc || !musicWantsPlay) return;
  startMusicIfPending();
}

function startMusicIfPending(): void {
  if (musicSrc) return;
  if (!musicWantsPlay || !musicData || !userHasInteracted) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const dataUrl = musicData;
  void getBuffer(dataUrl).then((buffer) => {
    if (!buffer || musicSrc) return;
    if (!musicWantsPlay || musicData !== dataUrl) return;
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.connect(ctx.destination);
    }
    musicGain.gain.value = musicVolume;
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = buffer;
    musicSrc.loop = true;
    musicSrc.connect(musicGain);
    musicSrc.start(0);
  });
}

// Per-scene sfx (slots/blackjack/luckyWheel/shop) live in `sfx-*.ts` modules
// — import those directly from the consuming scene to keep their audio data
// out of variants that don't use those scenes.
//
// IMPORTANT: each sfx is a separate named export so webpack can tree-shake
// the audio data for sounds the variant doesn't actually call. Callers should
// use `import * as sfx from './sfx'` (namespace import) — webpack 5 only
// bundles the namespace members that are accessed (`sfx.X`). A single
// `export const sfx = {...}` object would force every audio data URL into
// the bundle, since the object holds references to all of them.
export const buttonClick = (vol = 1) => play(buttonClickData, vol);
export const boardHop = (vol = 1) => play(boardHopData, vol);
export const rewardReceived = (vol = 1) => play(rewardReceivedData, vol);
export const swordHit = (vol = 1) => play(swordHitData, vol);
export const damage = (vol = 1) => play(damageData, vol);
export const experienceBar = (vol = 1) => play(experienceBarData, vol);
export const death = (vol = 1) => play(deathData, vol);
export const charge = (vol = 1) => play(chargeData, vol);
export const dodge = (vol = 1) => play(dodgeData, vol);
export const levelUp = (vol = 1) => play(levelUpData, vol);
export const diceRoll = (vol = 1) => play(diceRollData, vol);
export const powerUp = (vol = 1) => play(powerUpData, vol);
/** Generic raw-data play with playback options. Used by wheel/slot tick effects. */
export const raw = (dataUrl: string, vol = 1, opts?: PlayOpts) => play(dataUrl, vol, opts);
