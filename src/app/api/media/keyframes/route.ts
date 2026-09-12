import { NextResponse } from "next/server";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { probeKeyframes } from "@/lib/ffmpeg";

/**
 * Keyframe timestamps for a library video.
 *
 * The trim editor uses these to snap its handles: a fast (stream-copy) trim can
 * only cut at a keyframe, so any other position is a promise the export won't
 * keep. Returning them lets the UI show the user where the cuts can actually
 * land instead of silently moving them afterwards.
 *
 * Cached in-process because keyframes never change for a given file and the
 * editor asks on every open.
 */
const cache = new Map<string, { mtimeMs: number; keyframes: number[] }>();

export async function GET(req: Request) {
    try {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

        const video = await prisma.video.findUnique({ where: { id } });
        if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
        if (!fs.existsSync(video.localPath)) {
            // Not an error worth surfacing — the editor just won't snap.
            return NextResponse.json({ keyframes: [] });
        }

        // Keyed on mtime so an edited-in-place file isn't served stale points.
        const { mtimeMs } = fs.statSync(video.localPath);
        const hit = cache.get(id);
        if (hit && hit.mtimeMs === mtimeMs) {
            return NextResponse.json({ keyframes: hit.keyframes, cached: true });
        }

        const keyframes = probeKeyframes(video.localPath);
        cache.set(id, { mtimeMs, keyframes });
        return NextResponse.json({ keyframes });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "Failed to read keyframes", details: message }, { status: 500 });
    }
}
