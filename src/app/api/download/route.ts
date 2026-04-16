import { NextResponse } from "next/server";
import { startDownload } from "@/lib/download-manager";

export async function POST(req: Request) {
    try {
        const { url, title, sourcePlatform, mediaType, imageUrl, thumbnail, formatId, profileId, retryJobId, duration } = await req.json();

        if (!url || !title) {
            return NextResponse.json({ error: "URL and title are required" }, { status: 400 });
        }

        const job = await startDownload(
            url,
            title,
            sourcePlatform || "unknown",
            mediaType || "video",
            imageUrl || thumbnail,
            formatId,
            false,
            "skip",
            undefined,
            profileId,
            retryJobId,
            thumbnail,
            duration,
        );

        return NextResponse.json({ jobId: job.id, status: job.status });
    } catch (error: any) {
        console.error("Failed to start download:", error);
        return NextResponse.json(
            { error: "Failed to start download", details: error.message },
            { status: 500 }
        );
    }
}
