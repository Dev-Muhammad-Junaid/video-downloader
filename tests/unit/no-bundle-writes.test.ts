import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Guard against the defect that destroyed a user's library.
 *
 * Anything the app WRITES must live outside the .app bundle, because an update
 * replaces the bundle and deletes everything in it. Four separate things were
 * lost this way before anyone noticed: downloaded media, the pointer recording
 * a custom download folder, transcripts, and thumbnails.
 *
 * `process.cwd()` inside the packaged app is
 * SnapDown.app/Contents/Resources/standalone, so a writable path built from it
 * is a path that gets wiped. Reading SHIPPED assets from there is correct — the
 * distinction this test enforces is write vs read.
 */

const SRC = path.resolve(process.cwd(), "src");

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

/**
 * Reading from the bundle is correct — that's where shipped assets live. Only
 * WRITING there is the bug. These are the reads.
 */
const READ_ONLY_USES = [
    'path.join(process.cwd(), "prisma", "migrations")', // bundled migration SQL
    'path.join(process.cwd(), "public", "fonts")',      // bundled subtitle fonts
    "node_modules",                                     // shipped ffmpeg/ffprobe binaries
    // media/route.ts keeps the old locations on its read allowlist so files
    // that haven't been migrated yet still play.
    'path.resolve(process.cwd(), "downloads")',
    'path.resolve(process.cwd(), "thumbnails")',
];

describe("no writable path inside the app bundle", () => {
    const files = walk(SRC);

    it("finds source files to check", () => {
        expect(files.length).toBeGreaterThan(50);
    });

    it("no module builds a writable directory from process.cwd()", () => {
        const offenders: string[] = [];

        for (const file of files) {
            const text = fs.readFileSync(file, "utf-8");
            const lines = text.split("\n");

            lines.forEach((line, i) => {
                if (!line.includes("process.cwd()")) return;
                if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
                if (READ_ONLY_USES.some((allowed) => line.includes(allowed))) return;
                // The dev fallbacks in app-paths are the one place cwd is the
                // intended answer — that module decides where data lives.
                if (file.endsWith(path.join("lib", "app-paths.ts"))) return;
                // Reading a legacy location in order to migrate off it is fine.
                if (/legacy/i.test(line) || /legacy/i.test(lines[i - 1] ?? "")) return;

                offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`);
            });
        }

        expect(offenders, `These build a path from process.cwd() that an app update would delete:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("the four known data locations resolve outside a bundle", async () => {
        process.env.SNAPDOWN_USER_DATA_DIR = "/Users/test/Library/Application Support/SnapDown";
        process.env.HOME = "/Users/test";
        const { appDataPath, getDefaultMediaDir, isInsideAppBundle } = await import("@/lib/app-paths");

        for (const p of [
            getDefaultMediaDir(),
            appDataPath("transcripts"),
            appDataPath("thumbnails"),
            appDataPath("dev.db"),
            appDataPath("download_destination"),
        ]) {
            expect(isInsideAppBundle(p), `${p} would be deleted by an update`).toBe(false);
        }
    });
});
