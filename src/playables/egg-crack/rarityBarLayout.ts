export interface SegRect { x: number; y: number; w: number; h: number; }

/** Pure layout: N equal segments across `width` with `gap` between them. */
export function barSegmentRects(width: number, height: number, n: number, gap: number): SegRect[] {
  const segW = (width - gap * (n - 1)) / n;
  const rects: SegRect[] = [];
  for (let i = 0; i < n; i++) rects.push({ x: i * (segW + gap), y: 0, w: segW, h: height });
  return rects;
}
