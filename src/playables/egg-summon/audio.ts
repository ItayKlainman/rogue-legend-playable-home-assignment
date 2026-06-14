// Egg-summon audio — reuses board-fight's WebAudio engine (sfx.ts: one decode +
// AudioBufferSourceNode per play, first-gesture gated). All clips are the REAL
// PocketRoll game audio (Pets/SFX_Crack, Pet_Summon_End, Stage_1 Level1 board +
// boss themes, Chest_Open, Reward_Received), re-encoded to compressed mp3.
import { play, setMusic, setMusicVolume, pauseMusic, resumeMusic } from '../board-fight/sfx';
import boardThemeData from 'assets/Audio/Level1_Compressed_Theme.mp3';   // Stage 1 board theme (board scene)
import bossThemeData from 'assets/Audio/Level1_Boss_Theme.mp3';          // Stage 1 boss theme (fight scene)
import crackData from 'assets/Audio/SFX_Crack.mp3';                      // egg shell crack
import summonEndData from 'assets/Audio/Pet_Summon_End.mp3';             // pet-reveal sting
import chestOpenData from 'assets/Audio/Chest_Open.mp3';                 // reward chest opens
import rewardData from 'assets/Audio/Reward_Received.mp3';               // coins/reward collected
import buttonClickData from 'assets/Audio/ButtonClick.mp3';             // UI button tap
import powerUpData from 'assets/Audio/Power_Up.mp3';                    // "collected!" confirm

export { setMusicVolume, pauseMusic, resumeMusic };

/** Switch looping BGM. setMusic() alone won't replace a track that's already
 *  playing, so stop the current one first. */
export function playBoardMusic(volume: number): void { pauseMusic(); setMusic(boardThemeData, volume); }
export function playFightMusic(volume: number): void { pauseMusic(); setMusic(bossThemeData, volume); }

// One-shots (pitch escalates the crack per shake bump).
export const eggCrack = (vol = 1, playbackRate = 1) => play(crackData, vol, { playbackRate });
export const summonReveal = (vol = 1) => play(summonEndData, vol);
export const chestOpen = (vol = 1) => play(chestOpenData, vol);
export const rewardReceived = (vol = 1) => play(rewardData, vol);
export const buttonTap = (vol = 1) => play(buttonClickData, vol);
export const collect = (vol = 1) => play(powerUpData, vol);
