import { NextResponse } from "next/server";
import fs from "fs";
import { spawnSync } from "child_process";
import { prisma } from "@/lib/prisma";
import { getFfmpegPath } from "@/lib/ffmpeg";

/**
 * Amplitude peaks for a media file, for drawing a waveform under the timeline.
 *
 * Computed server-side rather than in the browser: the audio editor decodes
 * with AudioContext, which is fine for an audio file but would mean pulling a
 * whole video across just to look at its sound.
 *
 * The audio is decoded to low-rate mono PCM and reduced to one peak per bucket
 * — a 7 minute video comes back as a few KB of JSON rather than tens of MB of
 * samples.
 */
const BUCKETS = 400;
const SAMPLE_RATE = 8000;

const cache = new Map<string, { mtimeMs: number; peaks: number[] }>();

export async function GET(req: Request) {
    try {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

        const video = await prisma.video.findUnique({ where: { id } });
        if (!video || !fs.existsSync(video.localPath)) {
            // No file, or no audio — the timeline simply won't draw a waveform.
            return NextResponse.json({ peaks: [] });
        }

        const { mtimeMs } = fs.statSync(video.localPath);
        const hit = cache.get(id);
        if (hit && hit.mtimeMs === mtimeMs) return NextResponse.json({ peaks: hit.peaks, cached: true });

        const out = spawnSync(getFfmpegPath(), [
            "-v", "error",
            "-i", video.localPath,
            "-vn",
            "-ac", "1",
            "-ar", String(SAMPLE_RATE),
            "-f", "s16le",            // raw signed 16-bit PCM
            "-",
        ], { maxBuffer: 256 * 1024 * 1024, timeout: 120_000, encoding: "buffer" });

        const pcm = out.stdout;
        if (!pcm || pcm.length < 2) {
            cache.set(id, { mtimeMs, peaks: [] });
            return NextResponse.json({ peaks: [] });
        }

        const sampleCount = Math.floor(pcm.length / 2);
        const perBucket = Math.max(1, Math.floor(sampleCount / BUCKETS));
        const peaks: number[] = [];

        for (let b = 0; b < BUCKETS; b++) {
            let max = 0;
            const start = b * perBucket;
            const end = Math.min(sampleCount, start + perBucket);
            for (let i = start; i < end; i++) {
                const v = Math.abs(pcm.readInt16LE(i * 2));
                if (v > max) max = v;
            }
            peaks.push(Math.min(1, max / 32768));
        }

        // Normalise to the loudest point so a quiet recording is still legible;
        // this is a visual guide, not a measurement.
        const loudest = Math.max(...peaks, 0.0001);
        const normalised = peaks.map((p) => Math.round((p / loudest) * 100) / 100);

        cache.set(id, { mtimeMs, peaks: normalised });
        return NextResponse.json({ peaks: normalised });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "Failed to read waveform", details: message }, { status: 500 });
    }
}
