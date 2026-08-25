/**
 * Rebuild PWA icons with maskable padding (~80% safe zone).
 * Source: assets/unique-vocal-icon-master.png
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "assets", "unique-vocal-icon-master.png");
const outDir = path.join(root, "public", "icons");
const BG = { r: 10, g: 10, b: 15, alpha: 1 };

async function writePadded(size, padRatio, dest) {
  const inner = Math.round(size * (1 - 2 * padRatio));
  const offset = Math.round((size - inner) / 2);
  const logo = await sharp(src)
    .resize(inner, inner, { fit: "contain", background: BG })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png()
    .toFile(dest);
  console.log("wrote", path.relative(root, dest), `pad=${Math.round(padRatio * 100)}%`);
}

await writePadded(192, 0.12, path.join(outDir, "icon-192.png"));
await writePadded(512, 0.12, path.join(outDir, "icon-512.png"));
await writePadded(512, 0.14, path.join(outDir, "icon-maskable-512.png"));
await writePadded(180, 0.12, path.join(outDir, "apple-touch-icon.png"));
await writePadded(32, 0.1, path.join(outDir, "favicon-32.png"));
