// One-shot: turn the 4 nano-banana crack frames (1024px RGB w/ baked checkerboard
// bg) into aligned, transparent, downscaled webp ready for the playable.
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets/egg-summon/egg/_cracks_src');
const OUT_DIR = path.join(ROOT, 'assets/egg-crack/egg');
// Stage 0 = pristine closed egg (the game icon, upscaled to 1024 to match the
// nano-banana crack frames); stages 1-4 = the generated crack frames.
// Order = crack stages 0..5: pristine, hairline, branching, dense web, full
// crack network (transition), full shatter + light burst.
const SRC = ['Egg_Stage0.png', 'Egg_Stage1.png', 'Egg_Stage2.png', 'Egg_Stage3.png', 'Egg_Stage3b.png', 'Egg_Stage4.png'];
const OUT_SIZE = 512;       // final square canvas
const QUALITY = 80;

// A pixel is background if it's already transparent (the pristine icon's real
// alpha) OR a neutral-gray checkerboard square (the nano-banana "fake" bg).
const isBgPx = (d, i) => {
  if (d[i + 3] === 0) return true;
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return Math.abs(r - g) <= 10 && Math.abs(g - b) <= 10 && Math.abs(r - b) <= 10 && r >= 150;
};

// Border flood-fill: return RGBA buffer with bg pixels alpha=0, plus the
// non-transparent bounding box.
function removeBg(data, W, H) {
  const ch = 4;
  const bg = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push([x, 0], [x, H - 1]); }
  for (let y = 0; y < H; y++) { stack.push([0, y], [W - 1, y]); }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x;
    if (bg[p]) continue;
    if (!isBgPx(data, p * ch)) continue;
    bg[p] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (bg[p]) { data[p * ch + 3] = 0; continue; }
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Pass 1: bg-remove each, collect the UNION bbox so all frames share a canvas.
  const frames = [];
  let uMinX = Infinity, uMinY = Infinity, uMaxX = 0, uMaxY = 0;
  for (const name of SRC) {
    const { data, info } = await sharp(path.join(SRC_DIR, name))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const box = removeBg(data, info.width, info.height);
    frames.push({ name, data, W: info.width, H: info.height, box });
    uMinX = Math.min(uMinX, box.minX); uMinY = Math.min(uMinY, box.minY);
    uMaxX = Math.max(uMaxX, box.maxX); uMaxY = Math.max(uMaxY, box.maxY);
  }
  const cw = uMaxX - uMinX + 1, chh = uMaxY - uMinY + 1;
  // Pass 2: crop each to the shared bbox, fit into a square, downscale, webp.
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const png = await sharp(Buffer.from(f.data), { raw: { width: f.W, height: f.H, channels: 4 } })
      .extract({ left: uMinX, top: uMinY, width: cw, height: chh })
      .resize(OUT_SIZE, OUT_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: QUALITY })
      .toBuffer();
    const out = path.join(OUT_DIR, `crack_${i}.webp`);   // 0-based: crack_0 = pristine
    fs.writeFileSync(out, png);
    console.log(`crack_${i}.webp  shared-bbox ${cw}x${chh} -> ${OUT_SIZE}x${OUT_SIZE}`);
  }
}
main();
