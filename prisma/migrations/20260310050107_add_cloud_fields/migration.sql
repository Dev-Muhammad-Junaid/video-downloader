-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "_LabelToVideo" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_LabelToVideo_A_fkey" FOREIGN KEY ("A") REFERENCES "Label" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_LabelToVideo_B_fkey" FOREIGN KEY ("B") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "duration" REAL,
    "originalUrl" TEXT,
    "sourcePlatform" TEXT,
    "localPath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mediaType" TEXT NOT NULL DEFAULT 'video',
    "previewUrl" TEXT,
    "sourceId" TEXT,
    "cloudKey" TEXT,
    "cloudUrl" TEXT,
    "cloudUploadedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Video" ("createdAt", "duration", "fileSize", "id", "localPath", "originalUrl", "previewUrl", "sourceId", "sourcePlatform", "title", "updatedAt") SELECT "createdAt", "duration", "fileSize", "id", "localPath", "originalUrl", "previewUrl", "sourceId", "sourcePlatform", "title", "updatedAt" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Label_name_key" ON "Label"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_LabelToVideo_AB_unique" ON "_LabelToVideo"("A", "B");

-- CreateIndex
CREATE INDEX "_LabelToVideo_B_index" ON "_LabelToVideo"("B");
