"use client";

import React, { useCallback, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Video } from "@/types/media";
import {
    Subtitle,
    subtitlesToSrt,
    clipAndShiftSubtitles,
    composeSubtitleAss,
} from "@/components/video-editor/subtitle-types";
import { SubtitleStyleConfig } from "@/lib/ass-builder";
import { CropState } from "@/components/video-editor/crop-overlay";
import type { ExportQuality } from "@/lib/encoder";

/** Remembers the user's last pick so the choice persists between exports. */
const QUALITY_STORAGE_KEY = "snapdown.exportQuality";

function isQuality(v: unknown): v is ExportQuality {
    return v === "fast" || v === "balanced" || v === "maximum";
}

/**
 * The remembered tier, read through useSyncExternalStore rather than restored
 * in an effect: the server snapshot is the default, so the first client render
 * matches the server and hydration stays clean, and the stored value is picked
 * up in the same commit instead of a second one.
 */
const qualityListeners = new Set<() => void>();

function subscribeQuality(onChange: () => void) {
    qualityListeners.add(onChange);
    // Another window (or another editor instance) changing the pick.
    window.addEventListener("storage", onChange);
    return () => {
        qualityListeners.delete(onChange);
        window.removeEventListener("storage", onChange);
    };
}

function readQuality(): ExportQuality {
    try {
        const saved = window.localStorage.getItem(QUALITY_STORAGE_KEY);
        if (isQuality(saved)) return saved;
    } catch { /* private mode / storage blocked — the default is fine */ }
    return "balanced";
}

function writeQuality(next: ExportQuality) {
    try { window.localStorage.setItem(QUALITY_STORAGE_KEY, next); } catch { /* ignore */ }
    qualityListeners.forEach((l) => l());
}

type AspectRatio = "original" | "16:9" | "9:16" | "1:1" | "4:5";

interface UseVideoExportParams {
    video: Video;
    mode: "trim" | "crop" | "subtitles";
    trimStart: number;
    trimEnd: number;
    aspectRatio: AspectRatio;
    crop: CropState;
    subtitles: Subtitle[];
    styleConfig: SubtitleStyleConfig;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    /** Re-encode so the cut lands exactly where asked, rather than snapping to
     *  the nearest keyframe. Only applies to a pure trim; every other action
     *  re-encodes anyway. */
    /** Container, resolution and whether to keep the audio track. Distinct
     *  from the preview volume, which never leaves the editor. */
    output?: { removeAudio: boolean; format: string; resolution: string };
    onRefreshLibrary?: () => void;
    onClose: () => void;
}

/**
 * Builds and submits the FFmpeg export request for the video editor (trim /
 * crop / burn-subtitles, plus their combinations). Extracted verbatim from
 * video-editor-modal so the modal owns presentation and this owns the export
 * wiring. The ASS is composed here the same way the preview composes it, so the
 * burn is byte-identical to what JASSUB showed.
 */
