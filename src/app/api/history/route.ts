import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — List download history
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "100");
        const offset = parseInt(searchParams.get("offset") || "0");

        const [logs, total] = await Promise.all([
            prisma.downloadLog.findMany({
                orderBy: { startedAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.downloadLog.count(),
        ]);

        // Aggregate stats
        const stats = await prisma.downloadLog.aggregate({
            _count: true,
            _sum: { fileSize: true },
        });
        const completedCount = await prisma.downloadLog.count({ where: { status: "completed" } });
        const failedCount = await prisma.downloadLog.count({ where: { status: "error" } });

        return NextResponse.json({
            logs,
            total,
            stats: {
                totalDownloads: stats._count,
                totalSize: stats._sum.fileSize || 0,
                completed: completedCount,
                failed: failedCount,
                successRate: stats._count > 0 
                    ? Math.round((completedCount / stats._count) * 100) 
                    : 0,
            },
        });
    } catch (error: any) {
        console.error("Failed to fetch history:", error);
        return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }
}

// DELETE — Clear all history
export async function DELETE() {
    try {
        await prisma.downloadLog.deleteMany();
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to clear history:", error);
        return NextResponse.json({ error: "Failed to clear history" }, { status: 500 });
    }
}
