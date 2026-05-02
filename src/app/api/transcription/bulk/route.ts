import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const { ids } = await req.json();
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "ids array required" }, { status: 400 });
        }

        const eligible = await prisma.video.findMany({
            where: {
                id: { in: ids },
                mediaType: { not: "image" },
                transcriptStatus: { notIn: ["completed", "processing"] },
            },
            select: { id: true },
        });

        let queued = 0;
        const origin = new URL(req.url).origin;

        for (const video of eligible) {
            try {
                await fetch(`${origin}/api/transcription/${video.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                });
                queued++;
            } catch { }
        }

        return NextResponse.json({ success: true, queued, total: eligible.length });
    } catch (error: any) {
        return NextResponse.json({ error: "Bulk transcription failed", details: error.message }, { status: 500 });
    }
}
