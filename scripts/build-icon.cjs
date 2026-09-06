// Regenerates build/icon.icns from build/icon-source.svg.
// Run manually after editing the source SVG: `node scripts/build-icon.cjs`
// (requires macOS — uses the built-in `iconutil` to produce the .icns).
const sharp = require("sharp");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "build", "icon-source.svg");
const iconsetDir = path.join(root, "build", "AppIcon.iconset");
const icnsPath = path.join(root, "build", "icon.icns");

const sizes = [
    ["icon_16x16.png", 16], ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32], ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128], ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256], ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512], ["icon_512x512@2x.png", 1024],
];

async function main() {
    if (process.platform !== "darwin") {
        console.error("build-icon.cjs requires macOS (uses iconutil).");
        process.exit(1);
    }
    fs.rmSync(iconsetDir, { recursive: true, force: true });
    fs.mkdirSync(iconsetDir, { recursive: true });

    await Promise.all(
        sizes.map(([name, size]) =>
            sharp(svgPath).resize(size, size).png().toFile(path.join(iconsetDir, name))
        )
    );

    execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);
    fs.rmSync(iconsetDir, { recursive: true, force: true });
    console.log(`[build-icon] wrote ${path.relative(root, icnsPath)}`);
}

main();
