// Copies the (Electron-ABI-rebuilt) top-level better-sqlite3 native binary
// into the standalone bundle, overwriting the plain-Node-ABI copy Next placed
// there at build time.
//
// Why this exists: `electron-rebuild` needs binding.gyp + the C++ source to
// recompile a native module, but Next's `output: "standalone"` file tracer
// only copies the *runtime* files a module needs (the compiled .node binary
// + JS glue) — not build-time-only files. So `.next/standalone/node_modules
// /better-sqlite3` has no binding.gyp and can't be rebuilt in place; instead
// we rebuild the full top-level package (which still has its source) and
// copy just the compiled output across.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const from = path.join(root, "node_modules", "better-sqlite3", "build");
const to = path.join(root, ".next", "standalone", "node_modules", "better-sqlite3", "build");

if (!fs.existsSync(from)) {
    console.error(`[sync-electron-sqlite-binary] ${from} not found — did rebuild:electron run first?`);
    process.exit(1);
}
if (!fs.existsSync(path.dirname(to))) {
    console.error(`[sync-electron-sqlite-binary] ${path.dirname(to)} not found — did \`npm run build\` produce a standalone bundle?`);
    process.exit(1);
}

fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log(`[sync-electron-sqlite-binary] copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
