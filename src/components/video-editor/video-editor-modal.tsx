"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    X,
    Play,
    Pause,
    RotateCcw,
    Scissors,
    Loader2,
    Crop as CropIcon,
    Captions,
    Download,
    Mic,
    RectangleHorizontal,
} from "lucide-react";
import { TimelineScrubber } from "./timeline-scrubber";
import { toast } from "sonner";
import { motion, AnimatePresence, useAnimationFrame } from "framer-motion";
import { CropOverlay, CropState } from "./crop-overlay";
import { SubtitleOverlay } from "./subtitle-overlay";
import { SubtitleEditor } from "./subtitle-editor";
import { StylePresetSelector } from "./style-preset-selector";
import {
    Subtitle,
    parseSrt,
    parseVtt,
    subtitlesToSrt,
} from "./subtitle-types";

interface Video {
    id: string;
    title: string;
    localPath: string;
    mediaType?: string | null;
    transcriptStatus?: string | null;
    transcriptText?: string | null;
    transcriptPath?: string | null;
}

interface VideoEditorModalProps {
    video: Video;
    onClose: () => void;
    onRefreshLibrary?: () => void;
}

export function VideoEditorModal({
    video,
    onClose,
    onRefreshLibrary,
}: VideoEditorModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const timeDisplayRef = useRef<HTMLSpanElement>(null);

    const [duration, setDuration] = useState(0);

    // isPlaying is driven entirely by native video events — no async races
    const [isPlaying, setIsPlaying] = useState(false);
    // Ref mirror for use inside useAnimationFrame (avoids stale closure)
    const isPlayingRef = useRef(false);

    // currentTime for React state — updated via timeupdate (~4Hz), not 60fps
    const [currentTime, setCurrentTime] = useState(0);
    // Ref that's always fresh, used inside rAF for trim bounds checking
    const currentTimeRef = useRef(0);

    const [mode, setMode] = useState<"trim" | "crop" | "subtitles">("trim");

    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);

    // Default 80% box centered
    const [crop, setCrop] = useState<CropState>({ x: 10, y: 10, w: 80, h: 80 });

    // Subtitle state
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [stylePreset, setStylePreset] = useState("classic");
    const [fontFamily, setFontFamily] = useState("Arial");
    const [isTranscribing, setIsTranscribing] = useState(false);

    const [isExporting, setIsExporting] = useState(false);

    // Aspect ratio presets — shown in all modes; in trim, applies crop+trim in one pass
    type AspectRatio = "original" | "16:9" | "9:16" | "1:1" | "4:5";
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>("original");

    const ASPECT_RATIOS: { id: AspectRatio; label: string; w: number; h: number }[] = [
        { id: "original", label: "Original", w: 0, h: 0 },
        { id: "16:9", label: "16:9", w: 16, h: 9 },
        { id: "9:16", label: "9:16", w: 9, h: 16 },
        { id: "1:1", label: "1:1", w: 1, h: 1 },
        { id: "4:5", label: "4:5", w: 4, h: 5 },
    ];

    const applyAspectRatio = (ratio: AspectRatio) => {
        setAspectRatio(ratio);
        if (ratio === "original" || !videoRef.current) {
            setCrop({ x: 10, y: 10, w: 80, h: 80 });
            return;
        }
        const preset = ASPECT_RATIOS.find(a => a.id === ratio)!;
        const nw = videoRef.current.videoWidth;
        const nh = videoRef.current.videoHeight;
        if (!nw || !nh) return;
        const targetRatio = preset.w / preset.h;
        const videoRatio = nw / nh;

        let cropW: number, cropH: number;
        if (targetRatio > videoRatio) {
            cropW = 100;
            cropH = (videoRatio / targetRatio) * 100;
        } else {
            cropH = 100;
            cropW = (targetRatio / videoRatio) * 100;
        }
        setCrop({
            x: (100 - cropW) / 2,
            y: (100 - cropH) / 2,
            w: cropW,
            h: cropH,
        });
    };

    // Prevent body scroll while editor is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    // Load subtitles from the video's existing transcript on mount
    useEffect(() => {
        const loadSubtitles = async () => {
            if (video.transcriptStatus !== "completed" || !video.transcriptPath) return;
            try {
                const res = await fetch(`/api/media?path=${encodeURIComponent(video.transcriptPath)}`);
                if (!res.ok) return;
                const content = await res.text();
                if (content.trim().startsWith("WEBVTT") || video.transcriptPath.endsWith(".vtt")) {
                    setSubtitles(parseVtt(content));
                } else {
                    setSubtitles(parseSrt(content));
                }
            } catch (err) {
                console.error("Failed to load subtitles:", err);
            }
        };
        loadSubtitles();
    }, [video.transcriptStatus, video.transcriptPath]);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const d = videoRef.current.duration;
            setDuration(d);
            setTrimEnd(d);
        }
    };

    // ── FIX #1: useAnimationFrame is ONLY for the time display DOM update
    //   and the trim-bounds enforcement. No more setCurrentTime here.
    //   This eliminates the 60fps React re-render cascade.
    useAnimationFrame(() => {
        if (!videoRef.current) return;
        const t = videoRef.current.currentTime;
        currentTimeRef.current = t;

        // Direct DOM mutation — zero React overhead
        if (timeDisplayRef.current) {
            timeDisplayRef.current.innerText = formatTime(t);
        }

        // Trim-end boundary enforcement
        if (t >= trimEnd && isPlayingRef.current && mode === "trim") {
            videoRef.current.pause();
            videoRef.current.currentTime = trimEnd;
        }
    });

    // ── timeupdate fires ~4× per second — enough for subtitle sync, no jank
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTimeUpdate = () => setCurrentTime(video.currentTime);
        video.addEventListener("timeupdate", onTimeUpdate);
        return () => video.removeEventListener("timeupdate", onTimeUpdate);
    }, []);

    // ── FIX #2: isPlaying state is driven entirely by native video events
    const handleVideoPlay = useCallback(() => {
        setIsPlaying(true);
        isPlayingRef.current = true;
    }, []);
    const handleVideoPause = useCallback(() => {
        setIsPlaying(false);
        isPlayingRef.current = false;
    }, []);

    // togglePlay no longer manages isPlaying state — the events do
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            if (mode === "trim" && currentTimeRef.current >= trimEnd) {
                videoRef.current.currentTime = trimStart;
            }
            videoRef.current.play().catch(console.error);
        } else {
            videoRef.current.pause();
        }
    }, [mode, trimEnd, trimStart]);

    // Keyboard shortcuts (subtitle mode)
    useEffect(() => {
        if (mode !== "subtitles") return;
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            switch (e.key) {
                case " ":
                    e.preventDefault();
                    togglePlay();
                    break;
                case "j":
                    if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                    break;
                case "l":
                    if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
                    break;
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [mode, togglePlay, duration]);

    const handleSeek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
            currentTimeRef.current = time;
        }
    };

    // Transcribe the video and load resulting VTT as subtitles
    const handleTranscribe = async () => {
        setIsTranscribing(true);
        const toastId = toast.loading("Transcribing video — this may take a moment...");
        try {
            const res = await fetch(`/api/transcription/${video.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || "Transcription request failed");
            }
            let pollCount = 0;
            const poll = setInterval(async () => {
                pollCount++;
                if (pollCount > 120) {
                    clearInterval(poll);
                    setIsTranscribing(false);
                    toast.error("Transcription timed out", { id: toastId });
                    return;
                }
                try {
                    const statusRes = await fetch(`/api/transcription/${video.id}`);
                    const statusData = await statusRes.json();
                    if (statusData.status === "completed") {
                        clearInterval(poll);
                        setIsTranscribing(false);
                        toast.success("Transcription complete! Subtitles loaded.", { id: toastId });
                        if (statusData.vttPath) {
                            try {
                                const vttRes = await fetch(`/api/media?path=${encodeURIComponent(statusData.vttPath)}`);
                                if (vttRes.ok) setSubtitles(parseVtt(await vttRes.text()));
                            } catch { /* ignore */ }
                        }
                        onRefreshLibrary?.();
                    } else if (statusData.status === "error") {
                        clearInterval(poll);
                        setIsTranscribing(false);
                        toast.error("Transcription failed", { id: toastId });
                    }
                } catch { /* ignore */ }
            }, 3000);
        } catch (err: any) {
            setIsTranscribing(false);
            toast.error(err.message, { id: toastId });
        }
    };

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

            if (mode === "trim") {
                if (trimEnd - trimStart <= 0.1) throw new Error("Trim duration is too short.");
                if (aspectRatio !== "original") {
                    const cropPx = getCropPixels();
                    if (!cropPx) throw new Error("Could not detect video resolution.");
                    bodyPayload.action = "trim-crop";
                    bodyPayload.params = { startTime: trimStart, endTime: trimEnd, ...cropPx };
                } else {
                    bodyPayload.action = "trim";
                    bodyPayload.params = { startTime: trimStart, endTime: trimEnd };
                }
            } else if (mode === "crop") {
                const cropPx = getCropPixels();
                if (!cropPx) throw new Error("Could not detect video resolution.");
                bodyPayload.action = "crop";
                bodyPayload.params = cropPx;
            } else if (mode === "subtitles") {
                if (subtitles.length === 0) throw new Error("No subtitles to burn. Transcribe the video first.");
                bodyPayload.action = "burn-subtitles";
                bodyPayload.params = {
                    srtContent: subtitlesToSrt(subtitles),
                    stylePreset,
                    fontFamily,
                };
            }

            const res = await fetch("/api/library/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to edit media");

            toast.success(`Media successfully ${actionLabel}!`, { id: toastId });
            onRefreshLibrary?.();
            onClose();
        } catch (error: any) {
            toast.error(error.message, { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    const hasSubtitles = subtitles.length > 0;

    // SnapStudio-style: numeric aspect ratio for the container constraint.
    // null = "original" → video uses object-contain, no constraint.
    const targetRatioNum = useMemo(() => {
        if (aspectRatio === "original") return null;
        const p = ASPECT_RATIOS.find(a => a.id === aspectRatio);
        return p && p.w ? p.w / p.h : null;
    }, [aspectRatio]);

    // CropOverlay is only shown in crop mode (drag-to-crop).
    // In trim mode the container shape itself is the preview.
    const showCropOverlay = mode === "crop";

    return (
        <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed inset-0 z-[60] bg-black text-white flex flex-col"
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/50 backdrop-blur-md relative shrink-0">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="rounded-full hover:bg-white/10"
                    >
                        <X className="w-5 h-5 text-white" />
                    </Button>
                    <h2 className="text-lg font-medium tracking-tight text-white/90 truncate max-w-sm">
                        Editing {video.title}
                    </h2>
                </div>

                {/* Mode segmented control with sliding pill */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 p-1 rounded-full flex gap-1 items-center backdrop-blur-xl">
                    {(["trim", "crop", "subtitles"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className="relative px-4 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 flex items-center gap-2"
                        >
                            {mode === m && (
                                <motion.div
                                    layoutId="mode-pill"
                                    className="absolute inset-0 bg-white rounded-full shadow-lg"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                            <span className={cn("relative z-10 transition-colors duration-200 flex items-center gap-2", mode === m ? "text-black" : "text-white/70 hover:text-white")}>
                                {m === "trim" && <Scissors className="w-4 h-4" />}
                                {m === "crop" && <CropIcon className="w-4 h-4" />}
                                {m === "subtitles" && <Captions className="w-4 h-4" />}
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setAspectRatio("original");
                            if (mode === "trim") { setTrimStart(0); setTrimEnd(duration); handleSeek(0); }
                            else if (mode === "crop") { setCrop({ x: 10, y: 10, w: 80, h: 80 }); }
                            else { setStylePreset("classic"); setFontFamily("Arial"); }
                        }}
                    >
                        <RotateCcw className="w-4 h-4 mr-2" /> Reset
                    </Button>
                    <Button
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20 shadow-lg"
                        onClick={handleApplyExport}
                        disabled={isExporting || (mode === "subtitles" && !hasSubtitles)}
                    >
                        {isExporting ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : mode === "trim" ? (
                            <Scissors className="w-4 h-4 mr-2" />
                        ) : mode === "crop" ? (
                            <CropIcon className="w-4 h-4 mr-2" />
                        ) : (
                            <Download className="w-4 h-4 mr-2" />
                        )}
                        Export {mode === "trim" ? "Trim" : mode === "crop" ? "Crop" : "with Subtitles"}
                    </Button>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 overflow-hidden flex">
                {/* Video Stage */}
                <div className="flex-1 overflow-hidden relative bg-neutral-950 flex flex-col min-w-0">
                    {/* Video container — fills all available vertical space, then constrains by aspect ratio */}
                    <div className="flex-1 min-h-0 flex items-center justify-center p-4 select-none relative overflow-hidden">
                        {video.localPath ? (
                            <motion.div
                                ref={containerRef}
                                layout="size"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="relative overflow-hidden rounded-md shadow-2xl bg-black"
                                style={
                                    targetRatioNum
                                        ? {
                                              // Constrain to target ratio: fill height, let width follow
                                              aspectRatio: targetRatioNum,
                                              height: "100%",
                                              maxHeight: "100%",
                                              maxWidth: "100%",
                                          }
                                        : {
                                              // Fill all available space — video uses object-contain inside
                                              width: "100%",
                                              height: "100%",
                                          }
                                }
                            >
                                <video
                                    ref={videoRef}
                                    src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                    className={cn(
                                        "rounded-md",
                                        targetRatioNum
                                            ? "w-full h-full object-cover" // fills the constrained frame exactly
                                            : "w-full h-full object-contain" // letterboxes within the full container
                                    )}
                                    preload="metadata"
                                    onLoadedMetadata={handleLoadedMetadata}
                                    onPlay={handleVideoPlay}
                                    onPause={handleVideoPause}
                                    onClick={togglePlay}
                                />

                                {/* Crop handles — only in crop mode, relative to the (possibly constrained) container */}
                                <AnimatePresence>
                                    {showCropOverlay && (
                                        <CropOverlay
                                            crop={crop}
                                            onChange={setCrop}
                                            containerRef={containerRef}
                                        />
                                    )}
                                </AnimatePresence>

                                {/* Aspect ratio badge — shown whenever a ratio is active */}
                                <AnimatePresence>
                                    {aspectRatio !== "original" && (
                                        <motion.div
                                            key={aspectRatio}
                                            initial={{ opacity: 0, scale: 0.8, y: -8 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.8, y: -8 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                            className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm border border-white/20 rounded-full px-2.5 py-1 text-xs font-bold text-white/90 flex items-center gap-1.5 pointer-events-none z-20"
                                        >
                                            <RectangleHorizontal className="w-3 h-3 text-primary" />
                                            {aspectRatio}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Subtitle Overlay — inside the constrained frame, so positioning is correct */}
                                {mode === "subtitles" && (
                                    <SubtitleOverlay
                                        subtitles={subtitles}
                                        currentTime={currentTime}
                                        stylePreset={stylePreset}
                                        fontFamily={fontFamily}
                                        previewText={!hasSubtitles ? "Your subtitles will appear here" : undefined}
                                    />
                                )}
                            </motion.div>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-neutral-500">Media not available offline.</p>
                            </div>
                        )}
                    </div>

                    {/* Style + Font Selector Panel — shrink-0 so it's always visible */}
                    <AnimatePresence>
                        {mode === "subtitles" && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25 }}
                                className="shrink-0"
                            >
                                <StylePresetSelector
                                    activePreset={stylePreset}
                                    onSelect={setStylePreset}
                                    fontFamily={fontFamily}
                                    onFontChange={setFontFamily}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Subtitle Editor Panel — slides in from the right */}
                <AnimatePresence>
                    {mode === "subtitles" && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 360, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden shrink-0"
                        >
                            {hasSubtitles ? (
                                <SubtitleEditor
                                    subtitles={subtitles}
                                    onSubtitlesChange={setSubtitles}
                                    currentTime={currentTime}
                                    videoRef={videoRef}
                                    onSeek={handleSeek}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full bg-neutral-950 border-l border-white/10 px-8 text-center">
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.2 }}
                                        className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4"
                                    >
                                        <Captions className="w-8 h-8 text-white/20" />
                                    </motion.div>
                                    <motion.div
                                        initial={{ y: 10, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <h3 className="text-sm font-medium text-white/70 mb-2">No Subtitles Yet</h3>
                                        <p className="text-xs text-white/30 mb-6 max-w-[220px]">
                                            Transcribe this video to generate subtitles you can edit and burn into the video.
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={handleTranscribe}
                                            disabled={isTranscribing}
                                            className="bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20"
                                        >
                                            {isTranscribing ? (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <Mic className="w-4 h-4 mr-2" />
                                            )}
                                            {isTranscribing ? "Transcribing..." : "Transcribe Video"}
                                        </Button>
                                    </motion.div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Timeline & Controls ── */}
            <div className="border-t border-white/10 bg-neutral-900/90 backdrop-blur-xl shrink-0 relative z-[70]">
                {/* Seek bar (crop + subtitle modes) */}
                <div className="px-5 pt-4 pb-1">
                    {mode !== "trim" && duration > 0 && (
                        <div className="group relative">
                            <input
                                type="range"
                                min={0}
                                max={duration}
                                step={0.01}
                                value={currentTime}
                                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                                className="w-full h-1 appearance-none bg-transparent rounded-full cursor-pointer relative z-10
                                    [&::-webkit-slider-thumb]:appearance-none
                                    [&::-webkit-slider-thumb]:w-3
                                    [&::-webkit-slider-thumb]:h-3
                                    [&::-webkit-slider-thumb]:bg-white
                                    [&::-webkit-slider-thumb]:rounded-full
                                    [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(255,255,255,0.4)]
                                    [&::-webkit-slider-thumb]:transition-all
                                    [&::-webkit-slider-thumb]:duration-150
                                    [&::-webkit-slider-thumb]:hover:scale-125"
                                style={{
                                    background: `linear-gradient(to right, #fff ${(currentTime / duration) * 100}%, rgba(255,255,255,0.12) ${(currentTime / duration) * 100}%)`,
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Compact Playback Bar */}
                <div className="px-5 pb-2 flex items-center gap-3">
                    <span ref={timeDisplayRef} className="text-[11px] text-white/60 font-mono tabular-nums min-w-[40px]">
                        {formatTime(currentTime)}
                    </span>

                    <div className="flex items-center gap-1">
                        <button
                            className="w-7 h-7 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                            onClick={() => handleSeek(Math.max(0, (videoRef.current?.currentTime || 0) - 5))}
                        >
                            <span className="text-[10px] font-semibold">-5</span>
                        </button>
                        <motion.button
                            whileTap={{ scale: 0.88 }}
                            transition={{ type: "spring", stiffness: 500, damping: 20 }}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all mx-0.5"
                            onClick={togglePlay}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                {isPlaying ? (
                                    <motion.div key="pause"
                                        initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.5, opacity: 0 }}
                                        transition={{ duration: 0.12 }}>
                                        <Pause className="w-4 h-4" />
                                    </motion.div>
                                ) : (
                                    <motion.div key="play"
                                        initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.5, opacity: 0 }}
                                        transition={{ duration: 0.12 }}>
                                        <Play className="w-4 h-4 ml-0.5" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.button>
                        <button
                            className="w-7 h-7 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                            onClick={() => handleSeek(Math.min(duration, (videoRef.current?.currentTime || 0) + 5))}
                        >
                            <span className="text-[10px] font-semibold">+5</span>
                        </button>
                    </div>

                    <span className="text-[11px] text-white/35 font-mono tabular-nums min-w-[48px]">
                        -{formatTime(Math.max(0, duration - currentTime))}
                    </span>

                    <div className="flex-1" />

                    {/* Aspect Ratio selector — animated sliding pill */}
                    <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
                        <RectangleHorizontal className="w-3 h-3 text-white/25 ml-1.5 mr-0.5" />
                        {ASPECT_RATIOS.map((ar) => (
                            <button
                                key={ar.id}
                                onClick={() => applyAspectRatio(ar.id)}
                                className="relative px-2 py-0.5"
                            >
                                {aspectRatio === ar.id && (
                                    <motion.div
                                        layoutId="ar-pill"
                                        className="absolute inset-0 bg-white rounded-md shadow-sm"
                                        transition={{ type: "spring", stiffness: 400, damping: 28 }}
                                    />
                                )}
                                <span className={cn(
                                    "relative z-10 text-[10px] font-medium transition-colors duration-150",
                                    aspectRatio === ar.id ? "text-black" : "text-white/40 hover:text-white/80"
                                )}>
                                    {ar.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Trim Scrubber — only in trim mode */}
                <AnimatePresence>
                    {mode === "trim" && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-5 pb-4"
                        >
                            <TimelineScrubber
                                duration={duration}
                                videoRef={videoRef}
                                trimStart={trimStart}
                                trimEnd={trimEnd}
                                onTrimChange={(start, end) => { setTrimStart(start); setTrimEnd(end); }}
                                onSeek={handleSeek}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}
