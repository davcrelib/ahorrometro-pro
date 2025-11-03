// tools/build-icons.mjs
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import toIco from "png-to-ico";

const SRC = "tools/icon/ahorrometro.png";

async function main() {
  await fs.mkdir("public", { recursive: true });
  await fs.mkdir("  src/app", { recursive: true });

  // PWA
  await sharp(SRC).resize(192, 192).png().toFile("public/icon-192.png");
  await sharp(SRC).resize(512, 512).png().toFile("public/icon-512.png");

  // Apple touch
  await sharp(SRC).resize(180, 180).png().toFile("public/apple-touch-icon.png");

  // Maskable 512 con margen ~15% (512 = 384 + 64*2)
  await sharp(SRC)
    .resize(384, 384)
    .extend({ top: 64, bottom: 64, left: 64, right: 64, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile("public/maskable-512.png");

  // Favicon multi-tamaño
  const ico = await toIco(SRC); // sirve una sola PNG grande
  await fs.writeFile("src/app/favicon.ico", ico);

  console.log("✅ Iconos generados.");
}

main().catch((e) => {
  console.error("❌ Error generando iconos:", e);
  process.exit(1);
});
