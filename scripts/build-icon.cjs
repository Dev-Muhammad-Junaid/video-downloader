// Regenerates every derived icon asset from build/icon-source.svg, which is the
// single source of truth for the app mark. Run after editing that SVG:
//   node scripts/build-icon.cjs
// (requires macOS — uses the built-in `iconutil` to produce the .icns).
//
// Deriving all of them here matters: these live in three different places for
// three different consumers, and hand-updating them drifts. In particular
// src/app/icon.png is a Next.js metadata file, which means Next serves it at
// /icon.png and it SHADOWS public/icon.png — so a stale one silently wins over
// a freshly generated public/ copy and the app keeps showing the old mark.
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

    // Everything else that renders the mark, from the same source.
    const derived = [
        // Next.js metadata icon: the favicon, and what /icon.png resolves to
        // for the sidebar/toolbar <Image>.
        [path.join(root, "src", "app", "icon.png"), 512],
        // Chrome/Edge extension action icon.
        [path.join(root, "extension", "icons", "icon128.png"), 128],
        // Imported by the UI. This is a *static import* rather than a /icon.png
        // URL on purpose: Next fingerprints statically imported images, so the
        // mark's URL changes whenever its bytes do. Referencing /icon.png went
        // through the image optimizer, which serves an immutable long-lived
        // cache header on a URL that stays identical across releases — so an
        // updated icon kept rendering from the old cached response.
        [path.join(root, "src", "assets", "app-icon.png"), 512],
    ];
    for (const [outPath, size] of derived) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        await sharp(svgPath).resize(size, size).png().toFile(outPath);
        console.log(`[build-icon] wrote ${path.relative(root, outPath)}`);
    }
}

main();
