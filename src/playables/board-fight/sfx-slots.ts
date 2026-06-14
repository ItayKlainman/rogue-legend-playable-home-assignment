import { play, type PlayOpts } from './sfx';
import slotsTickData from 'assets/Audio/SlotReels_Tick.mp3';
import slotsStopData from 'assets/Audio/SlotReels_Stop.mp3';
import slotsReward1Data from 'assets/Audio/SlotReels_Reward_1.mp3';
import slotsReward2Data from 'assets/Audio/SlotReels_Reward_2.mp3';
import slotsReward3Data from 'assets/Audio/SlotReels_Reward_3.mp3';

export const slotsSfx = {
  tick:    (vol = 1, opts?: PlayOpts) => play(slotsTickData, vol, opts),
  stop:    (vol = 1, opts?: PlayOpts) => play(slotsStopData, vol, opts),
  reward1: (vol = 1, opts?: PlayOpts) => play(slotsReward1Data, vol, opts),
  reward2: (vol = 1, opts?: PlayOpts) => play(slotsReward2Data, vol, opts),
  reward3: (vol = 1, opts?: PlayOpts) => play(slotsReward3Data, vol, opts),
};
