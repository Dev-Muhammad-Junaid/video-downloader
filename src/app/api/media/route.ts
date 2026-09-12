import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDownloadsDir } from "@/lib/download-manager";
import { appDataPath, getDefaultMediaDir } from "@/lib/app-paths";
import { getServerSettings } from "@/lib/settings";

const MIME_TYPES: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".flac": "audio/flac",
    ".wav": "audio/wav",
    ".wma": "audio/x-ms-wma",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".vtt": "text/vtt",
    ".srt": "text/plain",
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mediaPath = searchParams.get("path");

    if (!mediaPath) {
        return new NextResponse("Missing path parameter", { status: 400 });
    }

    const absolutePath = path.resolve(mediaPath);

    // Security: reject paths containing ".." traversal or outside allowed directories
    if (absolutePath.includes("..")) {
        return new NextResponse("Invalid path", { status: 403 });
    }

    const downloadsDir = getDownloadsDir();
    const allowedRoots = [
        path.resolve(downloadsDir),
        // The default media location, which is where the rescue migration puts
        // files recovered from an old app bundle. Without this they'd be on
        // disk but refused by this route whenever the configured destination
        // is somewhere else.
        path.resolve(getDefaultMediaDir()),
        // Generated assets now live in the user data directory rather than
        // inside the .app bundle, which updates delete.
        path.resolve(appDataPath("thumbnails")),
        path.resolve(appDataPath("transcripts")),
        // Kept for dev, where cwd is the project directory.
        path.resolve(process.cwd(), "downloads"),
        path.resolve(process.cwd(), "thumbnails"),
        "/tmp",
    ];

    // Allow paths from the watch folder setting (stored in .server_settings.json)
    try {
        const { watchFolder } = getServerSettings();
        if (watchFolder) allowedRoots.push(path.resolve(watchFolder));
    } catch { }

    const isAllowed = allowedRoots.some(root => absolutePath.startsWith(root));
    if (!isAllowed) {
        return new NextResponse("Access denied: path outside allowed directories", { status: 403 });
    }

    try {
        const stat = fs.statSync(absolutePath);
        const fileSize = stat.size;
        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const isStreamable = contentType.startsWith("video/") || contentType.startsWith("audio/");

        const range = req.headers.get("range");

        if (range && isStreamable) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = end - start + 1;
            const file = fs.createReadStream(absolutePath, { start, end });
            const head = {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunksize,
                "Content-Type": contentType,
            };

            return new NextResponse(file as any, { status: 206, headers: head as any });
        } else {
            const head = {
                "Content-Length": fileSize,
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000",
            };
            const file = fs.createReadStream(absolutePath);
            return new NextResponse(file as any, { status: 200, headers: head as any });
        }
    } catch (error) {
        console.error("Media streaming error:", error);
        return new NextResponse("File not found or unreadable", { status: 404 });
    }
}
