// One-off maintenance script: pads every product photo onto a square
// canvas (matching the largest side) instead of leaving it whatever
// aspect ratio it was shot at. The product grid displays every image in
// a fixed square box — before this, non-square photos were either
// cropped (losing part of the piece, e.g. a second chain or pendant) or
// showed visible letterbox bars. Padding the actual files means the box
// can just show the image at 1:1 with no cropping and no visible seam,
// since the pad color is sampled from each photo's own edge pixels.
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const products = JSON.parse(fs.readFileSync(path.join(root, 'generated_products_encoded.json'), 'utf8'));
const imagePaths = new Set();
for (const p of products) {
  if (p.image) imagePaths.add(p.image);
  if (Array.isArray(p.images)) p.images.forEach(i => imagePaths.add(i));
}

// Reads the full pixel buffer once (repeatedly re-extracting regions from
// the same source via separate calls proved flaky for JPEGs on Windows —
// libvips would intermittently fail to re-open the file) and averages the
// outer border in plain JS instead.
async function edgeAverageColor(filePath, meta) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const stripSize = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  let r = 0, g = 0, b = 0, n = 0;
  const add = (x, y) => {
    const i = (y * width + x) * channels;
    r += data[i]; g += data[i + 1]; b += data[i + 2];
    n++;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < stripSize || x >= width - stripSize || y < stripSize || y >= height - stripSize) {
        add(x, y);
      }
    }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

async function padOne(relPath) {
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) {
    console.warn('MISSING', relPath);
    return;
  }
  const meta = await sharp(filePath).metadata();
  const ratio = meta.width / meta.height;
  if (ratio > 0.98 && ratio < 1.02) {
    console.log('skip (already square)', relPath, `${meta.width}x${meta.height}`);
    return;
  }

  const size = Math.max(meta.width, meta.height);
  const bg = await edgeAverageColor(filePath, meta);

  let pipeline = sharp(filePath).resize(size, size, { fit: 'contain', background: { ...bg, alpha: 1 } });
  pipeline = meta.format === 'png' ? pipeline.png({ quality: 90 }) : pipeline.jpeg({ quality: 90 });
  const buffer = await pipeline.toBuffer();

  // Writing straight back to filePath can fail on Windows: sharp's JPEG
  // decoder holds the source file open longer than PNG's does, and
  // Windows won't let us open the same path for writing while that read
  // handle is still live. Writing to a temp path and renaming over sidesteps it.
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
  console.log('padded', relPath, `${meta.width}x${meta.height} -> ${size}x${size}`, bg);
}

(async () => {
  for (const relPath of imagePaths) {
    try {
      await padOne(relPath);
    } catch (err) {
      console.error('FAILED', relPath, err.message);
    }
  }
})();
