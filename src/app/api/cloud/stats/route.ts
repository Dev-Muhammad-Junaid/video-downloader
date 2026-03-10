import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        // All cloud-uploaded videos
        const cloudVideos = await prisma.video.findMany({
            where: { cloudKey: { not: null } },
            select: {
                id: true,
                fileSize: true,
                sourcePlatform: true,
                mediaType: true,
                cloudUploadedAt: true,
            },
        });

        const totalFiles = cloudVideos.length;
        const totalBytes = cloudVideos.reduce((sum, v) => sum + (v.fileSize || 0), 0);

        // Total videos in library (for ratio)
        const totalLibraryCount = await prisma.video.count();

        // Breakdown by platform
        const platformBreakdown: Record<string, { count: number; bytes: number }> = {};
        for (const v of cloudVideos) {
            const platform = v.sourcePlatform || "Unknown";
            if (!platformBreakdown[platform]) {
                platformBreakdown[platform] = { count: 0, bytes: 0 };
            }
            platformBreakdown[platform].count += 1;
            platformBreakdown[platform].bytes += v.fileSize || 0;
        }

        // Breakdown by media type
        const typeBreakdown: Record<string, number> = {};
        for (const v of cloudVideos) {
            const type = v.mediaType || "video";
            typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
        }

        // Recent 5 uploads
        const recentUploads = await prisma.video.findMany({
            where: { cloudKey: { not: null } },
            orderBy: { cloudUploadedAt: "desc" },
            take: 5,
            select: {
                id: true,
                title: true,
                fileSize: true,
                sourcePlatform: true,
                mediaType: true,
                cloudUploadedAt: true,
            },
        });

        return NextResponse.json({
            totalFiles,
            totalBytes,
            totalLibraryCount,
            platformBreakdown,
            typeBreakdown,
            recentUploads,
        });
    } catch (error: any) {
        console.error("Cloud stats error:", error);
        return NextResponse.json({ error: "Failed to fetch cloud stats", details: error.message }, { status: 500 });
    }
}
