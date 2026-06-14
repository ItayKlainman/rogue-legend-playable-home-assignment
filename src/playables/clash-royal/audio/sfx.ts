import { sdk } from '@smoud/playable-sdk';

import swordHitData from 'assets/Audio/Sword_Hit.mp3';
import powerUpData from 'assets/Audio/Power_Up.mp3';
import chargeData from 'assets/Audio/Charge.mp3';
import damageData from 'assets/Audio/Damage.mp3';
import rise06Data from 'assets/Audio/Rise_06.mp3';
import deathData from 'assets/Audio/Death.mp3';
import rewardReceivedData from 'assets/Audio/Reward_Received.mp3';
import rise03Data from 'assets/Audio/Rise_03.mp3';
import luckyWheelTickData from 'assets/Audio/LuckyWheel_Tick.mp3';
import buttonClickData from 'assets/Audio/ButtonClick.mp3';
import slotReelsReward1Data from 'assets/Audio/SlotReels_Reward_1.mp3';
import powerDownData from 'assets/Audio/Power_Down.mp3';
import rise01Data from 'assets/Audio/Rise_01.mp3';
import musicThemeData from 'assets/Audio/Level1_Compressed_Theme.mp3';

// ─── WebAudio-based playback (THE iOS perf fix) ──────────────────────────────
// Replaces the old `new Audio(dataUrl)` × POOL_SIZE HTMLAudioElement pools, which
// on iPhone Safari caused a SEVERE perf regression: the moment the audio pipeline
// activated on first gesture, framerate collapsed to single digits and the main
// thread stalled for ~1s at a time (HTMLAudioElement playback/decoding runs on the
// main thread and fights the WebGL renderer). board-fight/sfx.ts hit the identical
// bug and fixed it the same way: one AudioContext, decode each clip ONCE into an
// AudioBuffer, then fire a cheap AudioBufferSourceNode per play. BufferSourceNodes
// are hardware-mixed off the main thread and cost ~zero after the one-time decode.

let audioCtx: AudioContext | null = null;
let userHasInteracted = false;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctx = (window as unknown as {
    AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext;
  }).AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
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
      return await ctx.decodeAudioData(dataUrlToArrayBuffer(dataUrl));
    } catch (e) {
      if (__DEV__) console.warn('[sfx] decode failed', e);
      return null;
    }
  })();
  bufferCache.set(dataUrl, p);
  return p;
}

// Every clip clash-royal uses — decoded once on first gesture so the first cast /
// damage / star-fill doesn't pay a lazy-decode hitch mid-fight.
const ALL_AUDIO_URLS: string[] = [
  swordHitData, powerUpData, chargeData, damageData, rise06Data, deathData,
  rewardReceivedData, rise03Data, luckyWheelTickData, buttonClickData,
  slotReelsReward1Data, powerDownData, rise01Data,
];

const onFirstInteraction = () => {
  userHasInteracted = true;
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  // Warm the decoded-buffer cache so the first play of each sound is instant.
  for (const url of ALL_AUDIO_URLS) void getBuffer(url);
  startMusicIfPending(); // kick the looping bg music now that we have a user gesture
  document.removeEventListener('pointerdown', onFirstInteraction, true);
  document.removeEventListener('touchstart', onFirstInteraction, true);
  document.removeEventListener('click', onFirstInteraction, true);
  document.removeEventListener('keydown', onFirstInteraction, true);
};
// Capture phase ensures the flag + ctx.resume run before PIXI's federated pointer
// handlers fire, so sfx calls from inside the first tap's handler still play.
document.addEventListener('pointerdown', onFirstInteraction, true);
document.addEventListener('touchstart', onFirstInteraction, true);
document.addEventListener('click', onFirstInteraction, true);
document.addEventListener('keydown', onFirstInteraction, true);

// Per-dataUrl throttle (ms) so high-frequency events (per-strike damage, per-melee
// chip) can't fire >1/throttleMs. Kept from the old engine — still worth avoiding a
// burst of overlapping voices, though WebAudio handles it far more gracefully.
const lastPlayMs = new Map<string, number>();

// NOTE: `_poolSize` is retained in the signature so the sfx table below is unchanged,
// but WebAudio needs no pool — each play spins a throwaway BufferSourceNode.
function play(dataUrl: string, _poolSize: number, volume: number, throttleMs: number = 0): void {
  if (!userHasInteracted) return;
  // ?audio=off perf A/B toggle — inert in the shipped ad (no param).
  if ((globalThis as { __crPerf?: { noAudio?: boolean } }).__crPerf?.noAudio) return;

  if (throttleMs > 0) {
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const last = lastPlayMs.get(dataUrl) ?? 0;
    if (now - last < throttleMs) return;
    lastPlayMs.set(dataUrl, now);
  }

  const base = sdk.volume > 0 ? sdk.volume : (__DEV__ ? 1 : 0);
  if (base <= 0) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  void getBuffer(dataUrl).then((buffer) => {
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = base * volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
    // BufferSourceNodes auto-disconnect once `ended` fires; no manual cleanup needed.
  });
}

