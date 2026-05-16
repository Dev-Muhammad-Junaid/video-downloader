import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";

export async function GET() {
    try {
        const videos = await prisma.video.findMany({
            orderBy: { createdAt: "desc" },
            include: { labels: true }
        });

        // Check file existence and prune stale entries
        const staleIds: string[] = [];
        const validVideos = [];

        for (const video of videos) {
            try {
                await fs.access(video.localPath);
                validVideos.push(video);
            } catch {
                staleIds.push(video.id);
            }
        }

        // Delete stale DB records in background
        if (staleIds.length > 0) {
            prisma.video.deleteMany({ where: { id: { in: staleIds } } })
                .then(() => console.log(`Library GET: pruned ${staleIds.length} stale entries`))
                .catch(console.error);
        }

        return NextResponse.json(validVideos);
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to fetch library", details: error.message }, { status: 500 });
    }
}
