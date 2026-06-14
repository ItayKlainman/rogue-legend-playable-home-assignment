import boardImageData from 'assets/Backgrounds/Board2Asset.webp';
import type { BoardConfig } from './BoardConfig';
import { DEFAULT_TILES, DEFAULT_BOARD_LAYOUT } from './BoardConfig';

const tiles = [...DEFAULT_TILES]; // Board 2 tile placements (customize as needed)

export const board2Config: BoardConfig = {
  ...DEFAULT_BOARD_LAYOUT,
  boardImageData,
  tiles,
};
