import { NextResponse } from "next/server";
import { getAllJobs, clearCompletedJobs, clearAllJobs, startDownload } from "@/lib/download-manager";

export async function GET() {
    try {
        const jobs = getAllJobs();
        return NextResponse.json(jobs);
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to fetch queue", details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get("mode") || "completed";

        if (mode === "all") {
            clearAllJobs();
        } else {
            clearCompletedJobs();
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to clear queue", details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const urls = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
        
        if (urls.length === 0) {
            return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
        }
        
        const cloudSync = body.cloudSync === true;
        
        let successCount = 0;
        let errors = [];

        for (const url of urls) {
            try {
                // 1. Fetch metadata natively using the existing route logic
                const origin = new URL(req.url).origin;
                const previewRes = await fetch(`${origin}/api/download/preview`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                if (!previewRes.ok) {
                    const err = await previewRes.json();
                    throw new Error(err.error || "Failed to fetch metadata");
                }
                
                const metadata = await previewRes.json();
                
                if (metadata.isPlaylist && metadata.items) {
                    for (const item of metadata.items) {
                        await startDownload(
                            item.url,
                            item.title || "Playlist Item",
                            "unknown",
                            "video",
                            item.thumbnail,
                            undefined,
                            cloudSync
                        );
                        successCount++;
                    }
                } else {
                    await startDownload(
                        metadata.originalUrl || url,
                        metadata.title || "Unknown Title",
                        metadata.sourcePlatform || "unknown",
                        metadata.mediaType || "video",
                        metadata.thumbnail || metadata.imageUrl,
                        undefined, // Auto-selects best format by default
                        cloudSync
                    );
                    successCount++;
                }

            } catch (err: any) {
                errors.push({ url, error: err.message });
            }
        }
        
        if (successCount === 0 && errors.length > 0) {
            return NextResponse.json({ error: "Failed to queue any URLs", details: errors }, { status: 500 });
        }

        return NextResponse.json({ success: true, queued: successCount, errors: errors.length > 0 ? errors : undefined });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to process queue request", details: error.message },
            { status: 500 }
        );
    }
}
