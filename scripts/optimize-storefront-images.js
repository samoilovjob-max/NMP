#!/usr/bin/env node
/**
 * Batch-convert storefront PNG/JPEG in images/ to WebP (max edge 1600, q=82).
 * Skips favicon/apple-touch-icon and Cyrillic duplicate filenames.
 * Usage: node scripts/optimize-storefront-images.js [--force]
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..", "images");
const MAX_EDGE = 1600;
const QUALITY = 82;
const SKIP = new Set(["favicon.png", "apple-touch-icon.png"]);
const force = process.argv.includes("--force");

async function convertFile(srcPath) {
  const base = path.basename(srcPath, path.extname(srcPath));
  const extIn = path.extname(srcPath).toLowerCase();
  const outPath = path.join(path.dirname(srcPath), `${base}.webp`);

  if (!force && fs.existsSync(outPath)) {
    const outStat = fs.statSync(outPath);
    const inStat = fs.statSync(srcPath);
    if (outStat.mtimeMs >= inStat.mtimeMs) {
      return null;
    }
  }

  const before = fs.statSync(srcPath).size;
  const buf = await sharp(srcPath)
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: QUALITY })
    .toBuffer();

  fs.writeFileSync(outPath, buf);
  return {
    src: path.relative(ROOT, srcPath),
    out: path.basename(outPath),
    before,
    after: buf.length
  };
}

(async () => {
  const files = fs
    .readdirSync(ROOT)
    .filter((name) => {
      if (SKIP.has(name)) return false;
      if (/[^\x00-\x7F]/.test(name)) return false;
      return /\.(png|jpe?g)$/i.test(name);
    })
    .map((name) => path.join(ROOT, name));

  let saved = 0;
  for (const file of files.sort()) {
    try {
      const row = await convertFile(file);
      if (!row) continue;
      saved += row.before - row.after;
      console.log(
        `${row.src} → ${row.out}: ${(row.before / 1024).toFixed(0)} KB → ${(row.after / 1024).toFixed(0)} KB`
      );
    } catch (err) {
      console.error(`FAIL ${path.basename(file)}: ${err.message}`);
    }
  }
  console.log(`Done. Saved ~${(saved / 1024 / 1024).toFixed(1)} MB where converted.`);
})();