// ─── Music ───────────────────────────────────────────────────────────────────
// Light looping background track. Shares the SFX AudioContext + buffer cache; one active
// looping source + gain so the volume can be tweaked / paused. Starts on the first user
// gesture (autoplay policy): setMusic() registers the track + intent, onFirstInteraction
// kicks it off (and the SDK can adjust the level via setMusicVolume).
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
  if (volume > 0) { musicWantsPlay = true; startMusicIfPending(); } else { pauseMusic(); }
}
export function pauseMusic(): void {
  if (musicSrc) { try { musicSrc.stop(); } catch { /* already stopped */ } musicSrc.disconnect(); musicSrc = null; }
}
export function resumeMusic(): void {
  if (musicSrc || !musicWantsPlay) return;
  startMusicIfPending();
}
/** Start the looping fight background music at a LIGHT level (lightFactor × SDK volume).
 *  Safe to call before the first gesture — registers intent + the track and actually starts
 *  on first interaction. Respects SDK mute (sdk.volume 0 ⇒ silent, except in dev preview). */
export function startBgMusic(lightFactor = 0.3): void {
  const base = sdk.volume > 0 ? sdk.volume : (__DEV__ ? 1 : 0);
  setMusic(musicThemeData, base * lightFactor);
}
function startMusicIfPending(): void {
  if (musicSrc || !musicWantsPlay || !musicData || !userHasInteracted) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const dataUrl = musicData;
  void getBuffer(dataUrl).then((buffer) => {
    if (!buffer || musicSrc) return;
    if (!musicWantsPlay || musicData !== dataUrl) return;
    if (!musicGain) { musicGain = ctx.createGain(); musicGain.connect(ctx.destination); }
    musicGain.gain.value = musicVolume;
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = buffer;
    musicSrc.loop = true;
    musicSrc.connect(musicGain);
    musicSrc.start(0);
  });
}

// Throttle ms tuned per event (unchanged from the previous engine):
//   • per-strike & per-hit-marker SFX (damage, crit, heroMelee, starFill, coinTick):
//     80–100ms so a tier-3 chain-lightning's 5 strikes don't stack voices.
//   • cast / once-per-event SFX: no throttle — they naturally fire <1/sec.
export const sfx = {
  /** Per shuriken throw in shurikenFlurry handler */
  skillCastShuriken: (v = 1) => play(swordHitData, 3, 0.7 * v),

  /** fireballBarrage cast start */
  skillCastFireball: (v = 1) => play(powerUpData, 3, 0.7 * v),

  /** chainLightning cast start */
  skillCastLightning: (v = 1) => play(chargeData, 3, 0.7 * v),

  /** heal cast */
  skillCastHeal: (v = 1) => play(powerUpData, 2, 0.9 * v),

  /** each hero melee swing (CombatFx.heroMelee) — throttled */
  heroMelee: (v = 1) => play(swordHitData, 3, 0.5 * v, 80),

  /** each damage number drawn (skill OR melee impact) — throttled (per-strike spam) */
  damage: (v = 1) => play(damageData, 3, 0.6 * v, 80),

  /** every crit-styled damage number — throttled */
  crit: (v = 1) => play(rise06Data, 3, 0.8 * v, 80),

  /** killActor on minion or boss */
  enemyDeath: (v = 1) => play(deathData, 2, 0.8 * v),

  /** controller.victory latch */
  victory: (v = 1) => play(rewardReceivedData, 2, 1.0 * v),

  /** each stack-up (cutout → filled-star transition) — throttled (3 stars pop quickly) */
  starFill: (v = 1) => play(rise03Data, 3, 0.7 * v, 100),

  /** optional — coin regen tick (low-vol "ambient") — throttled */
  coinTick: (v = 1) => play(luckyWheelTickData, 3, 0.25 * v, 120),

  /** player taps a skill slot */
  cardPick: (v = 1) => play(buttonClickData, 3, 0.6 * v),

  /** duplicate pick → stack merge */
  cardMerge: (v = 1) => play(slotReelsReward1Data, 2, 0.8 * v),

  /** 2→3 "three-of-a-kind" merge — a bright RISING chime on top of cardMerge.
   *  Stepping-stone celebration, kept below the stack=4 cap moment. */
  tripleStack: (v = 1) => play(rise06Data, 2, 0.9 * v),

  /** scare beat begins (vignette appears) */
  scare: (v = 1) => play(powerDownData, 2, 0.7 * v),

  /** slot transitions from unaffordable → affordable */
  slotUnlock: (v = 1) => play(rise01Data, 3, 0.5 * v),

  /** generic UI click (onboarding tap, end-card button) */
  click: (v = 1) => play(buttonClickData, 3, 0.5 * v),
};
