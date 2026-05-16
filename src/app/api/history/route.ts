import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — List history with optional type filter
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "200");
        const offset = parseInt(searchParams.get("offset") || "0");
        const typeFilter = searchParams.get("type") || "all"; // "all" | "download" | "transcription"

        const where = typeFilter !== "all"
            ? { type: typeFilter }
            : undefined;

        const [logs, total] = await Promise.all([
            prisma.downloadLog.findMany({
                where,
                orderBy: { startedAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.downloadLog.count({ where }),
        ]);

        // ── Aggregate stats (always over all entries) ──
        const allStats = await prisma.downloadLog.aggregate({
            _count: true,
            _sum: { fileSize: true },
        });
        const [completedCount, failedCount, transcriptionCount, transcriptionErrors] = await Promise.all([
            prisma.downloadLog.count({ where: { status: "completed" } }),
            prisma.downloadLog.count({ where: { status: "error" } }),
            prisma.downloadLog.count({ where: { type: "transcription" } }),
            prisma.downloadLog.count({ where: { type: "transcription", status: "error" } }),
        ]);

        return NextResponse.json({
            logs,
            total,
            stats: {
                totalDownloads: allStats._count,
                totalSize: allStats._sum.fileSize || 0,
                completed: completedCount,
                failed: failedCount,
                successRate: allStats._count > 0
                    ? Math.round((completedCount / allStats._count) * 100)
                    : 0,
                transcriptions: transcriptionCount,
                transcriptionErrors,
            },
        });
    } catch (error: any) {
        console.error("Failed to fetch history:", error);
        return NextResponse.json({ error: "Failed to fetch history", details: error.message }, { status: 500 });
    }
}

// DELETE — Clear history (by type, or all)
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const typeFilter = searchParams.get("type") || "all";

        const where = typeFilter !== "all" ? { type: typeFilter } : undefined;
        await prisma.downloadLog.deleteMany({ where });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to clear history:", error);
        return NextResponse.json({ error: "Failed to clear history", details: error.message }, { status: 500 });
    }
}
