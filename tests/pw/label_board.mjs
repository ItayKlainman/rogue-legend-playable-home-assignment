import sharp from 'sharp';
import fs from 'node:fs';

// DEFAULT_TILES from BoardConfig.ts (source coords in a 1500x1500 space)
const TILES = [
 [775,1175],[868,1138],[910,1100],[953,1068],[998,1035],[1043,1003],[1088,970],[1140,938],[1190,903],[1233,868],[1275,800],
 [1233,725],[1184,698],[1140,670],[1098,640],[1055,600],[1008,565],[965,535],[923,500],[880,470],[775,425],
 [685,470],[640,495],[590,530],[550,570],[505,595],[460,625],[415,665],[370,695],[325,725],[280,800],
 [325,870],[370,910],[415,945],[460,980],[505,1010],[545,1045],[590,1080],[635,1110],[680,1150],
];
const SRC = 'assets/Backgrounds/Board1Asset.webp';
const meta = await sharp(SRC).metadata();
const W = meta.width, H = meta.height;
const sf = W / 1500; // coords are in 1500-space
const labels = TILES.map(([x,y],i)=>{
  const px = Math.round(x*sf), py = Math.round(y*sf);
  const corner = [0,10,20,30].includes(i);
  return `<circle cx="${px}" cy="${py}" r="20" fill="${corner?'#e23':'#0008'}" stroke="#fff" stroke-width="2"/>`+
         `<text x="${px}" y="${py+7}" font-size="22" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${i}</text>`;
}).join('');
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`;
await sharp(SRC).composite([{ input: Buffer.from(svg), top:0, left:0 }]).png().toFile('/tmp/board1_labeled.png');
console.log(`board ${W}x${H}, sf=${sf.toFixed(3)}, wrote /tmp/board1_labeled.png`);
