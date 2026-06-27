-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DownloadQueueJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'download',
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourcePlatform" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'video',
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "duration" REAL,
    "formatId" TEXT,
    "formatLabel" TEXT,
    "profileName" TEXT,
    "qualityPreset" TEXT,
    "duplicatePolicy" TEXT NOT NULL DEFAULT 'keep-both',
    "status" TEXT NOT NULL,
    "progress" REAL NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "downloadPath" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);
INSERT INTO "new_DownloadQueueJob" ("completedAt", "createdAt", "downloadPath", "duplicatePolicy", "duration", "error", "formatId", "formatLabel", "id", "imageUrl", "mediaType", "position", "profileName", "progress", "qualityPreset", "sourcePlatform", "status", "thumbnailUrl", "title", "updatedAt", "url") SELECT "completedAt", "createdAt", "downloadPath", "duplicatePolicy", "duration", "error", "formatId", "formatLabel", "id", "imageUrl", "mediaType", "position", "profileName", "progress", "qualityPreset", "sourcePlatform", "status", "thumbnailUrl", "title", "updatedAt", "url" FROM "DownloadQueueJob";
DROP TABLE "DownloadQueueJob";
ALTER TABLE "new_DownloadQueueJob" RENAME TO "DownloadQueueJob";
CREATE INDEX "DownloadQueueJob_status_idx" ON "DownloadQueueJob"("status");
CREATE INDEX "DownloadQueueJob_position_idx" ON "DownloadQueueJob"("position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

