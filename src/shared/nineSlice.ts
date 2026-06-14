import { NineSliceSprite, Texture } from 'pixi.js';

/**
 * Thin wrapper around PIXI v8 NineSliceSprite. Converts Unity's border order
 * `{left, bottom, right, top}` to PIXI's (leftWidth, topHeight, rightWidth, bottomHeight)
 * so the per-tile spec can quote Unity values verbatim.
 */
export interface UnityBorder {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export interface NineSliceOptions {
  texture: Texture;
  border: UnityBorder;
  width: number;
  height: number;
}

export function makeNineSlice(opts: NineSliceOptions): NineSliceSprite {
  return new NineSliceSprite({
    texture: opts.texture,
    leftWidth: opts.border.left,
    topHeight: opts.border.top,
    rightWidth: opts.border.right,
    bottomHeight: opts.border.bottom,
    width: opts.width,
    height: opts.height,
  });
}
