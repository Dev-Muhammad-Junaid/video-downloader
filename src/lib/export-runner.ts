import type { VideoOutputOptions } from "@/lib/media-editor";
import {
    trimVideo,
    cropVideo,
    trimAndCrop,
    burnSubtitles,
    trimBurnSubtitles,
    cropBurnSubtitles,
    trimCropBurnSubtitles,
    processAudio,
    trimAudio,
} from "@/lib/media-editor";
import {
    createExportJob,
    resetExportJob,
    updateExportProgress,
    finishExportJob,
    registerExportProcess,
    markExportRunning,
} from "@/lib/download-manager";
import { parseTimeToSeconds } from "@/lib/time";
import { prisma } from "@/lib/prisma";
import pLimit from "p-limit";
import {
    hasHardwareEncoder,
    isExportQuality,
    DEFAULT_EXPORT_QUALITY,
    type ExportQuality,
} from "@/lib/encoder";

/**
 * Exports run through their own concurrency limiter.
 *
 * Downloads have always been capped at 3 (`pLimit` in download-manager), but
 * exports bypassed that entirely — `launchExport` fired a bare async call, so
 * N simultaneous exports meant N simultaneous ffmpeg processes competing for
 * the same cores. Two of the old subtitle burns at once demanded ~950% CPU on
 * an 8-core machine.
 *
 * Hardware encoding shares one media engine, so 2 in flight keeps it fed
 * without queueing inside the driver. The software fallback asks for most of
 * the CPU per job, so it gets 1.
 *
 * Hoisted onto globalThis for the same reason the download limiter is: Next's
 * dev server re-evaluates modules, and a fresh limiter per reload would defeat
 * the cap.
 */
const globalForExports = globalThis as unknown as {
    exportQueue?: ReturnType<typeof pLimit>;
};
const exportLimit = globalForExports.exportQueue || pLimit(hasHardwareEncoder() ? 2 : 1);
if (process.env.NODE_ENV !== "production") globalForExports.exportQueue = exportLimit;

/**
 * Single source of truth for running a video export (trim / crop / subtitle
 * burn) as a background queue job. Used by the initial submit (library/edit
 * route) and by Retry (both per-item and bulk), so there's one code path and
 * no duplicated dispatch.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExportParams = Record<string, any>;
export interface ExportSpec {
    videoId: string;
    action: string;
    params: ExportParams;
}

/** Human label per action, used for the job title. */
export const EXPORT_LABELS: Record<string, string> = {
    "trim": "Trimmed",
    "crop": "Cropped",
    "trim-crop": "Trimmed & Cropped",
    "burn-subtitles": "Captioned",
    "trim-burn": "Trimmed & Captioned",
    "crop-burn": "Cropped & Captioned",
    "trim-crop-burn": "Trimmed, Cropped & Captioned",
    // Audio edits also run as background jobs so they appear in the queue with
    // progress, just like video exports.
    "process-audio": "Edited Audio",
    "trim-audio": "Trimmed Audio",
};

export function isExportAction(action: string): boolean {
    return action in EXPORT_LABELS;
}

/** Validate an export request's params. Returns an error string, or null. */
export function validateExportParams(action: string, p: ExportParams): string | null {
    const isTrim = action.startsWith("trim");
    const needsCrop = action.includes("crop");
    const needsSubs = action.includes("burn");
    if (isTrim && (p.startTime === undefined || p.endTime === undefined)) {
        return `${action} requires startTime and endTime`;
    }
    if (needsCrop && (p.w === undefined || p.h === undefined || p.x === undefined || p.y === undefined)) {
        return `${action} requires w, h, x, y`;
    }
    if (needsSubs && !p.assContent) {
        return `${action} requires assContent`;
    }
    return null;
}

