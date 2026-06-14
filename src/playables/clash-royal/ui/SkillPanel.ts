import { Assets, Container, Texture } from 'pixi.js';
import { makeNineSlice } from '@shared/nineSlice';
// The ROW 2 container panel: one large rounded panel with a defined border behind the
// 3 skill slot cards + the coin bar. Built from the real Popup_Box component set
// (Popup_Box_Bg = body, Popup_Box_Border = lighter rim), both 9-sliced so the rounded
// corners + rim never distort. Tinted grey-purple to read as a UI panel (not a popup).
import panelBg from 'assets/UI/PanelBox_Bg.webp';
import panelBorder from 'assets/UI/PanelBox_Border.webp';

const TEX: { bg?: Texture; border?: Texture } = {};

// Unity 9-slice border insets (from components-cli `use`).
const PANEL_BORDER = { left: 65, top: 65, right: 63, bottom: 66 };

/** Large rounded UI panel (body + rim) sized at construction; reposition via `.position`. */
export class SkillPanel extends Container {
  static async preload(): Promise<void> {
    await Promise.all([
      Assets.load<Texture>(panelBg).then((t) => { TEX.bg = t; }),
      Assets.load<Texture>(panelBorder).then((t) => { TEX.border = t; }),
    ]);
  }

  /** @param width/height the panel's outer size in px. Origin = top-left. */
  constructor(width: number, height: number) {
    super();
    if (!TEX.bg || !TEX.border) throw new Error('SkillPanel.preload() must be awaited before constructing SkillPanel');

    // z0: dark grey-purple body.
    const bg = makeNineSlice({ texture: TEX.bg, border: PANEL_BORDER, width, height });
    bg.tint = 0x36303f; // grey-purple body
    this.addChild(bg);

    // z1: lighter rim over the body.
    const border = makeNineSlice({ texture: TEX.border, border: PANEL_BORDER, width, height });
    border.tint = 0x6b6478; // lighter purple-grey rim
    this.addChild(border);
  }
}
