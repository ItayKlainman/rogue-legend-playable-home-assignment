// Pure layout/selection helpers for the pick-pet screen. NO PIXI/asset imports,
// so this is unit-testable under `node --test` (type-stripped TS).

export interface TilePos { x: number; y: number; }

const MAX_GAP = 240;
const TILE_Y_FRAC = 0.55;

/** Horizontal spacing between tile centres. Wider than a tight grid so the two
 *  tiles read as clearly separated. */
function gapFor(width: number, count: number): number {
  return Math.min((width / (count + 1)) * 1.52, MAX_GAP);
}

/** Square tile side length. ~0.81 of the gap keeps a clear space between the two
 *  tiles while making the frame big. */
export function pickPetTileSize(width: number, count: number): number {
  return gapFor(width, count) * 0.81;
}

/** Centre positions for `count` tiles, evenly spaced and centred horizontally. */
export function pickPetTilePositions(count: number, width: number, height: number): TilePos[] {
  const gap = gapFor(width, count);
  const y = height * TILE_Y_FRAC;
  const out: TilePos[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x: width / 2 + (i - (count - 1) / 2) * gap, y });
  }
  return out;
}

/** Indices to dim on selection — everything except the chosen tile. */
export function dimTargets(chosenIndex: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (i !== chosenIndex) out.push(i);
  return out;
}
