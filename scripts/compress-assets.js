const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
const WEBP_QUALITY = 70;

function findImages(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip _originals and _tmp
      if (entry.name.startsWith('_')) continue;
      findImages(full, results);
    } else if (/\.(png|jpe?g)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  const images = findImages(ASSETS_DIR);
  console.log(`Found ${images.length} images to convert\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  let converted = 0;
  let skipped = 0;

  for (const src of images) {
    const rel = path.relative(ASSETS_DIR, src);
    const ext = path.extname(src);
    const dest = src.replace(/\.(png|jpe?g)$/i, '.webp');

    const beforeSize = fs.statSync(src).size;
    totalBefore += beforeSize;

    try {
      await sharp(src)
        .webp({ quality: WEBP_QUALITY })
        .toFile(dest);

      const afterSize = fs.statSync(dest).size;
      totalAfter += afterSize;
      const pct = ((1 - afterSize / beforeSize) * 100).toFixed(1);
      console.log(`✓ ${rel} → .webp  ${(beforeSize/1024).toFixed(0)}KB → ${(afterSize/1024).toFixed(0)}KB  (${pct}% saved)`);
      converted++;
    } catch (err) {
      console.error(`✗ ${rel}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Converted: ${converted}, Skipped: ${skipped}`);
  console.log(`Before: ${(totalBefore / 1024 / 1024).toFixed(2)} MB`);
  console.log(`After:  ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Saved:  ${((totalBefore - totalAfter) / 1024 / 1024).toFixed(2)} MB (${((1 - totalAfter/totalBefore) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
