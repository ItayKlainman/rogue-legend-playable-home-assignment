import boardImageData from 'assets/Backgrounds/Board3AssetNoStatue.webp';
import type { BoardConfig } from './BoardConfig';
import { DEFAULT_TILES, DEFAULT_BOARD_LAYOUT } from './BoardConfig';

const tiles = [...DEFAULT_TILES];

export const board3NoStatueConfig: BoardConfig = {
  ...DEFAULT_BOARD_LAYOUT,
  boardImageData,
  tiles,
};
