const { test } = require('node:test');
const assert = require('node:assert/strict');
const { unityBorderToObj } = require('./meta');

// Mirror of src/shared/nineSlice.ts makeNineSlice's border mapping (keep in sync).
function pixiEdges(border) {
  return { leftWidth: border.left, topHeight: border.top, rightWidth: border.right, bottomHeight: border.bottom };
}

test('Unity spriteBorder {x,y,z,w} round-trips to PIXI edge widths', () => {
  const unity = { x: 34, y: 53, z: 30, w: 36 }; // x=left,y=bottom,z=right,w=top
  const border = unityBorderToObj(unity);
  assert.deepEqual(border, { left: 34, bottom: 53, right: 30, top: 36 });
  assert.deepEqual(pixiEdges(border), { leftWidth: 34, topHeight: 36, rightWidth: 30, bottomHeight: 53 });
});
