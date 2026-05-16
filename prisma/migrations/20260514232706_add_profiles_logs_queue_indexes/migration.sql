-- AlterTable
ALTER TABLE "Video" ADD COLUMN "thumbnailPath" TEXT;
ALTER TABLE "Video" ADD COLUMN "transcriptPath" TEXT;
ALTER TABLE "Video" ADD COLUMN "transcriptStatus" TEXT;
ALTER TABLE "Video" ADD COLUMN "transcriptText" TEXT;

-- CreateTable
CREATE TABLE "DownloadProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sitePattern" TEXT,
    "maxResolution" TEXT DEFAULT 'best',
    "preferredFormat" TEXT DEFAULT 'mp4',
    "preferredImageFormat" TEXT DEFAULT 'original',
    "autoCloudSync" BOOLEAN NOT NULL DEFAULT false,
    "requireManualFormat" BOOLEAN NOT NULL DEFAULT false,
    "strictResolution" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DownloadLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourcePlatform" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "fileSize" INTEGER,
    "videoId" TEXT,
    "duration" REAL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "type" TEXT NOT NULL DEFAULT 'download',
    "output" TEXT,
    CONSTRAINT "DownloadLog_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DownloadQueueJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Label" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "autoCloudSync" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Label" ("color", "createdAt", "id", "name") SELECT "color", "createdAt", "id", "name" FROM "Label";
DROP TABLE "Label";
ALTER TABLE "new_Label" RENAME TO "Label";
CREATE UNIQUE INDEX "Label_name_key" ON "Label"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DownloadProfile_name_key" ON "DownloadProfile"("name");

-- CreateIndex
CREATE INDEX "DownloadProfile_sitePattern_idx" ON "DownloadProfile"("sitePattern");

-- CreateIndex
CREATE INDEX "DownloadProfile_isActive_idx" ON "DownloadProfile"("isActive");

-- CreateIndex
CREATE INDEX "DownloadLog_videoId_idx" ON "DownloadLog"("videoId");

-- CreateIndex
CREATE INDEX "DownloadLog_status_idx" ON "DownloadLog"("status");

-- CreateIndex
CREATE INDEX "DownloadLog_type_idx" ON "DownloadLog"("type");

-- CreateIndex
CREATE INDEX "DownloadQueueJob_status_idx" ON "DownloadQueueJob"("status");

-- CreateIndex
CREATE INDEX "DownloadQueueJob_position_idx" ON "DownloadQueueJob"("position");

-- CreateIndex
CREATE INDEX "Video_originalUrl_idx" ON "Video"("originalUrl");

-- CreateIndex
CREATE INDEX "Video_mediaType_idx" ON "Video"("mediaType");

-- CreateIndex
CREATE INDEX "Video_transcriptStatus_idx" ON "Video"("transcriptStatus");

-- CreateIndex
CREATE INDEX "Video_sourceId_idx" ON "Video"("sourceId");
