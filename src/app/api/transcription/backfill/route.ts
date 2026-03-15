import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transcribeAndSave } from "@/lib/transcription";
import fs from "fs";

// POST /api/transcription/backfill — transcribe all videos that don't have a transcript yet
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const apiKey: string = body.apiKey || process.env.OPENAI_API_KEY || "";

        if (!apiKey) {
            return NextResponse.json(
                { error: "No OpenAI API key provided. Add it in Settings." },
                { status: 400 }
            );
        }

        // Find all videos that are:
        // - Type "video" (not image)
        // - No transcript yet (status is null, "none", or "error")
        // - File still exists on disk
        const videos = await prisma.video.findMany({
            where: {
                mediaType: "video",
                OR: [
                    { transcriptStatus: null },
                    { transcriptStatus: "error" },
                ],
            },
            select: { id: true, localPath: true, title: true },
        });

        // Filter to only files that exist
        const existing = videos.filter((v) => {
            try { return fs.existsSync(v.localPath); } catch { return false; }
        });

        if (existing.length === 0) {
            return NextResponse.json({ message: "No videos need transcribing", queued: 0 });
        }

        // Mark all as pending immediately
        await prisma.video.updateMany({
            where: { id: { in: existing.map((v) => v.id) } },
            data: { transcriptStatus: "pending" },
        });

        // Kick off background transcription (non-blocking, sequential to avoid API rate limits)
        (async () => {
            for (const video of existing) {
                try {
                    await transcribeAndSave(video.id, apiKey);
                    console.log(`[Backfill] Transcribed: ${video.title}`);
                } catch (err: any) {
                    console.error(`[Backfill] Failed ${video.id}: ${err.message}`);
                }
                // Small delay between requests to respect rate limits
                await new Promise((r) => setTimeout(r, 500));
            }
        })();

        return NextResponse.json({
            message: `Transcription queued for ${existing.length} video(s)`,
            queued: existing.length,
            ids: existing.map((v) => v.id),
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// GET /api/transcription/backfill — get summary of transcription status across the library
export async function GET() {
    try {
        const stats = await prisma.video.groupBy({
            by: ["transcriptStatus"],
            where: { mediaType: "video" },
            _count: { _all: true },
        });

        const total = await prisma.video.count({ where: { mediaType: "video" } });

        const statusMap: Record<string, number> = {};
        stats.forEach((s) => {
            const key = s.transcriptStatus ?? "none";
            statusMap[key] = s._count._all;
        });

        return NextResponse.json({
            total,
            completed: statusMap["completed"] ?? 0,
            pending: statusMap["pending"] ?? 0,
            processing: statusMap["processing"] ?? 0,
            error: statusMap["error"] ?? 0,
            none: statusMap["none"] ?? 0,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