/** Run the chosen export action in the background against an existing job id. */
function launchExport(jobId: string, spec: ExportSpec, total: number): void {
    const { videoId, action, params: p } = spec;
    const quality: ExportQuality = isExportQuality(p.quality) ? p.quality : DEFAULT_EXPORT_QUALITY;
    // Container, resolution and audio apply to every video export; undefined
    // means "leave it as the source has it".
    const output = p.output as VideoOutputOptions | undefined;
    // Prefer the duration we computed up front; if it's unknown (0), fall back to
    // the total ffmpeg reports from the source file so the bar still advances.
    const onProgress = (secs: number, totalSecs?: number) => {
        const denom = total > 0 ? total : (totalSecs || 0);
        updateExportProgress(jobId, denom > 0 ? (secs / denom) * 100 : 0);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registerProc = (proc: any) => registerExportProcess(jobId, proc);

    void exportLimit(async () => {
        // The job sat in the queue as "queued" until now; if it was cancelled
        // while waiting there is nothing to run.
        if (!(await markExportRunning(jobId))) return;
        try {
            let out;
            if (action === "process-audio") {
                out = await processAudio(videoId, p, onProgress, registerProc);
            } else if (action === "trim-audio") {
                out = await trimAudio(videoId, p.startTime, p.endTime, onProgress, registerProc);
            } else if (action === "trim") {
                out = await trimVideo(videoId, p.startTime, p.endTime, p.inheritSrtContent, onProgress, registerProc, quality, output);
            } else if (action === "crop") {
                out = await cropVideo(videoId, p.w, p.h, p.x, p.y, p.inheritSrtContent, onProgress, registerProc, quality, output);
            } else if (action === "trim-crop") {
                out = await trimAndCrop(videoId, p.startTime, p.endTime, p.w, p.h, p.x, p.y, p.inheritSrtContent, onProgress, registerProc, quality, output);
            } else if (action === "burn-subtitles") {
                out = await burnSubtitles(videoId, p.assContent, p.inheritSrtContent, onProgress, registerProc, quality, output);
            } else if (action === "trim-burn") {
                out = await trimBurnSubtitles(videoId, p.startTime, p.endTime, p.assContent, p.inheritSrtContent, onProgress, registerProc, quality, output);
            } else if (action === "crop-burn") {
                out = await cropBurnSubtitles(videoId, p.w, p.h, p.x, p.y, p.assContent, p.inheritSrtContent, onProgress, registerProc, quality, output);
            } else { // trim-crop-burn
                out = await trimCropBurnSubtitles(videoId, p.startTime, p.endTime, p.w, p.h, p.x, p.y, p.assContent, p.inheritSrtContent, onProgress, registerProc, quality, output);
            }
            await finishExportJob(jobId, { downloadPath: out?.localPath });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Export failed";
            console.error(`[Export ${action}] failed:`, err);
            await finishExportJob(jobId, { error: message });
        }
    });
}

/** Compute the output duration for the % bar (trim length, or source length). */
async function exportTotalSeconds(spec: ExportSpec, videoDuration: number | null): Promise<number> {
    if (spec.action.startsWith("trim")) {
        return Math.max(0, parseTimeToSeconds(spec.params.endTime) - parseTimeToSeconds(spec.params.startTime));
    }
    return videoDuration || 0;
}

/**
 * Submit a new export: validate, create a tracked job (persisting the spec for
 * Retry), and launch it in the background. Returns the jobId, or an error.
 */
export async function submitExport(spec: ExportSpec): Promise<{ jobId?: string; error?: string; status?: number }> {
    const err = validateExportParams(spec.action, spec.params);
    if (err) return { error: err, status: 400 };

    const video = await prisma.video.findUnique({ where: { id: spec.videoId } });
    if (!video) return { error: "Video not found", status: 404 };

    const total = await exportTotalSeconds(spec, video.duration);
    const jobId = await createExportJob({
        title: `${video.title} (${EXPORT_LABELS[spec.action]})`,
        mediaType: video.mediaType ?? "video",
        exportSpec: JSON.stringify(spec),
    });
    launchExport(jobId, spec, total);
    return { jobId };
}

/**
 * Retry an existing export job in place: read its stored spec, reset the row to
 * processing, and relaunch. Reuses the same jobId/row so the queue updates in
 * place instead of spawning a duplicate.
 */
export async function retryExport(jobId: string): Promise<{ ok: boolean; error?: string; status?: number }> {
    const job = await prisma.downloadQueueJob.findUnique({ where: { id: jobId } });
    if (!job || job.kind !== "export") return { ok: false, error: "Export job not found", status: 404 };
    if (!job.exportSpec) return { ok: false, error: "This export can't be retried (no saved settings)", status: 400 };

    let spec: ExportSpec;
    try {
        spec = JSON.parse(job.exportSpec);
    } catch {
        return { ok: false, error: "Saved export settings are corrupt", status: 400 };
    }

    const err = validateExportParams(spec.action, spec.params);
    if (err) return { ok: false, error: err, status: 400 };

    const video = await prisma.video.findUnique({ where: { id: spec.videoId } });
    if (!video) return { ok: false, error: "Source video no longer exists", status: 404 };

    const total = await exportTotalSeconds(spec, video.duration);
    await resetExportJob(jobId, job.title);
    launchExport(jobId, spec, total);
    return { ok: true };
}
