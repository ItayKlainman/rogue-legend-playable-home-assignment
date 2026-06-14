import boardImageData from 'assets/Backgrounds/Board3Asset.webp';
import type { BoardConfig } from './BoardConfig';
import { DEFAULT_TILES, DEFAULT_BOARD_LAYOUT } from './BoardConfig';

const tiles = [...DEFAULT_TILES]; // Board 3 tile placements (customize as needed)

export const board3Config: BoardConfig = {
  ...DEFAULT_BOARD_LAYOUT,
  boardImageData,
  tiles,
};
