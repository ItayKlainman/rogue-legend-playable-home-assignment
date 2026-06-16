import { sdk } from '@smoud/playable-sdk';

import swordHitData from 'assets/Audio/Sword_Hit.mp3';
import deathData from 'assets/Audio/Death.mp3';
import damageData from 'assets/Audio/Damage.mp3';
import levelUpData from 'assets/Audio/Level_Up.mp3';
import buttonClickData from 'assets/Audio/ButtonClick.mp3';
import chargeData from 'assets/Audio/Charge.mp3';
import experienceBarData from 'assets/Audio/Experience_Bar.mp3';
import powerUpData from 'assets/Audio/Power_Up.mp3';
import winData from 'assets/Audio/Reward_Received.mp3';
import gameplayThemeData from 'assets/Audio/Level1_Compressed_Theme.mp3';
import bossThemeData from 'assets/Audio/Level1_Boss_Theme.mp3';

let userHasInteracted = false;
let currentMusic: HTMLAudioElement | null = null;
const onFirstInteraction = () => {
  userHasInteracted = true;
  // Browsers block autoplay until a gesture — start the (already-selected) track now.
  if (currentMusic && currentMusic.paused) {
    currentMusic.play().catch(() => {});
  }
  document.removeEventListener('pointerdown', onFirstInteraction, true);
  document.removeEventListener('touchstart', onFirstInteraction, true);
  document.removeEventListener('click', onFirstInteraction, true);
  document.removeEventListener('keydown', onFirstInteraction, true);
};
document.addEventListener('pointerdown', onFirstInteraction, true);
document.addEventListener('touchstart', onFirstInteraction, true);
document.addEventListener('click', onFirstInteraction, true);
document.addEventListener('keydown', onFirstInteraction, true);

const pools = new Map<string, HTMLAudioElement[]>();

function getPool(dataUrl: string, size: number): HTMLAudioElement[] {
  let pool = pools.get(dataUrl);

  if (!pool) {
    pool = [];

    for (let i = 0; i < size; i++) {
      pool.push(new Audio(dataUrl));
    }

    pools.set(dataUrl, pool);
  }

  return pool;
}

function playFromPool(pool: HTMLAudioElement[], volume: number): void {
  let audio = pool.find(a => a.paused || a.ended);

  if (!audio) {
    audio = pool[0];
  }

  audio.currentTime = 0;
  audio.volume = volume;
  audio.play().catch((e) => { if (__DEV__) console.warn('[sfx] play failed', e); });
}

function play(dataUrl: string, poolSize: number, volume: number): void {
  if (!userHasInteracted) {
    return;
  }

  const base = sdk.volume > 0 ? sdk.volume : (__DEV__ ? 1 : 0);

  if (base <= 0) {
    return;
  }

  const pool = getPool(dataUrl, poolSize);
  playFromPool(pool, base * volume);
}

// ── Looping background music (one persistent track, crossfaded on switch) ──────
function musicBase(): number {
  return sdk.volume > 0 ? sdk.volume : (__DEV__ ? 0.6 : 0);
}

function fadeOutAndStop(audio: HTMLAudioElement, durationMs: number): void {
  const startVol = audio.volume;
  let t = 0;
  const iv = setInterval(() => {
    t += 50;
    audio.volume = Math.max(0, startVol * (1 - t / durationMs));
    if (t >= durationMs) {
      clearInterval(iv);
      audio.pause();
    }
  }, 50);
}

function startTrack(dataUrl: string, vol: number): void {
  if (currentMusic) {
    fadeOutAndStop(currentMusic, 400);
  }

  const audio = new Audio(dataUrl);
  audio.loop = true;
  audio.volume = musicBase() * vol;
  currentMusic = audio;

  if (userHasInteracted) {
    audio.play().catch(() => {}); // else: kicked off by onFirstInteraction
  }
}

export const music = {
  gameplay: () => startTrack(gameplayThemeData, 0.4),
  boss: () => startTrack(bossThemeData, 0.5),
  stop: () => { if (currentMusic) { currentMusic.pause(); currentMusic = null; } },
};

export const sfx = {
  arrowHit: (vol = 0.4) => play(swordHitData, 8, vol),
  enemyDeath: (vol = 1) => play(deathData, 4, vol),
  heroDamage: (vol = 1) => play(damageData, 4, vol),
  levelUp: (vol = 1) => play(levelUpData, 2, vol),
  powerUp: (vol = 0.8) => play(powerUpData, 2, vol),
  win: (vol = 1) => play(winData, 2, vol),
  buttonClick: (vol = 0.6) => play(buttonClickData, 4, vol),
  chainLightning: (vol = 0.5) => play(chargeData, 6, vol),
  xpCollect: (vol = 0.3) => play(experienceBarData, 8, vol),
};
