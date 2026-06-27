-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DownloadProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sitePattern" TEXT,
    "maxResolution" TEXT DEFAULT 'best',
    "preferredFormat" TEXT DEFAULT 'mp4',
    "resolutionMode" TEXT NOT NULL DEFAULT 'flexible',
    "preferredImageFormat" TEXT DEFAULT 'original',
    "audioFormat" TEXT DEFAULT 'mp3',
    "audioBitrate" TEXT DEFAULT '192k',
    "extractAudio" BOOLEAN NOT NULL DEFAULT false,
    "autoCloudSync" BOOLEAN NOT NULL DEFAULT false,
    "requireManualFormat" BOOLEAN NOT NULL DEFAULT false,
    "strictResolution" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DownloadProfile" ("autoCloudSync", "createdAt", "id", "isActive", "maxResolution", "name", "preferredFormat", "preferredImageFormat", "priority", "requireManualFormat", "sitePattern", "strictResolution", "updatedAt") SELECT "autoCloudSync", "createdAt", "id", "isActive", "maxResolution", "name", "preferredFormat", "preferredImageFormat", "priority", "requireManualFormat", "sitePattern", "strictResolution", "updatedAt" FROM "DownloadProfile";
DROP TABLE "DownloadProfile";
ALTER TABLE "new_DownloadProfile" RENAME TO "DownloadProfile";
CREATE UNIQUE INDEX "DownloadProfile_name_key" ON "DownloadProfile"("name");
CREATE INDEX "DownloadProfile_sitePattern_idx" ON "DownloadProfile"("sitePattern");
CREATE INDEX "DownloadProfile_isActive_idx" ON "DownloadProfile"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

