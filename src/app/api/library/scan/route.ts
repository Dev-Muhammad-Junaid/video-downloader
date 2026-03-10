import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const execAsync = promisify(exec);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi"]);

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
            } else if (VIDEO_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
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

        for (const filePath of videoFiles) {
            // Check if already in DB
            const existing = await prisma.video.findFirst({
                where: { localPath: filePath },
            });

            if (!existing) {
                const stats = await fs.stat(filePath);
                const duration = await getDuration(filePath);

                const video = await prisma.video.create({
                    data: {
                        title: path.basename(filePath),
                        localPath: filePath,
                        fileSize: stats.size,
                        duration,
                        sourcePlatform: "Local Import",
                    },
                });
                imported.push(video);
            }
        }

        return NextResponse.json({ success: true, count: imported.length, videos: imported });
    } catch (error: any) {
        console.error("Scan error:", error);
        return NextResponse.json({ error: "Failed to scan folder" }, { status: 500 });
    }
}
