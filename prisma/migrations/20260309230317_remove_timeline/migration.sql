-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "duration" REAL,
    "originalUrl" TEXT,
    "sourcePlatform" TEXT,
    "localPath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "previewUrl" TEXT,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
