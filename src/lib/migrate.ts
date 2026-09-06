import fs from "fs";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import { appDataPath } from "@/lib/app-paths";

/**
 * Applies any not-yet-applied prisma/migrations/*.sql to the app's SQLite DB,
 * using better-sqlite3 directly (not the `prisma` CLI). A packaged desktop
 * app has no developer around to run `prisma migrate dev` on first launch —
 * this is the runtime equivalent, called once from instrumentation.ts.
 *
 * Tracks applied migrations in a `_prisma_migrations` table matching Prisma's
 * own schema/semantics, so this stays interoperable with the real Prisma CLI
 * (e.g. inspecting a shipped user's DB with `prisma migrate status` during
 * support). A dev.db that already has real Prisma-applied migrations (from
 * `prisma migrate dev` during development) is read correctly on first run
 * here too — it already has this exact table with the same migration names.
 */
export function ensureMigrated(): void {
    const dbPath = appDataPath("dev.db");
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

    if (!fs.existsSync(migrationsDir)) {
        console.warn("[migrate] prisma/migrations not found, skipping");
        return;
    }

    const db = new Database(dbPath);
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
                "id" TEXT PRIMARY KEY NOT NULL,
                "checksum" TEXT NOT NULL,
                "finished_at" DATETIME,
                "migration_name" TEXT NOT NULL,
                "logs" TEXT,
                "rolled_back_at" DATETIME,
                "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
            );
        `);

        const applied = new Set(
            db.prepare(`SELECT migration_name FROM "_prisma_migrations"`).all().map(
                (row) => (row as { migration_name: string }).migration_name
            )
        );

        const migrationFolders = fs.readdirSync(migrationsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort(); // timestamp-prefixed folder names sort chronologically

        for (const name of migrationFolders) {
            if (applied.has(name)) continue;

            const sqlPath = path.join(migrationsDir, name, "migration.sql");
            if (!fs.existsSync(sqlPath)) continue;
            const sql = fs.readFileSync(sqlPath, "utf-8");
            const checksum = crypto.createHash("sha256").update(sql).digest("hex");

            console.log(`[migrate] applying ${name}`);
            db.exec(sql);
            db.prepare(`
                INSERT INTO "_prisma_migrations"
                    (id, checksum, migration_name, finished_at, applied_steps_count)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)
            `).run(crypto.randomUUID(), checksum, name);
        }
    } finally {
        db.close();
    }
}
