const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/** Longest edge for storefront photos (catalog / PDP / CMS uploads). */
const MAX_EDGE = 1600;
/** Target JPEG/WebP quality. */
const QUALITY = 82;

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/**
 * Optimize an uploaded image for the storefront:
 * - auto-orient from EXIF
 * - resize so the longest edge ≤ MAX_EDGE
 * - strip metadata
 * - re-encode (PNG keeps alpha as PNG; otherwise WebP; GIF left as-is if animated)
 *
 * @param {string} absolutePath
 * @returns {Promise<{ path: string, filename: string, url: string, width: number, height: number, bytesBefore: number, bytesAfter: number, format: string }>}
 */
async function optimizeUploadedImage(absolutePath) {
  const bytesBefore = fs.statSync(absolutePath).size;
  const dir = path.dirname(absolutePath);
  const base = path.basename(absolutePath, path.extname(absolutePath));
  const extIn = path.extname(absolutePath).toLowerCase();

  if (!ALLOWED_EXT.has(extIn)) {
    return {
      path: absolutePath,
      filename: path.basename(absolutePath),
      url: `images/uploads/${path.basename(absolutePath)}`,
      width: 0,
      height: 0,
      bytesBefore,
      bytesAfter: bytesBefore,
      format: extIn.replace(".", "") || "unknown"
    };
  }

  const image = sharp(absolutePath, { animated: false, failOn: "none" }).rotate();
  const meta = await image.metadata();

  // Leave multi-page/animated GIF alone (sharp stills them by default).
  if (extIn === ".gif" && (meta.pages || 0) > 1) {
    return {
      path: absolutePath,
      filename: path.basename(absolutePath),
      url: `images/uploads/${path.basename(absolutePath)}`,
      width: meta.width || 0,
      height: meta.height || 0,
      bytesBefore,
      bytesAfter: bytesBefore,
      format: "gif"
    };
  }

  const hasAlpha = Boolean(meta.hasAlpha);
  const pipeline = image.resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true
  });

  let outExt;
  let outBuffer;
  if (hasAlpha && (extIn === ".png" || meta.format === "png")) {
    outExt = ".png";
    outBuffer = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
  } else if (extIn === ".png" && !hasAlpha) {
    outExt = ".webp";
    outBuffer = await pipeline.webp({ quality: QUALITY }).toBuffer();
  } else if (extIn === ".webp") {
    outExt = ".webp";
    outBuffer = await pipeline.webp({ quality: QUALITY }).toBuffer();
  } else {
    // jpeg / jpg / gif still / unknown → webp for weight
    outExt = ".webp";
    outBuffer = await pipeline.webp({ quality: QUALITY }).toBuffer();
  }

  const outName = `${base}${outExt}`;
  const outPath = path.join(dir, outName);
  fs.writeFileSync(outPath, outBuffer);

  if (outPath !== absolutePath && fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
    } catch {
      /* keep original if unlink fails */
    }
  }

  const outMeta = await sharp(outBuffer).metadata();
  return {
    path: outPath,
    filename: outName,
    url: `images/uploads/${outName}`,
    width: outMeta.width || 0,
    height: outMeta.height || 0,
    bytesBefore,
    bytesAfter: outBuffer.length,
    format: outExt.replace(".", "")
  };
}

module.exports = {
  optimizeUploadedImage,
  MAX_EDGE,
  QUALITY
};
