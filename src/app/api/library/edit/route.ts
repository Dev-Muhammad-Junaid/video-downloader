import {
    trimAudio,
    processAudio,
    convertToMp4,
    editImage,
} from "@/lib/media-editor";
import { isExportAction, submitExport, retryExport } from "@/lib/export-runner";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { videoId, action, params } = body;

        if (!action) {
            return NextResponse.json({ error: "Missing required field: action" }, { status: 400 });
        }

        // ── Retry an existing export job (replays its stored request) ────────
        if (action === "retry-export") {
            const { jobId } = body;
            if (!jobId) return NextResponse.json({ error: "retry-export requires jobId" }, { status: 400 });
            const r = await retryExport(jobId);
            if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 });
            return NextResponse.json({ success: true, jobId });
        }

        if (!videoId) {
            return NextResponse.json({ error: "Missing required field: videoId" }, { status: 400 });
        }

        // ── Background export actions (video edit/burn) ──────────────────────
        // These re-encode and can be slow, so they run as tracked "export" jobs
        // that report ffmpeg progress through the same queue/SSE as downloads.
        // The request returns a jobId immediately; the editor closes and the
        // user watches progress in the queue. The full request is persisted so
        // a failed/cancelled export can be replayed via Retry.
        if (isExportAction(action)) {
            const r = await submitExport({ videoId, action, params: params || {} });
            if (r.error) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 });
            return NextResponse.json({ success: true, jobId: r.jobId });
        }

        // ── Synchronous actions (fast / non-video) ──────────────────────────
        let result;

        if (action === "trim-audio") {
            const { startTime, endTime } = params;
            if (startTime === undefined || endTime === undefined) {
                return NextResponse.json({ error: "trim-audio requires startTime and endTime" }, { status: 400 });
            }
            result = await trimAudio(videoId, startTime, endTime);

        } else if (action === "process-audio") {
            // Unified audio editor: trim + format/bitrate + gain + normalize + fades + voice enhance.
            result = await processAudio(videoId, params || {});

        } else if (action === "convert-mp4") {
            result = await convertToMp4(videoId);

        } else if (action === "image-edit") {
            const { crop, rotation, brightness, contrast, saturation, format, quality } = params;
            result = await editImage(videoId, { crop, rotation, brightness, contrast, saturation, format, quality });

        } else {
            return NextResponse.json({ error: "Invalid action." }, { status: 400 });
        }

        return NextResponse.json({ success: true, video: result });

    } catch (error: any) {
        console.error("Media Edit Error:", error);
        return NextResponse.json({ error: "Failed to edit media", details: error.message }, { status: 500 });
    }
}
