import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";

// GET /api/transcription/[id]/vtt — serve the .vtt subtitle file for a video
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const video = await prisma.video.findUnique({
            where: { id },
            select: { transcriptPath: true },
        });

        if (!video?.transcriptPath) {
            return NextResponse.json({ error: "No transcript available" }, { status: 404 });
        }

        if (!fs.existsSync(video.transcriptPath)) {
            return NextResponse.json({ error: "Transcript file not found on disk" }, { status: 404 });
        }

        const content = fs.readFileSync(video.transcriptPath, "utf-8");

        return new NextResponse(content, {
            headers: {
                "Content-Type": "text/vtt; charset=utf-8",
                "Cache-Control": "public, max-age=86400",
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
