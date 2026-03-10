import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mediaPath = searchParams.get("path");

    if (!mediaPath) {
        return new NextResponse("Missing path parameter", { status: 400 });
    }

    const absolutePath = path.resolve(mediaPath);

    try {
        const stat = fs.statSync(absolutePath);
        const fileSize = stat.size;
        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const isVideo = contentType.startsWith("video/");

        const range = req.headers.get("range");

        if (range && isVideo) {
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
