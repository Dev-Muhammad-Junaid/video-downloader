import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { appDataPath, getDefaultMediaDir, isInsideAppBundle } from "@/lib/app-paths";

/**
 * Moves any media still sitting inside the app bundle out to the real media
 * directory, then repoints the library rows at the new location.
 *
 * Before 0.3.4 downloads defaulted to `<cwd>/downloads`, which in the packaged
 * app is `SnapDown.app/Contents/Resources/standalone/downloads` — inside the
 * bundle. Updating the app replaces the bundle, so every file in there is
 * deleted; the library then pointed at files that no longer existed. (At the
 * time, the listing also hard-deleted those rows, so the library came back
 * empty and unrecoverable. That deletion is gone now, but the files were still
 * being destroyed.)
 *
 * Anyone updating FROM an affected version still has their media inside the
 * old bundle at the moment this first runs. Moving it out now is the only
 * chance to save it — the next update would delete it.
 *
 * Uses better-sqlite3 directly rather than Prisma because this runs from
 * instrumentation at server start, alongside ensureMigrated, before the Prisma
 * client is necessarily usable.
 */
export function rescueBundledMedia(): void {
    const dbPath = appDataPath("dev.db");
    if (!fs.existsSync(dbPath)) return;

    let db: Database.Database;
    try {
        db = new Database(dbPath);
    } catch {
        return;
    }

    try {
        const rows = db
            .prepare("SELECT id, localPath, transcriptPath, thumbnailPath FROM Video")
            .all() as {
                id: string;
                localPath: string;
                transcriptPath: string | null;
                thumbnailPath: string | null;
            }[];

        // Transcripts and thumbnails were written under the bundle for the same
        // reason media was, so updates destroyed them too. Transcripts cost real
        // money to regenerate; thumbnails just cost time, but a library of blank
        // cards after every update is its own kind of broken.
        rescueSidecars(db, rows, "transcriptPath", "transcripts");
        rescueSidecars(db, rows, "thumbnailPath", "thumbnails");

        const atRisk = rows.filter((r) => r.localPath && isInsideAppBundle(r.localPath));
        if (atRisk.length === 0) return;

        const destDir = getDefaultMediaDir();
        fs.mkdirSync(destDir, { recursive: true });

        const update = db.prepare("UPDATE Video SET localPath = ? WHERE id = ?");
        let moved = 0;
        let lost = 0;

        for (const row of atRisk) {
            if (!fs.existsSync(row.localPath)) {
                // Already destroyed by a previous update. The row is left alone
                // deliberately: it still carries the title, URL and metadata, so
                // the user can see what was lost and re-download it rather than
                // discovering an empty library with no explanation.
                lost++;
                continue;
            }

            let target = path.join(destDir, path.basename(row.localPath));
            // Don't clobber a file that's already there under the same name.
            if (fs.existsSync(target)) {
                const parsed = path.parse(target);
                target = path.join(parsed.dir, `${parsed.name}_${Date.now().toString(36)}${parsed.ext}`);
            }

            try {
                fs.renameSync(row.localPath, target);
            } catch {
                // Different volume, or a permissions problem — fall back to a
                // copy so the file survives even if the original can't be
                // removed.
                try {
                    fs.copyFileSync(row.localPath, target);
                    try { fs.unlinkSync(row.localPath); } catch { /* leave the original */ }
                } catch (err) {
                    console.error(`[rescue] Could not move ${row.localPath}:`, err);
                    continue;
                }
            }

            update.run(target, row.id);
            moved++;
        }

        if (moved > 0) {
            console.log(`[rescue] Moved ${moved} media file(s) out of the app bundle into ${destDir}`);
        }
        if (lost > 0) {
            console.warn(`[rescue] ${lost} library entr${lost === 1 ? "y" : "ies"} point inside the old app bundle and the file is already gone (deleted by an earlier update). The entries are kept so they can be re-downloaded.`);
        }
    } catch (err) {
        console.error("[rescue] Failed while relocating bundled media:", err);
    } finally {
        try { db.close(); } catch { /* ignore */ }
    }
}

/**
 * Move generated sidecar files (transcripts, thumbnails) out of the bundle
 * into the user data directory and repoint their rows.
 */
function rescueSidecars(
    db: Database.Database,
    rows: { id: string; transcriptPath: string | null; thumbnailPath: string | null }[],
    column: "transcriptPath" | "thumbnailPath",
    dirName: string,
): void {
    const atRisk = rows.filter((r) => r[column] && isInsideAppBundle(r[column]!));
    if (atRisk.length === 0) return;

    const destDir = appDataPath(dirName);
    fs.mkdirSync(destDir, { recursive: true });
    const update = db.prepare(`UPDATE Video SET ${column} = ? WHERE id = ?`);
    let moved = 0;

    for (const row of atRisk) {
        const source = row[column]!;
        if (!fs.existsSync(source)) continue;
        const target = path.join(destDir, path.basename(source));
        try {
            fs.renameSync(source, target);
        } catch {
            try {
                fs.copyFileSync(source, target);
                try { fs.unlinkSync(source); } catch { /* leave the original */ }
            } catch {
                continue;
            }
        }
        update.run(target, row.id);
        moved++;
    }

    if (moved > 0) console.log(`[rescue] Moved ${moved} ${dirName} file(s) out of the app bundle`);
}
