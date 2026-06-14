import { Container, Sprite, Text, TextStyle, Texture } from 'pixi.js';

/**
 * Inline icon-text widget. PIXI's Text does NOT parse Unity's TMP `<sprite name="...">`
 * rich-text tags, so we DIY: parse a string with `<icon:KEY>` tokens, build a row of
 * Text + Sprite children laid out in a Container.
 *
 * Token grammar:
 *   "any text"                → single Text child
 *   "<icon:coin> +250"        → Sprite(coin), Text(" +250")
 *   "HP <icon:heart> +30"     → Text("HP "), Sprite(heart), Text(" +30")
 *
 * The container's pivot is on the left baseline (vertically centered to text).
 */

export interface IconMap { [key: string]: Texture; }

export interface IconTextOptions {
  text: string;
  icons: IconMap;
  style: TextStyle | Partial<TextStyle> | { fontSize?: number; fill?: number | string; fontFamily?: string; fontWeight?: string };
  iconSize?: number;     // pixel size of inline icon sprites (default = fontSize * 1.0)
  iconYOffset?: number;  // vertical fudge to align icon baseline to text (default 0)
  spacing?: number;      // pixels between consecutive runs (default 2)
}

const TOKEN_RE = /<icon:([^>]+)>/g;

export class IconText extends Container {
  private parts: Array<Text | Sprite> = [];

  constructor(opts: IconTextOptions) {
    super();
    this.build(opts);
  }

  private build(opts: IconTextOptions): void {
    const style = opts.style as Partial<TextStyle>;
    const fontSize = (style.fontSize as number) ?? 24;
    const iconSize = opts.iconSize ?? fontSize;
    const iconYOffset = opts.iconYOffset ?? 0;
    const spacing = opts.spacing ?? 2;

    const segments: Array<{ kind: 'text'; value: string } | { kind: 'icon'; key: string }> = [];
    let lastIndex = 0;
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(opts.text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ kind: 'text', value: opts.text.slice(lastIndex, match.index) });
      }
      segments.push({ kind: 'icon', key: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < opts.text.length) {
      segments.push({ kind: 'text', value: opts.text.slice(lastIndex) });
    }
    if (segments.length === 0) {
      // empty input; nothing to render
      return;
    }

    let cursorX = 0;
    for (const seg of segments) {
      if (seg.kind === 'text') {
        if (seg.value.length === 0) continue;
        const t = new Text({ text: seg.value, style: opts.style as TextStyle });
        t.anchor.set(0, 0.5);
        t.x = cursorX;
        t.y = 0;
        this.addChild(t);
        this.parts.push(t);
        cursorX += t.width + spacing;
      } else {
        const tex = opts.icons[seg.key];
        if (!tex) {
          if (typeof console !== 'undefined') console.warn(`[IconText] missing icon: ${seg.key}`);
          continue;
        }
        const s = new Sprite(tex);
        s.anchor.set(0, 0.5);
        s.width = iconSize;
        s.height = iconSize;
        s.x = cursorX;
        s.y = iconYOffset;
        this.addChild(s);
        this.parts.push(s);
        cursorX += iconSize + spacing;
      }
    }
  }

  /** Total width of the laid-out content. */
  get contentWidth(): number {
    return this.children.reduce((max, c) => {
      const right = c.x + ((c as Sprite).width ?? 0);
      return right > max ? right : max;
    }, 0);
  }
}
