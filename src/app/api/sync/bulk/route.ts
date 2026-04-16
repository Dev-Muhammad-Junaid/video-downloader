import { NextResponse } from "next/server";
import { uploadToCloud } from "@/lib/cloud";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const { ids } = await req.json();
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "ids array required" }, { status: 400 });
        }

        let uploaded = 0;
        let skipped = 0;
        const errors: { id: string; title: string; error: string }[] = [];

        for (const videoId of ids) {
            try {
                const result = await uploadToCloud(videoId);
                if (result.key) {
                    uploaded++;
                }
            } catch (err: any) {
                const video = await prisma.video.findUnique({ where: { id: videoId }, select: { title: true, cloudKey: true } });
                if (video?.cloudKey) {
                    skipped++;
                } else {
                    const title = video?.title || videoId;
                    errors.push({ id: videoId, title, error: err.message || "Unknown error" });

                    await prisma.downloadLog.create({
                        data: {
                            url: videoId,
                            title: title,
                            status: "error",
                            type: "cloud-upload",
                            errorMessage: err.message || "Unknown error",
                            output: err.stack?.slice(0, 500),
                        },
                    }).catch(() => {});
                }
            }
        }

        return NextResponse.json({
            success: true,
            uploaded,
            skipped,
            total: ids.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Bulk upload failed", details: error.message },
            { status: 500 }
        );
    }
}
