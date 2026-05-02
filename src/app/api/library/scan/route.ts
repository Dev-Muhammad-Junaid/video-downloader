import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const execAsync = promisify(exec);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".wav", ".wma"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"]);
const ALL_MEDIA_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS]);

async function getDuration(filePath: string): Promise<number | null> {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
        );
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) ? null : duration;
    } catch {
        return null;
    }
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

        const videoFiles = await scanDirectory(folderPath);
        const imported: any[] = [];

        // Pre-fetch all existing entries for dedup and pruning
        const allExisting = await prisma.video.findMany({
            select: { id: true, localPath: true },
        });

        // Prune entries whose files no longer exist on disk
        const pruneIds: string[] = [];
        for (const entry of allExisting) {
            try {
                await fs.access(entry.localPath);
            } catch {
                // File doesn't exist anymore — mark for deletion
                pruneIds.push(entry.id);
            }
        }
        if (pruneIds.length > 0) {
            await prisma.video.deleteMany({ where: { id: { in: pruneIds } } });
            console.log(`Pruned ${pruneIds.length} stale library entries (files deleted from disk)`);
        }

        const remainingExisting = allExisting.filter(v => !pruneIds.includes(v.id));
        const existingPaths = new Set(remainingExisting.map(v => v.localPath));
        const existingFilenames = new Set(remainingExisting.map(v => path.basename(v.localPath)));

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
