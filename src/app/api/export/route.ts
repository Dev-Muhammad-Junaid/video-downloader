import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import { appDataPath } from "@/lib/app-paths";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const format = searchParams.get("format") || "json";

        if (format === "db") {
            // Stream the raw SQLite database file
            // The live database is in the user data directory. This used to
            // read <cwd>/prisma/dev.db, which in the packaged app is inside the
            // .app bundle and has never held the user's data — so "export
            // database" either 404'd or handed back an empty shipped file
            // while appearing to succeed.
            const dbPath = appDataPath("dev.db");
            if (!fs.existsSync(dbPath)) {
                return NextResponse.json({ error: "Database file not found" }, { status: 404 });
            }

            const buffer = fs.readFileSync(dbPath);
            return new NextResponse(buffer, {
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition": `attachment; filename="snapdown_backup_${new Date().toISOString().split("T")[0]}.db"`,
                },
            });
        }

        // Fetch all videos with labels
        const videos = await prisma.video.findMany({
            include: { labels: true },
            orderBy: { createdAt: "desc" },
        });

        if (format === "csv") {
            // Build CSV
            const headers = ["Title", "URL", "Platform", "Path", "Size (bytes)", "Media Type", "Created At", "Labels", "Cloud Key", "Cloud URL"];
            const rows = videos.map(v => [
                `"${(v.title || "").replace(/"/g, '""')}"`,
                `"${v.originalUrl || ""}"`,
                `"${v.sourcePlatform || ""}"`,
                `"${v.localPath || ""}"`,
                v.fileSize || "",
                `"${v.mediaType || ""}"`,
                `"${v.createdAt.toISOString()}"`,
                `"${(v.labels || []).map(l => l.name).join(", ")}"`,
                `"${v.cloudKey || ""}"`,
                `"${v.cloudUrl || ""}"`,
            ].join(","));

            const csv = [headers.join(","), ...rows].join("\n");

            return new NextResponse(csv, {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="snapdown_export_${new Date().toISOString().split("T")[0]}.csv"`,
                },
            });
        }

        // Default: JSON
        const exportData = {
            exportedAt: new Date().toISOString(),
            totalItems: videos.length,
            items: videos.map(v => ({
                title: v.title,
                originalUrl: v.originalUrl,
                sourcePlatform: v.sourcePlatform,
                localPath: v.localPath,
                fileSize: v.fileSize,
                mediaType: v.mediaType,
                duration: v.duration,
                createdAt: v.createdAt,
                labels: (v.labels || []).map(l => l.name),
                cloudKey: v.cloudKey,
                cloudUrl: v.cloudUrl,
                cloudUploadedAt: v.cloudUploadedAt,
            })),
        };

        return new NextResponse(JSON.stringify(exportData, null, 2), {
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="snapdown_export_${new Date().toISOString().split("T")[0]}.json"`,
            },
        });
    } catch (error: any) {
        console.error("Export failed:", error);
        return NextResponse.json({ error: "Export failed", details: error.message }, { status: 500 });
    }
}
