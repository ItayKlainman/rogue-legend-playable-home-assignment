import { play, type PlayOpts } from './sfx';
import luckyWheelTickData from 'assets/Audio/LuckyWheel_Tick.mp3';

export const luckyWheelSfx = {
  tick: (vol = 1, opts?: PlayOpts) => play(luckyWheelTickData, vol, opts),
};
