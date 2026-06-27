import { NextResponse } from "next/server";
import {
    trimVideo,
    cropVideo,
    trimAndCrop,
    burnSubtitles,
    trimBurnSubtitles,
    cropBurnSubtitles,
    trimCropBurnSubtitles,
    trimAudio,
    processAudio,
    convertToMp4,
    editImage,
} from "@/lib/media-editor";
import { createExportJob, updateExportProgress, finishExportJob, registerExportProcess } from "@/lib/download-manager";
import { prisma } from "@/lib/prisma";

/** Best-effort seconds parser for trim values ("12.5" or "00:01:05"). */
function toSeconds(v: unknown): number {
    if (typeof v === "number") return v;
    const s = String(v ?? "");
    if (s.includes(":")) {
        const p = s.split(":").map(Number);
        if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
        if (p.length === 2) return p[0] * 60 + p[1];
    }
    return parseFloat(s) || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnProgress = (outSeconds: number) => void;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { videoId, action, params } = body;

        if (!videoId || !action) {
            return NextResponse.json({ error: "Missing required fields: videoId, action" }, { status: 400 });
        }

        // ── Background export actions (video edit/burn) ──────────────────────
        // These re-encode and can be slow, so they run as tracked "export" jobs
        // that report ffmpeg progress through the same queue/SSE as downloads.
        // The request returns a jobId immediately; the editor closes and the
        // user watches progress in the queue.
        const EXPORT_LABELS: Record<string, string> = {
            "trim": "Trimmed",
            "crop": "Cropped",
            "trim-crop": "Trimmed & Cropped",
            "burn-subtitles": "Captioned",
            "trim-burn": "Trimmed & Captioned",
            "crop-burn": "Cropped & Captioned",
            "trim-crop-burn": "Trimmed, Cropped & Captioned",
        };

        if (action in EXPORT_LABELS) {
            const p = params || {};
            const isTrim = action.startsWith("trim");
            const needsCrop = action.includes("crop");
            const needsSubs = action.includes("burn");

            // Validate required params up-front (before creating a job).
            if (isTrim && (p.startTime === undefined || p.endTime === undefined)) {
                return NextResponse.json({ error: `${action} requires startTime and endTime` }, { status: 400 });
            }
            if (needsCrop && (p.w === undefined || p.h === undefined || p.x === undefined || p.y === undefined)) {
                return NextResponse.json({ error: `${action} requires w, h, x, y` }, { status: 400 });
            }
            if (needsSubs && !p.assContent) {
                return NextResponse.json({ error: `${action} requires assContent` }, { status: 400 });
            }

            const video = await prisma.video.findUnique({ where: { id: videoId } });
            if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

            // Total output duration drives the % bar: trimmed clips know their
            // exact length; full-video edits use the source duration.
            const total = isTrim
                ? Math.max(0, toSeconds(p.endTime) - toSeconds(p.startTime))
                : (video.duration || 0);

            const jobId = await createExportJob({
                title: `${video.title} (${EXPORT_LABELS[action]})`,
                mediaType: video.mediaType ?? "video",
            });
            const onProgress: OnProgress = (secs) =>
                updateExportProgress(jobId, total > 0 ? (secs / total) * 100 : 0);
            // Register the ffmpeg process so cancel / pause / resume / clear-queue
            // can act on the running export.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const registerProc = (proc: any) => registerExportProcess(jobId, proc);

            // Run in the background — do NOT await; return the jobId now.
            (async () => {
                try {
                    let out;
                    if (action === "trim") {
                        out = await trimVideo(videoId, p.startTime, p.endTime, p.inheritSrtContent, onProgress, registerProc);
                    } else if (action === "crop") {
                        out = await cropVideo(videoId, p.w, p.h, p.x, p.y, p.inheritSrtContent, onProgress, registerProc);
                    } else if (action === "trim-crop") {
                        out = await trimAndCrop(videoId, p.startTime, p.endTime, p.w, p.h, p.x, p.y, p.inheritSrtContent, onProgress, registerProc);
                    } else if (action === "burn-subtitles") {
                        out = await burnSubtitles(videoId, p.assContent, p.inheritSrtContent, onProgress, registerProc);
                    } else if (action === "trim-burn") {
                        out = await trimBurnSubtitles(videoId, p.startTime, p.endTime, p.assContent, p.inheritSrtContent, onProgress, registerProc);
                    } else if (action === "crop-burn") {
                        out = await cropBurnSubtitles(videoId, p.w, p.h, p.x, p.y, p.assContent, p.inheritSrtContent, onProgress, registerProc);
                    } else { // trim-crop-burn
                        out = await trimCropBurnSubtitles(videoId, p.startTime, p.endTime, p.w, p.h, p.x, p.y, p.assContent, p.inheritSrtContent, onProgress, registerProc);
                    }
                    await finishExportJob(jobId, { downloadPath: out?.localPath });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Export failed";
                    console.error(`[Export ${action}] failed:`, err);
                    await finishExportJob(jobId, { error: message });
                }
            })();

            return NextResponse.json({ success: true, jobId });
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
