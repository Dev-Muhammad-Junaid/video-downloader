// Runs automatically after `npm run build` (npm's post<script> convention).
//
// Next's `output: "standalone"` bundle (.next/standalone/server.js + a pruned
// node_modules) does NOT include `public/` or `.next/static` — the docs
// require copying those in manually for anywhere you self-host it, which is
// exactly what packaging into Electron is. Also copies the Prisma schema,
// since the standalone server needs it at runtime to resolve the DB adapter.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
    console.error("[copy-standalone-assets] .next/standalone not found — did `next build` run with output: \"standalone\"?");
    process.exit(1);
}

const copies = [
    [path.join(root, "public"), path.join(standaloneDir, "public")],
    [path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static")],
    [path.join(root, "prisma", "schema.prisma"), path.join(standaloneDir, "prisma", "schema.prisma")],
];

for (const [from, to] of copies) {
    if (!fs.existsSync(from)) {
        console.warn(`[copy-standalone-assets] skipping missing source: ${from}`);
        continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    console.log(`[copy-standalone-assets] copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}
