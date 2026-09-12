import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { prisma } from "@/lib/prisma";
import { getFfmpegPath, probeKeyframes } from "@/lib/ffmpeg";

/**
 * A strip of evenly-spaced thumbnails across a video, tiled into one image.
 *
 * The timeline was a blank bar: you scrubbed blind, with no way to see where a
 * scene changed without playing through. This gives the track something to
 * look at, so you can find the moment you want by eye.
 *
 * One ffmpeg call produces the whole strip via the `tile` filter — asking for
 * frames individually would mean FRAME_COUNT separate decodes of the same file.
 * Returned as a single image rather than JSON so the browser caches it and the
 * timeline can use it directly as a background.
 */
const FRAME_COUNT = 40;
const FRAME_HEIGHT = 56;

const cache = new Map<string, { mtimeMs: number; png: Buffer }>();

export async function GET(req: Request) {
    let tmpOut: string | null = null;
    try {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

        const video = await prisma.video.findUnique({ where: { id } });
        if (!video || !fs.existsSync(video.localPath) || video.mediaType === "audio") {
            return NextResponse.json({ error: "No frames available" }, { status: 404 });
        }

        const { mtimeMs } = fs.statSync(video.localPath);
        const hit = cache.get(id);
        if (hit && hit.mtimeMs === mtimeMs) {
            return new NextResponse(new Uint8Array(hit.png), {
                headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
            });
        }

        // Decode ONLY keyframes. Asking for evenly-spaced frames with `fps=`
        // forces a full decode of the file — that took over two minutes on a
        // 7.5 minute video and timed out. Keyframes alone build the same strip
        // in well under a second, and are already probed (and cached) for the
        // timeline's snapping.
        const keyframes = probeKeyframes(video.localPath);
        if (keyframes.length === 0) {
            return NextResponse.json({ error: "No frames available" }, { status: 404 });
        }

        // Take every Nth keyframe so the strip spans the whole video rather
        // than only its opening.
        const step = Math.max(1, Math.ceil(keyframes.length / FRAME_COUNT));
        const frames = Math.min(FRAME_COUNT, Math.ceil(keyframes.length / step));

        tmpOut = path.join(os.tmpdir(), `snapdown_strip_${Date.now()}.jpg`);

        const res = spawnSync(getFfmpegPath(), [
            "-v", "error",
            "-skip_frame", "nokey",
            "-i", video.localPath,
            "-vf", `select='not(mod(n\,${step}))',scale=-1:${FRAME_HEIGHT},tile=${frames}x1`,
            "-vsync", "vfr",
            "-frames:v", "1",
            "-q:v", "6",
            "-y", tmpOut,
        ], { timeout: 120_000 });

        if (res.status !== 0 || !fs.existsSync(tmpOut)) {
            return NextResponse.json({ error: "Could not build filmstrip" }, { status: 404 });
        }

        const png = fs.readFileSync(tmpOut);
        cache.set(id, { mtimeMs, png });

        return new NextResponse(new Uint8Array(png), {
            headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "private, max-age=86400",
                "X-Frame-Count": String(frames),
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "Failed to build filmstrip", details: message }, { status: 500 });
    } finally {
        if (tmpOut) { try { fs.unlinkSync(tmpOut); } catch { /* best effort */ } }
    }
}
