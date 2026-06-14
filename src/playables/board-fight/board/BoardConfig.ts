/** Per-tile override for where the 3D dice should land on the board.
 *  Short forms:
 *    - `'aboveHero'` : just above the hero's current tile (kept off the boss)
 *    - `'midpoint'`  : midpoint between tile-3-ahead and board center
 *  Object form (combine any of these):
 *    - `{ mode: 'aboveHero' | 'midpoint' }`                 pick a base mode
 *    - `{ x, y }`                                            fixed src-image coords
 *    - `{ ..., offset: { x?, y? } }`                         shift the result in src px
 *  When omitted, the scene auto-picks between aboveHero/midpoint by hero Y. */
export type DiceAnchorMode = 'aboveHero' | 'midpoint';
export type DiceAnchor =
  | DiceAnchorMode
  | {
      mode?: DiceAnchorMode;
      x?: number;
      y?: number;
      offset?: { x?: number; y?: number };
    };

/** A single tile position in the board source image coordinate space */
export interface TileCoord {
  x: number;
  y: number;
  /** Optional per-tile dice-roll anchor used in 3D mode. */
  diceAnchor?: DiceAnchor;
}

/**
 * Configuration for one board variant.
 * Pixel coordinates are in the source image's coordinate space.
 */
export interface BoardConfig {
  /** Webpack-imported base64 data URL for the board image */
  boardImageData: string;

  /** Uniform scale applied to the board Sprite (source image → screen pixels) */
  boardScale: number;

  /**
   * Source-image coordinate to center on screen.
   * Game.ts calculates boardSprite position dynamically as:
   *   x = screenWidth/2  - focalPoint.x * boardScale
   *   y = screenHeight/2 - focalPoint.y * boardScale
   * This keeps the board correctly centered on any screen size.
   */
  focalPoint: TileCoord;

  /** Center of the board diamond in source-image coords, used for camera pull-toward-center */
  boardCenter: TileCoord;

  /**
   * Tile positions in source-image coordinates, clockwise loop order.
   * Index 0 = player starting tile.
   */
  tiles: TileCoord[];

  /** Tile indices that are corner tiles (larger highlight). */
  cornerTiles?: number[];

  /** Movement direction through tile indices: 1 = forward (0→1→2), -1 = backward (0→N-1→N-2). Default: -1 */
  direction?: 1 | -1;

  /** Multiplier for hero size on the board. Default: 1 */
  heroScale?: number;
}

/**
 * Default diamond-path tile positions (1500×1500 source coords).
 * Boards can override with custom tile placements as needed.
 */
export const DEFAULT_TILES: TileCoord[] = [
  // --- Bottom vertex ---
  { x: 775, y: 1175 }, // 0  start (bottom)

  // --- Bottom → Right edge ---
  { x: 868, y: 1138 }, // 1
  { x: 910, y: 1100 }, // 2
  { x: 953, y: 1068 }, // 3
  { x: 998, y: 1035 }, // 4
  { x: 1043, y: 1003 }, // 5
  { x: 1088, y: 970 }, // 6
  { x: 1140, y: 938 }, // 7
  { x: 1190, y: 903 }, // 8
  { x: 1233, y: 868 }, // 9
  { x: 1275, y: 800 }, // 10

  { x: 1233, y: 725 }, // 11
  { x: 1184, y: 698 }, // 12
  { x: 1140, y: 670 }, // 13
  { x: 1098, y: 640 }, // 14
  { x: 1055, y: 600 }, // 15
  { x: 1008, y: 565 }, // 16
  { x: 965, y: 535 },  // 17
  { x: 923, y: 500 },  // 18
  { x: 880, y: 470 },  // 19
  { x: 775, y: 425 },  // 20

  { x: 685, y: 470 },  // 21
  { x: 640, y: 495 },  // 22
  { x: 590, y: 530 },  // 23
  { x: 550, y: 570 },  // 24
  { x: 505, y: 595 },  // 25
  { x: 460, y: 625 },  // 26
  { x: 415, y: 665 },  // 27
  { x: 370, y: 695 },  // 28
  { x: 325, y: 725 },  // 29
  { x: 280, y: 800 },  // 30

  { x: 325, y: 870 },  // 31
  { x: 370, y: 910 },  // 32
  { x: 415, y: 945 },  // 33
  { x: 460, y: 980 },  // 34
  { x: 505, y: 1010 }, // 35
  { x: 545, y: 1045 }, // 36
  { x: 590, y: 1080 }, // 37
  { x: 635, y: 1110 }, // 38
  { x: 680, y: 1150 }, // 39
];

/** Default layout config (everything except the board image). Boards can override individual fields. */
export const DEFAULT_BOARD_LAYOUT: Omit<BoardConfig, 'boardImageData'> = {
  boardScale: 0.90,
  focalPoint: { x: 775, y: 800 },
  boardCenter: { x: 775, y: 800 },
  tiles: DEFAULT_TILES,
  cornerTiles: [0, 10, 20, 30],
};
