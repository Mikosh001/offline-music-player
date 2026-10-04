const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
(async () => {
  const root = path.resolve(__dirname, "..");
  const svg = await fs.readFile(path.join(root, "icon.svg"));
  for (const size of [180, 192, 512])
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(root, `icon-${size}.png`));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
