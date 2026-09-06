// Last step before electron-builder packages the app. Must run AFTER
// rebuild:electron + sync-electron-sqlite-binary.cjs, so it dereferences the
// already-corrected (Electron-ABI) binaries, not the original plain-Node ones.
//
// Next's standalone output represents every "externalized" native package
// (sharp, better-sqlite3, etc. — anything with a native binary gets this
// automatically, not just what's listed in serverExternalPackages) as a
// symlink under .next/node_modules/<pkg>-<hash> pointing back at
// ../../node_modules/<pkg>. electron-builder's extraResources copy does not
// carry these relative symlinks over correctly — verified: they land broken
// in the packaged app even when their target has real content. Dereference
// every such symlink into a real directory copy so nothing symlinked
// survives into the packaged output.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

function dereferenceSymlinks(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
            const real = fs.realpathSync(entryPath);
            fs.rmSync(entryPath, { force: true });
            fs.cpSync(real, entryPath, { recursive: true });
            console.log(`[finalize-standalone] dereferenced symlink ${path.relative(root, entryPath)}`);
        } else if (entry.isDirectory()) {
            dereferenceSymlinks(entryPath);
        }
    }
}

dereferenceSymlinks(path.join(standaloneDir, ".next", "node_modules"));

// electron-builder's copy filter (app-builder-lib/out/util/filter.js) has a
// hardcoded, unconditional rule: any directory whose path *relative to the
// copy source root* is exactly "node_modules" gets silently excluded, with
// no filter override able to counteract it — intended to stop naive whole-
// project copies, but it also strips a deliberate, self-contained bundle
// like this one, since .next/standalone/node_modules is a direct child of
// the "from" root. Verified by reading electron-builder's source after the
// packaged app crashed with "Cannot find module 'next'" despite the source
// standalone bundle having a complete node_modules.
//
// Fix: wrap the bundle one directory level deeper on disk so "node_modules"
// is never the literal top-level relative path electron-builder computes.
// package.json's extraResources then points from=".next/standalone-wrapped",
// to="." — landing at Resources/standalone/... exactly as before.
const wrappedDir = path.join(root, ".next", "standalone-wrapped");
fs.rmSync(wrappedDir, { recursive: true, force: true });
fs.mkdirSync(wrappedDir, { recursive: true });
fs.renameSync(standaloneDir, path.join(wrappedDir, "standalone"));
console.log(`[finalize-standalone] wrapped standalone bundle -> ${path.relative(root, wrappedDir)}/standalone (works around electron-builder's hardcoded node_modules exclusion)`);
