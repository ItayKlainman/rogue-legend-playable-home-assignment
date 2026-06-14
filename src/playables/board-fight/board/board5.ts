import boardImageData from 'assets/Backgrounds/Board5Asset.webp';
import type { BoardConfig } from './BoardConfig';
import { DEFAULT_TILES, DEFAULT_BOARD_LAYOUT } from './BoardConfig';

const tiles: TileCoord[] = [
  { x: 795, y: 1978 }, // 0 // corner
  { x: 745, y: 1901 }, // 1
  { x: 695, y: 1864 }, // 2
  { x: 646, y: 1829 }, // 3
  { x: 595, y: 1791 }, // 4
  { x: 652, y: 1751 }, // 5
  { x: 704, y: 1710 }, // 6
  { x: 751, y: 1677 }, // 7
  { x: 798, y: 1640 }, // 8
  { x: 851, y: 1602 }, // 9
  { x: 800, y: 1562 }, // 10
  { x: 746, y: 1530 }, // 11
  { x: 698, y: 1492 }, // 12
  { x: 652, y: 1428 }, // 13 // corner
  { x: 709, y: 1333 }, // 14
  { x: 755, y: 1300 }, // 15
  { x: 800, y: 1265 }, // 16
  { x: 853, y: 1227 }, // 17
  { x: 802, y: 1189 }, // 18
  { x: 749, y: 1151 }, // 19
  { x: 695, y: 1109 }, // 20
  { x: 647, y: 1078 }, // 21
  { x: 598, y: 1036 }, // 22
  { x: 652, y: 1000 }, // 23
  { x: 700, y: 963 }, // 24
  { x: 753, y: 925 }, // 25
  { x: 798, y: 859 }, // 26 // corner
  { x: 742, y: 771 }, // 27
  { x: 697, y: 733 }, // 28
  { x: 642, y: 694 }, // 29
  { x: 597, y: 660 }, // 30
  { x: 650, y: 618 }, // 31
  { x: 700, y: 580 }, // 32
  { x: 753, y: 544 }, // 33
  { x: 802, y: 509 }, // 34
  { x: 853, y: 471 }, // 35
  { x: 795, y: 430 }, // 36
  { x: 743, y: 393 }, // 37
  { x: 701, y: 358 }, // 38
  { x: 649, y: 308 }, // 39 // corner
  { x: 712, y: 198 }, // 40
  { x: 750, y: 168 }, // 41
  { x: 803, y: 131 }, // 42
  { x: 851, y: 93 }, // 43
  { x: 801, y: 50 }, // 44
];

const cornerTiles = [0, 13, 26, 39];
export const board5Config: BoardConfig = {
  ...DEFAULT_BOARD_LAYOUT,
  boardImageData,
  tiles,
  cornerTiles,
  direction: 1,
  boardScale: 0.8,
  focalPoint: { x: 775, y: 1000 },
  boardCenter: { x: 775, y: 1000 },
};