export function useVideoExport({
    video,
    mode,
    trimStart,
    trimEnd,
    aspectRatio,
    crop,
    subtitles,
    styleConfig,
    videoRef,
    output,
    onRefreshLibrary,
    onClose,
}: UseVideoExportParams) {
    const [isExporting, setIsExporting] = useState(false);
    /**
     * Subtitles are included by default when the video has them.
     *
     * Pressing Export should produce the obvious thing without asking: if a
     * video has subtitles, the version you want almost always has them too.
     * Defaulting to off meant every captioned export needed a checkbox found
     * and ticked first, and silently produced a bare video if you didn't.
     *
     * `undefined` means "not chosen yet", so this follows the video rather than
     * sticking at whatever the previous one needed.
     */
    const [includeOverride, setIncludeSubtitlesOverride] = useState<boolean | undefined>(undefined);
    const quality = useSyncExternalStore(subscribeQuality, readQuality, () => "balanced" as ExportQuality);
    const setQuality = useCallback((next: ExportQuality) => writeQuality(next), []);

    const hasSubtitles = subtitles.length > 0;
    const includeSubtitles = includeOverride ?? hasSubtitles;
    const setIncludeSubtitles = setIncludeSubtitlesOverride;

    // Compute pixel-level crop from the percentage state + actual video dimensions
    const getCropPixels = () => {
        if (!videoRef.current) return null;
        const nw = videoRef.current.videoWidth;
        const nh = videoRef.current.videoHeight;
        if (!nw || !nh) return null;
        return {
            x: Math.round((crop.x / 100) * nw),
            y: Math.round((crop.y / 100) * nh),
            w: Math.round((crop.w / 100) * nw),
            h: Math.round((crop.h / 100) * nh),
        };
    };

    const handleApplyExport = async () => {
        setIsExporting(true);
        let actionLabel = "trimmed";
        if (mode === "crop") actionLabel = "cropped";
        if (mode === "subtitles") actionLabel = "captioned";

        const toastId = toast.loading(`Exporting your ${actionLabel} media...`);
        try {
            const bodyPayload: Record<string, unknown> = { videoId: video.id };

            const wantSubs = includeSubtitles && hasSubtitles && mode !== "subtitles";

            // The video's display size — exactly the frame the burn renders onto
            // (FFmpeg auto-rotates to display orientation). Used as the ASS
            // PlayRes so preview and burn share identical geometry.
            const vWidth  = videoRef.current?.videoWidth  ?? 1280;
            const vHeight = videoRef.current?.videoHeight ?? 720;
            const displayDims = { width: vWidth, height: vHeight };

            const clippedSubtitles = mode === "trim"
                ? clipAndShiftSubtitles(subtitles, trimStart, trimEnd)
                : subtitles;

            // SRT for inheritance (always original timing — user can edit later)
            const inheritSrtContent = hasSubtitles ? subtitlesToSrt(clippedSubtitles) : undefined;

            // Build the FINAL ASS here, the same way the preview does, and send
            // it for the server to burn verbatim. One source of truth → the
            // export is byte-identical to what JASSUB showed. `vDim` is the
            // frame the subtitles land on: crop output for crop, else display.
            const composeBurnAss = (subs: Subtitle[], vDim: { width: number; height: number }) =>
                composeSubtitleAss(subs, styleConfig, vDim);

            if (mode === "trim") {
                if (trimEnd - trimStart <= 0.1) throw new Error("Trim duration is too short.");
                const hasCrop = aspectRatio !== "original";
                const cropPx = hasCrop ? getCropPixels() : null;
                if (hasCrop && !cropPx) throw new Error("Could not detect video resolution.");

                if (hasCrop && wantSubs) {
                    bodyPayload.action = "trim-crop-burn";
                    bodyPayload.params = { startTime: trimStart, endTime: trimEnd, ...cropPx, assContent: composeBurnAss(clippedSubtitles, { width: cropPx!.w, height: cropPx!.h }), inheritSrtContent };
                } else if (hasCrop) {
                    bodyPayload.action = "trim-crop";
                    bodyPayload.params = { startTime: trimStart, endTime: trimEnd, ...cropPx, inheritSrtContent };
                } else if (wantSubs) {
                    bodyPayload.action = "trim-burn";
                    bodyPayload.params = { startTime: trimStart, endTime: trimEnd, assContent: composeBurnAss(clippedSubtitles, displayDims), inheritSrtContent };
                } else {
                    bodyPayload.action = "trim";
                    bodyPayload.params = { startTime: trimStart, endTime: trimEnd, inheritSrtContent };
                }
            } else if (mode === "crop") {
                const cropPx = getCropPixels();
                if (!cropPx) throw new Error("Could not detect video resolution.");
                if (wantSubs) {
                    bodyPayload.action = "crop-burn";
                    bodyPayload.params = { ...cropPx, assContent: composeBurnAss(subtitles, { width: cropPx.w, height: cropPx.h }), inheritSrtContent };
                } else {
                    bodyPayload.action = "crop";
                    bodyPayload.params = { ...cropPx, inheritSrtContent };
                }
            } else if (mode === "subtitles") {
                if (subtitles.length === 0) throw new Error("No subtitles to burn. Transcribe the video first.");
                bodyPayload.action = "burn-subtitles";
                bodyPayload.params = {
                    // Identical to the preview ASS (same subs, config, dims).
                    assContent: composeBurnAss(subtitles, displayDims),
                    // Always inherit original subtitles so the captioned video stays editable
                    inheritSrtContent: subtitlesToSrt(subtitles),
                };
            }

            // The encoder tier applies to every re-encoding action. A pure trim
            // is a stream copy, so it ignores this — harmless to send.
            if (bodyPayload.params) {
                (bodyPayload.params as Record<string, unknown>).quality = quality;
                // Only send what differs from the source, so an untouched
                // export doesn't carry settings that change nothing.
                if (output && (output.removeAudio || output.format !== "original" || output.resolution !== "original")) {
                    (bodyPayload.params as Record<string, unknown>).output = output;
                }
            }

            const data = await api.post<{ jobId?: string }>("/api/library/edit", bodyPayload);

            // Video exports now run as background jobs (response carries a jobId,
            // not the finished video). Hand off to the queue and close the editor;
            // synchronous actions (audio/image) still return the video directly.
            if (data.jobId) {
                toast.success(`Export started — track progress in the queue`, { id: toastId });
            } else {
                toast.success(`Media successfully ${actionLabel}!`, { id: toastId });
            }
            onRefreshLibrary?.();
            onClose();
        } catch (error: any) {
            toast.error(error.message, { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    return {
        isExporting,
        includeSubtitles,
        setIncludeSubtitles,
        /** True only when the user actively turned subtitles ON for this
         *  export, as opposed to them being on because the video has them.
         *  The floating style panel keys off this — appearing over the video
         *  simply because a default was applied is not something anyone asked
         *  for. */
        subtitlesExplicitlyEnabled: includeOverride === true,
        quality,
        setQuality,
        handleApplyExport,
    };
}
