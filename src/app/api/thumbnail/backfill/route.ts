import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateThumbnail } from "@/lib/thumbnail";

// POST — Generate thumbnails for all existing videos that don't have one
export async function POST() {
    try {
        const videos = await prisma.video.findMany({
            where: { thumbnailPath: null },
            select: { id: true, localPath: true, mediaType: true },
        });

        let generated = 0;
        let failed = 0;

        for (const video of videos) {
            try {
                const thumbPath = await generateThumbnail(video.localPath, video.id, video.mediaType);
                if (thumbPath) {
                    await prisma.video.update({
                        where: { id: video.id },
                        data: { thumbnailPath: thumbPath },
                    });
                    generated++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }

        return NextResponse.json({
            success: true,
            total: videos.length,
            generated,
            failed,
        });
    } catch (error: any) {
        console.error("Thumbnail backfill failed:", error);
        return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
    }
}
