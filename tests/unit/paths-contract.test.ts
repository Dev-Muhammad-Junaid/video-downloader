import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

/**
 * The locations user data lives in, asserted as a contract.
 *
 * Two distinct failures motivated this. Things were written inside the .app
 * bundle and destroyed by updates (five times). And "Export database" read a
 * path that had never held the database, so it returned an empty file while
 * reporting success — a backup feature that silently produced nothing.
 *
 * Paths are load-bearing in a desktop app and nothing else checks them.
 */

const PACKAGED_ENV = {
    SNAPDOWN_USER_DATA_DIR: "/Users/test/Library/Application Support/SnapDown",
    HOME: "/Users/test",
};

async function loadPaths(env: Record<string, string> | null) {
    vi.resetModules();
    if (env) Object.assign(process.env, env);
    else delete process.env.SNAPDOWN_USER_DATA_DIR;
    return import("@/lib/app-paths");
}

describe("where user data lives", () => {
    beforeEach(() => { vi.resetModules(); });

    it("packaged: media goes somewhere the user owns, not into the app", async () => {
        const { getDefaultMediaDir, isInsideAppBundle } = await loadPaths(PACKAGED_ENV);
        const dir = getDefaultMediaDir();
        expect(isInsideAppBundle(dir)).toBe(false);
        // Visible in Finder — Application Support is hidden from users.
        expect(dir).toBe(path.join("/Users/test", "Movies", "SnapDown"));
    });

    it("dev: stays in the project directory, which nothing deletes", async () => {
        const { getDefaultMediaDir } = await loadPaths(null);
        expect(getDefaultMediaDir()).toBe(path.join(process.cwd(), "downloads"));
    });

    it("every generated artefact resolves under the user data directory", async () => {
        const { appDataPath } = await loadPaths(PACKAGED_ENV);
        for (const name of ["dev.db", "transcripts", "thumbnails", "download_destination", ".server_settings.json"]) {
            expect(appDataPath(name)).toBe(path.join(PACKAGED_ENV.SNAPDOWN_USER_DATA_DIR, name));
        }
    });

    it("the database export reads the live database, not a bundled path", () => {
        // It used to read <cwd>/prisma/dev.db, which in the packaged app is
        // inside the bundle and empty — the export "succeeded" with no data.
        const source = fs.readFileSync(path.resolve("src/app/api/export/route.ts"), "utf-8");
        expect(source).toContain('appDataPath("dev.db")');
        expect(source).not.toMatch(/process\.cwd\(\)[^)]*prisma/);
    });

    it("the media route allows every location files can legitimately be in", () => {
        // Rescued media lands in the default media dir even when the configured
        // destination is elsewhere; thumbnails and transcripts moved out of the
        // bundle. Any of these missing means files exist but refuse to load.
        const source = fs.readFileSync(path.resolve("src/app/api/media/route.ts"), "utf-8");
        for (const required of [
            "getDownloadsDir()",
            "getDefaultMediaDir()",
            'appDataPath("thumbnails")',
            'appDataPath("transcripts")',
        ]) {
            expect(source, `media route must allow ${required}`).toContain(required);
        }
    });
});

describe("the update source is pinned", () => {
    it("names the repo directly rather than relying on a rename redirect", () => {
        // The repo was renamed video-downloader → SnapDown. GitHub 301s the old
        // name only while nothing else claims it; create a repo under the old
        // name and it resolves there instead. An updater that downloads and
        // executes code must not follow that.
        const updater = fs.readFileSync(path.resolve("electron/updater.cjs"), "utf-8");
        const check = fs.readFileSync(path.resolve("src/app/api/check-update/route.ts"), "utf-8");

        for (const [name, source] of [["updater", updater], ["check-update", check]] as const) {
            expect(source, `${name} still points at the old repo name`).not.toContain("video-downloader");
            expect(source, `${name} should name the current repo`).toContain("Dev-Muhammad-Junaid/SnapDown");
        }
    });

    it("the updater only accepts GitHub hosts over HTTPS", () => {
        const updater = fs.readFileSync(path.resolve("electron/updater.cjs"), "utf-8");
        expect(updater).toContain("ALLOWED_HOSTS");
        expect(updater).toMatch(/protocol !== "https:"/);
    });
});
