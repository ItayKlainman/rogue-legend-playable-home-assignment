import boardImageData from 'assets/Backgrounds/Board7Asset.webp';
import type { BoardConfig } from './BoardConfig';
import { DEFAULT_TILES, DEFAULT_BOARD_LAYOUT } from './BoardConfig';

const tiles: TileCoord[] = [
  { x: 745, y: 2036 }, // 0 // corner
  { x: 696, y: 1969 }, // 1
  { x: 654, y: 1936 }, // 2
  { x: 612, y: 1906 }, // 3
  { x: 571, y: 1871 }, // 4
  { x: 613, y: 1840 }, // 5
  { x: 656, y: 1814 }, // 6
  { x: 700, y: 1782 }, // 7
  { x: 745, y: 1744 }, // 8
  { x: 788, y: 1710 }, // 9
  { x: 740, y: 1678 }, // 10
  { x: 696, y: 1644 }, // 11
  { x: 658, y: 1604 }, // 12
  { x: 607, y: 1560 }, // 13
  { x: 657, y: 1480 }, // 14
  { x: 701, y: 1450 }, // 15
  { x: 743, y: 1413 }, // 16
  { x: 781, y: 1388 }, // 17
  { x: 744, y: 1352 }, // 18
  { x: 699, y: 1317 }, // 19
  { x: 654, y: 1284 }, // 20
  { x: 608, y: 1254 }, // 21
  { x: 571, y: 1224 }, // 22
  { x: 612, y: 1190 }, // 23
  { x: 659, y: 1160 }, // 24
  { x: 699, y: 1124 }, // 25
  { x: 737, y: 1064 }, // 26
  { x: 697, y: 993 }, // 27
  { x: 655, y: 962 }, // 28
  { x: 609, y: 928 }, // 29
  { x: 568, y: 902 }, // 30
  { x: 613, y: 856 }, // 31
  { x: 657, y: 834 }, // 32
  { x: 700, y: 805 }, // 33
  { x: 746, y: 769 }, // 34
  { x: 787, y: 736 }, // 35
  { x: 739, y: 700 }, // 36
  { x: 705, y: 666 }, // 37
  { x: 653, y: 634 }, // 38
  { x: 618, y: 580 }, // 39
  { x: 663, y: 506 }, // 40
  { x: 699, y: 475 }, // 41
  { x: 746, y: 446 }, // 42
  { x: 786, y: 412 }, // 43
  { x: 741, y: 376 }, // 44
  { x: 698, y: 349 }, // 45
  { x: 653, y: 318 }, // 46
  { x: 611, y: 285 }, // 47
  { x: 571, y: 246 }, // 48
  { x: 613, y: 216 }, // 49
  { x: 655, y: 184 }, // 50
  { x: 699, y: 150 }, // 51
  { x: 745, y: 91 }, // 52
];

const cornerTiles = [0, 13, 26];

export const board7Config: BoardConfig = {
  ...DEFAULT_BOARD_LAYOUT,
  boardImageData,
  tiles,
  cornerTiles,
  direction: 1,
  boardScale: 0.9,
  focalPoint: { x: 734, y: 1188 },
  boardCenter: { x: 732, y: 1190 },
};
