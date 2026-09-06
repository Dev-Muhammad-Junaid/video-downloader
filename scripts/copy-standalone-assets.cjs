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

// Next's standalone tracer, in this project, copies far more than the
// documented "server.js + pruned node_modules" — verified by reproducing it
// with a stripped-down next.config (no custom tracing options), so it's not
// something this project's config is causing. The result includes the ENTIRE
// dev working tree: dev.db (a real personal database), downloads/ and
// thumbnails/ (real user media from this machine), transcripts/, docs/,
// extension/, README — none of which should ever ship inside a distributable
// app (wrong AND a privacy problem). Rather than chase Next's tracer
// internals, prune to an explicit allowlist of what the standalone server
// actually needs at its root, so any future over-inclusion gets caught too.
const KEEP_AT_ROOT = new Set([
    "server.js",
    "node_modules",
    ".next",
    "package.json",
    // added below by this script:
    "public",
    "prisma",
]);
for (const entry of fs.readdirSync(standaloneDir)) {
    if (!KEEP_AT_ROOT.has(entry)) {
        fs.rmSync(path.join(standaloneDir, entry), { recursive: true, force: true });
    }
}
console.log(`[copy-standalone-assets] pruned standalone root to: ${[...KEEP_AT_ROOT].join(", ")}`);

// next.config.ts marks "sharp" as a serverExternalPackage (required — its
// native binary breaks under Next's default bundling). But that means Next's
// standalone trace leaves it as an EMPTY placeholder directory (+ a symlink
// pointing at it), assuming the deploy target will run its own `npm install`
// to fill it in (that's how Vercel/normal Node hosting handles "external"
// packages) — which never happens here, since we're packaging the standalone
// folder directly into the app bundle. Copy the real package + its
// platform-specific @img binary packages over the empty stub.
const sharpModules = ["sharp", ...fs.readdirSync(path.join(root, "node_modules", "@img"))
    .filter((name) => name.startsWith("sharp-"))
    .map((name) => `@img/${name}`)];

const copies = [
    [path.join(root, "public"), path.join(standaloneDir, "public")],
    [path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static")],
    [path.join(root, "prisma", "schema.prisma"), path.join(standaloneDir, "prisma", "schema.prisma")],
    // Needed at runtime by src/lib/migrate.ts (via instrumentation.ts) to
    // create the schema on a fresh DB — there's no developer around to run
    // `prisma migrate dev` on a user's machine.
    [path.join(root, "prisma", "migrations"), path.join(standaloneDir, "prisma", "migrations")],
    ...sharpModules.map((mod) => [
        path.join(root, "node_modules", mod),
        path.join(standaloneDir, "node_modules", mod),
    ]),
];

for (const [from, to] of copies) {
    if (!fs.existsSync(from)) {
        console.warn(`[copy-standalone-assets] skipping missing source: ${from}`);
        continue;
    }
    fs.rmSync(to, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    console.log(`[copy-standalone-assets] copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

// NOTE: symlink dereferencing (needed for sharp/better-sqlite3's externalized-
// package stubs) happens in scripts/finalize-standalone.cjs, run LATER in the
// electron:build pipeline — after better-sqlite3 has been rebuilt for
// Electron's ABI and synced in. Doing it here (right after `next build`)
// would dereference the still-plain-Node-ABI binary, before the Electron
// rebuild ever touches it.
