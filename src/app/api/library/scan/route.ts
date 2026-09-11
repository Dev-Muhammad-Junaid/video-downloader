import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";
import { probeDuration } from "@/lib/ffmpeg";

const execFileAsync = promisify(execFile);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".wav", ".wma"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"]);
const ALL_MEDIA_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS]);

// Duration probing lives in lib/ffmpeg so the scan and the download path
// cannot disagree about how a file's length is determined.
async function getDuration(filePath: string): Promise<number | null> {
    return probeDuration(filePath);
}

async function scanDirectory(dir: string): Promise<string[]> {
    const result: string[] = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                result.push(...await scanDirectory(fullPath));
            } else if (ALL_MEDIA_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
                result.push(fullPath);
            }
        }
    } catch (error) {
        console.error("Error scanning dir", dir, error);
    }
    return result;
}

export async function POST(req: Request) {
    try {
        const { folderPath } = await req.json();

        if (!folderPath) {
            return NextResponse.json({ error: "Folder path required" }, { status: 400 });
        }

        const resolvedPath = path.resolve(folderPath);
        const homeDir = os.homedir();
        if (!resolvedPath.startsWith(homeDir) && !resolvedPath.startsWith("/Volumes")) {
            return NextResponse.json(
                { error: "Folder must be within your home directory or mounted volumes", details: `Resolved to: ${resolvedPath}` },
                { status: 400 }
            );
        }

        const videoFiles = await scanDirectory(resolvedPath);
        const imported: any[] = [];

        // Pre-fetch all existing entries for dedup.
        //
        // This used to also PRUNE — deleting every row whose file it couldn't
        // stat, across the WHOLE library rather than just the folder being
        // scanned. Importing a folder would silently destroy entries for media
        // on an unplugged external drive or a not-yet-mounted network volume.
        // Importing files is not a mandate to delete unrelated ones, so the
        // scan is now purely additive; the listing flags unreachable entries
        // and the user decides what to remove.
        const allExisting = await prisma.video.findMany({
            select: { id: true, localPath: true },
        });

        const existingPaths = new Set(allExisting.map(v => v.localPath));
        const existingFilenames = new Set(allExisting.map(v => path.basename(v.localPath)));

        for (const filePath of videoFiles) {
            const fileName = path.basename(filePath);

            // Skip if exact path OR same filename already in DB (prevents duplicates
            // when watch folder overlaps with download destination)
            if (existingPaths.has(filePath) || existingFilenames.has(fileName)) {
                continue;
            }

            const ext = path.extname(filePath).toLowerCase();
            const isImage = IMAGE_EXTENSIONS.has(ext);
            const isAudio = AUDIO_EXTENSIONS.has(ext);
            const stats = await fs.stat(filePath);
            const duration = isImage ? null : await getDuration(filePath);
            const mediaType = isImage ? "image" : isAudio ? "audio" : "video";

            const video = await prisma.video.create({
                data: {
                    title: fileName,
                    localPath: filePath,
                    fileSize: stats.size,
                    duration,
                    mediaType,
                    sourcePlatform: "Local Import",
                },
            });
            imported.push(video);
            existingPaths.add(filePath);
            existingFilenames.add(fileName);
        }

        return NextResponse.json({ success: true, count: imported.length, videos: imported });
    } catch (error: any) {
        console.error("Scan error:", error);
        return NextResponse.json({ error: "Failed to scan folder" }, { status: 500 });
    }
}
