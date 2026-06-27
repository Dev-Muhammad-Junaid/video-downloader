import { NextResponse } from "next/server";
import {
    getAllJobs,
    clearCompletedJobs,
    clearAllJobs,
    startDownload,
    resumeInterruptedJobs,
    updateJobPositions,
} from "@/lib/download-manager";
import { retryExport } from "@/lib/export-runner";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const jobs = await getAllJobs();
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
            await clearAllJobs();
        } else {
            await clearCompletedJobs();
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
        const profileId = body.profileId || undefined;
        
        let successCount = 0;
        let errors = [];

        for (const url of urls) {
            try {
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
                            cloudSync,
                            "skip",
                            undefined,
                            profileId
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
                        undefined,
                        cloudSync,
                        "skip",
                        undefined,
                        profileId
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

export async function PATCH(req: Request) {
    try {
        const body = await req.json();

        if (body.action === "resumeInterrupted") {
            const resumed = await resumeInterruptedJobs();
            return NextResponse.json({ success: true, resumed });
        }

        if (body.action === "reorder" && Array.isArray(body.orderedIds)) {
            await updateJobPositions(body.orderedIds);
            return NextResponse.json({ success: true });
        }

        if (body.action !== "retryFailed") {
            return NextResponse.json({ error: "Unsupported queue action" }, { status: 400 });
        }
        const failedJobs = await prisma.downloadQueueJob.findMany({
            where: { status: { in: ["error", "cancelled"] } },
            orderBy: { updatedAt: "desc" },
            take: 100,
        });
        let retried = 0;
        for (const job of failedJobs) {
            try {
                if (job.kind === "export") {
                    // Replay the export from its stored request.
                    const r = await retryExport(job.id);
                    if (r.ok) retried++;
                } else {
                    await startDownload(
                        job.url,
                        job.title,
                        job.sourcePlatform || "unknown",
                        job.mediaType || "video",
                        job.imageUrl || undefined,
                        job.formatId || undefined,
                        false,
                        "skip",
                        undefined,
                        job.qualityPreset?.startsWith("profile:") ? job.qualityPreset.replace("profile:", "") : undefined,
                        job.id,
                        job.thumbnailUrl || job.imageUrl || undefined,
                        job.duration ?? undefined,
                    );
                    retried++;
                }
            } catch (e) {
                // One bad row shouldn't fail the whole batch.
                console.error("[Queue] retryFailed: job", job.id, "failed", e);
            }
        }
        return NextResponse.json({ success: true, retried });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to retry failed queue items", details: error.message },
            { status: 500 }
        );
    }
}
