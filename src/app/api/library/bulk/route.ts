import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";

export async function DELETE(req: Request) {
    try {
        const { ids } = await req.json();
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "ids array required" }, { status: 400 });
        }

        const videos = await prisma.video.findMany({
            where: { id: { in: ids } },
            select: { id: true, localPath: true, thumbnailPath: true },
        });

        for (const v of videos) {
            try {
                if (v.localPath && fs.existsSync(v.localPath)) fs.unlinkSync(v.localPath);
                if (v.thumbnailPath && fs.existsSync(v.thumbnailPath)) fs.unlinkSync(v.thumbnailPath);
            } catch { }
        }

        await prisma.video.deleteMany({ where: { id: { in: ids } } });

        return NextResponse.json({ success: true, deleted: videos.length });
    } catch (error: any) {
        return NextResponse.json({ error: "Bulk delete failed", details: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { ids, action, labelId } = await req.json();
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "ids array required" }, { status: 400 });
        }

        if (action === "attachLabel" && labelId) {
            let updated = 0;
            for (const videoId of ids) {
                try {
                    await prisma.video.update({
                        where: { id: videoId },
                        data: { labels: { connect: { id: labelId } } },
                    });
                    updated++;
                } catch { }
            }
            return NextResponse.json({ success: true, updated });
        }

        if (action === "detachLabel" && labelId) {
            let updated = 0;
            for (const videoId of ids) {
                try {
                    await prisma.video.update({
                        where: { id: videoId },
                        data: { labels: { disconnect: { id: labelId } } },
                    });
                    updated++;
                } catch { }
            }
            return NextResponse.json({ success: true, updated });
        }

        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: "Bulk action failed", details: error.message }, { status: 500 });
    }
}
